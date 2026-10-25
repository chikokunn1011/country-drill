// タイムアタック（1ミス失格・タイマー）の遊びの流れ。スマホ幅で確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerCorrect, answerWrong } from './helpers.mjs';

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

t('practice_unchanged', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  assert.equal(await text(page, '#ptime'), '');
  await answerCorrect(page);
  assert.equal(await page.locator('.reveal').count(), 1);
  assert.equal(await text(page, '#next'), '次の問題 →');
  await page.waitForTimeout(100);
  assert.equal(await text(page, '#ptime'), '');
});
