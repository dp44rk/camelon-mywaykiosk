// 화면 변환 성공률: 키오스크 화면 구조 → 내 방식 화면 설계가 "온전한가"
// 사용: node eval/convert-metrics.mjs            (규칙 변환, 키 불필요)
//       node eval/convert-metrics.mjs --ai       (서버 /api/convert = AI 변환, 서버와 AIR_API_KEY 필요)
// 성공 = 모든 버튼이 정확히 한 번(빠짐 0·지어냄 0·중복 0) + 모든 라벨이 쉬운 말(검증기 보정 0)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleConvert, validate } from '../server/lib/convert.js';
import { normalizeScreen } from '../server/lib/screen.js';
import { hardWords } from '../server/lib/plain.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AI = process.argv.includes('--ai');
const BASE = process.env.BASE || 'http://localhost:8787';
const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval', 'set.json'), 'utf8'));
const rows = [];
for (const s of set.samples) {
  if (!s.raw?.els?.length) continue;
  const screen = normalizeScreen(s.raw);
  let v, source = 'rule', ms = 0;
  if (AI) {
    const t0 = Date.now();
    const j = await (await fetch(`${BASE}/api/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screen: s.raw, profile: { experience: 'some' } }) })).json();
    ms = Date.now() - t0; source = j.source; v = { plan: j.plan, report: j.report };
  } else v = validate(ruleConvert(screen), screen);
  const labels = Object.values(v.plan.labels);
  const before = screen.els.filter((e) => e.k !== 'item' && hardWords(e.t).length).length;
  const after = screen.els.filter((e) => e.k !== 'item' && hardWords(v.plan.labels[e.id] || '').length).length;
  rows.push({ name: s.name, type: screen.type, n: screen.els.length, ok: v.report.ok, coverage: v.report.coverage, invented: v.report.invented, relabeled: v.report.relabeled, hardBefore: before, hardAfter: after, sections: v.plan.sections.length, source, ms });
}
const n = rows.length, sum = (k) => rows.reduce((a, r) => a + r[k], 0);
const summary = {
  made: new Date().toISOString(), mode: AI ? 'ai' : 'rule', screens: n, buttons: sum('n'),
  successRate: +((rows.filter((r) => r.ok).length / n) * 100).toFixed(1),
  coverage: +((rows.reduce((a, r) => a + r.coverage * r.n, 0) / sum('n')) * 100).toFixed(1),
  invented: sum('invented'), relabeledByValidator: sum('relabeled'),
  hardLabelsBefore: sum('hardBefore'), hardLabelsAfter: sum('hardAfter'),
  aiFallbackToRule: rows.filter((r) => r.source === 'rule').length,
  msMedian: AI ? rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(n / 2)] : 0,
};
fs.mkdirSync(path.join(ROOT, 'eval', 'results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'eval', 'results', `convert-${summary.mode}.json`), JSON.stringify({ summary, rows }, null, 1));
console.log(summary);
