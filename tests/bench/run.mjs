// Banc de proves de renderitzat: node tests/bench/run.mjs  (cal servir tests/bench/dist amb http.server 8801)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const esbuild = require('/opt/npm-tools/node_modules/esbuild');
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
fs.mkdirSync('tests/bench/dist', { recursive: true });
await esbuild.build({ entryPoints: ['tests/bench/bench.ts'], bundle: true, outfile: 'tests/bench/dist/bench.js', format: 'iife', minify: false });
fs.writeFileSync('tests/bench/dist/index.html', '<!doctype html><body style="margin:0"><script src="bench.js"></script></body>');
const dpr = Number(process.argv[2] || 1);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dpr });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('file://' + process.cwd() + '/tests/bench/dist/index.html');
await page.waitForFunction('window.result', null, { timeout: 120000 });
console.log(`DPR ${dpr}`, JSON.stringify(await page.evaluate('window.result')));
await browser.close();
