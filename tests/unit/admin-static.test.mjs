// 管理ページまわりのファイルの中身を、そのまま文字として確かめる（強い鍵を書いていない・検索に載せない）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');

test('keys_are_publishable_and_same_as_ranking', () => {
  const keyOf = (file, name) => {
    const m = new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`).exec(read(file));
    assert.ok(m, `${file} に ${name} が無い`);
    return m[1];
  };
  const admin = keyOf('admin-api.js', 'DEFAULT_KEY'), ranking = keyOf('ranking.js', 'SUPABASE_KEY');
  assert.match(admin, /^sb_publishable_/, 'admin-api.js は公開用キーだけ');
  assert.match(ranking, /^sb_publishable_/, 'ranking.js は公開用キーだけ');
  assert.equal(admin, ranking, '本編と同じキー');
  assert.equal(keyOf('admin-api.js', 'DEFAULT_URL'), keyOf('ranking.js', 'SUPABASE_URL'), '本編と同じ URL');
});

test('no_secret_keys_in_admin_files', () => {
  const files = ['admin.html', 'ranking.js', ...readdirSync(root).filter(f => /^admin.*\.js$/.test(f)).sort()];
  assert.ok(files.includes('admin.js') && files.includes('admin-api.js') && files.includes('admin-save.js'), files.join(', '));
  // sb_secret_ は新しい秘密キー、eyJhbGci は JWT の頭（古い service_role / anon キー）
  for (const f of files) for (const bad of ['sb_secret_', 'eyJhbGci', 'service_role']) assert.equal(read(f).includes(bad), false, `${f} に ${bad}`);
});

test('admin_page_is_not_listed_for_search', () => {
  assert.equal(/admin/i.test(read('sitemap.xml')), false, 'sitemap.xml に admin を載せない');
  if (existsSync(new URL('robots.txt', root))) assert.equal(/admin/i.test(read('robots.txt')), false, 'robots.txt に admin を書かない（場所を教えることになる）');
  assert.match(read('admin.html'), /<meta name="robots" content="noindex, nofollow">/);
});
