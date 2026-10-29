// 白地図タップ（mode: 'tap'）: モード選択の5枚目のカード、タイムアタック・ランキングから外す
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, recordEvents, events } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 30_000 }, async () => {
  const app = await openApp(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});

t('tap_card_and_ta_off', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'ta' });
  assert.equal(await page.locator('#modes .modecard').count(), 5);
  assert.match(await page.innerText('#modes .modecard[data-k="tap"]'), /白地図タップ/);
  await page.click('#modes .modecard[data-k="tap"]');
  assert.equal(await page.evaluate(() => P.kind), 'practice');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('setup')).kind), 'practice');
  assert.equal(await page.locator('#kinds [data-k="ta"]').isDisabled(), true);
  assert.equal(await page.getAttribute('#kinds [data-k="ta"]', 'aria-disabled'), 'true');
  assert.match(await page.innerText('#kinds [data-k="ta"]'), /白地図タップでは遊べない/);
  assert.equal(await page.getAttribute('#kinds [data-k="practice"]', 'aria-pressed'), 'true');
  // f2n に戻すとタイムアタックがまた押せる
  await page.click('#modes .modecard[data-k="f2n"]');
  assert.equal(await page.locator('#kinds [data-k="ta"]').isDisabled(), false);
  await page.click('#kinds [data-k="ta"]');
  assert.equal(await page.evaluate(() => P.kind), 'ta');
});

t('stored_tap_ta', async page => {
  await recordEvents(page);
  await page.click('#home-play');
  assert.equal(await page.evaluate(() => P.kind), 'practice');
  assert.equal(await page.getAttribute('#kinds [data-k="practice"]', 'aria-pressed'), 'true');
  await page.click('#start');
  assert.equal(await page.evaluate(() => G.kind), 'practice');
  const [st] = await events(page, 'drill:start');
  assert.equal(st.mode, 'tap'); assert.equal(st.kind, 'practice');
}, { storage: { setup: { mode: 'tap', kind: 'ta', count: 5 } } });

t('ranking_without_tap', async page => {
  await page.evaluate(() => { P.mode = 'tap'; openRanking(); });
  assert.equal(await page.evaluate(() => RK.mode), 'f2n');
  const ks = await page.$$eval('#rk-modes .chip', bs => bs.map(b => b.dataset.k));
  assert.ok(ks.length >= 4 && !ks.includes('tap'), ks.join());
  assert.equal(await page.evaluate(() => boardConds('tap:all:10')), null);
  assert.notEqual(await page.evaluate(() => boardConds('f2n:all:10')), null);
});
