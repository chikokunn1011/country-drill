// 国ごとのページ（B1）と、本編の入口（#play=<地域> で地域を選んだモード選択を開く）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { startServer, openApp, pickSetup, answerCorrect, PHONE, PC } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const TRIVIA = (() => { const ctx = { window: {} }; vm.runInNewContext(read('trivia.js'), ctx); return ctx.window.TRIVIA; })();
const REGIONS = JSON.parse(/const REGIONS = (\[[^\]]*\]);/.exec(read('index.html'))[1].replace(/'/g, '"'));
const LIGHT = 'rgb(238, 242, 241)', DARK = 'rgb(15, 23, 28)';
const bg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
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

// 前回がタイムアタックでも、細かい地域を受けたら練習にして、その地域を選んだ状態にする（タイムアタックは大きい地域だけ）
test('play_hash_sub_after_ta', { timeout: 60_000 }, () => open({ path: 'index.html#play=' + encodeURIComponent('西ヨーロッパ'), storage: { setup: { kind: 'ta' }, settings: { region: 'ヨーロッパ', sub: '東ヨーロッパ' } } }, async page => {
  await page.locator('#scr-setup').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => S.region), '西ヨーロッパ');
  assert.equal(await savedRegion(page), '西ヨーロッパ');
  assert.equal(await pressedRegion(page), '西ヨーロッパ');
  assert.equal(await page.evaluate(() => P.kind), 'practice');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('setup')).kind), 'practice');
  assert.equal(await page.locator('#kinds .modecard[aria-pressed="true"]').getAttribute('data-k'), 'practice');
}));

// 6地域ならタイムアタックのまま（ランキングの区分なので変えない）
test('play_hash_region_keeps_ta', { timeout: 60_000 }, () => open({ path: 'index.html#play=' + encodeURIComponent('アフリカ'), storage: { setup: { kind: 'ta' } } }, async page => {
  await page.locator('#scr-setup').waitFor({ state: 'visible' });
  assert.equal(await pressedRegion(page), 'アフリカ');
  assert.equal(await page.evaluate(() => P.kind), 'ta');
}));

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

/* ---------- 国のページ ---------- */
test('country_page_renders', { timeout: 120_000 }, async () => {
  for (const viewport of [PHONE, { width: 360, height: 740 }, PC]) {
    const reqs = [], where = `${viewport.width}x${viewport.height}`;
    await open({ path: 'country/fr.html', viewport, routes: [['**/*', route => { reqs.push(new URL(route.request().url()).pathname); route.fallback(); }]] }, async page => {
      assert.equal(await page.textContent('h1'), 'フランス', where);
      await page.waitForFunction(() => { const i = document.querySelector('.cflag img'); return i.complete && i.naturalWidth > 0; });
      assert.equal(await page.locator('.trivia li').count(), TRIVIA.fr.length, where);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where} 横スクロール`);
      assert.equal(await bg(page), LIGHT, where);
      assert.equal(await page.locator('script[src]').count(), 0, where);
      assert.deepEqual(reqs.filter(u => u.endsWith('world.js') || u.startsWith('/vendor/')), [], where);   // 地図は読まない
    });
  }
});

test('country_page_dark', { timeout: 60_000 }, async () => {
  await open({ path: 'country/fr.html', storage: { settings: { theme: 'dark' } } }, async page => assert.equal(await bg(page), DARK, '設定がダーク'));
  await open({ path: 'country/fr.html', colorScheme: 'dark' }, async page => assert.equal(await bg(page), LIGHT, '設定なし・端末がダーク'));
  await open({ path: 'country/', colorScheme: 'dark', storage: { settings: { theme: 'auto' } } }, async page => assert.equal(await bg(page), DARK, '一覧・端末に合わせる'));
});

test('country_play_region', { timeout: 60_000 }, () => open({ path: 'country/fr.html' }, async page => {
  await page.click('.play-region');
  await page.locator('#scr-setup').waitFor({ state: 'visible' });
  assert.equal(await pressedRegion(page), '西ヨーロッパ');
}));

test('country_index', { timeout: 60_000 }, () => open({ path: 'country/' }, async page => {
  assert.deepEqual(await page.locator('section h2').allTextContents(), REGIONS);
  assert.equal(await page.locator('a.ccard').count(), 195);
  await page.click('a.ccard[href="jp.html"]');
  await page.waitForURL(/\/country\/jp\.html$/);
  assert.equal(await page.textContent('h1'), '日本');
}));

/* ---------- 図鑑から国のページへ ---------- */
test('book_links_country_page', { timeout: 60_000 }, () => open({}, async page => {
  await page.evaluate(() => show('book'));
  await page.click('#bview button[data-v="list"]');
  await page.click('#grid .card[data-a="fr"]');
  await page.waitForSelector('#detail[open]');
  assert.equal(await page.getAttribute('#detail .cpage a', 'href'), 'country/fr.html');
  assert.equal(await page.locator('#detail-inner > .close + .facts + .cpage + .trivia').count(), 1);   // 国の情報のあと・豆知識の前
  await page.click('#dclose');
  await page.click('#bview button[data-v="map"]');
  await page.waitForSelector('#bmapbox svg path');
  await page.evaluate(() => selectBook('fr', true));
  assert.equal(await page.getAttribute('#binfo .cpage a', 'href'), 'country/fr.html');
  await page.click('#binfo .cpage a');
  await page.waitForURL(/\/country\/fr\.html$/);
  assert.equal(await page.textContent('h1'), 'フランス');
}));

test('no_link_in_quiz_answer', { timeout: 60_000 }, () => open({}, async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await page.waitForSelector('#qcard .choice');
  await answerCorrect(page);
  await page.waitForSelector('#next');
  assert.ok(await page.locator('#qcard .facts').count() > 0);
  assert.equal(await page.locator('#qcard .cpage').count(), 0);
}));
