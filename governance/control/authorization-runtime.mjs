import {createServer} from 'node:http';
import {createRenderTransport} from './render-server.mjs';
import {httpsEndpoint,publicKeyPin} from './config.mjs';
import {connectAuthorizationDirectory} from './authorization-directory.mjs';
import {createKmsAuthorizationSigner} from './kms-authorization-signer.mjs';
import {connectFederatedCheckpointIdentity} from './s3-checkpoints.mjs';
import {createAccessServiceHandler} from './access-service.mjs';

export function loadAuthorizationConfig(env){
 const read=n=>{const value=env[n];if(typeof value!=='string'||!value||value!==value.trim()||value.length>8192||/[\r\n\0]/.test(value))throw new Error('Explicit authorization configuration required.');return value;};
 if(read('NODE_ENV')!=='production'||read('RENDER')!=='true'||env.NODE_OPTIONS||env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('Reviewed independent hosting required.');
 const origin=read('LEQVOR_AUTHORIZATION_ORIGIN');httpsEndpoint(origin,{originOnly:true});if(read('RENDER_EXTERNAL_URL')!==origin)throw new Error('Authorization origin mismatch.');
 const identityIssuer=read('LEQVOR_AUTH0_ISSUER'),controlOrigin=read('LEQVOR_CONTROL_ORIGIN');httpsEndpoint(identityIssuer);httpsEndpoint(controlOrigin,{originOnly:true});
 const port=Number(read('PORT'));if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid authorization port.');
 const keyPin=read('LEQVOR_AUTHORIZATION_KEY_SHA256'),publicJwk=publicKeyPin(JSON.parse(read('LEQVOR_AUTHORIZATION_PUBLIC_JWK')),keyPin),proxyCidrs=read('LEQVOR_RENDER_PROXY_CIDRS').split(',');
 if(!/^[a-f0-9]{64}$/.test(read('LEQVOR_AUTHORIZATION_READER_SHA256')))throw new Error('Scoped reader credential hash required.');
 createRenderTransport({origin,proxyCidrs});
 return {origin,issuer:origin+'/',identityIssuer,controlOrigin,port,proxyCidrs,keyPin,publicJwk,readerTokenSha256:read('LEQVOR_AUTHORIZATION_READER_SHA256'),databaseUrl:read('LEQVOR_AUTHORIZATION_DATABASE_URL'),databaseHost:read('LEQVOR_AUTHORIZATION_DATABASE_HOST'),roleArn:read('AWS_ROLE_ARN'),tokenFile:read('AWS_WEB_IDENTITY_TOKEN_FILE'),keyArn:read('LEQVOR_AUTHORIZATION_KMS_KEY_ARN'),region:'ap-southeast-2',sessionName:'leqvor-authorization'};
}
export async function assembleAuthorizationService(config,{directoryConnect=connectAuthorizationDirectory,federationConnect=connectFederatedCheckpointIdentity,signerConnect=createKmsAuthorizationSigner}={}){
 let directory,identity,signer;
 try{
  const transport=createRenderTransport(config);
  directory=await directoryConnect(config);identity=await federationConnect(config);signer=await signerConnect({...config,credentials:identity.credentials});
  const handler=await createAccessServiceHandler({...config,lookupLiveBinding:directory.lookup,signJwt:signer.signJwt,isSecureTransport:transport});
  const server=createServer({requestTimeout:6000,headersTimeout:5000,keepAliveTimeout:1000,maxHeaderSize:8192},(req,res)=>{
   if(req.method==='GET'&&req.url==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"status":"alive"}');return;}
   handler(req,res).catch(()=>res.destroy());
  });server.maxHeadersCount=20;server.maxRequestsPerSocket=1;
  return {server,async close(){signer.close();identity.close();await directory.close();}};
 }catch{signer?.close();identity?.close();if(directory)await directory.close();throw new Error('Independent authorization startup blocked.');}
}
