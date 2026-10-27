// 国旗ガチャ（#scr-gacha: 地域のチップ・ボタン・提供割合・天井・無料1回・結果のカード）と仲間の一覧（#scr-cards）、
// RPG.cardHTML / RPG.openCard、覚えて仲間になった国が結果のパネルと仲間の画面に出ること
// どのテストも badges.js を止めて、種1で開く（openRpg）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, events, pickSetup, answerCorrect, clearByAnswering } from './helpers.mjs';
import { openRpg, readSave, writeSave, saveWith, localToday, forceNext, flipAll } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで（種1で）開いて fn を実行する。最後にページの例外と、[rpg] で始まる console.error が無いことを見る
const t = (name, fn, { rpgErrorOk = false, ...opts } = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openRpg(browser, { seed: 1, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    if (!rpgErrorOk) assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});

const ALL_CLEAR = { samerica: 5, oceania: 5, namerica: 5, europe: 5, asia: 5, africa: 5, world: 5 };
const NOTE = '※コインはクイズで集めるゲームの中のコインだけ。お金はかからないし、買うこともできないよ。';
const LABELS = ['NEW', 'ランクアップ', 'かさね+1'];
const text = (page, sel) => page.locator(sel).innerText();
// save があれば入れて読み込み直してから、RPG.open('gacha', opts) で開く
const gacha = async (page, save, opts = {}) => {
  if (save) await writeSave(page, save);
  await page.evaluate(o => RPG.open('gacha', o), opts);
};
// 押されている地域のチップ（ちょうど1つ）
const pressedRegion = async page => {
  const rs = await page.$$eval('#ga-regions .chip[aria-pressed="true"]', bs => bs.map(b => b.dataset.r));
  assert.equal(rs.length, 1, JSON.stringify(rs));
  return rs[0];
};
const labels = page => page.$$eval('#ga-res .rpg-lab', els => els.map(e => e.textContent.trim()));
const pick = (o, want) => Object.fromEntries(Object.keys(want).map(k => [k, o[k]]));
const evs = async (page, type, want) => (await events(page, type)).map(e => pick(e, want));
const southAmerica = page => page.evaluate(() => C.filter(c => c.r === '南アメリカ').map(c => c.a));

t('rates_always_visible', async page => {
  await writeSave(page, saveWith({ coins: 150 }));
  await page.evaluate(() => RPG.open('gacha', { region: '南アメリカ' }));
  assert.equal(await page.isVisible('#scr-gacha'), true);
  assert.equal(await pressedRegion(page), '南アメリカ');
  const want = ['出る確率', '★3 ゴールド 3% / ★2 シルバー 17%', '★1 ブロンズ 80%', '10回引くと10枚目は★2以上（★3 3% / ★2 97%）',
    '★3が出ないまま50回目 → ★3確定', '国は選んだ地域から同じ確率（南アメリカなら 各 1/12 = 8.3%）', '天井込みの★3の目安: 約3.8%'];
  const check = async () => {
    assert.equal(await page.isVisible('#ga-rates'), true);
    const s = await text(page, '#ga-rates');
    for (const x of want) assert.ok(s.includes(x), `${x} が無い: ${s}`);
    const r = await page.evaluate(() => {
      const box = id => $(id).getBoundingClientRect();
      return { ten: box('ga-10').bottom, rates: box('ga-rates').top, res: box('ga-res'), details: !!$('ga-rates').closest('details') };
    });
    assert.ok(r.rates >= r.ten, JSON.stringify(r));
    // ボタンと提供割合のあいだに結果が入らない
    assert.ok(!(r.res.height > 0 && r.res.bottom > r.ten && r.res.top < r.rates), JSON.stringify(r));
    assert.equal(r.details, false);
    assert.equal(await text(page, '#ga-note'), NOTE);
    const all = await text(page, '#scr-gacha');
    for (const ng of ['当たり', '爆死']) assert.ok(!all.includes(ng), `${ng} がある`);
  };
  await check();
  // 引いたあとも同じ場所に出ている。全世界にすると数が変わる
  await page.click('#ga-1');
  assert.equal(await page.locator('#ga-res .rpg-card').count(), 1);
  await check();
  await page.click('#ga-regions .chip[data-r="all"]');
  assert.ok((await text(page, '#ga-rates')).includes('国は選んだ地域から同じ確率（全世界なら 各 1/195 = 0.5%）'));
});

t('default_region', async page => {
  // ふつうは全世界（地域をしぼると高くなるので、次のダンジョンの地域や前回の地域は選んでおかない）
  await gacha(page, saveWith({ pulls: 1, cards: { br: [1, 0], jp: [2, 1] } }));
  assert.equal(await pressedRegion(page), 'all');
  assert.equal(await text(page, '#ga-regions .chip[data-r="all"]'), '全世界 2/195');
  assert.equal(await text(page, '#ga-regions .chip[data-r="南アメリカ"]'), '南アメリカ 1/12');
  assert.equal(await text(page, '#ga-regions .chip[data-r="アジア"]'), 'アジア 1/46');
  assert.equal(await page.locator('#ga-regions .chip').count(), 7);
  assert.equal(await text(page, '#ga-hint'), '地域をしぼると値段が ×1.5。そのかわり、その地域のダンジョンでは仲間が ×1.5 で強い');
  await gacha(page, saveWith({ pulls: 1, floors: { samerica: 5 } }));
  assert.equal(await pressedRegion(page), 'all');
  await gacha(page, saveWith({ pulls: 1, floors: ALL_CLEAR, gr: 'アジア' }));
  assert.equal(await pressedRegion(page), 'all');
  // RPG.open で渡した地域がいちばん先
  await gacha(page, saveWith({ pulls: 1 }), { region: 'アジア' });
  assert.equal(await pressedRegion(page), 'アジア');
  // 知らない地域は無視する
  await gacha(page, null, { region: 'どこか' });
  assert.equal(await pressedRegion(page), 'all');
});

t('region_price_x1_5', async page => {
  // 全世界は 1回 ●100・10回 ●1,000、地域をしぼると 1.5倍（●150・●1,500）。足りなければ押せない
  await gacha(page, saveWith({ coins: 1200 }));
  assert.equal(await text(page, '#ga-1'), '1回 100');   // ● はコインの絵（文字なし）
  assert.equal(await text(page, '#ga-10'), '10回 1,000');
  assert.equal(await page.isEnabled('#ga-10'), true);
  await page.click('#ga-regions .chip[data-r="アジア"]');
  assert.equal(await text(page, '#ga-1'), '1回 150');
  assert.equal(await text(page, '#ga-10'), '10回 1,500');
  assert.equal(await page.isEnabled('#ga-10'), false);
  assert.equal(await text(page, '#ga-need'), 'あと300');
  // 地域で1回引くと 150 減る。出るのはその地域の国だけ
  await page.click('#ga-1');
  const s = await readSave(page);
  assert.equal(s.coins, 1050);
  const [p] = await events(page, 'rpg:pull');
  assert.equal(p.region, 'アジア');
  assert.equal(await page.evaluate(a => byA.get(a).r, p.results[0].a), 'アジア');
  assert.deepEqual(await evs(page, 'rpg:coins', { delta: 0, reason: 0 }), [{ delta: -150, reason: 'gacha' }]);
  // サムネイルはしぼると「地域しぼり ×1.5」が付く
  assert.ok((await text(page, '#ga-pack')).includes('地域しぼり ×1.5'));
  await page.click('#ga-regions .chip[data-r="all"]');
  assert.ok(!(await text(page, '#ga-pack')).includes('地域しぼり'));
});

t('pack_thumbnail', async page => {
  // ボタンの上に、選んだ地域の国旗パック（国旗3枚・地域名・まだ会っていない国の数・★3の確率）
  await gacha(page, saveWith({ coins: 0, cards: { br: [1, 0] } }));
  const r = await page.evaluate(() => {
    const box = id => $(id).getBoundingClientRect();
    return { pack: box('ga-pack'), btn: box('ga-1'), flags: document.querySelectorAll('#ga-pack .rpg-pack-f').length, label: $('ga-pack').firstElementChild.getAttribute('aria-label') };
  });
  assert.ok(r.pack.bottom <= r.btn.top && r.pack.height > 100, JSON.stringify(r));
  assert.equal(r.flags, 3);
  assert.equal(r.label, '全世界の国旗パック');
  const s = await text(page, '#ga-pack');
  assert.ok(s.includes('全世界') && s.includes('まだ会っていない国 194/195') && s.includes('★3 3%'), s);
  // 国旗はまだ仲間でない国から
  await page.click('#ga-regions .chip[data-r="南アメリカ"]');
  const as = await page.$$eval('#ga-pack .rpg-pack-f', es => es.map(e => [...byA.values()].find(c => flag(c.a) === e.getAttribute('src')).a));
  assert.equal(as.length, 3);
  for (const a of as) assert.notEqual(a, 'br');
  assert.ok((await text(page, '#ga-pack')).includes('まだ会っていない国 11/12'));
});

t('pull_stage', async page => {
  // 引くとパックの演出が出る（いちばんいい★の色。★3 は is-promo）。押すと1枚目のカードへ、［スキップ］で全部とばす
  await gacha(page, saveWith({ coins: 1200 }));
  await page.click('#ga-10');
  assert.equal(await page.isVisible('#ga-stage'), true);
  const [p] = await events(page, 'rpg:pull');
  const best = Math.max(...p.results.map(r => r.star));
  const cls = await page.getAttribute('#ga-stage', 'class');
  assert.ok(cls.includes(`is-s${best}`) && cls.includes('is-promo') === (best === 3), cls);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ga-skip');
  // 演出のあいだはまだ全部裏向き
  assert.equal(await page.locator('#ga-res .rpg-card.is-back').count(), 10);
  await page.click('#ga-stage', { position: { x: 20, y: 20 } });
  assert.equal(await page.isVisible('#ga-stage .rpg-gst-card'), true);
  assert.equal(await page.innerText('#ga-stage .rpg-gst-count'), '1 / 10');
  await page.click('#ga-skip');
  assert.equal(await page.isVisible('#ga-stage'), false);
  // 一覧は全部表で、フォーカスは最初のカード。［ぜんぶめくる］は出ない
  assert.equal(await page.locator('#ga-res .rpg-card.is-back').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#ga-res .rpg-card')), true);
  assert.equal(await page.isVisible('#ga-flipall'), false);
  // Esc でも全部とばす。何もしなければ、パック → カード → 終わり まで自分で進む
  await page.click('#ga-1');
  assert.equal(await page.isVisible('#ga-stage'), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#ga-stage'), false);
  assert.equal(await page.locator('#ga-res .rpg-card.is-back').count(), 0);
  await page.click('#ga-1');
  await page.waitForSelector('#ga-stage .rpg-gst-card .rpg-card:not(.is-back)', { timeout: 4000 });
  assert.equal(await page.innerText('#ga-stage .rpg-gst-count'), '');   // 1回なら何枚目かは出さない
  await page.waitForFunction(() => $('ga-stage').hidden, null, { timeout: 5000 });
  assert.equal(await page.locator('#ga-res .rpg-card.is-back').count(), 0);
}, { seed: 1 });

t('pull_stage_reduced_motion', async page => {
  // reduced motion（PC の「アニメーション効果」オフなど）でも演出は出す。パックは動かさず（落ちる・揺れるなし）、ふわっと出て光るだけ
  await gacha(page, saveWith({ coins: 100 }));
  await page.click('#ga-1');
  assert.equal(await page.isVisible('#ga-stage'), true);
  const names = await page.$eval('#ga-stage .rpg-pack.is-big', el => getComputedStyle(el).animationName);
  assert.ok(names.includes('rpg-st-fade') && !names.includes('rpg-st-pack'), names);
  assert.equal(await page.locator('#ga-res .rpg-card.is-back').count(), 1);
  await page.waitForFunction(() => $('ga-stage').hidden, null, { timeout: 4000 });
  await page.waitForFunction(() => !document.querySelector('#ga-res .rpg-card.is-back'));
}, { reducedMotion: 'reduce' });

t('intro_ten_pull_cards', async page => {
  await page.click('#home-rpg');
  await page.click('#rpg-go');
  assert.ok((await text(page, '#rpg-next')).includes('まずは国旗ガチャ10連で'));
  await page.click('#rpg-next');
  assert.equal(await page.isVisible('#scr-gacha'), true);
  assert.equal(await pressedRegion(page), 'all');   // 旅立ちの●1,000で引ける全世界
  await page.click('#ga-10');
  const backs = await page.locator('#ga-res .rpg-card.is-back').count();   // めくる前は裏向き
  assert.ok(backs > 0, String(backs));
  const s = await readSave(page);
  assert.equal(s.coins, 0);
  assert.equal(s.pulls, 10);
  assert.equal(s.gr, 'all');
  assert.equal(await page.locator('#ga-res .rpg-card').count(), 10);
  const pulls = await events(page, 'rpg:pull');
  assert.equal(pulls.length, 1);
  const p = pulls[0];
  assert.deepEqual(pick(p, { region: 0, count: 0, free: 0, pity: 0, pulls: 0 }), { region: 'all', count: 10, free: false, pity: s.pity, pulls: 10 });
  assert.ok(p.results[9].star >= 2, JSON.stringify(p.results));
  assert.ok(+(await page.getAttribute('#ga-res .rpg-card:nth-child(10)', 'data-star')) >= 2);
  assert.deepEqual(await page.$$eval('#ga-res .rpg-card', bs => bs.map(b => b.dataset.a)), p.results.map(r => r.a));
  // ★3 は裏のうちから金色
  assert.equal(await page.locator('#ga-res .rpg-card.is-gold').count(), p.results.filter(r => r.star === 3).length);
  const ls = await labels(page);
  assert.equal(ls.length, 10);
  for (const l of ls) assert.ok(LABELS.includes(l), l);
  // イベント: 引いた → 仲間になった（owned は1つずつ増える）・ランクアップ → 使ったコイン
  const news = p.results.filter(r => r.out === 'new').map(r => r.a);
  assert.deepEqual(await evs(page, 'rpg:join', { a: 0, via: 0, owned: 0 }), news.map((a, i) => ({ a, via: 'gacha', owned: i + 1 })));
  assert.deepEqual(await evs(page, 'rpg:promote', { a: 0, star: 0, via: 0 }),
    p.results.filter(r => r.out === 'up').map(r => ({ a: r.a, star: r.star, via: 'gacha' })));
  assert.deepEqual(await evs(page, 'rpg:coins', { delta: 0, reason: 0 }), [{ delta: 1000, reason: 'start' }, { delta: -1000, reason: 'gacha' }]);
  const order = await page.evaluate(() => window.__ev.filter(e => /^rpg:(pull|join|promote|coins)$/.test(e.type)).map(e => e.type).slice(1));
  assert.equal(order[0], 'rpg:pull');
  assert.equal(order[order.length - 1], 'rpg:coins');
  await flipAll(page);
  assert.equal(await page.locator('#ga-res .rpg-card.is-back').count(), 0);
  await page.evaluate(() => RPG.open('cards'));
  assert.equal(await text(page, '#cd-count'), `仲間 ${Object.keys(s.cards).length} / 195`);
});

t('reveal_one_by_one', async page => {
  // パックのあと、カードが1枚ずつ（裏 → turnMs でめくれる）。押すと、めくる前ならめくり、めくってあれば次へ。下に出たカードの国旗が並ぶ
  await gacha(page, saveWith({ coins: 1000 }));
  await page.click('#ga-10');
  const [p] = await events(page, 'rpg:pull');
  const tap = () => page.click('#ga-stage', { position: { x: 20, y: 20 } });
  await tap();   // パック → 1枚目
  for (let i = 0; i < 10; i++) {
    assert.equal(await page.innerText('#ga-stage .rpg-gst-count'), `${i + 1} / 10`);
    assert.equal(await page.locator('#ga-stage .rpg-gst-got li').count(), i);
    assert.equal(await page.getAttribute('#ga-stage .rpg-gst-card .rpg-card', 'data-a'), p.results[i].a);
    if (await page.locator('#ga-stage .rpg-gst-card .rpg-card.is-back').count()) await tap();   // めくる
    assert.equal(await page.locator('#ga-stage .rpg-gst-card .rpg-card.is-back').count(), 0);
    assert.match(await page.innerText('#ga-stage .rpg-gst-say'), /★/);
    await tap();   // 次へ（最後なら終わり）
  }
  assert.equal(await page.isVisible('#ga-stage'), false);
  assert.equal(await page.locator('#ga-res .rpg-card.is-back').count(), 0);
  // 終わったらボタンがまた押せる（1,000 は使ったので 1回も押せない）。［ぜんぶめくる］は隠れる
  assert.equal(await page.isDisabled('#ga-1'), true);
  assert.equal(await page.isVisible('#ga-flipall'), false);
});

// ［ぜんぶめくる］で飛ばせる: 押したその場で全部表になり、［ぜんぶめくる］が隠れて、引くボタンがまた押せる。
// 引く → 押す を1つの evaluate で（めくる interval が割りこまないので、interval が全部めくったのと区別できる）
t('flipall_skips', async page => {
  await gacha(page, saveWith({ coins: 1100 }));   // 10回のあとも 100 残るので 1回が押せるようになる
  const r = await page.evaluate(() => {
    $('ga-10').click();
    const back = () => document.querySelectorAll('#ga-res .rpg-card.is-back').length;
    const before = { back: back(), shown: !$('ga-flipall').hidden, one: $('ga-1').disabled };
    $('ga-flipall').click();
    return { before, after: { back: back(), shown: !$('ga-flipall').hidden, one: $('ga-1').disabled } };
  });
  assert.deepEqual(r, { before: { back: 10, shown: true, one: true }, after: { back: 0, shown: false, one: false } });
  assert.equal(await page.isVisible('#ga-flipall'), false);
  assert.equal(await page.isEnabled('#ga-1'), true);
});

// 裏向きのカードを押すとめくれるだけ（詳細は表になってから）。最後の1枚を押してめくったら、その場で［ぜんぶめくる］が隠れてボタンが戻る
t('back_card_tap_flips_only', async page => {
  await gacha(page, saveWith({ coins: 1000 }));
  // 引く → 10枚目（まだ裏）を押す、を1つの evaluate で（めくる interval が割りこまない）
  const r = await page.evaluate(() => {
    $('ga-10').click();
    const b = document.querySelector('#ga-res .rpg-card:nth-child(10)'), back = b.classList.contains('is-back');
    b.click();
    return { back, nowBack: b.classList.contains('is-back'), open: $('detail').open, flipall: $('ga-flipall').hidden };
  });
  assert.deepEqual(r, { back: true, nowBack: false, open: false, flipall: false });
  await page.keyboard.press('Escape');   // 演出をとばす
  await page.waitForFunction(() => !document.querySelector('#ga-res .rpg-card.is-back'));
  assert.equal(await page.isVisible('#ga-flipall'), false);
  await page.click('#ga-res .rpg-card:nth-child(10)');   // 表になったら詳細
  assert.equal(await page.isVisible('#detail[open]'), true);
  await page.click('#detail .close');
  await gacha(page, saveWith({ coins: 100 }));
  const r2 = await page.evaluate(() => {
    $('ga-1').click();
    const b = document.querySelector('#ga-res .rpg-card');
    b.click();
    return { nowBack: b.classList.contains('is-back'), open: $('detail').open, flipall: $('ga-flipall').hidden, one: $('ga-1').disabled };
  });
  assert.deepEqual(r2, { nowBack: false, open: false, flipall: true, one: true });   // コインは 0 になったので 1回は押せない
});

// 保存に失敗したときと、ほかのタブでコインを使っていたときは、黙らずに1行（#ga-msg、role=status）で知らせる
t('gacha_failure_message', async page => {
  await gacha(page, saveWith({ coins: 100 }));
  assert.equal(await page.getAttribute('#ga-msg', 'role'), 'status');
  assert.equal(await text(page, '#ga-msg'), '');
  // ほかのタブでコインを使った（storage イベントは自分のタブには来ないので、ボタンは押せるまま）
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('rpg')); d.coins = 0; localStorage.setItem('rpg', JSON.stringify(d)); });
  assert.equal(await page.isEnabled('#ga-1'), true);
  await page.click('#ga-1');
  assert.ok((await text(page, '#ga-msg')).includes('コインが足りない'), await text(page, '#ga-msg'));
  assert.equal(await page.locator('#ga-res .rpg-card').count(), 0);
  assert.deepEqual(await events(page, 'rpg:pull'), []);
  assert.equal(await page.isDisabled('#ga-1'), true);   // 描き直した
  // 引けたら消える
  await page.evaluate(() => RPG.debug.give(100));
  await page.waitForFunction(() => !$('ga-1').disabled);
  await page.click('#ga-1');
  assert.equal(await text(page, '#ga-msg'), '');
  assert.equal(await page.locator('#ga-res .rpg-card').count(), 1);
  // 別のタブが新しい版のデータを書いていた: 保存できないので引かない。コインのせいにせず「保存できなかった」（上の警告の行も出る）
  await page.waitForFunction(() => !document.querySelector('#ga-res .rpg-card.is-back'));
  await page.evaluate(() => RPG.debug.give(100));
  await page.waitForFunction(() => !$('ga-1').disabled);
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('rpg')); d.v = 99; localStorage.setItem('rpg', JSON.stringify(d)); });
  await page.click('#ga-1');
  assert.ok((await text(page, '#ga-msg')).includes('保存できなかった'), await text(page, '#ga-msg'));
  assert.equal(await page.isVisible('#ga-warn'), true);
  assert.equal(await page.locator('#ga-res .rpg-card').count(), 1);   // 前の結果のまま
  assert.equal((await events(page, 'rpg:pull')).length, 1);
  assert.equal(await page.isDisabled('#ga-1'), true);
  // 保存に失敗（setItem が例外）: 引かなかったことになり、1行で知らせる
  const q = await openRpg(browser, { seed: 1, init: () => {
    const { setItem } = Storage.prototype;
    Storage.prototype.setItem = function (k, v) { if (k === 'rpg' && window.__fail) throw new DOMException('full', 'QuotaExceededError'); return setItem.call(this, k, v); };
  } });
  try {
    const p = q.page;
    await gacha(p, saveWith({ coins: 100 }));
    await p.evaluate(() => { window.__fail = true; });
    await p.click('#ga-1');
    assert.ok((await text(p, '#ga-msg')).includes('保存できなかった'), await text(p, '#ga-msg'));
    assert.equal(await p.locator('#ga-res .rpg-card').count(), 0);
    assert.deepEqual(await events(p, 'rpg:pull'), []);
    assert.equal((await readSave(p)).coins, 100);
    assert.equal(await p.isEnabled('#ga-1'), true);
    assert.deepEqual(q.errors.map(String), []);
  } finally { await q.close(); }
});

// 引く処理（tx の中）が例外を出したとき（d は null・書けていない・status は ok のまま）も、コインのせいにせず「保存できなかった」。
// 引いていないのでコインはそのまま、ボタンも押せる（例外は [rpg] の console.error に1回）
t('gacha_throw_message', async (page, app) => {
  await gacha(page, saveWith({ coins: 100 }));
  await page.evaluate(() => { RPG_CORE.pull = () => { throw new Error('boom'); }; });
  await page.click('#ga-1');
  assert.ok((await text(page, '#ga-msg')).includes('保存できなかった'), await text(page, '#ga-msg'));
  assert.equal(await page.locator('#ga-res .rpg-card').count(), 0);
  assert.deepEqual(await events(page, 'rpg:pull'), []);
  assert.equal((await readSave(page)).coins, 100);
  assert.equal(await page.isEnabled('#ga-1'), true);
  for (let i = 0; i < 100 && !app.consoleErrors.some(s => s.startsWith('[rpg]')); i++) await new Promise(ok => setTimeout(ok, 20));
  assert.equal(app.consoleErrors.filter(s => s.startsWith('[rpg]')).length, 1, JSON.stringify(app.consoleErrors));
}, { rpgErrorOk: true });

t('saved_before_animation', async page => {
  await gacha(page, saveWith({ coins: 1000 }));
  await page.click('#ga-10');
  await page.reload();
  await page.waitForFunction(() => document.readyState === 'complete');
  const s = await readSave(page);
  assert.equal(s.pulls, 10);
  assert.ok(Object.keys(s.cards).length >= 1);
  assert.equal(s.coins, 0);
});

t('reduced_motion_flip', async page => {
  // reduced motion でも裏向きで並べて順にめくる（カードは回さない）。スキップ → ［ぜんぶめくる］で全部表、すぐ押せる
  await gacha(page, saveWith({ coins: 1100 }));
  await page.click('#ga-10');
  assert.equal(await page.locator('#ga-res .rpg-card').count(), 10);
  assert.equal(await page.locator('#ga-res .rpg-card.is-back').count(), 10);
  assert.equal(await page.$eval('#ga-res .rpg-card-back', el => getComputedStyle(el).transform), 'none');
  await page.click('#ga-stage');
  await page.evaluate(() => $('ga-flipall').click());
  assert.equal(await page.locator('#ga-res .rpg-card.is-back').count(), 0);
  assert.equal(await page.isEnabled('#ga-1'), true);
  assert.equal(await page.isVisible('#ga-flipall'), false);
}, { reducedMotion: 'reduce' });

t('labels', async page => {
  const SA = await southAmerica(page);
  assert.equal(SA.length, 12);
  // かさねがもう4 → おかえし（引いた★の額）
  await gacha(page, saveWith({ coins: 150, cards: Object.fromEntries(SA.map(a => [a, [3, 4]])) }), { region: '南アメリカ' });
  await page.click('#ga-1');
  const [p] = await events(page, 'rpg:pull');
  assert.equal(p.results[0].out, 'refund');
  const refund = await page.evaluate(star => RPG_CORE.TUNING.gacha.refund[star], p.results[0].star);
  const [l] = await labels(page);
  assert.ok(l.startsWith('おかえし') && l.includes(String(refund)), l);
  assert.equal((await readSave(page)).coins, refund);
  assert.deepEqual(await evs(page, 'rpg:coins', { delta: 0, reason: 0 }), [{ delta: -150, reason: 'gacha' }, { delta: refund, reason: 'refund' }]);
  // 全部 ★1 → 10枚目は★2以上なので、最初の★2以上はランクアップ
  await gacha(page, saveWith({ coins: 1500, cards: Object.fromEntries(SA.map(a => [a, [1, 0]])) }), { region: '南アメリカ' });
  await page.click('#ga-10');
  const ls = await labels(page);
  assert.equal(ls.length, 10);
  assert.ok(ls.includes('ランクアップ'), ls.join());
  for (const x of ls) assert.ok(['NEW', 'ランクアップ', 'かさね+1'].includes(x) || x.startsWith('おかえし'), x);
  assert.equal(ls.includes('NEW'), false);
  const promotes = await evs(page, 'rpg:promote', { star: 0, via: 0 });
  assert.equal(promotes.length, ls.filter(x => x === 'ランクアップ').length);
  for (const e of promotes) assert.ok(e.star >= 2 && e.via === 'gacha', JSON.stringify(e));
});

t('not_enough_coins', async page => {
  await gacha(page, saveWith({ coins: 340 }));
  assert.equal(await page.isDisabled('#ga-10'), true);
  assert.equal(await page.isEnabled('#ga-1'), true);
  let need = await text(page, '#ga-need');
  assert.ok(need.includes('あと') && need.includes('660'), need);
  assert.equal(await text(page, '#ga-1'), '1回 100');
  assert.equal(await text(page, '#ga-10'), '10回 1,000');
  await page.click('#ga-1');
  assert.equal((await readSave(page)).coins, 240);
  need = await text(page, '#ga-need');
  assert.ok(need.includes('760'), need);
  // 足りていれば出さない
  await gacha(page, saveWith({ coins: 1000 }));
  assert.equal(await page.isVisible('#ga-need'), false);
  assert.equal(await page.isEnabled('#ga-10'), true);
});

t('free_pull', async page => {
  // まだ今日クリアしていない
  await gacha(page, saveWith({ coins: 0, day: { d: localToday(), n: {}, first: false, free: false } }));
  assert.equal(await page.isDisabled('#ga-free'), true);
  assert.equal(await text(page, '#ga-free'), '今日クイズを1回クリアすると無料1回');
  assert.equal(await page.isDisabled('#ga-1'), true);
  // 引ける
  await gacha(page, saveWith({ coins: 0, pulls: 3, day: { d: localToday(), n: {}, first: true, free: false } }));
  assert.equal(await page.isEnabled('#ga-free'), true);
  assert.equal(await text(page, '#ga-free'), '無料1回');
  await page.click('#ga-free');
  const s = await readSave(page);
  assert.equal(s.coins, 0);
  assert.equal(s.pulls, 4);
  assert.equal(s.day.free, true);
  assert.equal(await text(page, '#ga-free'), 'また明日');
  assert.equal(await page.isDisabled('#ga-free'), true);
  assert.deepEqual(await evs(page, 'rpg:pull', { count: 0, free: 0 }), [{ count: 1, free: true }]);
  assert.deepEqual(await evs(page, 'rpg:coins', { reason: 0 }), []);
  // めくり終わっても「また明日」のまま
  await flipAll(page);
  assert.equal(await page.isDisabled('#ga-free'), true);
  // 昨日の無料は今日は使えない（日付が変わったら day は空になる）
  await gacha(page, saveWith({ coins: 0, day: { d: '2000-01-01', n: {}, first: true, free: false } }));
  assert.equal(await text(page, '#ga-free'), '今日クイズを1回クリアすると無料1回');
});

t('pity_counter', async page => {
  await gacha(page, saveWith({ coins: 100, pity: 27 }));
  assert.equal(await text(page, '#ga-pity'), '★3確定まで あと23回');
  await page.click('#ga-1');
  const [p] = await events(page, 'rpg:pull');
  assert.equal(await text(page, '#ga-pity'), `★3確定まで あと${50 - p.pity}回`);
  // 49回引いて★3が出ていなければ、次は★3
  await gacha(page, saveWith({ coins: 100, pity: 49 }));
  assert.equal(await text(page, '#ga-pity'), '★3確定まで あと1回');
  await page.click('#ga-1');
  const ps = await events(page, 'rpg:pull');
  assert.equal(ps[ps.length - 1].results[0].star, 3);
  assert.equal(await page.locator('#ga-res .rpg-card.is-gold').count(), 1);
  assert.equal(await text(page, '#ga-pity'), '★3確定まで あと50回');
});

t('double_click_one_pull', async page => {
  await gacha(page, saveWith({ coins: 200 }));
  await page.dblclick('#ga-1');
  const s = await readSave(page);
  assert.equal(s.coins, 100);
  assert.equal(s.pulls, 1);
  assert.equal((await events(page, 'rpg:pull')).length, 1);
});

t('card_detail', async page => {
  await gacha(page, saveWith({ coins: 100 }));
  await page.click('#ga-1');
  await page.click('#ga-res .rpg-card');
  assert.equal(await page.isVisible('#detail[open]'), true);
  assert.equal(await page.locator('#detail .facts').count(), 1);
  const s = await text(page, '#detail');
  assert.ok(/こうげき \d+\.\d（地域ボーナス (あり|なし)）・HP \d+\.\d/.test(s), s);
  await page.click('#detail .close');
  assert.equal(await page.isVisible('#detail[open]'), false);
  // id があればそのダンジョンでの値（地域ボーナス ×1.5）。br = ★2・かさね1・なかよし4 → 3 × 1.2 × 1.12 = 4.032
  await writeSave(page, saveWith({ cards: { br: [2, 1] }, fr: { br: 4 } }));
  await page.evaluate(() => RPG.openCard('br'));
  let d = await text(page, '#detail');
  assert.ok(d.includes('こうげき 4.0（地域ボーナス なし）・HP 12.1'), d);
  await page.evaluate(() => $('detail').close());
  await page.evaluate(() => RPG.openCard('br', 'samerica'));
  d = await text(page, '#detail');
  assert.ok(d.includes('こうげき 6.0（地域ボーナス あり）・HP 18.1'), d);
  await page.evaluate(() => $('detail').close());
  await page.evaluate(() => RPG.openCard('br', 'europe'));
  assert.ok((await text(page, '#detail')).includes('こうげき 4.0（地域ボーナス なし）'));
  await page.evaluate(() => $('detail').close());
  // 持っていない国は、強さのかわりにあと何回か
  await page.evaluate(() => RPG.openCard('jp'));
  d = await text(page, '#detail');
  assert.ok(!d.includes('こうげき') && d.includes('あと5回正解で仲間に'), d);
});

t('card_html', async page => {
  await writeSave(page, saveWith({ cards: { cl: [2, 3] }, fr: { cl: 7, br: 2 } }));
  const r = await page.evaluate(() => {
    const d = RPG.get(), box = document.createElement('div');
    box.innerHTML = RPG.cardHTML('cl', d, { face: 'up', label: 'NEW' }) + RPG.cardHTML('br', d, { face: 'up' }) + RPG.cardHTML('cl', d, { face: 'back' });
    const [cl, br, back] = box.children;
    return {
      cl: { a: cl.dataset.a, star: cl.dataset.star, text: cl.textContent, lab: cl.querySelector('.rpg-lab')?.textContent, none: cl.classList.contains('is-none'), back: cl.classList.contains('is-back') },
      br: { star: br.dataset.star, text: br.textContent, none: br.classList.contains('is-none'), lab: br.querySelector('.rpg-lab') },
      back: back.classList.contains('is-back'),
    };
  });
  assert.equal(r.cl.a, 'cl');
  assert.equal(r.cl.star, '2');
  for (const x of ['チリ', '★★', '●●●○', '♥7/10']) assert.ok(r.cl.text.includes(x), `${x}: ${r.cl.text}`);
  assert.equal(r.cl.lab, 'NEW');
  assert.equal(r.cl.none, false);
  assert.equal(r.cl.back, false);
  assert.equal(r.br.star, '0');
  assert.equal(r.br.none, true);
  assert.equal(r.br.lab, null);
  for (const x of ['ブラジル', '♥2/10', 'あと3回正解で仲間に（1回のゲームで1回ぶん）']) assert.ok(r.br.text.includes(x), `${x}: ${r.br.text}`);
  assert.equal(r.back, true);
});

t('cards_list', async page => {
  await writeSave(page, saveWith({ cards: { jp: [3, 0], cl: [1, 2] }, fr: { br: 2, cl: 7, pe: 6 } }));
  await page.evaluate(() => RPG.open('cards'));
  assert.equal(await page.isVisible('#scr-cards'), true);
  assert.equal(await text(page, '#cd-count'), '仲間 2 / 195');
  assert.equal(await page.locator('#cd-grid .rpg-card').count(), 195);
  // 195枚の国旗は見えてから読む（図鑑の一覧と同じ loading="lazy"）
  assert.ok(await page.$$eval('#cd-grid .rpg-card-flag', is => is.length === 195 && is.every(i => i.getAttribute('loading') === 'lazy')), '国旗の <img> に loading="lazy" が無い');
  const as = await page.$$eval('#cd-grid .rpg-card', bs => bs.map(b => b.dataset.a));
  assert.deepEqual(as.slice(0, 2), ['jp', 'cl']);
  // 持っていない国は国名の順
  const names = await page.evaluate(as => { const ns = as.map(a => byA.get(a).n); return [ns, [...ns].sort((x, y) => x.localeCompare(y, 'ja'))]; }, as.slice(2));
  assert.deepEqual(names[0], names[1]);
  const cl = await text(page, '#cd-grid .rpg-card[data-a="cl"]');
  assert.ok(cl.includes('●●○○') && cl.includes('♥7/10'), cl);
  assert.ok((await text(page, '#cd-grid .rpg-card[data-a="br"]')).includes('あと3回正解で仲間に（1回のゲームで1回ぶん）'));
  assert.equal(await page.locator('#cd-grid .rpg-card[data-a="br"].is-none').count(), 1);
  // なかよし度が5以上で持っていない国（ふつうは無い）も出すが、「あと…回」は出さない
  assert.ok(!(await text(page, '#cd-grid .rpg-card[data-a="pe"]')).includes('あと'));
  // 地域で絞りこむ
  assert.equal(await page.locator('#cd-regions .chip').count(), 7);
  assert.equal(await page.getAttribute('#cd-regions .chip[data-r="all"]', 'aria-pressed'), 'true');
  await page.click('#cd-regions .chip[data-r="アジア"]');
  assert.equal(await page.getAttribute('#cd-regions .chip[data-r="アジア"]', 'aria-pressed'), 'true');
  assert.equal(await page.locator('#cd-grid .rpg-card').count(), 46);
  assert.equal(await page.getAttribute('#cd-grid .rpg-card:first-child', 'data-a'), 'jp');
  // 押すと国の情報
  await page.click('#cd-grid .rpg-card[data-a="jp"]');
  assert.equal(await page.isVisible('#detail[open]'), true);
  assert.ok((await text(page, '#detail')).includes('こうげき'));
  await page.click('#detail .close');
  // 戻る
  await page.click('#scr-cards .rpg-back');
  assert.equal(await page.isVisible('#scr-rpg'), true);
});

t('learn_join_in_result', async page => {
  await writeSave(page, saveWith({ fr: { cl: 4 } }));
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await forceNext(page, 'cl');
  await answerCorrect(page);
  await page.click('#next');
  await clearByAnswering(page);
  const res = await text(page, '#rpg-res');
  assert.ok(res.includes('🤝 チリが仲間になった！（5回正解した国は仲間になるよ）'), res);
  assert.deepEqual(await evs(page, 'rpg:join', { a: 0, via: 0, owned: 0 }), [{ a: 'cl', via: 'learn', owned: 1 }]);
  await page.evaluate(() => RPG.open('cards'));
  assert.equal(await text(page, '#cd-count'), '仲間 1 / 195');
  assert.equal(await page.getAttribute('#cd-grid .rpg-card:first-child', 'data-a'), 'cl');
  assert.equal(await page.getAttribute('#cd-grid .rpg-card[data-a="cl"]', 'data-star'), '1');
  assert.ok((await text(page, '#cd-grid .rpg-card[data-a="cl"]')).includes('★'));
});

t('back_and_refresh', async page => {
  await gacha(page, saveWith({ coins: 1000 }));
  await page.click('#ga-10');
  await flipAll(page);
  // 別のタブで書かれても（RPG.refresh）結果は残り、ボタンと地域の数だけ描き直す
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('rpg')); d.coins = 150; localStorage.setItem('rpg', JSON.stringify(d)); RPG.refresh(); });
  assert.equal(await page.locator('#ga-res .rpg-card').count(), 10);
  assert.equal(await page.isEnabled('#ga-1'), true);
  assert.equal(await page.isDisabled('#ga-10'), true);
  // 開き直すと結果は消える
  await page.click('#scr-gacha .rpg-back');
  assert.equal(await page.isVisible('#scr-rpg'), true);
  await page.click('#rpg-to-gacha');
  assert.equal(await page.locator('#ga-res .rpg-card').count(), 0);
  assert.equal(await page.isVisible('#ga-flipall'), false);
});

t('read_only_cannot_pull', async page => {
  // 新しい版のデータ（書けない）: 注意を出し、どのボタンも押せない。セーブはそのまま
  await gacha(page, { v: 99, intro: true, coins: 5000, day: { d: localToday(), n: {}, first: true, free: false } });
  const before = await page.evaluate(() => localStorage.getItem('rpg'));
  assert.equal(await text(page, '#ga-warn'), '新しいバージョンのデータが見つかったよ。ページを再読み込みしてね');
  for (const id of ['#ga-free', '#ga-1', '#ga-10']) assert.equal(await page.isDisabled(id), true, id);
  await page.evaluate(() => { for (const id of ['ga-free', 'ga-1', 'ga-10']) { $(id).disabled = false; $(id).click(); } });
  assert.equal(await page.evaluate(() => localStorage.getItem('rpg')), before);
  assert.equal(await page.locator('#ga-res .rpg-card').count(), 0);
  assert.deepEqual(await events(page, 'rpg:pull'), []);
  // ふつうのセーブでは出さない
  await gacha(page, saveWith({ coins: 100 }));
  assert.equal(await page.isVisible('#ga-warn'), false);
});
