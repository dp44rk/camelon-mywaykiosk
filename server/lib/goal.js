// 목표 이해: "아이스 아메리카노 하나 가져갈 거야" → 구조 + 되묻기 문장
import { chat, parseJsonLoose } from './air.js';
import { simplify, check } from './plain.js';
import { parseGoalRule, confirmText } from './goal-rules.js';
export { parseGoalRule, confirmText };

const SYSTEM = `어르신이 키오스크에서 하려는 주문을 JSON으로 정리한다. JSON만 출력.
형식: {"items":[{"name":"아메리카노","qty":1,"unit":"잔","temp":"ice","size":null,"extra":[]}],"place":"takeout","pay":null,"unclear":null}
- temp: hot | ice | null. place: takeout(가져감·포장) | eatin(먹고 감·매장) | null. pay: card | phone | cash | null.
- unit: 마실 것은 "잔", 그 밖은 "개". qty 모르면 1.
- 메뉴 이름은 들은 그대로. 지어내지 않는다.
- unclear: 꼭 물어봐야 할 것이 있으면 쉬운 우리말 질문 한 문장, 없으면 null.`;

export async function understandGoal(text, { mock } = {}) {
  let goal;
  let source = 'rule';
  if (!mock) {
    try {
      const r = await chat({ kind: 'text', maxTokens: 300, temperature: 0, timeoutMs: 25000, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }] });
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
    const r = await chat({ kind: 'text', maxTokens: 120, temperature: 0.2, timeoutMs: 25000, messages: [{ role: 'system', content: EXPLAIN_SYS }, { role: 'user', content: term }] });
    const t = simplify(r.text.trim());
    if (check(t, { maxWords: 10, maxSentences: 2, maxActions: 1 }).ok) return { text: t, source: r.model };
    return { text: t.split(/(?<=[.?!])\s/)[0], source: r.model + ':trim' };
  } catch {
    return { text: `'${term}'의 뜻은 직원에게 물어보세요.`, source: 'error' };
  }
}
