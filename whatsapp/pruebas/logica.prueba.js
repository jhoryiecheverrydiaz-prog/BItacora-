import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { dayKey, addDays, mergeRecord, emptyRecord, dayXP, toNotionProps, fromNotionPage, formatReply, verifySignature, extractMessages, normalizeNumber } from "../src/logic.js";

test("dayKey usa la zona de Bogotá, no UTC", () => {
  // 2026-10-30 03:00 UTC = 2026-10-29 22:00 en Bogotá
  assert.equal(dayKey("America/Bogota", new Date(Date.UTC(2026, 9, 30, 3))), "2026-10-29");
  assert.equal(addDays("2026-11-01", -1), "2026-10-31");
});

test("mergeRecord conserva lo no mencionado y cambia solo lo dicho", () => {
  const cur = { ...emptyRecord(), full: ["DESAY"], min: ["LISTA"], energia: 3, tarea1: "9:00 · algo", focos: 1 };
  const r = mergeRecord(cur, { checks: [{ etiqueta: "lista", estado: "full" }, { etiqueta: "XXX", estado: "full" }, { etiqueta: "DESAY", estado: "none" }], energia: 7, sueno: 6.3, focos_sumar: 2, top3: ["a", "b", "c"] }, ["DESAY", "1RAT", "LISTA"]);
  assert.deepEqual(r.full, ["LISTA"]);
  assert.deepEqual(r.min, []);
  assert.equal(r.energia, 5);
  assert.equal(r.sueno, 6.5);
  assert.equal(r.focos, 3);
  assert.equal(r.tarea1, "9:00 · algo");
  assert.equal(r.top3, "a\nb");
});

test("XP igual que el panel", () => {
  assert.equal(dayXP({ full: ["A", "B"], min: ["C"], energia: 3, animo: 3, sueno: 7, focos: 6 }), 4 + 20 + 6 + 3 + 20);
});

test("propiedades de Notion ida y vuelta", () => {
  const rec = { ...emptyRecord(), full: ["DESAY"], min: ["1RAT"], line: "día", energia: 4, sueno: 6.5, focos: 2 };
  const props = toNotionProps("2026-10-29", rec);
  assert.equal(props["Día"].title[0].text.content, "2026-10-29");
  assert.equal(props["Fecha"].date.start, "2026-10-29");
  const page = { properties: {
    "Completo": { multi_select: [{ name: "DESAY" }] }, "Mínimo": { multi_select: [{ name: "1RAT" }] },
    "Línea": { rich_text: [{ plain_text: "día" }] }, "Energía": { number: 4 }, "Sueño": { number: 6.5 }, "Focos": { number: 2 },
  } };
  const back = fromNotionPage(page);
  assert.deepEqual([back.full, back.min, back.line, back.energia, back.sueno, back.focos], [["DESAY"], ["1RAT"], "día", 4, 6.5, 2]);
});

test("respuesta con máximo 3 preguntas", () => {
  const txt = formatReply({ key: "2026-10-29", record: { ...emptyRecord(), full: ["DESAY"] }, habits: [{ tag: "DESAY" }, { tag: "1RAT" }], resumen: "Ok.", preguntas: ["a", "b", "c", "d"] });
  assert.match(txt, /^Guardado · jue 29 oct/);
  assert.match(txt, /DESAY completo · 1RAT —/);
  assert.match(txt, /3\. c$/);
  assert.doesNotMatch(txt, /4\. d/);
});

test("firma de Meta", async () => {
  const body = '{"a":1}', secret = "s3cr3t";
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(await verifySignature(body, sig, secret), true);
  assert.equal(await verifySignature(body + " ", sig, secret), false);
  assert.equal(await verifySignature(body, null, secret), false);
});

test("extrae texto y audio del webhook", () => {
  const p = { entry: [{ changes: [{ value: { messages: [{ id: "1", from: "573001112233", type: "text", text: { body: "hola" } }, { id: "2", from: "573001112233", type: "audio", audio: { id: "m9" } }] } }] }] };
  const ms = extractMessages(p);
  assert.equal(ms.length, 2);
  assert.equal(ms[1].audioId, "m9");
  assert.equal(normalizeNumber("+57 300 111 2233"), "573001112233");
});
