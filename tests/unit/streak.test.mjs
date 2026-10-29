// streak.js の前半（STREAK_CORE: れんぞく日数の計算）の単体テスト。daily-core.test.mjs と同じく vm で読み込む。
// 日付は 2026-10-28 が水曜（週は 10/26 月〜11/1 日）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ctx = { window: {}, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read('daily-core.js'), ctx);
vm.runInContext(read('streak.js'), ctx);
const D = ctx.DAILY_CORE, K = ctx.STREAK_CORE;
const plain = x => JSON.parse(JSON.stringify(x));
const pick = ({ cur, best, tickets, state, next }) => ({ cur, best, tickets, state, next });
const S = (o = {}) => ({ v: 1, cur: 5, best: 12, last: '2026-10-27', played: ['2026-10-27'], rest: [], ...o });

test('weekOf', () => {
  assert.equal(K.weekOf('2026-10-28'), '2026-10-26'); assert.equal(K.weekOf('2026-11-01'), '2026-10-26');
  assert.equal(K.weekOf('2026-10-26'), '2026-10-26'); assert.equal(K.weekOf('2027-01-01'), '2026-12-28');
});
test('record_first', () => assert.deepEqual(plain(K.record(K.fresh(), '2026-10-28')), { v: 1, cur: 1, best: 1, last: '2026-10-28', played: ['2026-10-28'], rest: [] }));
test('record_same_day_and_past', () => {   // record_ignores_past
  const s = S({ last: '2026-10-28' });
  assert.deepEqual(plain(K.record(s, '2026-10-28')), plain(s));
  assert.deepEqual(plain(K.record(s, '2026-10-20')), plain(s));
});
test('record_next_day', () => { const r = K.record(S(), '2026-10-28'); assert.equal(r.cur, 6); assert.equal(r.best, 12); assert.equal(r.last, '2026-10-28'); });
test('record_best_grows', () => assert.equal(K.record(S({ cur: 12 }), '2026-10-28').best, 13));
test('record_ticket_bridges', () => { const r = K.record(S({ last: '2026-10-26' }), '2026-10-28'); assert.equal(r.cur, 6); assert.deepEqual(plain(r.rest), ['2026-10-27']); });
test('record_two_rests_same_week_breaks', () => {
  assert.equal(K.record(S({ last: '2026-10-26' }), '2026-10-29').cur, 1);                                  // 10/27・10/28 が同じ週
  assert.equal(K.record(S({ last: '2026-10-28', rest: ['2026-10-27'] }), '2026-10-30').cur, 1);           // 券はもう使った
});
test('record_sun_and_mon_two_tickets', () => {   // 土→火
  const r = K.record(S({ last: '2026-10-24', cur: 3 }), '2026-10-27');
  assert.equal(r.cur, 4); assert.deepEqual(plain(r.rest), ['2026-10-25', '2026-10-26']);
});
test('record_gap_8_breaks', () => { const r = K.record(S({ last: '2026-10-20' }), '2026-10-28'); assert.equal(r.cur, 1); assert.deepEqual(plain(r.rest), []); });
test('record_keeps_14_days', () => {
  let s = K.fresh();
  for (let i = 0; i < 20; i++) s = K.record(s, D.addDays('2026-10-01', i));
  assert.equal(s.played.length, 14); assert.equal(s.played[0], D.addDays('2026-10-20', -13)); assert.equal(s.cur, 20);
});
test('record_does_not_mutate', () => { const s = S({ last: '2026-10-26' }), c = plain(s); K.record(s, '2026-10-28'); assert.deepEqual(plain(s), c); });
test('sanitize_broken', () => {
  for (const x of [undefined, null, 'x', 1, [], { v: 2 }, S({ v: 2 }), S({ cur: -1 }), S({ cur: 1.5 }), S({ cur: '3' }), S({ best: 1e5 + 1 }), S({ last: '2026-13-01' }),
    S({ last: 20261027 }), S({ played: 'a' }), S({ played: [1] }), S({ rest: ['x'] }), S({ rest: null })])
    assert.deepEqual(plain(K.sanitize(x)), plain(K.fresh()), JSON.stringify(x));
  assert.deepEqual(plain(K.sanitize(S())), plain(S()));
  assert.deepEqual(plain(K.sanitize(S({ last: null, cur: 0, best: 0, played: [] }))), plain(S({ last: null, cur: 0, best: 0, played: [] })));
  assert.equal(K.sanitize(S({ cur: 20 })).best, 20);
});
test('view_states', () => {
  assert.deepEqual(pick(K.view(S(), '2026-10-28')), { cur: 5, best: 12, tickets: 1, state: 'keep', next: 6 });
  assert.deepEqual(pick(K.view(S({ last: '2026-10-26' }), '2026-10-28')), { cur: 5, best: 12, tickets: 0, state: 'rest', next: 6 });
  assert.deepEqual(pick(K.view(S({ last: '2026-10-20' }), '2026-10-28')), { cur: 0, best: 12, tickets: 1, state: 'start', next: 1 });
  assert.deepEqual(pick(K.view(K.fresh(), '2026-10-28')), { cur: 0, best: 0, tickets: 1, state: 'start', next: 1 });
  assert.deepEqual(pick(K.view(S({ last: '2026-10-28' }), '2026-10-28')), { cur: 5, best: 12, tickets: 1, state: 'today', next: null });
  // 今週もう券を使った人は、今日あそんでいても 0枚
  assert.equal(K.view(S({ last: '2026-10-28', rest: ['2026-10-27'] }), '2026-10-28').tickets, 0);
  // 同じ週に2日目の休み → 切れる
  assert.equal(K.view(S({ last: '2026-10-26' }), '2026-10-29').state, 'start');
});
test('view_clock_back', () => {
  const v = K.view(S({ last: '2026-10-28' }), '2026-10-27');
  assert.equal(v.state, 'today'); assert.equal(v.cur, 5); assert.equal(v.next, null);
});
test('view_week', () => {
  // 券でつながる予定の日は 'rest'
  assert.deepEqual(plain(K.view(S({ last: '2026-10-26', played: ['2026-10-26'] }), '2026-10-28').week.map(w => w.mark)),
    ['play', 'rest', 'today', 'future', 'future', 'future', 'future']);
  const w = plain(K.view(S(), '2026-10-28').week);
  assert.deepEqual(w.map(x => x.day), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.deepEqual(w.map(x => x.mark), ['miss', 'play', 'today', 'future', 'future', 'future', 'future']);
  // 今日あそんだら今日は 'play'
  assert.equal(K.view(S({ last: '2026-10-28', played: ['2026-10-27', '2026-10-28'] }), '2026-10-28').week[2].mark, 'play');
});
test('view_does_not_mutate', () => { const s = S({ last: '2026-10-26' }), c = plain(s); K.view(s, '2026-10-28'); assert.deepEqual(plain(s), c); });
