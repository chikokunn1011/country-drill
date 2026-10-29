// ホーム（B6）: 大きなカード3枚（クイズで遊ぶ・今日の難問・冒険）と小さいアイコン5つ（ランキング・バッジ・図鑑・プロフィール・設定）、
// #home-status（称号の札など。空なら見えない）。入口は index.html に置いてあり、機能ファイルは homeEntry で出す。
// ファイルを止めたとき・冒険 OFF・ランキング無効でもほかが詰めて並び、Tab の順もこの並び
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, QUIET_BADGES } from './helpers.mjs';
import { settleLayout, measureFit } from './layout.mjs';
import { RPG_FILES, saveWith } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで ?bdgdebug=1 を付けて開き、最後にページで例外が出ていないかも見る。
// 既定は札の出ない QUIET_BADGES で、どのファイルも止めない（本物の rpg.js・badges.js・daily.js・profile.js）。opts は openApp にそのまま渡す
const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { url: server.url + '?bdgdebug=1', storage: { badges: QUIET_BADGES }, blockScripts: [], ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const text = (page, sel) => page.locator(sel).innerText();
// 見えている要素の id を並びの順に
const ids = (page, sel) => page.$$eval(sel, es => es.filter(e => e.checkVisibility()).map(e => e.id));
// 称号〈ドリルの新人〉をつけてあるセーブ（badges.test.mjs の TITLED と同じ）
const TITLED = { v: 1, got: { 'first-clear@1': 1 }, eq: 'first-clear@1', sn: { 'first-clear': 2 }, sent: ['first-clear@1'] };

t('entry_order', async page => {
  assert.deepEqual(await ids(page, '#home-big > .hbig'), ['home-play', 'home-daily', 'home-rpg']);
  assert.deepEqual(await ids(page, '#home-icons > .hicon'), ['home-rank', 'home-badges', 'home-book', 'home-profile', 'home-settings']);
  assert.equal(await page.locator('#home-rpg').count(), 1);
  assert.equal(await page.locator('#home-daily').count(), 1);
  assert.equal(await page.locator('#home-badges').count(), 1);
  assert.match(await text(page, '#home-play .hb-title'), /^クイズで遊ぶ$/);
  assert.match(await text(page, '#home-daily .hb-title'), /^今日の難問$/);
  assert.match(await text(page, '#home-rpg .hb-title'), /^冒険$/);
  assert.match(await text(page, '#home-daily .hb-note'), /\d+\/\d+[\s\S]*(NEW|挑戦ずみ)/);
  assert.match(await text(page, '#home-rpg .hb-note'), /NEW/);
  assert.match(await text(page, '#home-badges .hi-sub'), /^\d+\/\d+$/);
  assert.deepEqual(await page.$$eval('#home-icons .hi-label', es => es.map(e => e.textContent)), ['ランキング', 'バッジ', '図鑑', 'プロフィール', '設定']);
  // 説明に首都は出さない
  assert.ok(!(await text(page, '#scr-home')).includes('首都'));
});

// 止めたファイルの入口は hidden のまま、残りは詰めて並ぶ
for (const [files, gone] of [[['daily.js'], 'home-daily'], [RPG_FILES, 'home-rpg'], [['badges.js'], 'home-badges'], [['profile.js'], 'home-profile']])
  t(`blocked_${gone}`, async page => {
    assert.equal(await page.isHidden('#' + gone), true);
    const seen = await ids(page, '.hbig, .hicon');
    assert.ok(!seen.includes(gone), seen.join());
    assert.equal(seen.length, 7, seen.join());
  }, { blockScripts: files });

// 冒険 OFF: カードは2枚。900〜1279（カードが横1行）でも空いた列を残さず、2枚は詰めて中央に寄る（左右の余りが同じ）
t('rpg_off_hides_card', async page => {
  assert.deepEqual(await ids(page, '#home-big > .hbig'), ['home-play', 'home-daily']);
  await page.setViewportSize({ width: 1024, height: 768 });
  await settleLayout(page);
  const [a, b] = await page.$$eval('#home-big > .hbig', es => es.filter(e => e.checkVisibility()).map(e => e.getBoundingClientRect().toJSON()));
  assert.equal(Math.round(a.top), Math.round(b.top));   // 横1行
  const left = a.left, right = await page.evaluate(() => innerWidth) - b.right;
  assert.ok(Math.abs(left - right) <= 2, `中央に寄っていない 左${left} 右${right}`);
}, { storage: { badges: QUIET_BADGES, rpg: saveWith({ show: false }) } });

t('ranking_disabled', async page => {
  // 接続先が未設定の状態にする（ranking.test の home_button_hidden_when_disabled と同じやり方）
  await page.route('**/ranking.js*', async route => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()) + '\nRANKING.enabled = false;\n' });
  });
  await page.reload();
  // プロフィールもランキングの接続先を使うので、profile.js は入口を出さない（profile.js の先頭の RANKING.enabled）
  assert.deepEqual(await ids(page, '#home-icons > .hicon'), ['home-badges', 'home-book', 'home-settings']);
});

t('tab_order', async page => {
  const seen = [];
  for (let i = 0; i < 40 && seen.at(-1) !== 'home-settings'; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => document.activeElement?.id ?? ''));
  }
  assert.deepEqual(seen.filter(id => id.startsWith('home-')),
    ['home-title', 'home-play', 'home-daily', 'home-rpg', 'home-rank', 'home-badges', 'home-book', 'home-profile', 'home-settings']);
}, { storage: { badges: TITLED } });

t('status_empty_hidden', async page => {
  assert.equal(await page.isVisible('#home-status'), false);   // QUIET_BADGES: 札なし
  assert.equal(await page.$eval('#home-status', e => e.childElementCount), 0);
  // 称号をつける（[data-bdg-equip] は document のクリックで受ける）
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.dataset.bdgEquip = 'first-clear@1'; b.textContent = 'x';
    document.body.append(b); b.click(); b.remove();
    show('home');
  });
  assert.equal(await page.isVisible('#home-status'), true);
  assert.equal(await page.$eval('#home-status', e => e.firstElementChild.className), 'bdg-titlerow');
  assert.equal(await text(page, '#home-title'), '〈ドリルの新人〉');
  // 札は #home-status の中で1つだけ（何度描いても作り直さない）
  await page.evaluate(() => { show('setup'); show('home'); });
  assert.equal(await page.locator('#home-status .bdg-titlerow').count(), 1);
}, { blockScripts: ['streak.js'] });   // れんぞく日数の行は0日でも消えないので止める（streak.js があれば見えることは streak.test の home_row_first_time）

t('entries_open', async page => {
  for (const [id, scr] of [['home-play', 'setup'], ['home-daily', 'daily'], ['home-rpg', 'rpg'], ['home-rank', 'ranking'],
    ['home-badges', 'badges'], ['home-book', 'book'], ['home-profile', 'profile'], ['home-settings', 'settings']]) {
    await page.click('#' + id);
    assert.equal(await page.isVisible('#scr-' + scr), true, id);
    assert.equal(await page.isHidden('#scr-home'), true, id);
    await page.evaluate(() => show('home'));
  }
});

/* ---------- 見た目（スマホ・PC） ---------- */
const json = o => JSON.stringify(o);
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
// いちばん長い現実的な入口: 称号の札あり、冒険はコイン 9,999 で旅立ち前（「●9,999 NEW」）、プロフィールも出る
const LONGEST = { badges: TITLED, rpg: saveWith({ coins: 9999, intro: false }) };

// スマホ: 国旗のモザイクは見えるのが7枚で1行
t('flags_seven_phone', async page => {
  const tops = await page.$$eval('#home-flags img', es => es.filter(e => e.checkVisibility()).map(e => Math.round(e.getBoundingClientRect().top)));
  assert.equal(tops.length, 7);
  assert.equal(new Set(tops).size, 1);
});

// 360px: 横にスクロールせず、カードもアイコンもはみ出さない（「プロフィール」もアイコンの幅に入る）。カードは縦に並ぶ
t('phone_360_fits', async page => {
  await settleLayout(page);
  assert.ok(await noHScroll(page));
  assert.deepEqual(await page.$$eval('.hbig, .hicon, .hi-label, .hb-title', es => es.filter(e => e.checkVisibility() && (e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth)).map(e => e.id || e.className)), []);
  assert.deepEqual(await ids(page, '.hbig, .hicon'), ['home-play', 'home-daily', 'home-rpg', 'home-rank', 'home-badges', 'home-book', 'home-profile', 'home-settings']);
  const big = await page.$$eval('#home-big > .hbig', es => es.map(e => Math.round(e.getBoundingClientRect().left)));
  assert.equal(new Set(big).size, 1);
  const icons = await page.$$eval('#home-icons > .hicon', es => es.filter(e => e.checkVisibility()).map(e => Math.round(e.getBoundingClientRect().top)));
  assert.equal(new Set(icons).size, 1);   // アイコンは1行
}, { viewport: { width: 360, height: 640 }, storage: LONGEST });

// スマホの3サイズ: アイコンの名前（いちばん長い「プロフィール」）が途中で折れず1行（pc_fits の oneLine と同じ見方）
t('phone_labels_one_line', async page => {
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await settleLayout(page);
    const wrapped = await page.$$eval('.hi-label', es => es.filter(e => e.checkVisibility()).filter(el => {
      const rs = [];
      for (const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); w.nextNode();) {
        const rg = document.createRange(); rg.selectNodeContents(w.currentNode); rs.push(...rg.getClientRects());
      }
      const live = rs.filter(r => r.width);
      return !(live.length > 0 && Math.max(...live.map(r => r.top)) < Math.min(...live.map(r => r.bottom)));
    }).map(e => e.closest('button').id));
    assert.deepEqual(wrapped, [], `${width}: 名前が2行になっている`);
    assert.ok(await noHScroll(page), String(width));
  }
}, { viewport: { width: 390, height: 844 }, storage: LONGEST });

// PC の7サイズ: 横にも縦にもスクロールせず、入口8つと称号の札が画面の中にあって、たがいに重ならない。カードの名前とアイコンの名前は1行
t('pc_fits', async page => {
  const hit = (p, q) => p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;
  for (const [width, height] of [[900, 700], [1024, 768], [1280, 577], [1366, 657], [1366, 768], [1920, 800], [1920, 1080]]) {
    const key = `${width}x${height}`;
    await page.setViewportSize({ width, height });
    await settleLayout(page);
    const fit = await measureFit(page);
    assert.equal(fit.hscroll, false, key);
    assert.ok(fit.docH <= fit.ih, `${key}: 縦にスクロールする ${fit.docH}/${fit.ih}`);
    const m = await page.evaluate(() => {
      const box = el => { const r = el.getBoundingClientRect(); return { id: el.id, l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      const shown = [...document.querySelectorAll('.hbig, .hicon')].filter(e => e.checkVisibility());
      // 文字のノードの行の箱が全部たがいに縦に重なっていれば1行
      const oneLine = el => {
        const rs = [];
        for (const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); w.nextNode();) {
          const rg = document.createRange(); rg.selectNodeContents(w.currentNode); rs.push(...rg.getClientRects());
        }
        const live = rs.filter(r => r.width);
        return live.length > 0 && Math.max(...live.map(r => r.top)) < Math.min(...live.map(r => r.bottom));
      };
      return { ids: shown.map(e => e.id), boxes: [...shown, $('home-title')].map(box),
        wrapped: [...document.querySelectorAll('.hb-title, .hi-label, .hb-note')].filter(e => e.checkVisibility() && e.textContent && !oneLine(e)).map(e => e.closest('button').id + ' ' + e.className),
        iw: innerWidth, ih: innerHeight };
    });
    assert.deepEqual(m.ids, ['home-play', 'home-daily', 'home-rpg', 'home-rank', 'home-badges', 'home-book', 'home-profile', 'home-settings'], key);
    assert.deepEqual(m.wrapped, [], `${key}: 名前が2行になっている`);
    for (const p of m.boxes) {
      assert.ok(p.l >= 0 && p.t >= 0 && p.r <= m.iw && p.b <= m.ih, `${key}: ${p.id} が画面の外 ${json(p)}`);
      for (const q of m.boxes) if (p !== q) assert.ok(!hit(p, q), `${key}: ${p.id} と ${q.id} が重なる ${json({ p, q })}`);
    }
  }
}, { viewport: { width: 900, height: 700 }, storage: LONGEST });

// 900〜1279 はカードが横3列（札は自分の行）、≥1280 はカードとアイコンが左の列（国旗は右）で札は左寄せ。高さ 760 以下は説明の文を隠す
t('pc_rows', async page => {
  const rect = sel => page.$eval(sel, e => e.getBoundingClientRect().toJSON());
  const bigTops = () => page.$$eval('#home-big > .hbig', es => es.map(e => Math.round(e.getBoundingClientRect().top)));
  await page.setViewportSize({ width: 1024, height: 768 });
  await settleLayout(page);
  assert.equal(new Set(await bigTops()).size, 1, '1024: 横3列');
  const [row, play] = [await rect('#home-status .bdg-titlerow'), await rect('#home-play')];
  assert.ok(row.bottom <= play.top, `1024: 札がカードの上 ${json({ row, play })}`);
  await page.setViewportSize({ width: 1366, height: 768 });
  await settleLayout(page);
  const flags = await rect('#home-flags');
  for (const id of ['home-play', 'home-daily', 'home-rpg', 'home-settings']) assert.ok((await rect('#' + id)).right < flags.left, `1366: ${id} が左の列`);
  assert.equal(new Set(await bigTops()).size, 3, '1366: カードは縦1列');
  assert.equal(await page.$eval('.bdg-titlerow', e => getComputedStyle(e).justifyContent), 'flex-start');
  await page.setViewportSize({ width: 1366, height: 657 });
  assert.equal(await page.isVisible('#home-play .hb-desc'), false, '1366x657: 説明を隠す');
  await page.setViewportSize({ width: 1366, height: 900 });
  assert.equal(await page.isVisible('#home-play .hb-desc'), true, '1366x900: 説明を出す');
}, { viewport: { width: 1024, height: 768 }, storage: LONGEST });
