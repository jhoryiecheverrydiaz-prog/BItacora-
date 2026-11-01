# Bitácora · Las 100 mejoras para que se sienta fluida, fácil y tuya

> Diagnóstico hecho sobre el código real (v2.1.0). Cada mejora respeta las reglas de la app: datos solo locales, máximo 5 hábitos, tono factual y sin presión por rachas.
> Las ideas de **puntualidad** (hacer cada hábito a su hora) y de **facilidad de uso** se basan en estudios citados al final.

## Estado de implementación (v2.3.0)

**Implementadas: 98 de 100** (8 adaptadas y 1 que iOS no muestra) · **Pendientes: 2** (68 y 95)

| Fase | Mejoras | Commit |
|---|---|---|
| v2.2 Fluidez base | 1–11, 49, 70, 71 | `fluidez-v2.2` |
| A · Modelo v4 y lógica | base de 21–31, 40, 46, 81–83, 87, 90, 91, 94 | Fase A |
| B · Hoy | 17, 21–23, 26–28, 41, 46, 47, 51, 57, 59, 60, 69, 74, 76, 77, 81, 82, 84, 85, 87, 91, 92, 94, 99 | Fase B |
| C · Mes, Plan y Año | 12, 14, 16, 18, 19, 24, 48, 53, 54, 56, 66, 67, 72, 75, 83, 90 | Fase C |
| D · Ajustes y apariencia | 25, 29, 30, 32–38, 40, 52, 55, 73, 79, 80, 93, 96, 100 | Fase D |
| E · Onboarding, cierre y salida | 31, 39, 43, 44, 45, 58, 78, 86, 88, 89, 97, 98 | Fase E |
| F · Rendimiento y cierre | 13, 15, 20, 42, 50, 61–65 | Fase F |

**Adaptadas (hechas de otra forma o en parte):**
- **15** View Transitions: el título de cada sección se transforma en el de la siguiente (Safari 18+); no la fila de Hoy volando a la cuadrícula.
- **20** La fuente propia (Caveat, OFL) se usa solo donde no existe Noteworthy: en el iPhone la libreta se ve igual que antes.
- **58** Restaurar respaldo está en el primer paso del onboarding (no en la pantalla de instalación).
- **63/65** Se memoriza el cálculo del Sistema por guardado y se precalcula en reposo; Mes y Año no se precalculan.
- **64** En vez de precargar la vista, las pestañas cambian al apoyar el dedo (no al soltarlo).
- **75** La gráfica se toca o arrastra; el mapa de calor se toca (no hace falta mantener presionado).
- **96** Se exporta a CSV con una fila por día (abre en Sheets/Excel), no al diseño exacto del tracker.

**Sin efecto en iPhone:** **86** accesos directos del manifest: Android/Chrome los muestra; iOS no los soporta. El atajo `#hoy/linea` sí funciona como enlace.

**Pendientes (a propósito):**
- **68** Guardado por mes en IndexedDB: cambia el almacenamiento de todos tus datos; vale la pena solo cuando el historial sea grande. Requiere migración de almacenamiento y pruebas con respaldos reales.
- **95** Recordatorio proactivo por WhatsApp: necesita un Cron Trigger en el Worker, una plantilla aprobada por Meta y tus secretos de Cloudflare; no se puede hacer solo desde el repositorio.

---

## Sección 1 · Por qué la app se siente "brusca"

| Causa técnica | Dónde pasaba en Bitácora | Efecto que sientes |
|---|---|---|
| **Redibujar toda la vista** en cada toque | `today.js → draw()` borraba y recreaba la página al marcar un hábito | Parpadeo, el teclado se cerraba, el foco se perdía |
| **Cero curvas de movimiento** | El CSS solo tenía 2 `transition` (opacidad de "Guardado" y la barra del onboarding) | Todo aparece y desaparece "de golpe" |
| **Sin feedback físico** | No hay háptica ni estado `:active` | No hay sensación de que el botón "cedió" bajo el dedo |
| **Scroll que salta** | `render()` hacía `scrollTo(0,0)` en *cada* render, incluso en la misma sección | Pierdes el lugar donde estabas |
| **Gestos caros** | Marcar "mínimo" exigía 2 toques; mantener presionado solo abría un modal informativo | Más pasos de los necesarios (Fitts/Hick) |
| **Hojas modales instantáneas** | `modal()` insertaba y quitaba el nodo sin transición | Sensación de "pop-up" de escritorio, no de app iOS |
| **Interfaz estática** | Mismo orden, mismo layout, todos los días y horas | No se siente personal: no "sabe" de tu rutina |
| **Onboarding largo y genérico** | 10 pasos lineales iguales para todos | Fricción inicial alta |

**Umbrales de referencia:** < 100 ms se percibe instantáneo; < 400 ms mantiene el flujo (umbral de Doherty); > 1 s rompe la atención (Nielsen). Animaciones de UI: 150–300 ms, curvas de desaceleración o resorte.

**Los 5 pilares del remedio:**
1. **Actualizar en sitio** (no redibujar) + *optimistic UI*: la pantalla cambia antes de que termine de guardar.
2. **Movimiento con física**: `transform`/`opacity` en GPU, curvas `ease-out` y resorte, siempre respetando *reducir movimiento*.
3. **Feedback multisensorial**: presión visual (< 100 ms), háptica, sonido opcional.
4. **Contexto**: la app sabe la hora, tu ancla y tus patrones, y se reordena sola (*smart defaults*).
5. **Menos pasos**: gestos directos, *progressive disclosure*, defaults inteligentes.

---

## Sección 2 · Las 100 mejoras

### Categoría 1 · UI/UX y micro-interacciones de alta fluidez (1–20)

**[1] ✅ Actualización en sitio al marcar un hábito**
• Problema actual: cada toque recreaba toda la vista de Hoy; se cerraba el teclado de la "Línea del día" y había parpadeo.
• Solución: cada fila guarda referencias a su casilla, estado y subtítulo; `refresh()` solo cambia esos nodos y el contador del día.
• Impacto: Usabilidad (alto). Elimina el 100 % de los saltos al marcar.
• Dificultad: Baja

**[2] ✅ Casilla con resorte (*spring physics*)**
• Problema: el cuadro se llenaba sin transición, como un interruptor eléctrico.
• Solución: animación `box-pop` 340 ms con `cubic-bezier(.34,1.56,.64,1)` (leve rebote) solo en la casilla tocada.
• Impacto: Usabilidad / Delight.
• Dificultad: Baja

**[3] ✅ Estado de presión en todo lo tocable**
• Problema: los botones no "ceden" al tocarlos; no hay confirmación antes de soltar el dedo.
• Solución: `:active { transform: scale(.97) }` con transición de 140 ms en botones, chips, filas, píldoras de día y pestañas.
• Impacto: Usabilidad (feedback < 100 ms).
• Dificultad: Baja

**[4] ✅ Hojas modales que suben y bajan**
• Problema: `modal()` aparecía y desaparecía de golpe.
• Solución: fundido del fondo (200 ms) + la hoja sube 28 px con `ease-out`; al cerrar baja y se desvanece (180 ms). La promesa se resuelve al instante para que nada espere la animación.
• Impacto: Usabilidad / sensación nativa iOS.
• Dificultad: Baja

**[5] ✅ Toasts con entrada y salida**
• Problema: los avisos ("Guardado", "[SISTEMA]…") aparecían/desaparecían en seco.
• Solución: entrada con resorte desde abajo, salida con fundido (`.toast.out`).
• Impacto: Usabilidad.
• Dificultad: Baja

**[6] ✅ Transición al cambiar de sección**
• Problema: pasar de Hoy a Mes era un corte duro.
• Solución: la vista nueva entra con fundido + 6 px hacia arriba (240 ms). Solo cuando cambia la sección, no en cada redibujo.
• Impacto: Usabilidad (continuidad espacial).
• Dificultad: Baja

**[7] ✅ Deslizar para cambiar de día en Hoy**
• Problema: para editar ayer había que apuntar a una píldora pequeña.
• Solución: gesto horizontal (≥ 60 px, dominante sobre el vertical) cambia al día anterior/siguiente; la página entra deslizándose desde el lado correcto. Bloquea el "click fantasma" tras el gesto.
• Impacto: Usabilidad / ergonomía (gesto en toda la pantalla vs. objetivo de 44 px).
• Dificultad: Baja

**[8] ✅ Mantener presionado = marcar "mínimo"**
• Problema: llegar a "mínimo" costaba 2 toques y mantener presionado solo mostraba un modal.
• Solución: *long press* marca directo el mínimo (`setCheck`) y muestra un toast "Mínimo: …". El toque normal sigue con el ciclo.
• Impacto: Usabilidad (–50 % de toques para el estado más usado en días difíciles).
• Dificultad: Baja

**[9] ✅ Conservar el scroll al redibujar la misma sección**
• Problema: `render()` mandaba arriba en cada redibujo (por ejemplo, tras exportar un respaldo).
• Solución: solo se sube al inicio si cambia la sección; si no, se restaura `scrollY`.
• Impacto: Usabilidad.
• Dificultad: Baja

**[10] ✅ Tocar la pestaña activa sube al inicio**
• Problema: tocar "Mes" estando en Mes recargaba la vista.
• Solución: convención iOS: si ya estás en la pestaña, hace *smooth scroll* arriba sin redibujar.
• Impacto: Usabilidad.
• Dificultad: Baja

**[11] ✅ Barras de progreso que crecen**
• Problema: las barras (% del mes, XP) saltaban de un valor a otro.
• Solución: `transition: width .4s ease-out` en `.bar`, `.sys-meter` y la barra del chip del Sistema.
• Impacto: Usabilidad / Delight (hace visible el progreso).
• Dificultad: Baja

**[12] Deshacer en lugar de confirmar**
• Problema: borrar un evento, factura u objetivo pide confirmación modal (interrumpe).
• Solución: borrar al instante + toast "Borrado · Deshacer" 5 s (guarda el objeto y su índice; `undo` lo reinserta).
• Impacto: Usabilidad (patrón Gmail: menos interrupciones, mismo nivel de seguridad).
• Dificultad: Baja

**[13] Hoja inferior arrastrable (*drag-to-dismiss*)**
• Problema: los modales solo se cierran con botón o tocando fuera.
• Solución: arrastrar la hoja hacia abajo > 80 px (o con velocidad > 0,5 px/ms) la cierra, siguiendo el dedo con `transform`.
• Impacto: Usabilidad (gesto nativo de iOS).
• Dificultad: Media

**[14] Edición en línea de la nota del día en Mes**
• Problema: tocar un día en Bitácora abre un modal para editar una sola línea.
• Solución: la fila se convierte en `input` en el mismo lugar (*inline edit*), Enter guarda, Escape cancela.
• Impacto: Usabilidad (sin cambio de contexto).
• Dificultad: Media

**[15] Transición de elemento compartido Hoy → Mes**
• Problema: al pasar a Mes pierdes la referencia de "dónde está hoy".
• Solución: View Transitions API (`document.startViewTransition`, Safari 18+) con `view-transition-name` en la fila de hoy, que vuela a su posición en la cuadrícula.
• Impacto: Usabilidad (orientación espacial).
• Dificultad: Media

**[16] Indicador de página de Mes que sigue al dedo**
• Problema: los puntos de página cambian solo al terminar el scroll.
• Solución: interpolar el punto activo con `scrollLeft / clientWidth` en cada frame (`requestAnimationFrame`).
• Impacto: Usabilidad.
• Dificultad: Baja

**[17] Píldora de día con "tinta" de cumplimiento**
• Problema: la tira de días solo muestra punto lleno/vacío.
• Solución: fondo de la píldora con relleno proporcional al % del día (gradiente vertical), animado al marcar.
• Impacto: Usabilidad (ves la semana de un vistazo).
• Dificultad: Baja

**[18] Contadores que cuentan (números animados)**
• Problema: los % cambian de golpe.
• Solución: interpolar el número 0→valor en 300 ms (`requestAnimationFrame`) en el % del mes y el XP.
• Impacto: Delight.
• Dificultad: Baja

**[19] Gráfica que se dibuja**
• Problema: la gráfica SVG del mes aparece completa sin contexto.
• Solución: `stroke-dasharray/dashoffset` animado al entrar a la página Hábitos (solo la primera vez por sesión).
• Impacto: Delight.
• Dificultad: Baja

**[20] Fuente de mano cargada de forma consistente**
• Problema: la fuente "de libreta" depende de Noteworthy/Bradley Hand; en otros equipos cae a otra y cambia el ancho (*layout shift*).
• Solución: autoalojar una fuente manuscrita ligera (woff2 ~20 KB, en `SHELL` del SW) con `font-display: swap` y `size-adjust`.
• Impacto: Usabilidad / consistencia visual.
• Dificultad: Baja

---

### Categoría 2 · Personalización inteligente y contextual (21–40)

**[21] Momento del día por hábito (mañana / tarde / noche)**
• Problema: todos los hábitos se muestran igual a cualquier hora.
• Solución: campo opcional `habit.when` (migración v3→v4). Hoy agrupa en "Ahora", "Más tarde" y "Hecho"; lo que toca a esta hora queda arriba.
• Impacto: Personalización (alto) / Puntualidad.
• Dificultad: Media

**[22] Intención de implementación por hábito ("Cuando ___, haré ___")**
• Problema: el ancla existe solo a nivel de perfil (`profile.anchor`) y no se ve al usar la app.
• Solución: campo `habit.cue` ("después del café"). Se muestra como subtítulo y en el recordatorio. Los planes "cuándo-dónde" tienen un efecto medio-grande sobre el cumplimiento (d ≈ 0,65; Gollwitzer y Sheeran, 2006).
• Impacto: Personalización / Retención (efecto respaldado por un meta-análisis).
• Dificultad: Media

**[23] Orden aprendido**
• Problema: el orden de los hábitos es el de creación.
• Solución: calcular la hora mediana en que marcas cada hábito (guardar `checkedAt` en `days.checks` como metadato) y ordenar por ella. Sin configuración.
• Impacto: Personalización.
• Dificultad: Media

**[24] Hora real vs. hora planeada (estudio de puntualidad personal)**
• Problema: no sabes si cumples a tiempo o "a última hora".
• Solución: con `checkedAt`, mostrar en Mes → Cada hábito: "Sueles marcarlo a las 7:40 (plan: 7:00)". Solo dato, sin regaño.
• Impacto: Personalización / Puntualidad.
• Dificultad: Media

**[25] Sugerir mover la hora del recordatorio**
• Problema: el recordatorio fijo (`reminderTime`) no se ajusta a tu ritmo real.
• Solución: si tu hora típica difiere > 45 min durante 2 semanas, mostrar en Ajustes: "Tu hora real es 8:10. ¿Cambiar el recordatorio?".
• Impacto: Personalización / Puntualidad.
• Dificultad: Baja

**[26] Pantalla de Hoy por franja horaria**
• Problema: de noche la app muestra lo mismo que de mañana.
• Solución: después de las 20:00 el foco pasa a la "Línea del día" y a los pendientes; de mañana, a los hábitos con `when = mañana`.
• Impacto: Personalización.
• Dificultad: Baja

**[27] Línea del día con sugerencias propias**
• Problema: el placeholder es fijo por modo.
• Solución: chips con tus 5 palabras más usadas en notas del mes (cálculo local) para completar con un toque.
• Impacto: Personalización / menos tecleo.
• Dificultad: Media

**[28] Detección del "día flojo" de la semana**
• Problema: `stats.js` ya calcula el día flojo, pero no se usa para ayudarte antes.
• Solución: ese día, Hoy muestra arriba la versión mínima de cada hábito en lugar del nombre completo.
• Impacto: Personalización / Retención.
• Dificultad: Baja

**[29] Días libres recurrentes**
• Problema: el día libre se marca a mano cada vez.
• Solución: en Ajustes, "Mis días libres fijos" (por ejemplo, domingo) que se marcan solos; editable por día.
• Impacto: Personalización / menos pasos.
• Dificultad: Media

**[30] Frecuencias flexibles con días específicos**
• Problema: un semanal 4/7 no dice qué días.
• Solución: `target.days: [1,3,5]` opcional; ese día aparece arriba y los otros días va a "Opcional hoy".
• Impacto: Personalización / Puntualidad.
• Dificultad: Media

**[31] Recomendación en el cierre basada en datos**
• Problema: el cierre ofrece keep/up/down, pero la decisión es manual.
• Solución: preseleccionar la opción según `habitStrength` (≥ 80 % → subir; < 40 % → bajar al mínimo), con el motivo en una línea.
• Impacto: Personalización / smart defaults.
• Dificultad: Baja

**[32] Colores elegibles por hábito**
• Problema: los 5 colores se asignan por orden.
• Solución: selector de color por hábito (los 5 de la paleta + 3 extra) que se mantiene entre meses.
• Impacto: Personalización estética.
• Dificultad: Baja

**[33] Ícono o emoji por hábito**
• Problema: solo el área tiene emoji.
• Solución: `habit.icon` opcional, se muestra en la casilla de Hoy y en la cabecera de la cuadrícula del Mes.
• Impacto: Personalización / reconocimiento más rápido que leer.
• Dificultad: Baja

**[34] Tema de papel elegible**
• Problema: solo cuadrícula clara u oscura.
• Solución: papel cuadriculado, rayado, punteado o liso; tono crema, blanco o gris. Son variables CSS (`--grid`, `--paper`).
• Impacto: Personalización estética.
• Dificultad: Baja

**[35] Tamaño de texto propio**
• Problema: la tipografía es fija en 17 px.
• Solución: control de 3 pasos (Normal, Grande, Muy grande) que cambia `font-size` de `body`; todo está en `rem`/`em`.
• Impacto: Personalización / accesibilidad.
• Dificultad: Baja

**[36] Pestaña de inicio elegible**
• Problema: la app siempre abre en Hoy.
• Solución: opción "Abrir en: Hoy / Mes / Sistema". Útil para quien usa el modo juego como panel principal.
• Impacto: Personalización.
• Dificultad: Baja

**[37] Modo compacto de Hoy**
• Problema: filas de 60 px; con 5 hábitos y avisos, la línea del día queda abajo.
• Solución: densidad Cómoda/Compacta (filas de 48 px, sin subtítulo).
• Impacto: Personalización / ergonomía.
• Dificultad: Baja

**[38] Recordatorio con texto propio**
• Problema: el bloque de recordatorio es genérico.
• Solución: generar el texto exacto con tus hábitos de esa franja y tu ancla ("Después del café: Meditar 2 min, Agua") para copiarlo a Recordatorios.
• Impacto: Personalización / Puntualidad.
• Dificultad: Baja

**[39] Resumen semanal según la persona destinataria**
• Problema: el resumen es el mismo para Claude y para una persona.
• Solución: dos plantillas: técnica para Claude, breve y humana para WhatsApp.
• Impacto: Personalización / Retención (rendición de cuentas).
• Dificultad: Baja

**[40] Perfil de "temporada"**
• Problema: viajes, exámenes o enfermedad rompen la estructura.
• Solución: modo temporal "Temporada ligera" (fecha fin) en el que el día cuenta solo con mínimos, registrado en `changeLog`, sin tocar el tope de hábitos.
• Impacto: Personalización / Retención.
• Dificultad: Media

---

### Categoría 3 · Ergonomía, accesibilidad y simplificación de flujos (41–60)

**[41] Zona del pulgar: acciones abajo**
• Problema: los avisos con botón (cierre, resumen, respaldo) están arriba, fuera de la zona cómoda (el 49 % usa el teléfono con una mano; Hoober, 2013).
• Solución: mover los avisos a una tarjeta fija sobre la barra de pestañas; los títulos quedan arriba.
• Impacto: Usabilidad (ergonomía).
• Dificultad: Media

**[42] Botones de los modales en el orden del pulgar**
• Problema: la acción principal está a la derecha, pero la hoja es ancha.
• Solución: en pantallas < 400 px, apilar las acciones con la principal abajo y a todo el ancho.
• Impacto: Usabilidad.
• Dificultad: Baja

**[43] Onboarding de 3 pasos + el resto después**
• Problema: 10 pasos antes de usar la app.
• Solución: obligatorio solo nombre, hábitos y mínimos. Mantra, objetivos, rendición de cuentas y recordatorio pasan a tarjetas "Completa tu bitácora" en Hoy (*progressive disclosure*).
• Impacto: Retención (alto: cada paso extra pierde usuarios).
• Dificultad: Media

**[44] Hábitos sugeridos con el mínimo ya escrito**
• Problema: al crear un hábito personalizado hay que inventar nombre corto y mínimo.
• Solución: autocompletar `short` (ya existe `autoShort`) y proponer un mínimo por palabra clave ("leer" → "1 página").
• Impacto: Usabilidad / menos tecleo.
• Dificultad: Baja

**[45] Cierre de mes en 60 segundos**
• Problema: el cierre es largo y obligatorio.
• Solución: pantalla de un toque "Mantener todo igual" + "Revisar con detalle" como opción secundaria.
• Impacto: Usabilidad / Retención.
• Dificultad: Baja

**[46] Rellenar días anteriores en lote**
• Problema: para ponerte al día hay que ir día por día.
• Solución: en la tira, mantener presionado un día abre "Igual que ayer" o "Marcar todo mínimo".
• Impacto: Usabilidad.
• Dificultad: Baja

**[47] Prevención visual de errores en el día equivocado**
• Problema: al editar un día pasado, solo el título dice "· editando".
• Solución: banda de color de acento arriba + botón "Volver a hoy" fijo mientras `selected !== today`.
• Impacto: Usabilidad (evita marcar el día equivocado).
• Dificultad: Baja

**[48] Celdas más grandes en la cuadrícula del Mes**
• Problema: casillas de 20 px dentro de celdas de 44×30, con área táctil real menor que 44 pt.
• Solución: celdas de 44×36 y "zoom" a la semana actual con un toque en el encabezado de la semana.
• Impacto: Accesibilidad (objetivos táctiles de WCAG 2.2 y Apple).
• Dificultad: Baja

**[49] ✅ Reducir movimiento global**
• Problema: la regla anterior solo apagaba `transition`.
• Solución: con `prefers-reduced-motion` también se apagan las `animation` y los pseudo-elementos; el JS no lanza animaciones.
• Impacto: Accesibilidad.
• Dificultad: Baja

**[50] Contraste AA verificado**
• Problema: `--ink-3` sobre la cuadrícula y textos pequeños de 0,72 rem pueden quedar por debajo de 4,5:1.
• Solución: auditar tokens (claro y oscuro), subir `--ink-3` y el tamaño mínimo a 0,78 rem.
• Impacto: Accesibilidad.
• Dificultad: Baja

**[51] Anuncios para VoiceOver**
• Problema: al marcar, VoiceOver no anuncia el nuevo estado del día.
• Solución: región `aria-live` con "Meditar: completo. Hoy 2 de 3." (el contador ya tiene `aria-live` en v2.2).
• Impacto: Accesibilidad.
• Dificultad: Baja

**[52] Modo descanso visual nocturno**
• Problema: el blanco crema sigue brillando de noche si el sistema está en claro.
• Solución: tema "Noche cálida" automático entre 21:00 y 6:00 (tinta sepia, menos azul).
• Impacto: Ergonomía / Personalización.
• Dificultad: Baja

**[53] Teclado adecuado en cada campo**
• Problema: los campos de valor y día usan teclado genérico.
• Solución: `inputmode="decimal"` en facturas, `inputmode="numeric"` en día, `enterkeyhint` correcto en todos.
• Impacto: Usabilidad.
• Dificultad: Baja

**[54] Formato de moneda colombiano al escribir**
• Problema: el valor de la factura se escribe sin separadores.
• Solución: formatear en vivo con `Intl.NumberFormat('es-CO')` manteniendo la posición del cursor.
• Impacto: Usabilidad / prevención de errores.
• Dificultad: Baja

**[55] Ajustes por intención, no por módulo**
• Problema: Ajustes mezcla respaldo, importación, Sistema y recordatorios en una lista larga.
• Solución: agrupar en "Mis datos", "Mi rutina", "Apariencia" y "Avanzado" (colapsado).
• Impacto: Usabilidad (arquitectura de información, ley de Hick).
• Dificultad: Baja

**[56] Búsqueda en notas**
• Problema: encontrar algo que escribiste hace meses exige navegar mes por mes.
• Solución: buscador local en Año que filtra `days[].note` de todos los meses, con salto al día.
• Impacto: Usabilidad.
• Dificultad: Media

**[57] Respaldo en un toque desde el aviso, sin salir de Hoy**
• Problema: el aviso de respaldo abre la hoja de compartir y luego redibuja todo.
• Solución: tras compartir, solo desaparece la tarjeta con animación (en sitio, como en la mejora 1).
• Impacto: Usabilidad.
• Dificultad: Baja

**[58] Recuperación guiada si borras el ícono**
• Problema: la pantalla de instalación no pregunta si ya tenías datos.
• Solución: en el primer arranque, la opción "Ya usaba Bitácora: importar respaldo" está antes del onboarding.
• Impacto: Retención / prevención de pérdida.
• Dificultad: Baja

**[59] Mensajes de error accionables**
• Problema: los errores del core llegan como toast técnico ("día fuera del mes registrado").
• Solución: mapa de errores → frase + acción ("Ese día es anterior a tu primer mes. Ir a Mes").
• Impacto: Usabilidad.
• Dificultad: Baja

**[60] Atajos de teclado en iPad y escritorio**
• Problema: con teclado físico todo es con toque.
• Solución: teclas 1–5 marcan hábitos, ←/→ cambian de día y N enfoca la línea del día.
• Impacto: Usabilidad / accesibilidad.
• Dificultad: Baja

---

### Categoría 4 · Desempeño percibido y feedback inmediato (61–80)

**[61] Pintar antes de cargar (*instant shell*)**
• Problema: hasta que IndexedDB responde, la pantalla está en blanco.
• Solución: guardar en `localStorage` un resumen mínimo de Hoy (nombres de los hábitos y estado) y pintarlo en el primer frame; luego hidratar.
• Impacto: Desempeño percibido (alto: arranque < 100 ms).
• Dificultad: Media

**[62] Esqueleto con la forma real**
• Problema: mientras calcula Mes o Año no hay nada.
• Solución: *skeleton* con las filas y la cuadrícula en gris, con el mismo tamaño final (sin *layout shift*).
• Impacto: Desempeño percibido.
• Dificultad: Baja

**[63] Precalcular Mes y Año en segundo plano**
• Problema: `monthStats`, `yearHeatmap` y `gameStats` se calculan al abrir la pestaña.
• Solución: `requestIdleCallback` tras el primer render de Hoy calcula y cachea (memo por versión del estado).
• Impacto: Desempeño.
• Dificultad: Media

**[64] Precarga por intención**
• Problema: al tocar una pestaña empieza el trabajo.
• Solución: en `pointerdown` sobre la pestaña se renderiza la vista fuera de pantalla y en `click` solo se cambia (≈ 80–120 ms ganados).
• Impacto: Desempeño percibido.
• Dificultad: Media

**[65] Memoizar `gameStats`**
• Problema: el chip del Sistema recalcula todo el historial en cada `draw()` y en cada guardado (`checkGame`).
• Solución: cachear por mes cerrado (los meses cerrados no cambian) y recalcular solo el mes abierto.
• Impacto: Desempeño (escala con los años de uso).
• Dificultad: Media

**[66] Redibujo parcial en Mes**
• Problema: `scheduleHabits` redibuja Hábitos y Plan completos.
• Solución: aplicar la técnica de la mejora 1: actualizar solo la celda, el puntaje de la fila y el punto de la gráfica.
• Impacto: Desempeño / fluidez.
• Dificultad: Media

**[67] `content-visibility: auto` en hojas fuera de pantalla**
• Problema: las 3 páginas de Mes se pintan aunque no se vean.
• Solución: `content-visibility: auto; contain-intrinsic-size` en `.sheet`.
• Impacto: Desempeño (scroll más suave).
• Dificultad: Baja

**[68] Guardar sin bloquear el hilo**
• Problema: `structuredClone(state)` de todo el estado cada 300 ms crece con los años.
• Solución: guardar por mes (una clave por `YYYY-MM` en IndexedDB) y solo el mes tocado.
• Impacto: Desempeño a largo plazo.
• Dificultad: Alta (requiere migración de almacenamiento)

**[69] Indicador "Guardado" ligado al dato**
• Problema: el "Guardado" global arriba a la derecha queda lejos de lo que tocaste.
• Solución: micro-check junto a la línea del día al guardar la nota; los hábitos ya muestran su estado.
• Impacto: Feedback.
• Dificultad: Baja

**[70] ✅ Háptica sutil en iPhone**
• Problema: sin feedback táctil (la regla prohíbe `navigator.vibrate`, que iOS no soporta).
• Solución: `haptic()` hace clic sobre un `<input type="checkbox" switch>` oculto, que en iOS 18+ produce el "tic" del sistema. Se usa al marcar, al cambiar de día y en el día libre. En otros navegadores no hace nada.
• Impacto: Feedback / sensación nativa.
• Dificultad: Baja

**[71] ✅ Señal del día al 100 %**
• Problema: completar el día no tenía ningún cierre visual.
• Solución: el contador se pone en negrita con 🏆 (el mismo símbolo de "días al 100 %") y hace un pulso de 600 ms. Sin frases motivacionales.
• Impacto: Delight (regla del pico y el final).
• Dificultad: Baja

**[72] Estados vacíos útiles**
• Problema: Plan, eventos y facturas vacíos muestran solo "+ Agregar".
• Solución: estado vacío con un ejemplo en gris y un botón que lo prellena ("Ej.: Arriendo · día 5").
• Impacto: Usabilidad / activación.
• Dificultad: Baja

**[73] Actualización de versión sin interrupción**
• Problema: el toast "Hay una versión nueva" queda fijo (`duration: 0`) tapando la barra.
• Solución: aplicar la actualización sola en el próximo arranque en frío y mostrar "Novedades" una vez después.
• Impacto: Usabilidad.
• Dificultad: Baja

**[74] Contador de caracteres en la línea del día**
• Problema: el límite de 280 corta sin avisar.
• Solución: contador que aparece desde 240 y cambia de color en 270.
• Impacto: Feedback / prevención de errores.
• Dificultad: Baja

**[75] Tooltip táctil en la gráfica y el mapa de calor**
• Problema: los puntos no dicen su valor.
• Solución: tocar o arrastrar sobre la gráfica muestra el día y el puntaje; con mantener presionado en el mapa de calor se salta a ese día.
• Impacto: Usabilidad.
• Dificultad: Media

**[76] Feedback del modo juego en el mismo lugar**
• Problema: el XP ganado aparece en un toast genérico abajo.
• Solución: "+10" flotante que sale de la casilla tocada y va hacia el chip del Sistema (`transform` + `opacity`, 500 ms).
• Impacto: Delight / feedback causal.
• Dificultad: Media

**[77] Mostrar el avance de la semana**
• Problema: el hábito semanal dice "2/4 esta semana" como texto.
• Solución: 4 mini-segmentos que se llenan (efecto de gradiente de meta: el esfuerzo sube cerca de la meta; Kivetz, 2006).
• Impacto: Feedback / Retención.
• Dificultad: Baja

**[78] Progreso con avance inicial (*endowed progress*)**
• Problema: el mes empieza en "—".
• Solución: el primer día ya muestra el progreso de los días registrados del arranque; las tarjetas de onboarding también cuentan como pasos hechos (Nunes y Drèze, 2006).
• Impacto: Retención.
• Dificultad: Baja

**[79] Banner de modo sin conexión**
• Problema: "Buscar actualización" sin red solo muestra "Sin conexión".
• Solución: chip discreto "Funciona sin internet" para dar confianza, no un error.
• Impacto: Confianza.
• Dificultad: Baja

**[80] Medición de fluidez real**
• Problema: no hay datos para saber qué se siente lento.
• Solución: en modo debug, registrar `performance.measure` de render por vista e INP (Interaction to Next Paint) local; mostrarlos en Ajustes → Avanzado.
• Impacto: Ingeniería (decidir con datos).
• Dificultad: Baja

---

### Categoría 5 · Retención, *delight* y onboarding/offboarding sin fricción (81–100)

**[81] Reinicio fresco en días ancla (*fresh start*)**
• Problema: después de una mala semana no hay un punto de reinicio claro.
• Solución: los lunes y el día 1 del mes, Hoy muestra "Semana nueva · 0/7" limpio. Las fechas de inicio aumentan la intención de empezar (Dai, Milkman y Riis, 2014).
• Impacto: Retención.
• Dificultad: Baja

**[82] Evitar el efecto "ya qué" (*what-the-hell*)**
• Problema: tras 1 día fallado, el % baja y se siente "perdido".
• Solución: mostrar también "Fuerza del hábito" (ya existe) en Hoy al fallar: cae poco. Un día perdido no afecta la formación del hábito (Lally et al., 2010).
• Impacto: Retención.
• Dificultad: Baja

**[83] Línea de tiempo realista de 66 días**
• Problema: el usuario espera resultados en 21 días.
• Solución: en Mes → Cada hábito: "Día 34 de ~66 para que sea automático (mediana del estudio; varía entre 18 y 254)". Solo dato.
• Impacto: Retención / expectativas.
• Dificultad: Baja

**[84] Combinar con algo que disfrutas (*temptation bundling*)**
• Problema: los hábitos difíciles no tienen recompensa inmediata.
• Solución: campo opcional "Solo mientras…" ("podcast solo en el gym"), visible en el hábito (Milkman et al., 2014).
• Impacto: Retención.
• Dificultad: Baja

**[85] Apilar hábitos (*habit stacking*)**
• Problema: los hábitos son independientes.
• Solución: "Después de [hábito A]" crea una secuencia; al marcar A, B se resalta suavemente como siguiente.
• Impacto: Retención / Puntualidad.
• Dificultad: Media

**[86] Widget-atajo en la pantalla de inicio**
• Problema: abrir la app y buscar el hábito son 3 pasos.
• Solución: `shortcuts` en el manifest ("Marcar hoy", "Línea del día") con `#hoy?focus=line`.
• Impacto: Retención / acceso rápido.
• Dificultad: Baja

**[87] Marcar todo con un gesto**
• Problema: los días perfectos exigen N toques.
• Solución: tocar dos veces el contador "Hoy: x/n" marca como completo lo que falta, con deshacer en un toast.
• Impacto: Usabilidad.
• Dificultad: Baja

**[88] Revisión del domingo guiada**
• Problema: la rendición de cuentas es "copiar y pegar".
• Solución: 3 preguntas rápidas con chips (mejor día, qué falló, un ajuste) que se añaden al resumen semanal.
• Impacto: Retención / reflexión.
• Dificultad: Media

**[89] Postal del mes**
• Problema: el mes cerrado no deja un recuerdo que se pueda compartir.
• Solución: imagen generada con `<canvas>` (cuadrícula del mes, % y mantra) para guardar o compartir.
• Impacto: Delight / Retención.
• Dificultad: Media

**[90] Notas destacadas en el cierre**
• Problema: releer todas las líneas del mes es largo.
• Solución: marcar notas con ★ durante el mes; el cierre las muestra primero (pico y final).
• Impacto: Delight.
• Dificultad: Baja

**[91] "Hace un año" en Hoy**
• Problema: el historial largo no vuelve a aparecer.
• Solución: si existe la nota del mismo día del año anterior, mostrarla debajo de la línea del día (plegable).
• Impacto: Delight / Retención.
• Dificultad: Baja

**[92] Sonidos opcionales de libreta**
• Problema: la metáfora de libreta es solo visual.
• Solución: sonido de lápiz al marcar (Web Audio, 2 KB, apagado por defecto).
• Impacto: Delight.
• Dificultad: Baja

**[93] Temas por área de vida o por mes**
• Problema: la app se ve igual todo el año.
• Solución: el acento del mes toma el color del área más trabajada; se puede fijar a mano.
• Impacto: Personalización estética.
• Dificultad: Baja

**[94] Volver después de una pausa sin culpa**
• Problema: tras varios días sin abrir, la app abre con avisos pendientes.
• Solución: pantalla "Bienvenido de vuelta" con un solo botón "Empezar desde hoy" (los días intermedios quedan en blanco sin pedir nada) y las misiones de recuperación del Sistema.
• Impacto: Retención (alto).
• Dificultad: Baja

**[95] Recordatorio inteligente vía WhatsApp**
• Problema: el Worker de WhatsApp ya existe, pero solo recibe.
• Solución: mensaje programado (Cron Trigger) a la hora típica real (mejora 24) solo si no hay registro ese día.
• Impacto: Retención / Puntualidad.
• Dificultad: Media

**[96] Exportar a Sheets sin pérdida (salida)**
• Problema: se puede importar desde Sheets, pero no exportar.
• Solución: generar CSV/XLSX con el mismo diseño del tracker (inverso de `sheets.js`) para salir sin perder nada (*offboarding* sin fricción).
• Impacto: Confianza / Retención.
• Dificultad: Media

**[97] Respaldo automático en iCloud con un toque semanal**
• Problema: el respaldo depende de acordarse.
• Solución: el día de la rendición de cuentas, el resumen semanal y el respaldo salen en la misma hoja de compartir (2 archivos).
• Impacto: Retención / seguridad de datos.
• Dificultad: Baja

**[98] Títulos del Sistema por constancia, no por perfección**
• Problema: los títulos premian sobre todo los máximos.
• Solución: títulos por volver después de fallar ("Regresó 5 veces") que refuerzan la regla "nunca dos días seguidos".
• Impacto: Retención.
• Dificultad: Baja

**[99] Microcopia adaptada al modo**
• Problema: el tono es igual con el Sistema activado o no.
• Solución: con el Sistema activo, la microcopia de Hoy usa el lenguaje del Sistema ("Misión diaria 2/3"); sin él, el lenguaje de libreta. Factual en ambos.
• Impacto: Personalización.
• Dificultad: Baja

**[100] Novedades dentro de la app**
• Problema: al actualizar no sabes qué cambió (por ejemplo, el nuevo gesto de mantener presionado).
• Solución: hoja "Novedades de la v2.2" la primera vez que se abre una versión nueva, con un mini-demo animado del gesto y un botón "Entendido".
• Impacto: Adopción de funciones.
• Dificultad: Baja

---

## Prioridad recomendada (siguiente tanda)

1. **Rápidas y de alto impacto:** 12 (Deshacer), 43 (onboarding de 3 pasos), 47 (banda "editando"), 66 (redibujo parcial en Mes), 94 (volver sin culpa), 100 (novedades).
2. **Puntualidad (cambio de modelo → migración v4 + tests):** 21 (momento del día), 22 (intención "cuando ___"), 23–25 (`checkedAt`, hora real y ajuste del recordatorio), 30 (días específicos).
3. **Arquitectura:** 61 (*instant shell*), 63/65 (precálculo y memo), 68 (guardado por mes).

## Estudios usados

- Lally, van Jaarsveld, Potts y Wardle (2010). Formar un hábito tarda una mediana de 66 días (rango 18–254); un día fallado no afecta el proceso.
- Gollwitzer y Sheeran (2006). Meta-análisis sobre intenciones de implementación ("cuándo/dónde/cómo"): efecto medio-grande sobre el cumplimiento.
- Wood y Rünger (2016). Los hábitos se activan por el contexto (hora, lugar, acción previa).
- Fogg (2019). *Tiny Habits*: empezar en pequeño y anclar a una rutina existente (base del "mínimo").
- Milkman, Minson y Volpp (2014). *Temptation bundling*.
- Dai, Milkman y Riis (2014). *Fresh start effect*.
- Kivetz, Urminsky y Zheng (2006). Gradiente de meta.
- Nunes y Drèze (2006). Avance inicial (*endowed progress*).
- Harkin et al. (2016). Meta-análisis: monitorear el progreso mejora el logro de metas, sobre todo si se registra físicamente o se hace público.
- Nielsen (1993) y Doherty y Thadani (1982). Umbrales de respuesta de 0,1 s, 0,4 s y 1 s.
- Hoober (2013). Formas de sostener el teléfono y zona del pulgar.
- Leyes de Fitts y de Hick. Tamaño y distancia de los objetivos; número de opciones.
- Kahneman. Regla del pico y el final.
