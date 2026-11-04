// Registro extendido del día (los mismos campos del "Registro diario" del panel de WhatsApp):
// energía y ánimo (1-5), sueño (hora de acostarse anoche y de levantarse), tarea #1, top 3,
// cierre del día (qué queda para mañana) y focos (bloques de concentración).
// Lógica pura: sin DOM. El temporizador de foco guarda la hora de inicio en meta.focus, así
// sobrevive a cerrar la app.
import { monthKey, addDays, parseKey } from './dates.js';

// Igual que months.dayIsInRange (copiado para no crear un ciclo de imports con stats.js).
const dayIsInRange = (m, key) => !!m && monthKey(key) === m.key && parseKey(key).d >= m.startDay;

export const LOG_TEXT = { task1: 140, top3: 240, close: 200 };
export const MAX_FOCUS = 20;
export const FOCUS_MINUTES = [15, 25, 50];
export const DEFAULT_FOCUS_MIN = 25;
export const DEFAULT_CHECKIN = { enabled: true, focusMinutes: DEFAULT_FOCUS_MIN };
export const SLEEP_GOOD = 7; // horas: referencia para "noche de descanso" (misión semanal)

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (s) => typeof s === 'string' && TIME_RE.test(s);
const isScale = (v) => Number.isInteger(v) && v >= 1 && v <= 5;

// Horas entre acostarse (anoche) y levantarse. Si la hora de acostarse es "mayor", cruzó la
// medianoche; si es de madrugada (00:30), es la misma fecha. Redondeo a 1/4 de hora.
export function sleepHours(bed, wake) {
  if (!isTime(bed) || !isTime(wake)) return null;
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  let diff = toMin(wake) - toMin(bed);
  if (diff <= 0) diff += 24 * 60;
  if (diff > 16 * 60) return null; // más de 16 h: casi seguro un error de digitación
  return Math.round((diff / 60) * 4) / 4;
}

export function dayLog(state, key) {
  return state.months[monthKey(key)]?.days[key]?.log || null;
}

// Campos que cuentan como "registrado" (para días en blanco y el +4 del día).
export function logHasData(log) {
  if (!log) return false;
  return isScale(log.energy) || isScale(log.mood) || (log.focus || 0) > 0
    || ['task1', 'top3', 'close'].some((f) => typeof log[f] === 'string' && log[f].trim() !== '')
    || isTime(log.bed) || isTime(log.wake);
}

// Check-in completo = energía + ánimo + sueño (bonus +3 del panel de WhatsApp).
export function checkinComplete(log) {
  return !!log && isScale(log.energy) && isScale(log.mood) && sleepHours(log.bed, log.wake) !== null;
}

export function validateLog(log) {
  if (log === undefined) return null;
  if (!log || typeof log !== 'object' || Array.isArray(log)) return 'registro del día inválido';
  for (const f of ['energy', 'mood']) if (log[f] !== undefined && !isScale(log[f])) return `${f} debe ser 1-5`;
  for (const f of ['bed', 'wake']) if (log[f] !== undefined && !isTime(log[f])) return `${f} debe ser HH:MM`;
  for (const [f, max] of Object.entries(LOG_TEXT)) {
    if (log[f] !== undefined && (typeof log[f] !== 'string' || log[f].length > max)) return `${f}: texto de máx. ${max}`;
  }
  if (log.focus !== undefined && (!Number.isInteger(log.focus) || log.focus < 0 || log.focus > MAX_FOCUS)) return `focus: 0-${MAX_FOCUS}`;
  return null;
}

function editableMonth(state, key) {
  const m = state.months[monthKey(key)];
  if (!dayIsInRange(m, key)) throw new Error('día fuera del mes registrado');
  return m;
}

function tidy(m, key) {
  const d = m.days[key];
  if (!d) return;
  if (d.log && !Object.keys(d.log).length) delete d.log;
  if (!d.note && !d.off && !Object.keys(d.checks).length && !d.log) delete m.days[key];
}

/**
 * Cambia campos del registro del día. patch = { energy, mood, bed, wake, task1, top3, close, focus }.
 * null o '' borra el campo. Se puede editar aunque el mes esté cerrado (como la línea del día).
 */
export function setLog(state, key, patch) {
  const m = editableMonth(state, key);
  if (!m.days[key]) m.days[key] = { note: '', checks: {} };
  const d = m.days[key];
  const log = { ...(d.log || {}) };
  for (const [f, raw] of Object.entries(patch || {})) {
    let v = raw;
    if (f in LOG_TEXT) v = v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trimStart().slice(0, LOG_TEXT[f]);
    if (v === null || v === undefined || v === '') { delete log[f]; continue; }
    if (f === 'energy' || f === 'mood') { if (!isScale(v)) throw new Error('usa una escala de 1 a 5'); }
    else if (f === 'bed' || f === 'wake') { if (!isTime(v)) throw new Error('hora inválida'); }
    else if (f === 'focus') { v = Math.max(0, Math.min(MAX_FOCUS, Math.round(Number(v) || 0))); if (!v) { delete log[f]; continue; } }
    else if (!(f in LOG_TEXT)) throw new Error(`campo desconocido: ${f}`);
    log[f] = v;
  }
  d.log = log;
  tidy(m, key);
  return m.days[key]?.log || null;
}

export function addFocus(state, key, n = 1) {
  const cur = dayLog(state, key)?.focus || 0;
  return setLog(state, key, { focus: cur + n })?.focus || 0;
}

// "Ayer dejaste: …" → sugerencia de tarea #1 si hoy aún no hay una.
export function suggestedTask(state, today) {
  if (dayLog(state, today)?.task1) return null;
  const y = dayLog(state, addDays(today, -1));
  const t = (y?.close || '').trim();
  return t || null;
}

// ---------- Temporizador de foco ----------

export function startFocus(state, key, nowMs, minutes) {
  editableMonth(state, key);
  const mins = FOCUS_MINUTES.includes(minutes) ? minutes : (state.meta.checkin?.focusMinutes || DEFAULT_FOCUS_MIN);
  state.meta.focus = { day: key, start: nowMs, minutes: mins };
  return state.meta.focus;
}

export function focusStatus(state, nowMs) {
  const f = state.meta.focus;
  if (!f) return null;
  const total = f.minutes * 60000;
  const elapsed = Math.max(0, nowMs - f.start);
  return { ...f, total, elapsed, remaining: Math.max(0, total - elapsed), done: elapsed >= total };
}

// Termina el foco: si se completó suma 1 al día en que empezó. Devuelve los focos de ese día o null.
export function finishFocus(state, nowMs) {
  const st = focusStatus(state, nowMs);
  state.meta.focus = null;
  if (!st || !st.done) return null;
  try { return addFocus(state, st.day, 1); } catch { return null; }
}

export function cancelFocus(state) {
  state.meta.focus = null;
}

export function formatClock(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
