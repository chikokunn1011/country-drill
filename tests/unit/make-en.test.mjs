// 英語版（PR5）: tools/make_en.mjs が作る en/index.html・hreflang・英語の manifest
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JA_RE } from '../../tools/i18n_scan.mjs';
import { SITE } from '../../tools/make_country_pages.mjs';
import { EN_SKIP, EN_DICTS, readEnInputs, translateHtml, renderEn } from '../../tools/make_en.mjs';

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
