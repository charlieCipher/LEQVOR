import {createServer} from 'node:http';
import {loadConsoleHandler} from './console-host.mjs';
import {createAuth0Authenticator} from './auth0.mjs';
// LOCAL acceptance only: no datastore, role assignments, governance route,
// founder policy, signer or activation. Never deploy this as the control API.
const origin='http://127.0.0.1:8787',issuer='https://dev-7z4esjz3wzmwvdif.us.auth0.com/',clientId='HzqIw1suyiBXpH3snmT95hbWDe4lHD6V';
const secure=req=>req.socket.remoteAddress==='127.0.0.1'&&req.headers.host==='127.0.0.1:8787';
const assets=await loadConsoleHandler({origin,issuer,clientId,isSecureTransport:secure});
const server=createServer({requestTimeout:10000,headersTimeout:5000,maxHeaderSize:12000},async(req,res)=>{
 if(req.url==='/authentication-check'&&req.method==='POST'){
  let signatureAccepted=false;
  try{
   if(!secure(req)||req.headers.origin!==origin||req.headers['sec-fetch-site']!=='same-origin'||req.headers.cookie||req.headers['content-length']!=='0'||!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(req.headers.authorization||''))throw new Error();
   const authenticate=createAuth0Authenticator({issuer,clientId,isSessionActive:async()=>{signatureAccepted=true;return false;}});
   try{await authenticate(req.headers.authorization.slice(7));}catch{/* Live session remains deliberately unregistered. */}
  }catch{/* Return no JWT/identity/error details. */}
  res.writeHead(signatureAccepted?200:401,{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({signature_and_mfa_valid:signatureAccepted,governance_access:false}));return;
 }
 if(assets(req,res))return;res.writeHead(404,{'Cache-Control':'no-store'});res.end();
});
server.maxHeadersCount=24;server.maxRequestsPerSocket=1;
server.listen(8787,'127.0.0.1',()=>process.stdout.write('Local Auth0 acceptance: http://127.0.0.1:8787 (governance access disabled).\n'));
process.once('SIGINT',()=>server.close());process.once('SIGTERM',()=>server.close());
server.on('error',()=>{process.stderr.write('Local Auth0 acceptance could not start.\n');process.exitCode=1;});
