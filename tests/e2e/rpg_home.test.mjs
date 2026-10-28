// 国旗クエストの入口（ホームの［冒険］・トップバーのコインのチップ・設定のスイッチ・直リンク #rpg）と冒険ホーム
// （はじめての画面・旅人カード・レベルアップ・つぎにやること・ダンジョンの図版・今日の手配書・コインのかせぎ方・PC の列）、
// 引き継ぎコード・冒険データを消す・開発用パネル・バッジとの連携（さかのぼりのトースト・称号・入れ子の tx）・RPG.snapshot()・タブ2つ
// どのテストも badges.js を止めて開く（openRpg）。本物の badges.js とつなぐのは badges_real_integration（旅立ちの払い）と badges_real_gacha_hold（ガチャの演出中の保留）の2つ
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, events } from './helpers.mjs';
import { openRpg, toastTexts, readSave, writeSave, saveWith, localToday, playPractice } from './rpg_helpers.mjs';

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
const EARTH_CLEAR = { samerica: 5, oceania: 5, namerica: 5, europe: 5, asia: 5, africa: 5, world: 5 };
// 地球と鏡の地球の14個（宇宙は月から）
const MIRROR_CLEAR = { ...EARTH_CLEAR, msamerica: 5, moceania: 5, mnamerica: 5, meurope: 5, masia: 5, mafrica: 5, mworld: 5 };
// 宇宙も入れて21個とも（ストーリーは読んだことにして、章の終わりの dialog を出さない）
const ALL_CLEAR = { ...MIRROR_CLEAR, moon: 5, mercury: 5, venus: 5, mars: 5, jupiter: 5, saturn: 5, blackhole: 5 };
const READ_ALL = ['ch1', 'ch2', 'ch3start', 'ch3'];
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

// 設定のスイッチは、tx が書けたときだけ body.rpg-off を切りかえる（新しい版のデータ・保存の失敗では、スイッチを戻して何も変えない）
t('settings_switch_needs_write', async page => {
  await writeSave(page, { v: 99, intro: true, show: true });
  await page.evaluate(() => show('settings'));
  assert.equal(await page.isChecked('#set-rpg'), true);
  await page.click('#set-rpg');   // uncheck() は押したあとの状態を確かめるので、戻すこのテストでは click
  assert.equal(await page.evaluate(() => document.body.classList.contains('rpg-off')), false);
  assert.equal(await page.isChecked('#set-rpg'), true);   // 書けなかったので戻す
  await page.evaluate(() => show('setup'));
  assert.equal(await visible(page, '#rpg-chip'), true);
  // 保存の失敗（setItem が例外）でも同じ。トースト「保存できなかった…」は tx が出す
  const q = await openRpg(browser, { init: () => {
    const { setItem } = Storage.prototype;
    Storage.prototype.setItem = function (k, v) { if (k === 'rpg' && window.__fail) throw new DOMException('full', 'QuotaExceededError'); return setItem.call(this, k, v); };
  } });
  try {
    const p = q.page;
    await writeSave(p, saveWith({}));
    await p.evaluate(() => { window.__fail = true; show('settings'); });
    await p.click('#set-rpg');
    assert.equal(await p.evaluate(() => document.body.classList.contains('rpg-off')), false);
    assert.equal(await p.isChecked('#set-rpg'), true);
    assert.ok((await toastTexts(p)).includes('保存できなかった…'), JSON.stringify(await toastTexts(p)));
    assert.equal((await readSave(p)).show, true);
    assert.deepEqual(q.errors.map(String), []);
  } finally { await q.close(); }
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

// #rpg の直リンクで開いた冒険ホームにも入口がそろう。rpg.js の読み込み中（rpg-cards.js がまだ無い）に描いたあと、
// 読み込みが終わってから描き直すので、［国旗ガチャ］［仲間］があり、つぎにやることもガチャの10連をすすめる
t('hash_link_entrances', async page => {
  await writeSave(page, saveWith({ coins: 1000 }));
  await page.goto('about:blank');
  await page.goto(server.url + '#rpg');
  await page.waitForFunction(() => document.readyState === 'complete');
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'rpg');
  for (const sel of ['#rpg-hero', '#rpg-lvup', '#rpg-next', '#rpg-to-gacha', '#rpg-to-cards', '#rpg-dgs .rpg-plate'])
    assert.ok(await page.locator(sel).count() >= 1 && await visible(page, sel), `${sel} が無い`);
  assert.ok((await text(page, '#rpg-next')).includes('まずは国旗ガチャ10連'), await text(page, '#rpg-next'));
  await page.click('#rpg-to-cards');
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'cards');
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
  await home(page, saveWith({ lv: 99, coins: 1e9 }));   // 上限は Lv99
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
  assert.ok(s.includes('まずは国旗ガチャ10連で仲間をさがそう（全世界なら●1,000）'), s);
  await page.click('#rpg-next');
  assert.deepEqual(await page.evaluate(() => RPG.opts), { region: 'all' });
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
  s = await next(saveWith({ pulls: 1, floors: ALL_CLEAR, story: READ_ALL }));
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
  await home(page, saveWith({ floors: ALL_CLEAR, story: READ_ALL }));
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

// 引き継ぎコードのメッセージ（role=status）は空でも display:none にしない（読み上げが止まらないように）。空のときの余白は前と同じ
t('code_msg_rendered_when_empty', async page => {
  await home(page, saveWith({}));
  await page.click('#rpg-data summary');
  const m = () => page.evaluate(() => {
    const r = id => $(id).getBoundingClientRect();
    return { display: getComputedStyle($('rpg-code-msg')).display, gap: +(r('rpg-wipe').top - r('rpg-code-load').bottom).toFixed(1), h: +r('rpg-code-msg').height.toFixed(1) };
  });
  assert.deepEqual(await m(), { display: 'block', gap: 16, h: 0 });
  await page.evaluate(() => { $('rpg-code-msg').textContent = 'コードが正しくないみたい'; });
  const f = await m();
  assert.ok(f.h > 0 && f.gap >= 16 + f.h, JSON.stringify(f));
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

/* ---------- 章の終わりのストーリー（#rpg-story-dlg） ---------- */
const storyOpen = page => page.evaluate(() => !!$('rpg-story-dlg')?.open);
// 閉じたあとの close イベントで story が書かれるので、書けるまで待つ
const storySaved = async (page, want) => {
  for (let i = 0; i < 50 && JSON.stringify((await readSave(page)).story) !== JSON.stringify(want); i++) await page.waitForTimeout(40);
  assert.deepEqual((await readSave(page)).story, want);
};
t('story_once_for_old_clear', async page => {
  // 地図喰いを前に倒していて、ストーリーをまだ読んでいないセーブ
  await home(page, saveWith({ floors: { world: 5 } }));
  assert.equal(await storyOpen(page), true);
  const s = await text(page, '#rpg-story-dlg');
  for (const x of ['地図喰いをたおすと、195の旗が空に舞いもどった。', '鏡のような裂け目', '鏡の地図喰いをたおして、ふたつの地球をつなぐ裂け目を閉じよう！']) assert.ok(s.includes(x), `${x} が無い: ${s}`);
  assert.ok(!s.includes('星喰い'), s);   // 第2章クリアの文はまだ
  assert.equal(await page.locator('#rpg-story-dlg').count(), 1);
  await page.click('#rpg-story-dlg .close');
  await page.waitForFunction(() => !$('rpg-story-dlg').open);
  await storySaved(page, ['ch1']);
  // 読み込み直しても出ない
  await page.reload();
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.evaluate(() => show('rpg'));
  assert.equal(await storyOpen(page), false);
  // 2つとも読んでいなければ古い順に1つずつ（Esc で閉じても読んだことになる）。そのあと第3章のはじまり
  await home(page, saveWith({ floors: MIRROR_CLEAR }));
  assert.ok((await text(page, '#rpg-story-dlg')).includes('鏡のような裂け目'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => $('rpg-story-dlg').open && $('rpg-story-dlg').textContent.includes('母さま、あとはたのむ'));
  const s2 = await text(page, '#rpg-story-dlg');
  assert.ok(s2.includes('地図喰いを生んだ「星喰い」が、宇宙から地球をねらっていたんだ。'), s2);
  await page.click('#rpg-story-dlg .close');
  await page.waitForFunction(() => $('rpg-story-dlg').open && $('rpg-story-dlg').textContent.includes('星喰いは、星をひとつずつ'));
  await page.click('#rpg-story-dlg .close');
  await storySaved(page, ['ch1', 'ch2', 'ch3start']);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.equal(await storyOpen(page), false);
  // 新しい版のデータ（読み取り専用）のときは出さない
  await home(page, { v: 99, intro: true, floors: { world: 5 } });
  assert.equal(await storyOpen(page), false);
});

t('story_button_chains_next', async page => {
  // ch1・ch2 とも読んでいない: ［閉じる］ボタンで閉じても、すぐ次の章のストーリーが出る（次の描き直しを待たない）
  await home(page, saveWith({ floors: MIRROR_CLEAR, story: ['ch3start'] }));
  assert.ok((await text(page, '#rpg-story-dlg')).includes('鏡のような裂け目'));
  // ボタンで閉じ（close イベントが来て）、そのすぐあとの次の tick で、次の章のが開いているか見る（別の描き直しを待たない）
  const chained = await page.evaluate(() => new Promise(res => {
    const g = $('rpg-story-dlg');
    g.addEventListener('close', () => setTimeout(() => res(g.open && g.textContent.includes('母さま、あとはたのむ')), 0), { once: true });
    g.querySelector('.close').click();
  }));
  assert.equal(chained, true);
  await page.click('#rpg-story-ok');
  await storySaved(page, ['ch3start', 'ch1', 'ch2']);
});

t('story_ch3start_for_old_mirror_clear', async page => {
  // この版より前に鏡の地図喰いを倒して ch2 を読んだセーブ: 第3章のはじまりだけが1回出る
  await home(page, saveWith({ floors: MIRROR_CLEAR, story: ['ch1', 'ch2'] }));
  assert.equal(await storyOpen(page), true);
  const s = await text(page, '#rpg-story-dlg');
  for (const x of ['第3章 宇宙', '星喰いは、星をひとつずつ飲みこみながら地球へ近づいている。', '星には、地球の国のなかまたちの記憶が眠っている。',
    '宇宙から地球を見下ろして、国の場所を思い出し、星喰いを止めよう！']) assert.ok(s.includes(x), `${x} が無い: ${s}`);
  assert.ok(!s.includes('母さま'), s);
  await page.click('#rpg-story-ok');
  await storySaved(page, ['ch1', 'ch2', 'ch3start']);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.equal(await storyOpen(page), false);
  await page.reload();
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.evaluate(() => show('rpg'));
  assert.equal(await storyOpen(page), false);
  // 1つも読んでいない: ch1 → ch2 → ch3start の順に、ボタンでつづけて出る
  await home(page, saveWith({ floors: MIRROR_CLEAR, story: [] }));
  for (const [want, saved] of [['鏡のような裂け目', ['ch1']], ['母さま、あとはたのむ', ['ch1', 'ch2']], ['星喰いは、星をひとつずつ', ['ch1', 'ch2', 'ch3start']]]) {
    await page.waitForFunction(w => $('rpg-story-dlg').open && $('rpg-story-dlg').textContent.includes(w), want);
    await page.click('#rpg-story-ok');
    await storySaved(page, saved);
  }
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.equal(await storyOpen(page), false);
});

t('all_clear_after_mirror', async page => {
  // 地球をクリアしただけなら、つぎは鏡のアマゾン F1
  await home(page, saveWith({ pulls: 1, lv: 30, floors: EARTH_CLEAR, story: ['ch1'] }));
  let s = await text(page, '#rpg-next');
  assert.ok(s.includes('鏡のアマゾン F1 に挑戦！'), s);
  assert.deepEqual(await page.evaluate(() => RPG.nextFloor(RPG.get())), { id: 'msamerica', floor: 1 });
  // 鏡の地球の14個とも: まだ全クリアではなく、つぎは月 F1
  await home(page, saveWith({ pulls: 1, lv: 60, floors: MIRROR_CLEAR, story: ['ch1', 'ch2', 'ch3start'] }));
  s = await text(page, '#rpg-next');
  assert.ok(s.includes('月 F1 に挑戦！'), s);
  assert.deepEqual(await page.evaluate(() => RPG.nextFloor(RPG.get())), { id: 'moon', floor: 1 });
});

t('all_clear_after_space', async page => {
  // 21個とも: 全クリア。エンディングが1回だけ出る
  await home(page, saveWith({ pulls: 1, floors: ALL_CLEAR, story: ['ch1', 'ch2', 'ch3start'] }));
  assert.equal(await storyOpen(page), true);
  const e = await text(page, '#rpg-story-dlg');
  for (const x of ['星喰いが消えると、飲みこまれた星たちがいっせいに光りはじめた。', '地球も、鏡の地球も、宇宙も、もう安心だ。',
    'でも旅は終わらない。英雄の塔のてっぺんは、まだだれも見たことがない――']) assert.ok(e.includes(x), `${x} が無い: ${e}`);
  await page.click('#rpg-story-ok');
  await storySaved(page, ['ch1', 'ch2', 'ch3start', 'ch3']);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.equal(await storyOpen(page), false);
  const s = await text(page, '#rpg-next');
  assert.ok(s.includes('全クリア！'), s);
  assert.equal(await page.evaluate(() => RPG.nextFloor(RPG.get())), null);
  // 全クリアの旅人カードは星喰いの巣のボスのときの強さ（例外を出さない）
  assert.match(await text(page, '#rpg-stats'), /❤️/);
  await page.reload();
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.evaluate(() => show('rpg'));
  assert.equal(await storyOpen(page), false);
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
  assert.equal(await page.evaluate(() => RPG.debug.setLv(999)), 99);   // 1..99 におさめる
  await page.click('#rpg-dbg-unlock');
  assert.deepEqual((await readSave(page)).floors, Object.fromEntries(Object.keys(ALL_CLEAR).map(id => [id, 4])));   // 鏡の地球・宇宙も入れて21個
  await page.waitForFunction(() => document.querySelectorAll('.rpg-fl:disabled').length === 0);   // ボスまで全部押せる
  assert.deepEqual(await page.evaluate(() => [RPG.debug.unlock('asia', 5), RPG.debug.unlock('nowhere', 3), RPG.get().floors.asia]), [5, null, 5]);
  assert.equal((await page.evaluate(() => RPG.debug.save())).lv, 99);
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
}, { blockScripts: [] });

// 本物の badges.js と rpg.js: 10連で50か国目が仲間になると「仲間あつめ」(rpg-cards@1) が取れ、ガチャの演出中（reduced motion なら最後の rpg:pull から1秒）は
// トーストを保留し、過ぎたら ●+50 のトーストを出す。払いは1回（badgesPaid と rpg:coins {reason:'badge'}）。ガチャで仲間になっても「覚えて仲間に」は取れない
t('badges_real_gacha_hold', async page => {
  // 南アメリカ以外の49か国を仲間にしておく → 南アメリカの10連で最初の NEW が50か国目
  const codes = await page.evaluate(() => C.filter(c => c.r !== '南アメリカ').slice(0, 49).map(c => c.a));
  await writeSave(page, saveWith({ coins: 1500, cards: Object.fromEntries(codes.map(a => [a, [1, 0]])) }));   // 地域をしぼった10連は ●1,500
  assert.deepEqual(await toastTexts(page), []);
  await page.evaluate(() => RPG.open('gacha'));
  await page.click('#ga-regions .chip[data-r="南アメリカ"]');
  await page.click('#ga-10');
  await page.waitForFunction(() => window.__ev.some(e => e.type === 'rpg:join' && e.via === 'gacha'));
  assert.deepEqual((await events(page, 'badge:earned')).map(e => [e.id, e.retro]), [['rpg-cards@1', false]]);
  await sleep(500);
  assert.equal((await toastTexts(page)).filter(s => s.includes('仲間あつめ')).length, 0, '演出中なのにトーストが出ている');
  const toast = page.locator('#toasts .toast', { hasText: '仲間あつめ' });
  await toast.waitFor({ timeout: 2500 });
  assert.match(await toast.innerText(), /●\+50/);
  const s = await readSave(page);
  assert.deepEqual(s.badgesPaid, ['rpg-cards@1']);
  assert.deepEqual((await events(page, 'rpg:coins')).filter(e => e.reason === 'badge').map(e => e.delta), [50]);
  // t の opts は before() より前に評価されるので ?bdgdebug=1 は付けられない → BADGES.debug ではなく localStorage を読む
  const got = await page.evaluate(() => JSON.parse(localStorage.getItem('badges')).got);
  assert.equal(typeof got['rpg-cards@1'], 'number');
  assert.equal(got['rpg-friend@1'], undefined);
}, { blockScripts: [], seed: 1, reducedMotion: 'reduce',
  storage: { badges: { v: 1, got: { 'rpg-start@1': 1 }, eq: '', sn: { 'rpg-start': 2 }, sent: ['rpg-start@1'], tip: 3 } } });   // 旅立ちは取って払ってある（起動時のまとめのトーストを出さない）

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
  const p2 = await app.context.newPage(), errs2 = [], cerrs2 = [];
  p2.on('pageerror', e => errs2.push(String(e)));
  p2.on('console', m => { if (m.type() === 'error') cerrs2.push(m.text()); });
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
  assert.deepEqual(cerrs2.filter(s => s.startsWith('[rpg]')), []);   // 2枚目のページでも [rpg] の console.error は無い
});
