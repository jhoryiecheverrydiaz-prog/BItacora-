// Exportar a hoja de cálculo (CSV): una fila por día con cada hábito, día libre, nota y ★.
// Es la salida sin pérdida hacia Sheets/Excel (el respaldo JSON sigue siendo el formato completo).
import { shareFile, toast } from './dom.js';
import { dayKeyOf, monthLength, weekdayOf, WEEKDAYS } from '../core/dates.js';
import { elapsedKeys } from '../core/stats.js';

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCsv(state, today) {
  const keys = Object.keys(state.months).sort();
  const names = [];
  for (const k of keys) for (const hb of state.months[k].habits) if (!names.includes(hb.name)) names.push(hb.name);
  const rows = [['Fecha', 'Día', ...names, 'Cumplidos', 'Día libre', 'Nota', 'Destacada']];
  for (const k of keys) {
    const m = state.months[k];
    const elapsed = new Set(elapsedKeys(m, today));
    for (let d = m.startDay; d <= monthLength(k); d++) {
      const key = dayKeyOf(k, d);
      if (!elapsed.has(key)) continue;
      const day = m.days[key] || {};
      const byName = Object.fromEntries(m.habits.map((hb) => [hb.name, day.checks?.[hb.id]]));
      const cells = names.map((n) => (byName[n] === 'full' ? 1 : byName[n] === 'min' ? 0.5 : (n in byName ? 0 : '')));
      const done = m.habits.filter((hb) => day.checks?.[hb.id]).length;
      rows.push([key, WEEKDAYS[weekdayOf(key)], ...cells, `${done}/${m.habits.length}`, day.off ? 'sí' : '', day.note || '', day.star ? '★' : '']);
    }
  }
  // BOM para que Excel lea bien las tildes.
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
}

export async function exportCsv(state, today) {
  const ok = await shareFile(`bitacora-${today}.csv`, buildCsv(state, today), 'text/csv');
  if (ok) toast('CSV listo: 1 = completo, 0,5 = mínimo');
}
