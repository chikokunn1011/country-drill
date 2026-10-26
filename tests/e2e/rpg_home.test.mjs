// 国旗クエストの入口（ホームの［冒険］・トップバーのコインのチップ・設定のスイッチ・直リンク #rpg）と冒険ホーム
// （はじめての画面・旅人カード・レベルアップ・つぎにやること・ダンジョンの図版・今日の手配書・コインのかせぎ方・PC の列）、
// 引き継ぎコード・冒険データを消す・開発用パネル・バッジとの連携（さかのぼりのトースト・称号・入れ子の tx）・RPG.snapshot()・タブ2つ
// どのテストも badges.js を止めて開く（openRpg）。本物の badges.js とつなぐのは badges_real_integration だけ
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { startServer, events } from './helpers.mjs';
import { openRpg, toastTexts, readSave, writeSave, saveWith, localToday, playPractice } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 計画 C の badges.js（ブラウザ部分）を index.html が読み込んでいるか（無ければ badges_real_integration は飛ばす）
const HAS_BADGES = readFileSync(new URL('../../index.html', import.meta.url), 'utf8').includes('<script src="badges.js?v=1">');

// 毎回まっさらなブラウザで開いて fn を実行する。最後にページの例外と、[rpg] で始まる console.error が無いことを見る
// （opts.rpgErrorOk で console.error の確認だけ外せる。opts.skip は node:test の skip。ほかの opts は openRpg にそのまま渡す）
const t = (name, fn, { rpgErrorOk = false, skip, ...opts } = {}) => test(name, { timeout: 60_000, skip }, async () => {
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
const raw = page => page.evaluate(() => localStorage.getItem('rpg'));
const brokenKeys = page => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('rpg-broken-')));
// confirm を、出た順に box.answers（true は accept、それ以外と足りない分は dismiss）で答える。出た文は box.msgs に積む
const answerDialogs = page => {
  const box = { msgs: [], answers: [] };
  page.on('dialog', d => { box.msgs.push(d.message()); box.answers.shift() === true ? d.accept() : d.dismiss(); });
  return box;
};
// badge:earned を1回の evaluate でまとめて出し、rpg.js が書いた paid を返す
const fireBadges = (page, ids, retro) => page.evaluate(({ ids, retro }) => ids.map(id => {
  const ev = new CustomEvent('badge:earned', { detail: { id, badge: id.split('@')[0], tier: +id.split('@')[1], title: '', color: 1, retro } });
  document.dispatchEvent(ev);
  return ev.detail.paid;
}), { ids, retro });
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

// #rpg の直リンクでは rpg.js の読み込み中に旅人カードを描く。あとから読み込まれる badges.js の称号も出る
// （badges.js の代わりに、rpg.js より後の rpg-battle.js の末尾で window.BADGES を作る）
t('hash_link_title', async page => {
  await writeSave(page, saveWith({}));
  await page.route('**/rpg-battle.js*', async r => {
    const res = await r.fetch();
    await r.fulfill({ response: res, body: (await res.text()) + "\nwindow.BADGES = { title: () => 'アジア博士' };" });
  });
  await page.goto('about:blank');
  await page.goto(server.url + '#rpg');
  await page.waitForFunction(() => document.readyState === 'complete');
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'rpg');
  assert.equal(await text(page, '#rpg-title'), '〈アジア博士〉');
});

// #settings の直リンクでは rpg.js より前に設定が開く（drill:screen を聞きのがす）。2回目の読み込みはセーブを書き直さないので refresh も走らない
t('settings_hash_switch_on', async page => {
  await writeSave(page, saveWith({}));
  await page.goto('about:blank');
  await page.goto(server.url + '#settings');
  await page.waitForFunction(() => document.readyState === 'complete');
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'settings');
  assert.equal(await page.isChecked('#set-rpg'), true);
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
}, { blockScripts: ['badges.js', 'rpg-battle.js'] });   // バトル画面が RPG.opts を受け取って空にするので、受け渡しの中身を見るためにバトルを止める

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
}, { blockScripts: ['badges.js', 'rpg-battle.js'] });   // next_action_rules と同じ理由

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

/* ---------- データ（引き継ぎコード・冒険データを消す） ---------- */
t('code_roundtrip', async page => {
  await home(page, saveWith({ lv: 12, coins: 3456, cards: { cl: [2, 1], br: [1, 0], jp: [3, 0] } }));
  await page.evaluate(() => { misses = { cl: 2 }; store.set('misses', misses); });
  const k0 = await brokenKeys(page);
  await page.click('#rpg-data summary');
  await page.waitForFunction(() => $('rpg-code-out').value.startsWith('CQ1.'));
  const code = await page.inputValue('#rpg-code-out');
  assert.equal(await page.evaluate(() => $('rpg-code-out').readOnly), true);
  const dlg = answerDialogs(page);
  dlg.answers.push(true, true);
  await page.click('#rpg-wipe');
  assert.equal(dlg.msgs.length, 2);
  assert.equal((await readSave(page)).lv, 1);
  assert.equal(await visible(page, '#rpg-intro'), true);
  assert.deepEqual(await page.evaluate(() => misses), { cl: 2 });   // 消すのは冒険データだけ
  await page.evaluate(() => { misses = {}; store.set('misses', misses); });
  // はじめての画面の下の「データ」は復元だけ
  assert.deepEqual(await page.evaluate(() => ['rpg-code-out', 'rpg-code-copy', 'rpg-wipe'].map(id => !!$(id))), [false, false, false]);
  assert.equal(await page.evaluate(() => $('rpg-data').parentElement.id), 'rpg-intro');
  await page.click('#rpg-intro #rpg-data summary');
  await page.fill('#rpg-code-in', `\n${code}\n`);
  dlg.msgs.length = 0;
  dlg.answers.push(true, true);
  await page.click('#rpg-code-load');
  assert.deepEqual(dlg.msgs, ['今のデータを上書きする？（Lv1・仲間0 → Lv12・仲間3）', 'まちがえた記録も入れかえる？']);
  const s = await readSave(page);
  assert.deepEqual(pick(s, { lv: 0, coins: 0, intro: 0 }), { lv: 12, coins: 3456, intro: true });
  assert.deepEqual(s.cards, { cl: [2, 1], br: [1, 0], jp: [3, 0] });
  assert.deepEqual(await page.evaluate(() => [misses.cl, JSON.parse(localStorage.getItem('misses')).cl]), [2, 2]);
  // 上書きする前のデータ（消したあとの Lv1）を1つ写した
  const added = (await brokenKeys(page)).filter(k => !k0.includes(k));
  assert.equal(added.length, 1);
  assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).lv, added[0]), 1);
  assert.equal(await visible(page, '#rpg-hero'), true);
  assert.ok((await text(page, '#rpg-stats')).includes('Lv 12'));
});

t('code_keep_misses', async page => {
  // 「まちがえた記録も入れかえる？」をキャンセルすると misses はそのまま（冒険データは入れかわる）
  await home(page, saveWith({ lv: 4 }));
  await page.evaluate(() => { misses = { jp: 5 }; store.set('misses', misses); });
  await page.click('#rpg-data summary');
  await page.waitForFunction(() => $('rpg-code-out').value.startsWith('CQ1.'));
  const code = await page.inputValue('#rpg-code-out');
  await home(page, saveWith({ lv: 9 }));
  await page.evaluate(() => { misses = { br: 1 }; store.set('misses', misses); });
  const dlg = answerDialogs(page);
  dlg.answers.push(false);
  await page.click('#rpg-data summary');
  await page.fill('#rpg-code-in', code);
  await page.click('#rpg-code-load');
  assert.equal(dlg.msgs.length, 1);   // 1つ目でやめた
  assert.equal((await readSave(page)).lv, 9);
  dlg.msgs.length = 0;
  dlg.answers.push(true, false);
  await page.click('#rpg-code-load');
  assert.equal(dlg.msgs.length, 2);
  assert.equal((await readSave(page)).lv, 4);
  assert.deepEqual(await page.evaluate(() => [misses, JSON.parse(localStorage.getItem('misses'))]), [{ br: 1 }, { br: 1 }]);
});

t('code_invalid', async page => {
  await home(page, saveWith({ lv: 5, coins: 777 }));
  const before = await raw(page), b0 = await brokenKeys(page);
  const dlg = answerDialogs(page);
  await page.click('#rpg-data summary');
  await page.fill('#rpg-code-in', 'hello');
  await page.click('#rpg-code-load');
  assert.equal(await text(page, '#rpg-code-msg'), 'コードが正しくないみたい');
  assert.deepEqual(dlg.msgs, []);
  assert.equal(await raw(page), before);
  assert.deepEqual(await brokenKeys(page), b0);
  // 描き直しても、開いた「データ」・入れたコード・メッセージはそのまま
  await page.evaluate(() => RPG.refresh());
  assert.equal(await page.evaluate(() => $('rpg-data').open), true);
  assert.equal(await page.inputValue('#rpg-code-in'), 'hello');
  assert.equal(await text(page, '#rpg-code-msg'), 'コードが正しくないみたい');
});

t('code_restore_clears_msg', async page => {
  // ホームのまま、まちがったコード → 正しいコードで復元できたら、前のメッセージとはりつけたコードは消える
  await home(page, saveWith({ lv: 4 }));
  await page.evaluate(() => { misses = { jp: 5 }; store.set('misses', misses); });
  await page.click('#rpg-data summary');
  await page.waitForFunction(() => $('rpg-code-out').value.startsWith('CQ1.'));
  const code = await page.inputValue('#rpg-code-out');
  await home(page, saveWith({ lv: 9 }));
  const dlg = answerDialogs(page);
  await page.click('#rpg-data summary');
  await page.fill('#rpg-code-in', 'hello');
  await page.click('#rpg-code-load');
  assert.equal(await text(page, '#rpg-code-msg'), 'コードが正しくないみたい');
  await page.fill('#rpg-code-in', code);
  dlg.answers.push(true, true);
  await page.click('#rpg-code-load');
  assert.deepEqual(dlg.msgs, ['今のデータを上書きする？（Lv9・仲間0 → Lv4・仲間0）', 'まちがえた記録も入れかえる？']);
  assert.equal((await readSave(page)).lv, 4);
  assert.ok((await toastTexts(page)).includes('引き継ぎコードで復元したよ'));
  assert.equal(await visible(page, '#rpg-hero'), true);   // ホームのまま描き直した
  assert.deepEqual(await page.evaluate(() => [$('rpg-code-msg').textContent, $('rpg-code-in').value]), ['', '']);
});

t('code_copy', async page => {
  await home(page, saveWith({ lv: 3 }));
  // コピーできた
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async s => { window.__copied = s; } } }));
  await page.click('#rpg-data summary');
  await page.click('#rpg-code-copy');
  await page.waitForFunction(() => $('rpg-code-msg').textContent !== '');
  assert.equal(await text(page, '#rpg-code-msg'), 'コピーしたよ');
  const code = await page.inputValue('#rpg-code-out');
  assert.ok(code.startsWith('CQ1.'));
  assert.equal(await page.evaluate(() => window.__copied), code);
  // 使えない（ことわられた）ときは、コードを選んで知らせる
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await page.click('#rpg-code-copy');
  await page.waitForFunction(() => $('rpg-code-msg').textContent !== 'コピーしたよ');
  assert.equal(await text(page, '#rpg-code-msg'), 'コピーできなかったので、選んである文字をコピーしてね');
  assert.deepEqual(await page.evaluate(() => { const o = $('rpg-code-out'); return [document.activeElement.id, o.selectionStart, o.selectionEnd === o.value.length]; }),
    ['rpg-code-out', 0, true]);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await page.evaluate(() => { $('rpg-code-msg').textContent = ''; $('rpg-code-out').blur(); });
  await page.click('#rpg-code-copy');
  await page.waitForFunction(() => $('rpg-code-msg').textContent !== '');
  assert.equal(await text(page, '#rpg-code-msg'), 'コピーできなかったので、選んである文字をコピーしてね');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'rpg-code-out');
});

t('wipe_needs_two', async page => {
  await home(page, saveWith({ lv: 9, coins: 500, cards: { cl: [1, 0] } }));
  await page.evaluate(() => { misses = { jp: 3 }; store.set('misses', misses); });
  const before = await raw(page);
  const dlg = answerDialogs(page);
  await page.click('#rpg-data summary');
  dlg.answers.push(false);
  await page.click('#rpg-wipe');
  assert.deepEqual(dlg.msgs, ['冒険データを消す？（コイン・Lv・仲間が全部なくなる）']);
  assert.equal(await raw(page), before);
  dlg.msgs.length = 0;
  dlg.answers.push(true, false);
  await page.click('#rpg-wipe');
  assert.deepEqual(dlg.msgs, ['冒険データを消す？（コイン・Lv・仲間が全部なくなる）', 'ほんとうに消す？ もとにもどせないよ']);
  assert.equal(await raw(page), before);
  dlg.answers.push(true, true);
  await page.click('#rpg-wipe');
  const s = await readSave(page);
  assert.deepEqual(pick(s, { intro: 0, coins: 0, lv: 0, cards: 0 }), { intro: false, coins: 0, lv: 1, cards: {} });
  assert.deepEqual(await page.evaluate(() => [misses, JSON.parse(localStorage.getItem('misses'))]), [{ jp: 3 }, { jp: 3 }]);
  assert.equal(await visible(page, '#rpg-intro'), true);
});

/* ---------- 開発用パネル（?rpgdebug=1） ---------- */
t('debug_panel', async page => {
  await home(page, saveWith({ coins: 5 }));
  assert.equal(await page.locator('#rpg-debug').count(), 0);   // ?rpgdebug なしでは出ない
  await page.goto(server.url + '?rpgdebug=1#rpg');
  await page.waitForFunction(() => document.readyState === 'complete');
  assert.equal(await visible(page, '#rpg-debug'), true);
  const s0 = await readSave(page);
  assert.ok((await text(page, '#rpg-dbg-give')).includes('+10,000'));
  await page.click('#rpg-dbg-give');
  assert.equal((await readSave(page)).coins, s0.coins + 10000);
  assert.deepEqual(await evs(page, 'rpg:coins', { delta: 0, reason: 0 }), [{ delta: 10000, reason: 'debug' }]);
  await page.fill('#rpg-dbg-lv', '15');
  await page.click('#rpg-dbg-setlv');
  assert.equal((await readSave(page)).lv, 15);
  assert.equal(await page.evaluate(() => RPG.debug.setLv(20)), 20);
  assert.equal((await readSave(page)).lv, 20);
  assert.equal(await page.evaluate(() => RPG.debug.setLv(999)), 50);   // 1..50 におさめる
  await page.click('#rpg-dbg-unlock');
  assert.deepEqual((await readSave(page)).floors, { samerica: 4, oceania: 4, namerica: 4, europe: 4, asia: 4, africa: 4, world: 4 });
  await page.waitForFunction(() => document.querySelectorAll('.rpg-fl:disabled').length === 0);   // ボスまで全部押せる
  assert.deepEqual(await page.evaluate(() => [RPG.debug.unlock('asia', 5), RPG.debug.unlock('nowhere', 3), RPG.get().floors.asia]), [5, null, 5]);
  assert.equal((await page.evaluate(() => RPG.debug.save())).lv, 50);
  // 開発用パネルの［冒険データを消す］も2回たしかめる
  const dlg = answerDialogs(page);
  dlg.answers.push(true, true);
  await page.click('#rpg-dbg-wipe');
  assert.equal(dlg.msgs.length, 2);
  assert.deepEqual(pick(await readSave(page), { intro: 0, coins: 0, lv: 0 }), { intro: false, coins: 0, lv: 1 });
  assert.equal(await visible(page, '#rpg-intro'), true);
  assert.equal(await visible(page, '#rpg-debug'), true);   // はじめての画面にも出る
});

/* ---------- バッジとの連携 ---------- */
t('badge_retro_one_toast', async page => {
  await writeSave(page, saveWith({ coins: 0 }));
  assert.deepEqual(await fireBadges(page, ['reg-asia@1', 'reg-africa@1', 'answers@1'], true), [50, 50, 50]);
  await page.waitForFunction(() => window.__toasts.some(s => s.includes('バッジのごほうび')));
  await sleep(100);
  const ts = (await toastTexts(page)).filter(s => s.includes('バッジのごほうび'));
  assert.equal(ts.length, 1, ts.join(' / '));
  assert.ok(ts[0].includes('+150'), ts[0]);
  assert.equal(await page.locator('.toast .coin').count(), 1);
  assert.equal((await readSave(page)).coins, 150);
  // もう払ってある（paid 0）と retro:false はトーストを出さない
  assert.deepEqual(await fireBadges(page, ['reg-asia@1', 'answers@1'], true), [0, 0]);
  assert.deepEqual(await fireBadges(page, ['answers@2'], false), [50]);
  await sleep(100);
  assert.equal((await toastTexts(page)).filter(s => s.includes('バッジのごほうび')).length, 1);
  assert.equal((await readSave(page)).coins, 200);
});

t('badge_title_redraws', async page => {
  await home(page, saveWith({}));
  assert.equal(await text(page, '#rpg-title'), '');
  // RPG.refresh() を呼ばずに、badge:title を受けたその場で描き直す
  assert.equal(await page.evaluate(() => {
    window.BADGES = { title: () => 'アジア博士' };
    document.dispatchEvent(new CustomEvent('badge:title', { detail: { key: 'reg-asia@3', title: 'アジア博士' } }));
    return $('rpg-title').textContent;
  }), '〈アジア博士〉');
  assert.equal(await page.evaluate(() => {
    window.BADGES = { title: () => '' };
    document.dispatchEvent(new CustomEvent('badge:title', { detail: { key: null, title: '' } }));
    return $('rpg-title').textContent;
  }), '');
});

// rpg:levelup のリスナーの中で（同期で）badge:earned を払っても、レベルアップの書きこみで消えない
t('nested_tx_safe', async page => {
  await home(page, saveWith({ coins: 1000 }));
  await page.click('#rpg-lvup');
  let s = await readSave(page);
  assert.deepEqual([s.lv, s.coins, s.badgesPaid], [2, 950, ['rpg-lv@1']]);
  assert.equal(await page.evaluate(() => window.__paid), 50);
  // rpg:coins の coins は出した時点の額（あいだに払ったバッジの分もふくむ）
  assert.deepEqual(await evs(page, 'rpg:coins', { delta: 0, reason: 0, coins: 0 }),
    [{ delta: 50, reason: 'badge', coins: 1050 - 100 }, { delta: -100, reason: 'levelup', coins: 950 }]);
  const m = await page.evaluate(() => RPG_CORE.maxLevelUp(2, 950));
  assert.ok(m.to > 2 && m.cost > 0);
  await page.waitForFunction(() => $('rpg-stats').textContent.includes('Lv 2'));
  page.once('dialog', d => d.accept());
  await page.click('#rpg-lvmax');
  s = await readSave(page);
  assert.deepEqual([s.lv, s.coins, s.badgesPaid], [m.to, 950 - m.cost, ['rpg-lv@1']]);
  assert.equal(await page.evaluate(() => window.__paid), 0);
}, {
  init: () => {
    document.addEventListener('rpg:levelup', () => {
      const ev = new CustomEvent('badge:earned', { detail: { id: 'rpg-lv@1', badge: 'rpg-lv', tier: 1, title: '', color: 1, retro: false } });
      document.dispatchEvent(ev);
      window.__paid = ev.detail.paid;
    });
  },
});

// 本物の badges.js と rpg.js: 旅に出ると rpg-start@1 のコインを1回だけ払う（再読み込みしても二重に払わない）
t('badges_real_integration', async page => {
  await writeSave(page, saveWith({ intro: false }));
  await page.click('#home-rpg');
  await page.click('#rpg-go');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rpg')).badgesPaid.includes('rpg-start@1'));
  let s = await readSave(page);
  assert.equal(s.coins, 1050);
  assert.equal(s.badgesPaid.filter(id => id === 'rpg-start@1').length, 1);
  assert.equal((await events(page, 'rpg:coins')).filter(e => e.reason === 'badge').length, 1);
  await page.reload();
  await page.waitForFunction(() => document.readyState === 'complete');
  await sleep(1000);
  s = await readSave(page);
  assert.equal(s.coins, 1050);
  assert.equal(s.badgesPaid.filter(id => id === 'rpg-start@1').length, 1);
  assert.equal((await events(page, 'rpg:coins')).filter(e => e.reason === 'badge').length, 0);
}, { blockScripts: [], skip: HAS_BADGES ? false : '計画 C の badges.js（ブラウザ部分）が index.html に無い' });

/* ---------- RPG.snapshot()・タブ2つ ---------- */
t('snapshot_shape', async page => {
  await writeSave(page, saveWith({ intro: true, lv: 7, coins: 1234, earned: 5678, cards: { cl: [1, 0], br: [2, 1], jp: [3, 0] },
    floors: { samerica: 5, oceania: 2 }, st: { overcome: 4, bountyDays: 2 } }));
  const s = await page.evaluate(() => RPG.snapshot());
  const want = {
    intro: true, lv: 7, coins: 1234, earned: 5678, owned: 3, ownedByStar: { 1: 1, 2: 1, 3: 1 },
    ownedByRegion: { samerica: 2, oceania: 0, namerica: 0, europe: 0, asia: 1, africa: 0 },
    floors: { samerica: 5, oceania: 2 }, cleared: ['samerica'], overcome: 4, bountyDays: 2,
  };
  assert.deepEqual(pick(s, want), want);
  assert.deepEqual(Object.keys(s).sort(), [...Object.keys(want), 'st'].sort());
  assert.deepEqual([s.st.overcome, s.st.bountyDays, s.st.win], [4, 2, 0]);
  // 写しなので、書きかえてもセーブは変わらない
  assert.equal(await page.evaluate(() => { const x = RPG.snapshot(); x.floors.asia = 5; x.st.win = 9; return RPG.snapshot().floors.asia ?? 0; }), 0);
  // はじめての人
  await writeSave(page, saveWith({ intro: false }));
  assert.deepEqual(pick(await page.evaluate(() => RPG.snapshot()), { intro: 0, owned: 0, cleared: 0 }), { intro: false, owned: 0, cleared: [] });
});

t('two_tabs_sync', async (page, app) => {
  await writeSave(page, saveWith({ coins: 1000 }));
  const p2 = await app.context.newPage(), errs2 = [];
  p2.on('pageerror', e => errs2.push(String(e)));
  await p2.goto(server.url);
  await p2.waitForFunction(() => document.readyState === 'complete');
  for (const p of [page, p2]) await p.evaluate(() => show('setup'));
  await p2.click('#rpg-chip');
  await p2.click('#rpg-lvup');
  assert.deepEqual(pick(await readSave(p2), { lv: 0, coins: 0 }), { lv: 2, coins: 900 });
  // ページ1は再読み込みなしで（storage イベントで）チップを描き直す
  await page.waitForFunction(() => $('rpg-chip').textContent.includes('900'));
  await page.click('#rpg-chip');
  await page.click('#rpg-lvup');
  assert.deepEqual(pick(await readSave(page), { lv: 0, coins: 0 }), { lv: 3, coins: 770 });
  // ページ2の冒険ホームも描き直す
  await p2.waitForFunction(() => $('rpg-stats').textContent.includes('Lv 3'));
  assert.deepEqual(errs2, []);
});
