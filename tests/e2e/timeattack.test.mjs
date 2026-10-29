// タイムアタック（1ミス失格・タイマー）の遊びの流れ。スマホ幅で確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerCorrect, answerWrong, settle, clearTimeAttack } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで開き、最後にページで例外が出ていないかも見る
const t = (name, fn) => test(name, { timeout: 30_000 }, async () => {
  const app = await openApp(browser);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const text = (page, sel) => page.locator(sel).innerText();
const startTa = async page => { await pickSetup(page, { mode: 'f2n', kind: 'ta', region: 'all', count: 5 }); await page.click('#start'); };
const seconds = s => parseFloat(s.replace(/^\d+分/, ''));

t('ta_kind_exists', async page => {
  await pickSetup(page);
  const card = page.locator('#kinds .modecard[data-k="ta"]');
  assert.equal(await card.count(), 1);
  assert.match(await card.innerText(), /タイムアタック/);
  assert.match(await card.innerText(), /1ミスで失格。クリアタイムでランキングに挑戦/);
});

t('name_option_hidden', async page => {
  await pickSetup(page, { mode: 'm2f', kind: 'practice' });
  assert.equal(await page.isVisible('#nameopt-field'), true);
  await page.check('#nameopt');
  await pickSetup(page, { kind: 'ta' });
  assert.equal(await page.isHidden('#nameopt-field'), true);
  await pickSetup(page, { kind: 'practice' });
  assert.equal(await page.isVisible('#nameopt-field'), true);
  assert.equal(await page.isChecked('#nameopt'), true);
});

t('ta_no_names_in_choices', async page => {
  // 練習なら国名が出る状態にしておく（比較のため一度確かめる）
  await pickSetup(page, { mode: 'm2f', kind: 'practice', region: 'all', count: 5 });
  await page.check('#nameopt');
  await page.click('#start');
  assert.equal(await page.locator('.cname').count(), 4);
  await page.click('#quit');
  await pickSetup(page, { kind: 'ta' });
  await page.click('#start');
  assert.equal(await page.evaluate(() => P.name), true);
  assert.equal(await page.locator('.choice').count(), 4);
  assert.equal(await page.locator('.cname').count(), 0);
});

t('ta_clear_flow', async page => {
  await startTa(page);
  for (let i = 1; i <= 5; i++) {
    assert.equal(await text(page, '#pnum'), `${i} / 5`);
    assert.equal(await text(page, '#pscore'), '');
    await answerCorrect(page);
    if (i < 5) {
      assert.equal(await page.locator('.reveal').count(), 0);
      assert.equal(await page.isVisible('#scr-quiz'), true);
    }
  }
  assert.equal(await page.isVisible('#scr-result'), true);
  assert.equal(await page.isHidden('#scr-quiz'), true);
  const ms = await page.evaluate(() => G.timeMs);
  assert.equal(typeof ms, 'number');
  assert.ok(ms > 0, `timeMs=${ms}`);
  assert.equal(await page.evaluate(() => G.failed), false);
});

t('timer_ticks', async page => {
  await startTa(page);
  await page.waitForTimeout(300);
  const s = await text(page, '#ptime');
  assert.match(s, /秒/);
  assert.ok(seconds(s) > 0, s);
});

t('ta_fail_flow', async page => {
  await startTa(page);
  await answerCorrect(page);
  await answerWrong(page);
  assert.match(await text(page, '.reveal'), /失格/);
  assert.equal(await text(page, '#next'), 'もう一回');
  assert.equal(await page.locator('.reveal .btn.ghost', { hasText: 'モード選択へ' }).count(), 1);
  assert.equal(await page.evaluate(() => G.failed), true);
  const stopped = await text(page, '#ptime');
  await page.waitForTimeout(500);
  assert.equal(await text(page, '#ptime'), stopped);

  const t0 = await page.evaluate(() => G.t0);
  await page.click('#next');
  assert.equal(await text(page, '#pnum'), '1 / 5');
  assert.equal(await page.locator('.reveal').count(), 0);
  assert.equal(await page.evaluate(() => G.failed), false);
  assert.ok(await page.evaluate(() => G.t0) > t0);
});

t('fail_to_setup', async page => {
  await startTa(page);
  await answerWrong(page);
  await page.click('.reveal .btn.ghost');
  assert.equal(await page.isVisible('#scr-setup'), true);
});

t('enter_key_on_fail_screen', async page => {
  await startTa(page);
  await answerCorrect(page);
  // 正解で次へ進んだあと（#next が無い）に Enter を押しても何も起きない
  await page.keyboard.press('Enter');
  assert.equal(await text(page, '#pnum'), '2 / 5');
  await answerWrong(page);
  const t0 = await page.evaluate(() => G.t0);
  await page.keyboard.press('Enter'); // 「もう一回」にフォーカスがある状態
  assert.equal(await text(page, '#pnum'), '1 / 5');
  assert.equal(await page.evaluate(() => G.failed), false);
  assert.ok(await page.evaluate(() => G.t0) > t0);

  // フォーカスが外れていても keydown ハンドラが「もう一回」を押す
  await answerWrong(page);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.reveal').count(), 0);
  assert.equal(await page.evaluate(() => G.failed), false);
});

// 正解するとすぐ同じ場所に次の問題が出るので、ダブルクリックの2回目やキーの押しっぱなしで次の問題に答えてしまわないこと。
// 問題を出してから TA_GUARD_MS の間のクリックは無視し、それを過ぎたクリックは速い連打（detail が 2）でも数える
t('ta_click_guard', async page => {
  await startTa(page);
  await settle(page);
  const a = await page.evaluate(() => G.cur.c.a);
  await page.dblclick(`.choice[data-a="${a}"]`); // 2回目は次の問題が出た直後に届く
  assert.equal(await page.evaluate(() => G.done), 1);
  assert.equal(await text(page, '#pnum'), '2 / 5');

  // 出た直後の問題の正解を押しても数えない（同じ処理の中で続けて押すので、確実に直後になる）
  await settle(page);
  const done = await page.evaluate(() => {
    const correct = () => document.querySelector(`.choice[data-a="${G.cur.c.a}"]`);
    correct().click(); // 2問目に正解して、3問目が出る
    correct().click(); // 3問目が出た直後なので無視
    return G.done;
  });
  assert.equal(done, 2);
  assert.equal(await text(page, '#pnum'), '3 / 5');

  // 無視する時間を過ぎたら、ダブルクリックの2回目と同じ detail=2 のクリックでも答えになる
  await settle(page);
  const c = await page.evaluate(() => G.cur.c.a);
  await page.locator(`.choice[data-a="${c}"]`).dispatchEvent('click', { detail: 2 });
  assert.equal(await page.evaluate(() => G.done), 3);
  assert.equal(await page.evaluate(() => G.failed), false);
  assert.equal(await text(page, '#pnum'), '4 / 5');
});

t('ta_held_number_key', async page => {
  await startTa(page);
  await settle(page);
  const key = String(await page.evaluate(() => G.cur.opts.findIndex(o => o.a === G.cur.c.a)) + 1);
  await page.keyboard.down(key);
  assert.equal(await page.evaluate(() => G.done), 1);
  // 無視する時間が過ぎても、押しっぱなしの自動リピート（e.repeat が true）では次の問題に答えない
  await settle(page);
  await page.keyboard.down(key);
  await page.keyboard.up(key);
  assert.equal(await page.evaluate(() => G.done), 1);
  assert.equal(await page.evaluate(() => G.failed), false);
  assert.equal(await text(page, '#pnum'), '2 / 5');
});

t('practice_unchanged', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  assert.equal(await text(page, '#ptime'), '');
  // 練習では問題が出た直後のクリックも無視しない
  await page.evaluate(() => { startGame(); document.querySelector(`.choice[data-a="${G.cur.c.a}"]`).click(); });
  assert.equal(await page.evaluate(() => G.done), 1);
  assert.equal(await page.locator('.reveal').count(), 1);
  assert.equal(await text(page, '#next'), '次の問題 →');
  await page.waitForTimeout(100);
  assert.equal(await text(page, '#ptime'), '');
});

// ranking.js が配信されていない・読めないときも、ランキングなしで練習もタイムアタックも遊べる
t('works_without_ranking_js', async page => {
  await page.route('**/ranking.js*', route => route.abort());
  await page.reload();
  assert.equal(await page.evaluate(() => RANKING.enabled), false);
  // 代わりの formatTime も ranking.js と同じ形で出す
  assert.deepEqual(await page.evaluate(() => [0, 12349.9, 61234, 600000].map(RANKING.formatTime)), ['0.00秒', '12.34秒', '1分01.23秒', '10分00.00秒']);
  assert.equal(await page.isVisible('#home-play'), true);
  assert.equal(await page.isHidden('#home-rank'), true);

  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await answerCorrect(page);
  assert.equal(await text(page, '#next'), '次の問題 →');
  await page.click('#quit');

  await startTa(page);
  // 計測はもう動いているので、ぴったり 0.00秒 とは限らない（並列で重いと 0.0x秒 になる）。1秒未満なら 0 から始まっている
  assert.match(await text(page, '#ptime'), /^0\.\d{2}秒$/);
  await answerWrong(page);
  assert.match(await text(page, '.reveal'), /失格/);
  assert.match(await text(page, '#ptime'), /^\d+\.\d{2}秒$/);
  await page.click('.reveal .btn.ghost');

  await clearTimeAttack(page);
  assert.match(await text(page, '#ta-time'), /^(\d+分)?\d+\.\d{2}秒$/);
  assert.equal(await page.locator('#ta-post').count(), 0);
  assert.equal(await page.isVisible('#r-again'), true);
  await page.click('#brand');
  assert.equal(await page.isHidden('#home-rank'), true);
});
