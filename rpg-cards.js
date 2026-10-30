(() => {
  'use strict';
  // 国旗クエストの仲間のカード（RPG.cardHTML・RPG.openCard）、国旗ガチャ（#scr-gacha）と仲間の一覧（#scr-cards）、
  // 仲間の世界地図（RPG.worldMap）・シェア（RPG.shareButton・RPG.milestones・RPG.drawShares）・演出（RPG.fx）
  // rpg.js の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）。
  // セーブ・コイン・画面の切りかえなど rpg.js の部品は window.RPG を通して使う
  // 画面の文は全部 T()（英語のページは i18n/en-rpg-cards.js。'← 冒険' は en-rpg.js）。国名は cName、地域名は T(r)、国の並びは I18N.byName

  // rpg.js が起動していなければ何もしない（rpg.js は index.html のグローバルを確かめてから window.RPG を作る。
  // 足りないものは rpg.js と rpg-battle.js が [rpg] で知らせるので、ここでは黙る）
  const RPG = window.RPG;
  if (typeof RPG?.tx !== 'function') return;

  const K = RPG_CORE, U = K.TUNING, REGION_DG = K.REGION_DUNGEONS, TOTAL = C.length, COIN = RPG.COIN, owned = K.owned;
  const EN = LANG === 'en';
  const restHint = rest => T('あと{n}回正解で仲間に（1回のゲームで1回ぶん）', { n: rest });

  /* ---------- 仲間のカード・国旗ガチャ（#scr-gacha）・仲間の一覧（#scr-cards） ---------- */
  const STAR_NAME = ['', T('ブロンズ'), T('シルバー'), T('ゴールド')];
  // 地域のチップは全世界と、国の数が少ない順の6地域（地域のダンジョン REGION_DG の順）。値は S.region と同じ形（'all' か地域名）
  const AREAS = ['all', ...REGION_DG.map(g => g.r)];
  const AREA_N = Object.fromEntries(AREAS.map(r => [r, r === 'all' ? TOTAL : C.filter(c => c.r === r).length]));
  const inArea = (a, r) => r === 'all' || byA.get(a)?.r === r;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dots = n => '●'.repeat(n) + '○'.repeat(U.card.stackMax - n);   // かさね ●●○○
  const backBtn = `<button type="button" class="linkbtn rpg-back">${T('← 冒険')}</button>`;
  // チップは1回だけ作り、押した状態と「持っている数/国の数」だけ描き直す（押したチップのフォーカスが外れない）
  const chipsHTML = allLabel => AREAS.map(r => `<button type="button" class="chip" aria-pressed="false" data-r="${r}">${r === 'all' ? allLabel : esc(T(r))}<span class="mono"></span></button>`).join('');
  const drawChips = (box, d, sel) => {
    const as = Object.keys(d.cards);
    for (const b of box.children) {
      const r = b.dataset.r;
      b.setAttribute('aria-pressed', String(r === sel));
      b.lastElementChild.textContent = ` ${as.filter(a => inArea(a, r)).length}/${AREA_N[r]}`;
    }
  };

  // カードの国名を折ってよいところで分ける（rpg.css の word-break: keep-all で、ここに入れる <wbr> でだけ折る）。
  // 「・」のあと、カタカナとそれ以外（漢字・ひらがな。「及び」は1つ）の変わり目、「セント」のあと、まだ8字以上（うしろの「・」は数えない）のカタカナの語はまん中あたり
  // （小さい字・ー・ン・ア行で始まらないところ）。1字だけのかたまりは隣につなぐ（「北マケドニア」「ドミニカ国」は折らない）。国名ごとに1回だけ。
  // KANA はカタカナ（ァ〜ー。「・」もふくむ）
  // 英語の国名は空白で折れるので <wbr> は入れない。--n・--l は日本語の字数の目安なので、英字の幅に合わせて 0.6 倍
  const foldEn = n => {
    const w = Math.max(...n.split(' ').map(x => [...x].length));
    return { html: esc(n), n: Math.ceil([...n].length * 0.6), l: Math.ceil(w * 0.6) };
  };
  // 「・」「セント」は折り方を決めるための字で、画面の文ではない（正規表現にして T() の見張りから外す）
  const KANA = /[ァ-ー]/, NOSTART = /[ァィゥェォャュョッヮヵヶーンアイウエオ・]/, DOT = /^・$/, DOT_END = /・$/, SAINT = /^セント/, FOLD_MAX = 7, folds = new Map();
  const foldName = n => {
    if (folds.has(n)) return folds.get(n);
    if (EN) { const r = foldEn(n); folds.set(n, r); return r; }
    const parts = [];
    for (const ch of n) {
      const last = parts.at(-1), prev = last?.at(-1);
      if (!last || DOT.test(prev) || KANA.test(prev) !== KANA.test(ch)) parts.push(ch); else parts[parts.length - 1] += ch;
    }
    // 長いカタカナの語を、まん中にいちばん近い折れるところで2つに（まだ長ければくり返す）
    const split = w => {
      const s = [...w];
      if (s.length - (DOT_END.test(w) ? 1 : 0) <= FOLD_MAX || !KANA.test(s[0])) return [w];
      if (SAINT.test(w)) return [w.slice(0, 3), ...split(w.slice(3))];
      let at = -1;
      for (let i = 2; i <= s.length - 2; i++) if (!NOSTART.test(s[i]) && (at < 0 || Math.abs(i - s.length / 2) < Math.abs(at - s.length / 2))) at = i;
      return at < 0 ? [w] : [...split(s.slice(0, at).join('')), ...split(s.slice(at).join(''))];
    };
    const out = [];
    for (const p of parts.flatMap(split)) {
      if (out.length && ([...p].length === 1 || [...out.at(-1)].length === 1)) out[out.length - 1] += p; else out.push(p);
    }
    const r = { html: out.map(esc).join('<wbr>'), n: [...n].length, l: Math.max(...out.map(p => [...p].length)) };
    folds.set(n, r);
    return r;
  };
  // 仲間のカード（<button>）: 国旗・国名・★・かさね・なかよし度。持っていない国は国旗をグレーで薄く（.is-none）、あと何回正解で仲間になるか
  // （なかよし度が5以上なのに持っていない国には出さない）。face: 'back' は裏向き（.is-back。方位磁針の模様）
  const cardHTML = (a, d, { face = 'up', label = '', lazy = false } = {}) => {
    const c = byA.get(a);
    if (!c) return '';
    const card = d.cards?.[a], fr = d.fr?.[a] || 0, star = card ? card[0] : 0, rest = U.card.frJoin - fr, back = face === 'back', nm = foldName(cName(c));
    const mid = card
      ? `<span class="rpg-card-star">${'★'.repeat(star)}</span><span class="rpg-card-stack" title="${T('かさね {n}/{max}', { n: card[1], max: U.card.stackMax })}">${dots(card[1])}</span>`
      : rest > 0 ? `<span class="rpg-card-hint">${restHint(rest)}</span>` : '';
    return `<button type="button" class="rpg-card rpg-s${star}${card ? '' : ' is-none'}${back ? ' is-back' : ''}" data-a="${a}" data-star="${star}"${back ? ` aria-label="${T('裏向きのカード')}"` : ''}>`
      + `<span class="rpg-card-face">${label ? `<span class="rpg-lab">${label}</span>` : ''}<img class="rpg-card-flag" src="${flag(a)}" alt=""${lazy ? ' loading="lazy"' : ''}>`
      + `<b class="rpg-card-name" style="--n:${nm.n};--l:${nm.l}">${nm.html}</b>${mid}<span class="rpg-card-fr" title="${T('なかよし度')}">♥${fr}/${U.card.frMax}</span></span>`
      + '<span class="rpg-card-back" aria-hidden="true"><span>🧭</span></span></button>';
  };
  // #detail に国の情報とカードの強さ。id があればそのダンジョンでの値（地域ボーナス ×1.5 が付くか）
  const openCard = (a, id) => {
    const c = byA.get(a), dlg = $('detail'), inner = $('detail-inner');
    if (!c || !dlg || !inner) return;
    const d = RPG.get(), card = d.cards[a], fr = d.fr[a] || 0, g = id ? K.dungeonOf(id) : null;
    let info;
    if (card) {
      const bonus = !!g && K.inDungeon(g, a), atk = K.cardAtk(card, fr, bonus);
      const nw = s => `<span class="rpg-nowrap">${s}</span>`;
      const dot = T('・');
      // 「こうげき」と「（地域ボーナス …）」のあいだは、英語だけ空白（日本語は全角のかっこなので空けない）
      info = `<p>${nw(`★${card[0]} ${STAR_NAME[card[0]]}`)}${dot}${nw(T('かさね {dots}', { dots: dots(card[1]) }))}${dot}${nw(T('なかよし度 ♥{fr}/{max}', { fr, max: U.card.frMax }))}</p>`
        + `<p class="rpg-cd-pow">${nw(T('こうげき {atk}', { atk: atk.toFixed(1) }))}${EN ? ' ' : ''}${nw(bonus ? T('（地域ボーナス あり）') : T('（地域ボーナス なし）'))}${dot}${nw(`HP ${(atk * U.card.hpMul).toFixed(1)}`)}</p>`
        + (g ? '' : `<p class="hint">${T('{region}のダンジョンと地図喰いの巣では、地域ボーナスで ×{mul}', { region: esc(T(c.r)), mul: U.card.regionMul })}</p>`);
    } else {
      info = `<p class="rpg-cd-pow">${T('まだ仲間じゃない（なかよし度 ♥{fr}/{max}）', { fr, max: U.card.frMax })}</p>`
        + (fr < U.card.frJoin ? `<p class="hint">${restHint(U.card.frJoin - fr)}</p>` : '');
    }
    inner.innerHTML = `<button class="close">${T('閉じる')}</button>${factsHTML(c)}<div class="rpg-cd-info">${info}</div>`;
    inner.querySelector('.close').onclick = () => dlg.close();
    if (!dlg.open) dlg.showModal();
  };

  // ---- 国旗ガチャ ----
  const GA_NOTE = T('※コインはクイズで集めるゲームの中のコインだけ。お金はかからないし、買うこともできないよ。');
  const GA_LABEL = { new: () => 'NEW', up: () => T('ランクアップ'), stack: () => T('かさね+1'), refund: star => T('おかえし {coins}', { coins: COIN + fmt(U.gacha.refund[star]) }) };
  const GACHA_HTML = `<div class="rpg-head">${backBtn}<h2 class="rpg-h2">${T('国旗ガチャ')}</h2><span class="rpg-hcoin" id="ga-coins"></span></div>`
    + `<div class="rpg-ga-side"><p class="rpg-warn" id="ga-warn" role="status" hidden></p><p class="rpg-lbl" id="ga-q">${T('どこの国と出会う？')}</p>`
    + `<div class="chips" id="ga-regions" role="group" aria-labelledby="ga-q">${chipsHTML(T('全世界'))}</div>`
    + `<p class="hint" id="ga-hint">${T('地域をしぼると値段が ×{price}。そのかわり、その地域のダンジョンでは仲間が ×{power} で強い', { price: U.gacha.regionMul, power: U.card.regionMul })}</p>`
    + '<div class="rpg-pack-slot" id="ga-pack"></div>'
    + '<div class="rpg-ga-btns"><button class="btn ghost" id="ga-free"></button><button class="btn" id="ga-1"></button><button class="btn" id="ga-10"></button></div>'
    + '<p class="rpg-ga-need" id="ga-need" hidden></p><p class="rpg-ga-msg" id="ga-msg" role="status"></p><p class="rpg-ga-pity" id="ga-pity"></p>'
    + `<div class="rpg-ga-rates" id="ga-rates"></div><p class="rpg-ga-note" id="ga-note">${GA_NOTE}</p></div>`
    + `<div class="rpg-ga-main" id="ga-main"><p class="rpg-lbl">${T('結果')}</p><p class="hint" id="ga-empty">${T('引いたカードがここに並ぶよ')}</p>`
    + `<div class="rpg-ga-res" id="ga-res"></div><div class="rpg-shares" id="ga-share" hidden></div><button class="btn ghost" id="ga-flipall" hidden>${T('ぜんぶめくる')}</button></div>`
    + '<div class="rpg-gstage" id="ga-stage" hidden><div class="rpg-gstage-in" id="ga-stage-in"></div>'
    + `<button type="button" class="rpg-gstage-skip" id="ga-skip">${T('スキップ')}</button></div>`;
  // 提供割合。表示する値も抽選と同じ TUNING.gacha から（gachaRates）
  const ratesHTML = r => {
    const R = K.gachaRates(), n = AREA_N[r];
    return `<p class="rpg-ga-rh">${T('出る確率')}</p><ul>`
      + `<li>${T('★3 ゴールド {p3}% / ★2 シルバー {p2}%', { p3: R.r3, p2: R.r2 })}</li><li>${T('★1 ブロンズ {p1}%', { p1: R.r1 })}</li>`
      + `<li>${T('10回引くと10枚目は★2以上（★3 {p3}% / ★2 {p2}%）', { p3: R.tenR3, p2: R.tenR2 })}</li>`
      + `<li>${T('★3が出ないまま{n}回目 → ★3確定', { n: R.pity })}</li>`
      + `<li>${T('国は選んだ地域から同じ確率（{area}なら 各 1/{n} = {p}%）', { area: esc(r === 'all' ? T('全世界') : T(r)), n, p: (100 / n).toFixed(1) })}</li>`
      + `<li>${T('天井込みの★3の目安: 約{p}%', { p: R.eff3.toFixed(1) })}</li></ul>`;
  };
  // ---- 国旗パック（ボタンの上のサムネイルと、引くときの演出で同じ絵） ----
  // 色は地域のダンジョンの色（全世界は青い海の色 --rpg-pack-world）。国旗3枚は、まだ仲間でない国を日ごとに入れかえて見せる（全部仲間なら持っている国から）
  const DG_ALL = K.DUNGEONS;
  const packColor = r => { const g = DG_ALL.find(g => g.r === r && r !== 'all'); return g ? `var(--rpg-r-${g.id}, ${g.color})` : 'var(--rpg-pack-world)'; };
  const hash = str => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; };
  const packFlags = (r, d) => {
    const day = new Date().toDateString(), all = C.filter(c => r === 'all' || c.r === r).map(c => c.a);
    const none = all.filter(a => !d.cards[a]), pool = none.length >= 3 ? none : all;
    return pool.map(a => [hash(day + a), a]).sort((x, y) => x[0] - y[0]).slice(0, 3).map(x => x[1]);
  };
  const packHTML = (r, d, { big = false } = {}) => {
    const as = Object.keys(d.cards), have = as.filter(a => inArea(a, r)).length, n = AREA_N[r], rest = n - have;
    const [f1, f2, f3] = packFlags(r, d), img = (a, k) => a ? `<img class="rpg-pack-f ${k}" src="${flag(a)}" alt="">` : '';
    const name = r === 'all' ? T('全世界') : T(r);
    return `<div class="rpg-pack${big ? ' is-big' : ''}${r === 'all' ? '' : ' is-area'}" style="--pk: ${packColor(r)}" role="img" aria-label="${esc(T('{name}の国旗パック', { name }))}">`
      + '<span class="rpg-pack-rays" aria-hidden="true"></span><span class="rpg-pack-shine" aria-hidden="true"></span>'
      + `<span class="rpg-pack-body" aria-hidden="true"><span class="rpg-pack-top">${T('FLAG QUEST · 国旗パック')}</span>`
      + `<span class="rpg-pack-fan">${img(f1, 'f1')}${img(f3, 'f3')}${img(f2, 'f2')}</span>`
      + `<span class="rpg-pack-name">${esc(name)}</span>`
      + `<span class="rpg-pack-sub">${rest > 0 ? T('まだ会っていない国 {rest}/{n}', { rest, n }) : T('{n}か国コンプリート！', { n })}</span></span>`
      + `<span class="rpg-pack-tag" aria-hidden="true">★3 ${K.gachaRates().r3}%</span>`
      + (r === 'all' ? '' : `<span class="rpg-pack-tag is-mul" aria-hidden="true">${T('地域しぼり ×{mul}', { mul: U.gacha.regionMul })}</span>`)
      + '<i class="rpg-spark s1"></i><i class="rpg-spark s2"></i><i class="rpg-spark s3"></i><i class="rpg-spark s4"></i></div>';
  };
  let packKey = '';
  const drawPack = d => {
    const key = `${gaRegion}|${Object.keys(d.cards).sort().join(',')}|${new Date().toDateString()}`;
    if (key === packKey && $('ga-pack').firstElementChild) return;   // 同じ絵なら描き直さない（きらきらが止まらない）
    packKey = key;
    $('ga-pack').innerHTML = packHTML(gaRegion, d);
  };
  // gaBusy: 引いてから全部めくれるまで（そのあいだはどのボタンも押せない）。gaShares: 全部めくれたら結果の下に出すシェア
  let gaRegion = 'all', gaBusy = false, gaShares = [];
  // 最初に選んでおく地域: RPG.open で渡したもの、無ければ全世界（地域をしぼると高くなるので、知らないうちに高いほうを選んでいないように）
  const firstRegion = () => {
    const want = RPG.opts?.region;
    return AREAS.includes(want) ? want : 'all';
  };
  // ボタン・チップ・天井・提供割合・コイン（結果はそのまま）。新しい版のデータのあいだは引けない（書けないので）
  const drawGacha = (d = RPG.get()) => {
    if (!$('ga-regions')) return;
    const { pity } = U.gacha, one = K.gachaCost(gaRegion, 1), ten = K.gachaCost(gaRegion, 10), free = $('ga-free'), need = $('ga-need'), warn = $('ga-warn'), stop = gaBusy || RPG.status === 'readOnly';
    warn.textContent = RPG.warn;
    warn.hidden = !RPG.warn;
    $('ga-coins').innerHTML = RPG.coinHTML(d.coins);
    drawChips($('ga-regions'), d, gaRegion);
    drawPack(d);
    free.textContent = d.day.free ? T('また明日') : d.day.first ? T('無料1回') : T('今日クイズを1回クリアすると無料1回');
    free.disabled = stop || !d.day.first || d.day.free;
    $('ga-1').innerHTML = `${T('1回')} ${COIN}${fmt(one)}`;
    $('ga-1').disabled = stop || d.coins < one;
    $('ga-10').innerHTML = `${T('10回')} ${COIN}${fmt(ten)}`;
    $('ga-10').disabled = stop || d.coins < ten;
    need.hidden = d.coins >= ten;
    need.innerHTML = need.hidden ? '' : T('あと{coins}', { coins: COIN + fmt(ten - d.coins) });
    $('ga-pity').textContent = T('★3確定まで あと{n}回', { n: pity - d.pity });
    $('ga-rates').innerHTML = ratesHTML(gaRegion);
  };
  // 表にする。★3 は表になったところで金色の演出（quiet なら音も演出もなし。引く演出で1枚ずつ見せたあと）
  const flipCard = (el, quiet) => {
    if (!quiet && el.classList.contains('is-back')) SND.play('flip');
    el.classList.remove('is-back');
    el.removeAttribute('aria-label');
    if (!quiet && el.classList.contains('is-gold')) fx('gold', el);
  };
  // 残りを全部表にして、［ぜんぶめくる］を隠し、ボタンを戻し、シェアを出す（［ぜんぶめくる］もここ）。
  // ［ぜんぶめくる］にフォーカスがあれば（引くボタンから移してある）、消えるので最初のカードへ
  const endFlip = () => {
    stageDone = null;   // めくり始める約束は捨てて、ここで全部めくる
    closeStage();
    const box = $('ga-res'), all = $('ga-flipall');
    box.querySelectorAll('.rpg-card.is-back').forEach(el => flipCard(el, true));
    gaBusy = false;
    if (document.activeElement === all) box.firstElementChild?.focus({ preventScroll: true });
    all.hidden = true;
    drawShares($('ga-share'), gaShares);
    drawGacha();
  };
  const clearResults = () => {
    stageDone = null;
    closeStage();
    gaBusy = false;
    gaShares = [];
    $('ga-res').innerHTML = '';
    drawShares($('ga-share'), []);
    $('ga-flipall').hidden = true;
    $('ga-empty').hidden = false;
  };
  // ---- 引く演出（#ga-stage）: パックが落ちてきて揺れ、いちばんいい★の色に光ってはじける（★3 は銀から金に変わる）。
  // そのあと出た国旗のカードが1枚ずつ飛び出し、turnMs でめくれて holdMs[★] 見せる（下に出たカードの小さい国旗が並ぶ）。
  // 押すと次へ（パックの途中なら1枚目へ、めくる前ならすぐめくる）、［スキップ］と Esc は全部とばす。
  // 結果のカードはうしろに裏向きで並べておき、演出が終わると全部表にする。
  // reduced motion（PC の「アニメーション効果」オフなど）でも出す。そのときは動かさず、ふわっと出て光るだけ（rpg.css）
  let stageTimer = null, stageDone = null, stage = null;   // stage: { cards: [{ a, star, out, html }], i }（i は今見せているカード。パックのあいだは -1）
  const closeStage = () => {
    clearTimeout(stageTimer);
    stageTimer = null;
    stage = null;
    const st = $('ga-stage');
    if (!st || st.hidden) return;
    st.hidden = true;
    $('ga-stage-in').innerHTML = '';
    document.body.classList.remove('rpg-staging');
    const done = stageDone;
    stageDone = null;
    done?.();
  };
  // カードを1枚ずつ。i 枚目を裏向きで出し、turnMs でめくって holdMs[★] 待ってから次へ
  const thumbsHTML = n => stage.cards.slice(0, n).map(c => `<li class="rpg-s${c.star}"><img src="${flag(c.a)}" alt=""></li>`).join('');
  const showCard = i => {
    const c = stage.cards[i], n = stage.cards.length;
    stage.i = i;
    $('ga-stage').classList.add('is-reveal');
    $('ga-stage-in').innerHTML = `<p class="rpg-gst-count">${n > 1 ? `${i + 1} / ${n}` : ''}</p>`
      + `<div class="rpg-gst-card is-s${c.star}">${c.html}</div>`
      + `<ol class="rpg-gst-got" aria-hidden="true">${n > 1 ? thumbsHTML(i) : ''}</ol>`;
    $('ga-stage-in').querySelector('.rpg-card').dataset.out = c.out;   // NEW などのラベルの色（一覧と同じ）
    clearTimeout(stageTimer);
    stageTimer = setTimeout(turnCard, U.gacha.turnMs);
  };
  const turnCard = () => {
    const el = $('ga-stage-in').querySelector('.rpg-card');
    if (!stage || !el) return;
    el.classList.remove('is-back');
    el.removeAttribute('aria-label');
    const star = stage.cards[stage.i].star;
    $('ga-stage-in').querySelector('.rpg-gst-say')?.remove();
    el.parentElement.insertAdjacentHTML('beforeend', `<p class="rpg-gst-say" aria-live="polite">${esc(cName(byA.get(stage.cards[stage.i].a) ?? { n: '' }))} ${'★'.repeat(star)}</p>`);
    SND.play('flip');
    if (star === 3) fx('gold', el);
    clearTimeout(stageTimer);
    stageTimer = setTimeout(nextCard, U.gacha.holdMs[star] ?? U.gacha.holdMs[1]);
  };
  // 押したとき・時間がたったとき。パックなら1枚目、めくる前ならめくる、めくってあれば次（最後なら終わり）
  const nextCard = () => {
    if (!stage) return;
    clearTimeout(stageTimer);
    const back = $('ga-stage-in').querySelector('.rpg-gst-card .rpg-card.is-back');
    if (stage.i >= 0 && back) turnCard();
    else if (stage.i + 1 < stage.cards.length) showCard(stage.i + 1);
    else closeStage();
  };
  const playStage = (region, before, d, best, count, done, cards) => {
    const st = $('ga-stage');
    stageDone = done;
    stage = { cards, i: -1 };
    st.className = `rpg-gstage is-s${best}${best === 3 ? ' is-promo' : ''}${count === 10 ? ' is-ten' : ''}`;
    st.style.setProperty('--show', `${U.gacha.showMs}ms`);
    $('ga-stage-in').innerHTML = packHTML(region, { cards: before }, { big: true })
      + `<p class="rpg-gstage-say" aria-live="polite">${best === 3 ? T('…金色に光った！') : best === 2 ? T('きらっ！') : T('どの国かな？')}</p>`;
    st.hidden = false;
    document.body.classList.add('rpg-staging');
    $('ga-skip').focus({ preventScroll: true });
    if (best === 3 && S.dopa) FX.sfx('fanfare');
    else SND.play(best === 3 ? 'promo' : 'pull');
    stageTimer = setTimeout(nextCard, U.gacha.showMs + (best === 3 ? 500 : 0));
  };
  // 結果を裏向きで並べ、演出（1枚ずつ見せる）が終わったら全部表にする（reduced motion でも。そのときは回さずに表になる）。カードは1枚ずつ足していったときの★とかさね
  const drawResults = (res, before, d, region) => {
    const box = $('ga-res'), back = true, now = { cards: { ...before }, coins: 0, earned: 0 }, cards = [];
    box.innerHTML = res.map(r => {
      K.addCard(now, r.a, r.star);
      const opt = { cards: { [r.a]: now.cards[r.a] }, fr: d.fr }, label = GA_LABEL[r.out](r.star);
      cards.push({ a: r.a, star: r.star, out: r.out, html: cardHTML(r.a, opt, { face: 'back', label }) });
      return cardHTML(r.a, opt, { face: back ? 'back' : 'up', label });
    }).join('');
    res.forEach((r, i) => {
      const el = box.children[i];
      el.dataset.out = r.out;
      // ★3 は裏のうちから金色に光る（めくったら flipCard で演出）。reduced motion は最初から表なので、ここで演出
      if (r.star === 3) { if (back) el.classList.add('is-gold'); else fx('gold', el); }
    });
    drawShares($('ga-share'), []);   // シェアは全部めくれてから
    $('ga-flipall').hidden = !back;   // めくるものが無ければ出さない
    $('ga-empty').hidden = true;
    // スマホは結果がボタンと確率の下なので、結果まで送る
    const toResults = () => { if (innerWidth < 900) $('ga-main').scrollIntoView({ block: 'nearest', behavior: back ? 'smooth' : 'auto' }); };
    if (back) {
      const fromBtn = ['ga-free', 'ga-1', 'ga-10'].includes(document.activeElement?.id);
      playStage(region, before, d, Math.max(...res.map(r => r.star)), res.length, () => {
        if (!gaBusy) return;   // ［ぜんぶめくる］など、もうめくり終わっている
        // 演出で1枚ずつ見せたので、一覧は全部表で出す（フォーカスは最初のカードへ）
        const focus = fromBtn || document.activeElement === $('ga-skip') || document.activeElement === document.body;
        endFlip();
        if (focus) $('ga-res').firstElementChild?.focus({ preventScroll: true });
        toResults();
      }, cards);
    } else { endFlip(); toResults(); }
  };
  // 引けなかったときの1行（#ga-msg）。引けたら消す
  const GA_MSG = {
    coins: T('コインが足りないので引けなかったよ（ほかのタブで使ったかも）'),
    free: T('今日の無料1回はもう使っているか、まだ今日クイズをクリアしていないよ'),
    save: T('保存できなかったので、引いていないよ'),
  };
  const sayGacha = key => { const el = $('ga-msg'); if (el) el.textContent = GA_MSG[key] || ''; };
  // 1回の tx で コインを引く（無料なら day.free）→ 抽選 → gr。書けてから結果を描き、イベントは tx が返ってから
  const pullGacha = (count, free) => {
    if (gaBusy) return;
    gaBusy = true;
    for (const id of ['ga-free', 'ga-1', 'ga-10']) $(id).disabled = true;   // 連打で二重に引かない
    const region = gaRegion, cost = free ? 0 : K.gachaCost(region, count);
    let d = null, res = null, before = null;
    RPG.tx(x => {
      if (free ? !x.day.first || x.day.free : x.coins < cost) return;
      before = { ...x.cards };
      if (free) x.day.free = true;
      else x.coins -= cost;
      res = K.pull(x, region, count, Math.random, C);
      x.gr = region;
      d = x;
    });
    // 保存できなかった（新しい版のデータ・書けなかった・tx の中の例外。どれも RPG.wrote が false）・足りなかった（別のタブで使った。
    // fn が途中で返るだけなので RPG.wrote は true のまま）: 黙らずに1行で知らせて、ボタンを描き直す
    if (!d || !RPG.wrote) { gaBusy = false; sayGacha(!RPG.wrote ? 'save' : free ? 'free' : 'coins'); drawGacha(); return; }
    sayGacha('');
    gaShares = milestones(Object.keys(before), Object.keys(d.cards));
    let owned0 = owned(d) - res.filter(r => r.out === 'new').length;
    emit('rpg:pull', { region, count, free, results: res.map(r => ({ ...r })), pity: d.pity, pulls: d.pulls });
    for (const r of res) {
      if (r.out === 'new') emit('rpg:join', { a: r.a, via: 'gacha', owned: ++owned0 });
      if (r.out === 'up') emit('rpg:promote', { a: r.a, star: r.star, via: 'gacha' });
    }
    RPG.emitCoins(d, -cost, 'gacha');
    RPG.emitCoins(d, res.reduce((s, r) => s + (r.out === 'refund' ? U.gacha.refund[r.star] : 0), 0), 'refund');
    drawResults(res, before, d, region);
    drawGacha();
  };
  // screenRender.gacha: 開くたびに地域を選び直し、前の結果を消す
  const renderGacha = () => {
    const d = RPG.get();
    gaRegion = firstRegion();
    sayGacha('');
    clearResults();
    drawGacha(d);
  };
  const bindGacha = sec => {
    sec.querySelector('.rpg-back').onclick = () => show('rpg');
    $('ga-regions').onclick = e => {
      const b = e.target.closest('.chip');
      if (!b || !AREAS.includes(b.dataset.r)) return;
      gaRegion = b.dataset.r;
      drawGacha();
    };
    // ダブルクリックの2回目（e.detail > 1）は無視する
    const onPull = (count, free) => e => { if (e.detail <= 1) pullGacha(count, free); };
    $('ga-free').onclick = onPull(1, true);
    $('ga-1').onclick = onPull(1, false);
    $('ga-10').onclick = onPull(10, false);
    $('ga-flipall').onclick = endFlip;
    // ［スキップ］は全部とばす。ほかのところを押すと次へ。Esc は全部とばし、→ は次へ
    $('ga-stage').onclick = e => { if (e.target.closest('#ga-skip')) closeStage(); else nextCard(); };
    $('ga-stage').onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); closeStage(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nextCard(); }
    };
    // 裏向きのカードはめくるだけ（最後の1枚なら全部めくれたことにする）。詳細は表になってから
    $('ga-res').onclick = e => {
      const b = e.target.closest('.rpg-card');
      if (!b) return;
      if (!b.classList.contains('is-back')) { openCard(b.dataset.a); return; }
      flipCard(b);
      if (!$('ga-res').querySelector('.rpg-card.is-back')) endFlip();
    };
  };

  // ---- 仲間の一覧（★の多い順 → 国名の順で固定。上の地図 #cd-map は下の worldMap が描く。絞りこみに関係なく全世界） ----
  const CARDS_HTML = `<div class="rpg-head">${backBtn}<h2 class="rpg-h2" id="cd-count"></h2></div>`
    + `<div class="chips" id="cd-regions" role="group" aria-label="${T('地域でしぼりこむ')}">${chipsHTML(T('すべて'))}</div>`
    + '<div class="rpg-cd-map" id="cd-map"></div><div class="rpg-cd-grid" id="cd-grid"></div>';
  let cdRegion = 'all', byName = null;
  const drawCards = (d = RPG.get()) => {
    if (!$('cd-grid')) return;
    byName ||= C.map(c => c.a).sort((x, y) => I18N.byName(byA.get(x), byA.get(y)));
    const star = a => d.cards[a]?.[0] || 0;
    $('cd-count').textContent = T('仲間 {n} / {total}', { n: owned(d), total: TOTAL });
    drawChips($('cd-regions'), d, cdRegion);
    // sort は安定なので、同じ★の中は国名の順のまま
    $('cd-grid').innerHTML = byName.filter(a => inArea(a, cdRegion)).sort((x, y) => star(y) - star(x)).map(a => cardHTML(a, d, { lazy: true })).join('');   // 195枚の国旗は見えてから読む
    worldMap($('cd-map'), d);   // 地図は絞りこみに関係なく全世界
  };
  const bindCards = sec => {
    sec.querySelector('.rpg-back').onclick = () => show('rpg');
    $('cd-regions').onclick = e => {
      const b = e.target.closest('.chip');
      if (!b || !AREAS.includes(b.dataset.r)) return;
      cdRegion = b.dataset.r;
      drawCards();
    };
    $('cd-grid').onclick = e => { const b = e.target.closest('.rpg-card'); if (b) openCard(b.dataset.a); };
  };

  /* ---------- 仲間の世界地図（RPG.worldMap）・シェア（RPG.shareButton）・演出（RPG.fx） ---------- */
  // 国の形のパスは最初に1回だけ文字列にしておき、どの入れ物も同じ文字列から作る。色は class の付け替えだけ（★の金属 .rpg-m1〜3 / 霧 .rpg-fog）
  // 小さい国と、地図に形の無い国は丸印（図鑑の地図と同じ判定 isSmall。無ければ同じ値で）
  const small = typeof isSmall === 'function' ? isSmall : c => c.ar < 25000 || !featOf(c);
  const LEGEND = [['rpg-m1', T('★1 ブロンズ')], ['rpg-m2', T('★2 シルバー')], ['rpg-m3', T('★3 ゴールド')], ['rpg-fog', T('まだ')]];
  let mapCache = null;
  const mapHTML = () => {
    if (mapCache) return mapCache;
    const proj = boxProjection(WORLD_BOX, W, H), path = d3.geoPath(proj);
    path.digits?.(1);   // 0.1px まで（文字列を短くする）
    let s = `<path class="graticule" d="${path(d3.geoGraticule10())}"></path>`;
    for (const g of feats) {
      const p = path(g);
      if (!p) continue;
      const c = featCountry.get(g);   // 国の無い形（南極など）はずっと霧
      s += c ? `<path d="${p}" data-a="${c.a}"></path>` : `<path class="rpg-fog" d="${p}"></path>`;
    }
    for (const c of C) {
      if (!small(c)) continue;
      const q = proj([c.ll[1], c.ll[0]]);
      if (q) s += `<circle class="rpg-dot" data-a="${c.a}" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="4"></circle>`;
    }
    return mapCache = `<svg class="map rpg-wmap" viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`
      + `<ul class="rpg-legend">${LEGEND.map(([k, l]) => `<li><i class="rpg-key ${k}" aria-hidden="true"></i>${l}</li>`).join('')}</ul>`;
  };
  // box に地図が無ければ作り、d の仲間の★で塗り分ける（2回目からは塗り直すだけ）
  const worldMap = (box, d) => {
    if (!box) return;
    let svg = box.querySelector(':scope > .rpg-wmap');
    if (!svg) { box.innerHTML = mapHTML(); svg = box.firstElementChild; }
    const cards = d?.cards || {};
    for (const el of svg.querySelectorAll('[data-a]')) {
      const star = cards[el.dataset.a]?.[0] || 0;
      for (const k of [1, 2, 3]) el.classList.toggle(`rpg-m${k}`, star === k);
      el.classList.toggle('rpg-fog', !star);
    }
    svg.setAttribute('aria-label', T('仲間にした国の世界地図（仲間 {n}/{total}）', { n: owned({ cards }), total: TOTAL }));
  };

  // シェア: 押した処理の中で（await の前に）navigator.share。閉じただけ（AbortError）なら何もしない。
  // share が無いときと、AbortError 以外で失敗したときだけ X の投稿画面を新しいタブで開く。勝手には開かない
  const share = (kind, text) => {
    const url = window.SHARECARD?.url?.() ?? U.share.url;   // 英語は …/country-drill/en/
    const tweet = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
    const failed = e => { if (e?.name !== 'AbortError') tweet(); };
    if (typeof navigator.share === 'function') {
      try { Promise.resolve(navigator.share({ text, url })).catch(failed); } catch (e) { failed(e); }
    } else tweet();
    emit('rpg:share', { kind });
  };
  const shareButton = (kind, text) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn ghost rpg-share'; b.textContent = T('シェア');
    b.onclick = () => { try { share(kind, text); } catch (e) { console.error('[rpg]', e); } };
    return b;
  };
  // 仲間の数（TUNING.share.cards）と、地域の国を全部仲間にした、に届いたもの。before / after は持っている国コードの配列。ユーザーが入れた文字は入れない
  const milestones = (before, after) => {
    const { cards } = U.share, tag = T(U.share.tag), n0 = before.length, n1 = after.length, out = [];
    for (const n of cards) if (n0 < n && n1 >= n) out.push({ kind: `cards-${n}`, msg: T('仲間が{n}か国になった！', { n }), text: T('国旗クエストで仲間が{n}か国になった！ {tag}', { n, tag }) });
    for (const g of REGION_DG) {
      const k0 = before.filter(a => inArea(a, g.r)).length, k1 = after.filter(a => inArea(a, g.r)).length;
      const land = RPG.dgLand(g);
      if (k0 < AREA_N[g.r] && k1 >= AREA_N[g.r])
        out.push({ kind: `region-${g.id}`, msg: T('{land}の国を全部仲間にした！', { land }), text: T('国旗クエストで{land}の国を全部仲間にした！ 仲間 {n}/{total}か国 {tag}', { land, n: n1, total: TOTAL, tag }) });
    }
    return out;
  };
  // シェアの行（「🎉 仲間が50か国になった！［シェア］」）を box に描く。無ければ空にして隠す
  const drawShares = (box, list) => {
    if (!box) return;
    box.replaceChildren(...list.map(s => {
      const p = document.createElement('p'), msg = document.createElement('span');
      p.className = 'rpg-share-row';
      msg.textContent = `🎉 ${s.msg}`;
      p.append(msg, shareButton(s.kind, s.text));
      return p;
    }));
    box.hidden = !list.length;
  };

  // 演出。ドパガキ（S.dopa は毎回読む）と reduced motion を見て決める。FX の効果音・振動はドパガキ ON のときだけ（OFF なら SND のふつうの効果音）、
  // 紙吹雪・フラッシュ・ポップ・浮かぶ数字は reduced motion では呼ばない（FX は自分では確かめないため）
  //   hit:   el（モンスター）が揺れて白く光り、n（ダメージ）が浮かぶ（reduced motion では白く光るだけ）。combo はこの正解をふくむ連続正解の数
  //   miss:  el（旅人の HP バー）が赤く光る
  //   win:   勝利の表示（画面は呼ぶ側が出す）
  //   gold:  el（★3 のカード）が金色に光る
  //   count: el の数を n にする（ドパガキ ON ならカウントアップ）
  const OUCH_MS = 900, GLOW_MS = 400, COUNT_MS = 800, ouchTimer = new WeakMap(), glowTimer = new WeakMap();
  // 0 から n まで数え上げ、+n を浮かべる（結果のパネルは画面を出す前に描くので、場所は次のフレームで測る）
  const countUp = (el, n) => {
    let t0 = 0;
    const step = now => {
      if (!el.isConnected) return;
      if (!t0) {
        t0 = now;
        const r = el.getBoundingClientRect();
        if (r.width) FX.pts(n, r);
      }
      const k = Math.min(1, (now - t0) / COUNT_MS);
      el.textContent = fmt(k < 1 ? Math.round(n * (1 - (1 - k) ** 3)) : n);
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = fmt(0);
    requestAnimationFrame(step);
  };
  const fx = (kind, el = null, n = 0, combo = 0) => {
    try {
      const dopa = !!S.dopa, still = reduced(), rect = () => el?.getBoundingClientRect() ?? null;
      if (kind === 'hit') {
        if (el && !still) {
          el.classList.remove('rpg-hit');
          void el.offsetWidth;   // 続けて当たっても揺れ直す
          el.classList.add('rpg-hit');
          const num = document.createElement('span');
          num.className = 'rpg-dmg'; num.textContent = `-${n}`; num.setAttribute('aria-hidden', 'true');
          num.onanimationend = () => num.remove();
          setTimeout(() => num.remove(), 2000);   // CSS が読めなかったときも残さない
          el.append(num);
        } else if (el) {   // reduced motion: 揺らさず数字も出さず、白く光るだけ
          el.classList.add('rpg-hitglow');
          clearTimeout(glowTimer.get(el));
          glowTimer.set(el, setTimeout(() => el.classList.remove('rpg-hitglow'), GLOW_MS));
        }
        SND.play('hit', { combo: dopa ? 0 : combo });   // 当たった音はいつも。ドパガキはコンボの音も重ねる
        if (dopa) {
          FX.sfx('correct', combo);
          if (!still) {
            FX.confetti(rect(), 40);
            if (combo >= 5) FX.pop(typeof comboText === 'function' ? comboText(combo) : `${combo} COMBO!`);
          }
        }
      } else if (kind === 'miss') {
        if (el) {
          el.classList.remove('rpg-ouch');
          void el.offsetWidth;
          el.classList.add('rpg-ouch');
          clearTimeout(ouchTimer.get(el));
          ouchTimer.set(el, setTimeout(() => el.classList.remove('rpg-ouch'), OUCH_MS));
        }
        if (dopa) { FX.sfx('wrong'); FX.buzz([60, 40, 60]); if (!still) FX.flash('rgb(255 59 48 / .35)'); }
        else SND.play('damage');
      } else if (kind === 'win') {
        if (dopa) { FX.sfx('fanfare'); if (!still) FX.confetti(null, 220, true); }
        else SND.play('win');
      } else if (kind === 'gold') {
        el?.classList.add('is-gold');
        SND.play('gold');
        if (dopa && !still) { FX.flash('rgb(255 196 0 / .55)'); FX.confetti(rect(), 90); }
      } else if (kind === 'count') {
        if (!el) return;
        if (dopa && !still && n > 0) countUp(el, n); else el.textContent = fmt(n);
      }
    } catch (e) { console.error('[rpg]', e); }
  };

  /* ---------- window.RPG に足す・画面を登録する ---------- */
  // rpg.js の RPG にある代わり（演出・シェア・世界地図なし）を本物に入れかえる。redraw は rpg.js の refresh が呼ぶ（いまの画面がガチャ・仲間なら描き直す。ガチャの結果は消さない）
  Object.assign(RPG, {
    cardHTML, openCard, worldMap, shareButton, milestones, drawShares, fx,
    redraw: (screen, d) => {
      if (screen === 'gacha') drawGacha(d);
      if (screen === 'cards') drawCards(d);
    },
  });
  // 画面: footer の直前に <section> を作ってから登録する（rpg.js の冒険ホームの後、rpg-battle.js のバトルの前）
  const wrap = document.querySelector('body > .wrap'), foot = wrap.querySelector(':scope > footer');
  const addScreen = (name, render, html) => {
    const sec = document.createElement('section');
    sec.id = `scr-${name}`; sec.className = 'wrap'; sec.hidden = true; sec.innerHTML = html;
    if (foot) foot.before(sec); else wrap.append(sec);
    registerScreen(name, render);
    return sec;
  };
  bindGacha(addScreen('gacha', renderGacha, GACHA_HTML));
  bindCards(addScreen('cards', drawCards, CARDS_HTML));
})();
