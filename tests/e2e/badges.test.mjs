// バッジと称号（badges.js のブラウザの部分）。クイズのイベントから記録を取り、ゲームが終わってから判定して保存する。偽の Supabase・スマホ幅で確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerCorrect, clearTimeAttack, clearByAnswering } from './helpers.mjs';
import { measureFit, settleLayout, rectOf } from './layout.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで ?bdgdebug=1 を付けて開き、最後にページで例外が出ていないかも見る。opts は openApp にそのまま渡す
const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { url: server.url + '?bdgdebug=1', ...opts });
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
    css: !!document.querySelector('link[href="badges.css?v=1"]'), js: !!document.querySelector('script[src="badges.js?v=1"]'),
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

// localStorage が例外を投げても、クイズは動き、バッジはメモリの中で数える
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

// index.html のグローバルが足りなければ、console.error を1回出して何も作らない。クイズはそのまま動く
test('missing_global_is_safe', { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { url: server.url });
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
// 計画 D の冒険ボタンの代わりに、ダミーの「冒険」ボタンを #home-rank の前に足す（ボタン5つのホームを確かめる）
const addAdvButton = page => page.evaluate(() => {
  const b = document.createElement('button');
  Object.assign(b, { className: 'btn ghost', id: 'home-adv', textContent: '冒険' });
  $('home-rank').before(b);
});
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

t('share_copies', async (page, app) => {
  await app.context.addInitScript(() => {
    delete Navigator.prototype.share;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: s => { window.__clip = s; return Promise.resolve(); } } });
  });
  await page.reload();
  await page.evaluate(() => { BADGES.debug.grant('reg-asia@1'); BADGES.debug.grant('reg-asia@2'); BADGES.open('reg-asia'); });
  await page.click('#detail-inner [data-bdg-share]');
  await page.locator('#toasts .toast', { hasText: 'コピーしたよ' }).waitFor();
  assert.equal(await page.evaluate(() => window.__clip), '195か国ドリルでバッジ『アジア大陸横断（銀）』を取ったよ！ 称号〈アジア通〉 https://chikokunn1011.github.io/country-drill/');
  await page.evaluate(() => BADGES.open('book'));
  assert.equal(await count(page, '#detail-inner .bdg-detail'), 1);
  assert.equal(await count(page, '#detail-inner [data-bdg-share]'), 0);
});

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

// 横に並ぶホーム（900〜1279）でボタン5つと札がはみ出さず、札は自分の行に出る。≥1280 の2列ヒーローでは札を左に寄せる
t('home_menu_pc', async page => {
  await addAdvButton(page);
  await page.evaluate(() => { BADGES.debug.grant('first-clear@1'); BADGES.open('first-clear'); });
  await page.click('[data-bdg-equip="first-clear@1"]');
  await page.evaluate(() => { $('detail').close(); show('home'); });
  for (const [width, height] of [[900, 700], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    const m = await page.evaluate(() => {
      const row = document.querySelector('.bdg-titlerow').getBoundingClientRect();
      const btns = [...document.querySelectorAll('.menu .btn')].map(b => b.getBoundingClientRect()).filter(r => r.width);
      return { n: btns.length, inside: btns.every(r => r.right <= innerWidth), below: btns.every(r => row.bottom <= r.top) };
    });
    assert.deepEqual(m, { n: 5, inside: true, below: true }, `${width}x${height}`);
    assert.ok(await noHScroll(page), `${width}x${height}`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.bdg-titlerow')).justifyContent), 'flex-start');
}, { viewport: { width: 900, height: 700 } });

// 背の低い PC（150% 表示のノートなど）と、高さ 760 を少し超える PC で、ボタン5つと札があってもホームが縦にスクロールしない
t('home_short_pc_fits', async page => {
  await addAdvButton(page);
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
}, { viewport: { width: 1280, height: 577 }, storage: { badges: { v: 1, got: { 'first-clear@1': 1 }, eq: 'first-clear@1', sn: { 'first-clear': 2 } } } });

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
