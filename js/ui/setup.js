// "Completa tu bitácora": lo que el onboarding corto dejó para después, como tarjeta en Hoy.
// Cada ítem se hace en una ventana corta y desaparece de la lista. Empieza con avance (nombre y hábitos ya listos).
import { h, modal, toast, field } from './dom.js';
import { LINE_MODES } from './onboarding.js';
import { WEEKDAYS } from '../core/dates.js';

const LABEL = {
  anchor: 'Tu ancla y hora', line: 'Qué anotar en la línea', acc: 'A quién rendir cuentas', backup: 'Primer respaldo', reminder: 'Recordatorio diario',
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
let hiddenToday = null;

export function setupCard(ctx, redraw) {
  const { state, today } = ctx;
  const pending = state.meta.setup?.pending || [];
  if (!pending.length || hiddenToday === today) return null;
  const done = 2 + (state.meta.setup.done || 0); // nombre y hábitos ya hechos (avance inicial)
  const total = pending.length + done;
  const finish = (k) => {
    state.meta.setup.pending = state.meta.setup.pending.filter((x) => x !== k);
    state.meta.setup.done = (state.meta.setup.done || 0) + 1;
    ctx.save();
    redraw();
  };
  const prof = state.profile;
  const actions = {
    async anchor() {
      const a = h('input', { class: 'input', value: prof.anchor || '', maxlength: 60, placeholder: 'después de hacer la cama' });
      const t = h('input', { class: 'input', type: 'time', value: prof.reminderTime || '07:00' });
      const ok = await modal({ title: LABEL.anchor, body: h('div', {}, h('p', { class: 'muted small' }, 'Pega el registro a algo que ya haces todos los días. Son 2-3 minutos.'),
        field('Después de…', a), field('¿A qué hora más o menos?', t)), actions: [{ label: 'Cancelar', value: false }, { label: 'Guardar', value: true, kind: 'primary' }] });
      if (!ok) return;
      prof.anchor = a.value.trim() || 'después de hacer la cama';
      prof.reminderTime = t.value || '07:00';
      finish('anchor');
    },
    async line() {
      const v = await modal({ title: LABEL.line, body: h('p', { class: 'muted small' }, 'Cada día tiene una línea para una sola cosa.'),
        actions: [...Object.entries(LINE_MODES).map(([k, x]) => ({ label: x.label, value: k, kind: prof.lineMode === k ? 'primary' : 'ghost' })), { label: 'Cancelar', value: null }] });
      if (!v) return;
      prof.lineMode = v;
      finish('line');
    },
    async acc() {
      const acc = prof.accountability;
      const who = h('select', { class: 'input' }, h('option', { value: 'claude', selected: acc.to === 'claude' }, 'Claude (pego el resumen en el chat)'), h('option', { value: 'persona', selected: acc.to === 'persona' }, 'Una persona (por WhatsApp)'));
      const name = h('input', { class: 'input', value: acc.personName || '', maxlength: 40, placeholder: 'Nombre (si es una persona)' });
      const wd = h('select', { class: 'input' }, [1, 2, 3, 4, 5, 6, 0].map((w) => h('option', { value: w, selected: w === acc.weekday }, cap(WEEKDAYS[w]))));
      const ok = await modal({ title: LABEL.acc, body: h('div', {}, h('p', { class: 'muted small' }, 'Una vez por semana mandas un resumen corto. Lo que alguien espera, se sostiene.'),
        field('Para', who), field('¿Quién?', name), field('Día', wd)), actions: [{ label: 'Cancelar', value: false }, { label: 'Guardar', value: true, kind: 'primary' }] });
      if (!ok) return;
      Object.assign(acc, { to: who.value, personName: name.value.trim(), weekday: Number(wd.value) });
      finish('acc');
    },
    async backup() { if (await ctx.exportBackup()) { toast('Respaldo listo'); finish('backup'); } },
    reminder() { finish('reminder'); try { localStorage.setItem('ajustes-abierto', 'rutina'); } catch { /* nada */ } ctx.go('ajustes'); },
  };
  return h('div', { class: 'card setup-card' },
    h('div', { class: 'setup-head' }, h('h2', {}, 'Completa tu bitácora'), h('span', { class: 'muted small' }, `${done} de ${total} listos`)),
    h('span', { class: 'bar' }, h('i', { style: { width: `${Math.round((done / total) * 100)}%` } })),
    h('div', { class: 'setup-list' }, pending.map((k) => h('button', { class: 'setup-item', type: 'button', onClick: actions[k] }, h('span', { class: 'dotc', 'aria-hidden': 'true' }), LABEL[k], h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')))),
    h('button', { class: 'linklike small', type: 'button', onClick: () => { hiddenToday = today; redraw(); } }, 'Más tarde'));
}
