import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {createControlAuthenticator} from './auth.mjs';
import {GovernanceGateway} from '../gateway.mjs';

const now=Date.parse('2026-10-12T12:00:00Z'),seconds=now/1000;
const issuer='https://identity.example/control',jwksUrl='https://identity.example/keys',mfaAcr='urn:leqvor:control:mfa';
const key=await generateKeyPair('ES256'),jwk=await exportJWK(key.publicKey);
const resolver=createLocalJWKSet({keys:[{...jwk,kid:'control-key',alg:'ES256'}]});
const claims={iss:issuer,aud:'leqvor-control-console',sub:'founder-subject',jti:'session-123',iat:seconds,exp:seconds+300,auth_time:seconds,acr:mfaAcr};
function auth(overrides={}){return createControlAuthenticator({issuer,jwksUrl,mfaAcr,isSessionActive:async()=>true,clock:()=>now,keyResolver:resolver,...overrides});}
function token(overrides={},headers={}){return new SignJWT({...claims,...overrides}).setProtectedHeader({alg:'ES256',typ:'at+jwt',kid:'control-key',...headers}).sign(key.privateKey);}

test('verifies issuer signature, control audience, MFA and mandatory live revocation',async()=>{
 assert.deepEqual(await auth()(await token()),{id:claims.sub,audience:claims.aud,expires_at:now+300000,authenticated_at:now,mfa_verified:true});
 await assert.rejects(auth({isSessionActive:async()=>false})(await token()));
 await assert.rejects(auth({isSessionActive:async()=>{throw new Error('Provider unavailable');}})(await token()));
 assert.throws(()=>auth({isSessionActive:undefined}));
 assert.throws(()=>auth({issuer:'http://identity.example'}));
 assert.throws(()=>auth({jwksUrl:'https://identity.example/keys?caller=foo'}));
});
test('rejects customer/ID tokens, mixed audiences, expiry, future dates and caller key URLs',async()=>{
 for(const change of [{iss:'https://customer.example'},{aud:'authenticated'},{aud:['leqvor-control-console','authenticated']},{exp:seconds},{exp:seconds+301},{iat:seconds+1},{auth_time:seconds+1},{auth_time:'now'},{jti:''},{sub:''}])await assert.rejects(auth()(await token(change)));
 await assert.rejects(auth()(await token({}, {typ:'JWT'})));
 await assert.rejects(auth()(await token({}, {jku:'https://attacker.example/keys'})));
 const other=await generateKeyPair('ES256');
 const forged=await new SignJWT(claims).setProtectedHeader({alg:'ES256',typ:'at+jwt',kid:'control-key'}).sign(other.privateKey);
 await assert.rejects(auth()(forged));
});
test('signed role claims do not grant a role or bypass fresh MFA at the real gateway',async()=>{
 let calls=0;const engine={request:async()=>{calls++;return {pending:true};}};
 const packet={operation:'request',command:{action:'DISABLE_FOUNDER_PROTECTION',target:'a'.repeat(64),proposal_id:null},checkpoint:{}};
 const gateway=new GovernanceGateway({engine,authenticate:auth(),getRole:async()=>null,clock:()=>now});
 await assert.rejects(gateway.handle(await token({role:'FOUNDER'}),packet));assert.equal(calls,0);
 const allowed=new GovernanceGateway({engine,authenticate:auth(),getRole:async()=> 'SECURITY_ADMIN',clock:()=>now});
 await assert.rejects(allowed.handle(await token({acr:'password-only'}),packet));
 await assert.rejects(allowed.handle(await token({auth_time:seconds-301}),packet));
 assert.equal(calls,0);await allowed.handle(await token(),packet);assert.equal(calls,1);
});
