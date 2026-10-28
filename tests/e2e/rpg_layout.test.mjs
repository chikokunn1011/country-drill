// 国旗クエストの見た目: 4つの大きさ（スマホ 390×844・短いスマホ 360×640・PC 1440×900・1280×720）で横にスクロールしない、
// バトルはスマホで上の列が上に固定・短い画面で上の列が1行・PC は画面の高さいっぱいの2列のステージ（ページも列もスクロールしない）
// どのテストも badges.js を止めて開く（openRpg）。大きさは page.setViewportSize で変えて1つのページで回す。
// ガチャ・仲間のカード・冒険ホームの見た目のテストもこのファイル（VIEWPORTS・noHScroll・noVScroll はここのものを使い、ほかのファイルから import しない）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, pickSetup, answerCorrect, answerWrong, clearByAnswering } from './helpers.mjs';
import { settleLayout } from './layout.mjs';
import { openRpg, writeSave, saveWith, startBattle, battleAnswer, battleGuard, winBattle, flipAll } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで開いて fn を実行する。最後にページの例外と、[rpg] で始まる console.error が無いことを見る
// （opts.timeout は node:test の timeout。ほかの opts は openRpg にそのまま渡す）
const t = (name, fn, { timeout = 60_000, ...opts } = {}) => test(name, { timeout }, async () => {
  const app = await openRpg(browser, { seed: 1, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});

const VIEWPORTS = [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 1440, height: 900 }, { width: 1280, height: 720 }];
const [PHONE, SHORT, WIDE, LAPTOP] = VIEWPORTS;
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const noVScroll = page => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1);

const size = vp => `${vp.width}×${vp.height}`;
// 要素の位置（getBoundingClientRect。無ければ null）
const rect = (page, sel) => page.evaluate(sel => {
  const r = document.querySelector(sel)?.getBoundingClientRect();
  return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height } : null;
}, sel);
// なめらかなスクロールが止まるまで待つ（scrollY が5フレーム続けて同じ）
const settleScroll = page => page.evaluate(() => new Promise(done => {
  let last = NaN, same = 0;
  const tick = () => {
    same = scrollY === last ? same + 1 : 0;
    last = scrollY;
    if (same >= 5) done(); else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
// sizes の大きさを順に試して、どれも横にスクロールしないこと
const noHScrollAt = async (page, what, sizes = VIEWPORTS) => {
  for (const vp of sizes) {
    await page.setViewportSize(vp);
    assert.ok(await noHScroll(page), `${what}（${size(vp)}）で横にスクロールする`);
  }
};
// いまの問題をまちがえて、答え合わせを出す（［つぎへ］は押さない）
const answerWrongOnly = async page => {
  await battleGuard(page);
  const a = await page.evaluate(() => RPG_BATTLE.cur());
  await page.locator(`#scr-battle .choice:not([data-a="${a}"])`).first().click();
  await page.locator('#bt-reveal').waitFor();
};
const phase = page => page.evaluate(() => RPG_BATTLE.state().phase);
// スマホ: いちばん下までスクロールしたまま次の問題（いちばん背の高い m2f）が出ても、問いの文は上の列の下に隠れない
const labelBelowTop = async page => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await settleScroll(page);
  await page.evaluate(a => RPG_BATTLE.force(a, 'm2f'), LONG);
  await settleScroll(page);
  const top = await rect(page, '.rpg-btop'), label = await rect(page, '#bt-q .qlabel');
  assert.ok(label.top >= top.bottom - 1, `問いの文 ${label.top} が上の列 ${top.bottom} の下に隠れる`);
};

// 仲間3枚・南アメリカの F1〜ボスまで開いているセーブ
const PARTY = saveWith({ lv: 12, coins: 12345, cards: { br: [2, 1], cl: [1, 0], jp: [3, 4] }, floors: { samerica: 4 } });
const LONG = 'vc';   // セントビンセント及びグレナディーン諸島（いちばん長い国名）

t('battle_no_hscroll', async page => {
  await writeSave(page, saveWith({ cards: { br: [2, 1], cl: [1, 0], jp: [3, 4] } }));
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  await noHScrollAt(page, '登場画面');
  await page.click('#bt-fight');
  for (const mode of ['f2n', 'n2f', 'm2f']) {
    await page.evaluate(([a, m]) => RPG_BATTLE.force(a, m), [LONG, mode]);
    await noHScrollAt(page, `問題（${mode}）`);
  }
  await page.evaluate(a => RPG_BATTLE.force(a, 'f2n'), LONG);
  await answerWrongOnly(page);
  await noHScrollAt(page, '答え合わせ');
  await page.click('#bt-next');
  await winBattle(page);
  assert.equal(await page.evaluate(() => RPG_BATTLE.state().win), true);
  await noHScrollAt(page, '勝ち');
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  await page.click('#bt-fight');
  while (await phase(page) !== 'end') await battleAnswer(page, false);
  assert.equal(await page.evaluate(() => RPG_BATTLE.state().win), false);
  await noHScrollAt(page, '負け');
}, { timeout: 180_000 });

const LONGEST_PCOIN = () => { $('pcoin').innerHTML = '+9,999 <i class="coin" aria-hidden="true"></i><span class="rpg-pnote"><small class="rpg-decay">×0.5</small><small class="rpg-fe">はじめて！+20</small></span>'; };
t('quiz_progress_no_hscroll', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await page.waitForSelector('#pcoin');
  // #pcoin がいちばん長いとき（4桁・目減り・はじめて。rpg.js の drawPcoin と同じ形）
  await page.evaluate(LONGEST_PCOIN);
  for (const vp of [PHONE, SHORT]) {
    await page.setViewportSize(vp);
    assert.ok(await noHScroll(page), `${size(vp)} で横にスクロールする`);
    const m = await page.evaluate(() => {
      const p = document.querySelector('#scr-quiz > .progress'), r = el => el.getBoundingClientRect();
      return { sw: p.scrollWidth, cw: p.clientWidth, coin: r($('pcoin')), quit: r($('quit')), prog: r(p), iw: innerWidth };
    });
    assert.ok(m.sw <= m.cw, `${size(vp)}: 進み具合の行がはみ出す（${m.sw} > ${m.cw}）`);
    assert.ok(m.coin.right <= m.iw && m.quit.right <= m.iw, `${size(vp)}: #pcoin ${m.coin.right}・#quit ${m.quit.right} > ${m.iw}`);
    assert.ok(m.coin.bottom <= m.prog.bottom, `${size(vp)}: #pcoin が進み具合の行の外（${m.coin.bottom} > ${m.prog.bottom}）`);
    const n = await rect(page, '#pcoin .rpg-pnote'), q = await rect(page, '#qcard');
    assert.ok(n.left >= 0 && n.right <= m.iw && n.bottom <= q.top, `${size(vp)}: 目減り・はじめての注 ${JSON.stringify(n)}（カードの上 ${q.top}）`);
  }
}, { timeout: 180_000 });

// スマホ（390×844・360×640）: #pcoin は進み具合と同じ行に入れて、冒険の表示が OFF のときより行を増やさない（クイズの画面が1行ぶん下がらない）。
// 「はじめて！+20」「×0.5」は行の下のすき間に出す（問題のカードにかからない・画面の外に出ない）。チップの幅は +0 でも +9,999 と注つきでも同じ（計測中に折り返さない）
const quizRow = page => page.evaluate(() => {
  const h = () => document.querySelector('#scr-quiz > .progress').getBoundingClientRect().height;
  const on = h();
  document.body.classList.add('rpg-off');
  const off = h();
  document.body.classList.remove('rpg-off');
  const n = document.querySelector('#pcoin .rpg-pnote')?.getBoundingClientRect();
  return { on, off, note: n && { left: n.left, right: n.right, bottom: n.bottom }, qtop: $('qcard').getBoundingClientRect().top, iw: innerWidth };
});
for (const dopa of [false, true]) t(`quiz_progress_coin_same_line${dopa ? '_dopa' : ''}`, async page => {
  for (const vp of [PHONE, SHORT]) for (const kind of ['practice', 'challenge', 'ta']) {
    await page.setViewportSize(vp);
    await pickSetup(page, { mode: 'f2n', kind, region: 'all', count: 10 });
    await page.click('#start');
    await page.waitForSelector('#pcoin');
    const w0 = await rect(page, '#pcoin');
    await page.evaluate(LONGEST_PCOIN);
    assert.equal((await rect(page, '#pcoin')).width, w0.width, `${size(vp)} ${kind}: +0 と +9,999 でチップの幅が変わる`);
    for (let i = 0; i <= 4; i++) {
      if (i) {
        await answerCorrect(page);
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));   // #pcoin は次のフレーム
      }
      const m = await quizRow(page), at = `${size(vp)} ${kind} ${i}問正解`;
      assert.ok(m.on <= m.off + 2, `${at}: 進み具合の行 ${m.on}px（冒険 OFF は ${m.off}px）`);
      if (m.note) assert.ok(m.note.left >= 0 && m.note.right <= m.iw && m.note.bottom <= m.qtop, `${at}: 注 ${JSON.stringify(m.note)}（カードの上 ${m.qtop}）`);
      if (i && kind !== 'ta') await page.click('#next');
    }
    await page.click('#quit');
  }
}, { timeout: 180_000, storage: { settings: { region: 'all', dopa, sound: false } } });

t('phone_sticky_top', async page => {
  await writeSave(page, PARTY);
  await startBattle(page, 'samerica', 1);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.rpg-btop')).position), 'sticky');
  await page.evaluate(a => RPG_BATTLE.force(a, 'f2n'), LONG);
  await answerWrongOnly(page);
  await settleScroll(page);
  // 答え合わせは上の列のすぐ下（8px あけて）までスクロールして出る（上の列に隠れない）
  let top = await rect(page, '.rpg-btop'), rv = await rect(page, '#bt-reveal');
  assert.ok(rv.top >= top.bottom - 1, `答え合わせ ${rv.top} が上の列 ${top.bottom} の下に隠れる`);
  assert.ok(rv.top <= top.bottom + 9, `答え合わせ ${rv.top} が上の列 ${top.bottom} のすぐ下まで来ない`);
  // いちばん下までスクロールしても、上の列（旅人の HP まで）は画面の上に残る
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await settleScroll(page);
  top = await rect(page, '.rpg-btop');
  const hhp = await rect(page, '#bt-hhp'), q = await rect(page, '#bt-q');
  assert.ok(top.top >= 0 && top.top <= 1, `上の列の top ${top.top}`);
  assert.ok(hhp.bottom > 0, `旅人の HP バーが画面の外（bottom ${hhp.bottom}）`);
  assert.ok(q.top < top.top, '問題の枠が上の列の下にもぐっていない（スクロールが足りない）');
  await page.click('#bt-next');
  await labelBelowTop(page);
});

// 上の列の仲間の国旗のうち、見えている（offsetParent が null でない）数
const visibleParty = page => page.$$eval('.rpg-btop .rpg-party img', els => els.filter(e => e.offsetParent !== null).length);

// スマホ: 旅人の HP の行の下に仲間3枚を1行で（国旗 28px 幅＋★）
t('phone_shows_party', async page => {
  // チームボーナスの札は自分で組んだ枠だけ（おまかせにはつかない）
  await writeSave(page, { ...PARTY, teams: [{ n: '編成1', c: ['br', 'cl', 'jp'] }] });
  await startBattle(page, 'samerica', 1);
  assert.equal(await visibleParty(page), 3);
  const m = await page.evaluate(() => {
    const ul = document.querySelector('.rpg-btop .rpg-party'), hhp = $('bt-hhp').getBoundingClientRect();
    const lis = [...ul.querySelectorAll('.rpg-pc')].map(li => li.getBoundingClientRect()), tag = ul.querySelector('.rpg-team-tag')?.getBoundingClientRect();
    return { hhp: hhp.bottom, top: ul.getBoundingClientRect().top, tops: lis.map(r => Math.round(r.top)), tag: tag && { top: tag.top, bottom: tag.bottom, last: lis[2].bottom, first: lis[0].top },
      w: ul.querySelector('img').getBoundingClientRect().width, stars: [...ul.querySelectorAll('.rpg-stars')].filter(e => e.offsetParent !== null).length };
  });
  assert.ok(m.top >= m.hhp - 1, `仲間の列 ${m.top} が旅人の HP ${m.hhp} より上`);
  assert.equal(new Set(m.tops).size, 1, `仲間が1行に並ばない ${m.tops}`);
  assert.equal(Math.round(m.w), 28);
  // 南アメリカ×2 のチームボーナスの札も同じ行に
  assert.ok(m.tag && m.tag.top >= m.tag.first && m.tag.bottom <= m.tag.last, `チームの札 ${JSON.stringify(m.tag)}`);
  assert.equal(m.stars, 3);
  assert.ok(await noHScroll(page));
}, { viewport: PHONE });

// スマホ 390×844: ボス（説明の行が多い）で同じ地域の3枚・枠2つ（◀▶ とチームボーナス）でも、登場画面の［たたかう］は最初の画面に入る
t('phone_boss_fight_visible', async page => {
  await writeSave(page, { ...PARTY, cards: { br: [2, 1], cl: [1, 0], ar: [1, 0] }, tsel: 0,
    teams: [{ n: '編成1', c: ['br', 'cl', 'ar'] }, { n: '編成2', c: ['br'] }] });
  await page.evaluate(() => RPG_BATTLE.start('samerica', 5));
  await page.locator('#bt-intro').waitFor();
  assert.equal(await page.locator('#bt-tprev, #bt-tnext').count(), 2);
  assert.ok((await page.innerText('#bt-intro .rpg-bteam')).includes('＋25%'), await page.innerText('#bt-intro .rpg-bteam'));
  const b = await rect(page, '#bt-fight');
  assert.ok(b.bottom <= PHONE.height, `［たたかう］の下端 ${b.bottom} が画面（${PHONE.height}）の外`);
  // チームボーナスは編成の行の中（別の行を足さない）
  assert.equal(await page.locator('#bt-intro > .rpg-bteam-b').count(), 0);
  assert.ok(await noHScroll(page));
  // 短いスマホ 360×640 でも入る
  await page.setViewportSize(SHORT);
  const s = await rect(page, '#bt-fight');
  assert.ok(s.bottom <= SHORT.height, `${size(SHORT)}: ［たたかう］の下端 ${s.bottom} が画面の外`);
  assert.ok(await noHScroll(page));
}, { viewport: PHONE });

// 正解の援護: 動きを抑える設定では跳ねない（アニメーション 0）で枠が光るだけ。ふつうは .rpg-pc が跳ねる（国旗の img には transform をかけない）
for (const reducedMotion of ['reduce', 'no-preference']) {
  t(`assist_motion_${reducedMotion}`, async page => {
    await writeSave(page, PARTY);
    await startBattle(page, 'samerica', 1);
    await battleGuard(page);
    await page.locator(`#scr-battle .choice[data-a="${await page.evaluate(() => RPG_BATTLE.cur())}"]`).click();
    const m = await page.evaluate(() => {
      const pcs = [...document.querySelectorAll('.rpg-btop .rpg-pc')];
      return { assist: !!document.querySelector('.rpg-btop .rpg-party.rpg-assist'),
        anims: pcs.reduce((n, el) => n + el.getAnimations().length, 0),
        shadow: getComputedStyle(pcs[0]).boxShadow,
        imgAnims: [...document.querySelectorAll('.rpg-btop .rpg-pc img')].reduce((n, el) => n + el.getAnimations().length, 0) };
    });
    assert.equal(m.assist, true);
    assert.equal(m.imgAnims, 0);
    if (reducedMotion === 'reduce') {
      assert.equal(m.anims, 0);
      assert.notEqual(m.shadow, 'none');
    } else assert.equal(m.anims, 3);
  }, { reducedMotion });
}

t('short_phone_one_line', async page => {
  await writeSave(page, PARTY);
  await startBattle(page, 'samerica', 1);
  const top = await rect(page, '.rpg-btop');
  assert.ok(top.height <= 58, `上の列の高さ ${top.height}`);   // 約56px
  // ダンジョン名は … で切れても、フロア（F1）は見える（フロアが先）
  assert.match(await page.innerText('.rpg-bwhere'), /^F1 /);
  assert.equal(await page.evaluate(() => { const e = document.querySelector('.rpg-bwhere'), r = document.createRange(); r.setStart(e.firstChild, 0); r.setEnd(e.firstChild, 2); return r.getBoundingClientRect().right <= e.getBoundingClientRect().right; }), true);
  assert.ok((await rect(page, '#bt-flee')).height >= 24, `［にげる］の高さ ${(await rect(page, '#bt-flee')).height} が 24px より低い（押しにくい）`);
  assert.equal(await page.isVisible('.rpg-flagtext'), true);
  assert.match(await page.innerText('.rpg-flagtext'), /旗/);
  assert.equal(await page.locator('#bt-flags .rpg-cloth:visible').count(), 0);   // 旗の列は「旗 n/N」の文字だけ
  // 仲間は国旗だけ（3つ見える。★は隠す）
  assert.equal(await visibleParty(page), 3);
  assert.equal(await page.locator('.rpg-btop .rpg-stars:visible').count(), 0);
  for (const mode of ['f2n', 'n2f', 'm2f']) {
    await page.evaluate(([a, m]) => RPG_BATTLE.force(a, m), [LONG, mode]);
    const c4 = await rect(page, '#scr-battle .choice:nth-child(4)');
    assert.ok(c4.bottom <= SHORT.height, `${mode}: 4つ目の選択肢の下端 ${c4.bottom} が画面の外`);
  }
  await page.evaluate(a => RPG_BATTLE.force(a, 'f2n'), LONG);
  await answerWrongOnly(page);
  await settleScroll(page);
  const t2 = await rect(page, '.rpg-btop'), rv = await rect(page, '#bt-reveal');
  assert.ok(rv.top >= t2.bottom - 1, `答え合わせ ${rv.top} が上の列 ${t2.bottom} の下に隠れる`);
  assert.ok(rv.top <= t2.bottom + 9, `答え合わせ ${rv.top} が上の列 ${t2.bottom} のすぐ下まで来ない`);
  await page.click('#bt-next');
  await labelBelowTop(page);
  // ボス（丸いスタンプの枠と BOSS の札）でも1行のまま
  await startBattle(page, 'samerica', 5);
  const boss = await rect(page, '.rpg-btop');
  assert.ok(boss.height <= 58, `ボスの上の列の高さ ${boss.height}`);
  assert.match(await page.innerText('.rpg-bwhere'), /^ボス /);
  assert.equal(await page.isVisible('#bt-mon .rpg-bosstag'), true);
  const tag = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.rpg-bosstag')).fontSize));
  assert.ok(tag >= 8.8, `BOSS の札の文字 ${tag}px が小さすぎる`);   // .55rem
  assert.ok((await rect(page, '.rpg-bosstag')).bottom <= boss.bottom, 'BOSS の札が上の列からはみ出る');
}, { viewport: SHORT });

// 短いスマホの［にげる］（押せる高さ 24px のうち上下 3.5px は余白に重ねている）は、すぐ下でゆらゆらするモンスターの下にもぐらない。
// ゆれ（rpg-sway）を途中の4か所で止め、まん中とボタンの中の5×5の点の elementFromPoint がどれも［にげる］（ボスの丸い枠でも）
t('short_phone_flee_on_top', async page => {
  await writeSave(page, PARTY);
  for (const floor of [1, 5]) {
    await startBattle(page, 'samerica', floor);
    for (const k of [0, .25, .5, .75]) {
      const miss = await page.evaluate(k => {
        const mon = $('bt-mon'), a = mon.getAnimations().find(x => x.animationName === 'rpg-sway');
        if (a) { a.pause(); a.currentTime = a.effect.getComputedTiming().duration * k; }
        const b = $('bt-flee'), r = b.getBoundingClientRect(), out = [];
        const at = (x, y) => { const el = document.elementFromPoint(x, y); if (!b.contains(el)) out.push({ x, y, hit: el?.id || el?.className || null }); };
        at(r.left + r.width / 2, r.top + r.height / 2);
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) at(r.left + 1 + (r.width - 2) * i / 4, r.top + 1 + (r.height - 2) * j / 4);
        return out;
      }, k);
      assert.deepEqual(miss, [], `F${floor} ゆれ ${k}: ［にげる］の上に別のもの ${JSON.stringify(miss)}`);
    }
  }
}, { viewport: SHORT });

// カードの国名はカタカナの途中で折らない: アルゼンチン・アゼルバイジャンは 1行（字数に合わせて小さくする。9px 未満にはしない）
t('card_names_one_line', async page => {
  await writeSave(page, saveWith({ coins: 1000, cards: { ar: [1, 0], az: [2, 0] } }));
  const lines = (page, sel) => page.evaluate(sel => {
    const el = document.querySelector(sel), r = document.createRange();
    r.selectNodeContents(el);
    const ys = new Set([...r.getClientRects()].map(b => Math.round(b.top)));
    return { lines: ys.size, fs: parseFloat(getComputedStyle(el).fontSize), over: el.scrollWidth > el.clientWidth + 1 };
  }, sel);
  for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(vp);
    await page.evaluate(() => RPG.open('cards'));
    for (const a of ['ar', 'az']) {
      const r = await lines(page, `#cd-grid .rpg-card[data-a="${a}"] .rpg-card-name`);
      assert.deepEqual([r.lines, r.over, r.fs >= 9], [1, false, true], `仲間 ${vp.width} ${a}: ${JSON.stringify(r)}`);
    }
    // ガチャの結果（1400px 以上は10列で狭い）
    await page.evaluate(() => RPG.open('gacha'));
    await page.evaluate(() => { const d = RPG.get(); $('ga-res').innerHTML = ['ar', 'az', 'br', 'cl', 'jp', 'us', 'fr', 'de', 'it', 'es'].map(a => RPG.cardHTML(a, d, { label: 'NEW' })).join(''); });
    for (const a of ['ar', 'az']) {
      const r = await lines(page, `#ga-res .rpg-card[data-a="${a}"] .rpg-card-name`);
      assert.deepEqual([r.lines, r.over, r.fs >= 9], [1, false, true], `ガチャ ${vp.width} ${a}: ${JSON.stringify(r)}`);
    }
  }
  // 短い名前は小さくしない（.82rem のまま）
  await page.evaluate(() => RPG.open('cards'));
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  assert.equal((await lines(page, '#cd-grid .rpg-card[data-a="jp"] .rpg-card-name')).fs, +(rem * .82).toFixed(3));
});

// 長い国名（9字以上のカタカナ・「・」「及び」で長い名前）が折れても、1字だけの行（「リヒテンシュタイ/ン」）を作らない。
// 折るのは rpg-cards.js が <wbr> を入れたところだけ（リヒテン/シュタイン・パプア/ニューギニア・サントメ・/プリンシペ）。仲間の一覧とガチャの結果（1400px 以上は10列）
t('card_names_no_orphan', async page => {
  const LONGS = ['li', 'pg', 'kn', 'vc', 'st', 'tt', 'ag', 'ba', 'az', 'nz'];
  await writeSave(page, saveWith({ coins: 1000, cards: Object.fromEntries(LONGS.map(a => [a, [3, 0]])) }));
  // 国名の行（字の top でまとめる）
  const lines = sel => page.$$eval(sel, els => els.map(el => {
    const rows = new Map(), w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t; (t = w.nextNode());) for (let i = 0; i < t.length; i++) {
      const r = document.createRange();
      r.setStart(t, i); r.setEnd(t, i + 1);
      const y = Math.round(r.getClientRects()[0].top);
      rows.set(y, (rows.get(y) ?? '') + t.data[i]);
    }
    return { a: el.closest('.rpg-card').dataset.a, rows: [...rows.values()] };
  }));
  const check = (where, list) => {
    for (const { a, rows } of list) assert.ok(rows.every(s => [...s].length > 1) || rows.length === 1, `${where} ${a}: ${rows.join(' / ')}`);
  };
  for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 900, height: 700 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(vp);
    await page.evaluate(() => RPG.open('cards'));
    check(`仲間 ${size(vp)}`, (await lines('#cd-grid .rpg-card-name')).filter(x => LONGS.includes(x.a)));
    await page.evaluate(() => RPG.open('gacha'));
    await page.evaluate(as => { const d = RPG.get(); $('ga-res').innerHTML = as.map(a => RPG.cardHTML(a, d, { label: 'NEW' })).join(''); }, LONGS);
    check(`ガチャ ${size(vp)}`, await lines('#ga-res .rpg-card-name'));
  }
  // 折るところ（<wbr>）と、1行に入るなら折らないこと
  assert.deepEqual(await page.evaluate(() => ['li', 'pg', 'st', 'mk', 'jp'].map(a => RPG.cardHTML(a, RPG.get()).match(/<b class="rpg-card-name"[^>]*>(.*?)<\/b>/)[1])),
    ['リヒテン<wbr>シュタイン', 'パプア<wbr>ニューギニア', 'サントメ・<wbr>プリンシペ', '北マケドニア', '日本']);
});

// 背の低い PC の結果画面で、冒険のコインのパネル（#r-ext）だけ（バッジのパネルは無い）とまちがえた国の一覧が #r-side に並んでも、
// ［もう一回］はスクロールなしで全部見える（1280x577 で10か国だと 9px 外に出ていた）。一覧が5か国以上なら左（点数と［もう一回］）も
// 右も上にそろえる（badges.css。バッジのパネルだけのときと同じ）。4か国までは上下まん中のまま
for (const [viewport, misses] of [[{ width: 1280, height: 577 }, 10], [{ width: 1280, height: 577 }, 5], [{ width: 1280, height: 577 }, 4],
  [{ width: 1366, height: 657 }, 10], [{ width: 1366, height: 657 }, 4], [{ width: 1536, height: 730 }, 10], [{ width: 1536, height: 730 }, 1]]) {
  t(`result_rpg_panel_only_pc_fits_misses_${misses}_${viewport.width}x${viewport.height}`, async page => {
    await writeSave(page, saveWith({ coins: 500 }));
    await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 10 });
    await page.click('#start');
    for (let i = 0; i < misses; i++) { await answerWrong(page); await page.click('#next'); }
    await clearByAnswering(page);
    await settleLayout(page);
    assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('#r-side > #r-ext > .rpg-res').length, !!$('r-badges'), document.querySelectorAll('#r-side .misslist li').length]),
      [1, false, misses]);
    assert.ok(await noHScroll(page));
    const g = await page.evaluate(() => {
      const b = e => e.getBoundingClientRect(), again = b($('r-again'));
      return { again: { top: again.top, bottom: again.bottom, right: again.right }, w: innerWidth, h: innerHeight, y: scrollY,
        result: b($('rcard').querySelector(':scope > .result')).top, side: b($('r-side')).top };
    });
    assert.ok(g.y === 0 && g.again.top >= 0 && g.again.bottom <= g.h && g.again.right <= g.w, `［もう一回］が画面の外: ${JSON.stringify(g)}`);
    if (misses >= 5) assert.ok(Math.abs(g.result - g.side) < 1, `上にそろっていない: ${JSON.stringify(g)}`);
    else assert.ok(g.result - g.side > 20, `上にそろえている: ${JSON.stringify(g)}`);
  }, { viewport });
}

t('pc_stage_fits', async page => {
  await writeSave(page, PARTY);
  // 縦にも横にもスクロールしない。ステージの高さは 400 より大きく、.bq と（出ていれば）4つの選択肢・答え合わせがステージの中。右の列もスクロールしない
  const fits = async what => {
    for (const vp of [WIDE, LAPTOP]) {
      await page.setViewportSize(vp);
      const at = `${what}（${size(vp)}）`;
      assert.ok(await noVScroll(page), `${at}: 縦にスクロールする`);
      assert.ok(await noHScroll(page), `${at}: 横にスクロールする`);
      const m = await page.evaluate(() => {
        const r = el => el.getBoundingClientRect(), st = r(document.querySelector('.rpg-stage'));
        const inside = el => { const b = r(el); return b.top >= st.top - 1 && b.bottom <= st.bottom + 1 && b.left >= st.left - 1 && b.right <= st.right + 1; };
        const col = $('bt-col');
        return {
          h: st.height, bq: inside($('bt-q')), choices: [...document.querySelectorAll('#scr-battle .choice')].map(inside),
          reveal: $('bt-reveal') ? [inside($('bt-reveal')), inside($('bt-next'))] : null, colScroll: col.scrollHeight - col.clientHeight,
        };
      });
      assert.ok(m.h > 400, `${at}: ステージの高さ ${m.h}`);
      assert.ok(m.bq, `${at}: .bq がステージの外`);
      if (m.reveal) assert.deepEqual(m.reveal, [true, true], `${at}: 答え合わせがステージの外`);
      else assert.deepEqual(m.choices, [true, true, true, true], `${at}: 選択肢がステージの外`);
      assert.ok(m.colScroll <= 1, `${at}: 右の列が ${m.colScroll}px スクロールする`);
    }
  };
  await startBattle(page, 'samerica', 1);
  for (const mode of ['f2n', 'n2f', 'm2f']) {
    await page.evaluate(([a, m]) => RPG_BATTLE.force(a, m), [LONG, mode]);
    await fits(`問題（${mode}）`);
  }
  // 答え合わせ: 選択肢の場所と入れかわる。m2f は地図をもう1枚出さない
  for (const mode of ['f2n', 'm2f']) {
    await page.evaluate(([a, m]) => RPG_BATTLE.force(a, m), [LONG, mode]);
    await answerWrongOnly(page);
    await fits(`答え合わせ（${mode}）`);
    assert.equal(await page.locator('#scr-battle .choices').count(), 0, `答え合わせ（${mode}）: 選択肢が残っている`);
    if (mode === 'm2f') assert.equal(await page.locator('#scr-battle svg.map').count(), 1);
    await page.click('#bt-next');
  }
  await startBattle(page, 'samerica', 5);
  await fits('ボスの問題');
}, { viewport: WIDE, timeout: 180_000 });

// PC のレイアウトでも幅 900〜1050px や横向きのスマホ（932×430）では答え合わせが右の列に入りきらない。
// そのときは右の列の中だけをスクロールして［つぎへ］を見せる（ページはスクロールしない）。背の低い画面でも問いの国旗・地図・国旗の4択は小さくなりすぎない
t('pc_reveal_next_reachable', async page => {
  await writeSave(page, PARTY);
  const TABLET = { width: 1024, height: 768 }, SMALL = { width: 960, height: 600 }, LAND = { width: 932, height: 430 };
  // 問いの国旗・地図の幅と、国旗の4択のいちばん小さい国旗の幅（無ければ Infinity）
  const sizes = () => page.evaluate(() => ({
    q: document.querySelector('#bt-q > .qflag, #bt-q > .mapbox')?.getBoundingClientRect().width ?? Infinity,
    opt: Math.min(...[...document.querySelectorAll('#bt-q .choice img')].map(i => i.getBoundingClientRect().width)),
  }));
  for (const [vp, mode] of [[TABLET, 'm2f'], [SMALL, 'f2n'], [LAND, 'f2n'], [LAND, 'n2f'], [LAND, 'm2f']]) {
    const at = `${mode}（${size(vp)}）`;
    await page.setViewportSize(vp);
    await startBattle(page, 'samerica', 1);
    await page.evaluate(([a, m]) => RPG_BATTLE.force(a, m), [LONG, mode]);
    let s = await sizes();
    assert.ok(s.q >= 63, `問題（${at}）: 問いの国旗・地図の幅 ${s.q}`);
    assert.ok(s.opt >= 47, `問題（${at}）: 4択の国旗の幅 ${s.opt}`);
    await answerWrongOnly(page);
    assert.ok(await noVScroll(page), `答え合わせ（${at}）: 縦にスクロールする`);
    const m = await page.evaluate(() => {
      const r = el => el.getBoundingClientRect(), col = r($('bt-col'));
      const inside = el => { const b = r(el); return b.top >= col.top - 1 && b.bottom <= col.bottom + 1 && b.bottom <= innerHeight; };
      return { next: inside($('bt-next')), verdict: inside(document.querySelector('#bt-reveal > .verdict')), y: scrollY };
    });
    assert.ok(m.next, `答え合わせ（${at}）: ［つぎへ］が右の列の見えている所の外`);
    assert.equal(m.y, 0, `答え合わせ（${at}）: ページがスクロールした`);
    if (vp !== LAND) assert.ok(m.verdict, `答え合わせ（${at}）: 答え合わせの文が右の列の見えている所の外`);
    s = await sizes();
    assert.ok(s.q >= 63, `答え合わせ（${at}）: 問いの国旗・地図の幅 ${s.q}`);
    await page.click('#bt-next');
  }
}, { timeout: 180_000 });

t('pc_two_columns', async page => {
  await writeSave(page, PARTY);
  await startBattle(page, 'samerica', 1);
  const m = await page.evaluate(() => {
    const st = document.querySelector('.rpg-stage'), r = el => el.getBoundingClientRect(), s = r(st), mid = s.left + s.width / 2;
    const mon = r($('bt-mon')), bq = r($('bt-q'));
    return {
      cols: getComputedStyle(st).gridTemplateColumns.trim().split(/\s+/).length,
      monLeft: mon.left + mon.width / 2 < mid, bqRight: bq.left + bq.width / 2 > mid,
      sticky: getComputedStyle(document.querySelector('.rpg-btop')).position,
      footer: getComputedStyle(document.querySelector('body > .wrap > footer')).display,
    };
  });
  assert.equal(m.cols, 2);
  assert.equal(m.monLeft, true, 'モンスターの中心が左半分にない');
  assert.equal(m.bqRight, true, '.bq の中心が右半分にない');
  assert.notEqual(m.sticky, 'sticky');   // PC では上の列を固定しない
  assert.equal(m.footer, 'none');
}, { viewport: LAPTOP });

t('home_no_hscroll', async page => {
  // はじめての画面（まだセーブが無い）
  await page.evaluate(() => show('rpg'));
  assert.equal(await page.isVisible('#rpg-intro'), true);
  await noHScrollAt(page, 'はじめての画面');
  // 冒険ホーム
  await page.setViewportSize(PHONE);
  await writeSave(page, saveWith({ lv: 12, coins: 12345, cards: { br: [2, 1], cl: [1, 0], jp: [3, 4], fr: [1, 2] }, fr: { pe: 3 }, floors: { samerica: 4, oceania: 1 } }));
  await page.evaluate(() => show('rpg'));
  assert.equal(await page.isVisible('#rpg-hero'), true);
  await noHScrollAt(page, '冒険ホーム');
}, { timeout: 180_000 });

// 国旗ガチャと仲間の画面の並べ方（4つの大きさで横にはみ出さない・PC は左右2列）と、全画面を順に回る確認（設計書 §14）
t('gacha_layout', async page => {
  // 名前の長い国が多い地域で10連（結果あり）
  await writeSave(page, saveWith({ coins: 1500, cards: { jp: [3, 4], cf: [2, 2], vc: [1, 1] }, fr: { cf: 10, vc: 7 } }));
  await page.evaluate(() => RPG.open('gacha', { region: '北・中央アメリカ' }));
  await page.click('#ga-10');
  await flipAll(page);
  for (const v of VIEWPORTS) {
    await page.setViewportSize(v);
    assert.ok(await noHScroll(page), `gacha ${size(v)}`);
    assert.equal(await page.locator('#ga-res .rpg-card').count(), 10);
  }
  // PC: 左に地域・ボタン・確率、右に結果
  await page.setViewportSize({ width: 1440, height: 900 });
  const r = await page.evaluate(() => {
    const box = id => $(id).getBoundingClientRect();
    const tops = [...document.querySelectorAll('#ga-res .rpg-card')].map(c => Math.round(c.getBoundingClientRect().top));
    return { res: box('ga-res').left, rates: box('ga-rates').right, rows: new Set(tops).size };
  });
  assert.ok(r.res > r.rates, JSON.stringify(r));
  assert.equal(r.rows, 1, JSON.stringify(r));   // 1400px 以上は10枚を横1列
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.equal(await page.evaluate(() => new Set([...document.querySelectorAll('#ga-res .rpg-card')].map(c => Math.round(c.getBoundingClientRect().top))).size), 2);   // 5列×2
  await page.evaluate(() => RPG.open('cards'));
  for (const v of VIEWPORTS) {
    await page.setViewportSize(v);
    assert.ok(await noHScroll(page), `cards ${size(v)}`);
  }
}, { timeout: 180_000 });

t('walk_all_screens', async page => {
  await writeSave(page, saveWith({ intro: true, coins: 1000 }));
  const names = await page.evaluate(() => [...SCREENS]);
  for (const s of ['rpg', 'battle', 'gacha', 'cards']) assert.ok(names.includes(s), `${s} が SCREENS に無い: ${names}`);
  for (const v of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(v);
    for (const name of names) {
      await page.evaluate(n => show(n), name);
      const r = await page.evaluate(names => ({
        shown: names.filter(n => !$('scr-' + n).hidden && getComputedStyle($('scr-' + n)).display !== 'none'),
        screen: document.body.dataset.screen,
      }), names);
      assert.deepEqual(r.shown, [name], `${name} ${size(v)}`);
      assert.equal(r.screen, name);
      assert.ok(await noHScroll(page), `${name} ${size(v)}`);
    }
  }
  await page.evaluate(() => show('home'));
  assert.equal(await page.isVisible('#scr-home'), true);
}, { timeout: 180_000 });

// ダークモード: 地域の色のトークンがライトとちがう値になり、冒険ホーム・バトル・ガチャ（結果あり）・仲間が4つの大きさで横にはみ出さない
t('dark_mode', async page => {
  const token = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--rpg-r-samerica').trim());
  const dark = await token();
  assert.ok(dark, '--rpg-r-samerica が空');
  await page.emulateMedia({ colorScheme: 'light' });
  const light = await token();
  assert.ok(light, 'ライトの --rpg-r-samerica が空');
  assert.notEqual(dark, light);
  await page.emulateMedia({ colorScheme: 'dark' });
  await writeSave(page, PARTY);
  await page.evaluate(() => show('rpg'));
  assert.equal(await page.isVisible('#rpg-hero'), true);
  await noHScrollAt(page, 'ダークの冒険ホーム');
  await page.setViewportSize(PHONE);
  await startBattle(page, 'samerica', 3);
  await noHScrollAt(page, 'ダークのバトル');
  await page.setViewportSize(PHONE);
  await page.evaluate(() => RPG.open('gacha', { region: '南アメリカ' }));
  await page.click('#ga-10');
  await flipAll(page);
  await noHScrollAt(page, 'ダークのガチャ');
  await page.evaluate(() => RPG.open('cards'));
  await noHScrollAt(page, 'ダークの仲間');
}, { colorScheme: 'dark', storage: { settings: { theme: 'auto' } }, timeout: 180_000 });

// 章タブ3つ（🌍地球・🪞鏡の地球・🌌宇宙）は 360px でもどれも1行（折り返さない・はみ出さない）で、横にスクロールしない
t('chtabs_one_line_360', async page => {
  const E = ['samerica', 'oceania', 'namerica', 'europe', 'asia', 'africa', 'world'];
  await writeSave(page, saveWith({ lv: 50, floors: Object.fromEntries([...E, ...E.map(id => 'm' + id)].map(id => [id, 5])) }));
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    for (const vp of [{ width: 360, height: 640 }, { width: 320, height: 640 }]) {
      await page.setViewportSize(vp);
      await page.evaluate(() => show('rpg'));
      const r = await page.$$eval('#rpg-chtabs .chip', els => els.map(e => {
        const lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.6;
        const range = document.createRange(); range.selectNodeContents(e);
        return { t: e.innerText, lines: new Set([...range.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size,
          h: e.getBoundingClientRect().height, sw: e.scrollWidth, cw: e.clientWidth, lh };
      }));
      const at = `${colorScheme} ${size(vp)} ${JSON.stringify(r)}`;
      assert.equal(r.length, 3, at);
      assert.ok(r.every(x => x.lines === 1), `折り返している: ${at}`);
      assert.ok(r.every(x => x.sw <= x.cw), `はみ出している: ${at}`);
      assert.equal(new Set(r.map(x => Math.round(x.h))).size, 1, `高さがそろっていない: ${at}`);
      assert.ok(await noHScroll(page), `横にスクロールする: ${at}`);
    }
  }
});
