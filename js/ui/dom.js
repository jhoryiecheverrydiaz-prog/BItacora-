// Helpers de DOM: h(), modales propios (sin alert/confirm), toasts, compartir.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') el[k] = !!v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, String(sv)); else el.style[sk] = sv;
      }
    }
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  append(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

const layer = () => document.getElementById('layer');

/**
 * Modal propio. actions: [{ label, value, kind: 'primary'|'danger'|'ghost' }].
 * Devuelve una promesa con el value elegido (o null si se cierra).
 */
export function modal({ title, body, actions = [{ label: 'Entendido', value: true, kind: 'primary' }], dismissible = true }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const close = (v) => {
      // Sale con animación corta; la promesa se resuelve de una vez (la UI no espera).
      wrap.classList.add('closing');
      setTimeout(() => wrap.remove(), 180);
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(null); };
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Mensaje' },
      title && h('h2', { class: 'modal-title' }, title),
      typeof body === 'string' ? h('p', {}, body) : body,
      h('div', { class: 'modal-actions' }, actions.map((a) =>
        h('button', { class: `btn ${a.kind || 'ghost'}`, type: 'button', onClick: () => close(typeof a.value === 'function' ? a.value() : a.value) }, a.label))),
    );
    const wrap = h('div', { class: 'overlay', onClick: (e) => { if (e.target === wrap && dismissible) close(null); } }, box);
    if (dismissible) dragToDismiss(box, () => close(null));
    layer().append(wrap);
    document.addEventListener('keydown', onKey);
    // Sin desplazar la hoja: en hojas largas, enfocar el botón de abajo escondía el título.
    (box.querySelector('input, textarea') || box.querySelector('.btn.primary') || box.querySelector('.btn'))?.focus({ preventScroll: true });
  });
}

// Arrastrar la hoja hacia abajo la cierra (gesto de iOS). Solo si la hoja está arriba del todo
// y el arrastre empieza fuera de campos de texto. Cierra por distancia (> 90 px) o por velocidad.
function dragToDismiss(box, onClose) {
  let y0 = null, t0 = 0, dy = 0;
  box.addEventListener('pointerdown', (e) => {
    if (box.scrollTop > 0 || e.target.closest('input, textarea, select, .seg, .chips, .swatches')) return;
    y0 = e.clientY; t0 = performance.now(); dy = 0;
  });
  box.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    if (dy > 6) {
      // Capturar solo cuando ya es un arrastre: así los toques en botones siguen funcionando.
      if (!box.classList.contains('dragging')) { try { box.setPointerCapture(e.pointerId); } catch { /* nada */ } }
      box.classList.add('dragging');
      box.style.transform = `translateY(${dy}px)`;
    }
  });
  const end = () => {
    if (y0 === null) return;
    const v = dy / Math.max(1, performance.now() - t0);
    y0 = null;
    box.classList.remove('dragging');
    if (dy > 90 || (dy > 30 && v > 0.5)) { box.style.transform = ''; onClose(); return; }
    box.style.transition = 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)';
    box.style.transform = '';
    setTimeout(() => { box.style.transition = ''; }, 220);
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
}

export function confirmModal(title, text, { ok = 'Confirmar', danger = false, cancel = 'Cancelar' } = {}) {
  return modal({ title, body: text, actions: [{ label: cancel, value: false }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }] })
    .then((v) => v === true);
}

let toastTimer = null;
function dismiss(el) {
  if (!el || el.classList.contains('out')) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), 200);
}

export function toast(text, { action, duration = 2200 } = {}) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' }, h('span', {}, text),
    action && h('button', { class: 'toast-action', type: 'button', onClick: () => { dismiss(el); action.onClick(); } }, action.label));
  layer().append(el);
  if (duration) toastTimer = setTimeout(() => dismiss(el), duration);
  return el;
}

// Háptica sutil en iPhone (iOS 18+): tocar un <input switch> oculto produce un "tic" del sistema.
// No usa navigator.vibrate (iOS no lo tiene). En otros navegadores no hace nada.
let hapticEl = null;
export function haptic() {
  try {
    if (!hapticEl) {
      hapticEl = h('label', { class: 'haptic', 'aria-hidden': 'true' }, h('input', { type: 'checkbox', switch: true, tabindex: '-1' }));
      document.body.append(hapticEl);
    }
    hapticEl.click();
  } catch { /* sin háptica */ }
}

// Confirmación sutil de autoguardado
let savedTimer = null;
export function flashSaved() {
  let el = document.getElementById('saved');
  if (!el) { el = h('div', { id: 'saved', class: 'saved', 'aria-live': 'polite' }, 'Guardado'); layer().append(el); }
  el.classList.add('on');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove('on'), 1100);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// Hoja de compartir de iOS; si no hay, copia; si tampoco, muestra el texto para copiar a mano.
export async function shareText(text, title = 'Bitácora') {
  if (navigator.share) {
    try { await navigator.share({ text }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  if (await copyText(text)) { toast('Copiado al portapapeles'); return 'copied'; }
  const ta = h('textarea', { class: 'input mono', rows: 10, readonly: true }, text);
  await modal({ title, body: h('div', {}, h('p', { class: 'muted' }, 'Selecciona y copia el texto:'), ta) });
  return 'manual';
}

export async function shareFile(name, content, type = 'application/json') {
  const file = new File([content], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; } catch (e) { if (e?.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export function pickTextFile(accept = 'application/json,.json') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, hidden: true });
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      input.remove();
      resolve(f ? await f.text() : null);
    });
    document.body.append(input);
    input.click();
  });
}

// Mantener presionado (≈ 450 ms) sin romper el toque normal.
export function onLongPress(el, fn, ms = 450) {
  let t = null, fired = false, sx = 0, sy = 0;
  const cancel = () => { clearTimeout(t); t = null; };
  el.addEventListener('pointerdown', (e) => {
    fired = false; sx = e.clientX; sy = e.clientY;
    t = setTimeout(() => { fired = true; fn(); }, ms);
  });
  el.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) cancel(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.addEventListener(ev, cancel));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  // Si hubo long press, el click siguiente se ignora
  el.addEventListener('click', (e) => { if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; } }, true);
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint && h('span', { class: 'field-hint' }, hint));
}

// Varios archivos a la vez: [{ name, text?, buffer? }]. Los .xlsx se leen como binario.
export function pickFiles(accept, { multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, hidden: true });
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])];
      input.remove();
      resolve(await Promise.all(files.map(async (f) => (/\.xlsx$/i.test(f.name)
        ? { name: f.name, buffer: await f.arrayBuffer() }
        : { name: f.name, text: await f.text() }))));
    });
    document.body.append(input);
    input.click();
  });
}

// Sonido opcional de lápiz (Ajustes → Apariencia). Ruido corto filtrado, sin archivos.
let audio = null;
export function pencil() {
  try {
    audio = audio || new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    const len = Math.floor(audio.sampleRate * 0.07);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = 'bandpass'; filter.frequency.value = 3200; filter.Q.value = 0.8;
    gain.gain.value = 0.18;
    src.buffer = buf;
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start();
  } catch { /* sin audio */ }
}

// "+10" que sale de un elemento (XP del Sistema). Solo transform/opacity.
export function floatText(from, text, cls = '') {
  try {
    const r = from.getBoundingClientRect();
    const el = h('span', { class: `float-text ${cls}`, 'aria-hidden': 'true', style: { left: `${r.left + r.width / 2}px`, top: `${r.top}px` } }, text);
    document.getElementById('layer').append(el);
    setTimeout(() => el.remove(), 900);
  } catch { /* nada */ }
}

// Deshacer: toast con acción durante 5 s.
export function undoToast(text, onUndo) {
  return toast(text, { duration: 5000, action: { label: 'Deshacer', onClick: onUndo } });
}
