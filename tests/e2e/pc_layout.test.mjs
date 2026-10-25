// PC 全画面レイアウト。計測の場面がちゃんとその画面まで進むか、スマホ幅の見た目が変わっていないか
// （phone_geometry_unchanged は GEOM_BASE=auto などを指定したときだけ。全要素の位置を変更前のコミットと比べる）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';
import { startServer, PHONE } from './helpers.mjs';
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
