const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const out = process.argv[2] || '/tmp/claude-0/-home-claude/21c9cfe3-56dc-5d1a-8863-0dc2785b5570/scratchpad';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text()); });
  await page.goto('http://127.0.0.1:8800/index.html');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/01-menu.png` });
  await page.getByText('JUGAR TORNEIG').first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/02-after-play.png` });
  console.log('body text:', (await page.locator('body').innerText()).slice(0, 300).replace(/\n/g, ' | '));
  await browser.close();
  console.log('errors', errs.length);
})();
