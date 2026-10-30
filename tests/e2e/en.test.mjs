// 英語版（PR5）: en/ のページ（Flag Master）。見えている日本語が無いこと（jaLeft）と、日本語版と同じ設定を使うこと
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, jaLeft, warned, QUIET_BADGES } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 英語版を開いて fn(page, app) を呼び、最後にページの例外と [i18n] の warn（辞書に無いキー）が無いかも見る
const t = (name, fn, opts = {}) => test(name, { timeout: 120_000 }, async () => {
  const app = await openApp(browser, { path: 'en/', locale: 'en-US', storage: { badges: QUIET_BADGES }, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.equal(await warned(app.warnings, /\[i18n\]/), false, app.warnings.join('\n'));
  } finally { await app.close(); }
});

t('en_home', async page => {
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.deepEqual(await jaLeft(page), []);
  // 未訳の機能の入口は出さない
  for (const id of ['home-daily', 'home-rpg', 'home-rank', 'home-badges', 'home-profile'])
    assert.equal(await page.isVisible('#' + id), false, id);
  assert.match(await page.title(), /Flag Master/);
  assert.equal((await page.innerText('#home-play .hb-title')).trim(), 'Play quiz');
});

t('en_settings', async page => {
  await page.click('#home-settings');
  await page.waitForSelector('#scr-settings:not([hidden])');
  assert.deepEqual(await jaLeft(page), []);
  const chips = sel => page.$$eval(sel + ' .chip', bs => bs.map(b => b.textContent.trim()));
  assert.deepEqual(await chips('#set-theme'), ['Light', 'Dark', 'Match device']);
  assert.deepEqual(await chips('#set-fs'), ['Normal', 'Large', 'Extra large']);
  // まちがえた記録が無いとき・あるとき（1か国は単数）
  assert.equal((await page.innerText('#set-record')).trim(), 'No mistakes recorded yet');
  await page.evaluate(() => { misses = { jp: 1 }; renderSettings(); });
  assert.equal((await page.innerText('#set-record')).trim(), 'Mistakes recorded: 1 country');
  await page.evaluate(() => { misses = { jp: 1, fr: 2 }; renderSettings(); });
  assert.equal((await page.innerText('#set-record')).trim(), 'Mistakes recorded: 2 countries');
  // 音を切ると音量は Off
  await page.click('#set-sound');
  assert.equal((await page.innerText('#set-vol-n')).trim(), 'Off');
  assert.deepEqual(await jaLeft(page), []);
});

// 設定（localStorage の settings）は日本語版と同じものを使う
t('en_settings_shared', async (page, app) => {
  await page.click('#home-settings');
  await page.click('#set-theme [data-th="dark"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  const ja = await app.context.newPage();
  await ja.goto(server.url);
  assert.equal(await ja.evaluate(() => document.documentElement.lang), 'ja');
  assert.equal(await ja.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await ja.click('#home-settings');
  assert.deepEqual(await ja.$$eval('#set-theme .chip[aria-pressed="true"]', bs => bs.map(b => b.textContent)), ['ダーク']);
});

// 地図を読めないときの帯
t('en_map_wait', async page => {
  await page.click('#home-play');
  await page.locator('#mapwait-retry').waitFor();
  assert.equal((await page.textContent('#mapwait-msg')).trim(), 'Couldn’t load the map');
  assert.deepEqual(await jaLeft(page), []);
}, { blockScripts: ['world.js'], waitMap: false });
