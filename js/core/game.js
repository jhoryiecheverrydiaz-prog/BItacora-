// "Sistema": capa de juego opcional, inspirada en el género de Solo Leveling (cazador que sube de
// nivel con misiones diarias). Todo se DERIVA del registro: nada de XP guardado, nada que se pueda
// perder ni inflar. Reglas de XP iguales al panel / bot de WhatsApp (whatsapp/src/logic.js dayXP):
// registrar el día +4, hábito completo +10, mínimo +6, check-in completo (energía, ánimo y sueño) +3,
// cada foco +5 (máx. 4 por día). Extras propios del Sistema abajo.
import { monthKey, addDays, weekStart } from './dates.js';
import { elapsedKeys, isDone, isOff, isBlank, weeklyBreakdown } from './stats.js';
import { checkinComplete, sleepHours, SLEEP_GOOD } from './checkin.js';

export const XP = {
  day: 4, full: 10, min: 6, checkin: 3, focus: 5, // como el panel (whatsapp/src/logic.js dayXP)
  perfect: 20, // misión diaria completa (todos los hábitos del día)
  recovery: 15, // registrar algo justo después de un día en blanco: volver pesa más que no fallar
  boss: 50, // jefe semanal: semana terminada con ≥ 80 % de cumplimiento
  monthGoal: 30, // meta del mes cumplida
  yearGoal: 100, // meta del año cumplida
};
export const BOSS_TARGET = 0.8;
export const MAX_FOCUS_XP = 4; // focos con XP por día (igual que MAX_FOCOS_XP del panel)

// Misiones semanales (lunes a domingo). Se cumplen una vez por semana; nunca restan.
export const WEEKLY_QUESTS = [
  { id: 'focos', name: 'Foco profundo', desc: '10 focos en la semana', target: 10, xp: 40, value: (w) => w.focus },
  { id: 'descanso', name: 'Descanso', desc: `5 noches de ${SLEEP_GOOD} h o más`, target: 5, xp: 30, value: (w) => w.goodNights },
  { id: 'bitacora', name: 'Bitácora completa', desc: '5 días con energía, ánimo y sueño', target: 5, xp: 30, value: (w) => w.checkins },
  { id: 'tarea1', name: 'Rumbo claro', desc: '5 días con tarea #1 definida', target: 5, xp: 25, value: (w) => w.task1 },
];

// XP total para llegar al nivel n: 5(n-1)² + 50(n-1). Nv. 10 ≈ 2 semanas, Nv. 70 (rango S) ≈ 1 año constante.
export const xpForLevel = (n) => 5 * (n - 1) ** 2 + 50 * (n - 1);

export function levelOf(xp) {
  let n = 1;
  while (xpForLevel(n + 1) <= xp) n++;
  return n;
}

export const RANKS = [
  { id: 'E', from: 1 }, { id: 'D', from: 10 }, { id: 'C', from: 20 },
  { id: 'B', from: 35 }, { id: 'A', from: 50 }, { id: 'S', from: 70 },
];
export const rankOf = (level) => [...RANKS].reverse().find((r) => level >= r.from);
export const nextRank = (level) => RANKS.find((r) => r.from > level) || null;

// Cinco estadísticas. Cada área de vida alimenta una; áreas nuevas o "sin área" van a Vitalidad.
export const STATS = [
  { id: 'fue', name: 'Fuerza' },
  { id: 'agi', name: 'Agilidad' },
  { id: 'vit', name: 'Vitalidad' },
  { id: 'int', name: 'Inteligencia' },
  { id: 'per', name: 'Percepción' },
];
export const AREA_STAT = { fit: 'fue', ave: 'agi', rel: 'vit', sup: 'int', tra: 'int', fin: 'per' };
export const statOfArea = (areaId) => AREA_STAT[areaId] || 'vit';

export const TITLES = [
  { id: 'despertar', name: 'El Despertar', desc: 'Registrar el primer día.', test: (g) => g.daysRegistered >= 1 },
  { id: 'mazmorra', name: 'Mazmorra despejada', desc: 'Primer día al 100 %.', test: (g) => g.perfectDays >= 1 },
  { id: 'regreso', name: 'Regreso', desc: 'Primera misión de recuperación.', test: (g) => g.recoveries >= 1 },
  { id: 'cazajefes', name: 'Cazajefes', desc: 'Vencer al primer jefe semanal.', test: (g) => g.bosses >= 1 },
  { id: 'rango-d', name: 'Cazador de rango D', desc: 'Llegar al nivel 10.', test: (g) => g.level >= 10 },
  { id: 'incansable', name: 'Incansable', desc: '10 días al 100 %.', test: (g) => g.perfectDays >= 10 },
  { id: 'nunca-dos', name: 'Nunca dos veces', desc: '5 misiones de recuperación.', test: (g) => g.recoveries >= 5 },
  { id: 'rango-c', name: 'Cazador de rango C', desc: 'Llegar al nivel 20.', test: (g) => g.level >= 20 },
  { id: 'puerta-roja', name: 'Puerta roja', desc: 'Cumplir una meta del año.', test: (g) => g.yearGoalsDone >= 1 },
  { id: 'cien', name: 'Cien amaneceres', desc: '100 días registrados.', test: (g) => g.daysRegistered >= 100 },
  { id: 'incursion', name: 'Señor de la incursión', desc: '10 jefes semanales.', test: (g) => g.bosses >= 10 },
  { id: 'rango-b', name: 'Cazador de rango B', desc: 'Llegar al nivel 35.', test: (g) => g.level >= 35 },
  { id: 'sombra', name: 'Sombra perfecta', desc: '50 días al 100 %.', test: (g) => g.perfectDays >= 50 },
  { id: 'rango-a', name: 'Cazador de rango A', desc: 'Llegar al nivel 50.', test: (g) => g.level >= 50 },
  { id: 'primer-foco', name: 'Primer foco', desc: 'Completar un foco.', test: (g) => g.focusTotal >= 1 },
  { id: 'brujula', name: 'Brújula', desc: '7 días con tarea #1 definida.', test: (g) => g.task1Days >= 7 },
  { id: 'guardian', name: 'Guardián del sueño', desc: 'Primera misión de Descanso.', test: (g) => (g.questsDone.descanso || 0) >= 1 },
  { id: 'cien-focos', name: 'Cien focos', desc: '100 focos completados.', test: (g) => g.focusTotal >= 100 },
  { id: 'semana-plena', name: 'Semana plena', desc: 'Cumplir las 4 misiones semanales en una semana.', test: (g) => g.fullWeeks >= 1 },
  { id: 'monarca', name: 'Monarca de los hábitos', desc: 'Rango S: nivel 70.', test: (g) => g.level >= 70 },
];

function dayGain(m, k, prevBlank) {
  const day = m.days[k];
  const g = { xp: 0, parts: [], stats: {}, perfect: false, recovery: false, registered: false, checkin: false, focus: 0, goodNight: false, task1: false };
  if (isOff(day) || isBlank(day)) return g;
  g.registered = true;
  g.xp += XP.day; g.parts.push(['Registro del día', XP.day]);
  let done = 0;
  for (const h of m.habits) {
    const v = day.checks?.[h.id];
    if (!isDone(v)) continue;
    done++;
    const x = v === 'full' ? XP.full : XP.min;
    g.xp += x; g.parts.push([`${h.short}${v === 'min' ? ' (mín.)' : ''}`, x]);
    const s = statOfArea(h.area);
    g.stats[s] = (g.stats[s] || 0) + (v === 'full' ? 1 : 0.5);
  }
  const log = day.log;
  if (checkinComplete(log)) { g.checkin = true; g.xp += XP.checkin; g.parts.push(['Check-in (energía, ánimo y sueño)', XP.checkin]); }
  const focus = log?.focus || 0;
  if (focus) {
    const fx = Math.min(MAX_FOCUS_XP, focus) * XP.focus;
    g.xp += fx; g.parts.push([`${focus} foco${focus === 1 ? '' : 's'}${focus > MAX_FOCUS_XP ? ` (XP de ${MAX_FOCUS_XP})` : ''}`, fx]);
    g.stats.int = (g.stats.int || 0) + focus * 0.5;
  }
  g.focus = focus;
  const sl = sleepHours(log?.bed, log?.wake);
  g.goodNight = sl !== null && sl >= SLEEP_GOOD;
  if (g.goodNight) g.stats.vit = (g.stats.vit || 0) + 0.5;
  g.task1 = !!(log?.task1 || '').trim();
  if (m.habits.length && done === m.habits.length) { g.perfect = true; g.xp += XP.perfect; g.parts.push(['Misión diaria completa', XP.perfect]); }
  if (prevBlank && done > 0) { g.recovery = true; g.xp += XP.recovery; g.parts.push(['Misión de recuperación', XP.recovery]); }
  return g;
}

/**
 * Estado del jugador derivado de todo el registro hasta `today`.
 */
export function gameStats(state, today) {
  const cur = monthKey(today);
  const g = { xp: 0, daysRegistered: 0, perfectDays: 0, recoveries: 0, bosses: 0, yearGoalsDone: 0, monthGoalsDone: 0, pts: {}, todayGain: null,
    focusTotal: 0, task1Days: 0, checkinDays: 0, questsDone: {}, fullWeeks: 0, weeks: [] };
  const weeks = new Map(); // inicio de semana → { start, xp, focus, goodNights, checkins, task1 }
  const weekOf = (k) => {
    const ws = weekStart(k);
    if (!weeks.has(ws)) weeks.set(ws, { start: ws, xp: 0, focus: 0, goodNights: 0, checkins: 0, task1: 0 });
    return weeks.get(ws);
  };
  let prevBlank = false;
  for (const key of Object.keys(state.months).sort()) {
    if (key > cur) break;
    const m = state.months[key];
    for (const k of elapsedKeys(m, today)) {
      if (isOff(m.days[k])) continue; // el día libre ni suma ni corta
      const d = dayGain(m, k, prevBlank);
      if (k === today) g.todayGain = d;
      g.xp += d.xp;
      const w = weekOf(k);
      w.xp += d.xp; w.focus += d.focus; w.goodNights += d.goodNight ? 1 : 0; w.checkins += d.checkin ? 1 : 0; w.task1 += d.task1 ? 1 : 0;
      g.focusTotal += d.focus; g.task1Days += d.task1 ? 1 : 0; g.checkinDays += d.checkin ? 1 : 0;
      if (d.registered) g.daysRegistered++;
      if (d.perfect) g.perfectDays++;
      if (d.recovery) g.recoveries++;
      for (const [s, v] of Object.entries(d.stats)) g.pts[s] = (g.pts[s] || 0) + v;
      // hoy sin registrar todavía no cuenta como "en blanco"
      prevBlank = k !== today && !d.registered;
    }
    for (const w of weeklyBreakdown(m, today)) {
      if (w.end < today && w.days >= 4 && w.pct !== null && w.pct >= BOSS_TARGET) { g.bosses++; g.xp += XP.boss; weekOf(w.start).xp += XP.boss; }
    }
    const mg = m.goals.filter((x) => x.done === true).length;
    g.monthGoalsDone += mg; g.xp += mg * XP.monthGoal;
  }
  for (const [y, v] of Object.entries(state.years || {})) {
    if (y > today.slice(0, 4)) continue;
    const n = (v.goals || []).filter((x) => x.done).length;
    g.yearGoalsDone += n; g.xp += n * XP.yearGoal;
  }
  for (const w of [...weeks.values()].sort((a, b) => (a.start < b.start ? -1 : 1))) {
    w.quests = WEEKLY_QUESTS.map((q) => ({ id: q.id, value: q.value(w), target: q.target, done: q.value(w) >= q.target }));
    for (const q of w.quests) {
      if (!q.done) continue;
      const xp = WEEKLY_QUESTS.find((x) => x.id === q.id).xp;
      g.xp += xp; w.xp += xp;
      g.questsDone[q.id] = (g.questsDone[q.id] || 0) + 1;
    }
    if (w.quests.every((q) => q.done)) g.fullWeeks++;
    g.weeks.push(w);
  }
  g.thisWeek = g.weeks.find((w) => w.start === weekStart(today)) || null;
  g.level = levelOf(g.xp);
  g.rank = rankOf(g.level).id;
  g.nextRank = nextRank(g.level);
  g.levelFrom = xpForLevel(g.level);
  g.levelTo = xpForLevel(g.level + 1);
  g.progress = (g.xp - g.levelFrom) / (g.levelTo - g.levelFrom);
  g.stats = STATS.map((s) => ({ ...s, value: 10 + Math.floor(g.pts[s.id] || 0) }));
  g.titles = TITLES.map((t) => ({ id: t.id, name: t.name, desc: t.desc, unlocked: t.test(g) }));
  return g;
}

/**
 * Misión diaria de hoy + jefe de la semana en curso.
 */
export function todayQuest(state, today) {
  const m = state.months[monthKey(today)];
  if (!m) return null;
  const day = m.days[today];
  const habits = m.habits.map((h) => {
    const v = day?.checks?.[h.id];
    return { habit: h, state: v || null, xp: v === 'min' ? XP.min : XP.full, stat: statOfArea(h.area) };
  });
  // ¿ayer quedó en blanco? (saltando días libres)
  let y = addDays(today, -1), guard = 0;
  while (guard++ < 31) {
    const ym = state.months[monthKey(y)];
    if (!ym || !elapsedKeys(ym, today).includes(y)) { y = null; break; }
    if (!isOff(ym.days[y])) break;
    y = addDays(y, -1);
  }
  const yBlank = !!y && isBlank(state.months[monthKey(y)].days[y]);
  // Jefe: % de la semana (lunes a hoy) dentro del mes de hoy
  const ws = weekStart(today);
  const week = weeklyBreakdown(m, today).find((w) => w.end >= ws && w.start <= today) || null;
  return {
    off: isOff(day),
    habits,
    done: habits.filter((x) => isDone(x.state)).length,
    total: habits.length,
    recoveryAvailable: yBlank,
    boss: { pct: week?.pct ?? null, target: BOSS_TARGET, start: week?.start || ws },
  };
}

// Cambios desde lo último que vio el jugador (para avisos de subida de nivel / rango / títulos).
export function progressNews(g, seen) {
  seen = seen || {};
  const news = [];
  const lvl = seen.level || 0;
  if (lvl && g.level > lvl) news.push(`Subiste a nivel ${g.level}`);
  if (seen.rank && g.rank !== seen.rank && g.level > lvl) news.push(`Nuevo rango: ${g.rank}`);
  const had = new Set(seen.titles || []);
  if (seen.titles) for (const t of g.titles) if (t.unlocked && !had.has(t.id)) news.push(`Título obtenido: ${t.name}`);
  return news;
}

export const seenFrom = (g) => ({ level: g.level, rank: g.rank, titles: g.titles.filter((t) => t.unlocked).map((t) => t.id) });

