// @vitest-environment node
import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

it('limits Simple Analytics to public routes and minimized metrics', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  expect(html).toContain('https://scripts.simpleanalyticscdn.com/latest.js');
  expect(html).toContain('data-ignore-pages="/app/*"');
  expect(html).toContain('data-ignore-metrics="referrer,utm,session,useragent,screensize,viewportsize,language,timeonpage,scrolled"');
});
