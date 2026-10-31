# Bitácora — memoria del proyecto

PWA de hábitos mensual (libreta de 2 páginas) para iPhone. HTML + CSS + JS vanilla con ES modules, sin build ni dependencias. Se sirve tal cual en GitHub Pages bajo `/BItacora-/`. Datos solo en IndexedDB del dispositivo.

## Reglas no negociables
- **Fechas locales siempre**: usar `js/core/dates.js` (`todayKey`, `addDays`…). Prohibido `toISOString()` para claves de fecha.
- **Tope de 5 hábitos por mes** (`MAX_HABITS`), validado en onboarding, cierre, import y cambio de emergencia.
- **3 estados por casilla**: vacío → `full` → `min` → vacío. `min` cuenta como cumplido.
- **Datos solo locales**. Nada personal en el repo (`CONTEXTO_PRIVADO.md` está en `.gitignore`).
- **Versionar el SW en cada deploy**: `CACHE` en `sw.js` = `bitacora-v<APP_VERSION>` de `js/app.js`. Si agregas un archivo, súmalo a `SHELL` en `sw.js`.
- **Todo cambio del modelo = migración + test** en `js/core/migrate.js` (`MIGRATIONS[n]` sube a n+1) y `tests/migrate.test.js`.
- Rutas relativas (nunca `/` absoluto). Sin `alert`/`confirm` (usar `modal`/`confirmModal` de `ui/dom.js`). Sin `navigator.vibrate` ni `beforeinstallprompt`.
- UI en español de Colombia, tuteo, factual, sin regaños ni frases motivacionales. Rachas solo como dato en Mes → Cada hábito (actual y máx., como en el Sheet); nunca avisos ni presión por rachas.
- **Nada del Sheet se pierde**: cada dato del tracker de Google Sheets tiene su lugar (ver "Google Sheets" abajo). Si el Sheet crece, se mapea igual.
- **Sistema (modo juego) opcional y derivado**: apagado por defecto (`meta.game.enabled`). XP, nivel, rango, estadísticas y títulos se CALCULAN del registro en `core/game.js`; nunca se guarda XP. Mismas reglas base que `whatsapp/src/logic.js` `dayXP` (día +4, completo +10, mínimo +6): si cambias una, cambia la otra. Sin castigos ni quitar XP; textos del Sistema factuales. Inspirado en el género de Solo Leveling, sin nombres ni imágenes de la obra.
- **Rendimiento**: todo módulo nuevo va también en `<link rel="modulepreload">` de `index.html` y en `SHELL` de `sw.js`. En Mes, la casilla responde al instante y la hoja se redibuja agrupada (`scheduleHabits`).
- Hábitos solo se agregan/quitan en el cierre (o "cambio de emergencia", que queda en `review.notes`).

## Mapa
- `index.html`, `manifest.webmanifest`, `sw.js` (cache-first del shell), `css/app.css`, `icons/`.
- `js/app.js`: arranque, router por hash (`#hoy #mes #ano #sistema #ajustes #onboarding #cierre`), avisos del Sistema tras cada guardado (`checkGame`), SW + aviso de actualización, `APP_VERSION`, fecha simulada `?fecha=YYYY-MM-DD` solo si `localStorage.debug === "1"`.
- `js/store.js`: IndexedDB `bitacora` (store `state` clave `main`, store `backups` últimos 5), guardado con debounce 300 ms.
- `js/core/` (lógica pura, sin DOM, 100 % testeada):
  - `dates.js` fechas locales, semana ISO, formatos en español.
  - `stats.js` done/full/min/expected/pct (días libres fuera de lo esperado; frecuencia diaria/semanal/mensual), cumplimiento del mes (`combinedPct`), % por semana, % diario, días al 100 % (premios), rachas, fuerza del hábito (`habitStrength`, media exponencial tipo Loop con ventana móvil para semanales/mensuales), mapa de calor anual (`yearHeatmap`), mejor día, día flojo, avance semanal y mensual.
  - `months.js` estado inicial, mes parcial de arranque, cierre con decisiones (keep/up/down/remove/replace), meses saltados, "cerrar después", registro diario, avisos.
  - `summary.js` textos para Claude (semanal/mensual, formato §8.1).
  - `importer.js` validación de respaldos y del JSON `bitacora_import` (keepId = id o etiqueta).
  - `migrate.js` versión del esquema y migraciones (`DEFAULT_AREAS`).
  - `years.js` áreas de vida y metas anuales, plan anual de hábitos por área (ideas diarias/semanales/mensuales), panorama del año.
  - `plan.js` plan del mes: objetivos semanales (generales y Semana 1-5), eventos importantes, facturas (valor, pagada, totales).
  - `game.js` Sistema: `gameStats` (XP, nivel `xpForLevel`, rangos E→S, 5 estadísticas por área `AREA_STAT`, misión diaria, recuperación, jefe semanal ≥ 80 %, metas, títulos), `todayQuest`, `progressNews`/`seenFrom`.
  - `sheets.js` importador del tracker de Sheets: CSV y .xlsx (unzip + XML propio con `DecompressionStream`, sin dependencias), detección de mes/año, días activos, hábitos, notas, parte de abajo del mes y pestaña Metas; `planImport` → `applyImport`.
- `js/ui/`: `dom.js` (h, modales, toasts, compartir, `pickFiles`), `install.js`, `onboarding.js` (también `habitForm` con área y frecuencia mensual, `useAreas`, `reminderBlock`, `LINE_MODES`), `today.js` (% del día/mes, día libre), `month.js` (3 páginas: Bitácora, Hábitos con gráfica/semanas/rachas, Plan), `year.js` (Año, con mapa de calor), `system.js` (Sistema), `review.js` (cierre, con el plan anual como opciones), `settings.js` (incluye importar de Sheets).
- `tests/`: `node --test`, un archivo por módulo core + `fixtures.js` + `sheet-fixture.js` (hoja sintética con el mismo diseño del Sheet y un .xlsx armado en memoria).

## Modelo (schemaVersion 3)
`{ schemaVersion, profile, areas: [{ id, name, emoji }], years: { "YYYY": { goals: [{ id, areaId, text, done, doneAt? }], habitIdeas: [{ id, areaId, text, freq: daily|weekly|monthly }] } }, months: { "YYYY-MM": { key, startDay, isStarter, mantra, goals[] (≤ 3 al crear, ≤ 10 importadas), habits[{ id, name, short, min, target{ daily | weekly,count | monthly,count }, area?, note?, level, color }], days{ "YYYY-MM-DD": { note, checks{id: full|min}, off? } }, weekGoals?[{ id, week 0-5, text, done }], events?[{ id, day, text, done }], bills?[{ id, day, text, amount, paid }], archived?[{ name, done[días], note? }], changeLog[], review (imported? si vino de Sheets), provisional? } }, meta: {…} }`
- v1 → v2: agrega `areas` (6 por defecto) y `years: {}`. El resto son campos opcionales.
- v2 → v3: `meta.game = { enabled: false, seen: null }` (`seen` = { level, rank, titles } ya avisados).

## Google Sheets (tracker mensual) → dónde vive cada dato
- Pestaña mes: casillas → `days.checks` (full); "Días activos" FALSE → `days.off`; "Tu progreso" → Mes: cumplimiento; % diario → gráfica y promedio diario; "Tareas realizadas semanalmente %" → Mes: Por semana; Racha actual/máx. → Mes: Cada hábito; Notas → `habit.note`; Premios 🏆 → días al 100 %; Metas mensuales → `month.goals`; Objetivos semanales y Semana N → `weekGoals`; Eventos importantes → `events`; Facturas mensuales → `bills`.
- Más de 5 hábitos (tope) o hábitos que no coinciden con los del mes → `month.archived` (historial de solo lectura).
- Pestaña Metas: áreas → `areas`; objetivos con casilla → `years[Y].goals`; Hábitos diarios/semanales/mensuales → `years[Y].habitIdeas` (se eligen en el cierre).
- Meses que no existen en la app entran cerrados (`review.imported`); el mes abierto solo suma marcas de hábitos con el mismo nombre. Reimportar no duplica.
- En .xlsx el encabezado de días son fechas seriales (=K9+1): de ahí salen mes y año. En CSV el año sale del día de la semana del día 1.

## Notion (camino A: Claude como puente)
- La app no llama a Notion: la clave quedaría pública y Notion bloquea llamadas desde el navegador.
- Los resúmenes (`summary.js`, `NOTION_LINE`) piden a Claude registrarlos en la página privada "Bitácora · Personal" de Jhoryi: bases Hábitos, Revisiones, Experimentos y Mejoras de la app.
- Cada versión publicada se anota en "Mejoras de la app". Nada de Notion (enlaces, datos) entra al repo.
- Camino B (sincronización con un Worker y la clave como secreto) queda para cuando la estructura esté probada.

## WhatsApp (`whatsapp/`, Cloudflare Worker aparte de la PWA)
- Audio/texto por WhatsApp → Groq Whisper → Claude (`claude-opus-5-5`, salida estructurada con zod) → Notion "Registro diario" → respuesta con máx. 3 preguntas.
- `src/logic.js` lógica pura (fechas en `TZ_NAME`, merge del día, XP igual al panel, propiedades de Notion, firma de Meta); `src/index.js` red.
- Claves e ids de Notion solo como secretos de Cloudflare. Nunca en el repo.
- Pruebas: `cd whatsapp && npm test` (archivos `pruebas/*.prueba.js`, no los toma el `node --test` de la raíz). Guía de cuentas en `whatsapp/README.md`.

## Comandos
- Tests: `node --test` (Node ≥ 18).
- Servir local: `python -m http.server` desde la carpeta padre y abrir `http://localhost:8000/BItacora-/`.
- Debug: en consola `localStorage.debug = "1"` y abrir `?fecha=2026-11-01`.
- Deploy: subir versión en `sw.js` y `js/app.js` → commit → `git push` (Pages publica `main` /).
