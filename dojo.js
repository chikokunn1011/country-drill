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

// ---- 画面（#scr-dojo）とモード選択の帯（#to-dojo）。DOM が無い（unit テストの vm）ときは何もしない ----
(() => {
  'use strict';
  if (typeof document === 'undefined') return;
  const NEED = {
    C: typeof C, byA: typeof byA, flag: typeof flag, esc: typeof esc, $: typeof $, store: typeof store, show: typeof show,
    registerScreen: typeof registerScreen, startDojo: typeof startDojo, DAILY_CORE: typeof DAILY_CORE, DOJO: typeof DOJO,
  };
  const missing = Object.keys(NEED).filter(k => NEED[k] === 'undefined');
  if (missing.length) { console.error(`[dojo] 必要なものが読み込めなかったので、似た国旗の道場はお休み: ${missing.join(' ')}`); return; }

  const D = DOJO, KEY = 'dojo';
  const load = () => D.sanitize(store.get(KEY, null));
  const save = st => store.set(KEY, st);
  // グループ（id → この版の countries.js にある国だけ）。2か国未満になったグループは出さない
  // flags/*.svg はどれも 4:3 なので、モナコはインドネシアとまったく同じ絵になり見分けられない。道場では出さない
  const SAME_PICTURE = new Set(['mc']);
  const GROUPS = DAILY_CORE.SIMILAR.map(g => g.filter(a => byA.has(a) && !SAME_PICTURE.has(a))).filter(g => g.length >= 2 && Object.hasOwn(D.LABEL, g[0]));
  const groupOf = id => GROUPS.find(g => g[0] === id) || null;
  let mine = null;   // いま遊んでいる道場の1回 { sid, id }（ほかの sid の drill:dojo は見ない）
  let last = '';     // 終わった1回の結果の1行

  // ---- クイズからの知らせ ----
  document.addEventListener('drill:dojo', e => {
    const d = e.detail || {};
    if (!mine || d.sid !== mine.sid) return;
    const st = load();
    if (d.phase === 'answer' && !d.right && typeof d.a === 'string' && typeof d.pick === 'string' && d.a !== d.pick) {
      const k = D.pairKey(d.a, d.pick);
      st.mix[k] = Math.min(1e5, (st.mix[k] || 0) + 1);
      save(st);
    }
    if (d.phase === 'end') {
      if (d.outcome === 'clear') {
        last = `${D.LABEL[mine.id]}：一発正解 ${d.firstTry} / ${d.n}${d.wrongs === 0 ? '・ノーミス！' : ''}`;
        if (d.wrongs === 0) { st.clear[mine.id] = 1; save(st); }
      }
      mine = null;
    }
  });

  // ---- 画面 ----
  const sec = document.createElement('section');
  sec.id = 'scr-dojo'; sec.className = 'wrap'; sec.hidden = true;
  sec.innerHTML = `<div class="panel dojo">
    <h2>似た国旗の道場</h2>
    <p class="hint">にている国旗のグループを選ぶと、そのグループの国だけで${D.ROUND}問。まちがえた問題はあとでもう一度出るよ。</p>
    <div class="seg" id="dj-mode" role="group" aria-label="出し方"><button type="button" data-m="f2n">国旗 → 国名</button><button type="button" data-m="n2f">国名 → 国旗</button></div>
    <p class="dj-last" id="dj-last" role="status"></p>
    <div class="dj-pairs" id="dj-pairs" hidden><h3>よく取りちがえるペア</h3><ol></ol></div>
    <div class="dj-groups" id="dj-groups"></div>
  </div>`;
  const wrap = document.querySelector('body > .wrap'), foot = wrap?.querySelector(':scope > footer');
  if (foot) foot.before(sec); else (wrap || document.body).append(sec);
  registerScreen('dojo', render);

  function render() {
    const st = load();
    for (const b of sec.querySelectorAll('#dj-mode button')) b.setAttribute('aria-pressed', String(b.dataset.m === st.mode));
    $('dj-last').textContent = last;
    const pairs = D.topPairs(st.mix).filter(p => byA.has(p.a) && byA.has(p.b)), box = $('dj-pairs');
    box.hidden = !pairs.length;
    box.querySelector('ol').innerHTML = pairs.map(p => {
      const x = byA.get(p.a), y = byA.get(p.b);
      return `<li><span class="dj-pf"><img src="${flag(x.a)}" alt=""><img src="${flag(y.a)}" alt=""></span><span class="dj-pn">${esc(x.n)}・${esc(y.n)}</span><b class="mono">${p.k}回</b></li>`;
    }).join('');
    $('dj-groups').innerHTML = GROUPS.map(g => {
      const id = g[0], ok = st.clear[id] === 1;
      return `<button type="button" class="dj-card" data-g="${id}"><span class="dj-flags">${g.map(a => `<img src="${flag(a)}" alt="${esc(byA.get(a).n)}の国旗" loading="lazy">`).join('')}</span>` +
        `<span class="dj-label">${esc(D.LABEL[id])}</span>${ok ? '<span class="dj-ok" aria-label="ノーミスでクリアずみ">✓</span>' : ''}</button>`;
    }).join('');
  }
  $('dj-mode').addEventListener('click', e => {
    const b = e.target.closest('button[data-m]');
    if (!b) return;
    const st = load(); st.mode = D.MODES.includes(b.dataset.m) ? b.dataset.m : st.mode; save(st); render();
  });
  $('dj-groups').addEventListener('click', e => {
    const b = e.target.closest('.dj-card'), group = b && groupOf(b.dataset.g);
    if (!group) return;
    const sid = 'dojo-' + Date.now().toString(36);
    mine = { sid, id: group[0] };
    startDojo({ seq: D.build(group), group, mode: load().mode, sid });
  });

  // ---- モード選択の帯: 見出し「モードを選ぶ」と同じ行の右（高さを足さない。1366×657 の PC で縦スクロールを出さないため） ----
  const panel = document.querySelector('#scr-setup .panel');
  if (panel) {
    const band = document.createElement('div');
    band.className = 'dj-band';
    band.innerHTML = '<button type="button" class="linkbtn" id="to-dojo">🔍 似た国旗の道場 →</button>';
    band.querySelector('button').onclick = () => show('dojo');
    const h2 = panel.querySelector(':scope > h2');
    if (h2) { const head = document.createElement('div'); head.className = 'dj-head'; h2.before(head); head.append(h2, band); }
    else panel.prepend(band);
  }
})();
