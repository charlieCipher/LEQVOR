import {createAccessDecisionIssuer} from './access-decisions.mjs';
import {createPeerAdmission} from './admission.mjs';

// Listener assembly deliberately external: supply reviewed direct TLS or a
// separately authenticated ingress. Not mounted on the governance/customer API.
export async function createAccessServiceHandler(options){
 const {isSecureTransport,origin,recordOutcome=()=>{},clock=Date.now}=options;
 if(typeof isSecureTransport!=='function'||new URL(origin).origin!==origin||!origin.startsWith('https://'))throw new Error('Independent secure authorization transport required.');
 const issue=await createAccessDecisionIssuer(options),admit=createPeerAdmission({capacity:20,refillPerSecond:2,clock});let active=0;
 return async(req,res)=>{
  let status=403,held=false;
  const headers={'Content-Type':'application/jwt','Cache-Control':'no-store','Connection':'close','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','Strict-Transport-Security':'max-age=31536000'};
  try{
   const seen=new Set();for(let i=0;i<req.rawHeaders.length;i+=2){const k=req.rawHeaders[i].toLowerCase();if(seen.has(k))throw new Error();seen.add(k);}
   if(isSecureTransport(req)!==true||req.headers.host!==new URL(origin).host||req.headers.cookie||req.headers.origin||req.headers['content-encoding']||req.headers['transfer-encoding']||req.method!=='POST'||req.url!=='/live.jwt'||req.headers['content-type']!=='application/json'||!/^\d+$/.test(req.headers['content-length']||'')||Number(req.headers['content-length'])>2048)throw new Error();
   if(active>=4||!admit(req)){status=429;throw new Error();}active++;held=true;
   const bearer=req.headers.authorization;if(typeof bearer!=='string'||!/^Bearer [A-Za-z0-9_-]{32,256}$/.test(bearer))throw new Error();
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2048)throw new Error();chunks.push(chunk);}
   const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
   const token=await issue(bearer.slice(7),input);status=200;res.writeHead(status,headers);res.end(token);
  }catch{req.resume();if(!res.headersSent){res.writeHead(status,{...headers,'Content-Type':'application/json'});res.end('{"error":"Authorization unavailable."}');}else res.destroy();}
  finally{if(held)active--;try{recordOutcome({status});}catch{/* No credentials, binding or raw error in logs. */}}
 };
}
