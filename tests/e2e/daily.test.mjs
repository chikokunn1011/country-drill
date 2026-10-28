// 今日の難問（daily.js）: 1日1回・1ミスでそこまで・全問正解はタイム・ランキングに載せる・リロードでやり直せない
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, answerCorrect, answerWrong, recordEvents, events, PC } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const text = (page, sel) => page.locator(sel).innerText();
const rec = page => page.evaluate(() => JSON.parse(localStorage.getItem('daily')));
const today = page => page.evaluate(() => DAILY.today());
const startDailyFromHome = async page => { await page.click('#home-daily'); await page.click('#dl-start'); await page.locator('#scr-quiz').waitFor(); };

t('home_entry_and_intro', async page => {
  assert.match(await text(page, '#home-daily'), /今日の難問\s*NEW/);
  await page.click('#home-daily');
  assert.equal(await page.isVisible('#scr-daily'), true);
  assert.match(await text(page, '#dl-main'), /挑戦できるのは1日1回だけ/);
  assert.equal(await page.isVisible('#dl-start'), true);
});

t('same_questions_as_core', async page => {
  await startDailyFromHome(page);
  const qs = await page.evaluate(() => DAILY.questions(DAILY.today()));
  assert.equal(qs.length, 20);
  for (let i = 0; i < 3; i++) {
    // 出ている問題・形式・選択肢の並びが daily-core の通り
    const cur = await page.evaluate(() => ({ a: G.cur.c.a, mode: G.mode.k, opts: [...document.querySelectorAll('#qcard .choice')].map(b => b.dataset.a) }));
    assert.deepEqual(cur, { a: qs[i].a, mode: qs[i].mode, opts: qs[i].opts });
    assert.equal(await text(page, '#pnum'), `${i + 1} / 20`);
    assert.equal(await page.locator('.cname').count(), 0, '国名は出さない');
    await answerCorrect(page);
  }
});

t('fail_ends_and_submit', async (page, app) => {
  await recordEvents(page);
  const missesBefore = await page.evaluate(() => localStorage.getItem('misses'));
  await startDailyFromHome(page);
  assert.equal((await rec(page)).status, 'playing', '押した時点で挑戦ずみ');
  for (let i = 0; i < 3; i++) await answerCorrect(page);
  await answerWrong(page);
  assert.match(await text(page, '.verdict'), /ここまで！/);
  await page.click('#next');
  assert.equal(await page.isVisible('#scr-daily'), true);
  assert.match(await text(page, '#dl-main'), /3\s*\/ 20 問正解/);
  const r = await rec(page);
  assert.equal(r.status, 'done'); assert.equal(r.outcome, 'fail'); assert.equal(r.correct, 3);
  assert.ok(r.timeMs > 0);
  // 今日の答えは、とどいた4問目までしか見せない
  assert.equal(await page.locator('#dl-main .dl-qs li').count(), 4);
  assert.equal(await page.locator('#dl-main .dl-ng').count(), 1);
  // 苦手の記録・バッジや冒険のイベントには入れない
  assert.equal(await page.evaluate(() => localStorage.getItem('misses')), missesBefore);
  assert.deepEqual((await events(page)).filter(e => e.type !== 'drill:screen'), []);
  await page.fill('#dl-name', 'チコ');
  await page.click('#dl-submit');
  await page.locator('#dl-list li').first().waitFor();
  assert.equal(app.db.dailyRows.length, 1);
  assert.deepEqual({ ...app.db.dailyRows[0], created_at: 0 }, { day: await today(page), nickname: 'チコ', correct: 3, total: 20, time_ms: Math.floor(r.timeMs), created_at: 0 });
  assert.match(await text(page, '#dl-list'), /チコ\s*3問/);
  assert.equal(await page.locator('#dl-form').count(), 0, '載せたらフォームは消える');
  assert.equal((await rec(page)).sent.name, 'チコ');
  // ホームの NEW は消える
  await page.click('#brand');
  assert.doesNotMatch(await text(page, '#home-daily'), /NEW/);
});

t('clear_all_20', async (page, app) => {
  await startDailyFromHome(page);
  for (let i = 0; i < 20; i++) await answerCorrect(page);
  await page.locator('#scr-daily').waitFor();
  assert.match(await text(page, '#dl-main'), /全問正解！/);
  const r = await rec(page);
  assert.equal(r.correct, 20); assert.equal(r.outcome, 'clear');
  assert.equal(await page.locator('#dl-main .dl-qs li').count(), 20, '全問といたら全部見える');
  await page.fill('#dl-name', 'はやい人');
  await page.click('#dl-submit');
  await page.locator('#dl-list li').first().waitFor();
  assert.match(await text(page, '#dl-list'), /はやい人\s*全問正解/);
  assert.equal(app.db.dailyRows[0].correct, 20);
});

t('reload_cannot_retry', async page => {
  await startDailyFromHome(page);
  await answerCorrect(page); await answerCorrect(page);
  await page.reload();
  await page.click('#home-daily');
  assert.equal(await page.locator('#dl-start').count(), 0, 'もう挑戦できない');
  assert.match(await text(page, '#dl-main'), /とちゅうでやめた/);
  assert.match(await text(page, '#dl-main'), /2\s*\/ 20 問正解/);
  assert.equal(await page.isVisible('#dl-form'), true, '途中までの記録も載せられる');
});

t('quit_button_confirms', async page => {
  await startDailyFromHome(page);
  await answerCorrect(page);
  page.once('dialog', d => d.dismiss());
  await page.click('#quit');
  assert.equal(await page.isVisible('#scr-quiz'), true, 'キャンセルなら続ける');
  page.once('dialog', d => d.accept());
  await page.click('#quit');
  assert.equal(await page.isVisible('#scr-daily'), true);
  assert.equal((await rec(page)).correct, 1);
  // 普通のクイズに戻ると、やめるボタンの文字も戻る
  await page.evaluate(() => show('setup'));
  await page.click('#start');
  assert.equal(await text(page, '#quit'), 'やめてモード選択へ');
});

t('yesterday_record_lets_play_today_and_shows_answers', async page => {
  const yday = await page.evaluate(() => DAILY_CORE.addDays(DAILY.today(), -1));
  await page.evaluate(y => localStorage.setItem('daily', JSON.stringify({ day: y, status: 'done', outcome: 'fail', correct: 5, timeMs: 9000, sent: null })), yday);
  await page.reload();
  assert.match(await text(page, '#home-daily'), /NEW/);
  await page.click('#home-daily');
  assert.equal(await page.isVisible('#dl-start'), true);
  await page.click('#dl-tabs button[data-t="yday"]');
  assert.equal(await page.locator('#dl-answers .dl-qs li').count(), 20, '昨日の問題と答えは全部');
  assert.equal(await page.locator('#dl-answers .dl-ok').count(), 5);
});

t('pc_layout_no_overflow', async page => {
  await startDailyFromHome(page);
  await answerWrong(page);
  await page.click('#next');
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(over, false);
}, { viewport: PC });

t('ranking_down_quiz_still_works', async page => {
  await page.click('#home-daily');
  await page.locator('#dl-error').waitFor({ state: 'visible' });
  await page.click('#dl-start');
  await answerWrong(page);
  await page.click('#next');
  await page.fill('#dl-name', 'チコ');
  await page.click('#dl-submit');
  await page.locator('#dl-msg.ng').waitFor();
  assert.match(await text(page, '#dl-msg'), /接続できなかった/);
}, { supabase: 'down' });
