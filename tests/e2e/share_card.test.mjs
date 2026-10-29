// 結果画像のシェア（share-card.js）: タイムアタックのクリア画面と今日の難問の［結果をシェア］。
// navigator.share・canShare・window.open は差しかえて、渡したもの（window.__shared）と開いた URL（window.__opened）を見る
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerCorrect, settle, settleResult, clearTimeAttack, clearByAnswering } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const URL_ = 'https://chikokunn1011.github.io/country-drill/';
// navigator.share は渡したものを __shared に入れて resolve（how: 'abort' / 'deny' で reject）。canShare は files を渡せるか（can）
const stubShare = ({ how = 'ok', can = true } = {}) => `{
  const how = ${JSON.stringify(how)}, can = ${JSON.stringify(can)};
  Object.defineProperty(navigator, 'share', { configurable: true, value: o => {
    if (how === 'abort') return Promise.reject(new DOMException('閉じた', 'AbortError'));
    if (how === 'deny') return Promise.reject(new DOMException('だめ', 'NotAllowedError'));
    window.__shared = o; return Promise.resolve();
  } });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => can });
  window.open = u => { (window.__opened ||= []).push(u); return null; };
}`;
// canvas の toBlob を止めておく（画像を作り終わらない）。__blobs[i]() で i 番目を流す
const holdBlob = `{
  const orig = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (...a) { (window.__blobs ||= []).push(() => orig.apply(this, a)); };
}`;

// 毎回まっさらなブラウザで開き、最後にページで例外が出ていないかも見る。init は stubShare に足す文字列
const t = (name, fn, { init = '', timeout = 30_000, ...opts } = {}) => test(name, { timeout }, async () => {
  const app = await openApp(browser, { ...opts, init: stubShare(opts.share) + init });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const ready = page => page.waitForSelector('#r-share[data-card="ready"]');
const nothing = page => page.evaluate(() => ({ shared: window.__shared ?? null, opened: window.__opened ?? null }));
// 渡した png の大きさ・形式と、(4,4) の画素
const png = page => page.evaluate(async () => {
  const f = __shared.files[0], b = await createImageBitmap(f);
  const c = new OffscreenCanvas(b.width, b.height), x = c.getContext('2d'); x.drawImage(b, 0, 0);
  return { type: f.type, name: f.name, w: b.width, h: b.height, px: [...x.getImageData(4, 4, 1, 1).data.slice(0, 3)], text: __shared.text, keys: Object.keys(__shared).sort() };
});
const shareTA = async page => { await clearTimeAttack(page); await ready(page); await page.click('#r-share'); };

t('ta_png_1200x675', async page => {
  await shareTA(page);
  await page.waitForFunction(() => window.__shared);
  const s = await png(page);
  assert.deepEqual([s.type, s.name, s.w, s.h], ['image/png', 'kokki-master.png', 1200, 675]);
  assert.deepEqual(s.keys, ['files', 'text']);
  assert.match(s.text, /^国旗マスター タイムアタック 国旗 → 国名／全世界／5問\n[^\n]+ でクリア！\n#国旗マスター\n/);
  assert.match(s.text, /#国旗マスター\nhttps:\/\/chikokunn1011\.github\.io\/country-drill\/$/);
  assert.equal(await page.locator('#r-share').innerText(), '結果をシェア');
});

t('abort_does_nothing', async page => {
  await shareTA(page);
  await page.waitForTimeout(300);
  assert.deepEqual(await nothing(page), { shared: null, opened: null });
}, { share: { how: 'abort' } });

t('other_error_opens_x', async page => {
  await shareTA(page);
  await page.waitForFunction(() => window.__opened);
  const o = (await nothing(page)).opened;
  assert.equal(o.length, 1);
  assert.ok(o[0].startsWith('https://twitter.com/intent/tweet?text='), o[0]);
  const u = new URL(o[0]);
  assert.equal(u.searchParams.get('url'), URL_);
  assert.match(u.searchParams.get('text'), /^国旗マスター タイムアタック /);
}, { share: { how: 'deny' } });

t('cannot_share_files_opens_x', async page => {
  await shareTA(page);
  await page.waitForFunction(() => window.__opened);
  const n = await nothing(page);
  assert.equal(n.shared, null);
  assert.equal(n.opened.length, 1);
  assert.equal(new URL(n.opened[0]).searchParams.get('url'), URL_);
}, { share: { can: false } });

t('light_colors', async page => {
  await shareTA(page);
  await page.waitForFunction(() => window.__shared);
  assert.deepEqual((await png(page)).px, [238, 242, 241]);   // --bg（ライト）
});

t('dark_colors', async page => {
  await shareTA(page);
  await page.waitForFunction(() => window.__shared);
  assert.deepEqual((await png(page)).px, [15, 23, 28]);   // --bg（ダーク）
}, { colorScheme: 'dark', storage: { settings: { theme: 'auto' } } });

// 最後の正解を押した直後（同じタスクの中）に［結果をシェア］を押しても何もしない（結果画面の 250ms の連打よけ）
t('guard_250ms', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'ta', region: 'all', count: 5 });
  await page.click('#start');
  for (let i = 0; i < 4; i++) await answerCorrect(page);
  await settle(page);
  const shown = await page.evaluate(() => {
    document.querySelector(`.choice[data-a="${G.cur.c.a}"]`).click();
    $('r-share').click();
    return !$('scr-result').hidden;
  });
  assert.equal(shown, true);
  await page.waitForTimeout(300);
  assert.deepEqual(await nothing(page), { shared: null, opened: null });
});

// 画像を作り終わる前に押したら、文だけを共有する（URL はサイトの URL）
t('click_before_ready_text_only', async page => {
  await clearTimeAttack(page);
  assert.equal(await page.getAttribute('#r-share', 'data-card'), 'busy');
  await page.click('#r-share');
  await page.waitForFunction(() => window.__shared);
  const s = await page.evaluate(() => ({ keys: Object.keys(__shared).sort(), url: __shared.url, text: __shared.text }));
  assert.deepEqual(s.keys, ['text', 'url']);
  assert.equal(s.url, URL_);
  assert.match(s.text, /^国旗マスター タイムアタック [\s\S]*#国旗マスター$/);
}, { init: holdBlob });

// 画像を作っているあいだに［もう一回］→ 2回目をクリア。1回目の処理が終わっても、新しいボタンには入れない
t('stale_after_again', async page => {
  await clearTimeAttack(page);
  await page.waitForFunction(() => window.__blobs?.length === 1);
  await page.click('#r-again');
  const n = await page.evaluate(() => G.set.length);
  for (let i = 0; i < n; i++) await answerCorrect(page);
  await page.locator('#scr-result').waitFor();
  await page.waitForFunction(() => window.__blobs?.length === 2);
  await page.evaluate(() => __blobs[0]());
  await page.waitForTimeout(300);
  assert.equal(await page.getAttribute('#r-share', 'data-card'), 'busy');
  await page.evaluate(() => __blobs[1]());
  await ready(page);
  await settleResult(page);
  await page.click('#r-share');
  await page.waitForFunction(() => window.__shared);
  assert.equal((await png(page)).w, 1200);
}, { init: holdBlob });

// 国旗が1枚読めない（404）→ そのマスは四角にして、画像はできる
let first404 = false;
t('flag_404_still_ready', async (page, app) => {
  await shareTA(page);
  await page.waitForFunction(() => window.__shared);
  assert.equal(first404, true);
  assert.equal((await png(page)).h, 675);
  assert.deepEqual(app.warnings.filter(w => w.startsWith('sharecard')), []);
}, { routes: [[/\/flags\/[\w-]+\.svg/, route => {
  if (!first404 && route.request().resourceType() === 'fetch') { first404 = true; return route.fulfill({ status: 404, body: '' }); }
  return route.continue();
}]] });

// 24か国より多いタイムアタック（ヨーロッパ・全部）→ 23枚と「+N」のマスで画像ができる（タイムアタックは細かい地域を選べない）
t('many_flags_ready', async page => {
  await clearTimeAttack(page, { region: 'ヨーロッパ', count: 'all' });
  assert.ok(await page.evaluate(() => G.set.length) > 24);
  await ready(page);
  await page.click('#r-share');
  await page.waitForFunction(() => window.__shared);
  const s = await png(page);
  assert.deepEqual([s.w, s.h], [1200, 675]);
  assert.match(s.text, /全部（\d+問）/);
}, { timeout: 90_000 });

t('no_button_in_practice', async page => {
  for (const kind of ['practice', 'challenge']) {
    await pickSetup(page, { mode: 'f2n', kind, region: 'all', count: 5 });
    await page.click('#start');
    await clearByAnswering(page);
    assert.equal(await page.locator('#r-share').count(), 0, kind);
    await settleResult(page);
    await page.click('#r-setup');
  }
});

t('blocked_no_button', async page => {
  await clearTimeAttack(page);
  assert.equal(await page.locator('#r-share').count(), 0);
  assert.equal(await page.isVisible('#r-again'), true);
}, { blockScripts: ['share-card.js'] });

t('pc_result_fits', async page => {
  await clearTimeAttack(page);
  assert.equal(await page.isVisible('#r-share'), true);
  const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight }));
  assert.ok(m.sh <= m.ih, JSON.stringify(m));
}, { viewport: { width: 1366, height: 657 } });

