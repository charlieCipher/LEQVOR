import {writeFile} from 'node:fs/promises';
import {readBoundedPublicFile} from './bounded-public-file.mjs';
import {localArchiveStore} from './file-archive-store.mjs';
import {retainGovernanceArchive,restoreGovernanceArchive} from './archive.mjs';
async function json(path){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedPublicFile(path)));}
try{
 const [operation,...args]=process.argv.slice(2);
 if(operation==='retain'&&args.length===5){
  const [policy,snapshot,checkpoint_packet,anchor]=await Promise.all(args.slice(0,4).map(json));
  const head=await retainGovernanceArchive({store:await localArchiveStore(args[4]),policy,snapshot,checkpoint_packet,anchor});
  console.log(JSON.stringify(head)); // Public metadata only; retain independently.
 }else if(operation==='restore'&&args.length===5){
  const [policy,anchor]=await Promise.all(args.slice(0,2).map(json)),store=await localArchiveStore(args[3]);
  const bytes=await store.get(args[2]),restored=restoreGovernanceArchive(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),{policy,anchor,expectedHash:args[2]});
  await writeFile(args[4],JSON.stringify({policy,checkpoint:restored.checkpoint,state:restored.snapshot},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Verified public restore file saved. No database, root pin or authority changed.');
 }else throw new Error('Usage: retain <policy> <snapshot> <signed-checkpoint> <independent-parent-anchor> <absolute-directory>, or restore <policy> <independent-parent-anchor> <retained-digest> <absolute-directory> <new-output>');
}catch{console.error('Archive operation rejected. Check public inputs, independent pins, storage and new output path.');process.exitCode=1;}
