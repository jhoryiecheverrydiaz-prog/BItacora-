import { h, clear, shareText, onLongPress, toast, haptic, modal, pencil, floatText, undoToast } from './dom.js';
import { formatLong, formatShort, monthKey, parseKey, diffDays, WEEK_LETTERS, WEEKDAYS, mondayIndex, monthTitle, weekdayOf } from '../core/dates.js';
import {
  recentEditable, toggleCheck, setCheck, setNote, toggleDayOff, topNotice, closeStatus, isDone,
  markRemaining, copyPreviousDay, toggleStar,
} from '../core/months.js';
import { weekProgress, monthProgress, monthStats, dayScore, isBlank, habitStrength } from '../core/stats.js';
import { areaById } from '../core/years.js';
import { gameStats, XP } from '../core/game.js';
import { weeklySummary, weeklyShort, weeklyRange } from '../core/summary.js';
import { addDays } from '../core/dates.js';
import {
  todayGroups, nextInStack, nowHM, weakWeekday, topWords, yearAgo, daysAway, freshStart, inSeason, WHEN_ICON,
} from '../core/routine.js';
import { LINE_MODES } from './onboarding.js';
import { friendly } from './errors.js';
import { setupCard } from './setup.js';

const STATE_LABEL = { full: 'Completo', min: 'Mínimo' };
const NOTE_MAX = 280;
let selected = null; // día que se está editando (persiste entre renders de la sesión)
let welcomeDismissed = null; // "Bienvenido de vuelta" se cierra por sesión y día
let keyHandler = null; // atajos de teclado (se reemplaza en cada render)
const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function renderToday(root, ctx) {
  const { state, today } = ctx;
  const prefs = state.meta.prefs || {};
  const gameOn = !!state.meta.game?.enabled;
  const days = recentEditable(state, today);
  if (!selected || !days.includes(selected)) selected = today;
  if (ctx.focusLine) selected = today;
  const page = h('section', { class: 'page today' });
  root.append(page);

  // ---------- Avisos (abajo, en la zona del pulgar) ----------
  function noticeEl() {
    const kind = topNotice(state, today);
    if (kind === 'close') {
      const cs = closeStatus(state, today);
      return h('div', { class: 'notice strong' }, h('p', {}, `Cierre de ${monthTitle(cs.key)} pendiente. Mañana será obligatorio.`),
        h('button', { class: 'btn', type: 'button', onClick: () => ctx.go('cierre') }, 'Cerrar ahora'));
    }
    if (kind === 'blank') {
      const m = state.months[monthKey(today)];
      const vals = m.habits.map((hb) => habitStrength(state, hb, today)).filter((v) => v !== null);
      const avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) : null;
      return h('div', { class: 'notice' }, h('p', {}, 'Ayer quedó en blanco. Un día no cambia la formación del hábito: registra aunque sea el mínimo.',
        avg !== null ? ` Fuerza promedio: ${avg} %.` : ''));
    }
    if (kind === 'weekly') {
      const acc = state.profile.accountability;
      const to = acc.to === 'persona' ? (acc.personName || 'tu persona') : 'Claude';
      return h('div', { class: 'notice strong' }, h('p', {}, `Hoy toca el resumen semanal para ${to}.`),
        h('button', { class: 'btn', type: 'button', onClick: sendWeekly }, 'Enviar resumen'));
    }
    if (kind === 'backup') {
      const last = state.meta.lastBackupAt;
      const txt = last ? `Último respaldo hace ${diffDays(last.slice(0, 10), today)} días.` : 'Aún no tienes un respaldo.';
      const box = h('div', { class: 'notice' }, h('p', {}, txt),
        h('button', { class: 'btn', type: 'button', onClick: async () => { if (await ctx.exportBackup()) dismissCard(box, 'Respaldo listo'); } }, 'Exportar'));
      return box;
    }
    const fresh = freshStart(today);
    if (fresh) {
      const txt = fresh === 'month' ? `Mes nuevo: ${monthTitle(monthKey(today))} empieza en 0.` : 'Lunes: semana nueva, empieza en 0 de 7.';
      return h('div', { class: 'notice soft' }, h('p', {}, txt));
    }
    return null;
  }

  // Quita una tarjeta en su sitio, con animación (sin redibujar la página).
  function dismissCard(el, msg) {
    if (msg) toast(msg);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), reduceMotion() ? 0 : 220);
  }

  // Revisión guiada (opcional): 3 respuestas con un toque que se suman al resumen.
  async function askReflection() {
    const { start } = weeklyRange(today);
    const m = state.months[monthKey(today)];
    const r = { best: null, missed: null, change: '' };
    const chips = (list, key) => h('div', { class: 'chips' }, list.map(([v, label]) => {
      const b = h('button', { class: 'chip small', type: 'button', 'aria-pressed': 'false', onClick: () => {
        r[key] = r[key] === v ? null : v;
        b.parentElement.querySelectorAll('.chip').forEach((o) => o.setAttribute('aria-pressed', String(o === b && r[key] === v)));
      } }, label);
      return b;
    }));
    const days7 = Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((k) => k <= today);
    const change = h('input', { class: 'input', maxlength: 100, placeholder: 'Ej.: dejar el agua junto a la cama', onInput: (e) => { r.change = e.target.value; } });
    const v = await modal({
      title: 'Revisión de la semana',
      body: h('div', {},
        h('p', { class: 'muted small' }, 'Opcional, 20 segundos. Se agrega al resumen.'),
        h('p', { class: 'field-label' }, 'Mejor día'), chips(days7.map((k) => [WEEKDAYS[weekdayOf(k)], WEEKDAYS[weekdayOf(k)].slice(0, 3)]), 'best'),
        h('p', { class: 'field-label' }, 'Lo que más costó'), chips(m.habits.map((hb) => [hb.name, hb.short]), 'missed'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Un ajuste para la próxima semana'), change)),
      actions: [{ label: 'Saltar', value: 'skip' }, { label: 'Continuar', value: 'ok', kind: 'primary' }],
    });
    if (v === null) return undefined;
    return v === 'ok' ? r : null;
  }

  async function sendWeekly() {
    const reflection = await askReflection();
    if (reflection === undefined) return;
    const forPerson = state.profile.accountability?.to === 'persona';
    let text;
    try { text = forPerson ? weeklyShort(state, today, reflection) : weeklySummary(state, today, reflection); } catch (e) { toast(friendly(e)); return; }
    // Respaldo y resumen en la misma pasada (el respaldo se guarda en Archivos).
    const r = await shareText(text, 'Resumen semanal');
    if (r !== 'cancelled') {
      state.meta.lastWeeklySentAt = today; // fecha local, no UTC
      ctx.save();
      const doBackup = await modal({
        title: 'Resumen enviado',
        body: '¿Aprovechas para guardar el respaldo de la semana?',
        actions: [{ label: 'Ahora no', value: false }, { label: 'Guardar respaldo', value: true, kind: 'primary' }],
      });
      if (doBackup) await ctx.exportBackup();
      draw();
    }
  }

  // ---------- Bienvenida tras varios días sin registrar ----------
  function welcomeEl() {
    if (selected !== today || welcomeDismissed === today) return null;
    const n = daysAway(state, today);
    const m = state.months[monthKey(today)];
    if (n < 3 || !isBlank(m.days[today])) return null;
    const box = h('div', { class: 'welcome card' },
      h('h2', {}, 'Bienvenido de vuelta'),
      h('p', { class: 'muted' }, `Pasaron ${n} días sin registro. Esos días quedan en blanco; no hace falta llenarlos. Empieza por hoy.`),
      gameOn && h('p', { class: 'small muted' }, `[SISTEMA] Registrar hoy da la misión de recuperación (+${XP.recovery} XP).`),
      h('button', { class: 'btn primary block', type: 'button', onClick: () => { welcomeDismissed = today; dismissCard(box); } }, 'Empezar desde hoy'));
    return box;
  }

  // ---------- Tira de días ----------
  function pillFill(k) {
    const m = state.months[monthKey(k)];
    const n = m.habits.length;
    return n && !m.days[k]?.off ? dayScore(m, k) / n : 0;
  }

  function strip() {
    if (days.length < 2) return null;
    return h('div', { class: 'day-strip', role: 'group', 'aria-label': 'Elegir día. Mantén presionado para rellenar.' }, days.map((k) => {
      const m = state.months[monthKey(k)];
      const blank = isBlank(m.days[k]);
      const pill = h('button', {
        class: `day-pill${blank ? ' blank' : ''}`, type: 'button', 'aria-pressed': String(k === selected), 'data-k': k,
        style: { '--fill': pillFill(k) },
        onClick: () => selectDay(k, days.indexOf(k) > days.indexOf(selected) ? 'next' : 'prev'),
      }, h('span', { 'aria-hidden': 'true' }, WEEK_LETTERS[mondayIndex(k)]), h('b', {}, parseKey(k).d), h('span', { class: 'pip' }),
      h('span', { class: 'sr-only' }, `, ${formatLong(k)}${blank ? ', en blanco' : ''}`));
      onLongPress(pill, () => fillDay(k));
      return pill;
    }));
  }

  // Rellenar en lote un día (ponerse al día rápido).
  async function fillDay(k) {
    const m = state.months[monthKey(k)];
    if (m.review) { toast('Mes cerrado: solo se edita la línea'); return; }
    haptic();
    const v = await modal({
      title: formatLong(k),
      body: h('p', { class: 'muted' }, 'Rellenar este día de una vez. Lo puedes deshacer.'),
      actions: [{ label: 'Igual que el día anterior', value: 'prev' }, { label: 'Todo en mínimo', value: 'min' }, { label: 'Todo completo', value: 'full', kind: 'primary' }, { label: 'Cancelar', value: null }],
    });
    if (!v) return;
    const before = structuredClone(m.days[k] || null);
    try {
      if (v === 'prev') copyPreviousDay(state, k);
      else markRemaining(state, k, v);
    } catch (e) { toast(friendly(e)); return; }
    ctx.save();
    selected = k;
    draw();
    undoToast('Día rellenado', () => { restoreDay(m, k, before); ctx.save(); draw(); });
  }

  function restoreDay(m, k, before) {
    if (before) m.days[k] = before; else delete m.days[k];
  }

  // ---------- Filas de hábitos (se actualizan en su sitio) ----------
  let rows = [];
  let statsEl = null;
  let announceEl = null;
  const hour = () => ctx.hour();
  const weakDay = weakWeekday(state, today);
  const isWeakToday = weakDay !== null && weekdayOf(selected) === weakDay;
  const season = inSeason(state, today);

  function segments(done, target) {
    const n = Math.min(target, 7);
    return h('span', { class: 'segs', 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => h('i', { class: i < done ? 'on' : '' })));
  }

  function subContent(habit) {
    const weekly = habit.target?.type === 'weekly';
    const monthly = habit.target?.type === 'monthly';
    const area = habit.area && areaById(state, habit.area);
    const parts = [];
    if (area?.emoji) parts.push(`${area.emoji} `);
    if (weekly) {
      const wp = weekProgress(state, habit, selected);
      return [...parts, segments(wp.done, wp.target), ` ${wp.done}/${wp.target} esta semana`];
    }
    if (monthly) {
      const wp = monthProgress(state, habit, selected);
      return [...parts, `${wp.done}/${wp.target} este mes`];
    }
    if (habit.cue && !isWeakToday && !season) return [...parts, `Cuando: ${habit.cue}`];
    return [...parts, `Mín.: ${habit.min}`];
  }

  function paintRow(r, m, animate) {
    const v = m.days[selected]?.checks?.[r.habit.id];
    r.btn.setAttribute('aria-pressed', String(isDone(v)));
    r.box.className = `box ${v || ''}`;
    if (animate && v && !reduceMotion()) { void r.box.offsetWidth; r.box.classList.add('just'); }
    r.state.textContent = STATE_LABEL[v] || '';
    if (!v) r.state.append(h('span', { class: 'sr-only' }, 'sin marcar'));
    clear(r.sub).append(...subContent(r.habit));
  }

  function statsText(m) {
    const off = !!m.days[selected]?.off;
    const ms = monthStats(m, today);
    const pct = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);
    const n = m.habits.length;
    const score = dayScore(m, selected);
    const label = gameOn ? 'Misión diaria' : 'Hoy';
    return { text: `${off ? 'Día libre' : `${label}: ${score}/${n} · ${pct(n ? score / n : null)}`} · ${monthTitle(m.key)}: ${pct(ms.pct)}`, perfect: !off && n > 0 && score === n, score, n };
  }

  function refresh(changedId) {
    const m = state.months[monthKey(selected)];
    for (const r of rows) paintRow(r, m, r.habit.id === changedId);
    if (statsEl) {
      const st = statsText(m);
      const was = statsEl.classList.contains('perfect');
      statsEl.textContent = st.text + (st.perfect ? ' 🏆' : '');
      statsEl.classList.toggle('perfect', st.perfect);
      if (st.perfect && !was && !reduceMotion()) { statsEl.classList.remove('pulse'); void statsEl.offsetWidth; statsEl.classList.add('pulse'); }
    }
    const pill = page.querySelector('.day-pill[aria-pressed="true"]');
    if (pill) { pill.classList.toggle('blank', isBlank(m.days[selected])); pill.style.setProperty('--fill', pillFill(selected)); }
  }

  function announce(habit) {
    const m = state.months[monthKey(selected)];
    const v = m.days[selected]?.checks?.[habit.id];
    const st = statsText(m);
    if (announceEl) announceEl.textContent = `${habit.name}: ${STATE_LABEL[v]?.toLowerCase() || 'sin marcar'}. ${st.score} de ${st.n}.`;
  }

  function apply(habit, fn) {
    const m = state.months[monthKey(selected)];
    const before = m.days[selected]?.checks?.[habit.id];
    try { fn(); } catch (e) { toast(friendly(e)); return false; }
    ctx.save();
    haptic();
    if (prefs.sound) pencil();
    refresh(habit.id);
    announce(habit);
    const after = m.days[selected]?.checks?.[habit.id];
    // XP que sale de la casilla (solo al pasar de vacío a marcado).
    if (gameOn && !isDone(before) && isDone(after) && !reduceMotion()) {
      const r = rows.find((x) => x.habit.id === habit.id);
      if (r) floatText(r.box, `+${after === 'full' ? XP.full : XP.min}`, 'xp');
    }
    // Apilado: resalta el siguiente de la cadena.
    if (isDone(after)) {
      for (const id of nextInStack(m, selected, habit.id)) {
        const r = rows.find((x) => x.habit.id === id);
        if (r) { r.btn.classList.remove('next'); void r.btn.offsetWidth; r.btn.classList.add('next'); }
      }
    }
    return true;
  }

  const stampNow = () => (selected === today ? nowHM() : null);

  function habitRow(m, habit) {
    const closed = !!m.review;
    const r = { habit };
    r.box = h('span', { class: 'box', 'data-c': habit.color, 'aria-hidden': 'true' }, habit.icon ? h('span', { class: 'box-icon' }, habit.icon) : null);
    r.sub = h('span', { class: 'hsub' });
    r.state = h('span', { class: 'hstate' });
    const extra = [];
    if (habit.bundle) extra.push(h('span', { class: 'hextra' }, `Solo mientras: ${habit.bundle}`));
    if (isWeakToday || season) extra.push(h('span', { class: 'hextra' }, `Mín.: ${habit.min}`));
    r.btn = h('button', {
      class: 'habit-row', type: 'button', 'data-c': habit.color, 'data-id': habit.id, disabled: closed,
      onClick: () => apply(habit, () => toggleCheck(state, selected, habit.id, stampNow())),
    },
    r.box,
    h('span', { class: 'htext' }, h('span', { class: 'hname' }, habit.name), r.sub, ...extra),
    r.state,
    h('span', { class: 'sr-only' }, '. Mantén presionado para marcar el mínimo.'));
    // Mantener presionado = marcar directo el mínimo.
    onLongPress(r.btn, () => {
      if (apply(habit, () => setCheck(state, selected, habit.id, 'min', stampNow()))) toast(`Mínimo: ${habit.min}`, { duration: 2600 });
    });
    paintRow(r, m, false);
    rows.push(r);
    return r.btn;
  }

  function habitsBlock(m) {
    const g = todayGroups(state, m, selected, today, hour(), prefs.order === 'manual' ? 'manual' : 'smart');
    const off = !!m.days[selected]?.off;
    const wrap = h('div', { class: `habits${off ? ' resting' : ''}${prefs.density === 'compact' ? ' compact' : ''}` });
    if (g.flat) { wrap.append(...g.now.map((hb) => habitRow(m, hb))); return wrap; }
    const label = (txt) => h('p', { class: 'group-label' }, txt);
    const groups = [
      [gameOn ? 'Misión de ahora' : 'Ahora', g.now],
      ['Más tarde', g.later],
      ['Hoy no toca', g.optional],
      ['Hecho', g.done],
    ].filter(([, list]) => list.length);
    const many = groups.length > 1;
    for (const [txt, list] of groups) {
      if (many) wrap.append(label(txt === 'Más tarde' && list[0]?.when ? `Más tarde ${WHEN_ICON[list[0].when] || ''}` : txt));
      wrap.append(...list.map((hb) => habitRow(m, hb)));
    }
    return wrap;
  }

  // ---------- Línea del día ----------
  function lineBlock(m) {
    const placeholder = LINE_MODES[state.profile.lineMode]?.placeholder || 'Una línea sobre hoy…';
    const counter = h('span', { class: 'counter', 'aria-hidden': 'true' });
    const saved = h('span', { class: 'line-saved', 'aria-hidden': 'true' }, '✓');
    let savedTimer = null;
    const star = h('button', { class: 'star-btn', type: 'button', 'aria-pressed': String(!!m.days[selected]?.star), 'aria-label': 'Destacar esta nota para el cierre', title: 'Destacar',
      onClick: () => {
        try { toggleStar(state, selected); } catch (e) { toast(friendly(e)); return; }
        star.setAttribute('aria-pressed', String(!!m.days[selected]?.star));
        haptic();
        ctx.save();
      } }, '★');
    const updateCounter = (v) => {
      const n = v.length;
      counter.textContent = n >= 240 ? `${n}/${NOTE_MAX}` : '';
      counter.classList.toggle('warn', n >= 270);
      star.hidden = !n;
    };
    const note = h('input', {
      class: 'input', id: 'line', value: m.days[selected]?.note || '', placeholder, maxlength: NOTE_MAX, enterkeyhint: 'done', autocomplete: 'off',
      onInput: (e) => {
        setNote(state, selected, e.target.value);
        ctx.save();
        updateCounter(e.target.value);
        if (!e.target.value) star.setAttribute('aria-pressed', 'false');
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => { saved.classList.remove('on'); void saved.offsetWidth; saved.classList.add('on'); }, 450);
      },
      onKeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    });
    updateCounter(note.value);
    const words = !note.value && selected === today ? topWords(state, today) : [];
    const ago = yearAgo(state, selected);
    return h('div', { class: 'line-block' },
      h('label', { class: 'field line-field' },
        h('span', { class: 'field-label' }, 'Línea del día ', saved, counter),
        h('span', { class: 'line-row' }, note, star)),
      words.length ? h('div', { class: 'chips word-chips', 'aria-label': 'Palabras que más usas' }, words.map((w) => h('button', { class: 'chip small', type: 'button', onClick: () => {
        note.value = note.value ? `${note.value} ${w}` : w.charAt(0).toUpperCase() + w.slice(1);
        note.dispatchEvent(new Event('input'));
        note.focus();
      } }, w))) : null,
      ago && h('details', { class: 'year-ago' }, h('summary', {}, `Hace un año · ${formatShort(ago.key)}`), h('p', { class: 'hand' }, ago.note)),
    );
  }

  // ---------- Gestos y teclado ----------
  function selectDay(k, dir) {
    if (!k || k === selected) return;
    selected = k;
    haptic();
    draw(dir);
  }
  let sx = 0, sy = 0, tracking = false, swiped = false;
  page.addEventListener('pointerdown', (e) => {
    tracking = !e.target.closest('input, textarea, .day-strip, details'); swiped = false; sx = e.clientX; sy = e.clientY;
  });
  page.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const i = days.indexOf(selected);
    const next = dx < 0 ? days[i + 1] : days[i - 1];
    if (next) { swiped = true; selectDay(next, dx < 0 ? 'next' : 'prev'); }
  });
  page.addEventListener('pointercancel', () => { tracking = false; });
  page.addEventListener('click', (e) => { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; } }, true);

  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = (e) => {
    if (!page.isConnected) { document.removeEventListener('keydown', keyHandler); keyHandler = null; return; }
    if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.overlay')) return;
    const i = days.indexOf(selected);
    if (e.key === 'ArrowLeft' && days[i - 1]) { e.preventDefault(); selectDay(days[i - 1], 'prev'); }
    else if (e.key === 'ArrowRight' && days[i + 1]) { e.preventDefault(); selectDay(days[i + 1], 'next'); }
    else if (e.key.toLowerCase() === 'n') { e.preventDefault(); document.getElementById('line')?.focus(); }
    else if (/^[1-5]$/.test(e.key)) {
      const r = rows[Number(e.key) - 1];
      if (r && !r.btn.disabled) { e.preventDefault(); r.btn.click(); }
    }
  };
  document.addEventListener('keydown', keyHandler);

  // Doble toque en el contador: marca lo que falta como completo (con deshacer).
  async function completeRest() {
    const m = state.months[monthKey(selected)];
    if (m.review || m.days[selected]?.off) return;
    const before = structuredClone(m.days[selected] || null);
    let changed;
    try { changed = markRemaining(state, selected, 'full', stampNow()); } catch (e) { toast(friendly(e)); return; }
    if (!changed.length) return;
    ctx.save();
    haptic();
    draw();
    undoToast(`${changed.length} marcados como completo`, () => { restoreDay(m, selected, before); ctx.save(); draw(); });
  }

  // ---------- Página ----------
  function draw(dir) {
    clear(page);
    rows = [];
    page.classList.remove('slide-next', 'slide-prev');
    if (dir && !reduceMotion()) { void page.offsetWidth; page.classList.add(`slide-${dir}`); }
    const m = state.months[monthKey(selected)];
    const off = !!m.days[selected]?.off;
    const st = statsText(m);
    statsEl = h('p', {
      class: `today-stats muted small${st.perfect ? ' perfect' : ''}`, 'aria-live': 'polite', title: 'Doble toque: completar lo que falta',
      onDblclick: completeRest,
    }, st.text + (st.perfect ? ' 🏆' : ''));
    announceEl = h('p', { class: 'sr-only', 'aria-live': 'assertive' });
    const editing = selected !== today;
    const night = selected === today && hour() >= 20;
    const habits = habitsBlock(m);
    const line = lineBlock(m);
    page.append(...[
      editing && h('div', { class: 'editing-band', role: 'status' },
        h('span', {}, `Editando ${formatLong(selected).toLowerCase()}`),
        h('button', { class: 'btn small-btn', type: 'button', onClick: () => selectDay(today, 'next') }, 'Volver a hoy')),
      h('header', { class: 'today-head' },
        h('h1', {}, formatLong(selected)),
        m.mantra && h('p', { class: 'mantra' }, m.mantra),
        gameOn && (() => {
          const g = gameStats(state, today);
          return h('button', { class: 'sys-chip', type: 'button', onClick: () => ctx.go('sistema') },
            h('b', {}, `Nv. ${g.level}`), ` · Rango ${g.rank} · `, `+${g.todayGain?.xp || 0} XP hoy`,
            h('span', { class: 'sys-chip-bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.round(g.progress * 100)}%` } })));
        })(),
        statsEl, announceEl),
      welcomeEl(),
      selected === today && setupCard(ctx, () => draw()),
      strip(),
      season && selected === today && h('p', { class: 'season-tag small' }, `Temporada ligera hasta el ${formatShort(state.meta.season.until)}: el mínimo basta.`),
      isWeakToday && !season && selected === today && h('p', { class: 'muted small' }, `Los ${WEEKDAYS[weakDay]} son tu día con menos registro. El mínimo cuenta.`),
      m.review && h('p', { class: 'muted small' }, 'Mes cerrado: solo se puede editar la línea.'),
      night && line, // de noche, primero la línea del día
      habits,
      !m.review && h('button', { class: 'linklike small day-off', type: 'button', 'aria-pressed': String(off), onClick: () => {
        try { toggleDayOff(state, selected); } catch (e) { toast(friendly(e)); return; }
        ctx.save();
        haptic();
        draw();
      } }, off ? 'Es día libre · quitar' : 'Marcar como día libre (no cuenta en el %)'),
      !night && line,
      selected === today && noticeEl(),
    ].filter(Boolean));
    if (ctx.focusLine) { ctx.focusLine = false; requestAnimationFrame(() => document.getElementById('line')?.focus()); }
  }

  draw();
}
