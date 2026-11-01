// Campos opcionales de rutina de un hábito (puntualidad): momento, "cuando…", premio, apilado,
// ícono, días fijos y color. Muta `x`. Se usa al corregir un hábito, en el onboarding y en el cierre.
import { h, field } from './dom.js';
import { COLORS } from '../core/months.js';
import { WHEN_LABEL, WHEN_ICON } from '../core/routine.js';
import { WEEK_LETTERS } from '../core/dates.js';

// WEEK_LETTERS va de lunes (0) a domingo (6); el modelo usa 0 = domingo.
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function routineFields(x, others = [], { colors = true } = {}) {
  const seg = (opts, get, set) => h('div', { class: 'seg', role: 'group' }, opts.map(([v, label]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(get() === v), onClick: () => {
      set(get() === v ? null : v);
      b.parentElement.querySelectorAll('button').forEach((o, i) => o.setAttribute('aria-pressed', String(get() === opts[i][0])));
    } }, label);
    return b;
  }));
  const text = (key, ph) => h('input', { class: 'input', value: x[key] || '', maxlength: 80, placeholder: ph, onInput: (e) => { x[key] = e.target.value; } });
  const days = new Set(x.days || []);
  const dayChips = h('div', { class: 'chips wd-chips', role: 'group', 'aria-label': 'Días fijos' }, WD_ORDER.map((wd, i) => {
    const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(days.has(wd)), 'aria-label': ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i], onClick: () => {
      if (days.has(wd)) days.delete(wd); else days.add(wd);
      x.days = [...days];
      b.setAttribute('aria-pressed', String(days.has(wd)));
    } }, WEEK_LETTERS[i]);
    return b;
  }));
  const swatches = colors && h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' }, COLORS.map((c) => {
    const b = h('button', { class: 'swatch', type: 'button', role: 'radio', 'data-c': c, 'aria-checked': String(x.color === c), 'aria-pressed': String(x.color === c), 'aria-label': `Color ${c.slice(1)}`, onClick: () => {
      x.color = c;
      b.parentElement.querySelectorAll('.swatch').forEach((o) => { const on = o.dataset.c === c; o.setAttribute('aria-pressed', String(on)); o.setAttribute('aria-checked', String(on)); });
    } });
    return b;
  }));
  const afterSel = others.length ? h('select', { class: 'input', onChange: (e) => { x.after = e.target.value || null; } },
    h('option', { value: '', selected: !x.after }, 'Ninguno'),
    others.map((o) => h('option', { value: o.id, selected: x.after === o.id }, o.name))) : null;
  return h('div', { class: 'routine-fields' },
    field('Momento del día', seg(Object.entries(WHEN_LABEL).map(([k, v]) => [k, `${WHEN_ICON[k]} ${v}`]), () => x.when || null, (v) => { x.when = v; }),
      'Ordena Hoy: lo de esta franja queda arriba. Si no eliges, la app lo aprende de tu hora real.'),
    field('Cuando… (tu señal)', text('cue', 'Ej.: después del café'), 'Plan "cuándo-dónde": está entre lo que más ayuda a cumplir.'),
    afterSel && field('Va después de', afterSel, 'Apilar: al marcar ese hábito, este se resalta como siguiente.'),
    field('Solo mientras… (premio)', text('bundle', 'Ej.: escucho mi podcast'), 'Algo que disfrutas y te guardas para este hábito.'),
    field('Días fijos (opcional)', dayChips, 'Los otros días aparece como "Hoy no toca".'),
    field('Ícono (opcional)', h('input', { class: 'input', value: x.icon || '', maxlength: 8, placeholder: '📖', style: { maxWidth: '96px' }, onInput: (e) => { x.icon = e.target.value; } })),
    swatches && field('Color', swatches));
}
