// PC 全画面レイアウト。計測の場面がちゃんとその画面まで進むか、スマホ幅の見た目が変わっていないか
// （phone_geometry_unchanged は GEOM_BASE=auto などを指定したときだけ。全要素の位置を変更前のコミットと比べる）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';
import { startServer, openApp, pickSetup, answerCorrect, answerWrong, PHONE } from './helpers.mjs';
import { SCENES, openScene, pageGeometry, parseViewports, resolveGeomBase, extractTree } from './layout.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 場面の名前 → 見えているはずの画面
const SCREEN_OF = [
  [/^home$/, 'home'], [/^settings$/, 'settings'], [/^setup/, 'setup'],
  [/^(quiz|reveal|wrong|named|long)_|^ta_quiz$|^ta_fail/, 'quiz'],
  [/^result|^ta_result$/, 'result'], [/^ranking$/, 'ranking'], [/^book_/, 'book'],
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
    await startF2n(page, 'ta');
    assert.equal(await page.locator('#qcard > .rslot').count(), 1); // 失格の .reveal もこれと置きかわる
    await answerWrong(page);
    await page.waitForSelector('#next');
    assert.equal(await page.locator('.rslot').count(), 0);
    assert.match(await page.locator('.reveal').innerText(), /失格/);
    assert.ok(await lastInCard(page, '#qcard > .reveal'), '.reveal が #qcard の最後の子でない');
    noErrors(app);
  } finally { await app.close(); }
});

test('rside_contents', { timeout: 120_000 }, async () => {
  const scene = async (name, check) => {
    const app = await openScene(browser, { scene: name, viewport: PHONE });
    try { await check(app.page, sel => app.page.locator(sel).count()); noErrors(app); } finally { await app.close(); }
  };
  await scene('result_miss', async (page, count) => {
    assert.equal(await count('#rcard > #r-side.rside'), 1);
    assert.equal(await count('#r-side .misslist'), 1);
    assert.deepEqual(await page.evaluate(() => [$('r-side').previousElementSibling.matches('.result'), $('r-side').nextElementSibling.matches('.row.center')]), [true, true]);
  });
  await scene('result', async page => {
    assert.equal(await page.evaluate(() => $('r-side').childNodes.length), 0); // ノーミスなら空（:empty が効く）
  });
  await scene('ta_result', async (page, count) => {
    assert.equal(await count('#r-side .tabox #ta-form'), 1);
    assert.equal(await count('#r-side #ta-rank'), 0); // 順位相当はスマホの並びを変えないため .stats のまま
    assert.equal(await count('.result .stats #ta-rank'), 1);
  });
});

test('topbar_extra_slot', async () => {
  const app = await openApp(browser);
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
