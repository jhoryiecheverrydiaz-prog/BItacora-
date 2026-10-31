// Áreas de vida y metas anuales (la hoja "Metas" del tracker en Sheets).
// Las áreas son globales y estables; las metas viven por año: state.years["2026"].goals.
import { monthKey } from './dates.js';
import { monthStats } from './stats.js';
import { newId } from './months.js';

export const MAX_AREAS = 8;
export const MAX_YEAR_GOALS = 5; // por área y año
export const MAX_AREA_NAME = 30;
export const MAX_IDEAS = 6; // hábitos del plan anual por área y frecuencia
export const IDEA_FREQ = { daily: 'Diarios', weekly: 'Semanales', monthly: 'Mensuales' };

const clean = (s) => String(s ?? '').trim();

// Nombre comparable: sin emojis, tildes ni mayúsculas ("Relaciones❤️" = "relaciones").
export function normName(s) {
  return clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Separa "Fitness 🏋️‍♀️" en { name: 'Fitness', emoji: '🏋️‍♀️' }.
export function splitEmoji(text) {
  const t = clean(text);
  const m = t.match(/^(.*?)\s*((?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️)+)\s*$/u);
  return m && m[1] ? { name: m[1].trim(), emoji: m[2] } : { name: t, emoji: '' };
}

export function yearOf(state, year, create = false) {
  const y = String(year);
  if (!state.years) state.years = {};
  if (!state.years[y] && create) state.years[y] = { goals: [], habitIdeas: [] };
  if (state.years[y] && !state.years[y].habitIdeas) state.years[y].habitIdeas = [];
  return state.years[y] || { goals: [], habitIdeas: [] };
}

export function areaById(state, id) {
  return (state.areas || []).find((a) => a.id === id) || null;
}

export function areaLabel(area) {
  return area ? `${area.emoji ? `${area.emoji} ` : ''}${area.name}` : 'Sin área';
}

export function findArea(state, name) {
  const n = normName(name);
  return n ? (state.areas || []).find((a) => normName(a.name) === n) || null : null;
}

function validateAreaName(state, name, exceptId = null) {
  const n = clean(name);
  if (!n) throw new Error('escribe el nombre del área');
  if (n.length > MAX_AREA_NAME) throw new Error(`el nombre del área tiene más de ${MAX_AREA_NAME} caracteres`);
  const dup = findArea(state, n);
  if (dup && dup.id !== exceptId) throw new Error('ya existe un área con ese nombre');
  return n;
}

export function addArea(state, { name, emoji = '' }) {
  if (!state.areas) state.areas = [];
  if (state.areas.length >= MAX_AREAS) throw new Error(`máximo ${MAX_AREAS} áreas`);
  const area = { id: newId(), name: validateAreaName(state, name), emoji: clean(emoji).slice(0, 8) };
  state.areas.push(area);
  return area;
}

export function editArea(state, id, { name, emoji }) {
  const a = areaById(state, id);
  if (!a) throw new Error('área no encontrada');
  if (name !== undefined) a.name = validateAreaName(state, name, id);
  if (emoji !== undefined) a.emoji = clean(emoji).slice(0, 8);
}

// Quita el área, sus metas de todos los años y la desvincula de los hábitos de meses abiertos.
export function removeArea(state, id) {
  if (!areaById(state, id)) throw new Error('área no encontrada');
  state.areas = state.areas.filter((a) => a.id !== id);
  for (const y of Object.values(state.years || {})) {
    y.goals = y.goals.filter((g) => g.areaId !== id);
    if (y.habitIdeas) y.habitIdeas = y.habitIdeas.filter((g) => g.areaId !== id);
  }
  for (const m of Object.values(state.months)) {
    if (m.review) continue;
    for (const h of m.habits) if (h.area === id) h.area = null;
  }
}

export function goalsOf(state, year, areaId) {
  return yearOf(state, year).goals.filter((g) => g.areaId === areaId);
}

export function addYearGoal(state, year, areaId, text) {
  if (!areaById(state, areaId)) throw new Error('área no encontrada');
  const t = clean(text).slice(0, 120);
  if (!t) throw new Error('escribe la meta');
  if (goalsOf(state, year, areaId).length >= MAX_YEAR_GOALS) throw new Error(`máximo ${MAX_YEAR_GOALS} metas por área`);
  const goal = { id: newId(), areaId, text: t, done: false };
  yearOf(state, year, true).goals.push(goal);
  return goal;
}

function findGoal(state, year, goalId) {
  const g = yearOf(state, year).goals.find((x) => x.id === goalId);
  if (!g) throw new Error('meta no encontrada');
  return g;
}

export function toggleYearGoal(state, year, goalId) {
  const g = findGoal(state, year, goalId);
  g.done = !g.done;
  g.doneAt = g.done ? new Date().toISOString() : undefined;
  if (!g.done) delete g.doneAt;
  return g.done;
}

export function editYearGoal(state, year, goalId, text) {
  const t = clean(text).slice(0, 120);
  if (!t) throw new Error('escribe la meta');
  findGoal(state, year, goalId).text = t;
}

export function removeYearGoal(state, year, goalId) {
  findGoal(state, year, goalId);
  const y = yearOf(state, year, true);
  y.goals = y.goals.filter((g) => g.id !== goalId);
}

// Plan anual de hábitos por área (columnas "Hábitos diarios/semanales/mensuales" de la hoja Metas).
// Son ideas: se vuelven hábitos reales solo en el cierre de mes (tope de 5).
export function ideasOf(state, year, areaId, freq = null) {
  return yearOf(state, year).habitIdeas.filter((x) => x.areaId === areaId && (!freq || x.freq === freq));
}

export function addHabitIdea(state, year, areaId, text, freq = 'daily') {
  if (!areaById(state, areaId)) throw new Error('área no encontrada');
  if (!IDEA_FREQ[freq]) throw new Error('frecuencia inválida');
  const t = clean(text).slice(0, 40);
  if (!t) throw new Error('escribe el hábito');
  if (ideasOf(state, year, areaId, freq).length >= MAX_IDEAS) throw new Error(`máximo ${MAX_IDEAS} por frecuencia`);
  const idea = { id: newId(), areaId, text: t, freq };
  yearOf(state, year, true).habitIdeas.push(idea);
  return idea;
}

export function removeHabitIdea(state, year, ideaId) {
  const y = yearOf(state, year, true);
  if (!y.habitIdeas.some((x) => x.id === ideaId)) throw new Error('hábito no encontrado');
  y.habitIdeas = y.habitIdeas.filter((x) => x.id !== ideaId);
}

// Todas las ideas del año con su área (para elegir en el cierre).
export function allIdeas(state, year) {
  return yearOf(state, year).habitIdeas.map((x) => ({ ...x, area: areaById(state, x.areaId) })).filter((x) => x.area);
}

// Años con datos (meses o metas) + el año de hoy, de más reciente a más antiguo.
export function knownYears(state, today) {
  const set = new Set([today.slice(0, 4)]);
  for (const k of Object.keys(state.months)) set.add(k.slice(0, 4));
  for (const [y, v] of Object.entries(state.years || {})) if (v.goals?.length || v.habitIdeas?.length) set.add(y);
  return [...set].sort().reverse();
}

/**
 * Panorama del año: 12 meses con su cumplimiento y, por área, metas y hábitos vinculados
 * (los del mes de referencia: el de hoy si es de ese año, si no el último registrado).
 */
export function yearStats(state, year, today) {
  const y = String(year);
  const curKey = monthKey(today);
  const months = [];
  for (let i = 1; i <= 12; i++) {
    const key = `${y}-${String(i).padStart(2, '0')}`;
    const m = state.months[key];
    if (!m || key > curKey) { months.push({ key, exists: !!m, pct: null, daysRegistered: 0, daysElapsed: 0 }); continue; }
    const st = monthStats(m, today);
    months.push({ key, exists: true, pct: st.pct, daysRegistered: st.daysRegistered, daysElapsed: st.daysElapsed, imported: !!m.review?.imported });
  }
  const withPct = months.filter((m) => m.pct !== null);
  const refKey = state.months[curKey] && curKey.startsWith(y) ? curKey
    : Object.keys(state.months).filter((k) => k.startsWith(y) && k <= curKey).sort().pop();
  const ref = refKey ? state.months[refKey] : null;
  const refStats = ref ? monthStats(ref, today) : null;

  const goals = yearOf(state, y).goals;
  const areas = (state.areas || []).map((a) => {
    const ag = goals.filter((g) => g.areaId === a.id);
    const habits = ref ? ref.habits.filter((h) => h.area === a.id).map((h) => ({ habit: h, ...refStats.perHabit[h.id] })) : [];
    const ideas = (yearOf(state, y).habitIdeas || []).filter((x) => x.areaId === a.id);
    return { area: a, goals: ag, done: ag.filter((g) => g.done).length, total: ag.length, habits, ideas };
  });
  return {
    year: y,
    months,
    avgPct: withPct.length ? withPct.reduce((s, m) => s + m.pct, 0) / withPct.length : null,
    goalsDone: goals.filter((g) => g.done && areaById(state, g.areaId)).length,
    goalsTotal: goals.filter((g) => areaById(state, g.areaId)).length,
    refKey: refKey || null,
    areas,
  };
}
