// 似た国旗の道場（#scr-dojo）: DAILY_CORE.SIMILAR の25グループごとに、同じグループの国だけを選択肢にした10問を練習する。
// 前半は DOM にさわらない計算（globalThis.DOJO。tests/unit/dojo.test.mjs が vm で読む）、後半は画面とモード選択の帯。
// index.html のインライン script の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）
(() => {
  'use strict';
  const K = globalThis.DAILY_CORE;
  if (!K || !Array.isArray(K.SIMILAR)) { console.error('[dojo] DAILY_CORE が無いので、似た国旗の道場はお休み'); return; }

  const ROUND = 10;                 // 1回の問題数
  const MODES = ['f2n', 'n2f'];     // 国旗→国名・国名→国旗（場所と首都は出さない）
  // グループの id（最初の国コード）→ 短い説明。daily-core.js の SIMILAR の各行のコメントと同じ
  const LABEL = {
    td: '青・黄・赤のたて3色', id: '赤と白', ie: '緑・白・オレンジ/赤のたて3色', ru: '白・青・赤のよこ3色', au: '青地にユニオンジャック',
    ml: '緑・黄・赤のたて3色', ve: '黄・青・赤', sv: '青・白・青', eg: '赤・白・黒', jo: '赤・白・黒・緑',
    no: '北欧の十字', bo: '赤・黄・緑', de: '黒・黄・赤', hu: '赤・白・緑', at: '赤・白・赤',
    us: '赤白のしま＋青', jp: 'まんなかに丸', tr: '赤地に三日月', cn: '赤地に黄色', nl: '赤・白・青',
    cz: '左に三角', bj: '緑・黄・赤と帯', sl: '緑・黄/白・青', tt: 'ななめの帯', qa: 'ギザギザの白',
  };
  const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);

  // 10問の並び: ROUND をグループの国にできるだけ均等に配り（あまりは rand で選んだ国に1つずつ）、
  // 毎回「直前と違う国のうち残りがいちばん多い国」を選ぶ（同じ数なら rand）。2か国でも行きづまらない
  function build(group, rand = Math.random) {
    const list = [...new Set(group)], left = new Map(list.map(a => [a, Math.floor(ROUND / list.length)]));
    const pool = list.slice();
    for (let r = ROUND % list.length; r > 0; r--) { const a = pool.splice(Math.floor(rand() * pool.length), 1)[0]; left.set(a, left.get(a) + 1); }
    const out = [];
    while (out.length < ROUND) {
      const prev = out[out.length - 1];
      let cand = list.filter(a => a !== prev && left.get(a) > 0);
      if (!cand.length) cand = list.filter(a => left.get(a) > 0);   // 1か国だけのグループ（SIMILAR には無い）
      const max = Math.max(...cand.map(a => left.get(a)));
      const top = cand.filter(a => left.get(a) === max), a = top[Math.floor(rand() * top.length)];
      left.set(a, left.get(a) - 1); out.push(a);
    }
    return out;
  }
  const pairKey = (a, b) => [a, b].sort().join('-');
  const count = (mix, k) => { const v = isObj(mix) ? mix[k] : 0; return typeof v === 'number' && v > 0 ? v : 0; };
  // a とよく取りちがえる相手。数が無い・同じなら group の並びで a の次の国から順に（末尾なら先頭へ）
  function rival(a, group, mix) {
    const i = group.indexOf(a), n = group.length;
    let best = null, bestK = -1;
    for (let j = 1; j <= n; j++) {
      const b = group[(i + j) % n];
      if (b === a) continue;
      const k = count(mix, pairKey(a, b));
      if (k > bestK) { best = b; bestK = k; }
    }
    return best;
  }
  // localStorage の dojo（{ v:1, mode, mix:{'ro-td':3}, clear:{td:1} }）を読める形にする。変な値はその部分だけ捨てる
  function sanitize(raw) {
    const out = { v: 1, mode: 'f2n', mix: {}, clear: {} };
    if (!isObj(raw) || raw.v !== 1) return out;
    if (MODES.includes(raw.mode)) out.mode = raw.mode;
    if (isObj(raw.mix)) for (const [k, v] of Object.entries(raw.mix))
      if (/^[a-z]{2}-[a-z]{2}$/.test(k) && Number.isInteger(v) && v >= 1 && v <= 1e5) out.mix[k] = v;
    if (isObj(raw.clear)) for (const [k, v] of Object.entries(raw.clear)) if (Object.hasOwn(LABEL, k) && v === 1) out.clear[k] = 1;
    return out;
  }
  // よく取りちがえるペア: 多い順（同じなら鍵の順）に最大 n 組
  function topPairs(mix, n = 5) {
    if (!isObj(mix)) return [];
    return Object.keys(mix).filter(k => count(mix, k) > 0 && k.includes('-')).sort((x, y) => (mix[y] - mix[x]) || (x < y ? -1 : x > y ? 1 : 0))
      .slice(0, n).map(k => { const [a, b] = k.split('-'); return { a, b, k: mix[k] }; });
  }

  globalThis.DOJO = { ROUND, MODES, LABEL, build, pairKey, rival, sanitize, topPairs };
})();
