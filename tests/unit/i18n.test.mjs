// 英語版（PR5）: i18n.js の T()・cName・I18N と、日本語の取り残しを見つけるテスト（tools/i18n_scan.mjs）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { JA_RE, scanJs, inlineSections } from '../../tools/i18n_scan.mjs';

const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');

// i18n.js を vm で読む。lang を渡すと document.documentElement.lang を置く（渡さなければ document なし）
const load = ({ lang, dict } = {}) => {
  const warns = [];
  const ctx = { console: { warn: m => warns.push(m) } };
  ctx.window = ctx;
  if (lang) ctx.document = { documentElement: { lang } };
  if (dict) ctx.I18N_EN = dict;
  vm.createContext(ctx);
  vm.runInContext(read('i18n.js'), ctx);
  return { ctx, warns };
};

// 日本語の文字を見るファイル。'all' はファイル全体（index.html の節はあとのタスクで足す）
// sound.js・pwa.js・daily-core.js は日本語が console・Error の中だけなので、はじめから見る
const COVER = { 'i18n.js': 'all', 'sound.js': 'all', 'pwa.js': 'all', 'daily-core.js': 'all' };
// まだ訳さないファイル（PR6: ranking・daily・profile・streak・share-card、PR7: badges・trivia、PR8: rpg-*）
// dojo・embed は PR5 のあとのタスクで COVER へ移す
const NOT_YET = ['ranking.js', 'daily.js', 'profile.js', 'streak.js', 'share-card.js', 'badges.js', 'trivia.js',
  'rpg-core.js', 'rpg.js', 'rpg-cards.js', 'rpg-battle.js', 'rpg-team.js', 'rpg-rank.js',
  'dojo.js', 'embed.js'];
// 見ないファイル（データ・管理画面・生成物の sw.js）
const SKIP = ['countries.js', 'themes.js', 'world.js', 'admin.js', 'admin-api.js', 'admin-save.js', 'sw.js'];

test('t_ja_identity', () => {
  const { ctx } = load();
  assert.equal(ctx.LANG, 'ja');
  assert.equal(ctx.T('{n}問', { n: 5 }), '5問');
  assert.equal(ctx.T('全世界'), '全世界');
  assert.equal(ctx.cName({ n: '日本', e: 'Japan' }), '日本');
  assert.equal(ctx.cCap({ c: '東京', ec: 'Tokyo' }), '東京');
  assert.equal(ctx.I18N.locale, 'ja-JP');
});

test('t_en_lookup', () => {
  const { ctx } = load({ lang: 'en', dict: { '全世界': 'Whole world', '{n}問': { one: '{n} question', other: '{n} questions' } } });
  assert.equal(ctx.LANG, 'en');
  assert.equal(ctx.T('全世界'), 'Whole world');
  assert.equal(ctx.T('{n}問', { n: 1 }), '1 question');
  assert.equal(ctx.T('{n}問', { n: 3 }), '3 questions');
  assert.equal(ctx.cName({ n: '日本', e: 'Japan' }), 'Japan');
  assert.equal(ctx.cCap({ c: '東京', ec: 'Tokyo' }), 'Tokyo');
  assert.equal(ctx.I18N.locale, 'en-US');
  assert.ok(ctx.I18N.hide.has('ta'));
  // 辞書ファイルの形（Object.assign(window.I18N_EN ??= {}, …)）で、あとから足せる
  vm.runInContext("Object.assign(window.I18N_EN ??= {}, { '練習': 'Practice' });", ctx);
  assert.equal(ctx.T('練習'), 'Practice');
});

test('t_missing_warns_once', () => {
  const { ctx, warns } = load({ lang: 'en' });
  assert.equal(ctx.T('あ'), 'あ');
  assert.equal(ctx.T('あ'), 'あ');
  assert.deepEqual(warns, ['[i18n] 辞書に無い: あ']);
});

test('t_page_and_fold', () => {
  const en = load({ lang: 'en' }).ctx;
  assert.equal(en.I18N.page('./'), 'en/');
  assert.equal(en.I18N.page('country/fr.html'), 'en/country/fr.html');
  assert.equal(en.I18N.fold('São Tomé'), 'sao tome');
  const a = { n: 'イ', e: 'B' }, b = { n: 'ア', e: 'C' };
  assert.ok(en.I18N.byName(a, b) < 0);
  const ja = load().ctx;
  assert.equal(ja.I18N.page('country/'), 'country/');
  assert.equal(ja.I18N.hide.size, 0);
  assert.ok(ja.I18N.byName(a, b) > 0);
});

test('scan_fixtures', () => {
  const one = src => { const r = scanJs(src); assert.equal(r.length, 1, `${src} → ${JSON.stringify(r)}`); return r[0]; };
  assert.equal(one("x = T('あ');").wrapped, true);
  assert.equal(one("x = T('あ{n}', { n });").wrapped, true);
  assert.equal(one("x = 'あ';").wrapped, false);
  assert.equal(one('x = `あ${x}`;').wrapped, false);
  assert.equal(one("x = ST('あ');").wrapped, false);
  assert.equal(one("console.error('あ', e);").exempt, true);
  assert.equal(one('throw new Error(`あ${x}`);').exempt, true);
  assert.equal(one("f('あ');").exempt, false);
  assert.equal(one("console.log(f('あ'));").exempt, false);   // いちばん内側は f
  assert.deepEqual(scanJs("// 'あ'\n/* 'あ' */\nx = 1;"), []);
  assert.deepEqual(scanJs("x = 'abc'; y = \"def\";"), []);
  const r = one(`const esc = s => s.replace(/[&<>"]/g, c => m[c]);\nx = 'い';`);
  assert.equal(r.text, 'い');
  assert.equal(r.line, 2);
  // テンプレートの中の入れ子
  const nest = scanJs('x = `a${ y ? T(\'あ\') : `b${ \'い\' }` }c`;');
  assert.deepEqual(nest.map(e => [e.text, e.wrapped]), [['あ', true], ['い', false]]);
  // a / b は割り算（正規表現にしない）
  assert.equal(one("x = a / b; y = 'う' / 2;").text, 'う');
  const d = scanJs("x = 'あ';\n// i18n-data:start\nconst D = { a: 'い' };\n// i18n-data:end\ny = 'う';");
  assert.deepEqual(d.map(e => [e.text, e.data]), [['あ', false], ['い', true], ['う', false]]);
});

test('scan_helpers', async () => {
  const { tKeys } = await import('../../tools/i18n_scan.mjs');
  assert.deepEqual(tKeys("T('あ'); x.T('い'); T('{n}問', { n }); T(\"え\")"), ['あ', '{n}問']);
  assert.ok(JA_RE.test('あ') && JA_RE.test('漢') && JA_RE.test('・') && JA_RE.test('！') && !JA_RE.test('São Tomé'));
  const s = inlineSections(read('index.html'));
  assert.ok('先読み' in s && 'データ' in s && 'クイズ' in s && 'ドパガキ向けの演出' in s && '起動' in s, Object.keys(s).join(','));
  assert.ok(!Object.values(s).some(v => /application\/ld\+json|<script/.test(v)));
});

test('no_ja_outside_T', () => {
  const bad = [];
  const check = (name, src) => {
    for (const e of scanJs(src)) if (!(e.wrapped || e.exempt || e.data)) bad.push(`${name}:${e.line}: ${e.text}`);
  };
  const sections = inlineSections(read('index.html'));
  for (const [f, what] of Object.entries(COVER)) {
    if (f === 'index.html') for (const sec of what) check(`index.html（${sec}）`, sections[sec]);
    else check(f, read(f));
  }
  assert.deepEqual(bad, []);
});

test('every_root_js_listed', () => {
  const files = readdirSync(root).filter(f => f.endsWith('.js')).sort();
  for (const f of files) {
    const n = [f in COVER, NOT_YET.includes(f), SKIP.includes(f)].filter(Boolean).length;
    assert.equal(n, 1, `${f} は COVER・NOT_YET・SKIP のどれか1つだけに入れる（今 ${n} か所）`);
  }
});

test('i18n_globals_unique', () => {
  const files = [...readdirSync(root).filter(f => f.endsWith('.js') && f !== 'i18n.js'), 'index.html'];
  const re = /\b(?:const|let|var|function)\s+(T|cName|cCap|LANG|I18N|I18N_EN)\b/g;
  const bad = files.flatMap(f => [...read(f).matchAll(re)].map(m => `${f}: ${m[0]}`));
  assert.deepEqual(bad, []);
});
