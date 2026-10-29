(() => {
  'use strict';
  // 今日の難問（#scr-daily）: 毎日1回だけ挑戦できる20問。全員同じ問題（daily-core.js が日付から作る）。1ミスでそこまで、全問正解ならタイム。
  // クイズの画面は index.html の startDaily（タイムアタックと同じ進み方）を使い、進み具合は drill:daily で受け取る。
  // その日のランキングは Supabase の daily_scores（supabase/schema.sql の submit_daily2 / top_daily2 / daily_rank_of）。載せるのはプロフィール（profile.js）で。
  // index.html のインライン script の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）

  const NEED = {
    C: typeof C, byA: typeof byA, flag: typeof flag, esc: typeof esc, $: typeof $, store: typeof store, show: typeof show,
    registerScreen: typeof registerScreen, startDaily: typeof startDaily, RANKING: typeof RANKING, DAILY_CORE: typeof DAILY_CORE,
  };
  const missing = Object.keys(NEED).filter(k => NEED[k] === 'undefined');
  if (missing.length) { console.error(`[daily] 必要なものが読み込めなかったので、今日の難問はお休み: ${missing.join(' ')}`); return; }

  const K = DAILY_CORE, N = K.COUNT;
  // この端末の記録（localStorage の daily）: { day, status: 'playing' | 'done', outcome, correct, timeMs, sent }
  // 「挑戦する」を押した時点で playing を保存するので、リロードしてもやり直せない（playing のまま開いたら、そこまでの記録で終わり）
  const KEY = 'daily';
  const today = () => K.jstDay(new Date());
  const md = day => { const [, m, d] = day.split('-'); return `${+m}月${+d}日`; };
  const mdShort = day => { const [, m, d] = day.split('-'); return `${+m}/${+d}`; };
  const STAGE = ['', '★', '★★', '★★★'];
  const MODE_LABEL = { f2n: '国旗 → 国名', n2f: '国名 → 国旗', m2f: '場所 → 国旗', f2m: '国旗 → 場所' };
  // profile.js が読めなかった（配信漏れ）ときは、ランキングは見るだけ
  const P = () => window.PROFILE ?? null;
  const qsCache = {};
  const questions = day => qsCache[day] ||= K.build(day, C);

  const rec = () => {
    const r = store.get(KEY, null);
    if (!r || typeof r !== 'object' || !K.validDay(r.day)) return null;
    return r;
  };
  const save = r => store.set(KEY, r);
  // 今日の記録（無ければ null）。前の日の記録は今日の分としては見ない
  const todayRec = () => { const r = rec(); return r && r.day === today() ? r : null; };
  // このページの id。playing の記録に入れて、どのページが遊んでいるかを見分ける（別のタブで開いても、遊んでいるタブの記録を止めない）
  const PAGE = Date.now().toString(36) + Math.floor(performance.now()).toString(36);
  // 閉じた・再読み込みしたときは index.html が pagehide で終わりにする。それでも playing のまま残った（落ちた・電源が切れた）記録は、
  // 別のページのもので、最後の正解から STALE 以上たっていたら、そこまでの記録で終わりにする
  const STALE = 30 * 60e3;
  const busyElsewhere = r => r?.status === 'playing' && r.sid !== PAGE && Date.now() - (r.beat || 0) < STALE;
  const settle = () => {
    const r = rec();
    if (r && r.status === 'playing' && r.sid !== PAGE && !busyElsewhere(r)) save({ ...r, status: 'done', outcome: 'quit' });
  };
  // サーバーが受け付けるのは今日と、0時30分までの昨日（schema.sql の daily_day_open と同じ）
  const canSend = r => {
    if (!RANKING.enabled || typeof RANKING.dailySubmit2 !== 'function' || !r || r.sent) return false;
    if (r.day === today()) return true;
    return r.day === K.addDays(today(), -1) && (86400e3 - K.msToNextDay(new Date())) < 30 * 60e3;
  };

  // ---- クイズからの知らせ ----
  document.addEventListener('drill:daily', e => {
    const d = e.detail || {}, r = rec();
    if (!r || r.sid !== d.sid) return;   // このページで始めた挑戦だけ（ほかのタブがもう終わりにしていても、遊んでいるタブの記録を残す）
    const correct = Math.max(0, Math.min(N, d.done | 0)), timeMs = Math.max(0, Math.floor(+d.timeMs || 0));
    if (d.phase === 'answer') save({ ...r, status: 'playing', correct, timeMs, beat: Date.now() });
    if (d.phase === 'end') save({ ...r, status: 'done', outcome: d.outcome, correct, timeMs });
    if (d.phase === 'end') { V.tab = 'today'; V.fresh = true; markHome(); }
  });

  // ---- 画面 ----
  const V = { tab: 'today', seq: 0, fresh: false };
  const sec = document.createElement('section');
  sec.id = 'scr-daily'; sec.className = 'wrap'; sec.hidden = true;
  sec.innerHTML = `<div class="panel daily">
    <div class="dl-head"><h2>今日の難問</h2><p class="dl-date mono" id="dl-date"></p></div>
    <div class="cols">
      <div class="col" id="dl-main"></div>
      <div class="col">
        <div class="seg" id="dl-tabs" role="group" aria-label="日付"><button type="button" data-t="today">今日</button><button type="button" data-t="yday">昨日</button></div>
        <p class="hint">上位50人まで。全問正解の人がタイム順で上、その下は正解した数が多い順（同じ数なら速い順）。</p>
        <ol class="rklist dl-list" id="dl-list" aria-busy="false"></ol>
        <p class="rkempty" id="dl-empty" hidden>まだ誰もいない。1位のチャンス！</p>
        <div class="rkerror" id="dl-error" hidden><p>ランキングに接続できなかった</p><button class="btn ghost" id="dl-retry">再読み込み</button></div>
        <div id="dl-answers"></div>
      </div>
    </div>
  </div>`;
  const wrap = document.querySelector('body > .wrap'), foot = wrap?.querySelector(':scope > footer');
  if (!wrap) return;
  if (foot) foot.before(sec); else wrap.append(sec);
  registerScreen('daily', render);

  // 問題と答えの一覧。r があれば、どこまで正解したかの印をつける。
  // upto を渡すと upto 問目まで（今日の分は、まだ挑戦していない人に答えが広まらないよう、自分がとどいた所までしか見せない）
  function answersHTML(day, title, r, upto = N) {
    const qs = questions(day).slice(0, upto);
    const li = qs.map((q, i) => {
      const c = byA.get(q.a);
      const mark = !r ? '<span></span>' : i < r.correct ? '<span class="dl-ok" aria-label="正解">○</span>' : i === r.correct && r.outcome === 'fail' ? '<span class="dl-ng" aria-label="まちがえ">×</span>' : '<span class="dl-skip" aria-label="とどかず">—</span>';
      return `<li>${mark}<span class="mono dl-no">${q.no}</span><img src="${flag(c.a)}" alt=""><b>${esc(c.n)}</b><span class="dl-mode">${MODE_LABEL[q.mode]} ${STAGE[q.stage]}</span></li>`;
    }).join('');
    const rest = upto < N ? `<p class="hint">${upto ? 'ここから先' : '問題と答え'}は、明日「昨日」のタブで見られるよ。</p>` : '';
    return `<details class="dl-ans"${r ? ' open' : ''}><summary>${title}</summary>${li ? `<ol class="dl-qs">${li}</ol>` : ''}${rest}</details>`;
  }
  // □■ でどこまで正解したか（シェア用）
  const bar = r => Array.from({ length: N }, (_, i) => i < r.correct ? '🟩' : i === r.correct && r.outcome === 'fail' ? '🟥' : '⬜').join('');

  function render() {
    settle();
    const day = today(), mine = rec();
    // 0時をまたいで遊んだ人: 昨日の記録をまだ載せられる間（0時30分まで）は、その結果を出す
    const r = todayRec() ?? (mine?.day === K.addDays(day, -1) && mine.status === 'done' && canSend(mine) ? mine : null);
    $('dl-date').textContent = md(day);
    const main = $('dl-main');
    if (busyElsewhere(r)) {
      main.innerHTML = '<p class="dl-lead">いま別のタブで挑戦中だよ。終わったら、ここに結果が出るよ。</p>';
    } else if (!r) {
      main.innerHTML = `<div class="dl-intro">
        <p class="dl-lead">毎日0時（日本時間）に新しい${N}問。<b>挑戦できるのは1日1回だけ</b>。</p>
        <ul class="dl-rules">
          <li>国旗・国名・場所の問題がまざって出る</li>
          <li>後半ほどむずかしい（似た国旗・小さい国）</li>
          <li>1問でもまちがえたら、そこまでの正解数が記録</li>
          <li>全問正解ならタイムで勝負</li>
        </ul>
        <p class="hint">「挑戦する」を押したら、とちゅうでやめても今日の挑戦は終わり。準備ができたらどうぞ。</p>
        <div class="row center"><button class="btn" id="dl-start">挑戦する</button></div>
      </div>`;
      $('dl-start').onclick = start;
    } else {
      const clear = r.correct >= N;
      const head = clear ? '全問正解！' : r.outcome === 'quit' ? 'とちゅうでやめた' : 'ここまで！';
      const big = clear ? `<span>${RANKING.formatTime(r.timeMs)}</span>` : `${r.correct}<small> / ${N} 問正解</small>`;
      main.innerHTML = `<div class="result dl-result">
        ${r.day !== day ? `<p class="hint">昨日（${md(r.day)}）の挑戦の記録。0時30分までなら載せられるよ</p>` : ''}
        <p class="qlabel">${head}</p><p class="score">${big}</p>
        ${clear ? '' : `<p class="hint">タイム ${RANKING.formatTime(r.timeMs)}</p>`}
        <p class="tarank" id="dl-rank"></p>
        ${canSend(r) ? (P() ? '<div id="dl-post"></div>' : '<p class="tamsg ng">ランキングに載せるには、ページを読み直してね</p>') : r.sent ? `<p class="tamsg ok">「${esc(r.sent.name)}」で載せたよ！</p>` : ''}
        <div class="row center"><button class="btn ghost" id="dl-share">結果をシェア</button></div>
        <p class="hint dl-next" id="dl-next"></p>
        ${r.day !== day ? '<div class="row center"><button class="btn" id="dl-start">今日の難問に挑戦する</button></div>' : ''}
      </div>${answersHTML(r.day, r.day === day ? '今日の問題と答え' : '昨日の問題と答え', r, r.day === day ? Math.min(N, r.correct + (r.outcome === 'fail' ? 1 : 0)) : N)}`;
      if ($('dl-start')) $('dl-start').onclick = start;
      $('dl-share').onclick = () => share(r);
      if (canSend(r) && P()) post(r);
      const dayWord = r.day === day ? '今日' : '昨日';
      if (RANKING.enabled && !r.sent) RANKING.dailyRankOf({ day: r.day, correct: r.correct, timeMs: r.timeMs })
        .then(n => { if (n && $('dl-rank') && !sec.hidden) $('dl-rank').textContent = `${dayWord}${n}位 相当`; }, e => console.warn('daily rankOf', e));
      if (r.sent?.rank) $('dl-rank').textContent = `${dayWord}${r.sent.rank}位（載せたとき）`;
      tickNext();
      if (V.fresh) { V.fresh = false; if (clear) window.SND?.play?.('perfect'); }
    }
    for (const b of $('dl-tabs').children) b.setAttribute('aria-pressed', String(b.dataset.t === V.tab));
    $('dl-list').parentElement.hidden = !RANKING.enabled;
    load();
  }
  // 明日までの残り時間（この画面を見ている間だけ1分ごとに更新）
  let nextTimer = 0;
  function tickNext() {
    clearTimeout(nextTimer);
    const el = $('dl-next');
    if (!el || sec.hidden) return;
    const ms = K.msToNextDay(new Date()), h = Math.floor(ms / 3600e3), m = Math.floor(ms % 3600e3 / 60e3);
    el.textContent = `次の問題まで あと${h}時間${m}分`;
    // 日付が変わったら、挑戦前の画面にする
    if (ms < 60e3) nextTimer = setTimeout(() => { if (!sec.hidden) render(); }, ms + 500);
    else nextTimer = setTimeout(tickNext, 60e3);
  }

  function start() {
    const day = today();
    if (todayRec()) return render();
    const sid = `daily-${PAGE}-${Date.now().toString(36)}`;
    save({ day, sid, status: 'playing', outcome: null, correct: 0, timeMs: 0, sent: null, beat: Date.now() });
    markHome();
    startDaily(questions(day), sid);
  }

  // 結果の「載せる」箱（profile.js の postBox）。プロフィールがあって自動 ON なら、出したときにすぐ送る。
  // 送っている途中に画面を開き直すと新しい箱ができる（r.sent はまだ無い）ので、同じ日・同じ合言葉の送信は posting の返事を待って同じ答えにする（二重に送らない）
  let posting = null;   // { day, token, done: Promise }
  function post(r) {
    P().postBox($('dl-post'), { label: 'ランキングに載せる？', send: token => {
      if (posting?.day === r.day && posting.token === token) return posting.done;
      const done = sendDaily(r, token).finally(() => { if (posting?.done === done) posting = null; });
      posting = { day: r.day, token, done };
      return done;
    } });
  }
  async function sendDaily(r, token) {
    const dayWord = r.day === today() ? '今日' : '昨日';
    const res = await RANKING.dailySubmit2({ token, day: r.day, correct: r.correct, total: N, timeMs: r.timeMs });
    // 前に送ったときに載っていて、返事だけ届かなかった（1日1回なので2回目は already）: 載せたことにする
    if (!res.ok && res.reason !== 'already') return res;
    const name = P().get()?.name ?? '', rank = res.ok ? res.rank : null;
    const now = rec();
    if (now?.day === r.day) save({ ...now, sent: { name, rank } });
    // 箱の外（順位・表）だけ新しくする。箱は postBox が「載せたよ」に描きかえる
    if (!sec.hidden) {
      if (rank && $('dl-rank')) $('dl-rank').textContent = `${dayWord}${rank}位`;
      V.tab = r.day === today() ? 'today' : 'yday';
      for (const b of $('dl-tabs').children) b.setAttribute('aria-pressed', String(b.dataset.t === V.tab));
      load();
    }
    return { ok: true, text: res.ok ? `「${name}」で載せたよ！${rank ? ` ${dayWord}${rank}位` : ''}` : RANKING.message('already') };
  }
  // 画面を離れたら箱を外す（隠れた箱が、あとでプロフィールを作った・自動を ON にしたときに載せないままにした記録を送らないように。
  // postBox は箱が DOM から外れると聞くのをやめる。開き直せば render が作り直す）
  document.addEventListener('drill:screen', e => { if (e.detail?.name !== 'daily') $('dl-post')?.remove(); });

  function share(r) {
    const text = `国旗マスター 今日の難問 ${mdShort(r.day)}\n${bar(r)}\n${r.correct >= N ? `全問正解！ ${RANKING.formatTime(r.timeMs)}` : `${r.correct} / ${N} 問正解`}\n#国旗マスター`;
    const url = location.origin + location.pathname;
    const copied = () => { const b = $('dl-share'); if (b) { b.textContent = 'コピーしたよ'; setTimeout(() => { if ($('dl-share')) $('dl-share').textContent = '結果をシェア'; }, 2000); } };
    if (typeof navigator.share === 'function') {
      try { Promise.resolve(navigator.share({ text, url })).catch(() => {}); } catch {}
    } else navigator.clipboard?.writeText(`${text}\n${url}`).then(copied, () => {});
  }

  // ランキングの表。返事が前後しても、最後に頼んだ表だけを出す
  async function load() {
    if (!RANKING.enabled) return;
    const seq = ++V.seq, list = $('dl-list');
    const day = V.tab === 'today' ? today() : K.addDays(today(), -1);
    // 昨日の問題と答え（昨日のタブのときだけ。昨日の自分の記録があれば印もつける）
    const r = rec();
    $('dl-answers').innerHTML = V.tab === 'yday' ? answersHTML(day, `昨日（${md(day)}）の問題と答え`, r?.day === day && r.status === 'done' ? r : null) : '';
    list.setAttribute('aria-busy', true); $('dl-retry').disabled = true;
    let rows = null;
    try { rows = await RANKING.dailyTop2({ day }); } catch (e) { console.warn('daily top', e); }
    if (seq !== V.seq) return;
    list.setAttribute('aria-busy', false); $('dl-retry').disabled = false;
    $('dl-error').hidden = !!rows;
    $('dl-empty').hidden = !rows || rows.length > 0;
    // 自分の行は pid で見分ける（名前は変えられるので）
    const me = P()?.get()?.pid ?? null;
    let no = 0;
    list.innerHTML = (rows ?? []).map((x, i) => {
      const p = rows[i - 1];
      if (!i || x.correct !== p.correct || x.timeMs !== p.timeMs) no = i + 1;   // 同じ記録は同じ順位（daily_rank_of とそろえる）
      const score = x.correct >= x.total ? '<b class="dl-all">全問正解</b>' : `<b>${x.correct}問</b>`;
      const nick = P() ? P().nameHTML(x) : esc(x.nickname);
      return `<li class="${no <= 3 ? 'top' : ''}${me && x.pid === me ? ' me' : ''}"><span class="no">${no}</span><span class="nick">${nick}</span>${score}<span class="mono">${RANKING.formatTime(x.timeMs)}</span></li>`;
    }).join('');
  }

  $('dl-tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; V.tab = b.dataset.t; for (const x of $('dl-tabs').children) x.setAttribute('aria-pressed', String(x === b)); load(); };
  $('dl-retry').onclick = () => load();

  // ---- ホームの入口。メニューのボタンとは別の、プレイの上の細い帯（ボタンの並びを変えない）。今日まだなら「NEW」 ----
  const row = document.createElement('div'), hb = document.createElement('button');
  row.className = 'dl-homerow';
  hb.type = 'button'; hb.className = 'dl-homebtn'; hb.id = 'home-daily';
  hb.onclick = () => { V.tab = 'today'; show('daily'); };
  row.append(hb);
  $('home-play')?.before(row);
  function markHome() {
    const done = !!todayRec();
    hb.innerHTML = `<span aria-hidden="true">📅</span>今日の難問<span class="mono dl-homeday">${mdShort(today())}</span>${done ? '<span class="dl-homedone">挑戦ずみ</span>' : '<span class="dl-new">NEW</span>'}`;
  }
  markHome();
  document.addEventListener('drill:screen', e => { if (e.detail?.name === 'home') markHome(); });
  settle();
  // 直リンク（index.html の起動処理は #daily を知らないので、画面を作ったあとでここから開く。管理ページの D11 から）
  if (location.hash === '#daily') { V.tab = 'today'; show('daily'); }

  window.DAILY = { questions, today, rec };
})();
