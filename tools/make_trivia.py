#!/usr/bin/env python3
# 豆知識の元データ（{a, k, t, note} の配列の JSON）から trivia.js（window.TRIVIA）を作る。
# 全部の項目を確かめてから書き、だめな項目が1つでもあればファイルを書かずに止まる。note は入れない。
# 使い方: python3 tools/make_trivia.py [src] [out]
#   省略時はリポジトリ直下の data/trivia_facts.json と trivia.js（スクリプトの場所から求めるので、どこから動かしても同じ）
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KINDS = ('flag', 'geo', 'culture')
HEAD = '// 豆知識（事実チェック済み）。tools/make_trivia.py が data/trivia_facts.json から作る。手で書きかえない'


# 1項目を確かめる。だめならその理由、よければ None
def problem(it):
    if not isinstance(it, dict):
        return 'オブジェクトでない'
    a, k, t = it.get('a'), it.get('k'), it.get('t')
    if not (isinstance(a, str) and re.fullmatch(r'[a-z]{2}', a)):
        return f'a が小文字2文字でない: {a!r}'
    if k not in KINDS:
        return f'k が {"/".join(KINDS)} のどれでもない: {k!r}'
    if not (isinstance(t, str) and t):
        return f't が空か文字列でない: {t!r}'
    return None


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'data' / 'trivia_facts.json'
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'trivia.js'
    items = json.loads(src.read_text(encoding='utf-8'))
    if not isinstance(items, list):
        sys.exit(f'bad source: 配列でない: {src}')
    for i, it in enumerate(items):
        why = problem(it)
        if why:
            sys.exit(f'bad item {i}: {why}')

    # 国ごとに元の順でまとめ、国は a の昇順
    groups = {}
    for it in items:
        groups.setdefault(it['a'], []).append({'k': it['k'], 't': it['t']})
    lines = [HEAD, 'window.TRIVIA = {']
    for a in sorted(groups):
        lines.append(json.dumps(a) + ':' + json.dumps(groups[a], ensure_ascii=False, separators=(',', ':')) + ',')
    lines.append('};')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'wrote {out.name}: {len(groups)} countries, {len(items)} facts')


if __name__ == '__main__':
    main()
