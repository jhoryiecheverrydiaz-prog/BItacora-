import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter } from './fixtures.js';
import { toggleCheck, toggleDayOff } from '../js/core/months.js';
import { setLog } from '../js/core/checkin.js';
import * as I from '../js/core/insights.js';

// Arranque el 22 oct (jueves), hoy 31 oct: 10 días.
const mk = () => {
  const st = starter({ startKey: '2026-10-22', today: '2026-10-29' });
  const [gym, med, agua] = st.months['2026-10'].habits;
  return { st, gym, med, agua };
};

test('rangeKeys: solo días transcurridos, del mes registrado y no libres', () => {
  const { st } = mk();
  toggleDayOff(st, '2026-10-25');
  const keys = I.rangeKeys(st, '2026-10-01', '2026-10-31');
  assert.equal(keys[0], '2026-10-22');
  assert.equal(keys.length, 9);
  assert.ok(!keys.includes('2026-10-25'));
  assert.equal(I.lastDays(st, '2026-10-31', 7).length, 6); // 25-31 sin el día libre
});

test('summarize: promedios del registro', () => {
  const { st, med } = mk();
  setLog(st, '2026-10-22', { energy: 4, mood: 2, bed: '22:00', wake: '06:00', focus: 3, task1: 'A' });
  setLog(st, '2026-10-23', { energy: 2, bed: '01:00', wake: '06:00' });
  toggleCheck(st, '2026-10-22', med.id);
  const s = I.summarize(st, I.rangeKeys(st, '2026-10-22', '2026-10-23'));
  assert.equal(s.days, 2);
  assert.equal(s.energy, 3);
  assert.equal(s.mood, 2);
  assert.equal(s.sleep, 6.5);
  assert.equal(s.goodNights, 1);
  assert.equal(s.focus, 3);
  assert.equal(s.task1Days, 1);
  assert.equal(s.pct, 1 / 6);
});

test('habitImpact: energía con y sin el hábito; null sin muestra suficiente', () => {
  const { st, med } = mk();
  const days = [22, 23, 24, 25, 26, 27];
  days.forEach((d, i) => {
    const k = `2026-10-${d}`;
    setLog(st, k, { energy: i < 3 ? 5 : 2 });
    if (i < 3) toggleCheck(st, k, med.id);
  });
  const keys = I.rangeKeys(st, '2026-10-22', '2026-10-27');
  const r = I.habitImpact(st, keys, med.id, 'energy');
  assert.deepEqual(r, { with: 5, without: 2, diff: 3, nWith: 3, nWithout: 3 });
  assert.equal(I.habitImpact(st, keys.slice(0, 4), med.id, 'energy'), null);
  const f = I.findings(st, keys);
  assert.ok(f.some((t) => t.includes('MED') && t.includes('energía promedia 5,0')));
});

test('sleepImpact y weekdayProfile', () => {
  const { st, med, agua, gym } = mk();
  for (let d = 22; d <= 31; d++) {
    const k = `2026-10-${d}`;
    const good = d % 2 === 0;
    setLog(st, k, good ? { bed: '22:00', wake: '06:00' } : { bed: '01:00', wake: '06:00' });
    if (good) { toggleCheck(st, k, med.id); toggleCheck(st, k, agua.id); toggleCheck(st, k, gym.id); }
  }
  const keys = I.rangeKeys(st, '2026-10-22', '2026-10-31');
  const s = I.sleepImpact(st, keys);
  assert.equal(s.good, 1);
  assert.equal(s.bad, 0);
  const wp = I.weekdayProfile(st, keys);
  assert.equal(wp.length, 7);
  assert.ok(I.findings(st, keys).some((t) => t.startsWith('Tras dormir 7 h')));
});

test('monthTrend: meses sin datos quedan en null', () => {
  const { st, med } = mk();
  toggleCheck(st, '2026-10-22', med.id);
  setLog(st, '2026-10-22', { energy: 4 });
  const t = I.monthTrend(st, '2026-10-31', 3);
  assert.deepEqual(t.map((x) => x.key), ['2026-08', '2026-09', '2026-10']);
  assert.equal(t[0].pct, null);
  assert.equal(t[2].energy, 4);
  assert.ok(t[2].pct > 0);
});
