// 国旗クエストの編成画面（rpg-team.js の #scr-team）: 冒険ホームの入口・入れる／外す・3枚のときのトースト・おまかせ・枠の購入・名前・
// 新しい版のデータ（readOnly）では書かない・バトルの登場画面からの戻り
// どのテストも badges.js を止めて開く（openRpg）。セーブは writeSave(page, saveWith({…})) で入れる
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, events } from './helpers.mjs';
import { openRpg, readSave, writeSave, saveWith, toastTexts } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで開いて fn を実行する。最後にページの例外と、[rpg] で始まる console.error が無いことを見る
const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openRpg(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});

// 東南アジア3か国（★1）とブラジル（★2）。次に挑むのはアジア
const CARDS = { coins: 5000, cards: { th: [1, 0], vn: [1, 0], id: [1, 0], br: [2, 0] }, floors: { samerica: 5, oceania: 5, namerica: 5, europe: 5 } };
const text = (page, sel) => page.locator(sel).innerText();
const slots = page => page.$$eval('#tm-slots .rpg-pc[data-a]', els => els.map(e => e.dataset.a));
const raw = page => page.evaluate(() => localStorage.getItem('rpg'));
// セーブを入れて、編成画面を開く
const team = async (page, save) => {
  await writeSave(page, save);
  await page.evaluate(() => RPG.open('team'));
};
const card = a => `#tm-grid .rpg-card[data-a="${a}"]`;

t('home_has_team_button', async page => {
  await writeSave(page, saveWith(CARDS));
  await page.evaluate(() => show('rpg'));
  assert.ok((await text(page, '#rpg-to-team')).includes('編成'));
  await page.click('#rpg-to-team');
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'team');
  assert.equal(await page.isVisible('#scr-team'), true);
  assert.equal(await text(page, '#tm-back'), '← 冒険');
  await page.click('#tm-back');
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'rpg');
});

t('add_and_remove_cards', async page => {
  await team(page, saveWith({ ...CARDS, teams: [{ n: '編成1', c: [] }] }));
  assert.equal(await page.$eval('#tm-dg', s => s.value), 'asia');
  assert.equal(await page.locator('#tm-slots .tm-empty').count(), 3);
  // 一覧の並び: アジアでのこうげき（br ★2 = 3、東南アジアの★1 は地域ボーナスで 1.5）→ ★ → 国コード。下にグループの名前
  assert.deepEqual(await page.$$eval('#tm-grid .rpg-card', els => els.map(e => e.dataset.a)), ['br', 'id', 'th', 'vn']);
  assert.ok((await text(page, '#tm-grid')).includes('東南アジア') && (await text(page, '#tm-grid')).includes('南アメリカ'));
  for (const a of ['th', 'vn', 'id']) await page.click(card(a));
  assert.deepEqual(await slots(page), ['th', 'vn', 'id']);
  const s3 = await text(page, '#tm-stats');
  assert.ok(s3.includes('東南アジア×3 ＋25%') && s3.includes('⚔️') && s3.includes('❤️'), s3);
  assert.equal(await page.locator('#tm-grid .rpg-card.is-in').count(), 3);
  assert.deepEqual((await readSave(page)).teams[0].c, ['th', 'vn', 'id']);
  // 強さはバトルと同じ計算（K.battleStats）
  const st = await page.evaluate(() => RPG_CORE.battleStats(RPG.get(), 'asia', 1));
  assert.ok(s3.includes(`⚔️ ${st.atk}`) && s3.includes(`❤️ ${st.hp}`), `${s3} / ${st.atk} ${st.hp}`);
  // 一覧で入っている国を押すと外れる
  await page.click(card('th'));
  assert.deepEqual(await slots(page), ['vn', 'id']);
  assert.ok((await text(page, '#tm-stats')).includes('＋10%'));
  // 3枠のカードを押しても外れる
  await page.click('#tm-slots .rpg-pc[data-a="vn"]');
  assert.deepEqual((await readSave(page)).teams[0].c, ['id']);
  assert.equal(await page.locator('#tm-slots .tm-empty').count(), 2);
});

// おまかせのまま一覧を押すと、いまのおまかせ3枚を「自分で組んだ」にしてから外す／入れる
t('auto_slot_becomes_custom', async page => {
  await team(page, saveWith(CARDS));
  assert.ok((await text(page, '#tm-side')).includes('おまかせ中'));
  assert.deepEqual(await slots(page), ['br', 'id', 'th']);
  await page.click(card('th'));
  assert.deepEqual((await readSave(page)).teams[0].c, ['br', 'id']);
  assert.equal((await text(page, '#tm-side')).includes('おまかせ中'), false);
  await page.click(card('vn'));
  assert.deepEqual((await readSave(page)).teams[0].c, ['br', 'id', 'vn']);
});

t('full_slots_toast', async page => {
  await team(page, saveWith({ ...CARDS, teams: [{ n: '編成1', c: ['th', 'vn', 'id'] }] }));
  await page.click(card('br'));
  assert.ok((await toastTexts(page)).includes('入れ替えたいカードを先に外してね'), String(await toastTexts(page)));
  assert.deepEqual((await readSave(page)).teams[0].c, ['th', 'vn', 'id']);
});

t('auto_fill_and_reset', async page => {
  await team(page, saveWith({ ...CARDS, teams: [{ n: '編成1', c: ['vn'] }] }));
  await page.selectOption('#tm-dg', 'samerica');
  await page.selectOption('#tm-dg', 'asia');
  await page.click('#tm-auto');
  const want = await page.evaluate(() => RPG_CORE.party(RPG.get(), 'asia').map(p => p.a));
  assert.deepEqual((await readSave(page)).teams[0].c, want);
  assert.deepEqual(await slots(page), want);
  await page.click('#tm-reset');
  assert.equal((await readSave(page)).teams[0].c, null);
  assert.ok((await text(page, '#tm-side')).includes('おまかせ中'));
  assert.equal(await page.isDisabled('#tm-reset'), true);
});

t('buy_slot', async page => {
  await team(page, saveWith(CARDS));
  const tabs = page.locator('#tm-tabs button');
  assert.equal(await tabs.count(), 5);
  assert.equal(await page.locator('#tm-tabs button[data-buy]').count(), 4);
  assert.ok((await tabs.nth(1).innerText()).includes('2,000'));
  assert.equal(await tabs.nth(2).isDisabled(), true);   // 次に買える1つ以外は押せない
  let msg = '';
  page.once('dialog', d => { msg = d.message(); d.accept(); });
  await tabs.nth(1).click();
  assert.equal(msg, '●2,000 で編成の枠を1つ増やす？');
  const d = await readSave(page);
  assert.deepEqual([d.coins, d.teams.length, d.tsel, d.teams[1].n, d.teams[1].c], [3000, 2, 1, '編成2', null]);
  assert.deepEqual((await events(page, 'rpg:coins')).map(e => [e.delta, e.reason]), [[-2000, 'slot']]);
  // 買った枠が選ばれている。次のタブ（●3,000）が押せる
  assert.equal(await tabs.nth(1).getAttribute('aria-pressed'), 'true');
  assert.equal(await tabs.nth(1).innerText(), '編成2');
  assert.ok((await tabs.nth(2).innerText()).includes('3,000'));
  assert.equal(await tabs.nth(2).isDisabled(), false);
  // ことわると何も変わらない
  page.once('dialog', d => d.dismiss());
  await tabs.nth(2).click();
  assert.equal((await readSave(page)).teams.length, 2);
  // 1つ目のタブを押すと tsel が戻る
  await tabs.nth(0).click();
  assert.equal((await readSave(page)).tsel, 0);
});

t('buy_slot_disabled_when_short', async page => {
  await team(page, saveWith({ ...CARDS, coins: 1999 }));
  const tab = page.locator('#tm-tabs button').nth(1);
  assert.equal(await tab.isDisabled(), true);
  assert.ok((await tab.innerText()).includes('あと1'), await tab.innerText());
  assert.ok((await tab.innerHTML()).includes('class="coin"'));
  await tab.click({ force: true });
  await page.evaluate(() => $('tm-tabs').children[1].click());
  assert.equal((await readSave(page)).teams.length, 1);
});

t('rename_slot', async page => {
  await team(page, saveWith(CARDS));
  assert.equal(await page.isVisible('#tm-name'), false);
  await page.click('#tm-rename');
  assert.equal(await page.isVisible('#tm-name'), true);
  await page.fill('#tm-name', '  アジア組  ');
  await page.press('#tm-name', 'Enter');
  assert.equal((await readSave(page)).teams[0].n, 'アジア組');
  assert.equal(await page.isVisible('#tm-name'), false);
  assert.equal(await page.locator('#tm-tabs button').first().innerText(), 'アジア組');
  // Esc は取り消し
  await page.click('#tm-rename');
  await page.fill('#tm-name', 'ちがう名前');
  await page.press('#tm-name', 'Escape');
  assert.equal((await readSave(page)).teams[0].n, 'アジア組');
  // 欄の外で確定。文字は esc して出す。8文字まで
  await page.click('#tm-rename');
  await page.fill('#tm-name', '<b>x</b>');
  await page.click('#tm-stats');
  assert.equal((await readSave(page)).teams[0].n, '<b>x</b>');
  assert.equal(await page.locator('#tm-tabs button').first().innerText(), '<b>x</b>');
  assert.equal(await page.locator('#scr-team b:text-is("x")').count(), 0);
  await page.click('#tm-rename');
  await page.evaluate(() => { $('tm-name').maxLength = 99; });
  await page.fill('#tm-name', 'あいうえおかきくけこ');
  await page.press('#tm-name', 'Enter');
  assert.equal((await readSave(page)).teams[0].n, 'あいうえおかきく');
  // 空なら「編成N」
  await page.click('#tm-rename');
  await page.fill('#tm-name', '   ');
  await page.press('#tm-name', 'Enter');
  assert.equal((await readSave(page)).teams[0].n, '編成1');
});

t('readonly_no_write', async page => {
  await writeSave(page, { ...saveWith(CARDS), v: 99 });
  const before = await raw(page);
  await page.evaluate(() => RPG.open('team'));
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'team');
  assert.ok((await text(page, '#tm-warn')).includes('新しいバージョン'));
  for (const sel of ['#tm-auto', '#tm-rename', '#tm-tabs button:nth-child(2)']) assert.equal(await page.isDisabled(sel), true, sel);
  page.on('dialog', d => d.accept());
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('#tm-grid .rpg-card, #tm-slots .rpg-pc, #tm-tabs button, #tm-auto, #tm-reset, #tm-rename')) {
      el.disabled = false;
      el.click();
    }
  });
  assert.equal(await raw(page), before);
});

t('back_to_battle', async page => {
  await writeSave(page, saveWith(CARDS));
  await page.evaluate(() => RPG.openTeam({ id: 'samerica', floor: 1 }));
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'team');
  assert.equal(await page.$eval('#tm-dg', s => s.value), 'samerica');
  assert.equal(await text(page, '#tm-back'), '← バトルにもどる');
  await page.click('#tm-back');
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'battle');
  assert.equal(await page.isVisible('#bt-intro'), true);
  // 次に開いたときは冒険へ戻る
  await page.evaluate(() => RPG.open('team'));
  assert.equal(await text(page, '#tm-back'), '← 冒険');
});

// バトルの登場画面から来たときの強さは、そのフロア（back.floor）のもの。がんばりゲージはフロアごとなので次のフロアとは違う
t('stats_use_back_floor', async page => {
  await writeSave(page, saveWith({ ...CARDS, floors: { samerica: 2 }, gauge: { 'samerica:1': 3 } }));
  const want = await page.evaluate(() => {
    const d = RPG.get(), K = RPG_CORE;
    return { f1: K.battleStats(d, 'samerica', 1, d.tsel).atk, f3: K.battleStats(d, 'samerica', 3, d.tsel).atk };
  });
  assert.notEqual(want.f1, want.f3);
  const atk = async () => +(await text(page, '#tm-stats')).match(/⚔️ ([\d,]+)/)[1].replace(/,/g, '');
  await page.evaluate(() => RPG.openTeam({ id: 'samerica', floor: 1 }));
  assert.equal(await atk(), want.f1);
  // 冒険から開いたら次に挑むフロア（F3）
  await page.evaluate(() => RPG.open('team'));
  await page.$eval('#tm-dg', s => { s.value = 'samerica'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await atk(), want.f3);
});

t('no_cards_hint', async page => {
  await team(page, saveWith({ coins: 0 }));
  const s = await text(page, '#scr-team');
  assert.ok(s.includes('仲間がいると強くなるよ（国旗ガチャ・5回正解）'), s);
  await page.click('#tm-gacha');
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'gacha');
});

t('region_chips', async page => {
  await team(page, saveWith(CARDS));
  await page.click('#tm-regions .chip[data-r="南アメリカ"]');
  assert.deepEqual(await page.$$eval('#tm-grid .rpg-card', els => els.map(e => e.dataset.a)), ['br']);
  await page.click('#tm-regions .chip[data-r="all"]');
  assert.equal(await page.locator('#tm-grid .rpg-card').count(), 4);
});

// PC は2列（左に枠と強さ、右に一覧）
t('pc_two_columns', async page => {
  await team(page, saveWith(CARDS));
  const r = await page.evaluate(() => [$('tm-side'), $('tm-main')].map(e => e.getBoundingClientRect()).map(b => ({ x: b.x, y: b.y, w: b.width })));
  assert.ok(r[0].x + r[0].w <= r[1].x, JSON.stringify(r));
  assert.equal(await page.evaluate(() => getComputedStyle($('tm-side')).position), 'sticky');
}, { viewport: { width: 1280, height: 800 } });

// スマホで横にはみ出さない
t('phone_no_overflow', async page => {
  await team(page, saveWith({ ...CARDS, teams: [{ n: 'あいうえおかきく', c: null }, { n: '編成2', c: [] }] }));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}, { viewport: { width: 360, height: 640 } });

// ---- 冒険ホームの旅人カードのかざり（#rpg-deco と #rpg-deco-dlg） ----
const DECO = { coins: 0, cards: { jp: [1, 0], br: [2, 0], cl: [1, 0], fr: [3, 0] } };
const dcard = a => `#rpg-deco-dlg .rpg-card[data-a="${a}"]`;
const decoIn = page => page.$$eval('#rpg-deco-dlg .rpg-card.is-in', els => els.map(e => e.dataset.a).sort());
const home = async (page, save) => {
  await writeSave(page, save);
  await page.evaluate(() => show('rpg'));
};

t('deco_toggle_and_show', async page => {
  await home(page, saveWith(DECO));
  assert.equal(await page.locator('#rpg-deco img').count(), 0);
  assert.equal(await page.locator('#rpg-deco .rpg-deco-empty').count(), 3);
  await page.click('#rpg-deco');
  assert.equal(await page.isVisible('#rpg-deco-dlg'), true);
  assert.equal(await page.locator('#rpg-deco-dlg .rpg-card[data-a]').count(), 4);
  for (const a of ['jp', 'br', 'cl', 'fr']) await page.click(dcard(a));
  assert.deepEqual(await decoIn(page), ['br', 'cl', 'jp']);   // 3つ埋まっていたら4つ目は入らない
  // もう一度押すと外れる → また入れられる
  await page.click(dcard('br'));
  assert.deepEqual(await decoIn(page), ['cl', 'jp']);
  await page.click(dcard('br'));
  assert.deepEqual(await decoIn(page), ['br', 'cl', 'jp']);
  assert.deepEqual((await readSave(page)).deco, []);   // 決定までは保存しない
  await page.click('#rpg-deco-ok');
  assert.equal(await page.isVisible('#rpg-deco-dlg'), false);
  assert.deepEqual((await readSave(page)).deco, ['jp', 'cl', 'br']);
  await page.waitForFunction(() => document.querySelectorAll('#rpg-deco img').length === 3);
  assert.deepEqual(await page.$$eval('#rpg-deco img', els => els.map(e => e.alt)), ['日本', 'チリ', 'ブラジル']);
  // 国旗は 4:3（24×18）のまま（object-fit で切らない）
  for (const m of await page.$$eval('#rpg-deco img', els => els.map(e => ({ w: e.clientWidth, h: e.clientHeight, fit: getComputedStyle(e).objectFit }))))
    assert.deepEqual(m, { w: 24, h: 18, fit: 'contain' });
  assert.equal(await page.locator('#rpg-deco .rpg-deco-empty').count(), 0);
  assert.deepEqual((await events(page, 'rpg:deco')).map(e => e.deco), [['jp', 'cl', 'br']]);
});

t('deco_pick_and_show', async page => {
  await home(page, saveWith(DECO));
  await page.click('#rpg-deco');
  for (const a of ['jp', 'br', 'cl', 'fr']) await page.click(dcard(a));
  await page.click('#rpg-deco-ok');
  assert.deepEqual((await readSave(page)).deco, ['jp', 'br', 'cl']);
  assert.deepEqual((await events(page, 'rpg:deco')).map(e => e.deco), [['jp', 'br', 'cl']]);
  await page.waitForFunction(() => document.querySelectorAll('#rpg-deco img').length === 3);
  // 開き直すと、いまのかざりが選ばれている
  await page.click('#rpg-deco');
  assert.deepEqual(await decoIn(page), ['br', 'cl', 'jp']);
});

t('deco_cancel_keeps', async page => {
  await home(page, saveWith({ ...DECO, deco: ['jp'] }));
  assert.equal(await page.locator('#rpg-deco img').count(), 1);
  assert.equal(await page.locator('#rpg-deco .rpg-deco-empty').count(), 2);
  await page.click('#rpg-deco');
  await page.click(dcard('br'));
  await page.click(dcard('jp'));
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#rpg-deco-dlg'), false);
  assert.deepEqual((await readSave(page)).deco, ['jp']);
  // 閉じるでも保存しない
  await page.click('#rpg-deco');
  assert.deepEqual(await decoIn(page), ['jp']);
  await page.click(dcard('fr'));
  await page.click('#rpg-deco-dlg .close');
  assert.equal(await page.isVisible('#rpg-deco-dlg'), false);
  assert.deepEqual((await readSave(page)).deco, ['jp']);
  assert.deepEqual(await events(page, 'rpg:deco'), []);
});

t('deco_hidden_without_cards', async page => {
  await home(page, saveWith({ coins: 0, deco: ['jp'] }));
  assert.equal(await page.isVisible('#rpg-hero'), true);
  assert.equal(await page.locator('#rpg-deco').count(), 0);
});

t('deco_skips_unowned', async page => {
  await home(page, saveWith({ coins: 0, cards: { br: [1, 0] }, deco: ['jp', 'zz'] }));
  assert.equal(await page.locator('#rpg-deco img').count(), 0);
  assert.equal(await page.locator('#rpg-deco .rpg-deco-empty').count(), 3);
  // 持っていない国は選ぶ画面でも入っていない。決定で外れる
  await page.click('#rpg-deco');
  assert.deepEqual(await decoIn(page), []);
  await page.click(dcard('br'));
  await page.click('#rpg-deco-ok');
  assert.deepEqual((await readSave(page)).deco, ['br']);
});

t('deco_readonly_no_write', async page => {
  await writeSave(page, { ...saveWith({ ...DECO, deco: ['jp'] }), v: 99 });
  const before = await raw(page);
  await page.evaluate(() => show('rpg'));
  await page.click('#rpg-deco');
  await page.click(dcard('br'));
  await page.evaluate(() => { $('rpg-deco-ok').disabled = false; $('rpg-deco-ok').click(); });
  assert.equal(await raw(page), before);
  assert.deepEqual(await events(page, 'rpg:deco'), []);
});

// rpg-cards.js が無いときは、かざりの欄を出さない
t('deco_needs_cards_js', async page => {
  await home(page, saveWith(DECO));
  assert.equal(await page.isVisible('#rpg-hero'), true);
  assert.equal(await page.locator('#rpg-deco').count(), 0);
}, { blockScripts: ['badges.js', 'rpg-cards.js'] });

// スマホで横にはみ出さない
t('deco_phone_no_overflow', async page => {
  await writeSave(page, saveWith({ ...DECO, deco: ['jp', 'br', 'fr'] }));
  await page.evaluate(() => store.set('nickname', 'あいうえおかきくけこさしすせそ'));
  await page.evaluate(() => show('rpg'));
  assert.equal(await page.locator('#rpg-deco img').count(), 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}, { viewport: { width: 360, height: 640 } });
