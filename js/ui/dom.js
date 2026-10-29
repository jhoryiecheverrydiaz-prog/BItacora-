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
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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
      wrap.remove();
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
    layer().append(wrap);
    document.addEventListener('keydown', onKey);
    (box.querySelector('input, textarea') || box.querySelector('.btn.primary') || box.querySelector('.btn'))?.focus();
  });
}

export function confirmModal(title, text, { ok = 'Confirmar', danger = false, cancel = 'Cancelar' } = {}) {
  return modal({ title, body: text, actions: [{ label: cancel, value: false }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }] })
    .then((v) => v === true);
}

let toastTimer = null;
export function toast(text, { action, duration = 2200 } = {}) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' }, h('span', {}, text),
    action && h('button', { class: 'toast-action', type: 'button', onClick: () => { el.remove(); action.onClick(); } }, action.label));
  layer().append(el);
  if (duration) toastTimer = setTimeout(() => el.remove(), duration);
  return el;
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
