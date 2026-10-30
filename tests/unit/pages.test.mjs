// 読み物のページ（privacy・about・howto）とフッターを、ファイルの文字のまま確かめる
// （B1 の country/*.html と E1 の themes/*.html も PAGES に入る。PR9 の embed.html は BLOCKS・PAGE_VARS・varsOf で変数を比べる）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { MOFA_NAMES, MOFA_OTHER } from './mofa-names.mjs';

const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');

// フッター（<!-- footer:start -->〜<!-- footer:end -->）を持つページ
export const PAGES = ['index.html', 'privacy.html', 'about.html', 'howto.html',
  ...readdirSync(new URL('country/', root)).filter(f => f.endsWith('.html')).sort().map(f => `country/${f}`),
  ...readdirSync(new URL('themes/', root)).filter(f => f.endsWith('.html')).sort().map(f => `themes/${f}`)];
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
  for (const p of PAGES) assert.deepEqual(footerHrefs(read(p)), ['howto.html', 'about.html', 'about.html#contact', 'privacy.html', 'country/', 'themes/'], p);
});

test('footer_not_in_admin', () => assert.ok(!read('admin.html').includes('footer:start')));

test('pages_css_vars_match_index', () => {
  const index = read('index.html');
  // pages.css は読み物のページが使う変数、embed.html（単独で動く埋めこみ）は書いてある変数を全部、index.html と比べる
  for (const [f, names] of [['pages.css', () => PAGE_VARS], ['embed.html', block => Object.keys(varsOf(read('embed.html'), block))]]) {
    for (const block of BLOCKS) {
      const want = varsOf(index, block), got = varsOf(read(f), block);
      assert.ok(Object.keys(want).length > 0, `index.html に ${block} が無い`);
      for (const v of names(block)) if (v in want) assert.equal(got[v], want[v], `${f} ${block} ${v}`);
      if (f === 'embed.html') for (const v of names(block)) assert.ok(v in want, `${f} ${block} ${v} は index.html に無い`);
    }
  }
});

// 埋めこみ（embed.html）: daily-core.js の ?v= は index.html と同じ。検索に載せない。読むのは4つの script だけ。端末のデータ・Supabase・広告・フォントを使わない
test('embed_head', () => {
  const h = read('embed.html'), v = s => s.match(/daily-core\.js\?v=(\d+)/)[1];
  assert.equal(v(h), v(read('index.html')));
  assert.match(h, /<meta name="robots" content="noindex">/);
  assert.ok(h.includes('<link rel="canonical" href="https://chikokunn1011.github.io/country-drill/">'));
  for (const b of BLOCKS) assert.ok(Object.keys(varsOf(h, b)).length > 0, b);   // 3か所ある
  assert.deepEqual([...h.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].split('?')[0]), ['i18n.js', 'countries.js', 'daily-core.js', 'embed.js']);
  assert.ok(!/fonts\.googleapis|<link rel="stylesheet"/.test(h));
  assert.ok(!h.includes('footer:start'));
  assert.ok(!read('sitemap.xml').includes('embed'));
  assert.match(read('embed.js'), new RegExp(`const FLAG_V = ${read('index.html').match(/const FLAG_V = (\d+);/)[1]};`));
  for (const s of [h, read('embed.js')]) assert.ok(!/localStorage|sessionStorage|supabase|adsbygoogle/i.test(s));
});

// 埋めこみの img の alt に国名を書かない（読み上げや画像が出ないときに答えが分かってしまう）
test('no_answer_in_alt', () => {
  for (const s of [read('embed.html'), read('embed.js')]) {
    for (const m of s.matchAll(/alt\s*=\s*["'`]([^"'`]*)["'`]|\.alt\s*=\s*([^;]+);/g)) {
      const alt = m[1] ?? m[2];
      assert.ok(/^["'`]?(今日の国旗)?["'`]?$|^T\('今日の国旗'\)$/.test(alt.trim()), `alt に国名が入るかもしれない: ${alt}`);
    }
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
    const [path, id] = href.split('#'), file = path.endsWith('/') ? path + 'index.html' : path;   // country/ → country/index.html
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
  for (const s of ['Supabase', 'IP アドレス', 'GitHub Pages', 'Google Fonts', '地図の部品（d3・topojson-client）はこのサイトの中に置いて配っています', 'Cookie', 'https://adssettings.google.com', 'https://policies.google.com/technologies/ads', '利用する場合があります', 'アクセス解析']) assert.ok(h.includes(s), s);
  assert.match(h, /最終更新日: \d{4}年\d{1,2}月\d{1,2}日/);
  // B4 のあとは CDN を使わない
  for (const s of ['cdnjs', 'jsDelivr']) assert.ok(!h.includes(s), s);
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
  for (const id of ['start', 'modes', 'kinds', 'daily', 'rpg', 'book', 'badges', 'profile', 'embed', 'faq']) assert.match(h, new RegExp(`<h2 id="${id}"`));
  assert.ok(!/<img\b/.test(h));
  assert.ok(!/首都を(当てる|答える)/.test(h.replace('首都を当てる問題はない', '')));   // 首都を問うと読める文がない
});
// 埋めこみの貼り付けコード（高さと幅は tests/e2e/embed.test.mjs の fits_snippet_box と同じ）
test('howto_embed', () => {
  const h = read('howto.html'), snip = '<iframe src="https://chikokunn1011.github.io/country-drill/embed.html" title="今日の国旗（国旗マスター）" width="100%" height="460" style="max-width:400px;border:0" loading="lazy"></iframe>';
  assert.match(h, /<h2 id="embed"/);
  assert.ok(h.includes(snip.replace(/</g, '&lt;').replace(/>/g, '&gt;')));   // < と > だけエスケープ（" はそのまま）
  assert.ok(h.includes('?theme=dark') && h.includes('?theme=auto'));
  assert.ok(!/<iframe\b/.test(h));   // ページの中で実際に埋めこまない（コードとして見せるだけ）
  assert.ok(!footerHrefs(h).some(x => x.includes('embed')));   // フッターには足さない
});
test('sitemap_lists_pages', () => {
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  for (const p of ['privacy.html', 'about.html', 'howto.html', 'en/', 'en/howto.html', 'en/about.html', 'en/privacy.html']) assert.ok(locs.includes(`https://chikokunn1011.github.io/country-drill/${p}`), p);
});
test('profile_name_note', () => assert.equal(read('profile.js').match(/本名や学校名は使わないでね/g)?.length, 1));   // 1つの定数を3か所で使う

// ホームの作り直し（B6）: はじめかたの入口の名前を新しいホームに合わせる（「プレイ」はもう無い）
test('howto_start_names', () => {
  const s = read('howto.html').split('<h2 id="start"')[1].split('<h2 ')[0];
  for (const w of ['クイズで遊ぶ', '今日の難問', '冒険']) assert.ok(s.includes(w), w);
  assert.ok(!/［プレイ］|「プレイ」/.test(s));
});

// 遊び方ページ: 白地図タップ（A7）を5つ目の出し方として書き、練習と挑戦だけで遊べると書く
test('howto_tap', () => {
  const s = read('howto.html').split('<h2 id="modes"')[1].split('<h2 ')[0];
  assert.ok(s.includes('白地図タップ'));
  assert.match(s, /練習と挑戦/);
  assert.ok(!/4つの出し方/.test(read('howto.html')));
});

// 英語版（PR5 Task 14）: 手で書いた en/howto.html・en/about.html・en/privacy.html
const SITE_URL = 'https://chikokunn1011.github.io/country-drill/';
const EN_PAGES = { 'en/howto.html': ['howto.html', 'How to play | Flag Master'], 'en/about.html': ['about.html', 'About | Flag Master'], 'en/privacy.html': ['privacy.html', 'Privacy policy | Flag Master'] };
const JA_CHARS = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}　-〿・ー！-｠]/u;   // tools/i18n_scan.mjs の JA_RE と同じ（下で確かめる）
// フッターの href を、ページの URL（<base href> があればそれ）から絶対 URL にする
const footerAbs = (p, html) => {
  const m = /<!-- footer:start -->([\s\S]*?)<!-- footer:end -->/.exec(html);
  if (!m) return [];
  const base = new URL(/<base href="([^"]+)">/.exec(html)?.[1] ?? '.', SITE_URL + p);
  return [...m[1].matchAll(/href="([^"]*)"/g)].map(x => new URL(x[1], base).href);
};

test('en_pages_head', async () => {
  const { JA_RE } = await import('../../tools/i18n_scan.mjs');
  assert.equal(JA_CHARS.source, JA_RE.source);
  const indexTheme = themeScript(read('index.html'));
  for (const [p, [ja, title]] of Object.entries(EN_PAGES)) {
    const h = read(p), jh = read(ja);
    assert.match(h, /^<!doctype html>\n<html lang="en">/, p);
    assert.ok(h.includes(`<title>${title}</title>`), p);
    assert.match(h, /<meta name="description" content="[^"]{20,}">/, p);
    assert.ok(h.includes(`<link rel="canonical" href="${SITE_URL}${p}">`), p);
    for (const [doc] of [[h], [jh]]) {
      assert.ok(doc.includes(`<link rel="alternate" hreflang="ja" href="${SITE_URL}${ja}">`), `${p} / ${ja} ja`);
      assert.ok(doc.includes(`<link rel="alternate" hreflang="en" href="${SITE_URL}${p}">`), `${p} / ${ja} en`);
      assert.ok(doc.includes(`<link rel="alternate" hreflang="x-default" href="${SITE_URL}${ja}">`), `${p} / ${ja} x-default`);
    }
    assert.equal(h.match(/href="\.\.\/pages\.css\?v=(\d+)"/)?.[1], jh.match(/href="pages\.css\?v=(\d+)"/)[1], p);
    assert.equal(themeScript(h), indexTheme, p);
    assert.ok(h.includes('<a class="back" href="./">← Play Flag Master</a>'), p);
    // 言語の切りかえ: 英語版は日本語のページへ、日本語版は英語のページへ
    assert.ok(h.includes(`<span class="langsw"><a href="../${ja}" hreflang="ja" lang="ja">日本語</a> / <b lang="en">English</b></span>`), p);
    assert.ok(jh.includes(`<span class="langsw"><b>日本語</b> / <a href="${p}" hreflang="en" lang="en">English</a></span>`), ja);
  }
});

test('en_footer_links_same', () => {
  const want = footerAbs('en/index.html', read('en/index.html'));
  assert.deepEqual(want, ['howto.html', 'about.html', 'about.html#contact', 'privacy.html', 'country/', 'themes/'].map(x => SITE_URL + 'en/' + x));
  const pages = [...Object.keys(EN_PAGES), ...readdirSync(new URL('en/country/', root)).filter(f => f.endsWith('.html')).map(f => `en/country/${f}`)];
  for (const p of pages) assert.deepEqual(footerAbs(p, read(p)), want, p);
  for (const p of Object.keys(EN_PAGES)) for (const u of want) {   // 行き先がある
    const [path, id] = u.slice(SITE_URL.length).split('#'), file = path.endsWith('/') ? path + 'index.html' : path;
    assert.ok(existsSync(new URL(file, root)), `${p}: ${file}`);
    if (id) assert.ok(read(file).includes(`id="${id}"`), `${p}: ${file} #${id}`);
  }
});

test('en_pages_no_japanese', () => {
  for (const p of Object.keys(EN_PAGES)) {
    const body = read(p).replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(\w+)\b[^>]*\slang="ja"[^>]*>[\s\S]*?<\/\1>/g, '');
    assert.deepEqual(body.split('\n').filter(l => JA_CHARS.test(l)), [], p);
  }
});

test('en_howto_only_available', () => {
  const h = read('en/howto.html');
  for (const w of ['Time Attack', 'Ranking', 'Leaderboard', 'Daily', 'Adventure', 'Badges', 'Profile']) assert.ok(!h.includes(w), w);
  for (const id of ['start', 'modes', 'kinds', 'book', 'embed', 'faq']) assert.match(h, new RegExp(`<h2 id="${id}"`), id);
  // 用語は辞書（i18n/en-*.js）と同じ
  for (const w of ['Play quiz', 'Choose a mode', 'Flag → Name', 'Name → Flag', 'Location → Flag', 'Flag → Location', 'Tap the map', 'Practice', 'Challenge', 'Answer style', 'Gallery', 'Settings', 'Look-alike Flags Dojo', 'Add to home screen']) assert.ok(h.includes(w), w);
  assert.ok(h.includes('&lt;iframe src="https://chikokunn1011.github.io/country-drill/en/embed.html"'));
  assert.ok(h.includes('en/embed.html?theme=dark') || h.includes('embed.html?theme=dark'));
  assert.ok(!/<iframe\b/.test(h) && !/<img\b/.test(h));
  assert.ok(!/(guess|name|answer|quiz(zes)? on)( the)? capitals?\b/i.test(h.replace(/no questions? (that )?asks? (for|about) capitals/gi, '')));
});

test('en_about_text', () => {
  const h = read('en/about.html');
  for (const id of ['purpose', 'operator', 'rules', 'country-names', 'borders', 'credits', 'contact']) assert.match(h, new RegExp(`<h2 id="${id}"`), id);
  assert.match(h, /<a id="contact-form" href="https:\/\/forms\.gle\/66hqFeGYF47CggGS7"/);
  for (const s of ['Chiko', 'university student', 'Claude', 'Anthropic', 'English Wikipedia', 'Natural Earth', 'flag-icons', 'world-atlas', 'world-countries', 'ODbL', 'in English']) assert.ok(h.includes(s), s);
  assert.ok(!h.includes('<table'));   // 日本語の国名の例外の表は訳さない
});

test('en_privacy_sections', () => {
  const h = read('en/privacy.html'), ja = read('privacy.html');
  const ids = s => [...s.matchAll(/<h2 id="([^"]+)"/g)].map(m => m[1]);
  assert.equal((h.match(/<h2\b/g) ?? []).length, (ja.match(/<h2\b/g) ?? []).length);
  assert.deepEqual(ids(h), ids(ja));
  assert.equal((h.match(/<h3\b/g) ?? []).length, (ja.match(/<h3\b/g) ?? []).length);
  assert.match(h, /<h3 id="transfer">/);
  assert.ok(h.includes('offline'));   // サイトのファイルを端末に保存する（PWA）の1行
  for (const s of ['Supabase', 'IP address', 'GitHub Pages', 'Google Fonts', 'Cookie', 'https://adssettings.google.com', 'https://policies.google.com/technologies/ads', 'may use', 'analytics']) assert.ok(h.includes(s), s);
  assert.match(h, /Last updated: October 29, 2026/);
});
