// モード選択の細かい地域（東アジア・カリブ海など）と、地域を見せる世界地図
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn) => test(name, { timeout: 30_000 }, async () => {
  const app = await openApp(browser);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const SUBS = { '東アジア': 5, '東南アジア': 11, '南アジア': 8, '中央アジア': 5, '西アジア': 17, '東ヨーロッパ': 21, '西ヨーロッパ': 25, 'カリブ海': 13, 'アフリカ北側': 34, 'アフリカ南側': 20 };

// 6地域を選ぶと、その細かい地域のボタンが出る（細かい地域を選んでも出たまま）
t('sub_chips', async page => {
  const PARENT = { 'アジア': ['東アジア', '東南アジア', '南アジア', '中央アジア', '西アジア'], 'ヨーロッパ': ['東ヨーロッパ', '西ヨーロッパ'],
    'アフリカ': ['アフリカ北側', 'アフリカ南側'], '北・中央アメリカ': ['カリブ海'], '南アメリカ': [], 'オセアニア': [], all: [] };
  await pickSetup(page, { kind: 'practice' });
  for (const [p, subs] of Object.entries(PARENT)) {
    await pickSetup(page, { region: p });
    assert.deepEqual(await page.$$eval('#regions .chip.sub', bs => bs.map(b => b.dataset.r)), subs, p);
    for (const r of subs) {
      assert.match(await page.locator(`#regions .chip.sub[data-r="${r}"]`).innerText(), new RegExp(`${r}\\s*${SUBS[r]}`));
      await pickSetup(page, { region: r });
      assert.equal(await page.locator('#regions .chip.sub').count(), subs.length, r);
      assert.equal(await page.locator(`#regions .chip[data-r="${r}"]`).getAttribute('aria-pressed'), 'true');
    }
  }
  assert.equal(await page.locator('#regions .chip:not(.sub)').count(), 7);
});

t('sub_region_quiz_uses_only_that_region', async page => {
  await pickSetup(page, { mode: 'f2m', kind: 'practice', region: '北・中央アメリカ' });
  await pickSetup(page, { region: 'カリブ海', count: 10 });
  assert.equal(await page.locator('#counts .chip[data-c="20"]').isDisabled(), true);
  await page.click('#start');
  const r = await page.evaluate(() => ({
    set: G.set.every(c => SUBREGIONS['カリブ海'].set.has(c.a)), n: G.set.length,
    opts: G.cur.opts.every(c => SUBREGIONS['カリブ海'].set.has(c.a)),
  }));
  assert.deepEqual(r, { set: true, n: 10, opts: true });
  assert.equal(await page.locator('#qcard .choice.mapc svg.map').count(), 4);
});

t('world_map_highlights_region', async page => {
  await pickSetup(page, { kind: 'practice', region: 'アジア' });
  await pickSetup(page, { region: '東南アジア' });
  const r = await page.evaluate(() => ({
    on: [...document.querySelectorAll('#rmap path.in')].map(p => p.dataset.a).sort(),
    frame: document.querySelector('#rmap .frame').getAttribute('d').length > 10,
  }));
  assert.equal(r.frame, true);
  // 11か国とも色つき。小さいシンガポールは丸印も出る
  assert.deepEqual(r.on, ['bn', 'id', 'kh', 'la', 'mm', 'my', 'ph', 'sg', 'th', 'tl', 'vn']);
  assert.equal(await page.locator('#rmap circle.dot[data-a="sg"]').isVisible(), true);
  await pickSetup(page, { region: 'all' });
  assert.equal(await page.evaluate(() => document.querySelector('#rmap .frame').getAttribute('d')), '');
});

t('tap_map_selects_region', async page => {
  await pickSetup(page, { kind: 'practice', region: 'all' });
  await page.locator('#rmap path[data-a="jp"]').dispatchEvent('click');
  assert.equal(await page.evaluate(() => S.region), '東アジア');
  await page.locator('#rmap path[data-a="jp"]').dispatchEvent('click');
  assert.equal(await page.evaluate(() => S.region), 'アジア');
  await page.locator('#rmap path[data-a="jp"]').dispatchEvent('click');
  assert.equal(await page.evaluate(() => S.region), 'all');
});

t('time_attack_keeps_big_regions', async page => {
  await pickSetup(page, { kind: 'practice', region: 'ヨーロッパ' });
  await pickSetup(page, { region: '西ヨーロッパ' });
  await pickSetup(page, { kind: 'ta' });
  assert.equal(await page.evaluate(() => S.region), 'ヨーロッパ');
  assert.equal(await page.locator('#regions .chip.sub').count(), 0);
  await page.locator('#rmap path[data-a="jp"]').dispatchEvent('click');
  assert.equal(await page.evaluate(() => S.region), 'アジア');
});

t('ranking_opens_with_parent_region', async page => {
  await pickSetup(page, { kind: 'practice', region: '北・中央アメリカ' });
  await pickSetup(page, { region: 'カリブ海' });
  await page.evaluate(() => openRanking());
  assert.equal(await page.evaluate(() => RK.region), '北・中央アメリカ');
  assert.equal(await page.locator('#rk-regions .chip').count(), 7);
});
