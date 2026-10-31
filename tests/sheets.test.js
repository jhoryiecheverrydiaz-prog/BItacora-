import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter } from './fixtures.js';
import { trackerRows, toCsv, goalsRows, buildXlsx } from './sheet-fixture.js';
import { parseCsv, readXlsx, parseTrackerSheet, parseGoalsSheet, inferYear, planImport, applyImport, monthFromText } from '../js/core/sheets.js';
import { validateBackup } from '../js/core/importer.js';
import { monthStats } from '../js/core/stats.js';
import { goalsOf, findArea } from '../js/core/years.js';

const TODAY = '2026-10-30';
const SEP25 = { monthName: 'septiembre', y: 2025, m: 9, habits: [
  { name: 'Meditar', done: [27, 29], note: 'en la mañana' }, { name: 'Escribir', done: [27] }, { name: '10 flexiones', done: [1, 2, 3] },
  { name: 'Leer', done: [] }, { name: 'Caminar', done: [5] }, { name: 'Agua', done: [6, 7] }, { name: 'Dormir 8h', done: [8, 9, 10, 11] },
], inactive: [30] };

test('CSV: comillas, comas, punto y coma y BOM', () => {
  assert.deepEqual(parseCsv('﻿a,"b,c","d ""e"""\n1,2,3'), [['a', 'b,c', 'd "e"'], ['1', '2', '3']]);
  assert.deepEqual(parseCsv('a;b;c\r\n1;2;3\r\n'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(parseCsv('x,"lí\nnea"'), [['x', 'lí\nnea']]);
});

test('meses en español y año por calendario', () => {
  assert.equal(monthFromText('Octubre'), 10);
  assert.equal(monthFromText('setiembre'), 9);
  assert.equal(monthFromText('Sept'), null);
  assert.equal(inferYear(10, 3, TODAY), 2025); // 1-oct miércoles → 2025 (2026 es jueves)
  assert.equal(inferYear(10, 4, TODAY), 2026);
  assert.equal(inferYear(12, 1, TODAY), 2025); // dic-2026 es futuro
});

test('pestaña mensual: mes, año, días activos y hábitos', () => {
  const p = parseTrackerSheet(parseCsv(toCsv(trackerRows(SEP25))), { name: 'HABIT TRACKER - Septiembre.csv', today: TODAY });
  assert.equal(p.month, 9);
  assert.equal(p.year, 2025);
  assert.equal(p.yearSource, 'calendario');
  assert.equal(p.days, 30);
  assert.equal(p.active[29], false);
  assert.equal(p.active[0], true);
  assert.equal(p.habits.length, 7);
  assert.deepEqual(p.habits[0], { name: 'Meditar', done: [27, 29], count: 2, note: 'en la mañana' });
  assert.equal(parseTrackerSheet([['hola']], { name: 'x', today: TODAY }), null);
});

test('pestaña con fecha serial (xlsx) fija el año', () => {
  const rows = trackerRows({ ...SEP25, serial: '45901' });
  const p = parseTrackerSheet(rows, { name: 'Hoja', today: TODAY });
  assert.equal(p.year, 2025);
  assert.equal(p.month, 9);
  assert.equal(p.yearSource, 'fecha');
});

test('pestaña Metas: dos diseños, sin duplicados', () => {
  const g = parseGoalsSheet(goalsRows());
  const fit = g.find((a) => a.name === 'Fitness');
  assert.equal(fit.emoji, '🏋️‍♀️');
  assert.deepEqual(fit.goals, [{ text: 'Correr 10 km', done: false }, { text: 'Bajar 3 kg', done: true }]);
  assert.deepEqual(g.find((a) => a.name === 'Finanzas').goals, [{ text: 'Ahorrar 1 millón', done: true }]);
  assert.deepEqual(g.find((a) => a.name === 'Viajes').goals, [{ text: 'Conocer el mar', done: false }]);
  assert.deepEqual(fit.ideas, [{ text: 'Ejercicio', freq: 'daily' }, { text: 'Sin alcohol', freq: 'weekly' }, { text: 'Dormir temprano', freq: 'daily' }]);
  assert.deepEqual(g.find((a) => a.name === 'Viajes').ideas, [{ text: 'Plan de viaje', freq: 'monthly' }]);
});

test('plan + import: historial cerrado, tope de 5, días libres, metas y respaldo válido', () => {
  const st = starter();
  const oct = trackerRows({ monthName: 'octubre', y: 2026, m: 10, habits: [{ name: 'Meditar', done: [28, 29, 1] }, { name: 'Otra', done: [28] }] });
  const nov = trackerRows({ monthName: 'noviembre', y: 2025, m: 11, habits: [{ name: 'X', done: [] }] });
  const sources = [
    { name: 'Septiembre', rows: trackerRows(SEP25) },
    { name: 'Octubre', rows: oct },
    { name: 'Noviembre', rows: nov },
    { name: 'Metas', rows: goalsRows() },
    { name: 'Notas', rows: [['nada']] },
  ];
  const plan = planImport(st, sources, TODAY);
  const byKey = Object.fromEntries(plan.months.map((m) => [m.key, m]));
  assert.equal(byKey['2025-09'].status, 'new');
  assert.equal(byKey['2025-09'].selected.length, 5);
  assert.ok(!byKey['2025-09'].selected.includes('Leer'));
  assert.equal(byKey['2026-10'].status, 'merge'); // octubre 2026 (1-oct jueves)
  assert.deepEqual(byKey['2026-10'].selected, ['Meditar']);
  assert.equal(byKey['2025-11'].status, 'empty');
  assert.deepEqual(plan.skipped, ['Notas']);

  const res = applyImport(st, plan, { goalsYear: '2026' });
  assert.deepEqual(res.created, ['2025-09']);
  assert.deepEqual(res.merged, [{ key: '2026-10', checks: 2 }]); // el 1-oct es antes del arranque (28)
  const sep = st.months['2025-09'];
  assert.equal(sep.habits.length, 5);
  assert.equal(sep.review.imported, true);
  assert.equal(sep.days['2025-09-30'].off, true);
  const med = sep.habits.find((h) => h.name === 'Meditar');
  assert.equal(med.id, st.months['2026-10'].habits.find((h) => h.name === 'Meditar').id, 'reutiliza el id por nombre');
  assert.equal(sep.days['2025-09-27'].checks[med.id], 'full');
  const ms = monthStats(sep, TODAY);
  assert.equal(ms.daysElapsed, 29);
  assert.equal(ms.daysOff, 1);
  assert.equal(st.months['2026-10'].days['2026-10-29'].checks[med.id], 'full');
  assert.equal(med.note, 'en la mañana');
  assert.deepEqual(sep.archived.map((a) => a.name), ['Caminar'], 'lo que excede el tope queda archivado (sin los vacíos)');
  assert.deepEqual(st.months['2026-10'].archived, [{ name: 'Otra', done: [28] }]);
  assert.equal(res.ideas, 4);

  assert.equal(res.areas, 1); // Viajes
  assert.equal(goalsOf(st, '2026', findArea(st, 'fitness').id).length, 2);
  assert.ok(validateBackup(JSON.stringify(st)).ok, validateBackup(JSON.stringify(st)).errors?.join('; '));

  // Reimportar no duplica
  const again = applyImport(st, planImport(st, sources, TODAY), { goalsYear: '2026' });
  assert.deepEqual(again.created, []);
  assert.equal(again.goals, 0);
  assert.equal(again.ideas, 0);
  assert.deepEqual(st.months['2026-10'].archived, [{ name: 'Otra', done: [28] }]);
});

test('etiquetas cortas únicas al importar', () => {
  const st = starter();
  const rows = trackerRows({ monthName: 'agosto', y: 2025, m: 8, habits: [{ name: 'Leer libro', done: [1] }, { name: 'Leer noticias', done: [2] }] });
  const plan = planImport(st, [{ name: 'Agosto', rows }], TODAY);
  applyImport(st, plan);
  assert.deepEqual(st.months['2025-08'].habits.map((h) => h.short), ['LEER', 'LEER2']);
});

test('xlsx: libro completo con varias pestañas', async () => {
  const buf = buildXlsx([{ name: 'Metas', rows: goalsRows() }, { name: 'Septiembre', rows: trackerRows({ ...SEP25, serial: '45901' }) }]);
  const sheets = await readXlsx(buf);
  assert.deepEqual(sheets.map((s) => s.name), ['Metas', 'Septiembre']);
  const p = parseTrackerSheet(sheets[1].rows, { name: sheets[1].name, today: TODAY });
  assert.equal(p.year, 2025);
  assert.equal(p.habits[0].count, 2);
  assert.equal(p.active[29], false);
  assert.ok(parseGoalsSheet(sheets[0].rows).length >= 3);
  await assert.rejects(readXlsx(new ArrayBuffer(10)), /xlsx válido/);
});
