import { h, svg, clear, modal, shareText, onLongPress, toast } from './dom.js';
import { formatLong, monthKey, parseKey, diffDays, WEEK_LETTERS, mondayIndex, monthTitle } from '../core/dates.js';
import { recentEditable, toggleCheck, setNote, toggleDayOff, topNotice, closeStatus, isDone } from '../core/months.js';
import { weekProgress, monthProgress, monthStats, dayScore, isBlank } from '../core/stats.js';
import { areaById } from '../core/years.js';
import { gameStats } from '../core/game.js';
import { weeklySummary } from '../core/summary.js';
import { LINE_MODES } from './onboarding.js';
import {
  dayLog, setLog, addFocus, suggestedTask, sleepHours, startFocus, focusStatus, finishFocus, cancelFocus, formatClock,
  DEFAULT_FOCUS_MIN, LOG_TEXT,
} from '../core/checkin.js';

const STATE_LABEL = { full: 'Completo', min: 'Mínimo' };
let selected = null; // día que se está editando (persiste entre renders de la sesión)
let ticker = null; // intervalo del temporizador de foco (uno solo para toda la app)

const fmtH = (v) => (v === null ? '—' : `${String(v).replace('.', ',')} h`);
const SCALE = { energy: ['Agotado', 'Bajo', 'Normal', 'Bien', 'A tope'], mood: ['Muy mal', 'Mal', 'Normal', 'Bien', 'Muy bien'] };

// Anillo de progreso del día (SVG). p = 0..1 o null.
function ring(p, label) {
  const r = 22, c = 2 * Math.PI * r;
  const v = p === null || p === undefined ? 0 : Math.max(0, Math.min(1, p));
  return h('div', { class: 'ring', role: 'img', 'aria-label': label },
    svg('svg', { viewBox: '0 0 56 56', 'aria-hidden': 'true' },
      svg('circle', { class: 'ring-bg', cx: 28, cy: 28, r }),
      svg('circle', { class: `ring-fg${v >= 1 ? ' full' : ''}`, cx: 28, cy: 28, r, 'stroke-dasharray': `${c * v} ${c}`, transform: 'rotate(-90 28 28)' })),
    h('b', { 'aria-hidden': 'true' }, p === null || p === undefined ? '—' : `${Math.round(v * 100)}`));
}

export function renderToday(root, ctx) {
  const { state, today } = ctx;
  const days = recentEditable(state, today);
  if (!selected || !days.includes(selected)) selected = today;
  const page = h('section', { class: 'page' });
  root.append(page);
  const ext = state.meta.checkin?.enabled !== false;

  // Foco terminado mientras la app estaba cerrada: se suma al abrir.
  const fs0 = focusStatus(state, Date.now());
  if (fs0?.done) {
    const n = finishFocus(state, Date.now());
    ctx.save();
    if (n) toast(`Foco completado · ${n} el ${parseKey(fs0.day).d}`);
  }

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
      class: 'habit-row', type: 'button', 'data-c': habit.color, 'data-hid': habit.id, disabled: closed,
      'aria-pressed': String(isDone(v)),
      onClick: () => {
        try { toggleCheck(state, selected, habit.id); } catch (e) { toast(e.message); return; }
        ctx.save();
        draw();
        page.querySelector(`[data-hid="${habit.id}"] .box`)?.classList.add('pop');
      },
    },
    h('span', { class: `box ${v || ''}`, 'data-c': habit.color, 'aria-hidden': 'true' }),
    h('span', { class: 'htext' },
      h('span', { class: 'hname' }, habit.name),
      h('span', { class: 'hsub' }, area?.emoji ? `${area.emoji} ` : '', weekly ? `${wp.done}/${wp.target} esta semana` : monthly ? `${wp.done}/${wp.target} este mes` : `Mín.: ${habit.min}`),
      habit.anchor && h('span', { class: 'hanchor' }, `Después de: ${habit.anchor}`)),
    h('span', { class: 'hstate' }, STATE_LABEL[v] || h('span', { class: 'sr-only' }, 'sin marcar')),
    h('span', { class: 'sr-only' }, '. Mantén presionado para ver el mínimo.'));
    onLongPress(btn, () => modal({ title: habit.name, body: h('div', {},
      h('p', { class: 'muted' }, 'Versión mínima'), h('p', { class: 'lead' }, habit.min),
      habit.anchor && h('p', { class: 'muted' }, `Después de: ${habit.anchor}`),
      habit.note && h('p', { class: 'hnote' }, habit.note)) }));
    return btn;
  }

  const logOf = () => dayLog(state, selected) || {};
  const saveLog = (patch, redraw = false) => {
    try { setLog(state, selected, patch); } catch (e) { toast(e.message); return; }
    ctx.save();
    if (redraw) draw();
  };

  function taskCard() {
    const log = logOf();
    const sugg = selected === today ? suggestedTask(state, today) : null;
    const input = h('input', {
      class: 'input task-input', value: log.task1 || '', maxlength: LOG_TEXT.task1, placeholder: '¿Qué es lo primero que vas a hacer?', enterkeyhint: 'done', autocomplete: 'off',
      onInput: (e) => saveLog({ task1: e.target.value }), onKeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    });
    return h('section', { class: 'tcard task-card' },
      h('label', { class: 'tcard-label', for: 'task1' }, 'Tarea #1'),
      Object.assign(input, { id: 'task1' }),
      sugg && h('div', { class: 'sugg-row' }, h('span', { class: 'muted small grow' }, `Ayer dejaste: ${sugg}`),
        h('button', { class: 'chip', type: 'button', onClick: () => saveLog({ task1: sugg }, true) }, 'Usar')),
      focusBlock());
  }

  function focusBlock() {
    const fs = focusStatus(state, Date.now());
    const count = logOf().focus || 0;
    const mins = state.meta.checkin?.focusMinutes || DEFAULT_FOCUS_MIN;
    if (fs) {
      const clock = h('b', { class: 'focus-clock', 'aria-live': 'off' }, formatClock(fs.remaining));
      const bar = h('i', { style: { width: `${Math.round((fs.elapsed / fs.total) * 100)}%` } });
      const box = h('div', { class: 'focus-box running' },
        h('div', { class: 'focus-top' }, clock, h('span', { class: 'muted small' }, `Foco de ${fs.minutes} min${fs.day !== selected ? ` · del ${parseKey(fs.day).d}` : ''}`)),
        h('span', { class: 'bar focus-bar' }, bar),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost', type: 'button', onClick: () => { cancelFocus(state); ctx.save(); draw(); } }, 'Cancelar'),
          h('button', { class: 'btn', type: 'button', onClick: () => {
            // Terminar antes: cuenta solo si ya pasó el tiempo.
            const st = focusStatus(state, Date.now());
            if (st && !st.done) { cancelFocus(state); ctx.save(); toast('Foco detenido: no se cuenta'); draw(); return; }
            const n = finishFocus(state, Date.now()); ctx.save(); if (n) toast(`Foco completado · ${n} hoy`); draw();
          } }, 'Detener')));
      clearInterval(ticker);
      ticker = setInterval(() => {
        if (!document.body.contains(box)) { clearInterval(ticker); ticker = null; return; }
        const st = focusStatus(state, Date.now());
        if (!st) { clearInterval(ticker); return; }
        clock.textContent = formatClock(st.remaining);
        bar.style.width = `${Math.round((st.elapsed / st.total) * 100)}%`;
        if (st.done) {
          clearInterval(ticker); ticker = null;
          const n = finishFocus(state, Date.now());
          ctx.save();
          toast(`Foco completado · ${n} hoy`, { duration: 4000 });
          draw();
        }
      }, 1000);
      return box;
    }
    return h('div', { class: 'focus-box' },
      h('button', { class: 'btn primary focus-start', type: 'button', onClick: () => {
        try { startFocus(state, selected, Date.now(), mins); } catch (e) { toast(e.message); return; }
        ctx.save(); draw();
      } }, h('span', { 'aria-hidden': 'true' }, '▶ '), `Foco de ${mins} min`),
      h('div', { class: 'focus-count', role: 'group', 'aria-label': 'Focos del día' },
        h('button', { class: 'step', type: 'button', 'aria-label': 'Quitar un foco', disabled: !count, onClick: () => { addFocus(state, selected, -1); ctx.save(); draw(); } }, '−'),
        h('span', {}, h('b', {}, String(count)), count === 1 ? ' foco' : ' focos'),
        h('button', { class: 'step', type: 'button', 'aria-label': 'Sumar un foco', onClick: () => { addFocus(state, selected, 1); ctx.save(); draw(); } }, '+')));
  }

  function scaleRow(field, label) {
    const v = logOf()[field] ?? null;
    return h('div', { class: 'scale-row' },
      h('span', { class: 'scale-label' }, label, v && h('span', { class: 'muted small' }, ` · ${SCALE[field][v - 1]}`)),
      h('div', { class: 'scale', role: 'group', 'aria-label': label }, [1, 2, 3, 4, 5].map((n) => h('button', {
        type: 'button', 'aria-pressed': String(v === n), 'aria-label': `${label} ${n} de 5: ${SCALE[field][n - 1]}`,
        onClick: () => saveLog({ [field]: v === n ? null : n }, true),
      }, String(n)))));
  }

  function checkinCard() {
    const log = logOf();
    const hrs = sleepHours(log.bed, log.wake);
    const hrsEl = h('b', { class: 'sleep-h' }, fmtH(hrs));
    const upd = () => { hrsEl.textContent = fmtH(sleepHours(logOf().bed, logOf().wake)); };
    const time = (f, label) => h('label', { class: 'field time-field' }, h('span', { class: 'field-label small' }, label),
      h('input', { class: 'input', type: 'time', value: log[f] || '', onChange: (e) => { saveLog({ [f]: e.target.value || null }); upd(); } }));
    return h('section', { class: 'tcard' },
      h('h2', { class: 'tcard-label' }, '¿Cómo vas?'),
      scaleRow('energy', 'Energía'),
      scaleRow('mood', 'Ánimo'),
      h('div', { class: 'sleep-row' }, time('bed', 'Anoche me acosté'), time('wake', 'Me levanté'), h('div', { class: 'sleep-total' }, h('span', { class: 'field-label small' }, 'Sueño'), hrsEl)));
  }

  function closeCard() {
    const log = logOf();
    const filled = !!(log.top3 || log.close);
    return h('details', { class: 'tcard more', open: filled || null },
      h('summary', {}, 'Top 3 y cierre del día'),
      h('label', { class: 'field' }, h('span', { class: 'field-label small' }, 'Top 3 de hoy'),
        h('textarea', { class: 'input', rows: 3, maxlength: LOG_TEXT.top3, placeholder: '1. …\n2. …\n3. …', onInput: (e) => saveLog({ top3: e.target.value }) }, log.top3 || '')),
      h('label', { class: 'field' }, h('span', { class: 'field-label small' }, 'Para mañana'),
        h('input', { class: 'input', value: log.close || '', maxlength: LOG_TEXT.close, placeholder: 'Lo primero de mañana', enterkeyhint: 'done',
          onInput: (e) => saveLog({ close: e.target.value }), onKeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }),
        h('span', { class: 'field-hint' }, 'Mañana aparece como sugerencia de tarea #1.')));
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
    const dayP = off || !n ? null : dayScore(m, selected) / n;
    page.append(...[
      h('header', { class: 'today-head' },
        h('div', { class: 'today-top' },
          h('div', { class: 'grow' },
            h('h1', {}, formatLong(selected), selected !== today && h('span', { class: 'muted small' }, ' · editando')),
            m.mantra && h('p', { class: 'mantra' }, m.mantra)),
          ring(dayP, off ? 'Día libre' : `Hábitos del día: ${pct(dayP)}`)),
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
      ext && taskCard(),
      m.review && h('p', { class: 'muted small' }, 'Mes cerrado: solo se puede editar la línea y el registro.'),
      h('div', { class: `habits${off ? ' resting' : ''}` }, m.habits.map((hb) => habitRow(m, hb))),
      !m.review && h('button', { class: 'linklike small day-off', type: 'button', 'aria-pressed': String(off), onClick: () => {
        try { toggleDayOff(state, selected); } catch (e) { toast(e.message); return; }
        ctx.save();
        draw();
      } }, off ? 'Es día libre · quitar' : 'Marcar como día libre (no cuenta en el %)'),
      ext && checkinCard(),
      h('label', { class: 'field line-field' }, h('span', { class: 'field-label' }, 'Línea del día'), note),
      ext && closeCard(),
    ].filter(Boolean));
  }

  draw();
}
