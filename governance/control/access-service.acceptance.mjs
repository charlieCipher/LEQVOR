import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createHash} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT,jwtVerify} from 'jose';
import {createAccessServiceHandler} from './access-service.mjs';
test('separate authorization HTTP service issues signed bound decisions and immediately denies revoked sessions; never exposes signing/admin routes',async()=>{
 const pair=await generateKeyPair('ES256',{extractable:true}),jwk=await exportJWK(pair.publicKey),pin=createHash('sha256').update(JSON.stringify({crv:jwk.crv,kty:jwk.kty,x:jwk.x,y:jwk.y})).digest('hex'),now=Date.now();let active=true,lookups=0;
 const binding={identity_issuer:'https://tenant.example/',subject:'auth0|fixture',token_id:'fixture-session',expires_at:now+240000},input={...binding,nonce:'a'.repeat(64)},reader='fixture-read-only-credential-12345678',issuer='https://authorization.example/';
 const handler=await createAccessServiceHandler({origin:issuer.slice(0,-1),issuer,controlOrigin:'https://control.example',identityIssuer:binding.identity_issuer,readerTokenSha256:createHash('sha256').update(reader).digest('hex'),publicJwk:jwk,keyPin:pin,lookupLiveBinding:async b=>{lookups++;return {...b,active,role:'AUDITOR',revision:active?'1':'2'};},signJwt:(p,h)=>new SignJWT(p).setProtectedHeader(h).sign(pair.privateKey),isSecureTransport:req=>req.socket.remoteAddress==='127.0.0.1',clock:()=>now});
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const send=(changes={},path='/live.jwt',body=input)=>new Promise((resolve,reject)=>{const bytes=JSON.stringify(body),req=request({host:'127.0.0.1',port:server.address().port,path,method:'POST',headers:{Host:'authorization.example',Authorization:`Bearer ${reader}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(bytes),...changes}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers}));});req.on('error',reject);req.end(bytes);});
 try{
  const result=await send();assert.equal(result.status,200);const jwt=await jwtVerify(result.text,pair.publicKey,{issuer,audience:'https://control.example',algorithms:['ES256'],currentDate:new Date(now)});assert.equal(jwt.payload.nonce,input.nonce);assert.equal(jwt.payload.grants[0].role,'AUDITOR');assert.equal(lookups,2);
  active=false;assert.equal((await send()).status,403);
  const n=lookups;for(const header of [{Origin:'https://control.example'},{Cookie:'session=fixture'},{Authorization:'Bearer wrong'},{Host:'attacker.example'}])assert.equal((await send(header)).status,403);
  assert.equal((await send({},'/grant-role')).status,403);assert.equal(lookups,n);
  const denied=await send({},'/live.jwt',{...input,role:'FOUNDER'});assert.equal(denied.status,403);assert.equal(denied.text.includes('fixture-session'),false);
 }finally{await new Promise(r=>server.close(r));}
});
