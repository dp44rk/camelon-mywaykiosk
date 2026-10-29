// 문서·목업용 고해상도 화면 캡처 (시연 모드, 서버 필요 없음 — 정적 서버만)
// 사용: BASE=http://localhost:8790 node scripts/screens.cjs
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8787';
const OUT = process.env.OUT || require('path').join(__dirname, '..', 'docs', 'img', 'raw') + '/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demo.html`);
  await page.waitForTimeout(1200);
  const pf = () => page.frames().find((f) => f.url().includes('demo=1'));
  const kf = () => page.frames().find((f) => f.url().includes('/kiosk/'));
  await pf().evaluate(() => (window.__muted = true));
  // 폰은 따로 고해상도로 찍기 위해 같은 출처의 새 창(BroadcastChannel 공유)에서 연다
  const phoneCtx = ctx; // 같은 컨텍스트여야 BroadcastChannel이 통한다
  const phone = await phoneCtx.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`${BASE}/?demo=1&k=cafe-01`);
  await phone.evaluate(() => (window.__muted = true));
  await phone.waitForTimeout(500);
  const shot = async (p, name, opts = {}) => p.screenshot({ path: OUT + name + '.png', ...opts });
  // 고해상도: 같은 페이지를 deviceScaleFactor 3으로 다시 찍기 어렵기 때문에 CSS zoom 대신 별도 컨텍스트 사용 안 함 → 2배 확대 스크린샷
  await shot(phone, 'phone-1-setup');
  for (const pick of [1, 0, 0, 0, 0]) { await phone.locator('#setup-c button').nth(pick).click(); await phone.waitForTimeout(200); }
  await shot(phone, 'phone-2-qr');
  await phone.locator('#v-qr [data-go=home]').click();
  await shot(phone, 'phone-0-home');
  await phone.locator('#v-home [data-go=goal]').click();
  await phone.waitForTimeout(200);
  await shot(phone, 'phone-3-goal');
  await phone.locator('#goal-chips button').first().click();
  await phone.waitForTimeout(300);
  await shot(phone, 'phone-4-confirm');
  await phone.locator('#confirm-c button').first().click();
  // 데모 페이지의 폰 iframe은 쓰지 않으므로 숨김 처리
  await page.evaluate(() => (document.getElementById('pf').src = 'about:blank'));
  const k = await ctx.newPage();
  await k.setViewportSize({ width: 540, height: 960 });
  await k.goto(`${BASE}/kiosk/cafe.html?hub=local`);
  await page.close();
  const want = { option: 'phone-5-guide', cart: 'phone-6-pay' };
  let lastKey = '', n = 0;
  for (let i = 0; i < 60 && n < 16; i++) {
    await phone.waitForTimeout(600);
    const last = await phone.evaluate(() => window.__app.last && { action: window.__app.last.action, say: window.__app.last.say, target: window.__app.last.target, type: window.__app.last.screen?.type });
    if (!last) continue;
    const key = last.say + last.type;
    if (key === lastKey) continue;
    lastKey = key; n++;
    await phone.waitForTimeout(1200);
    if (last.type === 'option' && /차가운/.test(last.say)) { await shot(phone, 'phone-5-guide'); await shot(k, 'kiosk-2-converted'); }
    if (last.action === 'confirm_pay') { await shot(phone, 'phone-6-pay'); await phone.locator('#pay-yes').click(); continue; }
    if (last.action === 'done') { await shot(phone, 'phone-7-done'); break; }
    if (last.action === 'insert_card') { await k.evaluate(() => document.querySelector('[data-act=insert]').click()); continue; }
    if (last.target) {
      const box = last.target.box;
      await k.evaluate(([b]) => { const r = document.getElementById('kiosk').getBoundingClientRect(); document.elementFromPoint(r.left + ((b[0] + b[2]) / 2000) * r.width, r.top + ((b[1] + b[3]) / 2000) * r.height)?.closest('[data-ref],[data-act]')?.click(); }, [box]);
    }
  }
  // 원래 키오스크 화면 (변환 전) — 별도 페이지, 프로필 없음
  const k2 = await ctx.newPage();
  await k2.setViewportSize({ width: 540, height: 960 });
  await k2.goto(`${BASE}/kiosk/cafe.html?offline=1`);
  await k2.evaluate(() => { __kiosk.act('start'); __kiosk.act('dine:takeout'); __kiosk.act('close'); __kiosk.act('item:americano'); });
  await k2.waitForTimeout(300);
  await shot(k2, 'kiosk-1-original');
  await b.close();
  console.log('ok');
})();
