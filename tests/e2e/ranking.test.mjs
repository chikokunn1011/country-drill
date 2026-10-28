// ランキング画面（ホームのボタン・条件の切り替え・歴代/今週・空/エラー表示）。偽の Supabase を使い、ふだんはスマホ幅で確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, clearTimeAttack, warned, PC, QUIET_BADGES } from './helpers.mjs';
import { RPG_FILES } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで開き、最後にページで例外が出ていないかも見る。opts は openApp にそのまま渡す
const t = (name, fn, opts = {}) => test(name, { timeout: 30_000 }, async () => {
  const app = await openApp(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const B = 'f2n:all:10'; // まっさらな状態のモード選択（国旗→国名・全世界・10問）の board
const text = (page, sel) => page.locator(sel).innerText();
const record = (board, nickname, time_ms, created_at = new Date()) => ({ board, nickname, time_ms, questions: 10, created_at: created_at.toISOString() });
const tops = db => db.calls.filter(c => c.name === 'top_scores2').map(c => c.args);
// その並びで押されているボタンの data-* の値
const picked = (page, id) => page.$$eval(`#${id} [aria-pressed="true"]`, bs => bs.map(b => Object.values(b.dataset)[0]));
const conds = async page => [await picked(page, 'rk-modes'), await picked(page, 'rk-regions'), await picked(page, 'rk-counts')];
// 表が n 行になるまで待って、各行の文字を返す
const rows = async (page, n) => {
  await page.waitForFunction(n => document.querySelectorAll('#rk-list li').length === n, n);
  return page.locator('#rk-list li').allInnerTexts();
};
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
// 表の名前が自分の欄からはみ出して（タイムや日付に重なって）いない
const namesFit = page => page.$$eval('#rk-list .nick', els => els.every(e => e.scrollWidth <= e.clientWidth));
const wait = ms => new Promise(ok => setTimeout(ok, ms));

// バッジのボタンは設定の前（称号の札も button なので、札が出ない QUIET_BADGES で開く）。いちばん上は今日の難問の帯（daily.js）
t('home_button_order', async page => {
  assert.deepEqual(await page.$$eval('.menu button', bs => bs.map(b => b.id)), ['home-daily', 'home-play', 'home-rank', 'home-profile', 'home-badges', 'home-settings']);
  assert.equal(await text(page, '#home-rank'), 'ランキング');
  assert.equal(await page.getAttribute('#home-rank', 'class'), 'btn ghost');
  await page.click('#home-rank');
  assert.equal(await page.isVisible('#scr-ranking'), true);
  assert.equal(await page.isHidden('#scr-home'), true);
  assert.equal(await page.isVisible('#topbar'), true);
}, { storage: { badges: QUIET_BADGES }, blockScripts: RPG_FILES });

// 何も止めないとき（本物の rpg.js と badges.js）は プレイ / 冒険 / ランキング / プロフィール / バッジ / 設定（RPG 設計 §3.1「プレイの次に冒険」、バッジ設計 §6.1「設定の直前」）
t('home_button_order_with_rpg', async page => {
  assert.deepEqual(await page.$$eval('.menu button', bs => bs.map(b => b.id)), ['home-daily', 'home-play', 'home-rpg', 'home-rank', 'home-profile', 'home-badges', 'home-settings']);
}, { storage: { badges: QUIET_BADGES } });

t('home_button_hidden_when_disabled', async page => {
  // 接続先が未設定の状態にする（submit.test.mjs の disabled_when_not_configured と同じやり方）
  await page.route('**/ranking.js*', async route => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()) + '\nRANKING.enabled = false;\n' });
  });
  await page.reload();
  assert.equal(await page.isVisible('#home-play'), true);
  assert.equal(await page.locator('#home-rank').count(), 1);
  assert.equal(await page.isHidden('#home-rank'), true);
});

t('opens_with_last_setup', async (page, { db }) => {
  await pickSetup(page, { mode: 'n2f', region: 'アジア', count: 20 });
  await page.click('#brand');
  await page.click('#home-rank');
  assert.equal(await page.locator('#rk-modes .chip').count(), 4);
  assert.equal(await page.locator('#rk-regions .chip').count(), 7);
  assert.equal(await page.locator('#rk-counts .chip').count(), 4);
  assert.deepEqual(await conds(page), [['n2f'], ['アジア'], ['20']]);
  assert.deepEqual(await picked(page, 'rk-tabs'), ['all']);
  await page.locator('#rk-empty').waitFor();
  assert.deepEqual(tops(db), [{ p_board: 'n2f:asia:20', p_period: 'all' }]);
});

// openRanking(board) は渡した条件で開く（モード選択の設定は使わず、書き換えもしない）
t('opens_given_board', async (page, { db }) => {
  await page.evaluate(() => openRanking('m2f:oceania:all'));
  assert.equal(await page.isVisible('#scr-ranking'), true);
  assert.deepEqual(await conds(page), [['m2f'], ['オセアニア'], ['all']]);
  assert.equal(await page.isDisabled('#rk-counts [data-c="20"]'), true); // オセアニアは14か国なので20問は無い
  await page.locator('#rk-empty').waitFor();
  assert.deepEqual(tops(db), [{ p_board: 'm2f:oceania:all', p_period: 'all' }]);
  assert.deepEqual(await page.evaluate(() => [P.mode, P.count, S.region]), ['f2n', 10, 'all']);
});

t('lists_top', async (page, { db }) => {
  db.rows.push(
    record(B, 'チコ', 9000, new Date('2026-10-01T03:00:00Z')),
    record(B, 'ミナ', 61234, new Date('2026-10-01T03:00:00Z')),
    record(B, 'チコ', 7000, new Date('2026-01-02T15:30:00Z')), // 日本時間では 1/3
    record('n2f:all:10', 'べつ', 1000),
  );
  await page.click('#home-rank');
  const r = await rows(page, 2);
  assert.match(r[0], /^1\s+チコ\s+7\.00秒\s+1\/3$/);
  assert.match(r[1], /^2\s+ミナ\s+1分01\.23秒\s+10\/1$/);
  assert.equal(await page.evaluate(() => RANKING.formatTime(61234)), '1分01.23秒');
  assert.equal(await page.isHidden('#rk-empty'), true);
  assert.equal(await page.isHidden('#rk-error'), true);
  assert.equal(await page.getAttribute('#rk-list', 'aria-busy'), 'false');
  assert.deepEqual(tops(db), [{ p_board: B, p_period: 'all' }]);
});

// 同じタイムは同じ順位（rank_of の「自分より速い人数＋1」と同じ数え方）
t('same_time_same_rank', async (page, { db }) => {
  db.rows.push(record(B, 'いち', 7000), record(B, 'に', 7000), record(B, 'さん', 7001));
  await page.click('#home-rank');
  const r = await rows(page, 3);
  assert.deepEqual(r.map(s => s.split(/\s+/)[0]), ['1', '1', '3']);
});

t('tabs_switch', async (page, { db }) => {
  db.rows.push(record(B, 'せんしゅう', 5000, new Date(Date.now() - 8 * 864e5)), record(B, 'こんしゅう', 6000));
  await page.click('#home-rank');
  assert.deepEqual(await page.locator('#rk-tabs button').allInnerTexts(), ['歴代', '今週']);
  assert.deepEqual(await picked(page, 'rk-tabs'), ['all']);
  assert.match((await rows(page, 2))[0], /^1\s+せんしゅう/);
  await page.click('#rk-tabs [data-p="week"]');
  assert.deepEqual(await picked(page, 'rk-tabs'), ['week']);
  const w = await rows(page, 1);
  assert.match(w[0], /^1\s+こんしゅう/);
  await page.click('#rk-tabs [data-p="all"]');
  await rows(page, 2);
  assert.deepEqual(tops(db).map(a => a.p_period), ['all', 'week', 'all']);
});

// 返事が遅れて前後しても、最後に選んだ条件の表が残る
t('latest_choice_wins', async (page, { db }) => {
  db.rows.push(record(B, 'せんしゅう', 5000, new Date(Date.now() - 8 * 864e5))); // 歴代には出て、今週には出ない
  await page.route('**/rest/v1/rpc/top_scores2', async route => {
    if (route.request().postDataJSON().p_period === 'all') await wait(500); // 歴代の返事だけ遅らせる
    await route.fallback();
  });
  const late = page.waitForResponse(res => res.url().endsWith('/top_scores2') && res.request().postDataJSON().p_period === 'all');
  await page.click('#home-rank');
  await page.click('#rk-tabs [data-p="week"]');
  await page.locator('#rk-empty').waitFor();
  await late; await wait(200); // 遅れた歴代の返事が届いて、ページが受け取り終わるまで
  assert.deepEqual(tops(db).map(a => a.p_period).sort(), ['all', 'week']);
  assert.deepEqual(await picked(page, 'rk-tabs'), ['week']);
  assert.equal(await page.locator('#rk-list li').count(), 0);
  assert.equal(await page.isVisible('#rk-empty'), true);
  assert.equal(await page.getAttribute('#rk-list', 'aria-busy'), 'false');
});

t('empty_state', async page => {
  await page.click('#home-rank');
  await page.locator('#rk-empty').waitFor();
  assert.equal(await text(page, '#rk-empty'), 'まだ誰もいない。1位のチャンス！');
  assert.equal(await page.locator('#rk-list li').count(), 0);
  // ランキング画面で条件を変えても、モード選択の設定は書き換えない
  await page.click('#rk-modes [data-k="m2f"]');
  await page.click('#rk-regions [data-r="ヨーロッパ"]');
  await page.click('#rk-counts [data-c="5"]');
  assert.deepEqual(await conds(page), [['m2f'], ['ヨーロッパ'], ['5']]);
  assert.deepEqual(await page.evaluate(() => [P.mode, P.kind, P.count, S.region, localStorage.getItem('setup'), localStorage.getItem('settings')]),
    ['f2n', 'practice', 10, 'all', null, null]);
  // 「この条件で遊ぶ」でモード選択へ。あそび方はタイムアタック、条件はランキングで選んだもの
  await page.click('#rk-play');
  assert.equal(await page.isVisible('#scr-setup'), true);
  assert.deepEqual(await picked(page, 'kinds'), ['ta']);
  assert.deepEqual(await picked(page, 'modes'), ['m2f']);
  assert.deepEqual(await picked(page, 'regions'), ['ヨーロッパ']);
  assert.deepEqual(await picked(page, 'counts'), ['5']);
  // 保存もされている（次に開いても同じ）
  const saved = await page.evaluate(() => [JSON.parse(localStorage.getItem('setup')), JSON.parse(localStorage.getItem('settings'))]);
  assert.deepEqual([saved[0].mode, saved[0].kind, saved[0].count, saved[1].region], ['m2f', 'ta', 5, 'ヨーロッパ']);
});

t('error_and_retry', async (page, { db, warnings }) => {
  await page.click('#home-rank');
  await page.locator('#rk-error').waitFor();
  assert.match(await text(page, '#rk-error'), /ランキングに接続できなかった/);
  // オフラインと設定ミスを見分けられるよう、原因はコンソールに残る
  assert.ok(await warned(warnings, /^ranking top /), warnings.join('\n'));
  assert.equal(await text(page, '#rk-retry'), '再読み込み');
  assert.equal(await page.isHidden('#rk-empty'), true);
  assert.equal(await page.locator('#rk-list li').count(), 0);
  // つながるようになったら再読み込みで表が出る
  db.down = false;
  db.rows.push(record(B, 'チコ', 7000));
  await page.click('#rk-retry');
  assert.match((await rows(page, 1))[0], /^1\s+チコ/);
  assert.equal(await page.isHidden('#rk-error'), true);
}, { supabase: 'down' });

t('nickname_is_escaped', async (page, { db }) => {
  db.rows.push(record(B, '<b>x</b>', 7000), record(B, '<img src=x>', 8000));
  await page.click('#home-rank');
  const r = await rows(page, 2);
  assert.equal(await page.locator('#rk-list b, #rk-list img').count(), 0);
  assert.match(r[0], /^1\s+<b>x<\/b>\s/);
  assert.match(r[1], /^2\s+<img src=x>\s/);
});

// 偽DB と localStorage にプロフィールを入れて開き直す（自動 ON）
const PID = 'abcdefghjk12';
async function withProfile(page, db, p = { token: 'tok-1', nickname: 'チコ', pid: PID }) {
  db.profiles.push(p);
  await page.evaluate(p => localStorage.setItem('profile', JSON.stringify({ token: p.token, pid: p.pid, name: p.nickname, auto: true, isPublic: true, sent: { isPublic: true } })), p);
  await page.reload();
  await page.waitForFunction(() => window.PROFILE);
  await page.evaluate(() => PROFILE.ready);
}

// 結果画面で（自動で）載せたあとの「ランキングを見る」→ その条件のランキングに自分の名前がある
t('ta_open_links_board', async (page, { db }) => {
  await withProfile(page, db);
  await clearTimeAttack(page, { mode: 'n2f', region: 'ヨーロッパ', count: 5 });
  await page.locator('#ta-open').waitFor();
  await page.click('#ta-open');
  assert.equal(await page.isVisible('#scr-ranking'), true);
  assert.deepEqual(await conds(page), [['n2f'], ['ヨーロッパ'], ['5']]);
  const [r] = await rows(page, 1);
  assert.match(r, /^1\s+チコ\s+\d+\.\d\d秒\s+\d+\/\d+$/);
  assert.equal(r.split(/\s+/)[2], await page.evaluate(() => RANKING.formatTime(Math.floor(G.timeMs))));
  assert.deepEqual(tops(db), [{ p_board: 'n2f:europe:5', p_period: 'all' }]);
  // 自分の行は目立たせる
  assert.equal(await page.locator('#rk-list li.me').count(), 1);
});

// プロフィールの記録は名前の横にかざり（称号は出さない）、名前を押すとプロフィールの窓。古い記録（pid なし）は押せない
t('ranking_shows_deco_and_opens_card', async (page, { db }) => {
  db.profiles.push({ id: 1, token: 'tok-m', nickname: 'ミケ', pid: 'mikemikemike', deco: ['jp', 'fr', 'zz'], title: 'すごい称号' });
  db.rows.push({ ...record(B, 'ミケ', 7000), profile_id: 1 }, record(B, 'むかし', 8000));
  await page.click('#home-rank');
  await rows(page, 2);
  const [mike, old] = await page.locator('#rk-list li').all();
  assert.equal(await mike.locator('.nick button.pf-name').innerText(), 'ミケ');
  assert.equal(await mike.locator('.nick .rr-deco img').count(), 2); // 知らない国（zz）は出さない
  assert.doesNotMatch(await mike.innerText(), /すごい称号/);
  assert.equal(await old.locator('button').count(), 0);
  assert.equal(await page.locator('#rk-list li.me').count(), 0);
  await mike.locator('.pf-name').click();
  await page.locator('#pf-card[open]').waitFor();
  await page.locator('#pf-card', { hasText: 'ミケ' }).waitFor();
  assert.ok(db.calls.some(c => c.name === 'profile_card' && c.args.p_pid === 'mikemikemike'));
});

// 長い名前で50件並べても横にはみ出さない
const fill = db => {
  db.rows.push(record(B, 'WWWWWWWWWWWW', 1000));
  for (let i = 1; i < 50; i++) db.rows.push(record(B, `ながいなまえのひと${String(i).padStart(3, '0')}`, 61234 + i * 1000));
};

t('pc_layout', async (page, { db }) => {
  fill(db);
  assert.equal(await noHScroll(page), true);
  await page.click('#home-rank');
  await rows(page, 50);
  assert.equal(await noHScroll(page), true);
  assert.equal(await namesFit(page), true);
  // 広い画面では、条件は左・表は右に並べる
  const [a, b] = await Promise.all(['#rk-modes', '#rk-list'].map(s => page.locator(s).boundingBox()));
  assert.ok(b.x >= a.x + a.width, JSON.stringify({ a, b }));
}, { viewport: PC });

t('phone_layout', async (page, { db }) => {
  fill(db);
  await page.click('#home-rank');
  await rows(page, 50);
  assert.equal(await noHScroll(page), true);
  assert.equal(await namesFit(page), true);
});
