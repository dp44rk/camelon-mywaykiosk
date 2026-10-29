// 평가 세트 만들기: 목업 키오스크를 주문 흐름대로 돌며 화면을 찍고, 정답(눌러야 할 버튼 상자)을 함께 저장한다.
// 정답 = 연동 모드 엔진이 고른 버튼 (이 엔진으로 주문 완료까지 가는 것을 E2E로 확인함)
// 이어서 사진처럼 변형(기울기·흐림·빛 반사·어둡게·배경)을 만들고 상자 좌표도 같이 바꾼다.
// 사용: 서버(MOCK_AI=1 npm start) 켠 뒤  node eval/capture.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const sharp = require('sharp');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:8787';
const OUT = path.join(ROOT, 'eval', 'images');
fs.mkdirSync(OUT, { recursive: true });

const GOALS = [
  { store: 'cafe', id: 'cafe-01', text: '차가운 아메리카노 한 잔 가져갈게', goal: { items: [{ name: '아메리카노', qty: 1, unit: '잔', temp: 'ice' }], place: 'takeout' } },
  { store: 'cafe', id: 'cafe-01', text: '따뜻한 카페라떼 한 잔 먹고 갈게', goal: { items: [{ name: '카페라떼', qty: 1, unit: '잔', temp: 'hot' }], place: 'eatin' } },
  { store: 'cafe', id: 'cafe-01', text: '레몬에이드 하나 가져갈게', goal: { items: [{ name: '레몬에이드', qty: 1, unit: '잔', temp: 'ice' }], place: 'takeout' } },
  { store: 'restaurant', id: 'rest-01', text: '김치찌개 하나 먹고 갈게', goal: { items: [{ name: '김치찌개', qty: 1, unit: '개', temp: null }], place: 'eatin' } },
  { store: 'restaurant', id: 'rest-01', text: '물냉면 하나 포장', goal: { items: [{ name: '물냉면', qty: 1, unit: '개', temp: null }], place: 'takeout' } },
];

async function step(body) {
  const r = await fetch(`${BASE}/api/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

const samples = [];
const b = await chromium.launch();
for (const [gi, G] of GOALS.entries()) {
  const page = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/kiosk/${G.store}.html?offline=1`); // offline: 프로필 안 받음 = 일반 키오스크 화면
  await page.waitForTimeout(700);
  let state = { goal: G.goal };
  for (let s = 0; s < 18; s++) {
    await page.waitForTimeout(350);
    // 연동 화면 구조를 직접 서버에 올리고 정답을 받는다
    const screen = await page.evaluate(() => window.__kioskState);
    await fetch(`${BASE}/api/kiosk/${G.id}-eval/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screen }) });
    const r = await step({ kioskId: `${G.id}-eval`, goal: G.goal, state, profile: { experience: 'some' } });
    const name = `g${gi}-s${String(s).padStart(2, '0')}`;
    const kb = await page.locator('#kiosk').boundingBox();
    await page.screenshot({ path: path.join(OUT, name + '.clean.png'), clip: kb });
    samples.push({ name, store: G.store, goalText: G.text, goal: G.goal, state, gt: { type: r.screen.type, action: r.action, target: r.target, total: r.screen.total, els: r.screen.els } });
    console.log(name, r.screen.type, r.action, r.target?.t || '');
    if (r.action === 'done') break;
    state = r.state;
    if (r.action === 'confirm_pay') { state.payConfirmed = true; continue; }
    if (r.action === 'insert_card') { await page.click('[data-act=insert]'); await page.waitForTimeout(2600); continue; }
    if (!r.target) break;
    const box = r.target.box;
    await page.mouse.click(kb.x + ((box[0] + box[2]) / 2000) * kb.width, kb.y + ((box[1] + box[3]) / 2000) * kb.height);
  }
  await page.close();
}
await b.close();

// ---------- 사진처럼 변형 ----------
// 화면(1080x1920)을 키오스크 몸체 안에 넣고, 배경 위에 회전·축소해 붙인 뒤 흐림·밝기·빛 반사를 준다.
const VARIANTS = {
  photo: { angle: -4, scale: 0.78, blur: 0.6, bright: 0.95, glare: 0.0, dark: false },
  tilt: { angle: 7, scale: 0.7, blur: 1.2, bright: 0.85, glare: 0.35, dark: false },
  dim: { angle: -2, scale: 0.85, blur: 1.8, bright: 0.55, glare: 0.0, dark: true },
};
const CW = 1200, CH = 1600; // 폰 사진 크기 (세로)

function transformBox(box, v, inner) {
  // box: 화면 기준 0~1000 → 사진 기준 0~1000
  const { sw, sh, ox, oy, angle } = inner;
  const pts = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]].map(([x, y]) => {
    let px = ox + (x / 1000) * sw, py = oy + (y / 1000) * sh; // 회전 전 캔버스 좌표
    const cx = CW / 2, cy = CH / 2, a = (angle * Math.PI) / 180;
    const dx = px - cx, dy = py - cy;
    return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
  });
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs) / CW, Math.min(...ys) / CH, Math.max(...xs) / CW, Math.max(...ys) / CH].map((v2) => Math.round(Math.max(0, Math.min(1, v2)) * 1000));
}

for (const s of samples) {
  s.variants = {};
  const clean = path.join(OUT, s.name + '.clean.png');
  // 깨끗한 화면 (캡처 그대로) — 화면 = 사진 전체
  await sharp(clean).resize(720).jpeg({ quality: 85 }).toFile(path.join(OUT, s.name + '.clean.jpg'));
  s.variants.clean = { file: s.name + '.clean.jpg', target: s.gt.target?.box || null, screen: [0, 0, 1000, 1000] };
  for (const [vn, v] of Object.entries(VARIANTS)) {
    const sh = Math.round(CH * v.scale * 0.86), sw = Math.round(sh * (1080 / 1920));
    const bez = 34;
    const screenImg = await sharp(clean).resize(sw, sh).toBuffer();
    // 몸체(회색 테두리) + 화면
    const body = await sharp({ create: { width: sw + bez * 2, height: sh + bez * 2 + 120, channels: 3, background: '#2b2d31' } })
      .composite([{ input: screenImg, left: bez, top: bez }]).png().toBuffer();
    const ox = Math.round((CW - sw) / 2), oy = Math.round((CH - sh) / 2) - 40;
    let canvas = sharp({ create: { width: CW, height: CH, channels: 3, background: v.dark ? '#3a332c' : '#b9b2a6' } })
      .composite([{ input: body, left: ox - bez, top: oy - bez }]);
    let buf = await canvas.png().toBuffer();
    if (v.glare) {
      const g = Buffer.from(`<svg width="${CW}" height="${CH}"><defs><radialGradient id="g" cx="62%" cy="30%" r="35%"><stop offset="0" stop-color="#fff" stop-opacity="${v.glare}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
      buf = await sharp(buf).composite([{ input: g }]).png().toBuffer();
    }
    buf = await sharp(buf).rotate(v.angle, { background: v.dark ? '#3a332c' : '#b9b2a6' }).toBuffer();
    // 회전하면 캔버스가 커지므로 가운데를 원래 크기로 자른다
    const meta = await sharp(buf).metadata();
    buf = await sharp(buf).extract({ left: Math.round((meta.width - CW) / 2), top: Math.round((meta.height - CH) / 2), width: CW, height: CH })
      .modulate({ brightness: v.bright }).blur(v.blur || 0.3).resize(900).jpeg({ quality: 80 }).toBuffer();
    const file = `${s.name}.${vn}.jpg`;
    fs.writeFileSync(path.join(OUT, file), buf);
    const inner = { sw, sh, ox, oy, angle: v.angle };
    s.variants[vn] = { file, target: s.gt.target?.box ? transformBox(s.gt.target.box, v, inner) : null, screen: transformBox([0, 0, 1000, 1000], v, inner) };
  }
}
fs.writeFileSync(path.join(ROOT, 'eval', 'set.json'), JSON.stringify({ made: new Date().toISOString(), note: '목업 키오스크 캡처 + 합성 변형. 정답은 연동 엔진 기준.', samples }, null, 1));
console.log(`\n${samples.length}개 화면 × ${1 + Object.keys(VARIANTS).length}가지 = ${samples.length * (1 + Object.keys(VARIANTS).length)}장 → eval/images, 목록 eval/set.json`);
