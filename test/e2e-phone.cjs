// 폰 앱 + 연동 키오스크 E2E: 폰이 안내한 버튼을 키오스크에서 그대로 눌러 주문 끝까지 가는지
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8787';
const OUT = process.env.SHOTS || '/tmp/myway-shots/'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const kctx = await b.newContext({ viewport: { width: 540, height: 960 } });
  const kiosk = await kctx.newPage();
  kiosk.on('pageerror', (e) => console.log('kiosk error:', e.message));
  await kiosk.goto(`${BASE}/kiosk/${process.env.STORE || 'cafe'}.html`);
  const kid = process.env.STORE === 'restaurant' ? 'rest-01' : 'cafe-01';
  const pctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera', 'microphone'], deviceScaleFactor: 2 });
  await pctx.addInitScript(() => localStorage.setItem('myway.profile.v1', JSON.stringify({ v: 1, rate: 0.9, vision: 'normal', experience: 'first', skipPoints: true, noUpsell: true, plain: true })));
  const phone = await pctx.newPage();
  phone.on('pageerror', (e) => console.log('phone error:', e.message));
  await phone.goto(`${BASE}/?k=${kid}`);
  await phone.waitForTimeout(800);
  await phone.screenshot({ path: OUT + 'p-goal.png' });
  await phone.fill('#goal-text', process.env.GOAL || '차가운 아메리카노 한 잔 가져갈게');
  await phone.click('#goal-send');
  await phone.waitForTimeout(600);
  await phone.screenshot({ path: OUT + 'p-confirm.png' });
  await phone.click('#confirm-c button');
  let lastKey = '', n = 0;
  for (let i = 0; i < 60 && n < 18; i++) {
    await phone.waitForTimeout(700);
    const last = await phone.evaluate(() => window.__app.last && { action: window.__app.last.action, say: window.__app.last.say, target: window.__app.last.target, type: window.__app.last.screen?.type, t: Date.now() });
    if (!last) continue;
    const key = last.say + JSON.stringify(last.target) + last.type;
    if (key === lastKey) continue;
    lastKey = key; n++;
    console.log(n, last.type, last.action, '|', last.say);
    await phone.screenshot({ path: OUT + `p-step-${String(n).padStart(2, '0')}.png` });
    await kiosk.screenshot({ path: OUT + `k-step-${String(n).padStart(2, '0')}.png` });
    if (last.action === 'done') break;
    if (last.action === 'confirm_pay') { await phone.click('#pay-yes'); continue; }
    if (last.action === 'insert_card') { await kiosk.evaluate(() => document.querySelector('[data-act=insert]').click()); continue; }
    if (last.target) {
      const box = last.target.box, k = await kiosk.locator('#kiosk').boundingBox();
      await kiosk.mouse.click(k.x + ((box[0] + box[2]) / 2000) * k.width, k.y + ((box[1] + box[3]) / 2000) * k.height);
    }
  }
  await phone.waitForTimeout(800);
  await phone.screenshot({ path: OUT + 'p-end.png' });
  await b.close();
})();
