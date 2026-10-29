// Air API 연결 점검: 키·endpoint·model id가 맞는지 모델마다 아주 작은 요청을 보내 본다.
// 사용: node scripts/check-air.mjs   → 결과를 화면에 출력하고 eval/results/air-check.json 에 저장
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, cfg } from '../server/lib/env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(ROOT);
const c = cfg();
if (!c.key) { console.error('✗ .env에 AIR_API_KEY가 없어요.'); process.exit(1); }
const { chat, tts } = await import('../server/lib/air.js');

// 64x64 빨간 네모 JPEG (비전 입력 확인용)
const DOT = 'data:image/jpeg;base64,/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCABAAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAUH/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AkgIrQQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/9k=';
const out = { at: new Date().toISOString(), base: c.base, results: [] };
async function run(name, model, fn) {
  const t0 = Date.now();
  try { const r = await fn(); out.results.push({ name, ...model, ok: true, ms: Date.now() - t0, sample: r }); console.log(`✓ ${name}  ${model.endpoint} / ${model.model}  ${Date.now() - t0}ms  ${r}`); }
  catch (e) { out.results.push({ name, ...model, ok: false, ms: Date.now() - t0, error: String(e.message).slice(0, 300) }); console.log(`✗ ${name}  ${model.endpoint} / ${model.model}\n   ${String(e.message).slice(0, 300)}`); }
}
await run('글(목표 이해·화면 변환)', c.text, async () => (await chat({ kind: 'text', maxTokens: 20, messages: [{ role: 'user', content: '"안녕"이라고만 답해.' }] })).text.slice(0, 40));
await run('비전(화면 보기)', c.vision, async () => (await chat({ kind: 'vision', maxTokens: 20, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: DOT } }, { type: 'text', text: '이 그림의 색을 한 단어로.' }] }] })).text.slice(0, 40));
await run('음성(TTS)', c.tts, async () => { const r = await tts({ text: '안녕하세요. 내 방식 QR이에요.' }); fs.mkdirSync(path.join(ROOT, 'eval', 'results'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'eval', 'results', 'tts-sample.mp3'), r.buf); return `${r.type} ${r.buf.length}바이트 → eval/results/tts-sample.mp3 (목소리 ${c.tts.voice})`; });
fs.mkdirSync(path.join(ROOT, 'eval', 'results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'eval', 'results', 'air-check.json'), JSON.stringify(out, null, 1));
console.log(out.results.every((r) => r.ok) ? '\n모두 연결됨.' : '\n실패한 모델은 Air API 콘솔의 "코드 보기"에서 endpoint id·model id를 확인해 .env에 넣어 주세요.');
