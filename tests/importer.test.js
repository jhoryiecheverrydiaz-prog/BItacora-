import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter } from './fixtures.js';
import { validateBackup, parseClaudeImport, extractJson, describeReplace, describeProposal } from '../js/core/importer.js';
import { toggleCheck } from '../js/core/months.js';

test('respaldo válido ida y vuelta', () => {
  const st = starter();
  toggleCheck(st, '2026-10-28', st.months['2026-10'].habits[0].id);
  const r = validateBackup(JSON.stringify(st));
  assert.ok(r.ok, r.errors.join());
  assert.deepEqual(r.state.months, st.months);
  assert.deepEqual(describeReplace(null, r.state)[0], 'Meses: 0 → 1');
});

test('respaldo inválido: dice qué campo falla', () => {
  const st = starter();
  st.months['2026-10'].days['2026-10-28'] = { note: '', checks: { x: 'yes' } };
  st.months['2026-10'].habits[0].short = 'GIMNASIO';
  const r = validateBackup(st);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('checks: valor "yes"')));
  assert.ok(r.errors.some((e) => e.includes('más de 6')));
  assert.equal(validateBackup('hola').ok, false);
  assert.match(validateBackup('{"a":1}').errors[0], /schemaVersion/);
  assert.match(validateBackup({ ...starter(), schemaVersion: 99 }).errors[0], /más nueva/);
});

test('respaldo con más de 5 hábitos se rechaza', () => {
  const st = starter();
  const hs = st.months['2026-10'].habits;
  for (let i = 0; i < 3; i++) hs.push({ ...hs[0], id: `z${i}`, short: `Z${i}` });
  assert.ok(validateBackup(st).errors.some((e) => e.includes('máximo 5')));
});

test('JSON de Claude: válido, con texto alrededor, keepId por etiqueta', () => {
  const st = starter();
  const habits = st.months['2026-10'].habits;
  const text = 'Aquí va:\n```json\n{ "bitacora_import": 1, "applyTo": "next_month", "mantra": "Menos", "habits": [ { "keepId": "gym", "min": "30 min" }, { "keepId": "' + habits[1].id + '", "min": "5 min" }, { "name": "Leer", "short": "LEER", "min": "2 páginas", "target": { "type": "daily" } } ], "goals": ["A"] }\n```';
  const r = parseClaudeImport(text, habits);
  assert.ok(r.ok, r.errors.join());
  assert.deepEqual(r.proposal.edits, [{ habitId: habits[0].id, min: '30 min' }, { habitId: habits[1].id, min: '5 min' }]);
  assert.equal(r.proposal.added[0].short, 'LEER');
  assert.equal(r.proposal.mantra, 'Menos');
  assert.equal(describeProposal(r.proposal, habits)[0], 'GYM: min: "30 min"');
});

test('JSON de Claude inválido se rechaza con motivo', () => {
  const habits = starter().months['2026-10'].habits;
  const bad = (o) => parseClaudeImport(JSON.stringify(o), habits);
  assert.match(bad({ habits: [] }).errors[0], /bitacora_import/);
  assert.match(bad({ bitacora_import: 1, applyTo: 'now' }).errors[0], /next_month/);
  assert.match(bad({ bitacora_import: 1, habits: [{ keepId: 'nope' }] }).errors[0], /no coincide/);
  assert.match(bad({ bitacora_import: 1, habits: [{ name: 'Leer', short: 'LEER' }] }).errors[0], /mínima/);
  assert.match(bad({ bitacora_import: 1, habits: [{ name: 'Leer', min: 'x', target: { type: 'weekly', count: 9 } }] }).errors[0], /frecuencia/);
  const three = [1, 2, 3].map((i) => ({ name: `N${i}`, short: `N${i}`, min: 'x' }));
  assert.match(bad({ bitacora_import: 1, habits: three }).errors[0], /tope es 5/);
  assert.match(bad({ bitacora_import: 1, goals: ['a', 'b', 'c', 'd'] }).errors[0], /máximo 3/);
  assert.throws(() => extractJson('{mal'), /JSON/);
});
