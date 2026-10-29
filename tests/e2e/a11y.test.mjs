// 見やすさの設定（B8）。文字の大きさ settings.fs（'m' 既定 / 'l' / 'xl'）は <html data-fs>、
// 色の見分けやすさ settings.cvd は <html data-cvd>。どちらも head の先読みで最初から付く
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp } from './helpers.mjs';

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
const attrs = page => page.evaluate(() => ({ fs: document.documentElement.dataset.fs ?? null, cvd: document.documentElement.hasAttribute('data-cvd') }));
const rootPx = page => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
// 先読み（head のスクリプト）の直後、body ができる前の属性
const atHead = () => { window.__headAttrs = null; new MutationObserver((_, o) => { if (document.body && !window.__headAttrs) { window.__headAttrs = { fs: document.documentElement.dataset.fs ?? null, cvd: document.documentElement.hasAttribute('data-cvd') }; o.disconnect(); } }).observe(document, { childList: true, subtree: true }); };

/* ---------- Task 1: 設定の保存と html の属性 ---------- */
t('default_has_no_attrs', async page => {
  assert.deepEqual(await attrs(page), { fs: null, cvd: false });
  assert.equal(await rootPx(page), '16px');
});

t('saved_fs_and_cvd_apply_from_head', async page => {
  assert.deepEqual(await page.evaluate(() => window.__headAttrs), { fs: 'l', cvd: true });
  assert.deepEqual(await attrs(page), { fs: 'l', cvd: true });
}, { storage: { settings: { fs: 'l', cvd: true } }, init: atHead });

t('saved_xl_applies', async page => {
  assert.deepEqual(await attrs(page), { fs: 'xl', cvd: false });
}, { storage: { settings: { fs: 'xl' } } });

t('bad_values_are_ignored', async page => {
  assert.deepEqual(await attrs(page), { fs: null, cvd: false });
  assert.equal(await rootPx(page), '16px');
}, { storage: { settings: { fs: 'huge', cvd: 'yes' } } });

t('m_has_no_attr', async page => {
  assert.deepEqual(await attrs(page), { fs: null, cvd: false });
}, { storage: { settings: { fs: 'm', cvd: false } } });

/* ---------- Task 2: 設定画面の UI ---------- */
const fsPressed = page => page.$$eval('#set-fs .chip', bs => bs.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent));
const bodyPx = page => page.evaluate(() => getComputedStyle(document.body).fontSize);

t('settings_fs_chips_change_size_and_persist', async page => {
  await page.click('#home-settings');
  assert.deepEqual(await page.$$eval('#set-fs .chip', bs => bs.map(b => b.textContent)), ['ふつう', '大きめ', 'とても大きい']);
  assert.deepEqual(await fsPressed(page), ['ふつう']);
  assert.equal(await bodyPx(page), '15px');
  await page.click('#set-fs [data-fs="l"]');
  assert.equal(await rootPx(page), '18px');
  assert.equal(await bodyPx(page), '16.875px');   // 本文（ふつうは 15px）も同じ割合で大きくなる
  assert.deepEqual(await fsPressed(page), ['大きめ']);
  await page.click('#set-fs [data-fs="xl"]');
  assert.equal(await rootPx(page), '20px');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('settings')).fs), 'xl');
  await page.reload();
  assert.equal(await rootPx(page), '20px');
  await page.click('#home-settings');
  assert.deepEqual(await fsPressed(page), ['とても大きい']);
  await page.click('#set-fs [data-fs="m"]');
  assert.equal(await rootPx(page), '16px');
  assert.deepEqual(await attrs(page), { fs: null, cvd: false });
});

t('settings_cvd_checkbox_toggles_and_persists', async page => {
  await page.click('#home-settings');
  assert.equal(await page.isChecked('#set-cvd'), false);
  assert.match(await page.textContent('#scr-settings'), /正解は青、まちがいはオレンジになります/);
  await page.check('#set-cvd');
  assert.deepEqual(await attrs(page), { fs: null, cvd: true });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('settings')).cvd), true);
  await page.reload();
  assert.equal((await attrs(page)).cvd, true);
  await page.click('#home-settings');
  assert.equal(await page.isChecked('#set-cvd'), true);
  await page.uncheck('#set-cvd');
  assert.equal((await attrs(page)).cvd, false);
});

// 見やすさの欄は「画面の色」のすぐ下
t('a11y_field_after_theme', async page => {
  await page.click('#home-settings');
  const order = await page.$$eval('#scr-settings .field > .lbl', ls => ls.map(l => l.textContent));
  assert.equal(order[order.indexOf('画面の色') + 1], '見やすさ');
});

// PC（pc.css が html の文字を画面の幅で少し大きくする）でも、大きめ・とても大きいはその 1.125 倍・1.25 倍
for (const [fs, k] of [['l', 1.125], ['xl', 1.25]]) t(`pc_fs_${fs}_scales_pc_root`, async page => {
  const base = Math.min(Math.max(16, 16 * 0.8 + 1366 * 0.0025), 18);   // pc.css の clamp(100%, 80% + .25vw, 112.5%)
  const px = parseFloat(await rootPx(page));
  assert.ok(Math.abs(px - base * k) < 0.1, `${px} != ${base * k}`);
}, { viewport: { width: 1366, height: 657 }, storage: { settings: { fs } } });
