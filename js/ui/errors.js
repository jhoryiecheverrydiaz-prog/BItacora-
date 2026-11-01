// Errores del core → frase clara para la persona (con la acción cuando la hay).
// Los mensajes del core siguen siendo técnicos y estables (los usan los tests).
const MAP = [
  [/día fuera del mes registrado/, 'Ese día está fuera de tu registro (antes de tu primer día o en otro mes). Edítalo desde Mes.'],
  [/mes cerrado: solo se edita la nota/, 'Ese mes ya está cerrado: solo se puede editar la línea del día.'],
  [/mes cerrado: no se cambian los días libres/, 'Ese mes ya está cerrado: los días libres no se cambian.'],
  [/mes cerrado: el plan es de solo lectura/, 'Ese mes ya está cerrado: el plan es de solo lectura.'],
  [/el día anterior no tiene marcas/, 'El día anterior no tiene marcas para copiar.'],
  [/solo se destaca un día con nota/, 'Escribe la línea del día antes de destacarla.'],
  [/no hay datos para esta semana/, 'Todavía no hay registros esta semana para el resumen.'],
  [/hábito no existe en este mes/, 'Ese hábito no está en este mes.'],
  [/^máximo (\d+) /, (m, s) => `Llegaste al tope (${m[1]}). ${cap(s)}.`],
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function friendly(e) {
  const msg = String(e?.message || e || '');
  for (const [re, out] of MAP) {
    const m = re.exec(msg);
    if (m) return typeof out === 'function' ? out(m, msg) : out;
  }
  return cap(msg);
}
