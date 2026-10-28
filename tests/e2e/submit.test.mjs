// タイムアタックのクリア後：順位相当の表示と、プロフィールでのランキング登録（profile.js の「載せる」箱。偽の Supabase を使う）。スマホ幅で確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, clearTimeAttack, answerCorrect, settleResult, warned } from './helpers.mjs';

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
const stored = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
const submits = db => db.calls.filter(c => c.name === 'submit_score2');
// 「載せる」箱の文言にその文字が出るまで待つ
const msgShown = (page, s) => page.locator('#ta-post .tamsg', { hasText: s }).waitFor();
const rankShown = page => page.locator('#ta-rank', { hasText: '相当' }).waitFor();
// プロフィールが無いときの名前入力から作って載せる
const send = async (page, name) => { await page.fill('#ta-post input', name); await page.click('#ta-post form .btn'); };
const record = (board, nickname, time_ms, created_at = new Date()) => ({ board, nickname, time_ms, questions: 5, created_at: created_at.toISOString() });
// 偽DB と localStorage にプロフィール（チコ）を入れて開き直す。patch で auto などを変える
const PID = 'abcdefghjk12';
// too_soon のあと送り直すまでの待ち（index.html の TA_GAP より長く。時計を進めて飛ばす）
const TA_WAIT = 12_000;
// cond() が真になるまで待つ（偽DBの呼び出しは Node 側にあるので、ページの中ではなくここで見る）
async function waitUntil(cond, ms = 5000) {
  for (const end = Date.now() + ms; !cond(); await new Promise(ok => setTimeout(ok, 50))) if (Date.now() > end) throw new Error('waitUntil: timeout');
}
// 時計を TA_WAIT ずつ進めながら cond() が真になるまで待つ（待ちのタイマーが仕掛けられる前に進めても取りこぼさないように、くり返す）
async function passUntil(page, cond, tries = 5) {
  for (let i = 0; i < tries && !cond(); i++) { await page.clock.fastForward(TA_WAIT); await waitUntil(cond, 1000).catch(() => {}); }
  assert.ok(cond(), 'passUntil: timeout');
}
async function withProfile(page, db, patch = {}) {
  db.profiles.push({ token: 'tok-1', nickname: 'チコ', pid: PID });
  await page.evaluate(p => localStorage.setItem('profile', JSON.stringify(p)),
    { token: 'tok-1', pid: PID, name: 'チコ', auto: true, isPublic: true, sent: { isPublic: true }, ...patch });
  await page.reload();
  await page.waitForFunction(() => window.PROFILE);
  await page.evaluate(() => PROFILE.ready);
}

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

// プロフィールがあって自動 ON なら、クリアしただけで載る
t('auto_submit_on_clear', async (page, { db }) => {
  await withProfile(page, db);
  await clearTimeAttack(page);
  await msgShown(page, '載せたよ！');
  assert.equal(await text(page, '#ta-post .tamsg'), '載せたよ！ 歴代1位・今週1位');
  assert.equal(await page.locator('#ta-post input, #ta-post button').count(), 0);
  assert.equal(submits(db).length, 1);
  assert.equal(submits(db)[0].args.p_token, 'tok-1');
  assert.equal(db.rows.length, 1);
  const [row] = db.rows;
  assert.equal(row.profile_id, db.profiles[0].id);
  assert.equal(row.board, 'f2n:all:5');
  assert.equal(row.nickname, 'チコ');
  assert.equal(row.questions, 5);
  assert.ok(Number.isInteger(row.time_ms) && row.time_ms > 0, String(row.time_ms));
  assert.equal(await page.isVisible('#ta-open'), true);
  // 従来の2ボタンは残っている
  assert.equal(await page.isVisible('#r-again'), true);
  assert.equal(await page.isVisible('#r-setup'), true);
});

// 自動 OFF なら［チコ で載せる］を押したときだけ（名前の入力は無し）
t('manual_when_auto_off', async (page, { db }) => {
  await withProfile(page, db, { auto: false });
  await clearTimeAttack(page);
  await rankShown(page);
  assert.equal(await page.locator('#ta-post input').count(), 0);
  assert.equal(await text(page, '#ta-post [data-pf="send"]'), 'チコ で載せる');
  assert.equal(submits(db).length, 0);
  assert.equal(await page.isHidden('#ta-open'), true);
  await page.click('#ta-post [data-pf="send"]');
  await msgShown(page, '載せたよ！');
  assert.equal(submits(db).length, 1);
  assert.equal(db.rows[0].profile_id, db.profiles[0].id);
  assert.equal(await page.isVisible('#ta-open'), true);
});

// プロフィールが無ければ名前を入れて［プロフィールを作って載せる］。前に使った名前を入れておく
t('create_and_submit', async (page, { db }) => {
  await page.evaluate(() => localStorage.setItem('nickname', JSON.stringify('ミケ')));
  await clearTimeAttack(page);
  assert.equal(await page.inputValue('#ta-post input'), 'ミケ');
  assert.equal(await page.getAttribute('#ta-post input', 'placeholder'), 'ニックネーム（12文字まで）');
  assert.equal(await text(page, '#ta-post form .btn'), 'プロフィールを作って載せる');
  assert.equal(await page.isHidden('#ta-open'), true);
  await send(page, ' チコ ');
  await msgShown(page, '載せたよ！');
  assert.equal(await text(page, '#ta-post .tamsg'), '載せたよ！ 歴代1位・今週1位');
  assert.equal(db.profiles.length, 1);
  assert.equal(db.profiles[0].nickname, 'チコ');
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].profile_id, db.profiles[0].id);
  assert.equal((await stored(page, 'profile')).pid, db.profiles[0].pid);
  assert.equal(await stored(page, 'nickname'), 'チコ');
  assert.equal(await page.isVisible('#ta-open'), true);
  // 次からは自動で載る
  await clearTimeAttack(page);
  await msgShown(page, '載せたよ！');
  assert.equal(db.rows.length, 2);
});

// 結果画面を離れたら「載せる」箱を外す。あとでプロフィールを作った・自動を ON にしても、載せないままにした記録は送らない
t('left_result_box_stays_quiet', async (page, { db }) => {
  // 自動 OFF で［チコ で載せる］を押さずにホームへ → 自動を ON
  await withProfile(page, db, { auto: false });
  await clearTimeAttack(page);
  await rankShown(page);
  await page.click('#r-setup');
  await page.click('#brand');
  assert.equal(await page.locator('#ta-post').count(), 0);
  await page.evaluate(() => PROFILE.setAuto(true));
  await page.waitForTimeout(300);
  assert.equal(submits(db).length, 0);
  // プロフィールが無いまま結果画面を離れ、あとで作る
  await page.evaluate(() => localStorage.removeItem('profile'));
  await page.reload();
  await page.waitForFunction(() => window.PROFILE);
  await clearTimeAttack(page);
  await rankShown(page);
  await page.click('#r-setup');
  assert.equal(await page.locator('#ta-post').count(), 0);
  assert.equal((await page.evaluate(() => PROFILE.create('ミケ'))).ok, true);
  await page.waitForTimeout(300);
  assert.equal(submits(db).length, 0);
  assert.equal(db.rows.length, 0);
});

t('name_checked_locally', async (page, { db }) => {
  await clearTimeAttack(page);
  await rankShown(page); // 順位の問い合わせが済んでから数える
  const before = db.calls.length;
  await send(page, 'あいうえおかきくけこさしす');
  await msgShown(page, 'ニックネームは1〜12文字で入れてね');
  await send(page, '   ');
  await msgShown(page, 'ニックネームは1〜12文字で入れてね');
  await send(page, 'ＡＤＭＩＮくん'); // 偽DBはNGワードを見ないので、手元で止めていないと作られてしまう
  await msgShown(page, 'そのニックネームは使えないみたい');
  assert.equal(db.calls.length, before);
  assert.equal(db.profiles.length, 0);
  assert.equal(db.rows.length, 0);
  assert.equal(await page.isEnabled('#ta-post form .btn'), true);
});

// 断られたわけを出す。too_soon は1回だけ待って送り直すので、2回続けて断られたときに出る（待ちは時計を進めて飛ばす）
t('server_reason_shown', async (page, { db }) => {
  const ok = db.rpc.submit_score2;
  db.rpc.submit_score2 = () => ({ ok: false, reason: 'too_soon' });
  await page.clock.install();
  await withProfile(page, db);
  await clearTimeAttack(page);
  await passUntil(page, () => submits(db).length === 2);
  await msgShown(page, '少し待ってから');
  assert.equal(await text(page, '#ta-post .tamsg'), '少し待ってからもう一回送ってね');
  assert.equal(await text(page, '#ta-post [data-pf="retry"]'), 'もう一回送る');
  assert.equal(await page.isHidden('#ta-open'), true);
  // もう一回押せば今度は載る
  db.rpc.submit_score2 = ok;
  await page.click('#ta-post [data-pf="retry"]');
  await msgShown(page, '載せたよ！');
  assert.equal(submits(db).length, 3);
  assert.equal(db.rows.length, 1);
});

// DB は同じ board への10秒以内の連投を断る（too_soon）。［もう一回］で続けてクリアして断られても、待って1回送り直す。
// 結果画面を離れても送るのはやめない（自己ベストが消えないように）
t('too_soon_retried_after_leaving', async (page, { db }) => {
  const ok = db.rpc.submit_score2;
  let calls = 0;
  db.rpc.submit_score2 = args => (++calls === 2 ? { ok: false, reason: 'too_soon' } : ok(args));
  await page.clock.install();
  await withProfile(page, db);
  await clearTimeAttack(page);
  await msgShown(page, '載せたよ！');
  // すぐもう一回。2回目は断られ、送信中のまま待つ
  await page.click('#r-again');
  const n = await page.evaluate(() => G.set.length);
  for (let i = 0; i < n; i++) await answerCorrect(page);
  await page.locator('#scr-result').waitFor();
  await waitUntil(() => submits(db).length === 2);
  await page.waitForTimeout(300);
  assert.equal(await text(page, '#ta-post .tamsg'), '送信中…');
  const timeMs = await page.evaluate(() => Math.floor(G.timeMs));
  // 待っているあいだに結果画面を離れる
  await settleResult(page);
  await page.click('#r-setup');
  assert.equal(await page.locator('#ta-post').count(), 0);
  await passUntil(page, () => submits(db).length === 3);
  await waitUntil(() => db.rows.length === 2);
  assert.equal(db.rows.length, 2);
  assert.equal(db.rows[1].time_ms, timeMs);
});

t('double_click_submits_once', async (page, { db }) => {
  // 応答を少し遅らせて、2回目のクリックが必ず応答より先に届くようにする
  await page.route('**/rest/v1/rpc/submit_score2', async route => { await new Promise(ok => setTimeout(ok, 300)); await route.fallback(); });
  await withProfile(page, db, { auto: false });
  await clearTimeAttack(page);
  await page.dblclick('#ta-post [data-pf="send"]');
  await msgShown(page, '載せたよ！');
  assert.equal(submits(db).length, 1);
  assert.equal(db.rows.length, 1);
});

t('network_down', async (page, { db, warnings }) => {
  await withProfile(page, db);
  await clearTimeAttack(page);
  await msgShown(page, 'ランキングに接続できなかった');
  // 原因はコンソールに残る（順位の問い合わせと送信の両方）
  assert.ok(await warned(warnings, /^ranking rankOf /), warnings.join('\n'));
  assert.ok(await warned(warnings, /^ranking submit_score2 /), warnings.join('\n'));
  // 順位の問い合わせは送信より先に失敗しているので、ここで空のままなら「失敗したら出さない」
  assert.equal(await page.locator('#ta-rank').textContent(), '');
  assert.equal(await text(page, '#ta-post [data-pf="retry"]'), 'もう一回送る');
  // つながるようになったら「もう一回送る」で同じ記録が載る
  db.down = false;
  const timeMs = await page.evaluate(() => Math.floor(G.timeMs));
  await page.click('#ta-post [data-pf="retry"]');
  await msgShown(page, '載せたよ！');
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].time_ms, timeMs);
}, { supabase: 'down' });

// 前の端末で引き継いだあとにクリア → not_found。知らせを1回出して、作るフォームに変わる
t('lost_after_transfer', async (page, { db }) => {
  await withProfile(page, db);
  db.profiles.length = 0;   // 別の端末に引き継がれた
  await clearTimeAttack(page);
  await page.locator('.toast', { hasText: 'このプロフィールは別の端末に引き継がれたよ' }).waitFor();
  await page.locator('#ta-post form').waitFor();
  assert.equal(await text(page, '#ta-post form .btn'), 'プロフィールを作って載せる');
  assert.equal(await stored(page, 'profile'), null);
  assert.equal(db.rows.length, 0);
  assert.equal(await page.locator('.toast', { hasText: '引き継がれた' }).count(), 1);
  assert.equal(await page.isHidden('#ta-open'), true);
  // その場で作り直して載せられる
  await send(page, 'ミケ');
  await msgShown(page, '載せたよ！');
  assert.equal(db.rows.length, 1);
});

t('rank_preview_failure_keeps_box', async (page, { db, warnings }) => {
  delete db.rpc.rank_of; // rank_of だけ 404 にする
  await withProfile(page, db);
  await clearTimeAttack(page);
  // 画面には出さないが、HTTP の状態つきでコンソールに残る
  assert.ok(await warned(warnings, /^ranking rankOf .*rank_of: HTTP 404/), warnings.join('\n'));
  await msgShown(page, '載せたよ！');
  assert.equal(await text(page, '#ta-post .tamsg'), '載せたよ！ 歴代1位・今週1位');
  assert.equal(db.calls.filter(c => c.name === 'rank_of').length, 1);
  assert.equal(await page.locator('#ta-rank').textContent(), '');
  assert.equal(db.rows.length, 1);
});

// 「ランキングを見る」はこの条件の board で openRanking を呼ぶ（openRanking は差し替えて確かめる）
t('open_button_passes_board', async (page, { db }) => {
  await withProfile(page, db);
  await page.evaluate(() => { window.openRanking = board => { window.openedBoard = board; }; });
  await clearTimeAttack(page, { mode: 'n2f', region: 'オセアニア', count: 'all' });
  const n = await page.evaluate(() => G.set.length);
  assert.match(await text(page, '#rcard'), new RegExp(`国名 → 国旗／オセアニア／全部（${n}問）`));
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
  assert.equal(await page.locator('#ta-post').count(), 0);
  assert.equal(await page.locator('#ta-rank').textContent(), '');
  assert.equal(db.calls.length, 0);
  assert.equal(await page.isVisible('#r-again'), true);
});

// profile.js が読めない（配信漏れ・古いキャッシュ）ときは、載せられないことだけ伝える
t('without_profile_js', async (page, { db }) => {
  await clearTimeAttack(page);
  await rankShown(page);
  assert.equal(await text(page, '#ta-post'), 'ページを読み直してね');
  assert.equal(submits(db).length, 0);
}, { blockScripts: ['profile.js'] });
