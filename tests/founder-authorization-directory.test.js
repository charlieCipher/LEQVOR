// @vitest-environment node
import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createDirectoryLookup,authorizationPoolOptions} from '../governance/control/authorization-directory.mjs';
import {governanceNeonHost} from '../governance/control/neon-database.mjs';
const sql=await readFile(new URL('../governance/control/authorization-directory.sql',import.meta.url),'utf8');
async function database(name='leqvor_authorization'){
 const seed=new PGlite();await seed.exec(`create database ${name}`);const data=await seed.dumpDataDir();await seed.close();return new PGlite({loadDataDir:data,database:name});
}
async function role(db,name,operation){await db.exec('begin');try{await db.exec(`set local role ${name}`);const out=await operation();await db.exec('commit');return out;}catch(error){await db.exec('rollback');throw error;}}
it('independent directory defaults deny; SQL reader cannot self-enroll, grant roles or revoke; explicit operator changes are live and audited',async()=>{
 const db=await database();try{
  await db.exec(sql);const lookup=createDirectoryLookup(db),binding={identity_issuer:'https://tenant.example/',subject:'auth0|fixture',token_id:'disposable-jti',expires_at:Date.now()+240000};
  await expect(lookup(binding)).rejects.toThrow();
  await role(db,'leqvor_authorization_operator',async()=>{
   await db.query('insert into control_authorization.principals(identity_issuer,subject,role) values($1,$2,$3)',[binding.identity_issuer,binding.subject,'AUDITOR']);
   await db.query('insert into control_authorization.sessions(identity_issuer,subject,token_id,expires_at) values($1,$2,$3,$4)',Object.values(binding));
  });
  expect((await lookup(binding)).active).toBe(false);
  for(const statement of ["update control_authorization.principals set role='FOUNDER'","update control_authorization.sessions set revoked=false","insert into control_authorization.principals values('x','x','FOUNDER',true,1)","delete from control_authorization.operator_events","create table public.attack(x int)","create role attacker"]){await expect(role(db,'leqvor_authorization_reader',()=>db.exec(statement))).rejects.toThrow();}
  await role(db,'leqvor_authorization_operator',()=>db.exec('update control_authorization.principals set enabled=true'));
  const active=await role(db,'leqvor_authorization_reader',()=>lookup(binding));expect(active.active).toBe(true);expect(active.role).toBe('AUDITOR');
  await role(db,'leqvor_authorization_operator',()=>db.exec("update control_authorization.principals set role='SECURITY_ADMIN'"));const changed=await lookup(binding);expect(changed.role).toBe('SECURITY_ADMIN');expect(changed.revision).not.toBe(active.revision);
  await role(db,'leqvor_authorization_operator',()=>db.exec('update control_authorization.sessions set revoked=true'));expect((await lookup(binding)).active).toBe(false);
  await expect(lookup({...binding,token_id:'other-account'})).rejects.toThrow();
  const history=await db.query('select * from control_authorization.operator_events order by sequence');expect(history.rows).toHaveLength(5);
  await expect(role(db,'leqvor_authorization_operator',()=>db.exec('update control_authorization.sessions set expires_at=expires_at+1000000'))).rejects.toThrow();
  await expect(db.exec('truncate control_authorization.operator_events')).rejects.toThrow(/cannot be rewritten/);
 }finally{await db.close();}
},30000);
it('authorization SQL rejects the governance database and host pin rejects shared Neon, owner roles and unsafe TLS options',async()=>{
 const db=await database('neondb');try{await expect(db.exec(sql)).rejects.toThrow(/Independent authorization/);await db.exec('rollback');expect((await db.query("select count(*)::int as n from pg_namespace where nspname='control_authorization'")).rows[0].n).toBe(0);}finally{await db.close();}
 const host='ep-separate-a1.c-2.ap-southeast-2.aws.neon.tech',url=`postgresql://leqvor_authorization_reader:fixture@${host}/leqvor_authorization?sslmode=verify-full`;
 expect(authorizationPoolOptions(url,host).ssl.rejectUnauthorized).toBe(true);
 for(const bad of [url.replace(host,governanceNeonHost),url.replace('reader:','operator:'),url.replace('verify-full','require'),url+'&options=unsafe'])expect(()=>authorizationPoolOptions(bad,bad.includes(governanceNeonHost)?governanceNeonHost:host)).toThrow();
},30000);
