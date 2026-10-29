// 비전 엔드포인트가 어떤 요청 모양을 받는지 하나씩 시험한다. 키는 출력하지 않는다.
// 사용: node scripts/probe-vision.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, cfg } from '../server/lib/env.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(ROOT);
const c = cfg();
const url = `${c.base}/${c.vision.endpoint}/v1`;
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` };
const img = path.join(ROOT, 'eval', 'images', 'g0-s00.clean.jpg');
const dataUrl = fs.existsSync(img) ? 'data:image/jpeg;base64,' + fs.readFileSync(img).toString('base64') : null;
const httpsImg = 'https://dp44rk.github.io/myway/img/kiosk-1-original.jpg';
const M = c.vision.model;
const txt = [{ role: 'user', content: '안녕이라고만 답해.' }];
const withImg = (u, textFirst) => [{ role: 'user', content: textFirst
  ? [{ type: 'text', text: '이 화면에 뭐가 보여? 한 문장.' }, { type: 'image_url', image_url: { url: u } }]
  : [{ type: 'image_url', image_url: { url: u } }, { type: 'text', text: '이 화면에 뭐가 보여? 한 문장.' }] }];
const cases = [
  ['GET /models', null],
  ['글만 · 기본', { model: M, messages: txt, max_tokens: 30 }],
  ['글만 · thinking 끔', { model: M, messages: txt, max_tokens: 30, chat_template_kwargs: { enable_thinking: false } }],
  ['글만 · 문자열 content 배열', { model: M, messages: [{ role: 'user', content: [{ type: 'text', text: '안녕이라고만 답해.' }] }], max_tokens: 30 }],
  ['그림 · data URL', dataUrl && { model: M, messages: withImg(dataUrl), max_tokens: 60 }],
  ['그림 · data URL · 글 먼저', dataUrl && { model: M, messages: withImg(dataUrl, true), max_tokens: 60 }],
  ['그림 · https URL', { model: M, messages: withImg(httpsImg), max_tokens: 60 }],
  ['그림 · data URL · system 포함', dataUrl && { model: M, messages: [{ role: 'system', content: 'JSON으로만 답해.' }, ...withImg(dataUrl)], max_tokens: 60, temperature: 0 }],
];
for (const [name, body] of cases) {
  if (body === undefined || body === false || (body === null && name !== 'GET /models')) { console.log(`- ${name}: 건너뜀(사진 없음)`); continue; }
  const t0 = Date.now();
  try {
    const res = body ? await fetch(url + '/chat/completions', { method: 'POST', headers: H, body: JSON.stringify(body) }) : await fetch(url + '/models', { headers: H });
    const t = (await res.text()).replace(/\s+/g, ' ');
    let show = t;
    try { const j = JSON.parse(t); show = j.choices?.[0]?.message?.content ?? (j.data ? 'models: ' + j.data.map((d) => d.id).join(', ') : t); } catch {}
    console.log(`${res.ok ? '✓' : '✗'} ${name}: ${res.status} ${Date.now() - t0}ms  ${String(show).slice(0, 220)}`);
  } catch (e) { console.log(`✗ ${name}: ${e.message}`); }
}
