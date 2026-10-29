// ホーム（B6）: 大きなカード3枚（クイズで遊ぶ・今日の難問・冒険）と小さいアイコン5つ（ランキング・バッジ・図鑑・プロフィール・設定）、
// #home-status（称号の札など。空なら見えない）。入口は index.html に置いてあり、機能ファイルは homeEntry で出す。
// ファイルを止めたとき・冒険 OFF・ランキング無効でもほかが詰めて並び、Tab の順もこの並び
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, QUIET_BADGES } from './helpers.mjs';
import { RPG_FILES, saveWith } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで ?bdgdebug=1 を付けて開き、最後にページで例外が出ていないかも見る。
// 既定は札の出ない QUIET_BADGES で、どのファイルも止めない（本物の rpg.js・badges.js・daily.js・profile.js）。opts は openApp にそのまま渡す
const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { url: server.url + '?bdgdebug=1', storage: { badges: QUIET_BADGES }, blockScripts: [], ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const text = (page, sel) => page.locator(sel).innerText();
// 見えている要素の id を並びの順に
const ids = (page, sel) => page.$$eval(sel, es => es.filter(e => e.checkVisibility()).map(e => e.id));
// 称号〈ドリルの新人〉をつけてあるセーブ（badges.test.mjs の TITLED と同じ）
const TITLED = { v: 1, got: { 'first-clear@1': 1 }, eq: 'first-clear@1', sn: { 'first-clear': 2 }, sent: ['first-clear@1'] };

t('entry_order', async page => {
  assert.deepEqual(await ids(page, '#home-big > .hbig'), ['home-play', 'home-daily', 'home-rpg']);
  assert.deepEqual(await ids(page, '#home-icons > .hicon'), ['home-rank', 'home-badges', 'home-book', 'home-profile', 'home-settings']);
  assert.equal(await page.locator('#home-rpg').count(), 1);
  assert.equal(await page.locator('#home-daily').count(), 1);
  assert.equal(await page.locator('#home-badges').count(), 1);
  assert.match(await text(page, '#home-play .hb-title'), /^クイズで遊ぶ$/);
  assert.match(await text(page, '#home-daily .hb-title'), /^今日の難問$/);
  assert.match(await text(page, '#home-rpg .hb-title'), /^冒険$/);
  assert.match(await text(page, '#home-daily .hb-note'), /\d+\/\d+[\s\S]*(NEW|挑戦ずみ)/);
  assert.match(await text(page, '#home-rpg .hb-note'), /NEW/);
  assert.match(await text(page, '#home-badges .hi-sub'), /^\d+\/\d+$/);
  assert.deepEqual(await page.$$eval('#home-icons .hi-label', es => es.map(e => e.textContent)), ['ランキング', 'バッジ', '図鑑', 'プロフィール', '設定']);
  // 説明に首都は出さない
  assert.ok(!(await text(page, '#scr-home')).includes('首都'));
});

// 止めたファイルの入口は hidden のまま、残りは詰めて並ぶ
for (const [files, gone] of [[['daily.js'], 'home-daily'], [RPG_FILES, 'home-rpg'], [['badges.js'], 'home-badges'], [['profile.js'], 'home-profile']])
  t(`blocked_${gone}`, async page => {
    assert.equal(await page.isHidden('#' + gone), true);
    const seen = await ids(page, '.hbig, .hicon');
    assert.ok(!seen.includes(gone), seen.join());
    assert.equal(seen.length, 7, seen.join());
  }, { blockScripts: files });

t('rpg_off_hides_card', async page => {
  assert.deepEqual(await ids(page, '#home-big > .hbig'), ['home-play', 'home-daily']);
}, { storage: { badges: QUIET_BADGES, rpg: saveWith({ show: false }) } });

t('ranking_disabled', async page => {
  // 接続先が未設定の状態にする（ranking.test の home_button_hidden_when_disabled と同じやり方）
  await page.route('**/ranking.js*', async route => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()) + '\nRANKING.enabled = false;\n' });
  });
  await page.reload();
  // プロフィールもランキングの接続先を使うので、profile.js は入口を出さない（profile.js の先頭の RANKING.enabled）
  assert.deepEqual(await ids(page, '#home-icons > .hicon'), ['home-badges', 'home-book', 'home-settings']);
});

t('tab_order', async page => {
  const seen = [];
  for (let i = 0; i < 40 && seen.at(-1) !== 'home-settings'; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => document.activeElement?.id ?? ''));
  }
  assert.deepEqual(seen.filter(id => id.startsWith('home-')),
    ['home-title', 'home-play', 'home-daily', 'home-rpg', 'home-rank', 'home-badges', 'home-book', 'home-profile', 'home-settings']);
}, { storage: { badges: TITLED } });

t('status_empty_hidden', async page => {
  assert.equal(await page.isVisible('#home-status'), false);   // QUIET_BADGES: 札なし
  assert.equal(await page.$eval('#home-status', e => e.childElementCount), 0);
  // 称号をつける（[data-bdg-equip] は document のクリックで受ける）
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.dataset.bdgEquip = 'first-clear@1'; b.textContent = 'x';
    document.body.append(b); b.click(); b.remove();
    show('home');
  });
  assert.equal(await page.isVisible('#home-status'), true);
  assert.equal(await page.$eval('#home-status', e => e.firstElementChild.className), 'bdg-titlerow');
  assert.equal(await text(page, '#home-title'), '〈ドリルの新人〉');
  // 札は #home-status の中で1つだけ（何度描いても作り直さない）
  await page.evaluate(() => { show('setup'); show('home'); });
  assert.equal(await page.locator('#home-status .bdg-titlerow').count(), 1);
});

t('entries_open', async page => {
  for (const [id, scr] of [['home-play', 'setup'], ['home-daily', 'daily'], ['home-rpg', 'rpg'], ['home-rank', 'ranking'],
    ['home-badges', 'badges'], ['home-book', 'book'], ['home-profile', 'profile'], ['home-settings', 'settings']]) {
    await page.click('#' + id);
    assert.equal(await page.isVisible('#scr-' + scr), true, id);
    assert.equal(await page.isHidden('#scr-home'), true, id);
    await page.evaluate(() => show('home'));
  }
});
