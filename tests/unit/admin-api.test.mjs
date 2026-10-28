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
function setup(replies, { now = NOW, storage = mem() } = {}) {
  const calls = [], q = [...replies];
  const fetch = async (u, init) => {
    calls.push({ url: u, init, body: init.body ? JSON.parse(init.body) : null });
    const r = q.shift(); if (!r) throw new Error('unexpected fetch ' + u);
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r() : r;
  };
  const ctx = { console, setTimeout, clearTimeout, AbortController }; ctx.globalThis = ctx; vm.createContext(ctx);
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
  assert.match(calls[0].url, /\/auth\/v1\/logout$/);
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
  assert.equal(calls.length, 0); assert.equal(storage.getItem('adminAuth'), null);
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
