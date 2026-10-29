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
