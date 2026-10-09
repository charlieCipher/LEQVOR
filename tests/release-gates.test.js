// @vitest-environment node
import { it,expect,vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { validateReleaseConfig } from '../scripts/check-release-config.mjs';
import { inspectHeaders,checkDeployment } from '../scripts/check-deployment.mjs';
import { readFile } from 'node:fs/promises';
const valid = {VITE_SUPABASE_URL:'https://awdsyhxdnyfilnzamflt.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_syntheticpublickey1234'};
it('allows only a boolean-string public passkey pilot flag',()=>{
 for(const flag of ['true','false'])expect(validateReleaseConfig({...valid,VITE_ENABLE_PASSKEYS:flag})).toEqual([]);
 const issues=validateReleaseConfig({...valid,VITE_ENABLE_PASSKEYS:'PRIVATE_CANARY'});expect(issues.length).toBeGreaterThan(0);expect(issues.join()).not.toContain('PRIVATE_CANARY');
});
it('accepts documented Vercel build metadata without allowing arbitrary prefixed secrets',()=>{
  expect(validateReleaseConfig({...valid,VITE_VERCEL_ENV:'production',
    VITE_VERCEL_URL:'aureva-example.vercel.app',VITE_VERCEL_GIT_COMMIT_SHA:'abc123',
    VITE_VERCEL_PROJECT_PRODUCTION_URL:'app.leqvor.com'})).toEqual([]);
  for (const name of ['VITE_VERCEL_SECRET','VITE_VERCEL_TOKEN','VITE_VERCEL_OIDC_TOKEN']) {
    const issues=validateReleaseConfig({...valid,[name]:'CANARY'});
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join()).not.toContain('CANARY');
  }
});
it('blocks privileged credentials and unexpected browser environment values',()=>{
  expect(validateReleaseConfig(valid)).toEqual([]);
  const jwt = `e30.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.signature`;
  for (const change of [{VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_CANARY'},{VITE_SUPABASE_ANON_KEY:jwt},{VITE_PRIVATE_SECRET:'CANARY'},{VITE_SUPABASE_URL:'http://localhost:54321'},{VITE_SUPABASE_URL:valid.VITE_SUPABASE_URL+'/?token=CANARY'}]) {
    const result=validateReleaseConfig({...valid,...change}); expect(result.length).toBeGreaterThan(0); expect(result.join()).not.toContain('CANARY');
  }
});
it('rejects absent and expired configuration',()=>{
  expect(validateReleaseConfig({}).length).toBeGreaterThan(0);
  const key=`e30.${Buffer.from(JSON.stringify({role:'anon',exp:1})).toString('base64url')}.signature`;
  expect(validateReleaseConfig({...valid,VITE_SUPABASE_PUBLISHABLE_KEY:key}).length).toBeGreaterThan(0);
});
it('checks enforced headers, not report-only CSP',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  const headers=new Headers(config.headers[0].headers.map(({key,value})=>[key,value]));
  expect(inspectHeaders(headers)).toEqual([]);
  const staticHeaders=await readFile(new URL('../public/_headers',import.meta.url),'utf8');
  expect(staticHeaders).toContain(headers.get('content-security-policy'));
  headers.set('content-security-policy-report-only',headers.get('content-security-policy'));
  headers.delete('content-security-policy');
  expect(inspectHeaders(headers).length).toBeGreaterThan(0);
});
it('rejects unsafe script directives and short HSTS',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  const headers=new Headers(config.headers[0].headers.map(({key,value})=>[key,value]));
  headers.set('content-security-policy',headers.get('content-security-policy').replace("script-src 'self'","script-src 'self' 'unsafe-eval'"));
  headers.set('strict-transport-security','max-age=0');
  expect(inspectHeaders(headers)).toContain('Missing or incorrect CSP script-src');
  expect(inspectHeaders(headers)).toContain('HSTS must cover at least one year');
});
it('rejects redirect-only deployments and credential-bearing targets',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:302}));
  expect((await checkDeployment('https://example.invalid',fetcher)).length).toBe(2);
  expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
  fetcher.mockClear();
  await expect(checkDeployment('https://user:secret@example.invalid',fetcher)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
