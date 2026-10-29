import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, speak, won } from '../server/lib/guide.js';
import { normalizeScreen } from '../server/lib/vision.js';
import { check, simplify, hardWords, josa, glossFor } from '../server/lib/plain.js';
import { gridName, colorName } from '../server/lib/layout.js';
import { parseJsonLoose } from '../server/lib/air.js';
import { parseGoalRule, confirmText } from '../server/lib/goal.js';

const dine = normalizeScreen({
  kiosk: true, quality: 'ok', screen: [100, 100, 900, 900], type: 'dine', title: '식사 장소를 선택해주세요',
  els: [
    { id: 1, t: 'Eat in', r: '이트 인', k: 'btn', b: [150, 400, 480, 700] },
    { id: 2, t: 'Take out', r: '테이크아웃', k: 'btn', b: [520, 400, 850, 700] },
  ],
  pick: 2, say: '테이크아웃 여부를 선택하는 화면이에요.', conf: 0.9,
});

test('위치는 키오스크 화면 기준 9칸', () => {
  assert.equal(gridName([520, 400, 850, 700], [100, 100, 900, 900]).name, '오른쪽 가운데');
  assert.equal(gridName([700, 120, 880, 220], [100, 100, 900, 900]).name, '오른쪽 위');
  assert.equal(gridName([400, 400, 600, 600]).name, '한가운데');
});

test('색 이름 규칙', () => {
  assert.equal(colorName(242, 194, 48), '노란');
  assert.equal(colorName(31, 78, 156), '파란');
  assert.equal(colorName(217, 58, 43), '빨간');
  assert.equal(colorName(250, 250, 250), '흰');
  assert.equal(colorName(20, 20, 20), '검은');
});

test('조사', () => {
  assert.equal(josa('포장', '을/를'), '을');
  assert.equal(josa('아이스', '을/를'), '를');
  assert.equal(josa('테이크아웃', '이라고/라고'), '이라고');
});

test('쉬운 말 치환은 따옴표 안을 보호', () => {
  assert.equal(simplify("테이크아웃 화면이에요. '테이크아웃'을 누르세요."), "가지고 가기 화면이에요. '테이크아웃'을 누르세요.");
  assert.deepEqual(hardWords("'결제하기'를 누르세요."), []);
  assert.ok(hardWords('결제 화면이에요.').includes('결제'));
  assert.equal(glossFor('ICE'), '차가운 것');
});

test('검사기: 길이·할 일 개수', () => {
  assert.ok(check('오른쪽 위를 보세요.').ok);
  const bad = check('메뉴를 고르시고 수량을 정한 다음 장바구니에 담아서 결제하기를 누르세요 그리고 카드를 넣으세요.');
  assert.equal(bad.ok, false);
});

test('포장 안내 문장', () => {
  const p = plan(dine, { goal: { place: 'takeout' } }, { experience: 'first' });
  assert.equal(p.action, 'press');
  const o = speak({ plan: p, screen: dine, img: null, profile: { experience: 'first' } });
  assert.match(o.utterance, /화면 오른쪽 가운데/);
  assert.match(o.utterance, /영어로 '테이크아웃'이라고 써 있어요/);
  assert.match(o.utterance, /가지고 가기라는 뜻이에요/);
  assert.match(o.utterance, /그걸 누르세요\.$/);
  assert.ok(!/테이크아웃 여부/.test(o.utterance), '모델 상황 문장 속 외래어는 바뀌어야 함');
  assert.equal(o.check.ok, true, o.check.problems.join('; '));
});

test('자주 쓰는 사람은 짧게', () => {
  const p = plan(dine, {}, { experience: 'often' });
  const o = speak({ plan: p, screen: dine, profile: { experience: 'often' } });
  assert.equal(o.lines.length, 1);
});

test('결제는 확인 전에 안내하지 않음', () => {
  const pay = normalizeScreen({ type: 'pay_method', total: 4500, els: [{ id: 1, t: '카드결제', k: 'pay', b: [100, 600, 400, 800] }], pick: 1, conf: 0.9 });
  const p = plan(pay, {}, {});
  assert.equal(p.action, 'confirm_pay');
  const o = speak({ plan: p, screen: pay, profile: {} });
  assert.match(o.utterance, /4천5백 원/);
  assert.equal(plan(pay, { payConfirmed: true }, {}).action, 'press');
});

test('권유 창은 거절 버튼으로', () => {
  const up = normalizeScreen({ type: 'upsell', els: [{ id: 1, t: '세트로 변경', k: 'yes', b: [100, 600, 480, 800] }, { id: 2, t: '괜찮아요', k: 'no', b: [520, 600, 900, 800] }], pick: 1, conf: 0.8 });
  const p = plan(up, { goal: { items: [{ name: '불고기버거' }] } }, {});
  assert.equal(p.target.id, 2);
});

test('같은 화면이 계속되면 막힘 → 3번이면 도움', () => {
  const st = { lastSig: 'dine|Eat in,Take out', lastAction: 'press' };
  const p1 = plan(dine, st, {});
  assert.equal(p1.action, 'stuck');
  const p3 = plan(dine, { ...st, stuck: 2 }, {});
  assert.equal(p3.action, 'help');
});

test('흐린 사진은 다시 찍기', () => {
  const s = normalizeScreen({ kiosk: true, quality: 'blur', els: [] });
  assert.equal(plan(s, {}, {}).action, 'retake');
});

test('모델 JSON 느슨한 해석', () => {
  assert.deepEqual(parseJsonLoose('<think>음</think>```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('결과: {"a":{"b":[1,2]}} 끝'), { a: { b: [1, 2] } });
  assert.equal(parseJsonLoose('{"a":[1,2').a.length, 2);
});

test('금액 읽기', () => {
  assert.equal(won(4500), '4천5백 원');
  assert.equal(won(12000), '1만2천 원');
  assert.equal(won(1000), '천 원');
});

test('목표 규칙 해석·되묻기', () => {
  const g = parseGoalRule('아이스 아메리카노 하나 가져갈 거야');
  assert.equal(g.items[0].name, '아메리카노');
  assert.equal(g.items[0].temp, 'ice');
  assert.equal(g.place, 'takeout');
  assert.equal(confirmText(g), '차가운 아메리카노 한 잔, 가지고 가기. 맞아요?');
});
