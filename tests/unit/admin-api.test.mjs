// admin-api.js（管理ページの Supabase 通信）の単体テスト。偽の fetch と偽の storage を vm 内の API に渡す
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../admin-api.js', import.meta.url), 'utf8');
const URL0 = 'https://x.supabase.co', KEY = 'sb_publishable_test';
const NOW = 1_800_000_000_000;

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
}
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const tok = (n, over = {}) => json(200, { access_token: `a${n}`, refresh_token: `r${n}`, expires_in: 3600, expires_at: Math.floor(NOW / 1000) + 3600, user: { id: 'u', email: 'me@x.jp' }, ...over });
// handlers: 順に返す応答の配列（関数なら呼ぶ）。呼ばれた記録は calls に残る
// timeout: 8秒の打ち切りを待たないように、setTimeout の待ち時間をこの ms にする（テスト用）
function setup(replies, { now = NOW, storage = mem(), timeout } = {}) {
  const calls = [], q = [...replies];
  const fetch = async (u, init) => {
    calls.push({ url: u, init, body: init.body ? JSON.parse(init.body) : null });
    const r = q.shift(); if (!r) throw new Error('unexpected fetch ' + u);
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r() : r;
  };
  const st = timeout === undefined ? setTimeout : (fn, _ms) => setTimeout(fn, timeout);
  const ctx = { console, setTimeout: st, clearTimeout, AbortController }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const clock = { t: now };
  const api = ctx.ADMIN_API.create({ fetch, storage, now: () => clock.t, url: URL0, key: KEY });
  return { api, calls, storage, clock };
}
const saved = s => JSON.parse(s.getItem('adminAuth'));
const seed = (s, over = {}) => s.setItem('adminAuth', JSON.stringify({ access_token: 'a0', refresh_token: 'r0', expires_at: NOW + 3600_000, last: NOW, email: 'me@x.jp', ...over }));

test('login_saves_session_in_given_storage', async () => {
  const { api, calls, storage } = setup([tok(1), json(200, { ok: true, user_id: 'u' })]);
  assert.deepEqual({ ...(await api.login('me@x.jp', 'pw')) }, { ok: true });
  assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=password$/);
  assert.equal(calls[0].init.headers.apikey, KEY);
  assert.deepEqual({ ...calls[0].body }, { email: 'me@x.jp', password: 'pw' });
  assert.match(calls[1].url, /\/rest\/v1\/rpc\/admin_whoami$/);
  const s = saved(storage);
  assert.equal(s.access_token, 'a1'); assert.equal(s.refresh_token, 'r1');
  assert.equal(s.expires_at, Math.floor(NOW / 1000) * 1000 + 3600_000); assert.equal(s.last, NOW); assert.equal(s.email, 'me@x.jp');
  assert.deepEqual([...storage.m.keys()], ['adminAuth']);
  assert.equal(api.loggedIn(), true);
});

test('login_bad_password', async () => {
  const { api, storage } = setup([json(400, { error: 'invalid_grant' })]);
  assert.equal((await api.login('a', 'b')).reason, 'bad_login');
  assert.equal(storage.getItem('adminAuth'), null);
});

test('login_network', async () => {
  const { api, storage } = setup([new TypeError('fail')]);
  assert.equal((await api.login('a', 'b')).reason, 'network');
  assert.equal(storage.getItem('adminAuth'), null);
});

test('login_not_admin_clears', async () => {
  const { api, storage } = setup([tok(1), json(403, { code: '42501' })]);
  assert.equal((await api.login('a', 'b')).reason, 'not_admin');
  assert.equal(storage.getItem('adminAuth'), null);
});

test('logout_clears_even_if_request_fails', async () => {
  const { api, calls, storage } = setup([new TypeError('x')]); seed(storage);
  await api.logout();
  assert.match(calls[0].url, /\/auth\/v1\/logout\?scope=local$/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer a0');
  assert.equal(storage.getItem('adminAuth'), null);
});

test('call_sends_bearer_and_apikey', async () => {
  const { api, calls, storage } = setup([json(200, [1, 2])]); seed(storage);
  assert.deepEqual(plain(await api.call('admin_list', { p: 1 })), [1, 2]);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/admin_list$/);
  assert.equal(calls[0].init.headers.apikey, KEY);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer a0');
  assert.deepEqual({ ...calls[0].body }, { p: 1 });
});
const plain = x => JSON.parse(JSON.stringify(x));

test('call_updates_last', async () => {
  const { api, storage, clock } = setup([json(200, {})]); seed(storage);
  clock.t = NOW + 600_000; await api.call('f', {});
  assert.equal(saved(storage).last, NOW + 600_000);
});

test('call_refreshes_when_near_expiry', async () => {
  const { api, calls, storage } = setup([tok(2), json(200, { ok: 1 })]); seed(storage, { expires_at: NOW + 30_000 });
  await api.call('f', {});
  assert.match(calls[0].url, /grant_type=refresh_token$/);
  assert.deepEqual({ ...calls[0].body }, { refresh_token: 'r0' });
  assert.equal(calls[1].init.headers.Authorization, 'Bearer a2');
  assert.equal(saved(storage).refresh_token, 'r2'); assert.equal(saved(storage).email, 'me@x.jp');
});

test('call_retries_once_on_401', async () => {
  const { api, calls, storage } = setup([json(401, { code: 'PGRST301' }), tok(2), json(200, { ok: 1 })]); seed(storage);
  assert.deepEqual(plain(await api.call('f', {})), { ok: 1 });
  assert.equal(calls.length, 3); assert.equal(calls[2].init.headers.Authorization, 'Bearer a2');
});

test('second_401_means_relogin', async () => {
  const { api, storage } = setup([json(401, {}), tok(2), json(401, {})]); seed(storage);
  await assert.rejects(api.call('f', {}), e => e.code === 'relogin');
  assert.equal(storage.getItem('adminAuth'), null);
});

test('refresh_failure_means_relogin', async () => {
  const { api, storage } = setup([json(401, {}), json(400, { error: 'x' })]); seed(storage);
  await assert.rejects(api.call('f', {}), e => e.code === 'relogin');
  assert.equal(storage.getItem('adminAuth'), null);
});

test('call_without_session_is_relogin', async () => {
  const { api } = setup([]);
  await assert.rejects(api.call('f', {}), e => e.code === 'relogin');
});

test('idle_30min_logs_out', async () => {
  const { api, storage, clock } = setup([]); seed(storage);
  clock.t = NOW + 1_799_000; assert.equal(api.loggedIn(), true);
  clock.t = NOW + 31 * 60_000; assert.equal(api.loggedIn(), false);
  assert.equal(storage.getItem('adminAuth'), null);
});

test('denied_maps_to_code', async () => {
  const { api, storage } = setup([json(403, { code: '42501', message: 'denied' })]); seed(storage);
  await assert.rejects(api.call('f', {}), e => e.code === 'denied');
});

test('network_and_http_codes', async () => {
  const { api, storage } = setup([new TypeError('x'), json(500, { message: 'boom' })]); seed(storage);
  await assert.rejects(api.call('f', {}), e => e.code === 'network');
  await assert.rejects(api.call('f', {}), e => e.code === 'http');
});

test('call_after_idle_30min_is_relogin_without_fetch', async () => {
  const { api, calls, storage, clock } = setup([]); seed(storage);
  clock.t = NOW + 31 * 60_000;
  await assert.rejects(api.call('f', {}), e => e.code === 'relogin');
  // rpc は送らない（送るのはサーバーの合札を無効にする /logout だけ）
  assert.equal(calls.filter(c => !/\/auth\/v1\/logout\?scope=local$/.test(c.url)).length, 0); assert.equal(storage.getItem('adminAuth'), null);
});

test('refresh_does_not_reset_idle_clock', async () => {
  const { api, storage, clock } = setup([tok(2), json(200, {})]); seed(storage, { expires_at: NOW + 30_000 });
  clock.t = NOW + 10 * 60_000; await api.call('f', {});
  assert.equal(saved(storage).last, NOW + 10 * 60_000); // call 成功で更新
});

test('refresh_keeps_last_when_it_fails_later', async () => {
  const { api, storage, clock } = setup([tok(2), json(401, {}), json(401, {})]); seed(storage, { expires_at: NOW + 30_000 });
  clock.t = NOW + 5 * 60_000;
  await assert.rejects(api.call('f', {}), e => e.code === 'relogin');
});

test('401_with_42501_is_denied_without_refresh', async () => {
  const { api, calls, storage } = setup([json(401, { code: '42501' })]); seed(storage);
  await assert.rejects(api.call('f', {}), e => e.code === 'denied');
  assert.equal(calls.length, 1);
});

// ---- 監査の直し ----
test('refresh_5xx_or_429_is_network_and_keeps_session', async () => {
  for (const status of [500, 502, 503, 429]) {
    const { api, storage } = setup([json(status, { msg: 'later' })]); seed(storage, { expires_at: NOW + 30_000 });
    const before = storage.getItem('adminAuth');
    await assert.rejects(api.call('f', {}), e => e.code === 'network' && e.status === status, `HTTP ${status}`);
    assert.equal(storage.getItem('adminAuth'), before, `HTTP ${status} では保存を消さない`);
    assert.equal(api.loggedIn(), true);
  }
});

test('refresh_4xx_other_than_429_is_relogin', async () => {
  for (const status of [400, 401, 403]) {
    const { api, storage } = setup([json(status, { error: 'invalid_grant' })]); seed(storage, { expires_at: NOW + 30_000 });
    await assert.rejects(api.call('f', {}), e => e.code === 'relogin', `HTTP ${status}`);
    assert.equal(storage.getItem('adminAuth'), null);
  }
});

test('refresh_after_401_with_503_keeps_session', async () => {
  const { api, storage } = setup([json(401, { code: 'PGRST301' }), json(503, {})]); seed(storage);
  await assert.rejects(api.call('f', {}), e => e.code === 'network');
  assert.notEqual(storage.getItem('adminAuth'), null);
});

test('timeout_covers_stalled_body', async () => {
  // ヘッダーは来たが本文が来ない（text も json も終わらない）
  const stall = { ok: true, status: 200, json: () => new Promise(() => {}), text: () => new Promise(() => {}) };
  const { api, storage } = setup([stall, stall], { timeout: 5 }); seed(storage);
  await assert.rejects(api.call('f', {}), e => e.code === 'network');
  assert.notEqual(storage.getItem('adminAuth'), null, '本文が止まっても保存は残す');
  assert.deepEqual({ ...(await api.login('a', 'b')) }, { ok: false, reason: 'network' });
});

test('timeout_covers_stalled_headers', async () => {
  const { api, storage } = setup([() => new Promise(() => {})], { timeout: 5 }); seed(storage);
  await assert.rejects(api.call('f', {}), e => e.code === 'network');
});

test('login_429_is_rate_limited_not_bad_login', async () => {
  const { api, storage } = setup([json(429, { code: 'over_request_rate_limit' })]);
  assert.equal((await api.login('a', 'b')).reason, 'rate_limited');
  assert.equal(storage.getItem('adminAuth'), null);
});

test('session_keeps_user_id_for_ops_log', async () => {
  const { api, storage } = setup([tok(1), json(200, { ok: true, user_id: 'u' })]);
  await api.login('me@x.jp', 'pw');
  assert.equal(saved(storage).uid, 'u');
  assert.equal(api.uid(), 'u');
});

test('exports_url_and_key', () => {
  const ctx = { console, setTimeout, clearTimeout, AbortController }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(src, ctx);
  assert.equal(ctx.ADMIN_API.URL, 'https://vgdkklvhtvcamtxwjpke.supabase.co');
  assert.equal(ctx.ADMIN_API.KEY, 'sb_publishable_eFVPaD9rNRdqi_1LtXxmGg_yJACIRqV');
});

// ---- 1回目のレビューの直し ----
test('logout_during_refresh_does_not_bring_session_back', async () => {
  let release;
  const held = new Promise(r => { release = r; });
  // 1: 止めた refresh、2: logout（refresh がもらった新しい合札で）
  const { api, calls, storage } = setup([() => held, json(204, null), json(204, null)]); seed(storage, { expires_at: NOW + 30_000 });
  const pending = api.call('admin_list', {}).catch(e => e);
  await new Promise(r => setTimeout(r, 0));
  const out = api.logout();
  assert.equal(api.loggedIn(), false, 'ログアウトを押したらすぐ消す（サーバーの返事を待たない）');
  release(tok(1));
  await out;
  assert.equal((await pending).code, 'stale', 'ログアウトの前に送ったものは stale（画面はもうログアウトしている）');
  assert.equal(storage.getItem('adminAuth'), null, 'ログアウトのあとで合札を書きもどさない');
  assert.equal(api.loggedIn(), false);
  assert.equal(calls.filter(c => /\/rest\//.test(c.url)).length, 0, 'ログアウトのあとで rpc を送らない');
  const outs = calls.filter(c => /\/auth\/v1\/logout\?scope=local$/.test(c.url)).map(c => c.init.headers.Authorization);
  assert.ok(outs.includes('Bearer a1'), `refresh がもらった合札も無効にする: ${outs}`);
});

test('refresh_4xx_after_relogin_keeps_new_session', async () => {
  let release;
  const held = new Promise(r => { release = r; });
  const { api, storage } = setup([() => held, tok(5), json(200, { ok: true })]); seed(storage, { expires_at: NOW + 30_000 });
  const pending = api.call('f', {}).catch(e => e);
  await new Promise(r => setTimeout(r, 0));
  storage.removeItem('adminAuth');
  assert.deepEqual({ ...(await api.login('me@x.jp', 'pw')) }, { ok: true });
  release(json(400, { error: 'invalid_grant' }));
  assert.equal((await pending).code, 'stale', 'ログインし直す前の呼び出しは stale（新しいログインを追い出さない）');
  assert.equal(saved(storage).access_token, 'a5', '古い refresh が断られても、ログインし直した合札は消さない');
});

test('idle_logout_revokes_server_session', async () => {
  const { api, calls, storage, clock } = setup([json(204, null)]); seed(storage);
  clock.t = NOW + 31 * 60_000;
  assert.equal(api.loggedIn(), false);
  assert.equal(storage.getItem('adminAuth'), null);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/logout\?scope=local$/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer a0');
});

test('refresh_finishing_after_clear_does_not_write', async () => {
  let release;
  const held = new Promise(r => { release = r; });
  const { api, storage } = setup([() => held]); seed(storage, { expires_at: NOW + 30_000 });
  const pending = api.call('f', {}).catch(e => e);
  await new Promise(r => setTimeout(r, 0));
  storage.removeItem('adminAuth');
  seed(storage, { access_token: 'b0', refresh_token: 'q0' });   // ほかで合札が入れかわった
  release(tok(1));
  const e = await pending;
  assert.equal(e.code, 'relogin');
  assert.equal(saved(storage).refresh_token, 'q0', '入れかわった合札を古い refresh の結果で上書きしない');
});

test('logout_with_expired_token_refreshes_first', async () => {
  const { api, calls, storage, clock } = setup([tok(2), json(204, null)]); seed(storage);
  clock.t = NOW + 61 * 60_000; seed(storage, { last: clock.t - 60_000 });   // 期限切れ・30分はたっていない
  await api.logout();
  assert.match(calls[0].url, /grant_type=refresh_token$/);
  assert.match(calls[1].url, /\/auth\/v1\/logout\?scope=local$/);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer a2');
  assert.equal(storage.getItem('adminAuth'), null);
});

test('fast_device_clock_does_not_refresh_every_call', async () => {
  // 端末の時計がサーバーより2時間進んでいる。サーバーの expires_at はもう過ぎて見える
  const fast = NOW + 2 * 3600_000;
  const { api, calls } = setup([tok(1), json(200, { ok: true }), json(200, {}), json(200, {})], { now: fast });
  assert.deepEqual({ ...(await api.login('me@x.jp', 'pw')) }, { ok: true });
  await api.call('admin_stats', {}); await api.call('admin_stats', {});
  assert.deepEqual(calls.map(c => c.url.replace(URL0, '')), ['/auth/v1/token?grant_type=password', '/rest/v1/rpc/admin_whoami', '/rest/v1/rpc/admin_stats', '/rest/v1/rpc/admin_stats']);
});

// ---- 2回目のレビューの直し ----
// P1: ログアウトはこの端末の合札だけ無効にする（scope=local。ほかの端末のログインは切らない）
test('logout_uses_local_scope', async () => {
  const { api, calls, storage } = setup([json(204, null)]); seed(storage);
  await api.logout();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${URL0}/auth/v1/logout?scope=local`);
});

// F1: ログアウトしてすぐログインし直した。古い refresh は新しいログインを待たせず、終わっても新しいログインを消さない
test('old_refresh_does_not_block_or_kick_new_login', async () => {
  let release;
  const held = new Promise(r => { release = r; });
  // 1: 止めた古い refresh、2: ログイン（すぐ期限が来る合札）、3: 新しいログインの refresh、4: whoami、
  // 5: ログアウトの /logout（古い refresh がもらった a1）、6: 期限切れかけの a0 を無効にする前の refresh（断られる）
  const { api, calls, storage } = setup([() => held, tok(5, { expires_in: 30 }), tok(6), json(200, { ok: true }), json(204, null), json(204, null)]);
  seed(storage, { expires_at: NOW + 30_000 });
  const pending = api.call('admin_list', {}).catch(e => e);
  await new Promise(r => setTimeout(r, 0));
  const out = api.logout();
  assert.deepEqual({ ...(await api.login('me@x.jp', 'pw')) }, { ok: true }, '古い refresh を待たずにログインできる');
  assert.equal(saved(storage).access_token, 'a6');
  assert.deepEqual({ ...calls[2].body }, { refresh_token: 'r5' }, '新しいログインは自分の refresh をする');
  release(tok(1));
  assert.equal((await pending).code, 'stale');
  await out;
  assert.equal(saved(storage).access_token, 'a6', '古い refresh が終わっても新しいログインは消さない');
  assert.equal(api.loggedIn(), true);
  const outs = calls.filter(c => /\/auth\/v1\/logout\?scope=local$/.test(c.url)).map(c => c.init.headers.Authorization);
  assert.deepEqual(outs, ['Bearer a1'], '古い refresh がもらった合札を無効にする');
  assert.deepEqual(calls.slice(4).map(c => c.url.replace(URL0, '')), ['/auth/v1/logout?scope=local', '/auth/v1/token?grant_type=refresh_token']);
});

// F1: ログインし直す前に送った rpc が 401 をもらっても、新しいログインの合札で refresh したり消したりしない
test('old_call_401_does_not_touch_new_login', async () => {
  let release;
  const held = new Promise(r => { release = r; });
  // 1: 古い rpc（止める）→ 401、2: ログイン、3: whoami
  const { api, calls, storage } = setup([() => held, tok(5), json(200, { ok: true })]); seed(storage);
  const pending = api.call('admin_list', {}).catch(e => e);
  await new Promise(r => setTimeout(r, 0));
  storage.removeItem('adminAuth');
  assert.deepEqual({ ...(await api.login('me@x.jp', 'pw')) }, { ok: true });
  release(json(401, { code: 'PGRST301' }));
  assert.equal((await pending).code, 'stale');
  assert.equal(saved(storage).access_token, 'a5');
  assert.equal(calls.length, 3, '古い呼び出しのために refresh・やり直しを送らない');
});

// T7: refresh で合札が変わっても、30分を数える last は変えない（成功した rpc だけが last を進める）
test('refresh_keeps_last', async () => {
  const { api, storage, clock } = setup([tok(2), json(500, { message: 'boom' })]); seed(storage, { expires_at: NOW + 30_000 });
  clock.t = NOW + 5 * 60_000;
  await assert.rejects(api.call('f', {}), e => e.code === 'http');
  assert.equal(saved(storage).refresh_token, 'r2', 'refresh は済んでいる');
  assert.equal(saved(storage).last, NOW, 'refresh だけでは last を進めない');
});
