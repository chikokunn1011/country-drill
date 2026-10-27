// 冒険ランキング（rpg-rank.js の #scr-rpgrank）: 冒険ホームの入口、きみの記録、載せる（偽 Supabase）、レベル順・ダンジョン順、つながらないとき
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from './helpers.mjs';
import { openRpg, writeSave, saveWith } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openRpg(browser, { seed: 1, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});
const text = (page, sel) => page.locator(sel).innerText();
const rows = page => page.$$eval('#rr-list li', ls => ls.map(l => l.innerText.replace(/\s+/g, ' ').trim()));
const ago = s => new Date(Date.now() - s * 1000).toISOString();

t('home_entry_and_my_record', async page => {
  await writeSave(page, saveWith({ lv: 12, floors: { samerica: 5, oceania: 3 } }));
  await page.evaluate(() => RPG.open('rpg'));
  await page.click('#rpg-to-rank');
  assert.equal(await page.isVisible('#scr-rpgrank'), true);
  const me = await text(page, '#rr-me');
  assert.ok(me.includes('Lv 12') && me.includes('ダンジョン 1/7（フロア 8/35）'), me);
  await page.waitForFunction(() => $('rr-rank').textContent.includes('相当'));
  assert.equal(await text(page, '#rr-rank'), 'レベル順 1位・ダンジョン順 1位 相当');
  assert.equal(await page.isVisible('#rr-empty'), true);
  await page.click('#scr-rpgrank .rpg-back');
  assert.equal(await page.isVisible('#scr-rpg'), true);
});

t('submit_and_sorts', async (page, app) => {
  app.db.rpgRows.push(
    { nickname: 'ミケ', lv: 30, dungeons: 1, floors: 7, created_at: ago(60) },
    { nickname: 'タロウ', lv: 8, dungeons: 3, floors: 16, created_at: ago(50) },
  );
  await writeSave(page, saveWith({ lv: 12, floors: { samerica: 5, oceania: 5 } }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 2);
  assert.ok((await rows(page))[0].startsWith('1 ミケ Lv 30'), (await rows(page))[0]);
  // 名前の確認（空はだめ）
  await page.fill('#rr-name', '  ');
  await page.click('#rr-submit');
  assert.equal(await text(page, '#rr-msg'), 'ニックネームは1〜12文字で入れてね');
  await page.fill('#rr-name', 'チコ');
  await page.click('#rr-submit');
  await page.waitForFunction(() => $('rr-msg').textContent.startsWith('載せたよ'));
  assert.equal(await text(page, '#rr-msg'), '載せたよ！ レベル順 2位・ダンジョン順 2位');
  const call = app.db.calls.find(c => c.name === 'submit_rpg');
  assert.deepEqual(call.args, { p_nickname: 'チコ', p_lv: 12, p_dungeons: 2, p_floors: 10 });
  assert.equal(await page.evaluate(() => store.get('nickname')), 'チコ');
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 3);
  assert.ok((await rows(page))[1].startsWith('2 チコ Lv 12'), (await rows(page)).join('|'));
  // ダンジョン順
  await page.click('#rr-tabs button[data-s="dg"]');
  await page.waitForFunction(() => document.querySelector('#rr-list li .nick')?.textContent === 'タロウ');
  const r = await rows(page);
  assert.ok(r[0].startsWith('1 タロウ 🏰3・F16 Lv 8') && r[1].startsWith('2 チコ 🏰2・F10 Lv 12') && r[2].startsWith('3 ミケ'), r.join('|'));
  assert.equal(await page.getAttribute('#rr-tabs button[data-s="dg"]', 'aria-pressed'), 'true');
});

t('not_started_and_offline', async page => {
  // まだ旅に出ていなければ載せるフォームは出ない。つながらなければ再読み込みのボタン
  await writeSave(page, { v: 1 });
  await page.evaluate(() => RPG.open('rpgrank'));
  assert.equal(await page.isVisible('#rr-form'), false);
  assert.ok((await text(page, '#rr-me')).includes('まだ旅に出ていないよ'));
  await page.waitForFunction(() => !$('rr-error').hidden);
}, { supabase: 'down' });

t('link_from_timeattack_ranking', async page => {
  await page.click('#home-rank');
  assert.equal(await page.isVisible('#rk-to-rpg'), true);
  await page.click('#rk-to-rpg');
  assert.equal(await page.isVisible('#scr-rpgrank'), true);
});
