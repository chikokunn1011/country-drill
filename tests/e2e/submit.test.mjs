// タイムアタックのクリア後：順位相当の表示とランキング登録（偽の Supabase を使う）。スマホ幅で確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, clearTimeAttack, warned } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで開き、最後にページで例外が出ていないかも見る。opts は openApp にそのまま渡す
const t = (name, fn, opts = {}) => test(name, { timeout: 30_000 }, async () => {
  const app = await openApp(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const text = (page, sel) => page.locator(sel).innerText();
const submits = db => db.calls.filter(c => c.name === 'submit_score');
// #ta-msg / #ta-rank にその文言が出るまで待つ
const msgShown = (page, s) => page.locator('#ta-msg', { hasText: s }).waitFor();
const rankShown = page => page.locator('#ta-rank', { hasText: '相当' }).waitFor();
const send = async (page, name) => { await page.fill('#ta-name', name); await page.click('#ta-submit'); };
const record = (board, nickname, time_ms, created_at = new Date()) => ({ board, nickname, time_ms, questions: 5, created_at: created_at.toISOString() });

t('shows_time_and_rank', async (page, { db }) => {
  await clearTimeAttack(page);
  assert.match(await text(page, '#ta-time'), /秒/);
  assert.equal(await text(page, '#ta-time'), await page.evaluate(() => RANKING.formatTime(G.timeMs)));
  assert.match(await text(page, '#rcard'), /国旗 → 国名／全世界／5問/);
  await rankShown(page);
  assert.equal(await text(page, '#ta-rank'), '歴代1位・今週1位 相当');
  const [call] = db.calls.filter(c => c.name === 'rank_of');
  assert.equal(call.args.p_board, 'f2n:all:5');
  assert.ok(Number.isInteger(call.args.p_time_ms) && call.args.p_time_ms > 0, String(call.args.p_time_ms));
});

// 歴代と今週を取り違えていないこと（去年の速い記録は歴代だけに数える）
t('rank_reflects_db', async (page, { db }) => {
  db.rows.push(record('f2n:all:5', 'はやい', 1), record('f2n:all:5', 'むかし', 2, new Date(Date.now() - 400 * 864e5)), record('n2f:all:5', 'べつ', 1));
  await clearTimeAttack(page);
  await rankShown(page);
  assert.equal(await text(page, '#ta-rank'), '歴代3位・今週2位 相当');
});

t('submit_ok', async (page, { db }) => {
  await clearTimeAttack(page);
  assert.equal(await page.isVisible('#ta-form'), true);
  assert.equal(await page.getAttribute('#ta-name', 'placeholder'), 'ニックネーム（12文字まで）');
  assert.equal(await page.getAttribute('#ta-name', 'maxlength'), null);
  assert.equal(await text(page, '#ta-submit'), '載せる');
  await send(page, ' チコ ');
  await msgShown(page, '載せたよ！');
  assert.equal(await text(page, '#ta-msg'), '載せたよ！ 歴代1位・今週1位');
  assert.equal(await page.isHidden('#ta-form'), true);
  assert.equal(db.rows.length, 1);
  const [row] = db.rows;
  assert.equal(row.board, 'f2n:all:5');
  assert.equal(row.nickname, 'チコ');
  assert.equal(row.questions, 5);
  assert.ok(Number.isInteger(row.time_ms) && row.time_ms > 0, String(row.time_ms));
  assert.equal(await page.evaluate(() => localStorage.getItem('nickname')), '"チコ"');
  // openRanking（ランキング画面）がまだ無ければ「ランキングを見る」は出さない
  assert.equal(await page.isVisible('#ta-open'), await page.evaluate(() => typeof openRanking === 'function'));
  // 従来の2ボタンは残っている
  assert.equal(await page.isVisible('#r-again'), true);
  assert.equal(await page.isVisible('#r-setup'), true);
});

t('name_prefilled', async page => {
  await clearTimeAttack(page);
  assert.equal(await page.inputValue('#ta-name'), '');
  await send(page, 'チコ');
  await msgShown(page, '載せたよ！');
  await clearTimeAttack(page);
  assert.equal(await page.inputValue('#ta-name'), 'チコ');
  assert.equal(await page.isVisible('#ta-form'), true);
  assert.equal(await page.locator('#ta-msg').textContent(), '');
  await page.reload();
  await clearTimeAttack(page);
  assert.equal(await page.inputValue('#ta-name'), 'チコ');
});

t('name_checked_locally', async (page, { db }) => {
  await clearTimeAttack(page);
  await rankShown(page); // 順位の問い合わせが済んでから数える
  const before = db.calls.length;
  await send(page, 'あいうえおかきくけこさしす');
  await msgShown(page, 'ニックネームは1〜12文字で入れてね');
  await send(page, '   ');
  await msgShown(page, 'ニックネームは1〜12文字で入れてね');
  await send(page, 'ＡＤＭＩＮくん'); // 偽DBはNGワードを見ないので、手元で止めていないと載ってしまう
  await msgShown(page, 'そのニックネームは使えないみたい');
  assert.equal(db.calls.length, before);
  assert.equal(db.rows.length, 0);
  assert.equal(await page.isEnabled('#ta-submit'), true);
  assert.equal(await page.isVisible('#ta-form'), true);
});

t('server_reason_shown', async (page, { db }) => {
  const ok = db.rpc.submit_score;
  db.rpc.submit_score = () => ({ ok: false, reason: 'too_soon' });
  await clearTimeAttack(page);
  await send(page, 'チコ');
  await msgShown(page, '少し待ってから');
  assert.equal(await text(page, '#ta-msg'), '少し待ってからもう一回送ってね');
  assert.equal(await page.isVisible('#ta-form'), true);
  assert.equal(await page.isEnabled('#ta-submit'), true);
  assert.equal(await text(page, '#ta-submit'), 'もう一回送る');
  // もう一回押せば今度は載る
  db.rpc.submit_score = ok;
  await page.click('#ta-submit');
  await msgShown(page, '載せたよ！');
  assert.equal(submits(db).length, 2);
  assert.equal(db.rows.length, 1);
});

t('double_click_submits_once', async (page, { db }) => {
  // 応答を少し遅らせて、2回目のクリックが必ず応答より先に届くようにする
  await page.route('**/rest/v1/rpc/submit_score', async route => { await new Promise(ok => setTimeout(ok, 300)); await route.fallback(); });
  await clearTimeAttack(page);
  await page.fill('#ta-name', 'チコ');
  await page.dblclick('#ta-submit');
  await page.press('#ta-name', 'Enter'); // 送信中に入力欄で Enter を押しても送らない
  await msgShown(page, '載せたよ！');
  assert.equal(submits(db).length, 1);
  assert.equal(db.rows.length, 1);
});

t('network_down', async (page, { db, warnings }) => {
  await clearTimeAttack(page);
  await send(page, 'チコ');
  await msgShown(page, 'ランキングに接続できなかった');
  // 原因はコンソールに残る（順位の問い合わせと送信の両方）
  assert.ok(await warned(warnings, /^ranking rankOf /), warnings.join('\n'));
  assert.ok(await warned(warnings, /^ranking submit /), warnings.join('\n'));
  // 順位の問い合わせは送信より先に失敗しているので、ここで空のままなら「失敗したら出さない」
  assert.equal(await page.locator('#ta-rank').textContent(), '');
  assert.equal(await text(page, '#ta-submit'), 'もう一回送る');
  assert.equal(await page.isEnabled('#ta-submit'), true);
  // つながるようになったら「もう一回送る」で載る
  db.down = false;
  await page.click('#ta-submit');
  await msgShown(page, '載せたよ！');
  assert.equal(db.rows.length, 1);
}, { supabase: 'down' });

t('rank_preview_failure_keeps_form', async (page, { db, warnings }) => {
  delete db.rpc.rank_of; // rank_of だけ 404 にする
  await clearTimeAttack(page);
  assert.equal(await page.isVisible('#ta-form'), true);
  // 画面には出さないが、HTTP の状態つきでコンソールに残る
  assert.ok(await warned(warnings, /^ranking rankOf .*rank_of: HTTP 404/), warnings.join('\n'));
  await send(page, 'チコ');
  await msgShown(page, '載せたよ！');
  assert.equal(await text(page, '#ta-msg'), '載せたよ！ 歴代1位・今週1位');
  assert.equal(db.calls.filter(c => c.name === 'rank_of').length, 1);
  assert.equal(await page.locator('#ta-rank').textContent(), '');
  assert.equal(db.rows.length, 1);
});

// 「ランキングを見る」はこの条件の board で openRanking を呼ぶ（openRanking は差し替えて確かめる）
t('open_button_passes_board', async (page, { db }) => {
  await page.evaluate(() => { window.openRanking = board => { window.openedBoard = board; }; });
  await clearTimeAttack(page, { mode: 'n2f', region: 'オセアニア', count: 'all' });
  const n = await page.evaluate(() => G.set.length);
  assert.match(await text(page, '#rcard'), new RegExp(`国名 → 国旗／オセアニア／全部（${n}問）`));
  await send(page, 'チコ');
  await msgShown(page, '載せたよ！');
  assert.equal(await text(page, '#ta-open'), 'ランキングを見る');
  await page.click('#ta-open');
  assert.equal(await page.evaluate(() => window.openedBoard), 'n2f:oceania:all');
  assert.equal(db.rows[0].board, 'n2f:oceania:all');
  assert.equal(db.rows[0].questions, n);
});

t('disabled_when_not_configured', async (page, { db }) => {
  // 接続先が未設定の状態にする。ranking.js の末尾に1行足す（addInitScript だと ranking.js より先に動いて上書きされる）
  await page.route('**/ranking.js*', async route => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()) + '\nRANKING.enabled = false;\n' });
  });
  await page.reload();
  assert.equal(await page.evaluate(() => RANKING.enabled), false);
  await clearTimeAttack(page);
  assert.match(await text(page, '#ta-time'), /秒/);
  assert.equal(await page.locator('#ta-form').count(), 0);
  assert.equal(await page.locator('#ta-rank').textContent(), '');
  assert.equal(db.calls.length, 0);
  assert.equal(await page.isVisible('#r-again'), true);
});
