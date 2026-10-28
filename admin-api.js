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
    // gen: 保存を消す・ログインし直すたびに進める。途中の refresh が、そのあとで古い合札を書きもどさないように
    let gen = 0;
    const clear = () => { gen++; try { store.removeItem(KEY); } catch { /* 消せなくても進める */ } };

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
    // token の返事から保存用の形にする。期限はこの端末の時計で数える（expires_in があればそれを使う。
    // サーバーの expires_at はサーバーの時計なので、端末の時計が進んでいると毎回 refresh してしまう）
    const session = (t, email, prev) => ({
      access_token: t.access_token, refresh_token: t.refresh_token,
      expires_at: Number.isFinite(t.expires_in) && t.expires_in > 0 ? now() + t.expires_in * 1000
        : t.expires_at ? t.expires_at * 1000 : now() + 3600 * 1000,
      last: prev ? prev.last : now(), email: (t.user && t.user.email) || email || (prev && prev.email) || '',
      uid: (t.user && typeof t.user.id === 'string' && t.user.id) || (prev && prev.uid) || '',   // 操作ログの「だれが」を自分と見分ける用
    });

    // 合札の更新。断られた（429 以外の 4xx）ときだけ保存を消して relogin。
    // 5xx・429・つながらない・8秒たった は code 'network' にして保存は残す（あとでやり直せる）。
    // 待っているあいだにログアウト・ログインし直しがあったら code 'stale'（今のログインは消さない・画面も戻さない）
    // refreshing: 今の gen の refresh（同じログインの呼び出しどうしで1つにまとめる。古いログインの refresh は待たない）。
    // inflight: まだ終わっていない refresh 全部（logout が待って、それがもらった合札も無効にする）
    let refreshing = null, orphans = [];
    const inflight = new Set();
    function refresh() {
      if (refreshing && refreshing.g === gen) return refreshing.p;
      const g = gen;
      const p = (async () => {
        const a = read();
        if (!a || !a.refresh_token) { clear(); throw err('relogin', 'relogin'); }
        const res = await send('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: a.refresh_token } });
        if (!res.ok) {
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            if (g !== gen) throw err('stale', 'stale', res.status);   // ログインし直したあとの合札は消さない
            clear(); throw err('relogin', 'relogin', res.status);
          }
          throw err(`refresh: HTTP ${res.status}`, 'network', res.status);
        }
        // 待っているあいだにログアウト・ログインし直しがあったら、古い合札で作った新しい合札は書かない
        // （サーバーには生きている合札なので、logout が無効にできるよう orphans に取っておく）
        const next = session(res.body || {}, a.email, a), cur = read();
        if (g !== gen || !cur || cur.refresh_token !== a.refresh_token) {
          if (next.access_token) orphans.push(next);
          throw g !== gen ? err('stale', 'stale') : err('relogin', 'relogin');
        }
        if (!next.access_token) { clear(); throw err('relogin', 'relogin'); }
        write(next); return next;
      })().finally(() => { inflight.delete(p); if (refreshing && refreshing.p === p) refreshing = null; });
      inflight.add(p);
      refreshing = { g, p };
      return p;
    }

    // rpc を1回呼ぶ。send の { ok, status, body } を返す
    const rpcOnce = (name, args, a) => send(`/rest/v1/rpc/${name}`, { headers: { Authorization: `Bearer ${a.access_token}` }, body: args ?? {} });
    const isDenied = (res, b) => (res.status === 401 || res.status === 403) && b && b.code === '42501';

    // サーバーの合札を無効にする（どれも失敗してよい）。access_token の期限が切れかけていたら、先に refresh_token で
    // 新しい access_token をもらう（期限切れの access_token では /logout が断られ、refresh_token がサーバーに残るので）
    async function revoke(a) {
      try {
        if (!a) return;
        if (now() >= a.expires_at - SKEW_MS && a.refresh_token) {
          const res = await send('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: a.refresh_token } });
          if (!res.ok || !res.body || !res.body.access_token) return;
          a = { access_token: res.body.access_token };
        }
        // scope=local: この合札（このログイン）だけ無効にする。既定の global だと、ほかの端末の管理者のログインまで切れる
        await send('/auth/v1/logout?scope=local', { headers: { Authorization: `Bearer ${a.access_token}` } });
      } catch { /* 失敗しても進める */ }
    }

    function loggedIn() {
      const a = read();
      if (!a) return false;
      if (!(now() - a.last < IDLE_MS)) { clear(); revoke(a); return false; }   // 30分: 待たずに消し、サーバーの合札も無効にしに行く
      return true;
    }

    async function call(name, args) {
      if (!loggedIn()) throw err('relogin', 'relogin'); // 30分たっていたら通信せずログインし直し
      // g: 呼びはじめたときのログイン。返事を待つあいだにログアウト・ログインし直しがあったら、今のログインにさわらず 'stale'
      const g = gen, stale = () => { if (g !== gen) throw err('stale', 'stale'); };
      let a = read();
      if (now() >= a.expires_at - SKEW_MS) a = await refresh();
      stale();
      let res = await rpcOnce(name, args, a), b;
      stale();
      if (res.status === 401) {
        b = res.body;
        if (!isDenied(res, b)) {
          a = await refresh();           // 1回だけ更新してやり直し
          stale();
          res = await rpcOnce(name, args, a);
          stale();
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
      // 429 は試しすぎ（GoTrue の回数制限）。パスワードちがいとは分けて知らせる
      if (!res.ok) return { ok: false, reason: res.status >= 500 ? 'network' : res.status === 429 ? 'rate_limited' : 'bad_login' };
      const s = session(res.body || {}, email);
      if (!s.access_token) return { ok: false, reason: 'bad_login' };
      gen++; write(s);
      try { await call('admin_whoami', {}); }
      catch (e) { clear(); return { ok: false, reason: e.code === 'denied' ? 'not_admin' : 'network' }; }
      return { ok: true };
    }

    // 先に保存を消して（画面はすぐログアウトにできる）から、サーバーの合札を無効にする。
    // 途中の refresh があれば終わるのを待ち、その refresh がもらった合札（orphans）も無効にする。どれも失敗しても消す
    async function logout() {
      const a = read(), pending = [...inflight];
      clear();
      if (pending.length) await Promise.allSettled(pending);
      const fresh = orphans; orphans = [];
      for (const o of fresh) await revoke(o);
      if (a && !fresh.some(o => o.access_token === a.access_token)) await revoke(a);
    }

    return { login, logout, loggedIn, call, email: () => (read() || {}).email || '', uid: () => (read() || {}).uid || '' };
  }

  // URL・KEY は admin.js（D12 のつながるか）も使う。ここだけに書く
  globalThis.ADMIN_API = { create, URL: DEFAULT_URL, KEY: DEFAULT_KEY };
})();
