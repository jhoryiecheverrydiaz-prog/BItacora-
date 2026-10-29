// Puente WhatsApp → Claude → Notion para la Bitácora de Jhoryi (Cloudflare Worker).
// Flujo: audio o texto por WhatsApp → transcripción (Groq) → Claude ordena → Notion (Registro diario) → respuesta con preguntas puntuales.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  dayKey, addDays, humanDay, emptyRecord, mergeRecord, toNotionProps, fromNotionPage, habitFromPage,
  formatReply, HELP, verifySignature, extractMessages, normalizeNumber,
} from "./logic.js";

const REQUIRED = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_APP_SECRET", "VERIFY_TOKEN", "ALLOWED_NUMBER", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "NOTION_TOKEN", "NOTION_HABITOS_DS", "NOTION_REGISTRO_DS"];
const NOTION_VERSION = "2025-09-03";
const seen = new Set(); // Meta reintenta entregas; evita procesar dos veces en la misma instancia

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") {
      const missing = REQUIRED.filter((k) => !env[k]);
      return new Response(missing.length ? `Faltan secretos: ${missing.join(", ")}` : "Bitácora WhatsApp: listo.", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (url.pathname !== "/webhook") return new Response("No encontrado", { status: 404 });

    // Verificación del webhook (Meta la hace una vez al configurarlo)
    if (request.method === "GET") {
      const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env.VERIFY_TOKEN;
      return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("Token inválido", { status: 403 });
    }
    if (request.method !== "POST") return new Response("Método no permitido", { status: 405 });

    const raw = await request.text();
    if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET))) return new Response("Firma inválida", { status: 401 });
    let payload;
    try { payload = JSON.parse(raw); } catch { return new Response("JSON inválido", { status: 400 }); }

    const allowed = normalizeNumber(env.ALLOWED_NUMBER);
    for (const m of extractMessages(payload)) {
      if (normalizeNumber(m.from) !== allowed || seen.has(m.id)) continue;
      seen.add(m.id);
      ctx.waitUntil(handle(m, env).catch((e) => sendText(env, m.from, "No pude guardar esto: " + shortError(e)).catch(() => {})));
    }
    return new Response("ok", { status: 200 }); // responder rápido; el trabajo sigue en segundo plano
  },
};

const shortError = (e) => String(e?.message || e).slice(0, 200);

async function handle(m, env) {
  const tz = env.TZ_NAME || "America/Bogota";
  let said = m.text.trim();
  if (m.type === "audio" || m.audioId) said = await transcribe(env, m.audioId);
  else if (m.type !== "text") return sendText(env, m.from, "Por ahora entiendo audios y texto.\n\n" + HELP);
  if (!said) return sendText(env, m.from, "No entendí el audio. ¿Me lo repites?");

  const low = said.toLowerCase().replace(/[^a-záéíóúñ ]/g, "").trim();
  if (["ayuda", "help", "hola"].includes(low)) return sendText(env, m.from, HELP);

  const today = dayKey(tz);
  const habits = (await notionQuery(env, env.NOTION_HABITOS_DS, { property: "Estado", select: { equals: "Activo" } })).map(habitFromPage).filter((h) => h.tag);

  if (low === "hoy") {
    const page = await findDay(env, today);
    const rec = page ? fromNotionPage(page) : emptyRecord();
    return sendText(env, m.from, page ? formatReply({ key: today, record: rec, habits, resumen: "Esto es lo registrado hoy." }) : `Hoy (${humanDay(today)}) todavía no tiene registro.`);
  }

  const ex = await organize(env, { said, habits, today, tz });
  const key = ex.dia === "ayer" ? addDays(today, -1) : today;
  const page = await findDay(env, key);
  const current = page ? fromNotionPage(page) : emptyRecord();
  const record = mergeRecord(current, ex, habits.map((h) => h.tag));
  await saveDay(env, key, record, page?.id);
  await sendText(env, m.from, formatReply({ key, record, habits, resumen: ex.resumen, preguntas: ex.preguntas }));
}

// ---------- Transcripción (Groq Whisper) ----------
async function transcribe(env, mediaId) {
  const graph = `https://graph.facebook.com/${env.GRAPH_VERSION || "v21.0"}`;
  const meta = await fetch(`${graph}/${mediaId}`, { headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}` } });
  if (!meta.ok) throw new Error(`WhatsApp no entregó el audio (${meta.status})`);
  const { url, mime_type } = await meta.json();
  const media = await fetch(url, { headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}` } });
  if (!media.ok) throw new Error(`No pude descargar el audio (${media.status})`);
  const form = new FormData();
  form.append("file", new Blob([await media.arrayBuffer()], { type: mime_type || "audio/ogg" }), "audio.ogg");
  form.append("model", env.GROQ_MODEL || "whisper-large-v3-turbo");
  form.append("language", "es");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${env.GROQ_API_KEY}` }, body: form });
  if (!r.ok) throw new Error(`La transcripción falló (${r.status})`);
  return String((await r.json()).text || "").trim();
}

// ---------- Claude ordena lo dicho ----------
const Extract = z.object({
  dia: z.enum(["hoy", "ayer"]).describe("De qué día habla. 'ayer' solo si lo dice explícitamente."),
  checks: z.array(z.object({ etiqueta: z.string(), estado: z.enum(["full", "min", "none"]) })).describe("Solo hábitos que mencionó."),
  energia: z.number().int().nullable(), animo: z.number().int().nullable(), sueno: z.number().nullable(),
  focos_sumar: z.number().int().nullable().describe("Bloques de foco de 25 min nuevos que dijo haber hecho."),
  tarea1: z.string().nullable().describe("Tarea principal con hora, formato 'HH:MM · tarea'."),
  top3: z.array(z.string()).nullable().describe("Hasta 2 tareas más."),
  linea: z.string().nullable().describe("Una frase de lo que pasó en el día."),
  cierre: z.string().nullable().describe("Qué queda para mañana."),
  resumen: z.string().describe("Una frase con lo que entendiste."),
  preguntas: z.array(z.string()).describe("Máximo 3 preguntas cortas y puntuales sobre lo que falta y sirve."),
});

async function organize(env, { said, habits, today, tz }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const system = `Ordenas el registro diario de hábitos de Jhoryi a partir de lo que dicta por WhatsApp.
Español de Colombia, tuteo, directo, sin frases motivacionales, sin regaños, sin rachas.
Usa solo lo que dijo; si no lo dijo, deja el campo en null o fuera de la lista. No inventes.
"min" = hizo la versión mínima del hábito. "full" = lo hizo completo. "none" = dijo que no lo hizo.
Energía y ánimo van de 1 a 5. Sueño en horas.
Las preguntas deben poder responderse en pocas palabras. Prioriza: hábitos no mencionados, hora de la tarea #1, horas de sueño. Si ya está todo, no preguntes nada.`;
  const user = `Hoy es ${today} (${humanDay(today)}, zona ${tz}).
Hábitos activos:
${habits.map((h) => `- ${h.tag}: ${h.name} (mínimo: ${h.min || "—"})`).join("\n") || "ninguno"}

Lo que dijo Jhoryi:
${said}`;
  const res = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Extract) },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "refusal") throw new Error("Claude no pudo procesar este mensaje. Intenta decirlo de otra forma.");
  if (!res.parsed_output) throw new Error("Claude no devolvió el registro ordenado.");
  return res.parsed_output;
}

// ---------- Notion ----------
async function notion(env, path, method, body) {
  const r = await fetch(`https://api.notion.com/v1${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { authorization: `Bearer ${env.NOTION_TOKEN}`, "notion-version": NOTION_VERSION, "content-type": "application/json" },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Notion ${r.status}: ${j.message || "error"}`);
  return j;
}
const notionQuery = async (env, ds, filter) => (await notion(env, `/data_sources/${ds}/query`, "POST", { filter, page_size: 50 })).results || [];
const findDay = async (env, key) => (await notionQuery(env, env.NOTION_REGISTRO_DS, { property: "Día", title: { equals: key } }))[0] || null;
async function saveDay(env, key, record, pageId) {
  const properties = toNotionProps(key, record);
  if (pageId) return notion(env, `/pages/${pageId}`, "PATCH", { properties });
  return notion(env, "/pages", "POST", { parent: { type: "data_source_id", data_source_id: env.NOTION_REGISTRO_DS }, properties });
}

// ---------- WhatsApp ----------
async function sendText(env, to, body) {
  const r = await fetch(`https://graph.facebook.com/${env.GRAPH_VERSION || "v21.0"}/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: body.slice(0, 4000) } }),
  });
  if (!r.ok) throw new Error(`WhatsApp no envió la respuesta (${r.status})`);
}
