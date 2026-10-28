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

// メモリ上の偽 Supabase。supabase/schema.sql の関数と同じ形の JSON を返す最小実装
// （名前は文字数と重なりだけ見る。NGワード・速すぎ・連投・引き継ぎコードの期限のチェックはしない）
// profiles の行は { id, pid, token, nickname, is_public, title, deco, badges, badges_total, created_at }。テストで直接 push するときは
// token と nickname だけでもよい（ほかは呼ばれたときに既定の値で埋める）。rows・dailyRows・rpgRows の行の profile_id は profiles の id（無い = 古い記録）
export function fakeDb() {
  const profiles = [], transfers = [];
  // 直接 push された行の足りない項目を埋める（id は今ある最大 + 1、pid は12文字の英数字）
  const fill = () => {
    for (const p of profiles) {
      p.id ??= Math.max(0, ...profiles.map(x => x.id ?? 0)) + 1;
      p.pid ??= crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      p.is_public ??= true; p.title ??= ''; p.deco ??= []; p.badges ??= 0; p.badges_total ??= 0;
      p.created_at ??= new Date().toISOString();
    }
  };
  const byToken = token => { fill(); return token ? profiles.find(p => p.token === token) : undefined; };
  const byId = id => { fill(); return id == null ? undefined : profiles.find(p => p.id === id); };
  const cleanName = n => String(n ?? '').trim();
  const nameKey = n => n.normalize('NFKC').toLowerCase();
  // 名前の問題（無ければ null）。me は名前を変える本人（自分と同じ名前は重なりにしない）
  const nameProblem = (nickname, me) => {
    const len = [...nickname].length;
    if (len < 1 || len > 12) return 'bad_name';
    if (profiles.some(p => p !== me && nameKey(p.nickname) === nameKey(nickname))) return 'name_taken';
    return null;
  };
  // 人の区別（schema.sql と同じ。プロフィールの行は profile_id、古い行は名前）と、表に出す名前・pid・かざり
  const person = r => r.profile_id != null ? `p${r.profile_id}` : `n:${r.nickname}`;
  const shown = r => {
    const p = byId(r.profile_id);
    return p ? { nickname: p.nickname, pid: p.pid, deco: [...p.deco] } : { nickname: r.nickname, pid: null, deco: Array.isArray(r.deco) ? [...r.deco] : [] };
  };
  const decoOk = d => Array.isArray(d) && d.length <= 3 && new Set(d).size === d.length && d.every(a => /^[a-z]{2}$/.test(a));
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 12 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  const old = () => ({ ok: false, reason: 'old_version' });

  const rows = [];
  // board ごとに、同じ人（key）は最速1件にして速い順
  const bests = (board, since = -Infinity, key = person) => {
    const m = new Map();
    for (const r of rows) {
      if (r.board !== board || Date.parse(r.created_at) < since) continue;
      const k = key(r), b = m.get(k);
      if (!b || r.time_ms < b.time_ms || (r.time_ms === b.time_ms && Date.parse(r.created_at) < Date.parse(b.created_at))) m.set(k, r);
    }
    return [...m.values()].sort((a, b) => a.time_ms - b.time_ms || Date.parse(a.created_at) - Date.parse(b.created_at));
  };
  // rpgRows の行は { token, profile_id, nickname, lv, dungeons, floors, deco, created_at, at }（deco は無くてもよい = 空）
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
  // 今日の難問の行 { day, profile_id, nickname, correct, total, time_ms, created_at }
  const dailyRows = [];
  const dailyRank = (day, correct, t) => dailyRows.filter(r => r.day === day && (r.correct > correct || (r.correct === correct && r.time_ms < t))).length + 1;
  const rankOf = (board, t) => ({
    rank_all: bests(board).filter(r => r.time_ms < t).length + 1,
    rank_week: bests(board, weekStart()).filter(r => r.time_ms < t).length + 1,
  });
  const rpc = {
    // ---- プロフィール（profile_create / profile_me / profile_rename / profile_set / profile_card） ----
    profile_create({ p_token, p_nickname }) {
      if (!p_token) return { ok: false, reason: 'bad_token' };
      if (byToken(p_token)) return { ok: false, reason: 'already' };
      const nickname = cleanName(p_nickname), bad = nameProblem(nickname);
      if (bad) return { ok: false, reason: bad };
      profiles.push({ token: p_token, nickname });
      fill();
      return { ok: true, pid: profiles.at(-1).pid, nickname };
    },
    profile_me({ p_token }) {
      if (!p_token) return { ok: false, reason: 'bad_token' };
      const p = byToken(p_token);
      if (!p) return { ok: false, reason: 'not_found' };
      return { ok: true, pid: p.pid, nickname: p.nickname, is_public: p.is_public, title: p.title, deco: [...p.deco] };
    },
    // 名前を変えたら、この人の記録の行の nickname もそろえる
    profile_rename({ p_token, p_nickname }) {
      if (!p_token) return { ok: false, reason: 'bad_token' };
      const p = byToken(p_token);
      if (!p) return { ok: false, reason: 'not_found' };
      const nickname = cleanName(p_nickname), bad = nameProblem(nickname, p);
      if (bad) return { ok: false, reason: bad };
      p.nickname = nickname;
      for (const r of [...rows, ...dailyRows, ...rpgRows]) if (r.profile_id === p.id) r.nickname = nickname;
      return { ok: true, nickname };
    },
    // null の引数は前の値のまま。かざりは形だけ見る
    profile_set({ p_token, p_is_public, p_title, p_deco, p_badges, p_badges_total }) {
      if (!p_token) return { ok: false, reason: 'bad_token' };
      const p = byToken(p_token);
      if (!p) return { ok: false, reason: 'not_found' };
      if (p_deco != null && !decoOk(p_deco)) return { ok: false, reason: 'bad_deco' };
      const badN = n => n != null && !(n >= 0 && n <= 500);
      if ((p_title != null && [...String(p_title)].length > 40) || badN(p_badges) || badN(p_badges_total)) return { ok: false, reason: 'bad_record' };
      if (p_is_public != null) p.is_public = !!p_is_public;
      if (p_title != null) p.title = String(p_title);
      if (p_deco != null) p.deco = [...p_deco];
      if (p_badges != null) p.badges = p_badges;
      if (p_badges_total != null) p.badges_total = p_badges_total;
      return { ok: true };
    },
    // プロフィールの窓。TA は board ごとの自己ベストを順位の良い順に3つまで
    profile_card({ p_pid }) {
      fill();
      const p = profiles.find(x => x.pid === p_pid);
      if (!p) return { ok: false, reason: 'not_found' };
      if (!p.is_public) return { ok: true, private: true, pid: p.pid, nickname: p.nickname, deco: [...p.deco] };
      const boards = [...new Set(rows.filter(r => r.profile_id === p.id).map(r => r.board))];
      const ta = boards.map(board => {
        const list = bests(board), i = list.findIndex(r => r.profile_id === p.id);
        return { board, time_ms: list[i].time_ms, rank: i + 1 };
      }).sort((a, b) => a.rank - b.rank || a.time_ms - b.time_ms).slice(0, 3);
      const mine = dailyRows.filter(r => r.profile_id === p.id), rpg = rpgRows.find(r => r.profile_id === p.id);
      return { ok: true, private: false, pid: p.pid, nickname: p.nickname, title: p.title, deco: [...p.deco], badges: p.badges, badges_total: p.badges_total,
        rpg: rpg ? { lv: rpg.lv, dungeons: rpg.dungeons } : null, ta,
        daily: { plays: mine.length, perfect: mine.filter(r => r.correct === r.total).length }, since: p.created_at };
    },
    // ---- 引き継ぎ（profile_transfer_start / profile_transfer_claim）。transfers の行は { code, profile_id, data, expires_at, used_at, created_at } ----
    profile_transfer_start({ p_token, p_data }) {
      if (!p_token) return { ok: false, reason: 'bad_token' };
      const p = byToken(p_token);
      if (!p) return { ok: false, reason: 'not_found' };
      if (p_data == null || typeof p_data !== 'object') return { ok: false, reason: 'bad_record' };
      if (Buffer.byteLength(JSON.stringify(p_data)) > 524288) return { ok: false, reason: 'too_big' };
      for (const t of transfers) if (t.profile_id === p.id) t.data = null;   // 出し直すと前のコードは使えない
      const t = { code: newCode(), profile_id: p.id, data: p_data, expires_at: new Date(Date.now() + 864e5).toISOString(), used_at: null, created_at: new Date().toISOString() };
      transfers.push(t);
      return { ok: true, code: t.code, expires_at: t.expires_at };
    },
    profile_transfer_claim({ p_code, p_new_token }) {
      if (!p_new_token) return { ok: false, reason: 'bad_token' };
      const code = String(p_code ?? '').replace(/[-\s]/g, '').toUpperCase();
      const t = transfers.find(t => t.code === code && !t.used_at && t.data != null), p = t && byId(t.profile_id);
      if (!p) return { ok: false, reason: 'bad_code' };
      const data = t.data;
      for (const r of rpgRows) if (r.profile_id === p.id) r.token = p_new_token;
      p.token = p_new_token;
      Object.assign(t, { used_at: new Date().toISOString(), data: null });
      return { ok: true, pid: p.pid, nickname: p.nickname, data };
    },
    // ---- タイムアタック（submit_score2 / top_scores2 / rank_of） ----
    submit_score2({ p_token, p_board, p_time_ms, p_questions }) {
      if (!p_token) return { ok: false, reason: 'bad_token' };
      const p = byToken(p_token);
      if (!p) return { ok: false, reason: 'not_found' };
      rows.push({ board: p_board, profile_id: p.id, nickname: p.nickname, time_ms: p_time_ms, questions: p_questions, created_at: new Date().toISOString() });
      return { ok: true, ...rankOf(p_board, p_time_ms) };
    },
    top_scores2({ p_board, p_period }) {
      if (p_period !== 'all' && p_period !== 'week') return [];
      return bests(p_board, p_period === 'week' ? weekStart() : -Infinity).slice(0, 50)
        .map(r => ({ ...shown(r), time_ms: r.time_ms, created_at: r.created_at }));
    },
    rank_of: ({ p_board, p_time_ms }) => rankOf(p_board, p_time_ms),
    // ---- 今日の難問（submit_daily2 / top_daily2 / daily_rank_of。日付は形だけ見る） ----
    submit_daily2({ p_token, p_day, p_correct, p_total, p_time_ms }) {
      if (!p_token) return { ok: false, reason: 'bad_token' };
      const p = byToken(p_token);
      if (!p) return { ok: false, reason: 'not_found' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p_day ?? '')) return { ok: false, reason: 'bad_day' };
      if (dailyRows.some(r => r.day === p_day && r.profile_id === p.id)) return { ok: false, reason: 'already' };
      dailyRows.push({ day: p_day, profile_id: p.id, nickname: p.nickname, correct: p_correct, total: p_total, time_ms: p_time_ms, created_at: new Date().toISOString() });
      return { ok: true, rank: dailyRank(p_day, p_correct, p_time_ms) };
    },
    top_daily2: ({ p_day }) => dailyRows.filter(r => r.day === p_day)
      .sort((a, b) => b.correct - a.correct || a.time_ms - b.time_ms || Date.parse(a.created_at) - Date.parse(b.created_at)).slice(0, 50)
      .map(r => ({ ...shown(r), correct: r.correct, total: r.total, time_ms: r.time_ms, created_at: r.created_at })),
    daily_rank_of: ({ p_day, p_correct, p_time_ms }) => ({ rank: dailyRank(p_day, p_correct, p_time_ms) }),
    // ---- 冒険（rpg_update2 / rpg_unregister2 / top_rpg3 / rpg_rank_of）。行が無ければ作り、記録は最高を残す ----
    rpg_update2({ p_token, p_lv, p_dungeons, p_floors }) {
      if (!p_token) return { ok: false, reason: 'bad_token' };
      const p = byToken(p_token);
      if (!p) return { ok: false, reason: 'not_found' };
      const at = new Date().toISOString();
      let r = rpgRows.find(r => r.profile_id === p.id);
      if (!r) rpgRows.push(r = { token: p.token, profile_id: p.id, nickname: p.nickname, lv: p_lv, dungeons: p_dungeons, floors: p_floors, deco: [], created_at: at, at });
      Object.assign(r, { lv: Math.max(r.lv, p_lv), dungeons: Math.max(r.dungeons, p_dungeons), floors: Math.max(r.floors, p_floors), at });
      return { ok: true, ...rpgRank(r.lv, r.dungeons, r.floors) };
    },
    rpg_unregister2({ p_token }) {
      if (!p_token) return { ok: false, reason: 'bad_token' };
      const p = byToken(p_token), i = p ? rpgRows.findIndex(r => r.profile_id === p.id) : -1;
      if (i < 0) return { ok: false, reason: 'not_found' };
      rpgRows.splice(i, 1);
      return { ok: true };
    },
    top_rpg3: ({ p_sort }) => p_sort in RPG_KEYS ? rpgBests(p_sort).slice(0, 50)
      .map(r => ({ ...shown(r), lv: r.lv, dungeons: r.dungeons, floors: r.floors, created_at: r.at })) : [],
    rpg_rank_of: ({ p_lv, p_dungeons, p_floors }) => rpgRank(p_lv, p_dungeons, p_floors),
    // ---- 前の版の関数。書きこみは old_version を返し、読むだけ・消すだけのものはそのまま（schema.sql の -- >>> old_version と同じ） ----
    submit_score: old, submit_daily: old, rpg_register: old, rpg_rename: old, rpg_update: old, rpg_set_deco: old,
    top_scores({ p_board, p_period }) {
      if (p_period !== 'all' && p_period !== 'week') return [];
      return bests(p_board, p_period === 'week' ? weekStart() : -Infinity, r => r.nickname).slice(0, 50)
        .map(({ nickname, time_ms, created_at }) => ({ nickname, time_ms, created_at }));
    },
    top_daily: ({ p_day }) => rpc.top_daily2({ p_day }).map(({ nickname, correct, total, time_ms, created_at }) => ({ nickname, correct, total, time_ms, created_at })),
    rpg_unregister({ p_token }) {
      const i = rpgRows.findIndex(r => r.token === p_token);
      if (i < 0) return { ok: false, reason: 'not_found' };
      rpgRows.splice(i, 1);
      return { ok: true };
    },
    top_rpg2: ({ p_sort }) => p_sort in RPG_KEYS ? rpgBests(p_sort).slice(0, 50).map(({ nickname, lv, dungeons, floors, deco, at }) => ({ nickname, lv, dungeons, floors, deco: deco ?? [], created_at: at })) : [],
    top_rpg: ({ p_sort }) => p_sort in RPG_KEYS ? rpgBests(p_sort).slice(0, 50).map(({ nickname, lv, dungeons, floors, at }) => ({ nickname, lv, dungeons, floors, created_at: at })) : [],
  };
  // calls: 届いた RPC の記録 { name, args, at }（at は届いた時刻 ms）。down を true にすると通信失敗になる
  return { profiles, transfers, rows, rpgRows, dailyRows, calls: [], down: false, rpc };
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
async function supabaseRoute(route, db) {
  if (db.down) return route.abort();
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const name = new URL(req.url()).pathname.split('/').pop(), args = req.postDataJSON() ?? {};
  db.calls.push({ name, args, at: Date.now() });
  const fn = Object.hasOwn(db.rpc, name) ? db.rpc[name] : null;
  // 本物（PostgREST）は int の引数に小数が来ると 400 で断るので、それもまねる
  // （null は「変えない」として通る）
  const badInt = ['p_time_ms', 'p_questions', 'p_lv', 'p_dungeons', 'p_floors', 'p_correct', 'p_total', 'p_badges', 'p_badges_total']
    .some(k => k in args && args[k] !== null && !Number.isInteger(args[k]));
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
export async function openApp(browser, { viewport = PHONE, supabase = 'fake', url = lastUrl, seed, reducedMotion, colorScheme, hasTouch, storage, blockScripts = [], init } = {}) {
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
  await page.goto(url);
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

// タイムアタック・今日の難問と、設定「正解したらすぐ次の問題へ」の練習・挑戦は、問題を出した直後（index.html の TA_GUARD_MS の間）のクリックを無視する。その間が過ぎるまで待つ
// （quick・timed が無い変更前のコードではタイムアタックだけ）
export const settle = page => page.waitForFunction(() => !(typeof quick === 'function' ? quick() : typeof timed === 'function' ? timed() : G.kind === 'ta') || performance.now() - G.shownAt >= TA_GUARD_MS);
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
