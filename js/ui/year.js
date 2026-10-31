import { h, svg, clear, modal, confirmModal, toast, field } from './dom.js';
import { MONTHS_SHORT, monthTitle, monthKey, mondayIndex, formatShort } from '../core/dates.js';
import {
  yearStats, knownYears, addYearGoal, toggleYearGoal, editYearGoal, removeYearGoal,
  addArea, editArea, removeArea, addHabitIdea, removeHabitIdea, areaLabel,
  MAX_AREAS, MAX_YEAR_GOALS, MAX_IDEAS, IDEA_FREQ,
} from '../core/years.js';
import { setViewMonth } from './month.js';
import { yearHeatmap } from '../core/stats.js';

const pctText = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
let viewYear = null;

// Barra horizontal accesible (el % va también en texto).
export function bar(p, label) {
  const w = p === null || p === undefined ? 0 : Math.round(p * 100);
  return h('span', { class: 'bar', role: 'img', 'aria-label': `${label}: ${pctText(p)}` }, h('i', { style: { width: `${w}%` } }));
}

export function renderYear(root, ctx) {
  const { state, today } = ctx;
  const years = knownYears(state, today);
  if (!viewYear || !years.includes(viewYear)) viewYear = today.slice(0, 4);
  const page = h('section', { class: 'page' });
  root.append(page);

  async function askText(title, { value = '', label = 'Texto', max = 120, placeholder = '' } = {}) {
    const input = h('input', { class: 'input', value, maxlength: max, placeholder, enterkeyhint: 'done' });
    const v = await modal({ title, body: field(label, input), actions: [{ label: 'Cancelar', value: null }, { label: 'Guardar', value: () => input.value, kind: 'primary' }] });
    return v === null ? null : String(v);
  }

  const run = (fn) => { try { fn(); ctx.save(); draw(); } catch (e) { toast(cap(e.message), { duration: 3500 }); } };

  async function newGoal(areaId) {
    const t = await askText('Nueva meta del año', { label: 'Meta', placeholder: 'Ej.: Correr una media maratón' });
    if (t !== null) run(() => addYearGoal(state, viewYear, areaId, t));
  }

  async function goalMenu(g) {
    const v = await modal({ title: 'Meta', body: h('p', {}, g.text), actions: [
      { label: 'Editar', value: 'edit' }, { label: 'Borrar', value: 'del', kind: 'danger' }, { label: 'Cerrar', value: null }] });
    if (v === 'edit') {
      const t = await askText('Editar meta', { value: g.text, label: 'Meta' });
      if (t !== null) run(() => editYearGoal(state, viewYear, g.id, t));
    } else if (v === 'del' && await confirmModal('Borrar meta', `"${g.text}"`, { ok: 'Borrar', danger: true })) {
      run(() => removeYearGoal(state, viewYear, g.id));
    }
  }

  async function newIdea(areaId) {
    const sel = h('select', { class: 'input' }, Object.entries(IDEA_FREQ).map(([k, v]) => h('option', { value: k }, v)));
    const input = h('input', { class: 'input', maxlength: 40, placeholder: 'Ej.: Dormir temprano' });
    const ok = await modal({ title: 'Hábito del plan anual', body: h('div', {},
      h('p', { class: 'muted small' }, 'Es una idea para el año. Se vuelve hábito real cuando la eliges en un cierre de mes.'),
      field('Hábito', input), field('Frecuencia', sel)),
    actions: [{ label: 'Cancelar', value: false }, { label: 'Agregar', value: true, kind: 'primary' }] });
    if (ok) run(() => addHabitIdea(state, viewYear, areaId, input.value, sel.value));
  }

  async function areaForm(area = null) {
    const name = h('input', { class: 'input', value: area?.name || '', maxlength: 30, placeholder: 'Ej.: Salud' });
    const emoji = h('input', { class: 'input', value: area?.emoji || '', maxlength: 8, placeholder: '🌱', style: { maxWidth: '90px' } });
    const actions = [{ label: 'Cancelar', value: null }];
    if (area) actions.push({ label: 'Borrar', value: 'del', kind: 'danger' });
    actions.push({ label: 'Guardar', value: 'save', kind: 'primary' });
    const v = await modal({ title: area ? 'Editar área' : 'Nueva área', body: h('div', { class: 'row' }, field('Emoji', emoji), field('Nombre', name)), actions });
    if (v === 'save') run(() => (area ? editArea(state, area.id, { name: name.value, emoji: emoji.value }) : addArea(state, { name: name.value, emoji: emoji.value })));
    if (v === 'del' && await confirmModal('Borrar área', `Se borran sus metas y su plan de hábitos de todos los años. Los hábitos del mes en curso quedan sin área.`, { ok: 'Borrar', danger: true })) {
      run(() => removeArea(state, area.id));
    }
  }

  function monthsBlock(ys) {
    const cur = monthKey(today);
    return h('div', { class: 'section' },
      h('h2', {}, 'Cumplimiento por mes'),
      h('ol', { class: 'ymonths' }, ys.months.map((m, i) => {
        const future = m.key > cur;
        const label = `${monthTitle(m.key)}${m.imported ? ' (importado)' : ''}`;
        return h('li', {}, h('button', {
          class: `ymonth${m.key === cur ? ' now' : ''}`, type: 'button', disabled: !m.exists || future,
          onClick: () => { setViewMonth(m.key); ctx.go('mes'); },
        },
        h('span', { class: 'ym-name' }, h('span', { 'aria-hidden': 'true' }, cap(MONTHS_SHORT[i])), h('span', { class: 'sr-only' }, label)),
        bar(m.exists && !future ? m.pct : null, label),
        h('span', { class: 'ym-pct' }, m.exists && !future ? pctText(m.pct) : h('span', {}, h('span', { 'aria-hidden': 'true' }, '·'), h('span', { class: 'sr-only' }, ': sin datos')))));
      })),
    );
  }

  // Mapa de calor: columnas = semanas (lunes arriba), color según % del día.
  function heatmap() {
    const days = yearHeatmap(state, viewYear, today);
    if (!days.some((d) => d.pct !== null || d.off)) return null;
    const C = 11, G = 2, first = mondayIndex(`${viewYear}-01-01`);
    const cols = Math.ceil((first + days.length) / 7);
    const W = cols * (C + G), H = 7 * (C + G);
    const lvl = (p) => (p === null ? 0 : p === 0 ? 1 : p < 0.34 ? 2 : p < 0.67 ? 3 : p < 1 ? 4 : 5);
    const cells = days.map((d, i) => {
      const idx = first + i;
      const label = `${formatShort(d.key)}: ${d.off ? 'día libre' : pctText(d.pct)}`;
      return svg('rect', { x: Math.floor(idx / 7) * (C + G), y: (idx % 7) * (C + G), width: C, height: C, rx: 2, class: `hm l${d.off ? 'off' : lvl(d.pct)}` }, svg('title', {}, label));
    });
    const withData = days.filter((d) => d.pct !== null);
    const full = withData.filter((d) => d.pct === 1).length;
    return h('div', { class: 'section' },
      h('h2', {}, 'Mapa del año'),
      h('div', { class: 'hm-wrap', tabindex: '0', role: 'group', 'aria-label': `Mapa de calor de ${viewYear}` }, svg('svg', { class: 'heatmap', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Mapa de calor de ${viewYear}: ${withData.length} días con datos, ${full} al 100 %` }, ...cells)),
      h('div', { class: 'hm-legend muted small', 'aria-hidden': 'true' }, 'Menos', [1, 2, 3, 4, 5].map((l) => h('i', { class: `hm-key l${l}` })), 'Más', h('i', { class: 'hm-key loff' }), 'Libre'));
  }

  function areaCard(a, ys) {
    const area = a.area;
    return h('div', { class: 'card area-card' },
      h('div', { class: 'area-head' },
        h('h3', {}, areaLabel(area)),
        a.total ? h('span', { class: 'muted small' }, `${a.done}/${a.total}`) : null,
        h('button', { class: 'linklike small', type: 'button', 'aria-label': `Editar área ${area.name}`, onClick: () => areaForm(area) }, 'Editar')),
      a.total ? bar(a.done / a.total, `Metas de ${area.name}`) : null,
      h('ul', { class: 'goals' }, a.goals.map((g) => h('li', { class: 'goal' },
        h('button', { class: 'gstate', type: 'button', 'aria-pressed': String(g.done), 'aria-label': `${g.text}: ${g.done ? 'cumplida' : 'pendiente'}. Tocar para cambiar.`,
          onClick: () => run(() => toggleYearGoal(state, viewYear, g.id)) },
        h('span', { class: `gbox${g.done ? ' yes' : ''}` }, g.done ? '✓' : '')),
        h('button', { class: 'gtext linklike-plain', type: 'button', onClick: () => goalMenu(g) }, g.text)))),
      a.total < MAX_YEAR_GOALS && h('button', { class: 'linklike small', type: 'button', onClick: () => newGoal(area.id) }, '+ Meta'),

      h('p', { class: 'field-label', style: { marginTop: '12px' } }, 'Plan de hábitos'),
      a.ideas.length
        ? h('div', { class: 'ideas' }, Object.entries(IDEA_FREQ).map(([f, label]) => {
          const list = a.ideas.filter((x) => x.freq === f);
          return list.length ? h('div', {}, h('span', { class: 'muted small' }, label), h('div', { class: 'chips' }, list.map((x) =>
            h('button', { class: 'chip', type: 'button', 'aria-label': `${x.text} (${label.toLowerCase()}). Tocar para quitar.`, onClick: async () => {
              if (await confirmModal('Quitar del plan', `"${x.text}"`, { ok: 'Quitar', danger: true })) run(() => removeHabitIdea(state, viewYear, x.id));
            } }, x.text)))) : null;
        }))
        : h('p', { class: 'muted small' }, 'Sin hábitos en el plan.'),
      a.ideas.length < MAX_IDEAS * 3 && h('button', { class: 'linklike small', type: 'button', onClick: () => newIdea(area.id) }, '+ Hábito al plan'),

      a.habits.length ? h('div', { style: { marginTop: '10px' } },
        h('p', { class: 'field-label' }, `Hábitos de ${monthTitle(ys.refKey)}`),
        h('ul', { class: 'list compact' }, a.habits.map((x) => h('li', {},
          h('span', { class: 'box full', 'data-c': x.habit.color, style: { width: '14px', height: '14px' } }),
          h('span', { class: 'grow' }, x.habit.name),
          h('b', {}, pctText(x.pct)),
          h('span', { class: 'muted small' }, `${x.done}/${x.expected}`))))) : null,
    );
  }

  function draw() {
    const ys = yearStats(state, viewYear, today);
    clear(page);
    page.append(
      h('div', { class: 'month-bar flat' },
        h('h1', {}, `Año ${viewYear}`),
        years.length > 1 && h('select', { class: 'input', 'aria-label': 'Año', onChange: (e) => { viewYear = e.target.value; draw(); } },
          years.map((y) => h('option', { value: y, selected: y === viewYear }, y)))),
      h('div', { class: 'stat-grid' },
        h('div', { class: 'stat' }, h('b', {}, pctText(ys.avgPct)), h('span', {}, 'Cumplimiento promedio de los meses')),
        h('div', { class: 'stat' }, h('b', {}, ys.goalsTotal ? `${ys.goalsDone}/${ys.goalsTotal}` : '—'), h('span', {}, 'Metas del año cumplidas'))),
      heatmap(),
      monthsBlock(ys),
      h('div', { class: 'section' },
        h('h2', {}, 'Metas por área'),
        h('p', { class: 'muted small' }, 'Toca la casilla para marcar una meta. Toca el texto para editarla. Vincula hábitos a un área desde Ajustes → Corregir.'),
        ys.areas.map((a) => areaCard(a, ys)),
        (state.areas || []).length < MAX_AREAS && h('button', { class: 'btn block', type: 'button', onClick: () => areaForm() }, '+ Nueva área')),
    );
  }
  draw();
}
