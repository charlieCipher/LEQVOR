import {lstat,readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import process from 'node:process';
import {prepareRelease} from './prepare-release.mjs';
import {checkBuild} from './check-build.mjs';
import {readBoundedPublicFile} from '../governance/bounded-public-file.mjs';

const sha=/^[a-f0-9]{40}$/;
function exact(value,fields){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||fields.some(k=>!Object.hasOwn(value,k)))throw Error('Invalid candidate fields.');}
function validateContext(value,commit){
 exact(value,['domain','repository','commit','ref','workflow_ref','run_id','run_attempt']);
 if(!sha.test(commit)||value.domain!=='leqvor-build-context-v1'||value.repository!=='charlieCipher/LEQVOR'||value.commit!==commit||value.ref!=='refs/heads/main'||value.workflow_ref!=='charlieCipher/LEQVOR/.github/workflows/release-provenance.yml@refs/heads/main'||!['run_id','run_attempt'].every(k=>typeof value[k]==='string'&&/^[1-9][0-9]{0,19}$/.test(value[k])))throw Error('Candidate source or workflow differs.');
}
const json=async path=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedPublicFile(path,1048576)));
function validPath(path){return typeof path==='string'&&path.length<=512&&path.split('/').length<=16&&path.split('/').every(p=>/^[A-Za-z0-9_.-]+$/.test(p)&&p!=='.'&&p!=='..');}

// This checks local bytes against a manifest, not the authenticity of that
// manifest. Verify the GitHub attestation on the complete archive FIRST.
export async function verifyReleaseCandidate(directory,expectedCommit){
 const root=resolve(directory);
 if(!(await lstat(root)).isDirectory()||(await lstat(root)).isSymbolicLink())throw Error('Regular candidate directory required.');
 const entries=await readdir(root,{withFileTypes:true});
 if(entries.length!==3||entries.some(e=>e.isSymbolicLink()||!['dist','manifest.json','build-context.json'].includes(e.name)||(e.name==='dist'?!e.isDirectory():!e.isFile())))throw Error('Unexpected candidate layout.');
 const context=await json(join(root,'build-context.json'));validateContext(context,expectedCommit);
 const manifest=await json(join(root,'manifest.json'));exact(manifest,['format','created_at','files']);
 if(manifest.format!=='leqvor-build-manifest-v1'||!Number.isFinite(Date.parse(manifest.created_at))||new Date(manifest.created_at).toISOString()!==manifest.created_at||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>1024)throw Error('Invalid bounded candidate manifest.');
 const expected=new Map();
 for(const row of manifest.files){
  exact(row,['path','bytes','sha256']);
  if(!validPath(row.path)||expected.has(row.path)||!Number.isSafeInteger(row.bytes)||row.bytes<0||row.bytes>4194304||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Unsafe or duplicate candidate path.');
  expected.set(row.path,row);
 }
 let total=0,files=0,directories=0;const observed=new Set();
 async function walk(folder,prefix='',depth=0){
  if(depth>16||++directories>128)throw Error('Candidate capacity exceeded.');
  for(const entry of await readdir(folder,{withFileTypes:true})){
   const path=prefix+entry.name;if(!validPath(path)||entry.isSymbolicLink())throw Error('Unsafe candidate entry.');
   if(entry.isDirectory()){await walk(join(folder,entry.name),path+'/',depth+1);continue;}
   const row=expected.get(path);
   if(!entry.isFile()||!row||++files>1024)throw Error('Unexpected candidate file.');
   const bytes=await readBoundedPublicFile(join(folder,entry.name));total+=bytes.length;
   if(total>67108864||bytes.length!==row.bytes||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('Candidate bytes differ from manifest.');
   observed.add(path);
  }
 }
 await walk(join(root,'dist'));
 if(observed.size!==expected.size||(await checkBuild(join(root,'dist'))).length)throw Error('Candidate is incomplete or violates build policy.');
 return {commit:context.commit,files:observed.size,bytes:total,attestation_verified:false,deployment_authorized:false};
}
export async function prepareProvenanceCandidate(source,outputRoot,context){
 context=structuredClone(context);validateContext(context,context.commit);
 const candidate=await prepareRelease(source,outputRoot);
 await writeFile(join(candidate,'build-context.json'),JSON.stringify(context,null,2)+'\n',{flag:'wx'});
 await verifyReleaseCandidate(candidate,context.commit);return candidate;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [operation,directory,argument]=process.argv.slice(2);if(process.argv.length!==5)throw Error('Invalid arguments.');
  if(operation==='verify')console.log(JSON.stringify(await verifyReleaseCandidate(directory,argument)));
  else if(operation==='prepare'){
   if(process.env.GITHUB_ACTIONS!=='true')throw Error('Explicit GitHub build context required.');
   console.log(await prepareProvenanceCandidate(directory,argument,{domain:'leqvor-build-context-v1',repository:process.env.GITHUB_REPOSITORY,commit:process.env.GITHUB_SHA,ref:process.env.GITHUB_REF,workflow_ref:process.env.GITHUB_WORKFLOW_REF,run_id:process.env.GITHUB_RUN_ID,run_attempt:process.env.GITHUB_RUN_ATTEMPT}));
  }else throw Error('Unsupported operation.');
 }catch{console.error('Candidate provenance check failed. No deployment or founder activation performed.');process.exitCode=1;}
}
