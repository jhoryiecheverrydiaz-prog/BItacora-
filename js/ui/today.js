import { h, clear, shareText, onLongPress, toast, haptic } from './dom.js';
import { formatLong, monthKey, parseKey, diffDays, WEEK_LETTERS, mondayIndex, monthTitle } from '../core/dates.js';
import { recentEditable, toggleCheck, setCheck, setNote, toggleDayOff, topNotice, closeStatus, isDone } from '../core/months.js';
import { weekProgress, monthProgress, monthStats, dayScore, isBlank } from '../core/stats.js';
import { areaById } from '../core/years.js';
import { gameStats } from '../core/game.js';
import { weeklySummary } from '../core/summary.js';
import { LINE_MODES } from './onboarding.js';

const STATE_LABEL = { full: 'Completo', min: 'Mínimo' };
let selected = null; // día que se está editando (persiste entre renders de la sesión)
const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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
        onClick: () => selectDay(k, days.indexOf(k) > days.indexOf(selected) ? 'next' : 'prev'),
      }, h('span', { 'aria-hidden': 'true' }, WEEK_LETTERS[mondayIndex(k)]), h('b', {}, parseKey(k).d), h('span', { class: 'pip' }),
      h('span', { class: 'sr-only' }, `, ${formatLong(k)}${blank ? ', en blanco' : ''}`));
    }));
  }

  // Cada fila se actualiza en su sitio: tocar no redibuja la página (no salta el scroll ni se cierra el teclado).
  let rows = [];
  let statsEl = null;

  function subText(habit) {
    const weekly = habit.target?.type === 'weekly';
    const monthly = habit.target?.type === 'monthly';
    const wp = weekly ? weekProgress(state, habit, selected) : monthly ? monthProgress(state, habit, selected) : null;
    const area = habit.area && areaById(state, habit.area);
    return `${area?.emoji ? `${area.emoji} ` : ''}${weekly ? `${wp.done}/${wp.target} esta semana` : monthly ? `${wp.done}/${wp.target} este mes` : `Mín.: ${habit.min}`}`;
  }

  function paintRow(r, m, animate) {
    const v = m.days[selected]?.checks?.[r.habit.id];
    r.btn.setAttribute('aria-pressed', String(isDone(v)));
    r.box.className = `box ${v || ''}`;
    if (animate && v && !reduceMotion()) { void r.box.offsetWidth; r.box.classList.add('just'); }
    r.state.textContent = STATE_LABEL[v] || '';
    r.state.append(v ? '' : h('span', { class: 'sr-only' }, 'sin marcar'));
    r.sub.textContent = subText(r.habit);
  }

  function statsText(m) {
    const off = !!m.days[selected]?.off;
    const ms = monthStats(m, today);
    const pct = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);
    const n = m.habits.length;
    const score = dayScore(m, selected);
    return { text: `${off ? 'Día libre' : `Hoy: ${score}/${n} · ${pct(n ? score / n : null)}`} · ${monthTitle(m.key)}: ${pct(ms.pct)}`, perfect: !off && n > 0 && score === n };
  }

  function refresh(changedId) {
    const m = state.months[monthKey(selected)];
    for (const r of rows) paintRow(r, m, r.habit.id === changedId);
    if (statsEl) {
      const st = statsText(m);
      const was = statsEl.classList.contains('perfect');
      statsEl.textContent = st.text + (st.perfect ? ' 🏆' : '');
      statsEl.classList.toggle('perfect', st.perfect);
      if (st.perfect && !was && !reduceMotion()) { statsEl.classList.remove('pulse'); void statsEl.offsetWidth; statsEl.classList.add('pulse'); }
    }
    const pill = page.querySelector('.day-pill[aria-pressed="true"]');
    pill?.classList.toggle('blank', isBlank(m.days[selected]));
  }

  function apply(habit, fn) {
    try { fn(); } catch (e) { toast(e.message); return false; }
    ctx.save();
    haptic();
    refresh(habit.id);
    return true;
  }

  function habitRow(m, habit) {
    const closed = !!m.review;
    const r = { habit };
    r.box = h('span', { class: 'box', 'data-c': habit.color, 'aria-hidden': 'true' });
    r.sub = h('span', { class: 'hsub' });
    r.state = h('span', { class: 'hstate' });
    r.btn = h('button', {
      class: 'habit-row', type: 'button', 'data-c': habit.color, disabled: closed,
      onClick: () => apply(habit, () => toggleCheck(state, selected, habit.id)),
    },
    r.box,
    h('span', { class: 'htext' }, h('span', { class: 'hname' }, habit.name), r.sub),
    r.state,
    h('span', { class: 'sr-only' }, '. Mantén presionado para marcar el mínimo.'));
    // Mantener presionado = marcar directo el mínimo (antes había que tocar dos veces).
    onLongPress(r.btn, () => {
      if (apply(habit, () => setCheck(state, selected, habit.id, 'min'))) toast(`Mínimo: ${habit.min}`, { duration: 2600 });
    });
    paintRow(r, m, false);
    rows.push(r);
    return r.btn;
  }

  // Deslizar a los lados cambia de día (como pasar la hoja).
  function selectDay(k, dir) {
    if (!k || k === selected) return;
    selected = k;
    haptic();
    draw(dir);
  }
  let sx = 0, sy = 0, tracking = false, swiped = false;
  page.addEventListener('pointerdown', (e) => {
    tracking = !e.target.closest('input, textarea, .day-strip'); swiped = false; sx = e.clientX; sy = e.clientY;
  });
  page.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const i = days.indexOf(selected);
    const next = dx < 0 ? days[i + 1] : days[i - 1];
    if (next) { swiped = true; selectDay(next, dx < 0 ? 'next' : 'prev'); }
  });
  page.addEventListener('pointercancel', () => { tracking = false; });
  page.addEventListener('click', (e) => { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; } }, true);

  function draw(dir) {
    clear(page);
    rows = [];
    page.classList.remove('slide-next', 'slide-prev');
    if (dir && !reduceMotion()) { void page.offsetWidth; page.classList.add(`slide-${dir}`); }
    const m = state.months[monthKey(selected)];
    const placeholder = LINE_MODES[state.profile.lineMode]?.placeholder || 'Una línea sobre hoy…';
    const note = h('input', {
      class: 'input', id: 'line', value: m.days[selected]?.note || '', placeholder, maxlength: 280, enterkeyhint: 'done', autocomplete: 'off',
      onInput: (e) => { setNote(state, selected, e.target.value); ctx.save(); },
      onKeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    });
    const off = !!m.days[selected]?.off;
    const st = statsText(m);
    statsEl = h('p', { class: `today-stats muted small${st.perfect ? ' perfect' : ''}`, 'aria-live': 'polite' }, st.text + (st.perfect ? ' 🏆' : ''));
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
        statsEl),
      selected === today && noticeEl(),
      strip(),
      m.review && h('p', { class: 'muted small' }, 'Mes cerrado: solo se puede editar la línea.'),
      h('div', { class: `habits${off ? ' resting' : ''}` }, m.habits.map((hb) => habitRow(m, hb))),
      !m.review && h('button', { class: 'linklike small day-off', type: 'button', 'aria-pressed': String(off), onClick: () => {
        try { toggleDayOff(state, selected); } catch (e) { toast(e.message); return; }
        ctx.save();
        haptic();
        draw();
      } }, off ? 'Es día libre · quitar' : 'Marcar como día libre (no cuenta en el %)'),
      h('label', { class: 'field line-field' }, h('span', { class: 'field-label' }, 'Línea del día'), note),
    ].filter(Boolean));
  }

  draw();
}
