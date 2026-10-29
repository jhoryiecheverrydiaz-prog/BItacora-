import { h, svg, clear, modal, toast } from './dom.js';
import { monthKey, monthTitle, monthLength, dayKeyOf, mondayIndex, WEEK_LETTERS, formatLong } from '../core/dates.js';
import { monthStats, lastElapsedDay } from '../core/stats.js';
import { toggleCheck, setNote, isDone } from '../core/months.js';
import { helpButton, guideCard } from './help.js';

const pctText = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);
const STATE_LABEL = { full: 'completo', min: 'mínimo' };
let viewKey = null;

// Gráfica SVG: eje Y 0..n hábitos, eje X días; línea solo hasta hoy.
export function chartSvg(month, stats, today) {
  const len = monthLength(month.key);
  const n = Math.max(1, month.habits.length);
  const W = 340, H = 150, L = 20, R = 8, T = 8, B = 20;
  const x = (d) => L + ((d - 1) * (W - L - R)) / (len - 1);
  const y = (v) => T + (H - T - B) * (1 - v / n);
  const pts = stats.series.filter((s) => s.counts);
  const kids = [svg('title', {}, `Hábitos cumplidos por día en ${monthTitle(month.key)}`)];
  for (let v = 0; v <= n; v++) {
    kids.push(svg('line', { class: v === 0 ? 'axis' : 'gridline', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
    kids.push(svg('text', { class: 'lbl', x: L - 6, y: y(v) + 3, 'text-anchor': 'end' }, String(v)));
  }
  kids.push(svg('line', { class: 'axis', x1: L, x2: L, y1: T, y2: y(0) }));
  for (const d of [1, 5, 10, 15, 20, 25, len]) kids.push(svg('text', { class: 'lbl', x: x(d), y: H - 5, 'text-anchor': 'middle' }, String(d)));
  if (monthKey(today) === month.key) {
    const td = Number(today.slice(8));
    kids.push(svg('line', { class: 'today-mark', x1: x(td), x2: x(td), y1: T, y2: y(0) }));
  }
  if (pts.length > 1) kids.push(svg('polyline', { class: 'path', points: pts.map((s) => `${x(s.day)},${y(s.score)}`).join(' ') }));
  for (const s of pts) kids.push(svg('circle', { class: `pt${s.score ? '' : ' zero'}`, cx: x(s.day), cy: y(s.score), r: 2.8 }));
  return svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': 'chart-t' }, ...kids);
}

function srTable(stats) {
  const rows = stats.series.filter((s) => s.counts);
  return h('table', { class: 'sr-only' }, h('caption', {}, 'Hábitos cumplidos por día'),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Día'), h('th', { scope: 'col' }, 'Cumplidos'))),
    h('tbody', {}, rows.map((s) => h('tr', {}, h('th', { scope: 'row' }, String(s.day)), h('td', {}, String(s.score))))));
}

export function renderMonth(root, ctx) {
  const { state, today } = ctx;
  const keys = Object.keys(state.months).filter((k) => k <= monthKey(today)).sort().reverse();
  if (!viewKey || !state.months[viewKey]) viewKey = keys[0];
  const month = state.months[viewKey];
  const closed = !!month.review;
  const len = monthLength(month.key);

  const isEditableDay = (d) => d >= month.startDay && d <= lastElapsedDay(month, today);

  const sheets = h('div', { class: 'sheets' });
  const dots = h('div', { class: 'page-dots', role: 'tablist' });
  const goTo = (i) => sheets.scrollTo({ left: i * sheets.clientWidth, behavior: 'smooth' });
  ['Bitácora', 'Hábitos'].forEach((label, i) => dots.append(h('button', { type: 'button', 'aria-label': `Página ${label}`, 'aria-current': String(i === 0), onClick: () => goTo(i) })));
  sheets.addEventListener('scroll', () => {
    const i = Math.round(sheets.scrollLeft / Math.max(1, sheets.clientWidth));
    [...dots.children].forEach((b, j) => b.setAttribute('aria-current', String(i === j)));
  }, { passive: true });

  root.append(
    h('div', { class: 'month-bar' },
      h('select', { class: 'input', 'aria-label': 'Mes', onChange: (e) => { viewKey = e.target.value; ctx.render(); } },
        keys.map((k) => h('option', { value: k, selected: k === viewKey }, monthTitle(k)))),
      closed && h('span', { class: 'readonly-tag' }, 'Cerrado'),
      dots,
      helpButton('mes')),
    h('div', { class: 'month-guide' }, guideCard('mes', 'Dos páginas: la bitácora (una línea por día) y los hábitos. Desliza de lado para pasar de una a otra.', () => ctx.render())),
    sheets,
  );

  const logSheet = h('section', { class: 'sheet', 'aria-label': 'Bitácora del mes' });
  const habitSheet = h('section', { class: 'sheet', 'aria-label': 'Hábitos del mes' });
  sheets.append(logSheet, habitSheet);

  async function editNote(key) {
    const input = h('input', { class: 'input', value: month.days[key]?.note || '', maxlength: 280, enterkeyhint: 'done' });
    const v = await modal({ title: formatLong(key), body: input, actions: [{ label: 'Cancelar', value: null }, { label: 'Guardar', value: () => input.value, kind: 'primary' }] });
    if (v === null) return;
    setNote(state, key, v);
    ctx.save();
    drawLog();
  }

  function drawLog() {
    clear(logSheet);
    const items = [];
    for (let d = 1; d <= len; d++) {
      const key = dayKeyOf(month.key, d);
      const ok = isEditableDay(d);
      items.push(h('li', {}, h('button', {
        class: `log-item${ok ? '' : ' off'}${key === today ? ' today' : ''}`, type: 'button', disabled: !ok,
        'aria-label': `Día ${d}: ${month.days[key]?.note || 'sin nota'}`, onClick: () => editNote(key),
      }, h('span', { class: 'num' }, String(d)), h('span', { class: 'txt' }, month.days[key]?.note || ''))));
    }
    logSheet.append(h('div', { class: 'sheet-inner' },
      h('h1', { class: 'sheet-title' }, monthTitle(month.key)),
      h('p', { class: 'mantra' }, month.mantra ? `Mantra: ${month.mantra}` : 'Sin mantra'),
      h('p', { class: 'muted small' }, 'Toca un día para escribir su línea. Desliza → para ver los hábitos.'),
      h('ul', { class: 'log-list' }, items)));
  }

  function cycleGoal(g) {
    if (closed) return;
    g.done = g.done === null ? true : g.done === true ? false : null;
    ctx.save();
    drawHabits();
  }

  function drawHabits() {
    const st = monthStats(month, today);
    clear(habitSheet);
    const head = h('tr', {}, h('th', { scope: 'col' }, 'Día'), h('th', { scope: 'col', class: 'wd', 'aria-label': 'Día de la semana' }, ''),
      month.habits.map((hb) => h('th', { scope: 'col', 'data-c': hb.color, style: { color: 'var(--hc)' }, title: hb.name }, hb.short)),
      h('th', { scope: 'col', class: 'score', 'aria-label': 'Cumplidos' }, '#'));
    const rows = [];
    for (let d = 1; d <= len; d++) {
      const key = dayKeyOf(month.key, d);
      const ok = isEditableDay(d);
      const wi = mondayIndex(key);
      const checks = month.days[key]?.checks || {};
      const sc = st.series[d - 1].score;
      rows.push(h('tr', { class: `${ok ? '' : 'off'}${key === today ? ' today' : ''}${wi === 0 ? ' weekstart' : ''}` },
        h('th', { scope: 'row' }, String(d)),
        h('th', { class: 'wd' }, WEEK_LETTERS[wi]),
        month.habits.map((hb) => {
          const v = checks[hb.id];
          return h('td', {}, h('button', {
            class: `cell ${v || ''}`, type: 'button', 'data-c': hb.color, disabled: !ok || closed,
            'aria-pressed': String(isDone(v)), 'aria-label': `${hb.name}, día ${d}: ${STATE_LABEL[v] || 'vacío'}`,
            onClick: () => {
              try { toggleCheck(state, key, hb.id); } catch (e) { toast(e.message); return; }
              ctx.save();
              drawHabits();
            },
          }));
        }),
        h('td', { class: 'score' }, sc === null ? '' : String(sc))));
    }
    const goalMark = (g) => (g.done === true ? h('span', { class: 'gbox yes' }, '✓') : g.done === false ? h('span', { class: 'gbox no' }, '✕') : h('span', { class: 'gbox' }));
    const goalLabel = (g) => (g.done === true ? 'cumplido' : g.done === false ? 'no cumplido' : 'pendiente');
    habitSheet.append(h('div', { class: 'sheet-inner' },
      h('h1', { class: 'sheet-title' }, 'Hábitos'),
      h('p', { class: 'mantra' }, 'Hábitos cumplidos por día'),
      chartSvg(month, st, today),
      srTable(st),
      h('p', { class: 'muted small' }, 'Arriba: cuántos hábitos cumpliste cada día. Abajo: toca una casilla para marcarla.'),
      h('div', { class: 'grid-wrap' }, h('table', { class: 'hgrid' }, h('thead', {}, head), h('tbody', {}, rows))),
      h('p', { class: 'legend' },
        h('span', { class: 'box full', 'data-c': 'c1', 'aria-hidden': 'true' }), ' completo ',
        h('span', { class: 'box min', 'data-c': 'c1', 'aria-hidden': 'true' }), ' mínimo · # = cumplidos ese día'),
      h('h2', {}, 'Otros objetivos del mes'),
      month.goals.length > 0 && !closed && h('p', { class: 'muted small' }, 'Toca el cuadro: pendiente → ✓ cumplido → ✕ no cumplido.'),
      month.goals.length
        ? h('ul', { class: 'goals' }, month.goals.map((g) => h('li', { class: 'goal' },
          h('button', { class: 'gstate', type: 'button', disabled: closed, 'aria-label': `${g.text}: ${goalLabel(g)}. Tocar para cambiar.`, onClick: () => cycleGoal(g) }, goalMark(g)),
          h('span', { class: 'gtext' }, g.text))))
        : h('p', { class: 'muted small' }, 'Sin objetivos este mes.'),
      h('div', { class: 'foot-stats' },
        h('div', {}, `Días registrados: ${st.daysRegistered} de ${st.daysElapsed} · ${pctText(st.pctRegistered)}`),
        h('div', { class: 'small' }, 'Por hábito (cumplidos de los esperados hasta hoy):'),
        h('ul', {}, month.habits.map((hb) => {
          const s = st.perHabit[hb.id];
          return h('li', {}, h('b', { 'data-c': hb.color, style: { color: 'var(--hc)' } }, hb.short), ` ${s.done}/${s.expected} · ${pctText(s.pct)}`);
        }))),
    ));
    habitSheet.querySelector('svg.chart title')?.setAttribute('id', 'chart-t');
  }

  drawLog();
  drawHabits();
}
