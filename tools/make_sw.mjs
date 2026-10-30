// D2 アプリ化: sw.js の precache の一覧（PRECACHE）と版（VERSION）を作る。
// index.html と en/index.html（英語版。<base href="../"> なので URL は根からの相対）が読むファイル（?v= 付きのまま）・地図・国旗・
// CSS の textures・manifest のアイコン（manifest のある場所から解決する）を拾う。
// 使い方: node tools/make_sw.mjs（sw.js の // precache:start 〜 // precache:end を書きかえる）
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const START = '// precache:start', END = '// precache:end';
// 先に入れないもの: 外のサイト・管理ページ・国のページ・テーマのページ（英語版も）・ページ内のリンク・data:
const skip = u => /^([a-z][\w+.-]*:|\/\/|#)/i.test(u) || /^admin/.test(u) || /^(en\/)?(country|themes)\//.test(u);
const file = u => (u === './' ? 'index.html' : u === 'en/' ? 'en/index.html' : u.split('?')[0]);

// precache の URL（ページからの相対。?v= 付きはそのまま）
export function swList(root) {
  const read = p => readFileSync(join(root, p), 'utf8');
  const html = read('index.html'), en = read('en/index.html'), out = new Set(['./', 'index.html', 'en/', 'en/index.html']);
  const add = u => { if (!skip(u)) out.add(u); };
  // <script src> と <link href>（canonical・preconnect・hreflang は外のサイトなので skip で落ちる）
  for (const m of (html + en).matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g)) add(m[1]);
  // 地図はあとから読む（mapScript('...')）
  for (const m of (html + en).matchAll(/mapScript\('([^']+)'\)/g)) add(m[1]);
  // 国旗（const flag = a => `flags/${a}.svg?v=${FLAG_V}` を countries.js の全部で）
  const ctx = { window: {} }; vm.runInNewContext(read('countries.js'), ctx);
  for (const page of [html, en]) {
    const fv = page.match(/const FLAG_V = (\d+);/)[1], tpl = page.match(/const flag = a => `([^`]+)`/)[1];
    for (const c of ctx.window.COUNTRIES) add(tpl.replace('${a}', c.a).replace('${FLAG_V}', fv));
  }
  // CSS の url(...)（index.html・en/index.html の中の style と、読む .css）
  const css = [html, en, ...[...out].filter(u => /\.css(\?|$)/.test(u)).map(u => read(file(u)))].join('\n');
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) add(m[1]);
  // manifest のアイコン（manifest のある場所からの相対。en/ の ../icons/… は icons/…）
  for (const m of [...out].filter(u => /\.webmanifest$/.test(u)))
    for (const i of JSON.parse(read(m)).icons ?? []) if (!skip(i.src)) add(posix.normalize(posix.join(posix.dirname(m), i.src)));
  return [...out];
}

// できあがりの sw.js の全文。VERSION は各 URL と中身から作る（同じ入力ならいつも同じ）
export function render(root) {
  const list = swList(root), h = createHash('sha256');
  for (const u of list) h.update(`${u}\n`).update(readFileSync(join(root, file(u)))).update('\n');
  const block = `${START}\nconst VERSION = '${h.digest('hex').slice(0, 12)}';\nconst PRECACHE = ${JSON.stringify(list, null, 2)};\n${END}`;
  const sw = readFileSync(join(root, 'sw.js'), 'utf8'), a = sw.indexOf(START), b = sw.indexOf(END);
  if (a < 0 || b < a) throw new Error('sw.js に // precache:start 〜 // precache:end が無い');
  return sw.slice(0, a) + block + sw.slice(b + END.length);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  writeFileSync(join(root, 'sw.js'), render(root));
  console.log('sw.js を書いた');
}
