// 목표 이해: "아이스 아메리카노 하나 가져갈 거야" → 구조 + 되묻기 문장
import { chat, parseJsonLoose } from './air.js';
import { simplify, check } from './plain.js';

const SYSTEM = `어르신이 키오스크에서 하려는 주문을 JSON으로 정리한다. JSON만 출력.
형식: {"items":[{"name":"아메리카노","qty":1,"unit":"잔","temp":"ice","size":null,"extra":[]}],"place":"takeout","pay":null,"unclear":null}
- temp: hot | ice | null. place: takeout(가져감·포장) | eatin(먹고 감·매장) | null. pay: card | phone | cash | null.
- unit: 마실 것은 "잔", 그 밖은 "개". qty 모르면 1.
- 메뉴 이름은 들은 그대로. 지어내지 않는다.
- unclear: 꼭 물어봐야 할 것이 있으면 쉬운 우리말 질문 한 문장, 없으면 null.`;

const NUM = { 하나: 1, 한: 1, 둘: 2, 두: 2, 셋: 3, 세: 3, 넷: 4, 네: 4, 다섯: 5 };
const KNUM = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

/** API 없이 쓰는 간이 해석 (MOCK / 실패 시) */
export function parseGoalRule(text) {
  const t = String(text);
  const place = /가져|포장|테이크|들고/.test(t) ? 'takeout' : /먹고|매장|여기서/.test(t) ? 'eatin' : null;
  const temp = /아이스|차가운|시원|찬 /.test(t) ? 'ice' : /따뜻|뜨거운|핫/.test(t) ? 'hot' : null;
  let qty = 1;
  const m = t.match(/(하나|한|둘|두|셋|세|넷|네|다섯|\d+)\s*(잔|개|그릇|인분)?/);
  if (m) qty = NUM[m[1]] || Number(m[1]) || 1;
  const menu = ['아메리카노', '카페라떼', '라떼', '바닐라라떼', '카푸치노', '아이스티', '레몬에이드', '녹차', '초코', '김치찌개', '된장찌개', '비빔밥', '제육', '불고기', '돈가스', '냉면', '칼국수', '국밥', '떡볶이', '김밥', '라면', '치즈버거', '불고기버거', '감자튀김', '콜라'];
  const name = menu.find((x) => t.includes(x)) || t.replace(/(하나|한\s?잔|가져갈.*|먹고.*|주세요|줘|할래|거야).*/g, '').replace(/아이스|따뜻한|차가운/g, '').trim() || null;
  const drink = /커피|라떼|아메리카노|티|에이드|차|초코|콜라|주스/.test(t);
  return { items: name ? [{ name, qty, unit: drink ? '잔' : '개', temp, size: null, extra: [] }] : [], place, pay: null, unclear: null };
}

export function confirmText(goal) {
  if (!goal?.items?.length) return '무엇을 주문할지 다시 말해 주세요.';
  const parts = goal.items.map((i) => {
    const temp = i.temp === 'ice' ? '차가운 ' : i.temp === 'hot' ? '따뜻한 ' : '';
    const q = KNUM[i.qty] || i.qty;
    return `${temp}${i.name} ${q} ${i.unit || '개'}`;
  });
  const place = goal.place === 'takeout' ? ', 가지고 가기' : goal.place === 'eatin' ? ', 여기서 먹기' : '';
  return `${parts.join(', ')}${place}. 맞아요?`;
}

export async function understandGoal(text, { mock } = {}) {
  let goal;
  let source = 'rule';
  if (!mock) {
    try {
      const r = await chat({ kind: 'text', maxTokens: 300, temperature: 0, timeoutMs: 12000, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }] });
      goal = parseJsonLoose(r.text);
      source = r.model;
    } catch (e) {
      goal = null;
    }
  }
  if (!goal || !Array.isArray(goal.items)) goal = parseGoalRule(text);
  goal.items = goal.items.filter((i) => i && i.name).map((i) => ({ ...i, qty: Math.max(1, Math.min(20, Number(i.qty) || 1)) }));
  let ask = goal.unclear ? simplify(String(goal.unclear)) : null;
  if (ask && !check(ask, { maxWords: 10, maxSentences: 1 }).ok) ask = null;
  if (!goal.place && goal.items.length) ask = ask || '여기서 드세요, 가지고 가세요?';
  return { goal, confirm: confirmText(goal), ask, source };
}

const EXPLAIN_SYS = `어르신께 키오스크 화면의 낱말 뜻을 알려준다. 쉬운 우리말로 한두 문장, 문장마다 8어절 이하. 외래어를 쓰지 않는다. 그 낱말 자체는 따옴표로 감싼다.`;

export async function explainTerm(term, { mock } = {}) {
  const { glossFor } = await import('./plain.js');
  const g = glossFor(term);
  if (g) return { text: `'${term}'는 ${g}라는 뜻이에요.`, source: 'dict' };
  if (mock) return { text: `'${term}'의 뜻은 직원에게 물어보세요.`, source: 'none' };
  try {
    const r = await chat({ kind: 'text', maxTokens: 120, temperature: 0.2, timeoutMs: 10000, messages: [{ role: 'system', content: EXPLAIN_SYS }, { role: 'user', content: term }] });
    const t = simplify(r.text.trim());
    if (check(t, { maxWords: 10, maxSentences: 2, maxActions: 1 }).ok) return { text: t, source: r.model };
    return { text: t.split(/(?<=[.?!])\s/)[0], source: r.model + ':trim' };
  } catch {
    return { text: `'${term}'의 뜻은 직원에게 물어보세요.`, source: 'error' };
  }
}
