// Panel: tablero de tendencias (hábitos + energía, ánimo, sueño y focos). Solo lectura.
import { h, svg } from './dom.js';
import { monthTitle, MONTHS_SHORT, WEEK_LETTERS, formatShort, parseKey } from '../core/dates.js';
import { lastDays, summarize, series, findings, weekdayProfile, monthTrend, habitImpact, RANGES } from '../core/insights.js';
import { SLEEP_GOOD } from '../core/checkin.js';

let range = 30; // días (persiste en la sesión)

const pct = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);
const num = (v, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d).replace('.', ','));

function kpi(value, label, sub) {
  return h('div', { class: 'kpi' }, h('b', {}, value), h('span', {}, label), sub && h('small', {}, sub));
}

// Línea: % de hábitos por día (0-100) + puntos de energía y ánimo (1-5 en la misma altura).
function trendChart(pts) {
  const W = 340, H = 160, L = 26, R = 8, T = 10, B = 20;
  const n = pts.length;
  const x = (i) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (H - T - B) * (1 - v);
  const kids = [svg('title', {}, 'Hábitos cumplidos (%), energía y ánimo por día')];
  for (const v of [0, 0.5, 1]) {
    kids.push(svg('line', { class: v === 0 ? 'axis' : 'gridline', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
    kids.push(svg('text', { class: 'lbl', x: L - 5, y: y(v) + 3, 'text-anchor': 'end' }, `${v * 100}`));
  }
  const step = Math.max(1, Math.ceil(n / 6));
  pts.forEach((p, i) => { if (i % step === 0 || i === n - 1) kids.push(svg('text', { class: 'lbl', x: x(i), y: H - 5, 'text-anchor': 'middle' }, String(parseKey(p.key).d))); });
  const line = pts.map((p, i) => (p.pct === null ? null : `${x(i)},${y(p.pct)}`)).filter(Boolean);
  if (line.length > 1) {
    kids.push(svg('polygon', { class: 'area', points: `${line[0].split(',')[0]},${y(0)} ${line.join(' ')} ${line[line.length - 1].split(',')[0]},${y(0)}` }));
    kids.push(svg('polyline', { class: 'path', points: line.join(' ') }));
  }
  const sc = (v) => (v - 1) / 4;
  pts.forEach((p, i) => {
    if (p.energy !== null) kids.push(svg('circle', { class: 'pt-en', cx: x(i), cy: y(sc(p.energy)), r: 3 }));
    if (p.mood !== null) kids.push(svg('rect', { class: 'pt-mo', x: x(i) - 2.6, y: y(sc(p.mood)) - 2.6, width: 5.2, height: 5.2, rx: 1 }));
  });
  return svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Gráfica de hábitos, energía y ánimo por día' }, ...kids);
}

function bars(items, { max = 1, fmt = pct, cls = '' } = {}) {
  return h('ul', { class: `vbars ${cls}` }, items.map((it) => {
    const v = it.value;
    const hgt = v === null || v === undefined ? 0 : Math.max(3, Math.round((v / max) * 100));
    return h('li', { class: it.now ? 'now' : '' },
      h('span', { class: 'vbar-val' }, fmt(v)),
      h('span', { class: 'vbar', 'aria-hidden': 'true' }, h('i', { style: { height: `${hgt}%` }, class: v === null || v === undefined ? 'empty' : '' })),
      h('span', { class: 'vbar-lbl' }, it.label),
      h('span', { class: 'sr-only' }, `: ${fmt(v)}`));
  }));
}

export function renderPanel(root, ctx) {
  const { state, today } = ctx;
  const page = h('section', { class: 'page panel' });
  root.append(page);

  function draw() {
    page.replaceChildren();
    const keys = lastDays(state, today, range);
    const s = summarize(state, keys);
    const pts = series(state, keys);
    const f = findings(state, keys);
    const wd = weekdayProfile(state, keys);
    const trend = monthTrend(state, today, 6);
    const cur = state.months[today.slice(0, 7)];
    const ext = state.meta.checkin?.enabled !== false;

    page.append(...[
      h('div', { class: 'panel-head' }, h('h1', {}, 'Panel'),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Periodo' }, Object.entries(RANGES).map(([d, label]) =>
          h('button', { type: 'button', 'aria-pressed': String(Number(d) === range), 'aria-label': label, onClick: () => { range = Number(d); draw(); } }, `${d} d`)))),
      h('p', { class: 'muted small' }, keys.length ? `${RANGES[range]}: ${formatShort(keys[0])} a ${formatShort(keys[keys.length - 1])} · ${s.days} días contados` : 'Aún no hay días en este periodo.'),

      h('div', { class: 'kpis' },
        kpi(pct(s.pct), 'Hábitos por día', 'promedio'),
        ext && kpi(num(s.energy), 'Energía', 'de 5'),
        ext && kpi(num(s.mood), 'Ánimo', 'de 5'),
        ext && kpi(s.sleep === null ? '—' : `${num(s.sleep)} h`, 'Sueño', s.sleepDays ? `${s.goodNights}/${s.sleepDays} noches ≥ ${SLEEP_GOOD} h` : 'sin datos'),
        ext && kpi(String(s.focus), 'Focos', `${s.focusDays} días con foco`),
        ext && kpi(`${s.task1Days}/${s.days || 0}`, 'Tarea #1', 'días definida')),

      keys.length > 1 && h('div', { class: 'section' }, h('h2', {}, 'Día a día'),
        trendChart(pts),
        h('p', { class: 'legend small muted' },
          h('span', { class: 'lg lg-line' }), ' Hábitos (%)',
          ext && [h('span', { class: 'lg lg-en' }), ' Energía', h('span', { class: 'lg lg-mo' }), ' Ánimo'])),

      h('div', { class: 'section' }, h('h2', {}, 'Hallazgos'),
        f.length ? h('ul', { class: 'findings' }, f.map((t) => h('li', {}, t)))
          : h('p', { class: 'muted small' }, ext ? 'Aparecen cuando hay al menos 3 días con y 3 sin cada hábito, con energía, ánimo o sueño registrados.' : 'Activa el registro extendido en Ajustes para ver relaciones con energía, ánimo y sueño.')),

      ext && cur?.habits.length && h('div', { class: 'section' }, h('h2', {}, 'Cada hábito y tu energía'),
        h('ul', { class: 'list compact' }, cur.habits.map((hb) => {
          const r = habitImpact(state, keys, hb.id, 'energy');
          return h('li', {}, h('span', { class: 'box full', 'data-c': hb.color, style: { width: '14px', height: '14px' } }),
            h('span', { class: 'grow' }, h('b', {}, hb.short), ` ${hb.name}`),
            h('span', { class: 'muted small nowrap' }, r ? `${num(r.with)} con · ${num(r.without)} sin` : 'faltan datos'));
        }))),

      h('div', { class: 'section' }, h('h2', {}, 'Por día de la semana'),
        bars(wd.map((v, i) => ({ label: WEEK_LETTERS[i], value: v })))),

      h('div', { class: 'section' }, h('h2', {}, 'Últimos 6 meses'),
        bars(trend.map((t) => ({ label: MONTHS_SHORT[Number(t.key.slice(5)) - 1], value: t.pct, now: t.key === today.slice(0, 7) }))),
        ext && h('ul', { class: 'list compact trend-list' }, trend.filter((t) => t.pct !== null).reverse().map((t) =>
          h('li', {}, h('span', { class: 'grow' }, monthTitle(t.key)),
            h('span', { class: 'muted small nowrap' }, `${pct(t.pct)} · E ${num(t.energy)} · Á ${num(t.mood)} · ${t.sleep === null ? '—' : `${num(t.sleep)} h`} · ${t.focus} focos`))))),
    ].filter(Boolean));
  }
  draw();
}
