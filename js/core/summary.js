import { monthKey, addDays, weekStart, mondayIndex, isoWeek, formatRange, parseKey, dayKeyOf, WEEK_LETTERS, WEEKDAYS } from './dates.js';
import { isBlank, countHabit, dayScore, monthStats, elapsedKeys } from './stats.js';
import { dayIsInRange } from './months.js';
import { yearOf, areaById, areaLabel } from './years.js';

export const DECISION_LABEL = { keep: 'mantener', up: 'subir nivel', down: 'bajar nivel', remove: 'quitar', replace: 'reemplazar' };

const FORMAT_LINE = 'Formato JSON: {"bitacora_import":1,"applyTo":"next_month","mantra":"…","habits":[{"keepId":"<etiqueta o id>","min":"nuevo mínimo"},{"name":"…","short":"≤6","min":"…","target":{"type":"daily"|"weekly"|"monthly","count":n},"area":"<id o nombre de área>"}],"goals":["…"]}';

const WEEKLY_INSTRUCTION = 'Instrucción para Claude: Analiza esto en máx. 6 líneas, sin frases motivacionales. 1) Qué patrón real ves (con datos). 2) UN ajuste concreto para la próxima semana. 3) Si sugiero cambiar un hábito, devuélvelo como JSON "bitacora_import" para el próximo cierre.';
const NOTION_LINE = 'Si tienes Notion conectado: regístralo en la página "Bitácora · Personal" (Revisiones, y actualiza Hábitos y Experimentos). Si no, ignora esta línea.';
const MONTHLY_INSTRUCTION = 'Instrucción para Claude: Analiza este mes en máx. 8 líneas, sin frases motivacionales. 1) Qué patrón real ves (con datos). 2) Si las decisiones del cierre tienen sentido y UN ajuste concreto. 3) Si sugiero cambiar un hábito, devuélvelo como JSON "bitacora_import" para el próximo cierre.';

const freq = (h) => (h.target?.type === 'weekly' ? `${h.target.count}/sem` : h.target?.type === 'monthly' ? `${h.target.count}/mes` : 'diario');
const pct = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);

function monthLine(m) {
  return `Mes ${m.key}${m.isStarter ? ' (arranque)' : ''} · Mantra: ${m.mantra ? `"${m.mantra}"` : '—'}`;
}

function goalsLine(m) {
  if (!m.goals.length) return 'Objetivos del mes: —';
  const mark = (g) => (g.done === true ? '[x]' : g.done === false ? '[-]' : '[ ]');
  return `Objetivos del mes: ${m.goals.map((g) => `${mark(g)} ${g.text}`).join(' · ')}`;
}

function habitLine(state, h, c, decision) {
  const d = decision ? ` → ${DECISION_LABEL[decision] || decision}` : '';
  const a = h.area && areaById(state, h.area);
  return `- ${h.short} ${h.name} [${freq(h)}${a ? ` · ${a.name}` : ''}]: ${c.done}/${c.expected} (${c.min})${d}`;
}

// Metas del año por área: "Fitness 1/2 · Finanzas 0/1". Vacío si no hay metas.
export function yearGoalsLine(state, year) {
  const goals = yearOf(state, year).goals.filter((g) => areaById(state, g.areaId));
  if (!goals.length) return null;
  const parts = (state.areas || []).map((a) => {
    const ag = goals.filter((g) => g.areaId === a.id);
    return ag.length ? `${areaLabel(a)} ${ag.filter((g) => g.done).length}/${ag.length}` : null;
  }).filter(Boolean);
  return `Metas ${year}: ${parts.join(' · ')}`;
}

function linesBlock(keys, dayOf) {
  const out = keys.filter((k) => dayOf(k)?.note).map((k) => `${parseKey(k).d}: ${dayOf(k).note}`);
  return out.length ? ['Líneas:', ...out] : ['Líneas: —'];
}

// Semana lunes–domingo que contiene hoy; si hoy es lunes, la semana que acaba de terminar.
export function weeklyRange(today) {
  const ref = mondayIndex(today) === 0 ? addDays(today, -1) : today;
  const start = weekStart(ref);
  return { start, end: addDays(start, 6), ref };
}

export function weeklySummary(state, today) {
  const { start, end, ref } = weeklyRange(today);
  const monthOf = (k) => state.months[monthKey(k)];
  const dayOf = (k) => monthOf(k)?.days[k];
  const week = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const counted = week.filter((k) => k <= today && dayIsInRange(monthOf(k), k));
  const m = monthOf(ref) || monthOf(counted[counted.length - 1] || start);
  if (!m) throw new Error('no hay datos para esta semana');
  const off = counted.filter((k) => dayOf(k)?.off).length;
  const active = counted.filter((k) => !dayOf(k)?.off);
  const blank = active.filter((k) => isBlank(dayOf(k))).length;

  const lines = [
    `[BITÁCORA · RESUMEN SEMANAL · ${isoWeek(ref).label} · ${formatRange(start, end)}]`,
    monthLine(m),
    `Días registrados: ${active.length - blank}/${active.length} · En blanco: ${blank}${off ? ` · Días libres: ${off}` : ''}`,
    'Hábitos (cumplidos/esperados, mín. entre paréntesis):',
    ...m.habits.map((h) => habitLine(state, h, countHabit(h, counted, dayOf))),
    `Puntaje diario: ${week.map((k, i) => WEEK_LETTERS[i] + (counted.includes(k) ? (dayOf(k)?.off ? 'L' : dayScore(monthOf(k), k)) : '-')).join(' ')}`,
    ...linesBlock(counted, dayOf),
    goalsLine(m),
    yearGoalsLine(state, ref.slice(0, 4)),
    '---',
    WEEKLY_INSTRUCTION,
    NOTION_LINE,
    FORMAT_LINE,
  ].filter((l) => l !== null);
  return lines.join('\n');
}

/**
 * Resumen mensual. `decisions` = { [habitId]: 'keep'|… } (si se omite, usa review.perHabit).
 * `next` = { mantra, goals: [texto] } opcional, del mes que empieza.
 */
export function monthlySummary(state, key, today, decisions = null, next = null) {
  const m = state.months[key];
  if (!m) throw new Error(`no existe el mes ${key}`);
  const st = monthStats(m, today);
  const keys = elapsedKeys(m, today);
  const dayOf = (k) => m.days[k];
  const dec = decisions || Object.fromEntries(Object.entries(m.review?.perHabit || {}).map(([id, v]) => [id, v.decision]));
  const last = keys[keys.length - 1] || dayKeyOf(key, m.startDay);
  const blank = st.daysElapsed - st.daysRegistered;

  const lines = [
    `[BITÁCORA · RESUMEN MENSUAL · ${key} · ${formatRange(dayKeyOf(key, m.startDay), last)}]`,
    monthLine(m),
    `Días registrados: ${st.daysRegistered}/${st.daysElapsed} · En blanco: ${blank}${st.daysOff ? ` · Días libres: ${st.daysOff}` : ''}`,
    `Cumplimiento del mes: ${pct(st.pct)} · Por semana: ${st.weeks.map((w) => `S${w.index} ${pct(w.pct)}`).join(' · ') || '—'}`,
    'Hábitos (cumplidos/esperados, mín. entre paréntesis):',
    ...m.habits.map((h) => habitLine(state, h, st.perHabit[h.id], dec[h.id])),
    `Puntaje diario: ${st.series.filter((s) => s.counts).map((s) => `${s.day}:${s.off ? 'L' : s.score}`).join(' ') || '—'}`,
    `Mejor día: ${st.bestDay ? `${st.bestDay.day} (${st.bestDay.score})` : '—'} · Día más flojo: ${st.weakestWeekday === null ? '—' : WEEKDAYS[(st.weakestWeekday + 1) % 7]}`,
    ...linesBlock(keys, dayOf),
    goalsLine(m),
    yearGoalsLine(state, key.slice(0, 4)),
  ].filter((l) => l !== null);
  if (next) {
    const goals = (next.goals || []).filter(Boolean);
    lines.push(`Próximo mes · Mantra: ${next.mantra ? `"${next.mantra}"` : '—'} · Objetivos: ${goals.length ? goals.join(' · ') : '—'}`);
  }
  lines.push('---', MONTHLY_INSTRUCTION, NOTION_LINE, FORMAT_LINE);
  return lines.join('\n');
}
