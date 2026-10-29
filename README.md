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

## Respaldo (importante)

Si borras el ícono, **se borran los datos**.

- **Ajustes → Exportar respaldo** → "Guardar en Archivos" (iCloud Drive).
- Para recuperar: **Ajustes → Importar respaldo** y elige el archivo.
- La app te avisa si pasan 7 días sin respaldo. Además guarda internamente los últimos 5 respaldos automáticos, que se hacen antes de cada cierre e importación.

## Claude sin API

- El día de tu rendición de cuentas, **Hoy** muestra el botón **Enviar resumen semanal**. Pégalo en un chat con Claude.
- Si Claude te devuelve un JSON `bitacora_import`, pégalo en **Ajustes → Importar ajustes de Claude**. Queda como propuesta prellenada para el próximo cierre; nunca cambia el mes en curso.

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
