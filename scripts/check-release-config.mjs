import { loadEnv } from 'vite';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

export function validateReleaseConfig(env) {
  const issues = [];
  // Vercel injects these documented public build identifiers for Vite deployments.
  // Keep exact names: accepting every VITE_VERCEL_* could expose credentials.
  const allowed = new Set([
    'VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_ENABLE_PASSKEYS',
    ...['ENV','TARGET_ENV','URL','BRANCH_URL','PROJECT_PRODUCTION_URL','HASH_SALT',
      'GIT_PROVIDER','GIT_REPO_SLUG','GIT_REPO_OWNER','GIT_REPO_ID','GIT_COMMIT_REF',
      'GIT_COMMIT_SHA','GIT_COMMIT_MESSAGE','GIT_COMMIT_AUTHOR_LOGIN',
      'GIT_COMMIT_AUTHOR_NAME','GIT_PULL_REQUEST_ID'].map(name => `VITE_VERCEL_${name}`),
  ]);
  const unexpected = Object.keys(env).filter(name => name.startsWith('VITE_') && !allowed.has(name));
  if (unexpected.length)
    issues.push(`Unexpected browser-exposed environment variable. Review the explicit allowlist: ${unexpected.map(name => /^VITE_[A-Z0-9_]{1,80}$/.test(name) ? name : '[invalid name]').join(', ')}`);
  if(env.VITE_ENABLE_PASSKEYS!==undefined&&!['true','false'].includes(env.VITE_ENABLE_PASSKEYS))issues.push('Passkey pilot flag must be exactly true or false.');
  try {
    const url = new URL(env.VITE_SUPABASE_URL?.trim());
    if (url.protocol !== 'https:' || !/^[a-z]{20}\.supabase\.co$/.test(url.hostname) ||
      url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      issues.push('Production Supabase URL must be a clean HTTPS project origin.');
    if (url.hostname !== 'awdsyhxdnyfilnzamflt.supabase.co')
      issues.push('Backend origin does not match the reviewed deployment CSP. Update both deliberately for another environment.');
  } catch { issues.push('Production Supabase URL is missing or invalid.'); }
  const keys = [env.VITE_SUPABASE_ANON_KEY,env.VITE_SUPABASE_PUBLISHABLE_KEY].filter(Boolean);
  if (!keys.length) issues.push('A public Supabase application key is required.');
  for (const candidate of keys) {
    const key = candidate.trim();
    if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) continue;
    try {
      if (key.split('.').length !== 3) throw new Error();
      const payload = JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());
      if (payload.role !== 'anon' || (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now())) throw new Error();
    } catch { issues.push('Only a public publishable key or unexpired anon JWT may enter the browser build.'); }
  }
  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const issues = validateReleaseConfig(loadEnv('production',process.cwd(),'VITE_'));
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
  else console.log('Release configuration passed (values suppressed).');
}
