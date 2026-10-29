// 쉬운 말 지표: 키오스크 화면 글자(원문) vs 내 방식 QR 안내 문장
// 사용: node eval/plain-metrics.mjs   (eval/set.json 필요, API 키 불필요)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromKioskState, runStep } from '../server/lib/engine.js';
import { stats, hardWords, splitSentences, wordCount } from '../server/lib/plain.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval', 'set.json'), 'utf8'));
const PROFILES = { first: { experience: 'first' }, some: { experience: 'some' }, often: { experience: 'often' } };

const agg = (rows) => {
  const n = rows.length || 1, sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  return {
    samples: rows.length,
    words: sum('words'),
    hardWords: sum('hard'),
    hardPer100: +((sum('hard') / Math.max(1, sum('words'))) * 100).toFixed(1),
    avgWordsPerSentence: +(sum('words') / Math.max(1, sum('sentences'))).toFixed(2),
    maxWordsPerSentence: Math.max(...rows.map((r) => r.maxWords)),
    actionsPerUtterance: +(sum('actions') / n).toFixed(2),
    shortSentenceRate: +((rows.reduce((a, r) => a + r.short, 0) / Math.max(1, sum('sentences'))) * 100).toFixed(1),
    checkPass: rows.some((r) => 'ok' in r) ? +((rows.filter((r) => r.ok).length / n) * 100).toFixed(1) : null,
  };
};
function measure(text, extra = {}) {
  const st = stats(text);
  const sents = splitSentences(text);
  return { words: sents.reduce((a, s) => a + wordCount(s), 0), sentences: st.sentences, maxWords: st.maxWords, hard: hardWords(text).length, actions: st.actionsTotal, short: sents.filter((s) => wordCount(s) <= 9).length, ...extra };
}

const original = [], ours = { first: [], some: [], often: [] };
const examples = [];
for (const s of set.samples) {
  if (!s.gt.els?.length) continue;
  // 원문: 화면에 보이는 버튼 글자 전부 (실제 키오스크가 어르신에게 주는 정보)
  const shown = s.gt.els.map((e) => e.t).join('. ') + '.';
  original.push(measure(shown));
  const raw = { kiosk: true, quality: 'ok', screen: [0, 0, 1000, 1000], type: s.gt.type, els: s.gt.els.map((e) => ({ ...e, b: e.box })), total: s.gt.total, conf: 1 };
  for (const [pn, prof] of Object.entries(PROFILES)) {
    const screen = fromKioskState(raw, s.goal, s.state);
    const r = runStep({ screen, goal: s.goal, state: s.state, profile: prof, source: 'linked' });
    ours[pn].push(measure(r.say, { ok: r.check.ok }));
    if (pn === 'first' && examples.length < 8 && r.action === 'press' && /[A-Za-z]/.test(r.target?.t || '')) examples.push({ screen: s.gt.type, shown: s.gt.els.slice(0, 6).map((e) => e.t), say: r.say });
  }
}
const out = { made: new Date().toISOString(), original: agg(original), ours: Object.fromEntries(Object.entries(ours).map(([k, v]) => [k, agg(v)])), examples };
fs.mkdirSync(path.join(ROOT, 'eval', 'results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'eval', 'results', 'plain.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
