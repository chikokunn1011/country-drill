// 画面の色（設定の theme）。'auto'（はじめ）は端末のライト／ダークに合わせ、'light' / 'dark' は <html data-theme> で固定する。
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

t('default_follows_device_dark', async page => {
  assert.equal(await attr(page), null);
  assert.equal(await bg(page), DARK);
  await page.click('#home-settings');
  assert.deepEqual(await pressed(page), ['端末に合わせる']);
}, { colorScheme: 'dark' });

t('default_follows_device_light', async page => {
  assert.equal(await bg(page), LIGHT);
}, { colorScheme: 'light' });

t('pick_light_on_dark_device_and_back', async page => {
  await page.click('#home-settings');
  await page.click('#set-theme [data-th="light"]');
  assert.equal(await attr(page), 'light');
  assert.equal(await bg(page), LIGHT);
  assert.deepEqual(await pressed(page), ['ライト']);
  assert.equal(await saved(page), 'light');
  await page.click('#set-theme [data-th="auto"]');
  assert.equal(await attr(page), null);
  assert.equal(await bg(page), DARK);
  assert.equal(await saved(page), 'auto');
}, { colorScheme: 'dark' });

// 保存した色は読み込みの最初（head）で当たる。端末がライトでもダークのまま
t('saved_dark_applies_on_load', async page => {
  assert.equal(await attr(page), 'dark');
  assert.equal(await bg(page), DARK);
  await page.click('#home-settings');
  assert.deepEqual(await pressed(page), ['ダーク']);
}, { colorScheme: 'light', storage: { settings: { theme: 'dark' } } });
