// キャッシュよけ: このブランチで中身を変えた js/css は、index.html の ?v= を origin/main のものより上げる
// （同じ ?v= のままだと、前の版を開いた人のブラウザに古いファイルが残り、新しいファイルと混ざって動かない）。ブラウザは使わない
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
// index.html の「ファイル名 → ?v= の数」
const versions = html => Object.fromEntries([...html.matchAll(/(?:src|href)="([\w.-]+\.(?:js|css))\?v=(\d+)"/g)].map(m => [m[1], +m[2]]));

test('changed_files_bump_version', t => {
  let base, mainHtml;
  try { base = git('merge-base', 'origin/main', 'HEAD').trim(); mainHtml = git('show', 'origin/main:index.html'); } catch {
    t.diagnostic('origin/main が無いので比べない');
    return;
  }
  const mine = versions(readFileSync(join(ROOT, 'index.html'), 'utf8')), main = versions(mainHtml);
  const problems = [];
  for (const [file, v] of Object.entries(mine)) {
    if (!(file in main)) continue;   // このブランチで足したファイル
    // 分かれたところから、このブランチ（作業中の変更も入れる）で中身が変わったか
    const changed = git('diff', '--name-only', base, '--', file).trim() !== '';
    if (changed && v <= main[file]) problems.push(`${file}: ?v=${v}（origin/main は ?v=${main[file]}）`);
  }
  assert.deepEqual(problems, []);
});
