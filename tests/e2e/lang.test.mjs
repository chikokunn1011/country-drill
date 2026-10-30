// 英語版（PR5）: 言語の切りかえ（ホームの右上とトップバーの右の「日本語 / English」）と、英語の端末への案内（#home-en）。
// 切りかえは今の画面（図鑑・設定・モード選択）のまま、もう一方の言語のページへ移る。案内は保存しない
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, mapLoaded, PHONE, QUIET_BADGES } from './helpers.mjs';
import { settleLayout, measureFit } from './layout.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 開いて fn(page, app) を呼び、最後にページで例外が出ていないかも見る。opts は openApp にそのまま渡す
const t = (name, fn, opts = {}) => test(name, { timeout: 120_000 }, async () => {
  const app = await openApp(browser, { storage: { badges: QUIET_BADGES }, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const visible = (page, sel) => page.locator(sel).isVisible();
const path = page => { const u = new URL(page.url()); return u.pathname + u.hash; };

t('langsw_home_ja', async page => {
  const sw = page.locator('#scr-home .langsw');
  assert.ok(await sw.isVisible());
  assert.equal((await sw.innerText()).replace(/\s+/g, ' ').trim(), '日本語 / English');
  const en = sw.locator('a');
  assert.equal(await en.getAttribute('href'), 'en/');
  assert.equal(await en.getAttribute('hreflang'), 'en');
  assert.equal(await en.innerText(), 'English');
  // トップバーにも同じ切りかえ（ホームではトップバーごと隠れている）
  assert.equal(await page.locator('#topbar .row:last-child > .langsw a').getAttribute('href'), 'en/');
  // 日本語の端末には英語版への案内を出さない
  assert.equal(await page.locator('#home-en').count(), 1);
  assert.equal(await visible(page, '#home-en'), false);
}, { locale: 'ja-JP' });

t('langsw_keeps_screen', async page => {
  // 日本語版の図鑑 → トップバーの English → 英語版の図鑑
  await page.click('#home-book');
  await page.waitForSelector('#scr-book:not([hidden])');
  assert.equal(await page.locator('#topbar .langsw a').getAttribute('href'), 'en/#book');
  await page.click('#topbar .langsw a');
  await page.waitForURL(/\/en\/#book$/);
  await mapLoaded(page);
  await page.waitForSelector('#scr-book:not([hidden])');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.equal(path(page), '/en/#book');
  // 英語版のホームの切りかえは「日本語」がリンク、English は太字
  await page.click('#brand');
  const sw = page.locator('#scr-home .langsw');
  assert.equal((await sw.innerText()).replace(/\s+/g, ' ').trim(), '日本語 / English');
  assert.equal(await sw.locator('a').getAttribute('href'), './');
  assert.equal(await sw.locator('a').getAttribute('lang'), 'ja');
  assert.equal(await sw.locator('b').getAttribute('lang'), 'en');
  // 英語版には英語の端末への案内は無い
  assert.equal(await page.locator('#home-en').count(), 0);
  // 英語版の設定 → 日本語 → 日本語版の設定
  await page.click('#home-settings');
  await page.waitForSelector('#scr-settings:not([hidden])');
  assert.equal(await page.locator('#topbar .langsw a').getAttribute('href'), './#settings');
  await page.click('#topbar .langsw a');
  await page.waitForURL(u => new URL(u).pathname === '/' && new URL(u).hash === '#settings');
  await page.waitForSelector('#scr-settings:not([hidden])');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
  // モード選択は #play、クイズ中は画面を持っていかない
  await page.click('#brand');
  await page.click('#home-play');
  await page.waitForSelector('#scr-setup:not([hidden])');
  assert.equal(await page.locator('#topbar .langsw a').getAttribute('href'), 'en/#play');
  await page.click('#start');
  await page.waitForSelector('#scr-quiz:not([hidden])');
  assert.equal(await page.locator('#topbar .langsw a').getAttribute('href'), 'en/');
}, { locale: 'ja-JP' });

t('home_en_for_english_device', async page => {
  const box = page.locator('#home-en');
  assert.ok(await box.isVisible());
  assert.equal(await box.innerText(), 'English version →');
  await box.locator('a').click();
  await page.waitForURL(/\/en\/$/);
  await mapLoaded(page);
  await page.waitForSelector('#scr-home:not([hidden])');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  // 案内は保存しない（localStorage のキーは増えない）
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => /lang|home-en/i.test(k))), []);
}, { locale: 'en-US' });

// ホームの切りかえと重なる、ホームのほかの要素（国旗の並びは1枚ずつ見る）
const homeOverlaps = page => page.evaluate(() => {
  const sw = document.querySelector('#scr-home > .langsw').getBoundingClientRect(), out = [];
  const els = [...document.querySelectorAll('#scr-home > :not(.langsw):not(.flags), #scr-home > .flags > img')];
  for (const el of els) {
    if (!el.checkVisibility()) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.left < sw.right && sw.left < r.right && r.top < sw.bottom && sw.top < r.bottom) out.push(`${el.tagName}#${el.id}.${el.className}`);
  }
  if (sw.left < 0 || sw.right > innerWidth || sw.top < 0) out.push('画面の外');
  return out;
});
// トップバーの中で重なっている要素の組
const topbarOverlaps = page => page.evaluate(() => {
  const els = [...document.querySelectorAll('#topbar button, #topbar .langsw')].filter(e => e.checkVisibility()), out = [];
  const rs = els.map(e => e.getBoundingClientRect());
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = rs[i], b = rs[j];
    if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`${els[i].id || els[i].className} × ${els[j].id || els[j].className}`);
  }
  return out;
});

test('langsw_layout', { timeout: 300_000 }, async () => {
  const problems = [];
  const cases = [];
  for (const viewport of [PHONE, { width: 1366, height: 657 }]) {
    cases.push([viewport, '', 'ja-JP'], [viewport, 'en/', 'ja-JP'], [viewport, '', 'en-US']);
  }
  for (const [viewport, p, locale] of cases) {
    const key = `${viewport.width}x${viewport.height} ${p || 'ja'} ${locale}`;
    const app = await openApp(browser, { viewport, path: p, locale, seed: 1, reducedMotion: 'reduce', storage: { badges: QUIET_BADGES } });
    try {
      const { page } = app;
      await settleLayout(page);
      for (const o of await homeOverlaps(page)) problems.push(`${key}: ホームの切りかえが ${o} と重なる`);
      // 縦スクロールが増えない（切りかえを消しても高さが同じ）。PC はスクロールしない
      const m = await measureFit(page);
      const without = await page.evaluate(() => { const sw = document.querySelector('#scr-home > .langsw'); sw.style.display = 'none'; const h = document.documentElement.scrollHeight; sw.style.display = ''; return h; });
      if (m.docH !== without) problems.push(`${key}: 切りかえで高さが ${without} → ${m.docH}`);
      if (m.hscroll) problems.push(`${key}: 横スクロール`);
      if (viewport.width >= 900 && m.docH > m.ih) problems.push(`${key}: 縦スクロール ${m.docH}/${m.ih}`);
      // トップバー（設定の画面）でも重ならず、1行に収まる
      await page.click('#home-settings');
      await page.waitForSelector('#scr-settings:not([hidden])');
      await settleLayout(page);
      for (const o of await topbarOverlaps(page)) problems.push(`${key}: トップバーで ${o} が重なる`);
      const tb = await page.evaluate(() => { const b = document.querySelector('#brand').getBoundingClientRect(), s = document.querySelector('#topbar .langsw').getBoundingClientRect(); return { b: b.bottom, s: s.top }; });
      if (tb.s >= tb.b) problems.push(`${key}: トップバーの切りかえが2行目に落ちた ${JSON.stringify(tb)}`);
      if ((await measureFit(page)).hscroll) problems.push(`${key}: 設定で横スクロール`);
      if (app.errors.length) problems.push(`${key}: ページで例外 ${app.errors.map(String).join(' | ')}`);
    } catch (e) { problems.push(`${key}: ${e.message.split('\n')[0]}`); }
    finally { await app.close(); }
  }
  assert.deepEqual(problems, []);
});
