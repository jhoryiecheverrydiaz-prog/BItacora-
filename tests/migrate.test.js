import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, CURRENT_VERSION, DEFAULT_AREAS } from '../js/core/migrate.js';
import { starter, asV1 } from './fixtures.js';

test('estado actual (v2) pasa sin cambios y no se muta el original', () => {
  const v2 = starter();
  assert.equal(CURRENT_VERSION, 2);
  const out = migrate(v2);
  assert.deepEqual(out, v2);
  assert.notEqual(out, v2);
});

test('v1 → v2: agrega áreas por defecto y años vacíos sin tocar los meses', () => {
  const v1 = asV1(starter());
  assert.equal(v1.areas, undefined);
  const out = migrate(v1);
  assert.equal(out.schemaVersion, 2);
  assert.deepEqual(out.areas, DEFAULT_AREAS);
  assert.notEqual(out.areas, DEFAULT_AREAS);
  assert.deepEqual(out.years, {});
  assert.deepEqual(out.months, v1.months);
  assert.equal(v1.schemaVersion, 1);
});

test('cadena de migraciones v1 → v3', () => {
  const steps = {
    1: (s) => { for (const m of Object.values(s.months)) for (const h of m.habits) h.kind = 'check'; s.schemaVersion = 2; return s; },
    2: (s) => { s.meta.extra = true; s.schemaVersion = 3; return s; },
  };
  const out = migrate(asV1(starter()), steps, 3);
  assert.equal(out.schemaVersion, 3);
  assert.equal(out.months['2026-10'].habits[0].kind, 'check');
  assert.equal(out.meta.extra, true);
});

test('errores de migración', () => {
  assert.throws(() => migrate({ schemaVersion: 0 }), /inválido/);
  assert.throws(() => migrate({ schemaVersion: 3 }), /más nueva/);
  assert.throws(() => migrate({ schemaVersion: 1 }, {}, 2), /falta la migración/);
  assert.throws(() => migrate({ schemaVersion: 1 }, { 1: (s) => s }, 2), /no subió/);
});
