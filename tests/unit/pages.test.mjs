// 読み物のページ（privacy・about・howto）とフッターを、ファイルの文字のまま確かめる
// （B1 の country/*.html は PAGES に足す。PR9 の embed.html は BLOCKS・PAGE_VARS・varsOf で変数を比べる）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { MOFA_NAMES, MOFA_OTHER } from './mofa-names.mjs';

const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');

// フッター（<!-- footer:start -->〜<!-- footer:end -->）を持つページ
export const PAGES = ['index.html', 'privacy.html', 'about.html', 'howto.html'];
// 目印の間の href（先頭の ../ は外す）
export const footerHrefs = html => {
  const m = /<!-- footer:start -->([\s\S]*?)<!-- footer:end -->/.exec(html);
  if (!m) return [];
  return [...m[1].matchAll(/href="([^"]*)"/g)].map(x => x[1].replace(/^(\.\.\/)+/, ''));
};

// countries.js の 195 の国名（n）
const COUNTRY_NAMES = (() => { const ctx = { window: {} }; vm.runInNewContext(read('countries.js'), ctx); return new Set(ctx.window.COUNTRIES.map(c => c.n)); })();
// about.html の <table id="names"> の、本文の各行の1列め（このサイトの書き方）
export const namesTableSiteColumn = html => {
  const m = /<table id="names">([\s\S]*?)<\/table>/.exec(html);
  if (!m) return [];
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(m[1]);
  return [...(body ? body[1] : '').matchAll(/<tr>\s*<td>([^<]*)<\/td>/g)].map(x => x[1].trim());
};
// 同じ表の各行の [このサイト, 外務省]
export const namesTableRows = html => {
  const m = /<table id="names">([\s\S]*?)<\/table>/.exec(html);
  if (!m) return [];
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(m[1]);
  return [...(body ? body[1] : '').matchAll(/<tr>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g)].map(x => [x[1].trim(), x[2].trim()]);
};

// 色の変数のかたまり。順は :root・端末がダークのとき・設定がダークのとき
export const BLOCKS = [':root', ':root:not([data-theme="light"])', ':root[data-theme="dark"]'];
// 読み物のページが使う変数（index.html と同じ値にする）
export const PAGE_VARS = ['--bg', '--surface', '--ink', '--muted', '--line', '--accent', '--accent-ink', '--font-display', '--font-body', '--font-mono'];
// block のかたまりにある変数 → 値。:root は最初の「:root {」、ほかはそのセレクタの { } の中
export const varsOf = (css, block) => {
  const esc = block.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) return {};
  const out = {};
  for (const d of m[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
};
// head の先読み script のうち、テーマを当てる文（dataset.theme を含む行）
export const themeScript = html => {
  const head = html.split('</head>')[0];
  const lines = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].flatMap(m => m[1].split('\n'));
  return lines.filter(l => l.includes('dataset.theme')).join('\n').trim();
};

test('footer_links_same', () => {
  for (const p of PAGES) assert.deepEqual(footerHrefs(read(p)), ['howto.html', 'about.html', 'about.html#contact', 'privacy.html'], p);
});

test('footer_not_in_admin', () => assert.ok(!read('admin.html').includes('footer:start')));

test('pages_css_vars_match_index', () => {
  const index = read('index.html'), pages = read('pages.css');
  for (const block of BLOCKS) {
    const want = varsOf(index, block), got = varsOf(pages, block);
    assert.ok(Object.keys(want).length > 0, `index.html に ${block} が無い`);
    for (const v of PAGE_VARS) if (v in want) assert.equal(got[v], want[v], `${block} ${v}`);
  }
});

test('pages_head', () => {
  const indexTheme = themeScript(read('index.html'));
  assert.match(indexTheme, /dataset\.theme/);
  for (const p of ['privacy.html', 'about.html', 'howto.html']) {
    const h = read(p);
    assert.match(h, /<html lang="ja">/, p); assert.match(h, /<meta name="viewport" content="width=device-width, initial-scale=1">/, p);
    assert.match(h, /<title>[^<]+｜国旗マスター<\/title>/, p); assert.match(h, /<meta name="description" content="[^"]{20,}">/, p);
    assert.ok(h.includes(`<link rel="canonical" href="https://chikokunn1011.github.io/country-drill/${p}">`), p);
    assert.match(h, /<link rel="stylesheet" href="pages\.css\?v=\d+">/, p);
    assert.equal(themeScript(h), indexTheme, p);   // head の先読み script（dataset.theme を含む）が同じ文
    assert.match(h, /<a class="back" href="\.\/">← 国旗マスターで遊ぶ<\/a>/, p);
  }
});

test('footer_targets_exist', () => {
  for (const p of PAGES) for (const href of footerHrefs(read(p))) {
    const [file, id] = href.split('#');
    assert.ok(existsSync(new URL(file, root)), `${p}: ${file} が無い`);
    if (id) assert.ok(read(file).includes(`id="${id}"`), `${p}: ${file} に id="${id}" が無い`);
  }
});

// profile.js の TRANSFER_KEYS・LOCAL_KEYS のうち、大文字をふくむキーの名前（rpgRank・adminErrors など）
const keysWithUpper = src => ['TRANSFER_KEYS', 'LOCAL_KEYS'].flatMap(name => {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(src);
  assert.ok(m, `profile.js に ${name} が無い`);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).filter(k => /[A-Z]/.test(k));
});

test('privacy_text', () => {
  const h = read('privacy.html');
  for (const id of ['collect', 'device', 'ranking', 'names', 'delete', 'external', 'ads', 'analytics', 'changes']) assert.match(h, new RegExp(`<h2 id="${id}"`));
  assert.ok(h.includes('コードは24時間で使えなくなります。預けたデータは、そのあとの整理で消えます'));
  for (const s of ['Supabase', 'IP アドレス', 'GitHub Pages', 'Google Fonts', 'cdnjs', 'jsDelivr', 'Cookie', 'https://adssettings.google.com', 'https://policies.google.com/technologies/ads', '利用する場合があります', 'アクセス解析']) assert.ok(h.includes(s), s);
  assert.match(h, /最終更新日: \d{4}年\d{1,2}月\d{1,2}日/);
  // 端末のデータは引き継ぎで外に出る。外に出ないと言い切るのはエラーの記録だけ
  assert.ok(!h.includes('このサイトの外には送りません'));
  assert.ok(h.includes('外に出るのは、あなたが自分で引き継ぎを使ったときだけです'));
  assert.match(h, /<a href="#transfer">引き継ぎ<\/a>/);
  assert.match(h, /<h3 id="transfer">/);
  // 非公開でしぼるのはプロフィールのカードだけ。ランキングの表には名前と記録が出る
  assert.ok(h.includes('プロフィールのカードには'));
  assert.ok(h.includes('ランキングの表には、非公開でも名前と記録'));
  assert.ok(!h.includes('ほかの人には名前・かざり'));
  // キーの名前は並べない（種類で書く）
  const upper = keysWithUpper(read('profile.js'));
  assert.ok(upper.includes('rpgRank') && upper.includes('adminErrors'), upper.join(','));
  for (const k of upper) assert.ok(!h.includes(k), k);
});

test('about_text', () => {
  const h = read('about.html');
  assert.ok(h.includes('出題は国旗・国名・場所だけ。首都は答えのあとの説明と図鑑で見られる（首都を当てる問題はない）'));
  for (const s of ['大学生の個人運営', '外務省', 'Natural Earth', '日本政府の立場を表すものではありません', 'flag-icons', 'world-atlas', 'world-countries', 'ODbL', 'd3', 'topojson-client']) assert.ok(h.includes(s), s);
});

test('about_name_table', () => {   // 例外の表（<table id="names">）の「このサイト」の列は、どれも countries.js の n にある
  const names = namesTableSiteColumn(read('about.html'));
  assert.ok(names.length > 0, '<table id="names"> に行が無い');
  for (const n of names) assert.ok(COUNTRY_NAMES.has(n), n);
});

// 国名の書き方のきまり: 外務省の一覧の名前の後ろ（「共和国」「王国」など）を省いた形（外務省の名前が n で始まる）。
// そうならない国だけが表に載る。表の外務省の列は、写した一覧（tests/unit/mofa-names.mjs）にあるとおり
test('about_name_table_mofa', () => {
  const rows = namesTableRows(read('about.html'));
  const official = [...MOFA_NAMES, ...MOFA_OTHER];
  for (const [site, mofa] of rows) {
    assert.ok(official.includes(mofa), `外務省の一覧に無い: ${mofa}`);
    assert.ok(!mofa.startsWith(site), `後ろを省いただけなので表に要らない: ${site}｜${mofa}`);
  }
  const inTable = new Set(rows.map(r => r[0]));
  for (const n of COUNTRY_NAMES) {
    if (n === '日本') continue;   // 外務省の一覧に日本は載っていない
    assert.ok(inTable.has(n) || official.some(o => o.startsWith(n)), `外務省の一覧の名前から作れないのに表に無い: ${n}`);
  }
});

test('contact_form_url', () => {   // URL が入っていれば本物の Google フォーム。まだ無いときはリンクを出さず「準備中」の文だけ
  const h = read('about.html');
  const m = h.match(/<a id="contact-form" href="([^"]+)"/);
  if (m) assert.match(m[1], /^https:\/\/(docs\.google\.com\/forms\/d\/e\/[\w-]{20,}\/viewform|forms\.gle\/\w{10,})$/);
  else assert.ok(h.includes('id="contact-pending"'), 'フォームが無いときは #contact-pending');
});

test('howto_sections', () => {
  const h = read('howto.html');
  for (const id of ['start', 'modes', 'kinds', 'daily', 'rpg', 'book', 'badges', 'profile', 'faq']) assert.match(h, new RegExp(`<h2 id="${id}"`));
  assert.ok(!/<img\b/.test(h));
  assert.ok(!/首都を(当てる|答える)/.test(h.replace('首都を当てる問題はない', '')));   // 首都を問うと読める文がない
});
test('sitemap_lists_pages', () => {
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  for (const p of ['privacy.html', 'about.html', 'howto.html']) assert.ok(locs.includes(`https://chikokunn1011.github.io/country-drill/${p}`), p);
});
test('profile_name_note', () => assert.equal(read('profile.js').match(/本名や学校名は使わないでね/g)?.length, 1));   // 1つの定数を3か所で使う

// ホームの作り直し（B6）: はじめかたの入口の名前を新しいホームに合わせる（「プレイ」はもう無い）
test('howto_start_names', () => {
  const s = read('howto.html').split('<h2 id="start"')[1].split('<h2 ')[0];
  for (const w of ['クイズで遊ぶ', '今日の難問', '冒険']) assert.ok(s.includes(w), w);
  assert.ok(!/［プレイ］|「プレイ」/.test(s));
});
