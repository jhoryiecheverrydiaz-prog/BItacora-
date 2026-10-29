// Fechas locales. Prohibido usar UTC (toISOString) para claves: en Bogotá
// después de las 7 p. m. devolvería el día siguiente.

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
// Letras L M X J V S D, índice lunes = 0
export const WEEK_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const pad = (n) => String(n).padStart(2, '0');

export function keyFromParts(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function todayKey(now = new Date()) {
  return keyFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function isDateKey(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseKey(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function isMonthKey(s) {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

// Fecha local a mediodía: inmune a cambios de hora.
export function toDate(key) {
  const { y, m, d } = parseKey(key);
  return new Date(y, m - 1, d, 12);
}

export function monthKey(dateKey) {
  return dateKey.slice(0, 7);
}

export function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

export function monthLength(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  return daysInMonth(y, m);
}

export function dayKeyOf(mKey, day) {
  return `${mKey}-${pad(day)}`;
}

export function addDays(key, n) {
  const dt = toDate(key);
  dt.setDate(dt.getDate() + n);
  return todayKey(dt);
}

export function diffDays(a, b) {
  return Math.round((toDate(b) - toDate(a)) / 86400000);
}

export function addMonths(mKey, n) {
  const [y, m] = mKey.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

// 0 = domingo … 6 = sábado
export function weekdayOf(key) {
  return toDate(key).getDay();
}

// 0 = lunes … 6 = domingo (semanas de estadística empiezan el lunes)
export function mondayIndex(key) {
  return (weekdayOf(key) + 6) % 7;
}

export function weekStart(key) {
  return addDays(key, -mondayIndex(key));
}

export function isoWeek(key) {
  const thursday = addDays(key, 3 - mondayIndex(key));
  const { y } = parseKey(thursday);
  const week = Math.floor(diffDays(`${y}-01-01`, thursday) / 7) + 1;
  return { year: y, week, label: `${y}-W${pad(week)}` };
}

export function formatLong(key) {
  const { m, d } = parseKey(key);
  const wd = WEEKDAYS[weekdayOf(key)];
  return `${wd[0].toUpperCase()}${wd.slice(1)} ${d} de ${MONTHS[m - 1]}`;
}

export function formatShort(key) {
  const { m, d } = parseKey(key);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function formatRange(a, b) {
  const pa = parseKey(a), pb = parseKey(b);
  if (pa.m === pb.m && pa.y === pb.y) return `${pa.d}–${pb.d} ${MONTHS_SHORT[pb.m - 1]}`;
  return `${formatShort(a)}–${formatShort(b)}`;
}

export function monthTitle(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
