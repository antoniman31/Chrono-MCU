import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityByDay, streaks, weeklyActivity, heatmap, perWeek, milestones, breakdown, records, releaseTimeline, dayNumber, weekStart } from '../js/insights.js';

const film = (id, releaseDate, runtimeMin, extra = {}) => ({ id, title: id, type: 'film', phase: 1, saga: 'infinity', releaseDate, chronoOrder: 1, runtimeMin, verified: true, ...extra });
const serie = (id, releaseDate, n = 2) => ({
  id, title: id, type: 'serie', phase: 4, saga: 'multiverse', releaseDate, chronoOrder: 2, verified: true,
  episodes: Array.from({ length: n }, (_, i) => ({ n: i + 1, title: `e${i + 1}`, runtimeMin: 40 })),
});
const TODAY = '2026-10-28'; // mercredi

test('semaine : le lundi est le début', () => {
  const monday = dayNumber('2026-10-26');
  assert.equal(weekStart(dayNumber('2026-10-28')), monday);
  assert.equal(weekStart(dayNumber('2026-11-01')), monday);
  assert.equal(weekStart(monday), monday);
});

test('activité par jour : rattrapage et dates invalides ignorés', () => {
  const act = activityByDay({ a: '2026-10-27', b: '2026-10-27', c: '2026-10-26', d: 'x', e: '2026-10-20' }, { e: true });
  assert.equal(act[dayNumber('2026-10-27')], 2);
  assert.equal(act[dayNumber('2026-10-26')], 1);
  assert.equal(Object.keys(act).length, 2);
});

test('séries de jours : en cours (aujourd\'hui ou hier) et meilleure', () => {
  const act = activityByDay({ a: '2026-10-25', b: '2026-10-26', c: '2026-10-27', d: '2026-10-10', e: '2026-10-11' });
  assert.deepEqual(streaks(act, TODAY), { current: 3, best: 3 });
  assert.deepEqual(streaks(act, '2026-10-29'), { current: 0, best: 3 });
  assert.deepEqual(streaks({}, TODAY), { current: 0, best: 0 });
  const today = activityByDay({ a: '2026-10-28', b: '2026-10-27' });
  assert.equal(streaks(today, TODAY).current, 2);
});

test('activité par semaine : fenêtre glissante, semaine en cours en dernier', () => {
  const act = activityByDay({ a: '2026-10-28', b: '2026-10-26', c: '2026-10-19', d: '2020-01-01' });
  const weeks = weeklyActivity(act, TODAY, 4);
  assert.equal(weeks.length, 4);
  assert.deepEqual(weeks.map((w) => w.count), [0, 0, 1, 2]);
  assert.equal(weeks[3].start, '2026-10-26');
});

test('calendrier : 7 jours par colonne, futur à null, niveaux', () => {
  const act = activityByDay({ a: '2026-10-28', b: '2026-10-28', c: '2026-10-28', d: '2026-10-28', e: '2026-10-27' });
  const cells = heatmap(act, TODAY, 2);
  assert.equal(cells.length, 14);
  const today = cells.find((c) => c.day === TODAY);
  assert.deepEqual([today.count, today.level], [4, 3]);
  assert.equal(cells.find((c) => c.day === '2026-10-27').level, 1);
  assert.equal(cells.find((c) => c.day === '2026-10-29').level, null);
  assert.equal(cells[0].day, '2026-10-19');
});

test('moyenne par semaine', () => {
  assert.equal(perWeek({}, TODAY), null);
  const act = activityByDay({ a: '2026-10-15', b: '2026-10-16', c: '2026-10-28' });
  assert.ok(Math.abs(perWeek(act, TODAY) - 3 / (14 / 7)) < 1e-9);
});

test('jalons : première, dernière, paliers', () => {
  const titles = [film('a', '2008-01-01', 100), film('b', '2009-01-01', 100), film('c', '2010-01-01', 100), serie('s', '2011-01-01', 1)];
  assert.deepEqual(milestones(titles, {}), { first: null, last: null, steps: [] });
  const seen = { a: '2026-01-01', b: '2026-01-05', 's/1': '2026-02-01' };
  const m = milestones(titles, seen);
  assert.deepEqual(m.first, { date: '2026-01-01', label: 'a' });
  assert.deepEqual(m.last, { date: '2026-02-01', label: 's · ép. 1' });
  assert.deepEqual(m.steps, [{ pct: 25, date: '2026-01-01' }, { pct: 50, date: '2026-01-05' }, { pct: 75, date: '2026-02-01' }, { pct: 100, date: null }]);
});

test('répartition du temps par phase, saga et format', () => {
  const titles = [film('a', '2008-01-01', 100), film('court', '2009-01-01', 30, { phase: 2 }), serie('s', '2011-01-01', 2)];
  const b = breakdown(titles, { a: '2026-01-01', 's/1': '2026-01-02' });
  assert.deepEqual(b.byPhase.map((g) => [g.key, g.seenMin, g.totalMin]), [[1, 100, 100], [2, 0, 30], [4, 40, 80]]);
  assert.deepEqual(b.bySaga.map((g) => [g.key, g.seenMin, g.totalMin]), [['infinity', 100, 130], ['multiverse', 40, 80]]);
  assert.deepEqual(b.byFormat.map((g) => [g.key, g.seenMin, g.totalMin]), [['film', 100, 100], ['serie', 40, 80], ['short', 0, 30]]);
});

test('records du MCU', () => {
  const titles = [
    film('long', '2019-04-26', 181, { postCredits: ['end'] }), film('court', '2019-05-01', 90, { postCredits: [] }),
    film('moyen', '2008-05-02', 120, { postCredits: ['mid'] }), serie('s', '2021-01-15', 9),
    { ...film('bientot', '2030-01-01', 100), upcoming: true },
  ];
  const r = records(titles, { long: '2026-01-01' });
  assert.deepEqual([r.films, r.series, r.episodes], [3, 1, 9]);
  assert.deepEqual(r.longest, { title: 'long', min: 181 });
  assert.deepEqual(r.shortest, { title: 'court', min: 90 });
  assert.deepEqual(r.mostEpisodes, { title: 's', n: 9 });
  assert.deepEqual(r.topYear, { year: '2019', n: 2 });
  assert.equal(r.totalMin, 181 + 90 + 120 + 360);
  assert.deepEqual(r.postCredits, { with: 2, seen: 1, total: 4 });
  assert.equal(records([], {}).longest, null);
});

test('frise des sorties : par année, avec le vu', () => {
  const titles = [film('b', '2009-01-01', 100), film('a', '2008-01-01', 100), film('c', '2008-06-01', 100), { ...film('x', '2030-01-01', 100), upcoming: true }];
  const tl = releaseTimeline(titles, { a: '2026-01-01' });
  assert.deepEqual(tl.map((r) => [r.year, r.items.map((i) => i.id), r.done]), [['2008', ['a', 'c'], 1], ['2009', ['b'], 0]]);
});
