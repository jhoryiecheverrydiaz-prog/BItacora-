import { h, clear, modal, shareText, onLongPress, toast } from './dom.js';
import { formatLong, monthKey, parseKey, diffDays, WEEK_LETTERS, mondayIndex, monthTitle } from '../core/dates.js';
import { recentEditable, toggleCheck, setNote, toggleDayOff, topNotice, closeStatus, isDone } from '../core/months.js';
import { weekProgress, monthProgress, monthStats, dayScore, isBlank } from '../core/stats.js';
import { areaById } from '../core/years.js';
import { gameStats } from '../core/game.js';
import { weeklySummary } from '../core/summary.js';
import { LINE_MODES } from './onboarding.js';

const STATE_LABEL = { full: 'Completo', min: 'Mínimo' };
let selected = null; // día que se está editando (persiste entre renders de la sesión)

export function renderToday(root, ctx) {
  const { state, today } = ctx;
  const days = recentEditable(state, today);
  if (!selected || !days.includes(selected)) selected = today;
  const page = h('section', { class: 'page' });
  root.append(page);

  function noticeEl() {
    const kind = topNotice(state, today);
    if (kind === 'close') {
      const cs = closeStatus(state, today);
      return h('div', { class: 'notice strong' }, h('p', {}, `Cierre de ${monthTitle(cs.key)} pendiente. Mañana será obligatorio.`),
        h('button', { class: 'btn', type: 'button', onClick: () => ctx.go('cierre') }, 'Cerrar ahora'));
    }
    if (kind === 'blank') return h('div', { class: 'notice' }, h('p', {}, 'Ayer quedó en blanco. Hoy cuenta doble: registra aunque sea el mínimo.'));
    if (kind === 'weekly') {
      const acc = state.profile.accountability;
      const to = acc.to === 'persona' ? (acc.personName || 'tu persona') : 'Claude';
      return h('div', { class: 'notice strong' }, h('p', {}, `Hoy toca el resumen semanal para ${to}.`),
        h('button', { class: 'btn', type: 'button', onClick: sendWeekly }, 'Enviar resumen semanal'));
    }
    if (kind === 'backup') {
      const last = state.meta.lastBackupAt;
      const txt = last ? `Último respaldo hace ${diffDays(last.slice(0, 10), today)} días.` : 'Aún no tienes un respaldo.';
      return h('div', { class: 'notice' }, h('p', {}, txt),
        h('button', { class: 'btn', type: 'button', onClick: async () => { if (await ctx.exportBackup()) draw(); } }, 'Exportar'));
    }
    return null;
  }

  async function sendWeekly() {
    let text;
    try { text = weeklySummary(state, today); } catch (e) { toast(e.message); return; }
    const r = await shareText(text, 'Resumen semanal');
    if (r !== 'cancelled') {
      state.meta.lastWeeklySentAt = today; // fecha local, no UTC
      ctx.save();
      draw();
    }
  }

  function strip() {
    if (days.length < 2) return null;
    return h('div', { class: 'day-strip', role: 'group', 'aria-label': 'Elegir día' }, days.map((k) => {
      const m = state.months[monthKey(k)];
      const blank = isBlank(m.days[k]);
      return h('button', {
        class: `day-pill${blank ? ' blank' : ''}`, type: 'button', 'aria-pressed': String(k === selected),
        onClick: () => { selected = k; draw(); },
      }, h('span', { 'aria-hidden': 'true' }, WEEK_LETTERS[mondayIndex(k)]), h('b', {}, parseKey(k).d), h('span', { class: 'pip' }),
      h('span', { class: 'sr-only' }, `, ${formatLong(k)}${blank ? ', en blanco' : ''}`));
    }));
  }

  function habitRow(m, habit) {
    const v = m.days[selected]?.checks?.[habit.id];
    const closed = !!m.review;
    const weekly = habit.target?.type === 'weekly';
    const monthly = habit.target?.type === 'monthly';
    const wp = weekly ? weekProgress(state, habit, selected) : monthly ? monthProgress(state, habit, selected) : null;
    const area = habit.area && areaById(state, habit.area);
    const btn = h('button', {
      class: 'habit-row', type: 'button', 'data-c': habit.color, disabled: closed,
      'aria-pressed': String(isDone(v)),
      onClick: () => {
        try { toggleCheck(state, selected, habit.id); } catch (e) { toast(e.message); return; }
        ctx.save();
        draw();
      },
    },
    h('span', { class: `box ${v || ''}`, 'data-c': habit.color, 'aria-hidden': 'true' }),
    h('span', { class: 'htext' },
      h('span', { class: 'hname' }, habit.name),
      h('span', { class: 'hsub' }, area?.emoji ? `${area.emoji} ` : '', weekly ? `${wp.done}/${wp.target} esta semana` : monthly ? `${wp.done}/${wp.target} este mes` : `Mín.: ${habit.min}`)),
    h('span', { class: 'hstate' }, STATE_LABEL[v] || h('span', { class: 'sr-only' }, 'sin marcar')),
    h('span', { class: 'sr-only' }, '. Mantén presionado para ver el mínimo.'));
    onLongPress(btn, () => modal({ title: habit.name, body: h('div', {}, h('p', { class: 'muted' }, 'Versión mínima'), h('p', { class: 'lead' }, habit.min)) }));
    return btn;
  }

  function draw() {
    clear(page);
    const m = state.months[monthKey(selected)];
    const placeholder = LINE_MODES[state.profile.lineMode]?.placeholder || 'Una línea sobre hoy…';
    const note = h('input', {
      class: 'input', id: 'line', value: m.days[selected]?.note || '', placeholder, maxlength: 280, enterkeyhint: 'done', autocomplete: 'off',
      onInput: (e) => { setNote(state, selected, e.target.value); ctx.save(); },
      onKeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    });
    const off = !!m.days[selected]?.off;
    const ms = monthStats(m, today);
    const pct = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);
    const n = m.habits.length;
    page.append(...[
      h('header', { class: 'today-head' },
        h('h1', {}, formatLong(selected), selected !== today && h('span', { class: 'muted small' }, ' · editando')),
        m.mantra && h('p', { class: 'mantra' }, m.mantra),
        state.meta.game?.enabled && (() => {
          const g = gameStats(state, today);
          return h('button', { class: 'sys-chip', type: 'button', onClick: () => ctx.go('sistema') },
            h('b', {}, `Nv. ${g.level}`), ` · Rango ${g.rank} · `, `+${g.todayGain?.xp || 0} XP hoy`,
            h('span', { class: 'sys-chip-bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.round(g.progress * 100)}%` } })));
        })(),
        h('p', { class: 'today-stats muted small' },
          off ? 'Día libre' : `Hoy: ${dayScore(m, selected)}/${n} · ${pct(n ? dayScore(m, selected) / n : null)}`,
          ` · ${monthTitle(m.key)}: ${pct(ms.pct)}`)),
      selected === today && noticeEl(),
      strip(),
      m.review && h('p', { class: 'muted small' }, 'Mes cerrado: solo se puede editar la línea.'),
      h('div', { class: `habits${off ? ' resting' : ''}` }, m.habits.map((hb) => habitRow(m, hb))),
      !m.review && h('button', { class: 'linklike small day-off', type: 'button', 'aria-pressed': String(off), onClick: () => {
        try { toggleDayOff(state, selected); } catch (e) { toast(e.message); return; }
        ctx.save();
        draw();
      } }, off ? 'Es día libre · quitar' : 'Marcar como día libre (no cuenta en el %)'),
      h('label', { class: 'field line-field' }, h('span', { class: 'field-label' }, 'Línea del día'), note),
    ].filter(Boolean));
  }

  draw();
}
