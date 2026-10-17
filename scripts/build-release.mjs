import process from 'node:process';
import { build, loadEnv } from 'vite';
import { validateReleaseConfig } from './check-release-config.mjs';
import { checkBuild } from './check-build.mjs';

// Vercel injects this even with system-variable exposure disabled. LEQVOR
// does not use client observability; remove it before Vite reads the build env.
delete process.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG;
const issues = validateReleaseConfig(loadEnv('production', process.cwd(), 'VITE_'), process.env);
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  await build();
  const outputIssues = await checkBuild('dist');
  if (outputIssues.length) {
    console.error(outputIssues.join('\n'));
    process.exitCode = 1;
  } else console.log('Release build and artifact checks passed.');
}
