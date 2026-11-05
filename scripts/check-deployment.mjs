// Read-only deployment acceptance. Does not send account tokens or follow redirects.
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export function inspectHeaders(headers) {
  const issues = [];
  for (const [name,value] of [['x-content-type-options','nosniff'],['x-frame-options','DENY'],['referrer-policy','no-referrer'],['cross-origin-opener-policy','same-origin']]) {
    if (headers.get(name)?.toLowerCase() !== value.toLowerCase()) issues.push(`Missing or incorrect ${name}`);
  }
  const directives = new Map((headers.get('content-security-policy') || '').split(';').map(part=>{
    const [name,...values] = part.trim().split(/\s+/); return [name,values.join(' ')];
  }));
  for (const [name,value] of [['default-src',"'self'"],['script-src',"'self' https://scripts.simpleanalyticscdn.com"],['object-src',"'none'"],['frame-src',"'none'"],['frame-ancestors',"'none'"],['base-uri',"'none'"],['form-action',"'self'"]]) {
    if (directives.get(name) !== value) issues.push(`Missing or incorrect CSP ${name}`);
  }
  const hsts = headers.get('strict-transport-security') || '';
  if (directives.get('connect-src') !== "'self' https://awdsyhxdnyfilnzamflt.supabase.co wss://awdsyhxdnyfilnzamflt.supabase.co https://queue.simpleanalyticscdn.com") issues.push('CSP connect-src does not match the reviewed backend and analytics queue');
  if (Number(hsts.match(/(?:^|;)\s*max-age=(\d+)/i)?.[1] || 0) < 31536000) issues.push('HSTS must cover at least one year');
  const policy = headers.get('permissions-policy') || '';
  for (const name of ['camera','microphone','geolocation']) if (!new RegExp(`(?:^|,)\\s*${name}=\\(\\)`).test(policy)) issues.push(`Missing denied ${name} permission`);
  return issues;
}

export async function checkDeployment(target,fetcher=fetch) {
  const origin = new URL(target);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Provide a clean HTTPS deployment origin.');
  const issues = [];
  for (const path of ['/auth','/app/vault']) {
    const response = await fetcher(new URL(path,origin),{redirect:'manual',signal:AbortSignal.timeout(20000)});
    if (response.status !== 200) { issues.push(`${path}: expected HTTP 200; authentication walls and redirects must be checked separately`); continue; }
    issues.push(...inspectHeaders(response.headers).map(issue=>`${path}: ${issue}`));
    if (!response.headers.get('content-type')?.includes('text/html')) issues.push(`${path}: missing HTML content type`);
    const html = await response.text();
    if (!/<title>LEQVOR<\/title>/.test(html)) issues.push(`${path}: missing LEQVOR shell`);
  }
  return issues;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error();
    const issues = await checkDeployment(process.argv[2]);
    if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
    else console.log('PASS deployed HTTPS routes and security headers. Authenticated workflows still require live acceptance.');
  } catch { console.error('Deployment check could not complete. Supply an accessible HTTPS origin; no credentials are accepted.'); process.exitCode = 1; }
}
