import { h } from './dom.js';

const ICON_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
const ICON_ADD = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';
const ICON_TAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3.5"/><path d="M8.5 15l2.5-3 2 2 2.5-4"/></svg>';

export function isStandalone() {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

export function renderInstall(root, { onContinue }) {
  const step = (n, icon, title, text) => h('li', { class: 'install-step' },
    h('span', { class: 'install-icon', html: icon }),
    h('div', {}, h('strong', {}, `${n}. ${title}`), h('p', { class: 'muted' }, text)));

  root.append(h('section', { class: 'page install' },
    h('h1', { class: 'hand' }, 'Bitácora'),
    h('p', { class: 'lead' }, 'Instálala en tu pantalla de inicio antes de configurarla.'),
    h('ol', { class: 'install-steps' },
      step(1, ICON_SHARE, 'Compartir', 'En Safari, toca el botón Compartir (abajo o arriba, según tu iPhone).'),
      step(2, ICON_ADD, 'Añadir a pantalla de inicio', 'Busca la opción en la lista y confirma con "Añadir".'),
      step(3, ICON_TAP, 'Abre desde el ícono', 'Cierra Safari y entra por el ícono nuevo de Bitácora.'),
    ),
    h('p', { class: 'note' }, 'Configúrala desde el ícono, no desde Safari: son memorias separadas. Lo que hagas aquí no aparece allá.'),
    h('button', { class: 'linklike small', type: 'button', onClick: onContinue }, 'Continuar en el navegador igual'),
  ));
}
