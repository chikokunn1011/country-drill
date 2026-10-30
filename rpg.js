(() => {
  'use strict';
  // 国旗クエスト（RPG）の本体: セーブ（RPG.tx）、クイズのコインの受け取り（#pcoin・結果のパネル・トースト）、バッジのコインの支払い、
  // 冒険ホーム（入口・はじめての画面・引き継ぎコード・開発用パネル）、タブ間の同期、RPG.snapshot()
  // 国旗ガチャと仲間の一覧、仲間の世界地図・シェア・演出（RPG.fx）は rpg-cards.js（このあとに読む）が、編成画面は rpg-team.js が window.RPG に足す
  // index.html のインライン script の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）

  // ---- 起動時のチェック。足りなければ何もしない（ボタンも画面も作らない。クイズはそのまま動く） ----
  const NEED = {
    C: typeof C, byA: typeof byA, REGIONS: typeof REGIONS, flag: typeof flag, esc: typeof esc, fmt: typeof fmt, $: typeof $,
    store: typeof store, S: typeof S, P: typeof P, FX: typeof FX, show: typeof show, registerScreen: typeof registerScreen,
    screenRender: typeof screenRender, emit: typeof emit, toast: typeof toast, makeQuestion: typeof makeQuestion,
    mapSvg: typeof mapSvg, zoomableMap: typeof zoomableMap, factsHTML: typeof factsHTML, shuffle: typeof shuffle,
    feats: typeof feats, featCountry: typeof featCountry, featOf: typeof featOf, boxProjection: typeof boxProjection,
    WORLD_BOX: typeof WORLD_BOX, W: typeof W, H: typeof H, misses: typeof misses, SCREENS: typeof SCREENS,
    RPG_CORE: typeof RPG_CORE,
  };
  const missing = Object.keys(NEED).filter(k => NEED[k] === 'undefined');
  if (missing.length) { console.error(`[rpg] 必要なものが読み込めなかったので、冒険はお休み: ${missing.join(' ')}`); return; }
  // 画面の文は全部 T()（英語のページは i18n/en-rpg.js。日本語のページはキーそのまま）。国名は cName、国の並びは I18N.byName
  const EN = LANG === 'en';

  const K = RPG_CORE, U = K.TUNING;
  const KEY = 'rpg', BROKEN = 'rpg-broken-';
  const KEEP_BROKEN = 3;      // 壊れたセーブの写しは新しいものから3つ（設計書 §9）
  const KEEP_BADGES = 500;    // badgesPaid は最新500件
  const COIN = '<i class="coin" aria-hidden="true"></i>';   // コインの丸（rpg-cards.js と rpg-battle.js は RPG.COIN を使う）
  const MSG = {
    broken: T('データを読めなかったので最初からになったよ'),
    readOnly: T('新しいバージョンのデータが見つかったよ。ページを再読み込みしてね'),
    quota: T('保存できなかった…'),
    firstCoin: T('コインがたまったよ！ 冒険でレベルアップやガチャに使えるよ'),
  };
  // 保存の注意（読めない・新しい版・保存できない）
  const notice = s => toast(s);
  const todayStr = () => K.today(new Date());
  // misses は index.html の let（記録を消すと別のオブジェクトになる）。参照を取っておかず、毎回読む
  const missesNow = () => (misses && typeof misses === 'object') ? misses : {};
  // 国名の並び（エスケープ済み）。知らない国コードはそのまま。区切りは T('・')（英語は ' · '）。RPG.names（rpg-battle.js も使う）
  const names = as => as.map(a => { const c = byA.get(a); return esc(c ? cName(c) : a); }).join(T('・'));
  const JOIN_MAX = 5;   // 仲間になった国の一覧は5か国まで、あとは「ほか n か国」（結果のパネルもトーストも同じ）
  const joinedText = (as, max = JOIN_MAX) => {
    const j = as.slice(0, max), more = as.length - j.length;
    return more ? T('{names}ほか{n}か国', { names: names(j), n: more }) : names(j);
  };
  // 仲間・昇格（シルバー）・克服・手配書の行（RPG.gainLines。クイズの結果のパネルとバトルの終わり・塔が使う）。joinMax: 仲間の国の数の上限
  // （無ければ全部）、joinHint: 「（n回正解した国は仲間になるよ）」を足す。空の行は入れない
  const gainLines = (rc, { joinMax, joinHint = false } = {}) => {
    const joined = joinMax ? joinedText(rc.joined, joinMax) : names(rc.joined);
    return [
      rc.joined.length && (joinHint ? T('🤝 {names}が仲間になった！（{n}回正解した国は仲間になるよ）', { names: joined, n: U.card.frJoin })
        : T('🤝 {names}が仲間になった！', { names: joined })),
      rc.promoted.length && T('🏅 {names}がシルバーに！', { names: names(rc.promoted) }),
      rc.overcome.length && T('✨ 克服！ {names}はもう苦手じゃない +{coins}', { names: names(rc.overcome), coins: fmt(U.overcome * rc.overcome.length) }),
      rc.bounty.length && (rc.bountyAll
        ? T('📜 手配書 {names} +{coins}（3件ぜんぶ +{all}）', { names: names(rc.bounty), coins: fmt(U.bounty * rc.bounty.length), all: fmt(U.bountyAll) })
        : T('📜 手配書 {names} +{coins}', { names: names(rc.bounty), coins: fmt(U.bounty * rc.bounty.length) })),
    ].filter(Boolean);
  };
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
      if (!saidQuota) { saidQuota = true; notice(MSG.quota); }
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
        if (!saidBroken) { saidBroken = true; notice(MSG.broken); }
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
  // コインの短い形（1万から 1.2万、英語は 12.3k）。RPG.shortCoins（rpg-cards.js などのチップも同じ）
  const shortCoins = n => K.shortCoins(n, EN);
  const coinHTML = n => COIN + shortCoins(n);
  // rpg:coins。coins と earned は d ではなく出す時点のセーブから読む（tx が返ってから先に出したイベントのリスナー＝badges.js が
  // 同期でバッジのコインを払っていても、いまの額になる）。呼び出しの形 (d, delta, reason) はそのまま
  const emitCoins = (_d, delta, reason) => {
    if (!delta) return;
    const now = get();
    emit('rpg:coins', { delta, reason, coins: now.coins, earned: now.earned });
  };
  // レシートの仲間・昇格・克服・手配書をイベントにする（tx が返ってから呼ぶ。バトルも使う）。owned と total はその時点の数
  const announce = (rc, d) => {
    const owned = K.owned(d), st = d.st;
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
      el.id = 'pcoin'; el.className = 'mono'; el.title = T('コイン（冒険で使える）');
      $('ppts').after(el);
    }
    const r = last;
    const note = (r && r.coin > 0 && r.decay < 1 ? `<small class="rpg-decay">×${r.decay}</small>` : '')
      + (r && r.firstEver > 0 ? `<small class="rpg-fe">${T('はじめて！+{coins}', { coins: r.firstEver })}</small>` : '');
    // 注は1つの箱に入れる（スマホでは行の下のすき間に出すので、#pcoin の幅を変えない。rpg.css）
    el.innerHTML = `+${fmt(shown.game.coins)} ${COIN}` + (note && `<span class="rpg-pnote">${note}</span>`);
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
    const daily = rc.daily - ctx.daily, overcome = (rc.overcome.length - ctx.ov) * U.overcome;
    const bounty = (rc.bounty.length - ctx.bo) * U.bounty + (rc.bountyAll && !ctx.all ? U.bountyAll : 0);
    emitCoins(d, Math.max(0, rc.delta - daily - overcome - bounty), 'drill');
    emitCoins(d, daily, 'daily');
    emitCoins(d, overcome, 'overcome');
    emitCoins(d, bounty, 'bounty');
    announce(rc, d);
    if (d.show === false) return;   // 冒険の表示が OFF: コインと記録は貯まるが、何も出さない
    if (det.outcome === 'clear') drawResult(rc, d);
    else {
      if (rc.delta > 0) toast(`${COIN} ${T('+{coins} コイン', { coins: fmt(rc.delta) })}`);
      if (rc.joined.length) toast(T('🤝 {names}が仲間になった！', { names: joinedText(rc.joined) }));
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
    const rows = row(T('一発正解 {n}問', { n: rc.first.n }), rc.first.coins) + row(T('やり直しで正解 {n}問', { n: rc.retry.n }), rc.retry.coins)
      + row(T('正解 {n}問', { n: rc.ta.n }), rc.ta.coins) + row(T('クリアボーナス'), rc.clear) + row(T('はじめて正解 {n}か国', { n: rc.fe.n }), rc.fe.coins);
    const lines = [
      rc.daily > 0 && T('🎁 今日はじめてのクリア +{coins} ／ 無料ガチャ1回ゲット', { coins: fmt(rc.daily) }),
      ...gainLines(rc, { joinMax: JOIN_MAX, joinHint: true }),
      rc.zeroed && T('タイムが速すぎたので、この回のコインはなし'),
    ].filter(Boolean);
    // 仲間の数・地域の国を全部、に届いたらシェア（この回で仲間になった国をのぞいたのが、始める前の仲間）
    const shares = RPG.milestones(ownedBefore(d, rc), Object.keys(d.cards));
    ext.innerHTML = `<div class="rpg-res" id="rpg-res">`
      + `<p class="rpg-res-head">${COIN} +<span class="rpg-res-n">${fmt(rc.sum)}</span> ${T('コイン')} <span class="rpg-now">${T('いま {coins}', { coins: fmt(get().coins) })}</span></p>`
      + (rows ? `<ul class="rpg-res-rows">${rows}</ul>` : '')
      + lines.map(l => `<p class="rpg-res-x">${l}</p>`).join('')
      + (shares.length ? '<div class="rpg-shares" id="rpg-res-share"></div>' : '')
      + `<button class="btn ghost" id="rpg-res-go">${d.intro ? T('冒険へ →')
        : T('冒険へ →（はじめてなら {coins} のお祝いつき）', { coins: `<span class="rpg-nowrap">${COIN}${fmt(U.start)}</span>` })}</button></div>`;
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
    try { if (n > 0 && get().show !== false) toast(T('バッジのごほうび {coins}', { coins: `${COIN}+${fmt(n)}` })); } catch (e) { console.error('[rpg]', e); }
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
        x.coins = Math.min(K.BIG, x.coins + U.badge);
        x.earned = Math.min(K.BIG, x.earned + U.badge);
        x.badgesPaid = [...x.badgesPaid, det.id].slice(-KEEP_BADGES);
        d = x;
        return U.badge;
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
  const DG = K.DUNGEONS, REGION_DG = K.REGION_DUNGEONS, AV = K.AVATARS, TOTAL = C.length, owned = K.owned;
  const CH = K.CHAPTERS;   // 章（🌍地球・🪞鏡の地球・🪐宇宙）。DG は章の順に並んでいて、次の章の1つ目の前は前の章の最後のボス
  const BOSS = 5;   // フロアは F1〜F4 とボス（5）
  // ストーリーの文は rpg-core のデータ（// i18n-data）。表示のときに T() を通す
  const STORY = K.STORY, STORY_END = K.STORY_END;
  // どのストーリーを、どのボスを倒したあとに出すか（上から順に見る）
  const STORY_DUE = [{ id: 'ch1', after: 'world' }, { id: 'ch2', after: 'mworld' }, { id: 'ch3start', after: 'mworld' }, { id: 'ch3', after: 'blackhole' }];
  const FLOOR_MARK = ['①', '②', '③', '④', '👑'];
  const JUDGE = { easy: [T('余裕'), 'is-easy'], ok: [T('ちょうど'), 'is-ok'], hard: [T('きびしい'), 'is-hard'] };
  // 設計書 §5.1 の例の表（ゲームとコインの列）。表示するだけの文なので、計算には使わない
  const EARN = [
    [T('練習・国旗→国名・10問（一発8・やり直し2）'), '80+6+20 = 106'],
    [T('練習・10問・パーフェクト'), '100+20+30 = 150'],
    [T('挑戦・10問・ノーミス'), '100+50+50 = 200'],
    [T('挑戦・10問・3回目でクリア'), T('約70+50 = 120')],
    [T('タイムアタック・10問・クリア'), '50+30 = 80'],
    [T('タイムアタック・10問・7問目で失格'), '30'],
    [T('練習・場所→国旗・全世界・全部（195問）・85%'), T('約1,990+90+470 = 約2,550')],
  ];
  const WARN = { readOnly: MSG.readOnly, memory: T('この端末では保存できないみたい。閉じると消えるよ') };

  const cleared = (d, id) => (d.floors || {})[id] || 0;
  // 開いているダンジョン: 1つ目、前のダンジョンのボスを倒した、または自分を1フロアでも進めた（壊れたセーブでも進んだところへは行ける）。
  // 鏡のアマゾンの前は地図喰いの巣なので、章をまたいでも同じ式
  const unlocked = (d, id) => {
    const i = DG.findIndex(g => g.id === id);
    return i === 0 || (i > 0 && (cleared(d, DG[i - 1].id) >= BOSS || cleared(d, id) > 0));
  };
  // 次に挑むフロア: 開いているダンジョンを順に見て、最初のまだボスを倒していないもの。全部クリアなら null
  const nextFloor = d => {
    const g = DG.find(g => unlocked(d, g.id) && cleared(d, g.id) < BOSS);
    return g ? { id: g.id, floor: cleared(d, g.id) + 1 } : null;
  };
  // 章が開いているか（その章の1つ目のダンジョンが開いている）
  const chOpen = (d, ch) => unlocked(d, K.dungeonsOf(ch)[0].id);
  const judgeOf = (d, id, floor) => K.judge(K.battleStats(d, id, floor), K.enemy(id, floor));
  // ダンジョンの名前と land の表示（RPG.dgName・RPG.dgLand。ほかの rpg-*.js もこれを使う）。日本語はデータのまま、英語は T(key ?? name)。
  // 月（天体）は曜日の「月」（Mon）とぶつかるので key: '天体の月'。エスケープしない（名前はデータ）
  const dgName = g => EN ? T(g.key ?? g.name) : g.name;
  const dgLand = g => EN ? T(g.key ?? g.land) : g.land;
  // モンスターの名前（RPG.monName）。鏡の手下 { nk, nb } は型の文に元の名前を入れる（日本語は n と同じ）。エスケープしない
  const monName = m => m.nk ? T(m.nk, { name: T(m.nb) }) : T(m.n);
  // ガチャ・仲間・バトルへはここを通す。その画面が無い（rpg-cards.js / rpg-battle.js が読み込めなかった）ときは、opts を置いて冒険ホームを開く
  const open = (name, opts = {}) => { RPG.opts = opts; show(SCREENS.includes(name) ? name : 'rpg'); };
  // 編成の名前の表示（RPG.teamLabel）: 既定の名前（セーブの '編成1' など）は T('編成{n}')（英語は Team 1）、自分で付けた名前は ugc（data-ugc に入れる）
  const teamLabel = (n, i) => K.isDefaultTeamName(n, i) ? { text: T('編成{n}', { n: i + 1 }), ugc: false } : { text: n, ugc: true };
  // 編成の名前を保存するとき（RPG.teamSaveName）: 表示の既定の名前（英語の Team 2）のままなら、セーブは日本語の既定の名前（'編成2'）
  const teamSaveName = (v, i) => v.trim() === T('編成{n}', { n: i + 1 }) ? K.defaultTeamName(i) : v;
  // ガチャ・仲間の画面があるか（rpg-cards.js が登録する。読み込めなかったときは、冒険ホームにガチャ・仲間の入口を出さない）
  const hasCards = () => SCREENS.includes('gacha') && SCREENS.includes('cards');
  // 称号（badges.js が無い・空なら出さない）
  const titleOf = () => {
    try { return String(window.BADGES?.title?.() || ''); } catch (e) { console.error('[rpg]', e); return ''; }
  };
  // 表示する称号: 英語のページはカタログの称号だけ英語（BADGES.titleLabel。無い称号は ''）。かっこはつけない・エスケープしない
  const titleShown = () => {
    const t = titleOf();
    try { return t ? String(window.BADGES?.titleLabel?.(t) ?? t) : ''; } catch (e) { console.error('[rpg]', e); return ''; }
  };
  // 称号が変わったら（badge:title）旅人カードの称号だけその場で描き直す。冒険ホームを開いていなければ、次に開いたときに出る
  on('badge:title', () => {
    const el = $('rpg-title');
    if (!el) return;
    const tl = titleShown();
    el.textContent = tl ? T('〈{title}〉', { title: tl }) : '';   // textContent なのでエスケープしない
  });

  // ホームの［冒険］の小さいコインと NEW、トップバーのチップ
  const drawEntrances = (d = get()) => {
    const chip = $('rpg-chip');
    if (typeof homeEntry === 'function') homeEntry('home-rpg', { note: `<small class="rpg-homecoin">${coinHTML(d.coins)}</small>${d.intro ? '' : '<span class="rpg-new">NEW</span>'}` });
    if (chip) {
      chip.innerHTML = `${COIN}<b>${shortCoins(d.coins)}</b><span class="rpg-chip-l"> ${T('コイン')}</span>`;
      chip.setAttribute('aria-label', T('コイン {coins}（冒険へ）', { coins: fmt(d.coins) }));
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
    SND.play('levelup');
    emit('rpg:levelup', { lv: d.lv, from });
    emitCoins(d, -cost, 'levelup');
  };
  const levelMax = () => {
    const d0 = get(), m = K.maxLevelUp(d0.lv, d0.coins);
    if (m.to <= d0.lv || !confirm(T('Lv{lv} まで ●{coins} 使う？', { lv: m.to, coins: fmt(m.cost) }))) return;
    let d = null, from = 0, spent = 0;
    tx(x => {
      from = x.lv;
      // 確かめた Lv まで。そのあいだに別のタブで使っていたら、払えるところまで
      while (x.lv < m.to && x.coins >= K.levelCost(x.lv)) { const c = K.levelCost(x.lv); x.coins -= c; spent += c; x.lv++; }
      if (x.lv > from) d = x;
    });
    if (!d || !wrote) return;
    SND.play('levelup');
    emit('rpg:levelup', { lv: d.lv, from });
    emitCoins(d, -spent, 'levelup');
  };

  // ---- データ（引き継ぎコード・冒険データを消す）。はじめての画面には、別の端末から引っ越してきた人のための復元だけ ----
  // tx の中で使う: d の中身をそっくり src に入れかえる
  const replaceSave = (d, src) => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, src); };
  const wipeSave = () => tx(d => replaceSave(d, K.fresh(todayStr())));   // misses はそのまま
  const dataHTML = full => `<details class="rpg-data" id="rpg-data"><summary>${T('データ（引き継ぎコード）')}</summary><div class="rpg-data-in">`
    + (full ? `<label class="rpg-lbl" for="rpg-code-out">${T('引き継ぎコード（ほかの端末の「コードで復元」に入れる）')}</label>`
      + '<textarea class="rpg-code" id="rpg-code-out" rows="3" readonly></textarea>'
      + `<button class="btn ghost" id="rpg-code-copy">${T('コピー')}</button>` : '')
    + `<label class="rpg-lbl" for="rpg-code-in">${T('コードで復元（前の端末でコピーしたコードをはりつける）')}</label>`
    + '<textarea class="rpg-code" id="rpg-code-in" rows="3" spellcheck="false" autocomplete="off" placeholder="CQ1.…"></textarea>'
    + `<button class="btn ghost" id="rpg-code-load">${T('コードで復元')}</button>`
    + '<p class="rpg-code-msg" id="rpg-code-msg" role="status"></p>'
    + (full ? `<button class="btn ghost rpg-danger" id="rpg-wipe">${T('冒険データを消す')}</button>` : '')
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
        sayData(T('コピーしたよ'));
      } catch {
        const out = $('rpg-code-out');   // 待つあいだに描き直していても、いまの欄を選ぶ
        out?.focus();
        out?.select();
        sayData(T('コピーできなかったので、選んである文字をコピーしてね'));
      }
    } catch (e) { console.error('[rpg]', e); }
  };
  // コードを読む → 上書きしてよいか聞く → 今の文字列を写す（rpg-broken-*）→ 書く → まちがえた記録も入れかえるか聞く → 描き直す
  const loadCode = () => {
    const r = K.decodeCode($('rpg-code-in')?.value ?? '', todayStr());
    if (!r.ok) { sayData(T('コードが正しくないみたい')); return; }
    if (status === 'readOnly') { sayData(MSG.readOnly); return; }
    const cur = get();
    const lvAllies = x => T('Lv{lv}・仲間{n}', { lv: x.lv, n: owned(x) });
    if (!confirm(T('今のデータを上書きする？（{from} → {to}）', { from: lvAllies(cur), to: lvAllies(r.rpg) }))) return;
    backupRaw(readRaw());
    if (!tx(d => { replaceSave(d, r.rpg); return true; }) || !wrote) {   // 書けなかった（保存できなかったトーストは tx が出す）
      if (status === 'readOnly') sayData(MSG.readOnly);
      return;
    }
    if (r.hasM && confirm(T('まちがえた記録も入れかえる？'))) { misses = r.m; store.set('misses', misses); }
    introAv = null;
    const inp = $('rpg-code-in');   // ホームのまま描き直すと持ち越されるので、はりつけたコードと前のメッセージを消しておく
    if (inp) inp.value = '';
    sayData('');
    refresh();
    window.scrollTo({ top: 0 });
    toast(T('引き継ぎコードで復元したよ'));
  };
  const wipeAsk = () => {
    if (status === 'readOnly') { sayData(MSG.readOnly); return; }
    if (!confirm(T('冒険データを消す？（コイン・Lv・仲間が全部なくなる）')) || !confirm(T('ほんとうに消す？ もとにもどせないよ'))) return;
    wipeSave();
    if (wrote) emit('rpg:wipe', {});   // 冒険ランキングの記録も消してもらう（rpg-rank.js）
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
  const debugHTML = d => !DEBUG ? '' : `<div class="rpg-debug" id="rpg-debug"><p class="rpg-lbl">${T('開発用パネル（?rpgdebug=1）')}</p><div class="rpg-debug-row">`
    + `<button class="btn ghost" id="rpg-dbg-give">${COIN}+${fmt(DEBUG_GIVE)}</button>`
    + `<span class="rpg-debug-lv"><label for="rpg-dbg-lv">Lv</label><input type="number" id="rpg-dbg-lv" min="1" max="${U.hero.maxLv}" value="${d.lv}">`
    + `<button class="btn ghost" id="rpg-dbg-setlv">${T('Lv にする')}</button></span>`
    + `<button class="btn ghost" id="rpg-dbg-unlock">${T('全部のフロアを開く')}</button>`
    + `<span class="rpg-debug-lv"><label for="rpg-dbg-tf">${T('塔')}</label><input type="number" id="rpg-dbg-tf" min="1" value="10">`
    + `<button class="btn ghost" id="rpg-dbg-tower">${T('階から')}</button></span>`
    + `<button class="btn ghost" id="rpg-dbg-wipe">${T('冒険データを消す')}</button></div></div>`;
  const bindDebug = () => {
    if (!$('rpg-debug')) return;
    $('rpg-dbg-give').onclick = () => RPG.debug.give(DEBUG_GIVE);
    $('rpg-dbg-setlv').onclick = () => RPG.debug.setLv($('rpg-dbg-lv').value);
    // どのダンジョンもボスまで行けるようにする（もう倒したボスはそのまま。倒したことにはしない）
    $('rpg-dbg-unlock').onclick = () => tx(x => { for (const g of DG) x.floors[g.id] = Math.max(cleared(x, g.id), BOSS - 1); });   // 鏡の地球・宇宙も入れて21個
    $('rpg-dbg-wipe').onclick = wipeAsk;
    // 英雄の塔をその階から（RPG_BATTLE.debugTower。地図喰いを倒していないセーブでは始まらない）
    $('rpg-dbg-tower').onclick = () => {
      if (!window.RPG_BATTLE?.debugTower?.(+$('rpg-dbg-tf').value)) toast(T('英雄の塔は地図喰いをたおすと開くよ'));
    };
  };

  // ---- はじめての画面 ----
  let introAv = null;   // はじめての画面で選んでいるアバター（描き直しても残す）
  const warnHTML = () => WARN[status] ? `<p class="rpg-warn" id="rpg-warn" role="status">${WARN[status]}</p>` : '';
  const introHTML = d => {
    const av = introAv ?? d.av;
    return `<div class="rpg-intro" id="rpg-intro">${warnHTML()}`
      + `<h2 class="rpg-h1">${T('国旗クエスト')}</h2><p class="rpg-sub">${T('地図喰いから世界を取りもどせ')}</p>`
      + `<div class="rpg-story">${STORY.map(s => `<p>${T(s)}</p>`).join('')}</div>`
      + `<p class="rpg-lbl" id="rpg-avlbl">${T('旅人のすがたをえらぶ')}</p>`
      + `<div class="rpg-avpick" role="group" aria-labelledby="rpg-avlbl">${AV.map((e, i) => `<button type="button" data-av="${i}" aria-pressed="${i === av}">${e}</button>`).join('')}</div>`
      + `<button class="btn" id="rpg-go">${T('旅に出る')}</button>${dataHTML(false)}</div>${debugHTML(d)}`;
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
        s.coins = Math.min(K.BIG, s.coins + U.start);
        s.earned = Math.min(K.BIG, s.earned + U.start);
        x = s;
      });
      if (x && wrote) emitCoins(x, U.start, 'start');
      renderHome();
    };
  };

  // ---- 冒険ホーム ----
  // つぎにやること（上から最初に当てはまるもの）
  const nextAction = (d, nf) => {
    const gacha = hasCards();   // ガチャの画面が無ければ（rpg-cards.js が読み込めなかった）ガチャはすすめない
    if (gacha && d.pulls === 0 && d.coins >= U.gacha.ten)
      return { text: T('まずは国旗ガチャ10連で仲間をさがそう（全世界なら●1,000）'), go: () => open('gacha', { region: 'all' }) };
    if (gacha && d.day.first && !d.day.free) return { text: T('今日の無料ガチャが引けるよ'), go: () => open('gacha') };
    const en = nf && K.enemy(nf.id, nf.floor);
    if (en && d.coins >= K.levelCost(d.lv) && d.lv < en.recLv) return { text: T('レベルアップできるよ'), go: () => $('rpg-lvup')?.focus() };
    if (en) {
      const g = K.dungeonOf(nf.id);
      return {
        text: en.boss ? T('{dungeon} ボス（{boss}）に挑戦！（推奨Lv{lv}）', { dungeon: dgName(g), boss: monName(K.MONSTERS[nf.id][BOSS - 1]), lv: en.recLv })
          : T('{dungeon} F{f} に挑戦！（推奨Lv{lv}）', { dungeon: dgName(g), f: nf.floor, lv: en.recLv }),
        warn: judgeOf(d, nf.id, nf.floor) === 'hard' ? T('ちょっときびしいかも。クイズでコインを稼ごう') : '',
        go: () => open('battle', { id: nf.id, floor: nf.floor }),
      };
    }
    return hasCards() ? { text: T('全クリア！ {total}か国を仲間にしよう（{owned}/{total}）', { total: TOTAL, owned: owned(d) }), go: () => open('cards') }
      : { text: T('全クリア！ クイズでコインを稼いで、レベルを上げよう'), go: () => open('rpg') };
  };
  // ダンジョンの図版。開いていないものは 🔒 と押せないフロアだけ（ボスは見せない）
  // sel は冒険マップで選んでいるダンジョン。ほかの図版は隠す（DOM にはいまの章の7つとも置く）
  const plateHTML = (d, g, sel) => {
    const n = cleared(d, g.id), on = unlocked(d, g.id), boss = K.MONSTERS[g.id][BOSS - 1];
    const fls = FLOOR_MARK.map((mark, i) => {
      const f = i + 1, cls = !on ? '' : f <= n ? ' is-done' : f === n + 1 ? ' is-next' : '';
      const fl = f === BOSS ? T('ボス') : `F${f}`;
      return `<button type="button" class="rpg-fl${cls}" data-d="${g.id}" data-f="${f}" aria-label="${on && f <= n ? T('{floor}（クリア済み）', { floor: fl }) : fl}"`
        + `${on && f <= n + 1 ? '' : ' disabled'}>${mark}</button>`;
    }).join('');
    const head = `<div class="rpg-plate${on ? '' : ' rpg-locked'}" data-d="${g.id}" style="--rpg-c: var(--rpg-r-${g.id}, ${g.color})"${g.id === sel ? '' : ' hidden'}><p class="rpg-plate-no">${g.plate}</p>`;
    const prev = DG[DG.findIndex(x => x.id === g.id) - 1];
    // 宇宙の星は、出る国のテーマを1行（星喰いの巣は全部のテーマなので出さない）
    const theme = g.t ? `<p class="rpg-plate-meta rpg-plate-theme">${T('テーマ: {name}（{n}か国）', { name: T(K.THEMES[g.t].n), n: K.THEMES[g.t].a.length })}</p>` : '';
    if (!on) return `${head}<p class="rpg-plate-name"><span class="rpg-plate-e" role="img" aria-label="${T('まだ開いていない')}">🔒</span><b>${dgName(g)}</b></p>`
      + `${theme}<p class="rpg-plate-meta rpg-plate-lock">${prev ? T('{name}のボスをたおすと開く', { name: esc(dgName(prev)) }) : ''}</p><div class="rpg-fls">${fls}</div></div>`;
    const left = restReward(g.id, n);
    const rec = f => K.recLv(K.stageOf(g.id, f)), [jt, jc] = JUDGE[judgeOf(d, g.id, Math.min(n + 1, BOSS))];
    return `${head}<p class="rpg-plate-name"><span class="rpg-plate-e" aria-hidden="true">${boss.e}</span><b>${dgName(g)}</b><small>${T('ボス {name}', { name: monName(boss) })}</small></p>`
      + `${theme}<p class="rpg-plate-meta"><span>${T('推奨Lv{from}〜{to}', { from: rec(1), to: rec(BOSS) })}</span><span class="rpg-judge ${jc}">${jt}</span>${n >= BOSS ? `<span>${T('ぜんぶクリア')}</span>` : ''}</p>`
      + (left ? `<p class="rpg-plate-meta rpg-plate-gain"><span>${T('はじめてクリアでもらえる {coins}', { coins: `${COIN}<b>${fmt(left)}</b>` })}</span><span>${T('ボスまで あと{n}フロア', { n: BOSS - n })}</span></p>` : '')
      + `<div class="rpg-fls">${fls}</div></div>`;
  };
  // まだはじめてクリアしていないフロア（n より先）のコインの合計
  const restReward = (id, n) => {
    let sum = 0;
    for (let f = n + 1; f <= BOSS; f++) sum += K.battleReward(K.stageOf(id, f), { win: true, first: true, boss: f === BOSS });
    return sum;
  };

  // ---- 冒険マップ（冒険ホームの図版の上）。章タブで選んだ章の地図にダンジョン7つと道。押したダンジョンの図版を下に出す ----
  // 地球・鏡の地球は世界地図（d3）、宇宙は太陽系（d3 を使わない手書きの SVG）。道・進み具合の輪・旅人・✓ はどの章も同じ描き方
  // SPOT は [経度, 緯度]。BEND は道の曲がり（+ は南へ、- は北へふくらむ。道の長さに対する割合）。鏡の地球は元のダンジョン（base）の場所と曲がりを使い回す
  const SPOT = { samerica: [-60, -12], oceania: [140, -26], namerica: [-102, 42], europe: [14, 50], asia: [92, 36], africa: [20, 2], world: [66, -30] };
  const BEND = [0.18, -0.12, -0.18, -0.2, 0.18, 0.22];
  const AMAP_BOX = [-122, -46, 166, 64];   // 北極・南極のほうと太平洋のはしを切って、ダンジョンを大きく見せる
  // 太陽系: 太陽は左はし（中心 SUN が x = 0 なので半円だけ見える）。星は SPACE_SPOT（W × H の座標）に、上下にゆれながら右へゆるく上る弧。
  // 名前は点の下（+57）・旅人は上（-72）に出るので、y は 92〜300 におさめる
  const SUN = [0, H / 2];
  const SPACE_SPOT = { moon: [118, 258], mercury: [200, 182], venus: [280, 254], mars: [360, 172], jupiter: [440, 240], saturn: [520, 160], blackhole: [592, 226] };
  const SPACE_BEND = [0.14, -0.14, 0.14, -0.14, 0.14, -0.14];
  let dgSel = '';    // マップで選んだダンジョン（冒険ホームを離れたら空にもどる＝次に挑むダンジョン）
  let chSel = 0;     // タブで選んだ章（dgSel と同じく、冒険ホームを離れたら 0 にもどる＝次に挑むフロアの章）
  let amapBase = null, spaceBase = null;
  // 国の形を地域（featCountry の r）ごとに1本の path にまとめ、ダンジョンの場所の座標といっしょに1回だけ作る。地球と鏡の地球は g.r で引く
  const amapGeo = () => {
    if (amapBase) return amapBase;
    const proj = boxProjection(AMAP_BOX, W, H), path = d3.geoPath(proj), byR = new Map(), rest = [];
    path.digits?.(1);
    const earth = DG.filter(g => SPOT[g.base ?? g.id]);   // 宇宙の星は世界地図に置かない
    const rs = new Set(earth.map(g => g.r));
    for (const g of feats) {
      const p = path(g);
      if (!p) continue;
      const r = featCountry.get(g)?.r;
      if (rs.has(r)) byR.set(r, (byR.get(r) || '') + p); else rest.push(p);
    }
    const at = Object.fromEntries(earth.map(g => [g.id, proj(SPOT[g.base ?? g.id]).map(v => Math.round(v))]));
    return amapBase = { byR, rest: rest.join(''), at };
  };
  // 太陽系の背景（星くず・軌道・太陽）。毎回同じ並びになるよう、星くずは決まった種から作る。1回だけ作る
  const spaceSky = () => {
    if (spaceBase) return spaceBase;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let dust = '';
    for (let i = 0; i < 70; i++) {
      const x = Math.round(rnd() * W), y = Math.round(rnd() * H), r = (0.6 + rnd() * 1.2).toFixed(1);
      if (Math.hypot(x - SUN[0], y - SUN[1]) > 110) dust += `<circle cx="${x}" cy="${y}" r="${r}"${rnd() < .25 ? ' class="is-big"' : ''}></circle>`;
    }
    const orbits = Object.values(SPACE_SPOT).map(([x, y]) => `<circle r="${Math.round(Math.hypot(x - SUN[0], y - SUN[1]))}"></circle>`).join('');
    return spaceBase = '<defs><radialGradient id="rpg-sun-g"><stop offset="0" stop-color="#fffbe6"></stop><stop offset=".45" stop-color="#ffd25e"></stop>'
      + '<stop offset=".75" stop-color="#ff9d2e"></stop><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"></stop></radialGradient></defs>'
      + `<g class="rpg-am-dust" aria-hidden="true">${dust}</g>`
      + `<g class="rpg-am-orbits" transform="translate(${SUN[0]} ${SUN[1]})" aria-hidden="true">${orbits}</g>`
      + `<g class="rpg-am-sun" transform="translate(${SUN[0]} ${SUN[1]})" aria-hidden="true"><circle class="rpg-am-corona" r="150"></circle><circle r="84"></circle></g>`;
  };
  // ch の章のダンジョンだけを描く。進み具合のヘッダーと棒もその章の分
  const amapHTML = (d, sel, nf, ch) => {
    const list = K.dungeonsOf(ch), mirror = ch === 2, space = list.every(g => SPACE_SPOT[g.id]);
    const done = list.filter(g => cleared(d, g.id) >= BOSS).length, floors = list.reduce((s, g) => s + Math.min(BOSS, cleared(d, g.id)), 0);
    const st = g => cleared(d, g.id) >= BOSS ? 'is-done' : unlocked(d, g.id) ? 'is-open' : 'is-locked';
    const c = g => `--rpg-c: var(--rpg-r-${g.id}, ${g.color})`;
    let s, at, bend;
    if (space) { s = spaceSky(); at = SPACE_SPOT; bend = SPACE_BEND; }
    else {
      const geo = amapGeo();
      s = `<path class="rpg-am-land" d="${geo.rest}"></path>`;
      for (const g of list) if (geo.byR.has(g.r)) s += `<path class="rpg-am-r ${st(g)}" data-d="${g.id}" style="${c(g)}" d="${geo.byR.get(g.r)}"></path>`;
      at = geo.at; bend = BEND;
    }
    list.slice(1).forEach((g, i) => {
      // 道に直角で南向きの向き (nx, ny) へ bend × 長さだけ、まん中をずらした点を通る
      const [x0, y0] = at[list[i].id], [x1, y1] = at[g.id], len = Math.hypot(x1 - x0, y1 - y0) || 1, k = bend[i] * len;
      const sg = x1 >= x0 ? 1 : -1, nx = -(y1 - y0) / len * sg, ny = (x1 - x0) / len * sg;
      const cx = (x0 + x1) / 2 + nx * k, cy = (y0 + y1) / 2 + ny * k;
      s += `<path class="rpg-am-road${unlocked(d, g.id) ? ' is-open' : ''}" d="M${x0} ${y0}Q${Math.round(cx)} ${Math.round(cy)} ${x1} ${y1}"></path>`;
    });
    const R = 33, RING = 2 * Math.PI * (R + 5);
    for (const g of list) {
      const [x, y] = at[g.id], n = Math.min(BOSS, cleared(d, g.id)), state = st(g), on = state !== 'is-locked';
      const label = !on ? T('{name}（まだ開いていない）', { name: dgName(g) })
        : n >= BOSS ? T('{name}（{done}/{all}フロア・クリア）', { name: dgName(g), done: n, all: BOSS }) : T('{name}（{done}/{all}フロア）', { name: dgName(g), done: n, all: BOSS });
      s += `<g class="rpg-am-node ${state}${g.id === sel ? ' is-sel' : ''}${nf?.id === g.id ? ' is-here' : ''}" data-d="${g.id}" style="${c(g)}" transform="translate(${x} ${y})"`
        + ` role="button" tabindex="0" aria-pressed="${g.id === sel}" aria-label="${label}">`
        + `<circle class="rpg-am-hit" r="${R + 14}"></circle>`
        + (on ? `<circle class="rpg-am-track" r="${R + 5}"></circle><circle class="rpg-am-ring" r="${R + 5}" transform="rotate(-90)" stroke-dasharray="${(RING * n / BOSS).toFixed(1)} ${RING.toFixed(1)}"></circle>` : '')
        // 宇宙は星の絵（DUNGEONS の e）、地球と鏡の地球はボスの絵
        + `<circle class="rpg-am-dot" r="${R}"></circle><text class="rpg-am-e" dy=".35em">${on ? g.e ?? K.MONSTERS[g.id][BOSS - 1].e : '🔒'}</text>`
        + `<text class="rpg-am-name" y="${R + 24}">${dgName(g)}</text>`
        + (state === 'is-done' ? `<g class="rpg-am-ok" transform="translate(${R - 3} ${-R + 3})"><circle r="13"></circle><path d="M-6 0l4 4 7-8"></path></g>` : '')
        + '</g>';
    }
    if (nf && list.some(g => g.id === nf.id)) {   // 旅人は次に挑むフロアの章の地図にだけいる
      const [x, y] = at[nf.id];
      s += `<g class="rpg-am-hero" transform="translate(${x} ${y - 72})" aria-hidden="true"><text dy=".35em">${AV[d.av] ?? AV[0]}</text></g>`;
    }
    return `<div class="rpg-amap-h"><b>${T('冒険マップ')}</b><span>${T('ダンジョン')} <b>${done}</b>/${list.length}${T('・')}${T('フロア')} <b>${floors}</b>/${list.length * BOSS}</span></div>`
      + `<div class="rpg-amap-bar" aria-hidden="true"><i style="width: ${(100 * floors / (list.length * BOSS)).toFixed(1)}%"></i></div>`
      + `<svg class="map rpg-amap-svg${mirror ? ' is-mirror' : ''}${space ? ' is-space' : ''}" viewBox="0 0 ${W} ${H}" role="group" aria-label="${T('冒険マップ（ダンジョンを押すと下にくわしく出る）')}">${s}</svg>`;
  };
  // 章タブ（冒険マップの上）。開いていない章は 🔒 で押せない
  const chtabsHTML = (d, ch) => `<div class="rpg-chtabs" id="rpg-chtabs" role="group" aria-label="${T('章')}">${CH.map(c => {
    const isOpen = chOpen(d, c.ch);
    return `<button type="button" class="chip" id="rpg-ch${c.ch}" data-ch="${c.ch}" aria-pressed="${c.ch === ch}"${isOpen ? '' : ' disabled'}>`
      + `<span aria-hidden="true">${isOpen ? c.e : '🔒'}</span> ${T(c.name)}</button>`;
  }).join('')}</div>`;
  // いま見せる章: タブで選んだ章（開いていれば）→ 次に挑むフロアの章 → 全部クリアなら最後の章
  const chNow = (d, nf) => CH.some(c => c.ch === chSel) && chOpen(d, chSel) ? chSel : nf ? K.chapterOf(nf.id) : CH[CH.length - 1].ch;
  const bountyHTML = d => {
    const b = d.bounty, n = b.a.filter(a => b.done.includes(a)).length;
    const li = a => {
      const c = byA.get(a), nm = esc(c ? cName(c) : a), done = b.done.includes(a);
      return `<li class="rpg-wf${done ? ' is-done' : ''}"><img src="${flag(a)}" alt="${nm}" title="${nm}">${done ? `<span class="rpg-check" role="img" aria-label="${T('達成')}">✓</span>` : ''}</li>`;
    };
    return `<div class="rpg-bounty" id="rpg-bounty"${b.a.length ? '' : ' hidden'}><p class="rpg-bounty-h">${T('今日の手配書')} <b>${n}/${b.a.length}</b></p>`
      + `<ul class="rpg-wanted">${b.a.map(li).join('')}</ul><p class="hint">${T('ゲームでヒントなしの一発正解！')}</p></div>`;
  };
  const earnHTML = () => `<details class="rpg-earn" id="rpg-earn"><summary>${T('コインのかせぎ方')}</summary>`
    + `<table class="rpg-earn-t"><caption>${T('クイズ1回の例（はじめて正解した国は、さらに +{coins}）', { coins: U.quiz.firstEver })}</caption>`
    + `<thead><tr><th scope="col">${T('ゲーム')}</th><th scope="col">${T('コイン')}</th></tr></thead>`
    + `<tbody>${EARN.map(([g, c]) => `<tr><td>${g}</td><td>${c}</td></tr>`).join('')}</tbody></table>`
    + `<button class="btn ghost" id="rpg-earn-go">${T('クイズで稼ぐ')}</button></details>`;
  // ---- かざり（旅人カードの名前の横に、好きな仲間の国旗を3つまで。冒険ランキングにも出る: rpg-rank.js） ----
  // 仲間が0枚・rpg-cards.js が無いときは出さない。出すのは deco のうち持っている仲間（cards）の国だけ。空きは点線の四角
  const DECO_MAX = 3;
  const decoOwned = d => d.deco.filter(a => byA.has(a) && d.cards[a]);
  const canDeco = d => hasCards() && typeof RPG.cardHTML === 'function' && owned(d) > 0;
  const decoHTML = d => {
    if (!canDeco(d)) return '';
    const as = decoOwned(d), slots = as.map(a => { const nm = esc(cName(byA.get(a))); return `<img src="${flag(a)}" alt="${nm}" title="${nm}">`; });
    while (slots.length < DECO_MAX) slots.push('<span class="rpg-deco-empty"></span>');
    return `<button type="button" class="rpg-deco" id="rpg-deco" aria-label="${T('かざりを変える')}">${slots.join('')}</button>`;
  };
  // 選ぶ画面（<dialog id="rpg-deco-dlg">。冒険ホームの描き直しで消えないよう body に1つ）。押すたびに入れる／外す（3つ埋まっていたら入らない）。
  // ［決定］で保存して rpg:deco。Esc・閉じる・外を押したときは保存しない
  const openDeco = () => {
    const d = get();
    if (!canDeco(d)) return;
    let dlg = $('rpg-deco-dlg');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'rpg-deco-dlg';
      dlg.className = 'rpg-deco-dlg';
      dlg.setAttribute('aria-labelledby', 'rpg-deco-h');
      dlg.onclick = e => { if (e.target === dlg) dlg.close(); };
      document.body.append(dlg);
    }
    let pick = decoOwned(d);
    const star = a => d.cards[a][0];
    const list = Object.keys(d.cards).filter(a => byA.has(a))
      .sort((x, y) => star(y) - star(x) || I18N.byName(byA.get(x), byA.get(y)));
    const ro = status === 'readOnly';
    dlg.innerHTML = `<div class="inner"><button type="button" class="close">${T('閉じる')}</button>`
      + `<h2 id="rpg-deco-h" class="rpg-deco-h">${T('かざりを選ぶ')} <small id="rpg-deco-n"></small></h2>`
      + `<p class="hint">${T('旅人カードと冒険ランキングに出る仲間の国旗（{max}つまで）。もう一度押すと外れる', { max: DECO_MAX })}</p>`
      + `<div class="rpg-cd-grid rpg-deco-grid" id="rpg-deco-grid">${list.map(a => RPG.cardHTML(a, d, { lazy: true })).join('')}</div>`
      + `<button type="button" class="btn" id="rpg-deco-ok"${ro ? ' disabled' : ''}>${T('決定')}</button></div>`;
    const mark = () => {
      for (const b of dlg.querySelectorAll('.rpg-card[data-a]')) {
        const i = pick.indexOf(b.dataset.a), lab = b.querySelector('.rpg-lab');
        b.classList.toggle('is-in', i >= 0);
        b.setAttribute('aria-pressed', String(i >= 0));
        if (i >= 0 && !lab) b.querySelector('.rpg-card-face')?.insertAdjacentHTML('afterbegin', '<span class="rpg-lab"></span>');
        if (i >= 0) b.querySelector('.rpg-lab').textContent = T('✓ かざり{n}', { n: i + 1 });
        else lab?.remove();
      }
      $('rpg-deco-n').textContent = `${pick.length}/${DECO_MAX}`;
    };
    $('rpg-deco-grid').onclick = e => {
      const a = e.target.closest('.rpg-card[data-a]')?.dataset.a;
      if (!a) return;
      if (pick.includes(a)) pick = pick.filter(x => x !== a);
      else if (pick.length < DECO_MAX) pick = [...pick, a];
      mark();
    };
    dlg.querySelector('.close').onclick = () => dlg.close();
    $('rpg-deco-ok').onclick = () => {
      const deco = [...pick], from = JSON.stringify(get().deco);
      const ok = tx(x => { x.deco = deco; return true; });
      dlg.close();
      if (ok && wrote && JSON.stringify(deco) !== from) emit('rpg:deco', { deco });
    };
    mark();
    if (!dlg.open) dlg.showModal();
  };
  // ---- 章の終わりのストーリー（<dialog id="rpg-story-dlg">。deco と同じく body に1つ） ----
  // STORY_DUE の after のボスを倒していて story に無いものを、上から1つ。閉じたら（［閉じる］・下のボタン・Esc）読んだことにして story に足す。
  // 書けたら描き直しで次の章のものが出る。新しい版のデータ（読み取り専用）のあいだは出さない（読んだことにできないので）
  const storyDue = d => STORY_DUE.find(x => cleared(d, x.after) >= BOSS && !d.story.includes(x.id))?.id;
  const storyRead = dlg => {
    const sid = dlg.dataset.story;
    dlg.dataset.story = '';
    if (sid) tx(x => { if (!x.story.includes(sid)) x.story = [...x.story, sid]; });
  };
  const openStory = d => {
    const id = status === 'readOnly' ? null : storyDue(d);
    let dlg = $('rpg-story-dlg');
    if (!id || dlg?.open) return;
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'rpg-story-dlg';
      dlg.className = 'rpg-story-dlg';
      dlg.setAttribute('aria-labelledby', 'rpg-story-h');
      dlg.addEventListener('close', () => storyRead(dlg));   // ［閉じる］・下のボタン・Esc のどれで閉じても、close で読んだことにする
      document.body.append(dlg);
    }
    dlg.dataset.story = id;
    dlg.innerHTML = `<div class="inner"><button type="button" class="close">${T('閉じる')}</button>`
      + STORY_END[id].map((x, i) => `<h2 class="rpg-story-h"${i ? '' : ' id="rpg-story-h"'}>${T(x.h)}</h2><div class="rpg-story">${x.p.map(s => `<p>${T(s)}</p>`).join('')}</div>`).join('')
      + `<button type="button" class="btn" id="rpg-story-ok">${T('冒険をつづける')}</button></div>`;
    dlg.querySelector('.close').onclick = $('rpg-story-ok').onclick = () => dlg.close();
    dlg.showModal();
  };
  // 英雄の塔の入口（つぎにやることの下）。地図喰いを倒すまでは 🔒 で［挑戦］を押せない。バトルの画面が無ければ出さない
  const towerHTML = d => {
    if (!SCREENS.includes('battle')) return '';
    const on = K.towerOpen(d), best = d.tower?.best || 0;
    return `<div class="rpg-tower${on ? '' : ' rpg-locked'}" id="rpg-tower"><p class="rpg-tower-h">`
      + (on ? '<span class="rpg-tower-e" aria-hidden="true">🗼</span>' : `<span class="rpg-tower-e" role="img" aria-label="${T('まだ開いていない')}">🔒</span>`)
      + `<b>${T('英雄の塔')}</b><span class="rpg-tower-s">${on ? (best ? T('自己ベスト {n}階', { n: fmt(best) }) : T('1階から、どこまで登れるかな')) : T('地図喰いをたおすと開く')}</span></p>`
      + `<button type="button" class="btn" id="rpg-tower-go"${on ? '' : ' disabled'}>${T('挑戦')}</button></div>`;
  };
  // スマホは上から 旅人・レベルアップ・つぎにやること・塔・手配書・ガチャと仲間・図版・かせぎ方（rpg.css の order）。
  // PC は .rpg-side（左）・.rpg-main（図版）・.rpg-aside（手配書。1400px 以上は右の列）
  const homeHTML = (d, nf, nx) => {
    const st = nf ? K.battleStats(d, nf.id, nf.floor) : K.battleStats(d, DG[DG.length - 1].id, BOSS);   // 全部クリアなら最後の章のボス（星喰い）
    // マップと図版は ch の章だけ。選ぶダンジョンは マップで選んだもの → 次に挑むダンジョン → その章の最後
    const ch = chNow(d, nf), list = K.dungeonsOf(ch);
    const sel = list.some(g => g.id === dgSel) ? dgSel : list.some(g => g.id === nf?.id) ? nf.id : list[list.length - 1].id;
    // 名前はサイト共通のプロフィールのもの（無ければ前に使った nickname）。自分の名前は data-ugc（訳さない）、無ければ T('旅人')
    const nick = window.PROFILE?.get?.()?.name ?? store.get('nickname', ''), title = titleShown();
    const name = typeof nick === 'string' && nick.trim() ? `<b id="rpg-name" data-ugc>${esc(nick)}</b>` : `<b id="rpg-name">${T('旅人')}</b>`;
    const max = d.lv >= U.hero.maxLv, cost = K.levelCost(d.lv), can = d.coins >= cost, upTo = K.maxLevelUp(d.lv, d.coins).to;
    const lvup = max ? 'MAX' : T('レベルアップ {coins}', { coins: `${COIN}${fmt(cost)}` })
      + (can ? '' : ` <small class="rpg-short">${T('あと{coins}', { coins: `${COIN}${fmt(cost - d.coins)}` })}</small>`);
    return `<div class="rpg-side">${warnHTML()}`
      + '<div class="rpg-hero" id="rpg-hero">'
      + `<button type="button" class="rpg-av" id="rpg-av" aria-label="${T('旅人のすがたを変える')}">${AV[d.av] ?? AV[0]}</button>`
      + `<p class="rpg-who">${name}<span class="rpg-ttl" id="rpg-title">${title ? T('〈{title}〉', { title: esc(title) }) : ''}</span>${decoHTML(d)}</p>`
      + `<p class="rpg-stats" id="rpg-stats"><span class="rpg-lvnum">Lv ${d.lv}</span><span>❤️ ${fmt(st.hp)}</span><span>⚔️ ${fmt(st.atk)}</span><span>${T('仲間 {n}/{total}', { n: owned(d), total: TOTAL })}</span></p></div>`
      + `<div class="rpg-lv"><button class="btn" id="rpg-lvup"${max || !can ? ' disabled' : ''}>${lvup}</button>`
      + `<button class="linkbtn" id="rpg-lvmax"${upTo > d.lv ? '' : ' disabled'}>${T('上げられるだけ上げる')}</button></div>`
      + `<button type="button" class="rpg-next" id="rpg-next"><span class="rpg-next-k" aria-hidden="true">▸</span>`
      + `<span>${nx.text}${nx.warn ? `<small class="rpg-next-w">${nx.warn}</small>` : ''}</span></button>${towerHTML(d)}`
      + (hasCards() ? `<div class="rpg-go"><button class="btn ghost" id="rpg-to-gacha">🎴 ${T('国旗ガチャ')}${d.day.first && !d.day.free ? ` <small class="rpg-free">${T('無料1回！')}</small>` : ''}</button>`
        + `<button class="btn ghost" id="rpg-to-cards">🗂 ${T('仲間')}</button>`
        + (SCREENS.includes('team') ? `<button class="btn ghost" id="rpg-to-team">⚔️ ${T('編成')}</button>` : '') + '</div>' : '')
      + (SCREENS.includes('rpgrank') ? `<button class="btn ghost rpg-to-rank" id="rpg-to-rank">🏆 ${T('冒険ランキング')}</button>` : '') + '</div>'
      + `<div class="rpg-main"><div class="rpg-shares rpg-home-share" id="rpg-home-share" hidden></div>${chtabsHTML(d, ch)}<div class="rpg-amap" id="rpg-amap">${amapHTML(d, sel, nf, ch)}</div><div class="rpg-dgs" id="rpg-dgs">${list.map(g => plateHTML(d, g, sel)).join('')}</div>${earnHTML()}${dataHTML(true)}${debugHTML(d)}</div>`
      + `<div class="rpg-aside">${bountyHTML(d)}<div id="rpg-map"></div></div>`;
  };
  // 失格／にげたときの節目の［シェア］。押した行は消える（冒険ホームを離れたら全部消える: drill:screen）。
  // 押したボタンにフォーカスがあれば（キーボード）、消えたあとは同じ場所に来た行（最後の行なら1つ前）の［シェア］へ、もう無ければ「つぎにやること」へ
  const drawHomeShares = () => {
    const box = $('rpg-home-share');
    RPG.drawShares(box, homeShares);
    homeSharesShown = homeShares.length > 0;
    box.querySelectorAll('.rpg-share').forEach((b, i) => {
      const { kind } = homeShares[i];
      b.addEventListener('click', () => {
        const had = document.activeElement === b;
        homeShares = homeShares.filter(s => s.kind !== kind);
        drawHomeShares();
        if (!had) return;
        const bs = $('rpg-home-share')?.querySelectorAll('.rpg-share') ?? [];
        (bs[Math.min(i, bs.length - 1)] ?? $('rpg-next'))?.focus({ preventScroll: true });
      });
    });
  };
  const bindHome = nx => {
    $('rpg-av').onclick = () => tx(x => { x.av = (x.av + 1) % AV.length; });
    $('rpg-lvup').onclick = levelUp;
    $('rpg-lvmax').onclick = levelMax;
    $('rpg-next').onclick = nx.go;
    if ($('rpg-tower-go')) $('rpg-tower-go').onclick = () => open('battle', { tower: true });
    if ($('rpg-deco')) $('rpg-deco').onclick = openDeco;
    if ($('rpg-to-gacha')) $('rpg-to-gacha').onclick = () => open('gacha');
    if ($('rpg-to-cards')) $('rpg-to-cards').onclick = () => open('cards');
    if ($('rpg-to-team')) $('rpg-to-team').onclick = () => open('team');
    if ($('rpg-to-rank')) $('rpg-to-rank').onclick = () => open('rpgrank');
    // マップのダンジョンを押すと、その図版だけを見せる（描き直さない。フォーカスはそのダンジョンに残る）
    const pick = node => {
      dgSel = node.dataset.d;
      for (const n of $('rpg-amap').querySelectorAll('.rpg-am-node')) {
        n.classList.toggle('is-sel', n === node);
        n.setAttribute('aria-pressed', String(n === node));
      }
      for (const p of $('rpg-dgs').children) p.hidden = p.dataset.d !== dgSel;
    };
    // 章タブ: その章のマップと図版に描き直す（選んでいたダンジョンは忘れる）
    $('rpg-chtabs').onclick = e => {
      const b = e.target.closest('button[data-ch]');
      if (!b || +b.dataset.ch === chSel) return;
      chSel = +b.dataset.ch; dgSel = '';
      renderHome();
    };
    $('rpg-amap').onclick = e => { const n = e.target.closest('.rpg-am-node'); if (n) pick(n); };
    $('rpg-amap').onkeydown = e => {
      const n = e.target.closest?.('.rpg-am-node');
      if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(n); }
    };
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
      openStory(d);
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

  // チップ・ホームのボタン・設定のスイッチ・冒険の表示の ON/OFF・結果のパネルの「いま」・いまの冒険の画面を描き直す（ガチャの結果は消さない）
  const refresh = () => {
    const d = get(), screen = document.body.dataset.screen;
    document.body.classList.toggle('rpg-off', d.show === false);
    drawEntrances(d);
    if ($('set-rpg')) $('set-rpg').checked = d.show !== false;
    // パネルを描いたあとに払ったバッジのコイン（badges.js の drill:result はこちらのあと）も「いま」に入れる
    const now = document.querySelector('#rpg-res .rpg-now');
    if (now) now.textContent = T('いま {coins}', { coins: fmt(d.coins) });
    if (screen === 'rpg') renderHome();
    RPG.redraw(screen, d);   // ガチャ・仲間の画面（rpg-cards.js）・編成の画面（rpg-team.js）
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
      tower: d.tower?.best || 0,   // 英雄の塔の最高記録（勝ったいちばん上の階）
    };
  };
  // 起動時に1回: 冒険ホームの画面（<section> を作ってから登録）、ホームのボタン、トップバーのチップ、設定のスイッチ
  const setupEntrances = () => {
    document.body.classList.toggle('rpg-off', get().show === false);   // 入口を出す・チップを作る前に（OFF の人に一瞬でも見せない）
    // 画面: footer の直前に <section> を作ってから登録する（ガチャ・仲間は rpg-cards.js、バトルは rpg-battle.js がこの後ろに足す）
    const wrap = document.querySelector('body > .wrap'), foot = wrap.querySelector(':scope > footer');
    const sec = document.createElement('section');
    sec.id = 'scr-rpg'; sec.className = 'wrap'; sec.hidden = true;
    if (foot) foot.before(sec); else wrap.append(sec);
    registerScreen('rpg', renderHome);

    if (typeof homeEntry === 'function') homeEntry('home-rpg', { open: () => show('rpg') });   // ホームの入口は index.html にある（hidden で始まる）
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'rpg-chip'; chip.id = 'rpg-chip'; chip.title = T('コイン（冒険へ）');
    chip.onclick = () => show('rpg');
    ($('topbar-extra') || $('to-book')?.parentElement)?.prepend(chip);
    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = `<span class="lbl">${T('冒険')}</span><label class="switch"><input type="checkbox" id="set-rpg"> ${T('冒険（コイン・RPG）を表示する')}</label>`;
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
    if (name !== 'rpg') { dgSel = ''; chSel = 0; }   // マップで選んだダンジョンと章も、離れたら次に挑むダンジョン（の章）にもどす
    if (name === 'home') drawEntrances();
    if (name === 'settings' && $('set-rpg')) $('set-rpg').checked = get().show !== false;
  });

  /* ---------- window.RPG ---------- */
  const RPG = window.RPG = {
    tx, get, emitCoins, announce, coinHTML, COIN,
    // 表示の部品（ほかの rpg-*.js も使う）: 国名の並び・モンスター・ダンジョンの名前と land・編成の名前・コインの短い形・仲間などの行
    names, monName, dgName, dgLand, teamLabel, teamSaveName, shortCoins, gainLines,
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
      // Lv を n にする（1..上限の Lv99 におさめる。コインは変わらない）。書いた Lv を返す
      setLv: n => tx(x => { x.lv = Math.max(1, Math.min(U.hero.maxLv, Math.round(+n) || 1)); return x.lv; }),
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
  if (status === 'readOnly') notice(MSG.readOnly);
  base = get();
  showCache = base.show;
  setupEntrances();
  emit('rpg:ready', { intro: base.intro, lv: base.lv, coins: base.coins, owned: owned(base) });
  // 直リンク（index.html の起動処理は #rpg を知らないので、画面を登録したあとでここから開く）
  if (location.hash === '#rpg') show('rpg');
  // そのときはまだ後ろのスクリプト（rpg-cards.js のガチャ・仲間の入口と世界地図、badges.js の称号など）が無いので、読み込みが終わったらもう1回描く
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { if (document.body.dataset.screen === 'rpg') renderHome(); }, { once: true });
})();
