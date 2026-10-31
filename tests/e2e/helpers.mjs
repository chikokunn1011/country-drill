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

// 前の index.html（GEOM_BASE で比べる古いコミット）が読む CDN のファイル → npm install した同じ版。いまの index.html は vendor/ から読むので使わない
const LIBS = {
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js': 'd3/dist/d3.min.js',
  'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js': 'topojson-client/dist/topojson-client.min.js',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };

let lastUrl;
// リポジトリ直下（root を渡したらそのフォルダ）を配信する静的サーバー（空いているポートで立てる）
// root を渡したときは openApp の既定の url は変えない（変更前のコードと比べるときに使う）
// headers: どの返事にも足すヘッダー（{ 'cache-control': 'max-age=600' } で GitHub Pages のまねなど）。requests: 渡した配列に届いた URL（/ からのパスと ? 以下）を積む
export async function startServer({ root, headers = {}, requests } = {}) {
  const dir = root ? resolve(root) : ROOT;
  const server = createServer(async (req, res) => {
    requests?.push(req.url);
    const path = normalize(join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    const file = path.endsWith(sep) ? join(path, 'index.html') : path;
    if (!file.startsWith(dir + sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', ...headers }).end(body);
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
  // rpgRows の行は { token, profile_id, nickname, lv, dungeons, floors, deco, tower, tower_at, created_at, at }（deco は無くてもよい = 空、tower は無くてもよい = 0）
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
  // 塔: tower > 0 の人を、塔 → レベル → 塔を送った時刻の順に（行の tower は無くてもよい = 0、tower_at は塔を送った時刻）
  const towerAt = r => Date.parse(r.tower_at ?? r.at ?? r.created_at);
  const towerBests = () => rpgRows.filter(r => (r.tower ?? 0) > 0).sort((a, b) => b.tower - a.tower || b.lv - a.lv || towerAt(a) - towerAt(b));
  const towerRank = (tower, lv) => rpgRows.filter(r => (r.tower ?? 0) > tower || ((r.tower ?? 0) === tower && r.lv > lv)).length + 1;
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
        rpg: rpg ? { lv: rpg.lv, dungeons: rpg.dungeons, ...(rpg.tower > 0 ? { tower: rpg.tower } : {}) } : null, ta,
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
    // ---- 英雄の塔（rpg_set_tower2 / top_tower2 / rpg_tower_rank_of）。行が無ければ rpg_update2 と同じく作り（レベル1から）、塔は最高を残す ----
    rpg_set_tower2({ p_token, p_tower }) {
      if (!p_token) return { ok: false, reason: 'bad_token' };
      if (!Number.isInteger(p_tower) || p_tower < 0 || p_tower > 100000) return { ok: false, reason: 'bad_record' };
      const p = byToken(p_token);
      if (!p) return { ok: false, reason: 'not_found' };
      const at = new Date().toISOString();
      let r = rpgRows.find(r => r.profile_id === p.id);
      if (!r) rpgRows.push(r = { token: p.token, profile_id: p.id, nickname: p.nickname, lv: 1, dungeons: 0, floors: 0, deco: [], created_at: at, at });
      Object.assign(r, { tower: Math.max(r.tower ?? 0, p_tower), tower_at: at });
      return { ok: true, rank_tower: towerRank(r.tower, r.lv) };
    },
    top_tower2: () => towerBests().slice(0, 50).map(r => ({ ...shown(r), tower: r.tower, lv: r.lv, created_at: r.tower_at ?? r.at })),
    rpg_tower_rank_of: ({ p_tower, p_lv }) => ({ rank: towerRank(p_tower, p_lv) }),
    // ---- 前の版の関数。書きこみは old_version を返し、読むだけ・消すだけのものはそのまま（schema.sql の -- >>> old_version と同じ） ----
    submit_score: old, submit_daily: old, rpg_register: old, rpg_rename: old, rpg_update: old, rpg_set_deco: old, rpg_set_tower: old,
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
    // 前の版の塔のランキング（読むだけ。名前・かざりは rpg_players の行のもの）
    top_tower: () => towerBests().slice(0, 50).map(r => ({ nickname: r.nickname, tower: r.tower, lv: r.lv, deco: r.deco ?? [], created_at: r.tower_at ?? r.at })),
  };
  // calls: 届いた RPC の記録 { name, args, at }（at は届いた時刻 ms）。down を true にすると通信失敗になる
  const db = { profiles, transfers, rows, rpgRows, dailyRows, calls: [], down: false, rpc };
  addAdmin(db, { byId, nameProblem });
  return db;
}

// 管理ページ（admin.html）用: /auth/v1/token と supabase/admin.sql の admin_ 関数のまね。
// db.admin = { email, password, isAdmin }（isAdmin: false なら、ログインはできても admin_ 関数は 42501 で断る）。
// 行は rows（scores）・dailyRows・rpgRows をそのまま使い、id が無ければ振る。ゴミ箱は db.trash、操作の記録は db.adminLog。
// db.tokens: 出した access_token → { admin }。db.expireTokens() で今の合札を全部 401 にできる
// プロフィールにつながった行（profile_id がある）は admin.sql と同じく、一覧に pid・profile_nickname を足し、名前を変えるとプロフィールの名前が変わる
function addAdmin(db, { byId, nameProblem }) {
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
  // 一覧に出す形: プロフィールにつながった行には pid・profile_nickname を足す
  const withPf = (r, j) => { const p = byId(r.profile_id); return p ? { ...j, pid: p.pid, profile_nickname: p.nickname } : j; };
  const pfHit = (r, f, q) => { const p = byId(r.profile_id); return (f.pid == null || p?.pid === f.pid) && (lower(r.nickname).includes(q) || (!!p && lower(p.nickname).includes(q))); };
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
      if (p_kind === 'trash') list = db.trash.filter(t => !t.restored_at && pfHit(t.row_data, f, q)).sort(newer)
        .map(t => withPf(t.row_data, { ...structuredClone(t), row_data: out(t.row_data) }));
      else if (KIND[p_kind]) {
        list = KIND[p_kind].filter(r => pfHit(r, f, q));
        if (p_kind === 'scores') list = list.filter(r => (f.board == null || r.board === f.board) && (f.period !== 'week' || Date.parse(r.created_at) >= weekStart()));
        if (p_kind === 'daily' && f.day) list = list.filter(r => r.day === f.day);
        const cmp = { scores: (a, b) => a.time_ms - b.time_ms, daily: (a, b) => b.correct - a.correct || a.time_ms - b.time_ms, rpg: (a, b) => b.lv - a.lv || b.dungeons - a.dungeons || b.floors - a.floors }[p_kind];
        list = [...list].sort(best ? (a, b) => cmp(a, b) || -newer(a, b) : newer).map(r => withPf(r, out(r)));
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
      const p = byId(r.profile_id);
      if (p) {   // プロフィールの名前を変えて、表の名前もそろえる（ほかのプロフィールと同じ名前なら profile_name_taken）
        const bad = nameProblem(name, p);
        if (bad) return { ok: false, reason: bad === 'name_taken' ? 'profile_name_taken' : bad };
        const before = p.nickname; p.nickname = name;
        for (const x of Object.values(KIND).flat()) if (x.profile_id === p.id) x.nickname = name;
        log('rename', p_kind, { id: p_id, before, after: name, profile_id: p.id, pid: p.pid });
        return { ok: true, nickname: name, pid: p.pid };
      }
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
  // （null は「変えない」として通る）
  const badInt = ['p_time_ms', 'p_questions', 'p_lv', 'p_dungeons', 'p_floors', 'p_correct', 'p_total', 'p_tower', 'p_badges', 'p_badges_total']
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
// path: url からの相対で開くページ（'admin.html' など。省略時は url そのもの＝index.html）
// waitMap: 開いたあと、地図（world.js・d3・topojson をうしろで読む）が読み終わるまで待つ。mapReady が無いページ・古いコミットでは待たない
// routes: 開く前に context.route に渡す [url のパターン, ハンドラ] の並び（国旗・world.js を遅らせる・止めるときなど）
// serviceWorkers: newContext にそのまま渡す。既定は 'block'（sw.js が動くと、SW が取りに行く通信は context.route を通らない）。pwa.test.mjs だけ 'allow'
// locale: newContext にそのまま渡す（navigator.language）。既定は 'ja-JP'（日本語の端末。'en-US' などにするとホームに英語版への案内が出る）
// timezoneId: newContext にそのまま渡す（端末の時間帯。'America/New_York' など）。省略時は渡さない（このマシンの時間帯）
export async function openApp(browser, { viewport = PHONE, supabase = 'fake', url = lastUrl, path = '', seed, reducedMotion, colorScheme, hasTouch, storage, blockScripts = [], init, waitMap = true, routes = [], serviceWorkers = 'block', locale = 'ja-JP', timezoneId } = {}) {
  if (!url) throw new Error('startServer() を先に呼ぶか url を渡してね');
  const context = await browser.newContext({ viewport, reducedMotion, colorScheme, hasTouch, serviceWorkers, locale, ...(timezoneId ? { timezoneId } : {}) });
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
  for (const [pattern, handler] of routes) await context.route(pattern, handler);
  const page = await context.newPage(), errors = [], warnings = [], consoleErrors = [];
  page.on('pageerror', e => errors.push(e));
  page.on('console', m => {
    if (m.type() === 'warning') warnings.push(m.text());
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto(new URL(path, url).href);
  if (waitMap) await mapLoaded(page);
  return { page, context, db, errors, warnings, consoleErrors, close: () => context.close() };
}

// 地図（index.html が load のあとにうしろで読む）が読み終わるまで待つ。再読み込みのあとで、地図を使う画面へ進んですぐ中身を見るときに使う
// （mapReady が無いページ・古いコミットでは待たない）
export const mapLoaded = page => page.waitForFunction(() => typeof mapReady === 'undefined' || mapReady);

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
// （quick・timed が無い変更前のコードではタイムアタックだけ）。タイムアタック・今日の難問は1問目の前に国旗を読む「じゅんび中」があり、
// そのあいだ G.cur は null なので、まず問題が出る（G.cur があって #qcard .choices か白地図タップの #qcard .tapbox がある）まで待つ
export const settle = page => page.waitForFunction(() => G?.cur && document.querySelector('#qcard .choices, #qcard .tapbox')
  && (!(typeof quick === 'function' ? quick() : typeof timed === 'function' ? timed() : G.kind === 'ta') || performance.now() - G.shownAt >= TA_GUARD_MS));
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

// 白地図タップ（mode: 'tap'）の地図で、正解（right）か外れの点の画面の座標 { x, y }（整数）。ページの中で動かす（page.evaluate(tapPoint, right)）。
// Chromium のクリックの clientX/Y は整数なので、候補は画面の整数ピクセルに丸め、その点を layer.getScreenCTM() の逆で地図の座標に戻して
// （アプリの d3.pointer と同じ計算）、アプリと同じ r で tapJudge を見る。正解はその点と上下左右 1px の4点がどれも正解になる点だけ。
// 候補: c.ll・国の形の重心・国の範囲の 16×16 の格子、小さい国は国の画面の範囲を nearPx だけ広げた所の全ピクセル。無ければ国を真ん中に拡大してやり直す。
// 外れはその地域の国の ll を c.ll から遠い順に（その点と4点で 2r でも正解にならないもの）。どれも、その点で地図が押せる（上に何も無い）ものを選ぶ
export const tapPoint = right => {
  const c = G.cur.c, proj = G.cur.proj, ll = x => [x.ll[1], x.ll[0]], svg = document.querySelector('#qcard .tapmap');
  const box = svg.closest('.tapbox'), layer = svg.querySelector('.layer'), f = featOf(c);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const find = () => {
    const m = layer.getScreenCTM(), inv = m.inverse();
    const R = TAP.nearPx * W / svg.getBoundingClientRect().width / d3.zoomTransform(svg).k;   // アプリと同じ r
    const screen = ([x, y]) => [Math.round(m.a * x + m.c * y + m.e), Math.round(m.b * x + m.d * y + m.f)];
    const toLayer = (X, Y) => [inv.a * X + inv.c * Y + inv.e, inv.b * X + inv.d * Y + inv.f];
    const hit = (X, Y) => { const el = document.elementFromPoint(X, Y); return el && svg.contains(el) ? el : null; };
    if (right) {
      const okAt = (X, Y) => tapJudge(c, toLayer(X, Y), R);
      const q = proj(ll(c)), cand = [];
      if (q) cand.push(q);
      let bounds = q ? [q, q] : null;
      if (f) {
        cand.push(proj(d3.geoCentroid(f)));
        bounds = d3.geoPath(proj).bounds(f);
        const [[x0, y0], [x1, y1]] = bounds;
        for (let i = 1; i < 16; i++) for (let j = 1; j < 16; j++) cand.push([x0 + (x1 - x0) * i / 16, y0 + (y1 - y0) * j / 16]);
      }
      const pix = cand.filter(Boolean).map(screen);
      if (bounds) {
        const [a0, b0] = screen(bounds[0]), [a1, b1] = screen(bounds[1]), e = TAP.nearPx;
        if ((a1 - a0) * (b1 - b0) <= 40 * 40)
          for (let X = a0 - e; X <= a1 + e; X++) for (let Y = b0 - e; Y <= b1 + e; Y++) pix.push([X, Y]);
      }
      return pix.find(([X, Y]) => hit(X, Y) && okAt(X, Y) && N4.every(([dx, dy]) => okAt(X + dx, Y + dy))) ?? null;
    }
    const far = poolFor(G.region).filter(x => x !== c).sort((a, b) => d3.geoDistance(ll(b), ll(c)) - d3.geoDistance(ll(a), ll(c)));
    const miss = (X, Y) => !tapJudge(c, toLayer(X, Y), R * 2);
    const pts = far.map(x => proj(ll(x))).filter(Boolean).map(screen).filter(([X, Y]) => miss(X, Y) && N4.every(([dx, dy]) => miss(X + dx, Y + dy)));
    return pts.find(([X, Y]) => hit(X, Y)?.closest('[data-a]')?.dataset.a !== c.a && hit(X, Y)) ?? pts[0] ?? null;
  };
  let p = find();
  // 正解の点が無い（小さい国・島々）ときは、国を真ん中にして拡大してやり直す（zoomTo はアニメーションなしで、すぐ変わる）
  for (let k = d3.zoomTransform(svg).k * 2; !p && right && k <= 24; k *= 2) {
    const q = f ? d3.geoPath(proj).centroid(f) : proj(ll(c));
    box.zoomTo(d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-q[0], -q[1]));
    p = find();
  }
  if (!p) throw new Error(`tapPoint: ${right ? '正解' : '外れ'}の点が無い（${c.a}）`);
  return { x: p[0], y: p[1] };
};
// いまの白地図タップの問題に、正解（right）か外れの所をタップして答える
export async function answerTap(page, { right = true } = {}) {
  await settle(page);
  await page.locator('#qcard .tapbox').scrollIntoViewIfNeeded();
  const { x, y } = await page.evaluate(tapPoint, right);
  await page.mouse.click(x, y);
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

// 英語版（PR5）: 見えている日本語の一覧。見えている要素（checkVisibility()）の文字と、aria-label・title・alt・placeholder・
// value（ボタン）、::before・::after の content、document.title のうち JA_RE に当たるもの。lang="ja" の要素（言語の切りかえの「日本語」）と、
// data-ugc の要素（PR6: ほかの人が入れた文字＝ニックネーム。訳さない）の中は除く
export const jaLeft = async page => {
  const { JA_RE } = await import('../../tools/i18n_scan.mjs');
  return page.evaluate(([src, flags]) => {
    const re = new RegExp(src, flags), out = [];
    const shown = el => el && el.checkVisibility({ visibilityProperty: true }) && !el.closest('[lang="ja"], [data-ugc]');
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) if (re.test(n.data) && shown(n.parentElement)) out.push(n.data.trim());
    for (const el of document.body.querySelectorAll('*')) {
      if (!shown(el)) continue;
      for (const a of ['aria-label', 'title', 'alt', 'placeholder']) { const v = el.getAttribute(a); if (v && re.test(v)) out.push(`[${a}] ${v}`); }
      if ((el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && /^(button|submit|reset)$/.test(el.type))) && re.test(el.value ?? '')) out.push(`[value] ${el.value}`);
      // CSS の content: で出す字（::before / ::after）。T() も辞書も通らないので、ここで見る
      for (const ps of ['::before', '::after']) { const cs = getComputedStyle(el, ps), c = cs.content; if (cs.display !== 'none' && c && c !== 'none' && c !== 'normal' && re.test(c)) out.push(`[${ps}] ${c}`); }
    }
    if (re.test(document.title)) out.push(`[title] ${document.title}`);
    return out;
  }, [JA_RE.source, JA_RE.flags]);
};
