// Ús: node tests/visual/sheet.cjs <sortida.png> [jugador] [escala]
const { createRequire } = require('node:module');
const req = createRequire(__filename);
const esbuild = req('/opt/npm-tools/node_modules/esbuild');
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const out = process.argv[2] || '/tmp/sheet.png';
const pl = process.argv[3] || '1', sc = process.argv[4] || '46';
(async () => {
  const dir = path.join(__dirname, '.build'); fs.mkdirSync(dir, { recursive: true });
  await esbuild.build({ entryPoints: [path.join(__dirname, 'sheet.ts')], bundle: true, outfile: path.join(dir, 'sheet.js'), format: 'iife', target: 'es2022' });
  fs.copyFileSync(path.join(__dirname, 'sheet.html'), path.join(dir, 'sheet.html'));
  const srv = http.createServer((q, r) => { const f = path.join(dir, q.url.split('?')[0].replace(/^\//, '') || 'sheet.html'); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); } else { r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'text/html'); r.end(d); } }); }).listen(8811);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 1500, height: 1400 } });
  pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await pg.goto(`http://127.0.0.1:8811/sheet.html?p=${pl}&s=${sc}`);
  await pg.waitForFunction('window.ready===true', null, { timeout: 15000 });
  await pg.locator('#c').screenshot({ path: out });
  await b.close(); srv.close();
})();
