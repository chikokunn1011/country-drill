// 国旗クエストの「英雄の塔」（rpg-battle.js の塔モードと、冒険ホームの入口 #rpg-tower）
// どのテストも Math.random を種1にして開く（openRpg。badges.js は止める。本物とつなぐのは tower_no_story_side_effects だけ）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, events } from './helpers.mjs';
import { openRpg, readSave, writeSave, saveWith, battleAnswer, winTowerFloor, startTower } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 90_000 }, async () => {
  const app = await openRpg(browser, { seed: 1, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});

const text = (page, sel) => page.locator(sel).innerText();
const state = page => page.evaluate(() => RPG_BATTLE.state());
const pick = (o, want) => Object.fromEntries(Object.keys(want).map(k => [k, o[k]]));
// 地図喰いを倒したセーブ（ストーリーは読んだことにして、章の終わりの dialog を出さない）。Lv 30 なら低い階は2回まちがえても負けない
const OPEN = f => saveWith({ lv: 30, floors: { world: 5 }, story: ['ch1'], ...f });
// 塔の終わりの画面まで、まちがえ続ける
const loseFloor = async page => {
  while ((await state(page)).phase !== 'end') await battleAnswer(page, false);
};
// 階クリアの画面で［つぎの階へ］→ すぐ問題（「あらわれた」画面は出さない）
const nextFloor = async page => {
  await page.click('#bt-tnext');
  await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
};

t('tower_locked_until_world', async page => {
  await writeSave(page, saveWith({ lv: 30, floors: { world: 4 } }));
  await page.evaluate(() => show('rpg'));
  const s = await text(page, '#rpg-tower');
  assert.ok(s.includes('英雄の塔') && s.includes('地図喰いをたおすと開く'), s);
  assert.equal(await page.locator('#rpg-tower button').isDisabled(), true);
  assert.deepEqual(await page.evaluate(() => [RPG_BATTLE.startTower(), RPG_BATTLE.debugTower(1)]), [false, false]);
  assert.equal(await page.isVisible('#scr-battle'), false);
  // 開いたら「自己ベスト」と［挑戦］
  await writeSave(page, OPEN({ tower: { best: 7 } }));
  await page.evaluate(() => show('rpg'));
  const s2 = await text(page, '#rpg-tower');
  assert.ok(s2.includes('🗼') && s2.includes('自己ベスト 7階') && !s2.includes('地図喰い'), s2);
  assert.equal(await page.locator('#rpg-tower button').isDisabled(), false);
});

t('tower_first_floor', async page => {
  await writeSave(page, OPEN({}));
  await page.evaluate(() => show('rpg'));
  await page.click('#rpg-tower button');
  assert.equal(await page.isVisible('#scr-battle'), true);
  assert.equal((await state(page)).phase, 'intro');
  assert.ok((await text(page, '.rpg-bwhere')).includes('英雄の塔 1階'));
  await page.click('#bt-fight');
  await winTowerFloor(page);
  const st = await state(page);
  assert.equal(st.phase, 'tclear');
  assert.deepEqual(pick(st.tower, { f: 0, cleared: 0 }), { f: 1, cleared: 1 });
  const s = await text(page, '#bt-tclear');
  for (const x of ['1階クリア！', '+6', 'はじめて勝った階 +20']) assert.ok(s.includes(x), `${x} が無い: ${s}`);
  const d = await readSave(page);
  assert.deepEqual([d.coins, d.tower, d.st.win, d.floors], [26, { best: 1 }, 1, { world: 5 }]);
  assert.deepEqual((await events(page, 'rpg:tower')).map(e => pick(e, { floor: 0, win: 0, best: 0, newBest: 0, coins: 0 })),
    [{ floor: 1, win: true, best: 1, newBest: true, coins: 26 }]);
  const b = await events(page, 'rpg:battle');
  assert.deepEqual(b.map(e => pick(e, { dungeon: 0, floor: 0, boss: 0, win: 0 })), [{ dungeon: 'tower', floor: 1, boss: false, win: true }]);
  assert.deepEqual((await events(page, 'rpg:coins')).map(e => pick(e, { delta: 0, reason: 0 })), [{ delta: 26, reason: 'tower' }]);
  assert.equal((await events(page, 'rpg:clear')).length, 0);
  assert.equal((await events(page, 'rpg:tower-end')).length, 0);
});

t('tower_hp_carries', async page => {
  await writeSave(page, OPEN({}));
  await startTower(page);
  await battleAnswer(page, false);
  await battleAnswer(page, false);
  const s1 = await state(page);
  assert.ok(s1.tower.hp < s1.tower.maxHp, JSON.stringify(s1.tower));
  await winTowerFloor(page);
  await nextFloor(page);
  const s2 = await state(page);
  const want = await page.evaluate(([hp, max]) => RPG_CORE.towerHeal(hp, max, 1), [s1.tower.hp, s1.tower.maxHp]);
  assert.deepEqual(pick(s2.tower, { f: 0, hp: 0, maxHp: 0, cleared: 0 }), { f: 2, hp: want, maxHp: s1.tower.maxHp, cleared: 1 });
  assert.ok((await text(page, '.rpg-bwhere')).includes('英雄の塔 2階'));
  assert.equal(+await page.getAttribute('#bt-hhp', 'aria-valuenow'), want);
});

// 階を勝ったときに仲間が増えて（おまかせ編成）最大 HP が上がったら、回復も画面も新しい最大 HP で
t('tower_heal_uses_next_max', async page => {
  await writeSave(page, OPEN({}));
  await startTower(page);
  await battleAnswer(page, false);
  await battleAnswer(page, false);
  const s1 = await state(page);
  // この階の精算で仲間入りが起きたことにする（★3 のカードが1枚増える）
  await page.evaluate(() => {
    const orig = RPG_CORE.settleRun;
    RPG_CORE.settleRun = (d, ...a) => { const r = orig(d, ...a); d.cards.jp = [3, 0]; return r; };
  });
  await winTowerFloor(page);
  const max2 = await page.evaluate(() => RPG_CORE.towerStats(RPG.get()).hp);
  assert.ok(max2 > s1.tower.maxHp, `${max2} > ${s1.tower.maxHp}`);
  const want = await page.evaluate(([hp, max]) => RPG_CORE.towerHeal(hp, max, 1), [s1.tower.hp, max2]);
  assert.ok((await text(page, '#bt-tclear')).includes(`HP ${want}/${max2}`), await text(page, '#bt-tclear'));
  // 上の列の HP バーも、つぎの階の最大 HP で
  assert.equal(await page.getAttribute('#bt-hhp', 'aria-valuemax'), String(max2));
  assert.equal(await page.getAttribute('#bt-hhp', 'aria-valuenow'), String(want));
  await nextFloor(page);
  const s2 = await state(page);
  assert.deepEqual(pick(s2.tower, { f: 0, hp: 0, maxHp: 0 }), { f: 2, hp: want, maxHp: max2 });
});

t('tower_midboss_full_heal', async page => {
  await writeSave(page, OPEN({}));
  assert.equal(await page.evaluate(() => RPG_BATTLE.debugTower(10, 1)), true);
  await page.click('#bt-fight');
  await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
  const s = await state(page);
  assert.deepEqual(pick(s.tower, { f: 0, hp: 0, cleared: 0 }), { f: 10, hp: 1, cleared: 9 });
  assert.equal(await page.locator('#bt-flags .rpg-cloth').count(), 6);
  assert.ok((await text(page, '.rpg-btop')).includes('塔の番人'));
  // この階で仲間入り → 最大 HP が上がる。全回復は上がった最大 HP まで、上の列のバーも同じ
  await page.evaluate(() => {
    const orig = RPG_CORE.settleRun;
    RPG_CORE.settleRun = (d, ...a) => { const r = orig(d, ...a); d.cards.jp = [3, 0]; return r; };
  });
  await winTowerFloor(page);
  const max2 = await page.evaluate(() => RPG_CORE.towerStats(RPG.get()).hp);
  assert.ok(max2 > s.tower.maxHp, `${max2} > ${s.tower.maxHp}`);
  assert.ok((await text(page, '#bt-tclear')).includes(`HP ${max2}/${max2}`), await text(page, '#bt-tclear'));
  assert.equal(await page.getAttribute('#bt-hhp', 'aria-valuemax'), String(max2));
  assert.equal(await page.getAttribute('#bt-hhp', 'aria-valuenow'), String(max2));
  await nextFloor(page);
  const s2 = await state(page);
  assert.equal(s2.tower.f, 11);
  assert.equal(s2.tower.hp, s2.tower.maxHp);
});

t('tower_lose_ends_run', async page => {
  // Lv 1 なら4階で負けられる（通しで）
  await writeSave(page, saveWith({ lv: 1, floors: { world: 5 }, story: ['ch1'] }));
  await startTower(page);
  for (let f = 1; f <= 3; f++) {
    await winTowerFloor(page);
    await nextFloor(page);
  }
  assert.equal((await state(page)).tower.f, 4);
  await loseFloor(page);
  const s = await text(page, '#bt-end');
  assert.ok(s.includes('英雄の塔 3階まで（自己ベスト 3階）'), s);
  assert.equal((await readSave(page)).tower.best, 3);
  assert.deepEqual((await events(page, 'rpg:tower-end')).map(e => pick(e, { cleared: 0, best: 0 })), [{ cleared: 3, best: 3 }]);
  const last = (await events(page, 'rpg:tower')).at(-1);
  assert.deepEqual(pick(last, { floor: 0, win: 0, best: 0, newBest: 0, coins: 0 }), { floor: 4, win: false, best: 3, newBest: false, coins: 0 });
  const d = await readSave(page);
  assert.deepEqual([d.st.win, d.st.lose], [3, 1]);
  // 別の回: 1階で負け → 「1階でたおれた」、best は変わらない
  await page.click('#bt-tretry');
  assert.equal((await state(page)).phase, 'intro');
  await page.click('#bt-fight');
  await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
  await loseFloor(page);
  const s2 = await text(page, '#bt-end');
  assert.ok(s2.includes('英雄の塔 1階でたおれた（自己ベスト 3階）'), s2);
  assert.equal((await readSave(page)).tower.best, 3);
  assert.deepEqual((await events(page, 'rpg:tower-end')).at(-1), { type: 'rpg:tower-end', cleared: 0, best: 3 });
});

t('tower_quit_keeps_best', async page => {
  await writeSave(page, OPEN({}));
  await startTower(page);
  for (let f = 1; f <= 3; f++) {
    await winTowerFloor(page);
    if (f < 3) await nextFloor(page);
  }
  await page.click('#bt-tquit');
  assert.equal((await state(page)).phase, 'end');
  assert.ok((await text(page, '#bt-end')).includes('英雄の塔 3階まで（自己ベスト 3階）'));
  let d = await readSave(page);
  assert.equal(d.tower.best, 3);
  assert.equal(d.coins, 26 + 27 + 28);
  assert.deepEqual((await events(page, 'rpg:tower-end')).map(e => pick(e, { cleared: 0, best: 0 })), [{ cleared: 3, best: 3 }]);
  // もう一度は1階から。勝ってもボーナスなし（+6 だけ）
  await page.click('#bt-tretry');
  assert.equal((await state(page)).tower.f, 1);
  await page.click('#bt-fight');
  await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
  await winTowerFloor(page);
  d = await readSave(page);
  assert.deepEqual([d.coins, d.tower.best], [26 + 27 + 28 + 6, 3]);
  const s = await text(page, '#bt-tclear');
  assert.ok(s.includes('+6') && !s.includes('はじめて勝った階'), s);
  assert.deepEqual(pick((await events(page, 'rpg:tower')).at(-1), { floor: 0, best: 0, newBest: 0, coins: 0 }), { floor: 1, best: 3, newBest: false, coins: 6 });
});

t('tower_reload_keeps_best', async page => {
  await writeSave(page, OPEN({}));
  await startTower(page);
  await winTowerFloor(page);
  await nextFloor(page);
  await winTowerFloor(page);
  await nextFloor(page);
  assert.equal((await state(page)).tower.f, 3);
  await page.reload();
  await page.waitForFunction(() => document.readyState === 'complete');
  const d = await readSave(page);
  assert.deepEqual([d.tower.best, d.coins], [2, 26 + 27]);
  assert.equal(await page.evaluate(() => RPG_BATTLE.state().tower), null);
});

t('tower_similar_from_21', async page => {
  await writeSave(page, OPEN({ lv: 60 }));
  const sims = async f => {
    assert.equal(await page.evaluate(f => RPG_BATTLE.debugTower(f), f), true);
    await page.click('#bt-fight');
    await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
    const out = [];
    for (let i = 0; i < 12; i++) {
      out.push(await page.evaluate(() => { const s = RPG_BATTLE.state(); RPG_BATTLE.force(RPG_BATTLE.cur(), s.mode); return RPG_BATTLE.state().similar; }));
    }
    return out;
  };
  const s21 = await sims(21);
  assert.ok(s21.some(Boolean), JSON.stringify(s21));
  assert.ok(s21.some(x => !x), JSON.stringify(s21));
  assert.equal((await sims(20)).some(Boolean), false);
});

t('tower_no_story_side_effects', async page => {
  // Lv 15 で 20階（推奨 Lv20 の中ボス）を無傷で勝つ。ストーリーなら「無傷の勝利」「知識こそ力」が取れる条件
  await writeSave(page, saveWith({ lv: 15, floors: { world: 5 }, story: ['ch1'], gauge: { 'world:1': 1 },
    st: { win: 0, lose: 0, flee: 0, combo: 0, nodmg: 0, bossWins: 0, overcome: 0, bountyDays: 0 } }));
  assert.equal(await page.evaluate(() => RPG_BATTLE.debugTower(20)), true);
  await page.click('#bt-fight');
  await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
  await winTowerFloor(page);
  assert.equal((await state(page)).phase, 'tclear');
  const d = await readSave(page);
  assert.deepEqual(pick(d.st, { win: 0, nodmg: 0, bossWins: 0, combo: 0 }), { win: 1, nodmg: 0, bossWins: 0, combo: 0 });
  assert.deepEqual([d.floors, d.gauge], [{ world: 5 }, { 'world:1': 1 }]);
  assert.equal((await events(page, 'rpg:clear')).length, 0);
  const b = (await events(page, 'rpg:battle'))[0];
  assert.deepEqual(pick(b, { dungeon: 0, floor: 0, boss: 0, win: 0, mistakes: 0 }), { dungeon: 'tower', floor: 20, boss: true, win: true, mistakes: 0 });
  const got = await page.evaluate(() => JSON.parse(localStorage.getItem('badges') || '{}').got || {});
  for (const id of ['rpg-nodmg@1', 'rpg-underdog@1']) assert.equal(got[id], undefined, `${id} が取れてしまった`);
  assert.equal(typeof got['rpg-first-win@1'], 'number');   // 初勝利は今のまま数える
}, { blockScripts: [] });

// 2階から先と［もう一度］（バトル画面のまま始まる）でも、badges.js はバトル中としてトーストを消して保留する（rpg:tower-floor）
t('tower_floor_holds_badge_toasts', async page => {
  const bdg = () => page.locator('#toasts [data-bdg-toast]').count();
  await writeSave(page, saveWith({ lv: 30, floors: { world: 5 }, story: ['ch1'],
    st: { win: 0, lose: 0, flee: 0, combo: 0, nodmg: 0, bossWins: 0, overcome: 0, bountyDays: 0 } }));
  await page.evaluate(() => { localStorage.removeItem('badges'); });
  await startTower(page);
  await winTowerFloor(page);
  await page.waitForFunction(() => document.querySelectorAll('#toasts [data-bdg-toast]').length > 0);   // 初勝利のトースト
  await nextFloor(page);
  assert.equal(await bdg(), 0, '2階を始めたら消える');
  // 2階のあいだに来たお知らせは保留（階を終えるまで出さない）
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('rpg:levelup', { detail: { lv: 99 } })));
  await page.waitForTimeout(300);
  assert.equal(await bdg(), 0, '2階のあいだは出さない');
  assert.deepEqual((await events(page, 'rpg:tower-floor')).map(e => e.floor), [1, 2]);
  await loseFloor(page);
  await page.click('#bt-tretry');
  assert.deepEqual((await events(page, 'rpg:tower-floor')).map(e => e.floor), [1, 2, 1]);
  assert.equal(await bdg(), 0, '［もう一度］で消える');
}, { blockScripts: [] });

// スマホ幅（360px）でも、終わりの画面の「（自己ベスト 12階）」が数字と「階」のあいだで折り返さない
t('tower_end_best_nowrap_360', async page => {
  await page.setViewportSize({ width: 360, height: 740 });
  await writeSave(page, saveWith({ lv: 1, floors: { world: 5 }, story: ['ch1'], tower: { best: 12 } }));
  await startTower(page);
  await loseFloor(page);
  const r = await page.evaluate(() => {
    const x = document.querySelector('#bt-end .rpg-bend-x');
    const w = document.createTreeWalker(x, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const i = n.data.indexOf('自己ベスト 12階');
      if (i < 0) continue;
      const rg = document.createRange();
      rg.setStart(n, i); rg.setEnd(n, i + '自己ベスト 12階'.length);
      return { lines: new Set([...rg.getClientRects()].map(c => Math.round(c.top))).size, text: x.innerText };
    }
    return { lines: -1, text: x.innerText };
  });
  assert.equal(r.lines, 1, JSON.stringify(r));
});
