// Postal del mes: imagen (PNG) con la cuadrícula, el % y el mantra, para guardar o compartir.
// Se dibuja en <canvas> con los colores del tema actual. Nada sale del teléfono salvo que la compartas.
import { shareFile, toast } from './dom.js';
import { monthTitle, monthLength, dayKeyOf } from '../core/dates.js';
import { monthStats } from '../core/stats.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function drawPostcard(month, today) {
  const W = 1080, H = 1350, P = 80;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const paper = css('--paper') || '#f6f3ea', ink = css('--ink') || '#1d2126', ink3 = css('--ink-3') || '#6e747b', rule = css('--rule-strong') || '#ccc';
  g.fillStyle = paper; g.fillRect(0, 0, W, H);
  // cuadrícula de libreta
  g.strokeStyle = rule; g.globalAlpha = 0.35; g.lineWidth = 1;
  for (let x = 0; x < W; x += 36) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 36) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.globalAlpha = 1;
  const st = monthStats(month, today);
  g.fillStyle = ink; g.font = '700 64px ui-rounded, -apple-system, system-ui, sans-serif';
  g.fillText(monthTitle(month.key).replace(/^./, (s) => s.toUpperCase()), P, P + 60);
  g.font = '800 150px ui-rounded, -apple-system, system-ui, sans-serif';
  g.fillText(st.pct === null ? '—' : `${Math.round(st.pct * 100)} %`, P, P + 230);
  g.fillStyle = ink3; g.font = '400 34px -apple-system, system-ui, sans-serif';
  g.fillText(`${st.daysRegistered}/${st.daysElapsed} días registrados · ${st.perfectDays} días al 100 %`, P, P + 290);
  // cuadrícula de hábitos: columnas = días, filas = hábitos
  const len = monthLength(month.key);
  const top = P + 360, rowH = 64, gridW = W - 2 * P - 150;
  const cw = gridW / len;
  month.habits.forEach((hb, r) => {
    const y = top + r * rowH;
    const color = css(`--${hb.color}`) || ink;
    g.fillStyle = color; g.font = '700 30px -apple-system, system-ui, sans-serif';
    g.fillText(hb.short, P, y + 40);
    for (let d = 1; d <= len; d++) {
      const key = dayKeyOf(month.key, d);
      const v = month.days[key]?.checks?.[hb.id];
      const x = P + 150 + (d - 1) * cw;
      g.globalAlpha = v === 'full' ? 1 : v === 'min' ? 0.45 : 0.12;
      g.fillStyle = v ? color : ink3;
      g.fillRect(x + 2, y + 12, cw - 4, rowH - 24);
    }
    g.globalAlpha = 1;
  });
  const afterGrid = top + month.habits.length * rowH + 60;
  if (month.mantra) {
    g.fillStyle = ink; g.font = 'italic 44px Noteworthy, "Bradley Hand", ui-rounded, cursive';
    g.fillText(`“${month.mantra}”`, P, Math.min(H - 160, afterGrid + 40));
  }
  g.fillStyle = ink3; g.font = '400 28px -apple-system, system-ui, sans-serif';
  g.fillText('Bitácora', P, H - P);
  return c;
}

export async function sharePostcard(month, today) {
  const canvas = drawPostcard(month, today);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) { toast('No pude crear la imagen'); return; }
  await shareFile(`bitacora-${month.key}.png`, blob, 'image/png');
}
