// Prova d'extrem a extrem: torneig sencer (?autosim) fins a la cerimònia del campió, sense errors de pàgina.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const out = process.argv[2] || '/tmp';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  let errs = 0;
  page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message); });
  const btn = (n) => page.locator(`button:has([aria-label="${n}"])`);
  await page.goto('http://127.0.0.1:8800/index.html?autosim=1');
  await page.waitForTimeout(800);
  await btn('JUGAR TORNEIG').click();
  await btn('MENÚ PRINCIPAL').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/t2-champion.png` });
  await btn('QUADRE FINAL').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/t3-final-bracket.png` });
  console.log(errs === 0 ? 'OK: torneig complet fins al campió, 0 errors' : `FAIL: ${errs} errors`);
  await browser.close();
  process.exit(errs ? 1 : 0);
})();
