// B4: 国旗は flags/<a>.svg を1枚ずつ（flags.js は無い）。地図の部品は vendor/ に置いて、起動時には読まない
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const C = (() => { const ctx = { window: {} }; vm.runInNewContext(read('countries.js'), ctx); return [...ctx.window.COUNTRIES]; })();

test('flag_files_match_countries', () => {   // 使っていない svg も、足りない svg も無い
  assert.deepEqual(readdirSync(new URL('flags', root)).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)).sort(), [...C.map(c => c.a)].sort());
  assert.equal(C.length, 195);
});
test('flag_files_are_svg', () => {
  for (const c of C) {
    const s = read(`flags/${c.a}.svg`);
    assert.match(s, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, c.a);
    assert.match(s, /viewBox="0 0 640 480"/, c.a);
  }
});
test('flags_js_gone', () => {
  assert.ok(!existsSync(new URL('flags.js', root)));
  const h = read('index.html');
  assert.ok(!h.includes('flags.js') && !h.includes('FLAGS['));
  assert.match(h, /const FLAG_V = 1;/);
  assert.match(h, /flags\/\$\{a\}\.svg\?v=\$\{FLAG_V\}/);
});
test('home_flags_lazy', () => assert.match(read('index.html'), /\$\('home-flags'\)\.innerHTML = [^\n]*loading="lazy"/));
