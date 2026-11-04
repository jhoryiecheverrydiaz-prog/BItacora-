// Panel: tendencias y relaciones entre hábitos y el registro del día (energía, ánimo, sueño, focos).
// Lógica pura. Todo es descriptivo (promedios de tus días), sin juicios.
import { monthKey, addDays, addMonths, mondayIndex } from './dates.js';
import { elapsedKeys, isOff, isDone, dayScore, monthStats } from './stats.js';
import { sleepHours, SLEEP_GOOD } from './checkin.js';

export const MIN_SAMPLE = 3; // días mínimos por grupo para comparar
export const RANGES = { 7: 'Última semana', 30: 'Últimos 30 días', 90: 'Últimos 90 días' };

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Días contados (ya transcurridos, dentro de un mes registrado y no libres) entre from y to.
export function rangeKeys(state, from, to) {
  const out = [];
  const months = Object.keys(state.months).filter((k) => k >= monthKey(from) && k <= monthKey(to)).sort();
  for (const mk of months) {
    const m = state.months[mk];
    for (const k of elapsedKeys(m, to)) if (k >= from && k <= to && !isOff(m.days[k])) out.push(k);
  }
  return out;
}

export const lastDays = (state, today, n) => rangeKeys(state, addDays(today, -(n - 1)), today);

// Valores de un día: % de hábitos, energía, ánimo, sueño (h), focos, tarea #1.
export function dayPoint(state, key) {
  const m = state.months[monthKey(key)];
  const d = m?.days[key];
  const log = d?.log || {};
  return {
    key,
    pct: m?.habits.length ? dayScore(m, key) / m.habits.length : null,
    energy: log.energy ?? null,
    mood: log.mood ?? null,
    sleep: sleepHours(log.bed, log.wake),
    focus: log.focus || 0,
    task1: !!(log.task1 || '').trim(),
  };
}

export function series(state, keys) {
  return keys.map((k) => dayPoint(state, k));
}

export function summarize(state, keys) {
  const pts = series(state, keys);
  const vals = (f) => pts.map((p) => p[f]).filter((v) => v !== null && v !== undefined);
  const sleeps = vals('sleep');
  return {
    days: pts.length,
    pct: avg(vals('pct')),
    energy: avg(vals('energy')),
    mood: avg(vals('mood')),
    sleep: avg(sleeps),
    goodNights: sleeps.filter((s) => s >= SLEEP_GOOD).length,
    sleepDays: sleeps.length,
    focus: pts.reduce((a, p) => a + p.focus, 0),
    focusDays: pts.filter((p) => p.focus > 0).length,
    task1Days: pts.filter((p) => p.task1).length,
    checkinDays: pts.filter((p) => p.energy !== null || p.mood !== null).length,
  };
}

// Promedio de `metric` los días que hiciste el hábito frente a los que no.
// Devuelve null si no hay al menos MIN_SAMPLE días en cada grupo.
export function habitImpact(state, keys, habitId, metric) {
  const yes = [], no = [];
  for (const k of keys) {
    const m = state.months[monthKey(k)];
    if (!m?.habits.some((h) => h.id === habitId)) continue;
    const v = dayPoint(state, k)[metric];
    if (v === null || v === undefined) continue;
    (isDone(m.days[k]?.checks?.[habitId]) ? yes : no).push(v);
  }
  if (yes.length < MIN_SAMPLE || no.length < MIN_SAMPLE) return null;
  const a = avg(yes), b = avg(no);
  return { with: a, without: b, diff: a - b, nWith: yes.length, nWithout: no.length };
}

// % de hábitos cumplidos tras dormir ≥ SLEEP_GOOD h frente a menos.
export function sleepImpact(state, keys) {
  const good = [], bad = [];
  for (const p of series(state, keys)) {
    if (p.sleep === null || p.pct === null) continue;
    (p.sleep >= SLEEP_GOOD ? good : bad).push(p.pct);
  }
  if (good.length < MIN_SAMPLE || bad.length < MIN_SAMPLE) return null;
  return { good: avg(good), bad: avg(bad), diff: avg(good) - avg(bad), nGood: good.length, nBad: bad.length };
}

// % de hábitos por día de la semana (0 = lunes).
export function weekdayProfile(state, keys) {
  const sum = Array(7).fill(0), n = Array(7).fill(0);
  for (const p of series(state, keys)) {
    if (p.pct === null) continue;
    const i = mondayIndex(p.key);
    sum[i] += p.pct; n[i]++;
  }
  return sum.map((s, i) => (n[i] ? s / n[i] : null));
}

// Últimos n meses (hasta el de hoy): cumplimiento y promedios del registro.
export function monthTrend(state, today, n = 6) {
  const out = [];
  const cur = monthKey(today);
  for (let i = n - 1; i >= 0; i--) {
    const k = addMonths(cur, -i);
    const m = state.months[k];
    if (!m) { out.push({ key: k, pct: null, energy: null, mood: null, sleep: null, focus: 0 }); continue; }
    const keys = elapsedKeys(m, today).filter((d) => !isOff(m.days[d]));
    const s = summarize(state, keys);
    out.push({ key: k, pct: monthStats(m, today).pct, energy: s.energy, mood: s.mood, sleep: s.sleep, focus: s.focus });
  }
  return out;
}

// Hallazgos en frases cortas y factuales para el Panel (máx. `max`). Ordenados por tamaño del efecto.
export function findings(state, keys, max = 4) {
  const out = [];
  const lastKey = keys[keys.length - 1];
  const m = lastKey && state.months[monthKey(lastKey)];
  const fmt = (v) => v.toFixed(1).replace('.', ',');
  for (const h of m?.habits || []) {
    for (const [metric, label] of [['energy', 'energía'], ['mood', 'ánimo']]) {
      const r = habitImpact(state, keys, h.id, metric);
      if (r && Math.abs(r.diff) >= 0.4) out.push({ size: Math.abs(r.diff) / 4, text: `Los días con ${h.short} tu ${label} promedia ${fmt(r.with)}; sin ${h.short}, ${fmt(r.without)}.` });
    }
  }
  const s = sleepImpact(state, keys);
  if (s && Math.abs(s.diff) >= 0.1) out.push({ size: Math.abs(s.diff), text: `Tras dormir ${SLEEP_GOOD} h o más cumples el ${Math.round(s.good * 100)} % de tus hábitos; con menos sueño, el ${Math.round(s.bad * 100)} %.` });
  const wp = weekdayProfile(state, keys);
  const known = wp.map((v, i) => [v, i]).filter(([v]) => v !== null);
  if (known.length >= 5) {
    const lo = known.reduce((a, b) => (b[0] < a[0] ? b : a));
    const hi = known.reduce((a, b) => (b[0] > a[0] ? b : a));
    const names = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
    const nm = (i) => `los ${names[i]}`;
    if (hi[0] - lo[0] >= 0.15) out.push({ size: hi[0] - lo[0], text: `Tu mejor día es ${nm(hi[1])} (${Math.round(hi[0] * 100)} %); el más flojo, ${nm(lo[1])} (${Math.round(lo[0] * 100)} %).` });
  }
  return out.sort((a, b) => b.size - a.size).slice(0, max).map((f) => f.text);
}
