// Prueba de punta a punta del Worker con todas las APIs simuladas (WhatsApp, Groq, Notion, Claude).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import worker from "../src/index.js";

const env = {
  WHATSAPP_TOKEN: "wt", WHATSAPP_PHONE_ID: "pid", WHATSAPP_APP_SECRET: "app", VERIFY_TOKEN: "vt", ALLOWED_NUMBER: "+57 300 111 2233",
  ANTHROPIC_API_KEY: "ak", GROQ_API_KEY: "gk", NOTION_TOKEN: "nt", NOTION_HABITOS_DS: "hab", NOTION_REGISTRO_DS: "reg", TZ_NAME: "America/Bogota",
};

function mockApis({ existingDay = null } = {}) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = init.method || (typeof input !== "string" && input.method) || "GET";
    let body = init.body;
    if (typeof input !== "string" && body === undefined) body = await input.clone().text();
    calls.push({ url, method, body });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (url.includes("graph.facebook.com") && url.endsWith("/m9")) return json({ url: "https://lookaside.fbsbx.com/audio", mime_type: "audio/ogg" });
    if (url.includes("lookaside")) return new Response(new Uint8Array([1, 2, 3]));
    if (url.includes("api.groq.com")) return json({ text: "Dormí seis horas, desayuné, la lista la hice a medias. Lo principal es el guion de Pipe a las diez." });
    if (url.includes("/data_sources/hab/query")) return json({ results: [
      { properties: { "Etiqueta": { rich_text: [{ plain_text: "DESAY" }] }, "Hábito": { title: [{ plain_text: "Desayunar" }] }, "Versión mínima": { rich_text: [{ plain_text: "algo" }] } } },
      { properties: { "Etiqueta": { rich_text: [{ plain_text: "LISTA" }] }, "Hábito": { title: [{ plain_text: "Lista" }] } } },
      { properties: { "Etiqueta": { rich_text: [{ plain_text: "1RAT" }] }, "Hábito": { title: [{ plain_text: "Primera tarea" }] } } },
    ] });
    if (url.includes("/data_sources/reg/query")) return json({ results: existingDay ? [existingDay] : [] });
    if (url.endsWith("/v1/pages") || url.includes("/v1/pages/")) return json({ id: "page1" });
    if (url.includes("api.anthropic.com")) {
      const out = { dia: "hoy", checks: [{ etiqueta: "DESAY", estado: "full" }, { etiqueta: "LISTA", estado: "min" }], energia: null, animo: null, sueno: 6,
        focos_sumar: null, tarea1: "10:00 · Guion de Pipe", top3: null, linea: null, cierre: null, resumen: "Desayunaste, lista a medias, dormiste 6 h.",
        preguntas: ["¿Hiciste la primera tarea antes de abrir chats?", "¿Energía de 1 a 5?"] };
      return json({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", stop_sequence: null,
        content: [{ type: "text", text: JSON.stringify(out) }], usage: { input_tokens: 10, output_tokens: 10 } });
    }
    if (url.includes("graph.facebook.com") && url.endsWith("/pid/messages")) return json({ messages: [{ id: "out1" }] });
    return json({ error: "no simulado: " + url }, 500);
  };
  return calls;
}

function signed(payload) {
  const raw = JSON.stringify(payload);
  const sig = "sha256=" + createHmac("sha256", env.WHATSAPP_APP_SECRET).update(raw).digest("hex");
  return new Request("https://w.example/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": sig, "content-type": "application/json" } });
}
const ctx = () => { const tasks = []; return { tasks, waitUntil: (p) => tasks.push(p) }; };
const audioMsg = (id, from = "573001112233") => ({ entry: [{ changes: [{ value: { messages: [{ id, from, type: "audio", audio: { id: "m9" } }] } }] }] });

test("verificación del webhook", async () => {
  const ok = await worker.fetch(new Request("https://w.example/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42"), env, ctx());
  assert.equal(await ok.text(), "42");
  const bad = await worker.fetch(new Request("https://w.example/webhook?hub.mode=subscribe&hub.verify_token=no&hub.challenge=42"), env, ctx());
  assert.equal(bad.status, 403);
});

test("rechaza firmas falsas", async () => {
  const r = await worker.fetch(new Request("https://w.example/webhook", { method: "POST", body: "{}", headers: { "x-hub-signature-256": "sha256=00" } }), env, ctx());
  assert.equal(r.status, 401);
});

test("audio → transcripción → Claude → Notion (crear) → respuesta", async () => {
  const calls = mockApis();
  const c = ctx();
  const r = await worker.fetch(signed(audioMsg("wamid.1")), env, c);
  assert.equal(r.status, 200);
  await Promise.all(c.tasks);
  const claude = calls.find((x) => x.url.includes("api.anthropic.com"));
  const req = JSON.parse(claude.body);
  assert.equal(req.model, "claude-opus-5-5");
  assert.equal(req.fallbacks, "default");
  assert.match(req.messages[0].content, /guion de Pipe/);
  const create = calls.find((x) => x.url.endsWith("/v1/pages") && x.method === "POST");
  const props = JSON.parse(create.body).properties;
  assert.deepEqual(props["Completo"].multi_select, [{ name: "DESAY" }]);
  assert.deepEqual(props["Mínimo"].multi_select, [{ name: "LISTA" }]);
  assert.equal(props["Sueño"].number, 6);
  assert.equal(props["Tarea 1"].rich_text[0].text.content, "10:00 · Guion de Pipe");
  const reply = JSON.parse(calls.find((x) => x.url.endsWith("/pid/messages")).body);
  assert.equal(reply.to, "573001112233");
  assert.match(reply.text.body, /Me falta:\n1\. ¿Hiciste la primera tarea/);
});

test("si el día ya existe, lo actualiza sin borrar lo anterior", async () => {
  const existing = { id: "pg9", properties: { "Completo": { multi_select: [{ name: "1RAT" }] }, "Mínimo": { multi_select: [] }, "Energía": { number: 4 }, "Focos": { number: 2 } } };
  const calls = mockApis({ existingDay: existing });
  const c = ctx();
  await worker.fetch(signed(audioMsg("wamid.2")), env, c);
  await Promise.all(c.tasks);
  const patch = calls.find((x) => x.url.endsWith("/v1/pages/pg9") && x.method === "PATCH");
  const props = JSON.parse(patch.body).properties;
  assert.deepEqual(props["Completo"].multi_select.map((o) => o.name).sort(), ["1RAT", "DESAY"]);
  assert.equal(props["Energía"].number, 4);
  assert.equal(props["Focos"].number, 2);
});

test("ignora números que no son el tuyo y mensajes repetidos", async () => {
  const calls = mockApis();
  const c = ctx();
  await worker.fetch(signed(audioMsg("wamid.3", "573009999999")), env, c);
  await worker.fetch(signed(audioMsg("wamid.1")), env, c); // repetido de la primera prueba
  await Promise.all(c.tasks);
  assert.equal(calls.length, 0);
});

test("la página de estado dice qué secretos faltan", async () => {
  const r = await worker.fetch(new Request("https://w.example/"), { TZ_NAME: "America/Bogota" }, ctx());
  assert.match(await r.text(), /Faltan secretos: WHATSAPP_TOKEN/);
});
