// 英語版（PR5）: countries.js の英語の国名 e・首都 ec（英語版 Wikipedia の記事名。括弧の曖昧さ回避と「, 国名」は外す）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { JA_RE } from '../../tools/i18n_scan.mjs';

const root = new URL('../../', import.meta.url);
const SRC = readFileSync(new URL('countries.js', root), 'utf8');
const load = src => { const ctx = { window: {} }; vm.runInNewContext(src, ctx); return ctx.window.COUNTRIES; };
const C = load(SRC);
const byCode = Object.fromEntries(C.map(c => [c.a, c]));

test('names_en_shape', () => {
  assert.equal(C.length, 195);
  const seen = new Set();
  for (const c of C) {
    for (const k of ['e', 'ec']) {
      const v = c[k];
      assert.equal(typeof v, 'string', `${c.a}.${k}`);
      assert.ok(v.length > 0, `${c.a}.${k} は空`);
      assert.equal(v, v.trim(), `${c.a}.${k} の前後に空白`);
      assert.ok(!JA_RE.test(v), `${c.a}.${k} に日本語: ${v}`);
      assert.ok(!v.includes('('), `${c.a}.${k} に括弧: ${v}`);
    }
    assert.ok(!seen.has(c.e), `e が重複: ${c.e}`);
    seen.add(c.e);
  }
});

test('names_en_examples', () => {
  const ex = {
    ci: 'Ivory Coast', cz: 'Czech Republic', sz: 'Eswatini', tl: 'East Timor', va: 'Vatican City',
    mk: 'North Macedonia', cv: 'Cape Verde', gm: 'The Gambia', bs: 'The Bahamas', ge: 'Georgia',
    ie: 'Ireland', cg: 'Republic of the Congo', cd: 'Democratic Republic of the Congo',
    fm: 'Federated States of Micronesia', mm: 'Myanmar', tr: 'Turkey', kr: 'South Korea', kp: 'North Korea',
    us: 'United States', gb: 'United Kingdom', xk: 'Kosovo', st: 'São Tomé and Príncipe', la: 'Laos',
    ru: 'Russia', sy: 'Syria', bn: 'Brunei', md: 'Moldova', vn: 'Vietnam',
  };
  for (const [a, e] of Object.entries(ex)) assert.equal(byCode[a].e, e, a);
});

test('capitals_en_examples', () => {
  const ex = {
    jp: 'Tokyo', us: 'Washington, D.C.', bs: 'Nassau', sc: 'Victoria', lk: 'Sri Jayawardenepura Kotte',
    xk: 'Pristina', md: 'Chișinău', ch: 'Bern', va: 'Vatican City', mm: 'Naypyidaw',
    bn: 'Bandar Seri Begawan', bj: 'Porto-Novo',
  };
  for (const [a, ec] of Object.entries(ex)) assert.equal(byCode[a].ec, ec, a);
});

test('countries_same_otherwise', (t) => {
  let main;
  try {
    main = execFileSync('git', ['show', 'origin/main:countries.js'], { cwd: new URL('.', root), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { t.skip('origin/main が無い'); return; }
  const strip = list => list.map(({ e, ec, ...rest }) => rest);
  assert.deepEqual(JSON.parse(JSON.stringify(strip(C))), JSON.parse(JSON.stringify(load(main))));
  // 1行のまま
  assert.equal(SRC.trimEnd().split('\n').length, 1);
});
