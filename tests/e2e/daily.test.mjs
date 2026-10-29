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
// プロフィールが無い人の「載せる」箱: 名前を入れて［プロフィールを作って載せる］
const createAndPost = async (page, name) => { await page.fill('#dl-post input', name); await page.click('#dl-post form button'); };
// 偽DB と localStorage にプロフィール（チコ）を入れて開き直す
const PID = 'dailypid0001';
async function openWithProfile(page, db, { auto = true } = {}) {
  db.profiles.push({ id: 1, token: 'tok-d', nickname: 'チコ', pid: PID });
  await page.evaluate(a => localStorage.setItem('profile', JSON.stringify({ token: 'tok-d', pid: 'dailypid0001', name: 'チコ', auto: a, isPublic: true, sent: { isPublic: true } })), auto);
  await page.reload();
  await page.waitForFunction(() => window.PROFILE);
}
const failAt3 = async page => {
  await startDailyFromHome(page);
  for (let i = 0; i < 3; i++) await answerCorrect(page);
  await answerWrong(page);
  await page.click('#next');
};

t('home_entry_and_intro', async page => {
  assert.match(await text(page, '#home-daily'), /今日の難問[\s\S]*NEW/);
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
  await createAndPost(page, 'チコ');
  await page.locator('#dl-list li').first().waitFor();
  assert.equal(app.db.dailyRows.length, 1);
  assert.equal(app.db.profiles.length, 1, 'プロフィールができる');
  assert.deepEqual({ ...app.db.dailyRows[0], created_at: 0 }, { day: await today(page), profile_id: app.db.profiles[0].id, nickname: 'チコ', correct: 3, total: 20, time_ms: Math.floor(r.timeMs), created_at: 0 });
  assert.match(await text(page, '#dl-list'), /チコ\s*3問/);
  assert.equal(await page.locator('#dl-post form').count(), 0, '載せたらフォームは消える');
  assert.match(await text(page, '#dl-main'), /「チコ」で載せたよ！/);
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
  await createAndPost(page, 'はやい人');
  await page.locator('#dl-list li').first().waitFor();
  assert.match(await text(page, '#dl-list'), /はやい人\s*全問正解/);
  assert.equal(app.db.dailyRows[0].correct, 20);
});

t('reload_cannot_retry', async page => {
  await startDailyFromHome(page);
  await answerCorrect(page); await answerCorrect(page);
  const t2 = (await rec(page)).timeMs;
  await page.waitForTimeout(600);
  await page.reload();
  // 閉じた時点のタイムで終わり（最後に正解した時点ではない）
  assert.ok((await rec(page)).timeMs >= t2 + 500, JSON.stringify(await rec(page)));
  await page.click('#home-daily');
  assert.equal(await page.locator('#dl-start').count(), 0, 'もう挑戦できない');
  assert.match(await text(page, '#dl-main'), /とちゅうでやめた/);
  assert.match(await text(page, '#dl-main'), /2\s*\/ 20 問正解/);
  assert.equal(await page.isVisible('#dl-post form'), true, '途中までの記録も載せられる');
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
  await createAndPost(page, 'チコ');
  await page.locator('#dl-post .tamsg.ng').waitFor();
  assert.match(await text(page, '#dl-post .tamsg'), /接続できなかった/);
}, { supabase: 'down' });

// 別のタブで開いても、遊んでいるタブの記録は止まらない
t('second_tab_does_not_stop_play', async (page, app) => {
  await startDailyFromHome(page);
  await answerCorrect(page);
  const other = await app.context.newPage();
  await other.goto(page.url());
  await other.click('#home-daily');
  assert.match(await other.locator('#dl-main').innerText(), /別のタブで挑戦中/);
  assert.equal(await other.locator('#dl-start').count(), 0);
  await page.bringToFront();
  for (let i = 1; i < 20; i++) await answerCorrect(page);
  await page.locator('#scr-daily').waitFor();
  const r = await rec(page);
  assert.equal(r.correct, 20); assert.equal(r.outcome, 'clear');
  await other.close();
});

// 0時をまたいだ人は、0時30分まで昨日の記録を載せられる（日本時間 10/29 0:10 にする）
const at = iso => `{ const off = Date.parse('${iso}') - Date.now(), D = Date;
  globalThis.Date = class extends D { constructor(...a) { super(...(a.length ? a : [D.now() + off])); } static now() { return D.now() + off; } }; }`;
t('after_midnight_can_send_yesterday', async (page, app) => {
  assert.equal(await today(page), '2026-10-29');
  await page.click('#home-daily');
  assert.match(await text(page, '#dl-main'), /昨日（10月28日）の挑戦の記録/);
  assert.match(await text(page, '#dl-main'), /5\s*\/ 20 問正解/);
  await createAndPost(page, 'よふかし');
  await page.locator('#dl-list li').first().waitFor();
  assert.equal(app.db.dailyRows[0].day, '2026-10-28');
  // 載せたあとは今日の挑戦ができる
  assert.equal(await page.isVisible('#dl-start'), true);
}, { init: at('2026-10-28T15:10:00Z'), storage: { daily: { day: '2026-10-28', sid: 'x', status: 'done', outcome: 'fail', correct: 5, timeMs: 9000, sent: null } } });

t('after_half_past_midnight_yesterday_is_closed', async page => {
  await page.click('#home-daily');
  assert.equal(await page.isVisible('#dl-start'), true);
  assert.equal(await page.locator('#dl-post').count(), 0);
}, { init: at('2026-10-28T15:31:00Z'), storage: { daily: { day: '2026-10-28', sid: 'x', status: 'done', outcome: 'fail', correct: 5, timeMs: 9000, sent: null } } });

// プロフィールがあって自動 ON なら、終わったらすぐ載る（名前の入力は出ない）
t('auto_submit_after_daily', async (page, app) => {
  await openWithProfile(page, app.db);
  await failAt3(page);
  await page.locator('#dl-post .tamsg.ok').waitFor();
  assert.match(await text(page, '#dl-post'), /「チコ」で載せたよ！ 今日1位/);
  assert.equal(await page.locator('#dl-post form').count(), 0);
  assert.equal(app.db.dailyRows.length, 1);
  assert.equal(app.db.dailyRows[0].profile_id, 1);
  assert.deepEqual((await rec(page)).sent, { name: 'チコ', rank: 1 });
  // 表の自分の行は pid で色を変え、名前は押せる
  await page.locator('#dl-list li.me').waitFor();
  assert.equal(await page.locator('#dl-list li.me .pf-name').getAttribute('data-pid'), PID);
  // 開き直しても送り直さない
  await page.reload();
  await page.click('#home-daily');
  assert.match(await text(page, '#dl-main'), /「チコ」で載せたよ！/);
  assert.equal(app.db.dailyRows.length, 1);
});

// 自動 OFF なら［チコ で載せる］を押したときだけ
t('manual_when_auto_off', async (page, app) => {
  await openWithProfile(page, app.db, { auto: false });
  await failAt3(page);
  await page.locator('#dl-post [data-pf="send"]').waitFor();
  assert.equal(app.db.dailyRows.length, 0);
  await page.click('#dl-post [data-pf="send"]');
  await page.locator('#dl-post .tamsg.ok').waitFor();
  assert.equal(app.db.dailyRows.length, 1);
});

// 送っている途中に開き直しても、送るのは1回。新しい箱にも順位つきの「載せたよ！」が出る
t('reopen_while_sending_sends_once', async (page, app) => {
  await page.route('**/rest/v1/rpc/submit_daily2', async route => { await new Promise(ok => setTimeout(ok, 1500)); await route.fallback(); });
  await openWithProfile(page, app.db);
  await failAt3(page);
  await page.locator('#dl-post .tamsg', { hasText: '送信中' }).waitFor();
  await page.click('#brand');
  await page.click('#home-daily');
  await page.locator('#dl-post .tamsg.ok').waitFor();
  assert.match(await text(page, '#dl-post'), /「チコ」で載せたよ！ 今日1位/);
  assert.equal(app.db.calls.filter(c => c.name === 'submit_daily2').length, 1);
  assert.equal(app.db.dailyRows.length, 1);
  assert.deepEqual((await rec(page)).sent, { name: 'チコ', rank: 1 });
});

// 今日の難問の画面を離れたら「載せる」箱を外す。あとで自動を ON にしても、載せないままにした記録は送らない
t('left_daily_box_stays_quiet', async (page, app) => {
  await openWithProfile(page, app.db, { auto: false });
  await failAt3(page);
  await page.locator('#dl-post [data-pf="send"]').waitFor();
  await page.click('#brand');
  assert.equal(await page.locator('#dl-post').count(), 0);
  await page.evaluate(() => PROFILE.setAuto(true));
  await page.waitForTimeout(300);
  assert.equal(app.db.calls.filter(c => c.name === 'submit_daily2').length, 0);
  assert.equal(app.db.dailyRows.length, 0);
});

// 前に送ったのに返事が届かなかった（サーバーにはもう今日の行がある）: 「もう載せてあるよ」で、載せたことにする
t('already', async (page, app) => {
  await openWithProfile(page, app.db);
  app.db.dailyRows.push({ day: await today(page), profile_id: 1, nickname: 'チコ', correct: 3, total: 20, time_ms: 5000, created_at: new Date().toISOString() });
  await failAt3(page);
  await page.locator('#dl-post .tamsg.ok').waitFor();
  assert.match(await text(page, '#dl-post'), /もう載せてあるよ/);
  assert.equal(app.db.dailyRows.length, 1);
  assert.equal((await rec(page)).sent.name, 'チコ');
});

// ランキングの名前の横にかざり、押すとプロフィールの窓。古い記録（pid なし）は押せない
t('daily_ranking_opens_card', async (page, app) => {
  const day = await today(page), at = new Date().toISOString();
  app.db.profiles.push({ id: 1, pid: 'mikepid00001', token: 'mike', nickname: 'ミケ', deco: ['jp', 'br'] });
  app.db.dailyRows.push({ day, profile_id: 1, nickname: 'ミケ', correct: 20, total: 20, time_ms: 30000, created_at: at });
  app.db.dailyRows.push({ day, nickname: 'むかし', correct: 5, total: 20, time_ms: 9000, created_at: at });
  await page.click('#home-daily');
  await page.locator('#dl-list li').nth(1).waitFor();
  assert.equal(await page.locator('#dl-list li').first().locator('.rr-deco img').count(), 2);
  assert.equal(await page.locator('#dl-list li').nth(1).locator('.pf-name').count(), 0, '古い記録は押せない');
  assert.equal(await page.locator('#dl-list li.me').count(), 0);
  await page.click('#dl-list .pf-name');
  await page.locator('#pf-card .pf-card-name').waitFor();
  assert.match(await text(page, '#pf-card'), /ミケ/);
});
