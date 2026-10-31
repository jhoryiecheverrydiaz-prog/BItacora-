// Hoja sintética con el mismo diseño del "Habit Tracker" de Sheets (sin datos personales).
import { deflateRawSync } from 'node:zlib';

const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const col = (n) => { let s = ''; for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

// habits: [{ name, done: [días] }]; inactive: días con "Días activos" = FALSE
export function trackerRows({ monthName, y, m, habits, inactive = [], len = new Date(y, m, 0).getDate(), serial = null }) {
  const W = 46, C0 = 10;
  const row = () => Array(W).fill('');
  const rows = Array.from({ length: 10 }, row);
  rows[0][10] = 'Tu progreso 👇';
  rows[1][10] = '18,7%';
  rows[1][15] = serial ?? monthName;
  rows[3][10] = 'Días Activos';
  for (let d = 1; d <= 31; d++) rows[4][C0 + d - 1] = d <= len && inactive.includes(d) ? 'FALSE' : 'TRUE';
  rows[5][10] = 'Porcentaje realizado diariamente';
  rows[6][1] = 'Hábitos';
  for (let d = 1; d <= len; d++) {
    rows[8][C0 + d - 1] = WD[new Date(y, m - 1, d).getDay()];
    rows[9][C0 + d - 1] = String(d);
  }
  rows[8][C0 + 31] = 'Actual';
  rows[8][C0 + 34] = 'Notas';
  rows[9][1] = 'Escribe tus hábitos 👇';
  habits.forEach((hb, i) => {
    const r = row();
    r[0] = String(i + 1);
    r[1] = hb.name;
    for (let d = 1; d <= 31; d++) r[C0 + d - 1] = hb.done.includes(d) ? 'TRUE' : 'FALSE';
    r[C0 + 31] = '2';
    if (hb.note) r[C0 + 34] = hb.note;
    rows.push(r);
  });
  const empty = row(); for (let d = 1; d <= 31; d++) empty[C0 + d - 1] = 'FALSE';
  rows.push(empty);
  return rows;
}

export const toCsv = (rows) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');

export function goalsRows() {
  const rows = Array.from({ length: 20 }, () => Array(14).fill(''));
  rows[1][1] = 'Metas Anuales'; rows[1][7] = 'Area'; rows[1][8] = 'Objetivos';
  rows[1][10] = 'Hábitos Diarios'; rows[1][11] = 'Hábitos Semanales'; rows[1][12] = 'Hábitos Mensuales';
  rows[2][10] = 'Ejercicio'; rows[3][10] = 'Dormir temprano'; rows[2][11] = 'Sin alcohol'; rows[5][12] = 'Plan de viaje';
  rows[2][7] = 'Fitness 🏋️‍♀️'; rows[2][8] = 'FALSE'; rows[2][9] = 'Correr 10 km';
  rows[3][8] = 'TRUE'; rows[3][9] = 'Bajar 3 kg';
  rows[4][8] = 'FALSE';
  rows[5][7] = 'Viajes ✈️'; rows[5][8] = 'FALSE'; rows[5][9] = 'Conocer el mar';
  rows[3][1] = 'Fitness 🏋️‍♀️';
  rows[4][1] = 'FALSE'; rows[4][2] = 'Correr 10 km';
  rows[5][1] = 'FALSE';
  rows[3][4] = 'Finanzas 💰';
  rows[4][4] = 'TRUE'; rows[4][5] = 'Ahorrar 1 millón';
  rows[5][4] = 'FALSE';
  return rows;
}

// .xlsx mínimo (deflate) con varias pestañas: [{ name, rows }]
export function buildXlsx(sheets) {
  const shared = [];
  const si = (s) => { let i = shared.indexOf(s); if (i < 0) { i = shared.length; shared.push(s); } return i; };
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const files = {};
  sheets.forEach((sh, n) => {
    const rowsXml = sh.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      if (v === '') return '';
      const ref = `${col(ci)}${ri + 1}`;
      if (v === 'TRUE' || v === 'FALSE') return `<c r="${ref}" t="b"><v>${v === 'TRUE' ? 1 : 0}</v></c>`;
      if (typeof v === 'number' || /^\d+$/.test(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="s"><v>${si(v)}</v></c>`;
    }).join('')}</row>`).join('');
    files[`xl/worksheets/sheet${n + 1}.xml`] = `<?xml version="1.0"?><worksheet><sheetData>${rowsXml}</sheetData></worksheet>`;
  });
  files['xl/workbook.xml'] = `<?xml version="1.0"?><workbook xmlns:r="r"><sheets>${sheets.map((s, n) => `<sheet name="${esc(s.name)}" sheetId="${n + 1}" r:id="rId${n + 1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0"?><Relationships>${sheets.map((s, n) => `<Relationship Id="rId${n + 1}" Target="worksheets/sheet${n + 1}.xml"/>`).join('')}</Relationships>`;
  files['xl/sharedStrings.xml'] = `<?xml version="1.0"?><sst>${shared.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`;
  return zip(files);
}

function zip(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nb = enc.encode(name), raw = enc.encode(content), data = deflateRawSync(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nb, data); centrals.push(ch, nb);
    offset += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  const buf = Buffer.concat([...locals, cd, end]);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}
