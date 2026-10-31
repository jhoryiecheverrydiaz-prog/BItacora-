import { monthKey, monthLength, dayKeyOf, parseKey, mondayIndex, weekStart, addDays } from './dates.js';

export const isDone = (v) => v === 'full' || v === 'min';
export const isOff = (day) => day?.off === true;

export function isBlank(day) {
  if (!day) return true;
  const hasNote = typeof day.note === 'string' && day.note.trim() !== '';
  const hasCheck = day.checks && Object.values(day.checks).some(isDone);
  return !hasNote && !hasCheck;
}

// Último día del mes que ya cuenta (0 si el mes aún no empieza).
export function lastElapsedDay(month, today) {
  const len = monthLength(month.key);
  if (month.review) return len;
  const tm = monthKey(today);
  if (tm > month.key) return len;
  if (tm < month.key) return month.startDay - 1;
  return Math.min(parseKey(today).d, len);
}

export function elapsedKeys(month, today) {
  const keys = [];
  for (let d = month.startDay; d <= lastElapsedDay(month, today); d++) keys.push(dayKeyOf(month.key, d));
  return keys;
}

// nDays = días activos (sin días libres). monthLen solo importa para hábitos mensuales.
export function expectedFor(habit, nDays, monthLen = 30) {
  if (habit.target?.type === 'weekly') return Math.floor((habit.target.count * nDays) / 7);
  if (habit.target?.type === 'monthly') return Math.floor((habit.target.count * Math.min(nDays, monthLen)) / monthLen);
  return nDays;
}

export function pctOf(done, expected) {
  if (expected <= 0) return null;
  return Math.min(1, done / expected);
}

// keys: lista de fechas; daysByKey(key) → registro del día. Los días libres no suman a lo
// esperado, pero lo que se hizo en ellos sí cuenta (el % se topa en 100).
export function countHabit(habit, keys, daysByKey, monthLen = 30) {
  let full = 0, min = 0, active = 0;
  for (const k of keys) {
    const day = daysByKey(k);
    if (!isOff(day)) active++;
    const v = day?.checks?.[habit.id];
    if (v === 'full') full++;
    else if (v === 'min') min++;
  }
  const done = full + min;
  const expected = expectedFor(habit, active, monthLen);
  return { done, full, min, expected, pct: pctOf(done, expected) };
}

export function habitStats(month, habit, today) {
  return countHabit(habit, elapsedKeys(month, today), (k) => month.days[k], monthLength(month.key));
}

// Cumplimiento conjunto: Σ min(hecho, esperado) / Σ esperado. null si nada se esperaba.
export function combinedPct(counts) {
  let done = 0, expected = 0;
  for (const c of counts) { done += Math.min(c.done, c.expected); expected += c.expected; }
  return pctOf(done, expected);
}

// Cumplimiento por semana (lunes–domingo) dentro de los días contados del mes.
export function weeklyBreakdown(month, today) {
  const keys = elapsedKeys(month, today);
  const len = monthLength(month.key);
  const groups = new Map();
  for (const k of keys) {
    const ws = weekStart(k);
    if (!groups.has(ws)) groups.set(ws, []);
    groups.get(ws).push(k);
  }
  return [...groups.values()].map((ks, i) => {
    const counts = month.habits.map((h) => countHabit(h, ks, (k) => month.days[k], len));
    return { index: i + 1, start: ks[0], end: ks[ks.length - 1], days: ks.length, pct: combinedPct(counts) };
  });
}

export function dayScore(month, key) {
  const checks = month.days[key]?.checks || {};
  return month.habits.filter((h) => isDone(checks[h.id])).length;
}

export function monthStats(month, today) {
  const keys = elapsedKeys(month, today);
  const elapsed = new Set(keys);
  const len = monthLength(month.key);
  const series = [];
  for (let d = 1; d <= len; d++) {
    const key = dayKeyOf(month.key, d);
    const counts = elapsed.has(key);
    const off = counts && isOff(month.days[key]);
    const score = counts ? dayScore(month, key) : null;
    series.push({
      day: d, key, counts, off, score,
      pct: counts && !off && month.habits.length ? score / month.habits.length : null,
      // "Premios" del Sheet: día con todos los hábitos del mes cumplidos.
      perfect: counts && month.habits.length > 0 && score === month.habits.length,
      blank: counts ? isBlank(month.days[key]) : null,
    });
  }
  const all = series.filter((s) => s.counts);
  const counted = all.filter((s) => !s.off);
  const registered = counted.filter((s) => !s.blank).length;

  let bestDay = null;
  for (const s of counted) if (s.score > 0 && (!bestDay || s.score > bestDay.score)) bestDay = s;

  // Día de la semana más flojo: menor puntaje promedio (requiere ≥ 7 días contados)
  let weakestWeekday = null;
  if (counted.length >= 7) {
    const sum = Array(7).fill(0), n = Array(7).fill(0);
    for (const s of counted) { const i = mondayIndex(s.key); sum[i] += s.score; n[i]++; }
    let best = Infinity;
    for (let i = 0; i < 7; i++) {
      if (!n[i]) continue;
      const avg = sum[i] / n[i];
      if (avg < best) { best = avg; weakestWeekday = i; }
    }
  }

  const perHabit = {};
  for (const h of month.habits) perHabit[h.id] = habitStats(month, h, today);

  const dayPcts = counted.map((s) => s.pct).filter((p) => p !== null);

  return {
    daysElapsed: counted.length,
    daysOff: all.length - counted.length,
    perfectDays: all.filter((s) => s.perfect).length,
    pct: combinedPct(Object.values(perHabit)),
    avgDayPct: dayPcts.length ? dayPcts.reduce((a, b) => a + b, 0) / dayPcts.length : null,
    weeks: weeklyBreakdown(month, today),
    daysRegistered: registered,
    pctRegistered: pctOf(registered, counted.length),
    bestDay: bestDay ? { day: bestDay.day, key: bestDay.key, score: bestDay.score } : null,
    weakestWeekday, // 0 = lunes
    perHabit,
    series,
  };
}

// Avance de un hábito mensual en el mes de `today`.
export function monthProgress(state, habit, today) {
  const m = state.months[monthKey(today)];
  let done = 0;
  for (const d of Object.values(m?.days || {})) if (isDone(d.checks?.[habit.id])) done++;
  return { done, target: habit.target?.type === 'monthly' ? habit.target.count : monthLength(monthKey(today)) };
}

// Avance de un hábito semanal en la semana (lunes–domingo) de `today`, cruzando meses.
export function weekProgress(state, habit, today) {
  let done = 0;
  for (let k = weekStart(today); k <= today; k = addDays(k, 1)) {
    const m = state.months[monthKey(k)];
    if (isDone(m?.days[k]?.checks?.[habit.id])) done++;
  }
  return { done, target: habit.target?.type === 'weekly' ? habit.target.count : 7 };
}

// Rachas (columnas "Racha actual / Máx." del Sheet). Solo para hábitos diarios. Un día libre
// no corta ni suma. La actual cuenta hasta el último día contado (si hoy aún no se marca, no corta).
export function streaks(month, habit, today) {
  if (habit.target?.type && habit.target.type !== 'daily') return null;
  const keys = elapsedKeys(month, today);
  let run = 0, max = 0;
  for (const k of keys) {
    const d = month.days[k];
    if (isDone(d?.checks?.[habit.id])) { run++; max = Math.max(max, run); }
    else if (isOff(d)) continue;
    else if (k === today) continue;
    else run = 0;
  }
  return { current: run, max };
}

export function suggestDecision(pct) {
  if (pct === null || pct === undefined) return 'keep';
  if (pct >= 0.8) return 'up';
  if (pct < 0.5) return 'down';
  return 'keep';
}
