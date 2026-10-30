// 英語版（PR5）: index.html から en/index.html を、embed.html から en/embed.html を作る。
//   ・<html lang="en">・<base href="../">（ファイルはルートのものをそのまま読む）・canonical / og / manifest を英語版に
//   ・未訳の機能の script（EN_SKIP）を外し、i18n.js のすぐ後に英語の辞書 i18n/en-*.js を入れる
//   ・HTML の文字を辞書（i18n/en-*.js と、HTML だけの i18n/en-html.js）で置きかえる。訳の無い日本語が残れば止まる
//   ・言語の切りかえ（langsw の目印のあいだ）を英語版のものに、英語の端末への案内（#home-en）を外す
// 使い方: node tools/make_en.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JA_RE } from './i18n_scan.mjs';
import { SITE } from './make_country_pages.mjs';

// 英語のページで読まない script（未訳の機能）
export const EN_SKIP = ['trivia.js', 'rpg-core.js', 'rpg.js', 'rpg-cards.js', 'rpg-battle.js', 'rpg-team.js', 'rpg-rank.js', 'badges.js'];
// ページごとの辞書（i18n/<名前>.js。まだ無いファイルは入れない）
export const EN_DICTS = { 'index.html': ['en-core', 'en-quiz', 'en-rank', 'en-book', 'en-dojo', 'en-profile', 'en-daily'], 'embed.html': ['en-embed'] };
// 英語版があるページ（<a href> の # の前がこれなら頭に en/）
export const EN_PAGES = ['./', 'index.html', 'howto.html', 'about.html', 'privacy.html', 'country/', 'themes/', 'embed.html'];

// 置きかえる属性
const ATTRS = /(\s(?:aria-label|title|alt|placeholder|content|label)=")([^"]*)(")/g;
// script・style・コメント・タグ・文字に切る
const TOKENS = /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<[^>]*>|[^<]+/g;

const dictVer = (root, name) => readFileSync(join(root, 'i18n', name + '.js'), 'utf8').match(/^\/\/ v=(\d+)/)?.[1];

export function readEnInputs(root) {
  const read = p => readFileSync(join(root, p), 'utf8');
  // 辞書は Object.assign(window.I18N_EN ??= {}, {…}) の形。en-html.js（HTML だけの文）は最後に読み、同じキーなら勝つ
  const dir = join(root, 'i18n');
  const files = existsSync(dir) ? readdirSync(dir).filter(f => /^en-[\w-]+\.js$/.test(f) && f !== 'en-html.js').sort() : [];
  if (existsSync(join(dir, 'en-html.js'))) files.push('en-html.js');
  const ctx = { window: {} };
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(read(`i18n/${f}`), ctx, { filename: f });
  // 辞書ごとの v=（ページに入れる script の ?v=）。あるファイルだけ
  const vers = {};
  for (const names of Object.values(EN_DICTS)) for (const n of names) if (existsSync(join(dir, n + '.js'))) {
    const v = dictVer(root, n);
    if (!v) throw new Error(`i18n/${n}.js の1行目に // v=<数> が無い`);
    vers[n] = v;
  }
  return { index: read('index.html'), embed: read('embed.html'), dict: { ...(ctx.window.I18N_EN ?? {}) }, vers };
}

// 置きかえる文字のエスケープ（& は文字参照に見えるときだけ）
const escText = s => s.replace(/&(?=[#\w])/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => escText(s).replace(/"/g, '&quot;');

// 辞書を引く（日本語をふくむときだけ）。無ければそのまま（最後のチェックで止まる）
const look = (s, dict, used) => {
  if (!JA_RE.test(s) || !Object.hasOwn(dict, s)) return null;
  const v = dict[s];
  if (typeof v !== 'string') throw new Error(`HTML の文に { one, other } の訳は使えない: ${s}`);
  used.add(s);
  return v;
};

const translateAttrs = (tag, dict, used) => tag.replace(ATTRS, (m, a, v, z) => {
  const t = look(v, dict, used);
  return t === null ? m : a + escAttr(t) + z;
});

// ld+json: name・description を訳し、inLanguage と url を英語版に
const translateLd = (json, dict, used) => {
  const o = JSON.parse(json);
  for (const k of ['name', 'description']) if (typeof o[k] === 'string') o[k] = look(o[k], dict, used) ?? o[k];
  if ('inLanguage' in o) o.inLanguage = 'en';
  if (o.url === SITE) o.url = SITE + 'en/';
  return JSON.stringify(o);
};

// 中身を持たない要素（lang="ja" を付けても閉じタグが無い）
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// html を字句に切り、each(tok, inJa) の返り値でつなぐ。inJa は lang="ja" の要素（<html> は除く）の開きタグから
// 閉じタグまで（同じ名前の入れ子は数える）
function mapTokens(html, each) {
  let jaTag = null, jaDepth = 0;
  return html.replace(TOKENS, tok => {
    if (jaDepth) {
      const m = tok.match(/^<(\/?)(\w+)\b[^>]*?(\/?)>$/);
      if (m && m[2].toLowerCase() === jaTag && !m[3]) jaDepth += m[1] ? -1 : 1;
      return each(tok, true);
    }
    const open = tok.match(/^<(\w+)\b[^>]*\slang="ja"[^>]*>$/);
    if (open && open[1].toLowerCase() !== 'html') {
      const name = open[1].toLowerCase();
      if (!VOID.has(name) && !tok.endsWith('/>')) { jaTag = name; jaDepth = 1; }
      return each(tok, true);
    }
    return each(tok, false);
  });
}

// CSS の content の代わりの文（content: "✓" / "正解"）は読み上げで聞こえるので訳す。コメントの中は見ない。
// 訳の無いものは残り、translateHtml の最後のチェックで止まる
const CSS_ALT = /(\/\*[\s\S]*?\*\/)|(content:[^;}]*?\/\s*")([^"]*)(")/g;
const translateCss = (css, dict, used) => css.replace(CSS_ALT, (m, cmt, a, v, z) => {
  if (cmt) return m;
  const t = look(v, dict, used);
  return t === null ? m : a + t.replace(/["\\]/g, '\\$&') + z;
});
const cssAltLeft = html => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
  .flatMap(m => [...m[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/content:[^;}]*/g)].map(c => c[0]).filter(c => JA_RE.test(c)));

export function translateHtml(html, dict, used = new Set()) {
  // lang="ja" の要素の中は訳さない（言語の切りかえの「日本語」など）
  const out = mapTokens(html, (tok, inJa) => {
    if (inJa || tok.startsWith('<!--')) return tok;
    if (/^<style\b/.test(tok)) return translateCss(tok, dict, used);
    if (/^<script\b/.test(tok)) {
      const m = tok.match(/^(<script\b[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)$/);
      return m ? m[1] + '\n' + translateLd(m[2], dict, used) + '\n' + m[3] : tok;
    }
    if (tok.startsWith('<')) return translateAttrs(tok, dict, used);
    const [, pre, core, post] = tok.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const t = look(core, dict, used);
    return t === null ? tok : pre + escText(t) + post;
  });
  // 全角の空白も日本語の文字なので、trim する前に見る
  const left = [...new Set([...visibleText(out).split(/[<>"]/).filter(s => JA_RE.test(s)).map(s => s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '')),
    ...cssAltLeft(out)])];
  if (left.length) throw new Error('英語の訳が無い文:\n' + left.join('\n'));
  return out;
}

// script・style・コメント・lang="ja" の要素（<html> は除く）を外したもの
function visibleText(html) {
  return mapTokens(html, (tok, inJa) => inJa || /^<(?:!--|script\b|style\b)/.test(tok) ? '' : tok);
}

// <a href> の行き先を英語版に（EN_PAGES のものだけ）。script・style・コメントの中の文字は変えない
const enLinks = html => html.replace(TOKENS, tok => !/^<a\b/.test(tok) ? tok : tok.replace(/^(<a\b[^>]*?\shref=")([^"]*)(")/, (m, a, href, z) => {
  const [path, ...hash] = href.split('#');
  if (!EN_PAGES.includes(path)) return m;
  return a + (path === './' ? 'en/' : 'en/' + path) + (hash.length ? '#' + hash.join('#') : '') + z;
}));

// 1か所だけのはずの置きかえ（無ければ止まる）
const once = (html, from, to) => {
  if (!html.includes(from)) throw new Error('見つからない: ' + from);
  return html.replace(from, to);
};

// 言語の切りかえ（index.html の <!-- langsw:start --> と <!-- langsw:end --> のあいだ）の英語版。「日本語」が日本語版へのリンク
export const LANGSW_EN = '<span class="langsw"><a href="./" hreflang="ja" lang="ja">日本語</a> / <b lang="en">English</b></span>';
const LANGSW = /(<!-- langsw:start -->)[\s\S]*?(<!-- langsw:end -->)/g;

function renderPage(html, page, inp, used) {
  html = once(html, '<html lang="ja">', '<html lang="en">');
  html = once(html, '<meta charset="utf-8">\n', '<meta charset="utf-8">\n<base href="../">\n');
  html = once(html, `<link rel="canonical" href="${SITE}">`, `<link rel="canonical" href="${SITE}en/">`);
  // 未訳の機能の script を外す
  html = html.replace(/<script src="([\w.-]+?)(?:\?v=\d+)?"><\/script>\n/g, (m, f) => EN_SKIP.includes(f) ? '' : m);
  // i18n.js のすぐ後に辞書
  const dicts = (EN_DICTS[page] ?? []).filter(n => n in inp.vers).map(n => `\n<script src="i18n/${n}.js?v=${inp.vers[n]}"></script>`).join('');
  html = html.replace(/<script src="i18n\.js\?v=\d+"><\/script>/, m => m + dicts);
  // 英語の端末への英語版の案内（#home-en）は日本語版だけ
  html = html.replace(/^[ \t]*<p class="home-en" id="home-en"[^\n]*\n/m, '');
  // 言語の切りかえは中を空けておき、リンクの書きかえ・翻訳・残りのチェックのあとで英語版のものを入れる
  html = html.replace(LANGSW, '$1$2');
  html = translateHtml(enLinks(html), inp.dict, used);
  return html.replace(LANGSW, '$1' + LANGSW_EN + '$2');
}

export function renderEn(inp, used = new Set()) {
  let html = inp.index;
  html = once(html, `<meta property="og:url" content="${SITE}">`, `<meta property="og:url" content="${SITE}en/">`);
  html = once(html, '<meta property="og:locale" content="ja_JP">', '<meta property="og:locale" content="en_US">');
  html = once(html, `<meta property="og:image" content="${SITE}icons/ogp.png">`, `<meta property="og:image" content="${SITE}icons/ogp-en.png">`);
  html = once(html, '<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="en/manifest.webmanifest">');
  // 埋めこみ: noindex はそのまま。今日の難問へのリンク #e-daily（./#daily）は enLinks で英語版の en/#daily に
  return { 'en/index.html': renderPage(html, 'index.html', inp, used), 'en/embed.html': renderPage(inp.embed, 'embed.html', inp, used) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const inp = readEnInputs(root), used = new Set();
  for (const [p, s] of Object.entries(renderEn(inp, used))) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), s);
    console.log(p + ' を書いた');
  }
  // en-html.js の使っていないキー（index.html から消えた文）を知らせる
  const ctx = { window: {} };
  if (existsSync(join(root, 'i18n/en-html.js'))) {
    vm.runInNewContext(readFileSync(join(root, 'i18n/en-html.js'), 'utf8'), ctx);
    const unused = Object.keys(ctx.window.I18N_EN ?? {}).filter(k => !used.has(k));
    if (unused.length) console.warn('en-html.js で使っていないキー:\n' + unused.join('\n'));
  }
}
