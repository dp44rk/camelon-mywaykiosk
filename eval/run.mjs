// 카메라 모드 성능 평가: 평가 세트 사진 → 비전 모델 → 안내 엔진 → 정답 비교
// 사용: AIR_API_KEY가 든 .env 준비 후
//   node eval/run.mjs                              # 기본 비전 모델, 전체
//   node eval/run.mjs --variants clean,tilt --limit 20 --conc 3
//   node eval/run.mjs --model qwen3-5-9b:qwen/qwen3.5-9b
// 지표
//   hit      : 안내한 버튼 중심이 정답 버튼 상자(사방 4% 여유) 안에 있음 (정답이 '누르기'인 화면만)
//   type     : 화면 종류(메뉴/옵션/결제…) 일치
//   grid     : "오른쪽 위" 같은 9칸 위치 말이 정답과 일치
//   safe     : 결제 화면에서 확인 없이 결제 버튼을 안내하지 않음 (정답이 confirm_pay인 화면)
//   ms       : 사진 → 안내 문장까지 걸린 시간
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, cfg } from '../server/lib/env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(ROOT);
const { understand } = await import('../server/lib/vision.js');
const { runStep } = await import('../server/lib/engine.js');
const { gridName } = await import('../server/lib/layout.js');
const jpeg = (await import('jpeg-js')).default;

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null)).filter(Boolean));
const variants = (args.variants || 'clean,photo,tilt,dim').split(',');
const limit = Number(args.limit || 1e9), conc = Number(args.conc || 3);
let override = null;
if (args.model) { const [endpoint, model] = args.model.split(':'); override = { endpoint, model }; }
if (cfg().mock) { console.error('AIR_API_KEY가 없어요. .env를 확인하세요.'); process.exit(1); }

const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval', 'set.json'), 'utf8'));
const jobs = [];
for (const s of set.samples.slice(0, limit)) for (const v of variants) if (s.variants[v]) jobs.push({ s, v });

const inBox = (pt, b, pad = 40) => pt[0] >= b[0] - pad && pt[0] <= b[2] + pad && pt[1] >= b[1] - pad && pt[1] <= b[3] + pad;
const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

const results = [];
let done = 0;
async function work(job) {
  const { s, v } = job;
  const V = s.variants[v];
  const buf = fs.readFileSync(path.join(ROOT, 'eval', 'images', V.file));
  const dataUrl = 'data:image/jpeg;base64,' + buf.toString('base64');
  const t0 = Date.now();
  const row = { name: s.name, variant: v, gtType: s.gt.type, gtAction: s.gt.action, gtTarget: s.gt.target?.t || null };
  try {
    const u = await understand({ imageDataUrl: dataUrl, goal: s.goal, history: s.state.history, profile: { experience: 'some' }, override });
    const img = jpeg.decode(buf, { useTArray: true });
    const r = runStep({ screen: u.screen, img, goal: s.goal, state: s.state, profile: { experience: 'some' }, source: 'camera' });
    row.ms = Date.now() - t0; row.visionMs = u.ms; row.tokens = u.usage;
    row.type = u.screen.type; row.action = r.action; row.say = r.say; row.target = r.target?.t || null;
    row.typeOk = u.screen.type === s.gt.type;
    if (s.gt.action === 'press' && V.target) {
      row.hit = !!(r.target && inBox(center(r.target.box), V.target));
      row.gridOk = !!(r.target && gridName(r.target.box, u.screen.screen).name === gridName(V.target, V.screen).name);
    }
    if (s.gt.action === 'confirm_pay') row.safe = r.action !== 'press' || r.target?.k !== 'pay';
    row.checkOk = r.check.ok;
  } catch (e) {
    row.error = e.message.slice(0, 200); row.ms = Date.now() - t0;
  }
  results.push(row);
  done++;
  if (done % 10 === 0 || done === jobs.length) process.stdout.write(`\r${done}/${jobs.length}`);
}
const q = jobs.slice();
await Promise.all(Array.from({ length: conc }, async () => { while (q.length) await work(q.shift()); }));
console.log();

const pct = (a, b) => (b ? +((a / b) * 100).toFixed(1) : null);
function summarize(rows) {
  const press = rows.filter((r) => 'hit' in r), pay = rows.filter((r) => 'safe' in r), ok = rows.filter((r) => !r.error);
  const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
  return {
    n: rows.length, errors: rows.length - ok.length,
    hit: pct(press.filter((r) => r.hit).length, press.length), hitN: press.length,
    type: pct(ok.filter((r) => r.typeOk).length, ok.length),
    grid: pct(press.filter((r) => r.gridOk).length, press.length),
    safe: pct(pay.filter((r) => r.safe).length, pay.length), safeN: pay.length,
    plainCheck: pct(ok.filter((r) => r.checkOk).length, ok.length),
    msMedian: ms[Math.floor(ms.length / 2)] ?? null, msP90: ms[Math.floor(ms.length * 0.9)] ?? null,
  };
}
const summary = { made: new Date().toISOString(), model: override?.model || cfg().vision.model, all: summarize(results) };
for (const v of variants) summary[v] = summarize(results.filter((r) => r.variant === v));
fs.mkdirSync(path.join(ROOT, 'eval', 'results'), { recursive: true });
const tag = (override?.endpoint || cfg().vision.endpoint).replace(/[^\w-]/g, '');
fs.writeFileSync(path.join(ROOT, 'eval', 'results', `camera-${tag}.json`), JSON.stringify({ summary, rows: results }, null, 1));
console.table(Object.fromEntries(Object.entries(summary).filter(([k]) => k !== 'made' && k !== 'model')));
console.log('저장:', `eval/results/camera-${tag}.json`);
