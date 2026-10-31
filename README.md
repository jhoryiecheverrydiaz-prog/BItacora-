# Bitácora

Bitácora mensual de hábitos en dos páginas, como una libreta cuadriculada:

- **Bitácora:** una línea por día.
- **Hábitos:** una tabla de hábitos con su gráfica.

Es una web app que se instala en el iPhone. Funciona sin internet y los datos se quedan en el teléfono.

**App:** https://jhoryiecheverrydiaz-prog.github.io/BItacora-/

## Instalar en el iPhone

1. Abre el enlace en **Safari**.
2. Toca **Compartir** → **Añadir a pantalla de inicio** → **Añadir**.
3. Cierra Safari y abre **Bitácora desde el ícono**. Configúrala ahí.

> Safari y la app de pantalla de inicio tienen memorias separadas. Lo que configures en Safari no aparece en el ícono.

## Uso diario (2-3 minutos)

- **Hoy:** toca cada hábito para marcarlo. El ciclo es vacío → completo → mínimo. Mantén presionado para ver la versión mínima.
- **Línea del día:** escribe una sola cosa. Se guarda sola.
- **Días anteriores:** usa la tira de días para corregir hasta 7 días atrás. Más atrás, edítalos desde **Mes**.
- **Cierre de mes:** el primer día de cada mes aparece el cierre. Ahí decides qué hábitos mantener, subir, bajar, quitar o reemplazar, y se crea el mes nuevo.

## Año y metas por área

- **Año:** cumplimiento de cada mes, metas del año por área de vida (Fitness, Finanzas, Aventura, Superación personal, Relaciones, Trabajo; se pueden editar) y un plan de hábitos por área (diarios, semanales, mensuales). En el cierre de mes, el plan aparece como opciones para agregar.
- **Año** también muestra un mapa de calor de todos los días.
- **Fuerza del hábito** (en Mes → Cada hábito): media de las últimas semanas; un día fallado baja poco.
- **Mes** tiene 3 páginas: **Bitácora**, **Hábitos** (cumplimiento del mes, % por semana, días al 100 % 🏆, rachas y nota de cada hábito) y **Plan** (metas del mes, objetivos semanales, eventos importantes y facturas con total pagado/pendiente).
- **Día libre:** en Hoy, "Marcar como día libre". Ese día no cuenta en el %.

## Sistema (modo juego, opcional)

Inspirado en Solo Leveling. Se activa en **Ajustes → Sistema**. Aparece la pestaña **Sistema** con:

- **Nivel y rango de cazador** (E → D → C → B → A → S). El rango S llega con alrededor de un año constante.
- **Misión diaria:** tus hábitos de hoy con su recompensa. Completar todos da un bono.
- **Misión de recuperación:** si ayer quedó en blanco, registrar hoy da XP extra. Volver pesa más que no fallar.
- **Jefe de la semana:** terminar la semana con 80 % o más.
- **Estadísticas** (Fuerza, Agilidad, Vitalidad, Inteligencia, Percepción) que suben según el área de cada hábito.
- **Títulos** que se desbloquean.

El XP se calcula desde tu registro con las mismas reglas del panel de WhatsApp. Nunca resta: un día malo no quita nada y los días libres no cuentan.

## Importar desde Google Sheets

1. En Sheets: **Archivo → Descargar → Microsoft Excel (.xlsx)**.
2. En la app: **Ajustes → Importar desde Google Sheets** y elige el archivo.
3. Revisa cada mes (año detectado, hasta 5 hábitos) e importa. Antes se guarda un respaldo interno.

Los meses que no existen en la app entran como historial cerrado. Lo que pase del tope de 5 hábitos queda en "Otros hábitos registrados en Sheets".

## Respaldo (importante)

Si borras el ícono, **se borran los datos**.

- **Ajustes → Exportar respaldo** → "Guardar en Archivos" (iCloud Drive).
- Para recuperar: **Ajustes → Importar respaldo** y elige el archivo.
- La app te avisa si pasan 7 días sin respaldo. Además guarda internamente los últimos 5 respaldos automáticos, que se hacen antes de cada cierre e importación.

## Claude sin API

- El día de tu rendición de cuentas, **Hoy** muestra el botón **Enviar resumen semanal**. Pégalo en un chat con Claude.
- Si Claude te devuelve un JSON `bitacora_import`, pégalo en **Ajustes → Importar ajustes de Claude**. Queda como propuesta prellenada para el próximo cierre; nunca cambia el mes en curso.

## Registro en Notion

El resumen semanal y el mensual traen una línea para Claude: si tiene Notion conectado, lo registra en tu página privada **Bitácora · Personal** (Revisiones, Hábitos, Experimentos). La app no se conecta sola con Notion; Claude hace de puente.

## Recordatorio diario

Crea un recordatorio repetido en la app **Recordatorios**. Las instrucciones exactas están en Ajustes. No uses Atajos con "Abrir URL", porque abre Safari y Safari no ve tus datos.

## Pedir mejoras

Abre Claude Code en esta carpeta. `CLAUDE.md` resume las reglas del proyecto. Cada cambio del modelo de datos necesita una migración y su test.

## Desarrollo

```bash
node --test
```

```bash
python -m http.server 8000
```

Corre el servidor desde la carpeta padre y abre `http://localhost:8000/BItacora-/`.

- **Fecha simulada:** en la consola, `localStorage.debug = "1"`, y luego abre `?fecha=2026-11-01`.
- **Deploy:** sube la versión en `sw.js` (`CACHE`) y en `js/app.js` (`APP_VERSION`), haz commit y push.
