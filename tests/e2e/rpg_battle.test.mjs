// 国旗クエストのバトル（rpg-battle.js）: 登場画面・4択・ボスの旗・思い出して復活・勝ち負けの記録・にげる・キー操作・ゴーストタップ対策
// どのテストも badges.js を止め、Math.random を種1にして開く（openRpg）。セーブは writeSave(page, saveWith({…})) で入れる
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, pickSetup, events } from './helpers.mjs';
import { openRpg, readSave, writeSave, saveWith, localToday, startBattle, battleAnswer, battleGuard, winBattle } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで開いて fn を実行する。最後にページの例外と、[rpg] で始まる console.error が無いことを見る
// （opts.rpgErrorOk で console.error の確認だけ外せる。ほかの opts は openRpg にそのまま渡す）
const t = (name, fn, { rpgErrorOk = false, ...opts } = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openRpg(browser, { seed: 1, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    if (!rpgErrorOk) assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});

const text = (page, sel) => page.locator(sel).innerText();
const state = page => page.evaluate(() => RPG_BATTLE.state());
const phase = async page => (await state(page)).phase;
const cur = page => page.evaluate(() => RPG_BATTLE.cur());
const hp = async page => +await page.getAttribute('#bt-hhp', 'aria-valuenow');
const cloths = page => page.locator('#bt-flags .rpg-cloth').count();
const label = page => text(page, '#bt-q .qlabel');
// o から want のキーだけを取り出す（イベントやセーブの一部を比べる）
const pick = (o, want) => Object.fromEntries(Object.keys(want).map(k => [k, o[k]]));
const BOSS_SAVE = saveWith({ lv: 20, floors: { samerica: 4 } });   // atk 48 ≥ 旗1枚の HP 18 なので1回ずつ
const setMisses = (page, m) => page.evaluate(m => { misses = m; store.set('misses', misses); }, m);

t('intro_screen', async page => {
  await writeSave(page, saveWith({}));
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  assert.equal(await page.isVisible('#scr-battle'), true);
  assert.equal(await phase(page), 'intro');
  let s = await text(page, '#bt-intro');
  for (const x of ['🦜', 'おしゃべりオウム', '倒すのに必要な正解: 約5回 ／ まちがえてOK: 3回まで', '仲間がいると強くなるよ（国旗ガチャ・5回正解）',
    '正解すると攻撃！ まちがえると反撃されるよ']) assert.ok(s.includes(x), `${x} が無い: ${s}`);
  assert.ok(!s.includes('がんばりゲージ') && !s.includes('旗1枚につき'), s);
  // F1 をもうクリアしている → 最初の説明の行は出さない
  await writeSave(page, saveWith({ floors: { samerica: 1 } }));
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  s = await text(page, '#bt-intro');
  assert.ok(s.includes('おしゃべりオウム') && !s.includes('正解すると攻撃！'), s);
  // ボスだけの1行
  await writeSave(page, BOSS_SAVE);
  await page.evaluate(() => RPG_BATTLE.start('samerica', 5));
  s = await text(page, '#bt-intro');
  for (const x of ['ジャガー王', '旗1枚につき正解1回で取りもどせる（Lv が足りないと2回かかることも）。旗を全部取りもどしたら勝ち！'])
    assert.ok(s.includes(x), `${x} が無い: ${s}`);
});

t('win_first_floor', async page => {
  await writeSave(page, saveWith({}));
  await startBattle(page, 'samerica', 1);
  const n = await winBattle(page);
  assert.ok(n === 4 || n === 5, `正解 ${n} 回`);
  const s = await text(page, '#bt-end');
  for (const x of ['勝利！', '+36', '（はじめてのクリア ×3）']) assert.ok(s.includes(x), `${x} が無い: ${s}`);
  const d = await readSave(page);
  assert.deepEqual([d.floors.samerica, d.coins, d.st.win], [1, 36, 1]);
  const b = await events(page, 'rpg:battle');
  assert.equal(b.length, 1);
  assert.deepEqual(pick(b[0], { dungeon: 0, floor: 0, boss: 0, win: 0, first: 0, mistakes: 0, revived: 0, gauge: 0, lv: 0, recLv: 0 }),
    { dungeon: 'samerica', floor: 1, boss: false, win: true, first: true, mistakes: 0, revived: false, gauge: 0, lv: 1, recLv: 1 });
  assert.equal(b[0].maxCombo, n);
  assert.deepEqual((await events(page, 'rpg:coins')).map(e => pick(e, { delta: 0, reason: 0 })), [{ delta: 36, reason: 'battle' }]);
  assert.equal((await events(page, 'rpg:answer')).length, n);
  // つぎのフロアへ → F2 の登場画面
  await page.click('#bt-nextfloor');
  assert.ok((await text(page, '#bt-intro')).includes('ヤドクガエル'));
  // F1 をもう一度勝つ → はじめてではないので 10+2×1 = 12
  await startBattle(page, 'samerica', 1);
  await winBattle(page);
  const s2 = await text(page, '#bt-end');
  assert.ok(s2.includes('+12') && !s2.includes('はじめてのクリア'), s2);
  assert.equal((await readSave(page)).coins, 48);
  assert.equal((await events(page, 'rpg:battle'))[1].first, false);
});

t('locked_floor_ignored', async page => {
  await writeSave(page, saveWith({}));
  await page.evaluate(() => RPG_BATTLE.start('samerica', 3));
  assert.equal(await phase(page), null);
  assert.equal(await page.isVisible('#scr-battle'), false);
  await page.evaluate(() => RPG_BATTLE.start('oceania', 1));   // 開いていないダンジョン
  assert.equal(await phase(page), null);
  assert.equal(await page.isVisible('#scr-battle'), false);
  // 冒険ホームから開いていないフロアを開こうとしても始まらない
  await page.evaluate(() => { show('rpg'); RPG.open('battle', { id: 'samerica', floor: 4 }); });
  assert.equal(await phase(page), null);
  assert.deepEqual(await page.evaluate(() => RPG.opts), {});
});

t('home_buttons_start_battle', async page => {
  await writeSave(page, saveWith({ pulls: 1, floors: { samerica: 2 } }));
  await page.evaluate(() => show('rpg'));
  // 「つぎにやること」→ F3 の登場画面（RPG.opts は受け取ったら空に戻す）
  await page.click('#rpg-next');
  assert.equal(await page.isVisible('#scr-battle'), true);
  assert.equal(await phase(page), 'intro');
  assert.equal(await text(page, '#scr-battle .rpg-bwhere'), 'F3 アマゾンの密林');   // フロアが先（短いスマホで … に切られるのは名前のほう）
  assert.deepEqual(await page.evaluate(() => RPG.opts), {});
  // にげて冒険ホームへ → クリアしたフロアのボタン → F2
  page.once('dialog', d => d.accept());
  await page.click('#bt-flee');
  assert.equal(await page.isVisible('#scr-rpg'), true);
  await page.click('.rpg-fl[data-d="samerica"][data-f="2"]');
  assert.equal(await phase(page), 'intro');
  assert.equal(await text(page, '#scr-battle .rpg-bwhere'), 'F2 アマゾンの密林');
  assert.ok((await text(page, '#bt-intro')).includes('ヤドクガエル'));
});

t('wrong_reveal_waits', async page => {
  await writeSave(page, saveWith({}));
  await startBattle(page, 'samerica', 1);
  await battleGuard(page);
  const a = await cur(page);
  await page.locator(`#scr-battle .choice:not([data-a="${a}"])`).first().click();
  assert.equal(await phase(page), 'reveal');
  assert.equal(await page.locator('#bt-reveal .facts').count(), 1);
  const ev = (await events(page, 'rpg:answer')).at(-1);
  if (ev.mode !== 'm2f') assert.equal(await page.locator('#bt-reveal svg.map').count(), 1);
  assert.ok((await text(page, '#bt-reveal .verdict.ng')).startsWith('ざんねん。正解は「'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'bt-next');
  await page.waitForTimeout(1000);
  assert.equal(await phase(page), 'reveal');   // 自動では進まない
  assert.equal(await page.locator('#scr-battle .choice:visible').count(), 0);   // 選択肢の場所と入れかわっている
  assert.equal(await page.evaluate(a => misses[a], a), 1);
  assert.deepEqual(pick(ev, { a: 0, right: 0, dungeon: 0, boss: 0 }), { a, right: false, dungeon: 'samerica', boss: false });
  assert.equal(await hp(page), 36 - 11);
});

t('lose_revive_fail_practice', async page => {
  await writeSave(page, saveWith({}));
  await startBattle(page, 'samerica', 1);
  for (let i = 0; i < 4; i++) await battleAnswer(page, false);
  assert.equal(await phase(page), 'revive');
  assert.ok((await text(page, '#bt-q')).includes('思い出して復活'));
  await battleAnswer(page, false);
  assert.equal(await phase(page), 'end');
  const s = await text(page, '#bt-end');
  for (const x of ['やられた…！ でも、まちがえた国はもう覚えたはず', 'がんばり賞', 'がんばりゲージ 1/5']) assert.ok(s.includes(x), `${x} が無い: ${s}`);
  const ans = await events(page, 'rpg:answer'), wrong = new Set(ans.filter(e => !e.right).map(e => e.a));
  const rights = ans.filter(e => e.right).length;
  assert.equal(await page.locator('#bt-end .misslist li').count(), wrong.size);
  const d = await readSave(page);
  assert.equal(d.gauge['samerica:1'], 1);
  assert.equal(d.coins, Math.min(rights * 2, 6));
  assert.deepEqual([d.st.lose, d.st.revive, d.floors.samerica], [1, 0, undefined]);
  assert.deepEqual(pick((await events(page, 'rpg:battle'))[0], { win: 0, revived: 0, gauge: 0, mistakes: 0 }), { win: false, revived: false, gauge: 1, mistakes: 5 });
  // この地域を練習する
  await page.click('#bt-practice');
  assert.equal(await page.isVisible('#scr-setup'), true);
  assert.deepEqual(await page.evaluate(() => [S.region, P.kind]), ['南アメリカ', 'practice']);
  assert.equal(await page.getAttribute('#regions .chip[data-r="南アメリカ"]', 'aria-pressed'), 'true');
  assert.equal(await phase(page), null);
});

t('revive_success_then_win', async page => {
  await writeSave(page, saveWith({}));
  await startBattle(page, 'samerica', 1);
  for (let i = 0; i < 4; i++) await battleAnswer(page, false);
  assert.equal(await phase(page), 'revive');
  while (await phase(page) === 'revive') await battleAnswer(page, true);
  assert.equal(await phase(page), 'question');
  assert.equal(await hp(page), 18);   // 最大 HP 36 の半分
  await winBattle(page);
  let b = await events(page, 'rpg:battle');
  assert.deepEqual(pick(b.at(-1), { win: 0, revived: 0 }), { win: true, revived: true });
  assert.equal((await readSave(page)).st.revive, 1);
  // 別のバトル: 復活は1回だけ
  await startBattle(page, 'samerica', 1);
  for (let i = 0; i < 4; i++) await battleAnswer(page, false);
  while (await phase(page) === 'revive') await battleAnswer(page, true);
  assert.equal(await hp(page), 18);
  await battleAnswer(page, false);
  assert.equal(await phase(page), 'question');
  await battleAnswer(page, false);
  assert.equal(await phase(page), 'end');
  assert.ok((await text(page, '#bt-end')).includes('やられた…！'));
  b = await events(page, 'rpg:battle');
  assert.deepEqual(pick(b.at(-1), { win: 0, revived: 0 }), { win: false, revived: true });
});

t('gauge_shows_and_resets', async page => {
  await writeSave(page, saveWith({ gauge: { 'samerica:1': 2 } }));
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  assert.ok((await text(page, '#bt-intro')).includes('がんばりゲージ +10%'));
  await page.click('#bt-fight');
  await winBattle(page);
  assert.equal((await readSave(page)).gauge['samerica:1'], undefined);
});

t('boss_needs_each_flag', async page => {
  await writeSave(page, BOSS_SAVE);
  await startBattle(page, 'samerica', 5);
  assert.equal(await cloths(page), 6);
  assert.equal(await winBattle(page), 6);
  const rights = (await events(page, 'rpg:answer')).filter(e => e.right).map(e => e.a);
  assert.equal(new Set(rights).size, 6);
  assert.equal(await cloths(page), 0);
  assert.equal(await page.locator('#bt-flags img').count(), 6);
  const s = await text(page, '#bt-end');
  for (const x of ['南アメリカを取りもどした！', '+260']) assert.ok(s.includes(x), `${x} が無い: ${s}`);
  const d = await readSave(page);
  assert.deepEqual([d.floors.samerica, d.coins, d.st.bossWins, d.st.nodmg], [5, 260, 1, 1]);
  assert.deepEqual((await events(page, 'rpg:clear')).map(e => pick(e, { dungeon: 0 })), [{ dungeon: 'samerica' }]);
  assert.equal(await page.evaluate(() => RPG.unlocked(RPG.get(), 'oceania')), true);
  assert.equal(await page.locator('#bt-share').count(), 1);
  // ボスのあとの「つぎのフロアへ」は次のダンジョンの F1
  await page.click('#bt-nextfloor');
  assert.ok((await text(page, '#bt-intro')).includes('ヤシガニ'));
  // もう一度ボスに勝っても rpg:clear は増えない
  await startBattle(page, 'samerica', 5);
  await winBattle(page);
  assert.equal((await events(page, 'rpg:clear')).length, 1);
  assert.equal((await events(page, 'rpg:battle')).length, 2);
  assert.equal(await page.locator('#bt-share').count(), 0);
});

t('boss_two_hits_when_low_lv', async page => {
  await writeSave(page, saveWith({ lv: 1, floors: { samerica: 4 } }));
  await startBattle(page, 'samerica', 5);
  const a0 = await cur(page), l0 = await label(page);
  await battleAnswer(page, true);
  assert.match(await text(page, '#bt-log'), /ジャガー王に1[05]ダメージ/);   // atk 10（会心なら 15）< 旗1枚の HP 18
  assert.equal(await cloths(page), 6);
  assert.equal(await cur(page), a0);
  assert.notEqual(await label(page), l0);
});

t('boss_never_asks_capital', async page => {
  await writeSave(page, BOSS_SAVE);
  await setMisses(page, { br: 9 });
  await startBattle(page, 'samerica', 5);
  assert.equal(await page.evaluate(() => RPG_BATTLE.force('ws', 'cap')), false);
  const seen = [];
  while (await phase(page) !== 'end') {
    seen.push(await page.evaluate(() => ({ label: document.querySelector('#bt-q .qlabel').textContent, a: RPG_BATTLE.cur() })));
    await battleAnswer(page, true);
  }
  assert.ok(seen.length >= 6, JSON.stringify(seen));
  assert.ok(seen.every(x => !/首都/.test(x.label)), JSON.stringify(seen));   // 出題は国旗・国名・場所だけ
  assert.ok((await events(page, 'rpg:answer')).every(e => e.mode !== 'cap'));
});

t('weak_and_wanted_tags', async page => {
  await writeSave(page, saveWith({ bounty: { d: localToday(), a: ['ar', 'jp', 'fr'], done: [] } }));
  await setMisses(page, { br: 2 });
  await startBattle(page, 'samerica', 1);
  const tags = () => page.$$eval('#bt-q .rpg-tag', els => els.map(e => e.textContent));
  await page.evaluate(() => RPG_BATTLE.force('br', 'f2n'));
  assert.deepEqual(await tags(), ['⚠ 前にまちがえた国']);
  await page.evaluate(() => RPG_BATTLE.force('ar', 'n2f'));
  assert.deepEqual(await tags(), ['手配中']);
  await page.evaluate(() => RPG_BATTLE.force('pe', 'f2n'));
  assert.deepEqual(await tags(), []);
});

t('flee_button_and_esc', async page => {
  await writeSave(page, saveWith({ coins: 500 }));
  const asked = [], reply = ok => page.once('dialog', d => { asked.push(d.message()); return ok ? d.accept() : d.dismiss(); });
  await startBattle(page, 'samerica', 1);
  reply(false);
  await page.click('#bt-flee');
  assert.equal(await phase(page), 'question');
  assert.equal(await page.isVisible('#scr-battle'), true);
  reply(true);
  await page.click('#bt-flee');
  assert.equal(await page.isVisible('#scr-rpg'), true);
  assert.equal(await phase(page), null);
  let d = await readSave(page);
  assert.deepEqual([d.st.flee, d.coins], [1, 500]);
  assert.equal((await events(page, 'rpg:battle')).length, 0);
  // Esc でも同じ
  await startBattle(page, 'samerica', 1);
  reply(true);
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#scr-rpg'), true);
  d = await readSave(page);
  assert.deepEqual([d.st.flee, d.coins, d.st.win, d.st.lose], [2, 500, 0, 0]);
  assert.equal((await events(page, 'rpg:battle')).length, 0);
  assert.deepEqual(asked, Array(3).fill('にげる？（報酬はなし）'));
});

t('leave_by_topbar_cleans_up', async page => {
  await writeSave(page, saveWith({}));
  await startBattle(page, 'samerica', 1);
  await battleGuard(page);
  await page.click(`#scr-battle .choice[data-a="${await cur(page)}"]`);   // 正解 → 自動送りの待ち
  await page.click('#to-book');
  assert.equal(await page.isVisible('#scr-book'), true);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#scr-battle .choice').length), 0);
  assert.equal((await readSave(page)).st.flee, 1);
  await page.waitForTimeout(1000);
  assert.equal(await page.isHidden('#scr-battle'), true);
  assert.equal(await phase(page), null);
  // そのあとのクイズの数字キーはクイズに効く（バトルの古いボタンを押さない）
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await page.keyboard.press('1');
  await page.locator('#qcard .reveal').waitFor();
  assert.equal((await events(page, 'rpg:answer')).length, 1);
});

t('reload_no_reward', async page => {
  await writeSave(page, saveWith({ coins: 300, fr: { br: 2 } }));
  const keys = { floors: 0, coins: 0, fr: 0, st: 0, gauge: 0 }, before = pick(await readSave(page), keys);
  await startBattle(page, 'samerica', 1);
  for (let i = 0; i < 3; i++) await battleAnswer(page, true);
  await battleAnswer(page, false);
  const wrong = (await events(page, 'rpg:answer')).find(e => !e.right).a;
  await page.reload();
  await page.waitForFunction(() => document.readyState === 'complete');
  assert.deepEqual(pick(await readSave(page), keys), before);
  assert.equal(await page.evaluate(a => misses[a], wrong), 1);
});

t('keyboard_only', async page => {
  await writeSave(page, saveWith({}));
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  await page.keyboard.press('Enter');
  assert.equal(await phase(page), 'question');
  for (let i = 0; i < 30 && await phase(page) !== 'end'; i++) {
    await page.waitForFunction(() => performance.now() - RPG_BATTLE.state().shownAt >= RPG_CORE.TUNING.battle.guardMs);
    const { k, t0 } = await page.evaluate(() => ({
      k: [...document.querySelectorAll('#scr-battle .choice')].findIndex(b => b.dataset.a === RPG_BATTLE.cur()) + 1,
      t0: RPG_BATTLE.state().shownAt,
    }));
    await page.keyboard.press(String(k));
    if (await phase(page) === 'reveal') await page.keyboard.press('Enter');
    await page.waitForFunction(t0 => { const s = RPG_BATTLE.state(); return s.shownAt !== t0 || s.phase === 'end'; }, t0);
  }
  assert.equal(await phase(page), 'end');
  assert.equal(await page.isVisible('#bt-end'), true);
  assert.deepEqual((await events(page, 'rpg:battle')).map(e => e.win), [true]);
});

t('ghost_tap_guard', async page => {
  await writeSave(page, saveWith({}));
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  // 問題が出た直後のクリックは無視する
  const ph = await page.evaluate(() => { $('bt-fight').click(); document.querySelector('#scr-battle .choice').click(); return RPG_BATTLE.state().phase; });
  assert.equal(ph, 'question');
  assert.equal((await events(page, 'rpg:answer')).length, 0);
  assert.equal(await page.locator('#scr-battle .choice:disabled').count(), 0);
  await battleGuard(page);
  await page.locator('#scr-battle .choice').first().click();
  assert.equal((await events(page, 'rpg:answer')).length, 1);
});

t('double_click_one_answer', async page => {
  await writeSave(page, saveWith({}));
  await startBattle(page, 'samerica', 1);
  await page.waitForFunction(() => performance.now() - RPG_BATTLE.state().shownAt >= RPG_CORE.TUNING.battle.guardMs);
  const h0 = await hp(page), atk = await page.evaluate(() => RPG_CORE.enemy('samerica', 1).atk);
  await page.locator(`#scr-battle .choice:not([data-a="${await cur(page)}"])`).first().dblclick();
  assert.equal(await hp(page), h0 - atk);
  assert.equal((await events(page, 'rpg:answer')).length, 1);
  assert.equal(await phase(page), 'reveal');
});

t('auto_advance', async page => {
  // 4回続けて正解しても倒しきらないように F4（HP 80。atk 10 で会心が4回続いても 70）
  await writeSave(page, saveWith({ floors: { samerica: 3 } }));
  await startBattle(page, 'samerica', 4);
  const ms = await page.evaluate(() => RPG_CORE.TUNING.battle.autoNextMs);
  const right = async () => { await battleGuard(page); await page.click(`#scr-battle .choice[data-a="${await cur(page)}"]`); };
  // 正解 → 300ms 後はまだ同じ問題、autoNextMs + 300ms 後は次の問題
  const s0 = await state(page), a0 = await cur(page);
  await right();
  await page.waitForTimeout(300);
  assert.equal(await cur(page), a0);
  assert.equal((await state(page)).shownAt, s0.shownAt);
  await page.waitForTimeout(ms);
  const s1 = await state(page);
  assert.notEqual(s1.shownAt, s0.shownAt);
  assert.equal(s1.phase, 'question');
  // 正解の直後に Enter → すぐ次の問題
  await right();
  await page.keyboard.press('Enter');
  await page.waitForFunction(t0 => RPG_BATTLE.state().shownAt !== t0, s1.shownAt, { timeout: 300 });
  // 正解の直後にステージ（ボタンでない所）をタップ → すぐ次の問題
  const s2 = await state(page);
  await right();
  await page.click('#scr-battle .rpg-bwhere');
  await page.waitForFunction(t0 => RPG_BATTLE.state().shownAt !== t0, s2.shownAt, { timeout: 300 });
  // 正解の直後に、押した選択肢（disabled）をもう一度タップ → 下の .choices に落ちて、すぐ次の問題。答えは増えない
  // page.click は enabled になるのを待つので、座標で押す
  const s3 = await state(page), a3 = await cur(page), n3 = (await events(page, 'rpg:answer')).length;
  await right();
  const bb = await page.locator(`#scr-battle .choice[data-a="${a3}"]`).boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForFunction(t0 => RPG_BATTLE.state().shownAt !== t0, s3.shownAt, { timeout: 300 });
  assert.equal((await events(page, 'rpg:answer')).length, n3 + 1);
});

// 画面（render）と自動で進む setTimeout の中で例外が出ても、ページの例外にせず console.error('[rpg]', e) にする
t('battle_errors_are_caught', async (page, app) => {
  await writeSave(page, saveWith({}));
  // render（RPG.open → show('battle') → start）の中で落ちる → 画面は「冒険ホームのダンジョンから始めてね」のまま
  await page.evaluate(() => {
    const f = RPG_CORE.battleStats;
    RPG_CORE.battleStats = () => { throw new Error('boom-render'); };
    try { RPG.open('battle', { id: 'samerica', floor: 1 }); } finally { RPG_CORE.battleStats = f; }   // 冒険ホームも battleStats を使うので開かない
  });
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'battle');
  assert.equal(await phase(page), null);
  assert.ok((await text(page, '#scr-battle')).includes('冒険ホームのダンジョンから始めてね'));
  // 自動送りのタイマーの中（nextQ → showQ → makeQuestion）で落ちる
  await startBattle(page, 'samerica', 1);
  await battleGuard(page);
  const a = await cur(page);
  await page.evaluate(() => { window.makeQuestion = () => { throw new Error('boom-timer'); }; });
  await page.click(`#scr-battle .choice[data-a="${a}"]`);
  await page.waitForTimeout(await page.evaluate(() => RPG_CORE.TUNING.battle.autoNextMs) + 300);
  const errs = app.consoleErrors.filter(s => s.startsWith('[rpg]'));
  assert.equal(errs.length, 2, JSON.stringify(app.consoleErrors));
  assert.ok(errs[0].includes('boom-render') && errs[1].includes('boom-timer'), JSON.stringify(errs));
  assert.deepEqual(app.errors.map(String), []);
}, { rpgErrorOk: true });

// 始める途中（B を作ったあと。上の列の「のこりミス」を描くところ）で落ちても、途中まで描いたバトルを画面に残さない。
// タイマーと B を片付けて「冒険ホームのダンジョンから始めてね」と［冒険ホームへ］を出す（RPG.open からも、終わりの画面の［つぎのフロアへ］からも）
t('battle_start_throw_cleans_up', async (page, app) => {
  await writeSave(page, saveWith({ lv: 20 }));
  const boom = () => page.evaluate(() => { window.__ma = RPG_CORE.missesAllowed; RPG_CORE.missesAllowed = () => { throw new Error('boom-start'); }; });
  const unboom = () => page.evaluate(() => { RPG_CORE.missesAllowed = window.__ma; });
  const idle = async () => {
    assert.equal(await page.evaluate(() => document.body.dataset.screen), 'battle');
    assert.equal(await phase(page), null);
    assert.equal(await page.locator('#scr-battle .rpg-stage, #bt-intro, #bt-end').count(), 0);
    assert.ok((await text(page, '#scr-battle')).includes('冒険ホームのダンジョンから始めてね'));
  };
  await boom();
  await page.evaluate(() => RPG.open('battle', { id: 'samerica', floor: 1 }));
  await unboom();
  await idle();
  await startBattle(page, 'samerica', 1);
  await winBattle(page);
  await boom();
  await page.click('#bt-nextfloor');
  await unboom();
  await idle();
  await page.click('#bt-home');
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'rpg');
  for (let i = 0; i < 100 && app.consoleErrors.filter(s => s.startsWith('[rpg]')).length < 2; i++) await new Promise(ok => setTimeout(ok, 20));
  const errs = app.consoleErrors.filter(s => s.startsWith('[rpg]'));
  assert.equal(errs.length, 2, JSON.stringify(app.consoleErrors));
  assert.ok(errs.every(s => s.includes('boom-start')), JSON.stringify(errs));
}, { rpgErrorOk: true });

t('party_on_intro', async page => {
  await writeSave(page, saveWith({ cards: { br: [2, 0], cl: [1, 0], jp: [3, 0] } }));
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  assert.equal(await page.locator('#bt-intro .rpg-party img').count(), 3);
  assert.deepEqual(await page.$$eval('#bt-intro .rpg-pc', els => els.map(el => [el.querySelector('img').getAttribute('src').length > 0, el.querySelector('.rpg-tag')?.textContent ?? ''])),
    [[true, ''], [true, '地域ボーナス ×1.5'], [true, '地域ボーナス ×1.5']]);   // こうげき順: jp（★3）・br（★2×1.5）・cl（★1×1.5）
  assert.equal(await page.locator('#bt-intro .rpg-tag', { hasText: '地域ボーナス ×1.5' }).count(), 2);
  assert.ok(!(await text(page, '#bt-intro')).includes('仲間がいると強くなるよ'));
});

// 登場画面の編成の切り替え（◀▶・←→、端で回る）。tsel が変わり、強さ・必要な正解の数・上の列の仲間がその場で描き直される
t('intro_switch_team', async page => {
  await writeSave(page, saveWith({ cards: { br: [1, 0], cl: [1, 0], ar: [1, 0] }, tsel: 0,
    teams: [{ n: 'A', c: ['br'] }, { n: 'B', c: ['br', 'cl', 'ar'] }, { n: 'C<b>', c: [] }] }));
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  const need = async () => +(await text(page, '#bt-intro')).match(/倒すのに必要な正解: 約(\d+)回/)[1];
  const focused = () => page.evaluate(() => document.activeElement?.id);
  assert.equal(await text(page, '#bt-tname'), 'A');
  assert.equal(await page.locator('#bt-intro .rpg-party img').count(), 1);
  assert.ok(!(await text(page, '#bt-intro')).includes('チーム '));
  const n0 = await need(), hp0 = await page.getAttribute('#bt-hhp', 'aria-valuemax');
  await page.click('#bt-tnext');
  assert.equal(await text(page, '#bt-tname'), 'B');
  assert.equal((await readSave(page)).tsel, 1);
  assert.notEqual(await need(), n0);
  assert.notEqual(await page.getAttribute('#bt-hhp', 'aria-valuemax'), hp0);
  // チームボーナスは編成の行の中（スマホでは「チーム」の字を隠して1行に）
  assert.match(await text(page, '#bt-intro .rpg-bteam'), /(チーム )?南アメリカ×3 ＋25%/);
  assert.equal(await page.locator('#bt-intro .rpg-bteam-b').textContent(), 'チーム 南アメリカ×3 ＋25%');
  assert.equal(await page.locator('#bt-intro .rpg-party img').count(), 3);
  assert.equal(await page.locator('.rpg-btop .rpg-party img').count(), 3);
  assert.equal(await page.locator('.rpg-btop .rpg-team-tag').innerText(), '＋25%');
  assert.equal(await focused(), 'bt-tnext');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await text(page, '#bt-tname'), 'A');
  assert.equal(await need(), n0);
  assert.equal(await focused(), 'bt-fight');
  assert.equal(await page.locator('.rpg-btop .rpg-team-tag').count(), 0);
  // 端で回る: A の ◀ → C（自分で組んだ0枚。名前は esc）
  await page.click('#bt-tprev');
  assert.equal(await text(page, '#bt-tname'), 'C<b>');
  assert.equal((await readSave(page)).tsel, 2);
  assert.ok((await text(page, '#bt-intro')).includes('この編成には仲間がいないよ'));
  assert.equal(await page.locator('.rpg-btop .rpg-party').count(), 0);
  await page.keyboard.press('ArrowRight');
  assert.equal(await text(page, '#bt-tname'), 'A');
  // 枠が1つなら ◀▶ は出さない。たたかうが始まったら ←→ は効かない
  await writeSave(page, saveWith({ cards: { br: [1, 0] } }));
  await startBattle(page, 'samerica', 1);
  await page.keyboard.press('ArrowRight');
  assert.equal(await phase(page), 'question');
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  assert.equal(await text(page, '#bt-tname'), '編成1');
  assert.equal(await page.locator('#bt-tprev, #bt-tnext').count(), 0);
  assert.equal(await page.locator('#bt-team').count(), 1);
});

t('intro_team_button', async page => {
  await writeSave(page, saveWith({ cards: { br: [1, 0] } }));
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  await page.click('#bt-team');
  await page.waitForFunction(() => document.body.dataset.screen === 'team');
  await page.click('#tm-back');
  await page.locator('#bt-intro').waitFor();
  assert.equal(await phase(page), 'intro');
  assert.ok((await text(page, '#bt-intro')).includes('おしゃべりオウム'));
});

// 正解したときの仲間の援護（ログと .rpg-assist）。ボスの旗でも
t('assist_log', async page => {
  await writeSave(page, saveWith({ cards: { br: [1, 0] } }));
  await startBattle(page, 'samerica', 1);
  await battleGuard(page);
  await page.locator(`#scr-battle .choice[data-a="${await cur(page)}"]`).click();
  const s = await text(page, '#bt-log');
  // ダメージが先、援護は後ろ（スマホの1行のログで … に切られるのは援護のほう）
  assert.match(s, /！ (ヤドクガエル|おしゃべりオウム)に\d+ダメージ（ブラジルの援護）/);
  assert.equal(await page.locator('.rpg-btop .rpg-party.rpg-assist').count(), 1);
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.rpg-assist').count(), 0);
  // ボス: 旗を取りもどした文
  await writeSave(page, saveWith({ lv: 20, floors: { samerica: 4 }, cards: { br: [1, 0], cl: [1, 0] } }));
  await startBattle(page, 'samerica', 5);
  await battleAnswer(page, true);
  assert.match(await text(page, '#bt-log'), /！ 旗を取りもどした（(ブラジル・チリ|チリ・ブラジル)の援護）/);
});

t('no_party_log_unchanged', async page => {
  await writeSave(page, saveWith({}));
  await startBattle(page, 'samerica', 1);
  await battleAnswer(page, true);
  const s = await text(page, '#bt-log');
  assert.ok(!s.includes('援護'), s);
  assert.match(s, /おしゃべりオウムに\d+ダメージ/);
  assert.equal(await page.locator('.rpg-btop .rpg-party').count(), 0);
});

t('battle_learning', async page => {
  await writeSave(page, saveWith({ fr: { br: 4 } }));
  await startBattle(page, 'samerica', 1);
  await page.evaluate(() => RPG_BATTLE.force('br', 'f2n'));
  await battleAnswer(page, true);
  await winBattle(page);
  const d = await readSave(page);
  assert.deepEqual(d.cards.br, [1, 0]);
  assert.equal(d.fr.br, 5);
  assert.deepEqual((await events(page, 'rpg:join')).map(e => pick(e, { a: 0, via: 0, owned: 0 })), [{ a: 'br', via: 'learn', owned: 1 }]);
  assert.ok((await text(page, '#bt-end')).includes('ブラジルが仲間になった！'));
});

// ---- 鏡の地球（第2章） ----
const EARTH_CLEARED = { samerica: 5, oceania: 5, namerica: 5, europe: 5, asia: 5, africa: 5, world: 5 };
// 地球を全部クリアしたセーブで、鏡のアマゾン F1 のチャド(td)・国旗→国名を出す
const mirrorTd = async page => {
  await writeSave(page, saveWith({ lv: 20, floors: { ...EARTH_CLEARED } }));
  await startBattle(page, 'msamerica', 1);
  assert.equal(await page.evaluate(() => RPG_BATTLE.force('td', 'f2n')), true);
};

t('mirror_similar_choices', async page => {
  await mirrorTd(page);
  const as = await page.$$eval('#bt-q .choice', els => els.map(e => e.dataset.a));
  assert.deepEqual([...as].sort(), ['ad', 'md', 'ro', 'td']);
});

t('mirror_reveal_shows_picked', async page => {
  await mirrorTd(page);
  await battleGuard(page);
  await page.click('#bt-q .choice[data-a="ro"]');
  await page.waitForSelector('#bt-reveal');
  const s = await text(page, '#bt-reveal');
  assert.ok(s.includes('えらんだのは「ルーマニア」'), s);
  const srcs = await page.$$eval('#bt-reveal .rpg-rv-pair img', els => els.map(e => e.getAttribute('src')));
  assert.equal(srcs.length, 2, srcs.join());
  assert.ok(srcs[0].includes("flag-icons-ro") && srcs[1].includes("flag-icons-td"), srcs.join());
});

t('earth_reveal_has_no_pair', async page => {
  await writeSave(page, saveWith({}));
  await startBattle(page, 'samerica', 1);
  await battleGuard(page);
  await page.locator('#scr-battle .choice:not([data-a="' + await cur(page) + '"])').first().click();
  await page.waitForSelector('#bt-reveal');
  assert.equal(await page.locator('.rpg-rv-pair').count(), 0);
});

t('earth_last_boss_has_no_next', async page => {
  for (const id of ['world', 'mworld']) {
    await writeSave(page, saveWith({ lv: 50, floors: { ...EARTH_CLEARED, [id]: 4 } }));
    await startBattle(page, id, 5);
    await winBattle(page);
    assert.equal(await page.isVisible('#bt-end'), true);
    assert.equal(await page.locator('#bt-nextfloor').count(), 0, `${id} に［つぎのフロアへ］がある`);
  }
});
