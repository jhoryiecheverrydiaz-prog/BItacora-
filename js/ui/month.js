import { h, svg, clear, modal, toast, field, confirmModal } from './dom.js';
import { monthKey, monthTitle, monthLength, dayKeyOf, mondayIndex, WEEK_LETTERS, formatLong, formatRange } from '../core/dates.js';
import { monthStats, lastElapsedDay, streaks, habitStrength } from '../core/stats.js';
import { toggleCheck, setNote, toggleDayOff, isDone } from '../core/months.js';
import { areaById, areaLabel } from '../core/years.js';
import {
  addWeekGoal, toggleWeekGoal, removeWeekGoal, addEvent, toggleEvent, removeEvent, addBill, toggleBill, removeBill,
  billsTotals, formatMoney, byDay, weekLabel, MAX_WEEK_GOALS, MAX_EVENTS, MAX_BILLS,
} from '../core/plan.js';

const pctText = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);
const STATE_LABEL = { full: 'completo', min: 'mínimo' };
let viewKey = null;
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
    kids.push(svg('polyline', { class: 'path', points: line }));
  }
  for (const s of pts) kids.push(svg('circle', { class: `pt${s.off ? ' off' : s.score ? '' : ' zero'}`, cx: x(s.day), cy: y(s.score), r: 2.8 }));
  return svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': 'chart-t' }, ...kids);
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
  sheets.addEventListener('scroll', () => {
    const i = Math.round(sheets.scrollLeft / Math.max(1, sheets.clientWidth));
    [...dots.children].forEach((b, j) => b.setAttribute('aria-current', String(i === j)));
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

  async function editNote(key) {
    const input = h('input', { class: 'input', value: month.days[key]?.note || '', maxlength: 280, enterkeyhint: 'done' });
    const wasOff = !!month.days[key]?.off;
    const off = h('input', { type: 'checkbox', checked: wasOff, disabled: closed });
    const body = h('div', {}, input,
      h('label', { class: 'check-line' }, off, h('span', {}, 'Día libre (descanso, enfermedad, viaje): no cuenta en el %')));
    const v = await modal({ title: formatLong(key), body, actions: [{ label: 'Cancelar', value: null }, { label: 'Guardar', value: () => input.value, kind: 'primary' }] });
    if (v === null) return;
    setNote(state, key, v);
    if (!closed && off.checked !== wasOff) toggleDayOff(state, key);
    ctx.save();
    drawLog();
    drawHabits();
  }

  function drawLog() {
    clear(logSheet);
    const items = [];
    for (let d = 1; d <= len; d++) {
      const key = dayKeyOf(month.key, d);
      const ok = isEditableDay(d);
      const rest = !!month.days[key]?.off;
      items.push(h('li', {}, h('button', {
        class: `log-item${ok ? '' : ' off'}${key === today ? ' today' : ''}${rest ? ' rest' : ''}`, type: 'button', disabled: !ok,
        onClick: () => editNote(key),
      }, h('span', { class: 'num' }, h('span', { class: 'sr-only' }, 'Día '), String(d)), h('span', { class: 'txt' }, month.days[key]?.note || h('span', { class: 'sr-only' }, 'sin nota')),
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

  const runPlan = (fn) => { try { fn(); ctx.save(); drawPlan(); } catch (e) { toast(e.message); } };
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
    const text = h('input', { class: 'input', maxlength: 80, placeholder: 'Ej.: Internet' });
    const amount = h('input', { class: 'input', inputmode: 'decimal', placeholder: 'Ej.: 89.900' });
    const ok = await modal({ title: 'Factura del mes', body: h('div', {}, h('div', { class: 'row' }, field('Día', day), field('Valor ($)', amount)), field('Descripción', text)), actions: [{ label: 'Cancelar', value: false }, { label: 'Agregar', value: true, kind: 'primary' }] });
    if (ok) runPlan(() => addBill(state, month.key, { day: day.value, text: text.value, amount: amount.value }));
  }

  // Fila con casilla (tocar marca) y borrar (mantener la fila abierta = sin menús escondidos).
  function checkRow({ done, text, sub, onToggle, onRemove, label }) {
    return h('li', { class: 'goal' },
      h('button', { class: 'gstate', type: 'button', disabled: closed, 'aria-pressed': String(done), 'aria-label': `${label || text}: ${done ? 'hecho' : 'pendiente'}. Tocar para cambiar.`, onClick: onToggle },
        h('span', { class: `gbox${done ? ' yes' : ''}` }, done ? '✓' : '')),
      h('span', { class: 'gtext' }, sub ? h('span', { class: 'muted small plan-sub' }, sub) : null, text),
      !closed && h('button', { class: 'linklike small', type: 'button', 'aria-label': `Borrar ${text}`, onClick: async () => {
        if (await confirmModal('Borrar', `"${text}"`, { ok: 'Borrar', danger: true })) onRemove();
      } }, '✕'));
  }

  function drawPlan() {
    clear(planSheet);
    const st = monthStats(month, today);
    const weeks = Math.max(4, st.weeks.length || Math.ceil(len / 7));
    const wg = month.weekGoals || [];
    const bt = billsTotals(month);
    const empty = (t) => h('p', { class: 'muted small' }, t);
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
            onToggle: () => runPlan(() => toggleWeekGoal(state, month.key, g.id)), onRemove: () => runPlan(() => removeWeekGoal(state, month.key, g.id)) }))) : null,
          !closed && list.length < MAX_WEEK_GOALS && h('button', { class: 'linklike small', type: 'button', onClick: () => newWeekGoal(w) }, '+ Objetivo'));
      }),

      h('h2', {}, 'Eventos importantes'),
      (month.events || []).length
        ? h('ul', { class: 'goals' }, byDay(month.events).map((e) => checkRow({ done: e.done, text: e.text, sub: e.day ? `${e.day} · ` : '',
          onToggle: () => runPlan(() => toggleEvent(state, month.key, e.id)), onRemove: () => runPlan(() => removeEvent(state, month.key, e.id)) })))
        : empty('Sin eventos.'),
      !closed && (month.events || []).length < MAX_EVENTS && h('button', { class: 'linklike small', type: 'button', onClick: newEvent }, '+ Evento'),

      h('h2', {}, 'Facturas del mes'),
      (month.bills || []).length
        ? h('ul', { class: 'goals' }, byDay(month.bills).map((b) => checkRow({ done: b.paid, text: b.text, label: `${b.text} ${formatMoney(b.amount)}`,
          sub: `${b.day ? `${b.day} · ` : ''}${b.amount !== null ? `${formatMoney(b.amount)} · ` : ''}`,
          onToggle: () => runPlan(() => toggleBill(state, month.key, b.id)), onRemove: () => runPlan(() => removeBill(state, month.key, b.id)) })))
        : empty('Sin facturas.'),
      bt.count ? h('p', { class: 'bills-total' }, `Total ${formatMoney(bt.total)} · Pagado ${formatMoney(bt.paid)} (${bt.paidCount}/${bt.count}) · Pendiente ${formatMoney(bt.pending)}`) : null,
      !closed && (month.bills || []).length < MAX_BILLS && h('button', { class: 'linklike small', type: 'button', onClick: newBill }, '+ Factura'),
    ));
  }

  let redrawTimer = null;
  function scheduleHabits(focusCell) {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(() => {
      const x = sheets.scrollLeft, y = window.scrollY;
      drawHabits();
      drawPlan();
      sheets.scrollLeft = x;
      window.scrollTo(0, y);
      habitSheet.querySelector(`[data-cell="${focusCell}"]`)?.focus({ preventScroll: true });
    }, 450);
  }

  function drawHabits() {
    const st = monthStats(month, today);
    clear(habitSheet);
    const head = h('tr', {}, h('th', { scope: 'col' }, 'Día'), h('th', { scope: 'col', class: 'wd' }, h('span', { class: 'sr-only' }, 'Día de la semana')),
      month.habits.map((hb) => h('th', { scope: 'col', 'data-c': hb.color, style: { color: 'var(--hc)' }, title: hb.name }, hb.short)),
      h('th', { scope: 'col', class: 'score', 'aria-label': 'Cumplidos' }, '#'));
    const rows = [];
    for (let d = 1; d <= len; d++) {
      const key = dayKeyOf(month.key, d);
      const ok = isEditableDay(d);
      const wi = mondayIndex(key);
      const checks = month.days[key]?.checks || {};
      const sc = st.series[d - 1].score;
      const rest = ok && !!month.days[key]?.off;
      rows.push(h('tr', { class: `${ok ? '' : 'off'}${key === today ? ' today' : ''}${wi === 0 ? ' weekstart' : ''}${rest ? ' rest' : ''}` },
        h('th', { scope: 'row' }, String(d)),
        h('th', { class: 'wd' }, WEEK_LETTERS[wi]),
        month.habits.map((hb) => {
          const v = checks[hb.id];
          return h('td', {}, h('button', {
            class: `cell ${v || ''}`, type: 'button', 'data-c': hb.color, disabled: !ok || closed,
            'aria-pressed': String(isDone(v)), 'aria-label': `${hb.name}, día ${d}: ${STATE_LABEL[v] || 'vacío'}`,
            'data-cell': `${key}|${hb.id}`,
            onClick: (e) => {
              let v;
              try { v = toggleCheck(state, key, hb.id); } catch (err) { toast(err.message); return; }
              ctx.save();
              // Respuesta inmediata en la casilla y el puntaje; el resto de la hoja se redibuja agrupado.
              const btn = e.currentTarget;
              btn.className = `cell ${v || ''}`;
              btn.setAttribute('aria-pressed', String(isDone(v)));
              btn.setAttribute('aria-label', `${hb.name}, día ${d}: ${STATE_LABEL[v] || 'vacío'}`);
              const score = btn.closest('tr')?.querySelector('td.score');
              if (score && !month.days[key]?.off) score.textContent = String(month.habits.filter((x) => isDone(month.days[key]?.checks?.[x.id])).length);
              scheduleHabits(`${key}|${hb.id}`);
            },
          }));
        }),
        h('td', { class: `score${st.series[d - 1].perfect ? ' perfect' : ''}`, title: st.series[d - 1].perfect ? 'Día al 100 %' : null },
          rest ? 'L' : sc === null ? '' : st.series[d - 1].perfect ? `🏆` : String(sc))));
    }
    const habitDetail = (hb) => {
      const s = st.perHabit[hb.id];
      const sk = streaks(month, hb, today);
      const strength = habitStrength(state, hb, today);
      const area = hb.area && areaById(state, hb.area);
      return h('li', { class: 'hdetail' },
        h('div', { class: 'hd-top' },
          h('b', { 'data-c': hb.color, style: { color: 'var(--hc)' } }, hb.short),
          h('span', { class: 'grow' }, hb.name, area ? h('span', { class: 'muted small' }, ` · ${areaLabel(area)}`) : null),
          h('b', {}, pctText(s.pct))),
        pctBar(s.pct, hb.name),
        h('div', { class: 'muted small' }, `${s.done}/${s.expected} (${s.min} mín.)`, sk ? ` · Racha: ${sk.current} actual · ${sk.max} máx.` : '',
          strength !== null ? h('span', { title: 'Media de las últimas semanas; un día fallado baja poco' }, ` · Fuerza ${pctText(strength)}`) : null),
        hb.note ? h('p', { class: 'hnote' }, hb.note) : null);
    };
    habitSheet.append(h('div', { class: 'sheet-inner' },
      h('h1', { class: 'sheet-title' }, 'Hábitos'),
      h('div', { class: 'progress-head' },
        h('div', {}, h('span', { class: 'muted small' }, 'Cumplimiento del mes'), h('b', { class: 'big-pct' }, pctText(st.pct))),
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
          h('b', {}, pctText(w.pct)))))) : null,
      h('div', { class: 'grid-wrap' }, h('table', { class: 'hgrid' }, h('thead', {}, head), h('tbody', {}, rows))),
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
      month.review?.imported ? h('p', { class: 'muted small' }, 'Mes importado desde Google Sheets.') : null,
    ));
    habitSheet.querySelector('svg.chart title')?.setAttribute('id', 'chart-t');
  }

  drawLog();
  drawHabits();
  drawPlan();
}
