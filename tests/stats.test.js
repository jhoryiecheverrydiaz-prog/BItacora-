import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter } from './fixtures.js';
import { toggleCheck, setNote } from '../js/core/months.js';
import * as S from '../js/core/stats.js';

const ids = (st) => st.months['2026-10'].habits.map((h) => h.id);

test('mes parcial: solo cuentan 28-31 oct', () => {
  const st = starter();
  const m = st.months['2026-10'];
  assert.deepEqual(S.elapsedKeys(m, '2026-10-29'), ['2026-10-28', '2026-10-29']);
  assert.equal(S.elapsedKeys(m, '2026-11-01').length, 4);
  assert.equal(S.elapsedKeys(m, '2026-10-20').length, 0);
});

test('hábito semanal 4/sem: esperado proporcional, redondeo hacia abajo', () => {
  const st = starter();
  const m = st.months['2026-10'];
  const [gym, med] = ids(st);
  toggleCheck(st, '2026-10-28', gym);
  toggleCheck(st, '2026-10-30', gym); toggleCheck(st, '2026-10-30', gym); // min
  const s = S.habitStats(m, m.habits[0], '2026-11-01');
  assert.deepEqual(s, { done: 2, full: 1, min: 1, expected: 2, pct: 1 });
  assert.equal(S.expectedFor({ target: { type: 'weekly', count: 4 } }, 31), 17);
  assert.equal(S.expectedFor({ target: { type: 'weekly', count: 4 } }, 1), 0);
  assert.equal(S.habitStats(m, m.habits[1], '2026-10-29').expected, 2);
  assert.equal(S.habitStats(m, m.habits[1], '2026-10-29').pct, 0);
  assert.equal(S.pctOf(0, 0), null);
  void med;
});

test('mínimo cuenta como cumplido; score y blank', () => {
  const st = starter();
  const m = st.months['2026-10'];
  const [gym, med, agua] = ids(st);
  toggleCheck(st, '2026-10-28', med); toggleCheck(st, '2026-10-28', med); // min
  toggleCheck(st, '2026-10-28', agua);
  assert.equal(S.dayScore(m, '2026-10-28'), 2);
  assert.ok(S.isBlank(m.days['2026-10-29']));
  setNote(st, '2026-10-29', 'algo');
  assert.ok(!S.isBlank(m.days['2026-10-29']));
  const ms = S.monthStats(m, '2026-10-31');
  assert.equal(ms.daysElapsed, 4);
  assert.equal(ms.daysRegistered, 2);
  assert.equal(ms.pctRegistered, 0.5);
  assert.deepEqual(ms.bestDay, { day: 28, key: '2026-10-28', score: 2 });
  assert.equal(ms.weakestWeekday, null);
  assert.equal(ms.series.length, 31);
  assert.equal(ms.series[0].counts, false);
  void gym;
});

test('día de la semana más flojo con ≥ 7 días', () => {
  const st = starter({ startKey: '2026-10-22' });
  const m = st.months['2026-10'];
  const [, med] = ids(st);
  for (let d = 22; d <= 31; d++) if (d !== 26) toggleCheck(st, `2026-10-${d}`, med); // lunes 26 vacío
  assert.equal(S.monthStats(m, '2026-11-01').weakestWeekday, 0);
});

test('weekProgress cruza el cambio de mes', () => {
  const st = starter();
  const gym = st.months['2026-10'].habits[0];
  toggleCheck(st, '2026-10-28', gym.id);
  toggleCheck(st, '2026-10-31', gym.id);
  assert.deepEqual(S.weekProgress(st, gym, '2026-11-01'), { done: 2, target: 4 });
});

test('sugerencias del cierre', () => {
  assert.equal(S.suggestDecision(0.8), 'up');
  assert.equal(S.suggestDecision(0.79), 'keep');
  assert.equal(S.suggestDecision(0.5), 'keep');
  assert.equal(S.suggestDecision(0.49), 'down');
  assert.equal(S.suggestDecision(null), 'keep');
});
