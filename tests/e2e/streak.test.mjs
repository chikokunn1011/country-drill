// れんぞく日数（A5・streak.js）: ホームの #home-status の最後に1行のかたまり（本文・今日あそぶと…・今週の7マス）を出す。
// 時計は日本時間 2026-10-28（水）12:00 に固定する（daily.test.mjs の at と同じやり方）。週は 10/26 月〜11/1 日
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, QUIET_BADGES, pickSetup, clearByAnswering, answerCorrect, answerWrong } from './helpers.mjs';
import { openRpg, saveWith, startBattle, winBattle } from './rpg_helpers.mjs';
import { settleLayout, measureFit } from './layout.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const at = iso => `{ const off = Date.parse('${iso}') - Date.now(), D = Date;
  globalThis.Date = class extends D { constructor(...a) { super(...(a.length ? a : [D.now() + off])); } static now() { return D.now() + off; } }; }`;
const NOON = at('2026-10-28T03:00:00Z');
// 既定: 時計は 10/28 12:00、札の出ないバッジ。streak を渡せばそれを localStorage に入れる。最後にページの例外が0件か見る
const t = (name, fn, { streak, storage, init, ...opts } = {}) => test(name, { timeout: 60_000 }, async () => {
  const st = { badges: QUIET_BADGES, ...storage };
  if (streak !== undefined) st.streak = streak;
  const app = await openApp(browser, { url: server.url, storage: st, init: init ? `${NOON}\n${init}` : NOON, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const S = (o = {}) => ({ v: 1, cur: 5, best: 12, last: '2026-10-27', played: ['2026-10-27'], rest: [], ...o });
const row = page => page.locator('#home-status > #streak');
const rowText = page => row(page).innerText();
const marks = page => page.$$eval('#streak .sk-day', es => es.map(e => e.dataset.mark));
// 札つきのバッジ（home.test の TITLED と同じ）
const TITLED = { v: 1, got: { 'first-clear@1': 1 }, eq: 'first-clear@1', sn: { 'first-clear': 2 }, sent: ['first-clear@1'] };

t('home_row_first_time', async page => {
  const r = row(page);
  assert.equal(await r.getAttribute('role'), 'group');
  assert.equal(await r.getAttribute('aria-label'), 'れんぞく日数');
  const s = await rowText(page);
  assert.match(s, /0日れんぞく・お休み券1枚/);
  assert.match(s, /今日あそぶと1日目/);
  assert.ok(!s.includes('さいこう'), s);   // best ≤ cur のときは出さない
  assert.equal(await page.isVisible('#home-status'), true);
  assert.equal(await page.$eval('#home-status', e => e.lastElementChild.id), 'streak');
  assert.ok(!(await page.locator('#scr-home').innerText()).includes('首都'));
});

t('home_row_keep', async page => {
  const s = await rowText(page);
  assert.match(s, /5日れんぞく（さいこう12日）・お休み券1枚/);
  assert.match(s, /今日あそぶと6日に！/);
  assert.equal(await page.locator('#streak .sk-day').count(), 7);
  assert.deepEqual(await marks(page), ['miss', 'play', 'today', 'future', 'future', 'future', 'future']);
  assert.deepEqual(await page.$$eval('#streak .sk-day', es => es.map(e => e.dataset.day)),
    ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
}, { streak: S() });

t('home_row_rest', async page => {
  const s = await rowText(page);
  assert.match(s, /きのうはお休み券でつながるよ/);
  assert.match(s, /お休み券0枚/);
  assert.deepEqual(await marks(page), ['play', 'rest', 'today', 'future', 'future', 'future', 'future']);
}, { streak: S({ last: '2026-10-26', played: ['2026-10-26'] }) });

t('home_row_broken', async page => {
  const s = await rowText(page);
  assert.match(s, /0日れんぞく（さいこう9日）/);
  assert.match(s, /今日あそぶと1日目/);
}, { streak: S({ last: '2026-10-20', cur: 9, best: 9, played: ['2026-10-20'] }) });

for (const [name, bad] of [['string', 'garbage'], ['v2', { v: 2, cur: 3 }], ['negative', S({ cur: -1 })], ['float', S({ cur: 1.5 })],
  ['bad_day', S({ last: '2026-02-30' })], ['played_not_array', S({ played: 'x' })]])
  t(`home_row_broken_data_${name}`, async page => {
    const s = await rowText(page);
    assert.match(s, /0日れんぞく・お休み券1枚/);
    assert.match(s, /今日あそぶと1日目/);
  }, { streak: bad });

// JSON でもない文字が入っていても同じ
t('home_row_broken_data', async page => {
  assert.match(await rowText(page), /0日れんぞく・お休み券1枚[\s\S]*今日あそぶと1日目/);
}, { init: `try { localStorage.setItem('streak', '{not json'); } catch {}` });

t('home_row_today', async page => {
  assert.match(await rowText(page), /5日れんぞく（さいこう12日）/);
  assert.equal((await page.locator('#streak .sk-hint').textContent() ?? '').trim(), '');
}, { streak: S({ last: '2026-10-28', played: ['2026-10-27', '2026-10-28'] }) });

// 端末の時計が戻った（今日 < last）: 今日あそんだと同じ表示で、壊さない
t('home_row_clock_back', async page => {
  assert.match(await rowText(page), /5日れんぞく/);
  assert.equal((await page.locator('#streak .sk-hint').textContent() ?? '').trim(), '');
}, { streak: S({ last: '2026-10-30', played: ['2026-10-30'] }) });

t('redraw_on_home', async page => {
  assert.match(await rowText(page), /0日れんぞく/);
  await page.evaluate(s => { localStorage.setItem('streak', JSON.stringify(s)); show('setup'); show('home'); }, S());
  assert.match(await rowText(page), /5日れんぞく（さいこう12日）/);
  assert.equal(await page.locator('#streak').count(), 1);
  assert.equal(await page.$eval('#home-status', e => e.lastElementChild.id), 'streak');
});

// 称号の札は先頭、れんぞく日数は最後
t('after_title_row', async page => {
  assert.deepEqual(await page.$$eval('#home-status > *', es => es.map(e => e.id || e.className)), ['bdg-titlerow', 'streak']);
}, { storage: { badges: TITLED }, streak: S() });

// 収まらない幅では7マスを隠して、押すと開く小窓で見せる。どの幅でも横にスクロールしない
const fits = page => page.$eval('#streak', e => ({ narrow: e.classList.contains('narrow'), over: e.scrollWidth > e.clientWidth,
  open: getComputedStyle(e.querySelector('.sk-open')).display !== 'none' && e.querySelector('.sk-open').checkVisibility() }));
t('narrow_week_popup', async page => {
  await settleLayout(page);
  assert.equal(await page.$eval('#streak', e => e.classList.contains('narrow')), true);
  assert.equal(await page.isVisible('#streak .sk-week'), false);
  assert.equal(await page.isVisible('#streak .sk-open'), true);
  assert.equal(await page.getAttribute('#streak .sk-open', 'aria-expanded'), 'false');
  assert.equal(await page.getAttribute('#streak .sk-open', 'aria-controls'), 'sk-week');
  await page.click('#streak .sk-open');
  assert.equal(await page.isVisible('#streak .sk-week'), true);
  assert.equal(await page.getAttribute('#streak .sk-open', 'aria-expanded'), 'true');
  const [w, vw] = await page.evaluate(() => [document.querySelector('#streak .sk-week').getBoundingClientRect().toJSON(), innerWidth]);
  assert.ok(w.left >= 0 && w.right <= vw, `小窓が画面の外 ${JSON.stringify(w)}`);
  assert.equal((await measureFit(page)).hscroll, false);
  await page.click('#streak .sk-open');
  assert.equal(await page.isVisible('#streak .sk-week'), false);
  assert.equal(await page.getAttribute('#streak .sk-open', 'aria-expanded'), 'false');
}, { viewport: { width: 320, height: 640 }, streak: S({ cur: 9999, best: 99999, last: '2026-10-27' }) });

t('week_fits_or_popup', async page => {
  for (const [width, height] of [[320, 640], [360, 740], [390, 844], [1024, 768], [1280, 800], [1366, 657]]) {
    await page.setViewportSize({ width, height });
    await settleLayout(page);
    const f = await fits(page);
    assert.ok((!f.narrow && !f.over) || (f.narrow && f.open), `${width}: ${JSON.stringify(f)}`);
    assert.equal((await measureFit(page)).hscroll, false, String(width));
  }
  // ふつうの数なら、スマホ（360）でも7マスは同じかたまりの中に見える
  await page.setViewportSize({ width: 360, height: 740 });
  await settleLayout(page);
  assert.equal(await page.isVisible('#streak .sk-week'), true);
  assert.equal(await page.isVisible('#streak .sk-open'), false);
}, { viewport: { width: 360, height: 740 }, storage: { badges: TITLED }, streak: S() });

// 大きな数でも 1366×657 のホームは縦にも横にもスクロールしない（称号の札あり）
t('pc_home_fits', async page => {
  for (const [width, height] of [[1366, 657], [1280, 577]]) {
    await page.setViewportSize({ width, height });
    await settleLayout(page);
    const fit = await measureFit(page);
    assert.equal(fit.hscroll, false, `${width}x${height}`);
    assert.ok(fit.docH <= fit.ih, `${width}x${height}: 縦にスクロールする ${fit.docH}/${fit.ih}`);
    assert.match(await rowText(page), /99999日れんぞく/);
  }
}, { viewport: { width: 1366, height: 657 }, storage: { badges: TITLED }, streak: S({ cur: 99999, best: 99999, last: '2026-10-27' }) });

t('missing_streak_js', async page => {
  assert.equal(await page.locator('#streak').count(), 0);
}, { blockScripts: ['streak.js'] });

t('missing_home_status', async (page, app) => {
  assert.equal(await page.locator('#streak').count(), 0);
  for (let i = 0; i < 50 && !app.consoleErrors.some(s => /\[streak\]/.test(s)); i++) await page.waitForTimeout(20);
  assert.ok(app.consoleErrors.some(s => /\[streak\]/.test(s)), app.consoleErrors.join('\n'));
}, { init: `new MutationObserver(() => document.getElementById('home-status')?.remove()).observe(document, { childList: true, subtree: true });` });

/* ---------- 遊んだ日を数える（Task 3）: クイズの clear・fail、今日の難問の終わり（clear・fail）、冒険のバトル。quit は数えない ---------- */
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('streak')));
// 出たトーストの文字を window.__toasts に積む
const TOASTS = `window.__toasts = []; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes)
  if (n.nodeType === 1 && n.classList.contains('toast')) window.__toasts.push(n.textContent); }).observe(document, { childList: true, subtree: true });`;
const practice = async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await clearByAnswering(page);
};

t('practice_counts_once', async page => {
  await practice(page);
  const a = await saved(page);
  assert.equal(a.cur, 1); assert.equal(a.last, '2026-10-28'); assert.deepEqual(a.played, ['2026-10-28']);
  await page.evaluate(() => show('home'));
  await practice(page);
  assert.equal((await saved(page)).cur, 1);
  assert.deepEqual((await saved(page)).played, ['2026-10-28']);
  await page.evaluate(() => show('home'));
  assert.match(await rowText(page), /1日れんぞく/);
  assert.equal((await page.locator('#streak .sk-hint').textContent()).trim(), '');
  assert.deepEqual((await page.evaluate(() => window.__toasts)).filter(x => x.includes('日れんぞく')), []);   // トーストは出さない
}, { init: TOASTS });

t('ta_fail_counts', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'ta', region: 'all', count: 5 });
  await page.click('#start');
  await answerWrong(page);
  assert.equal((await saved(page))?.last, '2026-10-28');
});

t('quit_not_counted', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await answerCorrect(page);
  await page.evaluate(() => show('home'));   // 途中で離れた（drill:result の quit）
  assert.equal(await page.evaluate(() => localStorage.getItem('streak')), null);
  assert.match(await rowText(page), /今日あそぶと1日目/);
});

t('daily_counts', async page => {
  await page.click('#home-daily');
  await page.click('#dl-start');
  await page.locator('#scr-quiz').waitFor();
  await answerWrong(page);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('streak'))?.last === '2026-10-28');
  assert.equal((await saved(page)).cur, 6);
}, { streak: S() });

test('battle_counts', { timeout: 60_000 }, async () => {
  const app = await openRpg(browser, { url: server.url, seed: 1, init: NOON, storage: { rpg: saveWith({}) } });
  try {
    const { page } = app;
    await startBattle(page, 'samerica', 1);
    await winBattle(page);
    assert.equal((await saved(page))?.last, '2026-10-28');
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
