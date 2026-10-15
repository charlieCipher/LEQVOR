// @vitest-environment node
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { checkBuild } from '../scripts/check-build.mjs';
const folders = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, {recursive:true,force:true}))); });
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), 'leqvor-build-')); folders.push(path);
  await writeFile(join(path,'index.html'), '<title>LEQVOR</title><link href="/style.css" rel="stylesheet">');
  await writeFile(join(path,'style.css'), 'body{background:url(/scene.png)}');
  await writeFile(join(path,'scene.png'), 'fixture');
  await writeFile(join(path,'_headers'), "Content-Security-Policy: script-src 'self'; frame-ancestors 'none'");
  return path;
}
it('accepts a self-contained build', async () => { expect(await checkBuild(await fixture())).toEqual([]); });
it('rejects a missing scenic asset and external resource', async () => {
  const path=await fixture(); await rm(join(path,'scene.png'));
  await writeFile(join(path,'index.html'), '<title>LEQVOR</title><script src="https://example.invalid/tracker.js"></script>');
  expect(await checkBuild(path)).toEqual(expect.arrayContaining(['Missing local resource: scene.png','External resource reference in index.html']));
});
it('rejects accidentally packaged environment files and source maps without printing contents', async () => {
  const path=await fixture(); await writeFile(join(path,'.env'), 'PRIVATE_CANARY'); await writeFile(join(path,'bundle.js.map'),'PRIVATE_CANARY');
  const issues=await checkBuild(path);
  expect(issues).toHaveLength(2); expect(issues.join(' ')).not.toContain('PRIVATE_CANARY');
});
it('rejects founder-control source, local evidence and publisher material in the customer build',async()=>{
 const path=await fixture();for(const directory of ['governance','.local-release']){await mkdir(join(path,directory));await writeFile(join(path,directory,'public-packet.json'),'PUBLIC_FIXTURE_NOT_CUSTOMER_ASSET');}await writeFile(join(path,'publisher.p12'),'SYNTHETIC_PUBLISHER_CANARY');
 const issues=await checkBuild(path);expect(issues.filter(x=>x.startsWith('Forbidden build file:'))).toHaveLength(3);expect(issues.join(' ')).not.toContain('CANARY');
});
