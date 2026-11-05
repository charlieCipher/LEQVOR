import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

export async function checkBuild(directory) {
  const root = resolve(directory), issues = [];
  const files = [];
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = resolve(folder, entry.name);
      if (entry.isSymbolicLink()) issues.push(`Symlink in build: ${relative(root, path)}`);
      else if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  }
  await walk(root);
  for (const path of files) {
    const name = relative(root, path);
    if (/(^|[/\\])\.env(?:\.|$)|\.(?:map|pem|key)$/i.test(name)) issues.push(`Forbidden build file: ${name}`);
    if (!/\.(?:html|css)$/i.test(path)) continue;
    const source = await readFile(path, 'utf8');
    const references = path.endsWith('.css')
      ? [...source.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)].map(match => match[1])
      : [...source.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
    for (const reference of references) {
      if (/^(?:data:|blob:|#)/.test(reference)) continue;
      if (reference === 'https://scripts.simpleanalyticscdn.com/latest.js') continue;
      if (/^(?:[a-z]+:|\/\/)/i.test(reference)) {
        issues.push(`External resource reference in ${name}`);
        continue;
      }
      const clean = decodeURIComponent(reference.split(/[?#]/)[0]);
      const asset = resolve(clean.startsWith('/') ? root : dirname(path), clean.replace(/^\//, ''));
      const local = relative(root, asset);
      if (local === '..' || local.startsWith(`..${sep}`)) issues.push(`Resource escapes build directory in ${name}`);
      else if (!(await stat(asset).catch(() => null))?.isFile()) issues.push(`Missing local resource: ${local}`);
    }
  }
  const html = await readFile(resolve(root, 'index.html'), 'utf8').catch(() => '');
  if (!/<title>LEQVOR<\/title>/.test(html)) issues.push('Missing LEQVOR page title');
  const headers = await readFile(resolve(root, '_headers'), 'utf8').catch(() => '');
  if (!/script-src 'self'(?: https:\/\/scripts\.simpleanalyticscdn\.com)?;/.test(headers) || !headers.includes("frame-ancestors 'none'")) issues.push('Missing expected CSP directives');
  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const issues = await checkBuild('dist');
    if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
    else console.log('Build check passed: local HTML/CSS assets, title, header file and artifact exclusions.');
  } catch {
    console.error('Build check could not read dist. Run npm run build first.');
    process.exitCode = 1;
  }
}
