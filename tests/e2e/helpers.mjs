// ブラウザテストの共通部品。サイトをローカルで配信し、CDN と Supabase をテスト用に差し替える
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const MODULES = join(HERE, 'node_modules');
export const PHONE = { width: 390, height: 844 };
export const PC = { width: 1280, height: 800 };

// index.html が読む CDN のファイル → npm install した同じ版
const LIBS = {
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js': 'd3/dist/d3.min.js',
  'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js': 'topojson-client/dist/topojson-client.min.js',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };

let lastUrl;
// リポジトリ直下を配信する静的サーバー（空いているポートで立てる）
export async function startServer() {
  const server = createServer(async (req, res) => {
    const path = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    const file = path.endsWith(sep) ? join(path, 'index.html') : path;
    if (!file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  lastUrl = `http://127.0.0.1:${server.address().port}/`;
  return { url: lastUrl, close: () => new Promise(ok => server.close(ok)) };
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
  };
  // calls: 届いた RPC の記録 { name, args }。down を true にすると通信失敗になる
  return { rows, calls: [], down: false, rpc };
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
async function supabaseRoute(route, db) {
  if (db.down) return route.abort();
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const name = new URL(req.url()).pathname.split('/').pop(), args = req.postDataJSON() ?? {};
  db.calls.push({ name, args });
  const fn = Object.hasOwn(db.rpc, name) ? db.rpc[name] : null;
  // 本物（PostgREST）は int の引数に小数が来ると 400 で断るので、それもまねる
  const badInt = ['p_time_ms', 'p_questions'].some(k => k in args && !Number.isInteger(args[k]));
  if (!fn || badInt) return route.fulfill({ status: fn ? 400 : 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ message: 'fake supabase: bad request' }) });
  return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(fn(args)) });
}

// 新しいブラウザコンテキストでサイトを開く。supabase: 'fake'（偽DB）か 'down'（つながらない）
// 戻り値の db は偽DB（down を書き換えれば途中でつながる/切れるにできる）、errors はページで起きた例外、warnings は console.warn の文字
export async function openApp(browser, { viewport = PHONE, supabase = 'fake', url = lastUrl } = {}) {
  if (!url) throw new Error('startServer() を先に呼ぶか url を渡してね');
  const context = await browser.newContext({ viewport });
  context.setDefaultTimeout(5000); // 要素が出ないときは早めに落とす
  const db = fakeDb();
  db.down = supabase === 'down';
  const origin = new URL(url).origin;
  await context.route(u => u.origin !== origin, route => {
    const target = route.request().url();
    if (LIBS[target]) return route.fulfill({ path: join(MODULES, LIBS[target]), contentType: 'text/javascript; charset=utf-8' });
    if (new URL(target).hostname.endsWith('.supabase.co')) return supabaseRoute(route, db);
    return route.abort(); // フォントなどその他の外部通信はしない
  });
  const page = await context.newPage(), errors = [], warnings = [];
  page.on('pageerror', e => errors.push(e));
  page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
  await page.goto(url);
  return { page, context, db, errors, warnings, close: () => context.close() };
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

// いま出ている問題に正解／不正解で答える
export async function answerCorrect(page) {
  const a = await page.evaluate(() => G.cur.c.a);
  await page.click(`.choice[data-a="${a}"]`);
}
export async function answerWrong(page) {
  const a = await page.evaluate(() => G.cur.c.a);
  await page.locator(`.choice:not([data-a="${a}"])`).first().click();
}

// タイムアタックを最後までノーミスで解いて結果画面まで進める。opts は pickSetup と同じ（省略時は 国旗→国名・全世界・5問）
export async function clearTimeAttack(page, opts = {}) {
  await pickSetup(page, { mode: 'f2n', region: 'all', count: 5, ...opts, kind: 'ta' });
  await page.click('#start');
  const n = await page.evaluate(() => G.set.length);
  for (let i = 0; i < n; i++) await answerCorrect(page);
  await page.locator('#scr-result').waitFor();
}
