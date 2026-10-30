// 英語版（PR5）: tools/make_en.mjs が作る en/index.html・hreflang・英語の manifest
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JA_RE } from '../../tools/i18n_scan.mjs';
import { SITE } from '../../tools/make_country_pages.mjs';
import { EN_SKIP, EN_DICTS, LANGSW_EN, readEnInputs, translateHtml, renderEn } from '../../tools/make_en.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const enIndex = () => read('en/index.html');
const head = html => html.slice(0, html.indexOf('</head>'));
const HREFLANG = [
  `<link rel="alternate" hreflang="ja" href="${SITE}">`,
  `<link rel="alternate" hreflang="en" href="${SITE}en/">`,
  `<link rel="alternate" hreflang="x-default" href="${SITE}">`,
];
// script・style・コメント・lang="ja" の要素を除く
const visible = html => html
  .replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style\b[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<(\w+)\b[^>]*\slang="ja"[^>]*>[\s\S]*?<\/\1>/g, '');
const scriptSrcs = html => [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

test('en_current', () => {
  for (const [p, s] of Object.entries(renderEn(readEnInputs(ROOT)))) {
    assert.ok(existsSync(join(ROOT, p)) && read(p) === s, `${p} が古い。node tools/make_en.mjs を流して`);
  }
});

test('en_head', () => {
  const html = enIndex(), h = head(html);
  assert.match(html, /^<!doctype html>\n<html lang="en">/);
  const base = h.indexOf('<base href="../">');
  assert.ok(base > 0 && base > h.indexOf('<meta charset="utf-8">'));
  const firstRel = h.search(/\s(?:href|src)="(?!https?:)[^"]*"/);
  assert.ok(base < firstRel, '<base> が最初の相対 URL より前');
  assert.ok(h.includes(`<link rel="canonical" href="${SITE}en/">`));
  assert.ok(h.includes(`<meta property="og:url" content="${SITE}en/">`));
  assert.ok(h.includes('<meta property="og:locale" content="en_US">'));
  assert.ok(h.includes('<link rel="manifest" href="en/manifest.webmanifest">'));
  assert.ok(h.includes('<meta name="apple-mobile-web-app-title" content="Flag Master">'));
  assert.ok(h.includes('<title>Flag Master | Flag, Country & Map Quiz (195 countries)</title>'));
  for (const l of HREFLANG) assert.ok(h.includes(l), l);
  const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld.name, 'Flag Master');
  assert.equal(ld.inLanguage, 'en');
  assert.equal(ld.url, `${SITE}en/`);
  assert.doesNotMatch(ld.description, JA_RE);
});

test('ja_hreflang', () => {
  const h = head(read('index.html'));
  for (const l of HREFLANG) assert.ok(h.includes(l), l);
});

test('en_scripts', () => {
  const ja = read('index.html'), en = enIndex(), srcs = scriptSrcs(en);
  for (const s of srcs) assert.ok(!EN_SKIP.includes(s.split('?')[0]), s);
  // i18n.js のすぐ後に、あるだけの辞書（EN_DICTS の順）
  const i = srcs.findIndex(s => s.startsWith('i18n.js?v='));
  assert.ok(i >= 0);
  const have = EN_DICTS['index.html'].filter(n => existsSync(join(ROOT, 'i18n', n + '.js')));
  assert.deepEqual(srcs.slice(i + 1, i + 1 + have.length).map(s => s.split('?')[0]), have.map(n => `i18n/${n}.js`));
  for (const n of have) {
    const v = read(`i18n/${n}.js`).match(/^\/\/ v=(\d+)/)[1];
    assert.ok(srcs.includes(`i18n/${n}.js?v=${v}`));
  }
  // i18n.js は本文のインラインの <script> より前
  const body = en.slice(en.indexOf('<body'));
  assert.ok(body.indexOf('<script src="i18n.js?v=') < body.search(/<script>/));
  // EN_SKIP に無い script はみな同じ ?v= で残る
  for (const s of scriptSrcs(ja)) if (!EN_SKIP.includes(s.split('?')[0])) assert.ok(srcs.includes(s), s);
});

test('en_no_japanese_html', () => {
  const left = visible(enIndex()).split(/[<>"]/).filter(s => JA_RE.test(s)).map(s => s.trim());
  assert.deepEqual(left, []);
});

test('en_footer_links', () => {
  const en = enIndex(), nav = en.match(/<nav class="foot-links"[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(m => m[1]),
    ['en/howto.html', 'en/about.html', 'en/about.html#contact', 'en/privacy.html', 'en/country/', 'en/themes/']);
});

test('translate_throws_on_missing', () => {
  assert.throws(() => translateHtml('<p>未知の文</p>', {}), e => e instanceof Error && e.message.includes('未知の文'));
  // 引いたキーは used に入る。前後の空白は残る
  const used = new Set();
  assert.equal(translateHtml('<p title="題"> 文 </p>', { 文: 'Text', 題: 'Title' }, used), '<p title="Title"> Text </p>');
  assert.deepEqual([...used].sort(), ['文', '題'].sort());
});

test('translate_skips_lang_ja', () => {
  // lang="ja" の要素の中は文字も属性も訳さない（同じ名前の入れ子も）。外は訳す
  const dict = { 日本語: 'Japanese', 題: 'Title', 文: 'Text' };
  assert.equal(translateHtml('<a lang="ja" href="./" title="題">日本語</a> / <b>文</b>', dict),
    '<a lang="ja" href="./" title="題">日本語</a> / <b>Text</b>');
  assert.equal(translateHtml('<span lang="ja"><span>日本語</span>日本語</span><span>文</span>', dict),
    '<span lang="ja"><span>日本語</span>日本語</span><span>Text</span>');
  assert.equal(translateHtml('<p><img lang="ja" alt="題">文</p>', dict), '<p><img lang="ja" alt="題">Text</p>');
});

test('translate_catches_fullwidth_space', () => {
  // 前後の全角の空白は訳した文の外に残るので、チェックで止まる
  assert.throws(() => translateHtml('<p>文\u3000</p>', { 文: 'Text' }), /英語の訳が無い文/);
});

test('en_links_outside_script_only', () => {
  const inp = readEnInputs(ROOT);
  inp.index = inp.index.replace('</body>', `<script>const x = '<a href="howto.html">';</script>\n<!-- <a href="about.html"> -->\n</body>`);
  const html = renderEn(inp)['en/index.html'];
  assert.ok(html.includes(`<script>const x = '<a href="howto.html">';</script>`));
  assert.ok(html.includes('<!-- <a href="about.html"> -->'));
  assert.ok(html.includes('<a href="en/howto.html">'));
});

test('en_manifest', () => {
  const m = JSON.parse(read('en/manifest.webmanifest')), ja = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.name, 'Flag Master');
  assert.equal(m.short_name, 'Flag Master');
  assert.equal(m.description, 'Learn the flags, names and locations of 195 countries with a 4-choice quiz.');
  assert.equal(m.lang, 'en');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.deepEqual(Object.keys(m), Object.keys(ja));
  for (const k of ['display', 'background_color', 'theme_color']) assert.equal(m[k], ja[k]);
  assert.equal(m.icons.length, ja.icons.length);
  m.icons.forEach((ic, i) => {
    assert.equal(ic.src, '../' + ja.icons[i].src);
    assert.ok(existsSync(join(ROOT, 'en', ic.src)), ic.src);
  });
});

// 言語の切りかえ: 日本語版は「日本語 / English（en/ へのリンク）」、英語版は「日本語（./ へのリンク）/ English」。どちらも2か所。
// 英語の端末への案内（#home-en）は日本語版だけ
test('langsw', () => {
  const ja = read('index.html'), en = enIndex();
  const blocks = html => [...html.matchAll(/<!-- langsw:start -->([\s\S]*?)<!-- langsw:end -->/g)].map(m => m[1]);
  assert.deepEqual(blocks(ja), Array(2).fill('<span class="langsw"><b>日本語</b> / <a href="en/" hreflang="en" lang="en">English</a></span>'));
  assert.deepEqual(blocks(en), Array(2).fill(LANGSW_EN));
  assert.equal(LANGSW_EN, '<span class="langsw"><a href="./" hreflang="ja" lang="ja">日本語</a> / <b lang="en">English</b></span>');
  assert.match(ja, /<p class="home-en" id="home-en" hidden><a href="en\/" hreflang="en" lang="en">English version →<\/a><\/p>/);
  assert.doesNotMatch(en, /id="home-en"/);
});

// CSS の content の代わりの文（content: "✓" / "正解"）は、読み上げで聞こえるので訳す。訳が無ければ止まる
test('translate_css_alt', () => {
  const used = new Set();
  assert.equal(translateHtml('<style>a::after { content: "✓"; content: "✓" / "正解"; } /* 正解 */</style>', { 正解: 'Correct' }, used),
    '<style>a::after { content: "✓"; content: "✓" / "Correct"; } /* 正解 */</style>');
  assert.deepEqual([...used], ['正解']);
  assert.throws(() => translateHtml('<style>a::after { content: "✗" / "まちがい"; }</style>', {}), /まちがい/);
  // en/index.html の style の content に日本語が残っていない
  const css = [...enIndex().matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1].replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
  assert.deepEqual([...css.matchAll(/content:[^;}]*/g)].map(m => m[0]).filter(s => JA_RE.test(s)), []);
});
