// PC 全画面レイアウト。計測の場面がちゃんとその画面まで進むか、スマホ幅の見た目が変わっていないか、PC で画面に収まるか
// （phone_geometry_unchanged は GEOM_BASE=auto などを指定したときだけ。全要素の位置を変更前のコミットと比べる）
// PC の大きさは PC_VIEWPORTS（例: PC_VIEWPORTS=1280x720,1440x900）で変えられる
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { startServer, openApp, pickSetup, answerCorrect, answerWrong, clearTimeAttack, PHONE, QUIET_BADGES } from './helpers.mjs';
import { SCENES, openScene, settleLayout, measureFit, rectOf, pageGeometry, parseViewports, resolveGeomBase, extractTree } from './layout.mjs';
import { RPG_FILES } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 場面の名前 → 見えているはずの画面
const SCREEN_OF = [
  [/^home$/, 'home'], [/^settings$/, 'settings'], [/^setup/, 'setup'],
  [/^(quiz|reveal|wrong|named|long)_|^ta_quiz$|^ta_fail/, 'quiz'],
  [/^result|^ta_result$/, 'result'], [/^ranking$/, 'ranking'], [/^book_/, 'book'],
  [/^rpg_/, 'rpg'], [/^battle_/, 'battle'], [/^gacha_/, 'gacha'], [/^cards$/, 'cards'],
];
const screenOf = scene => SCREEN_OF.find(([re]) => re.test(scene))?.[1];

test('scenes_reach_their_screen', { timeout: 180_000 }, async () => {
  const problems = [];
  for (const scene of Object.keys(SCENES)) {
    const check = (ok, what) => { if (!ok) problems.push(`${scene}: ${what}`); };
    let app;
    try {
      app = await openScene(browser, { scene, viewport: PHONE });
      const { page } = app, count = sel => page.locator(sel).count();
      const screen = screenOf(scene);
      check(screen, '見えているはずの画面が決まっていない（SCREEN_OF に足す）');
      if (screen) check(await page.isVisible(`#scr-${screen}`), `#scr-${screen} が見えていない`);
      if (/^(reveal|wrong|named|long)_|^ta_fail/.test(scene)) check(await page.isVisible('#next'), '#next が見えていない');
      if (/^named_/.test(scene)) check(await count('.cname') === 4, '.cname が4つでない');
      if (scene === 'long_f2n') check(await page.evaluate(() => G.cur.c.a) === 'kn', '今の問題が kn でない');
      if (scene === 'long_n2f') check(await page.evaluate(() => G.cur.c.a) === 'vc', '今の問題が vc でない');
      if (scene === 'ta_result') check(await page.locator('#ta-time').innerText() === '12.34秒', '#ta-time が 12.34秒 でない');
      if (scene === 'ranking') check(await count('#rk-list li') === 3, '#rk-list li が3つでない');
      if (scene === 'book_map') check(await count('#binfo .facts') > 0, '#binfo .facts がない');
      if (scene === 'book_detail') check(await count('#detail[open]') === 1, '#detail[open] が1つでない');
      check(!app.errors.length, `ページで例外: ${app.errors.map(String).join(' | ')}`);
    } catch (e) { problems.push(`${scene}: ${e.message.split('\n')[0]}`); }
    finally { await app?.close(); }
  }
  assert.deepEqual(problems, []);
});

test('phone_geometry_unchanged', { skip: !process.env.GEOM_BASE && 'GEOM_BASE を指定したときだけ動かす', timeout: 900_000 }, async () => {
  const root = await extractTree(resolveGeomBase(process.env.GEOM_BASE));
  const base = await startServer({ root });
  const geometry = async (url, scene, viewport) => {
    const app = await openScene(browser, { scene, viewport, url });
    try { return await pageGeometry(app.page); } finally { await app.close(); }
  };
  try {
    const diffs = [];
    for (const viewport of parseViewports(process.env.GEOM_VIEWPORTS ?? '390x844,899x900')) {
      for (const scene of Object.keys(SCENES)) {
        const key = `${viewport.width}x${viewport.height} ${scene}`;
        try {
          const old = await geometry(base.url, scene, viewport), now = await geometry(server.url, scene, viewport);
          const i = old.findIndex((line, i) => line !== now[i]), at = i < 0 && now.length > old.length ? old.length : i;
          if (at < 0) continue;
          diffs.push({ key, old: old[at] ?? '(なし)', now: now[at] ?? '(なし)', ...(old.length !== now.length && { lines: `${old.length} → ${now.length}` }) });
        } catch (e) { diffs.push({ key, error: e.message.split('\n')[0] }); }
      }
    }
    assert.deepEqual(diffs, []);
  } finally {
    await base.close();
    await rm(root, { recursive: true, force: true });
  }
});

/* ---------- PC レイアウトの差し込み口（スマホでは見た目を変えない） ---------- */
const noErrors = app => assert.deepEqual(app.errors.map(String), []);
// 練習（kind）・国旗→国名・全世界・5問を始めて、選択肢が出るまで待つ
async function startF2n(page, kind) {
  await pickSetup(page, { mode: 'f2n', kind, region: 'all', count: 5 });
  await page.click('#start');
  await page.waitForSelector('#qcard .choice');
}
// #qcard の中の答えの場所（.rslot か .reveal）が、カードの最後の子か
const lastInCard = (page, sel) => page.evaluate(sel => document.querySelector(sel) === $('qcard').lastChild, sel);

test('screen_attr', async () => {
  const app = await openApp(browser);
  try {
    const { page } = app, screen = () => page.evaluate(() => document.body.dataset.screen);
    assert.equal(await screen(), 'home');
    await page.click('#home-play');
    assert.equal(await screen(), 'setup');
    await page.click('#start');
    assert.equal(await screen(), 'quiz');
    await page.evaluate(() => show('ranking'));
    assert.equal(await screen(), 'ranking');
    await page.evaluate(() => show('book'));
    assert.equal(await screen(), 'book');
    noErrors(app);
  } finally { await app.close(); }
});

test('rslot_before_answer', async () => {
  const app = await openApp(browser);
  try {
    const { page } = app, count = sel => page.locator(sel).count();
    await startF2n(page, 'practice');
    assert.equal(await count('#qcard > .rslot'), 1);
    assert.ok(await lastInCard(page, '#qcard > .rslot'), '.rslot が #qcard の最後の子でない');
    assert.equal(await page.getAttribute('#qcard > .rslot', 'aria-hidden'), 'true');
    const text = await page.evaluate(() => document.querySelector('#qcard > .rslot').textContent);
    assert.match(text, /答えたら、ここに国のプロフィールが出るよ/);
    assert.match(text, /キーでも答えられる/);
    assert.equal(await count('#qcard > .rslot kbd'), 3); // 選択肢にも kbd があるので .rslot の中だけ数える
    assert.equal(await page.isVisible('.rslot'), false); // スマホでは出さない
    await answerCorrect(page);
    await page.waitForSelector('#next');
    assert.equal(await count('.rslot'), 0);
    assert.equal(await count('#qcard > .reveal'), 1);
    assert.ok(await lastInCard(page, '#qcard > .reveal'), '.reveal が #qcard の最後の子でない');
    await page.click('#next');
    await page.waitForSelector('#qcard .choice:not(:disabled)');
    assert.equal(await count('.rslot'), 1);
    noErrors(app);
  } finally { await app.close(); }
});

test('rslot_ta_fail', async () => {
  const app = await openApp(browser);
  try {
    const { page } = app;
    const hint = () => page.evaluate(() => document.querySelector('#qcard > .rslot .rslot-hint').textContent);
    await startF2n(page, 'ta');
    assert.equal(await page.locator('#qcard > .rslot').count(), 1); // 失格の .reveal もこれと置きかわる
    // タイムアタックは正解だと答えを出さずに次へ進むので、プロフィールが出ると書かない
    assert.equal(await hint(), 'まちがえたら、ここに正解が出るよ');
    await answerCorrect(page);
    await page.waitForFunction(() => G.done === 1 && !G.answered);
    assert.equal(await hint(), 'まちがえたら、ここに正解が出るよ');
    await answerWrong(page);
    await page.waitForSelector('#next');
    assert.equal(await page.locator('.rslot').count(), 0);
    assert.match(await page.locator('.reveal').innerText(), /失格/);
    assert.ok(await lastInCard(page, '#qcard > .reveal'), '.reveal が #qcard の最後の子でない');
    noErrors(app);
  } finally { await app.close(); }
});

test('rside_contents', { timeout: 120_000 }, async () => {
  const scene = async (name, check, opts = {}) => {
    const app = await openScene(browser, { scene: name, viewport: PHONE, ...opts });
    try { await check(app.page, sel => app.page.locator(sel).count()); noErrors(app); } finally { await app.close(); }
  };
  await scene('result_miss', async (page, count) => {
    assert.equal(await count('#rcard > #r-side.rside'), 1);
    assert.equal(await count('#r-side .misslist'), 1);
    assert.deepEqual(await page.evaluate(() => [$('r-side').previousElementSibling.matches('.result'), $('r-side').nextElementSibling.matches('.row.center')]), [true, true]);
  });
  await scene('result', async page => {
    assert.equal(await page.evaluate(() => $('r-side').children.length === 1 && $('r-ext').childNodes.length === 0), true); // ノーミスなら中身は空の #r-ext だけ（右列は出ない）
  }, { blockScripts: RPG_FILES });
  await scene('ta_result', async (page, count) => {
    assert.equal(await count('#r-side .tabox #ta-form'), 1);
    assert.equal(await count('#r-side #ta-rank'), 0); // 順位相当はスマホの並びを変えないため .stats のまま
    assert.equal(await count('.result .stats #ta-rank'), 1);
  });
});

test('topbar_extra_slot', async () => {
  const app = await openApp(browser, { blockScripts: RPG_FILES });
  try {
    const { page } = app;
    assert.equal(await page.locator('#topbar-extra').count(), 1);
    assert.deepEqual(await page.evaluate(() => {
      const x = $('topbar-extra');
      return { parent: x.parentElement.id, nodes: x.childNodes.length, prev: x.previousElementSibling.id, links: !!x.nextElementSibling.querySelector('#to-book') };
    }), { parent: 'topbar', nodes: 0, prev: 'brand', links: true });
    noErrors(app);
  } finally { await app.close(); }
});

test('kinds_field_id', async () => {
  const app = await openApp(browser);
  try {
    assert.equal(await app.page.locator('#kinds-field #kinds').count(), 1);
    noErrors(app);
  } finally { await app.close(); }
});

// 1〜4 キーで答えると #next にフォーカスが移り、Enter で次の問題へ進む（Task 3 が PC の大きさでも呼ぶ）
async function checkKeysAndFocus(viewport, { focusVisible = false } = {}) {
  const app = await openApp(browser, { viewport });
  try {
    const { page } = app;
    await startF2n(page, 'practice');
    const n = await page.evaluate(() => [...document.querySelectorAll('.choice')].findIndex(b => b.dataset.a === G.cur.c.a) + 1);
    await page.keyboard.press(String(n));
    await page.waitForSelector('#qcard > .reveal');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'next');
    if (focusVisible) assert.equal(await page.evaluate(() => document.activeElement.matches(':focus-visible')), true);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#next', { state: 'detached' });
    assert.equal(await page.locator('.choice:disabled').count(), 0);
    assert.equal(await page.locator('.rslot').count(), 1);
    noErrors(app);
  } finally { await app.close(); }
}
test('keys_and_focus', () => checkKeysAndFocus(PHONE));

/* ---------- PC レイアウト（pc.css。900px 以上） ---------- */
const PC_VIEWPORTS = parseViewports(process.env.PC_VIEWPORTS ?? '1024x768,1366x657,1366x768,1920x1080');
const W1366 = { width: 1366, height: 768 }, W1024 = { width: 1024, height: 768 };
const vpName = ({ width, height }) => `${width}x${height}`;
const SCENE_NAMES = Object.keys(SCENES);
// クイズの画面（答える前・答えたあと・失格）
const QUIZ_SCENES = SCENE_NAMES.filter(s => /^(quiz|reveal|wrong|named|long)_|^ta_quiz$|^ta_fail/.test(s));
// 縦にスクロールしてはいけない画面（一覧の画面と図鑑の詳細はスクロールしてよい）
const NO_SCROLL_SCENES = ['home', 'settings', 'setup', 'setup_ta', 'result', 'result_miss', 'ta_result', 'book_map', ...QUIZ_SCENES];
// ドパガキ向けは選択肢の枠が 1.5px → 2px になるので、クイズは全部の場面で確かめる（設計書 9章 2）
const DOPA_SCENES = [...QUIZ_SCENES, 'result'];

// measureFit の結果のうち、収まっていないところ（空なら収まっている）
function fits(m, scene) {
  const out = [];
  if (m.hscroll) out.push('横スクロール');
  if (NO_SCROLL_SCENES.includes(scene) && m.docH > m.ih) out.push(`縦スクロール ${m.docH}/${m.ih}`);
  if (m.card) {
    if (m.card.bottom > m.ih) out.push(`card.bottom ${m.card.bottom} > ${m.ih}`);
    if (m.card.nextBottom > m.ih) out.push(`card.nextBottom ${m.card.nextBottom} > ${m.ih}`);
    if (m.card.overflow > 1) out.push(`card.overflow ${m.card.overflow}px`);
  }
  return out;
}
// 場面を開いて fits と例外を見て、問題を "<WxH> <scene>[ dopa]: <問題>" で problems に足す
async function checkFit(problems, scene, viewport, dopa = false) {
  const key = `${vpName(viewport)} ${scene}${dopa ? ' dopa' : ''}`;
  let app;
  try {
    app = await openScene(browser, { scene, viewport, dopa });
    for (const p of fits(await measureFit(app.page), scene)) problems.push(`${key}: ${p}`);
    if (dopa && !await app.page.evaluate(() => document.body.classList.contains('dopa'))) problems.push(`${key}: body.dopa になっていない`);
    if (app.errors.length) problems.push(`${key}: ページで例外 ${app.errors.map(String).join(' | ')}`);
  } catch (e) { problems.push(`${key}: ${e.message.split('\n')[0]}`); }
  finally { await app?.close(); }
}
// 場面を開いて check(page) を呼ぶ。最後に例外が無いのも見る
async function inScene(scene, viewport, check, opts = {}) {
  const app = await openScene(browser, { scene, viewport, ...opts });
  try { await check(app.page); noErrors(app); } finally { await app.close(); }
}
const rects = (page, ...sels) => Promise.all(sels.map(s => rectOf(page, s)));
const json = o => JSON.stringify(o);

for (const viewport of PC_VIEWPORTS) {
  test(`pc_fit_${vpName(viewport)}`, { timeout: 600_000 }, async () => {
    const problems = [];
    for (const scene of SCENE_NAMES) await checkFit(problems, scene, viewport);
    for (const scene of DOPA_SCENES) await checkFit(problems, scene, viewport, true);
    assert.deepEqual(problems, []);
  });
}

// 答える前と後で、問題と選択肢が動かない（設計書 9章 3）
const ANSWER_CASES = [
  ['練習 f2n 正解', { mode: 'f2n', kind: 'practice' }, answerCorrect],
  ['練習 n2f 不正解', { mode: 'n2f', kind: 'practice' }, answerWrong],
  ['練習 m2f 国名表示 ON 不正解', { mode: 'm2f', kind: 'practice', named: true }, answerWrong],
  ['練習 f2m 正解', { mode: 'f2m', kind: 'practice' }, answerCorrect],
  ['タイムアタック f2n 不正解', { mode: 'f2n', kind: 'ta' }, answerWrong],
];
test('answer_does_not_move', { timeout: 300_000 }, async () => {
  const problems = [];
  for (const viewport of PC_VIEWPORTS) for (const [name, { mode, kind, named }, answer] of ANSWER_CASES) {
    const key = `${vpName(viewport)} ${name}`;
    const app = await openApp(browser, { viewport, seed: 1, reducedMotion: 'reduce' });
    try {
      const { page } = app, parts = () => rects(page, '#qcard > .qmain', '#qcard > .choices');
      await pickSetup(page, { mode, kind, region: 'all', count: 5 });
      if (named) await page.check('#nameopt');
      await page.click('#start');
      await page.waitForSelector('#qcard .choice');
      await settleLayout(page);
      const before = await parts();
      await answer(page);
      await page.waitForSelector('#next');
      await settleLayout(page);
      const after = await parts();
      // rectOf は要素が無いと null を返し、[null, null] どうしも等しくなってしまうので、先に有無を見る
      if (before.some(r => !r)) problems.push(`${key}: 答える前に .qmain/.choices が無い`);
      if (after.some(r => !r)) problems.push(`${key}: 答えたあとに .qmain/.choices が無い`);
      if (!isDeepStrictEqual(before, after)) problems.push(`${key}: ${json(before)} → ${json(after)}`);
      if (app.errors.length) problems.push(`${key}: ページで例外 ${app.errors.map(String).join(' | ')}`);
    } catch (e) { problems.push(`${key}: ${e.message.split('\n')[0]}`); }
    finally { await app.close(); }
  }
  assert.deepEqual(problems, []);
});

// 1366×768 は横に並ぶ（≥1280）、1024×768 は縦に積む（900〜1279）
test('tier_layouts', { timeout: 180_000 }, async () => {
  await inScene('home', W1366, async page => {
    const [flags, h1] = await rects(page, '#home-flags', '.home h1');
    assert.ok(flags.left > h1.right, `home 1366: ${json({ flags, h1 })}`);
  });
  await inScene('home', W1024, async page => {
    const [flags, h1] = await rects(page, '#home-flags', '.home h1');
    assert.ok(flags.top > h1.bottom, `home 1024: ${json({ flags, h1 })}`);
  });
  await inScene('quiz_f2n', W1366, async page => {
    const [slot, ch] = await rects(page, '#qcard > .rslot', '#qcard > .choices');
    assert.ok(slot.left > ch.right, `quiz 1366: ${json({ slot, ch })}`);
    assert.equal(await page.isVisible('.rslot'), true);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('footer')).display), 'none');
    // トップバーは1行（設計書 3.2）: ロゴの英字はロゴの右、進み具合と「やめて…」も同じ行
    const bar = await page.evaluate(() => {
      const brand = $('brand'), small = brand.querySelector('small');
      const text = [...brand.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      const range = document.createRange();
      range.selectNodeContents(text);
      const t = range.getBoundingClientRect(), s = small.getBoundingClientRect();
      return { h: $('topbar').getBoundingClientRect().height, smallTop: s.top, smallLeft: s.left, textTop: t.top, textRight: t.right };
    });
    assert.ok(bar.h <= 40, `#topbar の高さ: ${json(bar)}`);
    assert.ok(Math.abs(bar.smallTop - bar.textTop) <= 12, `ロゴの英字が横に並んでいない: ${json(bar)}`);
    assert.ok(bar.smallLeft >= bar.textRight, `ロゴの英字がロゴの右にない: ${json(bar)}`);
    const [prog, quit] = await rects(page, '#scr-quiz > .progress', '#quit'), mid = r => (r.top + r.bottom) / 2;
    assert.ok(Math.abs(mid(prog) - mid(quit)) <= 8, `進み具合と #quit が同じ行にない: ${json({ prog, quit })}`);
  });
  await inScene('quiz_f2n', W1024, async page => {
    const [slot, ch] = await rects(page, '#qcard > .rslot', '#qcard > .choices');
    assert.ok(slot.top > ch.bottom, `quiz 1024: ${json({ slot, ch })}`);
    assert.equal(await page.isVisible('.rslot'), true);
  });
  await inScene('ta_result', W1366, async page => {
    const [side, res] = await rects(page, '#r-side', '#rcard > .result');
    assert.ok(side.left > res.right, `ta_result 1366: ${json({ side, res })}`);
  });
  await inScene('ta_result', W1024, async page => {
    const [side, res] = await rects(page, '#r-side', '#rcard > .result');
    assert.ok(side.top > res.bottom, `ta_result 1024: ${json({ side, res })}`);
  });
  const RK = ['#scr-ranking .cols > .col:first-child', '#scr-ranking .cols > .col + .col'];
  await inScene('ranking', W1366, async page => {
    const [side, main] = await rects(page, ...RK), play = await rectOf(page, '#rk-play');
    assert.ok(main.left > side.right, `ranking 1366: ${json({ side, main })}`);
    assert.ok(play.bottom <= W1366.height, `#rk-play が画面の外: ${json(play)}`);
  });
  await inScene('ranking', W1024, async page => {
    const [side, main] = await rects(page, ...RK);
    assert.ok(main.top > side.bottom, `ranking 1024: ${json({ side, main })}`);
  });
  // モード選択（設計書 5.3）: ≥1280 はモード4つ・あそび方3つがそれぞれ1行、900〜1279 はモードが 2×2
  const tops = (page, sel) => page.$$eval(sel, els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  await inScene('setup', W1366, async page => {
    const modes = await tops(page, '#modes .modecard'), kinds = await tops(page, '#kinds .modecard');
    assert.ok(modes.length === 4 && new Set(modes).size === 1, `modes 1366: ${json(modes)}`);
    assert.ok(kinds.length === 3 && new Set(kinds).size === 1, `kinds 1366: ${json(kinds)}`);
  });
  await inScene('setup', W1024, async page => {
    const modes = await tops(page, '#modes .modecard');
    assert.ok(modes.length === 4 && new Set(modes).size === 2, `modes 1024: ${json(modes)}`);
  });
});

// 図鑑の一覧の列の数（設計書 5.6）と、下までスクロールしても検索の行が見えていること
test('book_columns_and_sticky', { timeout: 120_000 }, async () => {
  for (const [viewport, cols] of [[W1024, 5], [W1366, 7], [{ width: 1920, height: 1080 }, 8]]) {
    await inScene('book_grid', viewport, async page => {
      assert.equal((await measureFit(page)).gridCols, cols, `${vpName(viewport)} の列の数`);
      if (viewport.width !== 1366) return;
      assert.ok(await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); return scrollY > 0; }), 'スクロールしていない');
      const q = await rectOf(page, '#q');
      assert.ok(q.top >= 0 && q.bottom <= viewport.height, `#q が見えていない: ${json(q)}`);
    });
  }
});

// 文字が大きすぎない（設計書 9章 7）: ホームのタイトル以外は 6rem まで。問題の国旗は 640px まで、文字の選択肢は 1.3rem まで
test('font_caps', { timeout: 180_000 }, async () => {
  const problems = [];
  for (const viewport of parseViewports('1920x1080,2560x1300')) for (const scene of ['home', 'quiz_f2n', 'reveal_f2n', 'result', 'ta_result']) {
    await inScene(scene, viewport, async page => {
      const m = await page.evaluate(() => {
        const root = parseFloat(getComputedStyle(document.documentElement).fontSize), big = [];
        for (const el of document.querySelectorAll('body *')) {
          if (el.closest('.home h1') || !el.getBoundingClientRect().width) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs > root * 6) big.push(`${el.tagName}.${el.getAttribute('class') ?? ''} ${fs}px`);
        }
        const flag = document.querySelector('#qcard .qflag'), choice = document.querySelector('#qcard .choice');
        return { root, big, flagW: flag?.getBoundingClientRect().width, choiceFs: choice && parseFloat(getComputedStyle(choice).fontSize) };
      });
      const key = `${vpName(viewport)} ${scene}`;
      for (const b of m.big) problems.push(`${key}: ${b} > ${m.root * 6}px`);
      if (scene !== 'quiz_f2n') return;
      if (!(m.flagW <= 640)) problems.push(`${key}: .qflag の幅 ${m.flagW}`);
      if (!(m.choiceFs <= m.root * 1.3)) problems.push(`${key}: .choice の文字 ${m.choiceFs}px > ${m.root * 1.3}px`);
    });
  }
  assert.deepEqual(problems, []);
});

// とても背の低い窓（200% 表示など）: カードは 440px のまま潰れず、ページが縦にスクロールする
test('short_window_scrolls', async () => {
  const app = await openApp(browser, { viewport: { width: 1366, height: 400 }, seed: 1, reducedMotion: 'reduce' });
  try {
    const { page } = app;
    await startF2n(page, 'practice');
    await settleLayout(page);
    const card = await rectOf(page, '#qcard'), m = await measureFit(page);
    assert.ok(card.height >= 440, `#qcard の高さ ${card.height}`);
    assert.ok(m.docH > m.ih, `スクロールしない: ${json(m)}`);
    assert.equal(m.hscroll, false);
    noErrors(app);
  } finally { await app.close(); }
});

// 1920×1080 を 150% で表示したノート（ホームはボタンが3つ）
test('laptop_150pct_fits', { timeout: 120_000 }, async () => {
  const problems = [];
  for (const scene of ['home', 'wrong_f2n', 'named_f2m', 'ta_fail', 'result_miss', 'ta_result']) await checkFit(problems, scene, { width: 1280, height: 577 });
  assert.deepEqual(problems, []);
});

// 結果の右列が空なら、1列で真ん中に出す（ランキング未設定のタイムアタックと、練習のノーミス）
test('result_single_column_when_side_empty', { timeout: 120_000 }, async () => {
  const centered = async page => {
    assert.equal(await page.evaluate(() => $('r-side').children.length === 1 && $('r-ext').childNodes.length === 0), true);
    const [card, res] = await rects(page, '#rcard', '#rcard > .result'), mid = r => (r.left + r.right) / 2;
    assert.ok(Math.abs(mid(card) - mid(res)) <= 2, `真ん中にない: ${json({ card, res })}`);
  };
  const app = await openApp(browser, { viewport: W1366, seed: 1, reducedMotion: 'reduce', storage: { badges: QUIET_BADGES }, blockScripts: RPG_FILES });
  try {
    const { page } = app;
    // 接続先が未設定の状態にする（submit.test.mjs の disabled_when_not_configured と同じ）
    await page.route('**/ranking.js', async route => {
      const res = await route.fetch();
      await route.fulfill({ response: res, body: (await res.text()) + '\nRANKING.enabled = false;\n' });
    });
    await page.reload();
    assert.equal(await page.evaluate(() => RANKING.enabled), false);
    await clearTimeAttack(page);
    await settleLayout(page);
    await centered(page);
    noErrors(app);
  } finally { await app.close(); }
  await inScene('result', W1366, centered, { blockScripts: RPG_FILES });
});

// モードやドパガキ向けを切り替えても、メニューのパネルが上下に動かない（設計書 9章 5。高さ 760px より大きいとき）
test('menus_do_not_jump', { timeout: 120_000 }, async () => {
  const problems = [];
  for (const viewport of parseViewports('1024x768,1366x768,1920x1080')) {
    const app = await openApp(browser, { viewport, seed: 1, reducedMotion: 'reduce' });
    try {
      const { page } = app;
      const top = async sel => { await settleLayout(page); return (await rectOf(page, sel)).top; };
      const setup = [];
      await pickSetup(page, { mode: 'f2n', kind: 'practice' });
      setup.push(await top('#scr-setup .panel'));
      await pickSetup(page, { mode: 'm2f' });
      setup.push(await top('#scr-setup .panel'));
      await pickSetup(page, { kind: 'ta' });
      setup.push(await top('#scr-setup .panel'));
      if (new Set(setup).size !== 1) problems.push(`${vpName(viewport)} モード選択: ${setup.join(' → ')}`);
      await page.click('#to-settings');
      const settings = [await top('#scr-settings .panel')];
      await page.check('#set-dopa');
      settings.push(await top('#scr-settings .panel'));
      if (new Set(settings).size !== 1) problems.push(`${vpName(viewport)} 設定: ${settings.join(' → ')}`);
      if (app.errors.length) problems.push(`${vpName(viewport)}: ページで例外 ${app.errors.map(String).join(' | ')}`);
    } catch (e) { problems.push(`${vpName(viewport)}: ${e.message.split('\n')[0]}`); }
    finally { await app.close(); }
  }
  assert.deepEqual(problems, []);
});

// キーボードの無いタッチ端末（横向きの iPad。900px 以上なので pc.css が効く）では、答えの場所にキーの案内を出さない
test('rslot_keys_hidden_on_touch', async () => {
  const IPAD = { width: 1366, height: 1024 };
  for (const hasTouch of [false, true]) {
    const app = await openApp(browser, { viewport: IPAD, hasTouch, seed: 1, reducedMotion: 'reduce' });
    try {
      const { page } = app;
      assert.equal(await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches), hasTouch);
      await startF2n(page, 'practice');
      assert.equal(await page.isVisible('#qcard > .rslot .rslot-hint'), true, `hasTouch=${hasTouch}`);
      assert.equal(await page.isVisible('#qcard > .rslot .rslot-keys'), !hasTouch, `hasTouch=${hasTouch}`);
      noErrors(app);
    } finally { await app.close(); }
  }
});

// PC でも 1〜4 キーと Enter が動き、答えたら「次の問題 →」にフォーカスの枠が出る（設計書 9章 10）
test('keys_and_focus_pc', async () => {
  await checkKeysAndFocus(W1366, { focusVisible: true });
  await checkKeysAndFocus(W1024, { focusVisible: true });
});

// 900〜1279 のタイムアタック失格（国旗→国名）: 首都の長い国（スリランカ）でも下の帯に収まる
test('ta_fail_narrow_strip', async () => {
  const app = await openApp(browser, { viewport: { width: 900, height: 700 }, seed: 1, reducedMotion: 'reduce' });
  try {
    const { page } = app;
    await startF2n(page, 'ta');
    await page.evaluate(() => { G.queue.unshift(byA.get('lk')); nextQuestion(); }); // 首都がスリジャヤワルダナプラコッテ
    assert.equal(await page.evaluate(() => G.cur.c.a), 'lk');
    await answerWrong(page);
    await page.waitForSelector('#next');
    await settleLayout(page);
    assert.deepEqual(fits(await measureFit(page), 'ta_fail'), []);
    noErrors(app);
  } finally { await app.close(); }
});

// クイズ中に 900px をまたいで窓の幅を変えても、その場でスマホ／PC の並びになる
test('resize_across_900', async () => {
  const app = await openApp(browser, { viewport: W1366, seed: 1, reducedMotion: 'reduce' });
  try {
    const { page } = app;
    await startF2n(page, 'practice');
    await page.setViewportSize({ width: 800, height: 900 });
    await answerWrong(page);
    await page.waitForSelector('#next');
    await settleLayout(page);
    assert.equal((await measureFit(page)).hscroll, false);
    assert.equal(await page.locator('.rslot').count(), 0);
    assert.equal(await page.evaluate(() => getComputedStyle($('qcard')).display), 'flex'); // スマホの並び
    await page.setViewportSize(W1366);
    await settleLayout(page);
    assert.equal((await measureFit(page)).hscroll, false);
    const [reveal, ch] = await rects(page, '#qcard > .reveal', '#qcard > .choices');
    assert.ok(reveal.left > ch.right, `答えが右の列にない: ${json({ reveal, ch })}`);
    noErrors(app);
  } finally { await app.close(); }
});
