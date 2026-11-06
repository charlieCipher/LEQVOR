import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {request} from 'node:http';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {createAuth0Authenticator,auth0MfaClaim} from './auth0.mjs';
import {createAccessRegistry} from './access-registry.mjs';
import {createRenderTransport,createRenderServer} from './render-server.mjs';
import {governancePoolOptions,governanceNeonHost,verifyGovernanceDatabase} from './neon-database.mjs';
import {loadRenderConfig,publicKeyPin} from './config.mjs';
import {assembleRenderControl} from './runtime.mjs';
import {onExecutePostLogin} from './auth0-action.mjs';
import {onExecutePostLogin as challengeMfa} from './auth0-challenge.mjs';
import {initialGovernance,checkpoint} from '../engine.mjs';
import {hash} from '../protocol.mjs';

const time=Date.parse('2026-10-16T08:00:00Z'),seconds=time/1000,issuer='https://control-tenant.auth0.com/',origin='https://leqvor-control.onrender.com';
const pair=await generateKeyPair('ES256',{extractable:true}),jwk=await exportJWK(pair.publicKey);
const jwks=createLocalJWKSet({keys:[{...jwk,kid:'identity',alg:'ES256'}]});
const registryPair=await generateKeyPair('ES256',{extractable:true}),registryKey=await exportJWK(registryPair.publicKey);
const pin=createHash('sha256').update(JSON.stringify({crv:registryKey.crv,kty:registryKey.kty,x:registryKey.x,y:registryKey.y})).digest('hex');
const base={iss:issuer,aud:'leqvor-control-console',client_id:'admin-client',sub:'auth0|operator',jti:'session-one',iat:seconds,exp:seconds+300,[auth0MfaClaim]:{authenticated_at:seconds,mfa:true}};
const binding={issuer,subject:base.sub,token_id:base.jti,expires_at:(seconds+300)*1000};
const grant={subject:base.sub,token_id:base.jti,expires_at:binding.expires_at,role:'SECURITY_ADMIN'};
function accessToken(changes={},headers={}){return new SignJWT({...base,...changes}).setProtectedHeader({alg:'ES256',typ:'at+jwt',kid:'identity',...headers}).sign(pair.privateKey);}
function registryToken(changes={},key=registryPair.privateKey){return new SignJWT({iss:'https://access.example/',identity_issuer:issuer,aud:origin,iat:seconds,exp:seconds+60,jti:'registry-one',grants:[grant],...changes}).setProtectedHeader({alg:'ES256',typ:'leqvor-control-access+jwt'}).sign(key);}
function env(){return {NODE_ENV:'production',RENDER:'true',PORT:'10000',RENDER_EXTERNAL_URL:origin,LEQVOR_CONTROL_ORIGIN:origin,LEQVOR_AUTH0_ISSUER:issuer,LEQVOR_AUTH0_CLIENT_ID:'admin-client',LEQVOR_GOVERNANCE_POLICY_SHA256:'a'.repeat(64),LEQVOR_GOVERNANCE_DATABASE_URL:`postgresql://leqvor_governance_control:fixture-only@${governanceNeonHost}/neondb?sslmode=verify-full`,LEQVOR_GOVERNANCE_DATABASE_HOST:governanceNeonHost,LEQVOR_RENDER_PROXY_CIDRS:'127.0.0.1/32',LEQVOR_ACCESS_REGISTRY_BEARER:'fixture-only-registry-read-token-12345',LEQVOR_ACCESS_REGISTRY_URL:'https://access.example/live.jwt',LEQVOR_ACCESS_REGISTRY_ISSUER:'https://access.example/',LEQVOR_ACCESS_REGISTRY_PUBLIC_JWK:JSON.stringify(registryKey),LEQVOR_ACCESS_REGISTRY_KEY_SHA256:pin};}
async function registry(fetchImpl,clock=()=>time){return createAccessRegistry({url:'https://access.example/live.jwt',key:registryKey,issuer:'https://access.example/',identityIssuer:issuer,readToken:'fixture-only-registry-read-token-12345',controlOrigin:origin,fetchImpl,clock});}
const jwtResponse=body=>new Response(body,{headers:{'Content-Type':'application/jwt'}});
async function registryResponse(options,changes={},key=registryPair.privateKey){return jwtResponse(await registryToken({nonce:JSON.parse(options.body).nonce,...changes},key));}

test('configuration requires separate exact origins, public-only independent pins and every security adapter',()=>{
 const configured=loadRenderConfig(env());assert.equal(configured.origin,origin);assert.equal(configured.policyPin,'a'.repeat(64));
 for(const name of Object.keys(env())){const e=env();delete e[name];assert.throws(()=>loadRenderConfig(e),undefined,name);}
 for(const [name,value] of [['NODE_ENV','development'],['PORT','0'],['PORT','100.5'],['LEQVOR_CONTROL_ORIGIN','https://leqvor.vercel.app'],['LEQVOR_AUTH0_ISSUER','http://tenant.example/'],['LEQVOR_ACCESS_REGISTRY_URL',`${origin}/access`],['LEQVOR_ACCESS_REGISTRY_KEY_SHA256','b'.repeat(64)],['NODE_TLS_REJECT_UNAUTHORIZED','0'],['NODE_OPTIONS','--inspect=0.0.0.0']])assert.throws(()=>loadRenderConfig({...env(),[name]:value}));
 assert.throws(()=>publicKeyPin({...registryKey,d:'private-material'},pin));
});
test('Auth0 requires signed RFC9068 access token, pinned client, actual MFA proof and live session binding',async()=>{
 let inspected;const authenticate=createAuth0Authenticator({issuer,clientId:'admin-client',clock:()=>time,keyResolver:jwks,isSessionActive:async b=>{inspected=b;return true;}});
 const principal=await authenticate(await accessToken());assert.deepEqual(inspected,binding);assert.deepEqual(principal.session,binding);assert.equal(principal.mfa_verified,true);
 for(const change of [{client_id:'customer-client'},{sub:'service@clients'},{sub_profile:'ai_agent'},{act:{sub:'actor'}},{[auth0MfaClaim]:undefined},{[auth0MfaClaim]:{authenticated_at:seconds,mfa:false}},{[auth0MfaClaim]:{authenticated_at:seconds+1,mfa:true}},{aud:['leqvor-control-console',`${issuer}userinfo`]},{auth_time:seconds,acr:'mfa',[auth0MfaClaim]:undefined}])await assert.rejects(authenticate(await accessToken(change)));
 await assert.rejects(authenticate(await accessToken({}, {typ:'JWT'})));
});
test('Auth0 RS256 API profile verifies against its pinned JWKS without accepting ID tokens or legacy profile',async()=>{
 const rsa=await generateKeyPair('RS256',{modulusLength:2048}),publicJwk=await exportJWK(rsa.publicKey);
 const authenticate=createAuth0Authenticator({issuer,clientId:'admin-client',clock:()=>time,keyResolver:createLocalJWKSet({keys:[{...publicJwk,kid:'rsa-profile',alg:'RS256'}]}),isSessionActive:async()=>true});
 const signed=await new SignJWT(base).setProtectedHeader({alg:'RS256',typ:'at+jwt',kid:'rsa-profile'}).sign(rsa.privateKey);
 assert.equal((await authenticate(signed)).id,base.sub);
 const legacy=await new SignJWT({...base,client_id:undefined,azp:'admin-client'}).setProtectedHeader({alg:'RS256',typ:'JWT',kid:'rsa-profile'}).sign(rsa.privateKey);
 await assert.rejects(authenticate(legacy));
});
test('prepared Auth0 Action accepts only recent completed interactive primary authentication and MFA, never enrollment alone or refresh',async()=>{
 const stamp=new Date().toISOString();
 const event={resource_server:{identifier:'leqvor-control-console'},secrets:{LEQVOR_CONTROL_CLIENT_ID:'admin-client'},client:{client_id:'admin-client'},transaction:{protocol:'oidc-basic-profile'},user:{},authentication:{methods:[{name:'pwd',timestamp:stamp},{name:'mfa',type:'otp',timestamp:stamp}]}};
 const run=async changes=>{const claims=[],denials=[];await onExecutePostLogin({...event,...changes},{access:{deny:message=>denials.push(message)},accessToken:{setCustomClaim:(...args)=>claims.push(args)}});return {claims,denials};};
 assert.equal((await run({})).claims[0][0],auth0MfaClaim);
 for(const changes of [{authentication:{methods:[{name:'pwd',timestamp:stamp}]}},{authentication:{methods:[{name:'pwd',timestamp:stamp},{name:'mfa',type:'phone',timestamp:stamp}]}},{authentication:{methods:[{name:'pwd',timestamp:stamp},{name:'mfa',timestamp:stamp}]}},{authentication:{methods:[{name:'federated',timestamp:stamp},{name:'mfa',type:'otp',timestamp:stamp}]}},{authentication:{methods:[{name:'pwd',timestamp:stamp},{name:'mfa',type:'otp',timestamp:'2000-01-01'}]}},{transaction:{protocol:'oauth2-refresh-token'}},{refresh_token:{}},{user:{blocked:true}},{client:{client_id:'customer-client'}},{secrets:{}}]){
  const result=await run(changes);assert.equal(result.claims.length,0);assert.equal(result.denials.length,1);
 }
 const unrelated=await run({resource_server:{identifier:'customer-api'}});assert.equal(unrelated.claims.length,0);assert.equal(unrelated.denials.length,0);
});
test('prepared first Auth0 Action pauses for actual MFA without manufacturing a proof claim',async()=>{
 const calls=[];const event={resource_server:{identifier:'leqvor-control-console'},secrets:{LEQVOR_CONTROL_CLIENT_ID:'admin-client'},client:{client_id:'admin-client'},transaction:{protocol:'oidc-basic-profile'},user:{enrolledFactors:[{type:'otp'}]},authentication:{methods:[{name:'pwd',timestamp:new Date().toISOString()}]}};
 const api={access:{deny:()=>calls.push('denied')},authentication:{challengeWithAny:factors=>calls.push(factors)}};
 await challengeMfa(event,api);assert.deepEqual(calls,[[{type:'otp'}]]);
 calls.length=0;await challengeMfa({...event,user:{enrolledFactors:[{type:'otp'},{type:'webauthn-roaming'}]}},api);assert.deepEqual(calls,[[{type:'webauthn-roaming'},{type:'otp'}]]);
 calls.length=0;await challengeMfa({...event,user:{enrolledFactors:[{type:'phone'}]}},api);assert.deepEqual(calls,['denied']);
 calls.length=0;await challengeMfa({...event,transaction:{protocol:'oauth2-refresh-token'}},api);assert.deepEqual(calls,['denied']);
});
test('live nonce-bound registry denies role substitution, revocation, replay, expiry, outage and unbounded responses',async()=>{
 let respond=options=>registryResponse(options),calls=0;
 const access=await registry(async(_,options)=>{calls++;assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(JSON.parse(options.body).token_id,base.jti);return respond(options);});
 assert.equal(await access.isSessionActive(binding),true);assert.equal(await access.lookupRole(base.sub,{id:base.sub,session:binding}),'SECURITY_ADMIN');assert.equal(calls,2);
 for(const changes of [{nonce:'replayed'},{identity_issuer:'https://customer.example/'},{grants:[]},{grants:[{...grant,role:'SUPERUSER'}]},{grants:[grant,grant]},{grants:[{...grant,token_id:'other'}]},{grants:[{...grant,expires_at:binding.expires_at+1}]},{exp:seconds},{exp:seconds+61},{iat:seconds+1},{aud:'https://customer.example'},{grants:[{...grant,extra:true}]}]){respond=options=>registryResponse(options,changes);await assert.rejects(access.isSessionActive(binding));}
 let captured;respond=async options=>{captured=await registryToken({nonce:JSON.parse(options.body).nonce});return jwtResponse(captured);};await access.isSessionActive(binding);
 respond=()=>jwtResponse(captured);await assert.rejects(access.isSessionActive(binding)); // valid signature, wrong fresh nonce
 respond=options=>registryResponse(options,{},pair.privateKey);await assert.rejects(access.isSessionActive(binding));
 respond=()=>jwtResponse('x'.repeat(65537));await assert.rejects(access.isSessionActive(binding));
 await assert.rejects((await registry(async()=>{throw new Error('private provider details');})).isSessionActive(binding));
 await assert.rejects((await registry(async()=>new Response('redirect',{status:302}))).isSessionActive(binding));
 let now=time;const slow=await registry(async(_,options)=>{now=time+60000;return registryResponse(options);},()=>now);await assert.rejects(slow.isSessionActive(binding));
});
test('Render transport rejects header-only spoofing, untrusted socket peers, forwarded chains and broad CIDRs',()=>{
 const check=createRenderTransport({origin,proxyCidrs:['10.2.3.4/32']});
 const req={socket:{remoteAddress:'::ffff:10.2.3.4'},headers:{host:'leqvor-control.onrender.com','x-forwarded-proto':'https'}};
 assert.equal(check(req),true);
 for(const headers of [{'x-forwarded-proto':'http'},{'x-forwarded-proto':'https,http'},{host:'leqvor.vercel.app'},{'x-forwarded-host':'attacker.example'},{forwarded:'proto=https'}])assert.equal(check({...req,headers:{...req.headers,...headers}}),false);
 assert.equal(check({...req,socket:{remoteAddress:'10.2.3.5'}}),false);
 for(const cidr of ['0.0.0.0/0','10.0.0.0/8','::/0','host/32','127.0.0.1/32/1'])assert.throws(()=>createRenderTransport({origin,proxyCidrs:[cidr]}));
});
test('Neon runtime pins separate direct host, least-privilege username and TLS; refuses owner/customer/unsafe URL options',()=>{
 const e=env(),options=governancePoolOptions(e.LEQVOR_GOVERNANCE_DATABASE_URL,governanceNeonHost);
 assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(options.ssl.servername,governanceNeonHost);assert.equal(options.connectionString,undefined);assert.equal(options.max,3);assert.equal(options.options,'');
 for(const bad of [e.LEQVOR_GOVERNANCE_DATABASE_URL.replace('leqvor_governance_control','neondb_owner'),e.LEQVOR_GOVERNANCE_DATABASE_URL.replace('/neondb','/postgres'),e.LEQVOR_GOVERNANCE_DATABASE_URL.replace(governanceNeonHost,'db.awdsyhxdnyfilnzamflt.supabase.co'),e.LEQVOR_GOVERNANCE_DATABASE_URL.replace('verify-full','disable'),`${e.LEQVOR_GOVERNANCE_DATABASE_URL}&sslcert=attacker`,`${e.LEQVOR_GOVERNANCE_DATABASE_URL}&options=-crole=owner`])assert.throws(()=>governancePoolOptions(bad,governanceNeonHost));
 assert.throws(()=>governancePoolOptions(e.LEQVOR_GOVERNANCE_DATABASE_URL,'other.neon.tech'));
});
test('database startup probe rolls back unsafe role permissions and never performs schema/bootstrap writes',async()=>{
 const sql=[];let released=false;
 const pool={connect:async()=>({query:async q=>{sql.push(q);if(q.startsWith('select current_database'))return {rows:[{db:'neondb',role:'neondb_owner',customer_schemas:0,safe_role:0,memberships:0,owned_objects:4,owned_schemas:1,database_ddl:true,schema_ddl:true}]};return {rows:[]};},release:()=>{released=true;}})};
 await assert.rejects(verifyGovernanceDatabase(pool));assert.equal(sql[0],'BEGIN READ ONLY');assert.equal(sql.at(-1),'ROLLBACK');assert.equal(released,true);assert.ok(sql.every(q=>!/^\s*(insert|update|delete|create|alter)/i.test(q)));
});
async function send(server,packet,token,headers={}){
 return new Promise((resolve,reject)=>{
  const req=request({host:'127.0.0.1',port:server.address().port,path:'/governance',method:'POST',headers:{host:'leqvor-control.onrender.com',origin,'sec-fetch-site':'same-origin','x-forwarded-proto':'https','content-type':'application/json',authorization:`Bearer ${token}`,...headers}},res=>{let text='';res.on('data',v=>text+=v);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});req.on('error',reject);req.end(JSON.stringify(packet));
 });
}
test('assembled hosted HTTP/auth/registry/Neon-store engine path preserves checkpoint, quorum, revocation and no bootstrap',async()=>{
 const credentials=await Promise.all(['A','B','C'].map(async slot=>{const {generateKeyPairSync,createHash}=await import('node:crypto');const {publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const spki=publicKey.export({format:'der',type:'spki'});return {slot,algorithm:'ES256',spki:spki.toString('base64'),key_id:createHash('sha256').update(spki).digest('hex')};}));
 let state=initialGovernance({domain:'leqvor-founder-policy-v1',platform:'leqvor.vercel.app',threshold:2,cooling_ms:259200000,credentials}),active=true,closed=false;
 const initial=checkpoint(state),config={...loadRenderConfig(env()),policyPin:hash(state.policy)};
 const database={transaction:async operation=>{
  let copy=structuredClone(state);const result=await operation({query:async(sql,values)=>{
   if(sql.startsWith('select document from founder_governance.root_state'))return {rows:[{document:copy}]};
   if(sql.startsWith('select document from founder_governance.audit_events'))return {rows:copy.audit.map(document=>({document}))};
   if(sql.startsWith('insert into founder_governance.audit_events'))return {rows:[]};
   if(sql.startsWith('update founder_governance.root_state')){copy=structuredClone(values[0]);return {rows:[]};}
   throw new Error('Unexpected test SQL');
  }});state=copy;return result;
 }};
 const runtime=await assembleRenderControl(config,{clock:()=>time,keyResolver:jwks,fetchImpl:async(_,options)=>registryResponse(options,{grants:active?[grant]:[]}),connect:async()=>({database,healthy:()=>true,close:async()=>{closed=true;}})});
 await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));
 try{
  const token=await accessToken(),packet={operation:'request',command:{action:'DISABLE_FOUNDER_PROTECTION',target:'a'.repeat(64),proposal_id:null},checkpoint:initial};
  const response=await send(runtime.server,packet,token);assert.equal(response.status,200);assert.equal(state.requests[response.body.result.request_id].status,'PENDING');assert.equal(state.policy.threshold,2);assert.equal(state.policy.credentials.length,3);
  assert.equal((await send(runtime.server,packet,token)).status,403); // stale independent checkpoint
  active=false;assert.equal((await send(runtime.server,{operation:'read',checkpoint:checkpoint(state)},token)).status,403);
  active=true;assert.equal((await send(runtime.server,{operation:'bootstrap'},token)).status,403);
  assert.equal((await send(runtime.server,{operation:'execute'},token)).status,403);
  const staleMfa=await accessToken({[auth0MfaClaim]:{authenticated_at:seconds-301,mfa:true}});assert.equal((await send(runtime.server,{...packet,checkpoint:checkpoint(state)},staleMfa)).status,403);
  config.policyPin='f'.repeat(64);assert.equal((await send(runtime.server,{operation:'read',checkpoint:checkpoint(state)},token)).status,403);
 }finally{await new Promise(resolve=>runtime.server.close(resolve));await runtime.closeDatabase();}assert.equal(closed,true);
});
test('health endpoint is liveness only and database failure blocks governance',async()=>{
 const server=createRenderServer({gateway:{handle:()=>{throw new Error('should not run');}},origin,proxyCidrs:['127.0.0.1/32'],healthy:()=>false});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/healthz`)).status,200);assert.equal((await send(server,{},'token')).status,503);}finally{await new Promise(resolve=>server.close(resolve));}
});
test('client disconnect cannot bypass the global bound on pending governance operations',{timeout:5000},async()=>{
 let entered=0,release,ready;
 const pending=new Promise(resolve=>{release=resolve;}),allEntered=new Promise(resolve=>{ready=resolve;});
 const server=createRenderServer({gateway:{handle:async()=>{entered++;if(entered===4)ready();await pending;return {result:'fixture'};}},origin,proxyCidrs:['127.0.0.1/32'],healthy:()=>true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const clients=[];
 try{
  for(let i=0;i<4;i++){
   const client=request({host:'127.0.0.1',port:server.address().port,path:'/governance',method:'POST',headers:{host:'leqvor-control.onrender.com',origin,'sec-fetch-site':'same-origin','x-forwarded-proto':'https','content-type':'application/json',authorization:'Bearer fixture'}},res=>res.resume());client.on('error',()=>{});client.end('{}');clients.push(client);
  }
  await allEntered;clients.forEach(c=>c.destroy());await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await send(server,{},'fixture')).status,503);assert.equal(entered,4);
 }finally{release();clients.forEach(c=>c.destroy());await new Promise(resolve=>server.close(resolve));}
});
test('production start without explicit configuration exits with a sanitized error, never loads local owner credentials',()=>{
 const result=spawnSync(process.execPath,[new URL('./start.mjs',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],{env:{PATH:process.env.PATH,NODE_ENV:'production',DATABASE_URL:'postgres://private-fixture-secret'},encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/Control startup blocked/);assert.ok(!result.stderr.includes('private-fixture-secret'));assert.equal(result.stdout,'');
});
test('Render governance Root Directory contains the complete production module graph',async()=>{
 const root=new URL('../',import.meta.url).href,queue=[new URL('./start.mjs',import.meta.url)],seen=new Set();
 while(queue.length){
  const file=queue.pop();if(seen.has(file.href))continue;seen.add(file.href);assert.ok(file.href.startsWith(root),'No runtime import may escape governance/');
  const source=await readFile(file,'utf8');
  for(const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g))if(match[1].startsWith('.'))queue.push(new URL(match[1],file));
 }
 assert.ok(seen.has(new URL('../engine.mjs',import.meta.url).href));assert.ok(seen.has(new URL('../protocol.mjs',import.meta.url).href));
 assert.ok(!seen.has(new URL('../../src/main.jsx',import.meta.url).href));
});
