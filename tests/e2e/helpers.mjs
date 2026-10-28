// ブラウザテストの共通部品。サイトをローカルで配信し、CDN と Supabase をテスト用に差し替える
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const MODULES = join(HERE, 'node_modules');
export const PHONE = { width: 390, height: 844 };
export const PC = { width: 1280, height: 800 };
// badges.js が入っても、レイアウトのテストの画面にバッジのパネル・札・NEW が出ないためのセーブ（openApp の storage に { badges: QUIET_BADGES }）。
// テストで別のバッジが取れて画面が変わるなら、そのキーをここに足す。sent にも入れておく（払い残しにすると、本物の rpg.js では
// 読み込むたびに ●+150 を払い直して「バッジのごほうび」のトーストが出て、場面の計測に写る）
export const QUIET_BADGES = { v: 1, got: { 'first-clear@1': 1, 'ta-clear@1': 1, 'dopa-on@1': 1 }, eq: '', sn: { 'first-clear': 2, 'ta-clear': 2, 'dopa-on': 2 },
  sent: ['first-clear@1', 'ta-clear@1', 'dopa-on@1'], tip: 3 };

// index.html が読む CDN のファイル → npm install した同じ版
const LIBS = {
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js': 'd3/dist/d3.min.js',
  'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js': 'topojson-client/dist/topojson-client.min.js',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };

let lastUrl;
// リポジトリ直下（root を渡したらそのフォルダ）を配信する静的サーバー（空いているポートで立てる）
// root を渡したときは openApp の既定の url は変えない（変更前のコードと比べるときに使う）
export async function startServer({ root } = {}) {
  const dir = root ? resolve(root) : ROOT;
  const server = createServer(async (req, res) => {
    const path = normalize(join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    const file = path.endsWith(sep) ? join(path, 'index.html') : path;
    if (!file.startsWith(dir + sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}/`;
  if (!root) lastUrl = url;
  return { url, close: () => new Promise(ok => server.close(ok)) };
}

// 日本時間の月曜0時（supabase/schema.sql の jst_week_start() と同じ区切り）
const weekStart = (now = Date.now()) => {
  const jst = new Date(now + 9 * 3600e3), back = (jst.getUTCDay() + 6) % 7;
  return Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - back) - 9 * 3600e3;
};

// メモリ上の偽 Supabase。supabase/schema.sql の3関数と同じ形の JSON を返す最小実装
// （名前は文字数だけ見る。NGワード・速すぎ・連投のチェックはしない）
export function fakeDb() {
  const rows = [];
  // board ごとに、同じ名前は最速1件にして速い順
  const bests = (board, since = -Infinity) => {
    const m = new Map();
    for (const r of rows) {
      if (r.board !== board || Date.parse(r.created_at) < since) continue;
      const b = m.get(r.nickname);
      if (!b || r.time_ms < b.time_ms || (r.time_ms === b.time_ms && Date.parse(r.created_at) < Date.parse(b.created_at))) m.set(r.nickname, r);
    }
    return [...m.values()].sort((a, b) => a.time_ms - b.time_ms || Date.parse(a.created_at) - Date.parse(b.created_at));
  };
  const rpgRows = [];
  // 並べ方ごとに比べる値の順（大きいほど上）。同じなら先に載せた順
  const RPG_KEYS = { lv: r => [r.lv, r.dungeons, r.floors], dg: r => [r.dungeons, r.floors, r.lv] };
  const cmpKeys = (x, y) => { for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
  const rpgBests = sort => {
    const key = RPG_KEYS[sort];
    return [...rpgRows].sort((a, b) => cmpKeys(key(a), key(b)) || Date.parse(a.created_at) - Date.parse(b.created_at));
  };
  const rpgRank = (lv, dungeons, floors) => {
    const me = { lv, dungeons, floors }, above = sort => rpgBests(sort).filter(r => cmpKeys(RPG_KEYS[sort](r), RPG_KEYS[sort](me)) < 0).length + 1;
    return { rank_lv: above('lv'), rank_dg: above('dg') };
  };
  // 今日の難問の行 { day, nickname, correct, total, time_ms, created_at }
  const dailyRows = [];
  const dailyRank = (day, correct, t) => dailyRows.filter(r => r.day === day && (r.correct > correct || (r.correct === correct && r.time_ms < t))).length + 1;
  const rankOf = (board, t) => ({
    rank_all: bests(board).filter(r => r.time_ms < t).length + 1,
    rank_week: bests(board, weekStart()).filter(r => r.time_ms < t).length + 1,
  });
  const rpc = {
    submit_score({ p_board, p_nickname, p_time_ms, p_questions }) {
      const nickname = String(p_nickname ?? '').trim(), len = [...nickname].length;
      if (len < 1 || len > 12) return { ok: false, reason: 'bad_name' };
      rows.push({ board: p_board, nickname, time_ms: p_time_ms, questions: p_questions, created_at: new Date().toISOString() });
      return { ok: true, ...rankOf(p_board, p_time_ms) };
    },
    top_scores({ p_board, p_period }) {
      if (p_period !== 'all' && p_period !== 'week') return [];
      return bests(p_board, p_period === 'week' ? weekStart() : -Infinity).slice(0, 50)
        .map(({ nickname, time_ms, created_at }) => ({ nickname, time_ms, created_at }));
    },
    rank_of: ({ p_board, p_time_ms }) => rankOf(p_board, p_time_ms),
    // 冒険のランキング（rpg_register / rpg_update / rpg_rename / rpg_unregister / rpg_set_deco / top_rpg / top_rpg2 / rpg_rank_of と同じ形。
    // 名前は文字数と重なりだけ、かざりは数・重なり・国コードの形だけ見る。10秒の連投よけはしない）。
    // rpgRows の行は { token, nickname, lv, dungeons, floors, deco, created_at, at }（deco は無くてもよい = 空）
    rpg_register({ p_token, p_nickname, p_lv, p_dungeons, p_floors }) {
      const nickname = String(p_nickname ?? '').trim(), len = [...nickname].length;
      if (rpgRows.some(r => r.token === p_token)) return { ok: false, reason: 'already' };
      if (len < 1 || len > 12) return { ok: false, reason: 'bad_name' };
      if (rpgRows.some(r => r.nickname === nickname)) return { ok: false, reason: 'name_taken' };
      const at = new Date().toISOString();
      rpgRows.push({ token: p_token, nickname, lv: p_lv, dungeons: p_dungeons, floors: p_floors, deco: [], created_at: at, at });
      return { ok: true, ...rpgRank(p_lv, p_dungeons, p_floors) };
    },
    rpg_update({ p_token, p_lv, p_dungeons, p_floors }) {
      const r = rpgRows.find(r => r.token === p_token);
      if (!r) return { ok: false, reason: 'not_found' };
      Object.assign(r, { lv: Math.max(r.lv, p_lv), dungeons: Math.max(r.dungeons, p_dungeons), floors: Math.max(r.floors, p_floors), at: new Date().toISOString() });
      return { ok: true, ...rpgRank(r.lv, r.dungeons, r.floors) };
    },
    rpg_rename({ p_token, p_nickname }) {
      const r = rpgRows.find(r => r.token === p_token), nickname = String(p_nickname ?? '').trim(), len = [...nickname].length;
      if (!r) return { ok: false, reason: 'not_found' };
      if (len < 1 || len > 12) return { ok: false, reason: 'bad_name' };
      if (rpgRows.some(x => x !== r && x.nickname === nickname)) return { ok: false, reason: 'name_taken' };
      r.nickname = nickname;
      return { ok: true, nickname };
    },
    rpg_unregister({ p_token }) {
      const i = rpgRows.findIndex(r => r.token === p_token);
      if (i < 0) return { ok: false, reason: 'not_found' };
      rpgRows.splice(i, 1);
      return { ok: true };
    },
    rpg_set_deco({ p_token, p_deco }) {
      const r = rpgRows.find(r => r.token === p_token);
      if (!Array.isArray(p_deco) || p_deco.length > 3 || new Set(p_deco).size !== p_deco.length || !p_deco.every(a => /^[a-z]{2}$/.test(a))) return { ok: false, reason: 'bad_deco' };
      if (!r) return { ok: false, reason: 'not_found' };
      r.deco = [...p_deco];
      return { ok: true };
    },
    top_rpg2: ({ p_sort }) => p_sort in RPG_KEYS ? rpgBests(p_sort).slice(0, 50).map(({ nickname, lv, dungeons, floors, deco, at }) => ({ nickname, lv, dungeons, floors, deco: deco ?? [], created_at: at })) : [],
    top_rpg: ({ p_sort }) => p_sort in RPG_KEYS ? rpgBests(p_sort).slice(0, 50).map(({ nickname, lv, dungeons, floors, at }) => ({ nickname, lv, dungeons, floors, created_at: at })) : [],
    rpg_rank_of: ({ p_lv, p_dungeons, p_floors }) => rpgRank(p_lv, p_dungeons, p_floors),
    // 今日の難問（submit_daily / top_daily / daily_rank_of と同じ形。日付は形だけ、名前は文字数と同じ日の重なりだけ見る）
    submit_daily({ p_day, p_nickname, p_correct, p_total, p_time_ms }) {
      const nickname = String(p_nickname ?? '').trim(), len = [...nickname].length;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p_day ?? '')) return { ok: false, reason: 'bad_day' };
      if (len < 1 || len > 12) return { ok: false, reason: 'bad_name' };
      if (dailyRows.some(r => r.day === p_day && r.nickname === nickname)) return { ok: false, reason: 'name_taken' };
      dailyRows.push({ day: p_day, nickname, correct: p_correct, total: p_total, time_ms: p_time_ms, created_at: new Date().toISOString() });
      return { ok: true, rank: dailyRank(p_day, p_correct, p_time_ms) };
    },
    top_daily: ({ p_day }) => dailyRows.filter(r => r.day === p_day)
      .sort((a, b) => b.correct - a.correct || a.time_ms - b.time_ms || Date.parse(a.created_at) - Date.parse(b.created_at)).slice(0, 50)
      .map(({ nickname, correct, total, time_ms, created_at }) => ({ nickname, correct, total, time_ms, created_at })),
    daily_rank_of: ({ p_day, p_correct, p_time_ms }) => ({ rank: dailyRank(p_day, p_correct, p_time_ms) }),
  };
  // calls: 届いた RPC の記録 { name, args, at }（at は届いた時刻 ms）。down を true にすると通信失敗になる
  const db = { rows, rpgRows, dailyRows, calls: [], down: false, rpc };
  addAdmin(db);
  return db;
}

// 管理ページ（admin.html）用: /auth/v1/token と supabase/admin.sql の admin_ 関数のまね。
// db.admin = { email, password, isAdmin }（isAdmin: false なら、ログインはできても admin_ 関数は 42501 で断る）。
// 行は rows（scores）・dailyRows・rpgRows をそのまま使い、id が無ければ振る。ゴミ箱は db.trash、操作の記録は db.adminLog。
// db.tokens: 出した access_token → { admin }。db.expireTokens() で今の合札を全部 401 にできる
function addAdmin(db) {
  db.admin = { email: 'admin@example.com', password: 'pass-1234', isAdmin: true };
  db.tokens = new Map();
  db.refresh = new Map();
  db.trash = [];
  db.adminLog = [];
  db.expireTokens = () => db.tokens.clear();
  let nextId = 1, nextTok = 1, nextTrash = 1, nextLog = 1;
  const KIND = { scores: db.rows, daily: db.dailyRows, rpg: db.rpgRows };
  const ids = () => { for (const a of Object.values(KIND)) for (const r of a) if (r.id == null) r.id = nextId++; else nextId = Math.max(nextId, r.id + 1); };
  const out = r => { const { token, ...rest } = r; return structuredClone(rest); };
  const issue = () => {
    const access_token = `fake-access-${nextTok}`, refresh_token = `fake-refresh-${nextTok++}`;
    db.tokens.set(access_token, { admin: db.admin.isAdmin });
    db.refresh.set(refresh_token, true);
    return { access_token, refresh_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'fake-admin', email: db.admin.email } };
  };
  db.auth = (path, query, body) => {
    if (path.endsWith('/logout')) return [204, null];
    if (path.endsWith('/health')) return [200, { ok: true }];
    if (query.get('grant_type') === 'password')
      return body.email === db.admin.email && body.password === db.admin.password ? [200, issue()] : [400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }];
    if (query.get('grant_type') === 'refresh_token') {
      if (!db.refresh.delete(body.refresh_token)) return [400, { error: 'invalid_grant' }];
      return [200, issue()];
    }
    return [404, {}];
  };
  const log = (action, kind, detail) => db.adminLog.push({ id: nextLog++, at: new Date().toISOString(), user_id: 'fake-admin', action, kind, detail });
  const lower = s => String(s ?? '').normalize('NFKC').toLowerCase();
  const jstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
  const since = (a, t) => a.filter(r => Date.parse(r.created_at) >= t).length;
  const A = {
    admin_whoami: () => ({ ok: true, user_id: 'fake-admin' }),
    admin_stats() {
      const today = Date.parse(`${jstDay()}T00:00:00+09:00`), week = weekStart();
      const all = [...db.rows, ...db.dailyRows].map(r => r.created_at).concat(db.rpgRows.flatMap(r => [r.created_at, r.at, r.updated_at])).filter(Boolean).sort();
      return { ok: true, counts: { scores: db.rows.length, daily: db.dailyRows.length, rpg: db.rpgRows.length },
        today: { scores: since(db.rows, today), daily: since(db.dailyRows, today), rpg: since(db.rpgRows, today) },
        week: { scores: since(db.rows, week), daily: since(db.dailyRows, week), rpg: since(db.rpgRows, week) },
        last_at: all.at(-1) ?? null, recent_log: db.adminLog.slice(-5).reverse() };
    },
    admin_list({ p_kind, p_filter }) {
      ids();
      const f = p_filter ?? {}, q = lower(f.q), best = f.sort === 'best';
      const limit = Math.min(Math.max(Number.isFinite(f.limit) ? Math.floor(f.limit) : 100, 1), 500), offset = Math.max(Number.isFinite(f.offset) ? Math.floor(f.offset) : 0, 0);
      const newer = (a, b) => Date.parse(b.created_at ?? b.at) - Date.parse(a.created_at ?? a.at) || b.id - a.id;
      let list;
      if (p_kind === 'trash') list = db.trash.filter(t => !t.restored_at && lower(t.row_data.nickname).includes(q)).sort(newer)
        .map(t => ({ ...structuredClone(t), row_data: out(t.row_data) }));
      else if (KIND[p_kind]) {
        list = KIND[p_kind].filter(r => lower(r.nickname).includes(q));
        if (p_kind === 'scores') list = list.filter(r => (f.board == null || r.board === f.board) && (f.period !== 'week' || Date.parse(r.created_at) >= weekStart()));
        if (p_kind === 'daily' && f.day) list = list.filter(r => r.day === f.day);
        const cmp = { scores: (a, b) => a.time_ms - b.time_ms, daily: (a, b) => b.correct - a.correct || a.time_ms - b.time_ms, rpg: (a, b) => b.lv - a.lv || b.dungeons - a.dungeons || b.floors - a.floors }[p_kind];
        list = [...list].sort(best ? (a, b) => cmp(a, b) || -newer(a, b) : newer).map(out);
      } else return { ok: false, reason: 'bad_kind' };
      return { ok: true, total: list.length, rows: list.slice(offset, offset + limit) };
    },
    admin_boards() {
      const m = new Map(); for (const r of db.rows) m.set(r.board, (m.get(r.board) ?? 0) + 1);
      return { ok: true, boards: [...m].sort(([a], [b]) => a < b ? -1 : 1).map(([board, n]) => ({ board, n })) };
    },
    admin_delete({ p_kind, p_ids }) {
      ids();
      const a = KIND[p_kind]; if (!a) return { ok: false, reason: 'bad_kind' };
      const gone = [];
      for (let i = a.length - 1; i >= 0; i--) if (p_ids.includes(a[i].id)) gone.push(...a.splice(i, 1));
      for (const r of gone) db.trash.push({ id: nextTrash++, at: new Date().toISOString(), kind: p_kind, row_data: r, restored_at: null });
      log('delete', p_kind, { ids: gone.map(r => r.id).sort((x, y) => x - y) });
      return { ok: true, deleted: gone.length };
    },
    admin_restore({ p_trash_ids }) {
      const want = new Set(p_trash_ids.filter(x => x != null)).size;
      let ok = 0;
      for (const t of db.trash.filter(t => p_trash_ids.includes(t.id) && !t.restored_at)) {
        const a = KIND[t.kind];
        if (a.some(r => r.id === t.row_data.id)) continue;
        a.push(t.row_data); t.restored_at = new Date().toISOString(); ok++;
      }
      log('restore', null, { trash_ids: p_trash_ids, restored: ok, failed: want - ok });
      return { ok: true, restored: ok, failed: want - ok };
    },
    admin_rename({ p_kind, p_id, p_name }) {
      ids();
      const a = KIND[p_kind]; if (!a) return { ok: false, reason: 'bad_kind' };
      let name = p_name == null ? null : String(p_name).trim();
      if (name != null && ([...name].length < 1 || [...name].length > 12)) return { ok: false, reason: 'bad_name' };
      const r = a.find(r => r.id === p_id); if (!r) return { ok: false, reason: 'not_found' };
      if (name == null) name = `名無しの旅人${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
      if (p_kind === 'rpg' && a.some(x => x !== r && lower(x.nickname) === lower(name))) return { ok: false, reason: 'name_taken' };
      const before = r.nickname; r.nickname = name;
      log('rename', p_kind, { id: p_id, before, after: name });
      return { ok: true, nickname: name };
    },
    admin_log_list({ p_limit, p_offset }) {
      const l = Math.min(Math.max(p_limit ?? 100, 1), 500), o = Math.max(p_offset ?? 0, 0);
      return { ok: true, total: db.adminLog.length, rows: db.adminLog.slice().reverse().slice(o, o + l) };
    },
  };
  db.adminRpc = A;
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const json = (route, status, body) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: body == null ? '' : JSON.stringify(body) });
async function supabaseRoute(route, db) {
  if (db.down) return route.abort();
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const u = new URL(req.url()), name = u.pathname.split('/').pop();
  let args; try { args = req.postDataJSON() ?? {}; } catch { args = {}; }
  db.calls.push({ name, args, at: Date.now() });
  if (u.pathname.startsWith('/auth/v1/')) { const [st, body] = db.auth(u.pathname, u.searchParams, args); return json(route, st, body); }
  // admin_ 関数: 合札が無い・古い → 401、管理者でない → 403 の 42501（本物の PostgREST と同じ形）
  if (Object.hasOwn(db.adminRpc, name)) {
    const tok = db.tokens.get((req.headers().authorization ?? '').replace(/^Bearer /, ''));
    if (!tok) return json(route, 401, { code: 'PGRST301', message: 'JWT expired' });
    if (!tok.admin) return json(route, 403, { code: '42501', message: 'admin only' });
    return json(route, 200, await db.adminRpc[name](args));   // テストが返事を遅らせられるように await
  }
  const fn = Object.hasOwn(db.rpc, name) ? db.rpc[name] : null;
  // 本物（PostgREST）は int の引数に小数が来ると 400 で断るので、それもまねる
  const badInt = ['p_time_ms', 'p_questions', 'p_lv', 'p_dungeons', 'p_floors', 'p_correct', 'p_total'].some(k => k in args && !Number.isInteger(args[k]));
  if (!fn || badInt) return route.fulfill({ status: fn ? 400 : 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ message: 'fake supabase: bad request' }) });
  return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(fn(args)) });
}

// 新しいブラウザコンテキストでサイトを開く。supabase: 'fake'（偽DB）か 'down'（つながらない）
// seed: Math.random を決まった列にする（mulberry32）。reducedMotion・colorScheme・hasTouch は newContext にそのまま渡す（hasTouch: true で (hover: none) and (pointer: coarse) になる）
// storage: ページのスクリプトより前に localStorage へ入れておく値（キー → JSON にする値）
// blockScripts: 中身を空にするスクリプトのファイル名（'rpg.js' など。?v=1 は見ない）。止めずに空の script を返すので console error にならない
// init: 読み込むたびにページのスクリプトより前に走らせる関数か文字列（context.addInitScript に渡す）
// 戻り値の db は偽DB（down を書き換えれば途中でつながる/切れるにできる）、errors はページで起きた例外、warnings は console.warn の文字、
// consoleErrors は console.error の文字（再読み込みをまたいで積む）
// path: url からの相対で開くページ（'admin.html' など。省略時は url そのもの＝index.html）
export async function openApp(browser, { viewport = PHONE, supabase = 'fake', url = lastUrl, path = '', seed, reducedMotion, colorScheme, hasTouch, storage, blockScripts = [], init } = {}) {
  if (!url) throw new Error('startServer() を先に呼ぶか url を渡してね');
  const context = await browser.newContext({ viewport, reducedMotion, colorScheme, hasTouch });
  context.setDefaultTimeout(5000); // 要素が出ないときは早めに落とす
  if (seed !== undefined) await context.addInitScript(seed => {
    let t = seed;
    Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }, seed);
  // about:blank などでは localStorage が使えず例外になるので握りつぶす
  if (storage) await context.addInitScript(storage => {
    try { for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, JSON.stringify(v)); } catch {}
  }, storage);
  if (init) await context.addInitScript(init);
  if (blockScripts.length) await context.route(u => blockScripts.includes(new URL(u).pathname.slice(1)),
    route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  const db = fakeDb();
  db.down = supabase === 'down';
  const origin = new URL(url).origin;
  await context.route(u => u.origin !== origin, route => {
    const target = route.request().url();
    if (LIBS[target]) return route.fulfill({ path: join(MODULES, LIBS[target]), contentType: 'text/javascript; charset=utf-8' });
    if (new URL(target).hostname.endsWith('.supabase.co')) return supabaseRoute(route, db);
    return route.abort(); // フォントなどその他の外部通信はしない
  });
  const page = await context.newPage(), errors = [], warnings = [], consoleErrors = [];
  page.on('pageerror', e => errors.push(e));
  page.on('console', m => {
    if (m.type() === 'warning') warnings.push(m.text());
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto(new URL(path, url).href);
  return { page, context, db, errors, warnings, consoleErrors, close: () => context.close() };
}

// console.warn はページから少し遅れて届くので、re に合うものが来るまで（最大2秒）待つ。来たら true
export async function warned(warnings, re) {
  for (let i = 0; i < 100 && !warnings.some(w => re.test(w)); i++) await new Promise(ok => setTimeout(ok, 20));
  return warnings.some(w => re.test(w));
}

// モード選択画面で条件を選ぶ（スタートは押さない）。mode/kind はキー（f2n・ta など）、region は 'all' か地域名
export async function pickSetup(page, { mode, kind, region, count } = {}) {
  if (await page.isHidden('#scr-setup')) {
    if (await page.isVisible('#home-play')) await page.click('#home-play');
    else await page.evaluate(() => show('setup'));
  }
  if (mode) await page.click(`#modes .modecard[data-k="${mode}"]`);
  if (kind) await page.click(`#kinds .modecard[data-k="${kind}"]`);
  if (region) await page.click(`#regions .chip[data-r="${region}"]`);
  if (count) await page.click(`#counts .chip[data-c="${count}"]`);
}

// タイムアタックと今日の難問は問題を出した直後（index.html の TA_GUARD_MS の間）のクリックを無視する。その間が過ぎるまで待つ
// （timed が無い変更前のコードではタイムアタックだけ）
export const settle = page => page.waitForFunction(() => !(typeof timed === 'function' ? timed() : G.kind === 'ta') || performance.now() - G.shownAt >= TA_GUARD_MS);
// 結果画面も出した直後（TA_GUARD_MS の間）は結果のボタンを押せない。その間が過ぎるまで待つ
// （resultAt が無い変更前のコードでは待たない。GEOM_BASE の比較で clearTimeAttack を古いコードにも使うため）
export const settleResult = page => page.waitForFunction(() => typeof resultAt === 'undefined' || performance.now() - resultAt >= TA_GUARD_MS);

// いま出ている問題に正解／不正解で答える
export async function answerCorrect(page) {
  await settle(page);
  const a = await page.evaluate(() => G.cur.c.a);
  await page.click(`.choice[data-a="${a}"]`);
}
export async function answerWrong(page) {
  await settle(page);
  const a = await page.evaluate(() => G.cur.c.a);
  await page.locator(`.choice:not([data-a="${a}"])`).first().click();
}

// タイムアタックを最後までノーミスで解いて結果画面まで進める。opts は pickSetup と同じ（省略時は 国旗→国名・全世界・5問）
// 結果のボタンがすぐ押せるように、結果画面を出した直後の待ち（settleResult）まで済ませて返す
export async function clearTimeAttack(page, opts = {}) {
  await pickSetup(page, { mode: 'f2n', region: 'all', count: 5, ...opts, kind: 'ta' });
  await page.click('#start');
  const n = await page.evaluate(() => G.set.length);
  for (let i = 0; i < n; i++) await answerCorrect(page);
  await page.locator('#scr-result').waitFor();
  await settleResult(page);
}

// 練習・挑戦を結果画面まで進める（正解して「次へ」をくり返す）。結果画面を出した直後の待ち（settleResult）はしないので、結果のボタンを押すなら呼ぶ側で待つ
export async function clearByAnswering(page) {
  const max = await page.evaluate(() => G.set.length * 3);
  for (let i = 0; i < max && await page.evaluate(() => $('scr-result').hidden); i++) {
    await answerCorrect(page);
    await page.click('#next');
  }
  if (await page.evaluate(() => $('scr-result').hidden)) throw new Error('clearByAnswering: no result');
}

// index.html が document に出すイベントを window.__ev に順に積む（{ type, ...detail }）。ページを開いた直後に1回呼ぶ
const EVENTS = ['drill:start', 'drill:answer', 'drill:result', 'drill:screen', 'drill:book-open', 'drill:misses-reset'];
export const recordEvents = page => page.evaluate(types => {
  window.__ev = [];
  for (const type of types) document.addEventListener(type, e => window.__ev.push({ type: e.type, ...e.detail }));
}, EVENTS);
// 積んだイベント。type を渡せばその種類だけ
export const events = (page, type) => page.evaluate(type => window.__ev.filter(e => !type || e.type === type), type);
