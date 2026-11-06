import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT,jwtVerify} from 'jose';
import {createAccessDecisionIssuer} from './access-decisions.mjs';
import {createAccessRegistry} from './access-registry.mjs';

const now=Date.parse('2026-10-16T08:00:00Z'),identityIssuer='https://control-tenant.auth0.com/',issuer='https://authorization.example/',origin='https://control.example';
const reader='disposable-reader-fixture-not-a-real-secret',readerTokenSha256=createHash('sha256').update(reader).digest('hex');
const pair=await generateKeyPair('ES256',{extractable:true}),jwk=await exportJWK(pair.publicKey);
const keyPin=createHash('sha256').update(JSON.stringify({crv:jwk.crv,kty:jwk.kty,x:jwk.x,y:jwk.y})).digest('hex');
const request={nonce:'a'.repeat(64),identity_issuer:identityIssuer,subject:'auth0|test-user',token_id:'test-jti',expires_at:now+300000};
const live={identity_issuer:identityIssuer,subject:request.subject,token_id:request.token_id,expires_at:request.expires_at,active:true,role:'AUDITOR',revision:'one'};
const sign=(payload,header)=>new SignJWT(payload).setProtectedHeader(header).sign(pair.privateKey);
async function fixture(options={}){return createAccessDecisionIssuer({identityIssuer,issuer,controlOrigin:origin,readerTokenSha256,publicJwk:jwk,keyPin,lookupLiveBinding:async()=>live,signJwt:sign,clock:()=>now,...options});}

test('independent issuer produces a pinned, nonce-bound role decision from the exact live session',async()=>{
 const issue=await fixture(),signed=await issue(reader,request),{payload}=await jwtVerify(signed,pair.publicKey,{currentDate:new Date(now)});
 assert.equal(payload.nonce,request.nonce);assert.equal(payload.exp-payload.iat,30);assert.deepEqual(payload.grants,[{subject:request.subject,token_id:request.token_id,expires_at:request.expires_at,role:'AUDITOR'}]);
});
test('bad reader, caller role/subject substitution, unknown nonce and unregistered sessions never get signed',async()=>{
 let signed=0,lookups=0;
 const issue=await fixture({lookupLiveBinding:async()=>{lookups++;return live;},signJwt:async(...args)=>{signed++;return sign(...args);}});
 await assert.rejects(issue('incorrect-reader-fixture-secret-123456789',request));assert.equal(lookups,0);
 for(const input of [{...request,role:'FOUNDER'},{...request,nonce:'short'},{...request,nonce:[request.nonce]},{...request,identity_issuer:'https://customer.example/'},{...request,subject:'other'},{...request,token_id:'other'},{...request,expires_at:now+300001}])await assert.rejects(issue(reader,input));
 assert.equal(signed,0);
});
test('revocation, disabled roles and directory outages fail closed before independent signing',async()=>{
 let signed=0;
 for(const value of [null,{...live,active:false},{...live,role:'SUPERUSER'},{...live,revision:''}]){
  const issue=await fixture({lookupLiveBinding:async()=>value,signJwt:async(...args)=>{signed++;return sign(...args);}});await assert.rejects(issue(reader,request));
 }
 const issue=await fixture({lookupLiveBinding:async()=>{throw new Error('directory unavailable');}});await assert.rejects(issue(reader,request));assert.equal(signed,0);
});
test('role changes or revocation during external signing discard the already-signed response',async()=>{
 for(const change of [{active:false},{role:'FOUNDER',revision:'two'},{revision:'two'}]){
  let calls=0;const issue=await fixture({lookupLiveBinding:async()=>++calls===1?live:{...live,...change}});
  await assert.rejects(issue(reader,request));assert.equal(calls,2);
 }
});
test('wrong signing key, modified role, private JWK and delayed signature cannot authorize a caller',async()=>{
 await assert.rejects(fixture({publicJwk:{...jwk,d:'private'}}));
 const other=await generateKeyPair('ES256');
 for(const signJwt of [(payload,header)=>new SignJWT(payload).setProtectedHeader(header).sign(other.privateKey),(payload,header)=>sign({...payload,grants:[{...payload.grants[0],role:'FOUNDER'}]},header)])await assert.rejects((await fixture({signJwt}))(reader,request));
 let time=now;const issue=await fixture({clock:()=>time,signJwt:async(...args)=>{time=now+4000;return sign(...args);}});await assert.rejects(issue(reader,request));
});
test('real signed producer and existing client recheck roles/revocation for every request without a cached success',async()=>{
 let active=true,role='AUDITOR',requests=0;
 const issue=await fixture({lookupLiveBinding:async()=>({...live,active,role})});
 const client=await createAccessRegistry({url:`${issuer}decision`,key:jwk,issuer,identityIssuer,controlOrigin:origin,readToken:reader,clock:()=>now,fetchImpl:async(_,options)=>{
  requests++;try{return new Response(await issue(options.headers.Authorization.slice(7),JSON.parse(options.body)),{headers:{'Content-Type':'application/jwt'}});}catch{return new Response('',{status:403});}
 }});
 const session={issuer:identityIssuer,subject:request.subject,token_id:request.token_id,expires_at:request.expires_at},principal={id:request.subject,session};
 assert.equal(await client.isSessionActive(session),true);assert.equal(await client.lookupRole(request.subject,principal),'AUDITOR');
 role='SECURITY_ADMIN';assert.equal(await client.lookupRole(request.subject,principal),'SECURITY_ADMIN');
 active=false;await assert.rejects(client.isSessionActive(session));assert.equal(requests,4);
});
