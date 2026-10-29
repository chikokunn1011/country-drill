// daily-core.js（今日の難問の出題の組み立て）の単体テスト。ブラウザの代わりに vm で読み込む
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ctx = { window: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read('countries.js'), ctx);
vm.runInContext(read('daily-core.js'), ctx);
const D = ctx.DAILY_CORE, C = ctx.window.COUNTRIES;
const plain = x => JSON.parse(JSON.stringify(x));
const codes = new Set(C.map(c => c.a)), byA = new Map(C.map(c => [c.a, c]));
const days = Array.from({ length: 366 }, (_, i) => D.addDays('2026-10-28', i));

test('同じ日付なら同じ問題、データの並びが変わっても同じ', () => {
  const a = plain(D.build('2026-10-28', C));
  assert.deepEqual(plain(D.build('2026-10-28', C)), a);
  assert.deepEqual(plain(D.build('2026-10-28', C.slice().reverse())), a);
});

test('日付がちがえば問題もちがう', () => {
  const sets = new Set(days.map(d => D.build(d, C).map(q => q.a).join()));
  assert.equal(sets.size, days.length);
});

test('1年分: 20問・国の重なりなし・選択肢は4つで正解がちょうど1つ・首都の形式なし', () => {
  for (const d of days) {
    const qs = D.build(d, C);
    assert.equal(qs.length, 20, d);
    assert.equal(new Set(qs.map(q => q.a)).size, 20, d);
    qs.forEach((q, i) => {
      assert.equal(q.no, i + 1);
      assert.ok(['f2n', 'n2f', 'm2f', 'f2m'].includes(q.mode), `${d} ${q.mode}`);
      assert.equal(q.opts.length, 4, d);
      assert.equal(new Set(q.opts).size, 4, d);
      assert.equal(q.opts.filter(a => a === q.a).length, 1, d);
      assert.ok(q.opts.every(a => codes.has(a)), d);
      assert.equal(q.stage, i < 6 ? 1 : i < 14 ? 2 : 3);
    });
    // 同じ形式は3回まで
    for (let i = 3; i < qs.length; i++) assert.ok(!(qs[i].mode === qs[i - 1].mode && qs[i].mode === qs[i - 2].mode && qs[i].mode === qs[i - 3].mode), `${d} 4連続`);
  }
});

test('段階ごとの難しさ', () => {
  const group = new Map(D.SIMILAR.flatMap(g => g.map(a => [a, g])));
  for (const d of days) {
    const qs = D.build(d, C);
    const seenGroups = new Set();
    for (const q of qs) {
      if (q.stage === 1) assert.ok(!D.FAMOUS.has(q.a), `${d} ${q.a} はよく知られた国`);
      if (q.stage === 2) {
        const g = group.get(q.a);
        assert.ok(g, `${d} ${q.a} は似た国旗グループの国`);
        assert.ok(!seenGroups.has(g), `${d} 同じグループが2回`);
        seenGroups.add(g);
        // 選択肢はグループの国から（グループが4つ未満なら残りは同じ地域）
        const inG = q.opts.filter(a => g.includes(a)).length;
        assert.equal(inG, Math.min(4, g.length), `${d} ${q.a} の選択肢`);
      }
      if (q.stage === 3) {
        assert.ok(byA.get(q.a).ar < 25000 && !D.FAMOUS.has(q.a), `${d} ${q.a} は小さい国`);
        if (group.has(q.a)) seenGroups.add(group.get(q.a));
      }
    }
  }
});

test('似た国旗の表とよく知られた国は、ぜんぶ実在の国コード', () => {
  for (const g of D.SIMILAR) for (const a of g) assert.ok(codes.has(a), a);
  for (const a of D.FAMOUS) assert.ok(codes.has(a), a);
  const all = D.SIMILAR.flat();
  assert.equal(new Set(all).size, all.length, '1つの国は1つのグループだけ');
});

test('日本時間の日付と次の0時まで', () => {
  assert.equal(D.jstDay(new Date('2026-10-27T14:59:59.999Z')), '2026-10-27');
  assert.equal(D.jstDay(new Date('2026-10-27T15:00:00Z')), '2026-10-28');
  assert.equal(D.msToNextDay(new Date('2026-10-27T15:00:00Z')), 86400e3);
  assert.equal(D.msToNextDay(new Date('2026-10-27T14:59:00Z')), 60e3);
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(D.addDays('2026-03-01', -1), '2026-02-28');
  assert.ok(D.validDay('2028-02-29'));
  assert.ok(!D.validDay('2026-02-29'));
  assert.ok(!D.validDay('2026-1-1'));
  assert.ok(!D.validDay(null));
  assert.throws(() => D.build('x', C));
});

test('ランキングの並べ方: 正答数 → タイム → 先に載せた順', () => {
  const rows = [
    { n: 'a', correct: 12, timeMs: 5000, at: 1 },
    { n: 'b', correct: 20, timeMs: 40000, at: 2 },
    { n: 'c', correct: 20, timeMs: 30000, at: 3 },
    { n: 'd', correct: 12, timeMs: 4000, at: 4 },
    { n: 'e', correct: 12, timeMs: 4000, at: 0 },
  ];
  assert.deepEqual(rows.sort(D.compare).map(r => r.n), ['c', 'b', 'e', 'd', 'a']);
});

test('SQL の問題数と同じ', () => {
  assert.equal(D.COUNT, 20);
  assert.match(read('supabase/schema.sql'), /daily_count\(\) returns int\s+language sql immutable set search_path = public, pg_temp as \$\$ select 20 \$\$/);
});

// 埋めこみ（embed.html）の1日1問
test('oneOfDay: 同じ日に同じ結果、並びが変わっても同じ', () => {
  const q = plain(D.oneOfDay('2026-10-28', C));
  assert.deepEqual(Object.keys(q), ['day', 'mode', 'a', 'opts']);   // 首都の項目は無い
  assert.equal(q.day, '2026-10-28');
  assert.deepEqual(plain(D.oneOfDay('2026-10-28', C.slice().reverse())), q);
  assert.throws(() => D.oneOfDay('2026-02-30', C));
  assert.deepEqual(plain(D.EMBED_MODES), ['f2n', 'n2f']);
});
test('oneOfDay: 366日ぶん、答えバレなし・選択肢4つ・FAMOUS・国旗と国名だけ', () => {
  for (const d of days) {
    const q = D.oneOfDay(d, C), answers = new Set(D.build(d, C).map(x => x.a));
    assert.ok(['f2n', 'n2f'].includes(q.mode), d);
    assert.ok(D.FAMOUS.has(q.a) && !answers.has(q.a), d);
    assert.equal(q.opts.length, 4, d); assert.equal(new Set(q.opts).size, 4, d);
    assert.equal(q.opts.filter(a => a === q.a).length, 1, d);
    assert.ok(q.opts.every(a => codes.has(a)), d);
  }
});
test('oneOfDay: 選択肢は同じ地域から（足りる地域なら）', () => {
  for (const d of days) {
    const q = D.oneOfDay(d, C), r = byA.get(q.a).r;
    if (C.filter(c => c.r === r).length >= 4) assert.ok(q.opts.every(a => byA.get(a).r === r), d);
  }
});
test('oneOfDay: 出る国と形のかたより', () => {
  const qs = days.map(d => D.oneOfDay(d, C)), n = new Map();
  for (const q of qs) n.set(q.a, (n.get(q.a) ?? 0) + 1);
  assert.ok(n.size >= 45, `${n.size}か国`); assert.ok(Math.max(...n.values()) <= 20);
  for (const m of ['f2n', 'n2f']) assert.ok(qs.filter(q => q.mode === m).length >= 140, m);
});
test('oneOfDay は build を変えない', () => {   // oneOfDay を足す前の daily-core.js で取った 2026-10-28 の答えの列
  assert.equal(D.build('2026-10-28', C).map(q => q.a).join(), 'si,kn,rs,na,ws,sc,mv,gn,hu,pw,ro,lr,gw,mc,tv,me,bn,kw,km,xk');
});
