import {open,mkdir,realpath,link,unlink} from 'node:fs/promises';
import {readBoundedPublicFile} from './bounded-public-file.mjs';
import {randomUUID} from 'node:crypto';
import {isAbsolute,join} from 'node:path';
// Explicit local acceptance/export adapter. Not independent cloud storage and
// not a claim of provider Object Lock. No mutable "latest" pointer or deletion.
export async function localArchiveStore(directory){
 if(typeof directory!=='string'||!isAbsolute(directory))throw new Error('Explicit absolute archive directory required.');
 await mkdir(directory,{recursive:true});const root=await realpath(directory);
 function path(key){if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw new Error('Opaque archive digest required.');return join(root,`${key}.json`);}
 return Object.freeze({
  async putIfAbsent(key,bytes){
   if(!(bytes instanceof Uint8Array)||bytes.length>4194304)throw new Error('Bounded public archive bytes required.');
   const destination=path(key),temporary=join(root,`.pending-${randomUUID()}`),handle=await open(temporary,'wx',0o600);
   try{
    try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    try{await link(temporary,destination);return true;}catch(error){if(error.code==='EEXIST')return false;throw error;}
   }finally{await unlink(temporary);}
  },
  async get(key){return readBoundedPublicFile(path(key));},
 });
}
