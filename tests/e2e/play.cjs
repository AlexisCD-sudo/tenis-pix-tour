const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const out = '/tmp/claude-0/-home-claude/21c9cfe3-56dc-5d1a-8863-0dc2785b5570/scratchpad';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('console.error', m.text()); });
  const btn = (n) => page.locator(`button:has([aria-label="${n}"])`);
  await page.goto('http://127.0.0.1:8800/index.html');
  await page.waitForTimeout(800);
  await btn('JUGAR TORNEIG').click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 6; i++) {
    await page.locator('button:has([aria-label="JUGAR PARTIT"]), button:has([aria-label="SIMULAR ARA"]), button:has([aria-label="CONTINUAR"]), button:has([aria-label="VEURE QUADRE"])').first().waitFor({ timeout: 60000 });
    if (await btn('JUGAR PARTIT').count()) break;
    if (await btn('CONTINUAR').count()) { await btn('CONTINUAR').click(); await page.waitForTimeout(500); continue; }
    await page.screenshot({ path: `${out}/s${i}.png` });
    await btn('SIMULAR ARA').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/s${i}b.png` });
  }
  await page.screenshot({ path: `${out}/10-bracket-human.png` });
  await btn('JUGAR PARTIT').click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/11-match.png` });
  // saca
  await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/12-serve.png` });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/13-ball.png` });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/14-after.png` });
  await browser.close();
})();
