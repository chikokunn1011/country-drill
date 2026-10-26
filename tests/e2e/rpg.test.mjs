// 国旗クエスト（rpg.js）の土台: セーブ（壊れた・新しい版・保存できない）、クイズのコイン（#pcoin・受け取り・途中の受け取り）、結果のパネル、バッジの支払い
// どのテストも badges.js を止めて開く（openRpg）。コインの額を確かめるテストは、最初に writeSave(page, saveWith({intro:false})) してから始める
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, pickSetup, answerCorrect, answerWrong, clearTimeAttack, clearByAnswering, events } from './helpers.mjs';
import { RPG_FILES, openRpg, toastTexts, readSave, writeSave, saveWith, localToday, playPractice, forceNext } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで開いて fn を実行する。最後にページの例外と、[rpg] で始まる console.error が無いことを見る
// （opts.rpgErrorOk で console.error の確認だけ外せる。ほかの opts は openRpg にそのまま渡す）
const t = (name, fn, { rpgErrorOk = false, ...opts } = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openRpg(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    if (!rpgErrorOk) assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});

// 結果のパネルの行（見出し・<li>・下の行・ボタン）の文字
const resLines = page => page.$$eval('#rpg-res > *', els => els.flatMap(el => el.tagName === 'UL' ? [...el.children].map(li => li.textContent.trim()) : [el.textContent.trim()]));
const num = s => +s.replaceAll(',', '');
const headNum = lines => num(lines[0].match(/\+([\d,]+) コイン/)[1]);
const coins = async page => (await readSave(page)).coins;
const pcoin = page => page.evaluate(() => $('pcoin')?.textContent ?? null);
// 出たトーストのうち text をふくむものの数
const toastCount = async (page, text) => (await toastTexts(page)).filter(s => s.includes(text)).length;
const waitToast = (page, text) => page.waitForFunction(text => window.__toasts.some(s => s.includes(text)), text);
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const brokenKeys = page => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('rpg-broken-')));
const startPractice = async (page, count = 5) => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count });
  await page.click('#start');
};
const startTa = async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'ta', region: 'all', count: 5 });
  await page.click('#start');
};
const FIRST_COIN = 'コインがたまったよ！ 冒険でレベルアップやガチャに使えるよ';
const BROKEN = 'データを読めなかったので最初からになったよ';
const MEMORY_INIT = () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); };

t('rpg_loaded', async page => {
  assert.deepEqual(await page.evaluate(() => [typeof RPG_CORE, typeof RPG.tx, RPG.status]), ['object', 'function', 'ok']);
  assert.deepEqual(await page.evaluate(() => window.__ready), { intro: false, lv: 1, coins: 0, owned: 0 });
}, { init: () => { document.addEventListener('rpg:ready', e => { window.__ready = e.detail; }); } });

t('practice_receipt', async page => {
  await writeSave(page, saveWith({ intro: false }));
  await playPractice(page, { count: 10, wrong: [0, 1] });
  const lines = await resLines(page);
  assert.match(lines[0], /\+406 コイン/);
  for (const l of ['一発正解 8問 …… 80', 'やり直しで正解 2問 …… 6', 'クリアボーナス …… 20', 'はじめて正解 10か国 …… 200', '🎁 今日はじめてのクリア +100 ／ 無料ガチャ1回ゲット'])
    assert.ok(lines.includes(l), `${l} が無い: ${JSON.stringify(lines)}`);
  // 見出しの数 = 行の数の合計
  const rows = lines.filter(l => l.includes('……')).reduce((s, l) => s + num(l.split('…… ')[1]), 0);
  const gifts = lines.filter(l => l.startsWith('🎁')).reduce((s, l) => s + num(l.match(/\+([\d,]+)/)[1]), 0);
  assert.equal(headNum(lines), rows + gifts);
  assert.equal(await coins(page), 406);
  await page.reload();
  const s = await readSave(page);
  assert.equal(s.coins, 406);
  assert.equal(s.day.first, true);
});

t('daily_once', async page => {
  await writeSave(page, saveWith({ intro: false }));
  await playPractice(page);
  assert.ok((await resLines(page)).some(l => l.startsWith('🎁')));
  await playPractice(page);
  assert.deepEqual((await resLines(page)).filter(l => l.startsWith('🎁')), []);
});

t('pcoin_counts', async page => {
  await writeSave(page, saveWith({ intro: false }));
  await startPractice(page);
  assert.match(await pcoin(page), /^\+0 ?$/);
  await answerCorrect(page);
  await page.waitForFunction(() => /^\+30 /.test($('pcoin').textContent));
  assert.match(await pcoin(page), /はじめて！\+20/);
  await page.click('#next');
  await answerCorrect(page);
  await page.waitForFunction(() => /^\+60 /.test($('pcoin').textContent));
  assert.match(await pcoin(page), /はじめて！\+20/); // 2か国目
  // 全部の国でもう +20 をもらっていて、今日もう3回ずつもらっている → 4回目は ×0.5
  const all = await page.evaluate(() => C.map(c => c.a));
  await writeSave(page, saveWith({ fe: Object.fromEntries(all.map(a => [a, 15])), day: { d: localToday(), n: Object.fromEntries(all.map(a => [a, 3])), first: true, free: false } }));
  await startPractice(page);
  await answerCorrect(page);
  await page.waitForFunction(() => /^\+5 /.test($('pcoin').textContent));
  assert.match(await pcoin(page), /×0\.5/);
  assert.doesNotMatch(await pcoin(page), /はじめて/);
});

t('first_coin_toast', async page => {
  await writeSave(page, saveWith({ intro: false }));
  await startPractice(page);
  await answerCorrect(page);
  await waitToast(page, FIRST_COIN);
  await page.click('#next');
  await answerCorrect(page);
  await frames(page);
  assert.equal(await toastCount(page, FIRST_COIN), 1);
  await page.click('#next');
  await clearByAnswering(page);
  await playPractice(page);
  assert.equal(await toastCount(page, FIRST_COIN), 1); // 2ゲーム目では出ない
});

t('ta_fail_toast', async page => {
  await writeSave(page, saveWith({ intro: false }));
  await startTa(page);
  await answerCorrect(page);
  await answerCorrect(page);
  await answerWrong(page);
  await waitToast(page, '+50 コイン'); // 5×2 ＋ はじめて 20×2
  assert.equal(await coins(page), 50);
});

t('quit_pays', async page => {
  await writeSave(page, saveWith({ intro: false }));
  await startPractice(page);
  await answerCorrect(page);
  await page.click('#next');
  await answerCorrect(page);
  await page.click('#quit');
  await waitToast(page, '+60 コイン');
  assert.equal(await coins(page), 60);
});

t('visibility_then_result', async page => {
  await writeSave(page, saveWith({ intro: false }));
  await startPractice(page);
  await answerCorrect(page);
  await page.click('#next');
  await answerCorrect(page);
  await page.click('#next');
  const setVisibility = v => page.evaluate(v => {
    Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, v);
  await setVisibility('hidden');
  assert.equal(await coins(page), 60);
  await setVisibility('visible');
  await clearByAnswering(page);
  assert.equal(headNum(await resLines(page)), 275); // 50 + はじめて 100 + クリア 25 + 今日はじめて 100
  assert.equal(await coins(page), 275);
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pagehide')); });
  assert.equal(await coins(page), 275);
});

t('overcome_needs_new_game', async page => {
  await writeSave(page, saveWith({ intro: false }));
  await startPractice(page);
  const a = await page.evaluate(() => G.cur.c.a);
  await answerWrong(page);
  await page.click('#next');
  await clearByAnswering(page); // a は後ろでもう一度出て、やり直しで正解
  assert.deepEqual((await resLines(page)).filter(l => l.includes('克服')), []);
  assert.equal((await readSave(page)).wk[a], 1);
  await startPractice(page);
  await forceNext(page, a);
  await answerCorrect(page);
  await page.click('#next');
  await clearByAnswering(page);
  const name = await page.evaluate(a => byA.get(a).n, a);
  assert.ok((await resLines(page)).includes(`✨ 克服！ ${name}はもう苦手じゃない +30`), JSON.stringify(await resLines(page)));
});

t('misses_reset_clears_wk', async page => {
  await startPractice(page);
  await answerWrong(page);
  await page.click('#quit');
  assert.equal(Object.keys((await readSave(page)).wk).length, 1);
  await page.click('#to-settings');
  await page.click('#set-reset');
  assert.deepEqual((await readSave(page)).wk, {});
});

t('answer_listener_no_storage', async page => {
  await startTa(page);
  await frames(page); // drill:start の tx が予約した RPG.refresh() が終わるのを待つ
  await page.waitForTimeout(100);
  await page.evaluate(() => { window.__rpgIO = 0; });
  for (let i = 0; i < 4; i++) await answerCorrect(page);
  assert.equal(await page.evaluate(() => window.__rpgIO), 0);
  await answerCorrect(page);
  await page.locator('#scr-result').waitFor();
  assert.ok(await page.evaluate(() => window.__rpgIO) >= 1);
}, {
  init: () => {
    const { getItem, setItem } = Storage.prototype;
    window.__rpgIO = 0;
    Storage.prototype.getItem = function (k) { if (k === 'rpg') window.__rpgIO++; return getItem.call(this, k); };
    Storage.prototype.setItem = function (k, v) { if (k === 'rpg') window.__rpgIO++; return setItem.call(this, k, v); };
  },
});

t('ta_clear_zeroed_and_paid', async page => {
  await writeSave(page, saveWith({ intro: false }));
  await clearTimeAttack(page); // 5問を約1.25秒（5 × 400ms より速い）
  let lines = await resLines(page);
  assert.ok(lines.includes('タイムが速すぎたので、この回のコインはなし'), JSON.stringify(lines));
  assert.equal(await coins(page), 0);
  assert.deepEqual(lines.filter(l => l.startsWith('🎁')), []);
  await writeSave(page, saveWith({ intro: false }));
  await startTa(page);
  for (let i = 0; i < 5; i++) { await page.waitForTimeout(450); await answerCorrect(page); }
  await page.locator('#scr-result').waitFor();
  lines = await resLines(page);
  assert.deepEqual(lines.filter(l => l.includes('速すぎた')), []);
  for (const l of ['正解 5問 …… 25', 'クリアボーナス …… 15']) assert.ok(lines.includes(l), `${l} が無い: ${JSON.stringify(lines)}`);
  assert.equal(await coins(page), headNum(lines));
});

t('future_version_read_only', async page => {
  await writeSave(page, { v: 99, coins: 777, intro: true });
  await waitToast(page, '新しいバージョンのデータが見つかったよ。ページを再読み込みしてね');
  const before = await page.evaluate(() => localStorage.getItem('rpg'));
  await playPractice(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('rpg')), before);
  assert.equal(await page.locator('#rpg-res').count(), 0);
});

t('broken_json_backup', async page => {
  await writeSave(page, '{bad');
  await waitToast(page, BROKEN);
  await playPractice(page);
  const vals = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('rpg-broken-')).map(k => localStorage.getItem(k)));
  assert.deepEqual(vals, ['{bad']);
  const s = await readSave(page);
  assert.equal(s.v, 1);
  assert.ok(s.coins > 0);
  for (let i = 0; i < 4; i++) await writeSave(page, '{bad');
  assert.equal((await brokenKeys(page)).length, 3);
});

t('missing_v_rescued', async page => {
  await writeSave(page, { coins: 500, intro: true, bounty: { d: localToday(), a: [], done: [] } });
  assert.equal((await readSave(page)).v, 1);
  assert.equal((await brokenKeys(page)).length, 1);
  await page.evaluate(() => { RPG.get(); RPG.get(); RPG.refresh(); });
  assert.equal((await brokenKeys(page)).length, 1);
  await playPractice(page);
  assert.equal(await coins(page), 500 + headNum(await resLines(page)));
  assert.equal((await brokenKeys(page)).length, 1);
  assert.equal(await toastCount(page, BROKEN), 1);
  // 古い版（v0）は救えないので、写してから新しく始める
  await writeSave(page, { v: 0, coins: 500 });
  assert.equal((await brokenKeys(page)).length, 2);
  await playPractice(page);
  assert.equal(await coins(page), headNum(await resLines(page)));
});

t('storage_blocked_memory', async page => {
  assert.equal(await page.evaluate(() => RPG.status), 'memory');
  await playPractice(page);
  assert.ok(headNum(await resLines(page)) > 0);
}, { init: MEMORY_INIT });

t('quota_toast_once', async page => {
  await playPractice(page);
  await playPractice(page);
  assert.equal(await page.isVisible('#scr-result'), true);
  assert.equal(await toastCount(page, '保存できなかった…'), 1);
}, {
  init: () => {
    const { setItem } = Storage.prototype;
    Storage.prototype.setItem = function (k, v) { if (k === 'rpg') throw new DOMException('full', 'QuotaExceededError'); return setItem.call(this, k, v); };
  },
});

t('works_without_rpg', async (page, app) => {
  // rpg-core.js が無い → rpg.js は [rpg] の console.error を出して何もしない
  for (let i = 0; i < 100 && !app.consoleErrors.some(s => s.startsWith('[rpg]')); i++) await new Promise(ok => setTimeout(ok, 20));
  assert.ok(app.consoleErrors.some(s => s.startsWith('[rpg]')), JSON.stringify(app.consoleErrors));
  await playPractice(page);
  assert.equal(await page.locator('#pcoin').count(), 0);
  // RPG のファイルが全部無い
  const bare = await openRpg(browser, { blockScripts: RPG_FILES });
  try {
    const p = bare.page;
    assert.equal(await p.evaluate(() => typeof RPG), 'undefined');
    await playPractice(p);
    assert.equal(await p.locator('#pcoin').count(), 0);
    await clearTimeAttack(p);
    await p.fill('#ta-name', 'チコ');
    await p.click('#ta-submit');
    await p.locator('#ta-msg', { hasText: '載せたよ！' }).waitFor();
    assert.deepEqual(bare.errors.map(String), []);
    assert.deepEqual(bare.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await bare.close(); }
}, { blockScripts: ['rpg-core.js'], rpgErrorOk: true });

t('rpg_off_hides', async page => {
  await writeSave(page, saveWith({ show: false }));
  await startPractice(page);
  await answerCorrect(page);
  await frames(page);
  assert.equal(await page.locator('#pcoin').count(), 0);
  await page.click('#next');
  await clearByAnswering(page);
  assert.equal(await page.locator('#pcoin').count(), 0);
  assert.equal(await page.evaluate(() => $('r-ext').childNodes.length), 0);
  assert.deepEqual((await toastTexts(page)).filter(s => s.includes('コイン')), []);
  assert.ok(await coins(page) > 0);
});

t('badge_payment', async page => {
  const fire = (p, id) => p.evaluate(id => {
    const ev = new CustomEvent('badge:earned', { detail: { id, badge: 'reg-asia', tier: 1, title: '', color: 1, retro: false } });
    document.dispatchEvent(ev);
    return ev.detail.paid;
  }, id);
  await writeSave(page, saveWith({ coins: 0 }));
  assert.equal(await fire(page, 'reg-asia@1'), 50);
  let s = await readSave(page);
  assert.deepEqual([s.coins, s.earned, s.badgesPaid], [50, 50, ['reg-asia@1']]);
  const last = (await events(page, 'rpg:coins')).at(-1);
  assert.deepEqual([last.delta, last.reason], [50, 'badge']);
  assert.deepEqual(await toastTexts(page), []);
  assert.equal(await fire(page, 'reg-asia@1'), 0); // もう払ってある
  assert.equal(await coins(page), 50);
  await writeSave(page, { v: 99, intro: true }); // 新しい版のデータ → 払えない
  assert.equal(await fire(page, 'reg-asia@1'), false);
  // 保存できない端末 → 払えない
  const mem = await openRpg(browser, { init: MEMORY_INIT });
  try {
    assert.equal(await mem.page.evaluate(() => RPG.get().coins), 0);
    assert.equal(await fire(mem.page, 'reg-asia@1'), false);
    assert.equal(await mem.page.evaluate(() => RPG.get().coins), 0);
    assert.deepEqual(mem.errors.map(String), []);
  } finally { await mem.close(); }
});
