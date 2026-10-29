import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter, PROFILE, HABITS } from './fixtures.js';
import * as M from '../js/core/months.js';

test('onboarding 29-oct con inicio 28-oct crea 2026-10 startDay 28', () => {
  const st = starter();
  const m = st.months['2026-10'];
  assert.equal(m.startDay, 28);
  assert.equal(m.isStarter, true);
  assert.equal(m.habits.length, 3);
  assert.equal(st.profile.createdAt, '2026-10-29');
  assert.equal(new Set(m.habits.map((h) => h.color)).size, 3);
});

test('inicio fuera de rango (8 días atrás o futuro) se rechaza', () => {
  assert.throws(() => starter({ startKey: '2026-10-21' }), /7 días/);
  assert.throws(() => starter({ startKey: '2026-10-30' }), /7 días/);
});

test('inicio en el mes anterior: mes de arranque es ese, y pide cierre', () => {
  const st = M.createStarterState({ profile: PROFILE, startKey: '2026-10-28', today: '2026-11-02', habits: HABITS });
  assert.ok(st.months['2026-10']);
  assert.equal(M.pendingCloseKey(st, '2026-11-02'), '2026-10');
});

test('tope de 5 hábitos y etiqueta ≤ 6', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ name: `H${i}`, short: `H${i}`, min: 'x', target: { type: 'daily' } }));
  assert.throws(() => starter({ habits: six }), /máximo 5/);
  assert.throws(() => starter({ habits: [{ name: 'Leer', short: 'LECTURA', min: 'x', target: { type: 'daily' } }] }), /6 caracteres/);
  assert.throws(() => starter({ habits: [{ name: 'Leer', short: 'LEER', min: '', target: { type: 'daily' } }] }), /mínima/);
  assert.equal(M.autoShort('Sin redes antes de'), 'SIN');
  assert.equal(M.autoShort('Meditación'), 'MEDITA');
});

test('ciclo de 3 estados: vacío → full → min → vacío', () => {
  const st = starter();
  const id = st.months['2026-10'].habits[1].id;
  assert.equal(M.toggleCheck(st, '2026-10-28', id), 'full');
  assert.equal(M.toggleCheck(st, '2026-10-28', id), 'min');
  assert.equal(M.toggleCheck(st, '2026-10-28', id), undefined);
  assert.equal(st.months['2026-10'].days['2026-10-28'], undefined);
  assert.throws(() => M.toggleCheck(st, '2026-10-27', id), /fuera/);
});

test('regla de recuperación, también cruzando mes', () => {
  const st = starter();
  assert.equal(M.yesterdayWasBlank(st, '2026-10-28'), false); // ayer es antes del arranque
  assert.equal(M.yesterdayWasBlank(st, '2026-10-29'), true);
  M.setNote(st, '2026-10-28', 'buen día');
  assert.equal(M.yesterdayWasBlank(st, '2026-10-29'), false);
  assert.equal(M.yesterdayWasBlank(st, '2026-11-01'), true); // 31-oct en blanco
});

test('días editables desde Hoy: máx. 7 y no antes del arranque', () => {
  const st = starter();
  assert.deepEqual(M.recentEditable(st, '2026-10-29'), ['2026-10-28', '2026-10-29']);
});

test('cierre 1-nov: crea noviembre heredando ids y aplicando decisiones', () => {
  const st = starter();
  const [gym, med, agua] = st.months['2026-10'].habits;
  const goal = st.months['2026-10'].goals[0];
  assert.deepEqual(M.closeStatus(st, '2026-11-01'), { key: '2026-10', snoozedToday: false, canSnooze: true });
  const cur = M.applyClose(st, '2026-10', {
    decisions: { [gym.id]: { decision: 'up', min: 'Entrenar 30 min' }, [med.id]: { decision: 'remove' }, [agua.id]: { decision: 'replace', habit: { name: 'Leer', short: 'LEER', min: '2 páginas', target: { type: 'daily' } } } },
    added: [{ name: 'Caminar', short: 'CAM', min: '10 min', target: { type: 'daily' } }],
    goalsResult: { [goal.id]: true }, mantra: 'Nuevo', goals: ['Uno'],
  }, '2026-11-01');
  assert.equal(cur, '2026-11');
  const nov = st.months['2026-11'];
  assert.equal(nov.startDay, 1);
  assert.equal(nov.isStarter, false);
  assert.deepEqual(nov.habits.map((h) => h.short), ['GYM', 'LEER', 'CAM']);
  assert.equal(nov.habits[0].id, gym.id);
  assert.equal(nov.habits[0].level, 2);
  assert.equal(nov.habits[0].min, 'Entrenar 30 min');
  assert.notEqual(nov.habits[1].id, agua.id);
  assert.equal(nov.mantra, 'Nuevo');
  assert.equal(st.months['2026-10'].goals[0].done, true);
  assert.equal(st.months['2026-10'].review.perHabit[med.id].decision, 'remove');
  assert.equal(M.pendingCloseKey(st, '2026-11-01'), null);
  assert.throws(() => M.applyClose(st, '2026-10', {}, '2026-11-01'), /ya está cerrado/);
});

test('cierre respeta el tope de 5', () => {
  const st = starter();
  const add = Array.from({ length: 3 }, (_, i) => ({ name: `N${i}`, short: `N${i}`, min: 'x', target: { type: 'daily' } }));
  assert.throws(() => M.applyClose(st, '2026-10', { added: add }, '2026-11-01'), /máximo 5/);
  assert.equal(st.months['2026-10'].review, null);
});

test('salto de 3 meses: cierra oct, crea nov y dic vacíos, abre enero', () => {
  const st = starter();
  assert.equal(M.pendingCloseKey(st, '2027-01-10'), '2026-10');
  M.applyClose(st, '2026-10', {}, '2027-01-10');
  assert.deepEqual(Object.keys(st.months).sort(), ['2026-10', '2026-11', '2026-12', '2027-01']);
  assert.equal(st.months['2026-11'].review.skipped, true);
  assert.equal(st.months['2026-12'].habits[0].id, st.months['2026-10'].habits[0].id);
  assert.equal(st.months['2027-01'].review, null);
  assert.equal(M.pendingCloseKey(st, '2027-01-10'), null);
});

test('cerrar después: 1 vez, conserva lo registrado en el mes provisional', () => {
  const st = starter();
  M.snoozeClose(st, '2026-11-01');
  assert.deepEqual(M.closeStatus(st, '2026-11-01'), { key: '2026-10', snoozedToday: true, canSnooze: false });
  const nov = st.months['2026-11'];
  assert.ok(nov.provisional);
  M.toggleCheck(st, '2026-11-01', nov.habits[0].id);
  assert.equal(M.closeStatus(st, '2026-11-02').canSnooze, false);
  assert.throws(() => M.snoozeClose(st, '2026-11-02'), /posponer/);
  M.applyClose(st, '2026-10', { mantra: 'm' }, '2026-11-02');
  assert.equal(st.months['2026-11'].provisional, undefined);
  assert.equal(st.months['2026-11'].days['2026-11-01'].checks[nov.habits[0].id], 'full');
  assert.equal(st.meta.closeSnoozedOn, null);
});

test('mes cerrado: checks bloqueados, nota editable', () => {
  const st = starter();
  const id = st.months['2026-10'].habits[0].id;
  M.applyClose(st, '2026-10', {}, '2026-11-01');
  assert.throws(() => M.toggleCheck(st, '2026-10-29', id), /cerrado/);
  M.setNote(st, '2026-10-29', 'releído');
  assert.equal(st.months['2026-10'].days['2026-10-29'].note, 'releído');
});

test('cambio de emergencia: tope 5, motivo obligatorio, queda en review.notes', () => {
  const st = starter();
  const add = (n) => Array.from({ length: n }, (_, i) => ({ name: `E${i}`, short: `E${i}`, min: 'x', target: { type: 'daily' } }));
  assert.throws(() => M.emergencyChange(st, '2026-10', { add: add(3) }, 'razón'), /máximo 5/);
  assert.throws(() => M.emergencyChange(st, '2026-10', { add: add(1) }, ' '), /motivo/);
  M.emergencyChange(st, '2026-10', { add: add(1) }, 'lesión', '2026-10-30T10:00:00Z');
  assert.equal(st.months['2026-10'].habits.length, 4);
  M.applyClose(st, '2026-10', {}, '2026-11-01');
  assert.match(st.months['2026-10'].review.notes, /Cambio de emergencia: agregó E0\. Motivo: lesión/);
});

test('editar texto de hábito valida', () => {
  const st = starter();
  const id = st.months['2026-10'].habits[0].id;
  M.editHabitText(st, '2026-10', id, { min: 'Ir 15 min' });
  assert.equal(st.months['2026-10'].habits[0].min, 'Ir 15 min');
  assert.throws(() => M.editHabitText(st, '2026-10', id, { short: 'MED' }), /repetida/);
});

test('avisos por prioridad', () => {
  const st = starter();
  assert.equal(M.topNotice(st, '2026-11-01'), 'close');
  assert.equal(M.topNotice(st, '2026-10-29'), 'blank');
  M.setNote(st, '2026-10-30', 'x');
  assert.equal(M.topNotice(st, '2026-10-31'), 'weekly'); // sábado
  st.meta.lastWeeklySentAt = '2026-10-31T09:00:00';
  assert.equal(M.topNotice(st, '2026-10-31'), 'backup');
  st.meta.lastBackupAt = '2026-10-31';
  assert.equal(M.topNotice(st, '2026-10-31'), null);
  assert.equal(M.backupDue(st, '2026-11-07'), true);
});
