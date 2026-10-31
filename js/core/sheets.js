// Importar el "Habit Tracker" de Google Sheets (una pestaña por mes + pestaña "Metas").
// Acepta el libro completo (.xlsx: Archivo → Descargar → Microsoft Excel) o pestañas en CSV.
// Lógica pura: sin DOM. La lectura de .xlsx usa DecompressionStream (Safari 16.4+, Node 18+).
import { MONTHS, keyFromParts, dayKeyOf, monthLength, monthKey, mondayIndex } from './dates.js';
import { makeHabit, makeMonth, autoShort, validateHabitList, MAX_HABITS, MAX_SHORT, MAX_GOALS_STORED, newId, dayIsInRange } from './months.js';
import { countHabit } from './stats.js';
import { parseAmount, MAX_WEEK_GOALS, MAX_EVENTS, MAX_BILLS } from './plan.js';
import { normName, splitEmoji, findArea, addArea, addYearGoal, goalsOf, ideasOf, addHabitIdea, MAX_AREAS, MAX_YEAR_GOALS, MAX_IDEAS } from './years.js';

export const IMPORTED_MIN = 'Registrado en Sheets';

// ---------- CSV ----------

export function parseCsv(text) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const firstLine = s.split(/\r?\n/, 1)[0];
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---------- XLSX (zip + XML mínimo) ----------

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function unzip(buffer) {
  const b = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('el archivo no es un .xlsx válido');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const files = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (u32(b, p) !== 0x02014b50) throw new Error('el .xlsx está dañado');
    const method = u16(b, p + 10), size = u32(b, p + 20);
    const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    files[name] = async () => {
      const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
      const raw = b.subarray(start, start + size);
      if (method === 0) return dec.decode(raw);
      if (method === 8) return dec.decode(await inflateRaw(raw));
      throw new Error('compresión del .xlsx no soportada');
    };
  }
  return files;
}

const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const textOf = (xml) => unxml([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Celdas: booleanos → "TRUE"/"FALSE"; números tal cual (fechas quedan como serial de Excel).
function sheetRows(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(attr(rm[1], 'r')) - 1;
    const row = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r');
      if (!ref) continue;
      const t = attr(cm[1], 't');
      const inner = cm[2] || '';
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = '';
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (t === 'inlineStr') val = textOf(inner);
      else if (v !== undefined) val = unxml(v);
      row[colIndex(ref)] = val;
    }
    rows[r] = Array.from(row, (x) => x ?? '');
  }
  return Array.from(rows, (x) => x ?? []);
}

export async function readXlsx(buffer) {
  const files = await unzip(buffer);
  const need = async (n) => { if (!files[n]) throw new Error(`falta ${n} en el .xlsx`); return files[n](); };
  const shared = files['xl/sharedStrings.xml']
    ? [...(await files['xl/sharedStrings.xml']()).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    : [];
  const wb = await need('xl/workbook.xml');
  const rels = await need('xl/_rels/workbook.xml.rels');
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) target[attr(m[1], 'Id')] = attr(m[1], 'Target');
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unxml(attr(m[1], 'name') || '');
    let path = target[attr(m[1], 'r:id')] || '';
    path = path.startsWith('/') ? path.slice(1) : `xl/${path}`;
    if (!files[path]) continue;
    sheets.push({ name, rows: sheetRows(await files[path](), shared) });
  }
  return sheets;
}

// ---------- Interpretación de una pestaña ----------

const BOOL = { true: true, verdadero: true, false: false, falso: false };
const asBool = (v) => BOOL[String(v ?? '').trim().toLowerCase()];
const isBoolCell = (v) => asBool(v) !== undefined;
const WD = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

export function monthFromText(s) {
  const n = normName(s);
  const i = MONTHS.findIndex((m) => n === m || n === m.slice(0, 3) || (m === 'septiembre' && n === 'setiembre'));
  return i >= 0 ? i + 1 : null;
}

// Serial de Excel/Sheets → { y, m }
function serialToYm(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}

// Año más reciente (≤ hoy) en que el día 1 de `month` cae en `weekday` (0 = domingo).
export function inferYear(month, weekday, today) {
  const ty = Number(today.slice(0, 4));
  const cur = monthKey(today);
  for (let y = ty; y >= ty - 12; y--) {
    const key = keyFromParts(y, month, 1);
    if (monthKey(key) > cur) continue;
    if (weekday === null || weekday === undefined || (mondayIndex(key) + 1) % 7 === weekday) return y;
  }
  return ty;
}

const num = (v) => { const t = String(v ?? '').trim(); return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN; };

// Encabezado de días: 1, 2, 3… consecutivos (CSV) o fechas seriales consecutivas (.xlsx,
// donde la fila es =K9+1 y solo el formato la muestra como "1"). Toma la fila más baja.
function findDayHeader(rows) {
  let found = null;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const first = num(row[c]);
      if (!(first === 1 || (first >= 20000 && first < 80000 && Number.isInteger(first)))) continue;
      let n = 1;
      while (num(row[c + n]) === first + n) n++;
      if (n >= 28) { found = { r, c, n, serial: first === 1 ? null : first }; break; }
    }
    if (found && found.r !== r) break;
  }
  return found;
}

/**
 * Interpreta una pestaña mensual. Devuelve null si no parece un tracker.
 * → { name, month, year, yearSource, days, active: bool[], habits: [{ name, done: number[], count }] }
 */
export function parseTrackerSheet(rows, { name = '', today }) {
  const hd = findDayHeader(rows);
  if (!hd) return null;
  const { r: hr, c: c0 } = hd;

  let month = monthFromText(name.replace(/\.(csv|xlsx)$/i, '').split(/[-_ ]/).pop()) || monthFromText(name.replace(/\.(csv|xlsx)$/i, ''));
  let year = null, yearSource = null;
  for (let r = 0; r < hr && (!month || !year); r++) for (const cell of rows[r] || []) {
    const v = String(cell ?? '').trim();
    if (!month && monthFromText(v)) month = monthFromText(v);
    if (!year && /^\d{5}(\.\d+)?$/.test(v)) {
      const ym = serialToYm(Number(v));
      if (ym.y >= 2000 && ym.y <= 2100 && (!month || ym.m === month)) { year = ym.y; month ||= ym.m; yearSource = 'fecha'; }
    }
  }
  if (hd.serial) { const ym = serialToYm(hd.serial); month = ym.m; year = ym.y; yearSource = 'fecha'; }
  if (!month) return null;

  // Fila de días de la semana (lun, mar…) justo encima del encabezado → año por calendario.
  if (!year) {
    let wd = null;
    for (let r = hr - 1; r >= Math.max(0, hr - 3) && wd === null; r--) {
      const i = WD.indexOf(normName(rows[r]?.[c0]).slice(0, 3));
      if (i >= 0) wd = i;
    }
    year = inferYear(month, wd, today);
    yearSource = wd === null ? 'supuesto' : 'calendario';
  }
  const days = Math.min(hd.n, monthLength(keyFromParts(year, month, 1).slice(0, 7)));

  // "Días activos": la fila de booleanos más cercana por encima del encabezado.
  let active = Array(days).fill(true);
  for (let r = hr - 1; r >= 0; r--) {
    const cells = (rows[r] || []).slice(c0, c0 + days);
    if (cells.length === days && cells.every(isBoolCell)) { active = cells.map(asBool); break; }
  }

  // Columna "Notas" (a la derecha de los días, en el encabezado o la fila de arriba).
  let notesCol = -1;
  for (let r = Math.max(0, hr - 2); r <= hr && notesCol < 0; r++) {
    (rows[r] || []).forEach((v, c) => { if (c >= c0 + days && normName(v) === 'notas' && notesCol < 0) notesCol = c; });
  }

  // Columna de nombres: la del texto "Escribe tus hábitos"/"Hábitos" a la izquierda de los días.
  let labelCol = -1;
  for (let r = hr; r >= Math.max(0, hr - 4) && labelCol < 0; r--) {
    (rows[r] || []).slice(0, c0).forEach((v, c) => { if (labelCol < 0 && normName(v).startsWith('escribe tus habitos')) labelCol = c; });
  }
  for (let r = hr; r >= Math.max(0, hr - 4) && labelCol < 0; r--) {
    (rows[r] || []).slice(0, c0).forEach((v, c) => { if (labelCol < 0 && normName(v) === 'habitos') labelCol = c; });
  }
  const isNum = (x) => /^\d+(\.\d+)?$/.test(x);
  const labelOf = (row) => {
    const cells = row.slice(Math.max(0, labelCol), c0);
    return cells.map((x) => String(x ?? '').trim()).find((x) => x && !isNum(x) && !isBoolCell(x));
  };
  // Las secciones de abajo (metas, objetivos, eventos, facturas) cortan la tabla de hábitos.
  let endRow = rows.length;
  for (let r = hr + 1; r < rows.length && endRow === rows.length; r++) {
    if ((rows[r] || []).some((v) => SECTION_TITLES.some((t) => normName(v).startsWith(t)))) endRow = r;
  }

  const habits = [];
  for (let r = hr + 1; r < endRow; r++) {
    const row = rows[r] || [];
    const cells = row.slice(c0, c0 + days);
    if (!cells.some(isBoolCell)) continue;
    const label = labelOf(row);
    if (!label) continue;
    const done = [];
    cells.forEach((v, i) => { if (asBool(v) === true) done.push(i + 1); });
    const note = notesCol >= 0 ? String(row[notesCol] ?? '').trim().slice(0, 140) : '';
    const nm = label.slice(0, 40);
    const dup = habits.find((x) => normName(x.name) === normName(nm));
    if (dup) { // filas repetidas con el mismo nombre: se unen
      dup.done = [...new Set([...dup.done, ...done])].sort((a, b) => a - b);
      dup.count = dup.done.length;
      if (!dup.note && note) dup.note = note;
      continue;
    }
    habits.push({ name: nm, done, count: done.length, ...(note ? { note } : {}) });
  }
  return { name, month, year, yearSource, days, active, habits, ...parseMonthPlan(rows, endRow, days) };
}

const SECTION_TITLES = ['tareas realizadas', 'premios', 'metas mensuales', 'objetivos semanales', 'objetivos semana', 'eventos importantes', 'facturas mensuales'];

// Día de una celda de fecha: serial (.xlsx), "15/10", "15-10-2025", "15".
function dayFromCell(v, days) {
  const t = String(v ?? '').trim();
  if (!t) return null;
  const n = num(t);
  if (n >= 20000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).getUTCDate(); return d <= days ? d : null; }
  const m = t.match(/^(\d{1,2})(?:[/.-]\d{1,2}(?:[/.-]\d{2,4})?)?$/);
  const d = m ? Number(m[1]) : NaN;
  return d >= 1 && d <= days ? d : null;
}

/**
 * Parte de abajo de la pestaña: metas mensuales, objetivos semanales, eventos y facturas.
 * → { monthGoals: [{ text, done }], weekGoals: [{ week, text, done }], events: [{ day, text, done }], bills: [{ day, text, amount, paid }] }
 */
export function parseMonthPlan(rows, fromRow, days) {
  const at = (r, c) => String(rows[r]?.[c] ?? '').trim();
  const out = { monthGoals: [], weekGoals: [], events: [], bills: [] };
  const titleAt = (r, c) => SECTION_TITLES.some((t) => normName(at(r, c)).startsWith(t));
  // Celdas que no son contenido: números de fórmulas, enlaces y el pie de la plantilla.
  const junk = (t) => /^-?\d+([.,]\d+)?%?$/.test(t) || /^https?:\/\//i.test(t) || /^(siguenos|task count|done count)/.test(normName(t));
  const checklist = (r, c, push) => {
    for (let k = r + 1; k < Math.min(rows.length, r + 12); k++) {
      if (titleAt(k, c) || junk(at(k, c))) break;
      const text = at(k, c + 1);
      if (text && !isBoolCell(text) && !junk(text)) push(text.slice(0, 120), asBool(at(k, c)) === true);
    }
  };
  for (let r = fromRow; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const n = normName(row[c]);
      if (!n) continue;
      if (n.startsWith('metas mensuales')) checklist(r, c, (text, done) => out.monthGoals.push({ text, done }));
      else if (n.startsWith('objetivos semanales')) checklist(r, c, (text, done) => out.weekGoals.push({ week: 0, text, done }));
      else if (/^objetivos semana \d/.test(n)) {
        const week = Math.min(5, Number(n.match(/\d+/)[0]));
        checklist(r, c, (text, done) => out.weekGoals.push({ week, text, done }));
      } else if (n.startsWith('eventos importantes') || n.startsWith('facturas mensuales')) {
        const bills = n.startsWith('facturas');
        // Fila de encabezados (Fecha, Evento/Descripción, $, ✔️) en las 2 filas siguientes.
        let hr = -1;
        for (let k = r; k <= r + 2 && hr < 0; k++) if (normName(at(k, c)) === 'fecha') hr = k;
        if (hr < 0) continue;
        const hrow = rows[hr] || [];
        const colOf = (test) => hrow.findIndex((v, i) => i > c && test(String(v ?? '').trim()));
        const textCol = c + 1;
        const amountCol = bills ? colOf((v) => v === '$' || normName(v) === 'valor' || normName(v) === 'monto') : -1;
        const checkCol = colOf((v) => /✔|✓|☑/.test(v) || normName(v) === 'pagado' || normName(v) === 'hecho');
        for (let k = hr + 1; k < Math.min(rows.length, hr + 30); k++) {
          if (titleAt(k, c) || normName(at(k, textCol)) === 'total' || normName(at(k, amountCol)) === 'total') break;
          const text = at(k, textCol);
          if (!text || isBoolCell(text) || junk(text)) continue;
          const day = dayFromCell(at(k, c), days);
          const done = checkCol >= 0 && asBool(at(k, checkCol)) === true;
          if (bills) {
            const a = parseAmount(at(k, amountCol));
            out.bills.push({ day, text: text.slice(0, 80), amount: Number.isNaN(a) ? null : a, paid: done });
          } else out.events.push({ day, text: text.slice(0, 120), done });
        }
      }
    }
  }
  return out;
}

/**
 * Pestaña "Metas": bloques de área (título con emoji) seguidos de casillas + texto.
 * Soporta los dos diseños del tracker: área arriba (casilla en la misma columna, texto a la derecha)
 * y área a la izquierda (casilla y texto en las columnas siguientes). → [{ name, emoji, goals: [{ text, done }] }]
 */
export function parseGoalsSheet(rows) {
  const out = new Map();
  const add = (title, text, done) => {
    const { name, emoji } = splitEmoji(title);
    const k = normName(name);
    if (!k) return;
    if (!out.has(k)) out.set(k, { name, emoji, goals: [], ideas: [] });
    const a = out.get(k);
    if (!a.emoji && emoji) a.emoji = emoji;
    const t = String(text ?? '').trim();
    if (t && !a.goals.some((g) => normName(g.text) === normName(t))) a.goals.push({ text: t.slice(0, 120), done: !!done });
  };
  const at = (r, c) => String(rows[r]?.[c] ?? '').trim();
  const isTitle = (v) => v && !isBoolCell(v) && splitEmoji(v).emoji;
  const H = rows.length, W = Math.max(0, ...rows.map((r) => r?.length || 0));
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const v = at(r, c);
    if (!isTitle(v)) continue;
    if (isBoolCell(at(r + 1, c))) { // área arriba
      for (let k = r + 1; k < H && isBoolCell(at(k, c)); k++) add(v, at(k, c + 1), asBool(at(k, c)));
      add(v, '', false);
    } else if (isBoolCell(at(r, c + 1))) { // área a la izquierda
      for (let k = r; k < H && isBoolCell(at(k, c + 1)) && (k === r || !at(k, c)); k++) add(v, at(k, c + 2), asBool(at(k, c + 1)));
    }
  }
  // Plan anual de hábitos: columnas "Hábitos diarios / semanales / mensuales" junto a "Área".
  const FREQ = { 'habitos diarios': 'daily', 'habitos semanales': 'weekly', 'habitos mensuales': 'monthly' };
  for (let r = 0; r < H; r++) {
    const cols = {};
    let areaCol = -1;
    for (let c = 0; c < W; c++) {
      const n = normName(at(r, c));
      if (FREQ[n]) cols[c] = FREQ[n];
      if (n === 'area') areaCol = c;
    }
    if (!Object.keys(cols).length || areaCol < 0) continue;
    let title = '';
    for (let k = r + 1; k < H; k++) {
      if (isTitle(at(k, areaCol))) title = at(k, areaCol);
      if (!title) continue;
      add(title, '', false);
      const a = out.get(normName(splitEmoji(title).name));
      for (const [c, freq] of Object.entries(cols)) {
        const t = at(k, Number(c));
        if (t && !isBoolCell(t) && !a.ideas.some((x) => normName(x.text) === normName(t) && x.freq === freq)) a.ideas.push({ text: t.slice(0, 40), freq });
      }
    }
  }
  return [...out.values()];
}

// ---------- Plan de importación ----------

/**
 * sources = [{ name, rows }] (pestañas del .xlsx o CSV sueltos).
 * → { months: [parsed + key + status + selected], goals: [...] | null, skipped: [nombres] }
 * status: 'new' (mes cerrado de historial), 'merge' (mes ya existe y está abierto), 'closed', 'future', 'empty'
 */
export function planImport(state, sources, today) {
  const months = new Map();
  let goals = null;
  const skipped = [];
  for (const src of sources) {
    const p = parseTrackerSheet(src.rows, { name: src.name, today });
    if (p) {
      const key = `${p.year}-${String(p.month).padStart(2, '0')}`;
      const existing = state.months[key];
      const total = p.habits.reduce((s, x) => s + x.count, 0) + planSize(p);
      const status = key > monthKey(today) ? 'future' : !total ? 'empty' : !existing ? 'new' : existing.review ? 'closed' : 'merge';
      if (!months.has(key) || total > months.get(key).total) months.set(key, { ...p, key, status, total });
      continue;
    }
    const g = parseGoalsSheet(src.rows);
    if (g.length) { goals = [...(goals || []), ...g]; continue; }
    skipped.push(src.name);
  }
  for (const m of months.values()) m.selected = defaultSelection(state, m);
  return { months: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)), goals, skipped };
}

export const planSize = (p) => p.monthGoals.length + p.weekGoals.length + p.events.length + p.bills.length;

// Suma metas, objetivos, eventos y facturas a un mes (sin duplicar por texto).
function mergePlan(m, pm, res) {
  const add = (list, items, max, make, sameBlock = () => true) => {
    for (const it of items) {
      if (list.some((x) => sameBlock(x, it) && normName(x.text) === normName(it.text))) continue;
      if (list.filter((x) => sameBlock(x, it)).length >= max) continue;
      list.push(make(it));
      res.plan++;
    }
  };
  add(m.goals, pm.monthGoals, MAX_GOALS_STORED, (x) => ({ id: newId(), text: x.text, done: x.done }));
  m.weekGoals ||= [];
  add(m.weekGoals, pm.weekGoals, MAX_WEEK_GOALS, (x) => ({ id: newId(), week: x.week, text: x.text, done: x.done }), (a, b) => a.week === b.week);
  m.events ||= [];
  add(m.events, pm.events, MAX_EVENTS, (x) => ({ id: newId(), day: x.day, text: x.text, done: x.done }));
  m.bills ||= [];
  add(m.bills, pm.bills, MAX_BILLS, (x) => ({ id: newId(), day: x.day, text: x.text, amount: x.amount, paid: x.paid }));
  for (const k of ['weekGoals', 'events', 'bills']) if (!m[k].length) delete m[k];
}

// Para meses nuevos: los 5 con más marcas. Para fusionar: los que coinciden por nombre con el mes de la app.
export function defaultSelection(state, pm) {
  if (pm.status === 'merge') {
    const names = new Set(state.months[pm.key].habits.map((h) => normName(h.name)));
    return pm.habits.filter((h) => names.has(normName(h.name))).map((h) => h.name);
  }
  return [...pm.habits].filter((h) => h.count > 0).sort((a, b) => b.count - a.count).slice(0, MAX_HABITS).map((h) => h.name);
}

function uniqueShort(name, used) {
  const base = (autoShort(name) || 'HAB').slice(0, MAX_SHORT);
  let s = base, i = 2;
  while (used.has(s)) { const suf = String(i++); s = base.slice(0, MAX_SHORT - suf.length) + suf; }
  used.add(s);
  return s;
}

// Ids estables por nombre de hábito en todo el historial (para que Claude vea continuidad).
function idIndex(state) {
  const map = new Map();
  for (const m of Object.values(state.months)) for (const h of m.habits) if (!map.has(normName(h.name))) map.set(normName(h.name), h);
  return map;
}

/**
 * Aplica el plan sobre `state` (lo muta). Elegidos por mes en pm.selected (≤ 5).
 * goalsYear: año al que van las metas de la pestaña "Metas" (o null para no importarlas).
 * → resumen { created: [keys], merged: [{ key, checks }], goals: n, areas: n }
 */
export function applyImport(state, plan, { goalsYear = null, nowIso = new Date().toISOString() } = {}) {
  const res = { created: [], merged: [], goals: 0, areas: 0, ideas: 0, plan: 0 };
  const known = idIndex(state);
  for (const pm of plan.months) {
    const chosen = pm.habits.filter((h) => (pm.selected || []).includes(h.name));
    if (!chosen.length && !(pm.status === 'merge' && planSize(pm))) continue;
    if (pm.status === 'new') {
      if (chosen.length > MAX_HABITS) throw new Error(`${pm.key}: máximo ${MAX_HABITS} hábitos por mes`);
      const used = new Set();
      const habits = chosen.map((x, i) => {
        const prev = known.get(normName(x.name));
        const short = prev && !used.has(prev.short) ? (used.add(prev.short), prev.short) : uniqueShort(x.name, used);
        return makeHabit({ id: prev?.id || newId(), name: x.name, short, min: prev?.min || IMPORTED_MIN, target: prev?.target || { type: 'daily' }, area: prev?.area || null, note: x.note }, i);
      });
      const errs = validateHabitList(habits);
      if (errs.length) throw new Error(`${pm.key}: ${errs.join('; ')}`);
      const m = makeMonth(pm.key, { habits });
      const rest = pm.habits.filter((x) => !chosen.includes(x) && x.count > 0);
      if (rest.length) m.archived = rest.map((x) => ({ name: x.name, done: [...x.done], ...(x.note ? { note: x.note } : {}) }));
      for (let d = 1; d <= pm.days; d++) {
        const dk = dayKeyOf(pm.key, d);
        const checks = {};
        chosen.forEach((x, i) => { if (x.done.includes(d)) checks[habits[i].id] = 'full'; });
        const off = pm.active[d - 1] === false;
        if (off || Object.keys(checks).length) m.days[dk] = { note: '', checks, ...(off ? { off: true } : {}) };
      }
      const len = monthLength(pm.key);
      const keys = Array.from({ length: len }, (_, i) => dayKeyOf(pm.key, i + 1));
      m.review = {
        closedAt: nowIso, imported: true, goalsResult: {},
        perHabit: Object.fromEntries(habits.map((h) => [h.id, { pct: countHabit(h, keys, (k) => m.days[k], len).pct, decision: 'keep' }])),
        notes: `Importado desde Google Sheets (${pm.name || pm.key}).`,
      };
      mergePlan(m, pm, res);
      state.months[pm.key] = m;
      res.created.push(pm.key);
    } else if (pm.status === 'merge') {
      const m = state.months[pm.key];
      let n = 0;
      for (const x of chosen) {
        const h = m.habits.find((hb) => normName(hb.name) === normName(x.name));
        if (!h) continue;
        for (const d of x.done) {
          const dk = dayKeyOf(pm.key, d);
          if (!dayIsInRange(m, dk)) continue;
          m.days[dk] ||= { note: '', checks: {} };
          if (!m.days[dk].checks[h.id]) { m.days[dk].checks[h.id] = 'full'; n++; }
        }
      }
      // Lo que no coincide con un hábito del mes queda como "otros hábitos registrados".
      const names = new Set(m.habits.map((hb) => normName(hb.name)));
      const extra = pm.habits.filter((x) => x.count > 0 && !names.has(normName(x.name)));
      if (extra.length) {
        m.archived ||= [];
        for (const x of extra) {
          const prev = m.archived.find((a) => normName(a.name) === normName(x.name));
          if (prev) prev.done = [...new Set([...prev.done, ...x.done])].sort((a, b) => a - b);
          else m.archived.push({ name: x.name, done: [...x.done], ...(x.note ? { note: x.note } : {}) });
        }
      }
      mergePlan(m, pm, res);
      res.merged.push({ key: pm.key, checks: n });
    }
  }
  if (plan.goals && goalsYear) {
    for (const g of plan.goals) {
      let area = findArea(state, g.name);
      if (!area) {
        if ((state.areas || []).length >= MAX_AREAS) continue;
        area = addArea(state, { name: g.name, emoji: g.emoji });
        res.areas++;
      }
      const have = new Set(goalsOf(state, goalsYear, area.id).map((x) => normName(x.text)));
      for (const idea of g.ideas || []) {
        const exists = ideasOf(state, goalsYear, area.id, idea.freq).some((x) => normName(x.text) === normName(idea.text));
        if (exists || ideasOf(state, goalsYear, area.id, idea.freq).length >= MAX_IDEAS) continue;
        addHabitIdea(state, goalsYear, area.id, idea.text, idea.freq);
        res.ideas++;
      }
      for (const goal of g.goals) {
        if (have.has(normName(goal.text)) || goalsOf(state, goalsYear, area.id).length >= MAX_YEAR_GOALS) continue;
        const ng = addYearGoal(state, goalsYear, area.id, goal.text);
        ng.done = goal.done;
        res.goals++;
      }
    }
  }
  return res;
}

export const STATUS_LABEL = {
  new: 'se agrega como historial (cerrado)',
  merge: 'se suman las marcas al mes de la app',
  closed: 'ese mes ya está cerrado en la app: no se toca',
  future: 'mes futuro: se ignora',
  empty: 'sin marcas: se ignora',
};

export const YEAR_SOURCE_LABEL = { fecha: 'por la fecha de la hoja', calendario: 'por el día de la semana del día 1', supuesto: 'supuesto: revisa' };

export function describePlanMonth(pm) {
  const marks = pm.habits.reduce((s, x) => s + x.count, 0);
  const extra = [
    pm.monthGoals.length && `${pm.monthGoals.length} metas del mes`,
    pm.weekGoals.length && `${pm.weekGoals.length} objetivos semanales`,
    pm.events.length && `${pm.events.length} eventos`,
    pm.bills.length && `${pm.bills.length} facturas`,
  ].filter(Boolean);
  return `${MONTHS[pm.month - 1]} ${pm.year} · ${pm.habits.length} hábitos · ${marks} marcas${extra.length ? ` · ${extra.join(' · ')}` : ''} · ${STATUS_LABEL[pm.status]}`;
}

