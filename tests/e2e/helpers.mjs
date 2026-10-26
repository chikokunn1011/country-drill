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
// テストで別のバッジが取れて画面が変わるなら、そのキーをここに足す
export const QUIET_BADGES = { v: 1, got: { 'first-clear@1': 1, 'ta-clear@1': 1, 'dopa-on@1': 1 }, eq: '', sn: { 'first-clear': 2, 'ta-clear': 2, 'dopa-on': 2 }, sent: [], tip: 3 };

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
// seed: Math.random を決まった列にする（mulberry32）。reducedMotion・colorScheme・hasTouch は newContext にそのまま渡す（hasTouch: true で (hover: none) and (pointer: coarse) になる）
// storage: ページのスクリプトより前に localStorage へ入れておく値（キー → JSON にする値）
// 戻り値の db は偽DB（down を書き換えれば途中でつながる/切れるにできる）、errors はページで起きた例外、warnings は console.warn の文字
export async function openApp(browser, { viewport = PHONE, supabase = 'fake', url = lastUrl, seed, reducedMotion, colorScheme, hasTouch, storage } = {}) {
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

// タイムアタックは問題を出した直後（index.html の TA_GUARD_MS の間）のクリックを無視する。その間が過ぎるまで待つ
export const settle = page => page.waitForFunction(() => G.kind !== 'ta' || performance.now() - G.shownAt >= TA_GUARD_MS);
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
