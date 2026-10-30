// D2 アプリ化: sw.js の precache の一覧と版（VERSION）は tools/make_sw.mjs が作る。手で書かない
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { swList, render } from '../../tools/make_sw.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const version = s => s.match(/const VERSION = '([0-9a-f]{12})';/)?.[1];
const precache = s => JSON.parse(s.match(/const PRECACHE = (\[[^\]]*\]);/)[1]);
// リポジトリを一時ディレクトリに写す（.git・node_modules は写さない）
const copyRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-'));
  cpSync(ROOT, dir, { recursive: true, filter: s => !/[\\/](\.git|node_modules)$/.test(s) });
  return dir;
};

test('sw_is_current', () => {
  assert.ok(render(ROOT) === read('sw.js'), 'sw.js が古い。node tools/make_sw.mjs を流して');
});

test('sw_list_has_core', () => {
  const list = swList(ROOT), html = read('index.html');
  const has = u => assert.ok(list.includes(u), u);
  for (const u of ['./', 'index.html', 'world.js?v=1', 'vendor/d3-7.9.0.min.js', 'vendor/topojson-client-3.1.0.min.js',
    'countries.js', 'trivia.js', 'manifest.webmanifest', 'icons/icon-192.png']) has(u);
  const v = [...html.matchAll(/(?:src|href)="([\w.-]+\.(?:js|css)\?v=\d+)"/g)].map(m => m[1]);
  assert.ok(v.length > 20);
  v.forEach(has);
  const ctx = { window: {} }; vm.runInNewContext(read('countries.js'), ctx);
  const fv = html.match(/const FLAG_V = (\d+);/)[1];
  assert.equal(ctx.window.COUNTRIES.length, 195);
  for (const c of ctx.window.COUNTRIES) has(`flags/${c.a}.svg?v=${fv}`);
  const tex = [...(html + read('rpg.css')).matchAll(/url\("?(textures\/[\w.-]+)"?\)/g)].map(m => m[1]);
  assert.ok(tex.length >= 4);
  tex.forEach(has);
  for (const u of list) {
    assert.ok(!/^admin/.test(u) && !u.startsWith('country/') && !/^[a-z]+:|^\/\//i.test(u), u);
  }
  assert.equal(new Set(list).size, list.length);
});

test('sw_version_changes', () => {
  const dir = copyRepo();
  try {
    const before = version(render(dir));
    const p = join(dir, 'countries.js'), s = readFileSync(p, 'utf8');
    writeFileSync(p, s.replace('アフガニスタン', 'アフガニスタソ'));
    const after = version(render(dir));
    assert.ok(before && after && before !== after);
    assert.equal(version(render(dir)), after);   // 同じ入力なら同じ
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('sw_version_follows_v', () => {
  const dir = copyRepo();
  try {
    const a = render(dir), n = +read('index.html').match(/pc\.css\?v=(\d+)/)[1];
    // en/index.html は make_en が index.html から作るので、?v= もいっしょに上がる
    for (const f of ['index.html', 'en/index.html']) {
      const p = join(dir, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace(`pc.css?v=${n}`, `pc.css?v=${n + 1}`));
    }
    const b = render(dir);
    assert.ok(precache(a).includes(`pc.css?v=${n}`));
    assert.ok(precache(b).includes(`pc.css?v=${n + 1}`) && !precache(b).includes(`pc.css?v=${n}`));
    assert.notEqual(version(a), version(b));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// 英語版（PR5）: en/index.html（<base href="../"> なので URL は根からの相対）が読むもの・en/ の manifest とそのアイコンも入れる
test('sw_list_en', () => {
  const list = swList(ROOT), en = read('en/index.html');
  const has = u => assert.ok(list.includes(u), u);
  for (const u of ['en/', 'en/index.html', 'en/manifest.webmanifest', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) has(u);
  const dict = [...en.matchAll(/src="(i18n\/en-[\w-]+\.js\?v=\d+)"/g)].map(m => m[1]);
  assert.ok(dict.includes('i18n/en-core.js?v=1'), dict.join());
  dict.forEach(has);
  // ブラウザが読まない辞書（make_en が使う en-html.js）は入れない
  assert.ok(!list.some(u => u.startsWith('i18n/en-html.js')));
  for (const u of list) assert.ok(!u.startsWith('en/country/') && !u.startsWith('en/themes/') && !u.startsWith('../'), u);
  // en/ の manifest のアイコンは manifest のある場所（en/）からの相対（../icons/…）。根からの path（icons/…）にして入れる
  const icons = JSON.parse(read('en/manifest.webmanifest')).icons;
  assert.ok(icons.length >= 4);
  for (const { src } of icons) {
    assert.match(src, /^\.\.\/icons\//, src);
    const u = posix.normalize(posix.join('en', src));
    assert.equal(u, src.slice(3));
    has(u);
    assert.ok(!list.some(x => x.includes(src)), src);
  }
  assert.ok(!list.some(u => u.split('/').includes('..')));
  assert.equal(new Set(list).size, list.length);
});
