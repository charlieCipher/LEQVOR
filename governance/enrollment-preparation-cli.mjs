import {writeFile} from 'node:fs/promises';
import process from 'node:process';
import {createEnrollmentPreparation,validateEnrollmentPreparation,recordEnrollmentEvidence,assessEnrollmentPreparation} from './enrollment-preparation.mjs';
import {readBoundedPublicFile} from './bounded-public-file.mjs';
const read=async path=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedPublicFile(path,65536)));
try{
 const [operation,...args]=process.argv.slice(2);let record,output;
 if(operation==='create'&&args.length===1){record=createEnrollmentPreparation();[output]=args;}
 else if(operation==='record'&&args.length===3){record=recordEnrollmentEvidence(await read(args[0]),await read(args[1]));output=args[2];}
 else if(operation==='inspect'&&args.length===1){record=await read(args[0]);validateEnrollmentPreparation(record);console.log(JSON.stringify(await assessEnrollmentPreparation(record)));}
 else throw Error('Explicit create/record/inspect arguments required.');
 if(output){await writeFile(output,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:'PREPARED',revision:record.revision,root_authority_active:false,activation_allowed:false}));}
}catch{console.error('Enrollment preparation rejected. No key, policy, datastore or authority changed.');process.exitCode=1;}
