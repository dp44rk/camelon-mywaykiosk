const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const OUT = process.env.SHOTS || '/tmp/myway-shots/'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 540, height: 960 } });
  p.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  p.on('pageerror', (e) => console.log('pageerror:', e.message));
  await p.goto('http://localhost:8787/kiosk/cafe.html?offline=0');
  await p.waitForTimeout(1500);
  const goal = { items: [{ name: '아메리카노', qty: 1, unit: '잔', temp: 'ice' }], place: 'takeout' };
  let state = {};
  for (let i = 0; i < 16; i++) {
    await p.waitForTimeout(400);
    await p.screenshot({ path: OUT + `cafe-${String(i).padStart(2, '0')}.png` });
    const r = await (await fetch('http://localhost:8787/api/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kioskId: 'cafe-01', goal, state, profile: { experience: 'first' } }) })).json();
    if (r.error) { console.log('ERR', r.error); break; }
    console.log(i, r.screen.type, r.action, '|', r.say, r.check.ok ? '' : '❌' + r.check.problems.join(';'));
    state = r.state;
    if (r.action === 'confirm_pay') { state.payConfirmed = true; continue; }
    if (r.action === 'insert_card') { await p.click('[data-act=insert]'); await p.waitForTimeout(2500); continue; }
    if (r.action === 'done') break;
    if (!r.target) break;
    // 안내된 버튼을 그대로 누른다 (박스 중심)
    const box = r.target.box; const k = await p.locator('#kiosk').boundingBox();
    await p.mouse.click(k.x + ((box[0] + box[2]) / 2000) * k.width, k.y + ((box[1] + box[3]) / 2000) * k.height);
  }
  await b.close();
})();
