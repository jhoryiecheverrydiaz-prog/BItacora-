# Bitácora por dentro: cómo está hecha y cómo rehacerla

Este documento desarma la app capa por capa: qué hace cada pieza, por qué está hecha así y en qué orden construirla si quieres copiarla para otro proyecto.

---

## 1. Resumen en una frase

Es una **PWA sin build ni dependencias** (HTML + CSS + JS con ES modules nativos), servida tal cual desde GitHub Pages. Guarda todo en **IndexedDB** del teléfono, funciona sin internet gracias a un **service worker cache-first**, y toda la lógica está en **funciones puras testeadas con `node --test`**. Aparte hay un **Cloudflare Worker** (`whatsapp/`) que conecta WhatsApp → Whisper → Claude → Notion.

| Métrica | Valor |
|---|---|
| Líneas totales | ~7.000 |
| Dependencias de la PWA | 0 |
| Paso de build | ninguno |
| Tests | 73, todos pasan (`node --test`) |
| Esquema de datos | v3, con migraciones |

---

## 2. Arquitectura en 4 capas

```
index.html ─► js/app.js  (arranque, router, contexto, SW)
                 │
     ┌───────────┼────────────┐
     ▼           ▼            ▼
 js/ui/*.js   js/store.js   js/core/*.js
 (DOM, vistas) (IndexedDB)   (lógica PURA, sin DOM)
     │                        ▲
     └──── llama funciones ───┘
```

La regla que sostiene todo: **`core/` nunca toca el DOM ni el almacenamiento**. Recibe `state` y `today` (string `YYYY-MM-DD`) y devuelve datos o modifica `state`. Por eso se puede testear con Node sin navegador, y por eso la fecha se puede simular.

| Capa | Archivos | Responsabilidad |
|---|---|---|
| Entrada | `index.html`, `manifest.webmanifest`, `sw.js` | Shell, instalación, caché offline |
| Orquestación | `js/app.js` | Carga estado → migra → elige vista → registra SW |
| Persistencia | `js/store.js` | IndexedDB con debounce y respaldos internos |
| Lógica | `js/core/` | Fechas, estadísticas, meses, cierre, juego, importadores, resúmenes |
| Interfaz | `js/ui/` | Una función `renderX(root, ctx)` por pantalla |

---

## 3. Arranque (`js/app.js`)

Secuencia de `boot()`:

1. `store.load()` lee el registro `main` de IndexedDB.
2. Si existe → `migrate(raw)`; si no → `emptyState()`.
3. Si falla la lectura → `renderBroken()` ofrece **exportar los datos tal cual** (nunca se pierden).
4. Escucha `hashchange` (router), `visibilitychange` (al ocultarse hace `flush()`; al volver recalcula "hoy" por si pasó la medianoche) y `pagehide` (último `flush()`).
5. `render()` y luego `registerSW()`.

### El objeto `ctx`

Todas las vistas reciben el mismo `ctx`. Es la "inyección de dependencias" casera:

```js
const ctx = {
  state, today, version, debug,
  save()            // guardado con debounce 300 ms
  saveNow()         // guardado inmediato
  replaceState(s)   // reemplaza todo (import/restaurar) y redibuja
  go(route)         // navega por hash
  render()          // redibuja la vista actual
  backup(reason)    // respaldo interno
  exportBackup()    // hoja de compartir de iOS con el JSON
  checkForUpdate()
};
```

### Router por hash

No hay librería. `route()` = `location.hash.slice(1) || 'hoy'`, y `render()` aplica **guardas** en orden:

1. No está instalada y no aceptó seguir en navegador → pantalla de instalación.
2. Sin perfil o con borrador de onboarding → `onboarding`.
3. Hay un mes anterior sin cerrar (y no se pospuso hoy) → `cierre` obligatorio.
4. La fecha es anterior al primer mes → `sinmes`.
5. `sistema` solo si el modo juego está activo.

Luego busca en un diccionario `views[r]` y llama `renderX(view, ctx)`. Las pestañas inferiores se muestran u ocultan según la ruta.

### Fecha simulada

`computeToday()` acepta `?fecha=YYYY-MM-DD` **solo** si `localStorage.debug === "1"`. Como toda la lógica recibe `today` como parámetro, simular el día 1 del mes (para probar el cierre) es trivial.

---

## 4. Persistencia (`js/store.js`)

- Base `bitacora`, versión 1, dos object stores:
  - `state`: un solo registro con clave `"main"` → **todo el estado es un JSON**.
  - `backups`: autoincremental, se conservan los **últimos 5**.
- `tx(store, mode, fn)` envuelve una transacción en una promesa.
- `saveSoon(state)`: debounce de 300 ms; al terminar avisa a los listeners (`onSaved`), que muestran "Guardado" y revisan avisos del Sistema.
- `saveNow()` hace `structuredClone` antes de escribir (evita guardar referencias vivas a mitad de edición).
- **Fallback**: si IndexedDB no existe (modo privado raro), guarda en una variable `memory`.
- `flush()` se llama al ocultar la app y antes de actualizar el SW, para no perder lo último escrito.

> Por qué un solo documento y no tablas: el estado de un usuario es pequeño (kilobytes), así que leerlo y escribirlo entero es más simple, atómico y fácil de exportar/importar.

---

## 5. PWA y offline

### `manifest.webmanifest`
`start_url`, `scope` e `id` son `"./"` (relativos) para que funcione bajo `/BItacora-/` en GitHub Pages. `display: standalone`, colores de papel, íconos 192/512 y uno *maskable*.

### Metas de iOS en `index.html`
`apple-mobile-web-app-capable`, `status-bar-style: black-translucent`, `apple-touch-icon` de 180 px, `viewport-fit=cover` (para usar `env(safe-area-inset-*)` en el CSS) y dos `theme-color` (claro/oscuro).

### `<link rel="modulepreload">`
Cada módulo JS está listado para que el navegador los baje en paralelo y no en cascada de `import`.

### Service worker (`sw.js`)
- `install`: guarda en caché todo `SHELL` (lista explícita de archivos).
- `activate`: borra cachés `bitacora-*` viejas y hace `clients.claim()`.
- `fetch`: **cache-first**; las navegaciones caen a `index.html` (por eso funcionan los hash y `?fecha=`).
- No llama a `skipWaiting()` sola: espera el mensaje `'SKIP_WAITING'`.

### Flujo de actualización (sin recargas sorpresa)
1. Al publicar, cambias `CACHE = 'bitacora-vX'` y `APP_VERSION`.
2. El navegador detecta el `sw.js` distinto → instala el nuevo, que queda *waiting*.
3. La app muestra el toast **"Hay una versión nueva · Actualizar"**.
4. Al tocar: `flush()` → `postMessage('SKIP_WAITING')` → `controllerchange` → `location.reload()`, **solo** si el usuario lo pidió (`updateRequested`).

### Particularidad del iPhone
Safari y la app de pantalla de inicio tienen **almacenamientos separados**. Por eso `install.js` detecta `isStandalone()` (`display-mode: standalone` o `navigator.standalone`) y, si estás en Safari, muestra primero la guía de instalación.

---

## 6. Modelo de datos (schemaVersion 3)

```js
{
  schemaVersion: 3,
  profile: { name, lineMode, accountability, createdAt, ... },
  areas: [{ id: 'fit', name: 'Fitness', emoji: '🏋️' }, ...],
  years: { "2026": { goals: [...], habitIdeas: [...] } },
  months: {
    "2026-11": {
      key, startDay, isStarter, mantra, goals: [],
      habits: [{ id, name, short, min, target: { type: 'daily'|'weekly'|'monthly', count }, area, note, level, color }],
      days: { "2026-11-04": { note: "…", checks: { <habitId>: 'full'|'min' }, off?: true } },
      weekGoals?, events?, bills?, archived?,
      changeLog: [], review: null | { closedAt, perHabit, goalsResult, notes, imported?, skipped? },
      provisional?
    }
  },
  meta: { lastOpenedDate, lastBackupAt, lastWeeklySentAt, closeSnoozedOn, onboardingDraft, pendingImport, game: { enabled, seen } }
}
```

Claves de diseño:
- **Los hábitos viven dentro de cada mes**, no globales. Cambiarlos en noviembre no reescribe octubre.
- **Los días se guardan solo si tienen algo** (`cleanupDay` borra los vacíos): el JSON queda chico.
- Las claves son strings de fecha local, que además se ordenan alfabéticamente igual que cronológicamente.

### Migraciones (`core/migrate.js`)
```js
MIGRATIONS = { 1: s => {...; s.schemaVersion = 2; return s}, 2: s => {...; s.schemaVersion = 3; return s} }
```
`migrate()` aplica los pasos uno a uno, verifica que cada uno suba exactamente la versión, y rechaza respaldos de una versión más nueva. Cada migración tiene su test.

---

## 7. Lógica de negocio (`core/`)

### Fechas (`dates.js`): la regla número 1
Nunca `toISOString()`: en Bogotá (UTC−5), después de las 7 p. m. daría el día siguiente. Todo se arma con `getFullYear/getMonth/getDate`, y `toDate(key)` crea la fecha **a mediodía** para que los cambios de horario no muevan el día. Incluye semana ISO, índice lunes = 0 y formatos en español.

### Casilla de 3 estados (`months.js`)
```js
cycleValue = v => v == null ? 'full' : v === 'full' ? 'min' : undefined;
```
Vacío → completo → mínimo → vacío. `min` cuenta como cumplido (`isDone`).

### Cuánto se espera (`stats.js`)
```js
expectedFor(habit, díasActivos, largoMes)
  diario   → díasActivos
  semanal  → floor(count × díasActivos / 7)
  mensual  → floor(count × min(díasActivos, largoMes) / largoMes)
```
- Los **días libres** (`off`) no suman a lo esperado, pero lo hecho en ellos sí cuenta (tope 100 %).
- `elapsedKeys(month, today)` = días que ya cuentan (desde `startDay` hasta hoy; todo el mes si está cerrado). Así el mes de arranque parcial no penaliza.
- `combinedPct` = Σ min(hecho, esperado) / Σ esperado: un hábito sobrecumplido no tapa a otro flojo.

### Otras métricas
- `weeklyBreakdown`: % por semana lunes-domingo dentro del mes.
- `streaks`: racha actual y máxima, solo diarios; el día libre no corta y "hoy sin marcar" tampoco.
- `habitStrength`: media exponencial con vida media de 13 días (estilo Loop Habit Tracker); para semanales/mensuales usa una ventana móvil de 7/30 días para que los días "que no tocan" no castiguen.
- `yearHeatmap`: % diario de todo el año (estilo GitHub).
- Mejor día, día de la semana más flojo (con ≥ 7 días), días al 100 % (🏆).

### Ciclo de vida del mes
- **Onboarding** (`createStarterState`): el mes de arranque puede empezar hasta 7 días atrás (`startDay`).
- **Cierre** (`applyClose`): cuando hay un mes anterior sin `review`, el router obliga a cerrarlo. Por hábito decides `keep | up | down | remove | replace`; se valida el **tope de 5**; se guarda la revisión; se crean los meses saltados como cerrados ("Mes sin registros") y el mes nuevo.
- **"Cerrar después"** (`snoozeClose`, una sola vez): crea el mes actual *provisional* con los mismos hábitos; al cerrar se conserva lo registrado.
- **Cambio de emergencia**: modificar hábitos a mitad de mes deja rastro en `changeLog` → `review.notes`.

---

## 8. Interfaz (`js/ui/`)

### Mini "React" casero: `h()`
```js
h('button', { class: 'btn', onClick: fn, disabled: false }, 'Texto', otroNodo)
```
- `class`, `text`, `html`, `value`, `style` (objeto), booleanos y `onX` → `addEventListener`.
- Hijos anidados se aplanan; `null/false` se ignoran (permite `cond && h(...)`).
- `svg()` es lo mismo con `createElementNS` (las gráficas son SVG a mano).

### Patrón de cada vista
```js
export function renderToday(root, ctx) {
  const page = h('section', { class: 'page' }); root.append(page);
  function draw() { clear(page); page.append(/* … */); }
  // cada acción: mutar ctx.state con una función de core → ctx.save() → draw()
  draw();
}
```
Sin estado reactivo: **mutas, guardas y redibujas**. Para listas grandes (la hoja del mes), la casilla cambia al instante y el redibujo completo se agrupa con un timer de 450 ms (`scheduleHabits`), conservando scroll y foco.

### Componentes propios
- `modal()` / `confirmModal()` devuelven promesas (reemplazan `alert`/`confirm`, que se ven mal en PWA de iOS). Focus inicial, `Escape`, click afuera, foco restaurado.
- `toast()` con acción opcional; `flashSaved()` muestra "Guardado".
- `onLongPress()` con pointer events (450 ms, cancela si mueves > 10 px, anula el click siguiente).
- `shareText()` / `shareFile()`: `navigator.share` → portapapeles → textarea manual (cadena de respaldos).
- `pickFiles()` lee `.xlsx` como `ArrayBuffer` y el resto como texto.

### Mes en 3 páginas deslizables
Un contenedor con *scroll-snap* horizontal (`.sheets`) y puntos de página que se sincronizan con `scrollLeft / clientWidth`.

### Accesibilidad
`aria-pressed` en casillas, `role="img"` + `aria-label` en barras, tabla `sr-only` equivalente a la gráfica, `aria-current` en pestañas, `:focus-visible`.

---

## 9. Diseño visual (`css/app.css`)

- **Tokens en `:root`** (`--paper`, `--ink`, `--accent`, `--c1…--c5` para hábitos) y redefinidos en `@media (prefers-color-scheme: dark)`.
- **Papel cuadriculado sin imágenes**: dos `linear-gradient` de 1 px cruzados, `background-size: 22px 22px`, `background-attachment: fixed`.
- Tipografías del sistema: `-apple-system`, `ui-rounded` para títulos, `Noteworthy` (letra a mano de iOS) para acentos.
- `100dvh`, `env(safe-area-inset-*)`, `touch-action: manipulation` (quita el retraso del doble toque), `-webkit-tap-highlight-color: transparent`.
- Los colores de hábito se aplican por atributo: `[data-c="c1"]`.
- Clase `sys-mode` en `body` cambia la estética en la pestaña Sistema.

---

## 10. Modo juego "Sistema" (`core/game.js`)

Idea clave: **nada de XP guardado**. `gameStats(state, today)` recorre todo el registro y calcula:

| Fuente | XP |
|---|---|
| Registrar el día | +4 |
| Hábito completo / mínimo | +10 / +6 |
| Todos los hábitos del día | +20 |
| Recuperación (registrar tras un día en blanco) | +15 |
| Jefe semanal (semana ≥ 80 %, ≥ 4 días) | +50 |
| Meta del mes / del año | +30 / +100 |

- Nivel: `xpForLevel(n) = 5(n−1)² + 50(n−1)`. Rangos E(1) D(10) C(20) B(35) A(50) S(70).
- 5 estadísticas alimentadas por el área de cada hábito (`AREA_STAT`).
- Títulos = lista de `{ test: g => ... }`.
- Avisos: solo se guarda `meta.game.seen` (último nivel/rango/títulos avisados); `progressNews()` compara y lanza el toast `[SISTEMA]` tras cada guardado.

Ventaja: no se puede corromper ni inflar, y si cambias una regla se recalcula todo el historial.

---

## 11. Importador de Google Sheets (`core/sheets.js`), la pieza más ingeniosa

Lee un **.xlsx sin librerías**:
1. Un .xlsx es un ZIP. `unzip()` busca el *End Of Central Directory* (firma `0x06054b50`) desde el final, recorre el directorio central (`0x02014b50`) y por cada archivo lee la cabecera local.
2. Descomprime con la API nativa **`DecompressionStream('deflate-raw')`** (Safari 16.4+, Node 18+).
3. Parsea `sharedStrings.xml`, `workbook.xml` y cada `sheetN.xml` con regex/XML mínimo.
4. Detecta mes y año: en .xlsx el encabezado de días son **fechas seriales de Excel**; en CSV el año se deduce del día de la semana del día 1.
5. `planImport()` arma una propuesta revisable → `applyImport()` la aplica (meses nuevos entran cerrados con `review.imported`; reimportar no duplica; lo que excede 5 hábitos va a `archived`).

También trae un `parseCsv()` propio que detecta `;` o `,` y maneja comillas.

---

## 12. Claude sin API (`core/summary.js` + `core/importer.js`)

Un puente "manual" muy barato:
1. La app genera un **texto** (resumen semanal/mensual) con datos + una instrucción para Claude + una línea para registrar en Notion.
2. Lo compartes a Claude con la hoja de iOS.
3. Claude responde con un JSON `{"bitacora_import":1, "habits":[...], "mantra":..., "goals":[...]}`.
4. `extractJson()` lo encuentra aunque venga dentro de texto o bloque de código; `parseClaudeImport()` lo valida (tope de 5, `keepId` por id o etiqueta, áreas por id o nombre).
5. Queda como **propuesta prellenada para el próximo cierre**: nunca toca el mes en curso.

---

## 13. Worker de WhatsApp (`whatsapp/`)

Proyecto aparte (Cloudflare Workers, `wrangler deploy`), dependencias: `@anthropic-ai/sdk` y `zod`.

```
WhatsApp Cloud API ──POST /webhook──► Worker
   1. verifica firma HMAC x-hub-signature-256 (WHATSAPP_APP_SECRET)
   2. filtra por ALLOWED_NUMBER y deduplica por id de mensaje
   3. responde 200 de inmediato; el trabajo sigue en ctx.waitUntil()
   4. audio → Groq Whisper → texto
   5. lee hábitos activos de Notion
   6. Claude con salida estructurada (zod) extrae checks, energía, ánimo, etc.
   7. mergeRecord() mezcla con lo ya registrado ese día
   8. escribe en Notion "Registro diario" y responde con ≤ 3 preguntas
```
- `GET /webhook` responde el `hub.challenge` de verificación de Meta.
- `GET /` dice qué secretos faltan (diagnóstico).
- `src/logic.js` es puro (fechas con `Intl.DateTimeFormat` en `TZ_NAME`, XP igual al de la PWA) y está testeado aparte.
- Todas las claves van como **secretos de Cloudflare**, nunca en el repo.

---

## 14. Tests

- `node --test` en la raíz: un archivo por módulo de `core/`.
- `tests/fixtures.js` crea estados de ejemplo (`starter()`).
- `tests/sheet-fixture.js` genera una hoja sintética **y arma un .xlsx en memoria** para probar el lector ZIP.
- Las fechas se pasan explícitas (`'2026-10-29'`), así los tests no dependen del día real.
- Worker: `cd whatsapp && npm test`.

---

## 15. Receta para construir una copia (orden recomendado)

1. **Esqueleto PWA**: `index.html` con `<main id="view">`, `<nav id="tabs">`, `<div id="layer">` (modales/toasts), manifest con rutas relativas y metas de iOS.
2. **`core/dates.js`** con fechas locales y sus tests. Todo lo demás depende de esto.
3. **Modelo + `emptyState()` + `migrate.js`** con `schemaVersion: 1` desde el primer día.
4. **`store.js`**: IndexedDB con un registro, `saveSoon` con debounce, `flush` en `pagehide`/`visibilitychange`.
5. **`ui/dom.js`**: `h()`, `clear()`, `modal()`, `toast()`.
6. **`app.js`**: `ctx`, router por hash con guardas, `boot()`.
7. **Primera vista** (Hoy): mutar → `ctx.save()` → `draw()`.
8. **Lógica de dominio pura** (`stats.js`, `months.js`) con tests antes de la UI que la usa.
9. **`sw.js`** cache-first con `SHELL` explícito, versión en el nombre de la caché y actualización con aviso.
10. **Respaldo**: exportar/importar JSON con `navigator.share` y validación (`importer.js`).
11. Extras: gráficas SVG, importadores, resúmenes para IA, capa de juego derivada.
12. **Deploy**: GitHub Pages desde `main` / raíz. Subir la versión del SW en cada publicación.

### Plantilla mínima para arrancar

```js
// app.js
import * as store from './store.js';
import { h, clear } from './ui/dom.js';
const view = document.getElementById('view');
const ctx = { state: null, save: () => store.saveSoon(ctx.state), render: () => render() };
const views = { hoy: renderHoy };
function render() { clear(view); (views[location.hash.slice(1)] || renderHoy)(view, ctx); }
async function boot() {
  ctx.state = (await store.load()) || { schemaVersion: 1, items: [] };
  addEventListener('hashchange', render);
  addEventListener('pagehide', () => store.flush());
  render();
  navigator.serviceWorker?.register('sw.js');
}
function renderHoy(root, ctx) {
  root.append(h('button', { onClick: () => { ctx.state.items.push(Date.now()); ctx.save(); ctx.render(); } },
    `Toques: ${ctx.state.items.length}`));
}
boot();
```

---

## 16. Trampas que la app ya resolvió (y conviene copiar)

| Problema | Solución en la app |
|---|---|
| Día equivocado de noche (UTC) | `dates.js` solo con hora local; `toDate()` a mediodía |
| Datos separados Safari vs. ícono | Pantalla de instalación antes de configurar |
| Borrar el ícono borra los datos | Aviso cada 7 días sin respaldo + 5 respaldos internos antes de cierres/importaciones |
| Recarga sorpresa al actualizar | `skipWaiting` solo por mensaje; recarga solo si el usuario lo pidió |
| Perder lo último escrito al cerrar | `flush()` en `visibilitychange` y `pagehide` |
| `alert`/`confirm` feos o bloqueados en PWA | Modales propios con promesas |
| Retraso de 300 ms en toques | `touch-action: manipulation` |
| Cascada lenta de `import` | `modulepreload` de cada módulo |
| Respaldo de versión futura | `migrate()` lo rechaza con mensaje claro |
| Lógica difícil de probar | `core/` puro, `today` siempre como parámetro |
| Claves de API en el navegador | Notion/Claude solo desde el Worker (secretos) o vía Claude como puente manual |
