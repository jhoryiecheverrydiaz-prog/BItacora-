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

test('días libres: no suman a lo esperado ni a días registrados; no son "en blanco"', async () => {
  const { toggleDayOff, yesterdayWasBlank } = await import('../js/core/months.js');
  const st = starter();
  const m = st.months['2026-10'];
  const [, med] = ids(st);
  toggleCheck(st, '2026-10-28', med);
  assert.equal(toggleDayOff(st, '2026-10-29'), true);
  assert.equal(yesterdayWasBlank(st, '2026-10-30'), false);
  const s = S.habitStats(m, m.habits[1], '2026-10-29');
  assert.deepEqual([s.done, s.expected, s.pct], [1, 1, 1]);
  const ms = S.monthStats(m, '2026-10-29');
  assert.equal(ms.daysElapsed, 1);
  assert.equal(ms.daysOff, 1);
  assert.equal(ms.series[28].off, true);
  assert.equal(ms.series[28].pct, null);
  assert.equal(toggleDayOff(st, '2026-10-29'), false);
  assert.equal(m.days['2026-10-29'], undefined, 'el día vacío se limpia');
  assert.throws(() => toggleDayOff(st, '2026-10-01'), /fuera/);
});

test('frecuencia mensual: esperado proporcional al mes', () => {
  const h = { target: { type: 'monthly', count: 4 } };
  assert.equal(S.expectedFor(h, 31, 31), 4);
  assert.equal(S.expectedFor(h, 15, 30), 2);
  assert.equal(S.expectedFor(h, 5, 30), 0);
});

test('% del mes, % por semana y % diario', () => {
  const st = starter();
  const m = st.months['2026-10'];
  const [gym, med, agua] = ids(st);
  toggleCheck(st, '2026-10-28', med); toggleCheck(st, '2026-10-28', agua);
  toggleCheck(st, '2026-10-29', med); toggleCheck(st, '2026-10-29', gym);
  const ms = S.monthStats(m, '2026-10-29');
  // esperado: GYM 4/sem en 2 días → 1; MED 2; AGUA 2 → hecho tope: 1+2+1 = 4/5
  assert.equal(ms.pct, 0.8);
  assert.equal(ms.series[27].pct, 2 / 3);
  assert.equal(ms.avgDayPct, 2 / 3);
  assert.equal(ms.weeks.length, 1);
  assert.equal(ms.weeks[0].start, '2026-10-28');
  assert.equal(ms.weeks[0].pct, 0.8);
  assert.equal(S.combinedPct([]), null);
});

test('rachas: días libres no cortan, hoy sin marcar no corta, solo diarios', () => {
  const st = starter({ startKey: '2026-10-22', today: '2026-10-29' });
  const m = st.months['2026-10'];
  const [gym, med] = ids(st);
  for (const d of [22, 23, 25, 26, 27, 28]) toggleCheck(st, `2026-10-${d}`, med);
  st.months['2026-10'].days['2026-10-24'] = { note: '', checks: {}, off: true };
  assert.deepEqual(S.streaks(m, m.habits[1], '2026-10-29'), { current: 6, max: 6 });
  assert.deepEqual(S.streaks(m, m.habits[1], '2026-10-30'), { current: 0, max: 6 });
  assert.equal(S.streaks(m, m.habits[0], '2026-10-29'), null);
  void gym;
});

test('avance mensual en Hoy', () => {
  const st = starter();
  const [, med] = ids(st);
  toggleCheck(st, '2026-10-28', med);
  assert.deepEqual(S.monthProgress(st, { id: med, target: { type: 'monthly', count: 3 } }, '2026-10-29'), { done: 1, target: 3 });
});

test('fuerza del hábito: sube con constancia, cruza meses, ignora días libres', () => {
  const st = starter({ startKey: '2026-10-22', today: '2026-10-29' });
  const m = st.months['2026-10'];
  const med = m.habits[1];
  assert.equal(S.habitStrength(st, med, '2026-10-21'), null);
  for (let d = 22; d <= 29; d++) toggleCheck(st, `2026-10-${d}`, med.id);
  const s8 = S.habitStrength(st, med, '2026-10-29');
  assert.ok(s8 > 0.3 && s8 < 0.4, String(s8));
  m.days['2026-10-30'] = { note: '', checks: {}, off: true };
  assert.equal(S.habitStrength(st, med, '2026-10-30'), s8, 'el día libre no cambia la fuerza');
  const s9 = S.habitStrength(st, med, '2026-10-31');
  assert.ok(s9 < s8, 'un día sin marcar la baja un poco');
  const gym = m.habits[0]; // 4/sem: 4 marcas en 7 días = semana cumplida
  for (const d of [22, 24, 26, 28]) toggleCheck(st, `2026-10-${d}`, gym.id);
  const g = S.habitStrength(st, gym, '2026-10-28');
  const daily4 = S.habitStrength(st, { id: 'x', target: { type: 'daily' } }, '2026-10-28');
  assert.ok(g > 0.15, String(g));
  assert.equal(daily4, null, 'hábito sin días en ningún mes');
});

test('mapa de calor del año', () => {
  const st = starter();
  const [gym, med] = ids(st);
  toggleCheck(st, '2026-10-28', med); toggleCheck(st, '2026-10-28', gym);
  const hm = S.yearHeatmap(st, '2026', '2026-10-29');
  assert.equal(hm.length, 302);
  assert.equal(hm[0].key, '2026-01-01');
  assert.equal(hm[0].pct, null);
  assert.equal(hm.find((x) => x.key === '2026-10-28').pct, 2 / 3);
  assert.equal(hm.at(-1).key, '2026-10-29');
});
