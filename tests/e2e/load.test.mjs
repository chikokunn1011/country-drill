// B4: 起動を軽くする。起動時は flags.js・world.js・d3・topojson を読まず、地図はホームが出たあとにうしろで読む。
// 地図を使う画面（MAP_SCREENS）へは地図を待ってから進み、0.3秒こえたら帯 #mapwait を出す。読めなければ［もう一度］
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { waitMap: false, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
// ms だけ遅らせて返す route のハンドラ
const delay = ms => async route => { await sleep(ms); await route.continue(); };
// 読んだファイルの URL（同じオリジンは / からのパスと ?v=）
const resources = page => page.evaluate(() => performance.getEntriesByType('resource').map(r => { const u = new URL(r.name); return u.origin === location.origin ? u.pathname.slice(1) + u.search : r.name; }));

// load までに読むファイルは合わせて 1MB 未満で、地図の3ファイルと flags.js を読まない
t('boot_is_light', async page => {
  await page.waitForFunction(() => performance.getEntriesByType('navigation')[0]?.loadEventStart > 0);
  const r = await page.evaluate(() => {
    const end = performance.getEntriesByType('navigation')[0].loadEventStart;
    const list = performance.getEntriesByType('resource').filter(x => x.startTime < end);
    return { bytes: list.reduce((s, x) => s + x.encodedBodySize, 0), names: list.map(x => x.name) };
  });
  assert.ok(r.bytes < 1_000_000, `${r.bytes} bytes`);
  for (const s of ['world.js', 'vendor/', 'flags.js']) assert.ok(!r.names.some(n => n.includes(s)), s);
}, { seed: 1 });

// ホームが出たあと、うしろで地図を読む
t('map_loads_in_background', async (page, app) => {
  await page.waitForFunction(() => mapReady);
  const names = await resources(page);
  for (const s of ['world.js?v=1', 'vendor/d3-7.9.0.min.js', 'vendor/topojson-client-3.1.0.min.js']) assert.ok(names.includes(s), s);
  const m = await page.evaluate(() => ({ feats: feats.length, fc: featCountry.size, byId: featById.size, g: !!graticule }));
  assert.ok(m.feats > 0);
  assert.equal(m.fc, m.feats);
  assert.ok(m.byId > 0 && m.g);
  // フォントなど外への通信はテストで止めている（Failed to load resource）。それ以外の console.error は無い
  assert.deepEqual(app.consoleErrors.filter(s => !s.startsWith('Failed to load resource')), []);
});

// #play で直接開いて地図が遅いときは、まずホームを出して帯で待ち、読めたらモード選択へ
t('deep_link_waits', async page => {
  // 直接開いたときは、読みはじめた地図の script が load を遅らせるので DOMContentLoaded まで
  await page.goto(new URL('#play', server.url).href, { waitUntil: 'domcontentloaded' });
  await sleep(400);
  assert.equal(await page.isVisible('#scr-home'), true);
  assert.equal(await page.isVisible('#mapwait'), true);
  assert.equal((await page.textContent('#mapwait-msg')).trim(), '地図を読みこみ中…');
  await page.locator('#scr-setup').waitFor();
  assert.equal(await page.isHidden('#mapwait'), true);
  assert.equal(await page.isHidden('#scr-home'), true);
}, { path: 'about.html', routes: [['**/world.js*', delay(1000)]] });

// world.js が読めないときは［もう一度］。ホームとランキングはそのまま使える。d3 は二重に読まない
t('world_blocked_retry', async (page, app) => {
  let blocked = true, d3Requests = 0;
  page.on('request', r => { if (r.url().includes('vendor/d3-7.9.0.min.js')) d3Requests++; });
  await page.route('**/world.js*', r => blocked ? r.abort() : r.continue());
  await page.goto(server.url);
  await page.click('#home-play');
  await page.locator('#mapwait-retry').waitFor();
  assert.equal((await page.textContent('#mapwait-msg')).trim(), '地図を読みこめなかった');
  assert.ok(app.consoleErrors.some(s => /^\[map\]/.test(s)), app.consoleErrors.join('\n'));
  assert.equal(await page.isVisible('#scr-home'), true);
  if (await page.evaluate(() => RANKING.enabled)) {
    await page.evaluate(() => openRanking());
    assert.equal(await page.isVisible('#scr-ranking'), true);
    await page.click('#brand');
    assert.equal(await page.isVisible('#scr-home'), true);
    await page.click('#home-play');
    await page.locator('#mapwait-retry').waitFor();
  }
  blocked = false;
  await page.click('#mapwait-retry');
  await page.locator('#scr-setup').waitFor();
  assert.equal(await page.isHidden('#mapwait'), true);
  assert.equal(d3Requests, 1);
}, { path: 'about.html' });

// 地図を待っているあいだにほかの画面へ行ったら、読み終わっても勝手に画面を変えない
t('navigate_while_waiting', async page => {
  await page.goto(server.url);
  await page.click('#home-play');
  await sleep(400);
  assert.equal(await page.isVisible('#mapwait'), true);
  await page.click('#home-settings');
  assert.equal(await page.isVisible('#scr-settings'), true);
  await page.waitForFunction(() => mapReady);
  await sleep(100);
  assert.equal(await page.isVisible('#scr-settings'), true);
  assert.equal(await page.isHidden('#mapwait'), true);
}, { path: 'about.html', routes: [['**/world.js*', delay(1000)]] });
