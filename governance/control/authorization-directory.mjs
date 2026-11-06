import pg from 'pg';
import {governanceNeonHost} from './neon-database.mjs';

export function authorizationPoolOptions(connection,host){
 const u=new URL(connection);
 if(typeof host!=='string'||!/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(host)||host===governanceNeonHost||u.hostname!==host||!['postgres:','postgresql:'].includes(u.protocol)||u.port&&u.port!=='5432'||u.pathname!=='/leqvor_authorization'||decodeURIComponent(u.username)!=='leqvor_authorization_reader'||!u.password||u.hash||[...u.searchParams].some(([k,v])=>k!=='sslmode'||v!=='verify-full'))throw new Error('Separate read-only authorization database required.');
 return {host,port:5432,database:'leqvor_authorization',user:'leqvor_authorization_reader',password:decodeURIComponent(u.password),ssl:{rejectUnauthorized:true,servername:host,minVersion:'TLSv1.2'},max:2,connectionTimeoutMillis:2000,query_timeout:2000,statement_timeout:1500,options:'',application_name:'leqvor-independent-authorization',allowExitOnIdle:true};
}
export function createDirectoryLookup(pool){
 if(typeof pool?.query!=='function')throw new Error('Explicit independent directory pool required.');
 return async binding=>{
  // One statement sees both role and session state at one database snapshot.
  // No token claim can insert a principal/session; all grants are explicit.
  const result=await pool.query(`select p.identity_issuer,p.subject,s.token_id,s.expires_at::text,
   (p.enabled and not s.revoked) as active,p.role,p.revision::text||':'||s.revision::text as revision
   from control_authorization.principals p join control_authorization.sessions s using(identity_issuer,subject)
   where p.identity_issuer=$1 and p.subject=$2 and s.token_id=$3 and s.expires_at=$4`,[binding.identity_issuer,binding.subject,binding.token_id,binding.expires_at]);
  if(result.rows.length!==1)throw new Error('No active authorization lease.');
  return {...result.rows[0],expires_at:Number(result.rows[0].expires_at)};
 };
}
export async function connectAuthorizationDirectory({databaseUrl,databaseHost},{Pool=pg.Pool}={}){
 const pool=new Pool(authorizationPoolOptions(databaseUrl,databaseHost));let healthy=true;pool.on('error',()=>{healthy=false;});
 try{
  const {rows}=await pool.query(`select current_database() as db,current_user as role,
   (select count(*)::int from pg_namespace where nspname in ('founder_governance','auth','storage','supabase_functions')) as forbidden_schemas,
   (select count(*)::int from pg_roles where rolname=current_user and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls and not rolinherit) as safe_role,
   (select count(*)::int from pg_auth_members where member=(select oid from pg_roles where rolname=current_user)) as memberships,
   (select count(*)::int from pg_class where relowner=(select oid from pg_roles where rolname=current_user)) as owned,
   (select count(*)::int from pg_namespace where nspowner=(select oid from pg_roles where rolname=current_user)) as owned_schemas,
   has_database_privilege(current_database(),'CREATE,TEMP') as ddl,
   has_schema_privilege('control_authorization','CREATE') or has_schema_privilege('public','CREATE') as schema_ddl,
   has_table_privilege('control_authorization.principals','SELECT') and has_table_privilege('control_authorization.sessions','SELECT') as can_read,
   has_table_privilege('control_authorization.principals','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('control_authorization.principals','INSERT,UPDATE,REFERENCES') or
   has_table_privilege('control_authorization.sessions','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('control_authorization.sessions','INSERT,UPDATE,REFERENCES') as writes`);
  const r=rows[0];if(rows.length!==1||r.db!=='leqvor_authorization'||r.role!=='leqvor_authorization_reader'||r.safe_role!==1||r.forbidden_schemas!==0||r.memberships!==0||r.owned!==0||r.owned_schemas!==0||r.ddl!==false||r.schema_ddl!==false||r.can_read!==true||r.writes!==false)throw new Error();
  const lookup=createDirectoryLookup(pool);
  return {lookup:binding=>{if(!healthy)throw new Error('Directory unavailable.');return lookup(binding);},close:()=>pool.end()};
 }catch{await pool.end();throw new Error('Independent directory verification failed.');}
}
