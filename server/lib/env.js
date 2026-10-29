// .env 로더 (의존성 없이)
import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(root) {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

export function cfg() {
  const e = process.env;
  return {
    key: e.AIR_API_KEY || '',
    base: (e.AIR_BASE || 'https://ap-1.aieev.cloud/endpoints').replace(/\/$/, ''),
    vision: { endpoint: e.VISION_ENDPOINT || 'qwen3-8-27b', model: e.VISION_MODEL || 'qwen/qwen3.8-27b' },
    text: { endpoint: e.TEXT_ENDPOINT || 'deepseek-v4-1-flash-1017', model: e.TEXT_MODEL || 'deepseek/deepseek-v4.1-flash-1017' },
    tts: { endpoint: e.TTS_ENDPOINT || 'qwen3-tts', model: e.TTS_MODEL || 'qwen/qwen3-tts-customvoice', voice: e.TTS_VOICE || 'Sohee' },
    port: Number(e.PORT || 8787),
    mock: e.MOCK_AI === '1' || !e.AIR_API_KEY,
  };
}
