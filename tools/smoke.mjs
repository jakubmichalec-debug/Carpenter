// Load every page in Chromium, fail on console errors, page errors or horizontal overflow,
// and save screenshots to screenshots/. Starts its own dev server on PORT (default 5190).
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT || '5190';
const base = `http://localhost:${port}`;
const pages = readdirSync(join(root, 'site')).filter(f => f.endsWith('.html') && !f.startsWith('_'));
const viewports = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }];
const outDir = join(root, 'screenshots');
mkdirSync(outDir, { recursive: true });

const server = spawn('python3', [join(root, 'tools/dev_server.py')], { env: { ...process.env, PORT: port }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
let failures = 0;
try {
  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    for (const file of pages) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(`${base}/${file}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await page.screenshot({ path: join(outDir, `${file.replace('.html', '')}-${vp.name}.png`) });
      const bad = errors.length > 0 || overflow > 1;
      if (bad) failures++;
      console.log(`${bad ? 'FAIL' : 'ok  '} ${vp.name.padEnd(7)} ${file}${overflow > 1 ? ` overflow=${overflow}px` : ''}`);
      for (const e of errors) console.log(`       ${e}`);
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);
