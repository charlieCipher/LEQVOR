import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { validateReleaseConfig } from './scripts/check-release-config.mjs'
import { deploymentEnvironment } from './scripts/deployment-environment.mjs'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  let origins = [];
  // A direct `vite build` must not bypass the release environment gate. An
  // unconfigured local demo is allowed; hosted builds always require config.
  if (command === 'build' && (process.env.VERCEL || env.VITE_SUPABASE_URL)) {
    const issues = validateReleaseConfig(env, process.env);
    if (issues.length) throw new Error(issues.join('\n'));
    const deployment = deploymentEnvironment({...env,...process.env});
    origins = deployment.origins;
    const configPath = process.env.LEQVOR_VERCEL_CONFIG || 'vercel.json';
    const headers = JSON.parse(readFileSync(configPath, 'utf8')).headers;
    const csp = headers?.find(rule => rule.source === '/(.*)')?.headers?.find(header => header.key.toLowerCase() === 'content-security-policy')?.value;
    const connect = csp?.split(';').map(value => value.trim()).find(value => value.startsWith('connect-src '));
    const expected = `connect-src 'self' ${deployment.backend} ${deployment.backend.replace('https:', 'wss:')}`;
    if (connect !== expected) throw new Error('Deployment CSP must pin only the selected backend.');
  }
  return {plugins: [react()], define: {'import.meta.env.LEQVOR_ALLOWED_ORIGINS': JSON.stringify(origins)}};
})
