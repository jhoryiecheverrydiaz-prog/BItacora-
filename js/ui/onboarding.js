import { h, clear, field, toast, copyText } from './dom.js';
import { addDays, formatShort, formatLong, diffDays, WEEKDAYS } from '../core/dates.js';
import { createStarterState, autoShort, validateHabitList, MAX_HABITS, RECOMMENDED_START, MAX_SHORT, LOOKBACK_DAYS, newId } from '../core/months.js';

export const LINE_MODES = {
  bueno: { label: 'Algo bueno que me pasó', placeholder: 'Algo bueno de hoy…' },
  reflexion: { label: 'Algo para reflexionar después', placeholder: 'Algo para pensar más adelante…' },
  relevante: { label: 'El hecho más relevante del día', placeholder: 'Lo más relevante de hoy…' },
  libre: { label: 'Libre', placeholder: 'Una línea sobre hoy…' },
};

const SUGGESTIONS = [
  { name: 'Gimnasio', short: 'GYM', min: 'Ir y entrenar aunque sean 20 min', target: { type: 'weekly', count: 4 } },
  { name: 'Meditar', short: 'MED', min: '2 minutos sentado', target: { type: 'daily' } },
  { name: 'Leer', short: 'LEER', min: '2 páginas', target: { type: 'daily' } },
  { name: 'Agua', short: 'AGUA', min: 'Un vaso al despertar', target: { type: 'daily' } },
  { name: 'Dormir antes de las 11', short: 'DORMIR', min: 'Celular fuera de la cama a las 11', target: { type: 'daily' } },
  { name: 'Levantarse temprano', short: 'TEMP', min: 'En pie antes de las 6:30', target: { type: 'daily' } },
  { name: 'Escribir / diario', short: 'DIARIO', min: '3 líneas', target: { type: 'daily' } },
  { name: 'Deep work', short: 'DEEP', min: '25 min sin celular', target: { type: 'daily' } },
  { name: 'Caminar', short: 'CAMI', min: '10 minutos', target: { type: 'daily' } },
  { name: 'Sin redes antes de las 9', short: 'REDES', min: 'Sin redes la primera media hora', target: { type: 'daily' } },
];

const TOTAL = 10;

export function reminderTitle(profile) {
  return `Bitácora (${profile.anchor || 'registro diario'})`;
}

// Instrucciones §9: Recordatorios de iOS (principal) y Atajos (alternativa).
export function reminderBlock(profile) {
  const title = reminderTitle(profile);
  const time = profile.reminderTime || '07:00';
  return h('div', {},
    h('h3', {}, 'Opción A · App Recordatorios'),
    h('ol', { class: 'rules' },
      h('li', {}, 'Abre Recordatorios y crea uno nuevo.'),
      h('li', {}, 'Título: ', h('b', {}, title), '.'),
      h('li', {}, 'Toca ⓘ: activa Fecha y Hora, y pon ', h('b', {}, time), '.'),
      h('li', {}, 'Repetir: ', h('b', {}, 'Diariamente'), '.'),
      h('li', {}, 'Cuando suene, abre Bitácora desde su ícono en la pantalla de inicio (no desde Safari).'),
    ),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: async () => toast(await copyText(title) ? 'Título copiado' : 'No se pudo copiar') }, 'Copiar título')),
    h('h3', { style: { marginTop: '18px' } }, 'Opción B · Atajos'),
    h('ol', { class: 'rules' },
      h('li', {}, 'Atajos → Automatización → Nueva → Hora del día → ', h('b', {}, time), ', diariamente.'),
      h('li', {}, 'Elige "Ejecutar inmediatamente".'),
      h('li', {}, 'Acción: "Mostrar notificación" con el texto ', h('b', {}, title), '.'),
    ),
    h('p', { class: 'muted small' }, 'No uses "Abrir URL": abre Safari, que tiene otra memoria y no ve tus datos. iOS no permite abrir una web app de inicio desde Atajos de forma fiable.'),
  );
}

function freshDraft(today) {
  return {
    step: 1, name: '', startKey: today, anchor: '', reminderTime: '07:00', lineMode: 'bueno',
    habits: [], mantra: '', goals: ['', '', ''], accountability: { to: 'claude', personName: '', weekday: 0 },
  };
}

export function renderOnboarding(root, ctx) {
  const { state, today } = ctx;
  if (!state.meta.onboardingDraft) state.meta.onboardingDraft = freshDraft(today);
  const d = state.meta.onboardingDraft;
  const save = () => ctx.save();

  const page = h('section', { class: 'page' });
  root.append(page);

  function go(step) {
    d.step = step;
    save();
    draw();
  }

  function nav({ next = 'Siguiente', onNext, back = true, nextDisabled = false } = {}) {
    return h('div', { class: 'ob-nav' },
      back && d.step > 1 && h('button', { class: 'btn ghost', type: 'button', onClick: () => go(d.step - 1) }, 'Atrás'),
      h('button', { class: 'btn primary', type: 'button', disabled: nextDisabled, onClick: () => { if (!onNext || onNext() !== false) go(d.step + 1); } }, next),
    );
  }

  const input = (value, onInput, attrs = {}) => h('input', { class: 'input', value, onInput: (e) => { onInput(e.target.value); save(); }, ...attrs });

  const steps = {
    1: () => {
      const opts = Array.from({ length: LOOKBACK_DAYS + 1 }, (_, i) => addDays(today, -i));
      const err = h('p', { class: 'err-text', hidden: true });
      return [
        h('h1', {}, '¿Cómo te llamo?'),
        field('Nombre', input(d.name, (v) => { d.name = v; }, { autocomplete: 'given-name', enterkeyhint: 'next', maxlength: 40 })),
        h('h2', { style: { marginTop: '22px' } }, '¿Desde qué día empezaste a registrar?'),
        h('p', { class: 'muted' }, 'Si ya anotaste en papel, elige ese día y luego rellenas lo que falta.'),
        field('Día de inicio', h('select', { class: 'input', onChange: (e) => { d.startKey = e.target.value; save(); } },
          opts.map((k, i) => h('option', { value: k, selected: k === d.startKey }, i === 0 ? `Hoy · ${formatShort(k)}` : i === 1 ? `Ayer · ${formatShort(k)}` : formatLong(k))))),
        err,
        nav({ onNext: () => { if (!d.name.trim()) { err.hidden = false; err.textContent = 'Escribe un nombre.'; return false; } } }),
      ];
    },
    2: () => [
      h('h1', {}, '¿Después de qué haces tu registro diario?'),
      h('p', { class: 'muted' }, 'Pégalo a algo que ya haces todos los días. Son 2-3 minutos.'),
      field('Mi ancla', input(d.anchor, (v) => { d.anchor = v; }, { placeholder: 'después de hacer la cama', maxlength: 60 })),
      h('div', { class: 'chips' }, ['después de hacer la cama', 'con el primer café', 'antes de dormir'].map((t) =>
        h('button', { class: 'chip', type: 'button', onClick: () => { d.anchor = t; save(); draw(); } }, t))),
      field('¿A qué hora más o menos?', input(d.reminderTime, (v) => { d.reminderTime = v; }, { type: 'time' })),
      nav({ onNext: () => { if (!d.anchor.trim()) d.anchor = 'después de hacer la cama'; } }),
    ],
    3: () => [
      h('h1', {}, '¿Qué vas a anotar en la línea de cada día?'),
      h('p', { class: 'muted' }, 'En la página izquierda de la libreta cada día tiene una línea para una sola cosa. Unos anotan algo para reflexionar más adelante; otros, algo bueno que les pasó.'),
      h('div', { class: 'opts', role: 'radiogroup' }, Object.entries(LINE_MODES).map(([k, v]) =>
        h('button', { class: 'opt', type: 'button', role: 'radio', 'aria-checked': String(d.lineMode === k), onClick: () => { d.lineMode = k; save(); draw(); } },
          h('span', { class: 'dot' }), v.label))),
      nav(),
    ],
    4: () => habitsStep(),
    5: () => [
      h('h1', {}, 'Mantra del mes'),
      h('p', { class: 'muted' }, 'Opcional. Una línea que quieras tener presente este mes.'),
      field('Mantra', input(d.mantra, (v) => { d.mantra = v; }, { maxlength: 80, placeholder: 'Poco, pero todos los días' })),
      h('ul', { class: 'example-list' }, ['Poco, pero todos los días', 'Primero lo importante', 'Un día malo no es un mes malo'].map((t) => h('li', {}, t))),
      nav(),
    ],
    6: () => [
      h('h1', {}, 'Objetivos del mes'),
      h('p', { class: 'muted' }, 'Opcional, hasta 3. Van abajo de la página: son cosas puntuales que quieres lograr, no hábitos diarios.'),
      ...d.goals.map((g, i) => field(`Objetivo ${i + 1}`, input(g, (v) => { d.goals[i] = v; }, { maxlength: 80, placeholder: i === 0 ? 'Ej.: renovar el pasaporte' : '' }))),
      nav(),
    ],
    7: () => {
      const a = d.accountability;
      return [
        h('h1', {}, 'Rendición de cuentas'),
        h('p', { class: 'muted' }, 'Una vez por semana mandas un resumen corto a alguien. Lo que alguien espera, se sostiene.'),
        h('div', { class: 'opts', role: 'radiogroup' },
          h('button', { class: 'opt', type: 'button', role: 'radio', 'aria-checked': String(a.to === 'claude'), onClick: () => { a.to = 'claude'; save(); draw(); } }, h('span', { class: 'dot' }), 'Claude (pego el resumen en el chat)'),
          h('button', { class: 'opt', type: 'button', role: 'radio', 'aria-checked': String(a.to === 'persona'), onClick: () => { a.to = 'persona'; save(); draw(); } }, h('span', { class: 'dot' }), 'Una persona (por WhatsApp)'),
        ),
        a.to === 'persona' && field('¿Quién?', input(a.personName, (v) => { a.personName = v; }, { maxlength: 40, placeholder: 'Nombre' })),
        field('¿Qué día de la semana?', h('select', { class: 'input', onChange: (e) => { a.weekday = Number(e.target.value); save(); } },
          [1, 2, 3, 4, 5, 6, 0].map((w) => h('option', { value: w, selected: w === a.weekday }, WEEKDAYS[w][0].toUpperCase() + WEEKDAYS[w].slice(1))))),
        nav(),
      ];
    },
    8: () => [
      h('h1', {}, 'Las 3 reglas'),
      h('ol', { class: 'rules' },
        h('li', {}, h('b', {}, 'El mínimo cuenta. '), 'Cada hábito tiene una versión mínima. Si la haces, el día cuenta como cumplido.'),
        h('li', {}, h('b', {}, 'Nunca dos días seguidos en blanco. '), 'Un día en blanco es normal. Dos seguidos ya es un patrón.'),
        h('li', {}, h('b', {}, 'Los hábitos se cambian solo en el cierre de mes. '), 'Durante el mes no se agregan ni se quitan. Al cerrar decides con datos.'),
      ),
      nav({ next: 'Entendido', onNext: createState }),
    ],
    9: () => [
      h('h1', {}, 'Protege tus datos'),
      h('p', {}, 'Tus datos viven solo en este iPhone. Si borras el ícono, se borran.'),
      h('p', {}, 'Un respaldo es un archivo que guardas en Archivos o iCloud. Lo puedes importar cuando quieras.'),
      h('div', { class: 'stack' },
        h('button', { class: 'btn primary block', type: 'button', onClick: async () => { if (await ctx.exportBackup()) { toast('Respaldo listo'); draw(); } } },
          state.meta.lastBackupAt ? 'Respaldo hecho · repetir' : 'Hacer primer respaldo')),
      nav({ next: state.meta.lastBackupAt ? 'Siguiente' : 'Después' }),
    ],
    10: () => [
      h('h1', {}, 'Recordatorio diario'),
      h('p', { class: 'muted' }, `Crea un recordatorio para ${state.profile.reminderTime}, ${state.profile.anchor}. Es gratis y no necesita internet.`),
      reminderBlock(state.profile),
      nav({ next: 'Terminar', onNext: () => { finish(); return false; } }),
    ],
  };

  function habitsStep() {
    const errBox = h('div');
    const chosen = d.habits;
    const isChosen = (s) => chosen.some((x) => x.from === s.name);
    const toggle = (s) => {
      if (isChosen(s)) d.habits = chosen.filter((x) => x.from !== s.name);
      else if (chosen.length < MAX_HABITS) chosen.push({ key: newId(), from: s.name, ...structuredClone(s) });
      save(); draw();
    };
    const addCustom = () => {
      if (chosen.length >= MAX_HABITS) return;
      chosen.push({ key: newId(), from: null, name: '', short: '', min: '', target: { type: 'daily' } });
      save(); draw();
    };
    return [
      h('h1', {}, 'Hábitos de este mes'),
      h('p', { class: 'muted' }, `Máximo ${MAX_HABITS}. Recomendado: ${RECOMMENDED_START} para arrancar.`),
      h('div', { class: 'chips' },
        SUGGESTIONS.map((s) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(isChosen(s)), disabled: !isChosen(s) && chosen.length >= MAX_HABITS, onClick: () => toggle(s) }, s.name)),
        h('button', { class: 'chip', type: 'button', disabled: chosen.length >= MAX_HABITS, onClick: addCustom }, '+ Crear otro'),
      ),
      chosen.length > RECOMMENDED_START && h('p', { class: 'warn' }, 'Más de 3 al inicio suele terminar en 0. Puedes subir en el cierre de mes.'),
      ...chosen.map((x, i) => habitForm(x, () => { chosen.splice(i, 1); save(); draw(); }, save)),
      errBox,
      nav({ nextDisabled: !chosen.length, onNext: () => {
        const list = chosen.map((x) => ({ ...x, short: (x.short || autoShort(x.name)).toUpperCase() }));
        const errors = validateHabitList(list);
        clear(errBox);
        if (errors.length) { errBox.append(...errors.map((e) => h('p', { class: 'err-text' }, cap(e)))); return false; }
        chosen.forEach((x, i) => { x.short = list[i].short; });
      } }),
    ];
  }

  function createState() {
    const g = d.goals.map((x) => x.trim()).filter(Boolean);
    try {
      const fresh = createStarterState({
        profile: { name: d.name.trim(), anchor: d.anchor.trim(), reminderTime: d.reminderTime || '07:00', lineMode: d.lineMode, accountability: { ...d.accountability, personName: d.accountability.personName.trim() } },
        startKey: d.startKey, today, habits: d.habits, mantra: d.mantra, goals: g,
      });
      fresh.meta.lastBackupAt = state.meta.lastBackupAt;
      fresh.meta.onboardingDraft = { ...d, step: 9 };
      Object.assign(state, fresh);
      ctx.state = state;
      ctx.saveNow();
      ctx.render(); // el borrador nuevo (paso 9) vive en state.meta
    } catch (e) {
      toast(cap(e.message), { duration: 4000 });
    }
    return false;
  }

  async function finish() {
    try { state.meta.persistGranted = (await navigator.storage?.persist?.()) ?? null; } catch { state.meta.persistGranted = false; }
    const n = diffDays(d.startKey, today) + 1;
    state.meta.onboardingDraft = null;
    await ctx.saveNow();
    clear(page);
    page.append(h('div', {},
      h('h1', { class: 'hand', style: { fontSize: '2rem', marginTop: '30px' } }, `Listo. Hoy es tu día ${n}.`),
      n > 1 && h('p', { class: 'muted' }, 'Rellena los días anteriores desde la tira de días en Hoy.'),
      h('button', { class: 'btn primary block', type: 'button', onClick: () => ctx.go('hoy') }, 'Ir a Hoy'),
    ));
  }

  function draw() {
    clear(page);
    const pct = Math.round((d.step / TOTAL) * 100);
    page.append(
      h('div', { class: 'ob-count' }, `Paso ${d.step} de ${TOTAL}`),
      h('div', { class: 'ob-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': TOTAL, 'aria-valuenow': d.step }, h('i', { style: { width: `${pct}%` } })),
      ...(steps[d.step] || steps[1])(),
    );
    page.querySelector('h1')?.focus?.();
  }

  // Si vuelve antes del paso 9, el estado se recrea al pasar de nuevo por las reglas.
  if (d.step > 8 && !state.profile) d.step = 8;
  draw();
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Mini-formulario de hábito (onboarding, cierre, emergencia). Muta `x`.
export function habitForm(x, onRemove, onChange = () => {}) {
  const shortIn = h('input', { class: 'input', value: x.short || autoShort(x.name), maxlength: MAX_SHORT, autocapitalize: 'characters',
    onInput: (e) => { x.short = e.target.value.toUpperCase(); x.shortTouched = true; onChange(); } });
  const weekly = x.target?.type === 'weekly';
  const countSel = h('select', { class: 'input', 'aria-label': 'Veces por semana', onChange: (e) => { x.target = { type: 'weekly', count: Number(e.target.value) }; onChange(); } },
    [1, 2, 3, 4, 5, 6].map((n) => h('option', { value: n, selected: weekly && x.target.count === n }, `${n} por semana`)));
  const countField = field('Veces por semana', countSel);
  countField.hidden = !weekly;
  return h('div', { class: 'card' },
    field('Nombre', h('input', { class: 'input', value: x.name, maxlength: 40, placeholder: 'Ej.: Leer',
      onInput: (e) => { x.name = e.target.value; if (!x.shortTouched) { x.short = autoShort(x.name); shortIn.value = x.short; } onChange(); } })),
    h('div', { class: 'row' },
      field(`Etiqueta (≤ ${MAX_SHORT})`, shortIn),
      field('Frecuencia', h('select', { class: 'input', onChange: (e) => {
        x.target = e.target.value === 'daily' ? { type: 'daily' } : { type: 'weekly', count: Number(countSel.value) || 4 };
        countField.hidden = x.target.type === 'daily';
        onChange();
      } }, h('option', { value: 'daily', selected: !weekly }, 'Diaria'), h('option', { value: 'weekly', selected: weekly }, 'X por semana'))),
    ),
    countField,
    field('Versión mínima (obligatoria)', h('input', { class: 'input', value: x.min, maxlength: 80, placeholder: 'Ej.: 2 páginas',
      onInput: (e) => { x.min = e.target.value; onChange(); } }), 'Lo mínimo que cuenta como cumplido en un día malo.'),
    onRemove && h('button', { class: 'linklike small', type: 'button', onClick: onRemove }, 'Quitar este hábito'),
  );
}
