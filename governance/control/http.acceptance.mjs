import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createControlHandler} from './http.mjs';

const origin='https://admin.example',packet={operation:'read',checkpoint:{}};
async function fixture(overrides={}){
 const calls=[],logs=[];
 const handler=createControlHandler({gateway:{handle:async(...args)=>{calls.push(args);return {result:'public-state'};}},origin,isSecureTransport:()=>true,admit:async()=>true,recordOutcome:event=>logs.push(event),...overrides});
 const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 async function send({body=JSON.stringify(packet),path='/governance',method='POST',headers={}}={}){
  return new Promise((resolve,reject)=>{const req=request({host:'127.0.0.1',port:server.address().port,path,method,headers:{host:'admin.example',origin,'sec-fetch-site':'same-origin','content-type':'application/json',authorization:'Bearer signed.token.value',...headers}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(text)}));});req.on('error',reject);req.end(body);});
 }
 return {calls,logs,send,close:()=>new Promise(resolve=>server.close(resolve))};
}
test('routes one bounded same-origin request and emits only sanitized metadata',async()=>{
 const f=await fixture();try{
  const res=await f.send();assert.equal(res.status,200);assert.deepEqual(f.calls,[['signed.token.value',packet]]);
  assert.equal(res.headers['cache-control'],'no-store');assert.match(res.headers['content-security-policy'],/frame-ancestors 'none'/);
  assert.equal(res.headers['access-control-allow-origin'],undefined);assert.equal(res.headers['set-cookie'],undefined);
  assert.deepEqual(Object.keys(f.logs[0]).sort(),['request_id','status']);
 }finally{await f.close();}
});
test('denies insecure transport, foreign origin, cookies, unexpected paths and overload before gateway',async()=>{
 for(const overrides of [{isSecureTransport:()=>false},{admit:async()=>false}]){
  const f=await fixture(overrides);try{assert.notEqual((await f.send()).status,200);assert.equal(f.calls.length,0);}finally{await f.close();}
 }
 const f=await fixture();try{
  for(const changes of [{headers:{host:'customer.example'}},{headers:{origin:'https://attacker.example'}},{headers:{'sec-fetch-site':'cross-site'}},{headers:{cookie:'session=stolen'}},{headers:{authorization:''}},{headers:{'content-type':'text/plain'}},{headers:{'content-encoding':'gzip'}},{path:'/bootstrap'},{path:'/governance?execute=true'},{method:'GET'},{body:'invalid json'},{body:'x'.repeat(65537)}]){
   assert.notEqual((await f.send(changes).catch(error=>{throw new Error(JSON.stringify({...changes,body:changes.body?.slice(0,20)}),{cause:error});})).status,200);
  }
  assert.equal(f.calls.length,0);
 }finally{await f.close();}
});
test('never returns exception text or retries a committed mutation when logging fails',async()=>{
 const f=await fixture({gateway:{handle:async()=>{throw new Error('secret-value');}},recordOutcome:()=>{throw new Error('log-secret');}});
 try{const res=await f.send();assert.equal(res.status,403);assert.ok(!JSON.stringify(res).includes('secret-value'));}finally{await f.close();}
 let mutations=0;const success=await fixture({gateway:{handle:async()=>{mutations++;return {result:'committed'};}},recordOutcome:()=>{throw new Error('offline');}});
 try{assert.equal((await success.send()).status,200);assert.equal(mutations,1);}finally{await success.close();}
});
