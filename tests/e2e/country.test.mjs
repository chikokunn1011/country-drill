// 国ごとのページ（B1）と、本編の入口（#play=<地域> で地域を選んだモード選択を開く）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const open = async (opts, fn) => {
  const app = await openApp(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
};
const savedRegion = page => page.evaluate(() => JSON.parse(localStorage.getItem('settings') ?? '{}').region);
const pressedRegion = page => page.locator('#regions .chip[aria-pressed="true"]').getAttribute('data-r');

/* ---------- #play=<地域> ---------- */
const playRegion = async r => open({ path: 'index.html#play=' + encodeURIComponent(r) }, async page => {
  await page.locator('#scr-setup').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => S.region), r);
  assert.equal(await savedRegion(page), r);
  assert.equal(await pressedRegion(page), r);
});

test('play_hash_region', { timeout: 60_000 }, () => playRegion('西ヨーロッパ'));

test('play_hash_all_and_region', { timeout: 60_000 }, async () => {
  for (const r of ['all', 'アフリカ', '北・中央アメリカ']) await playRegion(r);
});

test('play_hash_unknown', { timeout: 60_000 }, () => open({ path: 'index.html#play=xx' }, async page => {
  await page.locator('#scr-home').waitFor({ state: 'visible' });
  assert.equal(await savedRegion(page), undefined);   // 知らない値は書かない
}));

test('play_hash_bad', { timeout: 60_000 }, () => open({ path: 'index.html#play=%E8' }, async page => {   // こわれた % でも例外を出さずホーム
  await page.locator('#scr-home').waitFor({ state: 'visible' });
  assert.equal(await savedRegion(page), undefined);
}));

test('play_plain_unchanged', { timeout: 60_000 }, () => open({ path: 'index.html#play', storage: { settings: { region: 'アフリカ' } } }, async page => {
  await page.locator('#scr-setup').waitFor({ state: 'visible' });   // 値なしは今までどおり、保存された地域のまま
  assert.equal(await page.evaluate(() => S.region), 'アフリカ');
}));
