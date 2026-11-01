import { h, clear, modal, confirmModal, toast, pickTextFile, pickFiles, shareText, field } from './dom.js';
import { todayKey, monthKey, monthTitle, WEEKDAYS, formatShort } from '../core/dates.js';
import { parseCsv, readXlsx, planImport, applyImport, defaultSelection, describePlanMonth, YEAR_SOURCE_LABEL } from '../core/sheets.js';
import { areaLabel, areaById } from '../core/years.js';
import { gameStats, seenFrom } from '../core/game.js';
import { editHabitText, emergencyChange, emptyState, MAX_HABITS, MAX_SHORT, newId } from '../core/months.js';
import { validateBackup, describeReplace, parseClaudeImport, describeProposal } from '../core/importer.js';
import { weeklySummary } from '../core/summary.js';
import { LINE_MODES, reminderBlock, habitForm } from './onboarding.js';
import { routineFields } from './habitextras.js';
import { friendly } from './errors.js';
import { reminderSuggestion, inSeason } from '../core/routine.js';
import { addDays, formatLong } from '../core/dates.js';
import { DEFAULT_PREFS } from '../core/migrate.js';
import { exportCsv } from './export.js';
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
    const note = h('input', { class: 'input', value: hb.note || '', maxlength: 140, placeholder: 'Ej.: después del almuerzo' });
    const area = h('select', { class: 'input' }, h('option', { value: '', selected: !hb.area }, 'Sin área'),
      (state.areas || []).map((a) => h('option', { value: a.id, selected: hb.area === a.id }, areaLabel(a))));
    const extra = { when: hb.when || null, cue: hb.cue || '', bundle: hb.bundle || '', after: hb.after || null, icon: hb.icon || '', days: hb.days || [], color: hb.color };
    const ok = await modal({
      title: 'Hábito',
      body: h('div', {}, h('p', { class: 'muted small' }, 'Corrige el texto y ajusta tu rutina. Para cambiar el hábito, espera al cierre.'),
        field('Nombre', name), field(`Etiqueta (≤ ${MAX_SHORT})`, short), field('Versión mínima', min),
        field('Área de vida', area), field('Nota (opcional)', note),
        h('h3', { style: { marginTop: '16px' } }, 'Rutina y puntualidad'),
        routineFields(extra, month.habits.filter((x) => x.id !== hb.id))),
      actions: [{ label: 'Cancelar', value: false }, { label: 'Guardar', value: true, kind: 'primary' }],
    });
    if (!ok) return;
    try {
      editHabitText(state, mk, hb.id, { name: name.value, short: short.value, min: min.value, area: area.value || null, note: note.value, ...extra, color: extra.color });
    } catch (e) { toast(friendly(e), { duration: 3500 }); return; }
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
        clear(errBox).append(h('p', { class: 'err-text' }, friendly(e)));
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
      const r = parseClaudeImport(ta.value, month.habits, state.areas);
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

  async function importSheets() {
    const files = await pickFiles('.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (!files.length) return;
    let sources = [];
    try {
      for (const f of files) {
        if (f.buffer) sources.push(...(await readXlsx(f.buffer)));
        else sources.push({ name: f.name, rows: parseCsv(f.text) });
      }
    } catch (e) { await modal({ title: 'No pude leer el archivo', body: cap(e.message) }); return; }
    const plan = planImport(state, sources, today);
    const usable = plan.months.filter((m) => m.status === 'new' || m.status === 'merge');
    if (!usable.length && !plan.goals) {
      await modal({ title: 'Nada para importar', body: h('div', {},
        h('p', {}, 'No encontré pestañas de meses con marcas ni una pestaña de metas.'),
        plan.months.length ? h('ul', { class: 'rules' }, plan.months.map((m) => h('li', {}, describePlanMonth(m)))) : null) });
      return;
    }
    const goalsYear = h('select', { class: 'input' }, [Number(today.slice(0, 4)), Number(today.slice(0, 4)) - 1].map((y) => {
      const sheetYear = plan.months.length ? Math.max(...plan.months.filter((m) => m.total).map((m) => m.year), 0) : 0;
      return h('option', { value: String(y), selected: y === (sheetYear || Number(today.slice(0, 4))) }, String(y));
    }));
    const importGoals = h('input', { type: 'checkbox', checked: !!plan.goals });
    const errBox = h('div');

    const monthCard = (pm) => {
      const box = h('div', { class: 'card' });
      const yearSel = h('select', { class: 'input', 'aria-label': 'Año del mes', onChange: () => {
        pm.year = Number(yearSel.value);
        pm.key = `${pm.year}-${String(pm.month).padStart(2, '0')}`;
        const ex = state.months[pm.key];
        pm.status = pm.key > monthKey(today) ? 'future' : !pm.total ? 'empty' : !ex ? 'new' : ex.review ? 'closed' : 'merge';
        pm.selected = defaultSelection(state, pm);
        draw();
      } }, [0, 1, 2].map((d) => Number(today.slice(0, 4)) - d).map((y) => h('option', { value: y, selected: y === pm.year }, String(y))));
      const draw = () => {
        clear(box);
        const can = pm.status === 'new' || pm.status === 'merge';
        box.append(...[
          h('p', {}, h('b', {}, describePlanMonth(pm))),
          h('div', { class: 'row' }, field(`Año (${YEAR_SOURCE_LABEL[pm.yearSource] || ''})`, yearSel)),
          can && h('p', { class: 'muted small' }, pm.status === 'new'
            ? `Elige hasta ${MAX_HABITS} hábitos. Los demás con marcas quedan en "Otros hábitos registrados".`
            : 'Solo se suman los que se llaman igual que un hábito del mes. Los demás quedan en "Otros hábitos registrados".'),
          can && h('div', { class: 'chips' }, pm.habits.filter((x) => x.count > 0).map((x) => h('button', {
            class: 'chip', type: 'button', 'aria-pressed': String(pm.selected.includes(x.name)),
            disabled: pm.status === 'merge' && !defaultSelection(state, pm).includes(x.name),
            onClick: () => {
              if (pm.selected.includes(x.name)) pm.selected = pm.selected.filter((n) => n !== x.name);
              else if (pm.selected.length < MAX_HABITS) pm.selected.push(x.name);
              else { toast(`Tope de ${MAX_HABITS} hábitos por mes`); return; }
              draw();
            },
          }, `${x.name} · ${x.count}`))),
        ].filter(Boolean));
      };
      draw();
      return box;
    };

    const body = h('div', {},
      h('p', { class: 'muted small' }, 'Antes de importar guardo un respaldo interno. Los meses que no existen en la app entran como historial cerrado; el mes en curso solo suma marcas.'),
      plan.months.map(monthCard),
      plan.goals && h('div', { class: 'card' },
        h('p', {}, h('b', {}, `Pestaña de metas: ${plan.goals.length} áreas, ${plan.goals.reduce((n, g) => n + g.goals.length, 0)} metas, ${plan.goals.reduce((n, g) => n + (g.ideas?.length || 0), 0)} hábitos del plan`)),
        h('label', { class: 'check-line' }, importGoals, h('span', {}, 'Importar metas y plan de hábitos')),
        field('Año de las metas', goalsYear)),
      plan.skipped.length ? h('p', { class: 'muted small' }, `Sin datos reconocibles: ${plan.skipped.join(', ')}.`) : null,
      errBox);
    for (;;) {
      const ok = await modal({ title: 'Importar desde Google Sheets', body, actions: [{ label: 'Cancelar', value: false }, { label: 'Importar', value: true, kind: 'primary' }] });
      if (!ok) return;
      try {
        await ctx.backup('antes de importar de Sheets');
        const draft = structuredClone(state);
        const res = applyImport(draft, plan, { goalsYear: importGoals.checked ? goalsYear.value : null });
        Object.assign(state, draft);
        await ctx.saveNow();
        const parts = [];
        if (res.created.length) parts.push(`${res.created.length} meses de historial`);
        const merged = res.merged.reduce((n, x) => n + x.checks, 0);
        if (res.merged.length) parts.push(`${merged} marcas sumadas`);
        if (res.goals) parts.push(`${res.goals} metas`);
        if (res.ideas) parts.push(`${res.ideas} hábitos al plan`);
        if (res.areas) parts.push(`${res.areas} áreas nuevas`);
        toast(parts.length ? `Importado: ${parts.join(', ')}` : 'No había nada nuevo', { duration: 4500 });
        draw();
        return;
      } catch (e) {
        clear(errBox).append(h('p', { class: 'err-text' }, cap(e.message)));
      }
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

  const prefs = () => (state.meta.prefs ||= structuredClone(DEFAULT_PREFS));
  const setPref = (k, v, rerender = true) => { prefs()[k] = v; ctx.save(); if (rerender) ctx.render(); };
  const segPref = (k, opts) => h('div', { class: 'seg', role: 'group' }, opts.map(([v, label]) =>
    h('button', { type: 'button', 'aria-pressed': String((prefs()[k] ?? DEFAULT_PREFS[k]) === v), onClick: () => setPref(k, v) }, label)));
  const checkPref = (k, label, hint) => h('div', {}, h('label', { class: 'check-line' },
    h('input', { type: 'checkbox', checked: !!prefs()[k], onChange: (e) => setPref(k, e.target.checked) }), h('span', {}, label)),
    hint ? h('p', { class: 'field-hint', style: { margin: '-6px 0 8px 32px' } }, hint) : null);
  // Grupo plegable; recuerda cuál dejaste abierto (solo en este teléfono).
  const openKey = 'ajustes-abierto';
  const isOpen = (id) => { try { return (localStorage.getItem(openKey) || 'rutina') === id; } catch { return id === 'rutina'; } };
  const group = (id, title, hint, ...body) => h('details', { class: 'group', open: isOpen(id), onToggle: (e) => { if (e.target.open) { try { localStorage.setItem(openKey, id); } catch { /* sin almacenamiento */ } } } },
    h('summary', {}, title, hint ? h('span', { class: 'group-hint' }, hint) : null),
    h('div', { class: 'group-body' }, ...body.flat().filter(Boolean)));

  function seasonBlock() {
    const on = inSeason(state, today);
    if (on) {
      return h('div', { class: 'note' }, h('p', {}, `Temporada ligera hasta el ${formatLong(state.meta.season.until).toLowerCase()}. El mínimo basta y Hoy lo muestra primero.`),
        h('button', { class: 'linklike small', type: 'button', onClick: () => { state.meta.season = null; ctx.save(); draw(); } }, 'Terminar ahora'));
    }
    return h('div', {},
      h('p', { class: 'muted small' }, 'Para viajes, exámenes o enfermedad: por unos días el mínimo es la meta. No cambia tus hábitos.'),
      h('div', { class: 'seg' }, [7, 14, 30].map((n) => h('button', { type: 'button', onClick: () => {
        state.meta.season = { since: today, until: addDays(today, n - 1) };
        if (month && !month.review) month.changeLog.push({ at: new Date().toISOString(), text: `Temporada ligera de ${n} días (hasta ${addDays(today, n - 1)})` });
        ctx.save(); toast(`Temporada ligera por ${n} días`); draw();
      } }, `${n} días`))));
  }

  function suggestionCard() {
    const sg = reminderSuggestion(state, today);
    if (!sg) return null;
    return h('div', { class: 'card suggest-card' },
      h('p', {}, `Tu primer registro suele ser a las ${sg.hm} (últimos ${sg.n} días). El recordatorio está a las ${prof.reminderTime}.`),
      h('button', { class: 'btn small-btn', type: 'button', onClick: () => { prof.reminderTime = sg.hm; ctx.save(); toast(`Recordatorio: ${sg.hm}. Cámbialo también en la app Recordatorios.`, { duration: 4500 }); draw(); } }, `Usar ${sg.hm}`));
  }

  function draw() {
    clear(page);
    const acc = prof.accountability;
    const pi = state.meta.pendingImport;
    const persist = state.meta.persistGranted;
    const P = prefs();
    const offDays = new Set(P.offDays || []);
    page.append(...[
      h('h1', {}, 'Ajustes'),

      group('rutina', 'Mi rutina', 'hábitos, horario, días libres',
        month && h('div', { class: 'section' }, h('h2', {}, `Hábitos de ${monthTitle(mk)}`),
          h('ul', { class: 'list' }, month.habits.map((hb) => h('li', {},
            h('span', { class: 'box full', 'data-c': hb.color, style: { width: '18px', height: '18px' } }),
            h('span', { class: 'grow' }, h('b', {}, hb.icon ? `${hb.icon} ` : '', hb.short), ` ${hb.name}`, h('br'),
              h('span', { class: 'muted small' }, `Mín.: ${hb.min}${hb.cue ? ` · Cuando: ${hb.cue}` : ''}${hb.area && areaById(state, hb.area) ? ` · ${areaLabel(areaById(state, hb.area))}` : ''}`)),
            h('button', { class: 'btn', type: 'button', onClick: () => editHabit(hb) }, 'Ajustar')))),
          h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'Agregar o quitar hábitos se hace en el cierre de mes.'),
          !month.review && h('button', { class: 'linklike small', type: 'button', onClick: emergency }, 'Cambio de emergencia')),
        suggestionCard(),
        field('Ancla (después de qué registras)', h('input', { class: 'input', value: prof.anchor, maxlength: 60, onInput: set((v) => { prof.anchor = v; }) })),
        field('Hora del recordatorio', h('input', { class: 'input', type: 'time', value: prof.reminderTime, onInput: set((v) => { prof.reminderTime = v; }) })),
        field('Orden de Hoy', segPref('order', [['smart', 'Por momento del día'], ['manual', 'Fijo']]), 'Por momento: lo que toca ahora queda arriba y lo hecho baja.'),
        field('Días libres fijos', h('div', { class: 'chips wd-chips' }, [1, 2, 3, 4, 5, 6, 0].map((wd) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(offDays.has(wd)), 'aria-label': WEEKDAYS[wd], onClick: () => {
          if (offDays.has(wd)) offDays.delete(wd); else offDays.add(wd);
          setPref('offDays', [...offDays].sort(), false); draw();
        } }, cap(WEEKDAYS[wd]).slice(0, 2)))), 'Ese día se marca solo como libre al abrir la app (lo puedes quitar).'),
        h('h3', {}, 'Temporada ligera'), seasonBlock(),
        h('h3', { style: { marginTop: '18px' } }, 'Recordatorio diario'), reminderBlock(prof, month?.habits || [])),

      group('perfil', 'Perfil y resumen', 'nombre, línea, rendición',
        field('Nombre', h('input', { class: 'input', value: prof.name, maxlength: 40, onInput: set((v) => { prof.name = v; }) })),
        field('Línea del día', h('select', { class: 'input', onChange: set((v) => { prof.lineMode = v; }) },
          Object.entries(LINE_MODES).map(([k, v]) => h('option', { value: k, selected: prof.lineMode === k }, v.label)))),
        field('Resumen semanal para', h('select', { class: 'input', onChange: (e) => { acc.to = e.target.value; ctx.save(); draw(); } },
          h('option', { value: 'claude', selected: acc.to === 'claude' }, 'Claude'), h('option', { value: 'persona', selected: acc.to === 'persona' }, 'Una persona'))),
        acc.to === 'persona' && field('¿Quién?', h('input', { class: 'input', value: acc.personName, maxlength: 40, onInput: set((v) => { acc.personName = v; }) })),
        field('Día del resumen', h('select', { class: 'input', onChange: set((v) => { acc.weekday = Number(v); }) },
          [1, 2, 3, 4, 5, 6, 0].map((w) => h('option', { value: w, selected: acc.weekday === w }, cap(WEEKDAYS[w]))))),
        h('button', { class: 'btn block', type: 'button', onClick: () => { try { shareText(weeklySummary(state, today), 'Resumen semanal'); } catch (e) { toast(friendly(e)); } } }, 'Generar resumen semanal ahora')),

      group('apariencia', 'Apariencia', 'papel, tamaño, sonido',
        field('Papel', segPref('paper', [['grid', 'Cuadriculado'], ['lines', 'Rayado'], ['dots', 'Punteado'], ['plain', 'Liso']])),
        field('Tono', segPref('tone', [['cream', 'Crema'], ['white', 'Blanco'], ['gray', 'Gris']])),
        field('Tamaño del texto', segPref('size', [['m', 'Normal'], ['l', 'Grande'], ['xl', 'Muy grande']])),
        field('Hoy', segPref('density', [['comfy', 'Cómodo'], ['compact', 'Compacto']])),
        field('Abrir en', segPref('startTab', [['hoy', 'Hoy'], ['mes', 'Mes'], ...(state.meta.game?.enabled ? [['sistema', 'Sistema']] : [])])),
        checkPref('nightWarm', 'Noche cálida (21:00–6:00)', 'Menos azul en la noche.'),
        checkPref('areaAccent', 'Color del mes según tu área más trabajada'),
        checkPref('sound', 'Sonido de lápiz al marcar')),

      group('datos', 'Mis datos', state.meta.lastBackupAt ? `respaldo ${formatShort(state.meta.lastBackupAt.slice(0, 10))}` : 'sin respaldo',
        h('div', { class: 'stack' },
          h('button', { class: 'btn primary block', type: 'button', onClick: async () => { if (await ctx.exportBackup()) { toast('Respaldo listo'); draw(); } } }, 'Exportar respaldo'),
          h('button', { class: 'btn block', type: 'button', onClick: importBackup }, 'Importar respaldo'),
          h('button', { class: 'btn block', type: 'button', onClick: restoreInternal }, 'Respaldos internos'),
          h('button', { class: 'btn block', type: 'button', onClick: () => exportCsv(state, today) }, 'Exportar a hoja de cálculo (CSV)'),
          h('button', { class: 'btn block', type: 'button', onClick: importSheets }, 'Importar desde Google Sheets'),
          h('button', { class: 'btn block', type: 'button', onClick: importClaude }, 'Importar ajustes de Claude')),
        h('p', { class: 'muted small', style: { marginTop: '10px' } }, 'Sheets: Archivo → Descargar → Microsoft Excel (.xlsx). También sirven pestañas sueltas en CSV. El CSV exportado se abre en Sheets o Excel con una fila por día.'),
        pi && h('div', { class: 'note', style: { marginTop: '10px' } },
          h('p', {}, `Propuesta de Claude guardada para el próximo cierre (${describeProposal(pi.proposal, month?.habits || []).length} cambios).`),
          h('button', { class: 'linklike small', type: 'button', onClick: () => { state.meta.pendingImport = null; ctx.save(); draw(); } }, 'Descartar propuesta')),
        h('p', { class: 'muted small', style: { marginTop: '10px' } },
          persist === true ? 'Almacenamiento persistente: concedido.' : persist === false ? 'Almacenamiento persistente: no concedido. Exporta respaldos seguido.' : 'Almacenamiento persistente: sin confirmar.')),

      group('sistema', 'Sistema (modo juego)', state.meta.game?.enabled ? 'activado' : 'apagado',
        h('p', { class: 'muted small' }, 'Capa opcional inspirada en Solo Leveling: niveles, rango de cazador de E a S, misión diaria, jefe semanal, estadísticas por área y títulos. Todo sale de tu registro; no cambia cómo registras.'),
        h('label', { class: 'check-line' }, h('input', { type: 'checkbox', checked: !!state.meta.game?.enabled, onChange: (e) => {
          state.meta.game = { ...(state.meta.game || {}), enabled: e.target.checked };
          if (e.target.checked) state.meta.game.seen = seenFrom(gameStats(state, today));
          ctx.save();
          ctx.render();
        } }), h('span', {}, 'Activar el Sistema')),
        state.meta.game?.enabled && h('button', { class: 'linklike small', type: 'button', onClick: () => ctx.go('sistema') }, 'Abrir el Sistema')),

      group('avanzado', 'App', `versión ${ctx.version}`,
        h('p', {}, h('span', { class: `status-dot${navigator.onLine ? '' : ' off'}` }), navigator.onLine ? 'En línea. ' : 'Sin conexión. ', 'Bitácora funciona sin internet: tus datos están en este teléfono.'),
        h('p', { class: 'muted' }, `Versión ${ctx.version}${ctx.debug ? ' · modo debug' : ''}`),
        h('div', { class: 'stack' },
          h('button', { class: 'btn block', type: 'button', onClick: ctx.checkForUpdate }, 'Buscar actualización'),
          h('button', { class: 'btn block', type: 'button', onClick: () => ctx.showWhatsNew(true) }, 'Novedades de esta versión'),
          h('button', { class: 'btn danger block', type: 'button', onClick: wipe }, 'Borrar todo')),
        ctx.debug && perfBlock()),
    ].filter(Boolean));
  }

  // Medición de fluidez (solo en modo debug): duración de cada render por vista.
  function perfBlock() {
    const list = ctx.perf || [];
    if (!list.length) return h('p', { class: 'muted small' }, 'Sin mediciones aún.');
    const byView = {};
    for (const x of list) (byView[x.view] ||= []).push(x.ms);
    return h('div', { class: 'card' }, h('h3', {}, 'Fluidez (ms por render)'),
      h('ul', { class: 'list compact' }, Object.entries(byView).map(([v, arr]) => h('li', {}, h('span', { class: 'grow' }, v),
        h('span', { class: 'muted small' }, `${arr.length} · prom. ${Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)} · máx. ${Math.round(Math.max(...arr))}`)))));
  }
  draw();
}
