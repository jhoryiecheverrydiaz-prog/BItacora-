import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter } from './fixtures.js';
import * as Y from '../js/core/years.js';
import { toggleCheck } from '../js/core/months.js';
import { validateBackup } from '../js/core/importer.js';

test('nombres y emojis', () => {
  assert.equal(Y.normName('Superación Personal 📈'), 'superacion personal');
  assert.equal(Y.normName('Relaciones❤️'), 'relaciones');
  assert.deepEqual(Y.splitEmoji('Fitness 🏋️‍♀️'), { name: 'Fitness', emoji: '🏋️‍♀️' });
  assert.deepEqual(Y.splitEmoji('Relaciones❤️'), { name: 'Relaciones', emoji: '❤️' });
  assert.deepEqual(Y.splitEmoji('Trabajo'), { name: 'Trabajo', emoji: '' });
});

test('áreas: crear, editar, duplicados, tope y borrar en cascada', () => {
  const st = starter();
  assert.equal(st.areas.length, 6);
  const a = Y.addArea(st, { name: 'Espiritualidad', emoji: '🕊️' });
  assert.throws(() => Y.addArea(st, { name: 'espiritualidad' }), /ya existe/);
  assert.throws(() => Y.addArea(st, { name: ' ' }), /nombre/);
  Y.addArea(st, { name: 'Salud' });
  assert.throws(() => Y.addArea(st, { name: 'Otra' }), /máximo 8/);
  Y.editArea(st, a.id, { name: 'Fe', emoji: '✨' });
  assert.equal(Y.areaLabel(Y.areaById(st, a.id)), '✨ Fe');
  assert.throws(() => Y.editArea(st, a.id, { name: 'Fitness' }), /ya existe/);

  const g = Y.addYearGoal(st, 2026, a.id, 'Retiro de silencio');
  Y.addHabitIdea(st, 2026, a.id, 'Orar', 'daily');
  const m = st.months['2026-10'];
  m.habits[0].area = a.id;
  Y.removeArea(st, a.id);
  assert.equal(m.habits[0].area, null);
  assert.equal(st.years['2026'].goals.length, 0);
  assert.equal(st.years['2026'].habitIdeas.length, 0);
  void g;
});

test('metas anuales: tope por área, alternar, editar, borrar', () => {
  const st = starter();
  for (let i = 0; i < Y.MAX_YEAR_GOALS; i++) Y.addYearGoal(st, '2026', 'fit', `Meta ${i}`);
  assert.throws(() => Y.addYearGoal(st, '2026', 'fit', 'otra'), /máximo 5/);
  assert.throws(() => Y.addYearGoal(st, '2026', 'nope', 'x'), /área/);
  const [g] = Y.goalsOf(st, '2026', 'fit');
  assert.equal(Y.toggleYearGoal(st, '2026', g.id), true);
  assert.ok(g.doneAt);
  assert.equal(Y.toggleYearGoal(st, '2026', g.id), false);
  assert.equal(g.doneAt, undefined);
  Y.editYearGoal(st, '2026', g.id, 'Correr 21 km');
  assert.equal(g.text, 'Correr 21 km');
  Y.removeYearGoal(st, '2026', g.id);
  assert.equal(Y.goalsOf(st, '2026', 'fit').length, 4);
  assert.ok(validateBackup(JSON.stringify(st)).ok);
});

test('plan anual de hábitos (ideas por frecuencia)', () => {
  const st = starter();
  Y.addHabitIdea(st, '2026', 'fit', 'Ejercicio', 'daily');
  Y.addHabitIdea(st, '2026', 'fit', 'Sin alcohol', 'weekly');
  assert.throws(() => Y.addHabitIdea(st, '2026', 'fit', 'x', 'yearly'), /frecuencia/);
  assert.equal(Y.ideasOf(st, '2026', 'fit', 'daily').length, 1);
  assert.equal(Y.allIdeas(st, '2026')[1].area.name, 'Fitness');
  Y.removeHabitIdea(st, '2026', Y.ideasOf(st, '2026', 'fit', 'daily')[0].id);
  assert.equal(Y.ideasOf(st, '2026', 'fit').length, 1);
  assert.ok(validateBackup(JSON.stringify(st)).ok);
});

test('panorama del año: meses, metas y hábitos por área', () => {
  const st = starter();
  const m = st.months['2026-10'];
  m.habits[1].area = 'sup';
  toggleCheck(st, '2026-10-28', m.habits[1].id);
  Y.addYearGoal(st, '2026', 'sup', 'Leer 12 libros');
  const g = Y.addYearGoal(st, '2026', 'fin', 'Ahorrar');
  Y.toggleYearGoal(st, '2026', g.id);
  const ys = Y.yearStats(st, '2026', '2026-10-29');
  assert.equal(ys.months.length, 12);
  assert.equal(ys.months[9].exists, true);
  assert.ok(ys.months[9].pct > 0);
  assert.equal(ys.months[10].pct, null);
  assert.equal(ys.goalsDone, 1);
  assert.equal(ys.goalsTotal, 2);
  assert.equal(ys.refKey, '2026-10');
  const sup = ys.areas.find((a) => a.area.id === 'sup');
  assert.equal(sup.habits.length, 1);
  assert.equal(sup.habits[0].done, 1);
  assert.deepEqual(Y.knownYears(st, '2026-10-29'), ['2026']);
});
