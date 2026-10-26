// 国旗クエストの仕上げ: 仲間の世界地図（#cd-map・冒険ホームの #rpg-map）、シェア（ボス・仲間の数・地域）、
// ドパガキと reduced motion の演出（RPG.fx）、結果のコインのカウントアップ
// どのテストも badges.js を止めて、種1で開く（openRpg）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, events, pickSetup, answerCorrect, settleResult } from './helpers.mjs';
import { openRpg, writeSave, saveWith, startBattle, battleAnswer, battleGuard, winBattle, forceNext } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで（種1で）開いて fn を実行する。最後にページの例外と、[rpg] で始まる console.error が無いことを見る
// （opts.timeout は node:test の timeout。ほかの opts は openRpg にそのまま渡す）
const t = (name, fn, { timeout = 60_000, ...opts } = {}) => test(name, { timeout }, async () => {
  const app = await openRpg(browser, { seed: 1, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});

const SHARE_URL = 'https://chikokunn1011.github.io/country-drill/';
const TAG = '#195か国ドリル';
const WIDE = { width: 1440, height: 900 }, LAPTOP = { width: 1280, height: 720 };
const DOPA = { settings: { region: 'all', dopa: true, sound: false } };
const count = (page, sel) => page.locator(sel).count();
// 共有シートのかわり（渡したものを window.__shared に）と、window.open を数えるかわり（window.__opened に引数）
const SHARE_STUB = () => {
  navigator.share = o => { window.__shared = o; return Promise.resolve(); };
  window.__opened = [];
  window.open = (...a) => { window.__opened.push(a); return null; };
};
const shared = page => page.evaluate(() => window.__shared ?? null);
const shareKinds = async page => (await events(page, 'rpg:share')).map(e => e.kind);
// FX を包んで、呼ばれた名前を window.__fx に積む（FX はインライン script の const なので init では包めない。読み込み直したら包み直す）
const wrapFx = page => page.evaluate(() => {
  window.__fx = [];
  if (FX.__wrapped) return;
  FX.__wrapped = true;
  for (const k of ['sfx', 'confetti', 'flash', 'pop', 'pts', 'buzz']) { const f = FX[k].bind(FX); FX[k] = (...a) => { (window.__fx ||= []).push(k); return f(...a); }; }
});
const fxCalls = page => page.evaluate(() => window.__fx ?? []);
// 結果のパネルの見出しの「+n コイン」の n
const headNum = async page => +(await page.locator('#rpg-res .rpg-res-head').innerText()).match(/\+([\d,]+) コイン/)[1].replaceAll(',', '');

/* ---------- 仲間の世界地図 ---------- */
t('cards_map_colors', async page => {
  await writeSave(page, saveWith({ cards: { jp: [3, 0], br: [1, 0] } }));
  await page.evaluate(() => RPG.open('cards'));
  await page.locator('#cd-map svg').waitFor();
  const colored = cls => page.$$eval(`#cd-map path.${cls}`, ps => [...new Set(ps.map(p => p.dataset.a))]);
  assert.deepEqual(await colored('rpg-m3'), ['jp']);
  assert.deepEqual(await colored('rpg-m1'), ['br']);
  assert.ok(await count(page, '#cd-map path.rpg-fog') >= 100);
  const legend = await page.locator('#cd-map .rpg-legend').innerText();
  for (const s of ['★1 ブロンズ', '★2 シルバー', '★3 ゴールド', 'まだ']) assert.ok(legend.includes(s), `凡例に ${s} が無い: ${legend}`);
  // 地域でしぼりこんでも、地図は全世界のまま
  await page.click('#cd-regions .chip[data-r="アジア"]');
  assert.deepEqual(await colored('rpg-m1'), ['br']);
  assert.ok(await count(page, '#cd-map path.rpg-fog') >= 100);
  // 開き直しても描き直しても、国の形のパスは作り直さない（色は class の付け替えだけ）
  await page.evaluate(() => { document.querySelector('#cd-map path').dataset.x = '1'; });
  await page.evaluate(() => RPG.refresh());
  await page.evaluate(() => { show('rpg'); RPG.open('cards'); });
  await page.evaluate(() => RPG.tx(d => { d.cards.fr = [2, 0]; }));
  await page.waitForFunction(() => document.querySelector('#cd-map path[data-a="fr"]')?.classList.contains('rpg-m2'));
  assert.equal(await page.evaluate(() => document.querySelector('#cd-map path').dataset.x), '1');
  assert.deepEqual(await colored('rpg-m1'), ['br']);
});

t('home_map_wide', async page => {
  await writeSave(page, saveWith({ cards: { jp: [3, 0] } }));
  await page.evaluate(() => show('rpg'));
  assert.equal(await page.isVisible('#rpg-map'), false);
  // 1400px 以上になったら描く
  await page.setViewportSize(WIDE);
  await page.locator('#rpg-map svg').waitFor();
  assert.equal(await page.isVisible('#rpg-map svg'), true);
  assert.deepEqual(await page.$$eval('#rpg-map path.rpg-m3', ps => [...new Set(ps.map(p => p.dataset.a))]), ['jp']);
  assert.ok((await page.locator('#rpg-map .rpg-legend').innerText()).includes('★3 ゴールド'));
  // 冒険ホームを描き直しても地図はそのまま（作り直さない）
  await page.evaluate(() => { document.querySelector('#rpg-map path').dataset.x = '1'; });
  await page.evaluate(() => RPG.tx(d => { d.cards.br = [1, 0]; }));
  await page.waitForFunction(() => document.querySelector('#rpg-map path[data-a="br"]')?.classList.contains('rpg-m1'));
  assert.equal(await page.evaluate(() => document.querySelector('#rpg-map path').dataset.x), '1');
  await page.setViewportSize(LAPTOP);
  assert.equal(await page.isVisible('#rpg-map'), false);
}, { viewport: LAPTOP });

/* ---------- シェア ---------- */
t('share_after_boss', async page => {
  await writeSave(page, saveWith({ lv: 20, floors: { samerica: 4 } }));
  await startBattle(page, 'samerica', 5);
  await winBattle(page);
  assert.equal(await page.isVisible('#bt-share'), true);
  assert.equal(await page.locator('#bt-share').innerText(), 'シェア');
  await page.click('#bt-share');
  assert.deepEqual(await shared(page), { text: `国旗クエストで南アメリカを取りもどした！ 仲間 0/195か国 ${TAG}`, url: SHARE_URL });
  assert.deepEqual(await shareKinds(page), ['boss-samerica']);
  assert.deepEqual(await page.evaluate(() => window.__opened), []);
  // 2回目の撃破では出さない
  await startBattle(page, 'samerica', 5);
  await winBattle(page);
  assert.equal(await count(page, '#bt-share'), 0);
  // 地図喰い（地図喰いの巣のボス）は「世界を取りもどした」
  await writeSave(page, saveWith({ lv: 50, cards: { jp: [3, 0] }, floors: { samerica: 5, oceania: 5, namerica: 5, europe: 5, asia: 5, africa: 5, world: 4 } }));
  await startBattle(page, 'world', 5);
  await winBattle(page);
  await page.click('#bt-share');
  assert.deepEqual(await shared(page), { text: `国旗クエストで地図喰いをたおして、世界を取りもどした！ 仲間 1/195か国 ${TAG}`, url: SHARE_URL });
  assert.deepEqual(await shareKinds(page), ['final']);
}, { init: SHARE_STUB, timeout: 120_000 });

t('share_fallbacks', async page => {
  const TEXT = '国旗クエストのテスト & ?#195';
  const btn = await page.evaluate(t => {
    const b = RPG.shareButton('test', t);
    b.id = 'tst-share';
    document.body.append(b);
    return { tag: b.tagName, cls: b.className, text: b.textContent, type: b.type };
  }, TEXT);
  assert.deepEqual(btn, { tag: 'BUTTON', cls: 'btn ghost rpg-share', text: 'シェア', type: 'button' });
  const opened = () => page.evaluate(() => window.__opened);
  const settle = () => page.evaluate(() => new Promise(r => setTimeout(r, 50)));
  // 共有シートを閉じただけ（AbortError）: X の画面は開かない
  await page.evaluate(() => { navigator.share = () => Promise.reject(new DOMException('x', 'AbortError')); });
  await page.click('#tst-share');
  await settle();
  assert.deepEqual(await opened(), []);
  // AbortError 以外のエラー: X の画面を開く
  await page.evaluate(() => { navigator.share = () => Promise.reject(new DOMException('x', 'NotAllowedError')); });
  await page.click('#tst-share');
  await settle();
  assert.equal((await opened()).length, 1);
  // navigator.share が無い: X の画面を新しいタブで
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true }); window.__opened = []; });
  await page.click('#tst-share');
  const [[url, target, feat]] = await opened();
  assert.ok(url.startsWith('https://twitter.com/intent/tweet?text='), url);
  assert.ok(url.includes(encodeURIComponent(TEXT)), url);
  assert.ok(url.endsWith(`&url=${encodeURIComponent(SHARE_URL)}`), url);
  assert.deepEqual([target, feat], ['_blank', 'noopener']);
  assert.deepEqual(await shareKinds(page), ['test', 'test', 'test']);
}, { init: SHARE_STUB });

t('share_cards_50', async page => {
  const codes = await page.evaluate(() => C.filter(c => c.r !== '南アメリカ').map(c => c.a).sort().slice(0, 49));
  await writeSave(page, saveWith({ coins: 100, cards: Object.fromEntries(codes.map(a => [a, [1, 0]])) }));
  await page.evaluate(() => RPG.open('gacha', { region: '南アメリカ' }));
  await page.click('#ga-1');
  await page.locator('#ga-main .rpg-share').waitFor();
  assert.equal(await count(page, '#ga-main .rpg-share'), 1);
  // 結果のカードの下
  const [res, share] = await page.evaluate(() => [$('ga-res'), document.querySelector('#ga-main .rpg-share')].map(e => e.getBoundingClientRect().top));
  assert.ok(share > res, `シェア ${share} が結果 ${res} の下にない`);
  await page.click('#ga-main .rpg-share');
  assert.deepEqual(await shared(page), { text: `国旗クエストで仲間が50か国になった！ ${TAG}`, url: SHARE_URL });
  assert.deepEqual(await shareKinds(page), ['cards-50']);
  // 開き直したら（結果を消したら）出さない
  await page.evaluate(() => { show('rpg'); RPG.open('gacha'); });
  assert.equal(await count(page, '#ga-main .rpg-share'), 0);
}, { init: SHARE_STUB });

t('share_region_in_result', async page => {
  // 南アメリカの12か国のうち11か国が仲間で、のこりの1か国はなかよし度4（あと1回正解で仲間）
  const [last, ...rest] = await page.evaluate(() => C.filter(c => c.r === '南アメリカ').map(c => c.a));
  await writeSave(page, saveWith({ cards: Object.fromEntries(rest.map(a => [a, [1, 0]])), fr: { [last]: 4 } }));
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await forceNext(page, last);
  await answerCorrect(page);
  await page.click('#next');
  for (let i = 0; i < 20 && await page.isHidden('#scr-result'); i++) { await answerCorrect(page); await page.click('#next'); }
  await page.locator('#rpg-res .rpg-share').waitFor();
  await settleResult(page);   // 結果画面を出した直後はボタンを押せない
  await page.click('#rpg-res .rpg-share');
  assert.deepEqual(await shared(page), { text: `国旗クエストで南アメリカの国を全部仲間にした！ 仲間 12/195か国 ${TAG}`, url: SHARE_URL });
  assert.deepEqual(await shareKinds(page), ['region-samerica']);
}, { init: SHARE_STUB });

/* ---------- 演出（RPG.fx） ---------- */
// ボス（Lv1 なので旗1枚に2回かかる）で5回続けて正解して1回まちがえ、呼ばれた FX の名前を返す
const bossFx = async page => {
  await page.evaluate(() => RPG_BATTLE.start('samerica', 5));
  await page.click('#bt-fight');
  await wrapFx(page);
  const hit = [];
  for (let i = 0; i < 5; i++) { await battleAnswer(page, true); if (!i) hit.push(...await fxCalls(page)); }
  const five = await fxCalls(page);
  await page.evaluate(() => { window.__fx = []; });
  await battleAnswer(page, false);
  return { hit, five, miss: await fxCalls(page) };
};
t('dopa_fx_calls', async page => {
  await writeSave(page, saveWith({ floors: { samerica: 4 } }));
  // ドパガキ ON: 正解で効果音と紙吹雪、5連続で COMBO のポップ、まちがえると赤いフラッシュ
  let r = await bossFx(page);
  for (const k of ['sfx', 'confetti']) assert.ok(r.hit.includes(k), `正解で ${k} が無い: ${r.hit}`);
  assert.ok(r.five.includes('pop'), `5連続で pop が無い: ${r.five}`);
  for (const k of ['sfx', 'buzz', 'flash']) assert.ok(r.miss.includes(k), `まちがいで ${k} が無い: ${r.miss}`);
  // reduced motion: 紙吹雪・フラッシュ・ポップは呼ばない（効果音はよい）
  await page.emulateMedia({ reducedMotion: 'reduce' });
  r = await bossFx(page);
  const all = [...r.five, ...r.miss];
  assert.ok(all.includes('sfx'), all.join());
  for (const k of ['confetti', 'flash', 'pop']) assert.ok(!all.includes(k), `reduce で ${k} を呼んだ: ${all}`);
  // ドパガキ OFF: 何も呼ばない
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => { S.dopa = false; });
  r = await bossFx(page);
  assert.deepEqual([...r.five, ...r.miss], []);
}, { storage: DOPA, reducedMotion: 'no-preference', timeout: 120_000 });

t('gold_fx', async page => {
  // 天井の1回前なので、1回引くと★3
  for (const rm of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion: rm });
    await writeSave(page, saveWith({ coins: 100, pity: 49 }));
    await page.evaluate(() => RPG.open('gacha', { region: '南アメリカ' }));
    await wrapFx(page);
    await page.click('#ga-1');
    await page.waitForFunction(() => !document.querySelector('#ga-res .rpg-card.is-back'));
    assert.equal(await count(page, '#ga-res .rpg-card.is-gold[data-star="3"]'), 1, rm);
    const calls = await fxCalls(page);
    if (rm === 'reduce') assert.deepEqual(calls.filter(k => k === 'flash' || k === 'confetti'), [], rm);
    else for (const k of ['flash', 'confetti']) assert.ok(calls.includes(k), `${rm}: ${k} が無い: ${calls}`);
  }
}, { storage: DOPA });

t('reduced_motion_auto_next', async page => {
  await writeSave(page, saveWith({}));
  await startBattle(page, 'samerica', 1);
  await battleGuard(page);
  const { a, shownAt } = await page.evaluate(() => ({ a: RPG_BATTLE.cur(), ...RPG_BATTLE.state() }));
  await page.click(`#scr-battle .choice[data-a="${a}"]`);
  // モンスターは揺れずに白く光る。ダメージの数字は浮かばない
  assert.deepEqual(await page.evaluate(() => ({
    glow: document.getElementById('bt-mon').classList.contains('rpg-hitglow'),
    shake: document.getElementById('bt-mon').classList.contains('rpg-hit'),
    filter: getComputedStyle(document.querySelector('#bt-mon .rpg-mon-e')).filter,
  })), { glow: true, shake: false, filter: 'brightness(1.8)' });
  assert.equal(await count(page, '#bt-mon .rpg-dmg'), 0);
  await page.waitForTimeout(await page.evaluate(() => RPG_CORE.TUNING.battle.autoNextMs) + 300);
  const s = await page.evaluate(() => RPG_BATTLE.state());
  assert.equal(s.phase, 'question');
  assert.notEqual(s.shownAt, shownAt, '自動で次の問題に進んでいない');
}, { reducedMotion: 'reduce' });

t('result_count_up', async page => {
  for (const rm of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion: rm });
    await writeSave(page, saveWith({ intro: false }));
    // FX.pts の数と場所を積む（クイズもドパガキの正解で呼ぶので、［次へ］を押す直前に空にする）
    await page.evaluate(() => {
      const f = FX.pts.bind(FX);
      window.__pts = [];
      FX.pts = (n, r) => { window.__pts.push({ n, top: r.top, w: r.width }); return f(n, r); };
    });
    await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
    await page.click('#start');
    for (let i = 0; i < 20 && await page.isHidden('#scr-result'); i++) {
      await answerCorrect(page);
      await page.evaluate(() => { window.__pts = []; });
      await page.click('#next');
    }
    await page.locator('#rpg-res').waitFor();
    const sum = await page.evaluate(() => RPG.get().coins);   // 0 から始めたので、いまのコイン = この回の合計
    assert.ok(sum > 0);
    if (rm === 'reduce') assert.equal(await headNum(page), sum, '最初から合計が出ていない');
    else await page.waitForFunction(sum => +document.querySelector('#rpg-res .rpg-res-head').textContent.match(/\+([\d,]+) コイン/)[1].replaceAll(',', '') === sum, sum);
    assert.equal(await headNum(page), sum, rm);
    // ドパガキ ON なら結果のコインの所に +合計 が浮かぶ（reduced motion では浮かべない）
    const pts = await page.evaluate(() => window.__pts);
    if (rm === 'reduce') assert.deepEqual(pts, []);
    else {
      assert.equal(pts.length, 1, JSON.stringify(pts));
      assert.equal(pts[0].n, sum);
      assert.ok(pts[0].w > 0 && pts[0].top > 0, `+${sum} の場所が画面の外: ${JSON.stringify(pts)}`);
    }
  }
}, { storage: DOPA });
