import {createServer} from 'node:http';
import {BlockList,isIP} from 'node:net';
import {createControlHandler} from './http.mjs';
import {createPeerAdmission} from './admission.mjs';

const boundaryHeaders={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Connection':'close','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff','Strict-Transport-Security':'max-age=31536000','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'};

export function createRenderTransport({origin,proxyCidrs}){
 const allowed=new URL(origin),peers=new BlockList();
 if(!Array.isArray(proxyCidrs)||proxyCidrs.length<1||proxyCidrs.length>16)throw new Error('Reviewed Render ingress peers required.');
 for(const cidr of proxyCidrs){
  const [address,prefix,...extra]=cidr.split('/'),type=isIP(address),bits=Number(prefix);
  if(extra.length||!type||!/^\d+$/.test(prefix)||!Number.isInteger(bits)||bits<(type===4?24:64)||bits>(type===4?32:128))throw new Error('Narrow explicit proxy CIDRs required.');
  peers.addSubnet(address,bits,type===4?'ipv4':'ipv6');
 }
 return req=>{
  let address=req.socket?.remoteAddress;
  if(typeof address!=='string')return false;
  if(address.startsWith('::ffff:'))address=address.slice(7);
  const type=isIP(address);
  // Forwarded headers alone are not proof of edge transport. Only reviewed
  // ingress socket peers may assert HTTPS. Never derive identity from XFF.
  return !!type&&peers.check(address,type===4?'ipv4':'ipv6')&&req.headers.host===allowed.host&&req.headers['x-forwarded-proto']==='https'&&
   req.headers.forwarded===undefined&&(req.headers['x-forwarded-host']===undefined||req.headers['x-forwarded-host']===allowed.host);
 };
}
export function createRenderServer({gateway,origin,proxyCidrs,healthy,consoleHandler,recordOutcome=()=>{},clock=Date.now}){
 const transport=createRenderTransport({origin,proxyCidrs}),admit=createPeerAdmission({capacity:12,refillPerSecond:0.5,clock});
 const handler=createControlHandler({gateway,origin,isSecureTransport:transport,admit,recordOutcome});
 let active=0;
 const server=createServer({requestTimeout:15000,headersTimeout:10000,keepAliveTimeout:1000,maxHeaderSize:16384},(req,res)=>{
  // Liveness only, deliberately not readiness/enrollment. No DB/key/role data.
  if(req.method==='GET'&&req.url==='/healthz'){
   res.writeHead(200,boundaryHeaders);res.end('{"status":"alive"}');return;
  }
  if(consoleHandler?.(req,res)===true)return;
  if(active>=4||healthy()!==true){res.writeHead(503,boundaryHeaders);res.end('{"error":"Control unavailable."}');req.resume();return;}
  // Client abort must not release admission while an authorization/DB operation
  // is still running, otherwise reconnect-and-abort can bypass this bound.
  active++;
  handler(req,res).finally(()=>{active--;}).catch(()=>{
   // The boundary normally handles errors. Never emit unexpected exception text.
   if(!res.headersSent){res.writeHead(503,boundaryHeaders);res.end('{"error":"Control unavailable."}');}else res.destroy();
  });
 });
 server.maxHeadersCount=24;server.maxRequestsPerSocket=1;
 return server;
}
