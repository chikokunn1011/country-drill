// 設定「正解したらすぐ次の問題へ」（settings.quick、はじめは OFF）。ON だと練習・挑戦でも正解で答えを出さずに次の問題へ、まちがえたら今どおり答え合わせ
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerCorrect, answerWrong, settle } from './helpers.mjs';

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
const start = async (page, kind) => { await pickSetup(page, { mode: 'f2n', kind, region: 'all', count: 5 }); await page.click('#start'); };
const ON = { storage: { settings: { quick: true } } };

t('default_off_shows_reveal', async page => {
  await page.click('#home-settings');
  assert.equal(await page.isChecked('#set-quick'), false);
  await start(page, 'practice');
  await answerCorrect(page);
  assert.ok(await page.isVisible('#qcard .reveal'));
  assert.ok(await page.isVisible('#next'));
});

t('toggle_saves_setting', async page => {
  await page.click('#home-settings');
  await page.check('#set-quick');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('settings')).quick), true);
  await page.uncheck('#set-quick');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('settings')).quick), false);
});

for (const kind of ['practice', 'challenge']) {
  t(`on_${kind}_correct_goes_next_and_finishes`, async page => {
    await start(page, kind);
    assert.match(await page.textContent('.rslot-hint'), /まちがえたら/);
    for (let i = 0; i < 5; i++) {
      const before = await page.evaluate(() => G.cur.c.a);
      await answerCorrect(page);
      if (i < 4) {
        assert.equal(await page.locator('#qcard .reveal').count(), 0);
        assert.notEqual(await page.evaluate(() => G.cur.c.a), before);
        assert.equal(await page.evaluate(() => G.answered), false);
      }
    }
    await page.locator('#scr-result').waitFor();
  }, ON);
}

t('on_wrong_still_shows_answer', async page => {
  await start(page, 'practice');
  await answerWrong(page);
  assert.ok(await page.isVisible('#qcard .reveal'));
  assert.match(await page.textContent('#qcard .verdict'), /正解は/);
  await page.click('#next');
  await answerCorrect(page);
  assert.equal(await page.locator('#qcard .reveal').count(), 0);
}, ON);

// すぐ次へ進むので、出した直後のクリック（ダブルクリックの2回目）は次の問題に答えない
t('on_guard_ignores_double_click', async page => {
  await start(page, 'practice');
  await settle(page);
  const a = await page.evaluate(() => G.cur.c.a);
  await page.dblclick(`.choice[data-a="${a}"]`);
  assert.equal(await page.evaluate(() => G.answered), false);
  assert.equal(await page.evaluate(() => G.done), 1);
}, ON);
