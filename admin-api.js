// 管理ページの Supabase 通信（ログイン・合札の更新・rpc 呼び出し）。DOM は触らない
(() => {
  const DEFAULT_URL = 'https://vgdkklvhtvcamtxwjpke.supabase.co';
  const DEFAULT_KEY = 'sb_publishable_eFVPaD9rNRdqi_1LtXxmGg_yJACIRqV';
  const TIMEOUT = 8000;          // 8秒で打ち切り
  const IDLE_MS = 30 * 60 * 1000; // 最後の操作から30分で自動ログアウト
  const SKEW_MS = 60 * 1000;     // 期限の60秒前から refresh
  const KEY = 'adminAuth';

  const err = (msg, code, status) => Object.assign(new Error(msg), { code, status });

  function create({ fetch: f = globalThis.fetch && globalThis.fetch.bind(globalThis), storage, now = () => Date.now(), url = DEFAULT_URL, key = DEFAULT_KEY } = {}) {
    const store = storage || globalThis.sessionStorage;
    const read = () => { try { const a = JSON.parse(store.getItem(KEY)); return a && a.access_token ? a : null; } catch { return null; } };
    const write = a => store.setItem(KEY, JSON.stringify(a));
    const clear = () => { try { store.removeItem(KEY); } catch { /* 消せなくても進める */ } };

    // 8秒で打ち切る fetch。返事の本文を読み終えるまでを8秒に入れる（ヘッダーのあとで止まっても待ち続けない）。
    // 返すのは { ok, status, body }（body は JSON として読めなければ null）。通信できない・8秒たった なら code 'network'
    async function send(path, { headers = {}, body } = {}) {
      const ac = new AbortController();
      let timer;
      const late = new Promise((_, no) => { timer = setTimeout(() => { ac.abort(); no(new Error('timeout')); }, TIMEOUT); });
      late.catch(() => {});
      try {
        return await Promise.race([late, (async () => {
          const res = await f(`${url}${path}`, {
            method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json', ...headers },
            body: body === undefined ? undefined : JSON.stringify(body), signal: ac.signal,
          });
          const text = await res.text();
          let b = null;
          try { b = text ? JSON.parse(text) : null; } catch { /* JSON でない本文は null */ }
          return { ok: res.ok, status: res.status, body: b };
        })()]);
      } catch (e) { throw err(`network: ${e && e.message}`, 'network'); } finally { clearTimeout(timer); }
    }
    // token の返事から保存用の形にする（expires_at は秒 → ミリ秒）
    const session = (t, email, prev) => ({
      access_token: t.access_token, refresh_token: t.refresh_token,
      expires_at: t.expires_at ? t.expires_at * 1000 : now() + (t.expires_in || 3600) * 1000,
      last: prev ? prev.last : now(), email: (t.user && t.user.email) || email || (prev && prev.email) || '',
    });

    // 合札の更新。断られた（429 以外の 4xx）ときだけ保存を消して relogin。
    // 5xx・429・つながらない・8秒たった は code 'network' にして保存は残す（あとでやり直せる）
    let refreshing = null;
    function refresh() {
      return refreshing ||= (async () => {
        const a = read();
        if (!a || !a.refresh_token) { clear(); throw err('relogin', 'relogin'); }
        const res = await send('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: a.refresh_token } });
        if (!res.ok) {
          if (res.status >= 400 && res.status < 500 && res.status !== 429) { clear(); throw err('relogin', 'relogin', res.status); }
          throw err(`refresh: HTTP ${res.status}`, 'network', res.status);
        }
        const next = session(res.body || {}, a.email, a);
        if (!next.access_token) { clear(); throw err('relogin', 'relogin'); }
        write(next); return next;
      })().finally(() => { refreshing = null; });
    }

    // rpc を1回呼ぶ。send の { ok, status, body } を返す
    const rpcOnce = (name, args, a) => send(`/rest/v1/rpc/${name}`, { headers: { Authorization: `Bearer ${a.access_token}` }, body: args ?? {} });
    const isDenied = (res, b) => (res.status === 401 || res.status === 403) && b && b.code === '42501';

    function loggedIn() {
      const a = read();
      if (!a) return false;
      if (!(now() - a.last < IDLE_MS)) { clear(); return false; }
      return true;
    }

    async function call(name, args) {
      if (!loggedIn()) throw err('relogin', 'relogin'); // 30分たっていたら通信せずログインし直し
      let a = read();
      if (now() >= a.expires_at - SKEW_MS) a = await refresh();
      let res = await rpcOnce(name, args, a), b;
      if (res.status === 401) {
        b = res.body;
        if (!isDenied(res, b)) {
          a = await refresh();           // 1回だけ更新してやり直し
          res = await rpcOnce(name, args, a);
          if (res.status === 401) {
            b = res.body;
            if (!isDenied(res, b)) { clear(); throw err('relogin', 'relogin', 401); }
          } else b = undefined;
        }
      }
      if (b === undefined) b = res.body;
      if (isDenied(res, b)) throw err('denied', 'denied', res.status);
      if (!res.ok) throw err(`${name}: HTTP ${res.status} ${b && b.message ? String(b.message).slice(0, 300) : ''}`, 'http', res.status);
      const cur = read(); if (cur) write({ ...cur, last: now() });
      return b;
    }

    async function login(email, password) {
      let res;
      try { res = await send('/auth/v1/token?grant_type=password', { body: { email, password } }); }
      catch { return { ok: false, reason: 'network' }; }
      if (!res.ok) return { ok: false, reason: res.status >= 500 ? 'network' : 'bad_login' };
      const s = session(res.body || {}, email);
      if (!s.access_token) return { ok: false, reason: 'bad_login' };
      write(s);
      try { await call('admin_whoami', {}); }
      catch (e) { clear(); return { ok: false, reason: e.code === 'denied' ? 'not_admin' : 'network' }; }
      return { ok: true };
    }

    async function logout() {
      const a = read();
      try { if (a) await send('/auth/v1/logout', { headers: { Authorization: `Bearer ${a.access_token}` } }); } catch { /* 失敗しても消す */ }
      clear();
    }

    return { login, logout, loggedIn, call, email: () => (read() || {}).email || '' };
  }

  globalThis.ADMIN_API = { create };
})();
