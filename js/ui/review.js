import { h, clear, toast, shareText, field } from './dom.js';
import { monthTitle, monthKey, WEEKDAYS } from '../core/dates.js';
import { monthStats, suggestDecision } from '../core/stats.js';
import { closeStatus, snoozeClose, applyClose, validateHabitList, MAX_HABITS, MAX_GOALS, newId } from '../core/months.js';
import { monthlySummary, DECISION_LABEL } from '../core/summary.js';
import { parseClaudeImport, describeProposal } from '../core/importer.js';
import { chartSvg } from './month.js';
import { habitForm } from './onboarding.js';

const pctText = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);
const SUGG_TEXT = { up: 'subir nivel (≥ 80 %)', keep: 'mantener (50-80 %)', down: 'bajar nivel (< 50 %)' };
const STEPS = 6;
let plan = null; // borrador del cierre en memoria

function blankHabit() {
  return { key: newId(), name: '', short: '', min: '', target: { type: 'daily' } };
}

function initPlan(state, key, today) {
  const m = state.months[key];
  const st = monthStats(m, today);
  const p = {
    key, step: 1, fromClaude: false, notes: '', mantra: '', goals: ['', '', ''], added: [],
    decisions: Object.fromEntries(m.habits.map((hb) => {
      const pct = st.perHabit[hb.id].pct;
      return [hb.id, { decision: 'keep', pct, suggested: suggestDecision(pct), min: hb.min, habit: null }];
    })),
  };
  const pi = state.meta.pendingImport;
  if (pi?.proposal) applyProposal(p, pi.proposal, m.habits);
  return p;
}

function applyProposal(p, prop, habits) {
  for (const e of prop.edits) {
    const d = p.decisions[e.habitId];
    if (!d) continue;
    if (e.min) d.min = e.min;
    if (e.name || e.short) d.edit = { name: e.name, short: e.short };
    d.claude = true;
  }
  const room = MAX_HABITS - habits.length;
  for (const a of prop.added.slice(0, Math.max(0, room))) p.added.push({ key: newId(), ...structuredClone(a), claude: true });
  if (prop.mantra !== undefined) p.mantra = prop.mantra;
  if (prop.goals) p.goals = [...prop.goals, '', '', ''].slice(0, MAX_GOALS);
  p.fromClaude = true;
}

// Hábitos resultantes (para validar el tope de 5 antes de crear el mes)
function resultingHabits(m, p) {
  const out = [];
  for (const hb of m.habits) {
    const d = p.decisions[hb.id];
    if (d.decision === 'remove') continue;
    if (d.decision === 'replace') out.push(d.habit || blankHabit());
    else out.push({ ...hb, min: d.min, ...(d.edit?.name ? { name: d.edit.name } : {}), ...(d.edit?.short ? { short: d.edit.short } : {}) });
  }
  return [...out, ...p.added].map((x) => ({ ...x, short: (x.short || '').toUpperCase() }));
}

export function renderReview(root, ctx) {
  const { state, today } = ctx;
  const cs = closeStatus(state, today);
  if (!cs) { ctx.go('hoy'); return; }
  if (!plan || plan.key !== cs.key) plan = initPlan(state, cs.key, today);
  const p = plan;
  const m = state.months[cs.key];
  const nextKey = monthKey(today);
  const page = h('section', { class: 'page' });
  root.append(page);

  const go = (n) => { p.step = n; draw(); window.scrollTo(0, 0); };
  const nav = (onNext, next = 'Siguiente') => h('div', { class: 'ob-nav' },
    p.step > 1 && h('button', { class: 'btn ghost', type: 'button', onClick: () => go(p.step - 1) }, 'Atrás'),
    h('button', { class: 'btn primary', type: 'button', onClick: () => { if (!onNext || onNext() !== false) go(p.step + 1); } }, next));

  function step1() {
    const st = monthStats(m, today);
    const lines = st.series.filter((s) => s.counts && m.days[s.key]?.note);
    return [
      h('h1', {}, `Cierre de ${monthTitle(m.key)}`),
      h('p', { class: 'muted' }, '5 minutos. Primero mira el mes completo.'),
      chartSvg(m, st, today),
      h('div', { class: 'stat-grid' },
        h('div', { class: 'stat' }, h('b', {}, pctText(st.pctRegistered)), h('span', {}, `Días registrados (${st.daysRegistered}/${st.daysElapsed})`)),
        h('div', { class: 'stat' }, h('b', {}, String(st.daysElapsed - st.daysRegistered)), h('span', {}, 'Días en blanco')),
        h('div', { class: 'stat' }, h('b', {}, st.bestDay ? `Día ${st.bestDay.day}` : '—'), h('span', {}, st.bestDay ? `Mejor día (${st.bestDay.score} hábitos)` : 'Mejor día')),
        h('div', { class: 'stat' }, h('b', {}, st.weakestWeekday === null ? '—' : WEEKDAYS[(st.weakestWeekday + 1) % 7]), h('span', {}, 'Día más flojo')),
      ),
      h('ul', { class: 'list' }, m.habits.map((hb) => {
        const s = st.perHabit[hb.id];
        return h('li', {}, h('span', { class: 'box full', 'data-c': hb.color, style: { width: '18px', height: '18px' } }), h('span', { class: 'grow' }, hb.name), h('b', {}, `${pctText(s.pct)}`), h('span', { class: 'muted small' }, `${s.done}/${s.expected}`));
      })),
      h('h2', { style: { marginTop: '18px' } }, 'Tus líneas del mes'),
      lines.length ? h('div', { class: 'reread' }, lines.map((s) => h('p', {}, h('b', {}, String(s.day)), m.days[s.key].note))) : h('p', { class: 'muted' }, 'No hay líneas este mes.'),
      nav(),
      cs.canSnooze && h('button', { class: 'linklike small', type: 'button', onClick: () => { snoozeClose(state, today); ctx.save(); toast('Mañana el cierre será obligatorio'); ctx.go('hoy'); } }, 'Cerrar después (solo hoy)'),
    ];
  }

  function step2() {
    const errBox = h('div');
    const total = resultingHabits(m, p).length;
    const pasteArea = h('textarea', { class: 'input mono', rows: 4, placeholder: 'Pega aquí el JSON "bitacora_import" que te dio Claude' });
    const pasteErr = h('div');
    const cards = m.habits.map((hb) => {
      const d = p.decisions[hb.id];
      const opts = ['keep', 'up', 'down', 'remove', 'replace'];
      const extra = [];
      if (d.decision === 'up' || d.decision === 'down' || d.min !== hb.min) {
        extra.push(field(d.decision === 'up' ? 'Nuevo mínimo (más exigente)' : d.decision === 'down' ? 'Nuevo mínimo (más simple)' : 'Mínimo', h('input', { class: 'input', value: d.min, maxlength: 80, onInput: (e) => { d.min = e.target.value; } })));
      }
      if (d.decision === 'replace') {
        d.habit ||= blankHabit();
        extra.push(habitForm(d.habit, null));
      }
      return h('div', { class: 'card' },
        h('div', { class: 'habit-head' }, h('span', { class: 'box full', 'data-c': hb.color, style: { width: '18px', height: '18px' } }), h('b', {}, hb.name), h('span', { class: 'pct' }, pctText(d.pct))),
        h('p', { class: 'sugg' }, `Sugerencia: ${SUGG_TEXT[d.suggested]}.${d.claude ? ' Incluye ajuste propuesto por Claude.' : ''}`),
        h('div', { class: 'seg' }, opts.map((o) => h('button', {
          type: 'button', 'aria-pressed': String(d.decision === o), class: o === d.suggested ? 'suggested' : '',
          disabled: o !== 'remove' && d.decision === 'remove' && total >= MAX_HABITS,
          onClick: () => { d.decision = o; draw(); },
        }, cap(DECISION_LABEL[o])))),
        ...extra);
    });
    return [
      h('h1', {}, 'Hábitos del mes nuevo'),
      h('p', { class: 'muted' }, `Las sugerencias salen del % de cumplimiento. Tú decides. Mes nuevo: ${total}/${MAX_HABITS} hábitos.`),
      ...cards,
      ...p.added.map((a, i) => h('div', {}, a.claude && h('p', { class: 'sugg' }, 'Propuesto por Claude'), habitForm(a, () => { p.added.splice(i, 1); draw(); }))),
      total < MAX_HABITS && h('button', { class: 'btn block', type: 'button', onClick: () => { p.added.push(blankHabit()); draw(); } }, '+ Agregar hábito'),
      h('details', { class: 'card', style: { marginTop: '12px' } }, h('summary', {}, 'Pegar ajustes de Claude'),
        pasteArea, pasteErr,
        h('button', { class: 'btn', type: 'button', style: { marginTop: '8px' }, onClick: () => {
          const r = parseClaudeImport(pasteArea.value, m.habits);
          clear(pasteErr);
          if (!r.ok) { pasteErr.append(...r.errors.map((e) => h('p', { class: 'err-text' }, cap(e)))); return; }
          applyProposal(p, r.proposal, m.habits);
          toast(`Propuesta aplicada: ${describeProposal(r.proposal, m.habits).length} cambios. Revísala.`);
          draw();
        } }, 'Validar y prellenar')),
      errBox,
      nav(() => {
        const list = resultingHabits(m, p);
        const errors = validateHabitList(list);
        if (!list.length) errors.push('el mes nuevo necesita al menos un hábito');
        clear(errBox);
        if (errors.length) { errBox.append(...errors.map((e) => h('p', { class: 'err-text' }, cap(e)))); return false; }
      }),
    ];
  }

  function step3() {
    const mark = (g, v) => () => { g.done = v; ctx.save(); draw(); };
    return [
      h('h1', {}, 'Objetivos'),
      m.goals.length ? h('div', {}, h('h2', {}, `Los de ${monthTitle(m.key)}`), m.goals.map((g) => h('div', { class: 'card' },
        h('p', {}, g.text),
        h('div', { class: 'seg' },
          h('button', { type: 'button', 'aria-pressed': String(g.done === true), onClick: mark(g, true) }, 'Cumplido'),
          h('button', { type: 'button', 'aria-pressed': String(g.done === false), onClick: mark(g, false) }, 'No cumplido'))))) : h('p', { class: 'muted' }, 'El mes que cierra no tenía objetivos.'),
      h('h2', { style: { marginTop: '18px' } }, `Para ${monthTitle(nextKey)} (0-3, opcional)`),
      ...p.goals.map((g, i) => field(`Objetivo ${i + 1}`, h('input', { class: 'input', value: g, maxlength: 80, onInput: (e) => { p.goals[i] = e.target.value; } }))),
      nav(),
    ];
  }

  function step4() {
    return [
      h('h1', {}, 'Mantra del mes nuevo'),
      field('Mantra (opcional)', h('input', { class: 'input', value: p.mantra, maxlength: 80, placeholder: m.mantra || 'Una línea', onInput: (e) => { p.mantra = e.target.value; } })),
      m.mantra && h('p', { class: 'muted small' }, `El anterior: "${m.mantra}"`),
      field('Notas del cierre (opcional)', h('textarea', { class: 'input', rows: 3, maxlength: 500, onInput: (e) => { p.notes = e.target.value; } }, p.notes)),
      nav(),
    ];
  }

  function summaryText() {
    const dec = Object.fromEntries(Object.entries(p.decisions).map(([id, d]) => [id, d.decision]));
    return monthlySummary(state, m.key, today, dec, { mantra: p.mantra.trim(), goals: p.goals.map((g) => g.trim()) });
  }

  function step5() {
    const text = summaryText();
    return [
      h('h1', {}, 'Resumen para Claude'),
      h('p', { class: 'muted' }, 'Pégalo en el chat con Claude. Si te devuelve un JSON, lo importas en Ajustes para el próximo cierre.'),
      h('pre', { class: 'copy-box mono' }, text),
      h('div', { class: 'stack' },
        h('button', { class: 'btn primary block', type: 'button', onClick: () => shareText(text, 'Resumen mensual') }, 'Compartir resumen'),
        h('button', { class: 'btn block', type: 'button', onClick: async () => { if (await ctx.exportBackup()) toast('Respaldo listo'); } }, 'Exportar respaldo (recomendado)')),
      nav(),
    ];
  }

  function step6() {
    const list = resultingHabits(m, p);
    return [
      h('h1', {}, `Listo para ${monthTitle(nextKey)}`),
      h('ul', { class: 'list' }, list.map((x) => h('li', {}, h('b', {}, x.short || '—'), h('span', { class: 'grow' }, x.name), h('span', { class: 'muted small' }, `Mín.: ${x.min}`)))),
      p.mantra.trim() && h('p', { class: 'mantra' }, `Mantra: ${p.mantra.trim()}`),
      h('p', { class: 'muted small' }, 'Antes de crear el mes guardo un respaldo interno.'),
      h('div', { class: 'ob-nav' },
        h('button', { class: 'btn ghost', type: 'button', onClick: () => go(5) }, 'Atrás'),
        h('button', { class: 'btn primary', type: 'button', onClick: create }, `Crear ${monthTitle(nextKey)}`)),
    ];
  }

  async function create() {
    const decisions = {};
    for (const [id, d] of Object.entries(p.decisions)) {
      decisions[id] = { decision: d.decision, pct: d.pct, min: d.min };
      if (d.decision === 'replace') decisions[id].habit = { ...d.habit, short: (d.habit.short || '').toUpperCase() };
      else if (d.edit) decisions[id].habit = d.edit;
    }
    try {
      await ctx.backup(`antes del cierre de ${m.key}`);
      const added = p.added.map((a) => ({ ...a, short: (a.short || '').toUpperCase() }));
      applyClose(state, m.key, {
        decisions, added,
        goalsResult: Object.fromEntries(m.goals.map((g) => [g.id, g.done])),
        mantra: p.mantra, goals: p.goals, notes: p.notes.trim(),
      }, today);
    } catch (e) {
      toast(cap(e.message), { duration: 4000 });
      return;
    }
    state.meta.pendingImport = null;
    await ctx.saveNow();
    plan = null;
    toast(`${cap(monthTitle(nextKey))} creado`);
    ctx.go('hoy');
  }

  function draw() {
    clear(page);
    page.append(
      h('div', { class: 'ob-count' }, `Paso ${p.step} de ${STEPS}`),
      h('div', { class: 'ob-progress' }, h('i', { style: { width: `${(p.step / STEPS) * 100}%` } })),
      ...[step1, step2, step3, step4, step5, step6][p.step - 1]().filter(Boolean),
    );
  }
  draw();
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
