import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/core/dates.js';

test('todayKey usa hora local: 23:30 del 28-oct sigue siendo 28', () => {
  assert.equal(D.todayKey(new Date(2026, 9, 28, 23, 30)), '2026-10-28');
  assert.equal(D.todayKey(new Date(2026, 9, 28, 0, 5)), '2026-10-28');
});

test('monthKey, daysInMonth, bisiesto', () => {
  assert.equal(D.monthKey('2026-10-28'), '2026-10');
  assert.equal(D.daysInMonth(2026, 10), 31);
  assert.equal(D.daysInMonth(2026, 2), 28);
  assert.equal(D.daysInMonth(2028, 2), 29);
});

test('addDays cruza meses y años', () => {
  assert.equal(D.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(D.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(D.diffDays('2026-10-28', '2026-11-04'), 7);
});

test('addMonths', () => {
  assert.equal(D.addMonths('2026-10', 3), '2027-01');
  assert.equal(D.addMonths('2026-01', -1), '2025-12');
});

test('weekday y semana ISO', () => {
  assert.equal(D.weekdayOf('2026-10-28'), 3); // miércoles
  assert.equal(D.mondayIndex('2026-11-01'), 6); // domingo
  assert.equal(D.weekStart('2026-10-28'), '2026-10-26');
  assert.equal(D.isoWeek('2026-10-28').label, '2026-W44');
  assert.equal(D.isoWeek('2027-01-01').label, '2026-W53');
  assert.equal(D.isoWeek('2026-01-01').label, '2026-W01');
});

test('validadores y formato', () => {
  assert.ok(D.isDateKey('2026-10-28'));
  assert.ok(!D.isDateKey('2026-02-30'));
  assert.ok(!D.isMonthKey('2026-13'));
  assert.equal(D.formatLong('2026-10-28'), 'Miércoles 28 de octubre');
  assert.equal(D.formatRange('2026-10-26', '2026-11-01'), '26 oct–1 nov');
  assert.equal(D.formatRange('2026-11-02', '2026-11-08'), '2–8 nov');
});
