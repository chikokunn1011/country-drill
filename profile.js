(() => {
  'use strict';
  // サイト共通のプロフィール（window.PROFILE）: 端末ごとに1つ。合言葉（token、端末で作る UUID）で本人確認して、タイムアタック・今日の難問・冒険のランキングに載せる。
  // サーバー側は supabase/schema.sql の profiles と profile_create / profile_me / profile_rename / profile_set（ranking.js の RANKING.profile*）。
  // ここが持つもの: localStorage の profile・プロフィール画面（#scr-profile）・結果画面の「載せる」箱（postBox）・称号やバッジの数の同期・rpgRank からの引っ越し・
  // ランキングの名前のセル（nameHTML）とプロフィールの窓（openCard、<dialog id="pf-card">）・引き継ぎ（データを預けてコードを出す・コードを入れて受け取る）。
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
    if (!r.ok) { if (r.reason === 'not_found') lost(p.token); return { ok: false, reason: r.reason }; }
    if (!update(p.token, { name: r.nickname })) return { ok: false, reason: 'not_found' };
    store.set('nickname', r.nickname);
    changed();
    return { ok: true };
  };
  // 自動の ON/OFF も profile:change で知らせる（rpg-rank.js が auto() を見て自動で送るかを決める）。変わらないときは知らせない
  const setAuto = on => { const p = read(); if (p && (p.auto !== false) !== !!on && update(p.token, { auto: !!on })) changed(); };
  // 公開はサーバーにも送る（すぐ。失敗したら次のきっかけでまた送る）
  const setPublic = on => { const p = read(); if (p && update(p.token, { isPublic: !!on })) { last = get(); redraw(); sync(); } };

  // サーバーが not_found を返した（別の端末に引き継がれた・消された）: プロフィールを消して1回だけ知らせる。端末のゲームのデータはそのまま。
  // token は not_found をもらった合言葉。いまのプロフィールがそれでなければ消さない（古い合言葉の返事が、引き継いだばかりのプロフィールを消さないように）。
  // 引数なしは、いまのプロフィールを消す（前からの呼び方）
  const lost = token => {
    const p = read();
    if (!p || (token !== undefined && p.token !== token)) return;
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
      if (r.reason === 'not_found') lost(p.token);
      else if (!r.ok) console.warn('[profile] profile_set', r.reason);
      return;   // 断られたほうは次のきっかけまで待つ
    }
    syncing = false;
    if (r.ok) {
      const now = read();
      if (now?.token === p.token) update(p.token, { sent: { ...now.sent, ...d } });
      scheduleSync();   // 送っているあいだにまた変わっていたら
    } else if (r.reason === 'not_found') lost(p.token);
    else console.warn('[profile] profile_set', r.reason);   // つながらない・断られたら、次のきっかけまで待つ
  };
  for (const type of ['badge:title', 'badge:earned', 'rpg:deco']) document.addEventListener(type, scheduleSync);

  // ---- 引き継ぎ ----
  // 預けるキー（同じ github.io のほかのサイトのデータを持っていかないよう、全部ではなくこの一覧）と、預けないキー（端末ごとのもの）。
  // localStorage のキーを足したらどちらかに入れる（tests/unit/transfer-keys.test.mjs がコードの中のキーと文字で比べる）
  const TRANSFER_KEYS = ['settings', 'setup', 'misses', 'nickname', 'rpg', 'badges', 'daily', 'bdgcat', 'bview'];
  const LOCAL_KEYS = ['profile', 'profilePending', 'rpgRank', 'rpgRankPending', 'rpgRankDel', 'rpgSent', 'rpgUnreg', 'transferBackup', 'transferPending', 'badges-broken'];
  const rawGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  // { v: 1, keys: { キー: 中身の文字列 }, profile: { auto, isPublic } }。keys は一覧のキーで、この端末にあるものだけ（JSON にせず生の文字列のまま）。
  // profile は自動で載せる・公開の設定（profile キーは預けないので、ここだけ持っていく。無い古いデータでも読めるよう v は 1 のまま）
  const pack = () => {
    const keys = {}, p = read();
    for (const k of TRANSFER_KEYS) { const v = rawGet(k); if (typeof v === 'string') keys[k] = v; }
    return p ? { v: 1, keys, profile: { auto: p.auto !== false, isPublic: p.isPublic !== false } } : { v: 1, keys };
  };
  // 受け取ったデータを書き戻す。一覧のキーの文字列だけ（一覧に無いキー・文字列でない値は無視）。一覧のキーで data に無いもの（前の端末に無かった）は消す。
  // 書く前に、いまの一覧のキーの値を transferBackup に1つだけ退避する。v や形がちがえば何もしないで false
  const unpack = data => {
    const keys = data?.keys;
    if (!data || typeof data !== 'object' || data.v !== 1 || !keys || typeof keys !== 'object' || Array.isArray(keys)) return false;
    const backup = {};
    for (const k of TRANSFER_KEYS) { const v = rawGet(k); if (v != null) backup[k] = v; }
    store.set('transferBackup', { at: Date.now(), keys: backup });
    for (const k of TRANSFER_KEYS) {
      if (!Object.hasOwn(keys, k)) { drop(k); continue; }
      if (typeof keys[k] !== 'string') continue;
      try { localStorage.setItem(k, keys[k]); } catch (e) { console.warn('[profile] unpack', k, e); }
    }
    return true;
  };
  // コードは12文字（0/O/1/I なし）。表示は XXXX-XXXX-XXXX、入力は全角・小文字・ハイフン・空白まじりでもよい（ranking.js の transferClaim と同じそろえ方）
  const normCode = c => String(c ?? '').normalize('NFKC').replace(/[\s\-\u2010-\u2015\u2212\u30fc]/g, '').toUpperCase();
  const codeOk = c => /^[A-HJ-NP-Z2-9]{12}$/.test(c);
  // かな入力のまま打った・全角で打った（全角英数字・かな・半角カナが入っている）のに、そろえても表に無い字が残る: 英字に切りかえる案内を出す
  const wideCode = raw => /[\u3040-\u30ff\uff01-\uff5e\uff66-\uff9f]/.test(String(raw ?? '')) && /[^A-HJ-NP-Z2-9]/.test(normCode(raw));
  const fmtCode = c => c.match(/.{1,4}/g).join('-');
  // 日本時間の「10/29 16:05」
  const jstTime = d => {
    const j = new Date(d.getTime() + 9 * 3600e3), two = n => String(n).padStart(2, '0');
    return `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${two(j.getUTCHours())}:${two(j.getUTCMinutes())}`;
  };
  let issued = null;   // この画面で出したコード { token, code, expiresAt }（描き直しても出したままにする）
  // 前の端末: データを預けてコードをもらう。出し直すと前のコードは使えなくなる（サーバーがそうする）
  const startTransfer = async () => {
    const p = read();
    if (!p) return { ok: false, reason: 'not_found' };
    const r = await RANKING.transferStart({ token: p.token, data: pack() });
    if (!r.ok) { if (r.reason === 'not_found') lost(p.token); return { ok: false, reason: r.reason }; }
    issued = { token: p.token, code: r.code, expiresAt: r.expiresAt };
    return { ok: true, code: r.code, expiresAt: r.expiresAt };
  };
  // 新しい端末: 新しい合言葉とコードを送って、プロフィールとデータを受け取る。profile を新しい合言葉ですぐ書いてから、データを書き戻す（読み直しは呼ぶ側）。
  // 新しい合言葉は送る前に transferPending（{ code, token }）に覚え、返事が届かなかったら同じコードには同じ合言葉で送り直す
  // （サーバーは同じコード・同じ合言葉の2回目にも同じ答えを返す。届かなかった1回目でコードが使われ、合言葉も入れかわっているので）。
  // 自動・公開は前の端末の設定（data.profile。無い古いデータなら自動 ON・公開はサーバーの値）。
  // 称号・かざりは profile_me で取りなおす（取れなければ送ったことにしない。公開はサーバーの値を送ったことにするので、前の端末とちがえば次の同期で送る）
  const claimTransfer = async code => {
    const pend = store.get('transferPending', null);
    const token = pend?.code === code && typeof pend.token === 'string' && pend.token ? pend.token : newToken();
    store.set('transferPending', { code, token });
    const r = await RANKING.transferClaim({ code, newToken: token });
    if (!r.ok) { if (r.reason !== 'network') drop('transferPending'); return { ok: false, reason: r.reason }; }
    const prev = r.data?.profile ?? {}, auto = typeof prev.auto === 'boolean' ? prev.auto : true;
    // 先に profile を書く（このあとの書き戻しや profile_me の途中で閉じても、プロフィールは使える）。
    // claimed: 読み直したあとに「◯◯ のプロフィールを引き継いだよ」を1回出す印
    // 公開の設定が無い古いデータは、公開のまま送ったことにしておく（profile_me が取れないまま、非公開をこちらから公開に戻さないように）
    const keep = typeof prev.isPublic === 'boolean';
    const first = { token, pid: r.pid, name: r.nickname, auto, isPublic: keep ? prev.isPublic : true, sent: keep ? {} : { isPublic: true }, claimed: true };
    store.set(KEY, first);
    drop(PENDING);
    if (!unpack(r.data)) console.warn('[profile] 引き継ぎのデータの形がちがうので、データは移さなかった');
    store.set('nickname', r.nickname);   // データの nickname より、プロフィールの名前が本物
    const me = await RANKING.profileMe({ token }).catch(() => ({ ok: false }));
    if (me.ok) {
      const server = me.isPublic !== false;
      update(token, { isPublic: keep ? prev.isPublic : server, sent: { isPublic: server, title: me.title, deco: me.deco } });
    }
    drop('transferPending');
    return { ok: true, name: r.nickname };
  };

  // ---- 結果画面の「載せる」箱 ----
  // send(token) は Promise<{ ok, reason?, text? }>（text は載せたときの文）。箱を描いた時点でプロフィールがあって自動 ON ならすぐ送る、そうでなければ［載せる］、
  // 無ければ名前の入力と［プロフィールを作って載せる］。失敗はわけと［もう一回送る］。not_found ならプロフィールを消して描き直す。
  // 自動で送るのは描いた時点だけ。あとでほかの場所でプロフィールを作った・自動を ON にしたときは描き直すだけ（載せないままにした記録を、見ていないところで送らない）
  // next() は載せたあとにフォーカスを移す先（TA の［ランキングを見る］など。無い・隠れていれば状態の文。キーボードで来たときは枠が出る）
  const postBox = (el, { label = 'ランキングに載せる？', send, next }) => {
    // state: idle（まだ）・busy（作っている・送っている）・fail（失敗。msg にわけ）・done（載せた。msg に文）
    const st = { state: 'idle', msg: '', input: null };
    const say = (text, cls = '') => { st.msg = text; st.cls = cls; };
    // 外枠と状態の文（role=status）は1回だけ作り、あとは文だけ書きかえる（差し込み直した live region は読み上げられないことがあるので）。
    // 中身は状態の文の前（body: 入力や［載せる］）と後ろ（tail: ヒント）。どちらも display: contents なので並びは外枠の flex のまま
    el.innerHTML = '<div class="tabox pf-post"><div class="pf-post-body"></div><p class="tamsg" role="status" tabindex="-1"></p><div class="pf-post-tail"></div></div>';
    const body = el.querySelector('.pf-post-body'), msg = el.querySelector('[role=status]'), tail = el.querySelector('.pf-post-tail');
    let shown = null;   // いま body に出している形（同じなら作り直さない。入力の途中を消さない）
    // 状態の文は、空のままページに入ってから少し待って書く（自動 ON で描いてすぐの「送信中…」を、中身ごと差し込んだ扱いにしない）。
    // 待つあいだに文のある状態になったら、文と中身がずれないように描くのもまとめて待つ
    let live = false;
    setTimeout(() => { live = true; draw(); }, 100);
    const draw = () => {
      if (!live && st.msg) return;
      const p = get();
      // 押したボタン・入力欄が箱の中にあったか（描き直しで消える前に見る）
      const had = el.contains(document.activeElement);
      msg.className = `tamsg ${st.cls ?? ''}`;
      if (msg.textContent !== st.msg) msg.textContent = st.msg;
      const kind = st.state === 'done' || st.state === 'busy' ? 'none' : st.state === 'fail' && p ? 'retry' : !p ? 'form' : `send:${p.name}`;
      if (kind !== shown) {
        shown = kind;
        if (kind === 'none') body.innerHTML = '';
        else if (kind === 'retry') body.innerHTML = '<button type="button" class="btn" data-pf="retry">もう一回送る</button>';
        else if (kind === 'form') {
          const v = st.input ?? store.get('nickname', '');
          body.innerHTML = `<form class="field" novalidate><label>${esc(label)}</label>`
            + `<div class="row"><input type="text" autocomplete="nickname" enterkeyhint="send" placeholder="ニックネーム（12文字まで）" aria-label="ニックネーム" value="${esc(v)}">`
            + '<button class="btn">プロフィールを作って載せる</button></div></form>';
        } else body.innerHTML = `<p class="pf-post-q">${esc(label)}</p><button type="button" class="btn" data-pf="send">${esc(p.name)} で載せる</button>`;
        tail.innerHTML = kind === 'form' ? '<p class="hint">名前でプロフィールを作ると、これからの記録は自動でランキングに載るよ</p>' : '';
      }
      // フォーカスが箱の中にあったときだけ移す（自動 ON で描いたとき・ほかの場所を触っているときは動かさない）。
      // 次に押せるもの（fail は［もう一回送る］、done は next）があればそこへ。無ければ、消えた要素に残って <body> に落ちたとき・空になった状態の文に
      // いるときだけ、新しくできた入力やボタン（not_found で名前の入力・名前が変わった［〜で載せる］）、それも無ければ状態の文（busy・done）へ
      if (!had) return;
      const to = st.state === 'fail' ? body.querySelector('button') : st.state === 'done' ? next?.() : null;
      const a = document.activeElement;
      if (to?.isConnected && !to.hidden) to.focus({ preventScroll: true });
      else if (!el.contains(a) || (a === msg && !st.msg)) (body.querySelector('input, button') ?? msg).focus({ preventScroll: true });
    };
    const go = async () => {
      const p = get();
      if (!p || st.state === 'busy') return;
      st.state = 'busy'; say('送信中…'); draw();
      let r;
      try { r = await send(p.token); } catch (e) { console.warn('[profile] send', e); r = { ok: false, reason: 'network' }; }
      if (r.ok) { st.state = 'done'; say(r.text ?? '載せたよ！', 'ok'); draw(); return; }
      if (r.reason === 'not_found') { st.state = 'idle'; say(''); lost(p.token); draw(); return; }   // lost が描き直しを呼ぶが、箱は自分で
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
    // プロフィールを作った・消えた・自動を切りかえたら描き直す（送らない。箱が DOM から外れたら聞くのをやめる）
    const onChange = () => {
      if (!el.isConnected) { document.removeEventListener('profile:change', onChange); return; }
      if (st.state === 'idle' || st.state === 'fail') draw();
    };
    document.addEventListener('profile:change', onChange);
    if (get()?.auto) go(); else draw();
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
    if (card.rpg?.tower > 0) h += line(`英雄の塔 ${card.rpg.tower}階`);   // 最高記録の階。登っていなければ出さない
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
  // プロフィール画面を開いたら、まだ使えるか確かめる（別の端末に引き継がれていたら not_found → lost で作るフォームに）
  const checkMe = async p => {
    let r;
    try { r = await RANKING.profileMe({ token: p.token }); } catch { return; }
    if (!r.ok && r.reason === 'not_found') lost(p.token);
  };
  // 出したコード（無い・期限切れ・別のプロフィールのものなら消す）
  const drawIssued = () => {
    const out = $('pf-tr-out'), p = read();
    if (!out) return;
    if (!issued || issued.token !== p?.token || issued.expiresAt <= new Date()) { out.innerHTML = ''; return; }
    out.innerHTML = `<div class="pf-tr-box"><p class="pf-tr-code mono" id="pf-tr-code">${fmtCode(issued.code)}</p>`
      + `<p class="hint" id="pf-tr-exp">${jstTime(issued.expiresAt)} まで・1回だけ使えるよ。出し直すと前のコードは使えなくなる</p>`
      + '<button type="button" class="btn ghost" id="pf-tr-copy">コピー</button></div>';
    $('pf-tr-copy').onclick = () => {
      const c = fmtCode(issued.code), fail = () => toast('コピーできなかった。コードを長押ししてコピーしてね');
      try { navigator.clipboard.writeText(c).then(() => toast('コピーしたよ'), fail); } catch { fail(); }
    };
  };
  // 引き継ぎの欄。プロフィールがあれば［引き継ぎコードを出す］、いつも［引き継ぎコードを入れる］（spec §2.5）
  const renderTransfer = p => {
    const box = $('pf-transfer');
    box.innerHTML = (p ? field('引き継ぎ', '<p class="hint">新しい端末に、プロフィールとこの端末のデータ（冒険・バッジ・設定など）を移せるよ</p>'
        + '<button type="button" class="btn ghost pf-tr-start" id="pf-tr-start">引き継ぎコードを出す</button><div id="pf-tr-out" role="status"></div>') : '')
      + field('<label for="pf-tr-in">引き継ぎコードを入れる</label>', '<form class="pf-form" id="pf-tr-form" novalidate><div class="row">'
        + '<input id="pf-tr-in" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="done" placeholder="XXXX-XXXX-XXXX">'
        + '<button class="btn ghost" id="pf-tr-claim">入れる</button></div></form><p class="tamsg" id="pf-tr-msg" role="status"></p>'
        + '<p class="hint">前の端末で出したコードを入れると、この端末にプロフィールとデータが移るよ</p>');
    if (p) {
      drawIssued();
      $('pf-tr-start').onclick = async () => {
        if (!confirm('この端末のデータ（冒険・バッジ・設定など）を預けて、コードを出すよ。新しい端末でコードを入れると、この端末のプロフィールは使えなくなる')) return;
        const btn = $('pf-tr-start'), out = $('pf-tr-out');
        btn.disabled = true; out.innerHTML = '<p class="tamsg">送信中…</p>';
        const r = await startTransfer();
        if (!btn.isConnected) return;   // not_found で描き直した
        btn.disabled = false;
        if (r.ok) drawIssued();
        else out.innerHTML = `<p class="tamsg ng">${esc(RANKING.message(r.reason))}</p>`;
      };
    }
    // confirm してから claim する（先に claim するとコードが使われてしまう）。名前は読み直したあとのトーストに出す
    $('pf-tr-form').onsubmit = async e => {
      e.preventDefault();
      const btn = $('pf-tr-claim'), msg = $('pf-tr-msg'), raw = $('pf-tr-in').value, code = normCode(raw);
      if (!codeOk(code)) {
        msg.className = 'tamsg ng';
        msg.textContent = wideCode(raw) ? '英字と数字で入れてね（0・O・1・I は使わない）' : RANKING.message('bad_code');
        return;
      }
      const now = read();
      if (!confirm('コードのプロフィールとデータをこの端末に移すよ。この端末の今のデータ（冒険・バッジ・設定など）は上書きされる'
        + (now ? `。この端末のプロフィール「${now.name}」は使えなくなる` : ''))) return;
      btn.disabled = true; msg.className = 'tamsg'; msg.textContent = '送信中…';
      const r = await claimTransfer(code);
      if (r.ok) { location.reload(); return; }
      btn.disabled = false; msg.className = 'tamsg ng'; msg.textContent = RANKING.message(r.reason);
    };
  };
  function render() {
    const p = read(), main = $('pf-main');
    renderTransfer(p);
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
    checkMe(p);
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
  // not_found なら rpgRank を消すだけ、つながらなければ次の起動でまた試す。
  // rpgRank が無くて rpgRankPending（前の版で登録の返事が届かなかった合言葉）があれば、それでも試す（登録が通っていればプロフィールになっている）。
  // 通れば profile にして rpgRankPending を消す。通らなければ残す（冒険のデータを消すときに rpg-rank.js が使う）
  const migrate = async () => {
    if (read()) return;
    const old = store.get('rpgRank', null), pending = store.get('rpgRankPending', null);
    const [token, from] = old && typeof old.token === 'string' && old.token ? [old.token, 'rpgRank']
      : typeof pending === 'string' && pending ? [pending, 'rpgRankPending'] : [];
    if (!token) return;
    const me = await RANKING.profileMe({ token });
    if (me.ok) {
      if (!read()) {
        store.set(KEY, { token, pid: me.pid, name: me.nickname, auto: true, isPublic: me.isPublic !== false,
          sent: { isPublic: me.isPublic !== false, title: me.title, deco: me.deco } });
        store.set('nickname', me.nickname);
      }
      drop(from);
      changed();
    } else if (me.reason === 'not_found' && from === 'rpgRank') drop('rpgRank');
  };
  const ready = migrate().catch(e => console.warn('[profile] migrate', e));
  // badges.js・rpg.js はこの後に読むので、全部読み終わってから比べる
  // 引き継いで読み直したところなら、1回だけ知らせる
  const welcome = () => {
    const p = read();
    if (!p?.claimed) return;
    update(p.token, { claimed: undefined });
    toast(`${esc(p.name)} のプロフィールを引き継いだよ`, 5000);
  };
  const boot = () => ready.then(() => { welcome(); scheduleSync(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.PROFILE = { get, create, rename, setAuto, setPublic, auto: () => !!get()?.auto, lost, postBox, nameHTML, cardHTML, openCard, pack, unpack, ready };
})();
