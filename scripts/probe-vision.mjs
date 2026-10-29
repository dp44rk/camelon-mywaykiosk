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
const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAkElEQVR4nO3PAQkAABDCQPNY4PunWJ2PIYJwATZxrqZ4ARtwNcUL2ICrKV7ABlxN8QI24GqKF7ABV1O8gA24muIFbMDVFC9gA66meAEbcDXFC9iAqylewAZcTfECNuBqihewAVdTvIANuJriBWzA1RQvYAOupngBG3A1xQvYgKspXsAGXE3xAjbgaooXsAFXe5MKgR4StDB0AAAAAElFTkSuQmCC';
const docs = (u) => [{ role: 'user', content: [{ type: 'text', text: '이 이미지를 설명해 주세요.' }, { type: 'image_url', image_url: { url: u } }] }];
const cases = [
  ['GET /models', null],
  ['글만 · 기본', { model: M, messages: txt, max_tokens: 30 }],
  ['문서 예시 그대로 · https', { model: M, messages: docs('https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png') }],
  ['문서 예시 그대로 · 작은 PNG', { model: M, messages: docs(tiny) }],
  ['문서 예시 그대로 · 키오스크 JPEG', dataUrl && { model: M, messages: docs(dataUrl) }],
  ['image_url을 문자열로', dataUrl && { model: M, messages: [{ role: 'user', content: [{ type: 'text', text: '설명해 줘.' }, { type: 'image_url', image_url: dataUrl }] }] }],
  ['type image', dataUrl && { model: M, messages: [{ role: 'user', content: [{ type: 'text', text: '설명해 줘.' }, { type: 'image', image: dataUrl }] }] }],
  ['type input_image', dataUrl && { model: M, messages: [{ role: 'user', content: [{ type: 'text', text: '설명해 줘.' }, { type: 'input_image', image_url: dataUrl }] }] }],
  ['작은 PNG + max_tokens 60', { model: M, messages: docs(tiny), max_tokens: 60 }],
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
