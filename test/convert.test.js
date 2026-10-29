import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleConvert, validate, plainLabel } from '../server/lib/convert.js';
import { normalizeScreen } from '../server/lib/screen.js';

const opt = normalizeScreen({ type: 'option', els: [
  { id: 1, t: 'HOT', k: 'btn', g: '온도', b: [100, 300, 480, 380] }, { id: 2, t: 'ICE', k: 'btn', g: '온도', b: [520, 300, 900, 380] },
  { id: 3, t: 'Regular', k: 'btn', g: '사이즈', b: [100, 420, 480, 500], sel: true }, { id: 4, t: 'Large', k: 'btn', g: '사이즈', b: [520, 420, 900, 500] },
  { id: 5, t: '취소', k: 'cancel', b: [100, 800, 480, 880] }, { id: 6, t: '담기 · 4,500원', k: 'yes', b: [520, 800, 900, 880] },
] });

test('규칙 변환: 묶음·쉬운 말·결정 버튼 먼저', () => {
  const p = ruleConvert(opt);
  assert.deepEqual(p.sections.find((s) => s.title === '온도').ids, [1, 2]);
  assert.equal(p.sections.find((s) => s.title === '크기').ids.length, 2);
  assert.equal(p.labels[2], '차가운 것');
  const act = p.sections.find((s) => s.role === 'actions');
  assert.equal(act.ids[0], 6, '담기가 취소보다 먼저');
  assert.ok(validate(p, opt).report.ok);
});

test('검증기: 지어낸 버튼 제거·빠진 버튼 채움·어려운 라벨 교체', () => {
  const bad = { title: '옵션 선택', sections: [{ title: '온도', ids: [1, 2, 99] }, { title: '', ids: [6, 6] }], labels: { 1: 'HOT', 2: '차가운 것', 6: '담기' } };
  const { plan, report } = validate(bad, opt);
  assert.equal(report.invented, 1);
  assert.equal(report.duplicated, 1);
  assert.equal(report.missing, 3);
  assert.equal(plan.labels[1], '따뜻한 것');
  const all = plan.sections.flatMap((s) => s.ids).sort();
  assert.deepEqual(all, [1, 2, 3, 4, 5, 6]);
  assert.equal(report.ok, false);
  assert.equal(report.coverage, 0.5);
});

test('라벨 사전', () => {
  assert.equal(plainLabel('Take out'), '가지고 가기');
  assert.equal(plainLabel('적립 안 함'), '점수 안 모으기');
  assert.equal(plainLabel('▶'), '다음 쪽');
});
