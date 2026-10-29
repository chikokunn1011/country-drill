// 豆知識（trivia.js）。練習・挑戦で正解したときの答え合わせに1つ、図鑑の詳細（一覧・地図）に全部。まちがえたとき・タイムアタックには出さない。
// 文字は esc() を通す。trivia.js が読めない・形がおかしいときは豆知識の欄が出ないだけ。PC では答えの列（≥1280）と下の帯（900〜1279）に収まるか
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerCorrect, answerWrong, clearTimeAttack } from './helpers.mjs';
import { settleLayout } from './layout.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで開き、最後にページで例外が出ていないかも見る。opts は openApp にそのまま渡す
const t = (name, fn, opts = {}, timeout = 30_000) => test(name, { timeout }, async () => {
  const app = await openApp(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const LABEL = { flag: '🏳️ 国旗', geo: '🗺️ 地理', culture: '🍜 文化' };
const count = (page, sel) => page.locator(sel).count();
const vpName = ({ width, height }) => `${width}x${height}`;

// 練習（kind）・mode・全世界・5問を始めて、選択肢が出るまで待つ
async function start(page, { mode = 'f2n', kind = 'practice' } = {}) {
  await pickSetup(page, { mode, kind, region: 'all', count: 5 });
  await page.click('#start');
  await page.waitForSelector('#qcard .choice');
}
// その国を今の問題にする（国を固定）
const fix = (page, a) => page.evaluate(a => { G.queue.unshift(byA.get(a)); nextQuestion(); }, a);
// 正解して、答え合わせが出るまで待つ
async function correct(page) {
  await answerCorrect(page);
  await page.waitForSelector('#next');
}
// 豆知識の各行。label は種類のラベル（無ければ null）、t はラベルを除いた文、title は title 属性
const tvs = (page, sel) => page.$$eval(sel, els => els.map(li => {
  const lab = li.querySelector(':scope > .tv-k');
  return { k: li.dataset.k, label: lab ? lab.textContent : null, t: [...li.childNodes].filter(n => n !== lab).map(n => n.textContent).join(''), title: li.title };
}));
const triviaOf = (page, a) => page.evaluate(a => TRIVIA[a], a);
const expected = list => list.map(({ k, t }) => ({ k, label: LABEL[k], t, title: t }));
// 図鑑の一覧でその国のカードを押して詳細を開く
async function openDetail(page, a) {
  if (await page.isHidden('#scr-book')) await page.evaluate(() => show('book'));
  await page.click('#bview button[data-v="list"]');
  await page.click(`#grid .card[data-a="${a}"]`);
  await page.waitForSelector('#detail[open]');
}
const closeDetail = page => page.evaluate(() => $('detail').close());
async function openBookMap(page) {
  if (await page.isHidden('#scr-book')) await page.evaluate(() => show('book'));
  await page.click('#bview button[data-v="map"]');
  await page.waitForSelector('#bmapbox svg path');
}

/* ---------- クイズの答え合わせ ---------- */
t('correct_shows_one', async page => {
  await start(page);
  await correct(page);
  assert.equal(await count(page, '.reveal .trivia .tv'), 1);
  assert.equal(await count(page, '.reveal > .facts + .trivia'), 1);
  const a = await page.evaluate(() => G.cur.c.a), [tv] = await tvs(page, '.reveal .trivia .tv');
  assert.ok((await triviaOf(page, a)).some(x => x.k === tv.k && x.t === tv.t), `TRIVIA.${a} にない: ${JSON.stringify(tv)}`);
  assert.equal(tv.label, LABEL[tv.k]);
  assert.equal(tv.title, tv.t);
});

t('wrong_shows_none', async page => {
  await start(page);
  const a = await page.evaluate(() => G.cur.c.a);
  await answerWrong(page);
  await page.waitForSelector('#next');
  assert.equal(await count(page, '.reveal'), 1);
  assert.equal(await count(page, '.trivia'), 0);
  // 練習でまちがえた国は後半にもう一度出る。そこまで正解で進める
  for (let i = 0; ; i++) {
    await page.click('#next');
    await page.waitForSelector('#qcard .choice:not(:disabled)');
    if (await page.evaluate(() => G.cur.c.a) === a) break;
    assert.ok(i < 10, `${a} がもう一度出ない`);
    await correct(page);
  }
  await correct(page);
  assert.equal(await count(page, '.reveal .trivia .tv'), 1);
});

t('challenge_shows', async page => {
  await start(page, { kind: 'challenge' });
  await correct(page);
  assert.equal(await count(page, '.reveal .trivia .tv'), 1);
});

t('ta_never_shows', async page => {
  await start(page, { kind: 'ta' });
  await answerCorrect(page);
  await page.waitForFunction(() => G.done === 1);
  assert.equal(await count(page, '.trivia'), 0);
  await answerWrong(page);
  await page.waitForSelector('#next');
  assert.match(await page.locator('.reveal .verdict').innerText(), /失格/);
  assert.equal(await count(page, '.trivia'), 0);
  await clearTimeAttack(page);
  assert.equal(await count(page, '.trivia'), 0);
});

t('pick_avoids_last', async page => {
  const r = await page.evaluate(() => {
    TRIVIA.zz = [{ k: 'geo', t: 'A' }, { k: 'geo', t: 'B' }];
    TRIVIA.yy = [{ k: 'flag', t: 'only' }];
    return { zz: Array.from({ length: 50 }, () => pickTrivia('zz').t), yy: Array.from({ length: 10 }, () => pickTrivia('yy')), nope: pickTrivia('nope') };
  });
  assert.ok(r.zz.every((t, i) => i === 0 || t !== r.zz[i - 1]), `続けて同じ文: ${r.zz.join('')}`);
  assert.deepEqual(r.yy, Array(10).fill({ k: 'flag', t: 'only' }));
  assert.equal(r.nope, null);
});

/* ---------- 図鑑の詳細 ---------- */
t('book_list_all', async page => {
  await page.click('#home-book');
  await openDetail(page, 'jp');
  assert.deepEqual(await tvs(page, '#detail .trivia .tv'), expected(await triviaOf(page, 'jp')));
  assert.equal(await count(page, '#detail-inner > .close + .facts + .cpage + .trivia + svg.map'), 1); // 閉じる・国の情報・国のページへ・豆知識・地図の順
});

t('book_map_all', async page => {
  await page.click('#home-book');
  await openBookMap(page);
  await page.evaluate(() => selectBook('br', true));
  assert.deepEqual(await tvs(page, '#binfo .trivia .tv'), expected(await triviaOf(page, 'br')));
  // 検索で1件にしぼったときの自動選択
  await page.fill('#q', '日本');
  await page.waitForFunction(() => $('bcount').textContent === '1か国');
  assert.equal(await page.evaluate(() => bsel), 'jp');
  assert.deepEqual(await tvs(page, '#binfo .trivia .tv'), expected(await triviaOf(page, 'jp')));
});

/* ---------- 文字のエスケープ・データが無い／おかしい ---------- */
t('trivia_escaped', async page => {
  await start(page);
  await page.evaluate(() => { TRIVIA[G.cur.c.a] = [{ k: 'geo', t: '<b>x</b>&' }]; });
  await correct(page);
  assert.equal(await count(page, '.trivia b'), 0);
  assert.deepEqual(await tvs(page, '.reveal .trivia .tv'), expected([{ k: 'geo', t: '<b>x</b>&' }]));
  assert.match(await page.locator('.reveal .trivia').innerText(), /<b>x<\/b>&/);
  // 種類（data-k）もエスケープする
  await page.evaluate(() => { TRIVIA.jp = [{ k: '"><b>y</b>', t: 'z' }]; });
  await openDetail(page, 'jp');
  assert.equal(await count(page, '#detail b'), 0);
  assert.deepEqual(await tvs(page, '#detail .trivia .tv'), [{ k: '"><b>y</b>', label: null, t: 'z', title: 'z' }]);
});

t('missing_country_no_trivia', async page => {
  await start(page);
  const a = await page.evaluate(() => { const a = G.cur.c.a; delete TRIVIA[a]; return a; });
  await correct(page);
  assert.equal(await count(page, '.reveal .facts'), 1);
  assert.equal(await count(page, '.trivia'), 0);
  await openDetail(page, a);
  assert.equal(await count(page, '#detail .facts'), 1);
  assert.equal(await count(page, '#detail .trivia'), 0);
  await closeDetail(page);
  await openBookMap(page);
  await page.evaluate(a => selectBook(a, true), a);
  assert.equal(await count(page, '#binfo .facts'), 1);
  assert.equal(await count(page, '#binfo .trivia'), 0);
});

t('malformed_trivia_ignored', async page => {
  await page.evaluate(() => { TRIVIA.jp = 'oops'; TRIVIA.br = [null, { k: 'geo' }, { k: 'x', t: 'ok' }]; });
  const ok = [{ k: 'x', label: null, t: 'ok', title: 'ok' }];
  await page.click('#home-book');
  await openDetail(page, 'jp');
  assert.equal(await count(page, '#detail .facts'), 1);
  assert.equal(await count(page, '#detail .trivia'), 0);
  await closeDetail(page);
  await openDetail(page, 'br');
  assert.deepEqual(await tvs(page, '#detail .trivia .tv'), ok);
  await closeDetail(page);
  await start(page);
  await fix(page, 'jp');
  await correct(page);
  assert.equal(await count(page, '.reveal .facts'), 1);
  assert.equal(await count(page, '#qcard .trivia'), 0); // 閉じた #detail には br の豆知識が残っているので、クイズの中だけ数える
  await fix(page, 'br');
  await correct(page);
  assert.deepEqual(await tvs(page, '.reveal .trivia .tv'), ok);
});

t('works_without_trivia_js', async page => {
  await page.route('**/trivia.js', r => r.abort());
  await page.reload();
  assert.equal(await page.evaluate(() => window.TRIVIA === undefined), true);
  await start(page);
  await correct(page);
  assert.equal(await count(page, '.reveal .facts'), 1);
  assert.equal(await count(page, '.trivia'), 0);
  await openDetail(page, 'jp');
  assert.equal(await count(page, '#detail .facts'), 1);
  assert.equal(await count(page, '#detail .trivia'), 0);
  await closeDetail(page);
  await openBookMap(page);
  await page.evaluate(() => selectBook('br', true));
  assert.equal(await count(page, '#binfo .facts'), 1);
  assert.equal(await count(page, '#binfo .trivia'), 0);
});

/* ---------- スマホ（〜899px）で横に広がらない ---------- */
// いちばん長い豆知識でも、正解したときにクイズの欄が横に広がらず、問題の国旗と選択肢が動かない。図鑑の地図で国を押しても地図の欄が広がらない
// （位置はページの先頭から。答えたあとや地図を押したあとのスクロールでは差にしない）
t('phone_answer_no_widen', async page => {
  const rects = sels => page.evaluate(sels => Object.fromEntries(Object.entries(sels).map(([k, s]) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return [k, { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }];
  })), sels);
  const problems = [], diff = (key, before, after, props = {}) => {
    for (const [k, r] of Object.entries(before)) for (const p of props[k] ?? ['x', 'y', 'width', 'height'])
      if (Math.abs(after[k][p] - r[p]) > 0.5) problems.push(`${key} ${k}.${p} ${r[p]} → ${after[k][p]}`);
  };
  const longest = await page.evaluate(() => Object.values(TRIVIA).flat().reduce((x, y) => y.t.length > x.t.length ? y : x));
  const QUIZ = { scr: '#scr-quiz', qflag: '#qcard .qflag', choice: '#qcard .choice' };
  for (const viewport of [{ width: 390, height: 844 }, { width: 600, height: 900 }, { width: 899, height: 900 }]) {
    await page.setViewportSize(viewport);
    await start(page);
    await fix(page, 'jp');
    await page.evaluate(t => { TRIVIA.jp = [t]; }, longest);
    await settleLayout(page);
    const before = await rects(QUIZ);
    await correct(page);
    await settleLayout(page);
    assert.equal(await count(page, '.reveal .trivia .tv'), 1);
    diff(`${vpName(viewport)} f2n`, before, await rects(QUIZ), { scr: ['x', 'width'] });
  }
  // 図鑑の地図（899×900）: 情報欄に豆知識が出ても地図の欄の大きさが変わらない
  await openBookMap(page);
  await settleLayout(page);
  const before = await rects({ box: '#bmapbox' });
  await page.locator('#bmapbox path[data-a="jp"]').first().dispatchEvent('click');
  await settleLayout(page);
  assert.equal(await count(page, '#binfo .trivia .tv'), 1);
  diff('899x900 book_map', before, await rects({ box: '#bmapbox' }));
  assert.deepEqual(problems, []);
}, { viewport: { width: 390, height: 844 }, seed: 1, reducedMotion: 'reduce' }, 60_000);

/* ---------- PC で収まるか ---------- */
// 国名がいちばん長い国（vc）と首都がいちばん長い国（lk）を順に今の問題にし、豆知識を全データでいちばん長い文1件にして正解する。
// 答え合わせが画面とカードに収まるか見て、収まらないところを返す（1px までの誤差は許す）
async function checkFit(page) {
  const out = [];
  for (const a of ['vc', 'lk']) {
    await fix(page, a);
    await page.evaluate(a => { TRIVIA[a] = [Object.values(TRIVIA).flat().reduce((x, y) => y.t.length > x.t.length ? y : x)]; }, a);
    await correct(page);
    await settleLayout(page);
    const m = await page.evaluate(() => {
      const box = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      const rv = document.querySelector('#qcard > .reveal'), tr = rv.querySelector(':scope > .trivia'), map = rv.querySelector(':scope > .map');
      return { docH: document.documentElement.scrollHeight, ih: innerHeight, card: box($('qcard')), next: box($('next')), reveal: box(rv),
        facts: box(rv.querySelector(':scope > .facts')), trivia: tr && box(tr), map: map && box(map),
        kids: [...rv.children].map(el => ({ name: el.getAttribute('class'), ...box(el) })) };
    });
    const bad = (ok, what) => { if (!ok) out.push(`${a}: ${what}`); };
    bad(m.docH <= m.ih + 1, `縦スクロール ${m.docH}/${m.ih}`);
    bad(m.card.bottom <= m.ih + 1, `#qcard.bottom ${m.card.bottom} > ${m.ih}`);
    bad(m.next.bottom <= m.ih + 1, `#next.bottom ${m.next.bottom} > ${m.ih}`);
    for (const k of m.kids) bad(k.top >= m.card.top - 1 && k.bottom <= m.card.bottom + 1, `.${k.name} ${k.top}〜${k.bottom} が #qcard ${m.card.top}〜${m.card.bottom} の外`);
    if (!m.trivia) { bad(false, '.trivia が無い'); continue; }
    bad(m.facts.bottom <= m.trivia.top + 1, `.facts.bottom ${m.facts.bottom} > .trivia.top ${m.trivia.top}`);
    bad(m.trivia.bottom <= m.reveal.bottom + 1, `.trivia.bottom ${m.trivia.bottom} > .reveal.bottom ${m.reveal.bottom}`);
    // 収まらないときは地図を小さくする（縦につぶれて 16:9 でなくなるのはだめ）
    if (m.map?.width) bad(m.map.height >= m.map.width * 9 / 16 - 1, `.map ${m.map.width}x${m.map.height} が 16:9 でない`);
  }
  return out;
}
// 1つのページで大きさを変えながら、4モード × ドパガキ向け OFF／ON で checkFit
async function fitsAll(page, sizes) {
  const problems = [];
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    for (const dopa of [false, true]) {
      await page.evaluate(dopa => { S.dopa = dopa; applyDopa(); }, dopa);
      for (const mode of ['f2n', 'n2f', 'm2f', 'f2m']) {
        await start(page, { mode });
        for (const p of await checkFit(page)) problems.push(`${vpName(viewport)} ${mode}${dopa ? ' dopa' : ''} ${p}`);
      }
    }
  }
  assert.deepEqual(problems, []);
}
const FIT_OPTS = { seed: 1, reducedMotion: 'reduce' };
// 1920×1080 の 150% 表示・1366×768 のブラウザの枠ぶん・1536×864 の枠ぶん・1366×768（ふつうの PC）・1920×1080
t('fits_pc', page => fitsAll(page, [[1280, 577], [1366, 657], [1366, 768], [1536, 730], [1920, 1080]].map(([width, height]) => ({ width, height }))), FIT_OPTS, 180_000);
t('fits_strip', page => fitsAll(page, [{ width: 900, height: 700 }, { width: 1024, height: 768 }]), FIT_OPTS, 180_000);

// 豆知識が4件ある国のうち「国名＋4件の文」の文字数がいちばん多い国
const wordiest = page => page.evaluate(() => Object.entries(TRIVIA).filter(([, v]) => v.length === 4)
  .map(([a, v]) => [a, byA.get(a).n.length + v.reduce((n, x) => n + x.t.length, 0)])
  .reduce((x, y) => y[1] > x[1] ? y : x)[0]);
// 図鑑の地図（PC）: 豆知識が4件で文字のいちばん多い国でも、情報欄の先頭が欄の上で切れず、ページは縦にスクロールしない
t('book_map_fits_pc', async page => {
  const a = await wordiest(page);
  await page.click('#home-book');
  await openBookMap(page);
  const problems = [];
  for (const viewport of [{ width: 1280, height: 577 }, { width: 1366, height: 657 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(a => selectBook(a, true), a);
    await settleLayout(page);
    const m = await page.evaluate(() => ({ facts: document.querySelector('#binfo .facts').getBoundingClientRect().top, info: $('binfo').getBoundingClientRect().top,
      tvs: document.querySelectorAll('#binfo .trivia .tv').length, docH: document.documentElement.scrollHeight, ih: innerHeight }));
    const key = `${vpName(viewport)} ${a}`;
    if (m.tvs !== 4) problems.push(`${key}: .tv が ${m.tvs} 件`);
    if (!(m.facts >= m.info - 1)) problems.push(`${key}: .facts.top ${m.facts} < #binfo.top ${m.info}`);
    if (!(m.docH <= m.ih + 1)) problems.push(`${key}: 縦スクロール ${m.docH}/${m.ih}`);
  }
  assert.deepEqual(problems, []);
}, { viewport: { width: 1280, height: 577 }, ...FIT_OPTS });

// 図鑑の地図（PC）: 情報欄を下までスクロールしたあとで別の国を押しても、検索で1件にしぼっても、新しい国は情報欄の先頭から見える
t('book_map_scroll_resets', async page => {
  const a = await wordiest(page), problems = [];
  await page.click('#home-book');
  await openBookMap(page);
  // 文字のいちばん多い国を出して、情報欄をいちばん下までスクロールする
  const scrollDown = async key => {
    const top = await page.evaluate(a => { selectBook(a, true); $('binfo').scrollTop = 1e6; return $('binfo').scrollTop; }, a);
    if (!(top > 0)) problems.push(`${key}: ${a} で情報欄がスクロールしない`);
  };
  const check = async key => {
    await settleLayout(page);
    const m = await page.evaluate(() => ({ st: $('binfo').scrollTop, facts: document.querySelector('#binfo .facts').getBoundingClientRect().top, info: $('binfo').getBoundingClientRect().top }));
    if (m.st !== 0) problems.push(`${key}: scrollTop ${m.st}`);
    if (!(m.facts >= m.info - 1)) problems.push(`${key}: .facts.top ${m.facts} < #binfo.top ${m.info}`);
  };
  for (const viewport of [{ width: 1280, height: 577 }, { width: 1366, height: 657 }, { width: 1024, height: 768 }]) {
    const key = vpName(viewport);
    await page.setViewportSize(viewport);
    await settleLayout(page);
    await scrollDown(key);
    await page.locator('#bmapbox [data-a="nz"]').first().dispatchEvent('click');
    assert.equal(await page.evaluate(() => bsel), 'nz');
    await check(`${key} nz をタップ`);
    // 検索で1件にしぼったときの自動選択
    await scrollDown(key);
    await page.fill('#q', '日本');
    await page.waitForFunction(() => $('bcount').textContent === '1か国');
    assert.equal(await page.evaluate(() => bsel), 'jp');
    await check(`${key} 検索で jp`);
    await page.fill('#q', '');
    await page.waitForFunction(() => $('bcount').textContent !== '1か国');
  }
  assert.deepEqual(problems, []);
}, { viewport: { width: 1280, height: 577 }, ...FIT_OPTS });
