// 国旗クエストの見た目: 4つの大きさ（スマホ 390×844・短いスマホ 360×640・PC 1440×900・1280×720）で横にスクロールしない、
// バトルはスマホで上の列が上に固定・短い画面で上の列が1行・PC は画面の高さいっぱいの2列のステージ（ページも列もスクロールしない）
// どのテストも badges.js を止めて開く（openRpg）。大きさは page.setViewportSize で変えて1つのページで回す。
// Task 11・12 もこのファイルにテストを足す（VIEWPORTS・noHScroll・noVScroll はここのものを使い、ほかのファイルから import しない）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, pickSetup } from './helpers.mjs';
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

t('quiz_progress_no_hscroll', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await page.waitForSelector('#pcoin');
  // #pcoin がいちばん長いとき（4桁・目減り・はじめて）
  await page.evaluate(() => { $('pcoin').innerHTML = '+9,999 <i class="coin" aria-hidden="true"></i><small class="rpg-decay">×0.5</small><small class="rpg-fe">はじめて！+20</small>'; });
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
  }
}, { timeout: 180_000 });

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

t('short_phone_one_line', async page => {
  await writeSave(page, PARTY);
  await startBattle(page, 'samerica', 1);
  const top = await rect(page, '.rpg-btop');
  assert.ok(top.height <= 58, `上の列の高さ ${top.height}`);   // 約56px
  assert.ok((await rect(page, '#bt-flee')).height >= 24, `［にげる］の高さ ${(await rect(page, '#bt-flee')).height} が 24px より低い（押しにくい）`);
  assert.equal(await page.isVisible('.rpg-flagtext'), true);
  assert.match(await page.innerText('.rpg-flagtext'), /旗/);
  assert.equal(await page.locator('#bt-flags .rpg-cloth:visible').count(), 0);   // 旗の列は「旗 n/N」の文字だけ
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
  assert.equal(await page.isVisible('#bt-mon .rpg-bosstag'), true);
  const tag = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.rpg-bosstag')).fontSize));
  assert.ok(tag >= 8.8, `BOSS の札の文字 ${tag}px が小さすぎる`);   // .55rem
  assert.ok((await rect(page, '.rpg-bosstag')).bottom <= boss.bottom, 'BOSS の札が上の列からはみ出る');
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
  await writeSave(page, saveWith({ coins: 1000, cards: { jp: [3, 4], cf: [2, 2], vc: [1, 1] }, fr: { cf: 10, vc: 7 } }));
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
}, { colorScheme: 'dark', timeout: 180_000 });
