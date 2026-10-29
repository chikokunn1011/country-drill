// 白地図タップ（mode: 'tap'）: モード選択の5枚目のカード、タイムアタック・ランキングから外す
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, recordEvents, events, settle, answerTap, tapPoint, answerCorrect } from './helpers.mjs';
import { openRpg, writeSave, saveWith, startBattle, battleAnswer } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 30_000 }, async () => {
  const app = await openApp(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});

t('tap_card_and_ta_off', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'ta' });
  assert.equal(await page.locator('#modes .modecard').count(), 5);
  assert.match(await page.innerText('#modes .modecard[data-k="tap"]'), /白地図タップ/);
  await page.click('#modes .modecard[data-k="tap"]');
  assert.equal(await page.evaluate(() => P.kind), 'practice');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('setup')).kind), 'practice');
  assert.equal(await page.locator('#kinds [data-k="ta"]').isDisabled(), true);
  assert.equal(await page.getAttribute('#kinds [data-k="ta"]', 'aria-disabled'), 'true');
  assert.match(await page.innerText('#kinds [data-k="ta"]'), /白地図タップでは遊べない/);
  assert.equal(await page.getAttribute('#kinds [data-k="practice"]', 'aria-pressed'), 'true');
  // f2n に戻すとタイムアタックがまた押せる
  await page.click('#modes .modecard[data-k="f2n"]');
  assert.equal(await page.locator('#kinds [data-k="ta"]').isDisabled(), false);
  await page.click('#kinds [data-k="ta"]');
  assert.equal(await page.evaluate(() => P.kind), 'ta');
});

t('stored_tap_ta', async page => {
  await recordEvents(page);
  await page.click('#home-play');
  assert.equal(await page.evaluate(() => P.kind), 'practice');
  assert.equal(await page.getAttribute('#kinds [data-k="practice"]', 'aria-pressed'), 'true');
  await page.click('#start');
  assert.equal(await page.evaluate(() => G.kind), 'practice');
  const [st] = await events(page, 'drill:start');
  assert.equal(st.mode, 'tap'); assert.equal(st.kind, 'practice');
}, { storage: { setup: { mode: 'tap', kind: 'ta', count: 5 } } });

t('ranking_without_tap', async page => {
  await page.evaluate(() => { P.mode = 'tap'; openRanking(); });
  assert.equal(await page.evaluate(() => RK.mode), 'f2n');
  const ks = await page.$$eval('#rk-modes .chip', bs => bs.map(b => b.dataset.k));
  assert.ok(ks.length >= 4 && !ks.includes('tap'), ks.join());
  assert.equal(await page.evaluate(() => boardConds('tap:all:10')), null);
  assert.notEqual(await page.evaluate(() => boardConds('f2n:all:10')), null);
});

/* ---------- 出題と判定（Task 3） ---------- */
// 練習・白地図タップ・全世界・5問で始めて、問題が出るまで待つ
async function startTap(page, { region = 'all', named = false } = {}) {
  await pickSetup(page, { mode: 'tap', kind: 'practice', region, count: 5 });
  if (named) await page.check('#nameopt');
  await page.click('#start');
  await settle(page);
}
// a の国を今の問題にする
const force = (page, a) => page.evaluate(a => { G.queue.unshift(byA.get(a)); nextQuestion(); }, a);
// 国 a の丸印の画面の中心
const dotAt = async (page, a) => {
  const b = await page.locator(`#qcard .tapmap circle.dot[data-a="${a}"]`).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const answers = page => events(page, 'drill:answer');
// 地図の上の点 (x, y) でホイールを回して拡大する（d3.zoom は 2^(-deltaY × 0.002) 倍。点の位置は動かない）
const wheelZoom = async (page, { x, y }, k) => {
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -Math.log2(k) / 0.002);
  await page.waitForFunction(k => Math.abs(d3.zoomTransform(document.querySelector('#qcard .tapmap')).k - k) < 0.01, k);
};

t('tap_right_and_wrong', async page => {
  await recordEvents(page);
  await startTap(page);
  assert.equal(await page.locator('#qcard .choices').count(), 0);
  assert.equal(await page.locator('#qcard .tapbox svg.tapmap').count(), 1);
  await answerTap(page);
  await page.locator('#qcard .verdict.ok').waitFor();
  const [a1] = await answers(page);
  assert.equal(a1.mode, 'tap'); assert.equal(a1.right, true);
  assert.equal(await page.locator('#qcard .reveal .map').count(), 0, '答えのあとの小さい地図は出さない');
  await page.click('#next');
  await answerTap(page, { right: false });
  await page.locator('#qcard .verdict.ng').waitFor();
  assert.equal((await answers(page))[1].right, false);
  assert.equal(await page.evaluate(() => misses[G.cur.c.a]), 1);
});

t('small_country_near_px', async page => {
  await startTap(page);
  await force(page, 'sg');
  let d = await dotAt(page, 'sg');
  await page.mouse.click(d.x + 10, d.y);
  assert.equal(await page.evaluate(() => [G.answered, document.querySelector('#qcard .verdict')?.className]).then(([a, c]) => a && c), 'verdict ok');
  await force(page, 'sg');
  d = await dotAt(page, 'sg');
  await page.mouse.click(d.x + 16, d.y);
  assert.ok(await page.locator('#qcard .verdict.ng').isVisible());
  // 拡大しても画面の上で 12px（地図の上では狭くなる）
  await force(page, 'sg');
  d = await dotAt(page, 'sg');
  await wheelZoom(page, d, 2.56);
  d = await dotAt(page, 'sg');
  await page.mouse.click(d.x + 10, d.y);
  assert.ok(await page.locator('#qcard .verdict.ok').isVisible());
  await force(page, 'sg');
  d = await dotAt(page, 'sg');
  await wheelZoom(page, d, 2.56);
  d = await dotAt(page, 'sg');
  await page.mouse.click(d.x + 16, d.y);
  assert.ok(await page.locator('#qcard .verdict.ng').isVisible());
});

t('drag_does_not_answer', async page => {
  await startTap(page);
  const b = await page.locator('#qcard .tapmap').boundingBox(), mid = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await wheelZoom(page, mid, 2);   // 拡大していないと動かせない（translateExtent が地図の大きさ）
  const x0 = await page.evaluate(() => d3.zoomTransform(document.querySelector('#qcard .tapmap')).x);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 40, mid.y, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => G.answered), false);
  assert.notEqual(await page.evaluate(() => d3.zoomTransform(document.querySelector('#qcard .tapmap')).x), x0);
});

t('tap_outside_globe', async page => {
  await startTap(page);
  assert.equal(await page.evaluate(() => tapJudge(G.cur.c, [-5000, -5000], 0)), false);
  assert.equal(await page.evaluate(() => tapLonLat([-5000, -5000])), null);
  // 全世界の地図の左上の角（地球の外。角は丸いので少し内側）
  assert.equal(await page.evaluate(() => tapLonLat([30, 30])), null);
  await page.locator('#qcard .tapbox').scrollIntoViewIfNeeded();
  const b = await page.locator('#qcard .tapmap').boundingBox(), k = b.width / 640;
  await page.mouse.click(b.x + 30 * k, b.y + 30 * k);
  await page.locator('#qcard .verdict.ng').waitFor();
  assert.equal(await page.locator('#qcard .tapkm').count(), 0);
});

t('tap_after_answer_ignored', async page => {
  await recordEvents(page);
  await startTap(page);
  await page.locator('#qcard .tapbox').scrollIntoViewIfNeeded();
  const p = await page.evaluate(tapPoint, false);
  await page.mouse.click(p.x, p.y);
  await page.locator('#qcard .verdict.ng').waitFor();
  const marks = () => page.evaluate(() => document.querySelectorAll('#qcard .tapx, #qcard .ngc, #qcard .tapline').length);
  const n = await marks();
  await page.mouse.click(p.x, p.y);
  await page.mouse.dblclick(p.x, p.y);
  assert.equal((await answers(page)).length, 1);
  assert.equal(await marks(), n);
});

t('quick_guard', async page => {
  await recordEvents(page);
  await page.evaluate(() => { S.quick = true; });
  await pickSetup(page, { mode: 'tap', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  // 出した直後（TA_GUARD_MS の間）に正解の所を押しても答えにならない
  const answered = await page.evaluate(`(() => {
    G.queue.unshift(G.cur.c); nextQuestion();
    const { x, y } = (${tapPoint})(true);
    document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    return G.answered;
  })()`);
  assert.equal(answered, false);
  assert.equal((await answers(page)).length, 0);
  await answerTap(page);
  await page.waitForFunction(() => window.__ev.some(e => e.type === 'drill:answer'));
  assert.equal((await answers(page))[0].right, true);
});

t('no_unreachable_country', async page => {
  const bad = await page.evaluate(() => {
    const out = [], host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:640px';
    document.body.append(host);
    for (const r of ['all', ...REGIONS, ...Object.keys(SUBREGIONS)]) {
      const box = tapMap(C[0], r); host.replaceChildren(box);
      for (const c of poolFor(r)) {
        const ok = [...box.querySelectorAll(`[data-a="${c.a}"]`)].some(el => {
          const b = el.getBBox();
          return (b.width > 0 || b.height > 0) && b.x <= 640 && b.y <= 360 && b.x + b.width >= 0 && b.y + b.height >= 0;
        });
        if (!ok) out.push(`${r}:${c.a}`);
      }
    }
    host.remove();
    return out;
  });
  assert.deepEqual(bad, []);
});

t('quiz_only_flag_name_place', async page => {
  await startTap(page);
  const q = () => page.evaluate(() => ({ text: document.querySelector('#qcard .qmain').innerText, flag: !!document.querySelector('#qcard .qmain img.qflag'), n: G.cur.c.n }));
  let v = await q();
  assert.ok(v.flag); assert.ok(!v.text.includes('首都'), v.text); assert.ok(!v.text.includes(v.n), '国名表示なしでは国名を出さない');
  await page.click('#quit');
  await startTap(page, { named: true });
  v = await q();
  assert.ok(v.flag); assert.ok(!v.text.includes('首都'), v.text); assert.ok(v.text.includes(v.n), '国名表示ありでは国名も出す');
});

/* ---------- 外れたときの表示・冒険から・道場（Task 4） ---------- */
const kOf = page => page.evaluate(() => d3.zoomTransform(document.querySelector('#qcard .tapmap')).k);
// 今の問題の国 c の中心（国の ll）から画面で dx, dy ずらした点
const nearC = (page, dx, dy) => page.evaluate(([dx, dy]) => {
  const c = G.cur.c, [x, y] = G.cur.proj([c.ll[1], c.ll[0]]), m = document.querySelector('#qcard .tapmap .layer').getScreenCTM();
  return { x: m.a * x + m.c * y + m.e + dx, y: m.b * x + m.d * y + m.f + dy };
}, [dx, dy]);

t('wrong_shows_km', async page => {
  await startTap(page);
  await force(page, 'br');
  await answerTap(page, { right: false });
  await page.locator('#qcard .verdict.ng').waitFor();
  assert.match(await page.innerText('#qcard .tapkm'), /^タップした所から約[\d,]+ km$/);
  assert.equal(await page.locator('#qcard .tapline').count(), 1);
  assert.equal(await page.locator('#qcard .tapmap path.on').count(), 1);
  assert.ok(await page.evaluate(() => G.cur.km > 5000), '一番遠い国をタップしたので 5,000 km より遠い');
  const ngc = await page.locator('#qcard .tapmap .ngc').count(), x = await page.locator('#qcard .tapmap .tapx').count();
  assert.equal(ngc > 0 ? x : x - 1, 0, `国を押したら .ngc、海なら × 印（ngc ${ngc}・tapx ${x}）`);
  // 正解の国の形の上にある画面の点は、印を足したあとも変わらない（地図の範囲を動かしていない）
  assert.equal(await kOf(page), 1);
});

t('reset_when_out_of_view', async page => {
  await startTap(page);
  await force(page, 'jp');
  await page.locator('#qcard .tapbox').scrollIntoViewIfNeeded();
  // 南アメリカのあたりで拡大して日本を画面の外に出し、そこで外す → 地図の範囲が最初に戻る
  const far = await page.evaluate(() => { const m = document.querySelector('#qcard .tapmap .layer').getScreenCTM(), [x, y] = G.cur.proj([-60, -15]); return { x: m.a * x + m.e, y: m.d * y + m.f }; });
  await wheelZoom(page, far, 6.5);
  await page.mouse.click(far.x, far.y);
  await page.locator('#qcard .verdict.ng').waitFor();
  await page.waitForTimeout(400);
  assert.equal(await kOf(page), 1);
  // 日本が見えたままの外れでは、拡大はそのまま
  await force(page, 'jp');
  const at = await nearC(page, 0, 0);
  await wheelZoom(page, at, 2);
  const p = await nearC(page, -40, 0);
  await page.mouse.click(p.x, p.y);
  await page.locator('#qcard .verdict.ng').waitFor();
  await page.waitForTimeout(400);
  assert.ok(Math.abs(await kOf(page) - 2) < 0.01);
});

t('dark_colors', async page => {
  await startTap(page);
  await force(page, 'br');
  await answerTap(page, { right: false });
  await page.locator('#qcard .verdict.ng').waitFor();
  const v = await page.evaluate(() => {
    const color = name => { const el = document.createElement('i'); el.style.color = `var(${name})`; document.body.append(el); const c = getComputedStyle(el).color; el.remove(); return c; };
    const ngc = document.querySelector('#qcard .tapmap .ngc'), on = document.querySelector('#qcard .tapmap path.on'), line = document.querySelector('#qcard .tapline');
    return { ng: color('--ng'), hl: color('--hl'), ngc: ngc && getComputedStyle(ngc).fill, on: getComputedStyle(on).fill, line: getComputedStyle(line).stroke };
  });
  assert.equal(v.ng, 'rgb(236, 122, 122)', 'ダークの --ng');
  if (v.ngc) assert.equal(v.ngc, v.ng);
  assert.equal(v.on, v.hl); assert.equal(v.line, v.ng);
}, { colorScheme: 'dark', storage: { settings: { theme: 'auto' } } });

test('rpg_practice_to_tap', { timeout: 60_000 }, async () => {
  const app = await openRpg(browser, { storage: { setup: { mode: 'tap', kind: 'practice', count: 5 } } });
  try {
    const { page } = app;
    await writeSave(page, saveWith({}));
    await startBattle(page, 'samerica', 1);
    for (let i = 0; i < 4; i++) await battleAnswer(page, false);
    await page.click('#bt-practice');
    assert.equal(await page.isVisible('#scr-setup'), true);
    assert.deepEqual(await page.evaluate(() => [P.kind, P.mode]), ['practice', 'tap']);
    await page.click('#start');
    await page.locator('#qcard .tapbox').waitFor();
    await answerTap(page);
    await page.locator('#qcard .verdict.ok').waitFor();
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});

t('dojo_round_still_works', async page => {
  await page.evaluate(() => { window.__dj = []; document.addEventListener('drill:dojo', e => __dj.push(e.detail)); });
  await page.evaluate(() => startDojo({ seq: ['td', 'ro', 'ad', 'md', 'td', 'ro', 'ad', 'md', 'td', 'ro'], group: ['td', 'ro', 'ad', 'md'], mode: 'f2n', sid: 'dj-t' }));
  for (let i = 0; i < 10; i++) { await answerCorrect(page); await page.click('#next'); }
  const dj = await page.evaluate(() => __dj);
  const end = dj.find(e => e.phase === 'end');
  assert.deepEqual({ outcome: end.outcome, n: end.n, wrongs: end.wrongs }, { outcome: 'clear', n: 10, wrongs: 0 });
  const ans = dj.filter(e => e.phase === 'answer');
  assert.equal(ans.length, 10); assert.ok(ans.every(e => e.right));
  assert.equal(await page.isVisible('#scr-dojo'), true);
});
