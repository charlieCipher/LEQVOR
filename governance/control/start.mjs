import {loadRenderConfig} from './config.mjs';
import {assembleRenderControl} from './runtime.mjs';

// Production entry only. No dotenv discovery, migrations, enrollment, role
// assignment, credential generation, execution adapters or customer imports.
let runtime;
try{
 const config=loadRenderConfig(process.env);
 runtime=await assembleRenderControl(config,{recordOutcome:event=>process.stdout.write(`${JSON.stringify(event)}\n`)});
 await new Promise((resolve,reject)=>{runtime.server.once('error',reject);runtime.server.listen(config.port,'0.0.0.0',resolve);});
 process.stdout.write('LEQVOR control listener started; Founder Authority activation is not implied.\n');
 let stopping=false;
 const stop=()=>{
  if(stopping)return;stopping=true;
  const timer=setTimeout(()=>process.exit(1),20000);timer.unref();
  runtime.server.close(async()=>{try{await runtime.closeDatabase();clearTimeout(timer);}catch{process.exitCode=1;}});
  runtime.server.closeIdleConnections();
 };
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
 runtime.server.on('error',()=>{process.stderr.write('Control listener failed.\n');stop();process.exitCode=1;});
}catch{
 if(runtime)try{await runtime.closeDatabase();}catch{/* Never print secrets/errors. */}
 process.stderr.write('Control startup blocked. Review the separate hosting configuration and database permissions.\n');process.exitCode=1;
}
