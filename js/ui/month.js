import { h, svg, clear, modal, toast, field, undoToast, haptic } from './dom.js';
import { friendly } from './errors.js';
import { typicalTime, habitAgeDays, AUTOMATIC_MEDIAN_DAYS } from '../core/routine.js';
import { monthKey, monthTitle, monthLength, dayKeyOf, mondayIndex, WEEK_LETTERS, formatLong, formatRange } from '../core/dates.js';
import { monthStats, lastElapsedDay, streaks, habitStrength } from '../core/stats.js';
import { toggleCheck, setNote, toggleDayOff, toggleStar, isDone } from '../core/months.js';
import { areaById, areaLabel } from '../core/years.js';
import {
  addWeekGoal, toggleWeekGoal, removeWeekGoal, addEvent, toggleEvent, removeEvent, addBill, toggleBill, removeBill,
  billsTotals, formatMoney, byDay, weekLabel, MAX_WEEK_GOALS, MAX_EVENTS, MAX_BILLS,
} from '../core/plan.js';

const pctText = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);
const STATE_LABEL = { full: 'completo', min: 'mínimo' };
let viewKey = null;
const drawnCharts = new Set(); // la gráfica se dibuja animada solo la primera vez por sesión
const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Número que cuenta hasta su valor (solo la primera vez que se ve).
function countUp(el, value, fmt) {
  if (value === null || value === undefined || reduceMotion()) { el.textContent = fmt(value); return; }
  const t0 = performance.now(), dur = 450;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(value * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
export const setViewMonth = (k) => { viewKey = k; };

function pctBar(p, label) {
  const w = p === null || p === undefined ? 0 : Math.round(p * 100);
  return h('span', { class: 'bar', role: 'img', 'aria-label': `${label}: ${pctText(p)}` }, h('i', { style: { width: `${w}%` } }));
}

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
  if (pts.length > 1) {
    const line = pts.map((s) => `${x(s.day)},${y(s.score)}`).join(' ');
    kids.push(svg('polygon', { class: 'area', points: `${x(pts[0].day)},${y(0)} ${line} ${x(pts[pts.length - 1].day)},${y(0)}` }));
    const animate = !drawnCharts.has(month.key) && !reduceMotion();
    drawnCharts.add(month.key);
    kids.push(svg('polyline', { class: `path${animate ? ' draw' : ''}`, points: line, pathLength: 1 }));
  }
  const cursor = svg('line', { class: 'cursor', x1: 0, x2: 0, y1: T, y2: y(0), visibility: 'hidden' });
  kids.push(cursor);
  for (const s of pts) kids.push(svg('circle', { class: `pt${s.off ? ' off' : s.score ? '' : ' zero'}`, cx: x(s.day), cy: y(s.score), r: 2.8 }));
  const el = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': 'chart-t' }, ...kids);
  // Tocar o arrastrar sobre la gráfica muestra el día y su puntaje.
  const tip = h('p', { class: 'chart-tip muted small', 'aria-hidden': 'true' }, 'Toca la gráfica para ver cada día.');
  const show = (e) => {
    const r = el.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    const d = Math.max(1, Math.min(len, Math.round(((vx - L) * (len - 1)) / (W - L - R)) + 1));
    const s = stats.series[d - 1];
    cursor.setAttribute('x1', x(d)); cursor.setAttribute('x2', x(d)); cursor.setAttribute('visibility', 'visible');
    tip.textContent = !s?.counts ? `Día ${d}: sin registro` : s.off ? `Día ${d}: día libre` : `Día ${d}: ${s.score}/${month.habits.length} · ${pctText(s.pct)}`;
  };
  el.addEventListener('pointerdown', show);
  el.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType !== 'mouse') show(e); });
  return h('div', { class: 'chart-box' }, el, tip);
}

function srTable(stats) {
  const rows = stats.series.filter((s) => s.counts);
  return h('table', { class: 'sr-only' }, h('caption', {}, 'Hábitos cumplidos por día'),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Día'), h('th', { scope: 'col' }, 'Cumplidos'), h('th', { scope: 'col' }, '%'))),
    h('tbody', {}, rows.map((s) => h('tr', {}, h('th', { scope: 'row' }, String(s.day)), h('td', {}, s.off ? 'día libre' : String(s.score)), h('td', {}, pctText(s.pct))))));
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
  const dots = h('div', { class: 'page-dots', role: 'group', 'aria-label': 'Páginas del mes' });
  const goTo = (i) => sheets.scrollTo({ left: i * sheets.clientWidth, behavior: 'smooth' });
  ['Bitácora', 'Hábitos', 'Plan'].forEach((label, i) => dots.append(h('button', { type: 'button', 'aria-label': `Página ${label}`, 'aria-current': String(i === 0), onClick: () => goTo(i) })));
  let raf = 0;
  sheets.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const pos = sheets.scrollLeft / Math.max(1, sheets.clientWidth);
      dots.style.setProperty('--pos', pos.toFixed(3)); // el punto activo sigue al dedo
      const i = Math.round(pos);
      [...dots.querySelectorAll('button')].forEach((b, j) => b.setAttribute('aria-current', String(i === j)));
    });
  }, { passive: true });

  root.append(
    h('div', { class: 'month-bar' },
      h('select', { class: 'input', 'aria-label': 'Mes', onChange: (e) => { viewKey = e.target.value; ctx.render(); } },
        keys.map((k) => h('option', { value: k, selected: k === viewKey }, monthTitle(k)))),
      closed && h('span', { class: 'readonly-tag' }, 'Cerrado'),
      dots),
    sheets,
  );

  const logSheet = h('section', { class: 'sheet', 'aria-label': 'Bitácora del mes' });
  const habitSheet = h('section', { class: 'sheet', 'aria-label': 'Hábitos del mes' });
  const planSheet = h('section', { class: 'sheet', 'aria-label': 'Plan del mes' });
  sheets.append(logSheet, habitSheet, planSheet);

  // Edición en línea: la fila se vuelve campo de texto en su sitio (sin ventana).
  function editNote(key, li) {
    const day = month.days[key];
    const input = h('input', { class: 'input inline-note', value: day?.note || '', maxlength: 280, enterkeyhint: 'done', 'aria-label': `Nota del ${formatLong(key)}` });
    const offBtn = h('button', { class: 'chip small', type: 'button', disabled: closed, 'aria-pressed': String(!!day?.off), onClick: () => {
      try { toggleDayOff(state, key); } catch (e) { toast(friendly(e)); return; }
      offBtn.setAttribute('aria-pressed', String(!!month.days[key]?.off));
      ctx.save(); haptic();
    } }, 'Día libre');
    const starBtn = h('button', { class: 'chip small', type: 'button', 'aria-pressed': String(!!day?.star), onClick: () => {
      setNote(state, key, input.value);
      try { toggleStar(state, key); } catch (e) { toast(friendly(e)); return; }
      starBtn.setAttribute('aria-pressed', String(!!month.days[key]?.star));
      ctx.save(); haptic();
    } }, '★ Destacar');
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save) { setNote(state, key, input.value); ctx.save(); }
      drawLog();
      scheduleHabits();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    const box = h('div', { class: 'inline-edit' },
      h('span', { class: 'num' }, String(parseKeyDay(key))), input,
      h('div', { class: 'chips' }, offBtn, starBtn, h('button', { class: 'chip small primary-chip', type: 'button', onClick: () => finish(true) }, 'Listo')));
    box.addEventListener('focusout', () => setTimeout(() => { if (!box.contains(document.activeElement)) finish(true); }, 0));
    clear(li).append(box);
    input.focus();
  }
  const parseKeyDay = (k) => Number(k.slice(8));

  function drawLog() {
    clear(logSheet);
    const items = [];
    for (let d = 1; d <= len; d++) {
      const key = dayKeyOf(month.key, d);
      const ok = isEditableDay(d);
      const rest = !!month.days[key]?.off;
      items.push(h('li', {}, h('button', {
        class: `log-item${ok ? '' : ' off'}${key === today ? ' today' : ''}${rest ? ' rest' : ''}`, type: 'button', disabled: !ok,
        onClick: (e) => editNote(key, e.currentTarget.parentElement),
      }, h('span', { class: 'num' }, h('span', { class: 'sr-only' }, 'Día '), String(d)), h('span', { class: 'txt' }, month.days[key]?.note || h('span', { class: 'sr-only' }, 'sin nota')),
      month.days[key]?.star && h('span', { class: 'star-tag', 'aria-label': 'destacada' }, '★'),
      rest && h('span', { class: 'rest-tag' }, 'libre'))));
    }
    logSheet.append(h('div', { class: 'sheet-inner' },
      h('h1', { class: 'sheet-title' }, monthTitle(month.key)),
      h('p', { class: 'mantra' }, month.mantra ? `Mantra: ${month.mantra}` : 'Sin mantra'),
      h('ul', { class: 'log-list' }, items)));
  }

  function cycleGoal(g) {
    if (closed) return;
    g.done = g.done === null ? true : g.done === true ? false : null;
    ctx.save();
    drawPlan();
  }
  const goalMark = (g) => (g.done === true ? h('span', { class: 'gbox yes' }, '✓') : g.done === false ? h('span', { class: 'gbox no' }, '✕') : h('span', { class: 'gbox' }));
  const goalLabel = (g) => (g.done === true ? 'cumplido' : g.done === false ? 'no cumplido' : 'pendiente');

  const runPlan = (fn) => { try { fn(); ctx.save(); drawPlan(); } catch (e) { toast(friendly(e)); } };
  // Borrar sin preguntar y con Deshacer (5 s): restaura la lista tal como estaba.
  const removeWithUndo = (field, text, fn) => {
    const before = structuredClone(month[field] || []);
    runPlan(fn);
    undoToast(`Borrado: ${text}`, () => { month[field] = before; ctx.save(); drawPlan(); });
  };
  const daySelect = () => h('select', { class: 'input' }, h('option', { value: '' }, 'Sin día'),
    Array.from({ length: len }, (_, i) => h('option', { value: i + 1 }, String(i + 1))));

  async function newWeekGoal(week) {
    const input = h('input', { class: 'input', maxlength: 120, placeholder: 'Ej.: Ir al gym 3 veces' });
    const v = await modal({ title: weekLabel(week), body: field('Objetivo', input), actions: [{ label: 'Cancelar', value: null }, { label: 'Agregar', value: () => input.value, kind: 'primary' }] });
    if (v !== null) runPlan(() => addWeekGoal(state, month.key, week, v));
  }

  async function newEvent() {
    const day = daySelect();
    const text = h('input', { class: 'input', maxlength: 120, placeholder: 'Ej.: Cumpleaños de mamá' });
    const ok = await modal({ title: 'Evento importante', body: h('div', {}, field('Día', day), field('Evento', text)), actions: [{ label: 'Cancelar', value: false }, { label: 'Agregar', value: true, kind: 'primary' }] });
    if (ok) runPlan(() => addEvent(state, month.key, { day: day.value, text: text.value }));
  }

  async function newBill() {
    const day = daySelect();
    const text = h('input', { class: 'input', maxlength: 80, placeholder: 'Ej.: Internet', enterkeyhint: 'done' });
    const amount = h('input', { class: 'input', inputmode: 'numeric', placeholder: 'Ej.: 89.900', onInput: (e) => {
      // Separador de miles colombiano mientras escribes (solo números enteros).
      const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
      e.target.value = digits ? Number(digits).toLocaleString('es-CO') : '';
    } });
    const ok = await modal({ title: 'Factura del mes', body: h('div', {}, h('div', { class: 'row' }, field('Día', day), field('Valor ($)', amount)), field('Descripción', text)), actions: [{ label: 'Cancelar', value: false }, { label: 'Agregar', value: true, kind: 'primary' }] });
    if (ok) runPlan(() => addBill(state, month.key, { day: day.value, text: text.value, amount: amount.value }));
  }

  // Fila con casilla (tocar marca) y borrar (mantener la fila abierta = sin menús escondidos).
  function checkRow({ done, text, sub, onToggle, onRemove, label, field: fld }) {
    return h('li', { class: 'goal' },
      h('button', { class: 'gstate', type: 'button', disabled: closed, 'aria-pressed': String(done), 'aria-label': `${label || text}: ${done ? 'hecho' : 'pendiente'}. Tocar para cambiar.`, onClick: onToggle },
        h('span', { class: `gbox${done ? ' yes' : ''}` }, done ? '✓' : '')),
      h('span', { class: 'gtext' }, sub ? h('span', { class: 'muted small plan-sub' }, sub) : null, text),
      !closed && h('button', { class: 'linklike small', type: 'button', 'aria-label': `Borrar ${text}`, onClick: () => removeWithUndo(fld, text, onRemove) }, '✕'));
  }

  function drawPlan() {
    clear(planSheet);
    const st = monthStats(month, today);
    const weeks = Math.max(4, st.weeks.length || Math.ceil(len / 7));
    const wg = month.weekGoals || [];
    const bt = billsTotals(month);
    const empty = (t) => h('p', { class: 'muted small' }, t);
    // Estado vacío útil: para qué sirve + un ejemplo + la acción.
    const emptyCard = (why, example, onAdd, label) => h('div', { class: 'empty-card' },
      h('p', { class: 'small' }, why), h('p', { class: 'muted small hand' }, example),
      onAdd ? h('button', { class: 'btn small-btn', type: 'button', onClick: onAdd }, label) : null);
    planSheet.append(h('div', { class: 'sheet-inner' },
      h('h1', { class: 'sheet-title' }, 'Plan del mes'),
      h('p', { class: 'mantra' }, 'Metas, objetivos de la semana, eventos y facturas'),

      h('h2', {}, 'Metas del mes'),
      month.goals.length
        ? h('ul', { class: 'goals' }, month.goals.map((g) => h('li', { class: 'goal' },
          h('button', { class: 'gstate', type: 'button', disabled: closed, 'aria-label': `${g.text}: ${goalLabel(g)}. Tocar para cambiar.`, onClick: () => cycleGoal(g) }, goalMark(g)),
          h('span', { class: 'gtext' }, g.text))))
        : empty('Sin metas este mes. Se definen en el cierre.'),

      h('h2', {}, 'Objetivos semanales'),
      closed && !wg.length ? empty('Sin objetivos semanales.') : null,
      [0, ...Array.from({ length: Math.min(5, weeks) }, (_, i) => i + 1)].map((w) => {
        const list = wg.filter((g) => g.week === w);
        const wk = st.weeks[w - 1];
        if (closed && !list.length) return null;
        return h('div', { class: 'plan-block' },
          h('h3', {}, weekLabel(w), wk ? h('span', { class: 'muted small' }, ` · ${formatRange(wk.start, wk.end)} · hábitos ${pctText(wk.pct)}`) : null,
            list.length ? h('span', { class: 'muted small' }, ` · ${list.filter((g) => g.done).length}/${list.length}`) : null),
          list.length ? h('ul', { class: 'goals' }, list.map((g) => checkRow({ done: g.done, text: g.text,
            field: 'weekGoals', onToggle: () => runPlan(() => toggleWeekGoal(state, month.key, g.id)), onRemove: () => removeWeekGoal(state, month.key, g.id) }))) : null,
          !closed && list.length < MAX_WEEK_GOALS && h('button', { class: 'linklike small', type: 'button', onClick: () => newWeekGoal(w) }, '+ Objetivo'));
      }),

      h('h2', {}, 'Eventos importantes'),
      (month.events || []).length
        ? h('ul', { class: 'goals' }, byDay(month.events).map((e) => checkRow({ done: e.done, text: e.text, sub: e.day ? `${e.day} · ` : '',
          field: 'events', onToggle: () => runPlan(() => toggleEvent(state, month.key, e.id)), onRemove: () => removeEvent(state, month.key, e.id) })))
        : emptyCard('Cumpleaños, citas, viajes: lo que no quieres olvidar este mes.', 'Ej.: 12 · Cumpleaños de mamá', !closed && newEvent, '+ Evento'),
      !closed && (month.events || []).length > 0 && (month.events || []).length < MAX_EVENTS && h('button', { class: 'linklike small', type: 'button', onClick: newEvent }, '+ Evento'),

      h('h2', {}, 'Facturas del mes'),
      (month.bills || []).length
        ? h('ul', { class: 'goals' }, byDay(month.bills).map((b) => checkRow({ done: b.paid, text: b.text, label: `${b.text} ${formatMoney(b.amount)}`,
          sub: `${b.day ? `${b.day} · ` : ''}${b.amount !== null ? `${formatMoney(b.amount)} · ` : ''}`,
          field: 'bills', onToggle: () => runPlan(() => toggleBill(state, month.key, b.id)), onRemove: () => removeBill(state, month.key, b.id) })))
        : emptyCard('Lleva las cuentas fijas del mes y ve cuánto falta por pagar.', 'Ej.: 5 · Arriendo · $ 1.200.000', !closed && newBill, '+ Factura'),
      bt.count ? h('p', { class: 'bills-total' }, `Total ${formatMoney(bt.total)} · Pagado ${formatMoney(bt.paid)} (${bt.paidCount}/${bt.count}) · Pendiente ${formatMoney(bt.pending)}`) : null,
      !closed && (month.bills || []).length > 0 && (month.bills || []).length < MAX_BILLS && h('button', { class: 'linklike small', type: 'button', onClick: newBill }, '+ Factura'),
    ));
  }

  // Hoja Hábitos en 3 bloques: resumen (arriba), cuadrícula y detalle. Al tocar una casilla solo se
  // redibujan resumen, detalle y plan (agrupado); la cuadrícula no se toca, así no salta ni pierde el foco.
  const sumBox = h('div');
  const gridBox = h('div', { class: 'grid-wrap' });
  const footBox = h('div');
  habitSheet.append(h('div', { class: 'sheet-inner' }, h('h1', { class: 'sheet-title' }, 'Hábitos'), sumBox, gridBox, footBox));
  let firstSummary = true;

  let redrawTimer = null;
  function scheduleHabits() {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(() => {
      const st = monthStats(month, today);
      drawSummary(st);
      drawFoot(st);
      drawPlan();
    }, 350);
  }

  function drawHabits() {
    const st = monthStats(month, today);
    drawSummary(st);
    drawGrid(st);
    drawFoot(st);
  }

  function drawSummary(st) {
    const big = h('b', { class: 'big-pct' });
    if (firstSummary) countUp(big, st.pct, pctText); else big.textContent = pctText(st.pct);
    firstSummary = false;
    clear(sumBox).append(
      h('div', { class: 'progress-head' },
        h('div', {}, h('span', { class: 'muted small' }, 'Cumplimiento del mes'), big),
        h('div', {}, h('span', { class: 'muted small' }, 'Promedio diario'), h('b', {}, pctText(st.avgDayPct))),
        h('div', {}, h('span', { class: 'muted small' }, 'Días al 100 % 🏆'), h('b', {}, String(st.perfectDays))),
        st.daysOff ? h('div', {}, h('span', { class: 'muted small' }, 'Días libres'), h('b', {}, String(st.daysOff))) : null),
      pctBar(st.pct, 'Cumplimiento del mes'),
      h('p', { class: 'mantra' }, 'Hábitos cumplidos por día'),
      chartSvg(month, st, today),
      srTable(st),
      st.weeks.length ? h('div', {}, h('h2', {}, 'Por semana'),
        h('ul', { class: 'weeks' }, st.weeks.map((w) => h('li', {},
          h('span', { class: 'wk-name' }, `S${w.index}`),
          h('span', { class: 'muted small wk-range' }, formatRange(w.start, w.end)),
          pctBar(w.pct, `Semana ${w.index}`),
          h('b', {}, pctText(w.pct)))))) : null);
    sumBox.querySelector('svg.chart title')?.setAttribute('id', 'chart-t');
  }

  function scoreText(st, d, rest) {
    const sc = st.series[d - 1].score;
    return rest ? 'L' : sc === null ? '' : st.series[d - 1].perfect ? '🏆' : String(sc);
  }

  function drawGrid(st) {
    const head = h('tr', {}, h('th', { scope: 'col' }, 'Día'), h('th', { scope: 'col', class: 'wd' }, h('span', { class: 'sr-only' }, 'Día de la semana')),
      month.habits.map((hb) => h('th', { scope: 'col', 'data-c': hb.color, style: { color: 'var(--hc)' }, title: hb.name }, hb.icon || hb.short)),
      h('th', { scope: 'col', class: 'score', 'aria-label': 'Cumplidos' }, '#'));
    const rows = [];
    for (let d = 1; d <= len; d++) {
      const key = dayKeyOf(month.key, d);
      const ok = isEditableDay(d);
      const wi = mondayIndex(key);
      const checks = month.days[key]?.checks || {};
      const rest = ok && !!month.days[key]?.off;
      rows.push(h('tr', { class: `${ok ? '' : 'off'}${key === today ? ' today' : ''}${wi === 0 ? ' weekstart' : ''}${rest ? ' rest' : ''}` },
        h('th', { scope: 'row' }, String(d)),
        h('th', { class: 'wd' }, WEEK_LETTERS[wi]),
        month.habits.map((hb) => {
          const v = checks[hb.id];
          return h('td', {}, h('button', {
            class: `cell ${v || ''}`, type: 'button', 'data-c': hb.color, disabled: !ok || closed,
            'aria-pressed': String(isDone(v)), 'aria-label': `${hb.name}, día ${d}: ${STATE_LABEL[v] || 'vacío'}`,
            onClick: (e) => {
              let v;
              try { v = toggleCheck(state, key, hb.id); } catch (err) { toast(friendly(err)); return; }
              ctx.save();
              haptic();
              // Respuesta inmediata en la casilla y el puntaje de la fila.
              const btn = e.currentTarget;
              btn.className = `cell ${v || ''}`;
              btn.setAttribute('aria-pressed', String(isDone(v)));
              btn.setAttribute('aria-label', `${hb.name}, día ${d}: ${STATE_LABEL[v] || 'vacío'}`);
              const score = btn.closest('tr')?.querySelector('td.score');
              if (score && !month.days[key]?.off) {
                const n = month.habits.filter((x) => isDone(month.days[key]?.checks?.[x.id])).length;
                score.textContent = n === month.habits.length ? '🏆' : String(n);
              }
              scheduleHabits();
            },
          }));
        }),
        h('td', { class: `score${st.series[d - 1].perfect ? ' perfect' : ''}`, title: st.series[d - 1].perfect ? 'Día al 100 %' : null }, scoreText(st, d, rest))));
    }
    clear(gridBox).append(h('table', { class: 'hgrid' }, h('thead', {}, head), h('tbody', {}, rows)));
  }

  function drawFoot(st) {
    const habitDetail = (hb) => {
      const s = st.perHabit[hb.id];
      const sk = streaks(month, hb, today);
      const strength = habitStrength(state, hb, today);
      const area = hb.area && areaById(state, hb.area);
      const tt = typicalTime(state, hb.id, today);
      const age = habitAgeDays(state, hb.id, today);
      const plan = state.profile?.reminderTime;
      return h('li', { class: 'hdetail' },
        h('div', { class: 'hd-top' },
          h('b', { 'data-c': hb.color, style: { color: 'var(--hc)' } }, hb.short),
          h('span', { class: 'grow' }, hb.name, area ? h('span', { class: 'muted small' }, ` · ${areaLabel(area)}`) : null),
          h('b', {}, pctText(s.pct))),
        pctBar(s.pct, hb.name),
        h('div', { class: 'muted small' }, `${s.done}/${s.expected} (${s.min} mín.)`, sk ? ` · Racha: ${sk.current} actual · ${sk.max} máx.` : '',
          strength !== null ? h('span', { title: 'Media de las últimas semanas; un día fallado baja poco' }, ` · Fuerza ${pctText(strength)}`) : null),
        tt && h('div', { class: 'muted small' }, `Sueles marcarlo a las ${tt.hm}${plan ? ` (recordatorio ${plan})` : ''} · ${tt.n} registros`),
        age > 0 && h('div', { class: 'muted small', title: 'Lally et al. (2010): mediana de 66 días para que un hábito sea automático; varía entre 18 y 254.' },
          age < AUTOMATIC_MEDIAN_DAYS ? `Día ${age} de ~${AUTOMATIC_MEDIAN_DAYS} para que sea automático (mediana; varía mucho)` : `Día ${age}: pasó la mediana de ${AUTOMATIC_MEDIAN_DAYS} días`),
        hb.cue ? h('p', { class: 'hnote' }, `Cuando: ${hb.cue}`) : null,
        hb.note ? h('p', { class: 'hnote' }, hb.note) : null);
    };
    clear(footBox).append(
      h('div', { class: 'foot-stats' },
        h('div', {}, `Días registrados: ${st.daysRegistered}/${st.daysElapsed} · ${pctText(st.pctRegistered)}`),
        h('h2', {}, 'Cada hábito'),
        h('ul', { class: 'hdetails' }, month.habits.map(habitDetail))),
      month.archived?.length ? h('div', { class: 'foot-stats' },
        h('h2', {}, 'Otros hábitos registrados en Sheets'),
        h('p', { class: 'muted small' }, 'Superaban el tope de 5 o no coincidían con los del mes. Se guardan como historial.'),
        h('ul', { class: 'list compact' }, month.archived.map((a) => h('li', {},
          h('span', { class: 'grow' }, a.name, a.note ? h('span', { class: 'muted small' }, ` · ${a.note}`) : null),
          h('span', { class: 'muted small', title: `Días: ${a.done.join(', ')}` }, `${a.done.length} días`))))) : null,
      month.review?.imported ? h('p', { class: 'muted small' }, 'Mes importado desde Google Sheets.') : null);
  }

  drawLog();
  drawHabits();
  drawPlan();
}
