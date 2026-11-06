import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// This is a Node service: syntax-check its complete server module boundary.
// Build requires no production secrets and performs no network/SQL mutation.
for(const directory of [new URL('./',import.meta.url),new URL('../',import.meta.url)]){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  if(!entry.isFile()||!(/\.(mjs|js)$/.test(entry.name)))continue;
  const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL(entry.name,directory))],{stdio:'inherit'});
  if(result.status!==0)process.exit(1);
 }
}
process.stdout.write('Governance server syntax build passed.\n');
