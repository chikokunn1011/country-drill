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
    { token: 't-mike', nickname: 'ミケ', lv: 30, dungeons: 1, floors: 7, created_at: ago(60), at: ago(60) },
    { token: 't-taro', nickname: 'タロウ', lv: 8, dungeons: 3, floors: 16, created_at: ago(50), at: ago(50) },
  );
  await writeSave(page, saveWith({ lv: 12, floors: { samerica: 5, oceania: 5 } }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 2);
  assert.ok((await rows(page))[0].startsWith('1 ミケ Lv 30'), (await rows(page))[0]);
  // 名前の確認（空はだめ）
  await page.fill('#rr-name', '  ');
  await page.click('#rr-submit');
  assert.equal(await text(page, '#rr-msg'), 'ニックネームは1〜12文字で入れてね');
  // ほかの人と同じ名前はだめ
  await page.fill('#rr-name', 'ミケ');
  await page.click('#rr-submit');
  await page.waitForFunction(() => $('rr-msg').textContent.includes('ほかの人'));
  await page.fill('#rr-name', 'チコ');
  await page.click('#rr-submit');
  await page.waitForFunction(() => $('rr-msg').textContent.startsWith('載せたよ'));
  assert.equal(await text(page, '#rr-msg'), '載せたよ！ レベル順 2位・ダンジョン順 2位　これからは自動で更新するね');
  const calls = app.db.calls.filter(c => c.name === 'rpg_register');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args.p_token, calls[1].args.p_token);   // 通らなかったときは同じ合言葉でやり直す
  const { p_token, ...rest } = calls[1].args;
  assert.match(p_token, /^[0-9a-f-]{36}$/);
  assert.deepEqual(rest, { p_nickname: 'チコ', p_lv: 12, p_dungeons: 2, p_floors: 10 });
  assert.deepEqual(await page.evaluate(() => store.get('rpgRank')), { name: 'チコ', token: p_token, sent: { lv: 12, dungeons: 2, floors: 10 } });
  // 登録したら、載せるフォームは消えて［名前を変える］だけ
  assert.equal(await page.isVisible('#rr-form'), false);
  assert.equal(await page.isVisible('#rr-rename'), true);
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

t('auto_update_after_register', async (page, app) => {
  // 1回載せたら登録（rpgRank）。レベルアップすると、前に送ってから11秒あけて自動で送り直す
  await writeSave(page, saveWith({ lv: 3, coins: 100000 }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.fill('#rr-name', 'チコ');
  await page.click('#rr-submit');
  await page.waitForFunction(() => $('rr-msg').textContent.startsWith('載せたよ'));
  assert.equal(await page.isVisible('#rr-auto'), true);
  assert.equal(await text(page, '#rr-auto-name'), 'チコ');
  await page.evaluate(() => RPG.open('rpg'));
  await page.click('#rpg-lvup');
  const sent = () => app.db.calls.filter(c => c.name === 'rpg_update').map(c => c.args.p_lv);
  await page.waitForTimeout(3000);
  assert.deepEqual(sent(), []);   // まだ11秒たっていない
  await page.waitForFunction(() => store.get('rpgRank')?.sent?.lv === 4, null, { timeout: 15000 });
  assert.deepEqual(sent(), [4]);
  assert.equal(app.db.rpgRows.length, 1);
  assert.equal(app.db.rpgRows[0].lv, 4);
});

t('rename_only', async (page, app) => {
  // 登録ずみなら、別の名前で新しく登録はできず、名前だけ変わる（記録と合言葉はそのまま）
  app.db.rpgRows.push({ token: 't-mike', nickname: 'ミケ', lv: 30, dungeons: 1, floors: 7, created_at: ago(60), at: ago(60) });
  await writeSave(page, saveWith({ lv: 5 }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.fill('#rr-name', 'チコ');
  await page.click('#rr-submit');
  await page.waitForFunction(() => $('rr-msg').textContent.startsWith('載せたよ'));
  const token = await page.evaluate(() => store.get('rpgRank').token);
  await page.click('#rr-rename');
  assert.equal(await page.isVisible('#rr-form'), true);
  assert.equal(await page.inputValue('#rr-name'), 'チコ');
  assert.equal(await text(page, '#rr-submit'), '変える');
  await page.fill('#rr-name', 'ミケ');
  await page.click('#rr-submit');
  await page.waitForFunction(() => $('rr-msg').textContent.includes('ほかの人'));
  await page.fill('#rr-name', 'チコチコ');
  await page.click('#rr-submit');
  await page.waitForFunction(() => $('rr-msg').textContent.startsWith('名前を'));
  assert.equal(await text(page, '#rr-msg'), '名前を「チコチコ」に変えたよ');
  assert.equal(await text(page, '#rr-auto-name'), 'チコチコ');
  assert.equal(await page.isVisible('#rr-form'), false);
  assert.equal(app.db.calls.filter(c => c.name === 'rpg_register').length, 1);
  assert.deepEqual(app.db.calls.filter(c => c.name === 'rpg_rename').at(-1).args, { p_token: token, p_nickname: 'チコチコ' });
  assert.deepEqual(app.db.rpgRows.map(r => [r.nickname, r.lv]), [['ミケ', 30], ['チコチコ', 5]]);
  assert.deepEqual(await page.evaluate(() => store.get('rpgRank')), { name: 'チコチコ', token, sent: { lv: 5, dungeons: 0, floors: 0 } });
  // 読み込み直しても登録ずみのまま（フォームは出ない）
  await page.reload();
  await page.evaluate(() => RPG.open('rpgrank'));
  assert.equal(await page.isVisible('#rr-form'), false);
  assert.equal(await text(page, '#rr-auto-name'), 'チコチコ');
});

t('auto_update_on_startup', async (page, app) => {
  // 登録していて、前に送った記録より進んでいたら、開いたときに送る
  const T = '00000000-0000-4000-8000-000000000009';
  app.db.rpgRows.push({ token: T, nickname: 'ミケ', lv: 2, dungeons: 0, floors: 0, created_at: ago(60), at: ago(60) });
  await page.evaluate(T => store.set('rpgRank', { name: 'ミケ', token: T, sent: { lv: 2, dungeons: 0, floors: 0 } }), T);
  await writeSave(page, saveWith({ lv: 9, floors: { samerica: 5 } }));
  await page.waitForFunction(() => store.get('rpgRank')?.sent?.lv === 9, null, { timeout: 8000 });
  const call = app.db.calls.find(c => c.name === 'rpg_update');
  assert.deepEqual(call.args, { p_token: T, p_lv: 9, p_dungeons: 1, p_floors: 5 });
  // 同じ記録なら送り直さない
  await page.reload();
  await page.waitForTimeout(2500);
  assert.equal(app.db.calls.filter(c => c.name === 'rpg_update').length, 1);
});

t('old_or_deleted_registration', async (page, app) => {
  // 合言葉の無い前の形の覚え書きは登録していないことに。DB から消されていたら（not_found）登録していないことにもどる
  await page.evaluate(() => store.set('rpgRank', { name: 'チコ', sent: { lv: 1, dungeons: 0, floors: 0 } }));
  await writeSave(page, saveWith({ lv: 4 }));
  await page.evaluate(() => RPG.open('rpgrank'));
  assert.equal(await page.isVisible('#rr-form'), true);
  assert.equal(await page.isVisible('#rr-auto'), false);
  await page.evaluate(() => store.set('rpgRank', { name: 'チコ', token: '00000000-0000-4000-8000-00000000000a', sent: { lv: 1, dungeons: 0, floors: 0 } }));
  await page.reload();
  await page.waitForFunction(() => store.get('rpgRank', null) === null, null, { timeout: 8000 });
  assert.deepEqual(app.db.calls.map(c => c.name).filter(n => n.startsWith('rpg_up')), ['rpg_update']);
});
