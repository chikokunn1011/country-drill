// D2 アプリ化: service worker（sw.js）。どれも serviceWorkers: 'allow' で本物の SW を動かす
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, openApp, pickSetup, answerCorrect } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 90_000 }, async () => {
  const app = await openApp(browser, { serviceWorkers: 'allow', ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
// SW が入って（precache が済んで）、このページを受けもつまで待つ
const swReady = page => page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  .then(() => page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 }));

// オフラインで再読み込みしても、ホーム → 全世界・国旗→国名・5問を最後まで遊べる
t('offline_play', async (page, { context }) => {
  await swReady(page);
  await context.setOffline(true);
  await page.reload();
  await page.locator('#scr-home').waitFor();
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
  await pickSetup(page, { mode: 'f2n', region: 'all', count: 5 });
  await page.click('#start');
  for (let i = 0; i < 5; i++) {
    await answerCorrect(page);
    // 国旗もキャッシュから出ている
    assert.ok(await page.evaluate(() => (l => l.length > 0 && l.every(i => i.complete && i.naturalWidth > 0))([...document.querySelectorAll('#qcard img')])));
    if (await page.isVisible('#next')) await page.click('#next');
  }
  await page.locator('#scr-result').waitFor();
  assert.equal(await page.evaluate(() => G.set.length), 5);
  // 場所 → 国旗: 地図（world.js・d3・topojson）も保存したものから描ける
  await page.evaluate(() => show('setup'));
  await pickSetup(page, { mode: 'm2f', region: 'all', count: 5 });
  await page.click('#start');
  await answerCorrect(page);
  assert.ok(await page.locator('#qcard svg.map path').count() > 50);
}, { seed: 1 });

// オフラインで、開いたことのないページ（国のページ・遊び方）には本編（index.html）を出さず、ブラウザのふつうのオフラインの画面にする
t('offline_unvisited_pages', async (page, { context }) => {
  await swReady(page);
  await context.setOffline(true);
  for (const path of ['country/zz.html', 'country/', 'howto.html']) {
    await page.goto(new URL(path, server.url).href).catch(() => {});
    assert.equal(await page.locator('#scr-home').count(), 0, path);
    assert.equal(await page.evaluate(() => typeof G), 'undefined', path);
  }
  // 根は ? 付きでも本編が出る
  await page.goto(new URL('?from=pwa', server.url).href);
  await page.locator('#scr-home').waitFor();
});

// 管理ページ（admin.html・admin*.js）は SW のキャッシュに入れない
t('sw_skips_admin', async page => {
  await swReady(page);
  await page.goto(new URL('admin.html', server.url).href);
  await page.waitForLoadState('load');
  const keys = await page.evaluate(async () => {
    const out = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  assert.ok(keys.length > 200);
  assert.deepEqual(keys.filter(k => k.includes('admin')), []);
});

// ?v= の無いファイル（countries.js）はネット優先: 書きかえたら次に開いたとき新しい中身
test('sw_update_unversioned', { timeout: 90_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pwa-'));
  cpSync(ROOT, dir, { recursive: true, filter: s => !/[\\/](\.git|node_modules)$/.test(s) });
  const srv = await startServer({ root: dir });
  const app = await openApp(browser, { serviceWorkers: 'allow', url: srv.url });
  try {
    await swReady(app.page);
    assert.equal(await app.page.evaluate(() => window.COUNTRIES.__mark), undefined);
    const p = join(dir, 'countries.js');
    writeFileSync(p, `${readFileSync(p, 'utf8')}\nwindow.COUNTRIES.__mark = 'new';\n`);
    await app.page.reload();
    assert.equal(await app.page.evaluate(() => window.COUNTRIES.__mark), 'new');
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); await srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

// SW が動いていても、外のサイトへの GET（Google Fonts の CSS）は SW がさわらず、ページからそのままテストの route に届く
// （SW が fetch し直すと request.serviceWorker() が付くので数えない）
{
  let fonts = 0, viaSw = 0;
  t('sw_ignores_other_origins', async page => {
    await swReady(page);
    const n = fonts;
    await page.reload();
    await page.locator('#scr-home').waitFor();
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
    assert.ok(fonts > n, `route に届いた数 ${fonts}（前は ${n}）`);
    assert.equal(viaSw, 0);
  }, { routes: [['https://fonts.googleapis.com/**', route => { if (route.request().serviceWorker()) viaSw++; else fonts++; return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); }]] });
}

// ---------- 「アプリとして追加」の帯（#home-pwa）と設定の欄（#set-pwa-field）。SW は要らないので既定の block ----------
const b = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { waitMap: false, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const DAY2 = { pwa: { v: 1, first: '2026-01-01', hideUntil: 0 } };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// ブラウザの「追加できる」の知らせ（beforeinstallprompt）のまね。prompt() が呼ばれた数は window.__prompted
const fakePrompt = page => page.evaluate(() => {
  window.__prompted = 0;
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = () => { window.__prompted++; return Promise.resolve(); };
  e.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
  dispatchEvent(e);
});
const pwaSave = page => page.evaluate(() => JSON.parse(localStorage.getItem('pwa')));

b('install_banner_not_first_day', async page => {
  await fakePrompt(page);
  assert.equal(await page.isHidden('#home-pwa'), true);
  assert.equal((await pwaSave(page)).first, await page.evaluate(() => DAILY_CORE.jstDay()));
});

b('install_banner_second_day', async page => {
  await fakePrompt(page);
  await page.locator('#home-pwa').waitFor();
  assert.equal(await page.textContent('#home-pwa'), 'ホーム画面に追加すると、電波がなくても遊べる追加する×');
  await page.click('#home-pwa-add');
  await page.waitForFunction(() => window.__prompted === 1);
}, { storage: DAY2 });

// storage は読み込むたびに入れ直すので使わず、ここで1回だけ入れて読み直す
b('install_banner_dismiss', async page => {
  await page.evaluate(s => localStorage.setItem('pwa', JSON.stringify(s)), DAY2.pwa);
  await page.reload();
  await page.locator('#scr-home').waitFor();
  await fakePrompt(page);
  await page.locator('#home-pwa').waitFor();
  await page.click('#home-pwa [aria-label="閉じる"]');
  assert.equal(await page.isHidden('#home-pwa'), true);
  const want = Date.now() + 30 * 864e5;
  assert.ok(Math.abs((await pwaSave(page)).hideUntil - want) < 60_000);
  await page.reload();
  await page.locator('#scr-home').waitFor();
  await fakePrompt(page);
  assert.equal(await page.isHidden('#home-pwa'), true);
});

b('install_banner_standalone', async page => {
  await fakePrompt(page);
  assert.equal(await page.isHidden('#home-pwa'), true);
  assert.equal(await page.isHidden('#set-pwa-field'), true);
}, { storage: DAY2, init: () => {
  const mm = window.matchMedia.bind(window);
  window.matchMedia = q => /display-mode:\s*standalone/.test(q)
    ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } : mm(q);
} });

b('install_banner_ios', async page => {
  await page.locator('#home-pwa').waitFor();
  await page.click('#home-pwa-add');
  await page.locator('#pwa-ios').waitFor();
  assert.equal(await page.evaluate(() => document.getElementById('pwa-ios').open), true);
  assert.equal((await page.textContent('#pwa-ios p')).trim(), 'Safari の下の共有ボタン（□に↑）を押して、「ホーム画面に追加」を選んでね。');
  await page.click('#pwa-ios button:has-text("OK")');
  assert.equal(await page.evaluate(() => document.getElementById('pwa-ios').open), false);
}, { storage: DAY2, init: `Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ${JSON.stringify(IPHONE)} });` });

b('install_setting_button', async page => {
  await fakePrompt(page);
  await page.click('#home-settings');
  await page.locator('#set-pwa-field').waitFor();
  assert.equal((await page.textContent('#set-pwa-field .lbl')).trim(), 'アプリ');
  assert.equal((await page.textContent('#set-pwa-field .hint')).trim(), '追加すると、アプリのようにすぐ開けて、電波がなくても遊べるよ。');
  await page.click('#set-pwa-field button:has-text("ホーム画面に追加する")');
  await page.waitForFunction(() => window.__prompted === 1);
}, { storage: DAY2 });

// 知らせが来ず iPhone でもない（PC の Firefox など）ときは、設定の欄も出さない
b('install_setting_hidden_without_prompt', async page => {
  await page.click('#home-settings');
  await page.locator('#scr-settings').waitFor();
  assert.equal(await page.isHidden('#set-pwa-field'), true);
  assert.equal(await page.isHidden('#home-pwa'), true);
}, { storage: DAY2 });
