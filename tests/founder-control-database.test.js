// @vitest-environment node
import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {PostgresGovernanceStore} from '../governance/postgres-store.mjs';
import {verifyGovernanceDatabase} from '../governance/control/neon-database.mjs';
import {prepareNeonMigrationBatch} from '../governance/control/neon-migration-batch.mjs';

const migrations=await Promise.all(['001_founder_state.sql','002_execution_journal.sql','003_control_permissions.sql'].map(n=>readFile(new URL(`../governance/migrations/${n}`,import.meta.url),'utf8')));
async function database(){
 const seed=new PGlite();await seed.exec('create database neondb');const data=await seed.dumpDataDir();await seed.close();
 return new PGlite({loadDataDir:data,database:'neondb'});
}
async function asRole(db,role,operation){
 await db.exec('begin');try{await db.exec(`set local role ${role}`);const value=await operation();await db.exec('commit');return value;}catch(error){await db.exec('rollback');throw error;}
}
it('prepared Neon SQL preserves inactive state, enforces the control/executor/auditor permission matrix and passes the real runtime probe',async()=>{
 const db=await database();try{
  for(const sql of migrations)await db.exec(sql);
  expect((await db.query('select count(*)::int as count from founder_governance.root_state')).rows[0].count).toBe(0);
  const roles=(await db.query("select rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls from pg_roles where rolname like 'leqvor_governance_%' order by rolname")).rows;
  expect(roles).toHaveLength(3);for(const role of roles)for(const [key,value] of Object.entries(role))if(key!=='rolname')expect(value).toBe(false);
  await db.exec('set role leqvor_governance_control');
  await verifyGovernanceDatabase({connect:async()=>({query:(q,v)=>db.query(q,v),release:()=>{}})});
  await db.exec('reset role');
  const store=new PostgresGovernanceStore({transaction:operation=>asRole(db,'leqvor_governance_control',()=>operation({query:(q,v)=>db.query(q,v)}))});
  await expect(store.transaction(()=>{})).rejects.toThrow(/not enrolled/);
  // Disposable owner fixture only: no real policy/key enrollment.
  await db.query('insert into founder_governance.root_state(document) values($1)',[{audit:[],fixture:true}]);
  await store.transaction(state=>{state.fixture='updated';});
  expect((await db.query('select document from founder_governance.root_state')).rows[0].document.fixture).toBe('updated');
  const denied={
   leqvor_governance_control:["insert into founder_governance.root_state(document) values('{}')","delete from founder_governance.root_state","truncate founder_governance.audit_events","update founder_governance.audit_events set document='{}'","insert into founder_governance.execution_reservations values('"+'a'.repeat(64)+"','00000000-0000-0000-0000-000000000001','{}')","create table public.attack(x int)","create table founder_governance.attack(x int)","create role attack"],
   leqvor_governance_executor:["update founder_governance.root_state set document='{}'","delete from founder_governance.execution_events","truncate founder_governance.execution_reservations"],
   leqvor_governance_auditor:["update founder_governance.root_state set document='{}'","insert into founder_governance.audit_events values(1,'"+'b'.repeat(64)+"','{}')"],
  };
  for(const [role,queries] of Object.entries(denied))for(const sql of queries)await expect(asRole(db,role,()=>db.exec(sql))).rejects.toThrow();
  await asRole(db,'leqvor_governance_executor',async()=>{
   await db.query('insert into founder_governance.execution_reservations values($1,$2,$3)',['a'.repeat(64),'00000000-0000-0000-0000-000000000001',{}]);
   expect((await db.query('select document from founder_governance.execution_reservations for update')).rows).toHaveLength(1);
  });
  await expect(asRole(db,'leqvor_governance_executor',()=>db.exec('update founder_governance.execution_reservations set execution_key=execution_key'))).rejects.toThrow(/append-only/);
  await asRole(db,'leqvor_governance_auditor',async()=>{expect((await db.query('select document from founder_governance.root_state')).rows).toHaveLength(1);});
  await db.exec('create role untrusted nologin');await expect(asRole(db,'untrusted',()=>db.exec('select * from founder_governance.root_state'))).rejects.toThrow();
  // Even a column grant cannot silently expand the runtime identity matrix.
  await db.exec('grant update(singleton) on founder_governance.root_state to leqvor_governance_control');await db.exec('set role leqvor_governance_control');
  await expect(verifyGovernanceDatabase({connect:async()=>({query:(q,v)=>db.query(q,v),release:()=>{}})})).rejects.toThrow(/grants/);await db.exec('reset role');
 }finally{await db.close();}
},30000);
it('reviewed three-script batch is atomic: a role conflict in the last script rolls back every table/schema from the first two',async()=>{
 const db=await database();try{
  const batch=await prepareNeonMigrationBatch();expect(batch.manifest).toHaveLength(3);
  await db.exec('create role leqvor_governance_control nologin');
  await expect(db.exec(batch.sql)).rejects.toThrow();await db.exec('rollback');
  expect((await db.query("select count(*)::int as n from pg_namespace where nspname='founder_governance'")).rows[0].n).toBe(0);
  expect((await db.query("select count(*)::int as n from pg_roles where rolname in ('leqvor_governance_executor','leqvor_governance_auditor')")).rows[0].n).toBe(0);
 }finally{await db.close();}
},30000);
it('permission bootstrap rejects a customer platform database and rolls back all role creation',async()=>{
 const db=await database();try{
  await db.exec(migrations[0]);await db.exec(migrations[1]);await db.exec('create schema auth');
  await expect(db.exec(migrations[2])).rejects.toThrow(/Separate governance/);await db.exec('rollback');
  expect((await db.query("select count(*)::int as count from pg_roles where rolname='leqvor_governance_control'")).rows[0].count).toBe(0);
 }finally{await db.close();}
},30000);
