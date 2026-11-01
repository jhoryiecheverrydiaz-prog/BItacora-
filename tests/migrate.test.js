import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, CURRENT_VERSION, DEFAULT_AREAS, DEFAULT_GAME, DEFAULT_PREFS } from '../js/core/migrate.js';
import { starter, asV1 } from './fixtures.js';

test('estado actual (v4) pasa sin cambios y no se muta el original', () => {
  const v4 = starter();
  assert.equal(CURRENT_VERSION, 4);
  const out = migrate(v4);
  assert.deepEqual(out, v4);
  assert.notEqual(out, v4);
});

test('v3 → v4: agrega preferencias por defecto, versión vista y temporada', () => {
  const v3 = structuredClone(starter());
  delete v3.meta.prefs; delete v3.meta.seenVersion; delete v3.meta.season;
  v3.schemaVersion = 3;
  const out = migrate(v3);
  assert.equal(out.schemaVersion, 4);
  assert.deepEqual(out.meta.prefs, DEFAULT_PREFS);
  assert.notEqual(out.meta.prefs, DEFAULT_PREFS);
  assert.equal(out.meta.seenVersion, null);
  assert.equal(out.meta.season, null);
  assert.deepEqual(out.months, v3.months);
  assert.equal(v3.meta.prefs, undefined);
});

test('v3 → v4 conserva preferencias parciales si ya existían', () => {
  const v3 = structuredClone(starter());
  v3.meta.prefs = { size: 'xl' };
  v3.schemaVersion = 3;
  const out = migrate(v3);
  assert.equal(out.meta.prefs.size, 'xl');
  assert.equal(out.meta.prefs.paper, 'grid');
});

test('v2 → v3: agrega el Sistema apagado', () => {
  const v2 = structuredClone(starter());
  delete v2.meta.game;
  v2.schemaVersion = 2;
  const out = migrate(v2);
  assert.equal(out.schemaVersion, 4);
  assert.deepEqual(out.meta.game, DEFAULT_GAME);
  assert.equal(v2.meta.game, undefined);
});

test('v1 → v2: agrega áreas por defecto y años vacíos sin tocar los meses', () => {
  const v1 = asV1(starter());
  assert.equal(v1.areas, undefined);
  const out = migrate(v1);
  assert.equal(out.schemaVersion, 4);
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
  assert.throws(() => migrate({ schemaVersion: 5 }), /más nueva/);
  assert.throws(() => migrate({ schemaVersion: 1 }, {}, 2), /falta la migración/);
  assert.throws(() => migrate({ schemaVersion: 1 }, { 1: (s) => s }, 2), /no subió/);
});
