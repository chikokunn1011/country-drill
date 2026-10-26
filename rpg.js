(() => {
  'use strict';
  // 国旗クエスト（RPG）の本体: セーブ（RPG.tx）、クイズのコインの受け取り（#pcoin・結果のパネル・トースト）、バッジのコインの支払い
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
    if (!persisted) { persisted = true; try { navigator.storage?.persist?.()?.catch?.(() => {}); } catch {} }
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
      const out = fn(r.d), str = JSON.stringify(r.d);
      wrote = true;
      // 変わらなければ書かない（描き直しから tx を呼んでも、書く → 描き直す の輪にならない）
      if (str !== raw) { wrote = writeRaw(str); if (wrote) queueRefresh(); }
      return out;
    } catch (e) { console.error('[rpg]', e); wrote = false; return null; }
  };
  // 読むだけ（書かない・写さない・トーストを出さない）
  const get = () => {
    try { return load(readRaw()).d; } catch (e) { console.error('[rpg]', e); return K.fresh(todayStr()); }
  };

  /* ---------- コインのイベントと表示の部品 ---------- */
  const coinHTML = n => COIN + K.shortCoins(n);
  const emitCoins = (d, delta, reason) => { if (delta) emit('rpg:coins', { delta, reason, coins: d.coins, earned: d.earned }); };
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
    ext.innerHTML = `<div class="rpg-res" id="rpg-res">`
      + `<p class="rpg-res-head">${COIN} +${fmt(rc.sum)} コイン <span class="rpg-now">いま ${fmt(d.coins)}</span></p>`
      + (rows ? `<ul class="rpg-res-rows">${rows}</ul>` : '')
      + lines.map(l => `<p class="rpg-res-x">${l}</p>`).join('')
      + `<button class="btn ghost" id="rpg-res-go">冒険へ →${d.intro ? '' : `（はじめてなら <span class="rpg-nowrap">${COIN}${fmt(T.start)}</span> のお祝いつき）`}</button></div>`;
    $('rpg-res-go').onclick = () => { if (SCREENS.includes('rpg')) show('rpg'); };   // 冒険の画面ができるまでは何もしない
  };

  /* ---------- バッジのコイン（badges.js が同期で e.detail.paid を読む: 50 払った／0 もう払ってある／false 払えなかった） ---------- */
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
      if (det.paid > 0) emitCoins(d, det.paid, 'badge');
    } catch (err) { console.error('[rpg]', err); }
  });

  /* ---------- window.RPG ---------- */
  const RPG = window.RPG = {
    tx, get, emitCoins, announce, coinHTML,
    get status() { return status; },
    // チップ・ホームのボタン・いまの RPG の画面を描き直す（冒険ホームなどを作るときに中身を足す）
    refresh() {},
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
      wipe: () => tx(d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, K.fresh(todayStr())); }),
      save: () => get(),
    },
  };

  /* ---------- 起動 ---------- */
  // 壊れた・v の無い・古いセーブの写しとトースト、掃除したセーブへの書き直しはここで1回だけ（以後の get と tx は書き直したものを読む）
  tx(() => {});
  if (status === 'readOnly') toast(MSG.readOnly);
  base = get();
  showCache = base.show;
  emit('rpg:ready', { intro: base.intro, lv: base.lv, coins: base.coins, owned: Object.keys(base.cards).length });
})();
