// 冒険ランキング（rpg-rank.js の #scr-rpgrank）: 冒険ホームの入口、きみの記録、プロフィールで載せる・自動更新（偽 Supabase）、レベル順・ダンジョン順・英雄の塔、
// 名前を押すとプロフィールの窓、かざり、冒険データを消したとき、つながらないとき
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from './helpers.mjs';
import { openRpg, writeSave, saveWith, startTower, winTowerFloor } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openRpg(browser, { seed: 1, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});
const text = (page, sel) => page.locator(sel).innerText();
const rows = page => page.$$eval('#rr-list li', ls => ls.map(l => l.innerText.replace(/\s+/g, ' ').trim()));
const ago = s => new Date(Date.now() - s * 1000).toISOString();

t('home_entry_and_my_record', async page => {
  await writeSave(page, saveWith({ lv: 12, floors: { samerica: 5, oceania: 3 } }));
  await page.evaluate(() => RPG.open('rpg'));
  await page.click('#rpg-to-rank');
  assert.equal(await page.isVisible('#scr-rpgrank'), true);
  const me = await text(page, '#rr-me');
  assert.ok(me.includes('Lv 12') && me.includes('ダンジョン 1/21（フロア 8/105）'), me);
  await page.waitForFunction(() => $('rr-rank').textContent.includes('相当'));
  assert.equal(await text(page, '#rr-rank'), 'レベル順 1位・ダンジョン順 1位 相当');
  assert.equal(await page.isVisible('#rr-empty'), true);
  await page.click('#scr-rpgrank .rpg-back');
  assert.equal(await page.isVisible('#scr-rpg'), true);
});

// ---- プロフィール ----
// db にプロフィールを入れて、この端末の localStorage profile も入れる（セーブを書く writeSave の読み込み直しで効く）。id は rpgRows の profile_id に使う
const T0 = '00000000-0000-4000-8000-0000000000a1', PID = 'chikopid0001';
const withProfile = async (page, app, { name = 'チコ', token = T0, pid = PID, id = 1, auto = true } = {}) => {
  app.db.profiles.push({ id, token, nickname: name, pid });
  await page.evaluate(p => localStorage.setItem('profile', JSON.stringify(p)), { token, pid, name, auto, isPublic: true, sent: { isPublic: true } });
};
const callsOf = (app, name) => app.db.calls.filter(c => c.name === name);
const until = async (fn, ms = 20000) => {
  for (const end = Date.now() + ms; !fn(); await new Promise(r => setTimeout(r, 100))) if (Date.now() > end) throw new Error('until: timeout');
};

t('sorts_me_and_card', async (page, app) => {
  // 名前・かざりはプロフィールのもの。pid のある名前は押すと窓、古い記録（profile_id なし）は押せない。自分の行は me
  app.db.profiles.push({ id: 2, token: 't-mike', nickname: 'ミケ', pid: 'mikepid00001', deco: ['jp'] });
  app.db.rpgRows.push(
    { token: 't-mike', profile_id: 2, nickname: 'ミケ', lv: 30, dungeons: 1, floors: 7, created_at: ago(60), at: ago(60) },
    { token: 't-taro', nickname: 'タロウ', lv: 8, dungeons: 3, floors: 16, created_at: ago(50), at: ago(50) },
    { token: T0, profile_id: 1, nickname: 'チコ', lv: 12, dungeons: 2, floors: 10, created_at: ago(40), at: ago(40) },
  );
  await withProfile(page, app);
  await page.evaluate(p => localStorage.setItem('rpgSent', JSON.stringify({ pid: p, lv: 12, dungeons: 2, floors: 10 })), PID);
  await writeSave(page, saveWith({ lv: 12, floors: { samerica: 5, oceania: 5 } }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 3);
  const r = await rows(page);
  assert.ok(r[0].startsWith('1 ミケ Lv 30') && r[1].startsWith('2 チコ Lv 12') && r[2].startsWith('3 タロウ Lv 8'), r.join('|'));
  assert.deepEqual(await page.$$eval('#rr-list li', ls => ls.map(l => l.classList.contains('me'))), [false, true, false]);
  assert.deepEqual(await page.$$eval('#rr-list li .nick', ls => ls.map(l => l.querySelector('.pf-name')?.dataset.pid ?? null)), ['mikepid00001', PID, null]);
  assert.deepEqual(await page.locator('#rr-list li').first().locator('.rr-deco img').evaluateAll(els => els.map(e => e.alt)), ['日本']);
  // 送ってある記録といまの記録が同じなので、送らない
  await page.waitForTimeout(2500);
  assert.deepEqual(callsOf(app, 'rpg_update2'), []);
  // 名前を押すとプロフィールの窓
  await page.click('#rr-list li .pf-name');
  await page.waitForFunction(() => document.querySelector('#pf-card[open] .pf-card-name')?.textContent.includes('ミケ'));
  await page.click('#pf-card [data-pfc="close"]');
  // ダンジョン順
  await page.click('#rr-tabs button[data-s="dg"]');
  await page.waitForFunction(() => document.querySelector('#rr-list li .nick')?.textContent === 'タロウ');
  const d = await rows(page);
  assert.ok(d[0].startsWith('1 タロウ 🏰3・F16 Lv 8') && d[1].startsWith('2 チコ 🏰2・F10 Lv 12') && d[2].startsWith('3 ミケ'), d.join('|'));
  assert.equal(await page.getAttribute('#rr-tabs button[data-s="dg"]', 'aria-pressed'), 'true');
  assert.equal(callsOf(app, 'top_rpg2').length + callsOf(app, 'top_rpg').length, 0);
});

t('no_profile_shows_postBox', async (page, app) => {
  // プロフィールが無ければ、名前を入れて［プロフィールを作って載せる］。作ったらこの記録も載る（rpgSent に覚える）
  app.db.profiles.push({ id: 2, token: 't-mike', nickname: 'ミケ', pid: 'mikepid00001' });
  app.db.rpgRows.push({ token: 't-mike', profile_id: 2, nickname: 'ミケ', lv: 30, dungeons: 1, floors: 7, created_at: ago(60), at: ago(60) });
  await page.evaluate(() => localStorage.setItem('nickname', JSON.stringify('ミケ')));
  await writeSave(page, saveWith({ lv: 12, floors: { samerica: 5, oceania: 5 } }));
  await page.evaluate(() => RPG.open('rpgrank'));
  assert.equal(await page.isVisible('#rr-auto'), false);
  assert.ok((await text(page, '#rr-post')).includes('冒険ランキングに載せる'));
  assert.equal(await page.inputValue('#rr-post input'), 'ミケ');   // 前に使った名前
  await page.click('#rr-post .btn');
  await page.waitForFunction(() => $('rr-post').textContent.includes('ほかの人'));
  await page.fill('#rr-post input', 'チコ');
  await page.click('#rr-post .btn');
  await page.waitForFunction(() => $('rr-post').textContent.includes('載せたよ'));
  assert.ok((await text(page, '#rr-post')).includes('載せたよ！ レベル順 2位・ダンジョン順 1位'), await text(page, '#rr-post'));
  assert.equal(await page.isVisible('#rr-auto'), false);   // 作って自動になっても、開き直すまでは箱の文のまま
  const p = app.db.profiles.find(x => x.nickname === 'チコ');
  assert.ok(p);
  assert.deepEqual(callsOf(app, 'rpg_update2').map(c => c.args), [{ p_token: p.token, p_lv: 12, p_dungeons: 2, p_floors: 10 }]);
  assert.deepEqual(app.db.rpgRows.map(r => [r.profile_id, r.lv]), [[2, 30], [p.id, 12]]);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('rpgSent'))), { pid: p.pid, lv: 12, dungeons: 2, floors: 10 });
  assert.equal(await page.evaluate(() => localStorage.getItem('rpgRank')), null);
  assert.deepEqual(callsOf(app, 'rpg_register'), []);
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 2);
  assert.equal(await page.locator('#rr-list li.me .nick').innerText(), 'チコ');
  // 開き直すと、自動で載るのお知らせ
  await page.evaluate(() => RPG.open('rpg'));
  await page.evaluate(() => RPG.open('rpgrank'));
  assert.equal(await page.isVisible('#rr-auto'), true);
  assert.equal(await text(page, '#rr-auto-name'), 'チコ');
  await page.click('#rr-profile');
  assert.equal(await page.isVisible('#scr-profile'), true);
});

t('manual_when_auto_off', async (page, app) => {
  // 自動 OFF: 勝手には送らず、［チコ で載せる］を押したときだけ
  await withProfile(page, app, { auto: false });
  await writeSave(page, saveWith({ lv: 7 }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForTimeout(2500);
  assert.deepEqual(callsOf(app, 'rpg_update2'), []);
  assert.equal(await page.isVisible('#rr-auto'), false);
  await page.click('#rr-post [data-pf="send"]');
  await page.waitForFunction(() => $('rr-post').textContent.includes('載せたよ'));
  assert.deepEqual(callsOf(app, 'rpg_update2').map(c => c.args), [{ p_token: T0, p_lv: 7, p_dungeons: 0, p_floors: 0 }]);
  assert.equal(app.db.rpgRows[0].profile_id, 1);
});

t('reopen_sends_once', async (page, app) => {
  // 何回開き直しても、載せる箱は1つだけ（前に開いたときの箱が残って同じ記録を何回も送らない）
  await withProfile(page, app, { auto: false });
  await writeSave(page, saveWith({ lv: 7 }));
  for (let i = 0; i < 4; i++) { await page.evaluate(() => RPG.open('rpg')); await page.evaluate(() => RPG.open('rpgrank')); }
  await page.click('#rr-post [data-pf="send"]');
  await page.waitForFunction(() => $('rr-post').textContent.includes('載せたよ'));
  await page.waitForTimeout(1000);
  assert.equal(callsOf(app, 'rpg_update2').length, 1);
  assert.ok((await text(page, '#rr-post')).includes('載せたよ！'), await text(page, '#rr-post'));
});

t('reopen_creates_once', async (page, app) => {
  // プロフィールが無いときの箱も同じ。作るのも載せるのも1回
  await writeSave(page, saveWith({ lv: 12, floors: { samerica: 5, oceania: 5 } }));
  for (let i = 0; i < 3; i++) { await page.evaluate(() => RPG.open('rpg')); await page.evaluate(() => RPG.open('rpgrank')); }
  await page.fill('#rr-post input', 'チコ');
  await page.click('#rr-post .btn');
  await page.waitForFunction(() => $('rr-post').textContent.includes('載せたよ'));
  await page.waitForTimeout(2500);   // 作ったあとの自動更新（1.5秒後）も、送ってある記録と同じなので送らない
  assert.equal(app.db.profiles.length, 1);
  assert.equal(callsOf(app, 'rpg_update2').length, 1);
});

t('not_started_and_offline', async page => {
  // まだ旅に出ていなければ載せる箱は出ない。つながらなければ再読み込みのボタン
  await writeSave(page, { v: 1 });
  await page.evaluate(() => RPG.open('rpgrank'));
  assert.equal(await page.locator('#rr-post').innerHTML(), '');
  assert.equal(await page.isVisible('#rr-auto'), false);
  assert.ok((await text(page, '#rr-me')).includes('まだ旅に出ていないよ'));
  await page.waitForFunction(() => !$('rr-error').hidden);
}, { supabase: 'down' });

t('link_from_timeattack_ranking', async page => {
  await page.click('#home-rank');
  assert.equal(await page.isVisible('#rk-to-rpg'), true);
  await page.click('#rk-to-rpg');
  assert.equal(await page.isVisible('#scr-rpgrank'), true);
});

t('auto_update_with_profile', async (page, app) => {
  // プロフィールあり＋自動 ON＋冒険を始めた: 起動時にまだ送っていない記録を送り、レベルアップしたら前に送ってから11秒あけて送り直す
  await withProfile(page, app);
  await writeSave(page, saveWith({ lv: 3, coins: 100000 }));
  const sent = () => callsOf(app, 'rpg_update2').map(c => c.args.p_lv);
  await until(() => sent().length === 1, 8000);
  assert.deepEqual(callsOf(app, 'rpg_update2')[0].args, { p_token: T0, p_lv: 3, p_dungeons: 0, p_floors: 0 });
  await page.evaluate(() => RPG.open('rpgrank'));
  assert.equal(await page.isVisible('#rr-auto'), true);
  assert.equal(await text(page, '#rr-auto-name'), 'チコ');
  await page.evaluate(() => RPG.open('rpg'));
  await page.click('#rpg-lvup');
  await page.waitForTimeout(3000);
  assert.deepEqual(sent(), [3]);   // まだ11秒たっていない
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rpgSent'))?.lv === 4, null, { timeout: 15000 });
  assert.deepEqual(sent(), [3, 4]);
  assert.deepEqual(app.db.rpgRows.map(r => [r.profile_id, r.lv]), [[1, 4]]);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('rpgSent'))), { pid: PID, lv: 4, dungeons: 0, floors: 0 });
  assert.deepEqual(callsOf(app, 'rpg_update').concat(callsOf(app, 'rpg_set_deco')), []);
});

t('sent_is_per_profile', async (page, app) => {
  // rpgSent の pid がいまのプロフィールとちがえば、送っていない扱い
  await withProfile(page, app);
  await page.evaluate(() => localStorage.setItem('rpgSent', JSON.stringify({ pid: 'otherpid0001', lv: 9, dungeons: 1, floors: 5 })));
  await writeSave(page, saveWith({ lv: 9, floors: { samerica: 5 } }));
  await until(() => callsOf(app, 'rpg_update2').length === 1, 8000);
  assert.deepEqual(callsOf(app, 'rpg_update2')[0].args, { p_token: T0, p_lv: 9, p_dungeons: 1, p_floors: 5 });
  await page.waitForFunction(p => JSON.parse(localStorage.getItem('rpgSent'))?.pid === p, PID);
  // 同じ記録なら送り直さない
  await page.reload();
  await page.waitForTimeout(2500);
  assert.equal(callsOf(app, 'rpg_update2').length, 1);
});

t('lost_when_not_found', async (page, app) => {
  // サーバーにもうプロフィールが無い（別の端末に引き継がれた）: プロフィールを消して知らせ、載せる箱は作るフォームに
  await page.evaluate(p => localStorage.setItem('profile', JSON.stringify({ token: 'gone', pid: p, name: 'チコ', auto: true, isPublic: true, sent: { isPublic: true } })), PID);
  await writeSave(page, saveWith({ lv: 5 }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForFunction(() => !PROFILE.get(), null, { timeout: 8000 });
  assert.ok((await page.evaluate(() => window.__toasts)).some(s => s.includes('別の端末に引き継がれた')));
  await page.waitForFunction(() => !!document.querySelector('#rr-post input'));
  assert.equal(await page.isVisible('#rr-auto'), false);
});

t('late_not_found_keeps_new_profile', async (page, app) => {
  // 古い合言葉で送っている途中にプロフィールが入れかわった（引き継ぎを受けた）: 遅れて届いた not_found で新しいプロフィールを消さない
  let started = false;
  await page.route('**/rest/v1/rpc/rpg_update2', async route => { started = true; await new Promise(ok => setTimeout(ok, 1500)); await route.fallback(); });
  app.db.profiles.push({ id: 1, token: T0, nickname: 'チコ', pid: PID });
  await page.evaluate(p => localStorage.setItem('profile', JSON.stringify({ token: 'gone', pid: 'gonepid00001', name: 'チコ', auto: true, isPublic: true, sent: { isPublic: true } })), PID);
  await writeSave(page, saveWith({ lv: 5 }));
  await until(() => started, 8000);
  await page.evaluate(p => localStorage.setItem('profile', JSON.stringify({ token: '00000000-0000-4000-8000-0000000000a1', pid: p, name: 'チコ', auto: false, isPublic: true, sent: { isPublic: true } })), PID);
  await until(() => callsOf(app, 'rpg_update2').length === 1, 8000);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('profile'))?.token), T0);
});

t('rename_shows_in_rpg_ranking', async (page, app) => {
  // 名前を変えると、冒険ランキングの名前も変わる（表の名前はプロフィールのもの）
  app.db.rpgRows.push({ token: T0, profile_id: 1, nickname: 'チコ', lv: 5, dungeons: 0, floors: 0, created_at: ago(60), at: ago(60) });
  await withProfile(page, app);
  await page.evaluate(p => localStorage.setItem('rpgSent', JSON.stringify({ pid: p, lv: 5, dungeons: 0, floors: 0 })), PID);
  await writeSave(page, saveWith({ lv: 5 }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForFunction(() => document.querySelector('#rr-list li .nick')?.textContent === 'チコ');
  assert.deepEqual(await page.evaluate(() => PROFILE.rename('チコチコ')), { ok: true });
  await page.waitForFunction(() => document.querySelector('#rr-list li .nick')?.textContent === 'チコチコ');
  assert.equal(await text(page, '#rr-auto-name'), 'チコチコ');
  // 冒険ホームの旅人カードもプロフィールの名前
  await page.evaluate(() => RPG.open('rpg'));
  assert.equal(await text(page, '#rpg-name'), 'チコチコ');
});

// ---- かざり（プロフィールの profile_set で送り、top_rpg3 がプロフィールのかざりを返す） ----
const pickDeco = async (page, as) => {
  await page.evaluate(() => show('rpg'));
  await page.click('#rpg-deco');
  for (const a of as) await page.click(`#rpg-deco-dlg .rpg-card[data-a="${a}"]`);
  await page.click('#rpg-deco-ok');
};

t('deco_from_profile', async (page, app) => {
  app.db.rpgRows.push({ token: T0, profile_id: 1, nickname: 'チコ', lv: 5, dungeons: 0, floors: 0, created_at: ago(60), at: ago(60) });
  await withProfile(page, app);
  await page.evaluate(p => localStorage.setItem('rpgSent', JSON.stringify({ pid: p, lv: 5, dungeons: 0, floors: 0 })), PID);
  await writeSave(page, saveWith({ lv: 5, cards: { jp: [1, 0], br: [2, 0] } }));
  await pickDeco(page, ['jp']);
  await until(() => callsOf(app, 'profile_set').some(c => c.args.p_deco?.length === 1), 15000);
  assert.deepEqual(app.db.profiles[0].deco, ['jp']);
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li .rr-deco img').length === 1);
  assert.equal(await page.locator('#rr-list li .rr-deco img').getAttribute('alt'), '日本');
  // 記録は同じなので rpg_update2 は送らない。前の版の rpg_set_deco も使わない
  assert.deepEqual(callsOf(app, 'rpg_update2').concat(callsOf(app, 'rpg_set_deco')), []);
});

t('rows_show_deco_flags', async (page, app) => {
  app.db.rpgRows.push(
    { token: 't-mike', nickname: 'ミケ', lv: 30, dungeons: 1, floors: 7, deco: ['jp', 'zz', 'br'], created_at: ago(60), at: ago(60) },
    { token: 't-taro', nickname: 'タロウ', lv: 8, dungeons: 3, floors: 16, created_at: ago(50), at: ago(50) },
  );
  await writeSave(page, saveWith({ lv: 3 }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 2);
  const li = page.locator('#rr-list li').first();
  assert.equal(await li.locator('.nick').innerText(), 'ミケ');
  assert.deepEqual(await li.locator('.rr-deco img').evaluateAll(els => els.map(e => e.alt)), ['日本', 'ブラジル']);   // 知らない 'zz' は出ない
  assert.equal(await page.locator('#rr-list li').nth(1).locator('.rr-deco img').count(), 0);
  assert.ok((await rows(page))[0].startsWith('1 ミケ Lv 30'), (await rows(page))[0]);
});

// スマホ 360×640: かざり3つ・12文字の名前でも名前の列が細くならない（国旗は .nick の中。列は増やさない）
t('deco_row_phone_width', async (page, app) => {
  app.db.profiles.push({ id: 3, token: 't-long', nickname: 'あいうえおかきくけこさし', pid: 'longpid00001', deco: ['jp', 'br', 'fr'] });
  app.db.rpgRows.push(
    { token: 't-long', profile_id: 3, nickname: 'あいうえおかきくけこさし', lv: 30, dungeons: 7, floors: 35, created_at: ago(60), at: ago(60) },
    { token: 't-taro', nickname: 'タロウ', lv: 8, dungeons: 3, floors: 16, created_at: ago(50), at: ago(50) },
  );
  await writeSave(page, saveWith({ lv: 3 }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 2);
  const m = await page.$$eval('#rr-list li', ls => ls.map(l => {
    const nick = l.querySelector('.nick'), lh = parseFloat(getComputedStyle(nick).lineHeight) || parseFloat(getComputedStyle(nick).fontSize) * 1.5;
    return { nick: nick.getBoundingClientRect().width, nickH: nick.getBoundingClientRect().height, lh, imgs: l.querySelectorAll('.nick .rr-deco img').length, deco: l.querySelectorAll('.rr-deco').length };
  }));
  assert.equal(m[0].imgs, 3); assert.equal(m[1].deco, 0);   // かざりが無ければ span も出さない
  for (const r of m) {
    assert.ok(r.nick >= 80, JSON.stringify(m));
    assert.ok(r.nickH <= r.lh * 3 + 2, JSON.stringify(m));   // 3行まで
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}, { viewport: { width: 360, height: 640 } });

t('without_profile_js', async (page, app) => {
  // profile.js が読めない（配信漏れ）: ランキングは見るだけ、載せる代わりに「ページを読み直してね」
  app.db.rpgRows.push({ token: 't-mike', nickname: 'ミケ', lv: 30, dungeons: 1, floors: 7, created_at: ago(60), at: ago(60) });
  await writeSave(page, saveWith({ lv: 3 }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 1);
  assert.ok((await text(page, '#rr-post')).includes('ページを読み直してね'));
  assert.equal(await page.locator('#rr-post input').count(), 0);
}, { blockScripts: ['badges.js', 'profile.js'] });

// 冒険データを消すと、冒険ランキングからも消える（プロフィールは残る）。つながらなければ rpgUnreg に覚えて次の起動で消し直す
const wipe = async page => {
  page.on('dialog', d => d.accept());
  await page.evaluate(() => RPG.open('rpg'));
  await page.click('#rpg-data summary');
  await page.click('#rpg-wipe');
};
t('wipe_unregisters', async (page, app) => {
  // 返事の届かなかった前の版の登録の合言葉（rpgRankPending）も、サーバーではプロフィールになっているかもしれないので一緒に消す
  const P = '00000000-0000-4000-8000-00000000000c';
  app.db.profiles.push({ id: 4, token: P, nickname: 'チコ別', pid: 'pendpid00001' }, { id: 2, token: 't-mike', nickname: 'ミケ', pid: 'mikepid00001' });
  app.db.rpgRows.push(
    { token: T0, profile_id: 1, nickname: 'チコ', lv: 9, dungeons: 0, floors: 2, created_at: ago(60), at: ago(60) },
    { token: P, profile_id: 4, nickname: 'チコ別', lv: 3, dungeons: 0, floors: 0, created_at: ago(60), at: ago(60) },
    { token: 't-mike', profile_id: 2, nickname: 'ミケ', lv: 30, dungeons: 1, floors: 7, created_at: ago(60), at: ago(60) },
  );
  await withProfile(page, app);
  await page.evaluate(({ P, PID }) => { localStorage.setItem('rpgRankPending', JSON.stringify(P)); localStorage.setItem('rpgSent', JSON.stringify({ pid: PID, lv: 9, dungeons: 0, floors: 2 })); }, { P, PID });
  await writeSave(page, saveWith({ lv: 9, floors: { samerica: 2 } }));
  await wipe(page);
  await until(() => app.db.rpgRows.length === 1, 8000);
  assert.deepEqual(app.db.rpgRows.map(r => r.nickname), ['ミケ']);
  assert.deepEqual(callsOf(app, 'rpg_unregister2').map(c => c.args.p_token), [T0, P]);
  assert.deepEqual(callsOf(app, 'rpg_unregister'), []);
  await page.waitForFunction(() => localStorage.getItem('rpgUnreg') === null);
  assert.deepEqual(await page.evaluate(() => ['rpgSent', 'rpgRankPending'].map(k => localStorage.getItem(k))), [null, null]);
  assert.equal(await page.evaluate(() => PROFILE.get()?.name), 'チコ');   // プロフィールは残る
  assert.equal(app.db.profiles.length, 3);
});

t('wipe_not_registered', async (page, app) => {
  await writeSave(page, saveWith({ lv: 5 }));
  await wipe(page);
  await page.waitForTimeout(500);
  assert.deepEqual(callsOf(app, 'rpg_unregister2'), []);
  assert.equal(await page.evaluate(() => localStorage.getItem('rpgUnreg')), null);
});

t('wipe_offline_retries_on_startup', async (page, app) => {
  app.db.rpgRows.push({ token: T0, profile_id: 1, nickname: 'チコ', lv: 9, dungeons: 0, floors: 2, created_at: ago(60), at: ago(60) });
  await withProfile(page, app);
  await page.evaluate(p => localStorage.setItem('rpgSent', JSON.stringify({ pid: p, lv: 9, dungeons: 0, floors: 2 })), PID);
  await writeSave(page, saveWith({ lv: 9, floors: { samerica: 2 } }));
  app.db.down = true;
  await wipe(page);
  await page.waitForFunction(() => localStorage.getItem('rpgSent') === null);
  await page.waitForTimeout(500);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('rpgUnreg'))), [T0]);   // 消せるまで覚えておく
  assert.equal(app.db.rpgRows.length, 1);
  app.db.down = false;
  await page.reload();
  await page.waitForFunction(() => localStorage.getItem('rpgUnreg') === null, null, { timeout: 8000 });
  assert.equal(app.db.rpgRows.length, 0);
});

t('wipe_offline_then_restart_waits', async (page, app) => {
  // 消し終わる前に冒険をやり直しても、先に消してから新しい記録を送る（あとから消し直して新しい記録まで消さない）
  app.db.rpgRows.push({ token: T0, profile_id: 1, nickname: 'チコ', lv: 9, dungeons: 0, floors: 2, created_at: ago(60), at: ago(60) });
  await withProfile(page, app);
  await page.evaluate(p => localStorage.setItem('rpgSent', JSON.stringify({ pid: p, lv: 9, dungeons: 0, floors: 2 })), PID);
  await writeSave(page, saveWith({ lv: 9, floors: { samerica: 2 } }));
  app.db.down = true;
  await wipe(page);
  await page.waitForFunction(() => localStorage.getItem('rpgUnreg') !== null);
  await writeSave(page, saveWith({ lv: 2 }));   // つながらないまま、はじめからやり直した
  app.db.down = false;
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('rpg:levelup')));
  await until(() => callsOf(app, 'rpg_update2').length === 1, 8000);
  const names = app.db.calls.map(c => c.name).filter(n => n === 'rpg_unregister2' || n === 'rpg_update2');
  assert.equal(names.indexOf('rpg_unregister2') < names.indexOf('rpg_update2') && names.includes('rpg_unregister2'), true, names.join(','));
  assert.deepEqual(app.db.rpgRows.map(r => r.lv), [2]);
});

t('wipe_offline_then_box_waits', async (page, app) => {
  // 自動 OFF でも同じ: 消し終わる前に冒険をやり直して箱で載せたら、先に消してから送る（次の起動で新しい記録まで消さない）
  app.db.rpgRows.push({ token: T0, profile_id: 1, nickname: 'チコ', lv: 9, dungeons: 0, floors: 2, created_at: ago(60), at: ago(60) });
  await withProfile(page, app, { auto: false });
  await writeSave(page, saveWith({ lv: 9, floors: { samerica: 2 } }));
  app.db.down = true;
  await wipe(page);
  await page.waitForFunction(() => localStorage.getItem('rpgUnreg') !== null);
  await page.waitForTimeout(300);
  await page.evaluate(() => RPG.tx(d => { d.intro = true; d.lv = 2; }));   // つながらないまま、読み直さずにはじめからやり直した
  app.db.down = false;
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.click('#rr-post [data-pf="send"]');
  await page.waitForFunction(() => $('rr-post').textContent.includes('載せたよ'));
  const names = app.db.calls.map(c => c.name).filter(n => n === 'rpg_unregister2' || n === 'rpg_update2');
  assert.equal(names.indexOf('rpg_unregister2') < names.indexOf('rpg_update2') && names.includes('rpg_unregister2'), true, names.join(','));
  assert.deepEqual(app.db.rpgRows.map(r => r.lv), [2]);
  assert.equal(await page.evaluate(() => localStorage.getItem('rpgUnreg')), null);
});

t('left_rpgrank_box_detached', async (page, app) => {
  // 冒険ランキングを離れたら載せる箱を外す（隠れた箱が profile:change を聞き続けない。開き直せば作り直す）
  await withProfile(page, app, { auto: false });
  await writeSave(page, saveWith({ lv: 7 }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.locator('#rr-post [data-pf="send"]').waitFor();
  await page.evaluate(() => RPG.open('rpg'));
  assert.equal(await page.locator('#rr-post > *').count(), 0);
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.locator('#rr-post [data-pf="send"]').waitFor();
  assert.deepEqual(callsOf(app, 'rpg_update2'), []);
});

t('old_rpgRankDel_drains', async (page, app) => {
  // 前の版で消しそこねた合言葉（rpgRankDel）も rpg_unregister2 で消し直す
  const D = '00000000-0000-4000-8000-00000000000d';
  app.db.profiles.push({ id: 5, token: D, nickname: 'むかし', pid: 'oldpid000001' });
  app.db.rpgRows.push({ token: D, profile_id: 5, nickname: 'むかし', lv: 9, dungeons: 0, floors: 2, created_at: ago(60), at: ago(60) });
  await page.evaluate(D => localStorage.setItem('rpgRankDel', JSON.stringify([D])), D);
  await page.reload();
  await page.waitForFunction(() => localStorage.getItem('rpgRankDel') === null, null, { timeout: 8000 });
  assert.deepEqual(callsOf(app, 'rpg_unregister2').map(c => c.args.p_token), [D]);
  assert.equal(app.db.rpgRows.length, 0);
});

// ---- 英雄の塔（rpg_set_tower2・top_tower2・rpg_tower_rank_of） ----
const TOWER_SAVE = f => saveWith({ lv: 30, floors: { world: 5 }, story: ['ch1'], ...f });

t('tower_tab', async (page, app) => {
  // 名前・かざりはプロフィールのもの（top_tower2）。自分の行は me
  app.db.profiles.push({ id: 2, token: 't-mike', nickname: 'ミケ', pid: 'mikepid00001', deco: ['jp'] });
  app.db.rpgRows.push(
    { token: 't-mike', profile_id: 2, nickname: 'ミケ', lv: 30, dungeons: 1, floors: 7, tower: 12, tower_at: ago(60), created_at: ago(90), at: ago(90) },
    { token: 't-taro', nickname: 'タロウ', lv: 50, dungeons: 3, floors: 16, tower: 30, tower_at: ago(50), created_at: ago(80), at: ago(80) },
    { token: 't-hana', nickname: 'ハナ', lv: 99, dungeons: 3, floors: 16, created_at: ago(70), at: ago(70) },   // 塔 0 は出ない
  );
  await writeSave(page, TOWER_SAVE({ tower: { best: 20 } }));
  await page.evaluate(() => RPG.open('rpgrank'));
  const tabs = await page.$$eval('#rr-tabs button', bs => bs.map(b => b.textContent));
  assert.deepEqual(tabs, ['レベル', 'ダンジョン', '英雄の塔']);
  await page.click('#rr-tabs button[data-s="tower"]');
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 2);
  const r = await rows(page);
  assert.ok(r[0].startsWith('1 タロウ 🗼30階 Lv 50') && r[1].startsWith('2 ミケ 🗼12階 Lv 30'), r.join('|'));
  assert.equal(await page.locator('#rr-list li').nth(1).locator('.rr-deco img').count(), 1);
  assert.deepEqual(await page.$$eval('#rr-list li .nick', ls => ls.map(l => l.querySelector('.pf-name')?.dataset.pid ?? null)), [null, 'mikepid00001']);
  assert.equal(await text(page, '#rr-how'), '上位50人まで。最高記録の階 → レベルの順');
  assert.equal(await page.getAttribute('#rr-tabs button[data-s="tower"]', 'aria-pressed'), 'true');
  // 自分の記録: 自己ベストと、何位相当か
  assert.ok((await text(page, '#rr-me')).includes('英雄の塔 自己ベスト 20階'), await text(page, '#rr-me'));
  await page.waitForFunction(() => $('rr-rank').textContent.startsWith('英雄の塔'));
  assert.equal(await text(page, '#rr-rank'), '英雄の塔 2位 相当');
  assert.deepEqual(app.db.calls.filter(c => c.name === 'rpg_tower_rank_of').at(-1).args, { p_tower: 20, p_lv: 30 });
  assert.equal(callsOf(app, 'top_tower2').length >= 1, true);
  assert.deepEqual(callsOf(app, 'top_tower'), []);
  // 同じ記録は同じ順位
  app.db.rpgRows.push({ token: 't-kai', nickname: 'カイ', lv: 30, dungeons: 0, floors: 0, tower: 12, tower_at: ago(10), created_at: ago(10), at: ago(10) });
  await page.click('#rr-tabs button[data-s="lv"]');
  await page.click('#rr-tabs button[data-s="tower"]');
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 3);
  assert.deepEqual((await rows(page)).map(x => x.split(' ').slice(0, 2).join(' ')), ['1 タロウ', '2 ミケ', '2 カイ']);
  // もどすと今のタブ
  await page.click('#rr-tabs button[data-s="lv"]');
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 4);
  assert.ok(!(await text(page, '#rr-me')).includes('英雄の塔'));
});

t('tower_tab_me_row', async (page, app) => {
  // 自分（pid が同じ）の行は塔のタブでも me。名前を押すとプロフィールの窓に「英雄の塔 ◯階」
  app.db.rpgRows.push({ token: T0, profile_id: 1, nickname: 'チコ', lv: 30, dungeons: 1, floors: 5, tower: 7, tower_at: ago(30), created_at: ago(60), at: ago(60) });
  await withProfile(page, app);
  await page.evaluate(p => localStorage.setItem('rpgSent', JSON.stringify({ pid: p, lv: 30, dungeons: 1, floors: 5, tower: 7 })), PID);
  await writeSave(page, TOWER_SAVE({ tower: { best: 7 } }));
  await page.evaluate(() => RPG.open('rpgrank', { sort: 'tower' }));
  await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 1);
  assert.deepEqual(await page.$$eval('#rr-list li', ls => ls.map(l => l.classList.contains('me'))), [true]);
  await page.click('#rr-list li .pf-name');
  await page.waitForFunction(() => document.querySelector('#pf-card[open]')?.textContent.includes('英雄の塔 7階'));
  // 送ってある記録・塔と同じなので、何も送らない
  await page.waitForTimeout(2000);
  assert.deepEqual(callsOf(app, 'rpg_update2').concat(callsOf(app, 'rpg_set_tower2')), []);
});

// レベルのタブで頼んだ順位の返事が、塔のタブに切りかえたあとに来ても、塔のタブには書かない
for (const best of [0, 20]) t(`tower_tab_late_level_rank_${best}`, async page => {
  await writeSave(page, TOWER_SAVE({ tower: { best } }));
  await page.evaluate(() => {
    window.__lvRank = [];
    const orig = RANKING.rpgRankOf;
    RANKING.rpgRankOf = want => new Promise((ok, ng) => { window.__lvRank.push(() => orig(want).then(ok, ng)); });
  });
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.waitForFunction(() => window.__lvRank.length >= 1);
  await page.click('#rr-tabs button[data-s="tower"]');
  if (best) await page.waitForFunction(() => $('rr-rank').textContent.startsWith('英雄の塔'));
  // 遅れていたレベル順の返事をいま返す
  await page.evaluate(() => Promise.all(window.__lvRank.splice(0).map(f => f())));
  await page.waitForTimeout(300);
  const want = best ? '英雄の塔 1位 相当' : '';
  assert.equal(await page.evaluate(() => $('rr-rank').textContent), want);
});

t('tower_tab_not_ready', async (page, app) => {
  // DB にまだ top_tower2 が無い（本番に適用する前）: 「準備中」と出して、エラーにしない
  delete app.db.rpc.top_tower2;
  delete app.db.rpc.rpg_tower_rank_of;
  await writeSave(page, TOWER_SAVE({ tower: { best: 3 } }));
  await page.evaluate(() => RPG.open('rpgrank', { sort: 'tower' }));
  await page.waitForFunction(() => !$('rr-soon').hidden);
  assert.ok((await text(page, '#rr-soon')).includes('準備中'));
  assert.equal(await page.isVisible('#rr-error'), false);
  assert.equal(await page.isVisible('#rr-empty'), false);
  assert.equal(await page.locator('#rr-list li').count(), 0);
  // ほかのタブにもどると今どおり
  await page.click('#rr-tabs button[data-s="lv"]');
  await page.waitForFunction(() => !$('rr-empty').hidden);
  assert.equal(await page.isVisible('#rr-soon'), false);
});

t('tower_auto_send', async (page, app) => {
  // プロフィールあり＋自動 ON・塔で新しい階に勝った（rpg:tower の newBest）→ GAP のあとに rpg_set_tower2 をプロフィールの合言葉と best で送る
  app.db.rpgRows.push({ token: T0, profile_id: 1, nickname: 'チコ', lv: 30, dungeons: 1, floors: 5, created_at: ago(60), at: ago(60) });
  await withProfile(page, app);
  await page.evaluate(p => localStorage.setItem('rpgSent', JSON.stringify({ pid: p, lv: 30, dungeons: 1, floors: 5 })), PID);
  await writeSave(page, TOWER_SAVE({}));
  await page.waitForTimeout(2500);
  assert.deepEqual(callsOf(app, 'rpg_set_tower2'), []);   // best 0 は送らない
  await startTower(page);
  await winTowerFloor(page);
  await until(() => callsOf(app, 'rpg_set_tower2').length > 0, 30000);
  assert.deepEqual(callsOf(app, 'rpg_set_tower2').map(c => c.args), [{ p_token: T0, p_tower: 1 }]);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rpgSent'))?.tower === 1);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('rpgSent'))), { pid: PID, lv: 30, dungeons: 1, floors: 5, tower: 1 });
  assert.equal(app.db.rpgRows[0].tower, 1);
  // 同じ best では送り直さない（読み込み直しても）。前の版の rpg_set_tower・rpgRank は使わない
  await page.reload();
  await page.waitForTimeout(2500);
  assert.equal(callsOf(app, 'rpg_set_tower2').length, 1);
  assert.deepEqual(callsOf(app, 'rpg_set_tower'), []);
  assert.equal(await page.evaluate(() => localStorage.getItem('rpgRank')), null);
});

t('tower_auto_send_needs_profile', async (page, app) => {
  // プロフィールが無ければ塔の記録があっても送らない。作ったら記録 → 塔の順に、GAP をあけて送る
  await writeSave(page, TOWER_SAVE({ tower: { best: 3 } }));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('rpg:tower', { detail: { floor: 3, win: true, best: 3, newBest: true, coins: 28 } })));
  await page.waitForTimeout(2500);
  assert.deepEqual(callsOf(app, 'rpg_set_tower2'), []);
  assert.deepEqual(await page.evaluate(() => PROFILE.create('チコ')), { ok: true });
  await until(() => callsOf(app, 'rpg_set_tower2').length > 0, 30000);
  const p = app.db.profiles[0], rec = callsOf(app, 'rpg_update2'), tw = callsOf(app, 'rpg_set_tower2');
  assert.deepEqual(rec.map(c => c.args.p_token), [p.token]);
  assert.deepEqual(tw.map(c => c.args), [{ p_token: p.token, p_tower: 3 }]);
  assert.ok(tw[0].at - rec[0].at >= 10000, String(tw[0].at - rec[0].at));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rpgSent'))?.tower === 3);
});

t('tower_box_sends_with_record', async (page, app) => {
  // 自動 OFF の箱: ［載せる］で記録を送り、塔の新記録もすぐ続けて送る（塔の連投よけは記録とは別）
  await withProfile(page, app, { auto: false });
  await writeSave(page, TOWER_SAVE({ tower: { best: 4 } }));
  await page.evaluate(() => RPG.open('rpgrank'));
  await page.click('#rr-post [data-pf="send"]');
  await page.waitForFunction(() => $('rr-post').textContent.includes('載せたよ'));
  await until(() => callsOf(app, 'rpg_set_tower2').length > 0, 5000);
  assert.deepEqual(callsOf(app, 'rpg_update2').map(c => c.args.p_lv), [30]);
  assert.deepEqual(callsOf(app, 'rpg_set_tower2').map(c => c.args), [{ p_token: T0, p_tower: 4 }]);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rpgSent'))?.tower === 4);
  assert.deepEqual(app.db.rpgRows.map(r => [r.profile_id, r.tower]), [[1, 4]]);
});
