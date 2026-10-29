import { monthKey, monthLength, dayKeyOf, parseKey, mondayIndex, weekStart, addDays } from './dates.js';

export const isDone = (v) => v === 'full' || v === 'min';

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

export function expectedFor(habit, nDays) {
  if (habit.target?.type === 'weekly') return Math.floor((habit.target.count * nDays) / 7);
  return nDays;
}

export function pctOf(done, expected) {
  if (expected <= 0) return null;
  return Math.min(1, done / expected);
}

// keys: lista de fechas; daysByKey(key) → registro del día
export function countHabit(habit, keys, daysByKey) {
  let full = 0, min = 0;
  for (const k of keys) {
    const v = daysByKey(k)?.checks?.[habit.id];
    if (v === 'full') full++;
    else if (v === 'min') min++;
  }
  const done = full + min;
  const expected = expectedFor(habit, keys.length);
  return { done, full, min, expected, pct: pctOf(done, expected) };
}

export function habitStats(month, habit, today) {
  return countHabit(habit, elapsedKeys(month, today), (k) => month.days[k]);
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
    series.push({ day: d, key, counts, score: counts ? dayScore(month, key) : null, blank: counts ? isBlank(month.days[key]) : null });
  }
  const counted = series.filter((s) => s.counts);
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

  return {
    daysElapsed: counted.length,
    daysRegistered: registered,
    pctRegistered: pctOf(registered, counted.length),
    bestDay: bestDay ? { day: bestDay.day, key: bestDay.key, score: bestDay.score } : null,
    weakestWeekday, // 0 = lunes
    perHabit,
    series,
  };
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

export function suggestDecision(pct) {
  if (pct === null || pct === undefined) return 'keep';
  if (pct >= 0.8) return 'up';
  if (pct < 0.5) return 'down';
  return 'keep';
}
