import {randomUUID} from 'node:crypto';

const CSP="default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
function controlOrigin(value){const url=new URL(value);if(url.protocol!=='https:'||url.origin!==value||url.username||url.password)throw new Error('Exact HTTPS control origin required.');return url;}
function reply(res,status,body,id){res.writeHead(status,{'Connection':'close','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Strict-Transport-Security':'max-age=31536000','X-Request-ID':id});res.end(JSON.stringify(body));}
function uniqueHeaders(req){const seen=new Set();for(let i=0;i<req.rawHeaders.length;i+=2){const name=req.rawHeaders[i].toLowerCase();if(seen.has(name))throw new Error('Duplicate headers.');seen.add(name);}}
async function readBody(req,maxBytes){
 if(req.headers['content-encoding'])throw new Error('Encoded bodies denied.');
 const size=req.headers['content-length'];if(size!==undefined&&(!/^\d+$/.test(size)||Number(size)>maxBytes))throw new Error('Body too large.');
 const buffer=await new Promise((resolve,reject)=>{
  const chunks=[];let bytes=0,oversized=false;
  req.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){oversized=true;chunks.length=0;}else if(!oversized)chunks.push(chunk);});
  req.on('end',()=>oversized?reject(new Error('Body too large.')):resolve(Buffer.concat(chunks)));
  req.on('error',reject);req.on('aborted',()=>reject(new Error('Request aborted.')));
 });
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
}

// Supply a TLS listener or a reviewed hosting adapter. Do not trust arbitrary
// X-Forwarded-Proto/Host. No listen(), public bootstrap, cookies or CORS here.
export function createControlHandler({gateway,origin,isSecureTransport,admit,recordOutcome=()=>{}}){
 const allowed=controlOrigin(origin);
 if(typeof gateway?.handle!=='function'||typeof isSecureTransport!=='function'||typeof admit!=='function')throw new Error('Trusted gateway, transport and admission adapters required.');
 return async(req,res)=>{
  const id=randomUUID();let status=400;
  try{
   uniqueHeaders(req);
   if(isSecureTransport(req)!==true||req.headers.host!==allowed.host){status=403;throw new Error('Transport denied.');}
   if(req.method!=='POST'||req.url!=='/governance'){status=404;throw new Error('Route denied.');}
   if(req.headers.origin!==origin||req.headers['sec-fetch-site']!=='same-origin'||req.headers.cookie||req.headers['content-type']!=='application/json'){status=403;throw new Error('Origin denied.');}
   if(await admit(req)!==true){status=429;throw new Error('Admission denied.');}
   const header=req.headers.authorization;
   if(typeof header!=='string'||!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(header)){status=401;throw new Error('Session required.');}
   const packet=await readBody(req,65536);status=403;
   const result=await gateway.handle(header.slice(7),packet);
   status=200;reply(res,status,result,id);
  }catch{req.resume();reply(res,status,{error:'Control request rejected. Check authentication, authorization and the independent checkpoint.',request_id:id},id);}
  finally{
   // Allowlisted metadata only. Never log tokens, packets, targets or errors.
   try{recordOutcome({request_id:id,status});}catch{/* Logging failure must not retry a committed mutation. */}
  }
 };
}
