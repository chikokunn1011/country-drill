// 英語版（PR5）: i18n.js の T()・cName・I18N と、日本語の取り残しを見つけるテスト（tools/i18n_scan.mjs）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JA_RE, scanJs, inlineSections, tKeys } from '../../tools/i18n_scan.mjs';
import { readEnInputs, renderEn } from '../../tools/make_en.mjs';

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
const COVER = { 'i18n.js': 'all', 'sound.js': 'all', 'pwa.js': 'all', 'daily-core.js': 'all',
  'index.html': ['先読み', 'データ', '地図', 'ドパガキ向けの演出', '画面切り替え', '設定', '起動'] };
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
  // キーワードや => のあとの / は正規表現（中の引用符で文字列を読みちがえない）
  for (const pre of ['return', 'typeof', 'case', 'x =>', 'throw', 'else', 'void', 'await', 'yield'])
    assert.equal(one(`${pre} /[",']/.test(s); y = 'え';`).text, 'え', pre);
  assert.equal(one("x = a.return / 2; y = 'お' / 3;").text, 'お');   // プロパティ名の return は割り算
  // T( の第1引数が文字列そのものでなければ wrapped にしない
  assert.equal(one("x = T('あ' + y);").wrapped, false);
  assert.equal(one("x = T('あ'.repeat(2));").wrapped, false);
  assert.equal(one("x = T( 'あ' );").wrapped, true);
  // エスケープを読む
  assert.equal(one("x = T('あ\\'い\\n\\u3042\\\\');").text, "あ'い\nあ\\");
  assert.equal(one('x = "あ\\"";').text, 'あ"');
  // console・Error の中でも、関数の本体 {…} の中は exempt にしない
  assert.equal(one("console.log(() => { el.textContent = 'あ'; });").exempt, false);
  assert.equal(one("console.log(function () { return 'あ'; });").exempt, false);
  assert.equal(one("console.log({ a: 'あ' });").exempt, true);
  assert.equal(one("console.log(() => 'あ');").exempt, true);
  const d = scanJs("x = 'あ';\n// i18n-data:start\nconst D = { a: 'い' };\n// i18n-data:end\ny = 'う';");
  assert.deepEqual(d.map(e => [e.text, e.data]), [['あ', false], ['い', true], ['う', false]]);
});

test('scan_helpers', async () => {
  const { tKeys } = await import('../../tools/i18n_scan.mjs');
  assert.deepEqual(tKeys("T('あ'); x.T('い'); T('{n}問', { n }); T(\"え\"); T('it\\'s'); T('お' + x)"), ['あ', '{n}問', "it's"]);
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

// グローバルの名前を宣言しているところ（宣言の2つめ以降・関数の引数も見る）
const GLOBALS = 'T|cName|cCap|LANG|I18N|I18N_EN';
const globalDecls = src => {
  const g = String.raw`(?:${GLOBALS})`;
  const res = [
    new RegExp(String.raw`\b(?:const|let|var|function)\s+${g}\b`, 'g'),                    // const T / function T
    new RegExp(String.raw`\b(?:const|let|var)\s[^;\n]*?,\s*${g}\s*=(?![=>])`, 'g'),       // const K = …, T = …
    new RegExp(String.raw`\bfunction\b[^(\n]*\([^)]*\b${g}\b[^)]*\)`, 'g'),              // function f(a, T)
    new RegExp(String.raw`\([^()\n]*(?<![.\w$])${g}\b(?!\s*[.(\[])[^()\n]*\)\s*=>`, 'g'),  // (a, T) =>
    new RegExp(String.raw`(?<![.\w$])${g}\s*=>`, 'g'),                                       // T =>
  ];
  return res.flatMap(re => [...src.matchAll(re)].map(m => m[0]));
};

test('i18n_globals_unique', () => {
  // 見つけ方の確かめ
  for (const s of ['const T = 1', 'let K = 1, T = 2', 'function T() {}', 'function f(a, T) {}', 'const f = (a, T) => 1', 'xs.map(T => T)', 'var a, I18N = 3'])
    assert.ok(globalDecls(s).length, s);
  for (const s of ["x = T('あ')", 'const a = T.x', "const a = b, c = T('あ')", 'f(x === T)', "xs.map(c => T('あ', c))", 'const a = b, c = x ? T : y'])
    assert.deepEqual(globalDecls(s), [], s);
  const files = [...readdirSync(root).filter(f => f.endsWith('.js') && f !== 'i18n.js'), 'index.html'];
  const bad = files.flatMap(f => globalDecls(read(f)).map(m => `${f}: ${m}`));
  assert.deepEqual(bad, []);
});

// ---- 英語の辞書（i18n/en-*.js を合わせたもの） ----
// COVER のコード（index.html は節ごと）
const coverSources = () => {
  const sections = inlineSections(read('index.html'));
  return Object.entries(COVER).flatMap(([f, what]) => f === 'index.html' ? what.map(sec => sections[sec]) : [read(f)]);
};
// 辞書ファイルごとの中身 { 'en-core.js': {…}, … }
const dictFiles = () => Object.fromEntries(readdirSync(new URL('i18n/', root)).filter(f => /^en-[\w-]+\.js$/.test(f)).sort().map(f => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('i18n/' + f), ctx, { filename: f });
  return [f, { ...ctx.window.I18N_EN }];
}));
const I18N_EN = () => Object.assign({}, ...Object.values(dictFiles()));
const codeKeys = () => coverSources().flatMap(tKeys);
const dataStrings = () => coverSources().flatMap(src => scanJs(src).filter(e => e.data).map(e => e.text));
const values = v => typeof v === 'object' ? [v.one, v.other] : [v];
const holes = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

test('dict_has_all_keys', () => {
  const dict = I18N_EN();
  const missing = [...new Set([...codeKeys(), ...dataStrings()])].filter(k => !Object.hasOwn(dict, k));
  assert.deepEqual(missing, []);
});

test('dict_values_english', () => {
  const bad = Object.entries(I18N_EN()).filter(([, v]) => values(v).some(x => typeof x !== 'string' || JA_RE.test(x)));
  assert.deepEqual(bad, []);
});

test('dict_placeholders_match', () => {
  const bad = [];
  for (const [k, v] of Object.entries(I18N_EN())) {
    if (typeof v === 'object') {
      const ks = Object.keys(v).sort().join(',');
      if (ks !== 'one,other' || !/\{n\}/.test(k)) bad.push(`${k}: { one, other } は {n} のあるキーだけ・one と other だけ（${ks}）`);
    }
    for (const x of values(v)) if (holes(x) !== holes(k)) bad.push(`${k} → ${x}`);
  }
  assert.deepEqual(bad, []);
});

test('dict_no_unused', () => {
  const used = new Set();
  renderEn(readEnInputs(fileURLToPath(root)), used);
  const known = new Set([...codeKeys(), ...dataStrings(), ...used]);
  assert.deepEqual(Object.keys(I18N_EN()).filter(k => !known.has(k)), []);
});

test('dict_no_conflict', () => {
  const seen = new Map(), bad = [];
  for (const [f, d] of Object.entries(dictFiles())) for (const [k, v] of Object.entries(d)) {
    if (seen.has(k) && JSON.stringify(seen.get(k).v) !== JSON.stringify(v)) bad.push(`${k}: ${seen.get(k).f} と ${f}`);
    if (!seen.has(k)) seen.set(k, { f, v });
  }
  assert.deepEqual(bad, []);
});
