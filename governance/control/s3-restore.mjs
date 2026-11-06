import {writeFile} from 'node:fs/promises';
import {readBoundedPublicFile} from '../bounded-public-file.mjs';
import {restoreGovernanceArchive} from '../archive.mjs';
import {connectFederatedCheckpointIdentity,createS3CheckpointStore} from './s3-checkpoints.mjs';
// Read-only cloud evidence restore, NOT production rollback or enrollment.
let identity;
try{
 if(process.argv.length!==6)throw new Error();
 const [policyPath,parentPath,expectedHash,output]=process.argv.slice(2),decode=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),policy=decode(await readBoundedPublicFile(policyPath)),anchor=decode(await readBoundedPublicFile(parentPath));
 identity=await connectFederatedCheckpointIdentity({roleArn:process.env.LEQVOR_CHECKPOINT_VERIFIER_ROLE_ARN,tokenFile:process.env.AWS_WEB_IDENTITY_TOKEN_FILE,sessionName:'leqvor-checkpoint-restore'});
 const store=createS3CheckpointStore({reader:identity.client}),bytes=await store.get(expectedHash),archive=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 const restored=restoreGovernanceArchive(archive,{policy,anchor,expectedHash});
 await writeFile(output,JSON.stringify({policy,checkpoint:restored.checkpoint,state:restored.snapshot}),{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify({restored:true,authority_activated:false,database_changed:false,storage_receipts:store.receipts()})+'\n');
}catch{process.stderr.write('Cloud evidence restore blocked. Check independent pins, reader authorization, retention and output path.\n');process.exitCode=1;}
finally{identity?.close();}
