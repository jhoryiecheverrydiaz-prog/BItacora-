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
- UI en español de Colombia, tuteo, factual, sin regaños ni frases motivacionales. Sin rachas.
- Hábitos solo se agregan/quitan en el cierre (o "cambio de emergencia", que queda en `review.notes`).

## Mapa
- `index.html`, `manifest.webmanifest`, `sw.js` (cache-first del shell), `css/app.css`, `icons/`.
- `js/app.js`: arranque, router por hash (`#hoy #mes #ajustes #onboarding #cierre`), SW + aviso de actualización, `APP_VERSION`, fecha simulada `?fecha=YYYY-MM-DD` solo si `localStorage.debug === "1"`.
- `js/store.js`: IndexedDB `bitacora` (store `state` clave `main`, store `backups` últimos 5), guardado con debounce 300 ms.
- `js/core/` (lógica pura, sin DOM, 100 % testeada):
  - `dates.js` fechas locales, semana ISO, formatos en español.
  - `stats.js` done/full/min/expected/pct, score diario, % días registrados, mejor día, día flojo, avance semanal.
  - `months.js` estado inicial, mes parcial de arranque, cierre con decisiones (keep/up/down/remove/replace), meses saltados, "cerrar después", registro diario, avisos.
  - `summary.js` textos para Claude (semanal/mensual, formato §8.1).
  - `importer.js` validación de respaldos y del JSON `bitacora_import` (keepId = id o etiqueta).
  - `migrate.js` versión del esquema y migraciones.
- `js/ui/`: `dom.js` (h, modales, toasts, compartir), `install.js`, `onboarding.js` (también `habitForm`, `reminderBlock`, `LINE_MODES`), `today.js`, `month.js` (gráfica SVG), `review.js` (cierre), `settings.js`.
- `tests/`: `node --test`, un archivo por módulo core + `fixtures.js`.

## Modelo (schemaVersion 1)
`{ schemaVersion, profile, months: { "YYYY-MM": { key, startDay, isStarter, mantra, goals[], habits[], days{ "YYYY-MM-DD": { note, checks{id: full|min} } }, changeLog[], review, provisional? } }, meta: { lastOpenedDate, lastBackupAt, lastWeeklySentAt, persistGranted, closeSnoozedOn, onboardingDraft, pendingImport } }`

## Notion (camino A: Claude como puente)
- La app no llama a Notion: la clave quedaría pública y Notion bloquea llamadas desde el navegador.
- Los resúmenes (`summary.js`, `NOTION_LINE`) piden a Claude registrarlos en la página privada "Bitácora · Personal" de Jhoryi: bases Hábitos, Revisiones, Experimentos y Mejoras de la app.
- Cada versión publicada se anota en "Mejoras de la app". Nada de Notion (enlaces, datos) entra al repo.
- Camino B (sincronización con un Worker y la clave como secreto) queda para cuando la estructura esté probada.

## Comandos
- Tests: `node --test` (Node ≥ 18).
- Servir local: `python -m http.server` desde la carpeta padre y abrir `http://localhost:8000/BItacora-/`.
- Debug: en consola `localStorage.debug = "1"` y abrir `?fecha=2026-11-01`.
- Deploy: subir versión en `sw.js` y `js/app.js` → commit → `git push` (Pages publica `main` /).
