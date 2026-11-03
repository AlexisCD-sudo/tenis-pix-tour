const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => console.log('console', m.text()));
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForFunction('window.ready === true', null, { timeout: 15000 });
  const times = [1.0, 0.5, 1.5, 4];
  let i = 0;
  for (const t of times) {
    await page.evaluate((t) => window.advance(t), t);
    await page.screenshot({ path: `/tmp/shot${i}.png` });
    console.log(i, await page.evaluate(() => window.state()));
    i++;
  }
  await browser.close();
})();
