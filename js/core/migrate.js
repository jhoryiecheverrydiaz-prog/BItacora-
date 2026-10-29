// Migraciones del esquema. Cada cambio del modelo agrega una entrada vN → vN+1 y su test.
export const CURRENT_VERSION = 1;

// { [desde]: (state) => state en versión desde+1 }
export const MIGRATIONS = {
  // 1: (s) => { ...; s.schemaVersion = 2; return s; },  // ej. habit.kind = "check"
};

export function migrate(state, migrations = MIGRATIONS, target = CURRENT_VERSION) {
  if (!state || typeof state !== 'object') throw new Error('estado inválido');
  let v = state.schemaVersion;
  if (!Number.isInteger(v) || v < 1) throw new Error('schemaVersion inválido');
  if (v > target) throw new Error(`este respaldo es de una versión más nueva (v${v}); actualiza la app`);
  let s = structuredClone(state);
  while (v < target) {
    const step = migrations[v];
    if (!step) throw new Error(`falta la migración v${v} → v${v + 1}`);
    s = step(s);
    if (s.schemaVersion !== v + 1) throw new Error(`la migración v${v} no subió la versión`);
    v = s.schemaVersion;
  }
  return s;
}
