// D2 アプリ化: service worker（sw.js）。どれも serviceWorkers: 'allow' で本物の SW を動かす
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, openApp, pickSetup, answerCorrect } from './helpers.mjs';
import { render } from '../../tools/make_sw.mjs';

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
// リポジトリを一時ディレクトリに写す（.git・node_modules は写さない）
const tempRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pwa-'));
  cpSync(ROOT, dir, { recursive: true, filter: s => !/[\\/](\.git|node_modules)$/.test(s) });
  return dir;
};
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
// いまのキャッシュの名前と、name のキャッシュの url（ページからの相対）の中身
const cacheNames = page => page.evaluate(() => caches.keys());
const cached = (page, name, url) => page.evaluate(async ([name, url]) => {
  const r = await (await caches.open(name)).match(new URL(url, location.href).href);
  return r ? r.text() : null;
}, [name, url]);
// page.evaluate(fn, arg) が true になるまで待つ（waitForFunction は返った Promise を待たずに true と見るので、非同期の条件はこちら）
const until = async (page, fn, arg, ms = 30_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (await page.evaluate(fn, arg)) return;
  throw new Error(`until: ${fn}`);
};
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

// 英語版（PR5）: en/ を開いて SW が入ったら、オフラインでも英語のホーム・図鑑（#book）が出て、国旗→国名を5問遊べる
t('sw_en_shell', async (page, { context }) => {
  await swReady(page);
  await context.setOffline(true);
  const en = (path = '') => new URL(`en/${path}`, server.url).href;
  const isEn = async () => assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  await page.reload();
  await page.locator('#scr-home').waitFor();
  await isEn();
  assert.equal((await page.innerText('#home-book .hi-label')).trim(), 'Gallery');
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
  // 日本語の本編を開いてから、別のページとして en/#book を開く（同じページの hash だけの移動にしない）
  await page.goto(server.url);
  await page.locator('#scr-home').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
  await page.goto(en('#book'));
  await page.waitForSelector('#scr-book:not([hidden])');
  await isEn();
  assert.equal((await page.innerText('#to-book')).trim(), 'Gallery');
  assert.equal((await page.innerText('#bview button[data-v="list"]')).trim(), 'List');
  // index.html も en/ の本編として出る
  await page.goto(en('index.html'));
  await page.locator('#scr-home').waitFor();
  await isEn();
  await page.goto(en());
  await page.locator('#scr-home').waitFor();
  await isEn();
  await pickSetup(page, { mode: 'f2n', region: 'all', count: 5 });
  assert.match(await page.innerText('#modes .modecard[data-k="f2n"]'), /Flag → Name/);
  await page.click('#start');
  for (let i = 0; i < 5; i++) {
    await answerCorrect(page);
    assert.ok(await page.evaluate(() => (l => l.length > 0 && l.every(i => i.complete && i.naturalWidth > 0))([...document.querySelectorAll('#qcard img')])));
    if (await page.isVisible('#next')) await page.click('#next');
  }
  await page.locator('#scr-result').waitFor();
  assert.equal(await page.evaluate(() => G.set.length), 5);
  await isEn();
  // 開いたことのない英語のページ（国のページ・遊び方）には本編を出さない
  for (const path of ['country/jp.html', 'howto.html']) {
    await page.goto(en(path)).catch(() => {});
    assert.equal(await page.locator('#scr-home').count(), 0, path);
  }
}, { path: 'en/', locale: 'en-US', seed: 1 });

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
  const dir = tempRepo();
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

// 版が変わったとき（GitHub Pages のように max-age=600 で配る）: 新しい SW は ?v= の無いファイルも HTTP キャッシュの古いものを入れず、
// ?v= を上げた CSS が使われ、ページを閉じて開き直すと新しい版になって古いキャッシュが消える。
// context.route があると Playwright が HTTP キャッシュを切るので、openApp を使わず route の無いコンテキストで開く（外のサイトは名前を引けなくする）
test('sw_version_change', { timeout: 90_000 }, async () => {
  const dir = tempRepo(), requests = [];
  const srv = await startServer({ root: dir, headers: { 'cache-control': 'max-age=600' }, requests });
  const b2 = await chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  const context = await b2.newContext({ serviceWorkers: 'allow' }), errors = [];
  try {
    let page = await context.newPage();
    page.on('pageerror', e => errors.push(e));
    await page.goto(srv.url);
    await swReady(page);
    const [oldName] = await cacheNames(page);
    assert.match(oldName, /^drill-[0-9a-f]{12}$/);
    // pc.css の中身と ?v=、countries.js（?v= 無し）を変えて sw.js を作り直す
    const n = +readFileSync(join(dir, 'index.html'), 'utf8').match(/pc\.css\?v=(\d+)/)[1];
    const edit = (f, fn) => writeFileSync(join(dir, f), fn(readFileSync(join(dir, f), 'utf8')));
    edit('pc.css', s => `${s}\n.pwa-test-mark { order: 7; }\n`);
    // en/index.html は make_en が index.html から作るので、?v= もいっしょに上がる
    for (const f of ['index.html', 'en/index.html']) edit(f, s => s.replace(`pc.css?v=${n}`, `pc.css?v=${n + 1}`));
    edit('countries.js', s => `${s}\nwindow.COUNTRIES.__mark = 'new';\n`);
    writeFileSync(join(dir, 'sw.js'), render(dir));
    const newName = `drill-${readFileSync(join(dir, 'sw.js'), 'utf8').match(/const VERSION = '(\w+)'/)[1]}`;
    assert.notEqual(newName, oldName);
    // 再読み込みせずに新しい SW を入れる（install は HTTP キャッシュに古い countries.js・index.html があっても取り直す）。
    // ?v= 付き・vendor/ は前の版のキャッシュから写すので、ネットに取りに行くのは上げた pc.css だけ
    requests.length = 0;
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await until(page, () => navigator.serviceWorker.getRegistration().then(r => r.waiting?.state === 'installed'));
    assert.match(await cached(page, newName, 'countries.js'), /__mark = 'new'/);
    assert.match(await cached(page, newName, 'index.html'), new RegExp(`pc\\.css\\?v=${n + 1}`));
    assert.match(await cached(page, newName, `pc.css?v=${n + 1}`), /pwa-test-mark/);
    assert.equal(await cached(page, newName, `pc.css?v=${n}`), null);   // 古い ?v= は新しい版に入れない
    assert.deepEqual(requests.filter(u => /[?&]v=|\/vendor\//.test(u)), [`/pc.css?v=${n + 1}`]);
    // 開いているページは古い SW のまま（入れかえない）。閉じて開き直すと新しい版
    assert.deepEqual((await cacheNames(page)).sort(), [newName, oldName].sort());
    await page.close();
    page = await context.newPage();
    page.on('pageerror', e => errors.push(e));
    await page.goto(srv.url);
    await until(page, name => caches.keys().then(k => k.length === 1 && k[0] === name), newName);
    assert.ok(await page.evaluate(n => [...document.styleSheets].some(x => x.href?.endsWith(`pc.css?v=${n}`) && [...x.cssRules].some(r => r.cssText.includes('pwa-test-mark'))), n + 1));
    assert.equal(await page.evaluate(() => window.COUNTRIES.__mark), 'new');
    assert.deepEqual(errors.map(String), []);
  } finally { await context.close(); await b2.close(); await srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

// 新しい SW の install は、?v= 付き・vendor/ を前の版のキャッシュから写し、ネットには上げた pc.css だけ取りに行く
// （openApp の route があると HTTP キャッシュが切れるので、写さなければ全部がネットに行く）
test('sw_install_copies_fixed', { timeout: 90_000 }, async () => {
  const dir = tempRepo();
  const srv = await startServer({ root: dir });
  const app = await openApp(browser, { serviceWorkers: 'allow', url: srv.url, waitMap: false });
  try {
    const { page, context } = app;
    await swReady(page);
    const n = +readFileSync(join(dir, 'index.html'), 'utf8').match(/pc\.css\?v=(\d+)/)[1];
    for (const f of ['index.html', 'en/index.html']) {   // en/index.html も（make_en が index.html から作る）
      const p = join(dir, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace(`pc.css?v=${n}`, `pc.css?v=${n + 1}`));
    }
    writeFileSync(join(dir, 'sw.js'), render(dir));
    const got = [];
    await context.route(u => u.searchParams.has('v') || u.pathname.includes('/vendor/'), route => {
      const u = new URL(route.request().url());
      got.push(u.pathname.slice(1) + u.search);
      return route.continue();
    });
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await until(page, () => navigator.serviceWorker.getRegistration().then(r => r.waiting?.state === 'installed'));
    assert.deepEqual(got, [`pc.css?v=${n + 1}`]);
  } finally { await app.close(); await srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

// install で入れそこねたもの（1回目だけ落とす trivia.js）は、activate でもう一度入れる
{
  let failed = 0;
  t('sw_activate_refills', async page => {
    await swReady(page);
    assert.equal(failed, 1);
    await until(page, () => caches.keys().then(async k => !!(await (await caches.open(k[0])).match(new URL('trivia.js', location.href).href))));
  }, { waitMap: false, routes: [[/\/trivia\.js$/, route => {
    if (route.request().serviceWorker() && !failed) { failed++; return route.abort(); }
    return route.continue();
  }]] });
}

// ?v= の無いファイル: ネットが3秒で返らなければ保存したものを出す。500番台も落ちたのと同じ（ページも）
t('sw_slow_or_5xx_unversioned', async (page, { context }) => {
  await swReady(page);
  await page.reload();
  await page.locator('#scr-home').waitFor();
  await context.route(/\/countries\.js$/, async route => { await sleep(8000); await route.continue().catch(() => {}); });
  const t0 = Date.now();
  await page.reload();
  await page.locator('#scr-home').waitFor();
  assert.ok(Date.now() - t0 < 6500, `${Date.now() - t0}ms`);
  assert.equal(await page.evaluate(() => window.COUNTRIES.length), 195);
  await context.unroute(/\/countries\.js$/);
  await context.route(u => /\/(countries\.js)?$/.test(u.pathname), route => route.fulfill({ status: 503, body: 'down' }));
  await page.reload();
  await page.locator('#scr-home').waitFor();
  assert.equal(await page.evaluate(() => window.COUNTRIES.length), 195);
}, { waitMap: false });

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
  assert.equal((await page.textContent('#pwa-ios p')).trim(), 'Safari の共有ボタン（□に↑）を押して、「ホーム画面に追加」を選んでね。');
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

// LINE などのアプリの中のブラウザでは、2日目・知らせありでも帯も設定の欄も出さない
const LINE_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.20.0';
b('install_hidden_in_app_browser', async page => {
  await fakePrompt(page);
  assert.equal(await page.isHidden('#home-pwa'), true);
  await page.click('#home-settings');
  await page.locator('#scr-settings').waitFor();
  assert.equal(await page.isHidden('#set-pwa-field'), true);
}, { storage: DAY2, init: `Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ${JSON.stringify(LINE_IOS)} });` });

// 前から遊んでいる人（pwa は無いが settings がある）は first を昨日にして、その日から帯が出る
b('install_banner_existing_player', async page => {
  await fakePrompt(page);
  await page.locator('#home-pwa').waitFor();
  assert.equal((await pwaSave(page)).first, await page.evaluate(() => DAILY_CORE.addDays(DAILY_CORE.jstDay(), -1)));
}, { storage: { settings: { sound: false } } });

// 先の日付の first は今日に、30日より先の hideUntil は 0 にそろえる
b('install_save_clamped', async page => {
  const s = await pwaSave(page);
  assert.equal(s.first, await page.evaluate(() => DAILY_CORE.jstDay()));
  assert.equal(s.hideUntil, 0);
}, { storage: { pwa: { v: 1, first: '2099-01-01', hideUntil: 9e15 } } });
