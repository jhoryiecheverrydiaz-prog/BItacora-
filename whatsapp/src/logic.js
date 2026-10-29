// Lógica pura del puente WhatsApp → Notion. Sin red ni dependencias, para poder probarla.

export const MAX_FOCOS_XP = 4;

// Fecha local "YYYY-MM-DD" en la zona horaria dada (nunca toISOString).
export function dayKey(timeZone = "America/Bogota", date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

const WD = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function humanDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MES[m - 1]}`;
}

export const emptyRecord = () => ({ full: [], min: [], line: "", energia: null, animo: null, sueno: null, tarea1: "", top3: "", focos: 0, cierre: "" });

// Mezcla lo que Claude extrajo con el registro existente del día. Lo no mencionado se conserva.
export function mergeRecord(current, ex, habitTags) {
  const r = { ...emptyRecord(), ...current, full: [...(current?.full || [])], min: [...(current?.min || [])] };
  const tags = new Set(habitTags.map((t) => t.toUpperCase()));
  for (const c of ex.checks || []) {
    const t = String(c.etiqueta || "").toUpperCase();
    if (!tags.has(t)) continue;
    r.full = r.full.filter((x) => x !== t);
    r.min = r.min.filter((x) => x !== t);
    if (c.estado === "full") r.full.push(t);
    else if (c.estado === "min") r.min.push(t);
  }
  const clamp15 = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.min(5, Math.max(1, Math.round(Number(v)))));
  if (ex.energia != null) r.energia = clamp15(ex.energia);
  if (ex.animo != null) r.animo = clamp15(ex.animo);
  if (ex.sueno != null && Number.isFinite(Number(ex.sueno))) r.sueno = Math.min(14, Math.max(0, Math.round(Number(ex.sueno) * 2) / 2));
  if (ex.focos_sumar != null && Number.isFinite(Number(ex.focos_sumar))) r.focos = Math.max(0, (r.focos || 0) + Math.round(Number(ex.focos_sumar)));
  if (ex.tarea1) r.tarea1 = String(ex.tarea1).trim();
  if (Array.isArray(ex.top3) && ex.top3.length) r.top3 = ex.top3.map((s) => String(s).trim()).filter(Boolean).slice(0, 2).join("\n");
  if (ex.linea) r.line = String(ex.linea).trim();
  if (ex.cierre) r.cierre = String(ex.cierre).trim();
  return r;
}

// Mismas reglas de XP que el panel.
export function dayXP(r) {
  if (!r) return 0;
  let x = 4 + r.full.length * 10 + r.min.length * 6;
  if (r.energia != null && r.animo != null && r.sueno != null) x += 3;
  return x + Math.min(MAX_FOCOS_XP, r.focos || 0) * 5;
}

// ---------- Notion: propiedades ----------
const text = (s) => (s ? [{ type: "text", text: { content: String(s).slice(0, 1900) } }] : []);
export function toNotionProps(key, r) {
  return {
    "Día": { title: text(key) },
    "Fecha": { date: { start: key } },
    "Completo": { multi_select: r.full.map((name) => ({ name })) },
    "Mínimo": { multi_select: r.min.map((name) => ({ name })) },
    "Línea": { rich_text: text(r.line) },
    "Tarea 1": { rich_text: text(r.tarea1) },
    "Top 3": { rich_text: text(r.top3) },
    "Cierre": { rich_text: text(r.cierre) },
    "Energía": { number: r.energia },
    "Ánimo": { number: r.animo },
    "Sueño": { number: r.sueno },
    "Focos": { number: r.focos || null },
  };
}
const plain = (p) => (p?.rich_text || p?.title || []).map((t) => t.plain_text ?? t.text?.content ?? "").join("");
export function fromNotionPage(page) {
  const p = page?.properties || {};
  return {
    full: (p["Completo"]?.multi_select || []).map((o) => o.name),
    min: (p["Mínimo"]?.multi_select || []).map((o) => o.name),
    line: plain(p["Línea"]), tarea1: plain(p["Tarea 1"]), top3: plain(p["Top 3"]), cierre: plain(p["Cierre"]),
    energia: p["Energía"]?.number ?? null, animo: p["Ánimo"]?.number ?? null, sueno: p["Sueño"]?.number ?? null,
    focos: p["Focos"]?.number ?? 0,
  };
}
export function habitFromPage(page) {
  const p = page?.properties || {};
  return { tag: plain(p["Etiqueta"]).toUpperCase(), name: plain(p["Hábito"]), min: plain(p["Versión mínima"]), ancla: plain(p["Ancla"]) };
}

// ---------- Respuesta por WhatsApp ----------
export function formatReply({ key, record, habits, resumen, preguntas }) {
  const lines = [`Guardado · ${humanDay(key)}`];
  if (resumen) lines.push(resumen);
  const st = habits.map((h) => `${h.tag} ${record.full.includes(h.tag) ? "completo" : record.min.includes(h.tag) ? "mínimo" : "—"}`);
  if (st.length) lines.push("Hábitos: " + st.join(" · "));
  const ci = [record.energia != null && `energía ${record.energia}`, record.animo != null && `ánimo ${record.animo}`, record.sueno != null && `sueño ${record.sueno} h`].filter(Boolean);
  if (ci.length) lines.push("Check-in: " + ci.join(" · "));
  if (record.tarea1) lines.push("Tarea #1: " + record.tarea1);
  if (record.focos) lines.push(`Focos: ${record.focos}`);
  lines.push(`+${dayXP(record)} XP este día`);
  const qs = (preguntas || []).filter(Boolean).slice(0, 3);
  if (qs.length) lines.push("", "Me falta:", ...qs.map((q, i) => `${i + 1}. ${q}`));
  return lines.join("\n");
}

export const HELP = [
  "Mándame un audio o un texto con cómo va tu día: hábitos, cómo dormiste, energía, la tarea principal con hora.",
  "Lo ordeno, lo guardo en Notion y te pregunto solo lo que falte.",
  "Escribe \"hoy\" para ver lo registrado. Di \"ayer\" en el mensaje si es del día anterior.",
].join("\n");

// ---------- Seguridad: firma de Meta (X-Hub-Signature-256) ----------
export async function verifySignature(rawBody, header, appSecret) {
  if (!header || !header.startsWith("sha256=") || !appSecret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const got = header.slice(7);
  if (got.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

// Saca los mensajes entrantes del webhook de WhatsApp.
export function extractMessages(payload) {
  const out = [];
  for (const e of payload?.entry || []) for (const c of e.changes || []) for (const m of c.value?.messages || []) {
    out.push({ id: m.id, from: m.from, type: m.type, text: m.text?.body || "", audioId: m.audio?.id || m.voice?.id || null });
  }
  return out;
}

export const normalizeNumber = (n) => String(n || "").replace(/\D/g, "");
