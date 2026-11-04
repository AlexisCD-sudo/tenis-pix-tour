const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const out = '/tmp/claude-0/-home-claude/21c9cfe3-56dc-5d1a-8863-0dc2785b5570/scratchpad';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  let errs = 0;
  page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message); });
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
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/v1-vs.png` });
  const t0 = await page.evaluate(() => window.__match && window.__match.time);
  await page.waitForTimeout(1200);
  const t1 = await page.evaluate(() => window.__match && window.__match.time);
  console.log('match time frozen during VS:', t0 === t1);
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/v2-after-vs.png` });
  await page.evaluate(() => { window.__match.meter = [1, 1]; });
  // jugar: serveix i mou
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(260);
    if (i === 14 || i === 24 || i === 33) await page.screenshot({ path: `${out}/v3-play-${i}.png` });
  }
  console.log('meter', await page.evaluate(() => window.__match.meter), 'errors', errs);
  await browser.close();
})();
