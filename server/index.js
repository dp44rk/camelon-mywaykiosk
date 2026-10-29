// 내 방식 QR — 중계 서버 (의존성: jpeg-js 하나)
// - Air API 키를 브라우저에 노출하지 않기 위한 중계
// - 폰 웹앱(public/)과 목업 키오스크(kiosk/)를 함께 제공
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, cfg } from './lib/env.js';
import { understand } from './lib/vision.js';
import { runStep, fromKioskState } from './lib/engine.js';
import { understandGoal, explainTerm } from './lib/goal.js';
import { tts } from './lib/air.js';
import { KioskHub } from './lib/hub.js';
import { ruleConvert, validate, convertPrompt } from './lib/convert.js';
import { chat, parseJsonLoose } from './lib/air.js';
import { normalizeScreen } from './lib/screen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(ROOT);
const C = cfg();
const hub = new KioskHub();
const LOG_DIR = path.join(ROOT, 'eval', 'private', 'logs');

let jpeg = null;
try { jpeg = (await import('jpeg-js')).default; } catch { console.warn('[경고] jpeg-js 없음: npm install 하면 색 이름 안내가 켜져요'); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };

function send(res, code, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': isBuf ? 'application/octet-stream' : typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', ...cors(), ...headers });
  res.end(data);
}
function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
async function readJson(req, limit = 8 * 1024 * 1024) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error('너무 큰 요청'), { status: 413 }); chunks.push(c); }
  if (!n) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const SHARED = new Set(['engine.js', 'guide.js', 'layout.js', 'plain.js', 'screen.js', 'goal-rules.js', 'convert.js']); // 브라우저와 같이 쓰는 순수 모듈
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  let base = path.join(ROOT, 'public');
  const sm = rel.match(/^\/lib\/([\w-]+\.js)$/);
  if (sm) { if (!SHARED.has(sm[1])) return send(res, 404, 'not found'); base = path.join(ROOT, 'server', 'lib'); rel = '/' + sm[1]; }
  if (rel.startsWith('/kiosk')) { base = path.join(ROOT, 'kiosk'); rel = rel.slice('/kiosk'.length) || '/'; }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(base, rel);
  if (!file.startsWith(base)) return send(res, 403, 'forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...cors() });
    fs.createReadStream(file).pipe(res);
  });
}

function decodeImage(dataUrl) {
  if (!jpeg || !dataUrl) return null;
  const m = String(dataUrl).match(/^data:image\/jpe?g;base64,(.+)$/);
  if (!m) return null;
  try { return jpeg.decode(Buffer.from(m[1], 'base64'), { useTArray: true, maxMemoryUsageInMB: 256 }); } catch { return null; }
}

function logStep(entry) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, `steps-${new Date().toISOString().slice(0, 10)}.jsonl`), JSON.stringify(entry) + '\n');
  } catch {}
}

// ---------- /api/step : 한 단계 안내 ----------
async function handleStep(body) {
  const t0 = Date.now();
  const { image, goal, profile = {}, kioskId } = body;
  const state = body.state || {};
  let screen, source, visionMs = 0, model = null, rawText;

  const linked = kioskId && hub.getState(kioskId);
  if (linked) {
    screen = fromKioskState(linked.screen, goal, state); // 연동 모드: 키오스크가 직접 알려준 화면 구조
    source = 'linked';
  } else if (C.mock) {
    return { error: 'AI 키가 없어서 카메라 모드를 쓸 수 없어요. 연동 키오스크의 QR을 찍거나 .env에 AIR_API_KEY를 넣어 주세요.', mock: true };
  } else {
    if (!image) return { error: '사진이 없어요.' };
    const r = await understand({ imageDataUrl: image, goal, history: state.history, profile });
    screen = r.screen; visionMs = r.ms; model = r.model; rawText = r.rawText; source = 'camera';
  }

  const img = source === 'camera' ? decodeImage(image) : null;
  const res = runStep({ screen, img, goal, state, profile, source });
  res.model = model;
  res.ms = { total: Date.now() - t0, vision: visionMs };
  logStep({ at: new Date().toISOString(), goal, profile, state, res, rawText });
  return res;
}

// ---------- /api/convert : AI 화면 변환 ----------
const convCache = new Map(); // 같은 화면·같은 프로필 → 저장해 둔 변환 재사용
async function handleConvert(body) {
  const t0 = Date.now();
  const raw = body.screen || {};
  const screen = normalizeScreen({ ...raw, els: (raw.els || []).map((e) => ({ ...e, b: e.b || e.box })) });
  const key = screen.type + '|' + screen.els.map((e) => `${e.id}:${e.t}:${e.k}:${e.sel ? 1 : 0}`).join(',') + '|' + (body.profile?.experience || '');
  if (convCache.has(key)) return { ...convCache.get(key), cached: true, ms: Date.now() - t0 };
  let out;
  if (!C.mock) {
    try {
      const r = await chat({ kind: 'text', messages: convertPrompt(screen, body.profile), maxTokens: 1200, temperature: 0, timeoutMs: 15000 });
      const plan = parseJsonLoose(r.text); plan.source = r.model;
      const v = validate(plan, screen);
      out = { plan: v.plan, report: v.report, source: r.model, aiMs: r.ms };
    } catch (e) { out = null; console.warn('[변환] AI 실패 → 규칙:', e.message); }
  }
  if (!out) { const v = validate(ruleConvert(screen), screen); out = { plan: v.plan, report: v.report, source: 'rule' }; }
  convCache.set(key, out);
  if (convCache.size > 500) convCache.delete(convCache.keys().next().value);
  logStep({ at: new Date().toISOString(), kind: 'convert', type: screen.type, source: out.source, report: out.report });
  return { ...out, cached: false, ms: Date.now() - t0 };
}

// ---------- TTS 캐시 ----------
const ttsCache = new Map();
async function handleTts(body) {
  const text = String(body.text || '').slice(0, 400);
  if (!text) throw Object.assign(new Error('글이 없어요'), { status: 400 });
  if (C.mock) throw Object.assign(new Error('TTS 키 없음 — 폰 내장 음성을 쓰세요'), { status: 503 });
  const k = text + '|' + (body.voice || '');
  if (ttsCache.has(k)) return ttsCache.get(k);
  const r = await tts({ text, voice: body.voice, instructions: body.instructions });
  ttsCache.set(k, r);
  if (ttsCache.size > 300) ttsCache.delete(ttsCache.keys().next().value);
  return r;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, '');
  try {
    if (p === '/api/health') return send(res, 200, { ok: true, mock: C.mock, vision: C.vision.model, text: C.text.model, tts: C.tts.model, color: !!jpeg });
    if (p === '/api/step' && req.method === 'POST') return send(res, 200, await handleStep(await readJson(req)));
    if (p === '/api/convert' && req.method === 'POST') return send(res, 200, await handleConvert(await readJson(req)));
    if (p === '/api/goal' && req.method === 'POST') { const b = await readJson(req); return send(res, 200, await understandGoal(String(b.text || ''), { mock: C.mock })); }
    if (p === '/api/explain' && req.method === 'POST') { const b = await readJson(req); return send(res, 200, await explainTerm(String(b.term || ''), { mock: C.mock })); }
    if (p === '/api/tts' && req.method === 'POST') { const r = await handleTts(await readJson(req)); return send(res, 200, r.buf, { 'Content-Type': r.type, 'Cache-Control': 'max-age=3600' }); }

    let m;
    if ((m = p.match(/^\/api\/kiosk\/([\w-]{1,40})\/(state|profile|reset|pay)$/))) {
      const [, id, what] = m;
      if (what === 'state' && req.method === 'POST') return send(res, 200, hub.setState(id, (await readJson(req)).screen));
      if (what === 'state') return send(res, 200, await hub.waitState(id, Number(url.searchParams.get('since') || 0), Number(url.searchParams.get('wait') || 0)));
      if (what === 'profile' && req.method === 'POST') return send(res, 200, hub.setProfile(id, (await readJson(req)).profile));
      if (what === 'profile') return send(res, 200, await hub.waitProfile(id, Number(url.searchParams.get('since') || 0), Number(url.searchParams.get('wait') || 0)));
      if (what === 'reset') return send(res, 200, hub.reset(id));
      if (what === 'pay' && req.method === 'POST') {
        const b = await readJson(req);
        await new Promise((r) => setTimeout(r, 1200));
        return send(res, 200, { ok: true, approval: 'MOCK-' + Math.random().toString(36).slice(2, 8).toUpperCase(), total: b.total, note: '목업 결제입니다. 실제 돈이 나가지 않아요.' });
      }
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: '없는 주소' });
    return serveStatic(req, res, p);
  } catch (e) {
    console.error('[오류]', p, e.message);
    return send(res, e.status && e.status < 600 ? e.status : 500, { error: e.message });
  }
});

server.listen(C.port, () => {
  console.log(`내 방식 QR 서버: http://localhost:${C.port}`);
  console.log(`  폰 앱      /         목업 키오스크  /kiosk/cafe.html  /kiosk/restaurant.html`);
  console.log(`  AI 모드    ${C.mock ? '꺼짐 (MOCK — 연동 키오스크만 동작)' : `켜짐 · 화면 ${C.vision.model} · 글 ${C.text.model}`}`);
  console.log('  폰 카메라는 HTTPS가 필요해요 → 다른 터미널에서  npm run tunnel');
});
