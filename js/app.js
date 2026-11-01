import { todayKey, isDateKey } from './core/dates.js';
import { emptyState, closeStatus, currentMonth, applyFixedOff } from './core/months.js';
import { migrate } from './core/migrate.js';
import * as store from './store.js';
import { h, clear, toast, flashSaved, shareFile, modal } from './ui/dom.js';
import { applyTheme } from './ui/theme.js';
import { isStandalone, renderInstall } from './ui/install.js';
import { renderOnboarding, useAreas } from './ui/onboarding.js';
import { renderToday } from './ui/today.js';
import { renderMonth } from './ui/month.js';
import { renderReview } from './ui/review.js';
import { renderSettings } from './ui/settings.js';
import { renderYear } from './ui/year.js';
import { renderSystem } from './ui/system.js';
import { gameStats, progressNews, seenFrom } from './core/game.js';

export const APP_VERSION = '2.3.0';

// Lo nuevo de esta versión (se muestra una vez tras actualizar).
const WHATS_NEW = [
  ['Hoy se ordena solo', 'Lo que toca a esta hora queda arriba; lo hecho baja. Elige el momento de cada hábito en Ajustes → Mi rutina → Ajustar, o deja que la app lo aprenda de tu hora real.'],
  ['Gestos', 'Mantén presionado un hábito para el mínimo. Mantén presionado un día de la tira para rellenarlo. Doble toque en el contador para completar lo que falta. Desliza a los lados para cambiar de día.'],
  ['Deshacer', 'Borrar en el Plan o rellenar un día se deshace desde el aviso de abajo.'],
  ['Tu horario real', 'Mes → Hábitos te dice a qué hora sueles marcar cada hábito, y Ajustes te sugiere mover el recordatorio si no coincide.'],
  ['A tu gusto', 'Ajustes → Apariencia: papel, tono, tamaño del texto, modo compacto, noche cálida y sonido de lápiz.'],
  ['Más', 'Días libres fijos, temporada ligera, buscar en tus notas (Año), notas destacadas ★ y exportar a CSV.'],
];

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
  perf: [], // mediciones de render (solo se muestran en modo debug)
  showWhatsNew: (force = false) => showWhatsNew(force),
  // Hora local (en debug se puede simular con ?hora=H para probar las franjas del día).
  hour() {
    const sim = DEBUG ? Number(new URLSearchParams(location.search).get('hora')) : NaN;
    return Number.isInteger(sim) && sim >= 0 && sim < 24 ? sim : new Date().getHours();
  },
  browserOk: () => ls.get('browserOk') === '1',
};

// Sistema: tras cada guardado, avisa subidas de nivel, rango y títulos (una vez cada cosa).
function checkGame() {
  const s = ctx.state;
  if (!s?.meta?.game?.enabled || !s.profile) return;
  const g = gameStats(s, ctx.today);
  const news = progressNews(g, s.meta.game.seen);
  if (!s.meta.game.seen || news.length) {
    s.meta.game.seen = seenFrom(g);
    store.saveSoon(s);
  }
  if (news.length) toast(`[SISTEMA] ${news.join(' · ')}`, { duration: 4000 });
}

store.onSaved(() => { flashSaved(); checkGame(); });

// Rutas: #hoy, #mes… y accesos directos del ícono (#hoy/linea enfoca la línea del día).
function route() {
  const [r, sub] = (location.hash.slice(1) || '').split('/');
  if (sub === 'linea') ctx.focusLine = true;
  return r || startTab();
}

// Pestaña de inicio elegida en Ajustes (solo al abrir sin ruta).
function startTab() {
  const t = ctx.state?.meta?.prefs?.startTab;
  return t === 'mes' || (t === 'sistema' && ctx.state?.meta?.game?.enabled) ? t : 'hoy';
}

let lastRoute = null;
function render() {
  const t0 = performance.now();
  const keepY = window.scrollY;
  clear(view);
  applyTheme(ctx.state, ctx.today, ctx.hour());
  const s = ctx.state;
  useAreas(s.areas);
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
    if (!['cierre', 'ajustes', 'ano', 'sistema'].includes(r) && !currentMonth(s, ctx.today)) r = 'sinmes';
  }

  const gameOn = !!s.meta?.game?.enabled;
  if (r === 'sistema' && (!gameOn || !s.profile)) r = 'hoy';
  tabs.querySelector('[data-tab="sistema"]').hidden = !gameOn;
  const withTabs = ['hoy', 'mes', 'ano', 'sistema', 'ajustes', 'sinmes'].includes(r);
  tabs.hidden = !withTabs;
  document.body.classList.toggle('has-tabs', withTabs);
  document.body.classList.toggle('sys-mode', r === 'sistema');
  for (const a of tabs.querySelectorAll('a')) {
    const on = a.dataset.tab === r;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }

  const views = { onboarding: renderOnboarding, cierre: renderReview, hoy: renderToday, mes: renderMonth, ajustes: renderSettings, ano: renderYear, sistema: renderSystem, sinmes: renderNoMonth };
  (views[r] || renderToday)(view, ctx);
  // Cambiar de sección: entra con un fundido corto y arriba. Redibujar la misma sección: conserva el scroll.
  if (r !== lastRoute) {
    window.scrollTo(0, 0);
    if (lastRoute && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
    }
  } else window.scrollTo(0, keepY);
  lastRoute = r;
  const ms = performance.now() - t0;
  ctx.perf.push({ view: r, ms });
  if (ctx.perf.length > 60) ctx.perf.shift();
  if (r === 'hoy' || r === 'mes' || r === 'ano') showWhatsNew();
}

// Novedades: una vez por versión, nunca en la primera instalación ni en medio del onboarding.
let whatsNewOpen = false;
async function showWhatsNew(force = false) {
  const s = ctx.state;
  if (!s?.profile || whatsNewOpen) return;
  if (!force) {
    if (s.meta.seenVersion === APP_VERSION) return;
    if (!s.meta.seenVersion && s.meta.lastOpenedDate === s.profile.createdAt) { s.meta.seenVersion = APP_VERSION; ctx.save(); return; }
  }
  s.meta.seenVersion = APP_VERSION;
  ctx.save();
  whatsNewOpen = true;
  await modal({ title: `Novedades · ${APP_VERSION}`, body: h('div', { class: 'whatsnew' }, h('ul', {}, WHATS_NEW.map(([t, d]) => h('li', {}, h('b', {}, t), '. ', d)))) });
  whatsNewOpen = false;
}

// Tocar la pestaña en la que ya estás sube al inicio (convención de iOS), sin redibujar.
tabs.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-tab]');
  if (a && a.dataset.tab === route()) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
});

function renderNoMonth(root) {
  root.append(h('section', { class: 'page' }, h('h1', {}, 'Sin mes para esta fecha'),
    h('p', { class: 'muted' }, 'La fecha de hoy es anterior a tu primer mes registrado. Revisa la hora del teléfono.')));
}

// --- Service worker y actualizaciones ---
let reg = null;
let reloading = false;
let updateRequested = false;

async function applyUpdate() {
  await store.flush();
  updateRequested = true;
  reg.waiting?.postMessage('SKIP_WAITING');
}

// La versión nueva se aplica sola al abrir la app (arranque en frío). Si llega con la app abierta,
// solo se avisa unos segundos sin tapar nada; no hace falta tocarlo.
function offerUpdate() {
  toast('Versión nueva lista: se aplica al volver a abrir', { duration: 5000, action: { label: 'Ahora', onClick: applyUpdate } });
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
    if (r.waiting && navigator.serviceWorker.controller) {
      // Recién abierta (primeros segundos): se aplica sin preguntar.
      if (performance.now() < 4000) applyUpdate(); else offerUpdate();
    }
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
  if (ctx.state.profile && applyFixedOff(ctx.state, ctx.today)) ctx.save();
  window.addEventListener('hashchange', render);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { store.flush(); return; }
    const t = computeToday();
    if (t !== ctx.today) {
      ctx.today = t;
      if (ctx.state.profile && applyFixedOff(ctx.state, t)) ctx.save();
      render();
    }
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
