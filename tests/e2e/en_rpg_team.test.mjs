// 英語版の冒険（PR8 Task 7）: 編成の画面（rpg-team.js）。既定の編成名は表示だけ Team 1、セーブは日本語の '編成1' のまま。
// 自分で付けた編成名は訳さず data-ugc。バトルの編成名（rpg-battle.js）は Task 8 で見る（preflight C6）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, QUIET_BADGES, jaLeft, warned } from './helpers.mjs';
import { openRpg, writeSave, saveWith, readSave } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const EN_OPTS = { path: 'en/', locale: 'en-US', seed: 1, storage: { badges: QUIET_BADGES } };
// 英語版を開いて fn(page) を呼び、最後にページの例外・[i18n] の warn（辞書に無いキー）・[rpg] の console.error が無いかも見る
const te = (name, fn) => test(name, { timeout: 120_000 }, async () => {
  const app = await openRpg(browser, EN_OPTS);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.equal(await warned(app.warnings, /\[i18n\]/), false, app.warnings.join('\n'));
    assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});
// br・ar は同じグループ（南アメリカ）。編成1 に2枚入れて、チームボーナス +10% を出す
const CARDS = { cards: { jp: [2, 1], fr: [1, 0], br: [3, 2], ar: [1, 0] } };
const openTeam = async (page, save) => {
  await writeSave(page, save);
  await page.evaluate(() => RPG.openTeam());
  await page.locator('#scr-team').waitFor({ state: 'visible' });
};
const tabTexts = page => page.locator('#tm-tabs button:not([data-buy])').allInnerTexts();
const toJa = async page => {
  await page.goto(server.url);
  await page.waitForFunction(() => window.RPG?.openTeam);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
  await page.evaluate(() => RPG.openTeam());
  await page.locator('#scr-team').waitFor({ state: 'visible' });
};

te('en_team', async page => {
  await openTeam(page, saveWith({ ...CARDS, coins: 500, teams: [{ n: '編成1', c: ['br', 'ar'] }] }));
  assert.deepEqual(await jaLeft(page), []);
  assert.equal((await page.locator('#scr-team .rpg-h2').innerText()).trim(), 'Team');
  assert.equal((await page.locator('#tm-back').innerText()).trim(), '← Adventure');
  assert.deepEqual(await tabTexts(page), ['Team 1']);
  assert.equal((await page.locator('#tm-title').innerText()).trim(), 'Team 1');
  assert.equal(await page.locator('#tm-tabs [data-ugc], #tm-title [data-ugc]').count(), 0);
  // 買う枠のタブ: 足りないコイン（Need ●1,500 more）と英語の aria-label
  const buy = page.locator('#tm-tabs button[data-buy]').first();
  assert.match(await buy.locator('.rpg-short').innerText(), /^Need .*1,500 more$/);
  assert.equal(await buy.getAttribute('aria-label'), 'Buy a team slot for 2,000 coins (need 1,500 more)');
  assert.equal((await page.locator('#tm-auto').innerText()).trim(), 'Auto');
  assert.match(await page.locator('#tm-stats').innerText(), /Team bonus South America×2 \+10%/);
  assert.match(await page.locator('#tm-side .hint').innerText(), /^Team bonus: /);
  assert.equal((await page.locator('#tm-count').innerText()).trim(), 'Allies 4/195');
  const chips = await page.locator('#tm-regions .chip').allInnerTexts();
  assert.equal(chips[0].trim(), 'All');
  assert.ok(chips.map(s => s.trim()).includes('South America'), chips.join(' / '));
  // ダンジョンの選び方は英語の名前（月は Moon）
  const opts = await page.locator('#tm-dg option').allInnerTexts();
  assert.ok(opts.includes('Coral Reef') && opts.includes('Moon'), opts.join(' / '));
  // 編成に入っているカードの札・グループ名・枠の国名
  assert.equal(await page.locator('#tm-grid .rpg-card.is-in .rpg-lab').first().innerText(), '✓ In team');
  assert.equal(await page.locator('#tm-grid .rpg-card.is-in').count(), 2);
  assert.ok((await page.locator('#tm-grid .tm-grp').allInnerTexts()).includes('South America'));
  assert.deepEqual(await page.locator('#tm-slots .tm-pn').allInnerTexts(), ['Brazil', 'Argentina']);
  assert.equal(await page.locator('#tm-slots .rpg-pc').first().getAttribute('aria-label'), 'Remove Brazil');
  assert.equal((await page.locator('#tm-slots .tm-empty').innerText()).trim(), 'Empty');
  // 4枚目を入れようとすると英語のトースト。3枚目までは入る
  await page.click('#tm-grid .rpg-card[data-a="jp"]');
  await page.click('#tm-grid .rpg-card[data-a="fr"]');
  await page.locator('.toast').filter({ hasText: 'Remove the card you want to replace first' }).waitFor();
  assert.deepEqual(await jaLeft(page), []);
  // まだ組んでいない枠・仲間がいないとき
  await openTeam(page, saveWith({ coins: 0 }));
  assert.match(await page.locator('#tm-note').innerText(), /^Not set up yet/);
  assert.equal((await page.locator('#tm-gacha').innerText()).trim(), 'Go to the Flag Draw');
  assert.deepEqual(await jaLeft(page), []);
  // バトルの登場画面から来たとき
  await writeSave(page, saveWith({ ...CARDS }));
  await page.evaluate(() => RPG.openTeam({ id: 'samerica', floor: 1 }));
  assert.equal((await page.locator('#tm-back').innerText()).trim(), '← Back to battle');
});

te('en_team_default_name', async page => {
  await openTeam(page, saveWith({ ...CARDS, coins: 5000 }));
  let msg = '';
  page.once('dialog', d => { msg = d.message(); d.accept(); });
  await page.locator('#tm-tabs button[data-buy]').first().click();
  assert.equal(msg, 'Spend ●2,000 to add a team slot?');
  assert.deepEqual(await tabTexts(page), ['Team 1', 'Team 2']);
  assert.equal((await page.locator('#tm-title').innerText()).trim(), 'Team 2');
  const d = await readSave(page);
  assert.deepEqual(d.teams.map(t => t.n), ['編成1', '編成2']);
  assert.deepEqual(await jaLeft(page), []);
  await toJa(page);
  assert.deepEqual(await tabTexts(page), ['編成1', '編成2']);
});

te('en_team_rename_keeps_default', async page => {
  await openTeam(page, saveWith({ ...CARDS }));
  await page.click('#tm-rename');
  assert.equal(await page.inputValue('#tm-name'), 'Team 1');
  assert.equal(await page.getAttribute('#tm-name', 'aria-label'), 'Team name');
  await page.press('#tm-name', 'Enter');
  assert.equal((await readSave(page)).teams[0].n, '編成1');
  assert.deepEqual(await tabTexts(page), ['Team 1']);
  // 欄の外に出ても同じ（blur で確定）
  await page.click('#tm-rename');
  await page.locator('#tm-name').blur();
  assert.equal((await readSave(page)).teams[0].n, '編成1');
  // Red に変えると Red で保存。表示は data-ugc
  await page.click('#tm-rename');
  await page.fill('#tm-name', 'Red');
  await page.press('#tm-name', 'Enter');
  assert.equal((await readSave(page)).teams[0].n, 'Red');
  assert.equal((await page.locator('#tm-tabs [data-ugc]').innerText()).trim(), 'Red');
  assert.equal((await page.locator('#tm-title [data-ugc]').innerText()).trim(), 'Red');
  // 空にすると既定の名前（セーブは日本語）
  await page.click('#tm-rename');
  await page.fill('#tm-name', '  ');
  await page.press('#tm-name', 'Enter');
  assert.equal((await readSave(page)).teams[0].n, '編成1');
  await page.click('#tm-rename');
  await page.fill('#tm-name', 'Red');
  await page.press('#tm-name', 'Enter');
  await toJa(page);
  assert.deepEqual(await tabTexts(page), ['Red']);
});

te('en_team_custom_name_ugc', async page => {
  await openTeam(page, saveWith({ ...CARDS, teams: [{ n: '編成1', c: null }, { n: 'あか', c: ['jp'] }], tsel: 1 }));
  assert.deepEqual(await tabTexts(page), ['Team 1', 'あか']);
  assert.equal((await page.locator('#tm-tabs button[data-t="1"] [data-ugc]').innerText()).trim(), 'あか');
  assert.equal((await page.locator('#tm-title [data-ugc]').innerText()).trim(), 'あか');
  assert.deepEqual(await jaLeft(page), []);
  // 名前の欄は自分の名前のまま
  await page.click('#tm-rename');
  assert.equal(await page.inputValue('#tm-name'), 'あか');
  await page.press('#tm-name', 'Escape');
  assert.equal((await readSave(page)).teams[1].n, 'あか');
});
