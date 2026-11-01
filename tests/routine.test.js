import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter } from './fixtures.js';
import * as M from '../js/core/months.js';
import * as R from '../js/core/routine.js';
import { addDays } from '../js/core/dates.js';

// Estado con un mes completo de octubre (arranca el 1) para tener historia.
function octState() {
  const st = starter();
  st.months['2026-10'].startDay = 1;
  return st;
}
const ids = (st) => st.months['2026-10'].habits.map((h) => h.id); // [GYM semanal, MED, AGUA]

test('franjas y horas', () => {
  assert.equal(R.slotOf(6), 'am');
  assert.equal(R.slotOf(12), 'pm');
  assert.equal(R.slotOf(20), 'night');
  assert.equal(R.slotOf(2), 'night');
  assert.equal(R.toMin('07:45'), 465);
  assert.equal(R.toHM(465), '07:45');
  assert.equal(R.toMin('x'), null);
  assert.equal(R.nowHM(new Date(2026, 0, 1, 9, 5)), '09:05');
});

test('toggleCheck/setCheck guardan la hora solo al marcar y la limpian al desmarcar', () => {
  const st = octState();
  const [, med] = ids(st);
  M.toggleCheck(st, '2026-10-10', med, '07:10');
  assert.equal(st.months['2026-10'].days['2026-10-10'].at[med], '07:10');
  M.toggleCheck(st, '2026-10-10', med, '07:20'); // full → min: conserva la hora del completo
  assert.equal(st.months['2026-10'].days['2026-10-10'].at[med], '07:10');
  M.toggleCheck(st, '2026-10-10', med, '07:30'); // min → vacío
  assert.equal(st.months['2026-10'].days['2026-10-10'], undefined);
  M.setCheck(st, '2026-10-11', med, 'min', 'xx'); // hora inválida no se guarda
  assert.equal(st.months['2026-10'].days['2026-10-11'].at, undefined);
});

test('hora típica, momento aprendido y sugerencia de recordatorio', () => {
  const st = octState();
  const [, med, agua] = ids(st);
  for (let d = 10; d <= 20; d++) {
    const k = `2026-10-${d}`;
    M.setCheck(st, k, med, 'full', '08:' + String(d).padStart(2, '0'));
    M.setCheck(st, k, agua, 'full', '21:00');
  }
  const t = R.typicalTime(st, med, '2026-10-21');
  assert.equal(t.hm, '08:15');
  assert.equal(t.n, 11);
  assert.equal(R.effectiveWhen(st, st.months['2026-10'].habits[1], '2026-10-21'), 'am');
  assert.equal(R.effectiveWhen(st, st.months['2026-10'].habits[2], '2026-10-21'), 'night');
  // recordatorio a las 07:00, primer registro real ≈ 08:15 → sugerir
  const s = R.reminderSuggestion(st, '2026-10-21');
  assert.equal(s.hm, '08:15');
  assert.ok(s.diff >= 45);
  st.profile.reminderTime = '08:00';
  assert.equal(R.reminderSuggestion(st, '2026-10-21'), null);
  assert.equal(R.typicalTime(st, 'nope', '2026-10-21'), null);
});

test('grupos de Hoy por momento del día, días fijos y apilado', () => {
  const st = octState();
  const m = st.months['2026-10'];
  const [gym, med, agua] = m.habits;
  agua.when = 'night';
  med.when = 'am';
  gym.days = [1, 3, 5]; // L, X, V
  const today = '2026-10-20'; // martes
  let g = R.todayGroups(st, m, today, today, 9);
  assert.deepEqual(g.now.map((h) => h.short), ['MED']);
  assert.deepEqual(g.later.map((h) => h.short), ['AGUA']);
  assert.deepEqual(g.optional.map((h) => h.short), ['GYM']);
  M.setCheck(st, today, med.id, 'full');
  g = R.todayGroups(st, m, today, today, 9);
  assert.deepEqual(g.done.map((h) => h.short), ['MED']);
  // de noche, todo lo pendiente pasa a "ahora"
  g = R.todayGroups(st, m, today, today, 22);
  assert.deepEqual(g.now.map((h) => h.short), ['AGUA']);
  // otro día o modo manual: orden del mes, sin agrupar
  assert.equal(R.todayGroups(st, m, '2026-10-19', today, 9).flat, true);
  assert.equal(R.todayGroups(st, m, today, today, 9, 'manual').flat, true);
  // apilado: agua va después de meditar
  agua.when = undefined; agua.after = med.id;
  M.setCheck(st, today, med.id, null);
  g = R.todayGroups(st, m, today, today, 9);
  assert.deepEqual(g.now.map((h) => h.short), ['MED', 'AGUA']);
  assert.deepEqual(R.nextInStack(m, today, med.id), [agua.id]);
  assert.equal(R.isDueOn(gym, '2026-10-21'), true);
});

test('marcar lo que falta, igual que ayer y notas destacadas', () => {
  const st = octState();
  const [gym, med] = ids(st);
  M.setCheck(st, '2026-10-05', med, 'min');
  assert.deepEqual(M.markRemaining(st, '2026-10-05', 'full', '09:00').length, 2);
  assert.equal(st.months['2026-10'].days['2026-10-05'].checks[med], 'min');
  assert.equal(st.months['2026-10'].days['2026-10-05'].checks[gym], 'full');
  assert.equal(M.copyPreviousDay(st, '2026-10-06'), 3);
  assert.equal(st.months['2026-10'].days['2026-10-06'].checks[med], 'min');
  assert.throws(() => M.copyPreviousDay(st, '2026-10-09'), /no tiene marcas/);
  assert.throws(() => M.toggleStar(st, '2026-10-06'), /con nota/);
  M.setNote(st, '2026-10-06', 'buen día');
  assert.equal(M.toggleStar(st, '2026-10-06'), true);
  M.setNote(st, '2026-10-06', ''); // sin nota se quita la estrella
  assert.equal(st.months['2026-10'].days['2026-10-06'].star, undefined);
});

test('días libres fijos: se marcan una vez y respetan la corrección manual', () => {
  const st = octState();
  st.meta.prefs.offDays = [0]; // domingo
  assert.equal(M.applyFixedOff(st, '2026-10-25'), true); // domingo
  assert.equal(st.months['2026-10'].days['2026-10-25'].off, true);
  M.toggleDayOff(st, '2026-10-25'); // lo quita a mano
  assert.equal(M.applyFixedOff(st, '2026-10-25'), false);
  assert.equal(st.months['2026-10'].days['2026-10-25'], undefined);
  assert.equal(M.applyFixedOff(st, '2026-10-26'), false); // lunes
  st.meta.prefs.offDays = [];
  assert.equal(M.applyFixedOff(st, '2026-11-01'), false);
});

test('extras del hábito: validación, copia y edición', () => {
  const st = octState();
  const med = st.months['2026-10'].habits[1];
  M.editHabitText(st, '2026-10', med.id, { when: 'am', cue: 'después del café', bundle: 'con música', icon: '🧘', days: [1, 1, 3], color: 'c7' });
  assert.equal(med.when, 'am');
  assert.deepEqual(med.days, [1, 3]);
  assert.equal(med.color, 'c7');
  M.editHabitText(st, '2026-10', med.id, { when: null, cue: '', bundle: '', icon: '', days: [] });
  assert.equal('when' in med, false);
  assert.equal('cue' in med, false);
  assert.equal('days' in med, false);
  assert.match(M.validateExtras({ name: 'x', when: 'mediodía' }), /momento/);
  assert.match(M.validateExtras({ name: 'x', days: [7] }), /días/);
  assert.match(M.validateExtras({ name: 'x', color: 'rojo' }), /color/);
  assert.match(M.validateExtras({ name: 'x', icon: '12345' }), /ícono/);
  assert.equal(M.validateExtras({ name: 'x' }), null);
  const h = M.makeHabit({ name: 'Leer', min: '1 página', target: { type: 'daily' }, when: 'night', cue: 'en la cama' });
  assert.equal(h.when, 'night');
  assert.equal(h.cue, 'en la cama');
});

test('día flojo, palabras frecuentes, hace un año, días ausente, edad, comienzo fresco, regresos, área', () => {
  const st = octState();
  const m = st.months['2026-10'];
  const [gym, med, agua] = ids(st);
  // Todos los días 100 % menos los martes
  for (let d = 1; d <= 30; d++) {
    const k = `2026-10-${String(d).padStart(2, '0')}`;
    if (new Date(2026, 9, d).getDay() === 2) continue;
    for (const id of [gym, med, agua]) M.setCheck(st, k, id, 'full');
  }
  assert.equal(R.weakWeekday(st, '2026-10-31'), 2);
  M.setNote(st, '2026-10-02', 'caminata con Ana');
  M.setNote(st, '2026-10-03', 'caminata larga');
  assert.deepEqual(R.topWords(st, '2026-10-31'), ['caminata']);
  st.months['2025-10'] = M.makeMonth('2025-10', { habits: [] });
  st.months['2025-10'].days['2025-10-02'] = { note: 'hace un año', checks: {} };
  assert.deepEqual(R.yearAgo(st, '2026-10-02'), { key: '2025-10-02', note: 'hace un año' });
  assert.equal(R.yearAgo(st, '2026-10-05'), null);
  delete st.months['2025-10'];
  assert.equal(R.daysAway(st, '2026-10-31'), 0);
  for (const k of ['2026-10-28', '2026-10-29', '2026-10-30']) delete m.days[k];
  assert.equal(R.daysAway(st, '2026-10-31'), 4); // 27 (martes, en blanco) + 28-30
  assert.equal(R.habitAgeDays(st, med, '2026-10-31'), 31);
  assert.equal(R.freshStart('2026-11-01'), 'month');
  assert.equal(R.freshStart('2026-10-26'), 'week');
  assert.equal(R.freshStart('2026-10-27'), null);
  assert.equal(R.comebacks(st, '2026-10-31'), 3); // tras los martes 6, 13 y 20
  m.habits[1].area = 'sup';
  assert.equal(R.topArea(m, '2026-10-31'), 'sup');
  assert.equal(R.suggestMin('Leer más'), '1 página');
  assert.equal(R.suggestMin('Meditación'), '2 minutos sentado');
  assert.equal(R.suggestMin('zzz'), '');
});

test('temporada ligera', () => {
  const st = octState();
  assert.equal(R.inSeason(st, '2026-10-10'), false);
  st.meta.season = { since: '2026-10-01', until: '2026-10-15' };
  assert.equal(R.inSeason(st, '2026-10-10'), true);
  assert.equal(R.inSeason(st, '2026-10-16'), false);
  assert.equal(addDays('2026-10-15', 1), '2026-10-16');
});
