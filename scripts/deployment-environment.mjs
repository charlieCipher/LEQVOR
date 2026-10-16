// Server/build configuration only. Never expose process.env or server keys to Vite.
export const PRODUCTION_BACKEND = 'https://awdsyhxdnyfilnzamflt.supabase.co';
export const PRODUCTION_ORIGIN = 'https://leqvor.vercel.app';

export function cleanOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname.includes('*') || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid deployment origin.');
  return url.origin;
}

export function deploymentEnvironment(env) {
  const mode = env.VERCEL_TARGET_ENV || env.VERCEL_ENV || env.VITE_VERCEL_TARGET_ENV || env.VITE_VERCEL_ENV;
  if (env.VERCEL_ENV === 'preview' && mode !== 'preview') throw new Error('Conflicting hosting environment.');
  if (env.VERCEL === '1' && !env.VERCEL_ENV) throw new Error('Missing hosting environment.');
  if (mode === 'production') return {mode, backend: PRODUCTION_BACKEND, origins: [PRODUCTION_ORIGIN]};
  if (mode !== 'preview') throw new Error('Unreviewed hosting environment.');
  const backend = cleanOrigin(env.LEQVOR_STAGING_SUPABASE_URL);
  if (!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(backend) || backend === PRODUCTION_BACKEND)
    throw new Error('Preview requires a separate staging Supabase project.');
  // Explicit exact URLs only: no wildcard previews and no production callbacks.
  const values = JSON.parse(env.LEQVOR_STAGING_ORIGINS || '[]');
  if (!Array.isArray(values) || !values.length || values.length > 10) throw new Error('Staging origins required.');
  const origins = [...new Set(values.map(cleanOrigin))];
  if (origins.includes(PRODUCTION_ORIGIN)) throw new Error('Production origin cannot be a staging origin.');
  return {mode, backend, origins};
}

export function serverBackend(env) {
  try {
    const deployment = deploymentEnvironment(env);
    if (env.SUPABASE_URL !== deployment.backend) return null;
    // Old anon/service JWTs carry a project ref. Opaque new keys are checked by
    // Supabase itself; their reference cannot be derived locally.
    for (const key of [env.VITE_SUPABASE_ANON_KEY, env.VITE_SUPABASE_PUBLISHABLE_KEY, env.SUPABASE_SERVICE_ROLE_KEY]) {
      if (typeof key === 'string' && key.split('.').length === 3) {
        const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
        if (claims.ref !== new URL(deployment.backend).hostname.split('.')[0]) return null;
      }
    }
    return deployment.backend;
  } catch { return null; }
}
