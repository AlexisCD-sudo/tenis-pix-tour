const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const out = '/tmp/claude-0/-home-claude/21c9cfe3-56dc-5d1a-8863-0dc2785b5570/scratchpad';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  const btn = (n) => page.locator(`button:has([aria-label="${n}"])`);
  await page.goto('http://127.0.0.1:8800/index.html');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/m1-menu.png` });
  await btn('JUGAR TORNEIG').tap();
  await page.waitForTimeout(500);
  for (let i = 0; i < 6; i++) {
    await page.locator('button:has([aria-label="JUGAR PARTIT"]), button:has([aria-label="SIMULAR ARA"])').first().waitFor({ timeout: 60000 });
    if (await btn('JUGAR PARTIT').count()) break;
    await btn('SIMULAR ARA').tap();
    await page.waitForTimeout(1500);
  }
  await btn('JUGAR PARTIT').tap();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/m2-match.png` });
  await browser.close();
})();
