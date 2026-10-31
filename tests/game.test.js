import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter } from './fixtures.js';
import { toggleCheck, setNote } from '../js/core/months.js';
import { addYearGoal, toggleYearGoal } from '../js/core/years.js';
import * as G from '../js/core/game.js';

const mk = () => {
  const st = starter({ startKey: '2026-10-22', today: '2026-10-29' }); // GYM 4/sem, MED, AGUA; 22 = jueves
  const [gym, med, agua] = st.months['2026-10'].habits;
  gym.area = 'fit'; med.area = 'sup';
  return { st, gym, med, agua };
};

test('curva de niveles y rangos', () => {
  assert.equal(G.xpForLevel(1), 0);
  assert.equal(G.xpForLevel(2), 55);
  assert.equal(G.levelOf(0), 1);
  assert.equal(G.levelOf(54), 1);
  assert.equal(G.levelOf(55), 2);
  assert.equal(G.levelOf(G.xpForLevel(70)), 70);
  assert.equal(G.rankOf(1).id, 'E');
  assert.equal(G.rankOf(19).id, 'D');
  assert.equal(G.rankOf(70).id, 'S');
  assert.equal(G.nextRank(12).id, 'C');
  assert.equal(G.nextRank(80), null);
});

test('XP con las reglas del panel + misión diaria completa + estadísticas por área', () => {
  const { st, gym, med, agua } = mk();
  toggleCheck(st, '2026-10-22', gym.id);
  toggleCheck(st, '2026-10-22', med.id); toggleCheck(st, '2026-10-22', med.id); // mínimo
  toggleCheck(st, '2026-10-22', agua.id);
  const g = G.gameStats(st, '2026-10-22');
  // 4 registro + 10 + 6 + 10 + 20 perfecto
  assert.equal(g.xp, 50);
  assert.equal(g.perfectDays, 1);
  assert.equal(g.daysRegistered, 1);
  assert.deepEqual(g.todayGain.parts.map((p) => p[1]), [4, 10, 6, 10, 20]);
  const stat = Object.fromEntries(g.stats.map((s) => [s.id, s.value]));
  assert.deepEqual(stat, { fue: 11, agi: 10, vit: 11, int: 10, per: 10 }); // MED mín. = 0,5 → piso
  assert.ok(g.titles.find((t) => t.id === 'mazmorra').unlocked);
  assert.ok(!g.titles.find((t) => t.id === 'regreso').unlocked);
});

test('nota sola cuenta como registro; recuperación tras día en blanco; día libre no corta', () => {
  const { st, med } = mk();
  setNote(st, '2026-10-22', 'solo nota');
  // 23 en blanco
  toggleCheck(st, '2026-10-24', med.id); // recupera
  st.months['2026-10'].days['2026-10-25'] = { note: '', checks: {}, off: true };
  toggleCheck(st, '2026-10-26', med.id); // tras día libre: no es recuperación
  const g = G.gameStats(st, '2026-10-26');
  assert.equal(g.recoveries, 1);
  assert.equal(g.xp, 4 + (4 + 10 + 15) + (4 + 10));
  const q = G.todayQuest(st, '2026-10-24');
  assert.equal(q.recoveryAvailable, true);
  assert.equal(G.todayQuest(st, '2026-10-26').recoveryAvailable, false);
});

test('jefe semanal y metas cumplidas suman XP', () => {
  const { st, gym, med, agua } = mk();
  for (let d = 26; d <= 31; d++) { toggleCheck(st, `2026-10-${d}`, med.id); toggleCheck(st, `2026-10-${d}`, agua.id); }
  for (const d of [26, 27, 28, 29]) toggleCheck(st, `2026-10-${d}`, gym.id);
  const before = G.gameStats(st, '2026-10-31');
  assert.equal(before.bosses, 0, 'la semana aún no termina');
  const after = G.gameStats(st, '2026-11-01');
  assert.equal(after.bosses, 1);
  st.months['2026-10'].goals[0].done = true;
  const g = addYearGoal(st, '2026', 'fit', 'Correr');
  toggleYearGoal(st, '2026', g.id);
  const withGoals = G.gameStats(st, '2026-11-01');
  assert.equal(withGoals.xp - after.xp, G.XP.monthGoal + G.XP.yearGoal);
  assert.ok(withGoals.titles.find((t) => t.id === 'puerta-roja').unlocked);
});

test('misión de hoy y avisos de progreso', () => {
  const { st, gym } = mk();
  const q = G.todayQuest(st, '2026-10-29');
  assert.equal(q.total, 3);
  assert.equal(q.done, 0);
  assert.equal(q.habits[0].stat, 'fue');
  const g0 = G.gameStats(st, '2026-10-29');
  const seen = G.seenFrom(g0);
  for (let d = 22; d <= 29; d++) for (const h of st.months['2026-10'].habits) toggleCheck(st, `2026-10-${d}`, h.id);
  const g1 = G.gameStats(st, '2026-10-29');
  const news = G.progressNews(g1, seen);
  assert.ok(news.some((n) => n.startsWith('Subiste a nivel')));
  assert.ok(news.some((n) => n === 'Título obtenido: Mazmorra despejada'));
  assert.deepEqual(G.progressNews(g1, null), []);
  assert.deepEqual(G.progressNews(g1, G.seenFrom(g1)), []);
  void gym;
});
