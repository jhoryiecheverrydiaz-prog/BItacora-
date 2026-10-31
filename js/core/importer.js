import { isDateKey, isMonthKey, monthKey, monthLength, parseKey } from './dates.js';
import { validateHabitList, validateHabit, validateTarget, MAX_HABITS, MAX_GOALS, MAX_GOALS_STORED, MAX_SHORT, autoShort } from './months.js';
import { validatePlan } from './plan.js';
import { migrate } from './migrate.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';

export function extractJson(text) {
  if (isObj(text)) return text;
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no encontré un JSON en el texto');
  try { return JSON.parse(s.slice(a, b + 1)); } catch { throw new Error('el JSON está mal formado'); }
}

function validateMonth(k, m, errors) {
  const p = `months.${k}`;
  if (!isMonthKey(k)) return errors.push(`${p}: clave de mes inválida (YYYY-MM)`);
  if (!isObj(m)) return errors.push(`${p}: no es un objeto`);
  if (m.key !== k) errors.push(`${p}.key no coincide`);
  if (!Number.isInteger(m.startDay) || m.startDay < 1 || m.startDay > monthLength(k)) errors.push(`${p}.startDay inválido`);
  if (!isStr(m.mantra)) errors.push(`${p}.mantra debe ser texto`);
  if (!Array.isArray(m.goals) || m.goals.length > MAX_GOALS_STORED) errors.push(`${p}.goals: lista de máx. ${MAX_GOALS_STORED}`);
  else m.goals.forEach((g, i) => {
    if (!isObj(g) || !isStr(g.id) || !isStr(g.text) || ![null, true, false].includes(g.done)) errors.push(`${p}.goals[${i}] inválido`);
  });
  if (!Array.isArray(m.habits)) return errors.push(`${p}.habits debe ser una lista`);
  for (const e of validateHabitList(m.habits)) errors.push(`${p}.habits: ${e}`);
  m.habits.forEach((h, i) => { if (!isStr(h?.id) || !h.id) errors.push(`${p}.habits[${i}].id ausente`); });
  if (!isObj(m.days)) return errors.push(`${p}.days debe ser un objeto`);
  for (const [dk, d] of Object.entries(m.days)) {
    if (!isDateKey(dk) || monthKey(dk) !== k) { errors.push(`${p}.days: fecha inválida ${dk}`); continue; }
    if (!isObj(d) || !isStr(d.note) || !isObj(d.checks)) { errors.push(`${p}.days.${dk} inválido`); continue; }
    for (const v of Object.values(d.checks)) if (v !== 'full' && v !== 'min') errors.push(`${p}.days.${dk}.checks: valor "${v}" inválido`);
    if (d.off !== undefined && d.off !== true) errors.push(`${p}.days.${dk}.off inválido`);
    if (parseKey(dk).d < m.startDay) errors.push(`${p}.days.${dk} es anterior a startDay`);
  }
  if (m.review !== null && m.review !== undefined && !isObj(m.review)) errors.push(`${p}.review inválido`);
  errors.push(...validatePlan(m, p));
  if (m.archived !== undefined) {
    if (!Array.isArray(m.archived)) errors.push(`${p}.archived debe ser una lista`);
    else m.archived.forEach((a, i) => { if (!isObj(a) || !isStr(a.name) || !Array.isArray(a.done) || a.done.some((d) => !Number.isInteger(d))) errors.push(`${p}.archived[${i}] inválido`); });
  }
}

// Respaldo completo: valida, migra y normaliza. No toca el estado actual.
export function validateBackup(input) {
  const errors = [];
  let obj;
  try { obj = extractJson(input); } catch (e) { return { ok: false, errors: [e.message] }; }
  if (!Number.isInteger(obj.schemaVersion)) return { ok: false, errors: ['falta schemaVersion: no parece un respaldo de Bitácora'] };
  let s;
  try { s = migrate(obj); } catch (e) { return { ok: false, errors: [e.message] }; }
  if (!isObj(s.profile)) errors.push('profile ausente');
  else {
    if (!isStr(s.profile.name)) errors.push('profile.name debe ser texto');
    const a = s.profile.accountability;
    if (!isObj(a) || !['claude', 'persona'].includes(a.to) || !Number.isInteger(a.weekday) || a.weekday < 0 || a.weekday > 6) errors.push('profile.accountability inválido');
  }
  if (!isObj(s.months) || !Object.keys(s.months).length) errors.push('months vacío');
  else for (const [k, m] of Object.entries(s.months)) validateMonth(k, m, errors);
  if (!Array.isArray(s.areas)) errors.push('areas debe ser una lista');
  else {
    s.areas.forEach((a, i) => { if (!isObj(a) || !isStr(a.id) || !a.id || !isStr(a.name) || !a.name.trim() || !isStr(a.emoji ?? '')) errors.push(`areas[${i}] inválida`); });
    if (new Set(s.areas.map((a) => a?.id)).size !== s.areas.length) errors.push('areas: ids repetidos');
  }
  if (!isObj(s.years)) errors.push('years debe ser un objeto');
  else for (const [y, v] of Object.entries(s.years)) {
    if (!/^\d{4}$/.test(y)) { errors.push(`years.${y}: año inválido`); continue; }
    if (!isObj(v) || !Array.isArray(v.goals)) { errors.push(`years.${y}.goals debe ser una lista`); continue; }
    if (v.habitIdeas !== undefined && !Array.isArray(v.habitIdeas)) errors.push(`years.${y}.habitIdeas debe ser una lista`);
    (v.habitIdeas || []).forEach((g, i) => { if (!isObj(g) || !isStr(g.id) || !isStr(g.areaId) || !isStr(g.text) || !['daily', 'weekly', 'monthly'].includes(g.freq)) errors.push(`years.${y}.habitIdeas[${i}] inválido`); });
    v.goals.forEach((g, i) => { if (!isObj(g) || !isStr(g.id) || !isStr(g.areaId) || !isStr(g.text) || typeof g.done !== 'boolean') errors.push(`years.${y}.goals[${i}] inválida`); });
  }
  if (!isObj(s.meta)) errors.push('meta ausente');
  if (errors.length) return { ok: false, errors };
  for (const m of Object.values(s.months)) { m.changeLog ||= []; m.review ??= null; }
  s.meta = { lastOpenedDate: null, lastBackupAt: null, lastWeeklySentAt: null, persistGranted: null, closeSnoozedOn: null, onboardingDraft: null, pendingImport: null, ...s.meta };
  return { ok: true, errors: [], state: s };
}

function countData(state) {
  let days = 0, notes = 0;
  for (const m of Object.values(state?.months || {})) for (const d of Object.values(m.days)) {
    days++; if (d.note) notes++;
  }
  return { months: Object.keys(state?.months || {}).length, days, notes };
}

// Resumen legible de lo que cambia al reemplazar el estado.
export function describeReplace(current, incoming) {
  const a = countData(current), b = countData(incoming);
  return [
    `Meses: ${a.months} → ${b.months}`,
    `Días con registro: ${a.days} → ${b.days}`,
    `Notas: ${a.notes} → ${b.notes}`,
    `Nombre: ${current?.profile?.name || '—'} → ${incoming.profile.name || '—'}`,
  ];
}

/**
 * JSON de Claude (§8.2). `habits` = hábitos del mes que se va a cerrar.
 * keepId acepta el id o la etiqueta corta. Devuelve una propuesta para el próximo cierre.
 */
export function parseClaudeImport(input, habits, areas = []) {
  const areaRef = (v) => {
    const r = String(v ?? '').trim().toLowerCase();
    return areas.find((a) => a.id.toLowerCase() === r || a.name.toLowerCase() === r)?.id;
  };
  const errors = [];
  let o;
  try { o = extractJson(input); } catch (e) { return { ok: false, errors: [e.message] }; }
  if (o.bitacora_import !== 1) return { ok: false, errors: ['falta "bitacora_import": 1'] };
  if (o.applyTo !== undefined && o.applyTo !== 'next_month') errors.push('applyTo solo puede ser "next_month"');
  if (o.mantra !== undefined && !isStr(o.mantra)) errors.push('mantra debe ser texto');
  let goals;
  if (o.goals !== undefined) {
    if (!Array.isArray(o.goals) || o.goals.some((g) => !isStr(g))) errors.push('goals debe ser una lista de textos');
    else if (o.goals.length > MAX_GOALS) errors.push(`goals: máximo ${MAX_GOALS}`);
    else goals = o.goals.map((g) => g.trim()).filter(Boolean);
  }
  const edits = [], added = [];
  if (o.habits !== undefined) {
    if (!Array.isArray(o.habits)) errors.push('habits debe ser una lista');
    else o.habits.forEach((h, i) => {
      const p = `habits[${i}]`;
      if (!isObj(h)) return errors.push(`${p} no es un objeto`);
      if ('keepId' in h) {
        const ref = String(h.keepId).trim().toUpperCase();
        const found = habits.find((x) => x.id.toUpperCase() === ref || x.short.toUpperCase() === ref);
        if (!found) return errors.push(`${p}.keepId "${h.keepId}" no coincide con ningún hábito actual`);
        const e = {};
        for (const f of ['min', 'name', 'short']) {
          if (h[f] === undefined) continue;
          if (!isStr(h[f]) || !h[f].trim()) return errors.push(`${p}.${f} debe ser texto no vacío`);
          e[f] = h[f].trim();
        }
        if (e.short && e.short.length > MAX_SHORT) return errors.push(`${p}.short: máx. ${MAX_SHORT} caracteres`);
        if (h.area !== undefined) { const a = areaRef(h.area); if (!a) return errors.push(`${p}.area "${h.area}" no existe`); e.area = a; }
        edits.push({ habitId: found.id, ...e });
      } else {
        const cand = { name: h.name, short: isStr(h.short) && h.short.trim() ? h.short.trim().toUpperCase() : autoShort(h.name), min: h.min, target: h.target ?? { type: 'daily' } };
        if (h.area !== undefined) { const a = areaRef(h.area); if (!a) return errors.push(`${p}.area "${h.area}" no existe`); cand.area = a; }
        const t = validateTarget(cand.target);
        const e = validateHabit(cand);
        if (t || e) return errors.push(`${p}: ${e || t}`);
        added.push(cand);
      }
    });
  }
  if (habits.length + added.length > MAX_HABITS) errors.push(`con los nuevos serían ${habits.length + added.length} hábitos; el tope es ${MAX_HABITS}. Quita alguno en el cierre o pide menos.`);
  if (errors.length) return { ok: false, errors };
  const proposal = { edits, added };
  if (o.mantra !== undefined) proposal.mantra = o.mantra.trim();
  if (goals) proposal.goals = goals;
  return { ok: true, errors: [], proposal };
}

export function describeProposal(p, habits) {
  const byId = Object.fromEntries(habits.map((h) => [h.id, h]));
  const out = [];
  for (const e of p.edits) {
    const h = byId[e.habitId];
    const parts = Object.entries(e).filter(([k]) => k !== 'habitId').map(([k, v]) => `${k}: "${v}"`);
    out.push(`${h?.short || e.habitId}: ${parts.join(', ') || 'mantener'}`);
  }
  for (const a of p.added) out.push(`Nuevo: ${a.short} ${a.name} — mínimo "${a.min}"`);
  if (p.mantra !== undefined) out.push(`Mantra: "${p.mantra}"`);
  if (p.goals) out.push(`Objetivos: ${p.goals.join(' · ') || '—'}`);
  return out;
}
