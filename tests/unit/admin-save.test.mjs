// admin-save.js（管理ページの、端末のセーブ部品）の単体テスト。countries.js → daily-core.js → rpg-core.js → badges.js → admin-save.js を vm に読む
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
// vm 側で作られたオブジェクトは prototype が別物なので、比べる前にこちら側の素のオブジェクトにする
const plain = x => JSON.parse(JSON.stringify(x));

// メモリの storage。init は最初に入れておく中身
function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    dump: () => Object.fromEntries(m),
  };
}

function load(init = {}, now) {
  const ctx = vm.createContext({ TextEncoder, TextDecoder }); ctx.window = ctx;
  for (const f of ['countries.js', 'daily-core.js', 'rpg-core.js', 'badges.js', 'admin-save.js']) vm.runInContext(read(f), ctx);
  const st = memStorage(init);
  return { ctx, st, A: ctx.ADMIN_SAVE.create(st, now), R: ctx.RPG_CORE, B: ctx.BADGES_CORE };
}

test('keys_lists_sorted_with_bytes', () => {
  const { A } = load({ rpg: '{}', a: '1' });
  assert.deepEqual(plain(A.keys()), [{ key: 'a', bytes: 1 }, { key: 'rpg', bytes: 2 }]);
});

test('write_rejects_broken_json', () => {
  const { A, st } = load({ settings: '{"x":1}' });
  const before = st.dump();
  assert.deepEqual(plain(A.write('settings', '{')), { ok: false, reason: 'not_json' });
  assert.deepEqual(st.dump(), before);
});

test('write_rpg_is_sanitized', () => {
  const { A, R } = load();
  const r = A.write('rpg', JSON.stringify({ ...R.fresh(R.today(new Date())), coins: -5 }));
  assert.equal(r.ok, true);
  assert.equal(A.read('rpg').value.coins, 0);
});

test('write_rpg_and_badges_reject_non_object', () => {
  const { A, st } = load();
  assert.deepEqual(plain(A.write('rpg', '[1]')), { ok: false, reason: 'bad_shape' });
  assert.deepEqual(plain(A.write('badges', '5')), { ok: false, reason: 'bad_shape' });
  assert.deepEqual(st.dump(), {});
});

test('read_reports_missing_and_not_json', () => {
  const { A } = load({ x: '{' });
  assert.deepEqual(plain(A.read('nope')), { ok: false, reason: 'missing', raw: null });
  assert.deepEqual(plain(A.read('x')), { ok: false, reason: 'not_json', raw: '{' });
});

test('import_rejects_other_file', () => {
  const { A, st } = load({ a: '1' });
  const before = st.dump();
  assert.deepEqual(plain(A.importAll({ app: 'x' })), { ok: false, reason: 'bad_file' });
  assert.deepEqual(plain(A.importAll({ app: 'country-drill', kind: 'save', data: { a: 5 } })), { ok: false, reason: 'bad_file' });
  assert.deepEqual(st.dump(), before);
});

test('import_replaces_and_returns_backup', () => {
  const { A, st } = load({ a: '1', adminSnaps: '[]', adminErrors: '[]' });
  const r = A.importAll({ app: 'country-drill', kind: 'save', data: { b: '2', adminSnaps: 'zzz' } });
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.backup.data), { a: '1' });
  assert.deepEqual(st.dump(), { b: '2', adminSnaps: '[]', adminErrors: '[]' });
});

test('export_has_shape', () => {
  const { A } = load({ a: '1', adminSnaps: '[]' }, () => Date.UTC(2026, 9, 28));
  assert.deepEqual(plain(A.exportAll()), { app: 'country-drill', kind: 'save', at: '2026-10-28T00:00:00.000Z', data: { a: '1' } });
});

test('snap_keeps_five', () => {
  let t = 0;
  const { A, st } = load({ a: '1' }, () => ++t * 1000);
  for (let i = 1; i <= 6; i++) A.snapSave('s' + i);
  const l = plain(A.snapList());
  assert.equal(l.length, 5);
  assert.equal(l[0].name, 's2');
  assert.ok(!l.some(x => x.name === 's1'));
  // スナップショットの中身に adminSnaps 自身は入らない
  assert.deepEqual(Object.keys(JSON.parse(st.getItem('adminSnaps'))[4].data), ['a']);
});

test('snap_load_and_delete', () => {
  const { A, st } = load({ a: '1' });
  A.snapSave('x');
  st.setItem('a', '2'); st.setItem('c', '3');
  assert.equal(A.snapLoad('x').ok, true);
  assert.equal(st.getItem('a'), '1');
  assert.equal(st.getItem('c'), null);
  assert.equal(A.snapLoad('none').ok, false);
  A.snapDelete('x');
  assert.equal(A.snapList().length, 0);
});

test('rpg_unlock_all_sets_floor4_keeps_cleared', () => {
  const { A, R } = load();
  A.rpgSetFloor(R.DUNGEONS[0].id, 5);
  A.rpgUnlockAll();
  const f = A.rpgGet().floors;
  assert.equal(f[R.DUNGEONS[0].id], 5);
  assert.equal(Object.keys(f).length, R.DUNGEONS.length);
  for (const g of R.DUNGEONS.slice(1)) assert.equal(f[g.id], 4);
  A.rpgClearAll();
  for (const g of R.DUNGEONS) assert.equal(A.rpgGet().floors[g.id], 5);
});

test('rpg_setlv_clamps', () => {
  const { A, R } = load();
  assert.equal(A.rpgSetLv(500).lv, R.TUNING.hero.maxLv);
  assert.equal(A.rpgSetLv(0).lv, 1);
});

test('rpg_coins_pity_card_story', () => {
  const { A, R } = load();
  assert.equal(A.rpgCoins(100).coins, 100);
  assert.equal(A.rpgCoins(-500).coins, 0);
  assert.equal(A.rpgCoins(1e12).coins, R.BIG);
  assert.equal(A.rpgSetPity(3).pity, 3);
  assert.deepEqual(plain(A.rpgGiveCard('jp').cards.jp), [1, 0]);
  assert.deepEqual(plain(A.rpgGiveCard('jp', 2).cards.jp), [1, 2]);
  assert.equal(A.rpgGiveCard('zz').cards.zz, undefined);
  A.rpgEdit(x => { x.story = [R.STORY_IDS[0]]; });
  assert.deepEqual(plain(A.rpgStoryReset().story), []);
  assert.equal(A.rpgSetFloor('nope', 3), null);
  assert.equal(A.rpgSetFloor('asia', 9).floors.asia, 5);
});

test('rpg_wipe_keeps_rankdel', () => {
  const { A, st } = load({ rpg: '{}', rpgRank: '1', rpgRankPending: '2', rpgRankDel: '[3]', other: 'o' });
  A.rpgWipe();
  assert.deepEqual(st.dump(), { rpgRankDel: '[3]', other: 'o' });
});

test('badges_all_marks_sent', () => {
  const { A, st } = load();
  A.badgesAll();
  const b = JSON.parse(st.getItem('badges'));
  const n = Object.keys(b.got).length;
  assert.ok(n > 0);
  assert.equal(b.sent.length, n);
  A.badgesNone();
  assert.equal(st.getItem('badges'), null);
});

test('badge_toggle', () => {
  const { A, st } = load();
  A.badgesAll();
  const key = Object.keys(JSON.parse(st.getItem('badges')).got)[0];
  A.badgeToggle(key);
  assert.ok(!(key in JSON.parse(st.getItem('badges')).got));
  A.badgeToggle(key);
  assert.ok(key in JSON.parse(st.getItem('badges')).got);
});

test('daily_questions_match_core', () => {
  const { A, ctx } = load();
  const q = A.dailyQuestions('2026-10-28');
  assert.equal(q.length, 20);
  assert.deepEqual(plain(q.map(x => x.a)), plain(ctx.DAILY_CORE.build('2026-10-28', ctx.COUNTRIES).map(x => x.a)));
  assert.ok(q.every(x => x.n && x.mode && x.opts.length === 4));
});

test('daily_reset_and_settings_and_first_time', () => {
  const { A, st } = load({ daily: '1', settings: '{"a":1,"b":2}', setup: 's', misses: 'm', nickname: 'n', bview: 'v', bdgcat: 'c', keep: 'k' });
  assert.deepEqual(plain(A.settingsSet({ b: 3, c: 4 })), { a: 1, b: 3, c: 4 });
  assert.deepEqual(plain(A.settingsGet()), { a: 1, b: 3, c: 4 });
  A.dailyReset();
  assert.equal(st.getItem('daily'), null);
  A.firstTime();
  assert.deepEqual(st.dump(), { keep: 'k' });
});

test('storage_errors_are_caught', () => {
  const { A, st } = load();
  st.setItem = () => { throw new Error('quota'); };
  assert.deepEqual(plain(A.write('a', '1')), { ok: false, reason: 'storage' });
});

test('check_data_clean', () => {
  const { A, ctx } = load();
  const r = plain(A.checkData());
  assert.deepEqual(r.problems, []);
  assert.equal(r.counts.countries, 195);
  assert.equal(r.counts.regions, 6);
  ctx.COUNTRIES.push({ a: 'jp', n: '', r: '火星' });
  const bad = plain(A.checkData());
  assert.ok(bad.problems.length >= 4);
});

test('unreadable_storage_does_not_overwrite_rpg', () => {
  const { A, st } = load({ rpg: '{}' });
  st.getItem = () => { throw new Error('denied'); };
  assert.deepEqual(plain(A.rpgCoins(5)), { ok: false, reason: 'storage' });
  assert.deepEqual(plain(A.badgesAll()), { ok: false, reason: 'storage' });
});

test('import_validates_rpg_and_badges_before_writing', () => {
  const { A, st } = load({ a: '1' });
  const before = st.dump();
  for (const bad of ['garbage', '[1]']) {
    for (const key of ['rpg', 'badges']) {
      assert.deepEqual(plain(A.importAll({ app: 'country-drill', kind: 'save', data: { b: '2', [key]: bad } })), { ok: false, reason: 'bad_file' });
    }
  }
  assert.deepEqual(st.dump(), before);
  // 形の合うものは sanitize した結果が入る
  const r = A.importAll({ app: 'country-drill', kind: 'save', data: { rpg: JSON.stringify({ coins: -5 }) } });
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(st.getItem('rpg')).coins, 0);
});

test('import_rolls_back_when_storage_throws', () => {
  const { A, st } = load({ a: '1', c: '3' });
  const before = st.dump(), set = st.setItem;
  let n = 0;
  st.setItem = (k, v) => { if (++n === 2) throw new Error('quota'); set(k, v); };
  const r = A.importAll({ app: 'country-drill', kind: 'save', data: { x: '1', y: '2', z: '3' } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'storage');
  assert.deepEqual(plain(r.backup.data), before);
  assert.deepEqual(st.dump(), before);
});
