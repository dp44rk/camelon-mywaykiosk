// 시연(체험 모드)에서 나올 수 있는 안내 문장을 모두 모은다 → voice/texts.json
// 사용: (정적 서버 또는 npm start 켠 뒤) node scripts/collect-utterances.cjs
// 흐름: 매장 2 × 예시 주문 × 안내 자세함 3단계를 끝까지 돌고, 앱 코드에 적힌 고정 문장도 더한다.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:8787';
const ROOT = path.join(__dirname, '..');
const FLOWS = [
  ['cafe', 'cafe-01', 0], ['cafe', 'cafe-01', 1], ['restaurant', 'rest-01', 2], ['restaurant', 'rest-01', 3],
];
(async () => {
  const said = new Set();
  const b = await chromium.launch();
  for (const exp of ['first', 'some', 'often']) for (const vision of ['normal']) for (const [store, kid, chip] of FLOWS) {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(([exp, vision]) => localStorage.setItem('myway.profile.v1', JSON.stringify({ v: 1, rate: 0.9, vision, experience: exp, skipPoints: true, noUpsell: true, plain: true })), [exp, vision]);
    const k = await ctx.newPage(); await k.goto(`${BASE}/kiosk/${store}.html?hub=local`);
    const p = await ctx.newPage(); await p.goto(`${BASE}/app/?demo=1&k=${kid}`);
    await p.evaluate(() => (window.__muted = true));
    await p.waitForTimeout(300);
    await p.evaluate(() => window.__go('goal'));
    await p.locator('#goal-chips button').nth(chip).click();
    await p.waitForTimeout(300);
    await p.locator('#confirm-c button').first().click();
    let lastKey = '';
    for (let i = 0; i < 70; i++) {
      await p.waitForTimeout(450);
      const last = await p.evaluate(() => window.__app.last && { action: window.__app.last.action, say: window.__app.last.say, target: window.__app.last.target });
      if (!last || last.say + JSON.stringify(last.target) === lastKey) continue;
      lastKey = last.say + JSON.stringify(last.target);
      if (last.action === 'done') break;
      if (last.action === 'confirm_pay') { await p.locator('#pay-yes').click(); continue; }
      if (last.action === 'insert_card') { await k.evaluate(() => document.querySelector('[data-act=insert]').click()); continue; }
      if (last.target) await k.evaluate(([b]) => { const r = document.getElementById('kiosk').getBoundingClientRect(); document.elementFromPoint(r.left + ((b[0] + b[2]) / 2000) * r.width, r.top + ((b[1] + b[3]) / 2000) * r.height)?.closest('[data-ref],[data-act]')?.click(); }, [last.target.box]);
    }
    // 도구 버튼 문장
    await p.evaluate(() => { document.getElementById('t-again').click(); document.getElementById('t-what').click(); document.getElementById('t-help').click(); });
    await p.waitForTimeout(300);
    (await p.evaluate(() => [...(window.__said || [])])).forEach((t) => said.add(t));
    await ctx.close();
    process.stdout.write(`\r${said.size}개`);
  }
  await b.close();
  // 앱 코드에 직접 적힌 V.say('…') / V.quick('…') 문장
  const src = fs.readFileSync(path.join(ROOT, 'public/app/js/app.js'), 'utf8');
  for (const m of src.matchAll(/V\.(?:say|quick)\('([^'$`]+)'\)/g)) said.add(m[1]);
  for (const m of src.matchAll(/speak: '([^']+)'/g)) said.add(m[1]);
  const texts = [...said].filter((t) => t && t.length < 300).sort();
  fs.mkdirSync(path.join(ROOT, 'public/voice'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'public/voice/texts.json'), JSON.stringify({ made: new Date().toISOString(), count: texts.length, texts }, null, 1));
  console.log(`\n${texts.length}개 문장 → public/voice/texts.json`);
})();
