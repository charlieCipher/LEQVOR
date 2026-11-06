import pg from 'pg';
import {postgresTransactions} from '../pool-database.mjs';

export const governanceNeonHost='ep-frosty-firefly-aod0nhcs.c-2.ap-southeast-1.aws.neon.tech';

export function governancePoolOptions(connection,host){
 const u=new URL(connection);
 if(host!==governanceNeonHost||u.hostname!==host||!['postgres:','postgresql:'].includes(u.protocol)||u.port&&u.port!=='5432'||u.hash||u.pathname!=='/neondb'||decodeURIComponent(u.username)!=='leqvor_governance_control'||!u.password)throw new Error('Separate least-privilege Neon connection required.');
 for(const [k,v] of u.searchParams)if(!((k==='sslmode'&&v==='verify-full')||(k==='application_name'&&v==='leqvor-governance-control')))throw new Error('Unreviewed database connection option.');
 return {host,port:5432,database:'neondb',user:'leqvor_governance_control',password:decodeURIComponent(u.password),
  ssl:{rejectUnauthorized:true,servername:host,minVersion:'TLSv1.2'},enableChannelBinding:true,
  max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,statement_timeout:10000,query_timeout:12000,
  application_name:'leqvor-governance-control',options:'',allowExitOnIdle:true};
}
export async function verifyGovernanceDatabase(pool){
 const client=await pool.connect();let begun=false;
 try{
  await client.query('BEGIN READ ONLY');begun=true;
  await client.query("SET LOCAL statement_timeout = '5s'");
  const {rows}=await client.query(`select current_database() as db, current_user as role,
   (select count(*)::int from pg_namespace where nspname in ('auth','storage','supabase_functions')) as customer_schemas,
   (select count(*)::int from pg_roles where rolname=current_user and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls and not rolinherit) as safe_role,
   (select count(*)::int from pg_auth_members where member=(select oid from pg_roles where rolname=current_user)) as memberships,
   (select count(*)::int from pg_class where relowner=(select oid from pg_roles where rolname=current_user)) as owned_objects,
   (select count(*)::int from pg_namespace where nspowner=(select oid from pg_roles where rolname=current_user)) as owned_schemas,
   has_database_privilege(current_user,current_database(),'CREATE') or has_database_privilege(current_user,current_database(),'TEMP') as database_ddl,
   has_schema_privilege(current_user,'public','CREATE') or has_schema_privilege(current_user,'founder_governance','CREATE') as schema_ddl`);
  const r=rows[0];
  if(rows.length!==1||r.db!=='neondb'||r.role!=='leqvor_governance_control'||r.customer_schemas!==0||r.safe_role!==1||r.memberships!==0||r.owned_objects!==0||r.owned_schemas!==0||r.database_ddl!==false||r.schema_ddl!==false)throw new Error('Governance database isolation verification failed.');
  const permissions=await client.query(`select
   has_table_privilege('founder_governance.root_state','SELECT') and has_column_privilege('founder_governance.root_state','document','UPDATE') and
   has_table_privilege('founder_governance.audit_events','SELECT') and has_table_privilege('founder_governance.audit_events','INSERT') and
   not has_table_privilege('founder_governance.root_state','INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER') and
   not has_column_privilege('founder_governance.root_state','singleton','UPDATE') and
   not has_any_column_privilege('founder_governance.audit_events','UPDATE') and not has_table_privilege('founder_governance.audit_events','DELETE,TRUNCATE,REFERENCES,TRIGGER') and
   not has_any_column_privilege('founder_governance.execution_events','SELECT,INSERT,UPDATE,REFERENCES') and not has_table_privilege('founder_governance.execution_events','DELETE,TRUNCATE,TRIGGER') and
   not has_any_column_privilege('founder_governance.execution_reservations','SELECT,INSERT,UPDATE,REFERENCES') and not has_table_privilege('founder_governance.execution_reservations','DELETE,TRUNCATE,TRIGGER') as valid`);
  if(permissions.rows.length!==1||permissions.rows[0].valid!==true)throw new Error('Governance role grants differ from the reviewed matrix.');
  // Verifies schema presence without enrolling or reading customer/root data.
  await client.query('select document from founder_governance.root_state where false');
  await client.query('select sequence from founder_governance.audit_events where false');
  await client.query('COMMIT');begun=false;
 }finally{if(begun)try{await client.query('ROLLBACK');}catch{/* Startup fails closed. */}client.release();}
}
export async function connectGovernanceDatabase(config,{Pool=pg.Pool}={}){
 const pool=new Pool(governancePoolOptions(config.databaseUrl,config.databaseHost));
 // Never emit PostgreSQL errors/connection strings from the idle-pool event.
 let healthy=true;pool.on('error',()=>{healthy=false;});
 try{await verifyGovernanceDatabase(pool);}catch{await pool.end();throw new Error('Governance database startup verification failed.');}
 return {database:postgresTransactions(pool),healthy:()=>healthy,close:()=>pool.end()};
}
