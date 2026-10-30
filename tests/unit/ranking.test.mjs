// ranking.js の単体テスト。ブラウザの代わりに vm で読み込み、fetch はテストごとに差し替えたスタブを渡す
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ctxWithI18n } from './i18n-load.mjs';

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
  const c = ctxWithI18n(ctx);
  vm.runInContext(SRC, c, { filename: 'ranking.js' });
  return { R: c.RANKING, calls, warns };
}
// 英語の画面の vm（lang="en"、i18n.js → en-core.js・en-rank.js → ranking.js の順に読む）
function loadEn() {
  const ctx = vm.createContext({ console, document: { documentElement: { lang: 'en' } } });
  ctx.window = ctx;
  for (const f of ['i18n.js', 'i18n/en-core.js', 'i18n/en-rank.js', 'ranking.js']) vm.runInContext(read(f), ctx, { filename: f });
  return { R: ctx.RANKING };
}
// 決まった JSON を返す fetch スタブ
const reply = (body, status = 200) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
// vm 側で作られたオブジェクトは prototype が別物なので、比べる前にこちら側の素のオブジェクトにする
const plain = x => JSON.parse(JSON.stringify(x));
const flush = () => new Promise(r => setImmediate(r));
const SCORE = { token: 'tok', board: 'f2n:all:10', timeMs: 8000, questions: 10 };

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

test('message_en', () => {
  const { R } = loadEn();
  assert.equal(R.message('ng_name'), 'That nickname can’t be used');
  assert.equal(R.message('bad_name'), 'Nicknames must be 1–12 characters');
  assert.equal(R.message('old_version'), 'A new version is out. Please reload the page');
  assert.equal(R.message('network'), 'Couldn’t connect to the leaderboard');
  // 知らない理由は network の文
  assert.equal(R.message('???'), 'Couldn’t connect to the leaderboard');
});

test('format_time_en', () => {
  const { R } = loadEn();
  assert.equal(R.formatTime(12345), '12.34s');
  assert.equal(R.formatTime(61234), '1:01.23');
  assert.equal(R.formatTime(0), '0.00s');
  assert.equal(R.formatTime(600000), '10:00.00');
});

test('message_profile', () => {
  // プロフィール・引き継ぎで足した理由。already は今日の難問と登録で共通の文
  const { R } = load();
  assert.equal(R.message('old_version'), '新しい版が出たよ。ページを読み直してね');
  assert.equal(R.message('bad_code'), 'コードがちがうか、期限が切れているみたい');
  assert.equal(R.message('too_big'), 'データが大きすぎて預けられなかった');
  assert.equal(R.message('already'), 'もう載せてあるよ');
  assert.equal(R.message('not_found'), 'プロフィールが見つからなかった');
  assert.equal(R.message('name_taken'), 'そのニックネームはもうほかの人が使っているみたい');
});

test('old_methods_removed', () => {
  // 名前を別に送れる古いメソッドは残さない（サーバー側も old_version を返す）
  const { R } = load();
  for (const k of ['submit', 'top', 'rpgRegister', 'rpgUpdate', 'rpgRename', 'rpgUnregister', 'rpgSetDeco', 'rpgTop', 'dailySubmit', 'dailyTop'])
    assert.equal(R[k], undefined, k);
});

test('submit2_sends_rpc', async () => {
  const { R, calls } = load(reply({ ok: true, rank_all: 3, rank_week: 1 }));
  assert.deepEqual(plain(await R.submit2(SCORE)), { ok: true, rankAll: 3, rankWeek: 1 });
  assert.equal(calls.length, 1);
  const { url, opts } = calls[0];
  assert.equal(url, RPC + 'submit_score2');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.body, '{"p_token":"tok","p_board":"f2n:all:10","p_time_ms":8000,"p_questions":10}');
  // ヘッダーは apikey と Content-Type だけ（Authorization は付けない）
  assert.deepEqual(plain(opts.headers), { apikey: KEY, 'Content-Type': 'application/json' });
});

test('submit2_sends_whole_ms', async () => {
  // performance.now() の差は端数が出る。DB の int に入るよう切り捨てて送る
  const { R, calls } = load(reply({ ok: true, rank_all: 1, rank_week: 1 }));
  await R.submit2({ ...SCORE, timeMs: 8000.9 });
  assert.equal(JSON.parse(calls[0].opts.body).p_time_ms, 8000);
});

test('submit2_passes_reason', async () => {
  const { R, warns } = load(reply({ ok: false, reason: 'too_soon' }));
  assert.deepEqual(plain(await R.submit2(SCORE)), { ok: false, reason: 'too_soon' });
  assert.equal(warns.length, 0); // 断られたのは正常な返事なのでコンソールには出さない
});

test('submit2_network', async () => {
  const network = { ok: false, reason: 'network' };
  assert.deepEqual(plain(await load(() => Promise.reject(new TypeError('Failed to fetch'))).R.submit2(SCORE)), network);
  assert.deepEqual(plain(await load(reply({ message: 'boom' }, 500)).R.submit2(SCORE)), network);
  // JSON でない応答も通信失敗あつかい
  assert.deepEqual(plain(await load(() => Promise.resolve(new Response('<html>'))).R.submit2(SCORE)), network);
});

test('submit2_warns_on_failure', async () => {
  // 本物の Supabase で 404（関数が無い）・401（キー）・400（引数違い）が返っても、オフラインと見分けられるようにコンソールに残す
  const { R, warns } = load(reply({ message: 'Could not find the function public.submit_score2' }, 404));
  assert.deepEqual(plain(await R.submit2(SCORE)), { ok: false, reason: 'network' });
  assert.equal(warns.length, 1);
  assert.equal(warns[0][0], 'ranking submit_score2');
  assert.match(String(warns[0][1]), /submit_score2: HTTP 404/);
  assert.match(String(warns[0][1]), /Could not find the function public\.submit_score2/);
  // 通信そのものの失敗も同じく残す
  const down = load(() => Promise.reject(new TypeError('Failed to fetch')));
  await down.R.submit2(SCORE);
  assert.match(String(down.warns[0]?.[1]), /Failed to fetch/);
});

test('network_error_reason_network', async () => {
  // 書きこみ系はどれもつながらなければ reason network（例外は投げない）
  const { R } = load(() => Promise.reject(new TypeError('Failed to fetch')));
  const network = { ok: false, reason: 'network' };
  for (const [k, a] of [['profileCreate', { token: 't', nickname: 'チコ' }], ['profileMe', { token: 't' }], ['profileRename', { token: 't', nickname: 'チコ' }],
    ['profileSet', { token: 't', isPublic: false }], ['transferStart', { token: 't', data: {} }], ['transferClaim', { code: 'ABCD', newToken: 't2' }],
    ['submit2', SCORE], ['dailySubmit2', { token: 't', day: '2026-10-28', correct: 5, total: 5, timeMs: 1000 }],
    ['rpgUpdate2', { token: 't', lv: 1, dungeons: 0, floors: 0 }], ['rpgUnregister2', { token: 't' }]])
    assert.deepEqual(plain(await R[k](a)), network, k);
});

test('rpc_error_has_status_and_body', async () => {
  // 読む系は reject する（コンソールに出すのは呼び出し側）。エラーには HTTP の状態と応答本文が入る
  const { R, warns } = load(reply({ message: 'No API key found in request' }, 401));
  await assert.rejects(R.top2({ board: 'f2n:all:10', period: 'all' }), /top_scores2: HTTP 401 .*No API key found/);
  await assert.rejects(R.rankOf({ board: 'f2n:all:10', timeMs: 8000 }), /rank_of: HTTP 401 .*No API key found/);
  assert.equal(warns.length, 0);
});

test('submit2_timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // 返事が来ない fetch。abort されたら本物と同じく reject する
  const { R, calls } = load((url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))));
  let result;
  R.submit2(SCORE).then(r => { result = r; });
  t.mock.timers.tick(7999);
  await flush();
  assert.equal(result, undefined);
  assert.equal(calls[0].opts.signal.aborted, false);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(calls[0].opts.signal.aborted, true);
  assert.deepEqual(plain(result), { ok: false, reason: 'network' });
});

test('top2_maps_rows', async () => {
  const { R, calls } = load(reply([
    { nickname: 'a', pid: 'abcdef123456', deco: ['jp', 'br'], time_ms: 8000, created_at: '2026-10-25T00:00:00Z' },
    { nickname: 'b', pid: null, time_ms: 9000, created_at: '2026-10-25T00:00:01Z' },
  ]));
  const rows = await R.top2({ board: 'f2n:all:10', period: 'week' });
  assert.equal(calls[0].url, RPC + 'top_scores2');
  assert.equal(calls[0].opts.body, '{"p_board":"f2n:all:10","p_period":"week"}');
  assert.equal(rows.length, 2);
  const [row, old] = rows;
  assert.deepEqual(Object.keys(row), ['nickname', 'pid', 'deco', 'timeMs', 'at']);
  assert.equal(row.nickname, 'a');
  assert.equal(row.pid, 'abcdef123456');
  assert.deepEqual(plain(row.deco), ['jp', 'br']);
  assert.equal(row.timeMs, 8000);
  assert.equal(Object.prototype.toString.call(row.at), '[object Date]');
  assert.equal(row.at.toISOString(), '2026-10-25T00:00:00.000Z');
  // 古い記録は pid が null、deco が無ければ空
  assert.equal(old.pid, null);
  assert.deepEqual(plain(old.deco), []);
});

test('top2_rejects_on_failure', async () => {
  await assert.rejects(load(reply({ message: 'boom' }, 500)).R.top2({ board: 'f2n:all:10', period: 'all' }));
  await assert.rejects(load(() => Promise.reject(new TypeError('Failed to fetch'))).R.top2({ board: 'f2n:all:10', period: 'all' }));
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
  // HTTP エラーの例外には状態の数字が入る（404 = 関数がまだ無い）
  const { R } = load(reply({ message: 'Could not find the function' }, 404));
  await assert.rejects(R.top2({ board: 'f2n:all:10', period: 'all' }), e => e.status === 404);
});

test('profileCreate_sends_p_token_and_p_nickname', async () => {
  const { R, calls } = load(reply({ ok: true, pid: 'abcdef123456', nickname: 'チコ' }));
  assert.deepEqual(plain(await R.profileCreate({ token: 'tok', nickname: 'チコ' })), { ok: true, pid: 'abcdef123456', nickname: 'チコ' });
  assert.equal(calls[0].url, RPC + 'profile_create');
  assert.equal(calls[0].opts.body, '{"p_token":"tok","p_nickname":"チコ"}');
  assert.deepEqual(plain(await load(reply({ ok: false, reason: 'name_taken' })).R.profileCreate({ token: 'tok', nickname: 'チコ' })), { ok: false, reason: 'name_taken' });
});

test('profileMe_maps', async () => {
  const { R, calls } = load(reply({ ok: true, pid: 'abcdef123456', nickname: 'チコ', is_public: false, title: '旗の達人', deco: ['jp'] }));
  assert.deepEqual(plain(await R.profileMe({ token: 'tok' })), { ok: true, pid: 'abcdef123456', nickname: 'チコ', isPublic: false, title: '旗の達人', deco: ['jp'] });
  assert.equal(calls[0].url, RPC + 'profile_me');
  assert.equal(calls[0].opts.body, '{"p_token":"tok"}');
  assert.deepEqual(plain(await load(reply({ ok: false, reason: 'not_found' })).R.profileMe({ token: 'tok' })), { ok: false, reason: 'not_found' });
});

test('profileRename_args', async () => {
  const { R, calls } = load(reply({ ok: true, nickname: 'ミケ' }));
  assert.deepEqual(plain(await R.profileRename({ token: 'tok', nickname: 'ミケ' })), { ok: true, nickname: 'ミケ' });
  assert.equal(calls[0].url, RPC + 'profile_rename');
  assert.equal(calls[0].opts.body, '{"p_token":"tok","p_nickname":"ミケ"}');
});

test('profileSet_sends_null_for_undefined', async () => {
  const { R, calls } = load(reply({ ok: true }));
  assert.deepEqual(plain(await R.profileSet({ token: 'tok', deco: ['jp'], badges: 3 })), { ok: true });
  assert.equal(calls[0].url, RPC + 'profile_set');
  assert.deepEqual(JSON.parse(calls[0].opts.body),
    { p_token: 'tok', p_is_public: null, p_title: null, p_deco: ['jp'], p_badges: 3, p_badges_total: null });
  await R.profileSet({ token: 'tok', isPublic: false, title: '', deco: [], badges: 0, badgesTotal: 40 });
  assert.deepEqual(JSON.parse(calls[1].opts.body),
    { p_token: 'tok', p_is_public: false, p_title: '', p_deco: [], p_badges: 0, p_badges_total: 40 });
  assert.deepEqual(plain(await load(reply({ ok: false, reason: 'bad_deco' })).R.profileSet({ token: 'tok', deco: ['zz'] })), { ok: false, reason: 'bad_deco' });
  assert.equal(R.message('bad_deco'), 'かざりの国が正しくないみたい');
});

test('profileCard_public', async () => {
  const { R, calls } = load(reply({ ok: true, private: false, pid: 'abcdef123456', nickname: 'チコ', title: '旗の達人', deco: ['jp'],
    badges: 12, badges_total: 40, rpg: { lv: 7, dungeons: 2 }, ta: [{ board: 'f2n:asia:10', time_ms: 12345, rank: 3 }],
    daily: { plays: 4, perfect: 1 }, since: '2026-10-01T00:00:00Z' }));
  const c = await R.profileCard({ pid: 'abcdef123456' });
  assert.equal(calls[0].url, RPC + 'profile_card');
  assert.equal(calls[0].opts.body, '{"p_pid":"abcdef123456"}');
  assert.equal(Object.prototype.toString.call(c.since), '[object Date]');
  assert.equal(c.since.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.deepEqual(plain({ ...c, since: undefined }), { ok: true, private: false, pid: 'abcdef123456', nickname: 'チコ', title: '旗の達人', deco: ['jp'],
    badges: 12, badgesTotal: 40, rpg: { lv: 7, dungeons: 2, tower: 0 }, ta: [{ board: 'f2n:asia:10', timeMs: 12345, rank: 3 }], daily: { plays: 4, perfect: 1 } });
  // 冒険の記録が無ければ rpg は null
  const none = await load(reply({ ok: true, private: false, pid: 'p', nickname: 'a', title: '', deco: [], badges: 0, badges_total: 0,
    rpg: null, ta: [], daily: { plays: 0, perfect: 0 }, since: '2026-10-01T00:00:00Z' })).R.profileCard({ pid: 'p' });
  assert.equal(none.rpg, null);
  assert.deepEqual(plain(none.ta), []);
  // 英雄の塔の最高記録があれば rpg.tower に（無ければ 0）
  const tw = await load(reply({ ok: true, private: false, pid: 'p', nickname: 'a', title: '', deco: [], badges: 0, badges_total: 0,
    rpg: { lv: 30, dungeons: 21, tower: 12 }, ta: [], daily: { plays: 0, perfect: 0 }, since: '2026-10-01T00:00:00Z' })).R.profileCard({ pid: 'p' });
  assert.deepEqual(plain(tw.rpg), { lv: 30, dungeons: 21, tower: 12 });
});

test('profileCard_private', async () => {
  // 非公開は名前とかざりだけ（称号・記録は持たない）
  const { R } = load(reply({ ok: true, private: true, pid: 'abcdef123456', nickname: 'チコ', deco: ['jp'] }));
  assert.deepEqual(plain(await R.profileCard({ pid: 'abcdef123456' })), { ok: true, private: true, pid: 'abcdef123456', nickname: 'チコ', deco: ['jp'] });
  assert.deepEqual(plain(await load(reply({ ok: false, reason: 'not_found' })).R.profileCard({ pid: 'x' })), { ok: false, reason: 'not_found' });
  // 読む系なので、つながらなければ reject
  await assert.rejects(load(() => Promise.reject(new TypeError('Failed to fetch'))).R.profileCard({ pid: 'x' }));
});

test('transferStart_maps', async () => {
  const data = { v: 1, keys: { rpg: '{"lv":3}' } };
  const { R, calls } = load(reply({ ok: true, code: 'ABCDEFGHJKMN', expires_at: '2026-10-29T07:00:00Z' }));
  const r = await R.transferStart({ token: 'tok', data });
  assert.equal(calls[0].url, RPC + 'profile_transfer_start');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { p_token: 'tok', p_data: data });
  assert.equal(r.ok, true);
  assert.equal(r.code, 'ABCDEFGHJKMN');
  assert.equal(r.expiresAt.toISOString(), '2026-10-29T07:00:00.000Z');
  assert.deepEqual(plain(await load(reply({ ok: false, reason: 'too_big' })).R.transferStart({ token: 'tok', data })), { ok: false, reason: 'too_big' });
});

test('transferClaim_normalizes_code', async () => {
  const data = { v: 1, keys: {} };
  const { R, calls } = load(reply({ ok: true, pid: 'abcdef123456', nickname: 'チコ', data }));
  assert.deepEqual(plain(await R.transferClaim({ code: ' abcd-efgh-jkmn ', newToken: 'tok2' })), { ok: true, pid: 'abcdef123456', nickname: 'チコ', data });
  assert.equal(calls[0].url, RPC + 'profile_transfer_claim');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { p_code: 'ABCDEFGHJKMN', p_new_token: 'tok2' });
  await R.transferClaim({ code: 'ab cd　ef‐gh', newToken: 't' });
  assert.equal(JSON.parse(calls[1].opts.body).p_code, 'ABCDEFGH');
  assert.deepEqual(plain(await load(reply({ ok: false, reason: 'bad_code' })).R.transferClaim({ code: 'x', newToken: 't' })), { ok: false, reason: 'bad_code' });
});

test('daily2_args_and_rows', async () => {
  const { R, calls } = load(reply({ ok: true, rank: 2 }));
  assert.deepEqual(plain(await R.dailySubmit2({ token: 'tok', day: '2026-10-28', correct: 4, total: 5, timeMs: 12345.6 })), { ok: true, rank: 2 });
  assert.equal(calls[0].url, RPC + 'submit_daily2');
  assert.equal(calls[0].opts.body, '{"p_token":"tok","p_day":"2026-10-28","p_correct":4,"p_total":5,"p_time_ms":12345}');
  const top = load(reply([{ nickname: 'a', pid: 'p1', deco: ['jp'], correct: 5, total: 5, time_ms: 9000, created_at: '2026-10-28T00:00:00Z' },
    { nickname: 'b', pid: null, deco: null, correct: 4, total: 5, time_ms: 8000, created_at: '2026-10-28T00:00:01Z' }]));
  const rows = await top.R.dailyTop2({ day: '2026-10-28' });
  assert.equal(top.calls[0].url, RPC + 'top_daily2');
  assert.equal(top.calls[0].opts.body, '{"p_day":"2026-10-28"}');
  assert.deepEqual(Object.keys(rows[0]), ['nickname', 'pid', 'deco', 'correct', 'total', 'timeMs', 'at']);
  assert.deepEqual(plain(rows.map(r => [r.pid, r.deco, r.correct, r.timeMs])), [['p1', ['jp'], 5, 9000], [null, [], 4, 8000]]);
  assert.equal(rows[1].at.toISOString(), '2026-10-28T00:00:01.000Z');
});

test('rpg2_args_and_rows', async () => {
  const { R, calls } = load(reply({ ok: true, rank_lv: 2, rank_dg: 5 }));
  assert.deepEqual(plain(await R.rpgUpdate2({ token: 'tok', lv: 7, dungeons: 2, floors: 11 })), { ok: true, rankLv: 2, rankDg: 5 });
  assert.equal(calls[0].url, RPC + 'rpg_update2');
  assert.equal(calls[0].opts.body, '{"p_token":"tok","p_lv":7,"p_dungeons":2,"p_floors":11}');
  const un = load(reply({ ok: true }));
  assert.deepEqual(plain(await un.R.rpgUnregister2({ token: 'tok' })), { ok: true });
  assert.equal(un.calls[0].url, RPC + 'rpg_unregister2');
  assert.equal(un.calls[0].opts.body, '{"p_token":"tok"}');
  assert.deepEqual(plain(await load(reply({ ok: false, reason: 'not_found' })).R.rpgUnregister2({ token: 'tok' })), { ok: false, reason: 'not_found' });
  const top = load(reply([{ nickname: 'ミケ', pid: 'p1', deco: ['jp', 'br'], lv: 3, dungeons: 1, floors: 5, created_at: '2026-10-25T00:00:00Z' },
    { nickname: 'タロウ', pid: null, deco: null, lv: 2, dungeons: 0, floors: 1, created_at: '2026-10-25T00:00:01Z' }]));
  const rows = await top.R.rpgTop3({ sort: 'dg' });
  assert.equal(top.calls[0].url, RPC + 'top_rpg3');
  assert.equal(top.calls[0].opts.body, '{"p_sort":"dg"}');
  assert.deepEqual(Object.keys(rows[0]), ['nickname', 'pid', 'deco', 'lv', 'dungeons', 'floors', 'at']);
  assert.deepEqual(plain(rows.map(r => [r.nickname, r.pid, r.deco, r.lv])), [['ミケ', 'p1', ['jp', 'br'], 3], ['タロウ', null, [], 2]]);
  await assert.rejects(load(reply({ message: 'boom' }, 500)).R.rpgTop3({ sort: 'lv' }), e => e.status === 500);
});

test('rpg_set_tower2_args', async () => {
  // 塔の最高記録をプロフィールの合言葉で送る。返事の rank_tower は rankTower に。失敗しても例外は投げない
  const { R, calls } = load(reply({ ok: true, rank_tower: 4 }));
  assert.deepEqual(plain(await R.rpgSetTower2({ token: 't', tower: 12 })), { ok: true, rankTower: 4 });
  assert.equal(calls[0].url, RPC + 'rpg_set_tower2');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { p_token: 't', p_tower: 12 });
  assert.deepEqual(plain(await load(reply({ ok: false, reason: 'too_soon' })).R.rpgSetTower2({ token: 't', tower: 3 })), { ok: false, reason: 'too_soon' });
  assert.deepEqual(plain(await load(reply({ message: 'boom' }, 500)).R.rpgSetTower2({ token: 't', tower: 3 })), { ok: false, reason: 'network' });
  // 古い rpgSetTower・topTower はもう無い（名前を rpg_players から出す道を残さない）
  assert.equal(R.rpgSetTower, undefined);
  assert.equal(R.topTower, undefined);
});

test('top_tower2_maps_rows', async () => {
  const row = { nickname: 'ミケ', pid: 'p1', tower: 12, lv: 30, deco: ['jp'], created_at: '2026-10-28T00:00:00Z' };
  const { R, calls } = load(reply([row, { ...row, nickname: 'タロウ', pid: null, deco: null }]));
  const rows = await R.topTower2();
  assert.equal(calls[0].url, RPC + 'top_tower2');
  assert.equal(calls[0].opts.body, '{}');
  assert.deepEqual(Object.keys(rows[0]), ['nickname', 'pid', 'deco', 'tower', 'lv', 'at']);
  assert.deepEqual(plain(rows.map(r => ({ ...r, at: r.at.toISOString() }))), [
    { nickname: 'ミケ', pid: 'p1', deco: ['jp'], tower: 12, lv: 30, at: '2026-10-28T00:00:00.000Z' },
    { nickname: 'タロウ', pid: null, deco: [], tower: 12, lv: 30, at: '2026-10-28T00:00:00.000Z' }]);
  // DB にまだ top_tower2 が無い（404）ときは e.status 付きで reject（rpg-rank.js が「準備中」と出す）
  await assert.rejects(load(reply({ message: 'Could not find the function' }, 404)).R.topTower2(), e => e.status === 404);
  await assert.rejects(load(() => Promise.reject(new TypeError('Failed to fetch'))).R.topTower2());
});

test('rpg_tower_rank_of', async () => {
  const { R, calls } = load(reply({ rank: 3 }));
  assert.equal(await R.rpgTowerRankOf({ tower: 12, lv: 30 }), 3);
  assert.equal(calls[0].url, RPC + 'rpg_tower_rank_of');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { p_tower: 12, p_lv: 30 });
  await assert.rejects(load(reply({ message: 'boom' }, 500)).R.rpgTowerRankOf({ tower: 1, lv: 1 }));
});
