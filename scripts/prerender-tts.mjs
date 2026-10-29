// 모은 문장을 Qwen3-TTS(Air API)로 미리 녹음 → public/voice/<키>.mp3 + index.json
// 시연 페이지(GitHub Pages)는 서버가 없어도 이 녹음을 재생한다. 없는 문장만 폰 내장 음성.
// 사용: .env에 AIR_API_KEY 넣고  node scripts/prerender-tts.mjs [--voice Sohee] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, cfg } from '../server/lib/env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(ROOT);
const { tts } = await import('../server/lib/air.js');
const args = process.argv.slice(2);
const voice = args.includes('--voice') ? args[args.indexOf('--voice') + 1] : cfg().tts.voice;
const force = args.includes('--force');
if (cfg().mock) { console.error('AIR_API_KEY가 없어요.'); process.exit(1); }

// public/app/js/voice.js 의 voiceKey 와 같은 함수
function voiceKey(text) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  let h = 0x811c9dc5;
  for (const ch of new TextEncoder().encode(t)) { h ^= ch; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const DIR = path.join(ROOT, 'public', 'voice');
const { texts: utterances } = JSON.parse(fs.readFileSync(path.join(DIR, 'texts.json'), 'utf8'));
// 앱은 문장 단위로 이어 재생한다 (public/app/js/voice.js 의 sentences 와 같은 규칙)
const split = (t) => String(t).replace(/\s+/g, ' ').trim().split(/(?<=[.?!])\s+/).filter(Boolean);
const set = new Set(utterances.flatMap(split));
// 목업 키오스크 주문 번호(101~130)는 시연마다 바뀌므로 미리 다 만든다
for (const s of [...set]) if (/^주문 번호는 \d+번이에요\.$/.test(s)) set.delete(s);
for (let n = 101; n <= 130; n++) set.add(`주문 번호는 ${n}번이에요.`);
const texts = [...set].sort();
console.log(`문장 ${texts.length}개 (안내 ${utterances.length}개에서)`);
const instructions = '어르신께 천천히, 또박또박, 따뜻하고 차분하게 말하세요. 버튼 이름은 조금 힘주어 말하세요.';
let done = 0, fail = 0, bytes = 0;
const keys = [];
const q = texts.slice();
await Promise.all(Array.from({ length: 3 }, async () => {
  while (q.length) {
    const t = q.shift(); const k = voiceKey(t); const f = path.join(DIR, k + '.mp3');
    if (!force && fs.existsSync(f)) { keys.push(k); done++; continue; }
    try {
      const r = await tts({ text: t, voice, instructions, format: 'mp3' });
      fs.writeFileSync(f, r.buf); bytes += r.buf.length; keys.push(k); done++;
    } catch (e) { fail++; console.warn('\n실패:', t.slice(0, 30), e.message.slice(0, 120)); }
    process.stdout.write(`\r${done + fail}/${texts.length}`);
  }
}));
fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify({ made: new Date().toISOString(), model: cfg().tts.model, voice, keys: keys.sort() }, null, 1));
console.log(`\n녹음 ${done}개 (새로 ${(bytes / 1024 / 1024).toFixed(1)}MB), 실패 ${fail}개 → public/voice/index.json`);
