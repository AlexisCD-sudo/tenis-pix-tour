// Prova al navegador: DPR (canvas nítid), menú de pausa amb opcions i selecció de 8 jugadors.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const out = process.argv[2] || '/tmp';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  let errs = 0;
  const run = async (name, ctxOpts, tap) => {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', name, e.message); });
    const btn = (n) => page.locator(`button:has([aria-label="${n}"])`);
    const click = (l) => (tap ? btn(l).tap() : btn(l).click());
    await page.goto('http://127.0.0.1:8800/index.html');
    await page.waitForTimeout(800);
    await click('SELECCIONAR JUGADOR');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${name}-select.png` });
    await click('ENRERE');
    await click('JUGAR TORNEIG');
    for (let i = 0; i < 8; i++) {
      await page.locator('button:has([aria-label="JUGAR PARTIT"]), button:has([aria-label="SIMULAR ARA"])').first().waitFor({ timeout: 60000 });
      if (await btn('JUGAR PARTIT').count()) break;
      await click('SIMULAR ARA');
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: `${out}/${name}-bracket.png` });
    await click('JUGAR PARTIT');
    await page.waitForTimeout(3000);
    const dims = await page.evaluate(() => { const c = document.querySelector('canvas.game-canvas'); return { bw: c.width, bh: c.height, cw: c.clientWidth, dpr: devicePixelRatio, ir: c.style.imageRendering }; });
    console.log(name, JSON.stringify(dims));
    await page.screenshot({ path: `${out}/${name}-match.png` });
    await page.keyboard.press('Escape').catch(() => {});
    if (!(await btn('OPCIONS').count())) await page.locator('button.iconbtn').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}-pause.png` });
    await click('OPCIONS');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${name}-pause-options.png` });
    await ctx.close();
  };
  await run('desk', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }, false);
  await run('mob', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, true);
  console.log(errs === 0 ? 'OK 0 errors' : `FAIL ${errs}`);
  await browser.close();
  process.exit(errs ? 1 : 0);
})();
