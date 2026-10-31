import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter } from './fixtures.js';
import * as P from '../js/core/plan.js';
import { validateBackup } from '../js/core/importer.js';
import { toggleCheck } from '../js/core/months.js';
import { monthStats } from '../js/core/stats.js';
import { parseMonthPlan } from '../js/core/sheets.js';

const K = '2026-10';

test('objetivos semanales: bloques, tope, alternar y borrar', () => {
  const st = starter();
  const g = P.addWeekGoal(st, K, 1, 'Ir al gym 3 veces');
  P.addWeekGoal(st, K, 0, 'Meditar cada mañana');
  assert.throws(() => P.addWeekGoal(st, K, 7, 'x'), /semana/);
  assert.throws(() => P.addWeekGoal(st, K, 1, ' '), /escribe/);
  for (let i = 1; i < P.MAX_WEEK_GOALS; i++) P.addWeekGoal(st, K, 1, `o${i}`);
  assert.throws(() => P.addWeekGoal(st, K, 1, 'otro'), /máximo/);
  assert.equal(P.toggleWeekGoal(st, K, g.id), true);
  P.removeWeekGoal(st, K, g.id);
  assert.equal(st.months[K].weekGoals.filter((x) => x.week === 1).length, P.MAX_WEEK_GOALS - 1);
  assert.equal(P.weekLabel(0), 'Generales de la semana');
  assert.ok(validateBackup(JSON.stringify(st)).ok);
});

test('eventos y facturas: días, valores, totales y orden', () => {
  const st = starter();
  P.addEvent(st, K, { day: '15', text: 'Cumpleaños' });
  P.addEvent(st, K, { text: 'Sin fecha' });
  assert.throws(() => P.addEvent(st, K, { day: 32, text: 'x' }), /día/);
  const a = P.addBill(st, K, { day: 5, text: 'Internet', amount: '89.900' });
  P.addBill(st, K, { day: 1, text: 'Arriendo', amount: '$ 1.250.000' });
  P.addBill(st, K, { text: 'Gym', amount: '120000,50' });
  assert.throws(() => P.addBill(st, K, { text: 'x', amount: 'abc' }), /valor/);
  assert.equal(a.amount, 89900);
  P.toggleBill(st, K, a.id);
  const t = P.billsTotals(st.months[K]);
  assert.deepEqual(t, { total: 1459900.5, paid: 89900, pending: 1370000.5, count: 3, paidCount: 1 });
  assert.deepEqual(P.byDay(st.months[K].bills).map((b) => b.text), ['Arriendo', 'Internet', 'Gym']);
  assert.equal(P.formatMoney(1250000), `$ ${(1250000).toLocaleString('es-CO')}`);
  assert.deepEqual([P.parseAmount(''), P.parseAmount('1,250.50'), P.parseAmount(12)], [null, 1250.5, 12]);
  assert.ok(validateBackup(JSON.stringify(st)).ok);
});

test('plan de un mes cerrado es de solo lectura; respaldo inválido se detecta', () => {
  const st = starter();
  st.months[K].review = { closedAt: 'x', perHabit: {}, goalsResult: {}, notes: '' };
  assert.throws(() => P.addEvent(st, K, { text: 'x' }), /cerrado/);
  const bad = starter();
  bad.months[K].bills = [{ id: 'a', text: 'x', day: 40, amount: 1, paid: false }];
  assert.equal(validateBackup(JSON.stringify(bad)).ok, false);
});

test('premios: días al 100 %', () => {
  const st = starter();
  for (const h of st.months[K].habits) toggleCheck(st, '2026-10-28', h.id);
  const ms = monthStats(st.months[K], '2026-10-29');
  assert.equal(ms.perfectDays, 1);
  assert.equal(ms.series[27].perfect, true);
  assert.equal(ms.series[28].perfect, false);
});

test('sheet: parte de abajo (metas, objetivos, eventos, facturas)', () => {
  const rows = Array.from({ length: 30 }, () => Array(56).fill(''));
  const put = (r, c, v) => { rows[r][c] = v; };
  put(0, 1, 'Metas mensuales generales'); put(0, 10, 'Objetivos semanales generales'); put(0, 41, 'Eventos importantes');
  put(1, 1, 'TRUE'); put(1, 2, 'Generar 5 mil extra'); put(2, 1, 'FALSE'); put(2, 2, 'Bajar 1 kg'); put(3, 1, 'FALSE');
  put(1, 10, 'TRUE'); put(1, 11, 'Cerrar 4 ventas');
  put(1, 41, 'Fecha'); put(1, 42, 'Evento'); put(1, 54, '✔️');
  put(2, 41, '45945'); put(2, 42, 'Boda'); put(2, 54, 'TRUE');
  put(9, 10, 'Objetivos Semana 2'); put(10, 10, 'FALSE'); put(10, 11, 'Llamar a papá'); put(11, 10, 'FALSE'); put(11, 11, '20');
  put(9, 41, 'Facturas mensuales'); put(10, 41, 'Fecha'); put(10, 42, 'Descripción'); put(10, 51, '$'); put(10, 54, '✔️');
  put(11, 41, '5/10'); put(11, 42, 'Internet'); put(11, 51, '89900'); put(11, 54, 'TRUE');
  put(12, 42, 'Luz'); put(12, 51, '');
  put(13, 50, 'total'); put(13, 51, '89900');
  put(15, 10, 'https://www.tiktok.com/@x');
  const p = parseMonthPlan(rows, 0, 31);
  assert.deepEqual(p.monthGoals, [{ text: 'Generar 5 mil extra', done: true }, { text: 'Bajar 1 kg', done: false }]);
  assert.deepEqual(p.weekGoals, [{ week: 0, text: 'Cerrar 4 ventas', done: true }, { week: 2, text: 'Llamar a papá', done: false }]);
  assert.deepEqual(p.events, [{ day: 15, text: 'Boda', done: true }]); // 45945 = 15-oct-2025
  assert.deepEqual(p.bills, [{ day: 5, text: 'Internet', amount: 89900, paid: true }, { day: null, text: 'Luz', amount: null, paid: false }]);
});
