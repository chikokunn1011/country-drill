// サイト共通のプロフィール（profile.js）: 作る・名前の重なり・rpgRank からの引っ越し・スイッチ・結果画面の「載せる」箱・タブの同期・称号とバッジの同期・はみ出し
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, PHONE, PC } from './helpers.mjs';
import { measureFit, settleLayout } from './layout.mjs';
import { RPG_FILES } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで開き、最後にページで例外が出ていないかも見る。opts は openApp にそのまま渡す
const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const text = (page, sel) => page.locator(sel).innerText();
const stored = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
// 偽DB の中身が cond を満たすまで（最大4秒）待つ
async function until(cond, what) {
  for (let i = 0; i < 200; i++) { if (cond()) return; await new Promise(ok => setTimeout(ok, 20)); }
  assert.fail(`待ったけど来なかった: ${what}`);
}
// db にプロフィールを1つ入れて、その端末の localStorage profile も入れた状態で開くための storage
const PID = 'abcdefghjk12';
const withProfile = (db, name = 'チコ', token = 'tok-1') => {
  db.profiles.push({ token, nickname: name, pid: PID });
};
const PROFILE_SAVE = { token: 'tok-1', pid: PID, name: 'チコ', auto: true, isPublic: true, sent: { isPublic: true } };
// 開いたあとに偽DB と localStorage へプロフィール（PROFILE_SAVE の人）を入れて、ページを開き直す（query は URL の ?… ）
async function openWithProfile(page, db, query = '') {
  withProfile(db);
  await page.evaluate(p => localStorage.setItem('profile', JSON.stringify(p)), PROFILE_SAVE);
  await page.goto(server.url + query);
  await page.waitForFunction(() => window.PROFILE);
  await page.evaluate(() => PROFILE.ready);
}
const openProfile = async page => { await page.click('#home-profile'); await page.locator('#scr-profile').waitFor(); };

t('create from profile screen', async (page, { db }) => {
  await page.evaluate(() => localStorage.setItem('nickname', JSON.stringify('ミケ')));
  await page.reload();
  await openProfile(page);
  assert.equal(await page.inputValue('#pf-name'), 'ミケ');   // 前に使った名前を入れておく
  await page.fill('#pf-name', 'チコ');
  await page.click('#pf-create');
  await page.locator('#pf-me').waitFor();
  assert.equal(db.profiles.length, 1);
  assert.equal(db.profiles[0].nickname, 'チコ');
  assert.match(await text(page, '#pf-me'), /チコ/);
  const p = await stored(page, 'profile');
  assert.equal(p.pid, db.profiles[0].pid);
  assert.equal(p.token, db.profiles[0].token);
  assert.equal(await stored(page, 'nickname'), 'チコ');
  assert.equal(await stored(page, 'profilePending'), null);
  assert.deepEqual(await page.evaluate(() => PROFILE.get()), { token: p.token, pid: p.pid, name: 'チコ', auto: true, isPublic: true });
});

t('name taken', async (page, { db }) => {
  db.profiles.push({ token: 'other', nickname: 'チコ' });
  await openProfile(page);
  await page.fill('#pf-name', 'ﾁｺ'.normalize('NFKC'));
  await page.click('#pf-create');
  await page.locator('#pf-msg', { hasText: 'そのニックネームはもうほかの人が使っているみたい' }).waitFor();
  assert.equal(db.profiles.length, 1);
  assert.equal(await stored(page, 'profile'), null);
});

// 返事が届かなかった作成は同じ合言葉でやり直し、already が返ったら profile_me で取りなおす
t('create retries with pending token', async (page, { db }) => {
  db.profiles.push({ token: 'pend', nickname: 'ミケ' });
  await page.evaluate(() => localStorage.setItem('profilePending', JSON.stringify('pend')));
  const r = await page.evaluate(() => PROFILE.create('ミケ'));
  assert.deepEqual(r, { ok: true });
  assert.equal(db.profiles.length, 1);
  const p = await stored(page, 'profile');
  assert.equal(p.token, 'pend');
  assert.equal(p.pid, db.profiles[0].pid);
});

t('migrate rpgRank', async (page, { db }) => {
  db.profiles.push({ token: 'tok', nickname: 'ミケ', deco: ['jp'] });
  await page.evaluate(() => localStorage.setItem('rpgRank', JSON.stringify({ name: 'ミケ', token: 'tok' })));
  await page.reload();
  await page.waitForFunction(() => window.PROFILE);
  await page.evaluate(() => PROFILE.ready);
  const p = await stored(page, 'profile');
  assert.equal(p.token, 'tok');
  assert.equal(p.name, 'ミケ');
  assert.equal(p.pid, db.profiles[0].pid);
  assert.equal(await stored(page, 'rpgRank'), null);
});

t('migrate rpgRank not_found', async page => {
  await page.evaluate(() => localStorage.setItem('rpgRank', JSON.stringify({ name: 'ミケ', token: 'gone' })));
  await page.reload();
  await page.waitForFunction(() => window.PROFILE);
  await page.evaluate(() => PROFILE.ready);
  assert.equal(await stored(page, 'rpgRank'), null);
  assert.equal(await stored(page, 'profile'), null);
});

t('toggles', async (page, { db }) => {
  await openWithProfile(page, db);
  await openProfile(page);
  assert.equal(await page.isChecked('#pf-public'), true);
  assert.equal(await page.isChecked('#pf-auto'), true);
  await page.click('#pf-public');
  await until(() => db.profiles[0].is_public === false, 'is_public false');
  assert.equal((await stored(page, 'profile')).isPublic, false);
  await page.click('#pf-auto');
  assert.equal(await page.evaluate(() => PROFILE.auto()), false);
  assert.equal((await stored(page, 'profile')).auto, false);
});

t('rename', async (page, { db }) => {
  await openWithProfile(page, db);
  await openProfile(page);
  await page.fill('#pf-rename-in', 'ハチ');
  await page.click('#pf-rename');
  await page.locator('#pf-me', { hasText: 'ハチ' }).waitFor();
  assert.equal(db.profiles[0].nickname, 'ハチ');
  assert.equal((await stored(page, 'profile')).name, 'ハチ');
  assert.equal(await stored(page, 'nickname'), 'ハチ');
});

// 結果画面の「載せる」箱を body の下に作って描く。send は profile_me を呼んで、通れば text を返す
const drawBox = page => page.evaluate(() => {
  const el = document.createElement('div'); el.id = 'box'; document.body.append(el);
  window.__sent = [];
  PROFILE.postBox(el, { label: 'ランキングに載せる？', send: async token => {
    window.__sent.push(token);
    const r = await RANKING.profileMe({ token });
    return r.ok ? { ok: true, text: `${r.nickname} で載せたよ！` } : r;
  } });
});

t('postBox retry', async (page, { db }) => {
  await openWithProfile(page, db);
  db.down = true;
  await drawBox(page);
  await page.locator('#box button', { hasText: 'もう一回送る' }).waitFor();
  assert.match(await text(page, '#box'), /ランキングに接続できなかった/);
  db.down = false;
  await page.click('#box button:has-text("もう一回送る")');
  await page.locator('#box', { hasText: 'チコ で載せたよ！' }).waitFor();
  assert.equal(await page.locator('#box button:has-text("もう一回送る")').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__sent), ['tok-1', 'tok-1']);
});

t('postBox auto off and no profile', async (page, { db }) => {
  // 自動 OFF: すぐには送らず［載せる］
  await openWithProfile(page, db);
  await page.evaluate(() => PROFILE.setAuto(false));
  await drawBox(page);
  await page.locator('#box button', { hasText: '載せる' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__sent), []);
  await page.click('#box button:has-text("載せる")');
  await page.locator('#box', { hasText: 'チコ で載せたよ！' }).waitFor();
  // プロフィールが無い: 名前を入れて［プロフィールを作って載せる］
  await page.evaluate(() => { localStorage.removeItem('profile'); localStorage.setItem('nickname', JSON.stringify('ハチ')); });
  await page.reload();
  await page.waitForFunction(() => window.PROFILE);
  await drawBox(page);
  assert.equal(await page.inputValue('#box input'), 'ハチ');
  await page.click('#box button:has-text("プロフィールを作って載せる")');
  await page.locator('#box', { hasText: 'ハチ で載せたよ！' }).waitFor();
  assert.equal(db.profiles.length, 2);
  assert.equal(await page.evaluate(() => window.__sent.length), 1);   // 作った後に1回だけ送る
});

t('postBox not_found', async (page, { db }) => {
  await openWithProfile(page, db);
  db.profiles.length = 0;   // 別の端末に引き継がれた
  await drawBox(page);
  await page.locator('#box button', { hasText: 'プロフィールを作って載せる' }).waitFor();
  assert.equal(await stored(page, 'profile'), null);
  await page.locator('.toast', { hasText: 'このプロフィールは別の端末に引き継がれたよ' }).waitFor();
  await page.evaluate(() => PROFILE.lost());
  assert.equal(await page.locator('.toast', { hasText: '引き継がれた' }).count(), 1);
});

t('storage sync', async (page, { db, context }) => {
  await openWithProfile(page, db);
  await openProfile(page);
  await page.evaluate(() => { window.__changes = []; document.addEventListener('profile:change', e => window.__changes.push(e.detail.profile?.name ?? null)); });
  const page2 = await context.newPage();
  await page2.goto(server.url);
  await page2.waitForFunction(() => window.PROFILE);
  assert.deepEqual(await page2.evaluate(() => PROFILE.rename('ハチ')), { ok: true });
  await page.locator('#pf-me', { hasText: 'ハチ' }).waitFor();
  assert.equal(await page.inputValue('#pf-rename-in'), 'ハチ');
  assert.equal(await page.evaluate(() => PROFILE.get().name), 'ハチ');
  assert.deepEqual(await page.evaluate(() => window.__changes), ['ハチ']);
});

t('sync title and badges', async (page, { db }) => {
  await openWithProfile(page, db, '?bdgdebug=1');
  // 起動時にバッジの数を送る
  await until(() => db.profiles[0].badges_total > 0, 'badges_total');
  const want = await page.evaluate(() => BADGES.count().total);
  assert.equal(db.profiles[0].badges_total, want);
  // 称号をつけると title が変わる
  await page.evaluate(() => {
    BADGES.debug.grant('rpg-final@1');
    const b = document.createElement('button');
    b.dataset.bdgEquip = 'rpg-final@1'; b.textContent = 'x';
    document.body.append(b);
  });
  await page.click('body > [data-bdg-equip="rpg-final@1"]');
  await until(() => db.profiles[0].title === '世界を取りもどした者', 'title');
  assert.equal((await stored(page, 'profile')).sent.title, '世界を取りもどした者');
});

// 称号・バッジの数などが断られても（bad_record）、公開の切りかえだけは送り直して届ける
t('public goes alone when the rest is refused', async (page, { db }) => {
  const orig = db.rpc.profile_set;
  db.rpc.profile_set = a => a.p_title != null || a.p_badges != null || a.p_deco != null ? { ok: false, reason: 'bad_record' } : orig(a);
  await openWithProfile(page, db, '?bdgdebug=1');
  await openProfile(page);
  await page.click('#pf-public');
  await until(() => db.profiles[0].is_public === false, 'is_public false');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('profile')).sent.isPublic === false);
  assert.equal((await stored(page, 'profile')).sent.title, undefined);   // 断られたほうは送ったことにしない
});

// かざりは同じ国を2回送らない（冒険のセーブの deco に重なりがあっても）
t('sync deco without duplicates', async (page, { db }) => {
  await openWithProfile(page, db);
  await page.evaluate(() => {
    window.RPG = { get: () => ({ deco: ['jp', 'jp', 'br', 'zz'], cards: { jp: 1, br: 1 } }) };
    document.dispatchEvent(new CustomEvent('rpg:deco'));
  });
  await until(() => JSON.stringify(db.profiles[0].deco) === '["jp","br"]', 'deco jp,br');
}, { blockScripts: RPG_FILES });

// 自動の ON/OFF も profile:change で知らせる（rpg-rank.js などが auto() を見て動きを変える）
t('setAuto emits profile:change', async (page, { db }) => {
  await openWithProfile(page, db);
  await page.evaluate(() => { window.__changes = []; document.addEventListener('profile:change', e => window.__changes.push(e.detail.profile?.auto)); });
  await page.evaluate(() => PROFILE.setAuto(false));
  await page.evaluate(() => PROFILE.setAuto(false));   // 変わらないときは知らせない
  await page.evaluate(() => PROFILE.setAuto(true));
  assert.deepEqual(await page.evaluate(() => window.__changes), [false, true]);
});

for (const [label, viewport] of [['phone', PHONE], ['pc', PC], ['narrow', { width: 320, height: 640 }]]) {
  t(`layout ${label}`, async (page, { db }) => {
    for (const has of [false, true]) {
      if (has) await openWithProfile(page, db);
      await openProfile(page);
      await settleLayout(page);
      const m = await measureFit(page);
      assert.equal(m.hscroll, false, `${label} ${has}: 横スクロール`);
      // パネルの中身がパネルの外にはみ出さない
      const out = await page.evaluate(() => {
        const box = document.querySelector('#scr-profile .panel').getBoundingClientRect();
        return [...document.querySelectorAll('#scr-profile .panel *')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width && (r.left < box.left - 0.5 || r.right > box.right + 0.5);
        }).map(el => el.id || el.className || el.tagName);
      });
      assert.deepEqual(out, [], `${label} ${has}`);
      await page.click('#brand');
    }
  }, { viewport });
}

// ---- ランキングの名前セル（nameHTML）とプロフィールの窓（openCard） ----
t('nameHTML escapes', async page => {
  const h = await page.evaluate(() => PROFILE.nameHTML({ nickname: '<b>x</b>', pid: null, deco: [] }));
  assert.match(h, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(h, /<button|<b>/);
  // pid があれば押せるボタン。かざりは知っている国だけ3つまで、重なりは1つに
  const b = await page.evaluate(() => PROFILE.nameHTML({ nickname: 'チコ"', pid: 'p"1', deco: ['jp', 'zz', 'jp', 'br', 'fr', 'de'] }));
  assert.match(b, /^<button type="button" class="pf-name" data-pid="p&quot;1">チコ&quot;<\/button>/);
  assert.equal((b.match(/<img /g) ?? []).length, 3);
  assert.match(b, /<span class="rr-deco">/);
  assert.doesNotMatch(b, /zz/);
});

// db に公開のプロフィール（id 1）と、TA 2件・今日の難問2回・冒険の記録を入れる
const seedCard = (db, extra = {}) => {
  db.profiles.push({ id: 1, pid: 'cardpid00001', token: 'card', nickname: 'ミケ', title: '旅のはじまり', deco: ['jp', 'br'], badges: 12, badges_total: 80,
    created_at: '2026-10-01T00:00:00Z', ...extra });
  const at = new Date().toISOString();
  db.rows.push({ board: 'f2n:asia:10', profile_id: 1, nickname: 'ミケ', time_ms: 12340, questions: 10, created_at: at },
    { board: 'n2f:all:all', profile_id: 1, nickname: 'ミケ', time_ms: 95670, questions: 195, created_at: at });
  db.dailyRows.push({ day: '2026-10-26', profile_id: 1, nickname: 'ミケ', correct: 5, total: 5, time_ms: 30000, created_at: at },
    { day: '2026-10-27', profile_id: 1, nickname: 'ミケ', correct: 3, total: 5, time_ms: 40000, created_at: at });
  db.rpgRows.push({ token: 'card', profile_id: 1, nickname: 'ミケ', lv: 17, dungeons: 4, floors: 22, created_at: at, at });
};

t('card public', async (page, { db }) => {
  seedCard(db);
  await page.evaluate(() => PROFILE.openCard('cardpid00001'));
  const dlg = page.locator('#pf-card');
  await dlg.locator('.pf-card', { hasText: 'ミケ' }).waitFor();
  assert.equal(await dlg.evaluate(d => d.open), true);
  const s = await dlg.innerText();
  assert.match(s, /〈旅のはじまり〉/);
  assert.match(s, /バッジ 12個（全80個中）/);
  assert.match(s, /冒険 Lv17・ダンジョン4\/\d+/);
  assert.match(s, /国旗→国名・アジア・10問\s*12\.34秒（1位）/);
  assert.match(s, /国名→国旗・全世界・全部\s*1分35\.67秒（1位）/);
  assert.match(s, /今日の難問 参加2回（うち全問正解1回）/);
  assert.match(s, /はじめた日 2026\/10\/1/);
  assert.equal(await dlg.locator('.rr-deco img').count(), 2);
  // Esc で閉じる
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#pf-card').open);
});

t('card private', async (page, { db }) => {
  seedCard(db, { is_public: false });
  await page.evaluate(() => PROFILE.openCard('cardpid00001'));
  const dlg = page.locator('#pf-card');
  await dlg.locator('.pf-card', { hasText: 'このプロフィールは非公開だよ' }).waitFor();
  const s = await dlg.innerText();
  assert.match(s, /ミケ/);
  assert.doesNotMatch(s, /バッジ|Lv|旅のはじまり|今日の難問|国旗→国名/);
  assert.equal(await dlg.locator('.rr-deco img').count(), 2);
  await dlg.locator('button', { hasText: '閉じる' }).click();
  await page.waitForFunction(() => !document.querySelector('#pf-card').open);
});

// ランキングの名前（.pf-name）を押すと開く。つながらなければ「読みこめなかった」と［再読み込み］
t('card from name button and reload', async (page, { db }) => {
  seedCard(db);
  db.down = true;
  await page.evaluate(() => {
    const d = document.createElement('div'); d.id = 'nm';
    d.innerHTML = PROFILE.nameHTML({ nickname: 'ミケ', pid: 'cardpid00001', deco: [] });
    document.querySelector('#scr-home').append(d);
  });
  await page.click('#nm .pf-name');
  const dlg = page.locator('#pf-card');
  await dlg.locator('text=読みこめなかった').waitFor();
  db.down = false;
  await dlg.locator('button', { hasText: '再読み込み' }).click();
  await dlg.locator('.pf-card', { hasText: 'バッジ 12個' }).waitFor();
});

t('card not found', async page => {
  await page.evaluate(() => PROFILE.openCard('nobody'));
  await page.locator('#pf-card', { hasText: '読みこめなかった' }).waitFor();
});

// 自分のプロフィール画面のカードも同じ見た目（サーバーの TA などの記録も出す）
t('own card uses cardHTML', async (page, { db }) => {
  seedCard(db);
  await page.evaluate(() => localStorage.setItem('profile', JSON.stringify({ token: 'card', pid: 'cardpid00001', name: 'ミケ', auto: true, isPublic: true, sent: { isPublic: true } })));
  await page.reload();
  await page.waitForFunction(() => window.PROFILE);
  await openProfile(page);
  await page.locator('#pf-me', { hasText: '国旗→国名・アジア・10問' }).waitFor();
  assert.match(await text(page, '#pf-me'), /ミケ/);
});

for (const [label, viewport] of [['phone', PHONE], ['narrow', { width: 320, height: 640 }]]) {
  t(`card layout ${label}`, async (page, { db }) => {
    seedCard(db, { nickname: 'ながいながいなまえの人だよ', title: 'とても長い称号がここに入るととても長くなるのでおりかえすよね' });
    db.rows.push({ board: 'f2m:namerica:20', profile_id: 1, nickname: 'x', time_ms: 3599990, questions: 20, created_at: new Date().toISOString() });
    await page.evaluate(() => PROFILE.openCard('cardpid00001'));
    await page.locator('#pf-card .pf-card', { hasText: 'バッジ' }).waitFor();
    await settleLayout(page);
    const r = await page.evaluate(() => {
      const d = document.querySelector('#pf-card'), b = d.getBoundingClientRect();
      const out = [...d.querySelectorAll('*')].filter(el => { const x = el.getBoundingClientRect(); return x.width && (x.left < b.left - 0.5 || x.right > b.right + 0.5); })
        .map(el => el.className || el.tagName);
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: innerWidth, h: innerHeight, out };
    });
    assert.ok(r.left >= 0 && r.right <= r.w && r.top >= 0 && r.bottom <= r.h, JSON.stringify(r));
    assert.deepEqual(r.out, []);
  }, { viewport });
}
