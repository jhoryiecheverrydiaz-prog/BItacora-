import { createStarterState } from '../js/core/months.js';

export const PROFILE = {
  name: 'Prueba', anchor: 'después de hacer la cama', reminderTime: '07:00', lineMode: 'bueno',
  accountability: { to: 'claude', personName: '', weekday: 6 },
};

export const HABITS = [
  { name: 'Gimnasio', short: 'GYM', min: 'Ir y entrenar 20 min', target: { type: 'weekly', count: 4 } },
  { name: 'Meditar', short: 'MED', min: '2 minutos', target: { type: 'daily' } },
  { name: 'Agua', short: 'AGUA', min: '1 vaso al despertar', target: { type: 'daily' } },
];

// Arranque 28-oct-2026 creado el 29-oct.
export function starter(opts = {}) {
  return createStarterState({ profile: PROFILE, startKey: '2026-10-28', today: '2026-10-29', habits: HABITS, mantra: 'Poco y siempre', goals: ['Renovar pasaporte'], ...opts });
}
