// @vitest-environment node
import {it, expect, vi, afterEach} from 'vitest';
import {Buffer} from 'node:buffer';
import {deploymentEnvironment, serverBackend, PRODUCTION_BACKEND, PRODUCTION_ORIGIN} from '../scripts/deployment-environment.mjs';
import {validateReleaseConfig} from '../scripts/check-release-config.mjs';
import {browserBackendAllowed, authRedirect} from '../src/lib/backendEnvironment.js';
import {apiRequestBoundary} from '../scripts/api-request-boundary.mjs';
import {backendTransport} from '../scripts/backend-fetch.mjs';
import {scheduledCleanup} from '../scripts/scheduled-cleanup.mjs';
import {sharedFileDownload} from '../scripts/shared-file-download.mjs';

const staging = 'https://abcdefghijklmnopqrst.supabase.co';
const origin = 'https://leqvor-staging.example.com';
const env = {VERCEL:'1', VERCEL_ENV:'preview', LEQVOR_STAGING_SUPABASE_URL:staging,
  LEQVOR_STAGING_ORIGINS:JSON.stringify([origin]), SUPABASE_URL:staging,
  VITE_SUPABASE_URL:staging, VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_syntheticpublickey1234'};
const jwt = claims => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
afterEach(()=>vi.unstubAllEnvs());

it('all four hosted handlers reject cross-origin requests before service authentication',async()=>{
  for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
  for(const name of ['shared-file','trigger-review','security-history','verified-device']) {
    const handler=(await import(`../api/${name}.mjs`)).default;
    const response={setHeader:vi.fn(),status:vi.fn(()=>response),json:vi.fn()};
    await handler({method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:{}},response);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
    expect(response.json).toHaveBeenCalledWith({error:'Request origin denied.'});
  }
});

it('refuses inherited production configuration in previews before any backend call', async()=>{
  for(const extra of [{}, {LEQVOR_STAGING_SUPABASE_URL:PRODUCTION_BACKEND}, {VERCEL_TARGET_ENV:'production'}]) {
    const preview={...env,...extra,SUPABASE_URL:PRODUCTION_BACKEND,VITE_SUPABASE_URL:PRODUCTION_BACKEND};
    expect(validateReleaseConfig(preview).length).toBeGreaterThan(0);
    expect(serverBackend(preview)).toBe(null);
    const clientFactory=vi.fn();
    expect((await sharedFileDownload({method:'POST',authorization:'Bearer synthetic',body:{grant_id:'00000000-0000-4000-8000-000000000001',file_id:'00000000-0000-4000-8000-000000000002'},env:preview,clientFactory})).status).toBe(503);
    expect(clientFactory).not.toHaveBeenCalled();
    const run=vi.fn();
    const cleanup={...preview,CLEANUP_ENABLED:'true',CRON_SECRET:'synthetic-cron-secret-longer-than-32',SUPABASE_SERVICE_ROLE_KEY:'server-private'};
    expect((await scheduledCleanup({method:'GET',authorization:`Bearer ${cleanup.CRON_SECRET}`,env:cleanup,run})).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  }
});

it('requires a distinct staging project, exact origins and project-bound JWTs',()=>{
  expect(validateReleaseConfig(env)).toEqual([]);
  expect(serverBackend(env)).toBe(staging);
  expect(serverBackend({...env,SUPABASE_SERVICE_ROLE_KEY:jwt({ref:'awdsyhxdnyfilnzamflt',role:'service_role'})})).toBe(null);
  expect(validateReleaseConfig({...env,VITE_SUPABASE_PUBLISHABLE_KEY:jwt({role:'anon',ref:'awdsyhxdnyfilnzamflt',exp:9999999999})}).length).toBeGreaterThan(0);
  for(const value of ['[]',JSON.stringify([PRODUCTION_ORIGIN]),JSON.stringify(['https://*.example.com']),JSON.stringify([origin+'/callback']), '{}']) {
    expect(()=>deploymentEnvironment({...env,LEQVOR_STAGING_ORIGINS:value})).toThrow();
  }
  for(const mode of ['development','unreviewed'])expect(()=>deploymentEnvironment({...env,VERCEL_ENV:mode})).toThrow();
  expect(()=>deploymentEnvironment({...env,VERCEL_ENV:undefined})).toThrow();
  expect(()=>deploymentEnvironment({})).toThrow();
  expect(serverBackend({SUPABASE_URL:PRODUCTION_BACKEND})).toBe(null);
});

it('prevents copied production artifacts connecting from previews or local development',()=>{
  const configured={url:PRODUCTION_BACKEND,origin:PRODUCTION_ORIGIN,development:false};
  expect(browserBackendAllowed(configured)).toBe(true);
  for(const origin of ['https://preview.vercel.app','http://localhost:5173','https://leqvor.vercel.app.evil.example'])
    expect(browserBackendAllowed({...configured,origin})).toBe(false);
  expect(browserBackendAllowed({...configured,development:true,origin:'http://localhost:5173'})).toBe(false);
  expect(browserBackendAllowed({url:staging,origin,allowedOrigins:[origin]})).toBe(true);
  expect(browserBackendAllowed({url:staging,origin:PRODUCTION_ORIGIN,allowedOrigins:[origin]})).toBe(false);
  expect(browserBackendAllowed({url:'http://127.0.0.1:54321',origin:'http://localhost:5173',development:true})).toBe(true);
});

it('accepts only current-origin root authentication redirects',()=>{
  expect(authRedirect(PRODUCTION_ORIGIN,PRODUCTION_ORIGIN)).toBe(PRODUCTION_ORIGIN);
  for(const value of ['https://evil.example',PRODUCTION_ORIGIN+'/redirect?next=https://evil.example',PRODUCTION_ORIGIN+'/#token', 'https://user:CANARY@leqvor.vercel.app', '//evil.example']) {
    expect(()=>authRedirect(value,PRODUCTION_ORIGIN)).toThrow();
  }
});

it('enforces JSON, bounded bodies and exact request origins at the API boundary',()=>{
  const request={method:'POST',headers:{origin,'content-type':'application/json'},body:{id:'synthetic'}};
  expect(apiRequestBoundary(request,env)).toBe(null);
  expect(apiRequestBoundary({...request,headers:{'content-type':'application/json'}},env)).toBe(null);
  for(const changes of [{origin:'null'},{origin:PRODUCTION_ORIGIN},{origin:origin+'/'},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'},{'content-length':'32769'},{'content-length':'-1'}])
    expect(apiRequestBoundary({...request,headers:{...request.headers,...changes}},env).status).toBeGreaterThanOrEqual(400);
  expect(apiRequestBoundary({...request,body:{payload:'x'.repeat(32769)}},env).status).toBe(400);
  expect(apiRequestBoundary({...request,method:'GET'},env).status).toBe(405);
});

it('pins upstream requests, blocks redirects and combines a caller abort with one shared deadline',async()=>{
  const fetcher=vi.fn(async()=>new Response('{}'));
  const transport=backendTransport(staging,15000,fetcher),controller=new AbortController();
  for(const target of ['https://evil.example/','https://user:CANARY@abcdefghijklmnopqrst.supabase.co/'])
    expect(()=>transport.fetch(target)).toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await transport.fetch(staging+'/rest/v1/records',{signal:controller.signal,redirect:'follow'});
  expect(fetcher.mock.lastCall[1].redirect).toBe('error');
  controller.abort();
  expect(fetcher.mock.lastCall[1].signal.aborted).toBe(true);
  expect(transport.signal.aborted).toBe(false);
});
