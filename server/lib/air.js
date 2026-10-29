// Air API (OpenAI 호환) 클라이언트 — 의존성 없음
import { cfg } from './env.js';

const noThinkingRejected = new Set(); // 이 파라미터를 거부한 엔드포인트 기억

export class AirError extends Error {
  constructor(msg, status, body) { super(msg); this.status = status; this.body = body; }
}

async function post(url, body, { timeoutMs = 30000, raw = false } = {}) {
  const c = cfg();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AirError(`Air API ${res.status}: ${text.slice(0, 300)}`, res.status, text);
    }
    return raw ? res : res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new AirError(`Air API 시간 초과 (${timeoutMs}ms)`, 504);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** 생각(<think>) 블록 제거 */
export function stripThinking(s) {
  return String(s || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*?<\/think>/, '').trim();
}

/** 모델 출력에서 JSON 객체 하나를 최대한 꺼낸다 */
export function parseJsonLoose(s) {
  s = stripThinking(s).replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(s); } catch {}
  const start = s.indexOf('{');
  if (start < 0) throw new Error('JSON 없음');
  // 괄호 균형으로 끝 찾기
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return JSON.parse(s.slice(start, i + 1)); }
  }
  // 잘린 JSON: 닫는 괄호를 채워 본다
  let cut = s.slice(start);
  const stack = [];
  inStr = false; esc = false;
  for (const ch of cut) {
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (inStr) cut += '"';
  cut = cut.replace(/,\s*$/, '').replace(/,\s*"[^"]*"\s*:?\s*$/, '');
  while (stack.length) cut += stack.pop();
  return JSON.parse(cut);
}

/**
 * chat({kind:'vision'|'text', messages, maxTokens, temperature})
 * 반환: { text, usage, ms, model }
 */
export async function chat({ kind = 'text', messages, maxTokens = 600, temperature = 0.1, timeoutMs = 30000, override }) {
  const c = cfg();
  const m = override || c[kind];
  const url = `${c.base}/${m.endpoint}/v1/chat/completions`;
  // 글 모델(DeepSeek-V4.1-Flash)은 답 전에 생각(reasoning)부터 길게 써서 max_tokens를 먼저 써 버린다.
  // 생각 몫을 따로 얹어 준다. (점검: scripts/probe-text.mjs — 1200이면 생각만 하다 끝남, 4000이면 답이 나옴)
  const pad = kind === 'text' ? Number(process.env.REASONING_TOKENS || 3000) : 0;
  const body = { model: m.model, messages, max_tokens: maxTokens + pad, temperature };
  const tryNoThink = /qwen/i.test(m.model) && !noThinkingRejected.has(m.endpoint);
  if (tryNoThink) body.chat_template_kwargs = { enable_thinking: false };
  const t0 = Date.now();
  let j;
  try {
    j = await post(url, body, { timeoutMs });
  } catch (e) {
    if (tryNoThink && e.status === 400) {
      noThinkingRejected.add(m.endpoint);
      delete body.chat_template_kwargs;
      j = await post(url, body, { timeoutMs });
    } else throw e;
  }
  const text = j?.choices?.[0]?.message?.content ?? '';
  if (!text && j?.choices?.[0]?.finish_reason === 'length') throw new AirError('모델이 생각하다 글자 수 한도에 걸렸어요 (REASONING_TOKENS를 늘려 보세요)', 502);
  return { text: stripThinking(text), usage: j.usage, ms: Date.now() - t0, model: m.model };
}

/** Qwen3-TTS → mp3 Buffer */
export async function tts({ text, instructions, voice, format = 'mp3', timeoutMs = 20000 }) {
  const c = cfg();
  const url = `${c.base}/${c.tts.endpoint}/v1/audio/speech`;
  const res = await post(url, {
    model: c.tts.model,
    input: text,
    voice: voice || c.tts.voice,
    response_format: format,
    instructions: instructions || '어르신께 말하듯 또박또박, 따뜻하고 차분하게 말하세요.',
  }, { timeoutMs, raw: true });
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, type: res.headers.get('content-type') || 'audio/mpeg' };
}
