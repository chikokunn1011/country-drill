// サイト共通のプロフィール（profile.js）: 作る・名前の重なり・rpgRank からの引っ越し・スイッチ・結果画面の「載せる」箱・タブの同期・称号とバッジの同期・はみ出し
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, clearTimeAttack, PHONE, PC } from './helpers.mjs';
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

// 前の版で冒険の登録の返事が届かなかった人（rpgRankPending だけある）: その合言葉のプロフィールが通れば profile にする
t('migrate rpgRankPending', async (page, { db }) => {
  db.profiles.push({ token: 'pend', nickname: 'ミケ' });
  await page.evaluate(() => localStorage.setItem('rpgRankPending', JSON.stringify('pend')));
  await page.reload();
  await page.waitForFunction(() => window.PROFILE);
  await page.evaluate(() => PROFILE.ready);
  const p = await stored(page, 'profile');
  assert.equal(p.token, 'pend');
  assert.equal(p.name, 'ミケ');
  assert.equal(p.pid, db.profiles[0].pid);
  assert.equal(await stored(page, 'rpgRankPending'), null);
});

// 通らなければ rpgRankPending は残す（冒険のデータを消すときに rpg-rank.js が使う）
t('migrate rpgRankPending not_found', async page => {
  await page.evaluate(() => localStorage.setItem('rpgRankPending', JSON.stringify('gone')));
  await page.reload();
  await page.waitForFunction(() => window.PROFILE);
  await page.evaluate(() => PROFILE.ready);
  assert.equal(await stored(page, 'profile'), null);
  assert.equal(await stored(page, 'rpgRankPending'), 'gone');
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

// 名前の入力欄の下の注意書き（プライバシーポリシーへのリンクは新しいタブで開く）
async function nameNoteShown(page, scope) {
  const a = page.locator(`${scope} .pf-name-note a`);
  assert.equal(await a.count(), 1, scope);
  assert.equal(await a.isVisible(), true, scope);
  assert.equal(await a.getAttribute('href'), 'privacy.html');
  assert.equal(await a.getAttribute('target'), '_blank');
  assert.match(await a.getAttribute('rel'), /\bnoopener\b/);
  assert.match(await page.locator(`${scope} .pf-name-note`).innerText(), /本名や学校名は使わないでね/);
}
t('name note on profile screen', async (page, { db }) => {
  await openProfile(page);
  await nameNoteShown(page, '#pf-main');   // 作る欄
  await openWithProfile(page, db);
  await openProfile(page);
  await nameNoteShown(page, '#pf-main');   // 名前を変える欄
});
t('name note on TA result without profile', async page => {
  await clearTimeAttack(page);
  await page.locator('#ta-post form').waitFor();
  await nameNoteShown(page, '#ta-post');
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

// 箱を描いたあとに、ほかの場所でプロフィールを作った・自動を ON にしたときは、描き直すだけで勝手に送らない（載せなかった前の記録が載らないように）
t('postBox does not send on later change', async (page, { db }) => {
  await drawBox(page);
  await page.locator('#box button', { hasText: 'プロフィールを作って載せる' }).waitFor();
  assert.deepEqual(await page.evaluate(() => PROFILE.create('チコ')), { ok: true });
  await page.locator('#box button', { hasText: 'チコ で載せる' }).waitFor();
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => window.__sent), []);
  // 自動 OFF で描いた箱は、自動を ON にしても送らない
  await page.evaluate(() => { PROFILE.setAuto(false); document.querySelector('#box').remove(); });
  await drawBox(page);
  await page.locator('#box button', { hasText: 'チコ で載せる' }).waitFor();
  await page.evaluate(() => PROFILE.setAuto(true));
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => window.__sent), []);
  assert.equal(await page.locator('#box button', { hasText: 'チコ で載せる' }).count(), 1);
  // 押せば送る
  await page.click('#box button:has-text("チコ で載せる")');
  await page.locator('#box', { hasText: 'チコ で載せたよ！' }).waitFor();
  assert.equal(await page.evaluate(() => window.__sent.length), 1);
});

// キーボードで押したとき: 箱を描き直してもフォーカスは消さない（busy・done は状態の文、fail は［もう一回送る］、next があれば done でそこへ）。
// 状態の <p role=status> は同じ要素のまま文だけ変わる（差し込み直すと読み上げられないことがあるので）
const focusInfo = page => page.evaluate(() => {
  const a = document.activeElement;
  return { id: a?.id ?? '', tag: a?.tagName ?? '', text: a?.textContent ?? '', sameStatus: document.querySelector('#box [role=status]') === window.__status };
});
const markStatus = page => page.evaluate(() => { window.__status = document.querySelector('#box [role=status]'); });
t('postBox keeps focus and status', async (page, { db }) => {
  await openWithProfile(page, db);
  await page.evaluate(() => PROFILE.setAuto(false));
  db.down = true;
  await drawBox(page);
  await markStatus(page);
  assert.ok(await page.evaluate(() => window.__status));   // 押す前から状態の文の場所はある（中は空）
  await page.focus('#box button:has-text("チコ で載せる")');
  await page.keyboard.press('Enter');
  await page.locator('#box button', { hasText: 'もう一回送る' }).waitFor();
  let f = await focusInfo(page);
  assert.equal(f.text, 'もう一回送る');
  assert.ok(f.sameStatus);
  db.down = false;
  await page.keyboard.press('Enter');
  await page.locator('#box', { hasText: 'チコ で載せたよ！' }).waitFor();
  f = await focusInfo(page);
  assert.equal(f.tag, 'P');
  assert.equal(f.text, 'チコ で載せたよ！');
  assert.ok(f.sameStatus);
});
t('postBox focuses next after done', async (page, { db }) => {
  await openWithProfile(page, db);
  await page.evaluate(() => PROFILE.setAuto(false));
  // TA の結果画面と同じ形: 載せたら隠れていた［ランキングを見る］を出して、そこへ移る
  await page.evaluate(() => {
    const el = document.createElement('div'); el.id = 'box'; document.body.append(el);
    const open = document.createElement('button'); open.id = 'nx'; open.hidden = true; open.textContent = 'ランキングを見る'; document.body.append(open);
    PROFILE.postBox(el, { send: async () => { open.hidden = false; return { ok: true }; }, next: () => open });
  });
  await page.focus('#box button:has-text("チコ で載せる")');
  await page.keyboard.press('Enter');
  await page.locator('#box', { hasText: '載せたよ！' }).waitFor();
  assert.equal((await focusInfo(page)).id, 'nx');
});
t('postBox create by keyboard keeps focus', async (page, { db }) => {
  await page.evaluate(() => localStorage.setItem('nickname', JSON.stringify('ハチ')));
  await page.reload();
  await page.waitForFunction(() => window.PROFILE);
  await drawBox(page);
  await markStatus(page);
  await page.focus('#box input');
  await page.keyboard.press('Enter');
  await page.locator('#box', { hasText: 'ハチ で載せたよ！' }).waitFor();
  const f = await focusInfo(page);
  assert.equal(f.tag, 'P');
  assert.ok(f.sameStatus);
  assert.equal(db.profiles.length, 1);
});
// 自動 ON で描いたときは、箱の外にあるフォーカスを動かさない
t('postBox auto does not steal focus', async (page, { db }) => {
  await openWithProfile(page, db);
  await page.evaluate(() => { const b = document.createElement('button'); b.id = 'outside'; b.textContent = 'x'; document.body.append(b); b.focus(); });
  await drawBox(page);
  await page.locator('#box', { hasText: 'チコ で載せたよ！' }).waitFor();
  assert.equal((await focusInfo(page)).id, 'outside');
});
// 押したボタンが消えて、状態の文も空のとき（not_found で名前の入力に変わった・名前が変わって［〜で載せる］を作り直した）は、
// 空の文ではなく新しくできた入力やボタンへ移す（<body> に落とさない）
t('postBox not_found by keyboard focuses input', async (page, { db }) => {
  await openWithProfile(page, db);
  await page.evaluate(() => PROFILE.setAuto(false));
  await drawBox(page);
  db.profiles.length = 0;   // 別の端末に引き継がれた
  await page.focus('#box button:has-text("チコ で載せる")');
  await page.keyboard.press('Enter');
  await page.locator('#box button', { hasText: 'プロフィールを作って載せる' }).waitFor();
  const f = await page.evaluate(() => ({ tag: document.activeElement.tagName, inBox: !!document.activeElement.closest('#box') }));
  assert.deepEqual(f, { tag: 'INPUT', inBox: true });
});
t('postBox rename keeps focus on send button', async (page, { db }) => {
  await openWithProfile(page, db);
  await page.evaluate(() => PROFILE.setAuto(false));
  await drawBox(page);
  await page.focus('#box button:has-text("チコ で載せる")');
  assert.deepEqual(await page.evaluate(() => PROFILE.rename('ハナ')), { ok: true });
  await page.locator('#box button', { hasText: 'ハナ で載せる' }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'ハナ で載せる');
});
// 状態の文は空のときも読み上げの木に残す（display: none だと、最初の「送信中…」で中身ごと現れて読まれないことがある）。
// 見た目は空のとき場所を取らない
t('postBox empty status stays in accessibility tree', async (page, { db }) => {
  await openWithProfile(page, db);
  await page.evaluate(() => PROFILE.setAuto(false));
  await drawBox(page);
  const s = await page.evaluate(() => {
    const m = document.querySelector('#box [role=status]'), r = m.getBoundingClientRect();
    return { text: m.textContent, display: getComputedStyle(m).display, w: r.width, h: r.height };
  });
  assert.equal(s.text, '');
  assert.notEqual(s.display, 'none');
  assert.ok(s.w <= 1 && s.h <= 1, `空の文が場所を取っている: ${s.w}x${s.h}`);
});
// 自動 ON で描いたときも、状態の文はまず空でページに入り、そのあとで「送信中…」になる（中身ごと差し込むと読まれないことがある）
t('postBox auto inserts empty status first', async (page, { db }) => {
  await openWithProfile(page, db);
  await page.evaluate(() => {
    window.__first = null;
    new MutationObserver(ms => {
      for (const m of ms) for (const n of m.addedNodes) {
        const s = n.nodeType === 1 && n.querySelector?.('[role=status]');
        if (s && window.__first === null) window.__first = s.textContent;
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await drawBox(page);
  await page.locator('#box', { hasText: 'チコ で載せたよ！' }).waitFor();
  assert.equal(await page.evaluate(() => window.__first), '');
});
// キーボードで押して状態の文にフォーカスが移ったときは、どこにいるか見えるように枠を出す（next が無い箱: 毎日・冒険）
t('postBox status shows focus ring after keyboard', async (page, { db }) => {
  await openWithProfile(page, db);
  await page.evaluate(() => PROFILE.setAuto(false));
  await drawBox(page);
  await page.focus('#box button:has-text("チコ で載せる")');
  await page.keyboard.press('Enter');
  await page.locator('#box', { hasText: 'チコ で載せたよ！' }).waitFor();
  const o = await page.evaluate(() => { const a = document.activeElement; return { tag: a.tagName, style: getComputedStyle(a).outlineStyle }; });
  assert.equal(o.tag, 'P');
  assert.notEqual(o.style, 'none');
});

// lost(token) は、いまのプロフィールがその合言葉のときだけ消す（遅れて届いた古い合言葉の not_found で、新しいプロフィールを消さない）。
// 引数なしは今までどおり消す
t('lost checks token', async (page, { db }) => {
  await openWithProfile(page, db);
  await page.evaluate(() => PROFILE.lost('tok-old'));
  assert.equal((await stored(page, 'profile')).token, 'tok-1');
  assert.equal(await page.locator('.toast', { hasText: '引き継がれた' }).count(), 0);
  // 古い合言葉で送っているあいだに、プロフィールが新しい合言葉に変わった（引き継いだ）→ 返ってきた not_found では消さない
  await page.evaluate(() => {
    const el = document.createElement('div'); el.id = 'box'; document.body.append(el);
    window.__go = null;
    PROFILE.postBox(el, { send: () => new Promise(ok => { window.__go = ok; }) });
  });
  await page.waitForFunction(() => window.__go);
  await page.evaluate(() => {
    localStorage.setItem('profile', JSON.stringify({ ...JSON.parse(localStorage.getItem('profile')), token: 'tok-2' }));
    window.__go({ ok: false, reason: 'not_found' });
  });
  await page.waitForTimeout(200);
  assert.equal((await stored(page, 'profile')).token, 'tok-2');
  assert.equal(await page.locator('.toast', { hasText: '引き継がれた' }).count(), 0);
  await page.evaluate(() => PROFILE.lost('tok-2'));
  assert.equal(await stored(page, 'profile'), null);
  assert.equal(await page.locator('.toast', { hasText: '引き継がれた' }).count(), 1);
  // 引数なし
  await page.evaluate(p => localStorage.setItem('profile', JSON.stringify(p)), PROFILE_SAVE);
  await page.evaluate(() => PROFILE.lost());
  assert.equal(await stored(page, 'profile'), null);
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
  // sent は返事が届いてから書くので、偽DB が変わった直後にはまだ前の値のことがある。書かれるまで待つ
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('profile')).sent.title === '世界を取りもどした者');
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
  assert.match(b, /^<button type="button" class="pf-name" data-pid="p&quot;1" data-ugc>チコ&quot;<\/button>/);
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
  assert.doesNotMatch(s, /英雄の塔/);   // 塔に登っていなければ出さない
  assert.match(s, /国旗→国名・アジア・10問\s*12\.34秒（1位）/);
  assert.match(s, /国名→国旗・全世界・全部\s*1分35\.67秒（1位）/);
  assert.match(s, /今日の難問 参加2回（うち全問正解1回）/);
  assert.match(s, /はじめた日 2026\/10\/1/);
  assert.equal(await dlg.locator('.rr-deco img').count(), 2);
  // Esc で閉じる
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#pf-card').open);
});

t('card tower', async (page, { db }) => {
  // 英雄の塔の最高記録があれば、冒険の行の下に「英雄の塔 ◯階」
  seedCard(db);
  db.rpgRows[0].tower = 23;
  await page.evaluate(() => PROFILE.openCard('cardpid00001'));
  const dlg = page.locator('#pf-card');
  await dlg.locator('.pf-card', { hasText: 'ミケ' }).waitFor();
  const lines = await dlg.locator('.pf-card-line').allInnerTexts();
  const i = lines.findIndex(x => x.startsWith('冒険 Lv17'));
  assert.ok(i >= 0 && lines[i + 1] === '英雄の塔 23階', lines.join('|'));
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

// ---- 引き継ぎ（コードを出す・入れる） ----
// confirm は受けて、文を dialogs に積む（Playwright は何もしないと閉じてしまう）
const acceptDialogs = page => { const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); return dialogs; };
// 2つ目の端末（新しいブラウザコンテキスト）。偽DB は a の db を使う（rpc を a のものにする）
async function secondDevice(a, opts = {}) {
  const b = await openApp(browser, { blockScripts: RPG_FILES, ...opts });
  Object.assign(b.db.rpc, a.db.rpc);
  await b.page.waitForFunction(() => window.PROFILE);
  return b;
}
// 出た知らせ（.toast）の文を全部 window.__toasts に覚える（知らせは数秒で消えるので、あとから数えられるように）
const watchToasts = page => page.evaluate(() => {
  window.__toasts = [];
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('toast')) window.__toasts.push(n.textContent); })
    .observe(document.body, { childList: true, subtree: true });
});
// db.transfers にコードを1つ入れる（profile_id 1 のプロフィールの分）
const seedTransfer = (db, data, code = 'ABCDEFGHJKLM') => db.transfers.push({ code, profile_id: 1, data, expires_at: new Date(Date.now() + 864e5).toISOString(), used_at: null });
// プロフィール画面でコードを入れて、読み直しが終わるまで待つ
async function claim(page, code) {
  await openProfile(page);
  await page.fill('#pf-tr-in', code);
  await Promise.all([page.waitForEvent('load'), page.click('#pf-tr-claim')]);
  await page.waitForFunction(() => window.PROFILE);
  await page.evaluate(() => PROFILE.ready);
}

t('transfer moves data', async (page, app) => {
  const { db } = app;
  const dialogs = acceptDialogs(page);
  await openWithProfile(page, db);
  await page.evaluate(() => { localStorage.setItem('rpg', '{"v":1,"coins":123}'); localStorage.setItem('evil', '"x"'); });
  await watchToasts(page);
  await openProfile(page);
  await page.click('#pf-tr-start');
  await page.locator('#pf-tr-code').waitFor();
  assert.match(dialogs[0], /この端末のデータ（冒険・バッジ・設定など）を預けて、コードを出すよ/);
  assert.equal(db.transfers.length, 1);
  const code = db.transfers[0].code;
  assert.equal(await text(page, '#pf-tr-code'), code.match(/.{4}/g).join('-'));
  assert.match(await text(page, '#pf-tr-exp'), /^\d{1,2}\/\d{1,2} \d{2}:\d{2} まで/);
  // 預けたのは一覧のキーだけ・生の文字列のまま
  assert.equal(db.transfers[0].data.v, 1);
  assert.equal(db.transfers[0].data.keys.rpg, '{"v":1,"coins":123}');
  assert.equal(db.transfers[0].data.keys.evil, undefined);
  assert.equal(db.transfers[0].data.keys.profile, undefined);
  assert.deepEqual(db.transfers[0].data.profile, { auto: true, isPublic: true });   // 自動・公開の設定も持っていく
  // 新しい端末: 小文字・空白まじりでも入れられる
  const b = await secondDevice(app);
  try {
    const bd = acceptDialogs(b.page);
    await b.page.evaluate(() => localStorage.setItem('rpg', '"old"'));
    await claim(b.page, ' ' + code.slice(0, 6).toLowerCase() + ' ' + code.slice(6));
    assert.match(bd[0], /この端末の今のデータ.*上書きされる/);
    const p = await stored(b.page, 'profile');
    assert.equal(p.name, 'チコ');
    assert.equal(p.pid, PID);
    assert.notEqual(p.token, 'tok-1');
    assert.equal(db.profiles[0].token, p.token);
    assert.equal(await b.page.evaluate(() => localStorage.getItem('rpg')), '{"v":1,"coins":123}');
    assert.equal(await stored(b.page, 'nickname'), 'チコ');
    assert.equal((await stored(b.page, 'transferBackup')).keys.rpg, '"old"');   // 前の値は退避（badges.js が起動時に書く badges も入る）
    await b.page.locator('.toast', { hasText: 'チコ のプロフィールを引き継いだよ' }).waitFor();
    assert.deepEqual(b.errors.map(String), []);
  } finally { await b.close(); }
  // 前の端末: 次にサーバーとやりとりしたとき not_found → 知らせて、作るフォームになる（ゲームのデータはそのまま）
  // （B を見ているあいだに A の同期が not_found をもらって、知らせがもう消えていることもある）
  // 知らせのトーストが #brand の上に重なっていることがある（重い時に長く残る）ので、クリックは要素に直接送る
  await page.locator('#brand').dispatchEvent('click');
  await openProfile(page);
  await page.locator('#pf-form').waitFor({ timeout: 15_000 });
  assert.deepEqual(await page.evaluate(() => window.__toasts.filter(x => x.includes('引き継がれた'))), ['このプロフィールは別の端末に引き継がれたよ']);
  assert.equal(await stored(page, 'profile'), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('rpg')), '{"v":1,"coins":123}');
}, { blockScripts: RPG_FILES });

// 引き継ぎで受け取ったデータに一覧外のキーや文字列でない値があっても、一覧のキーの文字列だけ書き戻す
t('claim ignores unknown keys', async (page, { db }) => {
  db.profiles.push({ id: 1, token: 'old', nickname: 'ミケ' });
  db.transfers.push({ code: 'ABCDEFGHJKLM', profile_id: 1, data: { v: 1, keys: { evil: '"x"', rpg: 123, bview: '"list"', profile: '{"token":"t","pid":"p","name":"n"}' } },
    expires_at: new Date(Date.now() + 864e5).toISOString(), used_at: null });
  acceptDialogs(page);
  await page.evaluate(() => localStorage.setItem('rpg', '"before"'));
  await claim(page, 'ABCD-EFGH-JKLM');
  assert.equal(await page.evaluate(() => localStorage.getItem('evil')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('rpg')), '"before"');
  assert.equal(await page.evaluate(() => localStorage.getItem('bview')), '"list"');
  const p = await stored(page, 'profile');
  assert.equal(p.name, 'ミケ');
  assert.equal(p.token, db.profiles[0].token);
  // 形がちがうデータは何もしない
  assert.equal(await page.evaluate(() => PROFILE.unpack({ v: 2, keys: { bview: '"x"' } })), false);
  assert.equal(await page.evaluate(() => PROFILE.unpack({ v: 1, keys: ['x'] })), false);
  assert.equal(await page.evaluate(() => PROFILE.unpack(null)), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('bview')), '"list"');
}, { blockScripts: RPG_FILES });

t('bad code', async (page, { db }) => {
  const dialogs = acceptDialogs(page);
  await openProfile(page);
  // 形がちがうコードは送らない
  await page.fill('#pf-tr-in', 'abc');
  await page.click('#pf-tr-claim');
  await page.locator('#pf-tr-msg', { hasText: 'コードがちがうか、期限が切れているみたい' }).waitFor();
  assert.equal(dialogs.length, 0);
  // 形は合っていても、出していないコード
  await page.fill('#pf-tr-in', 'AAAA-BBBB-CCCC');
  await page.click('#pf-tr-claim');
  await page.waitForFunction(() => document.querySelector('#pf-tr-msg').textContent === 'コードがちがうか、期限が切れているみたい' && !document.querySelector('#pf-tr-claim').disabled);
  assert.equal(dialogs.length, 1);
  assert.ok(db.calls.some(c => c.name === 'profile_transfer_claim'));
  assert.equal(await stored(page, 'profile'), null);
});

// この端末にプロフィールがあれば、確認の文にその名前も出す。出し直すと前のコードは使えない
t('claim over own profile and reissue', async (page, { db }) => {
  const dialogs = acceptDialogs(page);
  await openWithProfile(page, db);
  await openProfile(page);
  await page.click('#pf-tr-start');
  await page.locator('#pf-tr-code').waitFor();
  const first = await text(page, '#pf-tr-code');
  await page.click('#pf-tr-start');
  await page.waitForFunction(f => document.querySelector('#pf-tr-code')?.textContent !== f, first);
  assert.equal(db.transfers.filter(x => x.data != null).length, 1);
  await page.fill('#pf-tr-in', first);
  await page.click('#pf-tr-claim');
  await page.locator('#pf-tr-msg', { hasText: 'コードがちがうか' }).waitFor();
  assert.match(dialogs.at(-1), /この端末のプロフィール「チコ」は使えなくなる/);
});

// 引き継ぎで、前の端末の「自動で載せる」「公開」の設定も持ってくる（サーバーがまだ公開のままでも、前の端末の非公開を送る）
t('claim keeps auto and public', async (page, { db }) => {
  db.profiles.push({ id: 1, token: 'old', nickname: 'ミケ' });
  seedTransfer(db, { v: 1, keys: {}, profile: { auto: false, isPublic: false } });
  acceptDialogs(page);
  await claim(page, 'ABCD-EFGH-JKLM');
  const p = await stored(page, 'profile');
  assert.equal(p.auto, false);
  assert.equal(p.isPublic, false);
  await until(() => db.profiles[0].is_public === false, 'is_public false');
}, { blockScripts: RPG_FILES });

// 前の端末に無かったキーは、新しい端末からも消す（退避はする）
t('claim removes keys missing from data', async (page, { db }) => {
  db.profiles.push({ id: 1, token: 'old', nickname: 'ミケ' });
  seedTransfer(db, { v: 1, keys: { rpg: '"new"' } });
  acceptDialogs(page);
  await page.evaluate(() => { localStorage.setItem('daily', '{"x":1}'); localStorage.setItem('misses', '{"jp":2}'); localStorage.setItem('evil', '"keep"'); });
  await claim(page, 'ABCD-EFGH-JKLM');
  assert.equal(await page.evaluate(() => localStorage.getItem('rpg')), '"new"');
  assert.equal(await page.evaluate(() => localStorage.getItem('daily')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('misses')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('evil')), '"keep"');   // 一覧に無いキーはさわらない
  const bk = await stored(page, 'transferBackup');
  assert.equal(bk.keys.daily, '{"x":1}');
  assert.equal(bk.keys.misses, '{"jp":2}');
}, { blockScripts: RPG_FILES });

// claim の返事が届かなかった（サーバーでは通った）: 同じコードをもう一回入れると、同じ合言葉で送り直して受け取れる
t('claim retries after lost reply', async (page, { db }) => {
  db.profiles.push({ id: 1, token: 'old', nickname: 'ミケ' });
  seedTransfer(db, { v: 1, keys: { bview: '"list"' } });
  // 本番のサーバーと同じく、同じコード・同じ合言葉の2回目は同じ答えを返す
  const orig = db.rpc.profile_transfer_claim, done = new Map();
  db.rpc.profile_transfer_claim = a => {
    const prev = done.get(a.p_code);
    if (prev && prev.token === a.p_new_token) return prev.r;
    const r = orig(a);
    if (r.ok) done.set(a.p_code, { token: a.p_new_token, r });
    return r;
  };
  // 1回目はサーバーで通したうえで、返事だけ落とす
  let drop = true;
  await page.route(u => u.hostname.endsWith('.supabase.co') && u.pathname.endsWith('/profile_transfer_claim'), async route => {
    if (!drop || route.request().method() !== 'POST') return route.fallback();
    drop = false;
    db.rpc.profile_transfer_claim(JSON.parse(route.request().postData()));
    return route.abort();
  });
  acceptDialogs(page);
  await openProfile(page);
  await page.fill('#pf-tr-in', 'ABCD-EFGH-JKLM');
  await page.click('#pf-tr-claim');
  await page.locator('#pf-tr-msg', { hasText: 'ランキングに接続できなかった' }).waitFor();
  const pend = await stored(page, 'transferPending');
  assert.equal(pend.code, 'ABCDEFGHJKLM');
  assert.equal(db.profiles[0].token, pend.token);   // サーバーはもう新しい合言葉
  await Promise.all([page.waitForEvent('load'), page.click('#pf-tr-claim')]);
  await page.waitForFunction(() => window.PROFILE);
  await page.evaluate(() => PROFILE.ready);
  const p = await stored(page, 'profile');
  assert.equal(p.token, pend.token);
  assert.equal(p.name, 'ミケ');
  assert.equal(await page.evaluate(() => localStorage.getItem('bview')), '"list"');
  assert.equal(await stored(page, 'transferPending'), null);
}, { blockScripts: RPG_FILES });

// かな入力のまま打った・全角: 全角英数字はそろえて使う。それでも英字と数字の表に無い字があれば、英字に切りかえる案内を出す（送らない）
t('code with kana', async (page, { db }) => {
  const dialogs = acceptDialogs(page);
  await openProfile(page);
  for (const bad of ['あbcd-EFGH-JKLM', 'ＡＢＣＯ－ＥＦＧＨ－ＪＫＬＭ']) {
    await page.fill('#pf-tr-in', bad);
    await page.click('#pf-tr-claim');
    await page.locator('#pf-tr-msg', { hasText: '英字と数字で入れてね（0・O・1・I は使わない）' }).waitFor();
    await page.evaluate(() => { document.querySelector('#pf-tr-msg').textContent = ''; });
  }
  assert.equal(dialogs.length, 0);
  assert.ok(!db.calls.some(c => c.name === 'profile_transfer_claim'));
  // 全角でも表の字だけなら送る
  await page.fill('#pf-tr-in', 'ＡＡＡＡ－ＢＢＢＢ－ＣＣＣＣ');
  await page.click('#pf-tr-claim');
  await page.locator('#pf-tr-msg', { hasText: 'コードがちがうか' }).waitFor();
  assert.equal(dialogs.length, 1);
});
