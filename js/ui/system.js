// Vista "Sistema": ficha del jugador, misión diaria, jefe semanal, estadísticas y títulos.
// Estética de ventana de sistema (inspirada en el género de Solo Leveling); textos factuales.
import { h } from './dom.js';
import { gameStats, todayQuest, XP, STATS, RANKS, BOSS_TARGET, seenFrom, WEEKLY_QUESTS, MAX_FOCUS_XP } from '../core/game.js';
import { formatShort, addDays, weekStart } from '../core/dates.js';
import { dayLog, checkinComplete } from '../core/checkin.js';

const pct = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);
const STAT_OF = Object.fromEntries(STATS.map((s) => [s.id, s.name]));

function meter(value, max, label, cls = '') {
  const w = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return h('span', { class: `sys-meter ${cls}`, role: 'img', 'aria-label': label }, h('i', { style: { width: `${w}%` } }));
}

const win = (title, ...kids) => h('section', { class: 'sys-win' }, h('h2', { class: 'sys-title' }, h('span', { 'aria-hidden': 'true' }, '[ '), title, h('span', { 'aria-hidden': 'true' }, ' ]')), ...kids);

export function renderSystem(root, ctx) {
  const { state, today } = ctx;
  const g = gameStats(state, today);
  const q = todayQuest(state, today);
  // Al abrir el Sistema, lo nuevo queda visto.
  state.meta.game.seen = seenFrom(g);
  ctx.save();

  const maxStat = Math.max(...g.stats.map((s) => s.value));
  const page = h('section', { class: 'page system' });
  root.append(page);
  const gained = g.todayGain?.xp || 0;

  page.append(
    h('header', { class: 'sys-head' },
      h('p', { class: 'sys-kicker' }, 'SISTEMA'),
      h('h1', {}, state.profile?.name || 'Jugador'),
      h('div', { class: 'sys-id' },
        h('div', { class: 'sys-rank', 'aria-label': `Rango ${g.rank}` }, g.rank),
        h('div', { class: 'sys-lvl' },
          h('span', { class: 'sys-label' }, 'NIVEL'), h('b', {}, String(g.level)),
          meter(g.xp - g.levelFrom, g.levelTo - g.levelFrom, `Experiencia: ${g.xp - g.levelFrom} de ${g.levelTo - g.levelFrom}`, 'xp'),
          h('span', { class: 'sys-small' }, `${g.xp.toLocaleString('es-CO')} XP · faltan ${(g.levelTo - g.xp).toLocaleString('es-CO')} para Nv. ${g.level + 1}`),
          g.nextRank ? h('span', { class: 'sys-small' }, `Rango ${g.nextRank.id} en Nv. ${g.nextRank.from}`) : h('span', { class: 'sys-small' }, 'Rango máximo'))),
    ),

    q && win('MISIÓN DIARIA',
      h('p', { class: 'sys-small' }, q.off ? 'Hoy es día libre: no hay misión.' : `${q.done}/${q.total} completadas · hoy llevas +${gained} XP`),
      !q.off && h('ul', { class: 'sys-list' }, q.habits.map((x) => h('li', { class: x.state ? 'done' : '' },
        h('span', { class: 'sys-check', 'aria-hidden': 'true' }, x.state === 'full' ? '■' : x.state === 'min' ? '◧' : '□'),
        h('span', { class: 'grow' }, x.habit.name, h('span', { class: 'sys-small' }, ` · ${STAT_OF[x.stat]}`)),
        h('span', { class: 'sys-xp' }, `+${x.state === 'min' ? XP.min : XP.full}`),
        h('span', { class: 'sr-only' }, x.state === 'full' ? ', completo' : x.state === 'min' ? ', mínimo' : ', pendiente')))),
      !q.off && state.meta.checkin?.enabled !== false && (() => {
        const log = dayLog(state, today) || {};
        const ci = checkinComplete(log);
        const fc = Math.min(MAX_FOCUS_XP, log.focus || 0);
        return h('ul', { class: 'sys-list' },
          h('li', { class: ci ? 'done' : '' }, h('span', { class: 'sys-check', 'aria-hidden': 'true' }, ci ? '■' : '□'),
            h('span', { class: 'grow' }, 'Check-in: energía, ánimo y sueño'), h('span', { class: 'sys-xp' }, `+${XP.checkin}`)),
          h('li', { class: fc >= MAX_FOCUS_XP ? 'done' : '' }, h('span', { class: 'sys-check', 'aria-hidden': 'true' }, fc >= MAX_FOCUS_XP ? '■' : fc ? '◧' : '□'),
            h('span', { class: 'grow' }, `Focos ${fc}/${MAX_FOCUS_XP}`, h('span', { class: 'sys-small' }, ' · Inteligencia')), h('span', { class: 'sys-xp' }, `+${XP.focus} c/u`)));
      })(),
      !q.off && h('p', { class: `sys-bonus${q.done === q.total && q.total ? ' on' : ''}` }, `Recompensa por completar todos los hábitos: +${XP.perfect} XP`),
      q.recoveryAvailable && !q.off && h('p', { class: `sys-bonus warn${q.done ? ' on' : ''}` }, `Misión de recuperación: ayer quedó en blanco. Registra al menos un hábito hoy: +${XP.recovery} XP`),
      h('button', { class: 'sys-btn', type: 'button', onClick: () => ctx.go('hoy') }, 'Ir a Hoy')),

    q && win('JEFE DE LA SEMANA',
      h('p', { class: 'sys-small' }, `Semana desde el ${formatShort(q.boss.start)}. Termínala con ${pct(BOSS_TARGET)} o más de cumplimiento: +${XP.boss} XP.`),
      meter(q.boss.pct ?? 0, 1, `Cumplimiento de la semana: ${pct(q.boss.pct)}`, (q.boss.pct ?? 0) >= BOSS_TARGET ? 'boss on' : 'boss'),
      h('p', { class: 'sys-small' }, `Vas en ${pct(q.boss.pct)} · Jefes vencidos: ${g.bosses}`)),

    win('MISIONES SEMANALES',
      h('p', { class: 'sys-small' }, `Semana desde el ${formatShort(weekStart(today))}. Cada misión se cumple una vez por semana.`),
      h('ul', { class: 'sys-quests' }, WEEKLY_QUESTS.map((wq) => {
        const cur = g.thisWeek?.quests.find((x) => x.id === wq.id);
        const v = cur?.value || 0;
        const done = v >= wq.target;
        return h('li', { class: done ? 'done' : '' },
          h('div', { class: 'sys-q-top' }, h('b', {}, wq.name), h('span', { class: 'sys-xp' }, `+${wq.xp}`)),
          h('span', { class: 'sys-small' }, `${wq.desc} · ${Math.min(v, wq.target)}/${wq.target}`),
          meter(v, wq.target, `${wq.name}: ${v} de ${wq.target}`, done ? 'boss on' : ''));
      }))),

    g.weeks.length > 1 && win('XP POR SEMANA', (() => {
      const last = [];
      for (let i = 7; i >= 0; i--) {
        const ws = addDays(weekStart(today), -7 * i);
        last.push({ ws, xp: g.weeks.find((w) => w.start === ws)?.xp || 0 });
      }
      const max = Math.max(1, ...last.map((w) => w.xp));
      return h('ul', { class: 'sys-weeks' }, last.map((w, i) => h('li', { class: i === last.length - 1 ? 'now' : '' },
        h('span', { class: 'sys-small' }, String(w.xp)),
        h('span', { class: 'sys-wbar', 'aria-hidden': 'true' }, h('i', { style: { height: `${Math.max(2, Math.round((w.xp / max) * 100))}%` } })),
        h('span', { class: 'sys-small' }, formatShort(w.ws).split(' ')[0]),
        h('span', { class: 'sr-only' }, ` semana del ${formatShort(w.ws)}: ${w.xp} XP`))));
    })()),

    win('ESTADÍSTICAS',
      h('ul', { class: 'sys-stats' }, g.stats.map((s) => h('li', {},
        h('span', { class: 'sys-label' }, s.name.toUpperCase()), h('b', {}, String(s.value)),
        meter(s.value, maxStat, `${s.name}: ${s.value}`)))),
      h('p', { class: 'sys-small' }, 'Cada hábito suma a la estadística de su área: Fitness → Fuerza, Aventura → Agilidad, Relaciones y hábitos sin área → Vitalidad, Superación personal y Trabajo → Inteligencia, Finanzas → Percepción. Los focos suben Inteligencia y las noches de 7 h o más, Vitalidad.')),

    win('REGISTRO',
      h('dl', { class: 'sys-grid' },
        h('dt', {}, 'Días registrados'), h('dd', {}, String(g.daysRegistered)),
        h('dt', {}, 'Días al 100 %'), h('dd', {}, String(g.perfectDays)),
        h('dt', {}, 'Recuperaciones'), h('dd', {}, String(g.recoveries)),
        h('dt', {}, 'Jefes vencidos'), h('dd', {}, String(g.bosses)),
        h('dt', {}, 'Focos'), h('dd', {}, String(g.focusTotal)),
        h('dt', {}, 'Misiones semanales'), h('dd', {}, String(Object.values(g.questsDone).reduce((a, b) => a + b, 0))),
        h('dt', {}, 'Metas del mes'), h('dd', {}, String(g.monthGoalsDone)),
        h('dt', {}, 'Metas del año'), h('dd', {}, String(g.yearGoalsDone))),
      g.todayGain?.parts?.length ? h('div', {}, h('p', { class: 'sys-label' }, 'HOY'),
        h('ul', { class: 'sys-list compact' }, g.todayGain.parts.map(([t, x]) => h('li', {}, h('span', { class: 'grow' }, t), h('span', { class: 'sys-xp' }, `+${x}`))))) : null),

    win('TÍTULOS',
      h('p', { class: 'sys-small' }, `${g.titles.filter((t) => t.unlocked).length}/${g.titles.length} obtenidos`),
      h('ul', { class: 'sys-titles' }, g.titles.map((t) => h('li', { class: t.unlocked ? 'on' : '' },
        h('b', {}, t.unlocked ? t.name : '???'), h('span', { class: 'sys-small' }, t.desc),
        h('span', { class: 'sr-only' }, t.unlocked ? ' (obtenido)' : ' (bloqueado)'))))),

    h('details', { class: 'sys-win sys-rules' }, h('summary', {}, 'Cómo funciona'),
      h('ul', {},
        h('li', {}, `Registrar el día +${XP.day} · hábito completo +${XP.full} · mínimo +${XP.min} · check-in completo +${XP.checkin} · cada foco +${XP.focus} (máx. ${MAX_FOCUS_XP} al día). Las mismas reglas del panel de WhatsApp.`),
        h('li', {}, `Misiones semanales: ${WEEKLY_QUESTS.map((w) => `${w.name} +${w.xp}`).join(' · ')}.`),
        h('li', {}, `Todos los hábitos del día +${XP.perfect}. Volver tras un día en blanco +${XP.recovery}. Semana con ≥ ${pct(BOSS_TARGET)} +${XP.boss}.`),
        h('li', {}, `Meta del mes cumplida +${XP.monthGoal}. Meta del año +${XP.yearGoal}.`),
        h('li', {}, 'Los días libres no suman ni restan. No hay castigos: un día malo no quita XP.'),
        h('li', {}, `Rangos: ${RANKS.map((r) => `${r.id} desde Nv. ${r.from}`).join(' · ')}.`),
        h('li', {}, 'Todo se calcula desde tu registro: si corriges un día, el Sistema se recalcula.'))),
  );
}
