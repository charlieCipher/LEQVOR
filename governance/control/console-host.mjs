import {readFile} from 'node:fs/promises';
const paths=['console-bootstrap.js','console-session.js','pkce-session.js','console-client.js','console-view.js','browser-public.js'];
export async function loadConsoleHandler({origin,issuer,clientId,policyPin,checkpoint,isSecureTransport}){
 if(typeof isSecureTransport!=='function'||new URL(origin).origin!==origin||new URL(issuer).protocol!=='https:')throw new Error('Explicit console transport required.');
 if(checkpoint&&(!policyPin||checkpoint.policy_hash!==policyPin))throw new Error('Independent console checkpoint pin required.');
 const config=JSON.stringify({origin,issuer,clientId,...(checkpoint?{policyPin,checkpoint}:{})});if(config.length>4096)throw new Error('Public console configuration too large.');
 const files=new Map(await Promise.all(paths.map(async path=>[`/control/${path}`,await readFile(new URL(path,import.meta.url))])));
 files.set('/public-values.mjs',await readFile(new URL('../public-values.mjs',import.meta.url)));
 const html=Buffer.from('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LEQVOR Control Console</title></head><body><main id="control-root">Loading separate governance console…</main><script type="module" src="/control/console-bootstrap.js"></script></body></html>');
 return (req,res)=>{
  let path;try{const u=new URL(req.url,origin);path=u.pathname;if(u.origin!==origin||u.hash)return false;}catch{return false;}
  if(req.method!=='GET'||!['/','/auth/callback','/control-config.json',...files.keys()].includes(path))return false;
  const seen=new Set();let duplicate=false;for(let i=0;i<req.rawHeaders.length;i+=2){const k=req.rawHeaders[i].toLowerCase();if(seen.has(k))duplicate=true;seen.add(k);}
  const denied=duplicate||req.headers.cookie||req.headers.authorization||req.headers.host!==new URL(origin).host||isSecureTransport(req)!==true;
  const headers={'Cache-Control':'no-store','Content-Type':denied?'text/plain':path==='/control-config.json'?'application/json':files.has(path)?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; script-src 'self'; connect-src 'self' ${new URL(issuer).origin}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Strict-Transport-Security':'max-age=31536000','Connection':'close'};
  res.writeHead(denied?403:200,headers);res.end(denied?'Control transport denied.':path==='/control-config.json'?config:files.get(path)||html);return true;
 };
}
