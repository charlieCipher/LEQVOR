import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join,delimiter} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const base=resolve('.local-release/founder-tools/android-keyattestation'),out=resolve('.local-release/founder-attestation-verifier');
const commit='621149c4ebaeeea844d6f43098687c73c4d370a3';
function run(program,args){const result=spawnSync(program,args,{encoding:'utf8',windowsHide:true,maxBuffer:2097152});if(result.status!==0)throw new Error(result.stderr||'Verifier build failed');return result.stdout;}
if(run('git',['-C',base,'rev-parse','HEAD']).trim()!==commit||run('git',['-C',base,'status','--porcelain']).trim())throw new Error('Clean pinned upstream source required.');
await mkdir(join(out,'deps'),{recursive:true});
const runtime=[
 ['androidx.annotation','annotation-jvm','1.9.1','google'],['co.nstant.in','cbor','0.9'],['com.google.code.gson','gson','2.11.0'],
 ['com.google.errorprone','error_prone_annotations','2.41.0'],['com.google.protobuf','protobuf-javalite','4.28.3'],['com.google.protobuf','protobuf-kotlin-lite','4.28.3'],
 ['org.bouncycastle','bcpkix-jdk18on','1.78.1'],['org.bouncycastle','bcprov-jdk18on','1.78.1'],['org.bouncycastle','bcutil-jdk18on','1.78.1'],
 ['org.jetbrains.kotlin','kotlin-stdlib','2.2.0'],['org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm','1.10.2'],['org.jetbrains.kotlinx','kotlinx-coroutines-guava','1.10.2'],
 ['com.google.guava','guava','33.5.0-jre'],['com.google.guava','failureaccess','1.0.3'],['org.jspecify','jspecify','1.0.0'],['org.jetbrains','annotations','13.0'],
];
const compiler=[['org.jetbrains.kotlin','kotlin-compiler-embeddable','2.2.20'],['org.jetbrains.kotlin','kotlin-stdlib','2.2.20'],['org.jetbrains.kotlin','kotlin-script-runtime','2.2.20'],['org.jetbrains.kotlin','kotlin-reflect','1.6.10'],['org.jetbrains.kotlin','kotlin-daemon-embeddable','2.2.20'],['org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm','1.8.0'],['org.jetbrains','annotations','13.0']];
const locked=JSON.parse(await readFile('governance/attestation/dependencies.lock.json','utf8'));
const artifacts={};
async function artifact([group,name,version,repository]){
 const coordinate=`${group}:${name}:${version}`,file=`${name}-${version}.jar`,path=join(out,'deps',file);
 const url=`${repository==='google'?'https://dl.google.com/dl/android/maven2':'https://repo.maven.apache.org/maven2'}/${group.replaceAll('.','/')}/${name}/${version}/${file}`;
 let bytes;try{bytes=await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Artifact unavailable: ${coordinate}`);const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>83886080)throw new Error('Artifact capacity exceeded');chunks.push(chunk);}bytes=Buffer.concat(chunks);}
 const sha256=createHash('sha256').update(bytes).digest('hex');if(locked.artifacts[coordinate]?.sha256!==sha256||locked.artifacts[coordinate]?.url!==url)throw new Error(`Artifact digest/source differs: ${coordinate}`);
 artifacts[coordinate]={url,sha256};await writeFile(path,bytes);return path;
}
const runtimePaths=await Promise.all(runtime.map(artifact)),compilerPaths=await Promise.all(compiler.map(artifact));
if(locked.upstream_commit!==commit||Object.keys(locked.artifacts).length!==Object.keys(artifacts).length)throw new Error('Upstream source/artifact lock differs');
const roots=JSON.parse(await readFile(join(base,'roots.json'),'utf8'));
const generated=join(out,'GoogleTrustAnchors.kt');await writeFile(generated,`package com.android.keyattestation.verifier\nimport java.security.cert.TrustAnchor\nimport com.google.gson.Gson\nobject GoogleTrustAnchors : () -> Set<TrustAnchor> { override fun invoke():Set<TrustAnchor> = Gson().fromJson(${JSON.stringify(JSON.stringify(roots))},Array<String>::class.java).map { TrustAnchor(it.asX509Certificate(),null) }.toSet() }\n`);
async function sources(dir){let result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())result.push(...await sources(path));else if(entry.name.endsWith('.kt'))result.push(path);}return result;}
const java='C:/Program Files/Android/Android Studio/jbr/bin/java.exe';
run(java,['-cp',compilerPaths.join(delimiter),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-jvm-target','17','-classpath',runtimePaths.join(delimiter),'-d',join(out,'verifier.jar'),...await sources(join(base,'src/main/kotlin')),generated,resolve('governance/attestation/Review.kt')]);
await writeFile(join(out,'runtime-classpath.json'),JSON.stringify([join(out,'verifier.jar'),...runtimePaths]));
console.log('Pinned off-device verifier compiled. No enrollment, listener, phone key change or activation.');
