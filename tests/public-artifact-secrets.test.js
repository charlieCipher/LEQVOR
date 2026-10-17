// @vitest-environment node
import {it,expect} from 'vitest';
import {Buffer} from 'node:buffer';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {containsServerCredential,checkBuild} from '../scripts/check-build.mjs';

async function removeFixture(folder){
 const target=resolve(folder);
 if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('leqvor-artifact-test-'))throw new Error('Unexpected fixture cleanup path.');
 await rm(target,{recursive:true,force:true});
}

it('blocks server credentials embedded in JavaScript without printing their values',async()=>{
 // Construct a nonfunctional canary at runtime so the fixture itself is not
 // mistaken for a deployed credential by repository push protection.
 const secret=['sb','secret','SYNTHETIC_PRIVATE_CANARY_123456'].join('_');
 const dir=await mkdtemp(join(tmpdir(),'leqvor-artifact-test-'));
 try {
  await writeFile(join(dir,'index.html'),'<title>LEQVOR</title>');
  await writeFile(join(dir,'_headers'),"script-src 'self'; frame-ancestors 'none'");
  await writeFile(join(dir,'index.js'),`const value="${secret}";`);
  const issues=await checkBuild(dir);
  expect(issues).toContain('Server credential detected in public artifact: index.js');
  expect(issues.join()).not.toContain(secret);
 }finally{await removeFixture(dir);}
});
it('distinguishes public keys and defensive prefix checks from concrete credentials',()=>{
 expect(containsServerCredential('key.startsWith("sb_secret_"); const key="sb_publishable_syntheticpublickey1234";')).toBe(false);
 const token=role=>`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({role,ref:'synthetic'})).toString('base64url')}.syntheticSignature`;
 expect(containsServerCredential(token('anon'))).toBe(false);
 for(const value of [token('service_role'),'-----BEGIN PRIVATE KEY-----','postgresql://user:SYNTHETIC@localhost/db'])
  expect(containsServerCredential(value)).toBe(true);
});
