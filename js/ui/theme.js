// Aplica las preferencias de apariencia al documento (atributos data-* que lee el CSS).
import { monthKey } from '../core/dates.js';
import { topArea } from '../core/routine.js';

export function applyTheme(state, today, hour) {
  const p = state?.meta?.prefs || {};
  const root = document.documentElement;
  root.dataset.paper = p.paper || 'grid';
  root.dataset.tone = p.tone || 'cream';
  root.dataset.size = p.size || 'm';
  // Noche cálida: menos azul de 21:00 a 6:00 (solo si está activado).
  root.toggleAttribute('data-night', !!p.nightWarm && (hour >= 21 || hour < 6));
  // Acento del mes: el color del hábito más cumplido del área más trabajada.
  let accent = null;
  if (p.areaAccent && state?.months) {
    const m = state.months[monthKey(today)];
    const area = m && topArea(m, today);
    const hb = area && m.habits.find((x) => x.area === area);
    if (hb) accent = `var(--${hb.color})`;
  }
  if (accent) root.style.setProperty('--accent', accent); else root.style.removeProperty('--accent');
}
