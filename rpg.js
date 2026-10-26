(() => {
  'use strict';
  // 国旗クエスト（RPG）の本体: セーブ（RPG.tx）、クイズのコインの受け取り（#pcoin・結果のパネル・トースト）、バッジのコインの支払い、
  // 冒険ホーム（入口・はじめての画面・引き継ぎコード・開発用パネル）、国旗ガチャと仲間の一覧、仲間の世界地図・シェア・演出（RPG.fx）、
  // タブ間の同期、RPG.snapshot()
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
  const CAP = 1e9;            // コインの上限（rpg-core.js の sanitize と同じ）
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
      if (r.readOnly) return null;
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
      if (rc.joined.length) toast(`🤝 ${names(rc.joined)}が仲間になった！`);
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
    const joined = rc.joined.slice(0, 5), more = rc.joined.length - joined.length;
    const lines = [
      rc.daily > 0 && `🎁 今日はじめてのクリア +${fmt(rc.daily)} ／ 無料ガチャ1回ゲット`,
      joined.length && `🤝 ${names(joined)}${more ? `ほか${more}か国` : ''}が仲間になった！（${T.card.frJoin}回正解した国は仲間になるよ）`,
      rc.promoted.length && `🏅 ${names(rc.promoted)}がシルバーに！`,
      rc.overcome.length && `✨ 克服！ ${names(rc.overcome)}はもう苦手じゃない +${fmt(T.overcome * rc.overcome.length)}`,
      rc.bounty.length && `📜 手配書 ${names(rc.bounty)} +${fmt(T.bounty * rc.bounty.length)}${rc.bountyAll ? `（3件ぜんぶ +${fmt(T.bountyAll)}）` : ''}`,
      rc.zeroed && 'タイムが速すぎたので、この回のコインはなし',
    ].filter(Boolean);
    // 仲間の数・地域の国を全部、に届いたらシェア（この回で仲間になった国をのぞいたのが、始める前の仲間）
    const after = Object.keys(d.cards), shares = milestones(after.filter(a => !rc.joined.includes(a)), after);
    ext.innerHTML = `<div class="rpg-res" id="rpg-res">`
      + `<p class="rpg-res-head">${COIN} +<span class="rpg-res-n">${fmt(rc.sum)}</span> コイン <span class="rpg-now">いま ${fmt(get().coins)}</span></p>`
      + (rows ? `<ul class="rpg-res-rows">${rows}</ul>` : '')
      + lines.map(l => `<p class="rpg-res-x">${l}</p>`).join('')
      + (shares.length ? '<div class="rpg-shares" id="rpg-res-share"></div>' : '')
      + `<button class="btn ghost" id="rpg-res-go">冒険へ →${d.intro ? '' : `（はじめてなら <span class="rpg-nowrap">${COIN}${fmt(T.start)}</span> のお祝いつき）`}</button></div>`;
    drawShares($('rpg-res-share'), shares);
    $('rpg-res-go').onclick = () => { if (SCREENS.includes('rpg')) show('rpg'); };   // 冒険の画面ができるまでは何もしない
    fx('count', ext.querySelector('.rpg-res-n'), rc.sum);
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
        x.coins = Math.min(CAP, x.coins + T.badge);
        x.earned = Math.min(CAP, x.earned + T.badge);
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
        s.coins = Math.min(CAP, s.coins + T.start);
        s.earned = Math.min(CAP, s.earned + T.start);
        x = s;
      });
      if (x && wrote) emitCoins(x, T.start, 'start');
      renderHome();
    };
  };

  // ---- 冒険ホーム ----
  // つぎにやること（上から最初に当てはまるもの）
  const nextAction = (d, nf) => {
    if (d.pulls === 0 && d.coins >= T.gacha.ten)
      return { text: 'まずは国旗ガチャ10連で仲間をさがそう（南アメリカがおすすめ）', go: () => open('gacha', { region: DG[0].r }) };
    if (d.day.first && !d.day.free) return { text: '今日の無料ガチャが引けるよ', go: () => open('gacha') };
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
      + `<div class="rpg-go"><button class="btn ghost" id="rpg-to-gacha">🎴 国旗ガチャ${d.day.first && !d.day.free ? ' <small class="rpg-free">無料1回！</small>' : ''}</button>`
      + '<button class="btn ghost" id="rpg-to-cards">🗂 仲間</button></div></div>'
      + `<div class="rpg-main"><div class="rpg-dgs" id="rpg-dgs">${DG.map(g => plateHTML(d, g)).join('')}</div>${earnHTML()}${dataHTML(true)}${debugHTML(d)}</div>`
      + `<div class="rpg-aside">${bountyHTML(d)}<div class="rpg-wmapbox" id="rpg-map"></div></div>`;
  };
  const bindHome = nx => {
    $('rpg-av').onclick = () => tx(x => { x.av = (x.av + 1) % AV.length; });
    $('rpg-lvup').onclick = levelUp;
    $('rpg-lvmax').onclick = levelMax;
    $('rpg-next').onclick = nx.go;
    $('rpg-to-gacha').onclick = () => open('gacha');
    $('rpg-to-cards').onclick = () => open('cards');
    $('rpg-dgs').onclick = e => {
      const b = e.target.closest('button.rpg-fl');
      if (b && !b.disabled) open('battle', { id: b.dataset.d, floor: +b.dataset.f });
    };
    $('rpg-earn-go').onclick = () => show('setup');
  };
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
  const cardHTML = (a, d, { face = 'up', label = '' } = {}) => {
    const c = byA.get(a);
    if (!c) return '';
    const card = d.cards?.[a], fr = d.fr?.[a] || 0, star = card ? card[0] : 0, rest = T.card.frJoin - fr, back = face === 'back';
    const mid = card
      ? `<span class="rpg-card-star">${'★'.repeat(star)}</span><span class="rpg-card-stack" title="かさね ${card[1]}/${T.card.stackMax}">${dots(card[1])}</span>`
      : rest > 0 ? `<span class="rpg-card-hint">あと${rest}回正解で仲間に（1回のゲームで1回ぶん）</span>` : '';
    return `<button type="button" class="rpg-card rpg-s${star}${card ? '' : ' is-none'}${back ? ' is-back' : ''}" data-a="${a}" data-star="${star}"${back ? ' aria-label="裏向きのカード"' : ''}>`
      + `<span class="rpg-card-face">${label ? `<span class="rpg-lab">${label}</span>` : ''}<img class="rpg-card-flag" src="${flag(a)}" alt="">`
      + `<b class="rpg-card-name">${esc(c.n)}</b>${mid}<span class="rpg-card-fr" title="なかよし度">♥${fr}/${T.card.frMax}</span></span>`
      + '<span class="rpg-card-back" aria-hidden="true"><span>🧭</span></span></button>';
  };
  // #detail に国の情報とカードの強さ。id があればそのダンジョンでの値（地域ボーナス ×1.5 が付くか）
  const openCard = (a, id) => {
    const c = byA.get(a), dlg = $('detail'), inner = $('detail-inner');
    if (!c || !dlg || !inner) return;
    const d = get(), card = d.cards[a], fr = d.fr[a] || 0, g = id ? K.dungeonOf(id) : null;
    let info;
    if (card) {
      const bonus = !!g && (g.r === 'all' || g.r === c.r), atk = K.cardAtk(card, fr, bonus);
      const nw = s => `<span class="rpg-nowrap">${s}</span>`;
      info = `<p>${nw(`★${card[0]} ${STAR_NAME[card[0]]}`)}・${nw(`かさね ${dots(card[1])}`)}・${nw(`なかよし度 ♥${fr}/${T.card.frMax}`)}</p>`
        + `<p class="rpg-cd-pow">${nw(`こうげき ${atk.toFixed(1)}`)}${nw(`（地域ボーナス ${bonus ? 'あり' : 'なし'}）`)}・${nw(`HP ${(atk * T.card.hpMul).toFixed(1)}`)}</p>`
        + (g ? '' : `<p class="hint">${esc(c.r)}のダンジョンと地図喰いの巣では、地域ボーナスで ×${T.card.regionMul}</p>`);
    } else {
      info = `<p class="rpg-cd-pow">まだ仲間じゃない（なかよし度 ♥${fr}/${T.card.frMax}）</p>`
        + (fr < T.card.frJoin ? `<p class="hint">あと${T.card.frJoin - fr}回正解で仲間に（1回のゲームで1回ぶん）</p>` : '');
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
    + '<p class="rpg-ga-need" id="ga-need" hidden></p><p class="rpg-ga-pity" id="ga-pity"></p>'
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
    const want = RPG.opts?.region, nf = nextFloor(d);
    if (AREAS.includes(want)) return want;
    return nf ? K.dungeonOf(nf.id).r : AREAS.includes(d.gr) ? d.gr : 'all';
  };
  // ボタン・チップ・天井・提供割合・コイン（結果はそのまま）。新しい版のデータのあいだは引けない（書けないので）
  const drawGacha = (d = get()) => {
    if (!$('ga-regions')) return;
    const { one, ten, pity } = T.gacha, free = $('ga-free'), need = $('ga-need'), warn = $('ga-warn'), stop = gaBusy || status === 'readOnly';
    warn.textContent = WARN[status] || '';
    warn.hidden = !WARN[status];
    $('ga-coins').innerHTML = coinHTML(d.coins);
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
  // 残りを全部表にして、ボタンを戻し、シェアを出す（［ぜんぶめくる］もここ）
  const endFlip = () => {
    clearInterval(gaTimer);
    gaTimer = null;
    $('ga-res').querySelectorAll('.rpg-card.is-back').forEach(flipCard);
    gaBusy = false;
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
    $('ga-flipall').hidden = false;
    $('ga-empty').hidden = true;
    if (back) {
      if (['ga-free', 'ga-1', 'ga-10'].includes(document.activeElement?.id)) $('ga-flipall').focus({ preventScroll: true });
      startFlip();
    } else endFlip();
    // スマホは結果がボタンと確率の下なので、結果まで送る
    if (innerWidth < 900) $('ga-main').scrollIntoView({ block: 'nearest', behavior: back ? 'smooth' : 'auto' });
  };
  // 1回の tx で コインを引く（無料なら day.free）→ 抽選 → gr。書けてから結果を描き、イベントは tx が返ってから
  const pullGacha = (count, free) => {
    if (gaBusy) return;
    gaBusy = true;
    for (const id of ['ga-free', 'ga-1', 'ga-10']) $(id).disabled = true;   // 連打で二重に引かない
    const region = gaRegion, cost = free ? 0 : count === 10 ? T.gacha.ten : T.gacha.one;
    let d = null, res = null, before = null;
    tx(x => {
      if (free ? !x.day.first || x.day.free : x.coins < cost) return;
      before = { ...x.cards };
      if (free) x.day.free = true;
      else x.coins -= cost;
      res = K.pull(x, region, count, Math.random, C);
      x.gr = region;
      d = x;
    });
    if (!d || !wrote) { gaBusy = false; drawGacha(); return; }   // 足りなかった（別のタブで使った）・保存できなかった
    gaShares = milestones(Object.keys(before), Object.keys(d.cards));
    let owned0 = Object.keys(d.cards).length - res.filter(r => r.out === 'new').length;
    emit('rpg:pull', { region, count, free, results: res.map(r => ({ ...r })), pity: d.pity, pulls: d.pulls });
    for (const r of res) {
      if (r.out === 'new') emit('rpg:join', { a: r.a, via: 'gacha', owned: ++owned0 });
      if (r.out === 'up') emit('rpg:promote', { a: r.a, star: r.star, via: 'gacha' });
    }
    emitCoins(d, -cost, 'gacha');
    emitCoins(d, res.reduce((s, r) => s + (r.out === 'refund' ? T.gacha.refund[r.star] : 0), 0), 'refund');
    drawResults(res, before, d);
    drawGacha();
  };
  // screenRender.gacha: 開くたびに地域を選び直し、前の結果を消す
  const renderGacha = () => {
    const d = get();
    gaRegion = firstRegion(d);
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
    $('ga-res').onclick = e => { const b = e.target.closest('.rpg-card'); if (b) openCard(b.dataset.a); };
  };

  // ---- 仲間の一覧（★の多い順 → 国名の順で固定。地図 #cd-map の中身は Task 12） ----
  const CARDS_HTML = `<div class="rpg-head">${backBtn}<h2 class="rpg-h2" id="cd-count"></h2></div>`
    + `<div class="chips" id="cd-regions" role="group" aria-label="地域でしぼりこむ">${chipsHTML('すべて')}</div>`
    + '<div class="rpg-cd-map" id="cd-map"></div><div class="rpg-cd-grid" id="cd-grid"></div>';
  let cdRegion = 'all', byName = null;
  const drawCards = (d = get()) => {
    if (!$('cd-grid')) return;
    byName ||= C.map(c => c.a).sort((x, y) => byA.get(x).n.localeCompare(byA.get(y).n, 'ja'));
    const star = a => d.cards[a]?.[0] || 0;
    $('cd-count').textContent = `仲間 ${owned(d)} / ${TOTAL}`;
    drawChips($('cd-regions'), d, cdRegion);
    // sort は安定なので、同じ★の中は国名の順のまま
    $('cd-grid').innerHTML = byName.filter(a => inArea(a, cdRegion)).sort((x, y) => star(y) - star(x)).map(a => cardHTML(a, d)).join('');
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
  const SMALL_AR = 25000;   // これより小さい国と、地図に形の無い国は丸印（図鑑の地図と同じ）
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
      if (c.ar >= SMALL_AR && featOf(c)) continue;
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
  // 冒険ホームの小さい世界地図（1400px 以上の右の列。rpg.css と同じ幅）。冒険ホームを描き直しても同じ入れ物を使い回す。せまいあいだは描かない
  const WIDE = matchMedia('(min-width: 1400px)');
  let homeMap = null;
  const drawHomeMap = d => {
    const slot = $('rpg-map');
    if (!slot) return;
    if (homeMap && slot !== homeMap) slot.replaceWith(homeMap); else homeMap = slot;
    if (WIDE.matches) worldMap(homeMap, d);
  };
  WIDE.addEventListener?.('change', () => {
    try { if (WIDE.matches && homeMap?.isConnected) worldMap(homeMap, get()); } catch (e) { console.error('[rpg]', e); }
  });

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

  // チップ・ホームのボタン・設定のスイッチ・冒険の表示の ON/OFF・いまの冒険の画面を描き直す（ガチャの結果は消さない）
  const refresh = () => {
    const d = get(), screen = document.body.dataset.screen;
    document.body.classList.toggle('rpg-off', d.show === false);
    drawEntrances(d);
    if ($('set-rpg')) $('set-rpg').checked = d.show !== false;
    if (screen === 'rpg') renderHome();
    if (screen === 'gacha') drawGacha(d);
    if (screen === 'cards') drawCards(d);
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
  // 起動時に1回: 画面（<section> を作ってから登録）、ホームのボタン、トップバーのチップ、設定のスイッチ
  const setupEntrances = () => {
    document.body.classList.toggle('rpg-off', get().show === false);   // ボタンとチップを作る前に（OFF の人に一瞬でも見せない）
    // 画面: footer の直前に <section> を作ってから登録する
    const wrap = document.querySelector('body > .wrap'), foot = wrap.querySelector(':scope > footer');
    const addScreen = (name, render, html = '') => {
      const sec = document.createElement('section');
      sec.id = `scr-${name}`; sec.className = 'wrap'; sec.hidden = true; sec.innerHTML = html;
      if (foot) foot.before(sec); else wrap.append(sec);
      registerScreen(name, render);
      return sec;
    };
    addScreen('rpg', renderHome);
    bindGacha(addScreen('gacha', renderGacha, GACHA_HTML));
    bindCards(addScreen('cards', drawCards, CARDS_HTML));

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
      document.body.classList.toggle('rpg-off', !v);
    };
    drawEntrances();
  };
  on('drill:screen', ({ name }) => {
    if (name === 'home') drawEntrances();
    if (name === 'settings' && $('set-rpg')) $('set-rpg').checked = get().show !== false;
  });

  /* ---------- window.RPG ---------- */
  const RPG = window.RPG = {
    tx, get, emitCoins, announce, coinHTML, cardHTML, openCard, worldMap, shareButton, fx,
    get status() { return status; },
    refresh, open, nextFloor, unlocked, snapshot,
    opts: {},   // RPG.open で渡したもの（開いた画面が読む）
    // 開発用（e2e と ?rpgdebug=1 のパネルが使う）。コインを変えたら rpg:coins の reason は 'debug'
    debug: {
      cur: () => window.RPG_BATTLE?.cur?.() ?? null,
      give(n) {
        let d = null;
        const delta = tx(x => {
          const before = x.coins;
          x.coins = Math.max(0, Math.min(CAP, x.coins + Math.round(+n || 0)));
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
  // そのときはまだ後ろのスクリプト（badges.js の称号など）が無いので、読み込みが終わったらもう1回描く
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { if (document.body.dataset.screen === 'rpg') renderHome(); }, { once: true });
})();
