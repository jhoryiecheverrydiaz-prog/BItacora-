// Migraciones del esquema. Cada cambio del modelo agrega una entrada vN → vN+1 y su test.
export const CURRENT_VERSION = 3;

// Áreas de vida por defecto (las de la hoja "Metas" del tracker en Sheets). Ids estables.
export const DEFAULT_AREAS = [
  { id: 'fit', name: 'Fitness', emoji: '🏋️' },
  { id: 'fin', name: 'Finanzas', emoji: '💰' },
  { id: 'ave', name: 'Aventura', emoji: '🏔️' },
  { id: 'sup', name: 'Superación personal', emoji: '📈' },
  { id: 'rel', name: 'Relaciones', emoji: '❤️' },
  { id: 'tra', name: 'Trabajo', emoji: '💼' },
];

export const DEFAULT_GAME = { enabled: false, seen: null };

// { [desde]: (state) => state en versión desde+1 }
export const MIGRATIONS = {
  // v2: áreas de vida + metas anuales (state.areas, state.years). Opcionales y compatibles:
  // habit.area (id de área o null), day.off (día libre), target { type: 'monthly', count }.
  1: (s) => {
    s.areas = structuredClone(DEFAULT_AREAS);
    s.years = {};
    s.schemaVersion = 2;
    return s;
  },
  // v3: Sistema (gamificación opcional). Solo preferencias y lo último visto; el XP se deriva del registro.
  2: (s) => {
    s.meta = { ...s.meta, game: { ...DEFAULT_GAME } };
    s.schemaVersion = 3;
    return s;
  },
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
