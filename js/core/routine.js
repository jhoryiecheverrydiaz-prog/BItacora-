// Rutina y puntualidad: lógica pura para ordenar Hoy por momento del día, aprender tu hora real,
// sugerir el recordatorio y otros datos personales. Sin DOM, sin red.
import { monthKey, addDays, diffDays, weekdayOf, parseKey, isDateKey } from './dates.js';
import { isDone, isBlank, isOff, elapsedKeys, dayScore } from './stats.js';

export const WHEN_LABEL = { am: 'Mañana', pm: 'Tarde', night: 'Noche' };
export const WHEN_ICON = { am: '🌅', pm: '☀️', night: '🌙' };
// Franjas (hora local): mañana 5–12, tarde 12–19, noche 19–5.
export function slotOf(hour) {
  if (hour >= 5 && hour < 12) return 'am';
  if (hour >= 12 && hour < 19) return 'pm';
  return 'night';
}
const SLOT_ORDER = { am: 0, pm: 1, night: 2 };

export const toMin = (hm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const toHM = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min) % 60).padStart(2, '0')}`;
export const nowHM = (d = new Date()) => toHM(d.getHours() * 60 + d.getMinutes());

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

// Días con datos de los últimos `n` días hasta `today` (incluido): [{ key, day, month }].
export function recentDays(state, today, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = addDays(today, -i);
    const m = state.months[monthKey(k)];
    if (m?.days?.[k]) out.push({ key: k, day: m.days[k], month: m });
  }
  return out;
}

// Hora típica (mediana) en que marcas un hábito como completo. { hm, n } o null con < 3 muestras.
export function typicalTime(state, habitId, today, windowDays = 28) {
  const mins = recentDays(state, today, windowDays).map((x) => toMin(x.day.at?.[habitId])).filter((v) => v !== null);
  if (mins.length < 3) return null;
  return { hm: toHM(median(mins)), n: mins.length };
}

// Momento efectivo de un hábito: el elegido o el aprendido de tu hora real.
export function effectiveWhen(state, habit, today) {
  if (habit.when) return habit.when;
  const t = typicalTime(state, habit.id, today);
  return t ? slotOf(Math.floor(toMin(t.hm) / 60)) : null;
}

// ¿Toca hoy? Con días fijos (target.days o habit.days) solo esos días; si no, siempre.
export function isDueOn(habit, key) {
  return !habit.days?.length || habit.days.includes(weekdayOf(key));
}

/**
 * Orden de Hoy. Devuelve grupos para pintar:
 *  { now: [], later: [], optional: [], done: [] }
 * - now: toca y es de esta franja (o antes) y aún no está marcado.
 * - later: toca más tarde hoy.
 * - optional: hoy no le toca (días fijos).
 * - done: ya marcado.
 * Para otro día (corrección) o con orden manual: todo en `now` en el orden del mes, sin agrupar.
 */
export function todayGroups(state, month, key, today, hour, mode = 'smart') {
  const checks = month.days[key]?.checks || {};
  if (mode === 'manual' || key !== today) return { now: month.habits.slice(), later: [], optional: [], done: [], flat: true };
  const slot = SLOT_ORDER[slotOf(hour)];
  const typical = (h) => toMin(typicalTime(state, h.id, today)?.hm) ?? Infinity;
  const withWhen = month.habits.map((h, i) => ({ h, i, w: effectiveWhen(state, h, today), t: typical(h) }));
  // Apilados: el que va "después de" otro hereda su momento y queda justo detrás.
  const byId = Object.fromEntries(withWhen.map((x) => [x.h.id, x]));
  for (const x of withWhen) {
    const base = x.h.after && byId[x.h.after];
    if (base && !x.h.when) x.w = base.w;
  }
  const rank = (x) => [x.w ? SLOT_ORDER[x.w] : slot, x.h.after && byId[x.h.after] ? byId[x.h.after].t + 1 : x.t, x.i];
  const sorted = withWhen.sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    for (let j = 0; j < ra.length; j++) if (ra[j] !== rb[j]) return ra[j] - rb[j];
    return 0;
  });
  const g = { now: [], later: [], optional: [], done: [], flat: false };
  for (const x of sorted) {
    if (isDone(checks[x.h.id])) g.done.push(x.h);
    else if (!isDueOn(x.h, key)) g.optional.push(x.h);
    else if (x.w && SLOT_ORDER[x.w] > slot) g.later.push(x.h);
    else g.now.push(x.h);
  }
  return g;
}

// Siguiente en la cadena: hábitos que van "después de" `habitId` y aún no están marcados hoy.
export function nextInStack(month, key, habitId) {
  const checks = month.days[key]?.checks || {};
  return month.habits.filter((h) => h.after === habitId && !isDone(checks[h.id])).map((h) => h.id);
}

// Hora real del primer registro de cada día (mediana) vs. la hora del recordatorio.
// Devuelve { hm, n, diff } si conviene cambiarlo (≥ 7 días con hora y diferencia ≥ 45 min), si no null.
export function reminderSuggestion(state, today, windowDays = 14) {
  const plan = toMin(state.profile?.reminderTime);
  if (plan === null) return null;
  const firsts = recentDays(state, today, windowDays)
    .map((x) => Math.min(...Object.values(x.day.at || {}).map(toMin).filter((v) => v !== null)))
    .filter((v) => Number.isFinite(v));
  if (firsts.length < 7) return null;
  const med = Math.round(median(firsts) / 5) * 5;
  const diff = med - plan;
  return Math.abs(diff) >= 45 ? { hm: toHM(med), n: firsts.length, diff } : null;
}

// Día de la semana con menor cumplimiento en las últimas 8 semanas (0 = domingo), o null sin datos.
export function weakWeekday(state, today) {
  const sum = Array(7).fill(0), cnt = Array(7).fill(0);
  for (let i = 1; i <= 56; i++) {
    const k = addDays(today, -i);
    const m = state.months[monthKey(k)];
    if (!m || !m.habits.length || !elapsedKeys(m, today).includes(k) || isOff(m.days[k])) continue;
    const wd = weekdayOf(k);
    sum[wd] += dayScore(m, k) / m.habits.length; cnt[wd]++;
  }
  let best = null;
  for (let wd = 0; wd < 7; wd++) {
    if (cnt[wd] < 3) continue;
    const avg = sum[wd] / cnt[wd];
    if (best === null || avg < best.avg) best = { wd, avg };
  }
  // Solo es "flojo" si está claramente por debajo del resto.
  const total = cnt.reduce((a, b) => a + b, 0);
  const overall = total ? sum.reduce((a, b) => a + b, 0) / total : null;
  return best && overall !== null && best.avg <= overall - 0.15 ? best.wd : null;
}

const STOP = new Set('para pero como cuando porque desde hasta sobre entre todo toda todos todas este esta esto estos estas aunque luego hacer hice tuve tengo muy más menos algo nada bien solo sola cosa cosas día días hoy ayer mañana tarde noche fue fui estaba están estoy'.split(' '));
// Palabras que más usas en las notas (para completar la línea del día con un toque).
export function topWords(state, today, n = 5, windowDays = 45) {
  const freq = new Map();
  for (const x of recentDays(state, today, windowDays)) {
    for (const w of (x.day.note || '').toLowerCase().match(/[a-záéíóúñü]{4,}/g) || []) {
      if (STOP.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return [...freq.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([w]) => w);
}

// Nota del mismo día hace un año (si existe).
export function yearAgo(state, key) {
  const { y, m, d } = parseKey(key);
  const k = `${y - 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!isDateKey(k)) return null;
  const note = state.months[monthKey(k)]?.days?.[k]?.note;
  return note ? { key: k, note } : null;
}

// Días seguidos sin registro antes de hoy (sin contar días libres). Para "bienvenido de vuelta".
export function daysAway(state, today, max = 60) {
  let n = 0;
  for (let i = 1; i <= max; i++) {
    const k = addDays(today, -i);
    const m = state.months[monthKey(k)];
    if (!m || parseKey(k).d < m.startDay) break;
    const day = m.days[k];
    if (isOff(day)) continue;
    if (!isBlank(day)) break;
    n++;
  }
  return n;
}

// Edad del hábito (mismo id a través de los meses): días desde su primer día en la bitácora.
export function habitAgeDays(state, habitId, today) {
  for (const key of Object.keys(state.months).sort()) {
    const m = state.months[key];
    if (!m.habits.some((h) => h.id === habitId)) continue;
    const first = `${key}-${String(m.startDay).padStart(2, '0')}`;
    return Math.max(0, diffDays(first, today) + 1);
  }
  return 0;
}
export const AUTOMATIC_MEDIAN_DAYS = 66; // Lally et al. (2010): mediana 66, rango 18–254.

// Comienzo fresco: lunes o día 1 del mes.
export function freshStart(key) {
  if (parseKey(key).d === 1) return 'month';
  if (weekdayOf(key) === 1) return 'week';
  return null;
}

// Veces que volviste a registrar después de un día en blanco (para el título del Sistema).
export function comebacks(state, today) {
  let n = 0, prevBlank = false;
  for (const key of Object.keys(state.months).sort()) {
    const m = state.months[key];
    if (key > monthKey(today)) break;
    for (const k of elapsedKeys(m, today)) {
      const day = m.days[k];
      if (isOff(day)) continue;
      const blank = isBlank(day);
      if (!blank && prevBlank) n++;
      prevBlank = k !== today && blank;
    }
  }
  return n;
}

// Temporada ligera: activa si hoy ≤ season.until.
export function inSeason(state, today) {
  const s = state.meta?.season;
  return !!(s && s.until && today <= s.until);
}

// Área más trabajada del mes (por hábitos cumplidos): id o null.
export function topArea(month, today) {
  const pts = {};
  for (const k of elapsedKeys(month, today)) {
    for (const h of month.habits) if (h.area && isDone(month.days[k]?.checks?.[h.id])) pts[h.area] = (pts[h.area] || 0) + 1;
  }
  const best = Object.entries(pts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

// Sugerencia de versión mínima por palabra clave (crear hábito sin pensar el mínimo).
const MIN_HINTS = [
  [/le(e|er)|libro|lectura/, '1 página'], [/medit/, '2 minutos sentado'], [/agua|hidrat/, 'Un vaso al despertar'],
  [/gym|gimnas|entren|pesas/, 'Ir y entrenar 20 min'], [/corr|trot|run/, '10 minutos'], [/camin/, '10 minutos'],
  [/escrib|diario|journal/, '3 líneas'], [/dorm|sueño/, 'Celular fuera de la cama a la hora'], [/estudi|curso|aprend/, '15 minutos'],
  [/ingl|idioma|duolingo|franc/, '1 lección'], [/yoga|estir/, '5 minutos'], [/ahorr|gasto|finanz/, 'Anotar los gastos del día'],
  [/orar|rez/, '1 minuto'], [/cocin|comer|fruta|verdur/, 'Una porción'], [/redes|celular|pantalla/, 'Sin celular la primera media hora'],
];
export function suggestMin(name) {
  const n = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return MIN_HINTS.find(([re]) => re.test(n))?.[1] || '';
}
