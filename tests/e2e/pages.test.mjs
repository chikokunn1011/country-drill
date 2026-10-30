// 読み物のページ（privacy・about・howto）。スマホ・狭いスマホ・PC でエラーなし・横スクロールなし、色はアプリの設定に合わせる、フッターから行って戻れる
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, PHONE, PC } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const LIGHT = 'rgb(238, 242, 241)', DARK = 'rgb(15, 23, 28)';
const PAGES = ['privacy.html', 'about.html', 'howto.html'];
const SIZES = [PHONE, { width: 360, height: 740 }, PC];
const bg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const open = async (opts, fn) => {
  const app = await openApp(browser, opts);
  try {
    await fn(app.page);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
};

test('pages_render', { timeout: 120_000 }, async () => {
  for (const path of PAGES) for (const viewport of SIZES) await open({ path, viewport }, async page => {
    const where = `${path} ${viewport.width}x${viewport.height}`;
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where} 横スクロール`);
    assert.equal(await bg(page), LIGHT, where);
    assert.equal(await page.locator('.foot-links a').count(), 6, where);
  });
});

test('pages_follow_theme', { timeout: 120_000 }, async () => {
  for (const path of PAGES) {
    await open({ path, storage: { settings: { theme: 'dark' } } }, async page => assert.equal(await bg(page), DARK, `${path} 設定がダーク`));
    await open({ path, colorScheme: 'dark' }, async page => assert.equal(await bg(page), LIGHT, `${path} 設定なし・端末がダーク`));
    await open({ path, colorScheme: 'dark', storage: { settings: { theme: 'auto' } } }, async page => assert.equal(await bg(page), DARK, `${path} 端末に合わせる・端末がダーク`));
  }
});

test('footer_to_page_and_back', { timeout: 60_000 }, async () => {
  await open({}, async page => {
    await page.waitForSelector('#scr-home', { state: 'visible' });
    await page.click('footer a[href="howto.html"]');
    await page.waitForURL(/\/howto\.html$/);
    await page.click('.back');
    await page.waitForURL(u => new URL(u).pathname === '/');
    await page.waitForSelector('#scr-home', { state: 'visible' });
  });
});

// 出題中はスマホでもフッターを出さない（リンクで離れると、確かめなしに今日の難問や練習がそこで終わるため）。ホームにもどると出る
test('footer_hidden_during_quiz_on_phone', { timeout: 60_000 }, async () => {
  const footer = page => page.evaluate(() => getComputedStyle(document.querySelector('footer')).display);
  await open({ viewport: PHONE }, async page => {
    await page.waitForSelector('#scr-home', { state: 'visible' });
    assert.notEqual(await footer(page), 'none', 'ホーム');
    await pickSetup(page, { mode: 'f2n', kind: 'practice' });
    await page.click('#start');
    await page.locator('#scr-quiz').waitFor();
    assert.equal(await footer(page), 'none', '練習');
    assert.equal(await page.locator('.foot-links a').filter({ visible: true }).count(), 0, '練習');
  });
  await open({ viewport: PHONE }, async page => {
    await page.click('#home-daily');
    await page.click('#dl-start');
    await page.locator('#scr-quiz').waitFor();
    assert.equal(await footer(page), 'none', '今日の難問');
  });
});
