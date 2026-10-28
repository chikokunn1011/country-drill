(() => {
  'use strict';
  // サイト共通のプロフィール（window.PROFILE）: 端末ごとに1つ。合言葉（token、端末で作る UUID）で本人確認して、タイムアタック・今日の難問・冒険のランキングに載せる。
  // サーバー側は supabase/schema.sql の profiles と profile_create / profile_me / profile_rename / profile_set（ranking.js の RANKING.profile*）。
  // ここが持つもの: localStorage の profile・プロフィール画面（#scr-profile）・結果画面の「載せる」箱（postBox）・称号やバッジの数の同期・rpgRank からの引っ越し・
  // ランキングの名前のセル（nameHTML）とプロフィールの窓（openCard、<dialog id="pf-card">）。
  // index.html のインライン script の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）

  const NEED = {
    store: typeof store, $: typeof $, esc: typeof esc, show: typeof show, toast: typeof toast, emit: typeof emit,
    registerScreen: typeof registerScreen, byA: typeof byA, flag: typeof flag, MODES: typeof MODES, RANKING: typeof RANKING,
  };
  const missing = Object.keys(NEED).filter(k => NEED[k] === 'undefined');
  if (missing.length) { console.error(`[profile] 必要なものが読み込めなかったので、プロフィールはお休み: ${missing.join(' ')}`); return; }
  // 接続先が無い・古い ranking.js がキャッシュに残っているときは出さない（ホームの［プロフィール］も隠れたまま）
  if (!RANKING.enabled || typeof RANKING.profileCreate !== 'function') return;

  // localStorage の profile: { token, pid, name, auto, isPublic, sent: { isPublic, title, deco, badges, badgesTotal } }
  // sent は最後にサーバーへ送った公開・称号・かざり・バッジの数（無い項目 = まだ送っていない）。
  // 作るときの合言葉は送る前に profilePending に覚え、返事が届かなかったら同じ合言葉でやり直す（2つ作らないように）
  const KEY = 'profile', PENDING = 'profilePending', WAIT = 1500;
  const valid = p => !!p && typeof p === 'object' && typeof p.token === 'string' && !!p.token && typeof p.pid === 'string' && typeof p.name === 'string';
  // 毎回 localStorage から読む（ほかのタブが書きかえていても、古いものの上に書かない）
  const read = () => { const p = store.get(KEY, null); return valid(p) ? p : null; };
  const drop = k => { try { localStorage.removeItem(k); } catch {} };
  // いまのプロフィールに patch を足して保存。token がちがう（別のタブで作り直した・引き継いだ）ときは書かない
  const update = (token, patch) => {
    const p = read();
    if (!p || p.token !== token) return null;
    const next = { ...p, ...patch };
    store.set(KEY, next);
    return next;
  };
  const view = p => p ? { token: p.token, pid: p.pid, name: p.name, auto: p.auto !== false, isPublic: p.isPublic !== false } : null;
  const get = () => view(read());
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  let last = get();   // 最後に知らせたプロフィール（storage イベントで変わったか見る）
  const changed = () => { last = get(); emit('profile:change', { profile: last }); redraw(); };
  const newToken = () => crypto.randomUUID?.() ?? ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));

  // ---- 作る・名前を変える・スイッチ ----
  let creating = null;   // 作っている途中の Promise（連打・2つの箱から同時に押しても1回だけ送る）
  const create = name => creating ??= (async () => {
    if (read()) return { ok: true };
    const chk = RANKING.checkName(name);
    if (!chk.ok) return chk;
    const pending = store.get(PENDING, null), token = typeof pending === 'string' && pending ? pending : newToken();
    store.set(PENDING, token);
    let r = await RANKING.profileCreate({ token, nickname: chk.name });
    // 前に送った作成が通っていた（返事だけ届かなかった）: 同じ合言葉のプロフィールを読みなおす
    if (!r.ok && r.reason === 'already') {
      const me = await RANKING.profileMe({ token });
      r = me.ok ? { ok: true, pid: me.pid, nickname: me.nickname, isPublic: me.isPublic, title: me.title, deco: me.deco } : me;
    }
    if (!r.ok) return { ok: false, reason: r.reason };
    const isPublic = r.isPublic ?? true, sent = { isPublic };
    if (r.title !== undefined) Object.assign(sent, { title: r.title, deco: r.deco });
    if (read()) return { ok: true };   // 待っているあいだにほかのタブで作られていたら、そちらを使う
    store.set(KEY, { token, pid: r.pid, name: r.nickname, auto: true, isPublic, sent });
    drop(PENDING);
    store.set('nickname', r.nickname);   // 冒険の旅人カードなどは nickname を読む
    changed();
    scheduleSync();
    return { ok: true };
  })().finally(() => { creating = null; });

  const rename = async name => {
    const p = read();
    if (!p) return { ok: false, reason: 'not_found' };
    const chk = RANKING.checkName(name);
    if (!chk.ok) return chk;
    const r = await RANKING.profileRename({ token: p.token, nickname: chk.name });
    if (!r.ok) { if (r.reason === 'not_found') lost(); return { ok: false, reason: r.reason }; }
    if (!update(p.token, { name: r.nickname })) return { ok: false, reason: 'not_found' };
    store.set('nickname', r.nickname);
    changed();
    return { ok: true };
  };
  // 自動の ON/OFF も profile:change で知らせる（rpg-rank.js が auto() を見て自動で送るかを決める）。変わらないときは知らせない
  const setAuto = on => { const p = read(); if (p && (p.auto !== false) !== !!on && update(p.token, { auto: !!on })) changed(); };
  // 公開はサーバーにも送る（すぐ。失敗したら次のきっかけでまた送る）
  const setPublic = on => { const p = read(); if (p && update(p.token, { isPublic: !!on })) { last = get(); redraw(); sync(); } };

  // サーバーが not_found を返した（別の端末に引き継がれた・消された）: プロフィールを消して1回だけ知らせる。端末のゲームのデータはそのまま
  const lost = () => {
    if (!read()) return;
    drop(KEY);
    toast('このプロフィールは別の端末に引き継がれたよ', 5000);
    changed();
  };

  // ---- 称号・かざり・バッジの数・公開の同期 ----
  // いまの値（読めないもの = undefined は送らない）。かざりは冒険のセーブの deco のうち持っている仲間の国だけ（rpg-rank.js と同じしぼり方）で、重なりは1つに
  const want = p => {
    const w = { isPublic: p.isPublic !== false };
    const B = window.BADGES;
    if (typeof B?.title === 'function') {
      try { const c = B.count(); Object.assign(w, { title: B.title(), badges: c.got, badgesTotal: c.total }); } catch (e) { console.warn('[profile] badges', e); }
    }
    const d = typeof window.RPG?.get === 'function' ? window.RPG.get() : null;
    if (d) w.deco = [...new Set(Array.isArray(d.deco) ? d.deco : [])].filter(a => byA.has(a) && d.cards?.[a]).slice(0, 3);
    return w;
  };
  // sent とちがう項目だけ
  const diff = p => {
    const w = want(p), sent = p.sent ?? {}, out = {};
    for (const [k, v] of Object.entries(w)) if (!same(v, sent[k])) out[k] = v;
    return out;
  };
  let syncTimer = null, syncing = false;
  // 少し待ってから送る（続けて変わったら1回にまとめる）
  const scheduleSync = () => {
    const p = read();
    if (!p || !Object.keys(diff(p)).length) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, WAIT);
  };
  const sync = async () => {
    clearTimeout(syncTimer); syncTimer = null;
    const p = read();
    if (!p) return;
    if (syncing) { scheduleSync(); return; }
    const d = diff(p);
    if (!Object.keys(d).length) return;
    syncing = true;
    let r = await RANKING.profileSet({ token: p.token, ...d });
    // 称号・かざり・バッジの数のどれかが断られた（bad_deco・bad_record など）: 公開の切りかえだけは届くように、それだけ送り直す
    if (!r.ok && r.reason !== 'network' && r.reason !== 'not_found' && 'isPublic' in d && Object.keys(d).length > 1) {
      console.warn('[profile] profile_set', r.reason);
      const only = { isPublic: d.isPublic };
      r = await RANKING.profileSet({ token: p.token, ...only });
      if (r.ok) { const now = read(); if (now?.token === p.token) update(p.token, { sent: { ...now.sent, ...only } }); }
      syncing = false;
      if (r.reason === 'not_found') lost();
      else if (!r.ok) console.warn('[profile] profile_set', r.reason);
      return;   // 断られたほうは次のきっかけまで待つ
    }
    syncing = false;
    if (r.ok) {
      const now = read();
      if (now?.token === p.token) update(p.token, { sent: { ...now.sent, ...d } });
      scheduleSync();   // 送っているあいだにまた変わっていたら
    } else if (r.reason === 'not_found') lost();
    else console.warn('[profile] profile_set', r.reason);   // つながらない・断られたら、次のきっかけまで待つ
  };
  for (const type of ['badge:title', 'badge:earned', 'rpg:deco']) document.addEventListener(type, scheduleSync);

  // ---- 結果画面の「載せる」箱 ----
  // send(token) は Promise<{ ok, reason?, text? }>（text は載せたときの文）。プロフィールがあって自動 ON ならすぐ送る、自動 OFF なら［載せる］、
  // 無ければ名前の入力と［プロフィールを作って載せる］。失敗はわけと［もう一回送る］。not_found ならプロフィールを消して描き直す
  const postBox = (el, { label = 'ランキングに載せる？', send }) => {
    // state: idle（まだ）・busy（作っている・送っている）・fail（失敗。msg にわけ）・done（載せた。msg に文）
    const st = { state: 'idle', msg: '', input: null };
    const say = (text, cls = '') => { st.msg = text; st.cls = cls; };
    const draw = () => {
      const p = get(), m = `<p class="tamsg ${st.cls ?? ''}" role="status">${esc(st.msg)}</p>`;
      if (st.state === 'done' || st.state === 'busy') { el.innerHTML = `<div class="tabox pf-post">${m}</div>`; return; }
      if (st.state === 'fail' && p) {
        el.innerHTML = `<div class="tabox pf-post">${m}<button type="button" class="btn" data-pf="retry">もう一回送る</button></div>`;
        return;
      }
      if (!p) {
        const v = st.input ?? store.get('nickname', '');
        el.innerHTML = `<div class="tabox pf-post"><form class="field" novalidate><label>${esc(label)}</label>`
          + `<div class="row"><input type="text" autocomplete="nickname" enterkeyhint="send" placeholder="ニックネーム（12文字まで）" aria-label="ニックネーム" value="${esc(v)}">`
          + '<button class="btn">プロフィールを作って載せる</button></div></form>'
          + `${m}<p class="hint">名前でプロフィールを作ると、これからの記録は自動でランキングに載るよ</p></div>`;
        return;
      }
      if (p.auto && st.state === 'idle') { go(); return; }
      el.innerHTML = `<div class="tabox pf-post"><p class="pf-post-q">${esc(label)}</p>`
        + `<button type="button" class="btn" data-pf="send">${esc(p.name)} で載せる</button>${m}</div>`;
    };
    const go = async () => {
      const p = get();
      if (!p || st.state === 'busy') return;
      st.state = 'busy'; say('送信中…'); draw();
      let r;
      try { r = await send(p.token); } catch (e) { console.warn('[profile] send', e); r = { ok: false, reason: 'network' }; }
      if (r.ok) { st.state = 'done'; say(r.text ?? '載せたよ！', 'ok'); draw(); return; }
      if (r.reason === 'not_found') { st.state = 'idle'; say(''); lost(); draw(); return; }   // lost が描き直しを呼ぶが、箱は自分で
      st.state = 'fail'; say(RANKING.message(r.reason), 'ng'); draw();
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-pf]');
      if (b && (b.dataset.pf === 'retry' || b.dataset.pf === 'send')) go();
    });
    el.addEventListener('input', e => { if (e.target.matches('input')) st.input = e.target.value; });
    el.addEventListener('submit', async e => {
      e.preventDefault();
      if (st.state === 'busy') return;
      st.state = 'busy'; say('送信中…'); draw();
      const r = await create(st.input ?? store.get('nickname', ''));
      if (!r.ok) { st.state = 'idle'; say(RANKING.message(r.reason), 'ng'); draw(); el.querySelector('input')?.focus(); return; }
      st.state = 'idle';
      go();
    });
    // ほかのタブでプロフィールを作った・消えたら描き直す（箱が画面から外れたら聞くのをやめる）
    const onChange = () => {
      if (!el.isConnected) { document.removeEventListener('profile:change', onChange); return; }
      if (st.state === 'idle' || st.state === 'fail') draw();
    };
    document.addEventListener('profile:change', onChange);
    draw();
    return { retry: go };
  };

  // ---- 画面（#scr-profile） ----
  const sec = document.createElement('section');
  sec.id = 'scr-profile'; sec.className = 'wrap narrow'; sec.hidden = true;
  sec.innerHTML = `<div class="panel pf">
    <h2>プロフィール</h2>
    <div class="pf-main" id="pf-main"></div>
    <div id="pf-transfer"></div>
    <div class="row end"><button class="btn" id="pf-done">ホームへ</button></div>
  </div>`;
  ($('scr-ranking') ?? $('scr-home')).after(sec);
  // ---- ランキングの名前のセル・プロフィールのカード ----
  // かざり: 知っている国だけ、重なりは1つにして3つまで（rpg-rank.js と同じ見た目・クラス）
  const decoHTML = as => {
    const imgs = [...new Set(Array.isArray(as) ? as : [])].filter(a => byA.has(a)).slice(0, 3)
      .map(a => { const nm = esc(byA.get(a).n); return `<img src="${flag(a)}" alt="${nm}" title="${nm}">`; }).join('');
    return imgs ? `<span class="rr-deco">${imgs}</span>` : '';
  };
  // ランキングの <span class="nick"> の中身。pid があれば押すとプロフィールの窓が開くボタン、古い記録（pid なし）は文字だけ
  const nameHTML = ({ nickname, pid, deco } = {}) => {
    const nm = esc(nickname ?? '');
    return (pid ? `<button type="button" class="pf-name" data-pid="${esc(pid)}">${nm}</button>` : nm) + decoHTML(deco);
  };
  // TA の board（'f2n:asia:10'）→「国旗→国名・アジア・10問」。地域は ranking.js の REGION_KEY の逆
  const REGION_NAME = { asia: 'アジア', europe: 'ヨーロッパ', africa: 'アフリカ', namerica: '北・中央アメリカ', samerica: '南アメリカ', oceania: 'オセアニア' };
  const boardLabel = board => {
    const [m, r, c] = String(board).split(':');
    const mode = MODES.find(x => x.k === m)?.label.replace(/\s+/g, '') ?? m;
    return `${mode}・${r === 'all' ? '全世界' : REGION_NAME[r] ?? r}・${c === 'all' ? '全部' : `${c}問`}`;
  };
  // 日本時間の日付（2026/10/28）
  const jstDate = d => { const j = new Date(d.getTime() + 9 * 3600e3); return `${j.getUTCFullYear()}/${j.getUTCMonth() + 1}/${j.getUTCDate()}`; };
  // カードの中身（RANKING.profileCard の返事の形）。非公開は名前・かざり・ひとことだけ。無い項目（自分のカードの読みこみ前の TA など）は出さない
  const cardHTML = card => {
    const head = `<p class="pf-card-name"><b>${esc(card.nickname ?? '')}</b>${decoHTML(card.deco)}</p>`;
    if (card.private) return `<div class="pf-card">${head}<p class="hint">このプロフィールは非公開だよ</p></div>`;
    const line = s => `<p class="pf-card-line">${s}</p>`, dg = globalThis.RPG_CORE?.DUNGEONS?.length ?? 21;
    let h = head + (card.title ? `<p class="pf-card-title">〈${esc(card.title)}〉</p>` : '');
    if (card.badges != null) h += line(`バッジ ${card.badges}個（全${card.badgesTotal ?? 0}個中）`);
    if (card.rpg) h += line(`冒険 Lv${card.rpg.lv}・ダンジョン${card.rpg.dungeons}/${dg}`);
    if (card.ta?.length) {
      h += '<p class="pf-card-sub">タイムアタック</p><ul class="pf-card-ta">'
        + card.ta.map(t => `<li><span>${esc(boardLabel(t.board))}</span> <span class="mono">${RANKING.formatTime(t.timeMs)}（${t.rank}位）</span></li>`).join('') + '</ul>';
    }
    if (card.daily) h += line(`今日の難問 参加${card.daily.plays}回（うち全問正解${card.daily.perfect}回）`);
    if (card.since instanceof Date && !isNaN(card.since)) h += `<p class="hint">はじめた日 ${jstDate(card.since)}</p>`;
    return `<div class="pf-card">${h}</div>`;
  };

  // ---- プロフィールの窓（<dialog id="pf-card">。body に1つ） ----
  let dlg = null, opening = 0;   // opening: 開いた回数（前に開いた分の返事が後から届いても描かない）
  const dialog = () => {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'pf-card'; dlg.setAttribute('aria-label', 'プロフィール');
    dlg.innerHTML = '<div class="inner"><button type="button" class="close" data-pfc="close">閉じる</button><div class="pf-card-body" role="status"></div></div>';
    dlg.addEventListener('click', e => {
      if (e.target === dlg || e.target.closest('[data-pfc="close"]')) dlg.close();
      else if (e.target.closest('[data-pfc="reload"]')) openCard(dlg.dataset.pid);
    });
    document.body.append(dlg);
    return dlg;
  };
  const openCard = async pid => {
    const d = dialog(), body = d.querySelector('.pf-card-body'), n = ++opening;
    d.dataset.pid = pid;
    body.innerHTML = '<p class="hint">読みこみ中…</p>';
    if (!d.open) d.showModal();
    let r;
    try { r = await RANKING.profileCard({ pid }); } catch (e) { console.warn('[profile] profile_card', e); r = { ok: false, reason: 'network' }; }
    if (n !== opening) return;
    body.innerHTML = r.ok ? cardHTML(r)
      : '<div class="pf-card-err"><p>読みこめなかった</p><button type="button" class="btn ghost" data-pfc="reload">再読み込み</button></div>';
  };
  // ランキングの名前のボタン（3つのランキングで共通）は、ここで1つだけ受ける
  document.addEventListener('click', e => {
    const b = e.target.closest?.('.pf-name');
    if (b?.dataset.pid) openCard(b.dataset.pid);
  });

  // 自分のカード: 手元の名前・称号・かざり・バッジの数ですぐ描き、サーバーのカード（TA・今日の難問・冒険の記録）が届いたら足して描き直す。
  // 称号などは同期の前でも手元のほうが新しいので手元を使う。非公開のときサーバーは記録を返さないので、手元の分だけ
  const myCard = (p, server) => {
    const w = want(p);
    return { ...(server && !server.private ? server : {}), private: false, nickname: p.name, title: w.title ?? server?.title ?? '', deco: w.deco ?? server?.deco ?? [],
      badges: w.badges ?? server?.badges, badgesTotal: w.badgesTotal ?? server?.badgesTotal };
  };
  let meLoading = 0;
  const loadMe = async p => {
    const n = ++meLoading;
    let r;
    try { r = await RANKING.profileCard({ pid: p.pid }); } catch { return; }   // つながらなければ手元の分のまま
    const box = $('pf-me'), now = read();
    if (n !== meLoading || !r.ok || !box || now?.token !== p.token) return;
    box.innerHTML = cardHTML(myCard(now, r));
  };
  // 冒険を始めていて、冒険を隠していなければ［冒険でかざりを選ぶ］
  const canDeco = () => { const d = typeof window.RPG?.get === 'function' ? window.RPG.get() : null; return !!d?.intro && d.show !== false && typeof RPG.open === 'function'; };
  const field = (lbl, body) => `<div class="field"><span class="lbl">${lbl}</span>${body}</div>`;
  function render() {
    const p = read(), main = $('pf-main');
    if (!p) {
      main.innerHTML = '<p class="pf-lead">プロフィールを作ると、タイムアタック・今日の難問・冒険のランキングにこの名前で載るよ。</p>'
        + field('<label for="pf-name">プロフィールを作る</label>', '<form class="pf-form" id="pf-form" novalidate><div class="row">'
          + '<input id="pf-name" type="text" autocomplete="nickname" enterkeyhint="done" placeholder="ニックネーム（12文字まで）">'
          + '<button class="btn" id="pf-create">作る</button></div></form><p class="tamsg" id="pf-msg" role="status"></p>'
          + '<p class="hint">ほかの人と同じニックネームは使えないよ。名前はあとから変えられる</p>');
      $('pf-name').value = store.get('nickname', '');
      $('pf-form').onsubmit = async e => {
        e.preventDefault();
        const btn = $('pf-create'), msg = $('pf-msg');
        btn.disabled = true; msg.className = 'tamsg'; msg.textContent = '送信中…';
        const r = await create($('pf-name').value);
        if (r.ok) return;   // changed() が描き直す
        btn.disabled = false; msg.className = 'tamsg ng'; msg.textContent = RANKING.message(r.reason);
      };
      return;
    }
    main.innerHTML = `<div id="pf-me">${cardHTML(myCard(p))}</div>`
      + field('<label for="pf-rename-in">名前を変える</label>', '<form class="pf-form" id="pf-rename-form" novalidate><div class="row">'
        + '<input id="pf-rename-in" type="text" autocomplete="nickname" enterkeyhint="done">'
        + '<button class="btn ghost" id="pf-rename">変える</button></div></form><p class="tamsg" id="pf-rename-msg" role="status"></p>'
        + '<p class="hint">ランキングの名前は、前の記録もふくめて新しい名前になるよ</p>')
      + field('かざり', '<p class="hint">冒険の仲間の国旗を3つまで、名前の横にかざれるよ</p>'
        + (canDeco() ? '<button type="button" class="linkbtn pf-deco" id="pf-deco">冒険でかざりを選ぶ</button>' : ''))
      + field('設定', '<label class="switch"><input type="checkbox" id="pf-public"> プロフィールを公開する</label>'
        + '<p class="hint">オフにすると、ランキングで名前を押した人には名前とかざりだけ見えるよ</p>'
        + '<label class="switch"><input type="checkbox" id="pf-auto"> 記録をランキングに自動で載せる</label>'
        + '<p class="hint">オフにすると、結果画面の［載せる］を押したときだけ載るよ</p>');
    loadMe(p);
    $('pf-rename-in').value = p.name;
    $('pf-public').checked = p.isPublic !== false;
    $('pf-auto').checked = p.auto !== false;
    $('pf-public').onchange = e => setPublic(e.target.checked);
    $('pf-auto').onchange = e => setAuto(e.target.checked);
    if ($('pf-deco')) $('pf-deco').onclick = () => RPG.open('rpg');
    $('pf-rename-form').onsubmit = async e => {
      e.preventDefault();
      const btn = $('pf-rename'), msg = $('pf-rename-msg');
      btn.disabled = true; msg.className = 'tamsg'; msg.textContent = '送信中…';
      const r = await rename($('pf-rename-in').value);
      if (r.ok) { $('pf-rename-msg').className = 'tamsg ok'; $('pf-rename-msg').textContent = '名前を変えたよ'; return; }
      btn.disabled = false; msg.className = 'tamsg ng'; msg.textContent = RANKING.message(r.reason);
    };
  }
  // プロフィール画面が出ているときだけ描き直す（入力の途中で消さないよう、プロフィールの有る無しか名前が変わったとき）
  function redraw() { if (!sec.hidden) render(); }
  registerScreen('profile', render);
  $('pf-done').onclick = () => show('home');
  const hb = $('home-profile');
  if (hb) { hb.hidden = false; hb.onclick = () => show('profile'); }

  // ---- ほかのタブで変わった ----
  window.addEventListener('storage', e => {
    if (e.key !== KEY && e.key !== null) return;
    const now = get();
    if (same(now, last)) return;   // sent だけ変わった（同期）なら知らせない
    changed();
  });

  // ---- 起動時: rpgRank（冒険のランキングに登録ずみの前の版）からの引っ越しと、同期 ----
  // rpgRank の合言葉は、サーバーで同じ合言葉のプロフィールになっている。通れば profile にして rpgRank を消す。
  // not_found なら rpgRank を消すだけ、つながらなければ次の起動でまた試す
  const migrate = async () => {
    if (read()) return;
    const old = store.get('rpgRank', null);
    if (!old || typeof old.token !== 'string' || !old.token) return;
    const me = await RANKING.profileMe({ token: old.token });
    if (me.ok) {
      if (!read()) {
        store.set(KEY, { token: old.token, pid: me.pid, name: me.nickname, auto: true, isPublic: me.isPublic !== false,
          sent: { isPublic: me.isPublic !== false, title: me.title, deco: me.deco } });
        store.set('nickname', me.nickname);
      }
      drop('rpgRank');
      changed();
    } else if (me.reason === 'not_found') drop('rpgRank');
  };
  const ready = migrate().catch(e => console.warn('[profile] migrate', e));
  // badges.js・rpg.js はこの後に読むので、全部読み終わってから比べる
  const boot = () => ready.then(scheduleSync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.PROFILE = { get, create, rename, setAuto, setPublic, auto: () => !!get()?.auto, lost, postBox, nameHTML, cardHTML, openCard, ready };
})();
