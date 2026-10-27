// ranking.js の単体テスト。ブラウザの代わりに vm で読み込み、fetch はテストごとに差し替えたスタブを渡す
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const SRC = read('ranking.js');
const RPC = 'https://vgdkklvhtvcamtxwjpke.supabase.co/rest/v1/rpc/';
const KEY = 'sb_publishable_eFVPaD9rNRdqi_1LtXxmGg_yJACIRqV';

// ranking.js を新しい環境に読み込む。fetch に渡された内容は calls に、console.warn の引数は warns に残る
function load(fetchImpl = () => Promise.reject(new Error('fetch がスタブされていない'))) {
  const calls = [], warns = [];
  const ctx = {
    fetch: (url, opts) => { calls.push({ url, opts }); return fetchImpl(url, opts); },
    console: { warn: (...a) => warns.push(a) },
    AbortController,
    // 呼ぶたびに今の setTimeout を見る（mock.timers で差し替えた後でも効くように）
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (...a) => clearTimeout(...a),
  };
  vm.runInNewContext(SRC, ctx);
  return { R: ctx.RANKING, calls, warns };
}
// 決まった JSON を返す fetch スタブ
const reply = (body, status = 200) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
// vm 側で作られたオブジェクトは prototype が別物なので、比べる前にこちら側の素のオブジェクトにする
const plain = x => JSON.parse(JSON.stringify(x));
const flush = () => new Promise(r => setImmediate(r));
const SCORE = { board: 'f2n:all:10', nickname: 'チコ', timeMs: 8000, questions: 10 };

test('enabled', () => {
  assert.equal(load().R.enabled, true);
});

test('boardKey', () => {
  const { R } = load();
  assert.equal(R.boardKey('f2n', 'all', 10), 'f2n:all:10');
  assert.equal(R.boardKey('m2f', '北・中央アメリカ', 'all'), 'm2f:namerica:all');
  assert.equal(R.boardKey('f2m', 'オセアニア', 5), 'f2m:oceania:5');
});

test('boardKey_follows_REGIONS_order', () => {
  // index.html の REGIONS を順に変換すると、決まった英字キーの順になる
  const REGIONS = vm.runInNewContext(read('index.html').match(/const REGIONS = (\[.*?\]);/)[1]);
  const { R } = load();
  assert.deepEqual(plain(REGIONS.map(r => R.boardKey('n2f', r, 20).split(':')[1])),
    ['asia', 'europe', 'africa', 'namerica', 'samerica', 'oceania']);
});

test('checkName', () => {
  const { R } = load();
  const bad = { ok: false, reason: 'bad_name' };
  assert.deepEqual(plain(R.checkName(' チコ ')), { ok: true, name: 'チコ' });
  assert.deepEqual(plain(R.checkName('\u3000チコ\u3000')), { ok: true, name: 'チコ' });
  assert.deepEqual(plain(R.checkName('')), bad);
  assert.deepEqual(plain(R.checkName('   ')), bad);
  assert.deepEqual(plain(R.checkName('あいうえおかきくけこさしす')), bad);
  assert.deepEqual(plain(R.checkName('あいうえおかきくけこさし')), { ok: true, name: 'あいうえおかきくけこさし' });
  assert.deepEqual(plain(R.checkName('🇯🇵'.repeat(6))), { ok: true, name: '🇯🇵'.repeat(6) });
  assert.deepEqual(plain(R.checkName('ＦＵＣＫ')), { ok: false, reason: 'ng_name' });
});

test('checkName_rejects_every_server_ng_word', () => {
  // supabase/schema.sql の ng_words() に入っている語は、手元のチェックでも全部はじく
  const words = [...read('supabase/schema.sql').match(/select array\[([^\]]*)\]/)[1].matchAll(/'([^']*)'/g)].map(m => m[1]);
  assert.ok(words.length >= 10);
  const { R } = load();
  for (const w of words) assert.equal(R.checkName(`a${w}b`).reason, 'ng_name', w);
});

test('formatTime', () => {
  const { R } = load();
  assert.equal(R.formatTime(12345), '12.34秒');
  assert.equal(R.formatTime(61234), '1分01.23秒');
  assert.equal(R.formatTime(0), '0.00秒');
  assert.equal(R.formatTime(12349.9), '12.34秒');
  assert.equal(R.formatTime(600000), '10分00.00秒');
});

test('message', () => {
  const { R } = load();
  assert.equal(R.message('bad_name'), 'ニックネームは1〜12文字で入れてね');
  assert.equal(R.message('ng_name'), 'そのニックネームは使えないみたい');
  assert.equal(R.message('too_fast'), 'タイムが速すぎて受け付けられなかった');
  assert.equal(R.message('too_slow'), 'タイムが長すぎて受け付けられなかった');
  assert.equal(R.message('too_soon'), '少し待ってからもう一回送ってね');
  assert.equal(R.message('bad_board'), 'この条件はランキングに載せられない');
  assert.equal(R.message('network'), 'ランキングに接続できなかった');
  // 知らない理由でも undefined は出さない
  assert.equal(R.message('???'), 'ランキングに接続できなかった');
});

test('submit_sends_rpc', async () => {
  const { R, calls } = load(reply({ ok: true, rank_all: 3, rank_week: 1 }));
  assert.deepEqual(plain(await R.submit(SCORE)), { ok: true, rankAll: 3, rankWeek: 1 });
  assert.equal(calls.length, 1);
  const { url, opts } = calls[0];
  assert.equal(url, RPC + 'submit_score');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.body, '{"p_board":"f2n:all:10","p_nickname":"チコ","p_time_ms":8000,"p_questions":10}');
  // ヘッダーは apikey と Content-Type だけ（Authorization は付けない）
  assert.deepEqual(plain(opts.headers), { apikey: KEY, 'Content-Type': 'application/json' });
});

test('submit_sends_whole_ms', async () => {
  // performance.now() の差は端数が出る。DB の int に入るよう切り捨てて送る
  const { R, calls } = load(reply({ ok: true, rank_all: 1, rank_week: 1 }));
  await R.submit({ ...SCORE, timeMs: 8000.9 });
  assert.equal(JSON.parse(calls[0].opts.body).p_time_ms, 8000);
});

test('submit_passes_reason', async () => {
  const { R, warns } = load(reply({ ok: false, reason: 'too_soon' }));
  assert.deepEqual(plain(await R.submit(SCORE)), { ok: false, reason: 'too_soon' });
  assert.equal(warns.length, 0); // 断られたのは正常な返事なのでコンソールには出さない
});

test('submit_network', async () => {
  const network = { ok: false, reason: 'network' };
  assert.deepEqual(plain(await load(() => Promise.reject(new TypeError('Failed to fetch'))).R.submit(SCORE)), network);
  assert.deepEqual(plain(await load(reply({ message: 'boom' }, 500)).R.submit(SCORE)), network);
  // JSON でない応答も通信失敗あつかい
  assert.deepEqual(plain(await load(() => Promise.resolve(new Response('<html>'))).R.submit(SCORE)), network);
});

test('submit_warns_on_failure', async () => {
  // 本物の Supabase で 404（関数が無い）・401（キー）・400（引数違い）が返っても、オフラインと見分けられるようにコンソールに残す
  const { R, warns } = load(reply({ message: 'Could not find the function public.submit_score' }, 404));
  assert.deepEqual(plain(await R.submit(SCORE)), { ok: false, reason: 'network' });
  assert.equal(warns.length, 1);
  assert.equal(warns[0][0], 'ranking submit');
  assert.match(String(warns[0][1]), /submit_score: HTTP 404/);
  assert.match(String(warns[0][1]), /Could not find the function public\.submit_score/);
  // 通信そのものの失敗も同じく残す
  const down = load(() => Promise.reject(new TypeError('Failed to fetch')));
  await down.R.submit(SCORE);
  assert.match(String(down.warns[0]?.[1]), /Failed to fetch/);
});

test('rpc_error_has_status_and_body', async () => {
  // top / rankOf は reject する（コンソールに出すのは呼び出し側）。エラーには HTTP の状態と応答本文が入る
  const { R, warns } = load(reply({ message: 'No API key found in request' }, 401));
  await assert.rejects(R.top({ board: 'f2n:all:10', period: 'all' }), /top_scores: HTTP 401 .*No API key found/);
  await assert.rejects(R.rankOf({ board: 'f2n:all:10', timeMs: 8000 }), /rank_of: HTTP 401 .*No API key found/);
  assert.equal(warns.length, 0);
});

test('submit_timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // 返事が来ない fetch。abort されたら本物と同じく reject する
  const { R, calls } = load((url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))));
  let result;
  R.submit(SCORE).then(r => { result = r; });
  t.mock.timers.tick(7999);
  await flush();
  assert.equal(result, undefined);
  assert.equal(calls[0].opts.signal.aborted, false);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(calls[0].opts.signal.aborted, true);
  assert.deepEqual(plain(result), { ok: false, reason: 'network' });
});

test('top_maps_rows', async () => {
  const { R, calls } = load(reply([{ nickname: 'a', time_ms: 8000, created_at: '2026-10-25T00:00:00Z' }]));
  const rows = await R.top({ board: 'f2n:all:10', period: 'week' });
  assert.equal(calls[0].url, RPC + 'top_scores');
  assert.equal(calls[0].opts.body, '{"p_board":"f2n:all:10","p_period":"week"}');
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.deepEqual(Object.keys(row), ['nickname', 'timeMs', 'at']);
  assert.equal(row.nickname, 'a');
  assert.equal(row.timeMs, 8000);
  assert.equal(Object.prototype.toString.call(row.at), '[object Date]');
  assert.equal(row.at.toISOString(), '2026-10-25T00:00:00.000Z');
});

test('top_rejects_on_failure', async () => {
  await assert.rejects(load(reply({ message: 'boom' }, 500)).R.top({ board: 'f2n:all:10', period: 'all' }));
  await assert.rejects(load(() => Promise.reject(new TypeError('Failed to fetch'))).R.top({ board: 'f2n:all:10', period: 'all' }));
});

test('rank_of_maps', async () => {
  const { R, calls } = load(reply({ rank_all: 2, rank_week: 1 }));
  assert.deepEqual(plain(await R.rankOf({ board: 'f2n:all:10', timeMs: 8000.4 })), { rankAll: 2, rankWeek: 1 });
  assert.equal(calls[0].url, RPC + 'rank_of');
  assert.equal(calls[0].opts.body, '{"p_board":"f2n:all:10","p_time_ms":8000}');
});

test('rank_of_rejects_on_failure', async () => {
  await assert.rejects(load(reply({ message: 'boom' }, 500)).R.rankOf({ board: 'f2n:all:10', timeMs: 8000 }));
  await assert.rejects(load(() => Promise.reject(new TypeError('Failed to fetch'))).R.rankOf({ board: 'f2n:all:10', timeMs: 8000 }));
});

test('rpg_codes_match_countries', () => {
  const sql = read('supabase/schema.sql');
  const codes = sql.match(/function rpg_codes\(\)[\s\S]*?array\[([^\]]*)\]/)[1].match(/'([a-z]{2})'/g).map(s => s.slice(1, 3));
  const C = vm.runInNewContext(read('countries.js').replace('window.COUNTRIES=', ''));
  assert.deepEqual(codes, [...C.map(c => c.a)]);   // vm 側の配列は prototype が別物なので、こちら側の配列にして比べる
});

test('rpc_error_has_status_number', async () => {
  // HTTP エラーの例外には状態の数字が入る（top_rpg2 がまだ無い 404 を見分けるため）
  const { R } = load(reply({ message: 'Could not find the function' }, 404));
  await assert.rejects(R.top({ board: 'f2n:all:10', period: 'all' }), e => e.status === 404);
});

test('rpg_top_falls_back_on_404', async () => {
  // DB に top_rpg2 がまだ無い（404）ときは top_rpg を呼ぶ。かざりは空
  const row = { nickname: 'ミケ', lv: 3, dungeons: 1, floors: 5, created_at: '2026-10-25T00:00:00Z' };
  const { R, calls } = load(url => url.endsWith('/top_rpg2') ? reply({ message: 'nope' }, 404)() : reply([row])());
  const rows = await R.rpgTop({ sort: 'lv' });
  assert.deepEqual(calls.map(c => c.url.slice(RPC.length)), ['top_rpg2', 'top_rpg']);
  assert.equal(calls[1].opts.body, '{"p_sort":"lv"}');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nickname, 'ミケ');
  assert.deepEqual(plain(rows[0].deco), []);
  // top_rpg2 があればかざりも返す（配列でなければ空）。404 以外の失敗は reject
  const two = load(reply([{ ...row, deco: ['jp', 'br'] }, { ...row, nickname: 'タロウ', deco: null }]));
  const r2 = await two.R.rpgTop({ sort: 'dg' });
  assert.deepEqual(two.calls.map(c => c.url.slice(RPC.length)), ['top_rpg2']);
  assert.deepEqual(plain(r2.map(r => r.deco)), [['jp', 'br'], []]);
  const bad = load(reply({ message: 'boom' }, 500));
  await assert.rejects(bad.R.rpgTop({ sort: 'lv' }), e => e.status === 500);
  assert.equal(bad.calls.length, 1);
});

test('rpg_set_deco_args', async () => {
  const { R, calls } = load(reply({ ok: true }));
  assert.deepEqual(plain(await R.rpgSetDeco({ token: 't', deco: ['jp'] })), { ok: true });
  assert.equal(calls[0].url, RPC + 'rpg_set_deco');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { p_token: 't', p_deco: ['jp'] });
  assert.deepEqual(plain(await load(reply({ ok: false, reason: 'bad_deco' })).R.rpgSetDeco({ token: 't', deco: ['zz'] })), { ok: false, reason: 'bad_deco' });
  assert.equal(R.message('bad_deco'), 'かざりの国が正しくないみたい');
});
