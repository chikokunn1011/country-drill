// 国旗ガチャと仲間の画面の並べ方（4つの大きさで横にはみ出さない・PC は左右2列）と、全画面を順に回る確認（設計書 §14）
// MERGE: Task 10 の tests/e2e/rpg_layout.test.mjs と合流したら、この2つのテストはそちらに移す（VIEWPORTS と noHScroll はそちらのものを使う）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from './helpers.mjs';
import { openRpg, writeSave, saveWith } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// Task 10 の rpg_layout.test.mjs と同じもの
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 1440, height: 900 }, { width: 1280, height: 720 }];
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

// 毎回まっさらなブラウザで（種1で）開いて fn を実行する。最後にページの例外と、[rpg] で始まる console.error が無いことを見る
const t = (name, fn, { timeout = 60_000, ...opts } = {}) => test(name, { timeout }, async () => {
  const app = await openRpg(browser, { seed: 1, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});
const size = v => `${v.width}x${v.height}`;

t('gacha_layout', async page => {
  // 名前の長い国が多い地域で10連（結果あり）
  await writeSave(page, saveWith({ coins: 1000, cards: { jp: [3, 4], cf: [2, 2], vc: [1, 1] }, fr: { cf: 10, vc: 7 } }));
  await page.evaluate(() => RPG.open('gacha', { region: '北・中央アメリカ' }));
  await page.click('#ga-10');
  await page.click('#ga-flipall');
  for (const v of VIEWPORTS) {
    await page.setViewportSize(v);
    assert.ok(await noHScroll(page), `gacha ${size(v)}`);
    assert.equal(await page.locator('#ga-res .rpg-card').count(), 10);
  }
  // PC: 左に地域・ボタン・確率、右に結果
  await page.setViewportSize({ width: 1440, height: 900 });
  const r = await page.evaluate(() => {
    const box = id => $(id).getBoundingClientRect();
    const tops = [...document.querySelectorAll('#ga-res .rpg-card')].map(c => Math.round(c.getBoundingClientRect().top));
    return { res: box('ga-res').left, rates: box('ga-rates').right, rows: new Set(tops).size };
  });
  assert.ok(r.res > r.rates, JSON.stringify(r));
  assert.equal(r.rows, 1, JSON.stringify(r));   // 1400px 以上は10枚を横1列
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.equal(await page.evaluate(() => new Set([...document.querySelectorAll('#ga-res .rpg-card')].map(c => Math.round(c.getBoundingClientRect().top))).size), 2);   // 5列×2
  await page.evaluate(() => RPG.open('cards'));
  for (const v of VIEWPORTS) {
    await page.setViewportSize(v);
    assert.ok(await noHScroll(page), `cards ${size(v)}`);
  }
}, { timeout: 180_000 });

t('walk_all_screens', async page => {
  await writeSave(page, saveWith({ intro: true, coins: 1000 }));
  const names = await page.evaluate(() => [...SCREENS]);
  for (const s of ['rpg', 'gacha', 'cards']) assert.ok(names.includes(s), `${s} が SCREENS に無い: ${names}`);
  // MERGE: battle は Task 9 のブランチと合流後に必須にする（下の if を外して、names に 'battle' があることを確かめる）
  if (await page.evaluate(() => typeof window.RPG_BATTLE === 'object')) assert.ok(names.includes('battle'), `battle が SCREENS に無い: ${names}`);
  for (const v of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(v);
    for (const name of names) {
      await page.evaluate(n => show(n), name);
      const r = await page.evaluate(names => ({
        shown: names.filter(n => !$('scr-' + n).hidden && getComputedStyle($('scr-' + n)).display !== 'none'),
        screen: document.body.dataset.screen,
      }), names);
      assert.deepEqual(r.shown, [name], `${name} ${size(v)}`);
      assert.equal(r.screen, name);
      assert.ok(await noHScroll(page), `${name} ${size(v)}`);
    }
  }
  await page.evaluate(() => show('home'));
  assert.equal(await page.isVisible('#scr-home'), true);
}, { timeout: 180_000 });
