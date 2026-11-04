const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const out = '/tmp/claude-0/-home-claude/21c9cfe3-56dc-5d1a-8863-0dc2785b5570/scratchpad';
const tag = process.argv[2] || 'before';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  const btn = (n) => page.locator(`button:has([aria-label="${n}"])`);
  await page.goto('http://127.0.0.1:8800/index.html?debug');
  await page.waitForTimeout(800);
  await btn('JUGAR TORNEIG').click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 6; i++) {
    await page.locator('button:has([aria-label="JUGAR PARTIT"]), button:has([aria-label="SIMULAR ARA"]), button:has([aria-label="CONTINUAR"]), button:has([aria-label="VEURE QUADRE"])').first().waitFor({ timeout: 60000 });
    if (await btn('JUGAR PARTIT').count()) break;
    if (await btn('CONTINUAR').count()) { await btn('CONTINUAR').click(); await page.waitForTimeout(500); continue; }
    await btn('SIMULAR ARA').click();
    await page.waitForTimeout(1500);
  }
  await btn('JUGAR PARTIT').click();
  await page.waitForTimeout(800);
  await page.keyboard.press('Space');
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${out}/cu-${tag}-full.png`, clip: { x: 320, y: 60, width: 640, height: 600 } });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/cu-${tag}-run.png`, clip: { x: 560, y: 440, width: 320, height: 240 } });
  await browser.close();
})();
