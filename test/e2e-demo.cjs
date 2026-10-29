// 시연 페이지(서버 없는 체험 모드) E2E: 설정 → 목표 → 키오스크 주문 끝까지
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8787';
const OUT = process.env.SHOTS || '/tmp/myway-shots/'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text()) && console.log('console:', m.text()));
  await page.goto(`${BASE}/demo.html${process.env.STORE === 'restaurant' ? '' : ''}`);
  if (process.env.STORE === 'restaurant') await page.click('[data-store=restaurant]');
  await page.waitForTimeout(1200);
  const phone = page.frameLocator('#pf'), kf = page.frames().find((f) => f.url().includes('/kiosk/'));
  await page.evaluate(() => (document.getElementById('pf').contentWindow.__muted = true));
  // 설정 5문항
  for (const pick of [1, 1, 0, 0, 0]) { await phone.locator('#setup-c button').nth(pick).click(); await page.waitForTimeout(250); }
  await page.screenshot({ path: OUT + 'demo-qr.png' });
  await phone.locator('#v-qr [data-go=home]').click();
  await phone.locator('#v-home [data-go=goal]').click();
  await phone.locator('#goal-chips button').nth(process.env.STORE === 'restaurant' ? 2 : 0).click();
  await page.waitForTimeout(300);
  await phone.locator('#confirm-c button').first().click();
  const pfr = () => page.frames().find((f) => f.url().includes('demo=1'));
  const kfr = () => page.frames().find((f) => f.url().includes('/kiosk/'));
  let lastKey = '', n = 0;
  for (let i = 0; i < 80 && n < 20; i++) {
    await page.waitForTimeout(600);
    const last = await pfr().evaluate(() => window.__app.last && { action: window.__app.last.action, say: window.__app.last.say, target: window.__app.last.target, type: window.__app.last.screen?.type });
    if (!last) continue;
    const key = last.say + JSON.stringify(last.target) + last.type;
    if (key === lastKey) continue;
    lastKey = key; n++;
    console.log(n, last.type, last.action, '|', last.say);
    if (n === 3 || n === 5) await page.screenshot({ path: OUT + `demo-step-${n}.png` });
    if (last.action === 'done' || last.action === 'error') break;
    if (last.action === 'confirm_pay') { await phone.locator('#pay-yes').click(); continue; }
    if (last.action === 'insert_card') { await kfr().click('[data-act=insert]'); continue; }
    if (last.target) {
      const k = await kfr().evaluate(() => { const r = document.getElementById('kiosk').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      const box = last.target.box;
      await kfr().evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-act]')?.click(), [k.x + ((box[0] + box[2]) / 2000) * k.w, k.y + ((box[1] + box[3]) / 2000) * k.h]);
    }
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + 'demo-end.png' });
  await b.close();
})();
