import { h, modal } from './dom.js';

// Guías cortas por pantalla. Se abren con el botón "?" o la primera vez que se entra.

const box = (state) => h('span', { class: `box ${state}`, 'data-c': 'c1', 'aria-hidden': 'true' });

const GUIDES = {
  hoy: {
    title: 'Cómo usar Hoy',
    body: () => h('div', {},
      h('p', {}, 'Aquí registras tu día en 2-3 minutos.'),
      h('ul', { class: 'legend-list' },
        h('li', {}, box(''), h('span', {}, h('b', {}, 'Vacío: '), 'aún no lo marcas.')),
        h('li', {}, box('full'), h('span', {}, h('b', {}, '1 toque · Completo: '), 'lo hiciste como lo planeaste.')),
        h('li', {}, box('min'), h('span', {}, h('b', {}, '2 toques · Mínimo: '), 'hiciste la versión mínima. También cuenta.')),
        h('li', {}, box(''), h('span', {}, h('b', {}, '3 toques: '), 'vuelve a vacío, por si te equivocaste.'))),
      h('p', {}, h('b', {}, 'Mantén presionado '), 'un hábito para ver su versión mínima.'),
      h('p', {}, h('b', {}, 'Tira de días: '), 'los botones con fecha arriba te dejan rellenar días anteriores. El punto hueco marca un día en blanco.'),
      h('p', {}, h('b', {}, 'Línea del día: '), 'una sola frase. Se guarda sola mientras escribes.'),
      h('p', {}, h('b', {}, 'Reportar a Claude: '), 'abajo del todo. Copia un texto listo para pegar en el chat de Claude, que lo analiza y lo anota en tu Notion.'),
    ),
  },
  mes: {
    title: 'Cómo usar Mes',
    body: () => h('div', {},
      h('p', {}, 'El mes es una libreta de dos páginas. Desliza de lado o toca los puntos de arriba para cambiar de página.'),
      h('p', {}, h('b', {}, 'Página 1 · Bitácora: '), 'la línea de cada día. Toca un día para escribir o corregir su línea.'),
      h('p', {}, h('b', {}, 'Página 2 · Hábitos: '), 'la gráfica muestra cuántos hábitos cumpliste cada día. Debajo está la cuadrícula: toca una casilla para marcarla igual que en Hoy (completo → mínimo → vacío).'),
      h('p', {}, h('b', {}, 'Columna #: '), 'cuántos hábitos cumpliste ese día.'),
      h('p', {}, h('b', {}, 'Objetivos: '), 'toca el cuadro para cambiar entre pendiente, ✓ cumplido y ✕ no cumplido.'),
      h('p', { class: 'muted small' }, 'Los días grises todavía no llegan o son de antes de tu inicio. Un mes cerrado ya no se puede marcar.'),
    ),
  },
  ajustes: {
    title: 'Qué hay en Ajustes',
    body: () => h('div', {},
      h('p', {}, h('b', {}, 'Perfil: '), 'tu nombre, el momento del día en que registras y a quién le mandas el resumen.'),
      h('p', {}, h('b', {}, 'Reportar a Claude: '), 'genera el reporte del día o de la semana cuando quieras.'),
      h('p', {}, h('b', {}, 'Hábitos: '), 'puedes corregir el texto. Agregar o quitar se hace en el cierre de mes.'),
      h('p', {}, h('b', {}, 'Datos: '), 'tus datos viven solo en este iPhone. Exporta un respaldo de vez en cuando y guárdalo en Archivos o iCloud.'),
      h('p', {}, h('b', {}, 'Recordatorio: '), 'cómo crear un aviso diario en el iPhone.'),
    ),
  },
};

export function showHelp(topic) {
  const g = GUIDES[topic];
  return modal({ title: g.title, body: g.body() });
}

export function helpButton(topic) {
  return h('button', { class: 'help-btn', type: 'button', 'aria-label': `Ayuda: ${GUIDES[topic].title}`, onClick: () => showHelp(topic) }, '?');
}

// Recordar que la guía ya se vio (comodidad por dispositivo; si falla, se vuelve a mostrar).
const seenKey = (topic) => `guia-${topic}`;
export function guideSeen(topic) {
  try { return localStorage.getItem(seenKey(topic)) === '1'; } catch { return true; }
}
export function markGuideSeen(topic) {
  try { localStorage.setItem(seenKey(topic), '1'); } catch { /* modo privado */ }
}

// Tarjeta de bienvenida que aparece hasta que la cierras.
export function guideCard(topic, text, onClose) {
  if (guideSeen(topic)) return null;
  return h('div', { class: 'guide-card' },
    h('p', {}, text),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onClick: () => showHelp(topic) }, 'Ver guía'),
      h('button', { class: 'btn ghost', type: 'button', onClick: () => { markGuideSeen(topic); onClose(); } }, 'Ya entendí')));
}
