import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, CURRENT_VERSION } from '../js/core/migrate.js';
import { starter } from './fixtures.js';

test('fixture v1 pasa sin cambios y no se muta el original', () => {
  const v1 = starter();
  assert.equal(CURRENT_VERSION, 1);
  const out = migrate(v1);
  assert.deepEqual(out, v1);
  assert.notEqual(out, v1);
});

test('cadena de migraciones v1 → v3', () => {
  const steps = {
    1: (s) => { for (const m of Object.values(s.months)) for (const h of m.habits) h.kind = 'check'; s.schemaVersion = 2; return s; },
    2: (s) => { s.meta.extra = true; s.schemaVersion = 3; return s; },
  };
  const out = migrate(starter(), steps, 3);
  assert.equal(out.schemaVersion, 3);
  assert.equal(out.months['2026-10'].habits[0].kind, 'check');
  assert.equal(out.meta.extra, true);
});

test('errores de migración', () => {
  assert.throws(() => migrate({ schemaVersion: 0 }), /inválido/);
  assert.throws(() => migrate({ schemaVersion: 2 }), /más nueva/);
  assert.throws(() => migrate({ schemaVersion: 1 }, {}, 2), /falta la migración/);
  assert.throws(() => migrate({ schemaVersion: 1 }, { 1: (s) => s }, 2), /no subió/);
});
