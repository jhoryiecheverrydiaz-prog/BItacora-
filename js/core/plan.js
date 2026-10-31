// "Plan del mes": la parte de abajo de cada pestaña mensual del tracker en Sheets.
// Objetivos semanales (generales y por semana), eventos importantes y facturas del mes.
// month.weekGoals = [{ id, week: 0 (generales) | 1..5, text, done }]
// month.events    = [{ id, day: 1..31 | null, text, done }]
// month.bills     = [{ id, day: 1..31 | null, text, amount: number | null, paid }]
import { monthLength } from './dates.js';
import { newId } from './months.js';

export const MAX_WEEK_GOALS = 8; // por bloque (generales o cada semana)
export const MAX_EVENTS = 20;
export const MAX_BILLS = 25;
export const WEEK_BLOCKS = [0, 1, 2, 3, 4, 5];
export const weekLabel = (w) => (w === 0 ? 'Generales de la semana' : `Semana ${w}`);

const clean = (s, max = 120) => String(s ?? '').trim().slice(0, max);

function openMonth(state, key) {
  const m = state.months[key];
  if (!m) throw new Error(`no existe el mes ${key}`);
  if (m.review) throw new Error('mes cerrado: el plan es de solo lectura');
  return m;
}

function checkDay(m, day) {
  if (day === null || day === undefined || day === '') return null;
  const d = Number(day);
  if (!Number.isInteger(d) || d < 1 || d > monthLength(m.key)) throw new Error('día inválido');
  return d;
}

function find(list, id) {
  const x = (list || []).find((i) => i.id === id);
  if (!x) throw new Error('elemento no encontrado');
  return x;
}

// --- Objetivos semanales ---
export function addWeekGoal(state, key, week, text) {
  const m = openMonth(state, key);
  if (!WEEK_BLOCKS.includes(week)) throw new Error('semana inválida');
  const t = clean(text);
  if (!t) throw new Error('escribe el objetivo');
  m.weekGoals ||= [];
  if (m.weekGoals.filter((g) => g.week === week).length >= MAX_WEEK_GOALS) throw new Error(`máximo ${MAX_WEEK_GOALS} por semana`);
  const g = { id: newId(), week, text: t, done: false };
  m.weekGoals.push(g);
  return g;
}

export function toggleWeekGoal(state, key, id) {
  const g = find(openMonth(state, key).weekGoals, id);
  g.done = !g.done;
  return g.done;
}

export function removeWeekGoal(state, key, id) {
  const m = openMonth(state, key);
  find(m.weekGoals, id);
  m.weekGoals = m.weekGoals.filter((g) => g.id !== id);
}

// --- Eventos ---
export function addEvent(state, key, { day = null, text }) {
  const m = openMonth(state, key);
  const t = clean(text);
  if (!t) throw new Error('escribe el evento');
  m.events ||= [];
  if (m.events.length >= MAX_EVENTS) throw new Error(`máximo ${MAX_EVENTS} eventos`);
  const e = { id: newId(), day: checkDay(m, day), text: t, done: false };
  m.events.push(e);
  return e;
}

export function toggleEvent(state, key, id) {
  const e = find(openMonth(state, key).events, id);
  e.done = !e.done;
  return e.done;
}

export function removeEvent(state, key, id) {
  const m = openMonth(state, key);
  find(m.events, id);
  m.events = m.events.filter((e) => e.id !== id);
}

// --- Facturas ---
export function parseAmount(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : NaN;
  // "$ 1.250.000", "1,250.50", "1250,5" → número
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return NaN;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export function addBill(state, key, { day = null, text, amount = null }) {
  const m = openMonth(state, key);
  const t = clean(text, 80);
  if (!t) throw new Error('escribe la factura');
  const a = parseAmount(amount);
  if (Number.isNaN(a)) throw new Error('valor inválido');
  m.bills ||= [];
  if (m.bills.length >= MAX_BILLS) throw new Error(`máximo ${MAX_BILLS} facturas`);
  const b = { id: newId(), day: checkDay(m, day), text: t, amount: a, paid: false };
  m.bills.push(b);
  return b;
}

export function toggleBill(state, key, id) {
  const b = find(openMonth(state, key).bills, id);
  b.paid = !b.paid;
  return b.paid;
}

export function removeBill(state, key, id) {
  const m = openMonth(state, key);
  find(m.bills, id);
  m.bills = m.bills.filter((b) => b.id !== id);
}

export function billsTotals(month) {
  let total = 0, paid = 0;
  for (const b of month.bills || []) { total += b.amount || 0; if (b.paid) paid += b.amount || 0; }
  return { total, paid, pending: total - paid, count: (month.bills || []).length, paidCount: (month.bills || []).filter((b) => b.paid).length };
}

export const formatMoney = (n) => (n === null || n === undefined ? '' : `$ ${Math.round(n).toLocaleString('es-CO')}`);

// Ordenados por día (los sin día al final).
export const byDay = (list) => [...(list || [])].sort((a, b) => (a.day ?? 99) - (b.day ?? 99));

// Validación para respaldos. Devuelve lista de errores.
export function validatePlan(m, p) {
  const errors = [];
  const isStr = (v) => typeof v === 'string';
  const dayOk = (d) => d === null || (Number.isInteger(d) && d >= 1 && d <= 31);
  const list = (name, fn) => {
    if (m[name] === undefined) return;
    if (!Array.isArray(m[name])) { errors.push(`${p}.${name} debe ser una lista`); return; }
    m[name].forEach((x, i) => { if (!x || typeof x !== 'object' || !isStr(x.id) || !isStr(x.text) || !fn(x)) errors.push(`${p}.${name}[${i}] inválido`); });
  };
  list('weekGoals', (x) => WEEK_BLOCKS.includes(x.week) && typeof x.done === 'boolean');
  list('events', (x) => dayOk(x.day) && typeof x.done === 'boolean');
  list('bills', (x) => dayOk(x.day) && typeof x.paid === 'boolean' && (x.amount === null || (typeof x.amount === 'number' && x.amount >= 0)));
  return errors;
}
