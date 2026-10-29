import { todayKey, isDateKey } from './core/dates.js';
import { emptyState, closeStatus, currentMonth } from './core/months.js';
import { migrate } from './core/migrate.js';
import * as store from './store.js';
import { h, clear, toast, flashSaved, shareFile } from './ui/dom.js';
import { isStandalone, renderInstall } from './ui/install.js';
import { renderOnboarding } from './ui/onboarding.js';
import { renderToday } from './ui/today.js';
import { renderMonth } from './ui/month.js';
import { renderReview } from './ui/review.js';
import { renderSettings } from './ui/settings.js';

export const APP_VERSION = '1.2.0';

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* modo privado */ } },
};

const DEBUG = ls.get('debug') === '1';

// ?fecha=YYYY-MM-DD solo con localStorage.debug === "1"
function computeToday() {
  if (DEBUG) {
    const f = new URLSearchParams(location.search).get('fecha');
    if (isDateKey(f)) return f;
  }
  return todayKey();
}

const view = document.getElementById('view');
const tabs = document.getElementById('tabs');

const ctx = {
  state: null,
  today: computeToday(),
  version: APP_VERSION,
  debug: DEBUG,
  save() { store.saveSoon(ctx.state); },
  saveNow() { return store.saveNow(ctx.state); },
  async replaceState(next) {
    ctx.state = next;
    await store.saveNow(next);
    render();
  },
  go(route) {
    if (location.hash === `#${route}`) render();
    else location.hash = route;
  },
  render: () => render(),
  backup: (reason) => store.addBackup(ctx.state, reason),
  async exportBackup() {
    const name = `bitacora-respaldo-${ctx.today}.json`;
    const ok = await shareFile(name, JSON.stringify(ctx.state, null, 1));
    if (ok) {
      ctx.state.meta.lastBackupAt = ctx.today;
      await ctx.saveNow();
    }
    return ok;
  },
  checkForUpdate: () => checkForUpdate(true),
  browserOk: () => ls.get('browserOk') === '1',
};

store.onSaved(() => flashSaved());

function route() {
  return location.hash.slice(1) || 'hoy';
}

function render() {
  clear(view);
  const s = ctx.state;
  let r = route();

  if (!isStandalone() && !ctx.browserOk()) {
    tabs.hidden = true;
    return renderInstall(view, { onContinue: () => { ls.set('browserOk', '1'); render(); } });
  }
  if (!s.profile || s.meta.onboardingDraft) r = 'onboarding';
  else {
    const cs = closeStatus(s, ctx.today);
    if (cs && !cs.snoozedToday) r = 'cierre';
    else if (r === 'cierre' && !cs) r = 'hoy';
    else if (r === 'onboarding') r = 'hoy';
    if (!['cierre', 'ajustes'].includes(r) && !currentMonth(s, ctx.today)) r = 'sinmes';
  }

  const withTabs = ['hoy', 'mes', 'ajustes', 'sinmes'].includes(r);
  tabs.hidden = !withTabs;
  document.body.classList.toggle('has-tabs', withTabs);
  for (const a of tabs.querySelectorAll('a')) {
    const on = a.dataset.tab === r;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }

  const views = { onboarding: renderOnboarding, cierre: renderReview, hoy: renderToday, mes: renderMonth, ajustes: renderSettings, sinmes: renderNoMonth };
  (views[r] || renderToday)(view, ctx);
  window.scrollTo(0, 0);
}

function renderNoMonth(root) {
  root.append(h('section', { class: 'page' }, h('h1', {}, 'Sin mes para esta fecha'),
    h('p', { class: 'muted' }, 'La fecha de hoy es anterior a tu primer mes registrado. Revisa la hora del teléfono.')));
}

// --- Service worker y actualizaciones ---
let reg = null;
let reloading = false;
let updateRequested = false;

function offerUpdate() {
  toast('Hay una versión nueva', {
    duration: 0,
    action: { label: 'Actualizar', onClick: async () => { await store.flush(); updateRequested = true; reg.waiting?.postMessage('SKIP_WAITING'); } },
  });
}

async function checkForUpdate(manual = false) {
  if (!reg) { if (manual) toast('Sin service worker en este modo'); return; }
  try { await reg.update(); } catch { if (manual) toast('Sin conexión'); return; }
  if (reg.waiting) offerUpdate();
  else if (reg.installing) toast('Descargando versión nueva…');
  else if (manual) toast(`Tienes la última versión (${APP_VERSION})`);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Solo recarga si el usuario pidió actualizar (no en la primera instalación).
    if (reloading || !updateRequested) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((r) => {
    reg = r;
    if (r.waiting && navigator.serviceWorker.controller) offerUpdate();
    r.addEventListener('updatefound', () => {
      const w = r.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate();
      });
    });
  }).catch(() => { /* sin SW: la app funciona igual en línea */ });
}

// --- Arranque ---
async function boot() {
  let raw = null;
  try {
    raw = await store.load();
    ctx.state = raw ? migrate(raw) : emptyState();
  } catch (e) {
    return renderBroken(e, raw);
  }
  if (ctx.state.profile && ctx.state.meta.lastOpenedDate !== ctx.today) {
    ctx.state.meta.lastOpenedDate = ctx.today;
    ctx.save();
  }
  window.addEventListener('hashchange', render);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { store.flush(); return; }
    const t = computeToday();
    if (t !== ctx.today) { ctx.today = t; render(); }
  });
  window.addEventListener('pagehide', () => store.flush());
  render();
  registerSW();
}

function renderBroken(err, raw) {
  view.append(h('section', { class: 'page' },
    h('h1', {}, 'No pude leer tus datos'),
    h('p', {}, String(err.message || err)),
    raw && h('button', { class: 'btn primary', type: 'button', onClick: () => shareFile(`bitacora-rescate-${ctx.today}.json`, JSON.stringify(raw)) }, 'Exportar datos tal cual'),
  ));
}

boot();
