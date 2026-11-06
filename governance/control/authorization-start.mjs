import {loadAuthorizationConfig,assembleAuthorizationService} from './authorization-runtime.mjs';
let service;
try{
 const config=loadAuthorizationConfig(process.env);service=await assembleAuthorizationService(config);
 await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(config.port,'0.0.0.0',resolve);});
 process.stdout.write('Independent authorization listener started; no roles or sessions were created.\n');
 let stopping=false;const stop=()=>{if(stopping)return;stopping=true;const timer=setTimeout(()=>process.exit(1),15000);timer.unref();service.server.close(async()=>{try{await service.close();clearTimeout(timer);}catch{process.exitCode=1;}});service.server.closeIdleConnections();};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);service.server.on('error',()=>{process.exitCode=1;stop();});
}catch{if(service)try{await service.close();}catch{/* No private errors in logs. */}process.stderr.write('Independent authorization startup blocked. Review protected adapters and configuration.\n');process.exitCode=1;}
