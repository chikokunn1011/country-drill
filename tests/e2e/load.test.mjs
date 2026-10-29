// B4: 起動を軽くする。起動時は flags.js・world.js・d3・topojson を読まず、地図はホームが出たあとにうしろで読む。
// 地図を使う画面（MAP_SCREENS）へは地図を待ってから進み、0.3秒こえたら帯 #mapwait を出す。読めなければ［もう一度］
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, settle } from './helpers.mjs';
import { openRpg, writeSave, saveWith, startBattle } from './rpg_helpers.mjs';

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

// スマホ（幅390）でホームを下までスクロールしてから［図鑑］を押しても、帯は画面の中に見えている。
// PR3 のホームは 390×844 では画面に収まりスクロールしないので、ホームがはみ出す背の低さ（ブラウザのバーが出た 390×664）で確かめる
const inView = page => page.$eval('#mapwait', el => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; });
t('mapwait_visible_after_scroll', async page => {
  await page.goto(server.url);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  assert.ok(await page.evaluate(() => scrollY > 0));
  await page.click('#home-book');
  await sleep(400);
  assert.equal(await inView(page), true);
  await page.locator('#scr-book').waitFor();
}, { path: 'about.html', viewport: { width: 390, height: 664 }, routes: [['**/world.js*', delay(1500)]] });

// 背の低い端末で読みこみに失敗しても、［もう一度］が画面の中に見えて押せる
t('mapwait_retry_visible_after_scroll', async page => {
  let blocked = true;
  await page.route('**/world.js*', r => blocked ? r.abort() : r.continue());
  await page.goto(server.url);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  assert.ok(await page.evaluate(() => scrollY > 0));
  await page.click('#home-book');
  await page.locator('#mapwait-retry').waitFor();
  assert.equal(await inView(page), true);
  blocked = false;
  await page.click('#mapwait-retry');
  await page.locator('#scr-book').waitFor();
}, { path: 'about.html', viewport: { width: 320, height: 568 } });

/* ---------- 国旗の先読みと「じゅんび中」 ---------- */
// 195枚の国旗を数えるので、resource の記録の枠を広げておく（既定は250件）
const BIG_BUFFER = 'performance.setResourceTimingBufferSize(2000);';
// 読んだ国旗の国コード（重なりなし）
const flagsLoaded = page => page.evaluate(() => [...new Set(performance.getEntriesByType('resource').map(r => /\/flags\/([a-z]{2})\.svg/.exec(r.name)?.[1]).filter(Boolean))]);
// 出ている問題の国旗の img がどれも読み終わっている
const qImgsReady = page => page.$$eval('#qcard img', els => els.length > 0 && els.every(e => e.complete && e.naturalWidth > 0));
const slowFlags = ms => [['**/flags/*.svg*', delay(ms)]];
const startTa = async (page, mode, count = 10) => {
  await pickSetup(page, { mode, kind: 'ta', region: 'all', count });
  await page.click('#start');
};

// タイムアタック: 1問目を出す前に国旗を読み終える。n2f は選択肢が世界中から出るので195か国、f2n は出る10か国だけ
for (const [mode, all] of [['n2f', true], ['f2n', false]]) {
  t(`ta_flags_ready_before_first_${mode}`, async page => {
    const before = new Set(await flagsLoaded(page));
    await startTa(page, mode);
    await settle(page);
    assert.equal(await qImgsReady(page), true);
    const after = await flagsLoaded(page), set = await page.evaluate(() => G.set.map(c => c.a));
    if (all) assert.equal(after.length, 195);
    else {
      for (const a of set) assert.ok(after.includes(a), a);
      assert.deepEqual(after.filter(a => !before.has(a) && !set.includes(a)), []);   // 出ない国の国旗は読まない
    }
  }, { waitMap: true, seed: 3, init: BIG_BUFFER });
}

// 「じゅんび中」のあいだは問題を出さず、時間も計らない
t('prep_holds_timer', async page => {
  await startTa(page, 'n2f');
  await page.locator('#qcard .prep').waitFor();
  assert.equal((await page.textContent('#qcard .prep')).trim(), 'じゅんび中…');
  assert.deepEqual(await page.evaluate(() => ({ cur: G.cur, t0: G.t0, time: $('ptime').textContent === RANKING.formatTime(0) })), { cur: null, t0: 0, time: true });
  await settle(page);
  assert.ok(await page.evaluate(() => G.t0 > 0));
}, { waitMap: true, routes: slowFlags(300) });

// 今日の難問も、国旗を読み終えてから1問目
t('daily_flags_ready_before_first', async page => {
  await page.click('#home-daily');
  await page.click('#dl-start');
  await page.locator('#scr-quiz').waitFor();
  await settle(page);
  assert.equal(await qImgsReady(page), true);
  assert.ok(await page.evaluate(() => G.t0 > 0));
}, { waitMap: true, routes: slowFlags(600) });

// 「じゅんび中」にやめたら、あとで国旗が読み終わっても1問目を出さない
t('quit_during_prep', async page => {
  await startTa(page, 'n2f');
  await page.locator('#qcard .prep').waitFor();
  await page.click('#quit');
  await sleep(1500);
  assert.equal(await page.isVisible('#scr-setup'), true);
  assert.equal(await page.isHidden('#scr-quiz'), true);
  assert.equal(await page.evaluate(() => G.cur), null);
}, { waitMap: true, routes: slowFlags(1000) });

// 「じゅんび中」に数字キー・Enter を押しても何も起きない
t('keys_during_prep', async page => {
  await startTa(page, 'n2f');
  await page.locator('#qcard .prep').waitFor();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await settle(page);
  assert.equal(await page.evaluate(() => G.done), 0);
}, { waitMap: true, routes: slowFlags(500) });

// 練習は待たずに始め、次の問題の国旗をうしろで読んでおく
t('practice_preloads_next', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 10 });
  await page.click('#start');
  const next = await page.evaluate(() => G.queue[0].a);
  await page.waitForFunction(a => performance.getEntriesByType('resource').some(r => r.name.includes(`/flags/${a}.svg`)), next);
}, { waitMap: true, seed: 5 });

// 冒険のバトルも、次の問題の国旗をうしろで読んでおく
test('battle_preloads_next', { timeout: 60_000 }, async () => {
  const app = await openRpg(browser, { seed: 1 });
  const { page } = app;
  try {
    await writeSave(page, saveWith({}));
    await startBattle(page, 'samerica', 1);
    const next = await page.evaluate(() => RPG_BATTLE.state().next);
    assert.ok(next, 'next');
    await page.waitForFunction(a => performance.getEntriesByType('resource').some(r => r.name.includes(`/flags/${a}.svg`)), next);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
