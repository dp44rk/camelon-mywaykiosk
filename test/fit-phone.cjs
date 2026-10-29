// 폰 화면 크기 4종 × 글씨 2종에서 모든 화면이 스크롤 없이 들어가고, 요소끼리 겹치지 않는지 검사
// 폰 화면 크기별로 각 화면이 스크롤 없이 들어가는지
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const O = process.env.SHOTS || '/tmp/myway-shots/'; require('fs').mkdirSync(O, { recursive: true });
const sizes = [[390, 844], [375, 667], [360, 740], [392, 674]];
const views = ['home', 'setup', 'qr', 'goal', 'confirm', 'guide', 'help', 'done'];
(async () => {
  const b = await chromium.launch();
  const rows = [];
  for (const low of [false, true]) for (const [w, h] of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    await ctx.addInitScript((low) => localStorage.setItem('myway.profile.v1', JSON.stringify({ v: 1, rate: 0.9, vision: low ? 'low' : 'normal', experience: 'first', skipPoints: true, noUpsell: true, plain: true })), low);
    const p = await ctx.newPage();
    await p.goto((process.env.BASE || 'http://localhost:8787') + '/app/?demo=1&k=cafe-01'); await p.waitForTimeout(400);
    await p.evaluate(() => (window.__muted = true));
    const res = [];
    for (const v of views) {
      await p.evaluate((v) => {
        window.__go(v);
        if (v === 'confirm') { document.getElementById('confirm-say').textContent = '차가운 아메리카노 한 잔, 가지고 가기. 맞아요?'; document.getElementById('confirm-c').innerHTML = '<button class="blk y">네, 맞아요</button><button class="blk w">다시 말할래요</button>'; }
        if (v === 'guide') { document.getElementById('pay-row').hidden = false; document.getElementById('instr-big').textContent = "'이걸로 담기 · 4,500원' 누르기"; document.getElementById('instr-sub').textContent = '화면 오른쪽 아래 · 노란 네모'; }
        if (v === 'done') document.getElementById('done-no').textContent = '762번';
      }, v);
      await p.waitForTimeout(250);
      const m = await p.evaluate(() => { const on = document.querySelector('.view.on'); const r = on.getBoundingClientRect(); let maxB = 0; on.querySelectorAll('*').forEach((e) => { const b = e.getBoundingClientRect(); if (b.width && b.height && getComputedStyle(e).display !== 'none' && !e.closest('[hidden]')) maxB = Math.max(maxB, b.bottom); }); return { doc: document.documentElement.scrollHeight - innerHeight, content: Math.round(maxB - innerHeight), sw: document.documentElement.scrollWidth - innerWidth }; });
      const ov = await p.evaluate(() => {
        const on = document.querySelector('.view.on');
        const groups = [on, ...on.querySelectorAll('.choices, .chips, .tools, .row2, .confirm-row, .type-row, .mark, .viewport ~ *')];
        const bad = [];
        const rect = (e) => { const r = e.getBoundingClientRect(); const sh = getComputedStyle(e).boxShadow.match(/(-?\d+)px (-?\d+)px 0px/); const dx = sh ? Math.max(0, +sh[1]) : 0, dy = sh ? Math.max(0, +sh[2]) : 0; return { l: r.left, t: r.top, r: r.right + dx, b: r.bottom + dy, w: r.width, h: r.height }; };
        for (const g of groups) {
          const kids = [...g.children].filter((e) => !e.hidden && getComputedStyle(e).display !== 'none' && getComputedStyle(e).position !== 'absolute' && getComputedStyle(e).position !== 'fixed' && !e.closest('[hidden]'));
          for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
            const a = rect(kids[i]), b = rect(kids[j]);
            if (!a.w || !b.w || !a.h || !b.h) continue;
            const ix = Math.min(a.r, b.r) - Math.max(a.l, b.l), iy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
            if (ix > 0.5 && iy > 0.5) bad.push((kids[i].id || kids[i].className || kids[i].tagName) + '×' + (kids[j].id || kids[j].className || kids[j].tagName));
          }
        }
        return bad;
      });
      res.push(`${v}:${m.doc > 0 || m.content > 0 ? 'OVER ' + Math.max(m.doc, m.content) : 'ok'}${m.sw > 0 ? ' W' + m.sw : ''}${ov.length ? ' OVERLAP[' + ov.slice(0, 3).join(',') + ']' : ''}`);
      if (w === 375 && v !== 'help') await p.screenshot({ path: O + `fit-${low ? 'L' : 'N'}-${v}.png` });
    }
    rows.push(`${low ? 'low ' : 'norm'} ${w}x${h}  ` + res.join('  '));
    await ctx.close();
  }
  console.log(rows.join('\n'));
  await b.close();
})();
