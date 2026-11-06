// OAuth public client only. No client secret, ID-token authorization, token
// persistence, silent refresh or customer-origin fallback. Server verifies JWTs.
const transactionKey='leqvor-control-pkce-v1';
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export function createPkceSession({issuer,clientId,origin,storage,location,history,crypto,fetchImpl,clock=Date.now}){
 const provider=new URL(issuer),page=new URL(origin);
 if(provider.protocol!=='https:'||provider.pathname!=='/'||provider.search||provider.hash||provider.username||provider.password||provider.port||!issuer.endsWith('/')||provider.origin===origin||!provider.hostname.includes('.')||!clientId||
  page.origin!==origin||page.hostname==='leqvor.vercel.app'||page.username||page.password||!(page.protocol==='https:'||(page.protocol==='http:'&&page.hostname==='127.0.0.1'))||location.origin!==origin)throw new Error('Separate explicit OAuth configuration required.');
 const callback=`${origin}/auth/callback`,logoutUri=`${origin}/`,random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
 let token=null,expires=0,generation=0,busy=false;
 function clear(){generation++;token=null;expires=0;storage.removeItem(transactionKey);}
 return Object.freeze({
  async login(){
   if(busy)throw new Error('Authentication already running.');busy=true;clear();
   try{
    const stamp=generation,state=random(),verifier=random(),created=clock(),challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    if(stamp!==generation||!Number.isSafeInteger(created))throw new Error();
    storage.setItem(transactionKey,JSON.stringify({state,verifier,created}));
    const url=new URL('authorize',issuer);
    // No openid/profile/email or offline_access: no ID token/userinfo audience.
    for(const [k,v] of Object.entries({response_type:'code',client_id:clientId,redirect_uri:callback,audience:'leqvor-control-console',code_challenge_method:'S256',code_challenge:challenge,state,prompt:'login',max_age:'0'}))url.searchParams.set(k,v);
    location.assign(url.href);
   }catch{clear();throw new Error('Could not start control authentication.');}finally{busy=false;}
  },
  async completeCallback(){
   if(busy)throw new Error('Authentication already running.');busy=true;
   const stamp=++generation;token=null;expires=0;
   let tx;try{tx=JSON.parse(storage.getItem(transactionKey));}catch{/* Reject below. */}
   storage.removeItem(transactionKey);
   const url=new URL(location.href);
   // Remove authorization code/error before network work or UI rendering.
   history.replaceState(null,'',`${origin}/`);
   try{
    const now=clock(),keys=[...url.searchParams.keys()];
    if(url.origin!==origin||url.pathname!=='/auth/callback'||url.hash||!tx||Object.keys(tx).sort().join(',')!=='created,state,verifier'||!Number.isSafeInteger(tx.created)||!Number.isSafeInteger(now)||now<tx.created||now-tx.created>300000||
     !/^[A-Za-z0-9_-]{43}$/.test(tx.state)||!/^[A-Za-z0-9_-]{43}$/.test(tx.verifier)||url.searchParams.getAll('state').length!==1||url.searchParams.get('state')!==tx.state||url.searchParams.getAll('code').length!==1||!url.searchParams.get('code')||url.searchParams.get('code').length>4096||keys.some(k=>!['code','state','iss'].includes(k))||
     (url.searchParams.has('iss')&&(url.searchParams.getAll('iss').length!==1||url.searchParams.get('iss')!==issuer)))throw new Error();
    const response=await fetchImpl(`${issuer}oauth/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code_verifier:tx.verifier,code:url.searchParams.get('code'),redirect_uri:callback}),credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='application/json')throw new Error();
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384)throw new Error();chunks.push(value);}}finally{await reader.cancel();}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),completed=clock();
    if(stamp!==generation||completed<now||completed-now>10000||result.token_type!=='Bearer'||!Number.isSafeInteger(result.expires_in)||result.expires_in<1||result.expires_in>300||typeof result.access_token!=='string'||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(result.access_token)||result.access_token.length>8192||result.refresh_token||result.id_token)throw new Error();
    token=result.access_token;expires=now+result.expires_in*1000;
    return {authenticated:true,expires_at:expires};
   }catch{token=null;expires=0;throw new Error('Control authentication could not complete.');}finally{busy=false;}
  },
  async getAccessToken({fresh=false}={}){
   // Never relabel an old token fresh. Server enforces actual authentication age.
   if(!token||clock()>=expires){clear();throw new Error('Sign in with MFA again.');}
   if(typeof fresh!=='boolean')throw new Error('Invalid freshness request.');return token;
  },
  clear,
  logout(){clear();const url=new URL('v2/logout',issuer);url.searchParams.set('client_id',clientId);url.searchParams.set('returnTo',logoutUri);location.assign(url.href);},
 });
}
