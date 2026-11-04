import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter } from './fixtures.js';
import { toggleCheck } from '../js/core/months.js';
import { isBlank } from '../js/core/stats.js';
import * as C from '../js/core/checkin.js';
import * as G from '../js/core/game.js';
import { validateBackup } from '../js/core/importer.js';
import { dayXP } from '../whatsapp/src/logic.js';

test('horas de sueño: cruza la medianoche, madrugada y errores', () => {
  assert.equal(C.sleepHours('22:30', '06:00'), 7.5);
  assert.equal(C.sleepHours('00:30', '07:00'), 6.5);
  assert.equal(C.sleepHours('23:10', '06:00'), 6.75); // redondeo a 1/4 h
  assert.equal(C.sleepHours('08:00', '07:00'), null); // 23 h: error
  assert.equal(C.sleepHours('22:00', null), null);
  assert.equal(C.sleepHours('25:00', '06:00'), null);
});

test('setLog guarda, recorta, borra campos vacíos y limpia el día', () => {
  const st = starter();
  const k = '2026-10-29';
  C.setLog(st, k, { energy: 4, mood: 3, task1: '  Propuesta para el cliente  ' });
  assert.deepEqual(st.months['2026-10'].days[k].log, { energy: 4, mood: 3, task1: 'Propuesta para el cliente ' }); // el final no se recorta mientras se escribe
  assert.ok(!isBlank(st.months['2026-10'].days[k]), 'el registro cuenta como día registrado');
  C.setLog(st, k, { energy: null, mood: '', task1: '' });
  assert.equal(st.months['2026-10'].days[k], undefined, 'día vacío se borra');
  assert.throws(() => C.setLog(st, k, { energy: 6 }), /1 a 5/);
  assert.throws(() => C.setLog(st, k, { bed: '9pm' }), /hora/);
  assert.throws(() => C.setLog(st, '2026-10-20', { energy: 3 }), /fuera del mes/);
  assert.throws(() => C.setLog(st, k, { otra: 1 }), /desconocido/);
  C.setLog(st, k, { task1: 'x'.repeat(500) });
  assert.equal(st.months['2026-10'].days[k].log.task1.length, C.LOG_TEXT.task1);
});

test('check-in completo = energía + ánimo + sueño', () => {
  assert.ok(!C.checkinComplete({ energy: 3, mood: 4 }));
  assert.ok(C.checkinComplete({ energy: 3, mood: 4, bed: '23:00', wake: '06:30' }));
  assert.ok(!C.logHasData({}));
  assert.ok(C.logHasData({ focus: 1 }));
  assert.ok(C.logHasData({ close: 'Llamar a Ana' }));
});

test('tarea #1 sugerida desde el cierre de ayer', () => {
  const st = starter();
  assert.equal(C.suggestedTask(st, '2026-10-29'), null);
  C.setLog(st, '2026-10-28', { close: 'Enviar la cotización' });
  assert.equal(C.suggestedTask(st, '2026-10-29'), 'Enviar la cotización');
  C.setLog(st, '2026-10-29', { task1: 'Otra cosa' });
  assert.equal(C.suggestedTask(st, '2026-10-29'), null);
});

test('temporizador de foco: sobrevive al cierre, suma solo si se completa', () => {
  const st = starter();
  const t0 = 1_000_000;
  C.startFocus(st, '2026-10-29', t0, 25);
  assert.equal(C.focusStatus(st, t0 + 60_000).remaining, 24 * 60_000);
  assert.equal(C.finishFocus(st, t0 + 10 * 60_000), null, 'incompleto no suma');
  assert.equal(st.meta.focus, null);
  C.startFocus(st, '2026-10-29', t0, 99); // minutos no permitidos → preferencia (25)
  assert.equal(st.meta.focus.minutes, 25);
  assert.equal(C.focusStatus(st, t0 + 25 * 60_000).done, true);
  assert.equal(C.finishFocus(st, t0 + 30 * 60_000), 1);
  assert.equal(C.addFocus(st, '2026-10-29', 2), 3);
  assert.equal(C.formatClock(24 * 60_000 + 5_000), '24:05');
  C.startFocus(st, '2026-10-29', t0); C.cancelFocus(st);
  assert.equal(st.meta.focus, null);
});

test('XP del día igual al panel de WhatsApp (dayXP) con check-in y focos', () => {
  const st = starter();
  const [gym, med] = st.months['2026-10'].habits;
  const k = '2026-10-28';
  toggleCheck(st, k, gym.id);
  toggleCheck(st, k, med.id); toggleCheck(st, k, med.id);
  C.setLog(st, k, { energy: 4, mood: 4, bed: '22:30', wake: '06:00', focus: 6 });
  const g = G.gameStats(st, k);
  const panel = dayXP({ full: ['GYM'], min: ['MED'], energia: 4, animo: 4, sueno: 7.5, focos: 6 });
  assert.equal(panel, 4 + 10 + 6 + 3 + 4 * 5);
  assert.equal(g.todayGain.xp, panel, 'sin bonos propios del Sistema ese día');
  assert.equal(g.focusTotal, 6);
});

test('misiones semanales: Foco profundo y Descanso dan XP una vez por semana', () => {
  const st = starter({ startKey: '2026-10-26', today: '2026-10-29' }); // lunes 26
  const before = G.gameStats(st, '2026-11-01');
  for (const d of [26, 27, 28, 29, 30]) C.setLog(st, `2026-10-${d}`, { focus: 2, bed: '22:00', wake: '06:00', task1: 'A' });
  const g = G.gameStats(st, '2026-11-01');
  const w = g.weeks.find((x) => x.start === '2026-10-26');
  assert.equal(w.focus, 10);
  assert.equal(w.goodNights, 5);
  const done = Object.fromEntries(w.quests.map((q) => [q.id, q.done]));
  assert.deepEqual(done, { focos: true, descanso: true, bitacora: false, tarea1: true });
  assert.equal(g.questsDone.focos, 1);
  assert.ok(g.titles.find((t) => t.id === 'guardian').unlocked);
  assert.ok(g.titles.find((t) => t.id === 'primer-foco').unlocked);
  // 5 días × (4 registro + 4 focos×... 2 focos = 10) + misiones 40 + 30 + 25
  assert.equal(g.xp - before.xp, 5 * (4 + 10) + 40 + 30 + 25);
  const vit = g.stats.find((s) => s.id === 'vit').value;
  assert.ok(vit > 10, 'las noches de descanso suben Vitalidad');
});

test('respaldo con day.log válido pasa; inválido se rechaza', () => {
  const st = starter();
  C.setLog(st, '2026-10-29', { energy: 3, focus: 2 });
  assert.equal(validateBackup(JSON.stringify(st)).ok, true);
  st.months['2026-10'].days['2026-10-29'].log.energy = 9;
  const r = validateBackup(JSON.stringify(st));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /energy/);
});
