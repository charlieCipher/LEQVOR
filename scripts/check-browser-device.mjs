// Disposable real-browser IndexedDB acceptance. No account, network backend,
// plaintext vault data or existing user browser profile is involved.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import process from 'node:process';

const browser=process.env.LEQVOR_TEST_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const modules=new Map([
 ['/deviceKeyStore.js',new URL('../src/modules/sessions/deviceKeyStore.js',import.meta.url)],
 ['/security/safeEvents',new URL('../src/modules/security/safeEvents.js',import.meta.url)],
]);
const page=`<!doctype html><meta charset="utf-8"><title>LEQVOR disposable key acceptance</title><p>Testing disposable browser storage.</p><script type="module">
import {DeviceKeyStore} from '/deviceKeyStore.js';
const store=new DeviceKeyStore(),scope='synthetic-device-scope',stage=new URL(location.href).searchParams.get('stage');
function require(value){if(!value)throw new Error('Acceptance failed');}
try{
 if(stage==='write'){
  require(await store.get(scope)===null);
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  require(pair.privateKey.extractable===false);
  await store.add(scope,{privateKey:pair.privateKey,publicKey:pair.publicKey});
 }else{
  const saved=await store.get(scope);require(saved?.privateKey?.extractable===false);
  const bytes=new TextEncoder().encode('LEQVOR synthetic browser proof');
  const proof=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},saved.privateKey,bytes);
  require(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},saved.publicKey,proof,bytes));
  let denied=false;try{await crypto.subtle.exportKey('jwk',saved.privateKey);}catch{denied=true;}require(denied);
  require(await store.get('different-scope')===null);
  let duplicate=false;try{await store.add(scope,{invalid:true});}catch{duplicate=true;}require(duplicate);
  require((await store.get(scope)).privateKey.extractable===false);
  await store.remove(scope);require(await store.get(scope)===null);
 }
 await fetch('/result?stage='+stage,{method:'POST',body:'PASS'});
}catch{await fetch('/result?stage='+stage,{method:'POST',body:'FAIL'});}
</script>`;
let directory,server,child,pending;
try{
 await access(browser);
 directory=await mkdtemp(join(tmpdir(),'leqvor-browser-device-'));
 const target=resolve(directory);
 if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('leqvor-browser-device-')){directory=null;throw new Error('Invalid profile target');}
 server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='POST'&&url.pathname==='/result'){
   let data='';for await(const chunk of req){data+=chunk;if(data.length>16){res.writeHead(413).end();return;}}
   res.writeHead(200).end();if(pending?.stage===url.searchParams.get('stage'))pending.finish(data==='PASS');return;
  }
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end(page);return;}
  const source=modules.get(url.pathname);
  if(req.method==='GET'&&source){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(await readFile(source,'utf8'));return;}
  res.writeHead(404).end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 for(const stage of ['write','read']){
  const result=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Browser acceptance timed out')),25000);
   pending={stage,finish:ok=>{clearTimeout(timer);ok?resolve():reject(new Error('Browser acceptance failed'));}};
  });
  child=spawn(browser,['--headless=new','--no-first-run','--no-default-browser-check',`--user-data-dir=${directory}`,`http://127.0.0.1:${server.address().port}/?stage=${stage}`],{windowsHide:true,stdio:'ignore'});
  child.on('error',()=>pending?.finish(false));
  const stopped=new Promise(resolve=>child.once('exit',resolve));
  await result;child.kill();await stopped;child=null;pending=null;
 }
 console.log('PASS real browser restart retains a non-extractable IndexedDB key; proof, export denial, scope separation, duplicate protection and removal verified.');
}catch{
 console.error('Real-browser device acceptance failed or browser unavailable; no acceptance recorded. Details suppressed.');process.exitCode=1;
}finally{
 pending=null;child?.kill();
 if(server)await new Promise(resolve=>server.close(resolve));
 if(directory)await rm(resolve(directory),{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
