// バッジと称号（badges.js のブラウザの部分）。クイズのイベントから記録を取り、ゲームが終わってから判定して保存する。偽の Supabase・スマホ幅で確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerCorrect, answerWrong, clearTimeAttack, clearByAnswering, settleResult, PC, PHONE, QUIET_BADGES } from './helpers.mjs';
import { measureFit, settleLayout, rectOf } from './layout.mjs';
import { RPG_FILES, saveWith } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで ?bdgdebug=1 を付けて開き、最後にページで例外が出ていないかも見る。opts は openApp にそのまま渡す。
// 既定で rpg.js（RPG_FILES）は止める: 本物の rpg.js は window.RPG を作り badge:earned の paid を書くので、偽の RPG（withRpg）や
// 「冒険なし」の表示（26個・トーストの枚数）を見るテストは止めないと成り立たない。本物の rpg.js と組み合わせるテストは blockScripts: [] を渡す
const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { url: server.url + '?bdgdebug=1', blockScripts: RPG_FILES, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
// メモリの記録（表示用）と、localStorage に書いてある記録
const dump = page => page.evaluate(() => BADGES.debug.dump());
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('badges')));
// 練習（国旗→国名・全世界・5問）を結果画面まで解く。opts は pickSetup と同じ
async function playPractice(page, opts = {}) {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5, ...opts });
  await page.click('#start');
  await clearByAnswering(page);
}
// 横スクロールが出ていない（以後のタスクで使う）
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
// ページで document にイベントを出す（detail は JSON にできる値）
const emitIn = (page, type, detail) => page.evaluate(([type, detail]) => { document.dispatchEvent(new CustomEvent(type, { detail })); }, [type, detail]);
// 練習（国旗→国名・全世界・5問）を始めて、問題が出るまで待つ
async function startPractice(page) {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await page.waitForSelector('#qcard .choice');
}

t('loads_and_counts', async page => {
  assert.deepEqual(await page.evaluate(() => ({
    title: typeof BADGES.title, count: BADGES.count(), text: BADGES.title(), key: BADGES.titleKey(),
    css: !!document.querySelector('link[href="badges.css?v=1"]'), js: !!document.querySelector('script[src="badges.js?v=9"]'),
  })), { title: 'function', count: { got: 0, total: 26, byColor: { 1: 0, 2: 0, 3: 0, 4: 0 } }, text: '', key: null, css: true, js: true });
});

// 新しい版で増えたバッジのセーブ: 称号の文字は出さず、キーは残す。自動でつけかえない
t('title_unknown_key', async page => {
  assert.deepEqual(await page.evaluate(() => [BADGES.title(), BADGES.titleKey(), BADGES.count().got]), ['', 'future-badge@1', 0]);
  await playPractice(page);
  const d = await saved(page);
  assert.equal(d.eq, 'future-badge@1');
  assert.equal(d.got['future-badge@1'], 1);
}, { storage: { badges: { v: 1, eq: 'future-badge@1', got: { 'future-badge@1': 1 } } } });

t('practice_clear_recorded', async page => {
  await playPractice(page);
  const d = await dump(page), set = await page.evaluate(() => G.set.map(c => c.a));
  assert.deepEqual([d.s.right, d.s.clears, d.s.days], [5, 1, 1]);
  assert.equal(set.length, 5);
  assert.deepEqual(set.filter(a => !(d.s.m[a] & 1)), []);
  assert.equal(typeof d.got['first-clear@1'], 'number');
  assert.equal(d.eq, 'first-clear@1');
  assert.equal((await saved(page)).s.right, 5);
});

// はじめてのバッジの称号を自動でつけたら badge:title を1回出す（ゲームの結果のときも、起動時の判定のときも）
t('auto_equip_emits_title', async (page, app) => {
  await page.evaluate(() => document.addEventListener('badge:title', e => (window.__bt ||= []).push(e.detail)));
  await playPractice(page);
  assert.deepEqual(await page.evaluate(() => window.__bt), [{ key: 'first-clear@1', title: 'ドリルの新人' }]);
  await app.context.addInitScript(() => document.addEventListener('badge:title', e => (window.__bt ||= []).push(e.detail)));
  await page.evaluate(() => localStorage.setItem('badges', JSON.stringify({ v: 1, s: { right: 150 } })));
  await page.reload();
  assert.deepEqual(await page.evaluate(() => window.__bt), [{ key: 'answers@1', title: 'こつこつ派' }]);
});

// クイズの途中は localStorage に書かない。やめたら、そこまでの1問ごとの記録だけ書く
t('no_write_during_quiz', async page => {
  const before = await page.evaluate(() => localStorage.getItem('badges'));
  assert.ok(before, '起動時の判定で書いてあるはず');
  await startPractice(page);
  for (let i = 0; i < 2; i++) { await answerCorrect(page); await page.click('#next'); }
  assert.equal(await page.evaluate(() => localStorage.getItem('badges')), before);
  await page.click('#quit');
  const { s } = await saved(page);
  assert.deepEqual([s.right, s.clears, s.days], [2, 0, 0]);
});

t('duplicate_result_ignored', async page => {
  await page.evaluate(() => document.addEventListener('drill:result', e => { window.__last = e.detail; }));
  await playPractice(page);
  const last = await page.evaluate(() => window.__last);
  await emitIn(page, 'drill:result', last);
  await emitIn(page, 'drill:result', last);
  assert.equal((await dump(page)).s.clears, 1);
});

// 閉じるときは保存だけして判定しない。判定は次の起動で
t('pagehide_saves_without_judging', async page => {
  await page.evaluate(() => BADGES.debug.set('right', 99));
  await startPractice(page);
  await answerCorrect(page);
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  const d = await saved(page);
  assert.equal(d.s.right, 100);
  assert.equal(d.got['answers@1'], undefined);
  await page.reload();
  assert.equal(typeof (await dump(page)).got['answers@1'], 'number');
});

// タイムアタックの計測中に重い処理をしない: drill:answer の badges.js のリスナーは1回 0.2ms 未満
t('ta_listener_fast', async page => {
  // window の capture は document のリスナーより先、あとから document に付けたリスナーは badges.js のリスナーの後ろ
  await page.evaluate(() => {
    window.addEventListener('drill:answer', () => { window.__t0 = performance.now(); }, true);
    document.addEventListener('drill:answer', e => { (window.__dt ||= []).push(performance.now() - window.__t0); window.__ad = e.detail; });
  });
  await clearTimeAttack(page, { count: 10 });
  const dt = await page.evaluate(() => window.__dt);
  assert.equal(dt.length, 10);
  const sorted = [...dt].sort((p, q) => p - q), median = (sorted[4] + sorted[5]) / 2;
  assert.ok(median < 0.2, `中央値 ${median}ms: ${dt.join(' ')}`);
  const each = await page.evaluate(() => {
    const detail = window.__ad, t0 = performance.now();
    for (let i = 0; i < 1000; i++) document.dispatchEvent(new CustomEvent('drill:answer', { detail }));
    return (performance.now() - t0) / 1000;
  });
  assert.ok(each < 0.2, `1回 ${each}ms`);
});

// localStorage が例外を投げても、クイズは動き、バッジはメモリの中で数える（本物の rpg.js も入ったまま。rpg.js はメモリだけで動く）
test('storage_unavailable', { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { url: server.url + '?bdgdebug=1' });
  try {
    await app.context.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('blocked'); };
      Storage.prototype.setItem = () => { throw new Error('blocked'); };
    });
    await app.page.reload();
    await playPractice(app.page);
    assert.equal(await app.page.isVisible('#scr-result'), true);
    assert.equal(await app.page.evaluate(() => BADGES.count().got), 1);
    assert.deepEqual(app.errors.map(String), []);
    // どちらも保存できないことを知っていて、例外を [rpg] / [badges] の console.error にもしない
    assert.deepEqual(app.consoleErrors.filter(s => /^\[(rpg|badges)\]/.test(s)), []);
  } finally { await app.close(); }
});

// 2つのタブで遊んでも、片方の記録を消さずに足していく
t('two_tabs', async (page, app) => {
  const page2 = await app.context.newPage(), errors2 = [];
  page2.on('pageerror', e => errors2.push(e));
  await page2.goto(server.url + '?bdgdebug=1');
  await playPractice(page);
  await playPractice(page2);
  const d = await saved(page);
  assert.deepEqual([d.s.right, d.s.clears], [10, 2]);
  assert.equal(typeof d.got['first-clear@1'], 'number');
  assert.deepEqual(errors2.map(String), []);
});

// index.html のグローバルが足りなければ、console.error を1回出して何も作らない。クイズはそのまま動く（rpg.js は止めて、badges.js の分だけ見る）
test('missing_global_is_safe', { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { url: server.url, blockScripts: RPG_FILES });
  const { page } = app, logs = [];
  try {
    page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
    await page.route(u => new URL(u).pathname === '/', async r => {
      const res = await r.fetch();
      await r.fulfill({ response: res, body: (await res.text()).replace('function toast(', 'function toastX(') });
    });
    await page.reload();
    const ours = () => logs.filter(m => m.includes('[badges]'));
    for (let i = 0; i < 100 && !ours().length; i++) await new Promise(ok => setTimeout(ok, 20));   // console はページから少し遅れて届く
    assert.equal(ours().length, 1, logs.join('\n'));
    assert.match(ours()[0], /toast/);
    assert.deepEqual(await page.evaluate(() => [typeof window.BADGES, typeof BADGES_CORE]), ['undefined', 'object']);
    await playPractice(page);
    assert.equal(await page.isVisible('#scr-result'), true);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});

/* ---------- ホームの札とボタン・バッジ画面・詳細・称号えらび（設計書 §6） ---------- */
const text = (page, sel) => page.locator(sel).innerText();
const count = (page, sel) => page.locator(sel).count();
const json = o => JSON.stringify(o);
// 称号〈ドリルの新人〉をつけてあるセーブ（ホームに札が出る）。sent 済みなので、本物の rpg.js と組ませてもさかのぼりの払い（●+50 のトースト）は出ない
const TITLED = { v: 1, got: { 'first-clear@1': 1 }, eq: 'first-clear@1', sn: { 'first-clear': 2 }, sent: ['first-clear@1'] };
// 最初の .bdg-tiles の、先頭から n 個のタイルの top
const tileTops = (page, n) => page.evaluate(n => [...document.querySelector('.bdg-tiles').children].slice(0, n).map(e => Math.round(e.getBoundingClientRect().top)), n);
const listenTitle = page => page.evaluate(() => document.addEventListener('badge:title', e => (window.__bt ||= []).push(e.detail)));

t('home_button_and_count', async page => {
  assert.equal(await page.evaluate(() => $('home-badges').nextElementSibling.id), 'home-settings');
  assert.match(await text(page, '#home-badges'), /バッジ\s*0\/26/);
  assert.equal(await count(page, '#home-badges .bdg-dot'), 0);
  await playPractice(page);
  await page.click('#brand');
  assert.match(await text(page, '#home-badges'), /バッジ\s*1\/26/);
  assert.equal(await count(page, '#home-badges .bdg-dot[aria-label="新しいバッジあり"]'), 1);
});

t('home_title_chip', async page => {
  await playPractice(page);
  await page.click('#brand');
  assert.equal(await page.evaluate(() => document.querySelector('#scr-home .menu').firstElementChild.className), 'bdg-titlerow');
  assert.equal(await text(page, '#home-title'), '〈ドリルの新人〉');
  await page.click('#home-title');
  await page.waitForSelector('#detail[open] .bdg-picker');
  assert.equal(await count(page, '#detail [data-bdg-pick="first-clear@1"]'), 1);
  await listenTitle(page);
  await page.click('#detail [data-bdg-pick=""]');
  assert.equal(await page.evaluate(() => $('detail').open), false);
  assert.equal(await count(page, '.bdg-titlerow'), 0);
  assert.deepEqual(await page.evaluate(() => window.__bt), [{ key: null, title: '' }]);
  assert.equal(await page.evaluate(() => BADGES.title()), '');
  await page.evaluate(() => BADGES.debug.set('right', 100));   // 「つけない」を選んだら、新しいバッジでも自動でつけない
  assert.equal(await page.evaluate(() => BADGES.titleKey()), null);
});

t('badges_screen_phone', async page => {
  await page.click('#home-badges');
  assert.equal(await page.isVisible('#scr-badges'), true);
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'badges');
  assert.equal(await text(page, '#bdg-total'), '26個中 0個');
  assert.equal(await text(page, '#bdg-colors'), '銅 0 · 銀 0 · 金 0 · 虹 0');
  const [a, b, c, d] = await tileTops(page, 4);
  assert.ok(a === b && b === c && d > c, `3列でない: ${[a, b, c, d]}`);
  assert.ok(await noHScroll(page));
  assert.ok(await page.evaluate(() => $('bdg-cats').scrollWidth > $('bdg-cats').clientWidth), 'チップの行が横に動かない');
  assert.equal(await count(page, '#bdg-cats [data-cat="rpg"]'), 0);
  await page.click('#bdg-cats [data-cat="region"]');
  assert.equal(await count(page, '.bdg-tile'), 7);
  await page.reload();
  await page.click('#home-badges');
  assert.equal(await text(page, '#bdg-cats [aria-pressed="true"]'), '地域');
  await page.setViewportSize({ width: 320, height: 640 });
  const [p, q, r] = await tileTops(page, 3);
  assert.ok(p === q && r > q, `2列でない: ${[p, q, r]}`);
  assert.ok(await noHScroll(page));
  await page.click('#bdg-home');
  assert.equal(await page.isVisible('#scr-home'), true);
});

t('badges_screen_pc', async page => {
  const vp = (width, height) => page.setViewportSize({ width, height });
  await page.evaluate(() => show('badges'));
  assert.ok(await noHScroll(page));
  assert.equal(await page.evaluate(() => getComputedStyle($('bdg-cats')).position), 'sticky');
  await vp(1440, 900);
  assert.deepEqual(await page.evaluate(() => { const s = getComputedStyle($('bdg-sum')); return [s.position, s.top]; }), ['sticky', '16px']);
  const [sum, main] = await Promise.all([rectOf(page, '#bdg-sum'), rectOf(page, '.bdg-main')]);
  assert.ok(sum.right < main.left, `2列でない: ${json({ sum, main })}`);
  assert.equal(await page.isVisible('.bdg-recent'), true);
  await vp(1920, 1080);
  const m = await page.evaluate(() => {
    const sec = $('scr-badges'), r = sec.getBoundingClientRect(), tiles = document.querySelector('.bdg-tiles');
    return { width: r.width, iw: innerWidth, edge: r.right - parseFloat(getComputedStyle(sec).paddingRight),
      tiles: tiles.getBoundingClientRect().right, cols: getComputedStyle(tiles).gridTemplateColumns.split(' ').length };
  });
  assert.ok(m.width >= m.iw - 2 * 64 - 1, `幅に上限がある: ${json(m)}`);
  assert.ok(Math.abs(m.tiles - m.edge) <= 1, `タイルが右端まで並ばない: ${json(m)}`);
  assert.ok(m.cols >= 6, `列が少ない: ${json(m)}`);
  assert.ok(await noHScroll(page));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { S.theme = 'auto'; applyTheme(); });   // はじめはライト固定なので、端末に合わせる
  for (const [w, h] of [[390, 844], [1440, 900]]) { await vp(w, h); assert.ok(await noHScroll(page), `dark ${w}x${h}`); }
}, { viewport: { width: 1024, height: 768 } });

t('tile_states', async page => {
  const tile = id => `#bdg-list [data-bdg-detail="${id}"]`;
  await page.evaluate(() => { BADGES.debug.set('right', 150); show('badges'); });
  assert.equal(await page.getAttribute(tile('answers'), 'aria-label'), 'こつこつ正解。銅まで取った。次の銀は正解の合計が 1,000問、いま 150 / 1,000');
  assert.equal(await count(page, `${tile('answers')} .bdg-new`), 1);
  assert.match(await text(page, tile('chal-grit')), /？？？/);
  assert.equal(await count(page, `${tile('chal-grit')} .bdg-bar`), 0);
  assert.equal(await page.evaluate(() => $('bdg-soon').textContent), '');   // どれも50%未満
  await page.evaluate(() => BADGES.debug.set('taAvg', 2430));                // バッジ画面のまま描き直される
  assert.match(await text(page, tile('ta-speed')), /2\.43→2\.0秒/);
  assert.deepEqual(await page.locator('#bdg-soon li').allInnerTexts(), ['⚡ スピードスター 銀 あと0.43秒']);
  await page.evaluate(() => BADGES.debug.set('right', 600));
  assert.deepEqual(await page.locator('#bdg-soon li').allInnerTexts(), ['⚡ スピードスター 銀 あと0.43秒', '📚 こつこつ正解 銀 あと400問']);
});

// 段の goal が 1（地域の銅・銀、1段だけのバッジなど）は「0 / 1」ではなく「まだ」（届いていれば「達成」）
t('goal_one_progress', async page => {
  const tile = id => `#bdg-list [data-bdg-detail="${id}"]`;
  await page.evaluate(() => { BADGES.debug.grant('reg-europe@1'); show('badges'); });
  for (const [id, want] of [['reg-asia', 'まだ'], ['reg-europe', 'まだ'], ['comeback', null], ['answers', '0 / 100']]) {
    const s = await text(page, tile(id));
    assert.ok(!/\d \/ 1$/m.test(s), `${id}: ${s}`);
    if (want) assert.equal(await text(page, `${tile(id)} .bdg-prog`), want, id);
  }
  assert.equal(await page.getAttribute(tile('reg-asia'), 'aria-label'), 'アジア大陸横断。まだ取っていない。次の銅はアジアで10問以上のゲームをクリア、まだ');
  await page.evaluate(() => BADGES.open('reg-europe'));
  assert.deepEqual(await page.locator('#detail-inner .bdg-tier .bdg-prog').allInnerTexts(), ['まだ', '0 / 184']);   // 銀・金（銅は取った日）
}, { storage: { badges: { ...QUIET_BADGES } } });

// 新しい版のセーブ（読むだけ・判定しない）では、届いていても取れていないので「達成」と出る
t('goal_one_reached', async page => {
  await page.evaluate(() => show('badges'));
  assert.equal(await text(page, '#bdg-list [data-bdg-detail="first-clear"] .bdg-prog'), '達成');
  assert.equal(await text(page, '#bdg-list [data-bdg-detail="reg-world"] .bdg-prog'), '達成');
}, { storage: { badges: { v: 2, s: { clears: 1, rc: { world: 1 } } } } });

t('detail_and_new', async page => {
  await playPractice(page);
  assert.equal(await count(page, '#home-badges .bdg-dot'), 1);
  await page.evaluate(() => BADGES.open('first-clear'));
  await page.waitForSelector('#detail[open]');
  assert.equal(await count(page, '#detail-inner .bdg-tier'), 1);
  const tier = await text(page, '#detail-inner .bdg-tier');
  for (const s of ['✓ ', '称号〈ドリルの新人〉', 'つけてる中']) assert.ok(tier.includes(s), `${s} が無い: ${tier}`);
  assert.equal(typeof (await saved(page)).sn['first-clear'], 'number');
  await page.click('#detail-inner [data-bdg-close]');
  assert.equal(await page.evaluate(() => $('detail').open), false);
  assert.equal(await count(page, '#bdg-list [data-bdg-detail="first-clear"]'), 1);
  assert.equal(await count(page, '#bdg-list [data-bdg-detail="first-clear"] .bdg-new'), 0);
  assert.equal(await count(page, '#home-badges .bdg-dot'), 0);
});

t('equip_from_detail', async page => {
  await listenTitle(page);
  await page.evaluate(() => { BADGES.debug.grant('reg-asia@1'); BADGES.debug.grant('reg-asia@2'); BADGES.open('reg-asia'); });
  await page.click('.bdg-tier[data-key="reg-asia@2"] [data-bdg-equip]');
  assert.equal(await page.evaluate(() => BADGES.title()), 'アジア通');
  assert.deepEqual(await page.evaluate(() => window.__bt), [{ key: 'reg-asia@2', title: 'アジア通' }]);
  assert.match(await text(page, '.bdg-tier[data-key="reg-asia@2"]'), /つけてる中/);
  const t3 = await text(page, '.bdg-tier[data-key="reg-asia@3"]');
  assert.ok(t3.includes('（取ると使える）') && t3.includes('0 / 184'), t3);
  assert.equal(await text(page, '#detail-inner .bdg-note'), '※ 国名ヒントありの正解は数えないよ');
});

// 詳細の［つける］をキーボードで押しても、描き直したあとのフォーカスはダイアログの中（つけた段の「つけてる中」）。
// もうつけている称号をもう一度つけても（称号えらび・古いトーストの［つける］）、badge:title は出し直さない
t('equip_focus_no_reemit', async page => {
  await listenTitle(page);
  await page.evaluate(() => { BADGES.debug.grant('reg-asia@1'); BADGES.debug.grant('reg-asia@2'); BADGES.open('reg-asia'); });
  await page.focus('.bdg-tier[data-key="reg-asia@2"] [data-bdg-equip]');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => BADGES.titleKey()), 'reg-asia@2');
  const focus = () => page.evaluate(() => { const a = document.activeElement; return { dialog: $('detail').contains(a), on: a.matches('.bdg-on'), key: a.closest('[data-key]')?.dataset.key ?? null }; });
  assert.deepEqual(await focus(), { dialog: true, on: true, key: 'reg-asia@2' });
  await page.keyboard.press('Tab');   // 「つけてる中」から先へ進める
  assert.equal(await page.evaluate(() => $('detail').contains(document.activeElement) && document.activeElement.matches('button')), true);
  await page.click('#detail-inner [data-bdg-close]');
  await page.evaluate(() => show('home'));
  await page.click('#home-title');
  await page.click('#detail [data-bdg-pick="reg-asia@2"]');
  await page.evaluate(() => { const b = document.createElement('button'); b.dataset.bdgEquip = 'reg-asia@2'; b.textContent = 'x'; document.body.append(b); });
  await page.click('body > [data-bdg-equip]');
  assert.deepEqual(await page.evaluate(() => window.__bt), [{ key: 'reg-asia@2', title: 'アジア通' }]);
  assert.equal(await page.evaluate(() => BADGES.titleKey()), 'reg-asia@2');
});

t('practice_button', async page => {
  await page.evaluate(() => { P.name = true; BADGES.debug.grant('reg-asia@1'); BADGES.open('reg-asia'); });
  await page.click('#detail-inner [data-bdg-practice]');
  assert.equal(await page.isVisible('#scr-setup'), true);
  assert.deepEqual(await page.evaluate(() => [S.region, P.count, $('detail').open, JSON.parse(localStorage.getItem('settings')).region]),
    ['アジア', 'all', false, 'アジア']);   // 次の段が銀（「全部」）なので全部にする
  await page.evaluate(() => BADGES.open('mode-m2f'));
  await page.click('#detail-inner [data-bdg-practice]');
  assert.deepEqual(await page.evaluate(() => [P.mode, P.name, JSON.parse(localStorage.getItem('setup')).mode]), ['m2f', true, 'm2f']);
});

// 次の段が銅（「10問以上」）なら、取れない問題数（5問）を10問にする。取れる数（20問・全部）はそのまま。モードのバッジは問題数を変えない
t('practice_button_count', async page => {
  const go = async (id, count) => {
    await page.evaluate(([id, count]) => { P.count = count; store.set('setup', P); BADGES.open(id); }, [id, count]);
    await page.click('#detail-inner [data-bdg-practice]');
    return page.evaluate(() => [P.count, JSON.parse(localStorage.getItem('setup')).count, $('counts').querySelector('[aria-pressed="true"]').dataset.c]);
  };
  assert.deepEqual(await go('reg-europe', 5), [10, 10, '10']);
  assert.deepEqual(await go('reg-europe', 20), [20, 20, '20']);
  assert.deepEqual(await go('reg-europe', 'all'), ['all', 'all', 'all']);
  assert.deepEqual(await go('mode-f2m', 5), [5, 5, '5']);
});

// navigator.share が無ければコピー。トーストはモーダルの #detail の下に隠れるので、開いている間は［シェア］の文字を2秒だけ「コピー済み」にする。
// コピーが終わる前にダイアログを閉じていたらトースト
t('share_copies', async (page, app) => {
  await app.context.addInitScript(() => {
    delete Navigator.prototype.share;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: s => { window.__clip = s; return window.__hold ? new Promise(ok => { window.__done = ok; }) : Promise.resolve(); } } });
  });
  await page.reload();
  await page.evaluate(() => { BADGES.debug.grant('reg-asia@1'); BADGES.debug.grant('reg-asia@2'); BADGES.open('reg-asia'); });
  const shown = await page.evaluate(() => new Promise(ok => {   // 見えている文字が「コピー済み」になってから「シェア」に戻るまで（ms）
    const b = document.querySelector('#detail-inner [data-bdg-share]');
    let t0 = 0;
    new MutationObserver(() => {
      if (b.innerText === 'コピー済み') t0 ||= performance.now();
      else if (t0) ok({ ms: performance.now() - t0, back: b.innerText, toasts: document.querySelectorAll('#toasts .toast').length });
    }).observe(b, { attributes: true, childList: true, characterData: true, subtree: true });
    b.click();
  }));
  assert.ok(shown.ms >= 1900 && shown.ms < 2600, json(shown));
  assert.deepEqual([shown.back, shown.toasts], ['シェア', 0], json(shown));
  assert.equal(await page.evaluate(() => window.__clip), '国旗マスターでバッジ『アジア大陸横断（銀）』を取ったよ！ 称号〈アジア通〉 https://chikokunn1011.github.io/country-drill/');
  await page.evaluate(() => { window.__hold = true; });
  await page.click('#detail-inner [data-bdg-share]');
  await page.evaluate(() => { $('detail').close(); window.__done(); });
  await page.locator('#toasts .toast', { hasText: 'コピーしたよ' }).waitFor();
  await page.evaluate(() => BADGES.open('book'));
  assert.equal(await count(page, '#detail-inner .bdg-detail'), 1);
  assert.equal(await count(page, '#detail-inner [data-bdg-share]'), 0);
});

// 320px でも、［シェア］が「コピー済み」になっている間に［練習する →］が次の行に落ちない（［シェア］の幅は初めから長いほうの文字に合わせてある）。
// 読み上げの名前も見えている文字と同じ
t('share_copied_no_wrap_320', async (page, app) => {
  await app.context.addInitScript(() => {
    delete Navigator.prototype.share;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() } });
  });
  await page.reload();
  await page.evaluate(() => { BADGES.debug.grant('reg-asia@1'); BADGES.debug.grant('reg-asia@2'); BADGES.open('reg-asia'); });
  const geo = () => page.evaluate(() => {
    const r = sel => { const b = document.querySelector(`#detail-inner ${sel}`).getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); };
    return { share: r('[data-bdg-share]'), prac: r('[data-bdg-practice]'), acts: r('.bdg-acts'), sh: $('detail').scrollHeight };
  });
  const share = page.getByRole('button', { name: 'シェア', exact: true });
  await share.scrollIntoViewIfNeeded();
  const before = await geo();
  assert.equal(before.share[1], before.prac[1], `初めから2行になっている: ${json(before)}`);
  await share.click();
  await page.getByRole('button', { name: 'コピー済み', exact: true }).waitFor();
  assert.deepEqual(await geo(), before);
  await share.waitFor({ timeout: 4000 });   // 2秒で「シェア」に戻る
  assert.deepEqual(await geo(), before);
}, { viewport: { width: 320, height: 640 } });

// ひみつのバッジは、取るまで条件と称号をどこにも出さない（タイルと詳細）
t('secret_detail_hint_only', async page => {
  const all = () => page.evaluate(() => $('detail-inner').textContent + $('scr-badges').innerHTML);
  await page.evaluate(() => BADGES.open('chal-grit'));
  const s = await all();
  assert.ok(s.includes('挑戦でつまずいた条件に、もう一度いどむと…') && s.includes('？？？'), s);
  for (const no of ['不屈の人', '1回目にクリア', '七転び八起き']) assert.ok(!s.includes(no), `${no} が出ている`);
  for (const sel of ['[data-bdg-share]', '[data-bdg-practice]', '[data-bdg-equip]']) assert.equal(await count(page, `#detail-inner ${sel}`), 0, sel);
  await page.evaluate(() => { BADGES.debug.grant('chal-grit@1'); BADGES.open('chal-grit'); });
  const after = await text(page, '#detail-inner');
  assert.ok(after.includes('七転び八起き') && after.includes('称号〈不屈の人〉'), after);
});

// pc.css の ≥1280 は #detail .inner を2列の grid にするので、バッジの詳細と称号えらびは全幅にする
t('detail_full_width_pc', async page => {
  const fill = sel => page.evaluate(sel => {
    const inner = $('detail-inner'), cs = getComputedStyle(inner);
    return { width: document.querySelector(sel).getBoundingClientRect().width, room: inner.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
  }, sel);
  await page.evaluate(() => BADGES.open('reg-asia'));
  let f = await fill('#detail-inner > .bdg-detail');
  assert.ok(f.width >= f.room - 2, `詳細: ${json(f)}`);
  await page.click('#detail-inner [data-bdg-close]');
  await page.evaluate(() => show('home'));
  await page.click('#home-title');
  f = await fill('#detail-inner > .bdg-picker');
  assert.ok(f.width >= f.room - 2, `称号えらび: ${json(f)}`);
}, { viewport: { width: 1440, height: 900 }, storage: { badges: { v: 1, got: { 'reg-asia@1': 1, 'first-clear@1': 1 }, eq: 'first-clear@1', sn: { 'reg-asia': 2, 'first-clear': 2 } } } });

t('hash_opens_badges', async page => {
  await page.goto('about:blank');
  await page.goto(server.url + '?bdgdebug=1#badges');
  assert.equal(await page.isVisible('#scr-badges'), true);
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'badges');
});

// 横に並ぶホーム（900〜1279）で、本物の［冒険］（rpg.js）を入れたボタン5つが1行に収まり（rpg.css）、札は自分の行に出る。≥1280 の2列ヒーローでは札を左に寄せる
t('home_menu_pc', async page => {
  await page.evaluate(() => { BADGES.debug.grant('first-clear@1'); BADGES.open('first-clear'); });
  await page.click('[data-bdg-equip="first-clear@1"]');
  await page.evaluate(() => { $('detail').close(); show('home'); });
  for (const [width, height] of [[900, 700], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    const m = await page.evaluate(() => {
      const row = document.querySelector('.bdg-titlerow').getBoundingClientRect();
      const btns = [...document.querySelectorAll('.menu .btn')].map(b => b.getBoundingClientRect()).filter(r => r.width);
      return { n: btns.length, inside: btns.every(r => r.right <= innerWidth), below: btns.every(r => row.bottom <= r.top), rows: new Set(btns.map(r => Math.round(r.top))).size };
    });
    assert.deepEqual(m, { n: 5, inside: true, below: true, rows: 1 }, `${width}x${height}`);
    assert.ok(await noHScroll(page), `${width}x${height}`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.bdg-titlerow')).justifyContent), 'flex-start');
}, { viewport: { width: 900, height: 700 }, blockScripts: [] });

// 背の低い PC（150% 表示のノートなど）と、高さ 760 を少し超える PC で、本物の［冒険］を入れたボタン5つと札があってもホームが縦にスクロールしない
t('home_short_pc_fits', async page => {
  for (const [i, viewport] of [{ width: 1280, height: 577 }, { width: 1366, height: 657 }, { width: 1024, height: 768 }, { width: 1366, height: 768 }, { width: 1920, height: 800 }].entries()) {
    const key = `${viewport.width}x${viewport.height}`;
    if (i) await page.setViewportSize(viewport);
    await settleLayout(page);
    const m = await measureFit(page);
    assert.equal(m.hscroll, false, key);
    assert.ok(m.docH <= m.ih, `${key}: ${json(m)}`);
    if (viewport.width === 1024) continue;
    const bottoms = await page.$$eval('.menu .btn', bs => bs.map(b => b.getBoundingClientRect().bottom));
    assert.ok(bottoms.every(b => b <= viewport.height), `${key}: ${bottoms}`);
    assert.equal(await page.isVisible('#home-title'), true, key);
  }
}, { viewport: { width: 1280, height: 577 }, blockScripts: [], storage: { badges: TITLED } });

// 本物の rpg.js と badges.js: ホームのボタン5つ（プレイ・冒険・ランキング・バッジ・設定）と称号の札が、PC の5サイズで
// 横にも縦にもスクロールせず、たがいに重ならず、画面の中にあり、ボタンの文字は1行（NEW とコインの小さい字もふくめて）。
// セーブはコイン 9,999 で旅立ち前（「冒険 ●9,999 NEW」= いちばん長い現実的な文字。1.2万 の形より 4桁のほうが長い）
t('home_five_buttons_pc', async page => {
  const hit = (p, q) => p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;
  for (const [width, height] of [[900, 700], [1024, 768], [1280, 577], [1366, 657], [1920, 1080]]) {
    const key = `${width}x${height}`;
    await page.setViewportSize({ width, height });
    await settleLayout(page);
    const m = await page.evaluate(() => {
      const box = el => { const r = el.getBoundingClientRect(); return { id: el.id, l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      const btns = [...document.querySelectorAll('.home .menu > .btn')].filter(b => b.getBoundingClientRect().width);
      // 文字のノードの行の箱が全部たがいに縦に重なっていれば1行（position: absolute の .bdg-dot は文字が無いので入らない）
      const oneLine = b => {
        const rs = [];
        for (const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); w.nextNode();) {
          const rg = document.createRange(); rg.selectNodeContents(w.currentNode); rs.push(...rg.getClientRects());
        }
        const live = rs.filter(r => r.width);
        return live.length > 0 && Math.max(...live.map(r => r.top)) < Math.min(...live.map(r => r.bottom));
      };
      return { ids: btns.map(b => b.id), boxes: [...btns, $('home-title')].map(box), wrapped: btns.filter(b => !oneLine(b)).map(b => b.id),
        hscroll: document.documentElement.scrollWidth > innerWidth, docH: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight };
    });
    assert.deepEqual(m.ids, ['home-play', 'home-rpg', 'home-rank', 'home-badges', 'home-settings'], key);
    assert.deepEqual(m.wrapped, [], `${key}: ボタンの文字が2行になっている`);
    assert.equal(m.hscroll, false, key);
    assert.ok(m.docH <= m.ih, `${key}: 縦にスクロールする ${m.docH}/${m.ih}`);
    for (const p of m.boxes) {
      assert.ok(p.l >= 0 && p.t >= 0 && p.r <= m.iw && p.b <= m.ih, `${key}: ${p.id} が画面の外 ${json(p)}`);
      for (const q of m.boxes) if (p !== q) assert.ok(!hit(p, q), `${key}: ${p.id} と ${q.id} が重なる ${json({ p, q })}`);
    }
  }
}, { viewport: { width: 900, height: 700 }, blockScripts: [], storage: { badges: TITLED, rpg: saveWith({ coins: 9999, intro: false }) } });

// いちばん長い称号でも 320px のホームからはみ出さない。[data-bdg-equip] は document のクリックで受ける（どこに置いたボタンでも）
t('home_long_title_320', async page => {
  await page.evaluate(() => {
    BADGES.debug.grant('rpg-final@1');   // 冒険なしでは一覧に出ないが、title() はカタログにあれば返す
    const b = document.createElement('button');
    b.dataset.bdgEquip = 'rpg-final@1'; b.textContent = 'x';
    document.body.append(b);
  });
  await page.click('body > [data-bdg-equip="rpg-final@1"]');
  assert.equal(await text(page, '#home-title'), '〈世界を取りもどした者〉');
  assert.ok(await noHScroll(page));
  assert.ok((await rectOf(page, '#home-title')).right <= 320);
}, { viewport: { width: 320, height: 640 } });

/* ---------- お知らせ: 結果画面のパネル・トースト・保留（設計書 §5.1〜§5.3） ---------- */
const toastN = page => count(page, '#toasts .toast');
const toastWith = (page, s) => page.locator('#toasts .toast', { hasText: s });
// #toasts に .toast が足された時刻（performance.now()）を window.__tt に積む（#toasts は最初の toast() で作られる）
const watchToasts = page => page.evaluate(() => {
  window.__tt = [];
  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) if (n instanceof Element && n.matches('#toasts > .toast')) window.__tt.push(performance.now());
  }).observe(document.body, { childList: true, subtree: true });
});
// smooth のスクロールが止まるまで待つ
const scrollStill = page => page.evaluate(async () => {
  for (let y = NaN; y !== scrollY;) { y = scrollY; await new Promise(ok => setTimeout(ok, 100)); }
});

t('result_panel_first_clear', async page => {
  await page.evaluate(() => document.addEventListener('drill:result', e => { window.__sid = e.detail.sid; }));
  await playPractice(page);
  const p = await page.evaluate(() => {
    const el = $('r-badges');
    return el && { parent: el.parentElement.id, next: el.nextElementSibling?.id, sid: el.dataset.sid, want: window.__sid, text: el.textContent };
  });
  assert.ok(p, '#r-badges が無い');
  assert.deepEqual([p.parent, p.next, p.sid], ['r-side', 'r-ext', p.want]);
  for (const s of ['はじめの一歩', '銅', '称号〈ドリルの新人〉をつけたよ']) assert.ok(p.text.includes(s), `${s} が無い: ${p.text}`);
  assert.equal(await toastN(page), 0);
});

// クイズの途中はトーストを出さない。取れたものは結果画面のパネルに出す
t('no_toast_during_quiz', async page => {
  await page.evaluate(() => BADGES.debug.set('right', 99));
  await startPractice(page);
  for (let i = 1; i <= 5; i++) {
    await answerCorrect(page);
    await page.waitForSelector('#next');
    assert.equal(await toastN(page), 0, `${i}問目`);
    await page.click('#next');
  }
  await page.locator('#scr-result').waitFor();
  const rows = await page.locator('#r-badges .bdg-row').allInnerTexts();
  assert.equal(rows.length, 2, rows.join(' | '));
  for (const s of ['こつこつ正解', 'はじめの一歩']) assert.ok(rows.some(r => r.includes(s)), `${s} が無い: ${rows.join(' | ')}`);
  assert.equal(await toastN(page), 0);
});

// 結果画面のまま取れたものはパネルに足す。ホームに戻ったらトースト
t('later_steps_join_panel', async page => {
  await playPractice(page);
  await page.evaluate(() => BADGES.debug.set('right', 100));
  const rows = await page.locator('#r-badges .bdg-row').allInnerTexts();
  assert.equal(rows.length, 2, rows.join(' | '));
  assert.ok(rows.some(r => r.includes('こつこつ正解')), rows.join(' | '));
  assert.equal(await toastN(page), 0);
  await page.click('#brand');
  await page.evaluate(() => BADGES.debug.set('streak', 10));
  await toastWith(page, 'れんぞく正解').waitFor();
});

// パネルの［つける］（ドパガキ OFF）: 押した行は「つけてる中」、自動でつけた行は「をつけたよ」をやめて［つける］。払ったコインはそのまま
t('panel_equip_feedback', async (page, app) => {
  await withRpg(app, {});   // ●+50 が描き直しても残るか見るため
  await playPractice(page, { count: 10 });
  const rows = page.locator('#r-badges .bdg-row'), n = await rows.count();
  assert.ok(n >= 2, `行が ${n}`);
  const coins = await rows.locator('.bdg-paid').allInnerTexts();
  assert.ok(coins.every(s => s === '●+50'), coins.join(' | '));
  assert.match(await rows.nth(0).innerText(), /をつけたよ/);
  const key = await rows.nth(1).getAttribute('data-key');
  await rows.nth(1).locator('[data-bdg-equip]').click();
  assert.equal(await page.evaluate(() => BADGES.titleKey()), key);
  assert.match(await rows.nth(1).innerText(), /つけてる中/);
  assert.equal(await rows.nth(1).locator('[data-bdg-equip]').count(), 0);
  assert.equal(await page.evaluate(key => document.activeElement.matches(`#r-badges > .bdg-row[data-key="${key}"] > .bdg-on`), key), true);   // 描き直してもフォーカスは押した行に
  const first = await rows.nth(0).innerText();
  assert.doesNotMatch(first, /をつけたよ/);
  assert.equal(await rows.nth(0).locator('[data-bdg-equip]').count(), 1, first);
  assert.equal(await rows.count(), n);
  assert.deepEqual(await rows.locator('.bdg-paid').allInnerTexts(), coins);
  assert.ok(await noHScroll(page));
});

// 図鑑の詳細（ダイアログ）を開いている間はトーストを出さず、閉じたら出す
t('book_toast_after_dialog', async page => {
  await page.click('#home-book');
  for (let i = 0; i < 10; i++) {
    await page.locator('#grid .card').nth(i).click();
    await page.waitForSelector('#detail[open]');
    if (i === 9) assert.equal(await toastN(page), 0, '10個目を開いた時点');
    await page.evaluate(() => $('detail').close());
  }
  const toast = toastWith(page, '図鑑めくり');
  await toast.waitFor();
  const s = await toast.innerText();
  for (const w of ['銅', '称号〈図鑑好き〉']) assert.ok(s.includes(w), `${w} が無い: ${s}`);
  await toast.evaluate(e => Promise.all(e.getAnimations({ subtree: true }).map(a => a.finished)));   // 出るときの動き（translateY）の途中だと高さが 43.99… になる
  const h = await toast.locator('[data-bdg-equip="book@1"]').evaluate(e => e.getBoundingClientRect().height);
  assert.ok(h >= 44, `［つける］の高さ ${h}`);
}, { storage: { badges: { v: 1, eq: '' } } });

// タイムアタックの失格（結果画面が無い）はトースト。［もう一回］［モード選択へ］に重ならない
t('ta_fail_toast_no_overlap', async page => {
  await page.evaluate(() => BADGES.debug.set('right', 99));
  await pickSetup(page, { mode: 'f2n', kind: 'ta', region: 'all', count: 5 });
  await page.click('#start');
  await answerCorrect(page);
  await answerWrong(page);
  await page.waitForSelector('#next');
  await toastWith(page, 'こつこつ正解').waitFor();
  await scrollStill(page);
  const m = await page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    return { toasts: [...document.querySelectorAll('#toasts .toast')].map(box), btns: [...document.querySelectorAll('#next, .reveal .row.end .btn')].map(box) };
  });
  const hit = (p, q) => p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;
  assert.ok(m.toasts.length && m.btns.length >= 2, json(m));
  for (const p of m.toasts) for (const q of m.btns) assert.ok(!hit(p, q), `重なっている: ${json({ p, q })}`);
});

// 失格のトーストが出ているうちに［もう一回］: 次のタイムアタックの間はバッジのトーストを出さない（タイマーと問題に重ねない）
t('ta_retry_hides_toasts', async page => {
  await page.evaluate(() => BADGES.debug.set('right', 99));
  await pickSetup(page, { mode: 'f2n', kind: 'ta', region: 'all', count: 5 });
  await page.click('#start');
  await answerCorrect(page);
  await answerWrong(page);
  await toastWith(page, 'こつこつ正解').waitFor();
  await page.click('#next');
  await page.waitForFunction(() => G.kind === 'ta' && !G.ended);
  for (let ms = 0; ms <= 1200; ms += 300) {
    assert.equal(await count(page, '#toasts [data-bdg-toast]'), 0, `始めて ${ms}ms`);
    await page.waitForTimeout(300);
  }
  assert.equal(await page.evaluate(() => G.kind === 'ta' && !G.ended), true);   // ずっとタイムアタックの途中だった
});

// 一度に出す枚数: スマホは2枚（多ければ「ほか◯個」）、PC は3枚。400ms ずつずらす
t('toast_limits', async page => {
  await watchToasts(page);
  await page.evaluate(() => BADGES.debug.set('right', 5000));   // 銅・銀・金
  await page.waitForFunction(() => window.__tt.length >= 2);
  let texts = await page.locator('#toasts .toast').allInnerTexts();
  assert.equal(texts.length, 2, texts.join(' | '));
  assert.match(texts[1], /ほか2個のバッジもゲット！/);
  await page.setViewportSize(PC);
  await page.evaluate(() => { $('toasts').replaceChildren(); window.__tt = []; BADGES.debug.reset(); BADGES.debug.set('right', 5000); });
  await page.waitForFunction(() => window.__tt.length >= 3);
  texts = await page.locator('#toasts .toast').allInnerTexts();
  assert.equal(texts.length, 3, texts.join(' | '));
  assert.ok(texts.every(s => !s.includes('ほか')), texts.join(' | '));
  const tt = await page.evaluate(() => window.__tt);
  assert.equal(tt.length, 3);
  assert.ok(tt[2] - tt[0] >= 700, `1枚目と3枚目の差 ${tt[2] - tt[0]}ms`);
});

// 3枚を 400ms ずつ出している途中でクイズを始めた（PC）: 出ていた1枚は消し、残りの2枚はクイズの間は出さずに結果のあとで出す
t('quiz_start_holds_toasts', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  const at = await page.evaluate(() => new Promise(ok => {
    const t0 = performance.now();
    BADGES.debug.set('right', 5000);   // こつこつ正解の金（自動でつけたので先頭）・銅・銀。1枚目はすぐ、2・3枚目は 400・800ms あと
    setTimeout(() => {
      const shown = document.querySelectorAll('#toasts [data-bdg-toast]').length;
      $('start').click();
      ok({ shown, ms: performance.now() - t0 });
    }, 150);
  }));
  assert.equal(at.shown, 1, json(at));
  assert.ok(at.ms < 300, json(at));
  await page.waitForSelector('#qcard .choice');
  assert.equal(await count(page, '#toasts [data-bdg-toast]'), 0, '始めたとき');
  await page.waitForTimeout(1000);
  assert.equal(await count(page, '#toasts [data-bdg-toast]'), 0, '始めて1秒');
  assert.equal(await page.evaluate(() => G.ended), undefined);   // まだクイズの途中
  await clearByAnswering(page);
  await toastWith(page, 'こつこつ正解 銀').waitFor();
  const texts = await page.locator('#toasts [data-bdg-toast]').allInnerTexts();
  assert.equal(texts.length, 2, texts.join(' | '));
  assert.ok(texts.some(s => s.includes('こつこつ正解 銅')), texts.join(' | '));
  assert.ok(texts.every(s => !s.includes('こつこつ正解 金')), texts.join(' | '));   // 始める前に出ていた1枚は出し直さない
}, { viewport: PC });

// トーストの文字を押すとすぐ消える。［つける］［見る］を押してもそのトーストは消える
t('toast_click', async page => {
  await page.evaluate(() => BADGES.debug.set('right', 100));
  const first = toastWith(page, 'こつこつ正解');
  await first.locator('.bdg-toast p').first().click();
  assert.equal(await first.count(), 0);
  await page.evaluate(() => BADGES.debug.set('streak', 10));
  const second = toastWith(page, 'れんぞく正解');
  await second.locator('[data-bdg-equip="streak@1"]').click();
  assert.equal(await page.evaluate(() => BADGES.title()), '波に乗る人');
  assert.equal(await second.count(), 0);
  await page.evaluate(() => BADGES.debug.set('days', 30));   // 銅・銀・金
  const more = toastWith(page, 'ほか2個のバッジもゲット！');
  await more.locator('[data-bdg-open]').click();
  assert.equal(await page.isVisible('#scr-badges'), true);
  assert.equal(await more.count(), 0);
}, { storage: { badges: { v: 1, eq: '' } } });

// 国名ヒントありでクリアしたら、パネルに注意を1行（3回まで）
t('hint_tip_three_times', async page => {
  await pickSetup(page, { mode: 'm2f', kind: 'practice', region: 'all', count: 5 });
  await page.check('#nameopt');
  await page.click('#start');
  await clearByAnswering(page);
  assert.equal(await text(page, '#r-badges .bdg-tip'), '国名ヒントありのときは、ノーミス・モード・地域の銀と金などのバッジは進まないよ');
  assert.equal((await saved(page)).tip, 3);
  await settleResult(page);
  await page.click('#r-again');
  await clearByAnswering(page);
  assert.equal(await count(page, '#r-badges .bdg-tip'), 0);
}, { storage: { badges: { v: 1, tip: 2 } } });

// 背の低い PC でも、7個取れた結果画面で［もう一回］がスクロールなしで押せる（パネルは4行と「ほか3個」）
for (const viewport of [{ width: 1366, height: 657 }, { width: 1280, height: 577 }]) {
  t(`result_panel_pc_fits_${viewport.width}x${viewport.height}`, async page => {
    await page.evaluate(() => { BADGES.debug.set('right', 95); BADGES.debug.set('days', 2); BADGES.debug.set('last', '2000-01-01'); });
    await playPractice(page, { count: 10 });   // first-clear answers streak prac-perfect reg-world days comeback
    await settleLayout(page);
    assert.equal(await count(page, '#r-badges .bdg-row'), 4);
    assert.match(await text(page, '#r-badges .bdg-more'), /ほか3個/);
    assert.match(await text(page, '#r-badges'), /をつけたよ/);   // 自動でつけた称号は「ほか」に入れない
    assert.equal(await page.evaluate(() => $('r-badges').parentElement.id), 'r-side');
    assert.ok(await noHScroll(page));
    const r = await rectOf(page, '#r-again'), win = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    assert.ok(r.bottom <= win.h && r.right <= win.w, json({ r, win }));
  }, { viewport });

}

// 練習10問で、はじめの misses 問をまちがえてからクリアする（まちがえた国は後ろに回る）。
// パネルは first-clear answers streak reg-world days comeback の6個で、4行と「ほか2個」
async function playMisses(page, misses) {
  await page.evaluate(() => { BADGES.debug.set('right', 95); BADGES.debug.set('days', 2); BADGES.debug.set('last', '2000-01-01'); });
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 10 });
  await page.click('#start');
  for (let i = 0; i < misses; i++) { await answerWrong(page); await page.click('#next'); }
  await clearByAnswering(page);
  await settleLayout(page);
  assert.equal(await count(page, '#r-side .misslist li'), misses);
  assert.equal(await count(page, '#r-badges .bdg-row'), 4);
  assert.match(await text(page, '#r-badges .bdg-more'), /ほか2個/);
  assert.ok(await noHScroll(page));
}
// ［もう一回］がスクロールしないで全部見えている
async function againInView(page) {
  const r = await rectOf(page, '#r-again'), win = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, y: scrollY }));
  assert.ok(win.y === 0 && r.top >= 0 && r.bottom <= win.h && r.right <= win.w, json({ r, win }));
}

// ≥1280 の背の低い PC: まちがえた国の一覧とパネル（4行と「ほか」）が #r-side に並んでも、［もう一回］はスクロールなしで押せる。
// 一覧が5か国以上なら左の列（点数と［もう一回］）も上にそろえる。4か国までは pc.css のまま上下まん中（上にそろえない）
for (const [viewport, misses] of [[{ width: 1366, height: 657 }, 10], [{ width: 1366, height: 657 }, 4],
  [{ width: 1280, height: 577 }, 10], [{ width: 1280, height: 577 }, 4], [{ width: 1536, height: 730 }, 1]]) {
  t(`result_panel_pc_fits_misses_${misses}_${viewport.width}x${viewport.height}`, async page => {
    await playMisses(page, misses);
    await againInView(page);
    const top = await page.evaluate(() => ({ result: $('rcard').querySelector(':scope > .result').getBoundingClientRect().top, side: $('r-side').getBoundingClientRect().top }));
    if (misses >= 5) assert.ok(Math.abs(top.result - top.side) < 1, `上にそろっていない: ${json(top)}`);
    else assert.ok(top.result - top.side > 20, `上にそろえている: ${json(top)}`);
    // 詰めても行の［つける］は 44px 以上
    const btn = await page.locator('#r-badges .bdg-row [data-bdg-equip]').first().evaluate(e => e.getBoundingClientRect().height);
    assert.ok(btn >= 44, `［つける］の高さ ${btn}`);
  }, { viewport });
}

// 900〜1279 の PC は #rcard が縦1列。パネルがあると、ボタンの行を点数のすぐ下（まちがえた国とパネルの上）に出し、［もう一回］をスクロールなしで押せるようにする。
// Tab の順も見た目の順（［もう一回］の次はまちがえた国・パネル、前は［モード選択へ］）
for (const [viewport, misses] of [[{ width: 1024, height: 600 }, 1], [{ width: 1024, height: 600 }, 10], [{ width: 1279, height: 700 }, 1],
  [{ width: 1279, height: 700 }, 10], [{ width: 1024, height: 768 }, 1], [{ width: 1024, height: 768 }, 10]]) {
  t(`result_panel_mid_pc_buttons_first_${misses}_${viewport.width}x${viewport.height}`, async page => {
    await playMisses(page, misses);
    await againInView(page);
    const g = await page.evaluate(() => {
      const b = e => e.getBoundingClientRect();
      return { result: b($('rcard').querySelector(':scope > .result')).bottom, btns: b($('r-again').parentElement), side: b($('r-side')).top };
    });
    assert.ok(g.result <= g.btns.top && g.btns.bottom <= g.side, `点数 → ボタン → まちがえた国とパネル の順でない: ${json(g)}`);
    await page.focus('#r-again');
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => !!document.activeElement.closest('#r-badges')), 'Tab で［もう一回］の次がパネルでない');
    await page.focus('#r-again');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'r-setup');
  }, { viewport });
}

// 本物の rpg.js と badges.js: 背の低い PC で、まちがえた国の一覧・バッジのパネル・冒険のコインのパネル（#r-ext）が #r-side に並んでも、
// ［もう一回］はスクロールなしで押せる。冒険のパネルがあるときは2か国から左右を上にそろえる（1か国までは上下まん中のまま）
for (const [viewport, misses] of [[{ width: 1280, height: 577 }, 1], [{ width: 1280, height: 577 }, 2], [{ width: 1280, height: 577 }, 4], [{ width: 1366, height: 657 }, 4]]) {
  t(`result_panels_with_rpg_pc_fits_misses_${misses}_${viewport.width}x${viewport.height}`, async page => {
    await playMisses(page, misses);
    assert.equal(await count(page, '#r-side > #r-ext > .rpg-res'), 1);
    await againInView(page);
    const top = await page.evaluate(() => ({ result: $('rcard').querySelector(':scope > .result').getBoundingClientRect().top, side: $('r-side').getBoundingClientRect().top }));
    if (misses >= 2) assert.ok(Math.abs(top.result - top.side) < 1, `上にそろっていない: ${json(top)}`);
    else assert.ok(top.result - top.side > 20, `上にそろえている: ${json(top)}`);
  }, { viewport, blockScripts: [] });
}

// 起動時の判定で取れたものは、まとめて1枚。称号は取ったなかでいちばん上の段（同じ色なら後ろ）
t('startup_summary', async page => {
  const ts = page.locator('#toasts .toast');
  await ts.first().waitFor();
  assert.equal(await ts.count(), 1);
  assert.match(await ts.innerText(), /これまでの記録から バッジを2個もらったよ！/);
  assert.equal(await ts.locator('[data-bdg-open]').count(), 1);
  assert.equal(await page.evaluate(() => BADGES.titleKey()), 'streak@1');
}, { storage: { badges: { v: 1, s: { right: 150, streak: 12 } } } });

// 起動時のまとめの1枚も、一度に出す枚数（PC 3枚・スマホ 2枚）に数える。
// 起動時の払いの中で rpg.js がレベルアップを出すと、その3段（銅・銀・金）がまとめの1枚と同じ回に出る
for (const [viewport, want] of [[PC, ['これまでの記録から バッジを1個もらったよ！', '旅人のレベル 銅', 'ほか2個のバッジもゲット！']],
  [PHONE, ['これまでの記録から バッジを1個もらったよ！', 'ほか3個のバッジもゲット！']]]) {
  t(`startup_summary_counts_toward_cap_${viewport.width}`, async (page, app) => {
    await app.context.addInitScript(() => {
      window.__tt = [];   // 出たトーストの文字（出た順）
      new MutationObserver(ms => {
        for (const m of ms) for (const n of m.addedNodes) if (n instanceof Element && n.matches('#toasts > .toast')) window.__tt.push(n.textContent);
      }).observe(document, { childList: true, subtree: true });
      window.RPG = { snapshot: () => ({}) };
      let once = false;
      document.addEventListener('badge:earned', e => {
        e.detail.paid = 50;
        if (!once) { once = true; document.dispatchEvent(new CustomEvent('rpg:levelup', { detail: { lv: 50 } })); }
      });
    });
    await page.reload();   // storage の初めの値で起動し直す（こつこつ正解の銅が起動時の判定で取れる）
    await toastWith(page, /ほか\d+個のバッジもゲット！/).waitFor();   // まとめの最後の1枚
    const tt = await page.evaluate(() => window.__tt);
    assert.equal(tt.length, want.length, tt.join(' | '));
    want.forEach((s, i) => assert.ok(tt[i].includes(s), `${i}枚目に ${s} が無い: ${tt.join(' | ')}`));
  }, { viewport, storage: { badges: { v: 1, s: { right: 150 } } } });
}

t('dialog_blocks_toast', async page => {
  await page.evaluate(() => $('detail').showModal());
  await page.evaluate(() => BADGES.debug.set('right', 100));
  assert.equal(await toastN(page), 0);
  await page.evaluate(() => $('detail').close());
  await page.locator('#toasts .toast').first().waitFor();
  assert.equal(await toastN(page), 1);
});

/* ---------- 冒険（rpg.js）との連携（設計書 §2.7、§3.3、§3.4、§8.2〜§8.4） ---------- */
// 偽の rpg.js（window.RPG.snapshot() と、badge:earned で払う）を入れて読み直す（本物の rpg.js は t が止めているので、偽のほうが効く）。
// 払う額は sessionStorage の pay があればそちら（reload しても残るので、途中で払える／払えないを切りかえられる）
async function withRpg(app, snap = {}, paid = 50) {
  await app.context.addInitScript(([snap, paid]) => {
    window.__snap = snap; window.__earned = [];
    window.RPG = { snapshot: () => window.__snap };
    document.addEventListener('badge:earned', e => {
      window.__earned.push({ ...e.detail });
      const o = sessionStorage.getItem('pay'), p = o !== null ? JSON.parse(o) : paid;
      if (p !== undefined) e.detail.paid = p;
    });
  }, [snap, paid]);
  await app.page.reload();
}
// 偽の rpg.js が受け取った badge:earned の detail（paid を書く前）
const earned = page => page.evaluate(() => window.__earned);
const BATTLE_WIN = { dungeon: 'samerica', floor: 1, boss: false, win: true, first: true, mistakes: 0, gauge: 0, maxCombo: 3, lv: 10, recLv: 1 };

// rpg.js が無いときは冒険のバッジを出さず、badge:earned も出さない
t('rpg_hidden_without_rpg', async page => {
  await page.evaluate(() => { window.__n = 0; document.addEventListener('badge:earned', () => window.__n++); });
  assert.equal(await page.evaluate(() => BADGES.count().total), 26);
  await page.evaluate(() => BADGES.open());
  await page.locator('#bdg-cats [data-cat="all"]').waitFor();
  assert.equal(await count(page, '#bdg-cats [data-cat="rpg"]'), 0);
  await playPractice(page);
  const d = await saved(page);
  assert.equal(typeof d.got['first-clear@1'], 'number');
  assert.equal(await page.evaluate(() => window.__n), 0);
  assert.deepEqual(d.sent, []);
});

// 英雄の塔: rpg:tower が来たら snapshot の tower でその場で判定し直す（10階で「塔の見習い」）
t('rpg_tower_badge_on_event', async (page, app) => {
  await withRpg(app, { intro: true, lv: 30, floors: { world: 5 }, st: { win: 3 }, tower: 9 });
  const before = (await earned(page)).map(e => e.id);
  assert.ok(!before.some(id => id.startsWith('rpg-tower')), json(before));
  await page.evaluate(() => {
    window.__snap = { ...window.__snap, tower: 10 };
    document.dispatchEvent(new CustomEvent('rpg:tower', { detail: { floor: 10, win: true, best: 10, newBest: true, coins: 35 } }));
  });
  const ev = (await earned(page)).filter(e => e.id.startsWith('rpg-tower'));
  assert.deepEqual(ev.map(e => e.id), ['rpg-tower@1']);
  assert.equal(typeof (await saved(page)).got['rpg-tower@1'], 'number');
});

// 起動時に snapshot からさかのぼる。払いは retro: true で1つずつ1回、トーストはまとめて1枚。読み直しても二度払いしない
t('rpg_retro_on_startup', async (page, app) => {
  await withRpg(app, { intro: true, lv: 12, owned: 60, floors: { samerica: 5 }, st: { win: 3 }, bountyDays: 2, overcome: { jp: 1 } });
  assert.equal(await page.evaluate(() => BADGES.count().total), 38);
  const want = ['rpg-start@1', 'rpg-first-win@1', 'rpg-lv@1', 'rpg-boss@1', 'rpg-cards@1', 'rpg-bounty@1', 'overcome@1'].sort();
  const ev = await earned(page);
  assert.deepEqual(ev.map(e => e.id).sort(), want);
  assert.ok(ev.every(e => e.retro === true), json(ev));
  assert.deepEqual([...(await saved(page)).sent].sort(), want);
  const ts = page.locator('#toasts .toast');
  await ts.first().waitFor();
  await page.waitForTimeout(500);   // 400ms ずつずらした2枚目が来ないこと
  assert.equal(await ts.count(), 1);
  assert.match(await ts.innerText(), /これまでの記録から バッジを7個もらったよ！/);
  await page.reload();
  assert.deepEqual(await earned(page), []);
});

// 冒険のイベントで取ったら、すぐ払ってトーストに ●+50
t('rpg_event_awards', async (page, app) => {
  await withRpg(app, {});
  await emitIn(page, 'rpg:levelup', { lv: 10, from: 9 });
  assert.deepEqual(await earned(page), [{ id: 'rpg-lv@1', badge: 'rpg-lv', tier: 1, title: '一人前の旅人', color: 1, retro: false }]);
  const toast = toastWith(page, '旅人のレベル');
  await toast.waitFor();
  assert.match(await toast.innerText(), /●\+50/);
});

// rpg.js が 0（もう払ってある）を書いたら、払ったとみなす（sent に入れる）。●+ は出さない
t('rpg_paid_zero_counts_as_paid', async (page, app) => {
  await withRpg(app, {}, 0);
  await emitIn(page, 'rpg:levelup', { lv: 10, from: 9 });
  assert.ok((await saved(page)).sent.includes('rpg-lv@1'));
  const toast = toastWith(page, '旅人のレベル');
  await toast.waitFor();
  const s = await toast.innerText();
  assert.ok(!s.includes('●+'), s);
});

// 払えなかった（false）ステップは sent に入れず、次の起動で retro: true で送り直す
t('rpg_paid_false_resend', async (page, app) => {
  await withRpg(app, {}, false);
  await emitIn(page, 'rpg:coins', { delta: 0, reason: 'start', coins: 0, earned: 0 });
  const d = await saved(page);
  assert.equal(typeof d.got['rpg-start@1'], 'number');
  assert.ok(!d.sent.includes('rpg-start@1'), json(d.sent));
  const toast = toastWith(page, '旅立ち');
  await toast.waitFor();
  const s = await toast.innerText();
  assert.ok(!s.includes('●+'), s);
  await page.evaluate(() => sessionStorage.setItem('pay', '50'));
  await page.reload();
  assert.deepEqual(await earned(page), [{ id: 'rpg-start@1', badge: 'rpg-start', tier: 1, title: '見習い旅人', color: 1, retro: true }]);
  assert.ok((await saved(page)).sent.includes('rpg-start@1'));
  await page.reload();
  assert.deepEqual(await earned(page), []);
});

// rpg.js があとから入ったら、前に取ったステップを起動時に retro: true で払う
t('rpg_late_install', async (page, app) => {
  await playPractice(page);
  assert.deepEqual((await saved(page)).sent, []);
  await withRpg(app, {});
  assert.deepEqual(await earned(page), [{ id: 'first-clear@1', badge: 'first-clear', tier: 1, title: 'ドリルの新人', color: 1, retro: true }]);
  await page.reload();
  assert.deepEqual(await earned(page), []);
});

// クイズ中に来た冒険のイベントは積むだけ（保存も判定もしない）。結果でまとめて判定する
t('rpg_quiz_defers', async (page, app) => {
  await withRpg(app, {});
  const before = await page.evaluate(() => localStorage.getItem('badges'));
  await startPractice(page);
  await answerCorrect(page);
  await emitIn(page, 'rpg:overcome', { a: 'jp', total: 1 });
  assert.equal(await page.evaluate(() => localStorage.getItem('badges')), before);
  assert.equal(await toastN(page), 0);
  await page.click('#next');
  await clearByAnswering(page);
  assert.match(await text(page, '#r-badges'), /苦手克服/);
});

// バトルの1問ごと（rpg:answer）も積むだけ。次の判定（rpg:battle など）でまとめて判定する
t('rpg_answer_defers', async (page, app) => {
  await withRpg(app, {});
  await page.evaluate(() => BADGES.debug.set('right', 99));
  const before = await page.evaluate(() => localStorage.getItem('badges'));
  await emitIn(page, 'rpg:answer', { a: 'jp', right: true, mode: 'f2n', dungeon: 'asia', boss: false });
  assert.equal(await page.evaluate(() => localStorage.getItem('badges')), before);
  assert.equal((await dump(page)).got['answers@1'], undefined);
  await emitIn(page, 'rpg:battle', BATTLE_WIN);
  assert.equal(typeof (await saved(page)).got['answers@1'], 'number');
});

// バトル中は保留し、rpg:battle が来たら出す
t('rpg_battle_holds', async (page, app) => {
  await withRpg(app, {});
  await emitIn(page, 'drill:screen', { name: 'battle' });
  await emitIn(page, 'rpg:levelup', { lv: 10, from: 9 });
  assert.equal(await toastN(page), 0);
  await emitIn(page, 'rpg:battle', BATTLE_WIN);
  await toastWith(page, '旅人のレベル').waitFor();
  await toastWith(page, '初勝利').waitFor();
});

// バトルの終わりに同じタスクで続けて来たもの（rpg:battle → rpg:clear → コイン → 仲間・克服）は、まとめて1回のお知らせ（スマホは2枚まで）
t('rpg_battle_end_one_notice', async (page, app) => {
  await withRpg(app, {});
  await page.evaluate(() => {
    const go = (type, detail) => document.dispatchEvent(new CustomEvent(type, { detail }));
    go('rpg:battle', { dungeon: 'oceania', floor: 5, boss: true, win: true, first: true, mistakes: 0, gauge: 0, maxCombo: 3, lv: 3, recLv: 9 });
    go('rpg:clear', { dungeon: 'oceania' });
    go('rpg:coins', { delta: 100, reason: 'battle', coins: 100, earned: 100 });
    go('rpg:join', { a: 'jp', via: 'learn', owned: 1 });
    go('rpg:overcome', { a: 'fr', total: 1 });
  });
  await page.waitForTimeout(1000);   // 400ms ずつずらした分も出きる
  assert.equal(await toastN(page), 2);
  assert.equal(await toastWith(page, 'ほか').count(), 1);
  const ids = (await earned(page)).map(e => e.id);
  for (const k of ['rpg-first-win@1', 'rpg-boss@1', 'rpg-friend@1', 'overcome@1']) assert.ok(ids.includes(k), `${k} が無い: ${json(ids)}`);
  assert.deepEqual([...(await saved(page)).sent].sort(), [...ids].sort());
});

// ガチャの演出中（reduced motion なら最後の rpg:pull から1秒）は保留し、過ぎたら出す。ガチャで仲間になっても「覚えて仲間に」は取れない
t('rpg_gacha_holds', async (page, app) => {
  await withRpg(app, {});
  await emitIn(page, 'drill:screen', { name: 'gacha' });
  await emitIn(page, 'rpg:pull', {});
  await emitIn(page, 'rpg:join', { a: 'jp', via: 'gacha', owned: 50 });
  await page.waitForTimeout(500);
  assert.equal(await toastN(page), 0);
  await page.waitForTimeout(1000);
  assert.equal(await toastWith(page, '仲間あつめ').count(), 1);
  assert.equal((await dump(page)).got['rpg-friend@1'], undefined);
}, { reducedMotion: 'reduce' });

// via の無い古い rpg.js の promote: ★2 で、いまの画面がガチャでなければ覚えて昇格したとみなす
t('rpg_promote_without_via', async (page, app) => {
  await withRpg(app, {});
  await emitIn(page, 'rpg:promote', { a: 'jp', star: 2 });
  assert.equal(typeof (await dump(page)).got['rpg-master@1'], 'number');
  await page.evaluate(() => BADGES.debug.reset());
  await emitIn(page, 'drill:screen', { name: 'gacha' });
  await emitIn(page, 'rpg:promote', { a: 'jp', star: 2 });
  assert.equal((await dump(page)).got['rpg-master@1'], undefined);
});

// badge:earned のリスナーの中で rpg.js がイベントを出しても（入れ子）、1つのステップは1回だけ払い、sent も重ならない
t('rpg_nested_events', async (page, app) => {
  await withRpg(app, {});
  await app.context.addInitScript(() => document.addEventListener('badge:earned', e => {
    if (e.detail.id !== 'answers@1') return;
    document.dispatchEvent(new CustomEvent('rpg:coins', { detail: { delta: 50, reason: 'badge' } }));
    document.dispatchEvent(new CustomEvent('rpg:levelup', { detail: { lv: 10, from: 9 } }));
  }));
  await page.reload();
  await page.evaluate(() => BADGES.debug.set('right', 100));
  const ids = (await earned(page)).map(e => e.id);
  assert.deepEqual([...ids].sort(), ['answers@1', 'rpg-lv@1'], json(ids));
  const { sent } = await saved(page);
  assert.equal(new Set(sent).size, sent.length, json(sent));
  assert.deepEqual([...sent].sort(), ['answers@1', 'rpg-lv@1']);
});

// 自動でつけたことは、払いの commit のあとでもパネルと badge:title に伝わる
t('rpg_auto_title_kept', async (page, app) => {
  await withRpg(app, {});
  await listenTitle(page);
  await playPractice(page);
  const s = await text(page, '#r-badges');
  for (const w of ['称号〈ドリルの新人〉をつけたよ', '●+50']) assert.ok(s.includes(w), `${w} が無い: ${s}`);
  assert.deepEqual(await page.evaluate(() => window.__bt), [{ key: 'first-clear@1', title: 'ドリルの新人' }]);
});

// BADGES.title() はかっこなし（〈〉は表示する側が付ける）
t('title_without_brackets', async (page, app) => {
  await withRpg(app, {});
  await playPractice(page);
  assert.equal(await page.evaluate(() => BADGES.title()), 'ドリルの新人');
});

/* ---------- ドパガキと reduced motion（設計書 §5.4） ---------- */
// FX の4つを、呼ばれた引数を window.__fx に [名前, ...引数] で積んでから元を呼ぶものに置きかえる（badges.js は呼ぶときに FX から読む）
const spyFx = page => page.evaluate(() => {
  window.__fx = [];
  for (const k of ['sfx', 'confetti', 'pop', 'flash']) {
    const orig = FX[k];
    FX[k] = function (...a) { window.__fx.push([k, ...a]); return orig.apply(this, a); };
  }
});
const fxCalls = page => page.evaluate(() => window.__fx);
const fxReset = page => page.evaluate(() => { window.__fx = []; });
// バッジの部分で動いているアニメの数（index.html のドパガキのボタンのアニメは数えない）
const badgeAnims = page => page.evaluate(() => document.getAnimations().filter(a => a.effect?.target?.closest?.('[class*="bdg-"], #toasts, #r-badges')).length);
const DOPA = { region: 'all', dopa: true, sound: false };

t('reduced_motion_static', async page => {
  await spyFx(page);
  await playPractice(page);
  await fxReset(page);                         // index.html の結果の演出はここまでで終わっている
  assert.equal(await count(page, '#r-badges'), 1);
  await page.waitForTimeout(800);
  assert.equal(await badgeAnims(page), 0);
  const fx = await fxCalls(page);
  assert.deepEqual(fx.filter(c => ['confetti', 'pop', 'flash'].includes(c[0])), [], json(fx));
  assert.ok(fx.some(c => json(c) === json(['sfx', 'correct', 10])), json(fx));
  await page.evaluate(() => show('home'));
  await page.evaluate(() => BADGES.debug.set('right', 1000));
  await page.waitForFunction(() => document.querySelectorAll('#toasts [data-bdg-toast]').length >= 2);   // 銅と、400ms あとの銀
  assert.equal(await badgeAnims(page), 0);
  await page.evaluate(() => { BADGES.debug.grant('answers@3'); show('badges'); });   // 金のメダルも止まっている
  assert.equal(await badgeAnims(page), 0);
  assert.deepEqual((await fxCalls(page)).filter(c => c[0] !== 'sfx'), []);
}, { reducedMotion: 'reduce', storage: { settings: DOPA } });

t('dopa_effects', async page => {
  await spyFx(page);
  await playPractice(page);
  await fxReset(page);
  await page.waitForTimeout(800);
  let fx = await fxCalls(page);
  assert.ok(fx.some(c => json(c) === json(['sfx', 'correct', 10])), json(fx));
  assert.ok(fx.some(c => c[0] === 'confetti' && c[2] === 80), json(fx));
  await page.click('#brand');
  await fxReset(page);
  await page.evaluate(() => BADGES.debug.set('right', 5000));   // 銅・銀・金
  await page.waitForTimeout(1500);
  fx = await fxCalls(page);
  assert.ok(fx.some(c => json(c) === json(['sfx', 'correct', 8])), json(fx));
  assert.ok(fx.some(c => c[0] === 'confetti' && c[2] === 60), json(fx));
  await page.evaluate(() => BADGES.open('answers'));
  await page.click('#detail [data-bdg-equip="answers@1"]');
  assert.ok((await fxCalls(page)).some(c => json(c) === json(['pop', '称号チェンジ！', 'small'])), json(await fxCalls(page)));
  // #detail は showModal の top layer。ポップはその中に移っていないと下に隠れる
  assert.ok(await page.evaluate(() => document.querySelector('.fx-pop')?.parentElement === $('detail')));
  await page.evaluate(() => { $('detail').close(); show('badges'); });
  assert.ok(await badgeAnims(page) > 0);
  await page.waitForFunction(() => !document.querySelector('#detail > .fx-pop'));   // 次に開いたとき出直さない
  // 称号えらび（つけてすぐ閉じる）では body に出たまま
  await page.click('#bdg-change');
  await page.click('#detail [data-bdg-pick="answers@2"]');
  assert.ok(await page.evaluate(() => !$('detail').open && document.querySelector('.fx-pop')?.parentElement === document.body));
}, { viewport: PC, reducedMotion: 'no-preference', storage: { settings: DOPA } });

t('dopa_off_quiet', async page => {
  await spyFx(page);
  await page.evaluate(() => BADGES.debug.set('right', 5000));
  await page.waitForTimeout(1000);             // 400ms ずつずらした分も出きる
  assert.equal(await toastN(page), 2);
  await page.evaluate(() => BADGES.open('answers'));
  await page.click('#detail [data-bdg-equip="answers@1"]');
  assert.equal(await page.evaluate(() => BADGES.titleKey()), 'answers@1');
  assert.deepEqual(await fxCalls(page), []);
}, { reducedMotion: 'no-preference' });

// ヒントの注意だけのパネル（バッジが取れていない）では、ドパガキでも音も紙吹雪も出さない
t('dopa_tip_only_quiet', async page => {
  await spyFx(page);
  await pickSetup(page, { mode: 'm2f', kind: 'practice', region: 'all', count: 5 });
  await page.check('#nameopt');
  await page.click('#start');
  await clearByAnswering(page);
  await fxReset(page);
  assert.equal(await count(page, '#r-badges .bdg-tip'), 1);
  assert.equal(await count(page, '#r-badges .bdg-row'), 0);
  await page.waitForTimeout(800);
  assert.deepEqual(await fxCalls(page), []);
}, { reducedMotion: 'no-preference', storage: { settings: DOPA, badges: { ...QUIET_BADGES, tip: 0 } } });

// 文字の色と、下に見えている背景（いちばん近い、背景色が透明でない祖先）の色のコントラスト比（WCAG の式）
const contrastOf = (page, sel) => page.evaluate(sel => {
  const rgba = s => { const [r, g, b, a = 1] = s.match(/[\d.]+/g).map(Number); return { r, g, b, a }; };
  const lum = ({ r, g, b }) => { const f = c => (c /= 255) <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const el = document.querySelector(sel);
  let under = el;
  while (under.parentElement && rgba(getComputedStyle(under).backgroundColor).a === 0) under = under.parentElement;
  const fg = getComputedStyle(el).color, bg = getComputedStyle(under).backgroundColor, [p, q] = [lum(rgba(fg)), lum(rgba(bg))];
  return { fg, bg, under: under.id || under.tagName, ratio: (Math.max(p, q) + .05) / (Math.min(p, q) + .05) };
}, sel);

t('dark_dopa_layouts', async page => {
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const key = `${width}x${height}`;
    await page.setViewportSize({ width, height });
    await page.evaluate(() => show('home'));
    assert.ok(await noHScroll(page), `home ${key}`);
    const c = await contrastOf(page, '#home-badges');   // .btn.ghost は背景が透明なので、下に見えている背景と比べる
    assert.ok(c.ratio >= 4.5, `#home-badges ${key}: ${json(c)}`);
    await page.evaluate(() => show('badges'));
    assert.ok(await noHScroll(page), `badges ${key}`);
  }
}, { colorScheme: 'dark', storage: { settings: { ...DOPA, theme: 'auto' }, badges: { v: 1, got: { 'answers@1': 1, 'answers@2': 1, 'answers@3': 1 }, eq: 'answers@3', sn: { answers: 2 } } } });
