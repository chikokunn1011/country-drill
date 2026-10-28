// 管理ページ（admin.html）の「端末」タブ: この端末のセーブ（localStorage）を見る・書きかえる・バックアップ・スナップショット・冒険・今日の難問
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, PHONE, PC } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { path: 'admin.html', ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
// 端末タブの区画（<details>）を開く
const open = (page, id) => page.evaluate(id => { document.getElementById(id).open = true; }, id);
const ls = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
const coins = async page => JSON.parse(await ls(page, 'rpg')).coins;
const acceptDialogs = page => page.on('dialog', d => d.accept());
const RPG = { v: 1, coins: 500, lv: 3 };

t('device_tab_lists_saves', async page => {
  assert.equal(await page.isVisible('#tab-device'), true);
  assert.equal(await page.isHidden('#tab-rank'), true);
  assert.equal(await page.isHidden('#tab-log'), true);
  assert.equal((await page.textContent('#adm-who')).trim(), 'ログインしてない');
  await open(page, 'd-saves');
  const list = await page.textContent('#d-saves');
  assert.match(list, /settings/);
  assert.match(list, /rpg/);
  // タブを切りかえる
  await page.click('#adm-tabs [data-tab="log"]');
  assert.equal(await page.isVisible('#tab-log'), true);
  assert.equal(await page.isHidden('#tab-device'), true);
}, { storage: { settings: { theme: 'light', sound: true }, rpg: RPG } });

t('edit_json_saves_and_rejects_broken', async page => {
  acceptDialogs(page);   // 今あるキーの保存は危ない操作（確かめてスナップショット）
  await open(page, 'd-saves');
  await page.click('#d-saves [data-key="settings"]');
  assert.match(await page.inputValue('#d-json'), /"vol": 30/);
  const before = await ls(page, 'settings');
  await page.fill('#d-json', '{');
  await page.click('#d-json-save');
  await page.locator('#adm-toast', { hasText: 'JSONが壊れてる' }).waitFor();
  assert.equal(await ls(page, 'settings'), before);
  // ちゃんとした JSON は保存できる
  await page.fill('#d-json', '{"vol": 10}');
  await page.click('#d-json-save');
  assert.deepEqual(JSON.parse(await ls(page, 'settings')), { vol: 10 });
  // 壊れた JSON のときは確かめる前にやめるので、自動のスナップショットは保存した1回分だけ
  assert.equal(JSON.parse(await ls(page, 'adminSnaps')).length, 1);
}, { storage: { settings: { vol: 30 } } });

t('rpg_coins_and_unlock', async page => {
  acceptDialogs(page);
  await open(page, 'd-rpg');
  await page.click('#d-rpg [data-coins="10000"]');
  assert.equal(await coins(page), 10500);
  await page.click('#d-rpg-unlock');
  const { floors } = JSON.parse(await ls(page, 'rpg'));
  const ids = await page.evaluate(() => RPG_CORE.DUNGEONS.map(g => g.id));
  for (const id of ids) assert.ok(floors[id] >= 4, `${id}: ${floors[id]}`);
  // ダンジョンの select も書きかわっている
  assert.equal(await page.inputValue(`#d-rpg select[data-floor="${ids[0]}"]`), '4');
}, { storage: { rpg: RPG } });

t('backup_download_name', async page => {
  await open(page, 'd-backup');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#d-dl')]);
  assert.match(dl.suggestedFilename(), /^country-drill-save-\d{8}\.json$/);
  const body = JSON.parse(await new Promise((ok, ng) => { const cs = []; dl.createReadStream().then(s => s.on('data', c => cs.push(c)).on('end', () => ok(Buffer.concat(cs).toString())).on('error', ng)); }));
  assert.equal(body.app, 'country-drill');
  assert.equal(JSON.parse(body.data.rpg).coins, 500);
}, { storage: { rpg: RPG } });

t('daily_answers_table', async page => {
  await open(page, 'd-daily');
  assert.equal(await page.locator('#d-daily tbody tr').count(), 20);
  // 日付を変えると問題が変わる（同じ日なら daily-core と同じ）
  await page.fill('#d-daily-day', '2026-01-01');
  await page.dispatchEvent('#d-daily-day', 'change');
  const first = await page.evaluate(() => COUNTRIES.find(c => c.a === DAILY_CORE.build('2026-01-01', COUNTRIES)[0].a).n);
  assert.ok((await page.textContent('#d-daily tbody tr:first-child')).includes(first), first);
});

t('snap_restore', async page => {
  acceptDialogs(page);
  await open(page, 'd-snaps');
  await open(page, 'd-rpg');
  await page.fill('#d-snap-name', 'テスト前');
  await page.click('#d-snap-save');
  await page.click('#d-rpg [data-coins="1000"]');
  assert.equal(await coins(page), 1500);
  await page.click('#d-snaps [data-snap="テスト前"] [data-act="load"]');
  assert.equal(await coins(page), 500);
}, { storage: { rpg: RPG } });

t('no_horizontal_scroll_phone', async page => {
  assert.equal(await page.locator('#tab-device details').count(), 11);
  await page.evaluate(() => document.querySelectorAll('#tab-device details').forEach(d => { d.open = true; }));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390);
}, { viewport: PHONE, storage: { rpg: RPG, settings: { theme: 'dark' } } });

t('csp_present_and_noindex', async page => {
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  assert.equal(csp, "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src https://vgdkklvhtvcamtxwjpke.supabase.co; base-uri 'none'; form-action 'none'");
  assert.equal(await page.getAttribute('meta[name="robots"]', 'content'), 'noindex, nofollow');
  assert.equal(await page.locator('script:not([src])').count(), 0, 'インラインの script は無い');
  const srcs = await page.$$eval('script[src]', ss => ss.map(s => s.getAttribute('src')));
  assert.deepEqual(srcs, ['countries.js', 'daily-core.js', 'rpg-core.js', 'badges.js', 'sound.js', 'admin-save.js', 'admin-api.js', 'admin.js']);
});

t('theme_from_settings', async page => {
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(15, 23, 28)');
}, { viewport: PC, storage: { settings: { theme: 'dark' } } });

// 壊れたセーブ（badges の got が null）でも、ほかの区画はふつうに出る
t('corrupt_badges_does_not_blank_sections', async (page, app) => {
  await open(page, 'd-badges');
  assert.match(await page.textContent('#d-badges-sum'), /^0 \/ \d+ ステップ取ってる$/);
  assert.equal(await page.locator('#d-daily tbody tr').count(), 20);
  assert.equal(await page.inputValue('#d-set-theme'), 'light');
  assert.deepEqual(app.consoleErrors, []);
}, { storage: { badges: { v: 1, got: null } } });

// 1つの区画で例外が出ても、その区画にだけ1行出して、ほかは描く
t('section_error_shows_only_in_that_section', async page => {
  await open(page, 'd-badges');
  assert.match(await page.textContent('#d-badges p[data-err]'), /この区画を出せなかった（boom-badges）/);
  assert.equal(await page.locator('p[data-err]').count(), 1);
  assert.equal(await page.locator('#d-daily tbody tr').count(), 20);
  assert.ok(await page.locator('#d-keys li').count() > 0);
}, { init: () => {
  let core;
  Object.defineProperty(globalThis, 'BADGES_CORE', { configurable: true, get: () => core,
    set: v => { core = v; v.makeCatalog = () => { throw new Error('boom-badges'); }; } });
} });

// 危ない操作で confirm をやめたら、何も変えず、自動のスナップショットも取らない
t('danger_cancel_keeps_storage_and_no_snapshot', async page => {
  page.on('dialog', d => d.dismiss());
  for (const id of ['d-rpg', 'd-badges', 'd-settings', 'd-snaps']) await open(page, id);
  const before = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
  await page.click('#d-rpg-wipe');
  await page.click('#d-badges-none');
  await page.click('#d-first');
  const after = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
  assert.equal(after, before);
  assert.equal(await ls(page, 'adminSnaps'), null);
  assert.doesNotMatch(await page.textContent('#d-snap-list'), /自動/);
}, { storage: { rpg: RPG } });

// 効果音を続けて押しても（40ms のまとめで play が null を返しても）「鳴らせなかった」は出ない
t('sound_double_press_no_error_toast', async page => {
  await open(page, 'd-sound');
  const b = page.locator('#d-sound-list [data-snd]').first();
  await page.evaluate(() => { const x = document.querySelector('#d-sound-list [data-snd]'); x.click(); x.click(); });
  await b.click();
  assert.doesNotMatch(await page.textContent('#adm-toast'), /鳴らせなかった/);
});

// D8 の「答え」の列に国名も出る
t('daily_answer_column_has_country_name', async page => {
  await open(page, 'd-daily');
  await page.fill('#d-daily-day', '2026-01-01');
  await page.dispatchEvent('#d-daily-day', 'change');
  const name = await page.evaluate(() => COUNTRIES.find(c => c.a === DAILY_CORE.build('2026-01-01', COUNTRIES)[0].a).n);
  const cell = await page.textContent('#d-daily tbody tr:first-child td:last-child');
  assert.ok(cell.includes('番目') && cell.includes(name), cell);
});

t('no_console_errors_on_load', async (page, app) => {
  await page.waitForTimeout(200);
  assert.deepEqual(app.consoleErrors, []);
});

// 危ない操作の自動スナップショットが増えても、手動で取ったものは押し出されない。自動のものには「自動」と出る
t('auto_snapshots_keep_manual_one', async page => {
  acceptDialogs(page);
  for (const id of ['d-snaps', 'd-rpg', 'd-badges', 'd-settings']) await open(page, id);
  await page.fill('#d-snap-name', 'ボス前');
  await page.click('#d-snap-save');
  for (const id of ['#d-rpg-clear', '#d-badges-none', '#d-rpg-unlock', '#d-rpg-story', '#d-badges-all', '#d-rpg-wipe', '#d-first']) await page.click(id);
  const names = await page.$$eval('#d-snap-list [data-snap]', ls => ls.map(l => [l.dataset.snap, !!l.querySelector('.tag')]));
  assert.ok(names.some(([n, auto]) => n === 'ボス前' && !auto), JSON.stringify(names));
  assert.equal(names.filter(([, auto]) => auto).length, 5);
  assert.equal(names.length, 6);
  await page.click('#d-snaps [data-snap="ボス前"] [data-act="load"]');
  assert.equal(await coins(page), 500);
}, { storage: { rpg: RPG } });

// 前の版の自動スナップショット（auto の印が無く、名前が「自動 …」）にも「自動」と出る。印が無いふつうの名前は手動
t('legacy_auto_snapshot_shows_auto_tag', async page => {
  await open(page, 'd-snaps');
  await page.locator('#d-snap-list [data-snap="自動 全部開く 12:00:00"]').waitFor();
  const names = await page.$$eval('#d-snap-list [data-snap]', ls => ls.map(l => [l.dataset.snap, l.querySelector('.tag')?.textContent ?? '']));
  assert.deepEqual(names.sort(), [['自動 全部開く 12:00:00', '自動'], ['ボス前', '']].sort());
}, { storage: { adminSnaps: [{ name: 'ボス前', at: '2026-10-01T00:00:00Z', data: {} }, { name: '自動 全部開く 12:00:00', at: '2026-10-02T00:00:00Z', data: {} }] } });

// 全部取る・全部開く・ストーリー既読を消す・今あるキーの保存 も、やめたら何も変えない
t('more_overwrites_go_through_confirm', async page => {
  page.on('dialog', d => d.dismiss());
  for (const id of ['d-rpg', 'd-badges', 'd-saves']) await open(page, id);
  const dump = () => page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
  const before = await dump();
  await page.click('#d-badges-all');
  await page.click('#d-rpg-unlock');
  await page.click('#d-rpg-story');
  await page.click('#d-saves [data-key="rpg"]');
  await page.fill('#d-json', '{"v":1,"coins":1}');
  await page.click('#d-json-save');
  assert.equal(await dump(), before);
}, { storage: { rpg: { ...RPG, story: ['a'] } } });

t('badge_title_picker', async (page, app) => {
  await open(page, 'd-badges');
  const key = await page.evaluate(() => { const b = BADGES_CORE.makeCatalog(COUNTRIES)[0]; return `${b.id}@1`; });
  assert.deepEqual(await page.$$eval('#d-badges-eq option', o => o.map(x => x.textContent)), ['自動（本編が選ぶ）', 'つけない']);
  await page.check(`#d-badges-list [data-step="${key}"]`);
  assert.equal(await page.locator('#d-badges-eq option').count(), 3);
  await page.selectOption('#d-badges-eq', key);
  assert.equal(JSON.parse(await ls(page, 'badges')).eq, key);
  await page.selectOption('#d-badges-eq', '');
  assert.equal(JSON.parse(await ls(page, 'badges')).eq, '');
  assert.equal(await page.inputValue('#d-badges-eq'), '');
});

t('save_list_shows_time_only_when_save_has_one', async page => {
  await open(page, 'd-saves');
  const at = k => page.locator(`#d-keys li:has([data-key="${k}"]) [data-at]`);
  assert.equal(await at('settings').count(), 0);
  assert.equal(await at('rpg').count(), 0, 'day の無い rpg には出さない');
  assert.equal((await at('daily').textContent()).trim(), '最終 2026-10-26');
  assert.match((await at('badges').textContent()).trim(), /^最終 2026\/10\/\d+ \d\d:\d\d$/);
}, { storage: { settings: { theme: 'light' }, rpg: RPG, daily: { day: '2026-10-26', status: 'done' }, badges: { v: 1, got: { 'x@1': Date.UTC(2026, 9, 3, 3) } } } });

t('daily_reset_only_for_today', async page => {
  await open(page, 'd-daily');
  assert.equal(await page.isDisabled('#d-daily-reset'), false);
  assert.equal((await page.textContent('#d-daily-reset')).trim(), 'この端末の今日の記録を消す');
  await page.fill('#d-daily-day', '2026-01-01');
  await page.dispatchEvent('#d-daily-day', 'change');
  assert.equal(await page.isDisabled('#d-daily-reset'), true);
});

t('restore_file_label_reads_in_one_line_on_phone', async page => {
  await open(page, 'd-backup');
  const h = await page.evaluate(() => {
    const label = document.getElementById('d-file').closest('label'), r = document.createRange();
    r.selectNodeContents(label.firstChild); return r.getBoundingClientRect().height;
  });
  assert.ok(h < 30, `文字が折れている: ${h}px`);
}, { viewport: PHONE });

t('jump_links_include_ranking_and_daily', async page => {
  const hrefs = await page.$$eval('#d-jump a', as => as.map(a => a.getAttribute('href')));
  for (const h of ['./#ranking', './#daily']) assert.ok(hrefs.includes(h), h);
});

// 本編は #ranking・#daily で直接その画面を開く（D11 のリンク先）
for (const [hash, screen] of [['#ranking', 'ranking'], ['#daily', 'daily']]) {
  test(`main_page_opens_${screen}_from_hash`, { timeout: 60_000 }, async () => {
    const app = await openApp(browser, { path: hash });
    try {
      await app.page.waitForFunction(s => document.body.dataset.screen === s, screen);
      assert.equal(await app.page.isVisible(`#scr-${screen}`), true);
      assert.deepEqual(app.errors.map(String), []);
    } finally { await app.close(); }
  });
}

// スクリーンショット（端末タブ）
const SHOTS = process.env.ADMIN_SHOTS;
for (const [label, viewport] of [['phone', PHONE], ['pc', PC]]) {
  if (!SHOTS) continue;
  t(`shot_device_${label}`, async page => {
    acceptDialogs(page);
    await page.evaluate(() => document.querySelectorAll('#tab-device details').forEach(d => { d.open = true; }));
    await page.fill('#d-snap-name', 'ボス前');
    await page.click('#d-snap-save');
    await page.click('#d-rpg-clear');
    await page.evaluate(() => { document.getElementById('adm-toast').textContent = ''; });
    await page.screenshot({ path: `${SHOTS}/final-device-${label}.png`, fullPage: true });
  }, { viewport, colorScheme: 'light', storage: { rpg: RPG, settings: { theme: 'light' }, daily: { day: '2026-10-26', status: 'done', correct: 18 } } });
}

// ---- 1回目のレビューの直し ----
// D2 の欄を出したまま、ほかの操作でセーブが変わったら、欄も今の中身になる（保存しても古い中身に戻さない）
t('json_editor_follows_other_actions', async page => {
  acceptDialogs(page);
  await open(page, 'd-saves'); await open(page, 'd-rpg');
  await page.click('#d-saves [data-key="rpg"]');
  assert.match(await page.inputValue('#d-json'), /"coins": 500/);
  await page.click('#d-rpg [data-coins="10000"]');
  assert.equal(await coins(page), 10500);
  assert.match(await page.inputValue('#d-json'), /"coins": 10500/);
  await page.click('#d-json-save');
  assert.equal(await coins(page), 10500);
}, { storage: { rpg: RPG } });

// 欄を書きかえたあとでセーブが変わったら、欄はそのまま。保存のときに「変わってる」と聞いて、やめたら書かない
t('json_editor_edited_then_changed_asks_before_overwrite', async page => {
  const msgs = [];
  page.on('dialog', d => { msgs.push(d.message()); if (/変わってる/.test(d.message())) d.dismiss(); else d.accept(); });
  await open(page, 'd-saves'); await open(page, 'd-rpg');
  await page.click('#d-saves [data-key="rpg"]');
  const edited = (await page.inputValue('#d-json')).replace('"lv": 3', '"lv": 4');
  await page.fill('#d-json', edited);
  await page.click('#d-rpg [data-coins="10000"]');
  assert.equal(await page.inputValue('#d-json'), edited, '書きかけの欄は消さない');
  await page.click('#d-json-save');
  assert.ok(msgs.some(m => /変わってる/.test(m)), msgs.join('|'));
  assert.equal(await coins(page), 10500);
}, { storage: { rpg: RPG } });

t('unsaved_settings_survive_other_actions', async page => {
  acceptDialogs(page);
  await open(page, 'd-rpg'); await open(page, 'd-settings');
  await page.selectOption('#d-set-theme', 'dark');
  await page.click('#d-rpg [data-coins="1000"]');
  assert.equal(await coins(page), 1500);
  assert.equal(await page.inputValue('#d-set-theme'), 'dark', '保存していない選択を戻さない');
  await page.click('#d-set-save');
  assert.equal(JSON.parse(await ls(page, 'settings')).theme, 'dark');
}, { storage: { rpg: RPG, settings: { theme: 'light' } } });

t('delete_missing_key_does_nothing', async page => {
  let dialogs = 0;
  page.on('dialog', d => { dialogs++; d.accept(); });
  await open(page, 'd-saves');
  await page.fill('#d-key', 'nosuch');
  await page.click('#d-json-del');
  await page.locator('#adm-toast', { hasText: '見つからなかった' }).waitFor();
  assert.equal(dialogs, 0);
  assert.equal(await ls(page, 'adminSnaps'), null);
});

// 形がちがうファイル・形がちがう JSON は、確かめる前にやめる（自動のスナップショットも取らない）
t('rejected_file_or_shape_takes_no_snapshot', async page => {
  let dialogs = 0;
  page.on('dialog', d => { dialogs++; d.accept(); });
  await open(page, 'd-saves');
  const before = await ls(page, 'rpg');
  await page.setInputFiles('#d-file', { name: 'x.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'country-drill', kind: 'save', data: { rpg: 'garbage' } })) });
  await page.locator('#adm-toast', { hasText: 'セーブファイルじゃないよ' }).waitFor();
  await page.click('#d-saves [data-key="rpg"]');
  await page.fill('#d-json', '[1]');
  await page.click('#d-json-save');
  await page.locator('#adm-toast', { hasText: '本編のセーブの形じゃないよ' }).waitFor();
  await page.click('#d-saves [data-key="misses"]');
  await page.fill('#d-json', 'null');
  await page.click('#d-json-save');
  await page.locator('#adm-toast', { hasText: '本編のセーブの形じゃないよ' }).waitFor();
  assert.equal(dialogs, 0);
  assert.equal(await ls(page, 'adminSnaps'), null);
  assert.equal(await ls(page, 'rpg'), before);
  assert.equal(await ls(page, 'misses'), '{}');
}, { storage: { rpg: RPG, misses: {} } });

// D9: 国名表示（本編の setup.name）も切りかえられる。音量は本編と同じ 10〜100 の10きざみ
t('settings_name_toggle_and_game_volume_range', async page => {
  await open(page, 'd-settings');
  assert.equal(await page.isChecked('#d-set-name'), false);
  assert.deepEqual(await page.$eval('#d-set-vol', e => [e.min, e.max, e.step]), ['10', '100', '10']);
  await page.check('#d-set-name');
  await page.$eval('#d-set-vol', e => { e.value = '0'; e.dispatchEvent(new Event('input')); });
  await page.click('#d-set-save');
  assert.deepEqual(JSON.parse(await ls(page, 'setup')), { mode: 'm2f', name: true });
  assert.equal(JSON.parse(await ls(page, 'settings')).vol, 10);
}, { storage: { setup: { mode: 'm2f' } } });

// ---- 2回目のレビューの直し ----
const toastHas = (page, text) => page.locator('#adm-toast', { hasText: text }).waitFor();
const dump = page => page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));

// U1: コインの知らせは押したボタンの数ではなく、本当に変わった数と今のコイン
t('coin_toast_shows_real_change', async page => {
  await open(page, 'd-rpg');
  await page.click('#d-rpg [data-coins="-10000"]');
  await toastHas(page, 'コイン -500（いま 0）');
  assert.equal(await coins(page), 0);
  await page.click('#d-rpg [data-coins="-1000"]');
  await toastHas(page, 'コインは変わらなかった（いま 0）');
  await page.click('#d-rpg [data-coins="1000"]');
  await toastHas(page, 'コイン +1,000（いま 1,000）');
}, { storage: { rpg: RPG } });

// U2: 断られた操作（新しい版のバッジ）のあと、チェックや称号の選択を書いていない値のままにしない
t('refused_badge_edit_resets_controls', async page => {
  await open(page, 'd-badges');
  const key = await page.evaluate(() => `${BADGES_CORE.makeCatalog(COUNTRIES)[0].id}@1`);
  const before = await ls(page, 'badges');
  await page.click(`#d-badges-list [data-step="${key}"]`);
  await toastHas(page, '新しい版のセーブなので変えられないよ');
  assert.equal(await page.isChecked(`#d-badges-list [data-step="${key}"]`), false, '書けなかったチェックは戻す');
  await page.selectOption('#d-badges-eq', '');
  await toastHas(page, '新しい版のセーブなので変えられないよ');
  assert.equal(await page.inputValue('#d-badges-eq'), '\u0000auto', '書けなかった称号の選択は戻す');
  assert.equal(await ls(page, 'badges'), before);
}, { storage: { badges: { v: 99, got: {}, eq: null } } });

// U3: 冒険のセーブが壊れている・新しい版なら、そう出して、変える操作は押せない（壊れていても「冒険データを消す」は押せる）
const RPG_EDIT = ['#d-rpg [data-coins="1000"]', '#d-rpg-lv', '#d-rpg-lv-set', '#d-rpg-pity', '#d-rpg-pity-set', '#d-rpg-floors select', '#d-rpg-unlock', '#d-rpg-clear', '#d-rpg-story', '#d-rpg-card', '#d-rpg-card-give'];
t('broken_rpg_save_is_shown_and_locked', async page => {
  await open(page, 'd-rpg');
  assert.match(await page.textContent('#d-rpg-sum'), /セーブ壊れてる/);
  assert.doesNotMatch(await page.textContent('#d-rpg-sum'), /まだない/);
  // 中身は読めないので、フロアの欄は出さない（新品の値を出さない）
  assert.equal(await page.locator('#d-rpg-floors select').count(), 0);
  for (const s of RPG_EDIT.filter(s => !s.includes('floors'))) assert.equal(await page.isDisabled(s), true, s);
  assert.equal(await page.isDisabled('#d-rpg-wipe'), false, '壊れたセーブは消して直せる');
  page.on('dialog', d => d.accept());
  await page.click('#d-rpg-wipe');
  await toastHas(page, '冒険データを消したよ');
  assert.match(await page.textContent('#d-rpg-sum'), /セーブまだない/);
  assert.equal(await page.isDisabled('#d-rpg-unlock'), false);
}, { init: () => { try { localStorage.setItem('rpg', '{broken'); } catch {} } });

t('newer_rpg_save_is_shown_and_locked', async page => {
  await open(page, 'd-rpg');
  assert.match(await page.textContent('#d-rpg-sum'), /セーブ新しい版/);
  for (const s of [...RPG_EDIT, '#d-rpg-wipe']) assert.equal(await page.locator(s).first().isDisabled(), true, s);
}, { storage: { rpg: { v: 99, coins: 5 } } });

t('ok_and_missing_rpg_save_are_editable', async page => {
  await open(page, 'd-rpg');
  assert.match(await page.textContent('#d-rpg-sum'), /セーブまだない（さわると新しく作る）/);
  for (const s of [...RPG_EDIT, '#d-rpg-wipe']) assert.equal(await page.locator(s).first().isDisabled(), false, s);
  await page.click('#d-rpg [data-coins="1000"]');
  assert.match(await page.textContent('#d-rpg-sum'), /セーブあり/);
});

// U4: 同じ名前のスナップショットがあるときは、上書きしていいか聞く。やめたら前のものを残す
t('same_name_snapshot_asks_before_replacing', async page => {
  const msgs = [];
  page.on('dialog', d => { msgs.push(d.message()); d.dismiss(); });
  await open(page, 'd-snaps'); await open(page, 'd-rpg');
  await page.fill('#d-snap-name', 'ボス前');
  await page.click('#d-snap-save');
  assert.deepEqual(msgs, []);
  const first = await ls(page, 'adminSnaps');
  await page.click('#d-rpg [data-coins="1000"]');
  await page.fill('#d-snap-name', 'ボス前');
  await page.click('#d-snap-save');
  assert.deepEqual(msgs, ['「ボス前」はもうあるよ。今の状態で上書きしていい？']);
  assert.equal(await ls(page, 'adminSnaps'), first, 'やめたら前のスナップショットのまま');
  assert.equal(await page.inputValue('#d-snap-name'), 'ボス前');
}, { storage: { rpg: RPG } });

// U7: 今日の難問の記録の状態は日本語で出す
t('daily_record_status_in_japanese', async page => {
  await open(page, 'd-daily');
  assert.equal(await page.textContent('#d-daily-rec'), 'この端末の記録: 2026-10-26（終わった・18問正解）');
}, { storage: { daily: { day: '2026-10-26', status: 'done', correct: 18 } } });

t('daily_record_status_playing_in_japanese', async page => {
  await open(page, 'd-daily');
  assert.equal(await page.textContent('#d-daily-rec'), 'この端末の記録: 2026-10-26（とちゅう・3問正解）');
}, { storage: { daily: { day: '2026-10-26', status: 'playing', correct: 3 } } });

// T4: ファイルから読み戻す（うまくいく方）。自動のスナップショットを取ってから、ファイルの中身にする
const saveFile = data => ({ name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'country-drill', kind: 'save', data })) });
t('restore_from_file_success', async page => {
  acceptDialogs(page);
  await open(page, 'd-backup'); await open(page, 'd-rpg');
  await page.setInputFiles('#d-file', saveFile({ rpg: JSON.stringify({ ...RPG, coins: 777 }), settings: JSON.stringify({ theme: 'light', vol: 50 }) }));
  await toastHas(page, 'ファイルから読み戻したよ');
  assert.equal(await coins(page), 777);
  assert.deepEqual(JSON.parse(await ls(page, 'settings')), { theme: 'light', vol: 50 });
  assert.equal(await ls(page, 'badges'), null, 'ファイルに無いキーは消す');
  const snaps = JSON.parse(await ls(page, 'adminSnaps'));
  assert.equal(snaps.length, 1);
  assert.equal(snaps[0].auto, true);
  assert.equal(JSON.parse(snaps[0].data.rpg).coins, 500, '読み戻す前の状態を取っておく');
  assert.match(await page.textContent('#d-rpg-sum'), /777/);
}, { storage: { rpg: RPG, badges: { v: 1, got: {} } } });

// F4: 読み戻しが途中で失敗したら、まだ保存していない設定の欄は消さない（そのあとのほかの操作でも）
t('failed_restore_keeps_unsaved_settings', async page => {
  acceptDialogs(page);
  await open(page, 'd-backup'); await open(page, 'd-rpg'); await open(page, 'd-settings');
  await page.selectOption('#d-set-theme', 'dark');
  // rpg を 777 にする書きこみだけ失敗させる（容量いっぱいのまね）
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === 'rpg' && String(v).includes('"coins":777')) throw new DOMException('full', 'QuotaExceededError'); return set.call(this, k, v); };
  });
  await page.setInputFiles('#d-file', saveFile({ rpg: JSON.stringify({ ...RPG, coins: 777 }), settings: JSON.stringify({ theme: 'light' }) }));
  await toastHas(page, 'この端末に書けなかった');
  assert.equal(await coins(page), 500);
  assert.equal(await page.inputValue('#d-set-theme'), 'dark', '失敗した読み戻しで欄を戻さない');
  await page.click('#d-rpg [data-coins="1000"]');
  assert.equal(await coins(page), 1500);
  assert.equal(await page.inputValue('#d-set-theme'), 'dark', 'そのあとの操作でも欄を戻さない');
  await page.click('#d-set-save');
  assert.equal(JSON.parse(await ls(page, 'settings')).theme, 'dark');
}, { storage: { rpg: RPG, settings: { theme: 'light' } } });

// T6: D5 の Lv・天井カウンター・カードをあげる
t('rpg_lv_pity_and_card_buttons', async page => {
  await open(page, 'd-rpg');
  await page.fill('#d-rpg-lv', '7');
  await page.click('#d-rpg-lv-set');
  await toastHas(page, 'Lv を変えたよ');
  await page.fill('#d-rpg-pity', '42');
  await page.click('#d-rpg-pity-set');
  await toastHas(page, '天井カウンターを変えたよ');
  await page.fill('#d-rpg-card', 'JP');
  await page.click('#d-rpg-card-give');
  await toastHas(page, 'のカードをあげたよ');
  assert.equal(await page.inputValue('#d-rpg-card'), '');
  await page.fill('#d-rpg-card', 'zz');
  await page.click('#d-rpg-card-give');
  await toastHas(page, 'その国コードは無いよ');
  const x = JSON.parse(await ls(page, 'rpg'));
  assert.equal(x.lv, 7); assert.equal(x.pity, 42);
  assert.deepEqual(x.cards.jp, [1, 0]);
  assert.deepEqual(Object.keys(x.cards), ['jp']);
}, { storage: { rpg: RPG } });

// T6: D9 の効果音・ドパガキも保存する
t('settings_sound_and_dopa_saved', async page => {
  await open(page, 'd-settings');
  assert.equal(await page.isChecked('#d-set-sound'), true);
  assert.equal(await page.isChecked('#d-set-dopa'), false);
  await page.uncheck('#d-set-sound');
  await page.check('#d-set-dopa');
  await page.click('#d-set-save');
  const s = JSON.parse(await ls(page, 'settings'));
  assert.equal(s.sound, false); assert.equal(s.dopa, true);
}, { storage: { settings: { theme: 'light', sound: true, dopa: false } } });

// T6: D10 のボタンはその音を SND.play で鳴らす
t('sound_buttons_call_snd_play', async page => {
  await open(page, 'd-sound');
  await page.evaluate(() => { window.__played = []; const play = SND.play; SND.play = (k, ...a) => { window.__played.push(k); return play.call(SND, k, ...a); }; });
  const kinds = await page.evaluate(() => SND.kinds.slice(0, 2));
  assert.equal(kinds.length, 2);
  for (const k of kinds) { await page.click(`#d-sound-list [data-snd="${k}"]`); await page.waitForTimeout(60); }
  assert.deepEqual(await page.evaluate(() => window.__played), kinds);
});

// T6: D14 のまとめ（国の数・地域の数。いまの国データでは問題なし）
t('data_check_summary', async page => {
  await open(page, 'd-check');
  const n = await page.evaluate(() => COUNTRIES.length);
  assert.equal(await page.textContent('#d-check-sum'), `問題なし（${n}か国・6地域）`);
  assert.equal(await page.locator('#d-check-list li').count(), 0);
});
