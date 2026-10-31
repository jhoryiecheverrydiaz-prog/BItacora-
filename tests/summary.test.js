import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter } from './fixtures.js';
import { toggleCheck, setNote, applyClose } from '../js/core/months.js';
import { weeklySummary, monthlySummary, weeklyRange } from '../js/core/summary.js';

function filled() {
  const st = starter();
  const [gym, med, agua] = st.months['2026-10'].habits.map((h) => h.id);
  const t = (k, id, n = 1) => { for (let i = 0; i < n; i++) toggleCheck(st, k, id); };
  t('2026-10-28', gym); t('2026-10-28', med); t('2026-10-28', agua);
  t('2026-10-29', med, 2); t('2026-10-29', agua);
  t('2026-10-30', gym, 2); t('2026-10-30', med, 2); t('2026-10-30', agua);
  t('2026-10-31', agua); t('2026-10-31', med); t('2026-10-31', gym);
  setNote(st, '2026-10-28', 'Arranqué');
  setNote(st, '2026-10-29', 'Reunión larga');
  return st;
}

test('resumen semanal con el formato §8.1', () => {
  const txt = weeklySummary(filled(), '2026-10-31');
  const lines = txt.split('\n');
  assert.equal(lines[0], '[BITÁCORA · RESUMEN SEMANAL · 2026-W44 · 26 oct–1 nov]');
  assert.equal(lines[1], 'Mes 2026-10 (arranque) · Mantra: "Poco y siempre"');
  assert.equal(lines[2], 'Días registrados: 4/4 · En blanco: 0');
  assert.equal(lines[3], 'Hábitos (cumplidos/esperados, mín. entre paréntesis):');
  assert.equal(lines[4], '- GYM Gimnasio [4/sem]: 3/2 (1)');
  assert.equal(lines[5], '- MED Meditar [diario]: 4/4 (2)');
  assert.equal(lines[6], '- AGUA Agua [diario]: 4/4 (0)');
  assert.equal(lines[7], 'Puntaje diario: L- M- X3 J2 V3 S3 D-');
  assert.deepEqual(lines.slice(8, 11), ['Líneas:', '28: Arranqué', '29: Reunión larga']);
  assert.equal(lines[11], 'Objetivos del mes: [ ] Renovar pasaporte');
  assert.equal(lines[12], '---');
  assert.match(lines[13], /^Instrucción para Claude: Analiza esto en máx\. 6 líneas/);
  assert.match(lines[14], /^Si tienes Notion conectado: regístralo en la página "Bitácora · Personal"/);
  assert.match(lines[15], /^Formato JSON:/);
});

test('el lunes resume la semana que terminó', () => {
  assert.deepEqual(weeklyRange('2026-11-02'), { start: '2026-10-26', end: '2026-11-01', ref: '2026-11-01' });
  assert.equal(weeklyRange('2026-10-28').start, '2026-10-26');
});

test('resumen mensual incluye decisiones y próximo mes', () => {
  const st = filled();
  const [gym, med] = st.months['2026-10'].habits;
  applyClose(st, '2026-10', { decisions: { [gym.id]: { decision: 'up', pct: 1 }, [med.id]: { decision: 'keep' } } }, '2026-11-01');
  const txt = monthlySummary(st, '2026-10', '2026-11-01', null, { mantra: 'Nuevo', goals: ['A'] });
  assert.match(txt, /^\[BITÁCORA · RESUMEN MENSUAL · 2026-10 · 28–31 oct\]/);
  assert.match(txt, /- GYM Gimnasio \[4\/sem\]: 3\/2 \(1\) → subir nivel/);
  assert.match(txt, /- MED Meditar \[diario\]: 4\/4 \(2\) → mantener/);
  assert.match(txt, /Puntaje diario: 28:3 29:2 30:3 31:3/);
  assert.match(txt, /Mejor día: 28 \(3\) · Día más flojo: —/);
  assert.match(txt, /Próximo mes · Mantra: "Nuevo" · Objetivos: A/);
  assert.match(txt, /Si tienes Notion conectado: regístralo en la página "Bitácora · Personal"/);
});

test('resúmenes v2: días libres, % del mes, áreas y metas del año', async () => {
  const { addYearGoal, toggleYearGoal } = await import('../js/core/years.js');
  const st = filled();
  const m = st.months['2026-10'];
  m.habits[0].area = 'fit';
  m.days['2026-10-31'].off = true;
  const g = addYearGoal(st, '2026', 'fit', 'Correr 10 km');
  addYearGoal(st, '2026', 'fin', 'Ahorrar');
  toggleYearGoal(st, '2026', g.id);
  const w = weeklySummary(st, '2026-10-31');
  assert.match(w, /Días registrados: 3\/3 · En blanco: 0 · Días libres: 1/);
  assert.match(w, /- GYM Gimnasio \[4\/sem · Fitness\]/);
  assert.match(w, /Puntaje diario: L- M- X3 J2 V3 SL D-/);
  assert.match(w, /Metas 2026: 🏋️ Fitness 1\/1 · 💰 Finanzas 0\/1/);
  const mo = monthlySummary(st, '2026-10', '2026-11-01');
  assert.match(mo, /Cumplimiento del mes: \d+ % · Por semana: S1 \d+ %/);
  assert.match(mo, /31:L/);
  assert.match(mo, /"area":"<id o nombre de área>"/);
});
