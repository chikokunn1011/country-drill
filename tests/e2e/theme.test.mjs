// 画面の色（設定の theme）。はじめは 'light'。'light' / 'dark' は <html data-theme> で固定し、'auto' は端末のライト／ダークに合わせる。
// 色は body の背景（--bg）で見る。ライト #eef2f1、ダーク #0f171c
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const LIGHT = 'rgb(238, 242, 241)', DARK = 'rgb(15, 23, 28)';
const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const bg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const attr = page => page.evaluate(() => document.documentElement.dataset.theme ?? null);
const pressed = page => page.$$eval('#set-theme .chip', bs => bs.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent));
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('settings')).theme);

// まだ選んでいない人は、端末がダークでもライト
t('default_is_light_on_dark_device', async page => {
  assert.equal(await attr(page), 'light');
  assert.equal(await bg(page), LIGHT);
  await page.click('#home-settings');
  assert.deepEqual(await pressed(page), ['ライト']);
}, { colorScheme: 'dark' });

t('pick_dark_then_auto', async page => {
  await page.click('#home-settings');
  await page.click('#set-theme [data-th="dark"]');
  assert.equal(await attr(page), 'dark');
  assert.equal(await bg(page), DARK);
  assert.deepEqual(await pressed(page), ['ダーク']);
  assert.equal(await saved(page), 'dark');
  await page.click('#set-theme [data-th="auto"]');
  assert.equal(await attr(page), null);
  assert.equal(await bg(page), LIGHT);   // 端末はライト
  assert.equal(await saved(page), 'auto');
}, { colorScheme: 'light' });

// 「端末に合わせる」を保存していれば、ダーク端末ではダーク
t('saved_auto_follows_dark_device', async page => {
  assert.equal(await attr(page), null);
  assert.equal(await bg(page), DARK);
}, { colorScheme: 'dark', storage: { settings: { theme: 'auto' } } });

// 保存した色は読み込みの最初（head）で当たる。端末がライトでもダークのまま
t('saved_dark_applies_on_load', async page => {
  assert.equal(await attr(page), 'dark');
  assert.equal(await bg(page), DARK);
  await page.click('#home-settings');
  assert.deepEqual(await pressed(page), ['ダーク']);
}, { colorScheme: 'light', storage: { settings: { theme: 'dark' } } });
