// 英語版（PR5）: tools/make_en.mjs が作る en/index.html・hreflang・英語の manifest
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JA_RE } from '../../tools/i18n_scan.mjs';
import { SITE } from '../../tools/make_country_pages.mjs';
import { EN_SKIP, EN_SWAP, EN_DICTS, LANGSW_EN, readEnInputs, translateHtml, renderEn } from '../../tools/make_en.mjs';

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
  assert.ok(h.includes(`<meta property="og:image" content="${SITE}icons/ogp-en.png">`), '英語の OGP 画像');
  assert.ok(head(read('index.html')).includes(`<meta property="og:image" content="${SITE}icons/ogp.png">`), '日本語は ogp.png のまま');
  assert.ok(h.includes('<meta name="apple-mobile-web-app-title" content="Flag Master">'));
  assert.ok(h.includes('<title>Flag Master | Flag, country, and map quiz (195 countries)</title>'));
  for (const l of HREFLANG) assert.ok(h.includes(l), l);
  const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld.name, 'Flag Master');
  assert.equal(ld.inLanguage, 'en');
  assert.equal(ld.url, `${SITE}en/`);
  assert.doesNotMatch(ld.description, JA_RE);
});

test('ogp_en_png', () => {                 // icons/ogp-en.png（1200x630）。作り直し: node tools/make_ogp.mjs en
  const b = readFileSync(join(ROOT, 'icons/ogp-en.png'));
  assert.equal(b.toString('latin1', 1, 4), 'PNG');
  assert.equal(b.toString('latin1', 12, 16), 'IHDR');
  assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [1200, 630]);
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
  // EN_SKIP に無い script はみな同じ ?v= で残る（EN_SWAP のものは差しかえた先の名前で、同じ ?v=）
  const swap = s => { const [f, q] = s.split('?'); return Object.hasOwn(EN_SWAP, f) ? EN_SWAP[f] + (q === undefined ? '' : '?' + q) : s; };
  for (const s of scriptSrcs(ja)) if (!EN_SKIP.includes(s.split('?')[0])) assert.ok(srcs.includes(swap(s)), swap(s));
  // 豆知識は英訳（trivia-en.js）に差しかえ。日本語の index.html は trivia.js のまま
  assert.deepEqual(EN_SWAP, { 'trivia.js': 'trivia-en.js' });
  assert.ok(!EN_SKIP.includes('trivia.js'));
  assert.ok(srcs.includes('trivia-en.js') && !srcs.includes('trivia.js'), 'en/index.html は trivia-en.js だけ');
  const jaSrcs = scriptSrcs(ja);
  assert.ok(jaSrcs.includes('trivia.js') && !jaSrcs.includes('trivia-en.js'), 'index.html は trivia.js だけ');
  // 並びは日本語と同じ（外したものと辞書のほかは、差しかえた先も trivia.js のあった所）
  assert.deepEqual(srcs.filter(s => !s.startsWith('i18n/')), jaSrcs.filter(s => !EN_SKIP.includes(s.split('?')[0])).map(swap));
});

// PR8 Task 9: 未訳の script は無い。en/index.html の script は日本語の index.html と同じ並び（EN_SWAP の分を読みかえ、辞書を足したもの）
test('en_scripts_all', () => {
  assert.deepEqual(EN_SKIP, []);
  const swap = s => { const [f, q] = s.split('?'); return Object.hasOwn(EN_SWAP, f) ? EN_SWAP[f] + (q === undefined ? '' : '?' + q) : s; };
  const ja = scriptSrcs(read('index.html')), en = scriptSrcs(enIndex());
  assert.deepEqual(en.filter(s => !s.startsWith('i18n/')), ja.map(swap));
  const dicts = EN_DICTS['index.html'].map(n => `i18n/${n}.js?v=${read(`i18n/${n}.js`).match(/^\/\/ v=(\d+)/)[1]}`);
  assert.deepEqual(en.filter(s => s.startsWith('i18n/')), dicts);
  assert.ok(en.some(s => s.startsWith('rpg-rank.js?v=')));
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
  assert.equal(m.description, 'Learn the flags, names, and locations of all 195 countries with a 4-choice quiz.');
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

// 埋めこみの英語版: noindex のまま、今日の難問のリンクは英語版の #daily へ（PR6）、「もっと遊ぶ」は英語版のトップへ。日本語が残らない
test('en_embed', () => {
  const out = renderEn(readEnInputs(ROOT));
  assert.ok('en/embed.html' in out, 'renderEn が en/embed.html を作る（en_current で見る）');
  const html = read('en/embed.html'), h = head(html);
  assert.match(html, /^<!doctype html>\n<html lang="en">/);
  const base = h.indexOf('<base href="../">');
  assert.ok(base > h.indexOf('<meta charset="utf-8">') && base < h.search(/\s(?:href|src)="(?!https?:)[^"]*"/));
  assert.ok(h.includes('<meta name="robots" content="noindex">'));
  assert.ok(h.includes('<title>Today’s flag | Flag Master</title>'));
  assert.match(html, /<a id="e-daily" href="en\/#daily" target="_blank" rel="noopener">Try the Daily Puzzle \(20 questions\)<\/a>/);
  assert.match(html, /<a id="e-more" href="en\/" target="_blank" rel="noopener">Play more<\/a>/);
  const srcs = scriptSrcs(html);
  assert.deepEqual(srcs.map(s => s.split('?')[0]), ['i18n.js', 'i18n/en-embed.js', 'countries.js', 'daily-core.js', 'embed.js']);
  assert.ok(srcs.includes(`i18n/en-embed.js?v=${read('i18n/en-embed.js').match(/^\/\/ v=(\d+)/)[1]}`));
  for (const s of scriptSrcs(read('embed.html'))) assert.ok(srcs.includes(s), s);
  const left = visible(html).split(/[<>"]/).filter(s => JA_RE.test(s)).map(s => s.trim());
  assert.deepEqual(left, []);
});

// i18n/en-*.js（ブラウザが読まない en-html.js を除く）は、どれもどこかのページの EN_DICTS に入っている（名前の書きまちがい・入れ忘れ）
test('en_dicts_list_all_files', () => {
  const listed = new Set(Object.values(EN_DICTS).flat());
  const files = readdirSync(join(ROOT, 'i18n')).filter(f => /^en-[\w-]+\.js$/.test(f) && f !== 'en-html.js').map(f => f.slice(0, -3));
  assert.deepEqual(files.filter(n => !listed.has(n)), []);
});
