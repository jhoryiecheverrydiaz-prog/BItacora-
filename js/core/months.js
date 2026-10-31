import { todayKey, monthKey, parseKey, addDays, addMonths, diffDays, weekdayOf, isDateKey } from './dates.js';
import { isBlank, isDone, isOff } from './stats.js';
import { CURRENT_VERSION, DEFAULT_AREAS, DEFAULT_GAME } from './migrate.js';

export const MAX_HABITS = 5;
export const RECOMMENDED_START = 3;
export const MAX_GOALS = 3;
// Tope al guardar/validar (los meses importados de Sheets pueden traer más metas mensuales).
export const MAX_GOALS_STORED = 10;
export const MAX_SHORT = 6;
export const LOOKBACK_DAYS = 7;
export const BACKUP_EVERY_DAYS = 7;
export const MAX_MONTHLY = 20;
// Paleta fija de 5, contraste AA sobre papel claro y oscuro (se ajusta en CSS por índice)
export const PALETTE = ['c1', 'c2', 'c3', 'c4', 'c5'];

export function newId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().slice(0, 8);
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

export function autoShort(name) {
  const clean = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '').trim().toUpperCase();
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return words[0].slice(0, MAX_SHORT);
}

export function emptyState() {
  return {
    schemaVersion: CURRENT_VERSION,
    profile: null,
    areas: structuredClone(DEFAULT_AREAS),
    years: {},
    months: {},
    meta: { lastOpenedDate: null, lastBackupAt: null, lastWeeklySentAt: null, persistGranted: null, closeSnoozedOn: null, onboardingDraft: null, pendingImport: null, game: { ...DEFAULT_GAME } },
  };
}

export function validateTarget(t) {
  if (!t || typeof t !== 'object') return 'frecuencia ausente';
  if (t.type === 'daily') return null;
  if (t.type === 'weekly' && Number.isInteger(t.count) && t.count >= 1 && t.count <= 7) return null;
  if (t.type === 'monthly' && Number.isInteger(t.count) && t.count >= 1 && t.count <= MAX_MONTHLY) return null;
  return `frecuencia inválida (diaria, 1-7 por semana o 1-${MAX_MONTHLY} por mes)`;
}

export function validateHabit(h) {
  if (!h || typeof h !== 'object') return 'hábito inválido';
  if (typeof h.name !== 'string' || !h.name.trim()) return 'falta el nombre';
  if (typeof h.short !== 'string' || !h.short.trim()) return `"${h.name}": falta la etiqueta corta`;
  if (h.short.length > MAX_SHORT) return `"${h.name}": la etiqueta corta tiene más de ${MAX_SHORT} caracteres`;
  if (typeof h.min !== 'string' || !h.min.trim()) return `"${h.name}": falta la versión mínima`;
  if (h.area !== undefined && h.area !== null && typeof h.area !== 'string') return `"${h.name}": área inválida`;
  if (h.note !== undefined && typeof h.note !== 'string') return `"${h.name}": la nota debe ser texto`;
  const t = validateTarget(h.target);
  return t ? `"${h.name}": ${t}` : null;
}

export function validateHabitList(list) {
  if (!Array.isArray(list)) return ['la lista de hábitos no es una lista'];
  const errors = [];
  if (list.length > MAX_HABITS) errors.push(`máximo ${MAX_HABITS} hábitos por mes (hay ${list.length})`);
  for (const h of list) { const e = validateHabit(h); if (e) errors.push(e); }
  const shorts = list.map((h) => h.short?.toUpperCase());
  if (new Set(shorts).size !== shorts.length) errors.push('hay etiquetas cortas repetidas');
  return errors;
}

export function makeHabit(input, colorIndex = 0) {
  return {
    id: input.id || newId(),
    name: input.name.trim(),
    short: (input.short || autoShort(input.name)).trim().toUpperCase(),
    min: input.min.trim(),
    target: copyTarget(input.target),
    area: input.area || null,
    ...(input.note ? { note: String(input.note).trim().slice(0, 140) } : {}),
    level: input.level || 1,
    color: input.color || PALETTE[colorIndex % PALETTE.length],
  };
}

export function copyTarget(t) {
  return t?.type === 'weekly' || t?.type === 'monthly' ? { type: t.type, count: t.count } : { type: 'daily' };
}

function assignColors(habits) {
  const used = new Set();
  return habits.map((h) => {
    let color = h.color && !used.has(h.color) ? h.color : PALETTE.find((c) => !used.has(c));
    used.add(color);
    return { ...h, color };
  });
}

export function makeGoals(texts) {
  return (texts || []).map((t) => String(t).trim()).filter(Boolean).slice(0, MAX_GOALS)
    .map((text) => ({ id: newId(), text, done: null }));
}

export function makeMonth(key, { startDay = 1, isStarter = false, habits = [], mantra = '', goals = [] } = {}) {
  return { key, startDay, isStarter, mantra, goals, habits: assignColors(habits), days: {}, changeLog: [], review: null };
}

function assertHabits(list) {
  const errors = validateHabitList(list);
  if (errors.length) throw new Error(errors.join('; '));
}

// Onboarding: crea el mes de arranque (parcial) desde startKey.
export function createStarterState({ profile, startKey, today, habits, mantra = '', goals = [] }) {
  if (!isDateKey(startKey)) throw new Error('fecha de inicio inválida');
  const back = diffDays(startKey, today);
  if (back < 0 || back > LOOKBACK_DAYS) throw new Error(`el inicio debe estar entre hoy y ${LOOKBACK_DAYS} días atrás`);
  const list = habits.map((h, i) => makeHabit(h, i));
  assertHabits(list);
  if (!list.length) throw new Error('elige al menos un hábito');
  const state = emptyState();
  state.profile = { ...profile, createdAt: today };
  const key = monthKey(startKey);
  const startDay = parseKey(startKey).d;
  state.months[key] = makeMonth(key, { startDay, isStarter: true, habits: list, mantra: mantra.trim(), goals: makeGoals(goals) });
  state.meta.lastOpenedDate = today;
  return state;
}

export function currentMonth(state, today) {
  return state.months[monthKey(today)] || null;
}

export function latestMonthKey(state) {
  const keys = Object.keys(state.months).sort();
  return keys[keys.length - 1] || null;
}

// Mes anterior sin cerrar que bloquea (el más antiguo < mes de hoy).
export function pendingCloseKey(state, today) {
  const cur = monthKey(today);
  return Object.keys(state.months).sort().find((k) => k < cur && !state.months[k].review) || null;
}

export function closeStatus(state, today) {
  const key = pendingCloseKey(state, today);
  if (!key) return null;
  const s = state.meta.closeSnoozedOn;
  return { key, snoozedToday: s === today, canSnooze: !s };
}

function copyHabits(habits) {
  return habits.map((h) => ({ ...h, target: copyTarget(h.target) }));
}

// "Cerrar después" (máx. 1 vez): crea el mes actual provisional con los mismos hábitos.
export function snoozeClose(state, today) {
  const st = closeStatus(state, today);
  if (!st || !st.canSnooze) throw new Error('el cierre ya no se puede posponer');
  state.meta.closeSnoozedOn = today;
  const cur = monthKey(today);
  if (!state.months[cur]) {
    const prev = state.months[st.key];
    state.months[cur] = makeMonth(cur, { habits: copyHabits(prev.habits), mantra: prev.mantra });
    state.months[cur].provisional = true;
  }
}

/**
 * Cierra `key` y crea los meses siguientes hasta el de hoy.
 * plan = {
 *   decisions: { [habitId]: { decision: 'keep'|'up'|'down'|'remove'|'replace', min?, habit? } },
 *   added: [habitInput], goalsResult: { [goalId]: true|false }, mantra, goals: [texto], notes
 * }
 */
export function applyClose(state, key, plan, today, nowIso = new Date().toISOString()) {
  const month = state.months[key];
  if (!month) throw new Error(`no existe el mes ${key}`);
  if (month.review) throw new Error(`el mes ${key} ya está cerrado`);
  if (key >= monthKey(today)) throw new Error('solo se cierra un mes terminado');

  const next = [];
  const perHabit = {};
  for (const h of month.habits) {
    const d = plan.decisions?.[h.id] || { decision: 'keep' };
    perHabit[h.id] = { pct: d.pct ?? null, decision: d.decision };
    if (d.decision === 'remove') continue;
    if (d.decision === 'replace') { next.push(makeHabit({ ...d.habit, id: undefined, color: h.color })); continue; }
    const level = d.decision === 'up' ? h.level + 1 : d.decision === 'down' ? Math.max(1, h.level - 1) : h.level;
    next.push({ ...h, target: copyTarget(h.target), min: (d.min ?? h.min).trim(), level, ...(d.habit ? pickEditable(d.habit) : {}) });
  }
  for (const a of plan.added || []) next.push(makeHabit({ ...a, id: undefined }));
  assertHabits(next);

  for (const g of month.goals) if (plan.goalsResult && g.id in plan.goalsResult) g.done = plan.goalsResult[g.id];
  const log = month.changeLog.map((c) => `${todayKey(new Date(c.at))}: ${c.text}`);
  month.review = {
    closedAt: nowIso,
    perHabit,
    goalsResult: Object.fromEntries(month.goals.map((g) => [g.id, g.done])),
    notes: [plan.notes, ...log].filter(Boolean).join('\n'),
  };

  const cur = monthKey(today);
  const habits = assignColors(next);
  for (let k = addMonths(key, 1); k < cur; k = addMonths(k, 1)) {
    if (state.months[k]) continue;
    const m = makeMonth(k, { habits: copyHabits(habits) });
    m.review = { closedAt: nowIso, perHabit: {}, goalsResult: {}, notes: 'Mes sin registros.', skipped: true };
    state.months[k] = m;
  }
  const existing = state.months[cur];
  const fresh = makeMonth(cur, { habits: copyHabits(habits), mantra: (plan.mantra || '').trim(), goals: makeGoals(plan.goals) });
  if (existing) {
    // Mes provisional (cierre pospuesto): se conserva lo registrado.
    Object.assign(existing, { habits: fresh.habits, mantra: fresh.mantra, goals: fresh.goals });
    delete existing.provisional;
  } else {
    state.months[cur] = fresh;
  }
  state.meta.closeSnoozedOn = null;
  return cur;
}

function pickEditable(h) {
  const out = {};
  for (const f of ['name', 'short', 'min']) if (typeof h[f] === 'string' && h[f].trim()) out[f] = f === 'short' ? h[f].trim().toUpperCase() : h[f].trim();
  if ('area' in h) out.area = h.area || null;
  if (typeof h.note === 'string') out.note = h.note.trim().slice(0, 140);
  return out;
}

// --- Registro diario ---

export const cycleValue = (v) => (v === undefined || v === null ? 'full' : v === 'full' ? 'min' : undefined);

export function dayIsInRange(month, key) {
  return !!month && monthKey(key) === month.key && parseKey(key).d >= month.startDay;
}

function ensureDay(month, key) {
  if (!month.days[key]) month.days[key] = { note: '', checks: {} };
  return month.days[key];
}

function cleanupDay(month, key) {
  const d = month.days[key];
  if (d && !d.note && !d.off && !Object.keys(d.checks).length) delete month.days[key];
}

// Día libre (descanso, enfermedad, viaje): no cuenta en lo esperado ni en días registrados.
export function toggleDayOff(state, key) {
  const month = state.months[monthKey(key)];
  if (!dayIsInRange(month, key)) throw new Error('día fuera del mes registrado');
  if (month.review) throw new Error('mes cerrado: no se cambian los días libres');
  const day = ensureDay(month, key);
  if (day.off) delete day.off; else day.off = true;
  cleanupDay(month, key);
  return !!month.days[key]?.off;
}

export function toggleCheck(state, key, habitId) {
  const month = state.months[monthKey(key)];
  if (!dayIsInRange(month, key)) throw new Error('día fuera del mes registrado');
  if (month.review) throw new Error('mes cerrado: solo se edita la nota');
  if (!month.habits.some((h) => h.id === habitId)) throw new Error('hábito no existe en este mes');
  const day = ensureDay(month, key);
  const v = cycleValue(day.checks[habitId]);
  if (v) day.checks[habitId] = v; else delete day.checks[habitId];
  cleanupDay(month, key);
  return v;
}

export function setNote(state, key, text) {
  const month = state.months[monthKey(key)];
  if (!dayIsInRange(month, key)) throw new Error('día fuera del mes registrado');
  ensureDay(month, key).note = String(text).replace(/\s*\n\s*/g, ' ').slice(0, 280);
  cleanupDay(month, key);
}

// Últimos 7 días (hoy incluido) que se pueden editar desde Hoy.
export function recentEditable(state, today) {
  const out = [];
  for (let i = LOOKBACK_DAYS - 1; i >= 0; i--) {
    const k = addDays(today, -i);
    if (dayIsInRange(state.months[monthKey(k)], k)) out.push(k);
  }
  return out;
}

export function yesterdayWasBlank(state, today) {
  const y = addDays(today, -1);
  const m = state.months[monthKey(y)];
  if (!dayIsInRange(m, y)) return false;
  return !isOff(m.days[y]) && isBlank(m.days[y]);
}

// --- Ajustes del mes en curso ---

export function editHabitText(state, mKey, habitId, fields) {
  const m = state.months[mKey];
  const h = m?.habits.find((x) => x.id === habitId);
  if (!h) throw new Error('hábito no encontrado');
  const candidate = { ...h, ...pickEditable(fields) };
  const e = validateHabit(candidate);
  if (e) throw new Error(e);
  const others = m.habits.filter((x) => x.id !== habitId).map((x) => x.short);
  if (others.includes(candidate.short)) throw new Error('etiqueta corta repetida');
  Object.assign(h, candidate);
}

// Cambio de emergencia: agregar/quitar a mitad de mes, con registro.
export function emergencyChange(state, mKey, { remove = [], add = [] }, reason, nowIso = new Date().toISOString()) {
  const m = state.months[mKey];
  if (!m || m.review) throw new Error('solo en el mes en curso');
  if (!String(reason || '').trim()) throw new Error('escribe el motivo');
  const kept = m.habits.filter((h) => !remove.includes(h.id));
  const list = [...kept, ...add.map((a) => makeHabit({ ...a, id: undefined }))];
  assertHabits(list);
  const removedNames = m.habits.filter((h) => remove.includes(h.id)).map((h) => h.short);
  const addedNames = list.slice(kept.length).map((h) => h.short);
  m.habits = assignColors(list);
  const parts = [];
  if (removedNames.length) parts.push(`quitó ${removedNames.join(', ')}`);
  if (addedNames.length) parts.push(`agregó ${addedNames.join(', ')}`);
  m.changeLog.push({ at: nowIso, text: `Cambio de emergencia: ${parts.join(' y ') || 'sin cambios'}. Motivo: ${reason.trim()}` });
}

// --- Avisos de Hoy (máx. 1, por prioridad) ---

export function backupDue(state, today) {
  const last = state.meta.lastBackupAt;
  return !last || diffDays(last.slice(0, 10), today) >= BACKUP_EVERY_DAYS;
}

export function isWeeklyDay(state, today) {
  const acc = state.profile?.accountability;
  if (!acc || weekdayOf(today) !== acc.weekday) return false;
  return (state.meta.lastWeeklySentAt || '').slice(0, 10) !== today;
}

export function topNotice(state, today) {
  if (pendingCloseKey(state, today)) return 'close';
  if (yesterdayWasBlank(state, today)) return 'blank';
  if (isWeeklyDay(state, today)) return 'weekly';
  if (backupDue(state, today)) return 'backup';
  return null;
}

export { isDone };
