// 管理ページ（admin.html）の「ランキング」「ログ」タブ: ログイン・件数・一覧・消す/戻す・名前を変える・CSV・エラー記録。
// Supabase は helpers.mjs の偽DB（/auth/v1/token と admin_ 関数のまね）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, openApp, PHONE, PC } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const XSS = '<img src=x onerror="window.__xss=1">';
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
// 偽DBに入れておく記録（id は偽DBが振る）
const seed = db => {
  db.rows.push({ board: 'f2n:all:10', nickname: 'たろう', time_ms: 12345, questions: 10, created_at: ago(1) },
    { board: 'f2n:asia:5', nickname: 'はなこ', time_ms: 9000, questions: 5, created_at: ago(30) });
  db.dailyRows.push({ day: '2026-10-27', nickname: 'じろう', correct: 18, total: 20, time_ms: 60000, created_at: ago(20) });
  db.rpgRows.push({ token: 'tk', nickname: 'ゆうしゃ', lv: 12, dungeons: 3, floors: 17, deco: [], created_at: ago(50), at: ago(2) });
};
const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { path: 'admin.html', ...opts });
  if (opts.seed !== false) seed(app.db);
  try {
    await fn(app.page, app);
    if (!opts.allowErrors) assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const rankTab = page => page.click('#adm-tabs [data-tab="rank"]');
async function login(page, { email = 'admin@example.com', password = 'pass-1234', wait = true } = {}) {
  await rankTab(page);
  await page.fill('#r-email', email);
  await page.fill('#r-pass', password);
  await page.click('#r-login-btn');
  if (wait) await page.locator('#r-dash').waitFor();
}
const rows = page => page.locator('#r-table tbody tr[data-id]');
const kind = async (page, k) => { await page.click(`#r-kind [data-kind="${k}"]`); await page.locator(`#r-table[data-kind="${k}"][data-ready]`).waitFor(); };

t('login_wrong_password_message', async page => {
  await login(page, { password: 'nope', wait: false });
  await page.locator('#r-login-msg', { hasText: 'メールかパスワードがちがうよ' }).waitFor();
  assert.equal(await page.isHidden('#r-dash'), true);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('adminAuth')), null);
});

t('login_not_admin_message', async (page, { db }) => {
  db.admin.isAdmin = false;
  await login(page, { wait: false });
  await page.locator('#r-login-msg', { hasText: 'このアカウントは管理者じゃないよ' }).waitFor();
  assert.equal(await page.isHidden('#r-dash'), true);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('adminAuth')), null);
});

t('login_network_message', async (page, { db }) => {
  db.down = true;
  await login(page, { wait: false });
  await page.locator('#r-login-msg', { hasText: 'つながらなかった' }).waitFor();
});

t('login_shows_dashboard_counts', async page => {
  await login(page);
  await page.locator('#r-dash [data-n="scores"]', { hasText: '2' }).waitFor();
  assert.equal((await page.textContent('#r-dash [data-n="daily"]')).trim(), '1');
  assert.equal((await page.textContent('#r-dash [data-n="rpg"]')).trim(), '1');
  assert.match(await page.textContent('#r-stale'), /最後の記録から 0日（Supabase は7日アクセスが無いと止まる。見るだけでもアクセスなので、これは記録から数えた目安）/);
  assert.match(await page.textContent('#r-dash [data-sub="rpg"]'), /^今日 \d+・今週 \d+（登録）$/);
  assert.equal(await page.evaluate(() => document.getElementById('r-stale').classList.contains('warn')), false);
  assert.equal((await page.textContent('#adm-who')).trim(), 'admin@example.com');
  assert.equal(await page.isVisible('#adm-logout'), true);
  // 一覧（最初は scores）
  await page.locator('#r-table[data-kind="scores"][data-ready]').waitFor();
  assert.equal(await rows(page).count(), 2);
  // board の select は admin_boards から
  const boards = await page.$$eval('#r-f-board option', o => o.map(x => x.value));
  assert.deepEqual(boards, ['', 'f2n:all:10', 'f2n:asia:5']);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, '横にスクロールしない');
  // ログアウト
  await page.click('#adm-logout');
  await page.locator('#r-login').waitFor();
  assert.equal((await page.textContent('#adm-who')).trim(), 'ログインしてない');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('adminAuth')), null);
});

t('stale_warning_after_5_days', async (page, { db }) => {
  for (const r of [...db.rows, ...db.dailyRows]) r.created_at = ago(24 * 6);
  db.rpgRows[0].created_at = db.rpgRows[0].at = ago(24 * 6);
  await login(page);
  await page.locator('#r-stale', { hasText: '最後の記録から 6日' }).waitFor();
  assert.equal(await page.evaluate(() => document.getElementById('r-stale').classList.contains('warn')), true);
});

t('list_delete_restore', async (page, { db }) => {
  page.on('dialog', d => d.accept());
  await login(page);
  await kind(page, 'scores');
  assert.equal(await rows(page).count(), 2);
  await page.locator('#r-table tbody tr', { hasText: 'たろう' }).locator('input[data-pick]').check();
  await page.click('#r-del');
  await page.locator('#r-table[data-ready] tbody tr[data-id]').first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll('#r-table tbody tr[data-id]').length === 1);
  assert.deepEqual(db.rows.map(r => r.nickname), ['はなこ']);
  // ゴミ箱で戻す
  await kind(page, 'trash');
  assert.equal(await rows(page).count(), 1);
  assert.match(await page.textContent('#r-table tbody'), /たろう/);
  assert.equal(await page.isVisible('#r-restore'), true);
  assert.equal(await page.isHidden('#r-del'), true);
  await rows(page).first().locator('input[data-pick]').check();
  await page.click('#r-restore');
  await page.locator('#adm-toast', { hasText: '1件戻したよ' }).waitFor();
  await kind(page, 'scores');
  assert.equal(await rows(page).count(), 2);
  assert.equal(db.rows.length, 2);
  // 操作は最近の操作に出る
  await page.locator('#r-recent li', { hasText: '戻す' }).waitFor();
});

t('delete_cancel_keeps_rows', async (page, { db }) => {
  page.on('dialog', d => d.dismiss());
  await login(page);
  await kind(page, 'scores');
  await rows(page).first().locator('input[data-pick]').check();
  await page.click('#r-del');
  await page.waitForTimeout(200);
  assert.equal(db.rows.length, 2);
  assert.equal(db.calls.some(c => c.name === 'admin_delete'), false);
});

t('rename_to_anonymous', async (page, { db }) => {
  let shown;
  page.on('dialog', d => { shown = d.defaultValue(); d.accept(''); });
  await login(page);
  await kind(page, 'scores');
  await page.locator('#r-table tbody tr', { hasText: 'たろう' }).locator('[data-rename]').click();
  await page.locator('#r-table tbody tr', { hasText: '名無しの旅人' }).waitFor();
  assert.equal(shown, 'たろう');
  assert.match(db.rows.find(r => r.time_ms === 12345).nickname, /^名無しの旅人\d{3}$/);
  assert.deepEqual(db.calls.find(c => c.name === 'admin_rename').args.p_name, null);
});

t('rename_rpg_name_taken', async (page, { db }) => {
  db.rpgRows.push({ token: 'tk2', nickname: 'まおう', lv: 1, dungeons: 0, floors: 0, created_at: ago(3), at: ago(3) });
  page.on('dialog', d => d.accept('まおう'));
  await login(page);
  await kind(page, 'rpg');
  await page.locator('#r-table tbody tr', { hasText: 'ゆうしゃ' }).locator('[data-rename]').click();
  await page.locator('#adm-toast', { hasText: 'その名前はもう使われてるよ' }).waitFor();
});

t('rpg_list_shows_tower', async (page, { db }) => {
  db.rpgRows[0].tower = 23;
  await login(page);
  await kind(page, 'rpg');
  const heads = await page.locator('#r-table thead th').allTextContents();
  const i = heads.indexOf('塔');
  assert.ok(i >= 0, heads.join(','));
  const row = page.locator('#r-table tbody tr', { hasText: 'ゆうしゃ' });
  assert.equal((await row.locator('td').nth(i).textContent()).trim(), '23');
});

t('xss_name_is_text', async (page, { db }) => {
  db.rows.push({ board: XSS, nickname: XSS, time_ms: 5000, questions: 5, created_at: ago(0.5) });
  await login(page);
  await kind(page, 'scores');
  const row = page.locator('#r-table tbody tr', { hasText: XSS });
  assert.equal(await row.count(), 1);
  assert.equal(await page.locator('#r-table img').count(), 0);
  assert.equal(await page.locator('#r-f-board img').count(), 0);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
}, { colorScheme: 'light' });

t('session_not_in_localstorage', async page => {
  await login(page);
  const local = await page.evaluate(() => Object.keys(localStorage).map(k => localStorage.getItem(k)).join('\n'));
  assert.doesNotMatch(local, /fake-access|fake-refresh|access_token/);
  const s = JSON.parse(await page.evaluate(() => sessionStorage.getItem('adminAuth')));
  assert.match(s.access_token, /^fake-access-/);
  // 読み込み直してもログインしたまま（sessionStorage）
  await page.reload();
  await rankTab(page);
  await page.locator('#r-dash').waitFor();
});

t('relogin_when_session_dies', async (page, { db }) => {
  await login(page);
  await page.locator('#r-table[data-ready]').waitFor();
  db.expireTokens(); db.refresh.clear();
  await page.click('#r-reload');
  await page.locator('#r-login-msg', { hasText: 'ログインし直してね' }).waitFor();
  assert.equal(await page.isHidden('#r-dash'), true);
  assert.equal((await page.textContent('#adm-who')).trim(), 'ログインしてない');
});

t('filters_and_paging', async (page, { db }) => {
  for (let i = 0; i < 120; i++) db.rows.push({ board: 'n2f:all:5', nickname: `p${i}`, time_ms: 10000 + i, questions: 5, created_at: ago(40 + i) });
  await login(page);
  await kind(page, 'scores');
  assert.equal(await rows(page).count(), 100);
  assert.match(await page.textContent('#r-page'), /1〜100 \/ 122/);
  await page.click('#r-next');
  await page.waitForFunction(() => document.querySelectorAll('#r-table tbody tr[data-id]').length === 22);
  await page.click('#r-prev');
  await page.waitForFunction(() => document.querySelectorAll('#r-table tbody tr[data-id]').length === 100);
  await page.fill('#r-f-q', 'たろ');
  await page.click('#r-search');
  await page.waitForFunction(() => document.querySelectorAll('#r-table tbody tr[data-id]').length === 1);
  const last = db.calls.filter(c => c.name === 'admin_list').at(-1).args;
  assert.equal(last.p_filter.q, 'たろ');
  assert.equal(last.p_filter.offset, 0);
  // board で絞る
  await page.fill('#r-f-q', '');
  await page.selectOption('#r-f-board', 'f2n:asia:5');
  // 前の検索（たろう）も1行なので、行数ではなく中身が入れかわるのを待つ
  await page.waitForFunction(() => /はなこ/.test(document.querySelector('#r-table tbody')?.textContent ?? ''));
  assert.equal(await rows(page).count(), 1);
  // daily は日付の欄、scores の board は隠れる
  await kind(page, 'daily');
  assert.equal(await page.isVisible('#r-f-day'), true);
  assert.equal(await page.isHidden('#r-f-board'), true);
});

t('csv_download_name', async page => {
  await login(page);
  await kind(page, 'scores');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#r-csv')]);
  assert.match(dl.suggestedFilename(), /^country-drill-scores-\d{8}\.csv$/);
  const buf = await new Promise((ok, ng) => { const cs = []; dl.createReadStream().then(s => s.on('data', c => cs.push(c)).on('end', () => ok(Buffer.concat(cs))).on('error', ng)); });
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = buf.subarray(3).toString('utf8');
  assert.match(text.split('\r\n')[0], /^id,board,nickname/);
  assert.match(text, /たろう/);
  assert.match(text, /はなこ/);
});

t('csv_neutralizes_formulas', async (page, { db }) => {
  db.rows.push({ board: 'f2n:all:5', nickname: '=HYPERLINK("x")', time_ms: 1, questions: 5, created_at: ago(0.1) });
  await login(page);
  await kind(page, 'scores');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#r-csv')]);
  const text = await new Promise((ok, ng) => { const cs = []; dl.createReadStream().then(s => s.on('data', c => cs.push(c)).on('end', () => ok(Buffer.concat(cs).toString())).on('error', ng)); });
  assert.match(text, /"'=HYPERLINK\(""x""\)"/);
});

t('ops_log_tab', async (page, { db }) => {
  page.on('dialog', d => d.accept());
  await page.click('#adm-tabs [data-tab="log"]');
  await page.locator('#l-ops', { hasText: 'ログインすると見られるよ' }).waitFor();
  await login(page);
  await kind(page, 'scores');
  await rows(page).first().locator('input[data-pick]').check();
  await page.click('#r-del');
  await page.waitForFunction(() => document.querySelectorAll('#r-table tbody tr[data-id]').length === 1);
  await page.click('#adm-tabs [data-tab="log"]');
  await page.locator('#l-ops-table tbody tr', { hasText: '消す' }).waitFor();
  assert.equal(db.adminLog.length, 1);
});

// 種類を切りかえて一覧が読めなかったら、前の種類の行は消え、名前を変える・消す・CSV は何もしない（ちがう表の同じ id にさわらない）
t('kind_switch_with_failing_list_leaves_no_stale_rows', async (page, { db }) => {
  page.on('dialog', d => d.accept('べつの名前'));
  await login(page);
  await kind(page, 'scores');
  assert.equal(await rows(page).count(), 2);
  await rows(page).first().locator('input[data-pick]').check();
  db.down = true;
  await page.click('#r-kind [data-kind="rpg"]');
  await page.locator('#adm-toast', { hasText: 'つながらなかった' }).waitFor();
  db.down = false;
  assert.equal(await rows(page).count(), 0, '前の種類の行は残さない');
  assert.equal(await page.locator('#r-table [data-rename], #r-table [data-nameless], #r-table [data-byname]').count(), 0);
  assert.equal(await page.isDisabled('#r-del'), true);
  assert.equal(await page.isDisabled('#r-csv'), true);
  const before = db.calls.length;
  // ボタンが押せなくても、無理に押したとき（click を直接呼ぶ）も何もしない
  await page.evaluate(() => { document.getElementById('r-del').disabled = false; document.getElementById('r-del').click(); document.getElementById('r-csv').disabled = false; document.getElementById('r-csv').click(); });
  await page.waitForTimeout(300);
  assert.deepEqual(db.calls.slice(before).map(c => c.name), []);
  assert.equal(db.rows.length, 2);
  assert.deepEqual(db.rpgRows.map(r => r.nickname), ['ゆうしゃ']);
  assert.equal(db.calls.some(c => c.name === 'admin_rename' || c.name === 'admin_delete'), false);
  // つながったら、新しい種類の一覧が出て、また押せる
  await page.click('#r-reload');
  await page.locator('#r-table[data-kind="rpg"][data-ready]').waitFor();
  assert.equal(await rows(page).count(), 1);
  assert.equal(await page.isDisabled('#r-del'), false);
});

t('kind_switch_in_flight_refuses_actions', async (page, { db }) => {
  await login(page);
  await kind(page, 'scores');
  // admin_list の返事を遅らせる
  let release;
  const gate = new Promise(ok => { release = ok; });
  const orig = db.adminRpc.admin_list;
  db.adminRpc.admin_list = args => args.p_kind === 'rpg' ? gate.then(() => orig(args)) : orig(args);
  await page.click('#r-kind [data-kind="rpg"]');
  await page.waitForTimeout(150);
  assert.equal(await rows(page).count(), 0);
  assert.equal(await page.isDisabled('#r-del'), true);
  release();
  await page.locator('#r-table[data-kind="rpg"][data-ready]').waitFor();
  assert.equal(await page.isDisabled('#r-del'), false);
});

t('login_rate_limited_message', async (page, { db }) => {
  db.auth = () => [429, { code: 'over_request_rate_limit', msg: 'Request rate limit reached' }];
  await login(page, { wait: false });
  await page.locator('#r-login-msg', { hasText: 'ログインを試しすぎ。少し待ってね' }).waitFor();
});

t('pager_stays_when_page_load_fails', async (page, { db }) => {
  for (let i = 0; i < 250; i++) db.rows.push({ board: 'n2f:all:5', nickname: `p${i}`, time_ms: 10000 + i, questions: 5, created_at: ago(40 + i) });
  await login(page);
  await kind(page, 'scores');
  db.down = true;
  await page.click('#r-next');
  await page.locator('#adm-toast', { hasText: 'つながらなかった' }).waitFor();
  db.down = false;
  assert.match(await page.textContent('#r-page'), /^1〜100 \/ 252$/);
  await page.click('#r-next');
  await page.locator('#r-page', { hasText: '101〜200 / 252' }).waitFor();
  assert.equal(db.calls.filter(c => c.name === 'admin_list').at(-1).args.p_filter.offset, 100);
});

t('logout_clears_server_rows_from_page', async page => {
  page.on('dialog', d => d.accept());
  await login(page);
  await kind(page, 'scores');
  await rows(page).first().locator('[data-nameless]').click();
  await page.locator('#r-recent li', { hasText: '名前を変える' }).waitFor();
  await page.click('#adm-logout');
  await page.locator('#r-login').waitFor();
  const text = await page.evaluate(() => document.body.textContent);
  assert.doesNotMatch(text, /たろう|はなこ|名無しの旅人/);
  assert.equal(await page.locator('#r-table tbody tr').count(), 0);
  assert.equal(await page.locator('#r-recent li').count(), 0);
  assert.equal((await page.textContent('#r-dash [data-n="scores"]')).trim(), '–');
});

t('nameless_button_one_tap', async (page, { db }) => {
  let msg;
  page.on('dialog', d => { msg = d.message(); d.accept(); });
  await login(page);
  await kind(page, 'scores');
  await page.locator('#r-table tbody tr', { hasText: 'たろう' }).locator('[data-nameless]').click();
  await page.locator('#r-table tbody tr', { hasText: '名無しの旅人' }).waitFor();
  assert.match(msg, /タイムアタックの id \d+「たろう」を「名無しの旅人」＋数字にしていい？/);
  assert.equal(db.calls.find(c => c.name === 'admin_rename').args.p_name, null);
});

t('delete_all_records_with_this_name', async (page, { db }) => {
  let msg;
  page.on('dialog', d => { msg = d.message(); d.accept(); });
  for (let i = 0; i < 130; i++) db.rows.push({ board: 'n2f:all:5', nickname: i % 2 ? 'たろう' : 'たろうX', time_ms: 10000 + i, questions: 5, created_at: ago(40 + i) });
  db.dailyRows.push({ day: '2026-10-26', nickname: 'ﾀﾛｳ', correct: 1, total: 20, time_ms: 1, created_at: ago(3) },
    { day: '2026-10-26', nickname: 'たろう', correct: 2, total: 20, time_ms: 2, created_at: ago(4) });
  db.rpgRows.push({ token: 'tk3', nickname: 'たろう', lv: 1, dungeons: 0, floors: 0, created_at: ago(5), at: ago(5) });
  await login(page);
  await kind(page, 'scores');
  const row = page.locator('#r-table tbody tr').filter({ has: page.locator('td.name', { hasText: /^たろう$/ }) }).first();
  await row.locator('[data-byname]').click();
  await page.locator('#adm-toast', { hasText: '「たろう」の記録を 68件消したよ' }).waitFor();
  assert.match(msg, /タイムアタック 66件・今日の難問 1件・冒険 1件、合わせて 68件/);
  assert.equal(db.rows.filter(r => r.nickname === 'たろう').length, 0);
  assert.equal(db.rows.filter(r => r.nickname === 'たろうX').length, 65, '部分一致の別の名前は消さない');
  assert.deepEqual(db.dailyRows.map(r => r.nickname).sort(), ['ﾀﾛｳ', 'じろう'].sort(), 'ひらがなとカタカナは別の名前');
  assert.deepEqual(db.rpgRows.map(r => r.nickname), ['ゆうしゃ']);
  assert.equal(db.trash.length, 68);
});

t('delete_all_by_name_cancel_deletes_nothing', async (page, { db }) => {
  page.on('dialog', d => d.dismiss());
  await login(page);
  await kind(page, 'scores');
  await page.locator('#r-table tbody tr', { hasText: 'たろう' }).locator('[data-byname]').click();
  await page.waitForTimeout(400);
  assert.equal(db.calls.some(c => c.name === 'admin_delete'), false);
  assert.equal(db.rows.length, 2);
});

// 出た知らせ（#adm-toast）を全部ためておく（上書きされた知らせも分かるように）
const watchToasts = page => page.evaluate(() => {
  window.__toasts = [];
  const t = document.getElementById('adm-toast');
  new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true });
});
const csvText = async page => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#r-csv')]);
  return new Promise((ok, ng) => { const cs = []; dl.createReadStream().then(s => s.on('data', c => cs.push(c)).on('end', () => ok(Buffer.concat(cs).toString())).on('error', ng)); });
};
const tbodyHas = (page, re) => page.waitForFunction(src => new RegExp(src).test(document.querySelector('#r-table tbody')?.textContent ?? ''), re.source);
const tbodyLacks = (page, re) => page.waitForFunction(src => !new RegExp(src).test(document.querySelector('#r-table tbody')?.textContent ?? ''), re.source);

// 途中で消せなくなったら、成功の知らせで上書きせず1つの知らせにまとめ、一覧を読み直す
t('delete_all_by_name_partial_failure_one_message', async (page, { db }) => {
  page.on('dialog', d => d.accept());
  db.dailyRows.push({ day: '2026-10-26', nickname: 'たろう', correct: 2, total: 20, time_ms: 2, created_at: ago(4) });
  db.rpgRows.push({ token: 'tk3', nickname: 'たろう', lv: 1, dungeons: 0, floors: 0, created_at: ago(5), at: ago(5) });
  const orig = db.adminRpc.admin_delete;
  db.adminRpc.admin_delete = args => args.p_kind === 'daily' ? { ok: false, reason: 'boom' } : orig(args);
  await login(page);
  await kind(page, 'scores');
  await watchToasts(page);
  await page.locator('#r-table tbody tr', { hasText: 'たろう' }).locator('[data-byname]').click();
  await page.locator('#adm-toast', { hasText: '1件消したけど、途中で止まった（残りは消してない）' }).waitFor();
  // 一覧と件数は読み直す
  await tbodyLacks(page, /たろう/);
  await page.locator('#r-table[data-kind="scores"][data-ready]').waitFor();
  await page.locator('#r-dash [data-n="scores"]', { hasText: /^1$/ }).waitFor();
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => window.__toasts), ['1件消したけど、途中で止まった（残りは消してない）']);
  assert.equal(db.rows.some(r => r.nickname === 'たろう'), false);
  assert.equal(db.dailyRows.some(r => r.nickname === 'たろう'), true);
  assert.equal(db.rpgRows.some(r => r.nickname === 'たろう'), true, '止まったあとの種類は消さない');
  assert.deepEqual(db.calls.filter(c => c.name === 'admin_delete').map(c => c.args.p_kind), ['scores', 'daily']);
});

// 候補（名前にその文字を含む記録）が一度に集められる数（5000件）をこえたら、一部だけ消さずにやめる
t('delete_all_by_name_refuses_when_too_many_candidates', async (page, { db }) => {
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  for (let i = 0; i < 5001; i++) db.rows.push({ board: 'n2f:all:5', nickname: 'たろう', time_ms: 20000 + i, questions: 5, created_at: ago(40 + i / 100) });
  await login(page);
  await kind(page, 'scores');
  await page.locator('#r-table tbody tr', { hasText: 'たろう' }).first().locator('[data-byname]').click();
  await page.locator('#adm-toast', { hasText: 'タイムアタックで名前に「たろう」を含む記録が 5002件あって、一度に集められる 5000件をこえるので、やめておいた。何も消してない' }).waitFor();
  assert.deepEqual(dialogs, [], '確かめる前にやめる（「全部」と言わない）');
  assert.equal(db.calls.some(c => c.name === 'admin_delete'), false);
  assert.equal(db.rows.length, 5003);
});

// 確かめる文に出す名前は、改行・タブを空白にする
t('delete_all_by_name_confirm_flattens_newlines', async (page, { db }) => {
  let msg;
  page.on('dialog', d => { msg = d.message(); d.accept(); });
  db.rows.push({ board: 'f2n:all:5', nickname: 'き\nけ\tん\rだ', time_ms: 5000, questions: 5, created_at: ago(0.5) });
  await login(page);
  await kind(page, 'scores');
  await page.locator('#r-table tbody tr', { hasText: 'け' }).locator('[data-byname]').click();
  await page.locator('#adm-toast', { hasText: '「き け ん だ」の記録を 1件消したよ' }).waitFor();
  assert.deepEqual(msg.split('\n'), ['「き け ん だ」の記録を全部（タイムアタック 1件、合わせて 1件）消していい？', '（全部のページから同じ名前のものを集めたよ。ゴミ箱に30日のこる）']);
  assert.equal(db.rows.some(r => r.nickname.startsWith('き')), false);
});

// CSV は今出ている一覧を作った絞りこみで作る（欄に書いただけで探していない値は使わない）
t('csv_uses_filter_of_shown_list', async (page, { db }) => {
  await login(page);
  await kind(page, 'scores');
  await page.fill('#r-f-q', 'たろ');   // 探すボタンはまだ押さない
  let text = await csvText(page);
  assert.match(text, /たろう/);
  assert.match(text, /はなこ/);
  assert.equal(db.calls.filter(c => c.name === 'admin_list').at(-1).args.p_filter.q, '');
  await page.click('#r-search');
  await tbodyLacks(page, /はなこ/);
  await page.locator('#r-table[data-ready]').waitFor();
  await page.fill('#r-f-q', 'はな');
  text = await csvText(page);
  assert.match(text, /たろう/);
  assert.doesNotMatch(text, /はなこ/);
  assert.equal(db.calls.filter(c => c.name === 'admin_list').at(-1).args.p_filter.q, 'たろ');
});

// 絞りこみ（名前・日付）を変えて読めなかったら、前の絞りこみの行（とその日の問題）を消して、もう一回押してねと出す
t('failed_filter_reload_clears_stale_rows', async (page, { db }) => {
  const FAIL = '読みこめなかった。もう一回押してね';
  await login(page);
  await kind(page, 'scores');
  await page.fill('#r-f-q', 'たろ');
  await page.click('#r-search');
  await tbodyLacks(page, /はなこ/);
  await page.locator('#r-table[data-ready]').waitFor();
  db.down = true;
  await page.fill('#r-f-q', 'はな');
  await page.click('#r-search');
  await page.locator('#r-table tbody td', { hasText: FAIL }).waitFor();
  assert.equal(await rows(page).count(), 0);
  assert.doesNotMatch(await page.textContent('#r-table'), /たろう/);
  assert.equal(await page.isDisabled('#r-del'), true);
  assert.equal(await page.isDisabled('#r-csv'), true);
  assert.equal((await page.textContent('#r-page')).trim(), '');
  db.down = false;
  await page.click('#r-search');
  await tbodyHas(page, /はなこ/);
  await page.locator('#r-table[data-ready]').waitFor();
  assert.equal(await rows(page).count(), 1);
  // 今日の難問: 日付を変えて読めなかったら、前の日の行とその日の問題も消す
  await page.fill('#r-f-q', '');
  await kind(page, 'daily');
  await page.fill('#r-f-day', '2026-10-27');
  await page.dispatchEvent('#r-f-day', 'change');
  await page.locator('#r-daily-qs:not([hidden])').waitFor();
  await tbodyHas(page, /じろう/);
  db.down = true;
  await page.fill('#r-f-day', '2026-10-26');
  await page.dispatchEvent('#r-f-day', 'change');
  await page.locator('#r-table tbody td', { hasText: FAIL }).waitFor();
  assert.equal(await rows(page).count(), 0);
  assert.equal(await page.isHidden('#r-daily-qs'), true);
  assert.equal(await page.locator('#r-daily-qs-list li').count(), 0);
  db.down = false;
  // 同じ絞りこみでページを動かす・読み直すだけなら、出ている行は残す（pager_stays_when_page_load_fails も）
  await page.fill('#r-f-day', '2026-10-27');
  await page.dispatchEvent('#r-f-day', 'change');
  await tbodyHas(page, /じろう/);
  await page.locator('#r-table[data-ready]').waitFor();
  db.down = true;
  await page.click('#r-reload');
  await page.locator('#adm-toast', { hasText: 'つながらなかった' }).waitFor();
  await page.waitForTimeout(200);
  assert.equal(await rows(page).count(), 1);
  assert.equal(await page.isHidden('#r-daily-qs'), false);
});

t('csv_has_all_pages', async (page, { db }) => {
  for (let i = 0; i < 650; i++) db.rows.push({ board: 'n2f:all:5', nickname: `p${i}`, time_ms: 10000 + i, questions: 5, created_at: ago(40 + i) });
  await login(page);
  await kind(page, 'scores');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#r-csv')]);
  const text = await new Promise((ok, ng) => { const cs = []; dl.createReadStream().then(s => s.on('data', c => cs.push(c)).on('end', () => ok(Buffer.concat(cs).toString())).on('error', ng)); });
  assert.equal(text.trim().split('\r\n').length, 1 + 652);
  assert.match(text, /p649/);
  assert.deepEqual(db.calls.filter(c => c.name === 'admin_list').slice(-2).map(c => [c.args.p_filter.offset, c.args.p_filter.limit]), [[0, 500], [500, 500]]);
});

t('select_all_box_follows_rows', async page => {
  await login(page);
  await kind(page, 'scores');
  await page.check('#r-pick-all');
  await rows(page).first().locator('input[data-pick]').uncheck();
  assert.deepEqual(await page.evaluate(() => { const a = document.getElementById('r-pick-all'); return [a.checked, a.indeterminate]; }), [false, true]);
  await rows(page).first().locator('input[data-pick]').check();
  assert.deepEqual(await page.evaluate(() => { const a = document.getElementById('r-pick-all'); return [a.checked, a.indeterminate]; }), [true, false]);
});

t('daily_list_shows_that_days_questions', async page => {
  await login(page);
  await kind(page, 'daily');
  assert.equal(await page.isHidden('#r-daily-qs'), true);
  await page.fill('#r-f-day', '2026-10-27');
  await page.dispatchEvent('#r-f-day', 'change');
  await page.locator('#r-daily-qs:not([hidden])').waitFor();
  assert.equal(await page.locator('#r-daily-qs-list li').count(), 20);
  const first = await page.evaluate(() => COUNTRIES.find(c => c.a === DAILY_CORE.build('2026-10-27', COUNTRIES)[0].a).n);
  assert.ok((await page.textContent('#r-daily-qs-list li:first-child')).includes(first));
  await kind(page, 'scores');
  assert.equal(await page.isHidden('#r-daily-qs'), true);
});

t('ops_log_shows_who', async (page, { db }) => {
  page.on('dialog', d => d.accept());
  await login(page);
  await kind(page, 'scores');
  await rows(page).first().locator('[data-nameless]').click();
  await page.locator('#r-recent li', { hasText: '名前を変える' }).waitFor();
  db.adminLog.push({ id: 99, at: new Date().toISOString(), user_id: '12345678-aaaa-bbbb-cccc-000000000000', action: 'delete', kind: 'scores', detail: { ids: [1] } });
  await page.click('#adm-tabs [data-tab="log"]');
  await page.locator('#l-ops-table tbody tr', { hasText: '12345678' }).waitFor();
  const who = await page.$$eval('#l-ops-table tbody td.who', ts => ts.map(t => t.textContent));
  assert.deepEqual(who, ['12345678', 'admin@example.com']);
});

t('malformed_error_record_does_not_stop_ops_log', async page => {
  await login(page);
  await page.click('#adm-tabs [data-tab="log"]');
  await page.locator('#l-ops-table tbody tr').first().waitFor();
  // 変な形の記録があっても、エラー記録の区画は出せて、ふつうの記録は見える
  await page.locator('#l-err-list li', { hasText: 'ふつう' }).waitFor();
  assert.equal(await page.locator('#l-err p[data-err]').count(), 0);
  assert.equal(await page.locator('#l-err-list li').count(), 2);
}, { storage: { adminErrors: [{ msg: { toString: 1 }, src: { toString: 1 }, at: { toString: 1 }, line: {} }, { msg: 'ふつう', at: '2026-10-28T00:00:00Z' }] } });

t('row_actions_visible_on_phone', async page => {
  await login(page);
  for (const k of ['scores', 'rpg']) {
    await kind(page, k);
    const box = await rows(page).first().locator('[data-rename]').boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `${k}: ${JSON.stringify(box)}`);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390);
}, { viewport: PHONE });

// D13: 本編で起きた例外は localStorage adminErrors に残り、ログタブ（ログイン不要）で見られる
test('error_log_records_main_page_errors', { timeout: 60_000 }, async () => {
  const app = await openApp(browser, {});
  try {
    const { page } = app;
    await page.evaluate(() => { setTimeout(() => { throw new Error('test-boom'); }); Promise.reject(new Error('test-reject')); Promise.reject(Symbol('sym')); });
    await page.waitForFunction(() => (localStorage.getItem('adminErrors') || '').includes('test-reject') && localStorage.getItem('adminErrors').includes('test-boom')
      && localStorage.getItem('adminErrors').includes('Symbol(sym)'));
    await page.waitForTimeout(100);
    // Symbol でも記録の途中で例外を出さない（TypeError が記録されない）
    assert.doesNotMatch(await page.evaluate(() => localStorage.getItem('adminErrors')), /Cannot convert a Symbol/);
    const recs = await page.evaluate(() => JSON.parse(localStorage.getItem('adminErrors')));
    for (const r of recs) assert.deepEqual(Object.keys(r).sort(), ['at', 'line', 'msg', 'src']);
    // 50件まで
    await page.evaluate(() => { for (let i = 0; i < 60; i++) setTimeout(() => { throw new Error(`many-${i}`); }); });
    await page.waitForFunction(() => localStorage.getItem('adminErrors').includes('many-59'));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('adminErrors')).length), 50);
    // 壊れた値が入っていても本編は止まらない
    await page.evaluate(() => { localStorage.setItem('adminErrors', '{'); setTimeout(() => { throw new Error('test-boom'); }); });
    await page.waitForFunction(() => (localStorage.getItem('adminErrors') || '').includes('test-boom'));
    await page.goto(new URL('admin.html', page.url()).href);
    await page.click('#adm-tabs [data-tab="log"]');
    await page.locator('#l-err-list', { hasText: 'test-boom' }).waitFor();
    page.on('dialog', d => d.accept());
    await page.click('#l-err-clear');
    await page.locator('#l-err-list', { hasText: 'まだないよ' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('adminErrors')), null);
  } finally { await app.close(); }
});

// 別のサイトの iframe の中では何も出さない（meta の CSP では frame-ancestors が効かないので admin.js で止める）
test('admin_in_foreign_iframe_shows_nothing', { timeout: 60_000 }, async () => {
  // 別のポート＝別のオリジンで、iframe だけのページを配信する（route で作ったページはローカルのサーバーを読めないので本物のサーバーにする）
  const dir = await mkdtemp(join(tmpdir(), 'adm-frame-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><iframe id="f" width="800" height="600"></iframe>');
  const evil = await startServer({ root: dir });
  const context = await browser.newContext();
  const target = new URL('admin.html', server.url).href;
  try {
    const page = await context.newPage();
    await page.goto(evil.url);
    await page.evaluate(src => { document.getElementById('f').src = src; }, target);
    // 決まった時間を待たず、外に抜ける（ページごと admin.html になる）のを待つ。抜けられないブラウザなら iframe の中を見る
    const escaped = await page.waitForURL(target, { timeout: 15_000 }).then(() => true, () => false);
    if (!escaped) {
      const frame = page.frames().find(f => f.url() === target);
      assert.ok(frame, `iframe が読まれていない: ${page.frames().map(f => f.url()).join(' ')}`);
      assert.equal(await frame.evaluate(() => getComputedStyle(document.documentElement).display), 'none');
      assert.equal(await frame.evaluate(() => document.getElementById('d-keys').children.length), 0);
    } else assert.equal(page.url(), target);   // 外に抜けたならそれでよい
  } finally { await context.close(); await evil.close(); await rm(dir, { recursive: true, force: true }); }
});

// スクリーンショット（ランキングタブ・ログイン後。XSS っぽい名前の行も入れる）
const SHOTS = process.env.ADMIN_SHOTS;
for (const [label, viewport] of [['phone', PHONE], ['pc', PC]]) {
  if (!SHOTS) continue;
  t(`shot_rank_${label}`, async (page, { db }) => {
    db.rows.push({ board: 'f2n:all:5', nickname: XSS, time_ms: 7777, questions: 5, created_at: ago(0.2) });
    await login(page);
    await page.locator('#r-table[data-ready]').waitFor();
    await page.evaluate(() => { document.getElementById('adm-toast').textContent = ''; });
    await page.screenshot({ path: `${SHOTS}/final-rank-${label}.png`, fullPage: true });
  }, { viewport, colorScheme: 'light' });
}

// ---- 1回目のレビューの直し ----
// ログアウトのあとで届いた一覧の返事は出さない。ログインし直して新しい一覧を待つあいだも、前の行を出さない
t('late_list_after_logout_is_dropped', async (page, { db }) => {
  await login(page);
  await page.locator('#r-table[data-ready]').waitFor();
  const orig = db.adminRpc.admin_list;
  let release;
  const hold = () => { const g = new Promise(ok => { release = ok; }); db.adminRpc.admin_list = args => g.then(() => orig(args)); };
  hold();
  await page.click('#r-reload');
  await page.waitForTimeout(100);
  await page.click('#adm-logout');
  await page.locator('#r-login').waitFor();
  release();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#r-table tbody tr').count(), 0);
  assert.doesNotMatch(await page.evaluate(() => document.body.textContent), /たろう|はなこ/);
  // ログインし直す（一覧は止めておく）
  db.rows.length = 0;
  hold();
  await login(page);
  await page.waitForTimeout(200);
  assert.equal(await rows(page).count(), 0, '前の行を出さない');
  assert.equal(await page.isDisabled('#r-del'), true);
  release();
  await page.locator('#r-table[data-ready]').waitFor();
  assert.equal(await rows(page).count(), 0);
});

// 消す返事を待つあいだは、もう一度押せない（2回送らない）
t('delete_button_locked_while_request_runs', async (page, { db }) => {
  page.on('dialog', d => d.accept());
  await login(page);
  await kind(page, 'scores');
  const orig = db.adminRpc.admin_delete;
  let release;
  const g = new Promise(ok => { release = ok; });
  db.adminRpc.admin_delete = args => g.then(() => orig(args));
  await rows(page).first().locator('input[data-pick]').check();
  await page.click('#r-del');
  await page.waitForTimeout(150);
  assert.equal(await page.isDisabled('#r-del'), true);
  assert.equal(await rows(page).first().locator('[data-rename]').isDisabled(), true);
  release();
  await page.locator('#adm-toast', { hasText: '1件消したよ' }).waitFor();
  await page.locator('#r-table[data-ready]').waitFor();
  assert.equal(db.calls.filter(c => c.name === 'admin_delete').length, 1);
  assert.equal(await page.isDisabled('#r-del'), false);
});

// 30分さわらないと、開いたままでもログイン画面に戻って、サーバーの名前を画面から消す
test('idle_30min_logs_out_page', { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { path: 'admin.html' });
  seed(app.db);
  const { page, context } = app;
  try {
    await context.clock.install();
    await page.reload();
    await login(page);
    await page.locator('#r-table[data-ready]').waitFor();
    assert.match(await page.evaluate(() => document.body.textContent), /たろう/);
    await page.clock.fastForward('31:00');
    await page.locator('#r-login-msg', { hasText: 'ログインし直してね' }).waitFor();
    assert.equal(await page.isVisible('#r-login'), true);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('adminAuth')), null);
    assert.doesNotMatch(await page.evaluate(() => document.body.textContent), /たろう|はなこ|じろう|ゆうしゃ/);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});

// 消す返事が来なかった（つながらなかった）: サーバーでは消えているかもしれないので「消えたか分からない」と言って読み直す
const UNSURE = '消えたか分からない。一覧を読み直して確かめてね';
// admin_delete だけ、偽DBでは消してから返事を切る（サーバーでは消えたのに返事が届かない）
const deleteThenDrop = (page, db) => page.route(u => new URL(u).pathname.endsWith('/rpc/admin_delete'), async route => {
  let args; try { args = route.request().postDataJSON() ?? {}; } catch { args = {}; }
  db.calls.push({ name: 'admin_delete', args, at: Date.now() });
  await db.adminRpc.admin_delete(args);
  return route.abort();
});

t('delete_network_failure_says_unsure_and_reloads', async (page, { db }) => {
  page.on('dialog', d => d.accept());
  await login(page);
  await kind(page, 'scores');
  await tbodyHas(page, /たろう/);
  await deleteThenDrop(page, db);
  const lists = db.calls.filter(c => c.name === 'admin_list').length;
  await rows(page).filter({ hasText: 'たろう' }).locator('input[data-pick]').check();
  await page.click('#r-del');
  await page.locator('#adm-toast', { hasText: UNSURE }).waitFor();
  await tbodyLacks(page, /たろう/);
  await page.locator('#r-table[data-ready]').waitFor();
  assert.ok(db.calls.filter(c => c.name === 'admin_list').length > lists, '読み直す');
  assert.match(await page.textContent('#adm-toast'), new RegExp(UNSURE));
  assert.doesNotMatch(await page.textContent('#adm-toast'), /消してない/);
});

t('delete_by_name_network_failure_says_unsure', async (page, { db }) => {
  page.on('dialog', d => d.accept());
  await login(page);
  await kind(page, 'scores');
  await tbodyHas(page, /たろう/);
  await deleteThenDrop(page, db);
  await rows(page).filter({ hasText: 'たろう' }).locator('[data-byname]').click();
  await page.locator('#adm-toast', { hasText: UNSURE }).waitFor();
  await tbodyLacks(page, /たろう/);
  assert.doesNotMatch(await page.textContent('#adm-toast'), /何も消してない/);
});

// 消せたあとで読み直せなかったら、消したはずの行を出したままにしない
t('reload_failure_after_delete_clears_rows', async (page, { db }) => {
  page.on('dialog', d => d.accept());
  await login(page);
  await kind(page, 'scores');
  await tbodyHas(page, /たろう/);
  const orig = db.adminRpc.admin_delete;
  db.adminRpc.admin_delete = async args => { const r = await orig(args); db.down = true; return r; };   // 消したあとは切れる
  await rows(page).filter({ hasText: 'たろう' }).locator('input[data-pick]').check();
  await page.click('#r-del');
  await page.locator('#r-table tbody td', { hasText: '読みこめなかった。もう一回押してね' }).waitFor();
  assert.equal(await rows(page).count(), 0);
  assert.doesNotMatch(await page.textContent('#r-table'), /たろう|はなこ/);
  assert.equal(await page.isDisabled('#r-del'), true);
  db.down = false;
  await page.click('#r-reload');
  await tbodyHas(page, /はなこ/);
  await page.locator('#r-table[data-ready]').waitFor();
  assert.equal(await rows(page).count(), 1);
});

// ---- 2回目のレビューの直し ----
// F1: 古いログインの refresh を待っているあいだにログアウトしてすぐログインし直した。あとで古い refresh が
// 断られても（400）通っても（200）、新しいログインは追い出さない
for (const status of [400, 200]) t(`stale_refresh_${status}_after_relogin_keeps_new_session`, async (page, { db }) => {
  await login(page);
  await page.locator('#r-table[data-ready]').waitFor();
  await page.evaluate(() => { const a = JSON.parse(sessionStorage.getItem('adminAuth')); a.expires_at = Date.now(); sessionStorage.setItem('adminAuth', JSON.stringify(a)); });
  let release, n = 0;
  const held = new Promise(r => { release = r; });
  await page.route(u => u.search.includes('grant_type=refresh_token'), async route => {
    n++;
    await held;
    if (status === 400) return route.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"invalid_grant"}' });
    return route.fallback();
  });
  await page.click('#r-reload');
  await expectSoon(() => n === 1, '古い refresh を待っている');
  await page.click('#adm-logout');
  await page.locator('#r-login').waitFor();
  await login(page);
  await page.locator('#r-table[data-ready]').waitFor();
  const outs = () => db.calls.filter(c => c.name === 'logout').length;
  assert.equal(outs(), 0, 'ログアウトは古い refresh を待っている');
  release();
  // ログアウトは古い refresh が終わってから、古い合札を無効にしに行く（/logout か、期限切れなら先に refresh）。
  // そのときには古い呼び出しの返事も済んでいる
  await expectSoon(() => outs() > 0 || n >= 2, 'ログアウトの続き');
  await page.waitForTimeout(100);
  assert.equal(await page.isVisible('#r-dash'), true, '新しいログインのまま');
  assert.equal(await page.isHidden('#r-login'), true);
  assert.equal((await page.textContent('#r-login-msg')).trim(), '');
  assert.match(JSON.parse(await page.evaluate(() => sessionStorage.getItem('adminAuth'))).access_token, /^fake-access-/);
  assert.equal(await rows(page).count(), 2);
  // 新しいログインで続けて使える
  await page.click('#r-reload');
  await page.locator('#r-table[data-ready]').waitFor();
  assert.equal(await page.isVisible('#r-dash'), true);
});
// 条件が true になるまで（最大5秒）待つ
async function expectSoon(fn, what) {
  for (let i = 0; i < 250 && !fn(); i++) await new Promise(ok => setTimeout(ok, 20));
  assert.ok(fn(), what);
}

// U5: 次・前・読み直すは、今出ている一覧を作った絞りこみで読む（欄に書いただけで探していない名前は使わない）
t('paging_and_reload_use_searched_filter', async (page, { db }) => {
  for (let i = 0; i < 120; i++) db.rows.push({ board: 'n2f:all:5', nickname: `p${i}`, time_ms: 10000 + i, questions: 5, created_at: ago(40 + i) });
  await login(page);
  await kind(page, 'scores');
  await page.fill('#r-f-q', 'たろ');   // 探すボタンはまだ押さない
  await page.click('#r-next');
  await page.locator('#r-page', { hasText: '101〜122 / 122' }).waitFor();
  const lastList = () => db.calls.filter(c => c.name === 'admin_list').at(-1).args.p_filter;
  assert.deepEqual([lastList().q, lastList().offset], ['', 100]);
  await page.click('#r-prev');
  await page.locator('#r-page', { hasText: '1〜100 / 122' }).waitFor();
  assert.deepEqual([lastList().q, lastList().offset], ['', 0]);
  const n = db.calls.length;
  await page.click('#r-reload');
  await expectSoon(() => db.calls.slice(n).some(c => c.name === 'admin_list'), '読み直す');
  await page.locator('#r-table[data-ready]').waitFor();
  assert.equal(lastList().q, '');
  assert.equal(await rows(page).count(), 100);
});

// U6: CSV を作っているあいだは、CSV も消すも押せない（2回作らない・途中で消さない）
t('csv_is_exclusive', async (page, { db }) => {
  await login(page);
  await kind(page, 'scores');
  const orig = db.adminRpc.admin_list;
  let release;
  const gate = new Promise(ok => { release = ok; });
  db.adminRpc.admin_list = args => args.p_filter?.limit === 500 ? gate.then(() => orig(args)) : orig(args);
  const dl = page.waitForEvent('download');
  await page.click('#r-csv');
  await expectSoon(() => db.calls.filter(c => c.name === 'admin_list' && c.args.p_filter?.limit === 500).length === 1, 'CSV の読みこみ');
  assert.equal(await page.isDisabled('#r-csv'), true);
  assert.equal(await page.isDisabled('#r-del'), true, 'CSV のあいだは消せない');
  // 種類を切りかえて戻っても押せないまま。無理に押しても2回目は作らない
  await kind(page, 'daily');
  await kind(page, 'scores');
  assert.equal(await page.isDisabled('#r-csv'), true);
  await page.evaluate(() => { const b = document.getElementById('r-csv'); b.disabled = false; b.click(); });
  await page.waitForTimeout(200);
  assert.equal(db.calls.filter(c => c.name === 'admin_list' && c.args.p_filter?.limit === 500).length, 1);
  release();
  await dl;
  await page.locator('#adm-toast', { hasText: 'CSV にしたよ' }).waitFor();
  assert.equal(await page.isDisabled('#r-csv'), false);
  assert.equal(await page.isDisabled('#r-del'), false);
});

// F5: 戻す返事が来なかったら「戻ったか分からない」と言って読み直す
const UNSURE_RESTORE = '戻ったか分からない。一覧を読み直して確かめてね';
t('restore_network_failure_says_unsure_and_reloads', async (page, { db }) => {
  page.on('dialog', d => d.accept());
  await login(page);
  await kind(page, 'scores');
  await rows(page).filter({ hasText: 'たろう' }).locator('input[data-pick]').check();
  await page.click('#r-del');
  await tbodyLacks(page, /たろう/);
  await kind(page, 'trash');
  await page.route(u => new URL(u).pathname.endsWith('/rpc/admin_restore'), async route => {
    let args; try { args = route.request().postDataJSON() ?? {}; } catch { args = {}; }
    db.calls.push({ name: 'admin_restore', args, at: Date.now() });
    await db.adminRpc.admin_restore(args);
    return route.abort();
  });
  const lists = db.calls.filter(c => c.name === 'admin_list').length;
  await rows(page).first().locator('input[data-pick]').check();
  await page.click('#r-restore');
  await page.locator('#adm-toast', { hasText: UNSURE_RESTORE }).waitFor();
  await page.locator('#r-table[data-kind="trash"][data-ready]').waitFor();
  await expectSoon(() => db.calls.filter(c => c.name === 'admin_list').length > lists, '読み直す');
  await page.locator('#r-table tbody td', { hasText: 'ないよ' }).waitFor();
  assert.match(await page.textContent('#adm-toast'), new RegExp(UNSURE_RESTORE));
});

// Q1: ゴミ箱の冒険の記録を戻すときは、名前をふさぐかもしれないと先に知らせる（やめたら戻さない）
t('restore_rpg_rows_warns_first', async (page, { db }) => {
  const msgs = [];
  page.on('dialog', d => { msgs.push(d.message()); if (/冒険の記録/.test(d.message()) && /戻していい/.test(d.message())) d.dismiss(); else d.accept(); });
  await login(page);
  await kind(page, 'rpg');
  await rows(page).first().locator('input[data-pick]').check();
  await page.click('#r-del');
  await page.locator('#adm-toast', { hasText: '1件消したよ' }).waitFor();
  await kind(page, 'trash');
  await rows(page).first().locator('input[data-pick]').check();
  await page.click('#r-restore');
  await expectSoon(() => msgs.length === 2, '確かめる');
  assert.match(msgs[1], /冒険の記録.*1件/);
  assert.match(msgs[1], /登録をやめていたら/);
  await page.waitForTimeout(200);
  assert.equal(db.calls.some(c => c.name === 'admin_restore'), false, 'やめたら戻さない');
  assert.equal(db.rpgRows.length, 0);
});

// Q1: 冒険でない記録だけ戻すときは聞かない
t('restore_non_rpg_rows_does_not_warn', async (page, { db }) => {
  const msgs = [];
  page.on('dialog', d => { msgs.push(d.message()); d.accept(); });
  await login(page);
  await kind(page, 'scores');
  await rows(page).first().locator('input[data-pick]').check();
  await page.click('#r-del');
  await page.locator('#adm-toast', { hasText: '1件消したよ' }).waitFor();
  await kind(page, 'trash');
  await rows(page).first().locator('input[data-pick]').check();
  await page.click('#r-restore');
  await page.locator('#adm-toast', { hasText: '1件戻したよ' }).waitFor();
  assert.equal(msgs.length, 1, '消すときの1回だけ');
});

// T5: 同じ id の行がもうあって戻せなかった件数を知らせる
t('restore_reports_failed_count', async (page, { db }) => {
  page.on('dialog', d => d.accept());
  await login(page);
  await kind(page, 'scores');
  await rows(page).filter({ hasText: 'たろう' }).locator('input[data-pick]').check();
  await page.click('#r-del');
  await tbodyLacks(page, /たろう/);
  db.rows.push({ ...db.trash[0].row_data, nickname: 'べつ' });   // 同じ id の行がもうある
  await kind(page, 'trash');
  await rows(page).first().locator('input[data-pick]').check();
  await page.click('#r-restore');
  await page.locator('#adm-toast', { hasText: '0件戻したよ・戻せなかった 1件（同じ id か同じ名前がもうある）' }).waitFor();
  assert.equal(await page.evaluate(() => document.getElementById('adm-toast').classList.contains('bad')), true);
});

// T5: 操作ログの次・前
t('ops_log_paging', async (page, { db }) => {
  for (let i = 0; i < 150; i++) db.adminLog.push({ id: i + 1, at: ago(200 - i), user_id: 'fake-admin', action: 'rename', kind: 'scores', detail: { id: i, before: `b${i}`, after: `a${i}` } });
  await login(page);
  await page.click('#adm-tabs [data-tab="log"]');
  await page.locator('#l-ops-page', { hasText: '1〜100 / 150' }).waitFor();
  assert.equal(await page.isDisabled('#l-ops-prev'), true);
  assert.equal(await page.locator('#l-ops-table tbody tr').count(), 100);
  await page.click('#l-ops-next');
  await page.locator('#l-ops-page', { hasText: '101〜150 / 150' }).waitFor();
  assert.equal(db.calls.filter(c => c.name === 'admin_log_list').at(-1).args.p_offset, 100);
  assert.equal(await page.locator('#l-ops-table tbody tr').count(), 50);
  assert.equal(await page.isDisabled('#l-ops-next'), true);
  await page.click('#l-ops-prev');
  await page.locator('#l-ops-page', { hasText: '1〜100 / 150' }).waitFor();
  assert.equal(db.calls.filter(c => c.name === 'admin_log_list').at(-1).args.p_offset, 0);
});

// T2: 期間・並べ方の選択も admin_list に送る
t('period_and_sort_are_sent', async (page, { db }) => {
  await login(page);
  await kind(page, 'scores');
  const lastList = () => db.calls.filter(c => c.name === 'admin_list').at(-1).args.p_filter;
  assert.deepEqual([lastList().period, lastList().sort], ['all', 'new']);
  let n = db.calls.length;
  await page.selectOption('#r-f-period', 'week');
  await expectSoon(() => db.calls.slice(n).some(c => c.name === 'admin_list'), '期間で読み直す');
  assert.equal(lastList().period, 'week');
  n = db.calls.length;
  await page.selectOption('#r-f-sort', 'best');
  await expectSoon(() => db.calls.slice(n).some(c => c.name === 'admin_list'), '並べ方で読み直す');
  assert.deepEqual([lastList().period, lastList().sort], ['week', 'best']);
  await page.locator('#r-table[data-ready]').waitFor();
  // 成績の順: はなこ（9.00秒）が先
  assert.match(await rows(page).first().textContent(), /はなこ/);
  await kind(page, 'rpg');
  assert.equal(lastList().sort, 'best');
  assert.equal('period' in lastList(), false, '期間はタイムアタックだけ');
});

// S14: 5日から目立たせる（4日はまだ）
for (const [days, warn] of [[4, false], [5, true]]) t(`stale_warning_boundary_${days}_days`, async (page, { db }) => {
  const at = ago(24 * days + 1);
  for (const r of [...db.rows, ...db.dailyRows]) r.created_at = at;
  db.rpgRows[0].created_at = db.rpgRows[0].at = at;
  await login(page);
  await page.locator('#r-stale', { hasText: `最後の記録から ${days}日` }).waitFor();
  assert.equal(await page.evaluate(() => document.getElementById('r-stale').classList.contains('warn')), warn);
});

// ---- プロフィールにつながった行（profile_id がある） ----
// 表の nickname は古いことがある（rpg は「名前#pid」など）。一覧にはプロフィールの名前と pid を出す
const seedProfile = db => {
  db.profiles.push({ id: 1, pid: 'pidchiko0001', token: 'pt', nickname: 'チコ' }, { id: 2, pid: 'pidmike00002', token: 'pt2', nickname: 'ミケ' });
  db.rows.push({ board: 'f2n:all:10', nickname: 'ちこ旧', time_ms: 11111, questions: 10, created_at: ago(1), profile_id: 1 });
  db.dailyRows.push({ day: '2026-10-27', nickname: 'ちこ旧', correct: 19, total: 20, time_ms: 50000, created_at: ago(2), profile_id: 1 });
  db.rpgRows.push({ token: 'pt', nickname: 'チコ#pidchiko0001', lv: 9, dungeons: 2, floors: 9, deco: [], created_at: ago(3), at: ago(3), profile_id: 1 });
  // 同じ名前の古い記録（プロフィールにつながっていない）
  db.rows.push({ board: 'f2n:all:10', nickname: 'チコ', time_ms: 22222, questions: 10, created_at: ago(4) });
};

t('profile_rows_show_profile_name_and_pid', async (page, { db }) => {
  seedProfile(db);
  await login(page);
  await kind(page, 'scores');
  const heads = await page.locator('#r-table thead th').allTextContents();
  const i = heads.indexOf('pid'), n = heads.indexOf('名前');
  assert.ok(i >= 0 && n >= 0, heads.join(','));
  const row = page.locator('#r-table tbody tr', { hasText: 'pidchiko0001' });
  assert.equal((await row.locator('td').nth(n).textContent()).trim(), 'チコ', '表の古い名前ではなくプロフィールの名前');
  const old = page.locator('#r-table tbody tr', { hasText: '22.22' });
  assert.equal((await old.locator('td').nth(i).textContent()).trim(), '', '古い記録の pid は空');
  await kind(page, 'rpg');
  const rn = (await page.locator('#r-table thead th').allTextContents()).indexOf('名前');
  assert.equal((await page.locator('#r-table tbody tr', { hasText: 'pidchiko0001' }).locator('td').nth(rn).textContent()).trim(), 'チコ', 'rpg の「名前#pid」ではなく');
});

t('rename_profile_row_renames_profile', async (page, { db }) => {
  seedProfile(db);
  const msgs = [];
  page.on('dialog', d => { msgs.push([d.message(), d.defaultValue()]); d.accept('ハチ'); });
  await login(page);
  await kind(page, 'daily');
  await page.locator('#r-table tbody tr', { hasText: 'pidchiko0001' }).locator('[data-rename]').click();
  await page.locator('#adm-toast', { hasText: 'プロフィールの名前を「ハチ」にしたよ' }).waitFor();
  assert.match(msgs[0][0], /プロフィール pidchiko0001/);
  assert.match(msgs[0][0], /この人の記録が全部この名前になる/);
  assert.equal(msgs[0][1], 'チコ', '欄にはプロフィールの名前');
  assert.equal(db.profiles[0].nickname, 'ハチ');
  assert.deepEqual([db.rows[2].nickname, db.dailyRows[1].nickname, db.rpgRows[1].nickname], ['ハチ', 'ハチ', 'ハチ'], 'この人の行がそろう');
  assert.equal(db.rows[3].nickname, 'チコ', '同じ名前の古い記録は変わらない');
  await page.locator('#r-table tbody tr', { hasText: 'ハチ' }).waitFor();
});

t('rename_profile_name_taken_message', async (page, { db }) => {
  seedProfile(db);
  page.on('dialog', d => d.accept('ﾐｹ'));
  await login(page);
  await kind(page, 'rpg');
  await page.locator('#r-table tbody tr', { hasText: 'pidchiko0001' }).locator('[data-rename]').click();
  await page.locator('#adm-toast', { hasText: 'ほかのプロフィールがその名前を使ってるよ' }).waitFor();
  assert.equal(db.profiles[0].nickname, 'チコ');
});

t('nameless_profile_row', async (page, { db }) => {
  seedProfile(db);
  let msg;
  page.on('dialog', d => { msg = d.message(); d.accept(); });
  await login(page);
  await kind(page, 'scores');
  await page.locator('#r-table tbody tr', { hasText: 'pidchiko0001' }).locator('[data-nameless]').click();
  await page.locator('#adm-toast', { hasText: 'プロフィールの名前を「名無しの旅人' }).waitFor();
  assert.match(msg, /プロフィール pidchiko0001.*「チコ」を「名無しの旅人」/);
  assert.match(db.profiles[0].nickname, /^名無しの旅人\d{3}$/);
  assert.deepEqual(db.calls.find(c => c.name === 'admin_rename').args.p_name, null);
});

// 「この名前の記録を全部消す」: プロフィールの行は同じ pid の記録（表の名前が古くても）。同じ名前の古い記録は消さない
t('delete_all_of_profile_by_pid', async (page, { db }) => {
  seedProfile(db);
  let msg;
  page.on('dialog', d => { msg = d.message(); d.accept(); });
  await login(page);
  await kind(page, 'scores');
  await page.locator('#r-table tbody tr', { hasText: 'pidchiko0001' }).locator('[data-byname]').click();
  await page.locator('#adm-toast', { hasText: '記録を 3件消したよ' }).waitFor();
  assert.match(msg, /「チコ（プロフィール pidchiko0001）」の記録を全部（タイムアタック 1件・今日の難問 1件・冒険 1件、合わせて 3件）/);
  assert.match(msg, /同じプロフィールのもの/);
  assert.ok(db.calls.filter(c => c.name === 'admin_list').some(c => c.args.p_filter?.pid === 'pidchiko0001'), 'pid で集める');
  assert.equal(db.rows.filter(r => r.profile_id === 1).length + db.dailyRows.filter(r => r.profile_id === 1).length + db.rpgRows.filter(r => r.profile_id === 1).length, 0);
  assert.ok(db.rows.some(r => r.nickname === 'チコ' && r.profile_id == null), '同じ名前の古い記録は残る');
  // ゴミ箱にはプロフィールの名前と pid で出る
  await kind(page, 'trash');
  assert.equal(await page.locator('#r-table tbody tr', { hasText: 'pidchiko0001' }).count(), 3);
});

t('delete_all_of_old_name_skips_profile_rows', async (page, { db }) => {
  seedProfile(db);
  page.on('dialog', d => d.accept());
  await login(page);
  await kind(page, 'scores');
  await page.locator('#r-table tbody tr', { hasText: '22.22' }).locator('[data-byname]').click();
  await page.locator('#adm-toast', { hasText: '「チコ」の記録を 1件消したよ' }).waitFor();
  assert.equal(db.rows.filter(r => r.profile_id === 1).length, 1, '同じ名前のプロフィールの記録は消さない');
});
