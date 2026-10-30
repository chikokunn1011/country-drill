// 英語版の冒険（PR8 Task 9）: 冒険ランキング（rpg-rank.js の #scr-rpgrank）。並べ方のタブ・説明・きみの記録・何位相当・行の記録と日付・
// 載せる欄（無い・自動・箱・profile.js が無い）・つながらない・塔の準備中。ほかの人と自分の名前は訳さず data-ugc
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, QUIET_BADGES, jaLeft, warned } from './helpers.mjs';
import { openRpg, writeSave, saveWith } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const EN_OPTS = { path: 'en/', locale: 'en-US', seed: 1, storage: { badges: QUIET_BADGES } };
// 英語版を開いて fn(page, app) を呼び、最後にページの例外・[i18n] の warn（辞書に無いキー）・[rpg] の console.error が無いかも見る
const te = (name, fn, opts = {}) => test(name, { timeout: 120_000 }, async () => {
  const app = await openRpg(browser, { ...EN_OPTS, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.equal(await warned(app.warnings, /\[i18n\]/), false, app.warnings.join('\n'));
    assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});
const text = async (page, sel) => (await page.locator(sel).innerText()).trim();
const rows = page => page.$$eval('#rr-list li', ls => ls.map(l => l.innerText.replace(/\s+/g, ' ').trim()));
const ago = s => new Date(Date.now() - s * 1000).toISOString();
// 行の日付は決まった時刻。日本時間では 10月31日 0時台（UTC ではまだ 10月30日）なので、英語は日本時間の 'Oct 31'
const AT1 = '2026-10-30T15:10:00.000Z', AT2 = '2026-10-30T15:20:00.000Z', DAY = 'Oct 31';
const T0 = '00000000-0000-4000-8000-0000000000a1', PID = 'chikopid0001';
const withProfile = async (page, app, { name = 'チコ', auto = true } = {}) => {
  app.db.profiles.push({ id: 1, token: T0, nickname: name, pid: PID });
  await page.evaluate(p => localStorage.setItem('profile', JSON.stringify(p)), { token: T0, pid: PID, name, auto, isPublic: true, sent: { isPublic: true } });
};
// 日本語の名前（かざり jp）と英語の名前
const ROWS = app => {
  app.db.profiles.push({ id: 2, token: 't-chiko', nickname: 'チコ', pid: 'chikopid0002', deco: ['jp'] });
  app.db.rpgRows.push(
    { token: 't-chiko', profile_id: 2, nickname: 'チコ', lv: 30, dungeons: 3, floors: 16, tower: 12, tower_at: AT1, created_at: AT1, at: AT1 },
    { token: 't-en', nickname: 'Chiko', lv: 8, dungeons: 1, floors: 7, tower: 1, tower_at: AT2, created_at: AT2, at: AT2 },
  );
};
const TOWER_SAVE = f => saveWith({ lv: 12, floors: { samerica: 5, oceania: 3 }, ...f });

te('en_rpg_rank', async (page, app) => {
  ROWS(app);
  await writeSave(page, TOWER_SAVE({ tower: { best: 7 } }));
  await page.evaluate(() => RPG.open('rpg'));
  await page.click('#rpg-to-rank');
  await page.locator('#scr-rpgrank').waitFor({ state: 'visible' });
  assert.equal(await text(page, '#scr-rpgrank .rpg-h2'), 'Adventure leaderboard');
  assert.equal(await text(page, '#scr-rpgrank .rpg-back'), '← Adventure');
  assert.deepEqual((await page.locator('#rr-tabs button').allInnerTexts()).map(s => s.trim()), ['Level', 'Dungeons', 'Tower of Heroes']);
  assert.equal(await page.getAttribute('#rr-tabs', 'aria-label'), 'Sort by');
  assert.equal(await text(page, '#rr-how'), 'Top 50 players, ranked by level → dungeons cleared → floors');
  const me = await text(page, '#rr-me');
  assert.ok(me.startsWith('Your record') && me.includes('Lv 12') && me.includes('Dungeons 1/21 (floors 8/105)'), me);
  await page.waitForFunction(() => $('rr-rank').textContent.startsWith('Would rank'));
  assert.equal(await text(page, '#rr-rank'), 'Would rank #2 by level · #2 by dungeons');
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 2);
  assert.deepEqual(await rows(page), [`1 チコ Lv 30 🏰3 · F16 ${DAY}`, `2 Chiko Lv 8 🏰1 · F7 ${DAY}`]);
  assert.equal(await page.locator('#rr-list li').first().locator('.nick [data-ugc]').innerText(), 'チコ');
  assert.deepEqual(await page.locator('#rr-list li .rr-deco img').evaluateAll(els => els.map(e => [e.alt, e.title])), [['Japan', 'Japan']]);
  assert.deepEqual(await jaLeft(page), []);
  // ダンジョン順
  await page.click('#rr-tabs button[data-s="dg"]');
  assert.equal(await text(page, '#rr-how'), 'Top 50 players, ranked by dungeons cleared → floors → level');
  await page.waitForFunction(() => document.querySelector('#rr-list li .rpg-rr-dg + .rpg-rr-lv'));
  assert.deepEqual(await rows(page), [`1 チコ 🏰3 · F16 Lv 30 ${DAY}`, `2 Chiko 🏰1 · F7 Lv 8 ${DAY}`]);
  assert.deepEqual(await jaLeft(page), []);
  // 英雄の塔: きみの記録に自己ベスト、行は 🗼… floors（1階は floor）
  await page.click('#rr-tabs button[data-s="tower"]');
  assert.equal(await text(page, '#rr-how'), 'Top 50 players, ranked by highest floor → level');
  await page.waitForFunction(() => document.querySelector('#rr-list li .rpg-rr-tw'));
  assert.deepEqual(await rows(page), [`1 チコ 🗼12 floors Lv 30 ${DAY}`, `2 Chiko 🗼1 floor Lv 8 ${DAY}`]);
  assert.equal(await text(page, '#rr-me .rpg-rr-tw'), '🗼 Tower of Heroes · Personal best: floor 7');
  await page.waitForFunction(() => $('rr-rank').textContent.startsWith('Would rank'));
  assert.equal(await text(page, '#rr-rank'), 'Would rank #2 in the Tower of Heroes');
  assert.deepEqual(await jaLeft(page), []);
  // 塔の記録が無いとき
  await writeSave(page, TOWER_SAVE());
  await page.evaluate(() => RPG.open('rpgrank', { sort: 'tower' }));
  assert.equal(await text(page, '#rr-me .rpg-rr-tw'), '🗼 Tower of Heroes · No record yet');
  // タイムアタックのランキングからの入口
  assert.equal((await page.locator('#rk-to-rpg').textContent()).trim(), '🏆 View the Adventure leaderboard');
});

te('en_rpg_rank_ugc', async (page, app) => {
  // profile.js が読めない: 代わりの名前も data-ugc、かざりの alt・title は英語の国名。載せる欄は英語の「読み直してね」
  ROWS(app);
  app.db.rpgRows[0].deco = ['jp'];
  await writeSave(page, TOWER_SAVE());
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 2);
  const first = page.locator('#rr-list li').first();
  assert.equal(await first.locator('.nick [data-ugc]').innerText(), 'チコ');
  assert.deepEqual(await first.locator('.rr-deco img').evaluateAll(els => els.map(e => [e.alt, e.title])), [['Japan', 'Japan']]);
  assert.equal(await text(page, '#rr-post'), 'Couldn’t load your profile. Please reload the page.');
  assert.deepEqual(await jaLeft(page), []);
}, { blockScripts: ['badges.js', 'profile.js'] });

te('en_rpg_rank_ugc_auto', async (page, app) => {
  // 自動で載っているときの自分の名前も data-ugc
  await withProfile(page, app);
  await page.evaluate(p => localStorage.setItem('rpgSent', JSON.stringify({ pid: p, lv: 12, dungeons: 1, floors: 8 })), PID);
  await writeSave(page, TOWER_SAVE());
  await page.evaluate(() => RPG.open('rpgrank'));
  assert.equal(await page.isVisible('#rr-auto'), true);
  assert.equal(await page.getAttribute('#rr-auto-name', 'data-ugc'), '');
  assert.equal(await text(page, '#rr-auto-name'), 'チコ');
  assert.equal(await text(page, '#rr-auto p'),
    '✅ You’re listed as チコ. Your record updates automatically whenever you level up or clear a dungeon.');
  assert.equal(await text(page, '#rr-profile'), 'Profile');
  assert.equal(await text(page, '#rr-note'), 'You appear on the leaderboard with your profile nickname and decorations. Tap a nickname to see that player’s profile.');
  assert.deepEqual(await jaLeft(page), []);
});

te('en_rpg_rank_post', async (page, app) => {
  // まだ旅に出ていない: 載せる箱は出ない
  await writeSave(page, { v: 1 });
  await page.evaluate(() => RPG.open('rpgrank'));
  assert.equal(await page.locator('#rr-post').innerHTML(), '');
  assert.deepEqual((await page.locator('#rr-me p').allInnerTexts()).map(s => s.trim()),
    ['You haven’t started the Adventure yet', 'Once you start the Adventure, you can post your level and cleared dungeons to the leaderboard']);
  await page.waitForFunction(() => !$('rr-empty').hidden);
  assert.equal(await text(page, '#rr-empty'), 'No one here yet. Grab the top spot!');
  assert.deepEqual(await jaLeft(page), []);
  // プロフィールが無い: 箱で作って載せる
  await writeSave(page, TOWER_SAVE());
  await page.evaluate(() => RPG.open('rpgrank'));
  assert.ok((await text(page, '#rr-post')).startsWith('Post to the Adventure leaderboard'), await text(page, '#rr-post'));
  assert.deepEqual(await jaLeft(page), []);
  await page.fill('#rr-post input', 'Chiko');
  await page.click('#rr-post .btn');
  await page.waitForFunction(() => $('rr-post').textContent.includes('Posted!'));
  assert.ok((await text(page, '#rr-post')).includes('Posted! #1 by level · #1 by dungeons'), await text(page, '#rr-post'));
  assert.deepEqual(await jaLeft(page), []);
});

te('en_rpg_rank_offline', async page => {
  await writeSave(page, TOWER_SAVE());
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForFunction(() => !$('rr-error').hidden);
  assert.equal(await text(page, '#rr-error p'), 'Couldn’t connect to the leaderboard');
  assert.equal(await text(page, '#rr-retry'), 'Reload');
  assert.deepEqual(await jaLeft(page), []);
}, { supabase: 'down' });

te('en_rpg_rank_tower_soon', async (page, app) => {
  delete app.db.rpc.top_tower2;
  delete app.db.rpc.rpg_tower_rank_of;
  await writeSave(page, TOWER_SAVE({ tower: { best: 3 } }));
  await page.evaluate(() => RPG.open('rpgrank', { sort: 'tower' }));
  await page.waitForFunction(() => !$('rr-soon').hidden);
  assert.equal(await text(page, '#rr-soon'), 'The Tower of Heroes leaderboard isn’t ready yet. Please check back soon.');
  assert.deepEqual(await jaLeft(page), []);
});

// 390px: 長い名前（12文字・かざり3つ）と長い記録（Lv 99・🏰21 · F105・🗼999 floors）の行、長いきみの記録が横にはみ出さない
te('en_rpg_rank_fit', async (page, app) => {
  app.db.profiles.push({ id: 3, token: 't-long', nickname: 'WWWWWWWWWWWW', pid: 'longpid00001', deco: ['jp', 'br', 'fr'] });
  app.db.rpgRows.push(
    { token: 't-long', profile_id: 3, nickname: 'WWWWWWWWWWWW', lv: 99, dungeons: 21, floors: 105, tower: 999, tower_at: ago(60), created_at: ago(90), at: ago(60) },
    { token: 't-taro', nickname: 'Taro', lv: 8, dungeons: 3, floors: 16, tower: 1, tower_at: ago(50), created_at: ago(80), at: ago(50) },
  );
  await writeSave(page, saveWith({ lv: 99, floors: Object.fromEntries((await page.evaluate(() => RPG_CORE.DUNGEONS.map(g => g.id))).map(id => [id, 5])), tower: { best: 999 } }));
  for (const s of ['lv', 'dg', 'tower']) {
    await page.evaluate(s => RPG.open('rpgrank', { sort: s }), s);
    await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 2);
    const m = await page.evaluate(() => {
      const iw = document.documentElement.clientWidth, out = [];
      for (const el of document.querySelectorAll('#scr-rpgrank *')) {
        if (!el.checkVisibility()) continue;
        const r = el.getBoundingClientRect();
        if (r.right > iw + 0.5 || r.left < -0.5) out.push(`${el.tagName}.${el.className}: ${el.textContent.trim().slice(0, 40)}`);
        if (el.scrollWidth > el.clientWidth + 0.5 && el.clientWidth && getComputedStyle(el).overflowX === 'visible') out.push(`over ${el.tagName}.${el.className}: ${el.textContent.trim().slice(0, 40)}`);
      }
      const nick = [...document.querySelectorAll('#rr-list li .nick')].map(n => n.getBoundingClientRect().width);
      return { out, nick, sw: document.documentElement.scrollWidth, iw };
    });
    assert.deepEqual(m.out, [], s);
    assert.ok(m.sw <= m.iw, `${s}: ${m.sw} > ${m.iw}`);
    for (const w of m.nick) assert.ok(w >= 80, `${s}: ${JSON.stringify(m.nick)}`);
    assert.deepEqual(await jaLeft(page), [], s);
  }
});
