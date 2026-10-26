// 国旗クエストの入口（ホームの［冒険］・トップバーのコインのチップ・設定のスイッチ・直リンク #rpg）と冒険ホーム
// （はじめての画面・旅人カード・レベルアップ・つぎにやること・ダンジョンの図版・今日の手配書・コインのかせぎ方・PC の列）
// どのテストも badges.js を止めて開く（openRpg）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, events } from './helpers.mjs';
import { openRpg, readSave, writeSave, saveWith, localToday, playPractice } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで開いて fn を実行する。最後にページの例外と、[rpg] で始まる console.error が無いことを見る
// （opts.rpgErrorOk で console.error の確認だけ外せる。ほかの opts は openRpg にそのまま渡す）
const t = (name, fn, { rpgErrorOk = false, ...opts } = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openRpg(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    if (!rpgErrorOk) assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});

const STORY1 = '世界地図をかじる怪物「地図喰い（ちずくい）」と、その手下のモンスターたちが、世界中の国旗を持っていっちゃった。';
const ALL_CLEAR = { samerica: 5, oceania: 5, namerica: 5, europe: 5, asia: 5, africa: 5, world: 5 };
const text = (page, sel) => page.locator(sel).innerText();
// save があれば入れて読み込み直してから、冒険ホームを開く
const home = async (page, save) => {
  if (save) await writeSave(page, save);
  await page.evaluate(() => show('rpg'));
};
// o から want のキーだけを取り出す（イベントやセーブの一部を比べる）
const pick = (o, want) => Object.fromEntries(Object.keys(want).map(k => [k, o[k]]));
const evs = async (page, type, want) => (await events(page, type)).map(e => pick(e, want));
const visible = (page, sel) => page.isVisible(sel);

t('home_button', async page => {
  assert.deepEqual(await page.evaluate(() => ({ prev: $('home-rpg')?.previousElementSibling?.id, cls: $('home-rpg')?.className })),
    { prev: 'home-play', cls: 'btn ghost' });
  assert.equal(await visible(page, '#home-rpg'), true);
  let s = await text(page, '#home-rpg');
  assert.ok(s.includes('冒険') && s.includes('NEW'), s);
  await writeSave(page, saveWith({ coins: 12345 }));
  s = await text(page, '#home-rpg');
  assert.ok(!s.includes('NEW'), s);
  assert.equal(await text(page, '#home-rpg .rpg-homecoin'), '1.2万');
  assert.equal(await page.locator('#home-rpg .rpg-homecoin i.coin').count(), 1);   // ● は CSS の金色の丸
  // drill:screen {home} で描き直す（ほかの画面から戻ったとき）
  await page.evaluate(() => { localStorage.setItem('rpg', JSON.stringify({ ...JSON.parse(localStorage.getItem('rpg')), coins: 2000 })); show('setup'); show('home'); });
  assert.equal(await text(page, '#home-rpg .rpg-homecoin'), '2,000');
  await page.click('#home-rpg');
  assert.equal(await visible(page, '#scr-rpg'), true);
});

t('intro_flow', async page => {
  await page.click('#home-rpg');
  assert.equal(await visible(page, '#rpg-intro'), true);
  const s = await text(page, '#rpg-intro');
  for (const x of ['国旗クエスト', '地図喰いから世界を取りもどせ', STORY1]) assert.ok(s.includes(x), `${x} が無い: ${s}`);
  assert.equal(await page.locator('#rpg-hero').count(), 0);   // はじめての画面だけ
  assert.equal(await page.locator('.rpg-avpick button').count(), 8);
  await page.locator('.rpg-avpick button').nth(2).click();
  assert.deepEqual(await page.$$eval('.rpg-avpick button', bs => bs.map(b => b.getAttribute('aria-pressed'))),
    ['false', 'false', 'true', 'false', 'false', 'false', 'false', 'false']);
  await page.click('#rpg-go');
  const want = { intro: true, av: 2, coins: 1000, earned: 1000 };
  assert.deepEqual(pick(await readSave(page), want), want);
  assert.deepEqual(await evs(page, 'rpg:coins', { delta: 0, reason: 0 }), [{ delta: 1000, reason: 'start' }]);
  assert.equal(await visible(page, '#rpg-hero'), true);
  assert.equal(await page.locator('#rpg-intro').count(), 0);
  // ホームのボタンから NEW が消える
  await page.evaluate(() => show('home'));
  assert.ok(!(await text(page, '#home-rpg')).includes('NEW'));
});

t('chip_in_topbar', async page => {
  await writeSave(page, saveWith({ coins: 1234 }));
  await page.evaluate(() => show('setup'));
  assert.equal(await page.evaluate(() => $('rpg-chip').parentElement.id), 'topbar-extra');
  assert.ok((await text(page, '#rpg-chip')).includes('1,234'));
  await page.click('#rpg-chip');
  assert.equal(await visible(page, '#scr-rpg'), true);
});

t('topbar_one_line_360', async page => {
  await writeSave(page, saveWith({ coins: 123456 }));
  await page.evaluate(() => show('setup'));
  const r = await page.evaluate(() => {
    const rects = ['brand', 'rpg-chip', 'to-book', 'to-settings'].map(id => $(id).getBoundingClientRect());
    const h = $('topbar').getBoundingClientRect().height, chip = $('rpg-chip');
    chip.style.display = 'none';
    const h0 = $('topbar').getBoundingClientRect().height;
    chip.style.display = '';
    return { tops: rects.map(x => x.top), bottoms: rects.map(x => x.bottom), rights: rects.map(x => x.right), h, h0,
      chip: chip.innerText, iw: innerWidth, sw: document.documentElement.scrollWidth };
  });
  const at = JSON.stringify(r);
  assert.ok(Math.max(...r.tops) < Math.min(...r.bottoms), `1行になっていない: ${at}`);
  assert.ok(r.rights.every(x => x <= r.iw), `はみ出している: ${at}`);
  assert.equal(r.h, r.h0, `チップで折り返している: ${at}`);
  assert.equal(r.chip, '12.3万');
  assert.ok(r.sw <= r.iw, `横にスクロールする: ${at}`);
}, { viewport: { width: 360, height: 640 } });

t('settings_switch', async page => {
  await writeSave(page, saveWith({}));
  await page.click('#home-settings');
  assert.equal(await page.isChecked('#set-rpg'), true);
  await page.uncheck('#set-rpg');
  assert.equal((await readSave(page)).show, false);
  assert.equal(await visible(page, '#rpg-chip'), false);
  await page.evaluate(() => show('home'));
  assert.equal(await visible(page, '#home-rpg'), false);
  await page.evaluate(() => show('setup'));
  assert.equal(await visible(page, '#rpg-chip'), false);
  const c0 = (await readSave(page)).coins;
  await playPractice(page);
  assert.equal(await page.locator('#pcoin').count(), 0);
  assert.equal(await page.evaluate(() => $('r-ext').innerHTML), '');
  assert.ok((await readSave(page)).coins > c0);   // コインは裏で貯まる
  await page.evaluate(() => show('settings'));
  assert.equal(await page.isChecked('#set-rpg'), false);
  await page.check('#set-rpg');
  assert.equal((await readSave(page)).show, true);
  await page.evaluate(() => show('home'));
  assert.equal(await visible(page, '#home-rpg'), true);
  await page.evaluate(() => show('setup'));
  assert.equal(await visible(page, '#rpg-chip'), true);
});

t('rpg_off_on_startup', async page => {
  await writeSave(page, saveWith({ show: false }));
  assert.equal(await page.evaluate(() => document.body.classList.contains('rpg-off')), true);
  assert.equal(await visible(page, '#home-rpg'), false);
  await page.evaluate(() => show('setup'));
  assert.equal(await visible(page, '#rpg-chip'), false);
});

t('hash_link', async page => {
  await page.goto('about:blank');
  await page.goto(server.url + '#rpg');
  await page.waitForFunction(() => document.readyState === 'complete');
  assert.equal(await visible(page, '#scr-rpg'), true);
  assert.equal(await visible(page, '#scr-home'), false);
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'rpg');
});

t('levelup_one', async page => {
  await home(page, saveWith({ coins: 1000 }));
  assert.ok((await text(page, '#rpg-lvup')).includes('100'));
  assert.equal(await page.locator('#rpg-lvup i.coin').count(), 1);
  await page.click('#rpg-lvup');
  assert.deepEqual(pick(await readSave(page), { lv: 0, coins: 0 }), { lv: 2, coins: 900 });
  assert.deepEqual(await evs(page, 'rpg:levelup', { lv: 0, from: 0 }), [{ lv: 2, from: 1 }]);
  assert.deepEqual(await evs(page, 'rpg:coins', { delta: 0, reason: 0, coins: 0 }), [{ delta: -100, reason: 'levelup', coins: 900 }]);
  await page.waitForFunction(() => $('rpg-stats').textContent.includes('Lv 2'));   // 書いたら次のフレームで描き直す
  assert.ok((await text(page, '#rpg-lvup')).includes('130'));
  await home(page, saveWith({ coins: 50 }));
  assert.equal(await page.isDisabled('#rpg-lvup'), true);
  const s = await text(page, '#rpg-lvup');
  assert.ok(s.includes('あと') && s.includes('50'), s);
  await home(page, saveWith({ lv: 50, coins: 1e6 }));
  assert.equal(await page.isDisabled('#rpg-lvup'), true);
  assert.ok((await text(page, '#rpg-lvup')).includes('MAX'));
  assert.equal(await page.isDisabled('#rpg-lvmax'), true);
});

t('levelup_max', async page => {
  await home(page, saveWith({ coins: 1000 }));
  let msg = null;
  page.once('dialog', d => { msg = d.message(); d.dismiss(); });
  await page.click('#rpg-lvmax');
  assert.equal(msg, 'Lv6 まで ●800 使う？');
  assert.deepEqual(pick(await readSave(page), { lv: 0, coins: 0 }), { lv: 1, coins: 1000 });
  page.once('dialog', d => d.accept());
  await page.click('#rpg-lvmax');
  assert.deepEqual(pick(await readSave(page), { lv: 0, coins: 0 }), { lv: 6, coins: 200 });
  assert.deepEqual(await evs(page, 'rpg:levelup', { lv: 0, from: 0 }), [{ lv: 6, from: 1 }]);
  assert.deepEqual(await evs(page, 'rpg:coins', { delta: 0, reason: 0 }), [{ delta: -800, reason: 'levelup' }]);
  await page.waitForFunction(() => $('rpg-stats').textContent.includes('Lv 6'));
  assert.equal(await page.isDisabled('#rpg-lvmax'), true);   // 250 に 200 では上げられない
});

t('next_action_rules', async page => {
  const next = async save => { await home(page, save); return text(page, '#rpg-next'); };
  // (1) まだ引いていない・10連が引ける
  let s = await next(saveWith({ coins: 1000 }));
  assert.ok(s.includes('まずは国旗ガチャ10連で仲間をさがそう（南アメリカがおすすめ）'), s);
  await page.click('#rpg-next');
  assert.deepEqual(await page.evaluate(() => RPG.opts), { region: '南アメリカ' });
  // (2) 今日の無料ガチャ
  s = await next(saveWith({ pulls: 1, day: { d: localToday(), n: {}, first: true, free: false } }));
  assert.ok(s.includes('今日の無料ガチャが引けるよ'), s);
  assert.ok((await text(page, '#rpg-to-gacha')).includes('無料1回！'));
  await page.click('#rpg-next');
  assert.deepEqual(await page.evaluate(() => RPG.opts), {});
  // (3) 次のフロアの推奨 Lv より低くて、上げられる
  s = await next(saveWith({ pulls: 1, coins: 500, floors: { samerica: 1 } }));
  assert.ok(s.includes('レベルアップできるよ'), s);
  await page.click('#rpg-next');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'rpg-lvup');
  // (4) 次のフロア（ボスなら名前。きびしいなら一言足す）
  s = await next(saveWith({ pulls: 1, floors: { samerica: 2 } }));
  assert.ok(s.includes('アマゾンの密林 F3 に挑戦！（推奨Lv3）'), s);
  assert.ok(!s.includes('ちょっときびしいかも'), s);
  assert.equal((await text(page, '#rpg-to-gacha')).includes('無料'), false);
  await page.click('#rpg-next');
  assert.deepEqual(await page.evaluate(() => RPG.opts), { id: 'samerica', floor: 3 });
  s = await next(saveWith({ pulls: 1, floors: { samerica: 4, oceania: 0 }, lv: 1 }));
  assert.ok(s.includes('アマゾンの密林 ボス（ジャガー王）に挑戦！（推奨Lv5）'), s);
  assert.ok(s.includes('ちょっときびしいかも。クイズでコインを稼ごう'), s);
  // (5) 全部クリア
  s = await next(saveWith({ pulls: 1, floors: ALL_CLEAR }));
  assert.ok(s.includes('全クリア！ 195か国を仲間にしよう（0/195）'), s);
  await page.click('#rpg-next');
  assert.deepEqual(await page.evaluate(() => RPG.opts), {});
});

t('dungeon_plates', async page => {
  await home(page, saveWith({ floors: { samerica: 2 } }));
  assert.equal(await page.locator('#rpg-dgs .rpg-plate').count(), 7);
  assert.equal(await page.getAttribute('#rpg-dgs .rpg-plate >> nth=0', 'data-d'), 'samerica');
  const p1 = await text(page, '.rpg-plate[data-d="samerica"]');
  for (const x of ['PLATE 01 · SOUTH AMERICA', 'アマゾンの密林', '🐆', 'ジャガー王', '推奨Lv1〜5']) assert.ok(p1.includes(x), `${x} が無い: ${p1}`);
  assert.match(p1, /余裕|ちょうど|きびしい/);
  // Lv1 で F3（推奨Lv3）: 正解6回・ミス2回まで → ちょうど
  assert.deepEqual(await page.$eval('.rpg-plate[data-d="samerica"] .rpg-judge', el => [el.textContent.trim(), el.classList.contains('is-ok')]), ['ちょうど', true]);
  const fl = id => page.$$eval(`.rpg-fl[data-d="${id}"]`, bs => bs.map(b => [b.dataset.f, b.classList.contains('is-done'), b.classList.contains('is-next'), b.disabled]));
  assert.deepEqual(await fl('samerica'), [['1', true, false, false], ['2', true, false, false], ['3', false, true, false], ['4', false, false, true], ['5', false, false, true]]);
  const p2 = await text(page, '.rpg-plate[data-d="oceania"]');
  assert.ok(p2.includes('🔒'), p2);
  assert.ok(!p2.includes('怒れる火山'), p2);   // 開いていないダンジョンのボスは見せない
  assert.deepEqual((await fl('oceania')).map(x => x[3]), [true, true, true, true, true]);
  await page.click('.rpg-fl[data-d="samerica"][data-f="2"]');   // クリアしたフロアにもう一度
  assert.deepEqual(await page.evaluate(() => RPG.opts), { id: 'samerica', floor: 2 });
  assert.deepEqual(await page.evaluate(() => [RPG.nextFloor(RPG.get()), RPG.unlocked(RPG.get(), 'samerica'), RPG.unlocked(RPG.get(), 'oceania')]),
    [{ id: 'samerica', floor: 3 }, true, false]);
  // 壊れたセーブでも、進んだところへは行ける
  await home(page, saveWith({ floors: { oceania: 1 } }));
  assert.ok(!(await text(page, '.rpg-plate[data-d="oceania"]')).includes('🔒'));
  assert.deepEqual((await fl('oceania')).map(x => x[3]), [false, false, true, true, true]);
  await home(page, saveWith({ floors: ALL_CLEAR }));
  assert.equal(await page.evaluate(() => RPG.nextFloor(RPG.get())), null);
  assert.equal(await page.locator('.rpg-fl:disabled').count(), 0);
});

t('hero_card', async page => {
  await home(page, saveWith({ lv: 12 }));
  assert.equal(await text(page, '#rpg-name'), '旅人');
  await page.evaluate(() => { localStorage.nickname = '"<b>x</b>"'; RPG.refresh(); });
  assert.equal(await text(page, '#rpg-name'), '<b>x</b>');
  assert.equal(await page.locator('#rpg-name b').count(), 0);
  const st = await text(page, '#rpg-stats');
  for (const x of ['Lv 12', '❤️ 102', '⚔️ 32', '仲間 0/195']) assert.ok(st.includes(x), `${x} が無い: ${st}`);
  assert.equal(await text(page, '#rpg-av'), '🧙');
  for (let i = 1; i <= 8; i++) {
    await page.click('#rpg-av');
    assert.equal((await readSave(page)).av, i % 8);
  }
  await page.waitForFunction(() => $('rpg-av').textContent === '🧙');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'rpg-av');   // 描き直してもフォーカスは残る
  assert.equal(await text(page, '#rpg-title'), '');
  await page.evaluate(() => { window.BADGES = { title: () => 'アジア博士' }; RPG.refresh(); });
  assert.equal(await text(page, '#rpg-title'), '〈アジア博士〉');
  await page.evaluate(() => { window.BADGES = { title: () => '' }; RPG.refresh(); });
  assert.equal(await text(page, '#rpg-title'), '');
  await page.evaluate(() => { delete window.BADGES; RPG.refresh(); });
  assert.equal(await text(page, '#rpg-title'), '');
});

t('bounty_card', async page => {
  await home(page, saveWith({ bounty: { d: localToday(), a: ['cl', 'br', 'jp'], done: ['br'] }, day: { d: localToday(), n: {}, first: false, free: false } }));
  const s = await text(page, '#rpg-bounty');
  for (const x of ['今日の手配書 1/3', 'ゲームでヒントなしの一発正解！']) assert.ok(s.includes(x), `${x} が無い: ${s}`);
  assert.deepEqual(await page.$$eval('#rpg-bounty img', is => is.map(i => [i.alt, i.title])), [['チリ', 'チリ'], ['ブラジル', 'ブラジル'], ['日本', '日本']]);
  assert.equal([...(await page.textContent('#rpg-bounty'))].filter(ch => ch === '✓').length, 1);
  // 古い日付の手配書は、開いたときに今日の3件に引き直す
  await home(page, saveWith({ bounty: { d: '2000-01-01', a: ['cl'], done: ['cl'] } }));
  const b = (await readSave(page)).bounty;
  assert.deepEqual([b.d, b.a.length, b.done], [localToday(), 3, []]);
  assert.ok((await text(page, '#rpg-bounty')).includes('今日の手配書 0/3'));
});

t('earn_details', async page => {
  await home(page, saveWith({}));
  assert.equal(await visible(page, '#rpg-earn-go'), false);
  await page.click('#rpg-earn summary');
  const rows = await page.$$eval('#rpg-earn tbody tr', trs => trs.map(tr => tr.textContent));
  assert.equal(rows.length, 7);
  for (const n of ['106', '150', '200']) assert.ok(rows.some(r => r.includes(n)), `${n} が無い: ${rows}`);
  await page.click('#rpg-earn-go');
  assert.equal(await visible(page, '#scr-setup'), true);
});

t('home_pc_columns', async page => {
  await home(page, saveWith({ floors: { samerica: 2 }, bounty: { d: localToday(), a: ['cl', 'br', 'jp'], done: [] } }));
  const r = () => page.evaluate(() => ({
    cols: getComputedStyle($('scr-rpg')).gridTemplateColumns.split(' ').length,
    hero: $('rpg-hero').getBoundingClientRect(), dgs: $('rpg-dgs').getBoundingClientRect(), bounty: $('rpg-bounty').getBoundingClientRect(),
    noHScroll: document.documentElement.scrollWidth <= innerWidth,
  }));
  let x = await r();
  assert.equal(x.cols, 3);
  assert.ok(x.hero.right <= x.dgs.left && x.dgs.right <= x.bounty.left, JSON.stringify(x));   // 旅人 | 図版 | 手配書
  assert.equal(x.noHScroll, true);
  await page.setViewportSize({ width: 1280, height: 720 });
  x = await r();
  assert.equal(x.cols, 2);
  assert.ok(x.hero.right <= x.dgs.left, JSON.stringify(x));
  assert.equal(x.noHScroll, true);
}, { viewport: { width: 1440, height: 900 } });
