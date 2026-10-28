(() => {
  'use strict';
  // 冒険（国旗クエスト）のランキング（#scr-rpgrank）: 旅人のレベル順と、クリアしたダンジョンの数の順と、英雄の塔の最高記録の階の順。
  // 記録は Supabase の rpg_players（supabase/schema.sql の rpg_update2 / rpg_unregister2 / top_rpg3 / rpg_rank_of と、
  // 塔の rpg_set_tower2 / top_tower2 / rpg_tower_rank_of）。1プロフィール1行。
  // 名前・かざり・合言葉はサイト共通のプロフィール（profile.js の window.PROFILE）のもの。かざりは profile.js の同期が profile_set で送る。
  // rpg.js・profile.js の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）

  // rpg.js が起動していない・ランキングの接続先が無いときは何もしない（冒険ホームにランキングの入口が出ないだけ）
  const RPG = window.RPG;
  if (typeof RPG?.tx !== 'function' || !window.RANKING?.enabled || typeof RANKING.rpgUpdate2 !== 'function') return;   // 古い ranking.js がキャッシュに残っているときも出さない
  // profile.js が読めなかった（配信漏れ）ときは、ランキングは見るだけ・載せられない
  const P = typeof window.PROFILE?.get === 'function' ? window.PROFILE : null;

  const K = RPG_CORE, DG = K.DUNGEONS, BOSS = 5, MAX_FLOORS = DG.length * BOSS;
  // いまのセーブの記録: レベル・ボスを倒したダンジョンの数・クリアしたフロアの合計
  const recordOf = d => {
    const fl = DG.map(g => Math.max(0, Math.min(BOSS, (d.floors || {})[g.id] || 0)));
    return { lv: d.lv, dungeons: fl.filter(n => n >= BOSS).length, floors: fl.reduce((s, n) => s + n, 0) };
  };
  // 英雄の塔の最高記録（勝ったいちばん上の階）
  const towerOf = d => { const n = d.tower?.best; return Number.isInteger(n) && n > 0 ? n : 0; };
  const SORTS = { lv: 'レベル', dg: 'ダンジョン', tower: '英雄の塔' };
  // 自動更新: プロフィールがあって自動 ON で冒険を始めていれば、レベルアップ・バトルの勝ち（新しいフロア・ボス）・塔の新記録・起動時に記録が変わっていれば送る。
  // 記録は rpg_update2、塔は rpg_set_tower2 で別々に送る（1回に1つ。記録が先）。
  // 送ったものは localStorage の rpgSent（{ pid, lv, dungeons, floors, tower }。pid がいまのプロフィールとちがえば送っていない扱い、tower が無い = 0）。
  // DB は10秒以内の連投を断る（too_soon）ので、前に送ってから GAP ミリ秒あける。通信の失敗は次のきっかけで送り直す
  const SENT = 'rpgSent', GAP = 11000, WAIT = 1500;
  const prof = () => P?.get() ?? null;
  const same = (x, y) => x.lv === y.lv && x.dungeons === y.dungeons && x.floors === y.floors;
  const sentOf = p => { const s = store.get(SENT, null); return s && typeof s === 'object' && s.pid === p.pid ? s : null; };
  // 送ったものを覚える（送らなかった方は残す。送っているあいだにプロフィールが変わっていたら覚えない）
  const markSent = (p, part) => { if (prof()?.pid === p.pid) store.set(SENT, { ...sentOf(p), pid: p.pid, ...part }); };
  // まだ送っていないもの: 'rec'（記録）・'tower'（塔。best が送った値より大きいときだけ。古い ranking.js で rpgSetTower2 が無いときは送らない）・
  // null（どれも送ってある）
  const todo = (p, d) => {
    const s = sentOf(p);
    if (!s || !same(s, recordOf(d))) return 'rec';
    const best = towerOf(d);
    if (typeof RANKING.rpgSetTower2 === 'function' && best > (s.tower ?? 0)) return 'tower';
    return null;
  };
  const ranks = r => `レベル順 ${r.rankLv}位・ダンジョン順 ${r.rankDg}位`;
  let autoTimer = null, lastSent = 0, sending = false;
  // 自動で送るときで、まだ送っていないものがあれば、少し待ってから送る（続けて上がったら1回にまとめる）
  const scheduleAuto = () => {
    const p = prof(), d = RPG.get();
    if (!p?.auto || !d.intro || !todo(p, d)) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(sendAuto, Math.max(WAIT, lastSent + GAP - Date.now()));
  };
  const sendAuto = async () => {
    autoTimer = null;
    const p = prof(), d = RPG.get();
    if (!p?.auto || !d.intro || sending) return;
    // 冒険データを消したときの消し直しがまだなら、先に消す（あとから消して新しい記録まで消さないように）。消せなければ次のきっかけで
    if (unregs().includes(p.token)) { await dropTokens(); if (unregs().includes(p.token)) return; }
    const now = RPG.get(), what = todo(p, now);
    if (!what) return;
    const rec = recordOf(now), tower = towerOf(now), sent = what === 'rec' ? rec : { tower };
    sending = true; lastSent = Date.now();
    const res = what === 'rec' ? await RANKING.rpgUpdate2({ token: p.token, ...rec }) : await RANKING.rpgSetTower2({ token: p.token, tower });
    sending = false;
    if (res.ok) {
      markSent(p, sent);
      if (document.body.dataset.screen === 'rpgrank') { drawMe(); load(); }
      scheduleAuto();   // 塔がまだ・送っているあいだにまた上がっていたら
    } else if (res.reason === 'too_soon') scheduleAuto();
    else if (res.reason === 'not_found') P.lost(p.token);   // 別の端末に引き継がれた: profile:change で描き直す（送った合言葉で。そのあいだに入れかわったプロフィールは消さない）
    else console.warn(`ranking auto ${what}`, res.reason);   // つながらない・断られたら、次のきっかけまで待つ
  };

  const HTML = '<div class="rpg-head"><button type="button" class="linkbtn rpg-back">← 冒険</button><h2 class="rpg-h2">冒険ランキング</h2></div>'
    + '<div class="rpg-rr-cols"><div class="rpg-rr-side">'
    + '<div class="rpg-rr-me" id="rr-me"></div><p class="tarank" id="rr-rank"></p>'
    + '<div id="rr-post"></div>'
    + '<div class="rpg-rr-auto" id="rr-auto" hidden><p>✅ <b id="rr-auto-name"></b> で載ってるよ。レベルアップやダンジョンクリアのたびに自動で記録が新しくなる</p>'
    + '<button type="button" class="linkbtn" id="rr-profile">プロフィール</button></div>'
    + '<p class="hint" id="rr-note">ランキングにはプロフィールの名前とかざりで載るよ。名前を押すと、その人のプロフィールが見られる</p></div>'
    + '<div class="rpg-rr-main"><div class="seg" id="rr-tabs" role="group" aria-label="並べ方">'
    + Object.entries(SORTS).map(([k, v]) => `<button type="button" data-s="${k}">${v}</button>`).join('') + '</div>'
    + '<p class="hint" id="rr-how"></p>'
    + '<ol class="rklist rpg-rr-list" id="rr-list" aria-busy="false"></ol>'
    + '<p class="rkempty" id="rr-empty" hidden>まだ誰もいない。1位のチャンス！</p>'
    + '<p class="rkempty" id="rr-soon" hidden>英雄の塔のランキングは準備中だよ。もう少し待ってね</p>'
    + '<div class="rkerror" id="rr-error" hidden><p>ランキングに接続できなかった</p><button class="btn ghost" id="rr-retry">再読み込み</button></div></div></div>';
  const HOW = { lv: '上位50人まで。レベル → クリアしたダンジョン → フロアの順', dg: '上位50人まで。クリアしたダンジョン → フロア → レベルの順',
    tower: '上位50人まで。最高記録の階 → レベルの順' };

  const R = { sort: 'lv', seq: 0 };
  // 日付は日本時間で（タイムアタックのランキングとそろえる）
  const jstDay = d => { const j = new Date(d.getTime() + 9 * 3600e3); return `${j.getUTCMonth() + 1}/${j.getUTCDate()}`; };
  const recText = r => `ダンジョン ${r.dungeons}/${DG.length}（フロア ${r.floors}/${MAX_FLOORS}）`;
  // 名前のセル: ふだんは PROFILE.nameHTML（かざり付き・押すと窓）。profile.js が無いときは名前と知っている国のかざりだけ
  const nameOf = r => {
    if (P) return P.nameHTML(r);
    const deco = (Array.isArray(r.deco) ? r.deco : []).filter((a, j, l) => byA.has(a) && l.indexOf(a) === j).slice(0, 3)
      .map(a => { const nm = esc(byA.get(a).n); return `<img src="${flag(a)}" alt="${nm}" title="${nm}">`; }).join('');
    return esc(r.nickname) + (deco ? `<span class="rr-deco">${deco}</span>` : '');
  };

  // 載せる欄（#rr-post）の形: none（旅に出ていない）・reload（profile.js が無い）・auto（自動で載る）・box（PROFILE.postBox）。
  // 箱で送ったあとは、プロフィールができて自動になっても画面を開き直すまで箱（「載せたよ！」の文）のまま
  let postMode = null, boxUsed = false;
  const postModeOf = () => {
    if (!RPG.get().intro) return 'none';
    if (!P) return 'reload';
    if (postMode === 'box' && boxUsed) return 'box';
    const p = prof();
    return p?.auto ? 'auto' : 'box';
  };
  // 箱で送る: いまの記録を rpg_update2 で。通ったら rpgSent に覚える。塔の新記録もあれば、続けて rpg_set_tower2 で送る
  // （塔の連投よけは記録とは別なのですぐ送れる。塔が通らなくても記録は載ったので、箱は「載せたよ！」にする）。
  // 送っているあいだは自動で送らない（箱でプロフィールを作ると profile:change で自動の予約が入る）。終わったら予約し直す。
  // 冒険データを消したときの消し直しがまだなら、自動と同じく先に消す（消せなければつながらなかったことにする。あとから消して新しい記録まで消さないように）
  const sendBox = async token => {
    clearTimeout(autoTimer); autoTimer = null;
    if (unregs().includes(token)) { await dropTokens(); if (unregs().includes(token)) { scheduleAuto(); return { ok: false, reason: 'network' }; } }
    const rec = recordOf(RPG.get()), p = prof();
    clearTimeout(autoTimer); autoTimer = null;
    sending = true; lastSent = Date.now();
    const r = await RANKING.rpgUpdate2({ token, ...rec });
    if (r.ok && p?.token === token) {
      markSent(p, rec);
      const tower = towerOf(RPG.get());
      if (todo(p, RPG.get()) === 'tower') {
        const t = await RANKING.rpgSetTower2({ token, tower });
        if (t.ok) markSent(p, { tower });
      }
    }
    sending = false;
    scheduleAuto();
    if (!r.ok) return r;
    $('rr-rank').textContent = '';
    load();
    return { ok: true, text: `載せたよ！ ${ranks(r)}` };
  };
  const drawPost = () => {
    const mode = postModeOf(), el = $('rr-post'), p = prof();
    $('rr-auto').hidden = mode !== 'auto';
    if (mode === 'auto') $('rr-auto-name').textContent = p.name;
    if (mode === postMode) return;   // 箱は作り直さない（入力の途中・送っている途中を消さない）
    postMode = mode;
    // 箱は毎回新しい子要素に作る（同じ #rr-post に作ると、前の箱の listener が残って押すたびに何回も送る）
    if (mode === 'box') { const box = document.createElement('div'); el.replaceChildren(box); P.postBox(box, { label: '冒険ランキングに載せる', send: sendBox }); }
    else el.innerHTML = mode === 'reload' ? '<p class="tamsg ng">プロフィールが読みこめなかった。ページを読み直してね</p>' : '';
  };
  const drawMe = () => {
    const d = RPG.get(), r = recordOf(d), tw = R.sort === 'tower', best = towerOf(d);
    $('rr-me').innerHTML = d.intro
      ? `<p class="rpg-rr-h">きみの記録</p><p class="rpg-rr-rec"><b>Lv ${r.lv}</b><span>${recText(r)}</span></p>`
        + (tw ? `<p class="hint rpg-rr-tw">🗼 英雄の塔 ${best ? `自己ベスト ${best}階` : 'まだ記録がないよ'}</p>` : '')
      : '<p class="rpg-rr-h">まだ旅に出ていないよ</p><p class="hint">冒険を始めると、レベルとクリアしたダンジョンでランキングに載せられる</p>';
    drawPost();
    $('rr-rank').textContent = '';
    if (!d.intro) return;
    // 何位相当か（失敗したら何も出さない。原因はコンソール）。塔のタブでは塔の順位（記録が無いなら出さない）
    if (tw) {
      if (!best) return;
      RANKING.rpgTowerRankOf({ tower: best, lv: r.lv }).then(n => {
        const now = RPG.get();
        if (R.sort === 'tower' && towerOf(now) === best && now.lv === r.lv && $('rr-rank') && Number.isInteger(n)) $('rr-rank').textContent = `英雄の塔 ${n}位 相当`;
      }, e => console.warn('ranking rpgTowerRankOf', e));
      return;
    }
    const want = { ...r };
    RANKING.rpgRankOf(want).then(x => { if (R.sort !== 'tower' && same(recordOf(RPG.get()), want) && $('rr-rank')) $('rr-rank').textContent = `${ranks(x)} 相当`; },
      e => console.warn('ranking rpgRankOf', e));
  };
  // 読み込み中は表を薄くするだけ。返事が前後しても、最後に頼んだ並べ方の表だけを出す
  const load = async () => {
    const seq = ++R.seq, list = $('rr-list');
    list.setAttribute('aria-busy', 'true'); $('rr-retry').disabled = true;
    const sort = R.sort, tw = sort === 'tower';
    // 塔: DB にまだ top_tower2 が無い（404）・古い ranking.js（topTower2 が無い）なら「準備中」
    let rows = null, soon = false;
    try {
      if (!tw) rows = await RANKING.rpgTop3({ sort });
      else if (typeof RANKING.topTower2 === 'function') rows = await RANKING.topTower2();
      else soon = true;
    } catch (e) {
      if (tw && e?.status === 404) soon = true;
      else console.warn(tw ? 'ranking topTower2' : 'ranking rpgTop3', e);
    }
    if (seq !== R.seq) return;
    list.setAttribute('aria-busy', 'false'); $('rr-retry').disabled = false;
    $('rr-soon').hidden = !soon;
    $('rr-error').hidden = !!rows || soon;
    $('rr-empty').hidden = !rows || rows.length > 0;
    // 同じ記録は同じ順位（rpg_rank_of・rpg_tower_rank_of の「自分より上の人数＋1」とそろえる）。自分（pid が同じ）の行は me
    const sameRow = tw ? (x, y) => x.tower === y.tower && x.lv === y.lv : same;
    const mine = prof()?.pid;
    let no = 0;
    list.innerHTML = (rows ?? []).map((r, i) => {
      if (!i || !sameRow(r, rows[i - 1])) no = i + 1;
      const lv = `<span class="mono rpg-rr-lv">Lv ${r.lv}</span>`, dg = tw ? `<span class="mono rpg-rr-tw">🗼${r.tower}階</span>`
        : `<span class="mono rpg-rr-dg">🏰${r.dungeons}<small>・F${r.floors}</small></span>`;
      const cls = [no <= 3 && 'top', mine && r.pid === mine && 'me'].filter(Boolean).join(' ');
      // かざりは名前の中に入れて列を増やさない（スマホで名前が細くならない）
      return `<li${cls ? ` class="${cls}"` : ''}><span class="no">${no}</span><span class="nick">${nameOf(r)}</span>`
        + `${sort === 'lv' ? lv + dg : dg + lv}<span class="mono at">${jstDay(r.at)}</span></li>`;
    }).join('');
  };
  const render = () => {
    const o = RPG.opts || {};
    if (o.sort in SORTS) R.sort = o.sort;
    for (const b of $('rr-tabs').children) b.setAttribute('aria-pressed', String(b.dataset.s === R.sort));
    $('rr-how').textContent = HOW[R.sort];
    postMode = null; boxUsed = false;   // 開くたびに載せる欄を作り直す
    drawMe();
    load();
  };

  const sec = document.createElement('section');
  sec.id = 'scr-rpgrank'; sec.className = 'wrap'; sec.hidden = true; sec.innerHTML = HTML;
  const wrap = document.querySelector('body > .wrap'), foot = wrap?.querySelector(':scope > footer');
  if (!wrap) return;
  if (foot) foot.before(sec); else wrap.append(sec);
  registerScreen('rpgrank', render);

  sec.querySelector('.rpg-back').onclick = () => show('rpg');
  $('rr-tabs').onclick = e => {
    const b = e.target.closest('button');
    if (!b || !(b.dataset.s in SORTS)) return;
    R.sort = b.dataset.s;
    RPG.opts = { sort: R.sort };
    for (const x of $('rr-tabs').children) x.setAttribute('aria-pressed', String(x.dataset.s === R.sort));
    $('rr-how').textContent = HOW[R.sort];
    drawMe();   // 塔のタブでは、きみの記録に塔の自己ベストと順位を出す
    load();
  };
  $('rr-retry').onclick = () => load();
  $('rr-profile').onclick = () => show('profile');
  // 画面を離れたら載せる箱を外す（隠れた箱が profile:change を聞き続けない。postBox は箱が DOM から外れると聞くのをやめる。開き直せば render が作り直す）
  document.addEventListener('drill:screen', e => { if (e.detail?.name !== 'rpgrank' && postMode !== null) { $('rr-post').replaceChildren(); postMode = null; boxUsed = false; } });
  // 箱を押したら（作って載せる・載せる・もう一回送る）使ったことにする。作ったときの profile:change より先に（capture）
  for (const type of ['submit', 'click']) $('rr-post').addEventListener(type, e => { if (type === 'submit' || e.target.closest?.('[data-pf]')) boxUsed = true; }, true);
  // 冒険データを消したら、冒険ランキングからも消す（プロフィールは残す）。消す合言葉は rpgUnreg に覚えておき、つながらなかったら次の起動で消し直す。
  // 前の版で覚えた rpgRankDel の合言葉も、サーバーでは同じ合言葉のプロフィールになっているので rpg_unregister2 で消し直す
  const UNREG = 'rpgUnreg', OLD_DEL = 'rpgRankDel';
  const tokensIn = k => { const l = store.get(k, []); return Array.isArray(l) ? l.filter(x => typeof x === 'string') : []; };
  const unregs = () => [...tokensIn(OLD_DEL), ...tokensIn(UNREG)];
  let dropping = null;   // 消している途中の Promise（自動更新からも待てるように）
  const dropTokens = () => dropping ??= (async () => {
    for (let list = unregs(); list.length; list = unregs()) {
      const done = [];
      for (const token of list) {
        const res = await RANKING.rpgUnregister2({ token });
        if (res.ok || res.reason !== 'network') done.push(token);   // もう無い（not_found）も消せたことにする
      }
      for (const k of [OLD_DEL, UNREG]) {
        const rest = tokensIn(k).filter(x => !done.includes(x));   // 消しているあいだに増えた分は残す
        if (rest.length) store.set(k, rest); else try { localStorage.removeItem(k); } catch {}
      }
      if (done.length < list.length) break;   // つながらない: 次の起動で
    }
  })().finally(() => { dropping = null; });
  // 消す合言葉: いまのプロフィール・まだ引っ越していない前の版の登録（rpgRank。引っ越しは profile.js がするので消さない）・
  // 返事の届かなかった前の版の登録（rpgRankPending。通っていたかもしれないので一緒に）
  const unregister = () => {
    const old = store.get('rpgRank', null), pending = store.get('rpgRankPending', null), list = unregs();
    const tokens = [prof()?.token, typeof old?.token === 'string' ? old.token : null, typeof pending === 'string' ? pending : null]
      .filter((x, i, a) => x && !list.includes(x) && a.indexOf(x) === i);
    clearTimeout(autoTimer); autoTimer = null;
    try { localStorage.removeItem(SENT); localStorage.removeItem('rpgRankPending'); } catch {}
    if (!tokens.length) return;
    store.set(UNREG, [...tokensIn(UNREG), ...tokens]);
    dropTokens();
  };
  document.addEventListener('rpg:wipe', () => { try { unregister(); } catch (e) { console.error('[rpg]', e); } });
  dropTokens();

  // きっかけ: レベルアップ・バトルに勝った（新しいフロアやボス）・塔の新記録・別のタブがセーブを書いた・プロフィールが変わった（作った・自動の ON/OFF・名前・引き継がれた）・起動時
  document.addEventListener('rpg:levelup', () => { try { scheduleAuto(); } catch (e) { console.error('[rpg]', e); } });
  document.addEventListener('rpg:battle', e => { try { if (e.detail?.win) scheduleAuto(); } catch (err) { console.error('[rpg]', err); } });
  // 英雄の塔: 新しい階に勝った・回が終わった
  document.addEventListener('rpg:tower', e => { try { if (e.detail?.newBest) scheduleAuto(); } catch (err) { console.error('[rpg]', err); } });
  document.addEventListener('rpg:tower-end', () => { try { scheduleAuto(); } catch (err) { console.error('[rpg]', err); } });
  window.addEventListener('storage', e => { if (e.key === 'rpg') try { scheduleAuto(); } catch (err) { console.error('[rpg]', err); } });
  document.addEventListener('profile:change', () => {
    try {
      scheduleAuto();
      if (document.body.dataset.screen === 'rpgrank') { drawPost(); load(); }   // 名前・自分の行が変わる
    } catch (e) { console.error('[rpg]', e); }
  });
  scheduleAuto();

  // タイムアタックのランキング画面から冒険のランキングへ（冒険を隠している人には出さない: body.rpg-off）
  const panel = document.querySelector('#scr-ranking .panel > h2');
  if (panel) {
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'linkbtn rpg-only'; go.id = 'rk-to-rpg'; go.textContent = '🏆 冒険のランキングはこちら';
    go.onclick = () => RPG.open('rpgrank');
    panel.after(go);
  }
  // 冒険ホームはもう描いてあるかもしれないので（直リンク #rpg）、入口を出すために描き直す
  if (document.body.dataset.screen === 'rpg') RPG.refresh();
})();
