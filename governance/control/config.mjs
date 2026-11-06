import {createHash} from 'node:crypto';

export function httpsEndpoint(value,{originOnly=false}={}){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||u.hostname==='localhost'||u.hostname==='leqvor.vercel.app'||!u.hostname.includes('.')||/^[\d.:]+$/.test(u.hostname))throw new Error('Separate HTTPS endpoint required.');
 if(originOnly&&u.origin!==value)throw new Error('Exact origin required.');
 return u;
}
export function publicKeyPin(jwk,pin){
 if(!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||typeof jwk.x!=='string'||typeof jwk.y!=='string'||Object.keys(jwk).some(k=>!['kty','crv','x','y'].includes(k)))throw new Error('Public P-256 verification key required.');
 const digest=createHash('sha256').update(JSON.stringify({crv:jwk.crv,kty:jwk.kty,x:jwk.x,y:jwk.y})).digest('hex');
 if(!/^[a-f0-9]{64}$/.test(pin)||digest!==pin)throw new Error('Independent public key pin mismatch.');
 return structuredClone(jwk);
}
export function loadRenderConfig(env){
 const read=name=>{const v=env[name];if(typeof v!=='string'||!v||v!==v.trim()||v.length>8192||/[\r\n\0]/.test(v))throw new Error(`Missing or invalid ${name}.`);return v;};
 if(read('NODE_ENV')!=='production'||read('RENDER')!=='true')throw new Error('Explicit Render production environment required.');
 if(env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||env.NODE_OPTIONS)throw new Error('Unreviewed Node transport/runtime overrides denied.');
 const port=Number(read('PORT'));if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid PORT.');
 const origin=read('LEQVOR_CONTROL_ORIGIN');httpsEndpoint(origin,{originOnly:true});
 if(read('RENDER_EXTERNAL_URL')!==origin)throw new Error('Render origin must match the independently reviewed control origin.');
 const issuer=read('LEQVOR_AUTH0_ISSUER'),u=httpsEndpoint(issuer);
 if(u.pathname!=='/'||!issuer.endsWith('/'))throw new Error('Exact Auth0 issuer with trailing slash required.');
 const policyPin=read('LEQVOR_GOVERNANCE_POLICY_SHA256');if(!/^[a-f0-9]{64}$/.test(policyPin))throw new Error('Independent policy pin required.');
 const accessUrl=read('LEQVOR_ACCESS_REGISTRY_URL');httpsEndpoint(accessUrl);
 if(new URL(accessUrl).origin===origin)throw new Error('Access registry must be independently hosted.');
 const key=publicKeyPin(JSON.parse(read('LEQVOR_ACCESS_REGISTRY_PUBLIC_JWK')),read('LEQVOR_ACCESS_REGISTRY_KEY_SHA256'));
 const accessToken=read('LEQVOR_ACCESS_REGISTRY_BEARER');if(!/^[A-Za-z0-9_-]{32,256}$/.test(accessToken))throw new Error('Scoped access-registry read credential required.');
 const proxyCidrs=read('LEQVOR_RENDER_PROXY_CIDRS').split(',');
 const consoleCheckpoint=env.LEQVOR_CONTROL_CHECKPOINT_JSON?JSON.parse(read('LEQVOR_CONTROL_CHECKPOINT_JSON')):null;
 if(consoleCheckpoint&&(consoleCheckpoint.policy_hash!==policyPin||Object.keys(consoleCheckpoint).sort().join(',')!=='event_hash,policy_hash,sequence,state_hash,version'||!/^[a-f0-9]{64}$/.test(consoleCheckpoint.state_hash)||!Number.isSafeInteger(consoleCheckpoint.version)||consoleCheckpoint.version<1||!Number.isSafeInteger(consoleCheckpoint.sequence)||consoleCheckpoint.sequence<0||consoleCheckpoint.sequence>10000||(consoleCheckpoint.sequence===0?consoleCheckpoint.event_hash!==null:!/^[a-f0-9]{64}$/.test(consoleCheckpoint.event_hash))))throw new Error('Independently verified console checkpoint required.');
 return Object.freeze({port,origin,issuer,clientId:read('LEQVOR_AUTH0_CLIENT_ID'),policyPin,consoleCheckpoint,
  databaseUrl:read('LEQVOR_GOVERNANCE_DATABASE_URL'),databaseHost:read('LEQVOR_GOVERNANCE_DATABASE_HOST'),
  proxyCidrs,accessUrl,accessToken,accessKey:key,accessIssuer:read('LEQVOR_ACCESS_REGISTRY_ISSUER')});
}
