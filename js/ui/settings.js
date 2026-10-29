import { h, clear, modal, confirmModal, toast, pickTextFile, shareText, field } from './dom.js';
import { todayKey, monthKey, monthTitle, WEEKDAYS, formatShort } from '../core/dates.js';
import { editHabitText, emergencyChange, emptyState, MAX_HABITS, MAX_SHORT, newId } from '../core/months.js';
import { validateBackup, describeReplace, parseClaudeImport, describeProposal } from '../core/importer.js';
import { weeklySummary } from '../core/summary.js';
import { LINE_MODES, reminderBlock, habitForm } from './onboarding.js';
import * as store from '../store.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const errList = (errors) => h('ul', { class: 'rules' }, errors.map((e) => h('li', { class: 'err-text' }, cap(e))));

export function renderSettings(root, ctx) {
  const { state, today } = ctx;
  const page = h('section', { class: 'page' });
  root.append(page);
  const prof = state.profile;
  const mk = monthKey(today);
  const month = state.months[mk];
  const set = (fn) => (e) => { fn(e.target.value); ctx.save(); };

  async function editHabit(hb) {
    const name = h('input', { class: 'input', value: hb.name, maxlength: 40 });
    const short = h('input', { class: 'input', value: hb.short, maxlength: MAX_SHORT, autocapitalize: 'characters' });
    const min = h('input', { class: 'input', value: hb.min, maxlength: 80 });
    const ok = await modal({
      title: 'Corregir hábito',
      body: h('div', {}, h('p', { class: 'muted small' }, 'Solo corrige el texto. Para cambiar el hábito, espera al cierre.'),
        field('Nombre', name), field(`Etiqueta (≤ ${MAX_SHORT})`, short), field('Versión mínima', min)),
      actions: [{ label: 'Cancelar', value: false }, { label: 'Guardar', value: true, kind: 'primary' }],
    });
    if (!ok) return;
    try { editHabitText(state, mk, hb.id, { name: name.value, short: short.value, min: min.value }); } catch (e) { toast(cap(e.message), { duration: 3500 }); return; }
    ctx.save();
    draw();
  }

  async function emergency() {
    const remove = new Set();
    const add = [];
    const reason = h('input', { class: 'input', maxlength: 120, placeholder: 'Ej.: lesión en la rodilla' });
    const addBox = h('div');
    const errBox = h('div');
    const addBtn = h('button', { class: 'btn block', type: 'button', onClick: () => {
      if (month.habits.length - remove.size + add.length >= MAX_HABITS) { toast(`Tope de ${MAX_HABITS} hábitos`); return; }
      const x = { key: newId(), name: '', short: '', min: '', target: { type: 'daily' } };
      add.push(x);
      addBox.append(habitForm(x, null));
    } }, '+ Agregar hábito');
    const body = h('div', {},
      h('p', { class: 'muted small' }, 'Úsalo solo si algo cambió de verdad. Queda anotado en el cierre del mes.'),
      h('p', { class: 'field-label' }, 'Quitar'),
      h('div', { class: 'chips' }, month.habits.map((hb) => h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onClick: (e) => {
        if (remove.has(hb.id)) remove.delete(hb.id); else remove.add(hb.id);
        e.currentTarget.setAttribute('aria-pressed', String(remove.has(hb.id)));
      } }, hb.short))),
      addBox, addBtn, field('Motivo (obligatorio)', reason), errBox);
    for (;;) {
      const ok = await modal({ title: 'Cambio de emergencia', body, actions: [{ label: 'Cancelar', value: false }, { label: 'Aplicar', value: true, kind: 'danger' }] });
      if (!ok) return;
      try {
        emergencyChange(state, mk, { remove: [...remove], add: add.map((a) => ({ ...a, short: (a.short || '').toUpperCase() })) }, reason.value);
        ctx.save();
        toast('Cambio aplicado y anotado');
        draw();
        return;
      } catch (e) {
        clear(errBox).append(h('p', { class: 'err-text' }, cap(e.message)));
      }
    }
  }

  async function importBackup() {
    const text = await pickTextFile();
    if (!text) return;
    const r = validateBackup(text);
    if (!r.ok) { await modal({ title: 'Respaldo no válido', body: errList(r.errors) }); return; }
    const ok = await confirmModal('Importar respaldo', h('div', {}, h('p', {}, 'Esto reemplaza todos los datos actuales. Antes guardo un respaldo interno.'), h('ul', { class: 'rules' }, describeReplace(state, r.state).map((l) => h('li', {}, l)))), { ok: 'Reemplazar', danger: true });
    if (!ok) return;
    await ctx.backup('antes de importar respaldo');
    await ctx.replaceState(r.state);
    toast('Respaldo importado');
  }

  async function restoreInternal() {
    const list = await store.listBackups();
    if (!list.length) { toast('No hay respaldos internos aún'); return; }
    const choice = await modal({
      title: 'Respaldos internos',
      body: h('p', { class: 'muted small' }, 'Se guardan solos antes de cierres, importaciones y borrados (últimos 5).'),
      actions: [...list.map((b) => ({ label: `${formatShort(todayKey(new Date(b.at)))} · ${b.reason}`, value: b.id })), { label: 'Cancelar', value: null }],
    });
    if (!choice) return;
    const b = list.find((x) => x.id === choice);
    const r = validateBackup(b.state);
    if (!r.ok) { await modal({ title: 'Respaldo dañado', body: errList(r.errors) }); return; }
    if (!(await confirmModal('Restaurar', h('ul', { class: 'rules' }, describeReplace(state, r.state).map((l) => h('li', {}, l))), { ok: 'Restaurar', danger: true }))) return;
    await ctx.backup('antes de restaurar');
    await ctx.replaceState(r.state);
    toast('Restaurado');
  }

  async function importClaude() {
    const ta = h('textarea', { class: 'input mono', rows: 7, placeholder: '{ "bitacora_import": 1, … }' });
    const errBox = h('div');
    for (;;) {
      const ok = await modal({
        title: 'Importar ajustes de Claude',
        body: h('div', {}, h('p', { class: 'muted small' }, `Se guardan como propuesta para el cierre de ${monthTitle(mk)}. No cambian el mes en curso.`), ta, errBox),
        actions: [{ label: 'Cancelar', value: false }, { label: 'Validar', value: true, kind: 'primary' }],
      });
      if (!ok) return;
      const r = parseClaudeImport(ta.value, month.habits);
      if (!r.ok) { clear(errBox).append(errList(r.errors)); continue; }
      const yes = await confirmModal('Propuesta para el cierre', h('ul', { class: 'rules' }, describeProposal(r.proposal, month.habits).map((l) => h('li', {}, l))), { ok: 'Guardar propuesta' });
      if (!yes) return;
      state.meta.pendingImport = { at: new Date().toISOString(), forMonth: mk, proposal: r.proposal };
      ctx.save();
      toast('Propuesta guardada para el cierre');
      draw();
      return;
    }
  }

  async function wipe() {
    if (!(await confirmModal('Borrar todo', 'Primero exporto un respaldo. Después se borran todos los datos de este iPhone.', { ok: 'Exportar y seguir', danger: true }))) return;
    if (!(await ctx.exportBackup())) { toast('Sin respaldo no borro nada'); return; }
    if (!(await confirmModal('¿Seguro?', 'Esto no se puede deshacer. Tus datos quedan solo en el archivo que exportaste.', { ok: 'Borrar todo', danger: true }))) return;
    await store.clearAll();
    await ctx.replaceState(emptyState());
    ctx.go('onboarding');
  }

  function draw() {
    clear(page);
    const acc = prof.accountability;
    const pi = state.meta.pendingImport;
    const persist = state.meta.persistGranted;
    page.append(...[
      h('h1', {}, 'Ajustes'),

      h('div', { class: 'section' }, h('h2', {}, 'Perfil'),
        field('Nombre', h('input', { class: 'input', value: prof.name, maxlength: 40, onInput: set((v) => { prof.name = v; }) })),
        field('Ancla', h('input', { class: 'input', value: prof.anchor, maxlength: 60, onInput: set((v) => { prof.anchor = v; }) })),
        field('Hora aproximada', h('input', { class: 'input', type: 'time', value: prof.reminderTime, onInput: set((v) => { prof.reminderTime = v; }) })),
        field('Línea del día', h('select', { class: 'input', onChange: set((v) => { prof.lineMode = v; }) },
          Object.entries(LINE_MODES).map(([k, v]) => h('option', { value: k, selected: prof.lineMode === k }, v.label)))),
        field('Resumen semanal para', h('select', { class: 'input', onChange: (e) => { acc.to = e.target.value; ctx.save(); draw(); } },
          h('option', { value: 'claude', selected: acc.to === 'claude' }, 'Claude'), h('option', { value: 'persona', selected: acc.to === 'persona' }, 'Una persona'))),
        acc.to === 'persona' && field('¿Quién?', h('input', { class: 'input', value: acc.personName, maxlength: 40, onInput: set((v) => { acc.personName = v; }) })),
        field('Día del resumen', h('select', { class: 'input', onChange: set((v) => { acc.weekday = Number(v); }) },
          [1, 2, 3, 4, 5, 6, 0].map((w) => h('option', { value: w, selected: acc.weekday === w }, cap(WEEKDAYS[w]))))),
        h('button', { class: 'btn block', type: 'button', onClick: () => { try { shareText(weeklySummary(state, today), 'Resumen semanal'); } catch (e) { toast(e.message); } } }, 'Generar resumen semanal ahora'),
      ),

      month && h('div', { class: 'section' }, h('h2', {}, `Hábitos de ${monthTitle(mk)}`),
        h('ul', { class: 'list' }, month.habits.map((hb) => h('li', {},
          h('span', { class: 'box full', 'data-c': hb.color, style: { width: '18px', height: '18px' } }),
          h('span', { class: 'grow' }, h('b', {}, hb.short), ` ${hb.name}`, h('br'), h('span', { class: 'muted small' }, `Mín.: ${hb.min}`)),
          h('button', { class: 'btn', type: 'button', onClick: () => editHabit(hb) }, 'Corregir')))),
        h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'Agregar o quitar hábitos se hace en el cierre de mes.'),
        !month.review && h('button', { class: 'linklike small', type: 'button', onClick: emergency }, 'Cambio de emergencia'),
      ),

      h('div', { class: 'section' }, h('h2', {}, 'Datos'),
        h('p', { class: 'muted small' }, state.meta.lastBackupAt ? `Último respaldo: ${formatShort(state.meta.lastBackupAt.slice(0, 10))}.` : 'Aún no hay respaldo exportado.'),
        h('div', { class: 'stack' },
          h('button', { class: 'btn primary block', type: 'button', onClick: async () => { if (await ctx.exportBackup()) { toast('Respaldo listo'); draw(); } } }, 'Exportar respaldo'),
          h('button', { class: 'btn block', type: 'button', onClick: importBackup }, 'Importar respaldo'),
          h('button', { class: 'btn block', type: 'button', onClick: restoreInternal }, 'Respaldos internos'),
          h('button', { class: 'btn block', type: 'button', onClick: importClaude }, 'Importar ajustes de Claude'),
        ),
        pi && h('div', { class: 'note', style: { marginTop: '10px' } },
          h('p', {}, `Propuesta de Claude guardada para el próximo cierre (${describeProposal(pi.proposal, month?.habits || []).length} cambios).`),
          h('button', { class: 'linklike small', type: 'button', onClick: () => { state.meta.pendingImport = null; ctx.save(); draw(); } }, 'Descartar propuesta')),
        h('p', { class: 'muted small', style: { marginTop: '10px' } },
          persist === true ? 'Almacenamiento persistente: concedido.' : persist === false ? 'Almacenamiento persistente: no concedido. Exporta respaldos seguido.' : 'Almacenamiento persistente: sin confirmar.'),
      ),

      h('div', { class: 'section' }, h('h2', {}, 'Recordatorio diario'), reminderBlock(prof)),

      h('div', { class: 'section' }, h('h2', {}, 'App'),
        h('p', { class: 'muted' }, `Versión ${ctx.version}${ctx.debug ? ' · modo debug' : ''}`),
        h('div', { class: 'stack' },
          h('button', { class: 'btn block', type: 'button', onClick: ctx.checkForUpdate }, 'Buscar actualización'),
          h('button', { class: 'btn danger block', type: 'button', onClick: wipe }, 'Borrar todo')),
      ),
    ].filter(Boolean));
  }
  draw();
}
