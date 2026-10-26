(() => {
  'use strict';
  // 国旗クエスト（RPG）の本体: セーブ（RPG.tx）、クイズのコインの受け取り（#pcoin・結果のパネル・トースト）、バッジのコインの支払い、
  // 冒険ホーム（入口・はじめての画面・引き継ぎコード・開発用パネル）、タブ間の同期、RPG.snapshot()
  // 国旗ガチャと仲間の一覧、仲間の世界地図・シェア・演出（RPG.fx）は rpg-cards.js（このあとに読む）が window.RPG に足す
  // index.html のインライン script の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）

  // ---- 起動時のチェック。足りなければ何もしない（ボタンも画面も作らない。クイズはそのまま動く） ----
  const NEED = {
    C: typeof C, byA: typeof byA, REGIONS: typeof REGIONS, flag: typeof flag, esc: typeof esc, fmt: typeof fmt, $: typeof $,
    store: typeof store, S: typeof S, P: typeof P, FX: typeof FX, show: typeof show, registerScreen: typeof registerScreen,
    screenRender: typeof screenRender, emit: typeof emit, toast: typeof toast, makeQuestion: typeof makeQuestion,
    mapSvg: typeof mapSvg, zoomableMap: typeof zoomableMap, factsHTML: typeof factsHTML, shuffle: typeof shuffle,
    feats: typeof feats, featCountry: typeof featCountry, featOf: typeof featOf, boxProjection: typeof boxProjection,
    WORLD_BOX: typeof WORLD_BOX, W: typeof W, H: typeof H, d3: typeof d3, misses: typeof misses, SCREENS: typeof SCREENS,
    RPG_CORE: typeof RPG_CORE,
  };
  const missing = Object.keys(NEED).filter(k => NEED[k] === 'undefined');
  if (missing.length) { console.error(`[rpg] 必要なものが読み込めなかったので、冒険はお休み: ${missing.join(' ')}`); return; }

  const K = RPG_CORE, T = K.TUNING;
  const KEY = 'rpg', BROKEN = 'rpg-broken-';
  const KEEP_BROKEN = 3;      // 壊れたセーブの写しは新しいものから3つ（設計書 §9）
  const KEEP_BADGES = 500;    // badgesPaid は最新500件
  const COIN = '<i class="coin" aria-hidden="true"></i>';
  const MSG = {
    broken: 'データを読めなかったので最初からになったよ',
    readOnly: '新しいバージョンのデータが見つかったよ。ページを再読み込みしてね',
    quota: '保存できなかった…',
    firstCoin: 'コインがたまったよ！ 冒険でレベルアップやガチャに使えるよ',
  };
  const todayStr = () => K.today(new Date());
  // misses は index.html の let（記録を消すと別のオブジェクトになる）。参照を取っておかず、毎回読む
  const missesNow = () => (misses && typeof misses === 'object') ? misses : {};
  const names = as => as.map(a => esc(byA.get(a)?.n ?? a)).join('・');
  const JOIN_MAX = 5;   // 仲間になった国の一覧は5か国まで、あとは「ほか n か国」（結果のパネルもトーストも同じ）
  const joinedText = as => { const j = as.slice(0, JOIN_MAX), more = as.length - j.length; return `${names(j)}${more ? `ほか${more}か国` : ''}`; };
  // document のイベントを受ける。例外はクイズに伝えずコンソールに出す
  const on = (type, f) => document.addEventListener(type, e => {
    try { f(e.detail ?? {}, e); } catch (err) { console.error('[rpg]', err); }
  });

  /* ---------- セーブ（localStorage の 'rpg'。書くのは必ず tx） ---------- */
  // localStorage に触るだけで例外が出る端末では、メモリの文字列で動く（閉じると消える）
  let ls = null, mem = null, status = 'ok';
  try { ls = window.localStorage; ls.getItem(KEY); } catch { ls = null; status = 'memory'; }
  let wrote = true;            // 最後の tx の書きこみが届いたか（バッジの支払いで使う）
  let saidBroken = false, saidQuota = false, persisted = false, refreshQueued = false, backedUp = null;

  const readRaw = () => ls ? ls.getItem(KEY) : mem;
  // 文字列 → migrate の結果 { d, readOnly, backup }。JSON として読めないとき（と移行が例外を出したとき）は写しを取って新しく始める
  const load = raw => {
    const t = todayStr();
    if (raw == null) return K.migrate(null, t);
    try { return K.migrate(JSON.parse(raw), t); } catch { return { d: K.fresh(t), readOnly: false, backup: true }; }
  };
  // 壊れたかもしれない文字列を rpg-broken-<時刻>-<k> に写し、新しい順（時刻、同じなら k の大きい順）に3つだけ残す。復元（引き継ぎ）も使う
  const backupRaw = str => {
    if (!ls || typeof str !== 'string') return;
    try {
      const now = Date.now();
      let k = 0;
      while (ls.getItem(`${BROKEN}${now}-${k}`) !== null) k++;
      ls.setItem(`${BROKEN}${now}-${k}`, str);
      const order = key => (/^(\d+)-(\d+)$/.exec(key.slice(BROKEN.length)) || [0, -1, -1]).slice(1).map(Number);
      const keys = [];
      for (let i = 0; i < ls.length; i++) { const key = ls.key(i); if (key?.startsWith(BROKEN)) keys.push(key); }
      keys.sort((x, y) => { const [t1, k1] = order(x), [t2, k2] = order(y); return t2 - t1 || k2 - k1; });
      for (const key of keys.slice(KEEP_BROKEN)) ls.removeItem(key);
    } catch (e) { console.error('[rpg]', e); }
  };
  // 書けたら true。失敗したら「保存できなかった…」を1回だけ（例外は外に出さない）
  const writeRaw = str => {
    if (!ls) { mem = str; return true; }
    try { ls.setItem(KEY, str); } catch {
      if (!saidQuota) { saidQuota = true; toast(MSG.quota); }
      return false;
    }
    return true;
  };
  // RPG.refresh() を次のフレームで1回（同じフレームの中の予約はまとめる）
  const queueRefresh = () => {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      try { RPG.refresh(); } catch (e) { console.error('[rpg]', e); }
    });
  };
  // その場で読む → migrate → sanitize → fn(d) → 変わっていたら書く。fn の戻り値を返す（新しい版のデータなら fn を呼ばず null）。
  // fn の中ではイベント・トースト・tx を出さない（出すものは戻り値に集めて、tx が返ってから出す）
  const tx = fn => {
    try {
      const raw = readRaw(), r = load(raw);
      status = !ls ? 'memory' : r.readOnly ? 'readOnly' : 'ok';
      if (r.readOnly) { wrote = false; return null; }   // 何も書いていない
      if (r.backup && raw !== backedUp) {
        backedUp = raw;
        backupRaw(raw);
        if (!saidBroken) { saidBroken = true; toast(MSG.broken); }
      }
      const e0 = r.d.earned, out = fn(r.d), str = JSON.stringify(r.d);
      wrote = true;
      // 変わらなければ書かない（描き直しから tx を呼んでも、書く → 描き直す の輪にならない）
      if (str !== raw) { wrote = writeRaw(str); if (wrote) queueRefresh(); }
      // 消されにくい保存（persist）は、稼いだコインを書けたときに頼む（ページを開くごとに1回まで）。Firefox は確認を出すので、
      // 起動時の書き直し・日付の書き直し・ゲームの開始では頼まない。冒険の表示が OFF のときも頼まない
      if (wrote && ls && !persisted && r.d.earned > e0 && r.d.show !== false) { persisted = true; try { navigator.storage?.persist?.()?.catch?.(() => {}); } catch {} }
      return out;
    } catch (e) { console.error('[rpg]', e); wrote = false; return null; }
  };
  // 読むだけ（書かない・写さない・トーストを出さない）
  const get = () => {
    try { return load(readRaw()).d; } catch (e) { console.error('[rpg]', e); return K.fresh(todayStr()); }
  };

  /* ---------- コインのイベントと表示の部品 ---------- */
  const coinHTML = n => COIN + K.shortCoins(n);
  // rpg:coins。coins と earned は d ではなく出す時点のセーブから読む（tx が返ってから先に出したイベントのリスナー＝badges.js が
  // 同期でバッジのコインを払っていても、いまの額になる）。呼び出しの形 (d, delta, reason) はそのまま
  const emitCoins = (_d, delta, reason) => {
    if (!delta) return;
    const now = get();
    emit('rpg:coins', { delta, reason, coins: now.coins, earned: now.earned });
  };
  // レシートの仲間・昇格・克服・手配書をイベントにする（tx が返ってから呼ぶ。バトルも使う）。owned と total はその時点の数
  const announce = (rc, d) => {
    const owned = Object.keys(d.cards).length, st = d.st;
    rc.joined.forEach((a, i) => emit('rpg:join', { a, via: 'learn', owned: owned - (rc.joined.length - 1 - i) }));
    for (const a of rc.promoted) emit('rpg:promote', { a, star: 2, via: 'learn' });
    rc.overcome.forEach((a, i) => emit('rpg:overcome', { a, total: st.overcome - (rc.overcome.length - 1 - i) }));
    rc.bounty.forEach((a, i) => emit('rpg:bounty', { a, doneAll: rc.bountyAll && i === rc.bounty.length - 1, totalDays: st.bountyDays }));
  };

  /* ---------- クイズのコイン ---------- */
  // run: いまのゲーム（rpg-core の newRun）。結果を受け取ったら null。base: 最後に読んだセーブの写し。showCache: 冒険の表示（#pcoin を出すか）
  let run = null, base = null, showCache = true, answers = 0;
  // #pcoin に描くゲームと直前の答え。初めてのコインのトーストを出すか（armed: まだ出していない、due: 次のフレームで出す）
  let shown = null, last = null, firstArmed = false, firstDue = false, pcoinQueued = false;

  const startRun = det => {
    run = status === 'readOnly' ? null : K.newRun(det, base);   // 新しい版のデータのあいだはコインを数えない
    shown = run; last = null; answers = 0;
    firstArmed = base.earned === 0; firstDue = false;
  };
  // #pcoin（#ppts の直後）: このゲームのコイン。直前の答えが目減りしていれば ×0.5、はじめて正解なら「はじめて！+20」（次の答えで消える）
  const drawPcoin = () => {
    let el = $('pcoin');
    if (!shown || showCache === false) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('span');
      el.id = 'pcoin'; el.className = 'mono'; el.title = 'コイン（冒険で使える）';
      $('ppts').after(el);
    }
    const r = last;
    el.innerHTML = `+${fmt(shown.game.coins)} ${COIN}`
      + (r && r.coin > 0 && r.decay < 1 ? `<small class="rpg-decay">×${r.decay}</small>` : '')
      + (r && r.firstEver > 0 ? `<small class="rpg-fe">はじめて！+${r.firstEver}</small>` : '');
  };
  const queuePcoin = () => {
    if (pcoinQueued) return;
    pcoinQueued = true;
    requestAnimationFrame(() => {
      pcoinQueued = false;
      try {
        drawPcoin();
        if (firstDue) { firstDue = false; if (showCache !== false) toast(MSG.firstCoin); }
      } catch (e) { console.error('[rpg]', e); }
    });
  };

  on('drill:start', det => {
    const m = missesNow(), t = todayStr();
    tx(d => { K.ensureDay(d, m, t, Math.random); });
    base = get();
    showCache = base.show;
    startRun(det);
    drawPcoin();
  });
  // タイムアタックの計測中に同期で走るので、メモリの足し算だけ（localStorage に触らない。画面は次のフレーム）
  on('drill:answer', det => {
    if (!run || run.sid !== det.sid) {
      if (!base || status === 'readOnly') return;
      startRun(det);
    }
    last = K.runAnswer(run, det);
    answers++;
    if (firstArmed && last.coin > 0) { firstArmed = false; firstDue = true; }
    queuePcoin();
  });
  // この回で仲間になった国をのぞいたのが、始める前の仲間
  const ownedBefore = (d, rc) => Object.keys(d.cards).filter(a => !rc.joined.includes(a));
  // 次に冒険ホームを開いたときに出すシェア（出したら、押すか冒険ホームを離れるまで）
  let homeShares = [], homeSharesShown = false;
  on('drill:result', det => {
    if (!run || run.sid !== det.sid) return;
    const r = run, m = missesNow(), t = todayStr();
    run = null;   // 結果のあとの pagehide では何もしない
    let ctx = null;
    const rc = tx(d => {
      K.ensureDay(d, m, t, Math.random);
      const g = r.game.rc;
      ctx = { d, daily: g.daily, ov: g.overcome.length, bo: g.bounty.length, all: g.bountyAll };
      return K.settleRun(d, r, det, t);
    });
    if (!rc) return;
    const { d } = ctx;
    // この受け取りで新しく払った分だけ（途中の受け取りで払った分は入れない）
    const daily = rc.daily - ctx.daily, overcome = (rc.overcome.length - ctx.ov) * T.overcome;
    const bounty = (rc.bounty.length - ctx.bo) * T.bounty + (rc.bountyAll && !ctx.all ? T.bountyAll : 0);
    emitCoins(d, Math.max(0, rc.delta - daily - overcome - bounty), 'drill');
    emitCoins(d, daily, 'daily');
    emitCoins(d, overcome, 'overcome');
    emitCoins(d, bounty, 'bounty');
    announce(rc, d);
    if (d.show === false) return;   // 冒険の表示が OFF: コインと記録は貯まるが、何も出さない
    if (det.outcome === 'clear') drawResult(rc, d);
    else {
      if (rc.delta > 0) toast(`${COIN} +${fmt(rc.delta)} コイン`);
      if (rc.joined.length) toast(`🤝 ${joinedText(rc.joined)}が仲間になった！`);
      // 失格／にげたときはトーストに［シェア］を置けないので、節目は次に冒険ホームを開いたときに出す（開く前にまた届いたら足す）
      const sh = RPG.milestones(ownedBefore(d, rc), Object.keys(d.cards));
      if (sh.length) homeShares = [...homeShares.filter(s => !sh.some(x => x.kind === s.kind)), ...sh];
    }
  });
  // 途中の受け取り（iOS はアプリの切りかえで pagehide が来ないことがあるので visibilitychange でも）。トーストもパネルも出さない
  const settleMidway = () => {
    try {
      if (!run || !answers) return;
      const r = run, t = todayStr();
      tx(d => { K.settleRun(d, r, null, t); });
    } catch (e) { console.error('[rpg]', e); }
  };
  window.addEventListener('pagehide', settleMidway);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') settleMidway(); });
  on('drill:misses-reset', () => { tx(K.resetWeak); });

  /* ---------- 結果のパネル（#r-ext。クリアのときだけ。0 の行は出さない） ---------- */
  const drawResult = (rc, d) => {
    const ext = $('r-ext');
    if (!ext) return;
    const row = (label, coins) => coins > 0 ? `<li>${label} …… ${fmt(coins)}</li>` : '';
    const rows = row(`一発正解 ${rc.first.n}問`, rc.first.coins) + row(`やり直しで正解 ${rc.retry.n}問`, rc.retry.coins)
      + row(`正解 ${rc.ta.n}問`, rc.ta.coins) + row('クリアボーナス', rc.clear) + row(`はじめて正解 ${rc.fe.n}か国`, rc.fe.coins);
    const lines = [
      rc.daily > 0 && `🎁 今日はじめてのクリア +${fmt(rc.daily)} ／ 無料ガチャ1回ゲット`,
      rc.joined.length && `🤝 ${joinedText(rc.joined)}が仲間になった！（${T.card.frJoin}回正解した国は仲間になるよ）`,
      rc.promoted.length && `🏅 ${names(rc.promoted)}がシルバーに！`,
      rc.overcome.length && `✨ 克服！ ${names(rc.overcome)}はもう苦手じゃない +${fmt(T.overcome * rc.overcome.length)}`,
      rc.bounty.length && `📜 手配書 ${names(rc.bounty)} +${fmt(T.bounty * rc.bounty.length)}${rc.bountyAll ? `（3件ぜんぶ +${fmt(T.bountyAll)}）` : ''}`,
      rc.zeroed && 'タイムが速すぎたので、この回のコインはなし',
    ].filter(Boolean);
    // 仲間の数・地域の国を全部、に届いたらシェア（この回で仲間になった国をのぞいたのが、始める前の仲間）
    const shares = RPG.milestones(ownedBefore(d, rc), Object.keys(d.cards));
    ext.innerHTML = `<div class="rpg-res" id="rpg-res">`
      + `<p class="rpg-res-head">${COIN} +<span class="rpg-res-n">${fmt(rc.sum)}</span> コイン <span class="rpg-now">いま ${fmt(get().coins)}</span></p>`
      + (rows ? `<ul class="rpg-res-rows">${rows}</ul>` : '')
      + lines.map(l => `<p class="rpg-res-x">${l}</p>`).join('')
      + (shares.length ? '<div class="rpg-shares" id="rpg-res-share"></div>' : '')
      + `<button class="btn ghost" id="rpg-res-go">冒険へ →${d.intro ? '' : `（はじめてなら <span class="rpg-nowrap">${COIN}${fmt(T.start)}</span> のお祝いつき）`}</button></div>`;
    RPG.drawShares($('rpg-res-share'), shares);
    $('rpg-res-go').onclick = () => { if (SCREENS.includes('rpg')) show('rpg'); };   // 冒険の画面ができるまでは何もしない
    RPG.fx('count', ext.querySelector('.rpg-res-n'), rc.sum);
  };

  /* ---------- バッジのコイン（badges.js が同期で e.detail.paid を読む: 50 払った／0 もう払ってある／false 払えなかった） ---------- */
  // トーストは出さない（●+50 はバッジ側が出す）。retro: true（さかのぼり・払い残し）で新しく払った分だけは、
  // 同じタスクの中のものを数えておき、まとめてトースト1つ「バッジのごほうび ●+合計」
  let retroSum = 0;
  const retroToast = () => {
    const n = retroSum;
    retroSum = 0;
    try { if (n > 0 && get().show !== false) toast(`バッジのごほうび ${COIN}+${fmt(n)}`); } catch (e) { console.error('[rpg]', e); }
  };
  document.addEventListener('badge:earned', e => {
    try {
      const det = e.detail;
      if (!det || typeof det !== 'object') return;
      // 保存できないとき（新しい版のデータ・メモリだけ）は払わない（badges.js が次の起動で送り直すので、コインは消えない）
      if (status !== 'ok' || typeof det.id !== 'string') { det.paid = false; return; }
      let d = null;
      const paid = tx(x => {
        if (x.badgesPaid.includes(det.id)) return 0;
        x.coins = Math.min(K.BIG, x.coins + T.badge);
        x.earned = Math.min(K.BIG, x.earned + T.badge);
        x.badgesPaid = [...x.badgesPaid, det.id].slice(-KEEP_BADGES);
        d = x;
        return T.badge;
      });
      det.paid = paid === null ? false : paid === 0 ? 0 : wrote ? paid : false;
      if (det.paid > 0) {
        emitCoins(d, det.paid, 'badge');
        if (det.retro === true) {
          if (!retroSum) setTimeout(retroToast, 0);
          retroSum += det.paid;
        }
      }
    } catch (err) { console.error('[rpg]', err); }
  });

  /* ---------- 入口（ホームの［冒険］・トップバーのチップ・設定のスイッチ）と冒険ホーム（#scr-rpg） ---------- */
  const DG = K.DUNGEONS, AV = K.AVATARS, TOTAL = C.length;
  const REGION_DG = DG.filter(g => g.r !== 'all');   // 地域のダンジョン（地図喰いの巣をのぞく6つ）
  const BOSS = 5;   // フロアは F1〜F4 とボス（5）
  const STORY = [
    '世界地図をかじる怪物「地図喰い（ちずくい）」と、その手下のモンスターたちが、世界中の国旗を持っていっちゃった。',
    '旅人のきみは、クイズで集めたコインで力をつけ、国のカードの仲間といっしょに6つの地域を旅する。',
    '国を思い出すたびに、国旗がひとつ戻ってくる。地図喰いの巣で親玉をたおして、195の旗を取りもどそう！',
  ];
  const FLOOR_MARK = ['①', '②', '③', '④', '👑'];
  const JUDGE = { easy: ['余裕', 'is-easy'], ok: ['ちょうど', 'is-ok'], hard: ['きびしい', 'is-hard'] };
  // 設計書 §5.1 の例の表（ゲームとコインの列）。表示するだけの文なので、計算には使わない
  const EARN = [
    ['練習・国旗→国名・10問（一発8・やり直し2）', '80+6+20 = 106'],
    ['練習・10問・パーフェクト', '100+20+30 = 150'],
    ['挑戦・10問・ノーミス', '100+50+50 = 200'],
    ['挑戦・10問・3回目でクリア', '約70+50 = 120'],
    ['タイムアタック・10問・クリア', '50+30 = 80'],
    ['タイムアタック・10問・7問目で失格', '30'],
    ['練習・場所→国旗・全世界・全部（195問）・85%', '約1,990+90+470 = 約2,550'],
  ];
  const WARN = { readOnly: MSG.readOnly, memory: 'この端末では保存できないみたい。閉じると消えるよ' };

  const cleared = (d, id) => (d.floors || {})[id] || 0;
  // 開いているダンジョン: 1つ目、前のダンジョンのボスを倒した、または自分を1フロアでも進めた（壊れたセーブでも進んだところへは行ける）
  const unlocked = (d, id) => {
    const i = DG.findIndex(g => g.id === id);
    return i === 0 || (i > 0 && (cleared(d, DG[i - 1].id) >= BOSS || cleared(d, id) > 0));
  };
  // 次に挑むフロア: 開いているダンジョンを順に見て、最初のまだボスを倒していないもの。全部クリアなら null
  const nextFloor = d => {
    const g = DG.find(g => unlocked(d, g.id) && cleared(d, g.id) < BOSS);
    return g ? { id: g.id, floor: cleared(d, g.id) + 1 } : null;
  };
  const judgeOf = (d, id, floor) => K.judge(K.battleStats(d, id, floor), K.enemy(id, floor));
  const owned = d => Object.keys(d.cards).length;
  // ガチャ・仲間・バトルへはここを通す（まだ無い画面なら opts を置くだけ）
  const open = (name, opts = {}) => { RPG.opts = opts; if (SCREENS.includes(name)) show(name); };
  // ガチャ・仲間の画面があるか（rpg-cards.js が登録する。読み込めなかったときは、冒険ホームにガチャ・仲間の入口を出さない）
  const hasCards = () => SCREENS.includes('gacha') && SCREENS.includes('cards');
  // 称号（badges.js が無い・空なら出さない）
  const titleOf = () => {
    try { return String(window.BADGES?.title?.() || ''); } catch (e) { console.error('[rpg]', e); return ''; }
  };
  // 称号が変わったら（badge:title）旅人カードの称号だけその場で描き直す。冒険ホームを開いていなければ、次に開いたときに出る
  on('badge:title', () => {
    const el = $('rpg-title');
    if (!el) return;
    const t = titleOf();
    el.textContent = t ? `〈${t}〉` : '';
  });

  // ホームの［冒険］の小さいコインと NEW、トップバーのチップ
  const drawEntrances = (d = get()) => {
    const hb = $('home-rpg'), chip = $('rpg-chip');
    if (hb) hb.innerHTML = `冒険 <small class="rpg-homecoin">${coinHTML(d.coins)}</small>${d.intro ? '' : '<span class="rpg-new">NEW</span>'}`;
    if (chip) {
      chip.innerHTML = `${COIN}<b>${K.shortCoins(d.coins)}</b><span class="rpg-chip-l"> コイン</span>`;
      chip.setAttribute('aria-label', `コイン ${fmt(d.coins)}（冒険へ）`);
    }
  };

  // ---- レベルアップ（1回の tx で上げて払う。イベントは tx が返ってから） ----
  const levelUp = () => {
    let d = null, from = 0, cost = 0;
    tx(x => {
      const c = K.levelCost(x.lv);   // 上限の Lv では Infinity
      if (!(x.coins >= c)) return;
      from = x.lv; cost = c;
      x.lv++; x.coins -= c;
      d = x;
    });
    if (!d || !wrote) return;
    emit('rpg:levelup', { lv: d.lv, from });
    emitCoins(d, -cost, 'levelup');
  };
  const levelMax = () => {
    const d0 = get(), m = K.maxLevelUp(d0.lv, d0.coins);
    if (m.to <= d0.lv || !confirm(`Lv${m.to} まで ●${fmt(m.cost)} 使う？`)) return;
    let d = null, from = 0, spent = 0;
    tx(x => {
      from = x.lv;
      // 確かめた Lv まで。そのあいだに別のタブで使っていたら、払えるところまで
      while (x.lv < m.to && x.coins >= K.levelCost(x.lv)) { const c = K.levelCost(x.lv); x.coins -= c; spent += c; x.lv++; }
      if (x.lv > from) d = x;
    });
    if (!d || !wrote) return;
    emit('rpg:levelup', { lv: d.lv, from });
    emitCoins(d, -spent, 'levelup');
  };

  // ---- データ（引き継ぎコード・冒険データを消す）。はじめての画面には、別の端末から引っ越してきた人のための復元だけ ----
  // tx の中で使う: d の中身をそっくり src に入れかえる
  const replaceSave = (d, src) => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, src); };
  const wipeSave = () => tx(d => replaceSave(d, K.fresh(todayStr())));   // misses はそのまま
  const dataHTML = full => '<details class="rpg-data" id="rpg-data"><summary>データ（引き継ぎコード）</summary><div class="rpg-data-in">'
    + (full ? '<label class="rpg-lbl" for="rpg-code-out">引き継ぎコード（ほかの端末の「コードで復元」に入れる）</label>'
      + '<textarea class="rpg-code" id="rpg-code-out" rows="3" readonly></textarea>'
      + '<button class="btn ghost" id="rpg-code-copy">コピー</button>' : '')
    + '<label class="rpg-lbl" for="rpg-code-in">コードで復元（前の端末でコピーしたコードをはりつける）</label>'
    + '<textarea class="rpg-code" id="rpg-code-in" rows="3" spellcheck="false" autocomplete="off" placeholder="CQ1.…"></textarea>'
    + '<button class="btn ghost" id="rpg-code-load">コードで復元</button>'
    + '<p class="rpg-code-msg" id="rpg-code-msg" role="status"></p>'
    + (full ? '<button class="btn ghost rpg-danger" id="rpg-wipe">冒険データを消す</button>' : '')
    + '</div></details>';
  const sayData = s => { const el = $('rpg-code-msg'); if (el) el.textContent = s; };
  // 開いたとき（と描き直したとき）に、いまのセーブと misses からコードを作る
  const fillCode = () => { const out = $('rpg-code-out'); if (out) out.value = K.encodeCode(get(), missesNow()); };
  const copyCode = async () => {
    try {
      fillCode();
      try {
        if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('no clipboard');
        await navigator.clipboard.writeText($('rpg-code-out').value);
        sayData('コピーしたよ');
      } catch {
        const out = $('rpg-code-out');   // 待つあいだに描き直していても、いまの欄を選ぶ
        out?.focus();
        out?.select();
        sayData('コピーできなかったので、選んである文字をコピーしてね');
      }
    } catch (e) { console.error('[rpg]', e); }
  };
  // コードを読む → 上書きしてよいか聞く → 今の文字列を写す（rpg-broken-*）→ 書く → まちがえた記録も入れかえるか聞く → 描き直す
  const loadCode = () => {
    const r = K.decodeCode($('rpg-code-in')?.value ?? '', todayStr());
    if (!r.ok) { sayData('コードが正しくないみたい'); return; }
    if (status === 'readOnly') { sayData(MSG.readOnly); return; }
    const cur = get();
    if (!confirm(`今のデータを上書きする？（Lv${cur.lv}・仲間${owned(cur)} → Lv${r.rpg.lv}・仲間${owned(r.rpg)}）`)) return;
    backupRaw(readRaw());
    if (!tx(d => { replaceSave(d, r.rpg); return true; }) || !wrote) {   // 書けなかった（保存できなかったトーストは tx が出す）
      if (status === 'readOnly') sayData(MSG.readOnly);
      return;
    }
    if (r.hasM && confirm('まちがえた記録も入れかえる？')) { misses = r.m; store.set('misses', misses); }
    introAv = null;
    const inp = $('rpg-code-in');   // ホームのまま描き直すと持ち越されるので、はりつけたコードと前のメッセージを消しておく
    if (inp) inp.value = '';
    sayData('');
    refresh();
    window.scrollTo({ top: 0 });
    toast('引き継ぎコードで復元したよ');
  };
  const wipeAsk = () => {
    if (status === 'readOnly') { sayData(MSG.readOnly); return; }
    if (!confirm('冒険データを消す？（コイン・Lv・仲間が全部なくなる）') || !confirm('ほんとうに消す？ もとにもどせないよ')) return;
    wipeSave();
    introAv = null;
    refresh();
  };
  const bindData = () => {
    const box = $('rpg-data');
    if (!box) return;
    box.addEventListener('toggle', () => { if (box.open) fillCode(); });
    $('rpg-code-load').onclick = loadCode;
    if ($('rpg-code-copy')) $('rpg-code-copy').onclick = copyCode;
    if ($('rpg-wipe')) $('rpg-wipe').onclick = wipeAsk;
  };

  // ---- 開発用パネル（?rpgdebug=1 のときだけ冒険ホームの最後に出す。RPG.debug はいつもある） ----
  const DEBUG = (() => { try { return new URLSearchParams(location.search).get('rpgdebug') === '1'; } catch { return false; } })();
  const DEBUG_GIVE = 10000;   // ●+10,000（設計書 §5.4）
  const debugHTML = d => !DEBUG ? '' : '<div class="rpg-debug" id="rpg-debug"><p class="rpg-lbl">開発用パネル（?rpgdebug=1）</p><div class="rpg-debug-row">'
    + `<button class="btn ghost" id="rpg-dbg-give">${COIN}+${fmt(DEBUG_GIVE)}</button>`
    + `<span class="rpg-debug-lv"><label for="rpg-dbg-lv">Lv</label><input type="number" id="rpg-dbg-lv" min="1" max="${T.hero.maxLv}" value="${d.lv}">`
    + '<button class="btn ghost" id="rpg-dbg-setlv">Lv にする</button></span>'
    + '<button class="btn ghost" id="rpg-dbg-unlock">全部のフロアを開く</button>'
    + '<button class="btn ghost" id="rpg-dbg-wipe">冒険データを消す</button></div></div>';
  const bindDebug = () => {
    if (!$('rpg-debug')) return;
    $('rpg-dbg-give').onclick = () => RPG.debug.give(DEBUG_GIVE);
    $('rpg-dbg-setlv').onclick = () => RPG.debug.setLv($('rpg-dbg-lv').value);
    // どのダンジョンもボスまで行けるようにする（もう倒したボスはそのまま。倒したことにはしない）
    $('rpg-dbg-unlock').onclick = () => tx(x => { for (const g of DG) x.floors[g.id] = Math.max(cleared(x, g.id), BOSS - 1); });
    $('rpg-dbg-wipe').onclick = wipeAsk;
  };

  // ---- はじめての画面 ----
  let introAv = null;   // はじめての画面で選んでいるアバター（描き直しても残す）
  const warnHTML = () => WARN[status] ? `<p class="rpg-warn" id="rpg-warn" role="status">${WARN[status]}</p>` : '';
  const introHTML = d => {
    const av = introAv ?? d.av;
    return `<div class="rpg-intro" id="rpg-intro">${warnHTML()}`
      + '<h2 class="rpg-h1">国旗クエスト</h2><p class="rpg-sub">地図喰いから世界を取りもどせ</p>'
      + `<div class="rpg-story">${STORY.map(s => `<p>${s}</p>`).join('')}</div>`
      + '<p class="rpg-lbl" id="rpg-avlbl">旅人のすがたをえらぶ</p>'
      + `<div class="rpg-avpick" role="group" aria-labelledby="rpg-avlbl">${AV.map((e, i) => `<button type="button" data-av="${i}" aria-pressed="${i === av}">${e}</button>`).join('')}</div>`
      + `<button class="btn" id="rpg-go">旅に出る</button>${dataHTML(false)}</div>${debugHTML(d)}`;
  };
  const bindIntro = d => {
    const box = $('scr-rpg').querySelector('.rpg-avpick');
    box.onclick = e => {
      const b = e.target.closest('button[data-av]');
      if (!b) return;
      introAv = +b.dataset.av;
      for (const x of box.children) x.setAttribute('aria-pressed', String(x === b));
    };
    $('rpg-go').onclick = () => {
      const av = introAv ?? d.av;
      let x = null;
      tx(s => {
        if (s.intro) return;   // 別のタブで先に旅に出ていたら、お祝いは二重に出さない
        s.intro = true; s.av = av;
        s.coins = Math.min(K.BIG, s.coins + T.start);
        s.earned = Math.min(K.BIG, s.earned + T.start);
        x = s;
      });
      if (x && wrote) emitCoins(x, T.start, 'start');
      renderHome();
    };
  };

  // ---- 冒険ホーム ----
  // つぎにやること（上から最初に当てはまるもの）
  const nextAction = (d, nf) => {
    const gacha = hasCards();   // ガチャの画面が無ければ（rpg-cards.js が読み込めなかった）ガチャはすすめない
    if (gacha && d.pulls === 0 && d.coins >= T.gacha.ten)
      return { text: 'まずは国旗ガチャ10連で仲間をさがそう（南アメリカがおすすめ）', go: () => open('gacha', { region: DG[0].r }) };
    if (gacha && d.day.first && !d.day.free) return { text: '今日の無料ガチャが引けるよ', go: () => open('gacha') };
    const en = nf && K.enemy(nf.id, nf.floor);
    if (en && d.coins >= K.levelCost(d.lv) && d.lv < en.recLv) return { text: 'レベルアップできるよ', go: () => $('rpg-lvup')?.focus() };
    if (en) {
      const g = K.dungeonOf(nf.id), where = en.boss ? `${g.name} ボス（${K.MONSTERS[nf.id][BOSS - 1].n}）` : `${g.name} F${nf.floor} `;
      return {
        text: `${where}に挑戦！（推奨Lv${en.recLv}）`,
        warn: judgeOf(d, nf.id, nf.floor) === 'hard' ? 'ちょっときびしいかも。クイズでコインを稼ごう' : '',
        go: () => open('battle', { id: nf.id, floor: nf.floor }),
      };
    }
    return { text: `全クリア！ ${TOTAL}か国を仲間にしよう（${owned(d)}/${TOTAL}）`, go: () => open('cards') };
  };
  // ダンジョンの図版。開いていないものは 🔒 と押せないフロアだけ（ボスは見せない）
  const plateHTML = (d, g) => {
    const n = cleared(d, g.id), on = unlocked(d, g.id), boss = K.MONSTERS[g.id][BOSS - 1];
    const fls = FLOOR_MARK.map((mark, i) => {
      const f = i + 1, cls = !on ? '' : f <= n ? ' is-done' : f === n + 1 ? ' is-next' : '';
      return `<button type="button" class="rpg-fl${cls}" data-d="${g.id}" data-f="${f}" aria-label="${f === BOSS ? 'ボス' : `F${f}`}${on && f <= n ? '（クリア済み）' : ''}"`
        + `${on && f <= n + 1 ? '' : ' disabled'}>${mark}</button>`;
    }).join('');
    const head = `<div class="rpg-plate${on ? '' : ' rpg-locked'}" data-d="${g.id}" style="--rpg-c: var(--rpg-r-${g.id}, ${g.color})"><p class="rpg-plate-no">${g.plate}</p>`;
    if (!on) return `${head}<p class="rpg-plate-name"><span class="rpg-plate-e" role="img" aria-label="まだ開いていない">🔒</span><b>${g.name}</b></p><div class="rpg-fls">${fls}</div></div>`;
    const rec = f => K.recLv(K.stageOf(g.id, f)), [jt, jc] = JUDGE[judgeOf(d, g.id, Math.min(n + 1, BOSS))];
    return `${head}<p class="rpg-plate-name"><span class="rpg-plate-e" aria-hidden="true">${boss.e}</span><b>${g.name}</b><small>ボス ${boss.n}</small></p>`
      + `<p class="rpg-plate-meta"><span>推奨Lv${rec(1)}〜${rec(BOSS)}</span><span class="rpg-judge ${jc}">${jt}</span>${n >= BOSS ? '<span>ぜんぶクリア</span>' : ''}</p>`
      + `<div class="rpg-fls">${fls}</div></div>`;
  };
  const bountyHTML = d => {
    const b = d.bounty, n = b.a.filter(a => b.done.includes(a)).length;
    const li = a => {
      const nm = esc(byA.get(a)?.n ?? a), done = b.done.includes(a);
      return `<li class="rpg-wf${done ? ' is-done' : ''}"><img src="${flag(a)}" alt="${nm}" title="${nm}">${done ? '<span class="rpg-check" role="img" aria-label="達成">✓</span>' : ''}</li>`;
    };
    return `<div class="rpg-bounty" id="rpg-bounty"${b.a.length ? '' : ' hidden'}><p class="rpg-bounty-h">今日の手配書 <b>${n}/${b.a.length}</b></p>`
      + `<ul class="rpg-wanted">${b.a.map(li).join('')}</ul><p class="hint">ゲームでヒントなしの一発正解！</p></div>`;
  };
  const earnHTML = () => '<details class="rpg-earn" id="rpg-earn"><summary>コインのかせぎ方</summary>'
    + `<table class="rpg-earn-t"><caption>クイズ1回の例（はじめて正解した国は、さらに +${T.quiz.firstEver}）</caption>`
    + '<thead><tr><th scope="col">ゲーム</th><th scope="col">コイン</th></tr></thead>'
    + `<tbody>${EARN.map(([g, c]) => `<tr><td>${g}</td><td>${c}</td></tr>`).join('')}</tbody></table>`
    + '<button class="btn ghost" id="rpg-earn-go">クイズで稼ぐ</button></details>';
  // スマホは上から 旅人・レベルアップ・つぎにやること・手配書・ガチャと仲間・図版・かせぎ方（rpg.css の order）。
  // PC は .rpg-side（左）・.rpg-main（図版）・.rpg-aside（手配書。1400px 以上は右の列）
  const homeHTML = (d, nf, nx) => {
    const st = nf ? K.battleStats(d, nf.id, nf.floor) : K.battleStats(d, DG[DG.length - 1].id, BOSS);   // 全部クリアなら地図喰い
    const nick = store.get('nickname', ''), name = typeof nick === 'string' && nick.trim() ? esc(nick) : '旅人', title = titleOf();
    const max = d.lv >= T.hero.maxLv, cost = K.levelCost(d.lv), can = d.coins >= cost, upTo = K.maxLevelUp(d.lv, d.coins).to;
    const lvup = max ? 'MAX' : `レベルアップ ${COIN}${fmt(cost)}${can ? '' : ` <small class="rpg-short">あと${COIN}${fmt(cost - d.coins)}</small>`}`;
    return `<div class="rpg-side">${warnHTML()}`
      + '<div class="rpg-hero" id="rpg-hero">'
      + `<button type="button" class="rpg-av" id="rpg-av" aria-label="旅人のすがたを変える">${AV[d.av] ?? AV[0]}</button>`
      + `<p class="rpg-who"><b id="rpg-name">${name}</b><span class="rpg-ttl" id="rpg-title">${title ? `〈${esc(title)}〉` : ''}</span></p>`
      + `<p class="rpg-stats" id="rpg-stats"><span class="rpg-lvnum">Lv ${d.lv}</span><span>❤️ ${fmt(st.hp)}</span><span>⚔️ ${fmt(st.atk)}</span><span>仲間 ${owned(d)}/${TOTAL}</span></p></div>`
      + `<div class="rpg-lv"><button class="btn" id="rpg-lvup"${max || !can ? ' disabled' : ''}>${lvup}</button>`
      + `<button class="linkbtn" id="rpg-lvmax"${upTo > d.lv ? '' : ' disabled'}>上げられるだけ上げる</button></div>`
      + `<button type="button" class="rpg-next" id="rpg-next"><span class="rpg-next-k" aria-hidden="true">▸</span>`
      + `<span>${nx.text}${nx.warn ? `<small class="rpg-next-w">${nx.warn}</small>` : ''}</span></button>`
      + (hasCards() ? `<div class="rpg-go"><button class="btn ghost" id="rpg-to-gacha">🎴 国旗ガチャ${d.day.first && !d.day.free ? ' <small class="rpg-free">無料1回！</small>' : ''}</button>`
        + '<button class="btn ghost" id="rpg-to-cards">🗂 仲間</button></div>' : '') + '</div>'
      + `<div class="rpg-main"><div class="rpg-shares rpg-home-share" id="rpg-home-share" hidden></div><div class="rpg-dgs" id="rpg-dgs">${DG.map(g => plateHTML(d, g)).join('')}</div>${earnHTML()}${dataHTML(true)}${debugHTML(d)}</div>`
      + `<div class="rpg-aside">${bountyHTML(d)}<div id="rpg-map"></div></div>`;
  };
  // 失格／にげたときの節目の［シェア］。押した行は消える（冒険ホームを離れたら全部消える: drill:screen）
  const drawHomeShares = () => {
    const box = $('rpg-home-share');
    RPG.drawShares(box, homeShares);
    homeSharesShown = homeShares.length > 0;
    box.querySelectorAll('.rpg-share').forEach((b, i) => {
      const { kind } = homeShares[i];
      b.addEventListener('click', () => { homeShares = homeShares.filter(s => s.kind !== kind); drawHomeShares(); });
    });
  };
  const bindHome = nx => {
    $('rpg-av').onclick = () => tx(x => { x.av = (x.av + 1) % AV.length; });
    $('rpg-lvup').onclick = levelUp;
    $('rpg-lvmax').onclick = levelMax;
    $('rpg-next').onclick = nx.go;
    if ($('rpg-to-gacha')) $('rpg-to-gacha').onclick = () => open('gacha');
    if ($('rpg-to-cards')) $('rpg-to-cards').onclick = () => open('cards');
    $('rpg-dgs').onclick = e => {
      const b = e.target.closest('button.rpg-fl');
      if (b && !b.disabled) open('battle', { id: b.dataset.d, floor: +b.dataset.f });
    };
    $('rpg-earn-go').onclick = () => show('setup');
  };
  // 冒険ホームの小さい世界地図（1400px 以上の右の列。rpg.css と同じ幅）。冒険ホームを描き直しても同じ入れ物を使い回す。せまいあいだは描かない
  const WIDE = matchMedia('(min-width: 1400px)');
  let homeMap = null;
  const drawHomeMap = d => {
    const slot = $('rpg-map');
    if (!slot) return;
    if (homeMap && slot !== homeMap) slot.replaceWith(homeMap); else homeMap = slot;
    if (WIDE.matches) RPG.worldMap(homeMap, d);
  };
  WIDE.addEventListener?.('change', () => {
    try { if (WIDE.matches && homeMap?.isConnected) RPG.worldMap(homeMap, get()); } catch (e) { console.error('[rpg]', e); }
  });
  // #scr-rpg を描く（screenRender.rpg と RPG.refresh）。日付が変わっていれば手配書を引き直す（変わらなければ tx は書かない）
  const renderHome = () => {
    const sec = $('scr-rpg');
    if (!sec) return;
    const m = missesNow(), t = todayStr();
    let d = null;
    tx(x => { K.ensureDay(x, m, t, Math.random); d = x; });
    d = d || get();   // 新しい版のデータのときは読むだけ
    // 同じ画面（はじめての画面／ホーム）のまま描き直すときは、フォーカス・開いた <details>・入れかけの引き継ぎコードとメッセージはそのまま
    const view = d.intro ? 'home' : 'intro', same = sec.dataset.view === view;
    const focus = same && sec.contains(document.activeElement) ? document.activeElement.id : '';
    const opened = same ? [...sec.querySelectorAll('details[open]')].map(x => x.id) : [];
    const codeIn = same ? $('rpg-code-in')?.value ?? '' : '', msg = same ? $('rpg-code-msg')?.textContent ?? '' : '';
    sec.dataset.view = view;
    if (d.intro) {
      const nf = nextFloor(d), nx = nextAction(d, nf);
      sec.innerHTML = homeHTML(d, nf, nx);
      bindHome(nx);
      drawHomeShares();
      drawHomeMap(d);
    } else {
      sec.innerHTML = introHTML(d);
      bindIntro(d);
    }
    bindData();
    bindDebug();
    for (const id of opened) if ($(id)) $(id).open = true;
    if ($('rpg-code-in')) $('rpg-code-in').value = codeIn;
    sayData(msg);
    if ($('rpg-data')?.open) fillCode();
    if (focus) $(focus)?.focus({ preventScroll: true });
  };

  // チップ・ホームのボタン・設定のスイッチ・冒険の表示の ON/OFF・いまの冒険の画面を描き直す（ガチャの結果は消さない）
  const refresh = () => {
    const d = get(), screen = document.body.dataset.screen;
    document.body.classList.toggle('rpg-off', d.show === false);
    drawEntrances(d);
    if ($('set-rpg')) $('set-rpg').checked = d.show !== false;
    if (screen === 'rpg') renderHome();
    RPG.redraw(screen, d);   // ガチャ・仲間の画面（rpg-cards.js）
  };
  // 別のタブがセーブを書いたら（storage イベント。localStorage.clear() のときは key が null）再読み込みなしで描き直す。
  // 描き直しの tx は変わらなければ書かないので、タブどうしで書き合いにならない
  window.addEventListener('storage', e => {
    if (e.key !== KEY && e.key !== null) return;
    try { refresh(); } catch (err) { console.error('[rpg]', err); }
  });
  // バッジのさかのぼり（badges.js の起動時）が同期で読む写し（docs/events.md 7章）。ボスを倒したダンジョンは cleared（floors[id] >= 5）
  const snapshot = () => {
    const d = get(), as = Object.keys(d.cards);
    const ownedByStar = { 1: 0, 2: 0, 3: 0 }, ownedByRegion = Object.fromEntries(REGION_DG.map(g => [g.id, 0]));
    for (const a of as) {
      const star = d.cards[a][0], g = REGION_DG.find(g => g.r === byA.get(a)?.r);
      if (star in ownedByStar) ownedByStar[star]++;
      if (g) ownedByRegion[g.id]++;
    }
    return {
      intro: d.intro, lv: d.lv, coins: d.coins, owned: as.length, ownedByStar, ownedByRegion,
      floors: { ...d.floors }, cleared: DG.filter(g => cleared(d, g.id) >= BOSS).map(g => g.id),
      earned: d.earned, st: { ...d.st }, overcome: d.st.overcome, bountyDays: d.st.bountyDays,
    };
  };
  // 起動時に1回: 冒険ホームの画面（<section> を作ってから登録）、ホームのボタン、トップバーのチップ、設定のスイッチ
  const setupEntrances = () => {
    document.body.classList.toggle('rpg-off', get().show === false);   // ボタンとチップを作る前に（OFF の人に一瞬でも見せない）
    // 画面: footer の直前に <section> を作ってから登録する（ガチャ・仲間は rpg-cards.js、バトルは rpg-battle.js がこの後ろに足す）
    const wrap = document.querySelector('body > .wrap'), foot = wrap.querySelector(':scope > footer');
    const sec = document.createElement('section');
    sec.id = 'scr-rpg'; sec.className = 'wrap'; sec.hidden = true;
    if (foot) foot.before(sec); else wrap.append(sec);
    registerScreen('rpg', renderHome);

    const hb = document.createElement('button');
    hb.className = 'btn ghost'; hb.id = 'home-rpg';
    hb.onclick = () => show('rpg');
    $('home-play')?.after(hb);
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'rpg-chip'; chip.id = 'rpg-chip'; chip.title = 'コイン（冒険へ）';
    chip.onclick = () => show('rpg');
    ($('topbar-extra') || $('to-book')?.parentElement)?.prepend(chip);
    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = '<span class="lbl">冒険</span><label class="switch"><input type="checkbox" id="set-rpg"> 冒険（コイン・RPG）を表示する</label>';
    $('set-dopa')?.closest('.field')?.after(field);
    const sw = $('set-rpg');
    if (sw) sw.checked = get().show !== false;   // #settings の直リンクは rpg.js より前に設定を開く（その drill:screen は聞きのがす）
    if (sw) sw.onchange = () => {
      const v = sw.checked;
      tx(d => { d.show = v; });
      if (wrote) document.body.classList.toggle('rpg-off', !v);   // 書けたときだけ（新しい版のデータ・保存の失敗ではスイッチを戻す）
      else sw.checked = get().show !== false;
    };
    drawEntrances();
  };
  on('drill:screen', ({ name }) => {
    if (name !== 'rpg' && homeSharesShown) { homeShares = []; homeSharesShown = false; }   // 冒険ホームを離れたら、出していたシェアは消す
    if (name === 'home') drawEntrances();
    if (name === 'settings' && $('set-rpg')) $('set-rpg').checked = get().show !== false;
  });

  /* ---------- window.RPG ---------- */
  const RPG = window.RPG = {
    tx, get, emitCoins, announce, coinHTML,
    get status() { return status; },
    get wrote() { return wrote; },             // 最後の tx の書きこみが届いたか
    get warn() { return WARN[status] || ''; },   // 保存の注意（新しい版のデータ・この端末では保存できない）。無ければ ''
    refresh, open, nextFloor, unlocked, snapshot,
    opts: {},   // RPG.open で渡したもの（開いた画面が読む）
    // ここから下の6つは rpg-cards.js（仲間の世界地図・シェア・演出、ガチャと仲間の画面）が本物に入れかえる（cardHTML・openCard も足す）。
    // rpg-cards.js が読み込めなかったときは、地図・シェア・演出なしで冒険ホーム・クイズのコイン・バトル（の保存）が動く
    worldMap() {},
    milestones: () => [],
    drawShares() {},
    shareButton: () => document.createElement('span'),   // バトルがボスの行の後ろに入れる。空なので見えない
    fx() {},
    redraw() {},   // refresh が呼ぶ（いまの画面がガチャ・仲間なら描き直す）
    // 開発用（e2e と ?rpgdebug=1 のパネルが使う）。コインを変えたら rpg:coins の reason は 'debug'
    debug: {
      cur: () => window.RPG_BATTLE?.cur?.() ?? null,
      give(n) {
        let d = null;
        const delta = tx(x => {
          const before = x.coins;
          x.coins = Math.max(0, Math.min(K.BIG, x.coins + Math.round(+n || 0)));
          d = x;
          return x.coins - before;
        });
        if (delta) emitCoins(d, delta, 'debug');
        return delta;
      },
      // Lv を n にする（1..50 におさめる。コインは変わらない）。書いた Lv を返す
      setLv: n => tx(x => { x.lv = Math.max(1, Math.min(T.hero.maxLv, Math.round(+n) || 1)); return x.lv; }),
      // ダンジョン id のクリアした最高フロアを floor にする（0..5。4 でボスまで全部のフロアに行ける、5 でボスを倒したことになる）。
      // 書いた値を返す。知らない id は何もせず null
      unlock: (id, floor) => DG.some(g => g.id === id)
        ? tx(x => { x.floors[id] = Math.max(0, Math.min(BOSS, Math.round(+floor) || 0)); return x.floors[id]; })
        : null,
      wipe: wipeSave,
      save: () => get(),
    },
  };

  /* ---------- 起動 ---------- */
  // 壊れた・v の無い・古いセーブの写しとトースト、掃除したセーブへの書き直しはここで1回だけ（以後の get と tx は書き直したものを読む）
  tx(() => {});
  if (status === 'readOnly') toast(MSG.readOnly);
  base = get();
  showCache = base.show;
  setupEntrances();
  emit('rpg:ready', { intro: base.intro, lv: base.lv, coins: base.coins, owned: Object.keys(base.cards).length });
  // 直リンク（index.html の起動処理は #rpg を知らないので、画面を登録したあとでここから開く）
  if (location.hash === '#rpg') show('rpg');
  // そのときはまだ後ろのスクリプト（rpg-cards.js のガチャ・仲間の入口と世界地図、badges.js の称号など）が無いので、読み込みが終わったらもう1回描く
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { if (document.body.dataset.screen === 'rpg') renderHome(); }, { once: true });
})();
