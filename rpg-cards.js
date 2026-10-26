(() => {
  'use strict';
  // 国旗クエストの仲間のカード（RPG.cardHTML・RPG.openCard）、国旗ガチャ（#scr-gacha）と仲間の一覧（#scr-cards）、
  // 仲間の世界地図（RPG.worldMap）・シェア（RPG.shareButton・RPG.milestones・RPG.drawShares）・演出（RPG.fx）
  // rpg.js の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）。
  // セーブ・コイン・画面の切りかえなど rpg.js の部品は window.RPG を通して使う

  // rpg.js が起動していなければ何もしない（rpg.js は index.html のグローバルを確かめてから window.RPG を作る。
  // 足りないものは rpg.js と rpg-battle.js が [rpg] で知らせるので、ここでは黙る）
  const RPG = window.RPG;
  if (typeof RPG?.tx !== 'function') return;

  const K = RPG_CORE, T = K.TUNING, DG = K.DUNGEONS, TOTAL = C.length;
  const COIN = '<i class="coin" aria-hidden="true"></i>';
  const owned = d => Object.keys(d.cards).length;
  const restHint = rest => `あと${rest}回正解で仲間に（1回のゲームで1回ぶん）`;

  /* ---------- 仲間のカード・国旗ガチャ（#scr-gacha）・仲間の一覧（#scr-cards） ---------- */
  const STAR_NAME = ['', 'ブロンズ', 'シルバー', 'ゴールド'];
  // 地域のダンジョン（地図喰いの巣をのぞく6つ）。地域のチップは全世界と、国の数が少ない順の6地域（ダンジョンの順）。値は S.region と同じ形（'all' か地域名）
  const REGION_DG = DG.filter(g => g.r !== 'all');
  const AREAS = ['all', ...REGION_DG.map(g => g.r)];
  const AREA_N = Object.fromEntries(AREAS.map(r => [r, r === 'all' ? TOTAL : C.filter(c => c.r === r).length]));
  const inArea = (a, r) => r === 'all' || byA.get(a)?.r === r;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dots = n => '●'.repeat(n) + '○'.repeat(T.card.stackMax - n);   // かさね ●●○○
  const backBtn = '<button type="button" class="linkbtn rpg-back">← 冒険</button>';
  // チップは1回だけ作り、押した状態と「持っている数/国の数」だけ描き直す（押したチップのフォーカスが外れない）
  const chipsHTML = allLabel => AREAS.map(r => `<button type="button" class="chip" aria-pressed="false" data-r="${r}">${r === 'all' ? allLabel : r}<span class="mono"></span></button>`).join('');
  const drawChips = (box, d, sel) => {
    const as = Object.keys(d.cards);
    for (const b of box.children) {
      const r = b.dataset.r;
      b.setAttribute('aria-pressed', String(r === sel));
      b.lastElementChild.textContent = ` ${as.filter(a => inArea(a, r)).length}/${AREA_N[r]}`;
    }
  };

  // 仲間のカード（<button>）: 国旗・国名・★・かさね・なかよし度。持っていない国は国旗をグレーで薄く（.is-none）、あと何回正解で仲間になるか
  // （なかよし度が5以上なのに持っていない国には出さない）。face: 'back' は裏向き（.is-back。方位磁針の模様）
  const cardHTML = (a, d, { face = 'up', label = '', lazy = false } = {}) => {
    const c = byA.get(a);
    if (!c) return '';
    const card = d.cards?.[a], fr = d.fr?.[a] || 0, star = card ? card[0] : 0, rest = T.card.frJoin - fr, back = face === 'back';
    const mid = card
      ? `<span class="rpg-card-star">${'★'.repeat(star)}</span><span class="rpg-card-stack" title="かさね ${card[1]}/${T.card.stackMax}">${dots(card[1])}</span>`
      : rest > 0 ? `<span class="rpg-card-hint">${restHint(rest)}</span>` : '';
    return `<button type="button" class="rpg-card rpg-s${star}${card ? '' : ' is-none'}${back ? ' is-back' : ''}" data-a="${a}" data-star="${star}"${back ? ' aria-label="裏向きのカード"' : ''}>`
      + `<span class="rpg-card-face">${label ? `<span class="rpg-lab">${label}</span>` : ''}<img class="rpg-card-flag" src="${flag(a)}" alt=""${lazy ? ' loading="lazy"' : ''}>`
      + `<b class="rpg-card-name" style="--n:${c.n.length}">${esc(c.n)}</b>${mid}<span class="rpg-card-fr" title="なかよし度">♥${fr}/${T.card.frMax}</span></span>`
      + '<span class="rpg-card-back" aria-hidden="true"><span>🧭</span></span></button>';
  };
  // #detail に国の情報とカードの強さ。id があればそのダンジョンでの値（地域ボーナス ×1.5 が付くか）
  const openCard = (a, id) => {
    const c = byA.get(a), dlg = $('detail'), inner = $('detail-inner');
    if (!c || !dlg || !inner) return;
    const d = RPG.get(), card = d.cards[a], fr = d.fr[a] || 0, g = id ? K.dungeonOf(id) : null;
    let info;
    if (card) {
      const bonus = !!g && (g.r === 'all' || g.r === c.r), atk = K.cardAtk(card, fr, bonus);
      const nw = s => `<span class="rpg-nowrap">${s}</span>`;
      info = `<p>${nw(`★${card[0]} ${STAR_NAME[card[0]]}`)}・${nw(`かさね ${dots(card[1])}`)}・${nw(`なかよし度 ♥${fr}/${T.card.frMax}`)}</p>`
        + `<p class="rpg-cd-pow">${nw(`こうげき ${atk.toFixed(1)}`)}${nw(`（地域ボーナス ${bonus ? 'あり' : 'なし'}）`)}・${nw(`HP ${(atk * T.card.hpMul).toFixed(1)}`)}</p>`
        + (g ? '' : `<p class="hint">${esc(c.r)}のダンジョンと地図喰いの巣では、地域ボーナスで ×${T.card.regionMul}</p>`);
    } else {
      info = `<p class="rpg-cd-pow">まだ仲間じゃない（なかよし度 ♥${fr}/${T.card.frMax}）</p>`
        + (fr < T.card.frJoin ? `<p class="hint">${restHint(T.card.frJoin - fr)}</p>` : '');
    }
    inner.innerHTML = `<button class="close">閉じる</button>${factsHTML(c)}<div class="rpg-cd-info">${info}</div>`;
    inner.querySelector('.close').onclick = () => dlg.close();
    if (!dlg.open) dlg.showModal();
  };

  // ---- 国旗ガチャ ----
  const GA_NOTE = '※コインはクイズで集めるゲームの中のコインだけ。お金はかからないし、買うこともできないよ。';
  const GA_LABEL = { new: () => 'NEW', up: () => 'ランクアップ', stack: () => 'かさね+1', refund: star => `おかえし ${COIN}${fmt(T.gacha.refund[star])}` };
  const GACHA_HTML = `<div class="rpg-head">${backBtn}<h2 class="rpg-h2">国旗ガチャ</h2><span class="rpg-hcoin" id="ga-coins"></span></div>`
    + '<div class="rpg-ga-side"><p class="rpg-warn" id="ga-warn" role="status" hidden></p><p class="rpg-lbl" id="ga-q">どこの国と出会う？</p>'
    + `<div class="chips" id="ga-regions" role="group" aria-labelledby="ga-q">${chipsHTML('全世界')}</div>`
    + `<p class="hint" id="ga-hint">選んだ地域のダンジョンでは、その地域の仲間が ×${T.card.regionMul} で強い</p>`
    + '<div class="rpg-ga-btns"><button class="btn ghost" id="ga-free"></button><button class="btn" id="ga-1"></button><button class="btn" id="ga-10"></button></div>'
    + '<p class="rpg-ga-need" id="ga-need" hidden></p><p class="rpg-ga-msg" id="ga-msg" role="status"></p><p class="rpg-ga-pity" id="ga-pity"></p>'
    + `<div class="rpg-ga-rates" id="ga-rates"></div><p class="rpg-ga-note" id="ga-note">${GA_NOTE}</p></div>`
    + '<div class="rpg-ga-main" id="ga-main"><p class="rpg-lbl">結果</p><p class="hint" id="ga-empty">引いたカードがここに並ぶよ</p>'
    + '<div class="rpg-ga-res" id="ga-res"></div><div class="rpg-shares" id="ga-share" hidden></div><button class="btn ghost" id="ga-flipall" hidden>ぜんぶめくる</button></div>';
  // 提供割合。表示する値も抽選と同じ TUNING.gacha から（gachaRates）
  const ratesHTML = r => {
    const R = K.gachaRates(), n = AREA_N[r];
    return '<p class="rpg-ga-rh">出る確率</p><ul>'
      + `<li>★3 ゴールド ${R.r3}% / ★2 シルバー ${R.r2}%</li><li>★1 ブロンズ ${R.r1}%</li>`
      + `<li>10回引くと10枚目は★2以上（★3 ${R.tenR3}% / ★2 ${R.tenR2}%）</li>`
      + `<li>★3が出ないまま${R.pity}回目 → ★3確定</li>`
      + `<li>国は選んだ地域から同じ確率（${r === 'all' ? '全世界' : r}なら 各 1/${n} = ${(100 / n).toFixed(1)}%）</li>`
      + `<li>天井込みの★3の目安: 約${R.eff3.toFixed(1)}%</li></ul>`;
  };
  // gaBusy: 引いてから全部めくれるまで（そのあいだはどのボタンも押せない）。gaShares: 全部めくれたら結果の下に出すシェア
  let gaRegion = 'all', gaBusy = false, gaTimer = null, gaShares = [];
  // 最初に選んでおく地域: RPG.open で渡したもの → 次に挑むダンジョンの地域 → 全部クリアなら前回の地域、それも無ければ全世界
  const firstRegion = d => {
    const want = RPG.opts?.region, nf = RPG.nextFloor(d);
    if (AREAS.includes(want)) return want;
    return nf ? K.dungeonOf(nf.id).r : AREAS.includes(d.gr) ? d.gr : 'all';
  };
  // ボタン・チップ・天井・提供割合・コイン（結果はそのまま）。新しい版のデータのあいだは引けない（書けないので）
  const drawGacha = (d = RPG.get()) => {
    if (!$('ga-regions')) return;
    const { one, ten, pity } = T.gacha, free = $('ga-free'), need = $('ga-need'), warn = $('ga-warn'), stop = gaBusy || RPG.status === 'readOnly';
    warn.textContent = RPG.warn;
    warn.hidden = !RPG.warn;
    $('ga-coins').innerHTML = RPG.coinHTML(d.coins);
    drawChips($('ga-regions'), d, gaRegion);
    free.textContent = d.day.free ? 'また明日' : d.day.first ? '無料1回' : '今日クイズを1回クリアすると無料1回';
    free.disabled = stop || !d.day.first || d.day.free;
    $('ga-1').innerHTML = `1回 ${COIN}${fmt(one)}`;
    $('ga-1').disabled = stop || d.coins < one;
    $('ga-10').innerHTML = `10回 ${COIN}${fmt(ten)}`;
    $('ga-10').disabled = stop || d.coins < ten;
    need.hidden = d.coins >= ten;
    need.innerHTML = need.hidden ? '' : `あと${COIN}${fmt(ten - d.coins)}`;
    $('ga-pity').textContent = `★3確定まで あと${pity - d.pity}回`;
    $('ga-rates').innerHTML = ratesHTML(gaRegion);
  };
  // 表にする。★3 は表になったところで金色の演出
  const flipCard = el => {
    el.classList.remove('is-back');
    el.removeAttribute('aria-label');
    if (el.classList.contains('is-gold')) fx('gold', el);
  };
  // 残りを全部表にして、［ぜんぶめくる］を隠し、ボタンを戻し、シェアを出す（［ぜんぶめくる］もここ）。
  // ［ぜんぶめくる］にフォーカスがあれば（引くボタンから移してある）、消えるので最初のカードへ
  const endFlip = () => {
    clearInterval(gaTimer);
    gaTimer = null;
    const box = $('ga-res'), all = $('ga-flipall');
    box.querySelectorAll('.rpg-card.is-back').forEach(flipCard);
    gaBusy = false;
    if (document.activeElement === all) box.firstElementChild?.focus({ preventScroll: true });
    all.hidden = true;
    drawShares($('ga-share'), gaShares);
    drawGacha();
  };
  const startFlip = () => {
    clearInterval(gaTimer);
    gaTimer = setInterval(() => {
      const el = $('ga-res').querySelector('.rpg-card.is-back');
      if (el) flipCard(el);
      if (!$('ga-res').querySelector('.rpg-card.is-back')) endFlip();
    }, T.gacha.flipMs);
  };
  const clearResults = () => {
    clearInterval(gaTimer);
    gaTimer = null;
    gaBusy = false;
    gaShares = [];
    $('ga-res').innerHTML = '';
    drawShares($('ga-share'), []);
    $('ga-flipall').hidden = true;
    $('ga-empty').hidden = false;
  };
  // 結果を裏向きで並べて flipMs ずつめくる（reduced motion なら最初から表）。カードは1枚ずつ足していったときの★とかさね
  const drawResults = (res, before, d) => {
    const box = $('ga-res'), back = !reduced(), now = { cards: { ...before }, coins: 0, earned: 0 };
    box.innerHTML = res.map(r => {
      K.addCard(now, r.a, r.star);
      return cardHTML(r.a, { cards: { [r.a]: now.cards[r.a] }, fr: d.fr }, { face: back ? 'back' : 'up', label: GA_LABEL[r.out](r.star) });
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
    if (back) {
      if (['ga-free', 'ga-1', 'ga-10'].includes(document.activeElement?.id)) $('ga-flipall').focus({ preventScroll: true });
      startFlip();
    } else endFlip();
    // スマホは結果がボタンと確率の下なので、結果まで送る
    if (innerWidth < 900) $('ga-main').scrollIntoView({ block: 'nearest', behavior: back ? 'smooth' : 'auto' });
  };
  // 引けなかったときの1行（#ga-msg）。引けたら消す
  const GA_MSG = {
    coins: 'コインが足りないので引けなかったよ（ほかのタブで使ったかも）',
    free: '今日の無料1回はもう使っているか、まだ今日クイズをクリアしていないよ',
    save: '保存できなかったので、引いていないよ',
  };
  const sayGacha = key => { const el = $('ga-msg'); if (el) el.textContent = GA_MSG[key] || ''; };
  // 1回の tx で コインを引く（無料なら day.free）→ 抽選 → gr。書けてから結果を描き、イベントは tx が返ってから
  const pullGacha = (count, free) => {
    if (gaBusy) return;
    gaBusy = true;
    for (const id of ['ga-free', 'ga-1', 'ga-10']) $(id).disabled = true;   // 連打で二重に引かない
    const region = gaRegion, cost = free ? 0 : count === 10 ? T.gacha.ten : T.gacha.one;
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
    let owned0 = Object.keys(d.cards).length - res.filter(r => r.out === 'new').length;
    emit('rpg:pull', { region, count, free, results: res.map(r => ({ ...r })), pity: d.pity, pulls: d.pulls });
    for (const r of res) {
      if (r.out === 'new') emit('rpg:join', { a: r.a, via: 'gacha', owned: ++owned0 });
      if (r.out === 'up') emit('rpg:promote', { a: r.a, star: r.star, via: 'gacha' });
    }
    RPG.emitCoins(d, -cost, 'gacha');
    RPG.emitCoins(d, res.reduce((s, r) => s + (r.out === 'refund' ? T.gacha.refund[r.star] : 0), 0), 'refund');
    drawResults(res, before, d);
    drawGacha();
  };
  // screenRender.gacha: 開くたびに地域を選び直し、前の結果を消す
  const renderGacha = () => {
    const d = RPG.get();
    gaRegion = firstRegion(d);
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
    // 裏向きのカードはめくるだけ（最後の1枚なら全部めくれたことにする）。詳細は表になってから
    $('ga-res').onclick = e => {
      const b = e.target.closest('.rpg-card');
      if (!b) return;
      if (!b.classList.contains('is-back')) { openCard(b.dataset.a); return; }
      flipCard(b);
      if (!$('ga-res').querySelector('.rpg-card.is-back')) endFlip();
    };
  };

  // ---- 仲間の一覧（★の多い順 → 国名の順で固定。地図 #cd-map の中身は Task 12） ----
  const CARDS_HTML = `<div class="rpg-head">${backBtn}<h2 class="rpg-h2" id="cd-count"></h2></div>`
    + `<div class="chips" id="cd-regions" role="group" aria-label="地域でしぼりこむ">${chipsHTML('すべて')}</div>`
    + '<div class="rpg-cd-map" id="cd-map"></div><div class="rpg-cd-grid" id="cd-grid"></div>';
  let cdRegion = 'all', byName = null;
  const drawCards = (d = RPG.get()) => {
    if (!$('cd-grid')) return;
    byName ||= C.map(c => c.a).sort((x, y) => byA.get(x).n.localeCompare(byA.get(y).n, 'ja'));
    const star = a => d.cards[a]?.[0] || 0;
    $('cd-count').textContent = `仲間 ${owned(d)} / ${TOTAL}`;
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
  const LEGEND = [['rpg-m1', '★1 ブロンズ'], ['rpg-m2', '★2 シルバー'], ['rpg-m3', '★3 ゴールド'], ['rpg-fog', 'まだ']];
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
    svg.setAttribute('aria-label', `仲間にした国の世界地図（仲間 ${Object.keys(cards).length}/${TOTAL}）`);
  };

  // シェア: 押した処理の中で（await の前に）navigator.share。閉じただけ（AbortError）なら何もしない。
  // share が無いときと、AbortError 以外で失敗したときだけ X の投稿画面を新しいタブで開く。勝手には開かない
  const share = (kind, text) => {
    const { url } = T.share;
    const tweet = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
    const failed = e => { if (e?.name !== 'AbortError') tweet(); };
    if (typeof navigator.share === 'function') {
      try { Promise.resolve(navigator.share({ text, url })).catch(failed); } catch (e) { failed(e); }
    } else tweet();
    emit('rpg:share', { kind });
  };
  const shareButton = (kind, text) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn ghost rpg-share'; b.textContent = 'シェア';
    b.onclick = () => { try { share(kind, text); } catch (e) { console.error('[rpg]', e); } };
    return b;
  };
  // 仲間の数（TUNING.share.cards）と、地域の国を全部仲間にした、に届いたもの。before / after は持っている国コードの配列。ユーザーが入れた文字は入れない
  const milestones = (before, after) => {
    const { cards, tag } = T.share, n0 = before.length, n1 = after.length, out = [];
    for (const n of cards) if (n0 < n && n1 >= n) out.push({ kind: `cards-${n}`, msg: `仲間が${n}か国になった！`, text: `国旗クエストで仲間が${n}か国になった！ ${tag}` });
    for (const g of REGION_DG) {
      const k0 = before.filter(a => inArea(a, g.r)).length, k1 = after.filter(a => inArea(a, g.r)).length;
      if (k0 < AREA_N[g.r] && k1 >= AREA_N[g.r])
        out.push({ kind: `region-${g.id}`, msg: `${g.land}の国を全部仲間にした！`, text: `国旗クエストで${g.land}の国を全部仲間にした！ 仲間 ${n1}/${TOTAL}か国 ${tag}` });
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

  // 演出。ドパガキ（S.dopa は毎回読む）と reduced motion を見て決める。FX の効果音・振動はドパガキ ON のときだけ、
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
      } else if (kind === 'win') {
        if (dopa) { FX.sfx('fanfare'); if (!still) FX.confetti(null, 220, true); }
      } else if (kind === 'gold') {
        el?.classList.add('is-gold');
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
