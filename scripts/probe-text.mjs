// 글 모델이 화면 변환 요청에 무엇을 돌려주는지 그대로 보여 준다 (키는 출력 안 함).
// 사용: node scripts/probe-text.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, cfg } from '../server/lib/env.js';
import { convertPrompt } from '../server/lib/convert.js';
import { normalizeScreen } from '../server/lib/screen.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(ROOT);
const c = cfg();
const url = `${c.base}/${c.text.endpoint}/v1/chat/completions`;
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` };
const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval', 'set.json'), 'utf8'));
const s = set.samples.find((x) => x.raw?.els?.length > 6) || set.samples[0];
const raw = s.raw; const screen = normalizeScreen({ ...raw, els: raw.els.map((e) => ({ ...e, b: e.b || e.box })) });
const messages = convertPrompt(screen, { experience: 'some' });
const base = { model: c.text.model, messages, temperature: 0 };
const cases = [
  ['지금 서버와 같음 (max 1200)', { ...base, max_tokens: 1200 }],
  ['max 4000', { ...base, max_tokens: 4000 }],
  ['json_object', { ...base, max_tokens: 4000, response_format: { type: 'json_object' } }],
  ['thinking:false', { ...base, max_tokens: 4000, chat_template_kwargs: { thinking: false } }],
  ['enable_thinking:false', { ...base, max_tokens: 4000, chat_template_kwargs: { enable_thinking: false } }],
];
console.log(`화면 ${s.name} (${screen.type}, 버튼 ${screen.els.length}개)`);
for (const [name, body] of cases) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) });
    const t = await res.text();
    if (!res.ok) { console.log(`✗ ${name}: ${res.status} ${t.slice(0, 200)}`); continue; }
    const j = JSON.parse(t); const ch = j.choices?.[0] || {}; const m = ch.message || {};
    const content = m.content || ''; const rc = m.reasoning_content || m.reasoning || '';
    console.log(`\n■ ${name}: ${Date.now() - t0}ms finish=${ch.finish_reason} usage=${JSON.stringify(j.usage)}`);
    console.log(`  content ${content.length}자, reasoning ${rc.length}자, <think> ${/<think>|<\/think>/.test(content)}`);
    console.log('  앞: ' + JSON.stringify(content.slice(0, 300)));
    console.log('  끝: ' + JSON.stringify(content.slice(-200)));
  } catch (e) { console.log(`✗ ${name}: ${e.message}`); }
}
