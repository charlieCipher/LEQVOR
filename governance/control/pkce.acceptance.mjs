import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPkceSession} from './pkce-session.js';

const issuer='https://tenant.example/',origin='https://control.example';
function fixture(overrides={}){
 let now=1792150000000,called=0,request;
 const data=new Map(),location={origin,href:`${origin}/`,assign(url){this.assigned=url;}},history={replaceState(_a,_b,url){location.href=url;}};
 const options={issuer,origin,clientId:'public-client',crypto:globalThis.crypto,location,history,storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},clock:()=>now,fetchImpl:async(url,init)=>{called++;request={url,init};return Response.json({access_token:'fixture.payload.signature',token_type:'Bearer',expires_in:300});},...overrides};
 const session=createPkceSession(options);
 return {session,data,location,options,get called(){return called;},get request(){return request;},setNow:n=>{now=n;},callback(){const start=new URL(location.assigned);location.href=`${origin}/auth/callback?code=disposable&state=${start.searchParams.get('state')}&iss=${encodeURIComponent(issuer)}`;}};
}
test('PKCE binds one-use state/verifier, S256 and exact audience; token remains memory-only and expires without refresh',async()=>{
 const f=fixture();await f.session.login();const url=new URL(f.location.assigned),tx=JSON.parse([...f.data.values()][0]);
 assert.equal(url.origin,'https://tenant.example');assert.equal(url.searchParams.get('audience'),'leqvor-control-console');assert.equal(url.searchParams.get('prompt'),'login');assert.equal(url.searchParams.get('max_age'),'0');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.has('scope'),false);
 assert.equal(url.searchParams.has('code_verifier'),false);assert.equal(tx.verifier.length,43);
 f.callback();await f.session.completeCallback();assert.equal(f.data.size,0);assert.equal(f.location.href,origin+'/');
 assert.equal(f.request.url,issuer+'oauth/token');assert.equal(f.request.init.credentials,'omit');assert.equal(f.request.init.redirect,'error');assert.equal(f.request.init.body.get('code_verifier'),tx.verifier);
 assert.equal(await f.session.getAccessToken({fresh:true}),'fixture.payload.signature');
 f.setNow(1792150300000);await assert.rejects(f.session.getAccessToken());assert.equal(f.called,1);
 await assert.rejects(f.session.completeCallback());
});
test('callback rejects missing/wrong/duplicated state, expiration, errors and issuer substitution before code exchange',async()=>{
 for(const mutate of [u=>u.searchParams.set('state','wrong'),u=>u.searchParams.append('state','duplicate'),u=>u.searchParams.set('iss','https://attacker.example/'),u=>u.searchParams.set('error','access_denied'),u=>u.pathname='/other',u=>u.hash='#token']){
  const f=fixture();await f.session.login();f.callback();const u=new URL(f.location.href);mutate(u);f.location.href=u.href;await assert.rejects(f.session.completeCallback());assert.equal(f.called,0);assert.equal(f.data.size,0);
 }
 const f=fixture();await f.session.login();f.callback();f.setNow(1792150300001);await assert.rejects(f.session.completeCallback());assert.equal(f.called,0);
});
test('token exchange rejects refresh/ID tokens, long lifetimes, redirects, oversized bodies and clearing during exchange',async()=>{
 for(const payload of [{refresh_token:'not-allowed'},{id_token:'not-allowed'},{expires_in:301},{token_type:'Other'},{access_token:'x'.repeat(17000)}]){
  const f=fixture({fetchImpl:async()=>Response.json({access_token:'a.b.c',token_type:'Bearer',expires_in:300,...payload})});await f.session.login();f.callback();await assert.rejects(f.session.completeCallback());await assert.rejects(f.session.getAccessToken());
 }
 let f;f=fixture({fetchImpl:async()=>{f.session.clear();return Response.json({access_token:'a.b.c',token_type:'Bearer',expires_in:300});}});await f.session.login();f.callback();await assert.rejects(f.session.completeCallback());
});
test('OAuth configuration rejects customer origin, remote HTTP, origin substitution and issuer userinfo',()=>{
 for(const values of [{origin:'https://leqvor.vercel.app'},{origin:'http://control.example'},{issuer:'https://user@tenant.example/'},{issuer:'https://tenant.example/path'},{origin:'https://control.example/path'}])assert.throws(()=>fixture(values));
});
