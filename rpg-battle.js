(() => {
  'use strict';
  // 国旗クエストのバトル（#scr-battle）: 登場画面 → 4択（ボスは旗を1枚ずつ取りもどす）→ 勝ち／負けをまとめて保存。にげる・キー操作も
  // index.html のインライン script と rpg.js の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）

  // ---- 起動時のチェック。足りなければ何もしない（画面を作らない。クイズはそのまま動く） ----
  const NEED = {
    C: typeof C, byA: typeof byA, REGIONS: typeof REGIONS, flag: typeof flag, esc: typeof esc, fmt: typeof fmt, $: typeof $,
    store: typeof store, S: typeof S, P: typeof P, FX: typeof FX, show: typeof show, registerScreen: typeof registerScreen,
    screenRender: typeof screenRender, emit: typeof emit, toast: typeof toast, makeQuestion: typeof makeQuestion,
    mapSvg: typeof mapSvg, zoomableMap: typeof zoomableMap, factsHTML: typeof factsHTML, shuffle: typeof shuffle,
    feats: typeof feats, featCountry: typeof featCountry, featOf: typeof featOf, boxProjection: typeof boxProjection,
    WORLD_BOX: typeof WORLD_BOX, W: typeof W, H: typeof H, misses: typeof misses, SCREENS: typeof SCREENS,
    RPG_CORE: typeof RPG_CORE, RPG: typeof window.RPG,
  };
  const missing = Object.keys(NEED).filter(k => NEED[k] === 'undefined');
  if (missing.length) { console.error(`[rpg] 必要なものが読み込めなかったので、バトルはお休み: ${missing.join(' ')}`); return; }
  const wrap = document.querySelector('body > .wrap');
  if (!wrap) { console.error('[rpg] body > .wrap が無いので、バトルはお休み'); return; }

  const K = RPG_CORE, T = K.TUNING, TB = T.battle, DG = K.DUNGEONS, RPG = window.RPG;
  const BOSS = 5;             // フロアは F1〜F4 とボス（5）
  const LOG_LINES = 3;        // ログは直近3行
  const ASSIST_MS = 600;      // 正解の援護で仲間に .rpg-assist を付けておく時間
  const COIN = RPG.COIN;
  const LABEL = { f2n: 'この国旗はどこの国？', n2f: 'この国の国旗は？', m2f: '色がついている場所の国旗は？' };
  const MODES = new Set(['f2n', 'n2f', 'm2f']);
  const ONGOING = new Set(['question', 'reveal']);   // バトルが続いている（にげたら数える）
  const FLEE_ASK = 'にげる？（報酬はなし）';
  const FLEE_ASK_TOWER = 'にげる？（この階の報酬はなし。塔はここで終わり）';
  const TT = T.tower;
  const todayStr = () => K.today(new Date());
  // misses は index.html の let（記録を消すと別のオブジェクトになる）。参照を取っておかず、毎回読む
  const missesNow = () => (misses && typeof misses === 'object') ? misses : {};
  const missOf = a => Math.max(0, +missesNow()[a] || 0);
  const nameOf = a => byA.get(a)?.n ?? a;
  const names = as => as.map(a => esc(nameOf(a))).join('・');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- いまのバトル（無ければ null） ---------- */
  // phase: 'intro' | 'question' | 'reveal' | 'end'。q: いまの問題 {a, mode}。waiting: 正解のあとの自動送りを待っている
  let B = null;
  const sec = document.createElement('section');
  sec.id = 'scr-battle'; sec.className = 'wrap'; sec.hidden = true;

  const setPhase = p => {
    B.phase = p;
    const st = sec.querySelector('.rpg-stage');
    if (st) st.dataset.phase = p;
  };
  // スマホでは上の列（.rpg-btop）が画面の上に固定される（rpg.css の sticky）。その下に隠れないように、
  // el に scroll-margin-top（上の列の高さ + 8px）を付けて true。PC のステージ（sticky でない）は何もしないで false
  const clearTop = el => {
    const top = sec.querySelector('.rpg-btop');
    if (!top || getComputedStyle(top).position !== 'sticky') return false;
    el.style.scrollMarginTop = `${top.offsetHeight + 8}px`;
    return true;
  };
  const stopTimer = () => { if (B) { clearTimeout(B.timer); B.waiting = false; } };

  // ---- 上の列（モンスター・HP・のこりミス・仲間・取りもどした旗・ログ） ----
  const barHTML = (id, label) => `<div class="rpg-hp" id="${id}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0"><i></i></div><span class="rpg-hpnum"></span>`;
  // 仲間3枚（国旗と★）。tags なら地域ボーナスの札も（登場画面）、無ければ端にチームボーナスの札（上の列）。
  // --i は正解の援護で左から順に跳ねるときのずらし（rpg.css の rpg-hop）
  const partyHTML = tags => {
    const tb = B.stats.team?.bonus || 0;
    return `<ul class="rpg-party">${B.stats.party.filter(({ a }) => byA.has(a)).map(({ a }, i) => {
      const star = B.d.cards[a]?.[0] || 1, bonus = K.inDungeon(B.dg, a);
      return `<li class="rpg-pc" style="--i:${i}"><img src="${flag(a)}" alt="${esc(nameOf(a))}"><span class="rpg-stars" role="img" aria-label="★${star}">${'★'.repeat(star)}</span>`
        + `${tags && bonus ? `<span class="rpg-tag">地域ボーナス ×${T.card.regionMul}</span>` : ''}</li>`;
    }).join('')}${!tags && tb ? `<li class="rpg-team-tag"><span role="img" aria-label="チームボーナス ＋${Math.round(tb * 100)}%">＋${Math.round(tb * 100)}%</span></li>` : ''}</ul>`;
  };
  // 上の列の仲間を描き直す（登場画面で編成を切り替えたとき）。仲間0枚なら列ごと無くす
  const drawParty = () => {
    const old = sec.querySelector('.rpg-btop .rpg-party');
    if (!B.stats.party.length) return old?.remove();
    const box = document.createElement('div');
    box.innerHTML = partyHTML(false);
    if (old) old.replaceWith(box.firstElementChild); else $('bt-flags').before(box.firstElementChild);
  };
  // #scr-battle > .rpg-stage: 1つ目の子が上の列（.rpg-btop）、2つ目の子が問題の列（登場画面・問題・答え合わせ・終わりが入れかわる）
  const stageHTML = () => {
    const { dg, floor, mon, boss, d } = B;
    return `<div class="rpg-stage" data-phase="${B.phase}" style="--rpg-c: var(--rpg-r-${dg.id}, ${dg.color})"><div class="rpg-btop">`
      + `<div class="rpg-bhead"><button type="button" class="linkbtn" id="bt-flee">← にげる</button><span class="rpg-bwhere">${B.tower ? `${esc(dg.name)} ${floor}階${boss ? ' 中ボス' : ''}` : `${boss ? 'ボス' : `F${floor}`} ${esc(dg.name)}`}</span></div>`
      + `<div class="rpg-mon${boss ? ' rpg-boss' : ''}" id="bt-mon"><span class="rpg-mon-e" aria-hidden="true">${mon.e}</span>${boss ? '<span class="rpg-bosstag">BOSS</span>' : ''}</div>`
      + `<div class="rpg-hpl"><b class="rpg-hpname">${esc(mon.n)}</b>${barHTML('bt-ehp', `${mon.n}のHP`)}</div>`
      + `<div class="rpg-hpl"><span class="rpg-hpname" aria-hidden="true">${K.AVATARS[d.av] ?? K.AVATARS[0]}</span>${barHTML('bt-hhp', '旅人のHP')}<span class="rpg-left" id="bt-left"></span></div>`
      + (B.stats.party.length ? partyHTML(false) : '')
      + '<div class="rpg-flags" id="bt-flags" role="group" aria-label="取りもどした旗"></div>'
      + '<div class="rpg-log" id="bt-log" aria-live="polite"></div>'
      + '</div><div class="rpg-bcol" id="bt-col"></div></div>';
  };
  // HP バー: 50% 未満で .is-mid（黄）、25% 未満で .is-low（赤）。数字も出す
  const setBar = (el, now, max) => {
    const r = max > 0 ? Math.max(0, Math.min(1, now / max)) : 0;
    el.setAttribute('aria-valuenow', now);
    el.setAttribute('aria-valuemax', max);
    el.firstElementChild.style.width = `${r * 100}%`;
    el.classList.toggle('is-mid', r < .5 && r >= .25);
    el.classList.toggle('is-low', r < .25);
    el.nextElementSibling.textContent = `${fmt(now)}/${fmt(max)}`;
  };
  // 取りもどした旗: ボスは旗の枚数ぶん（取りもどしたら布が本物の国旗に）、通常は倒すのに必要な正解の数ぶん（正解した国の国旗が入る）
  const flagsHTML = () => {
    const slots = B.boss ? B.flags.map(f => f.got ? f.a : null) : [...B.got, ...Array(Math.max(0, B.need - B.got.length)).fill(null)];
    return slots.map(a => a ? `<img class="rpg-got" src="${flag(a)}" alt="${esc(nameOf(a))}">` : '<span class="rpg-cloth" aria-hidden="true">?</span>').join('')
      + `<span class="rpg-flagtext">旗 ${slots.filter(Boolean).length}/${slots.length}</span>`;
  };
  const drawTop = () => {
    const { en } = B;
    setBar($('bt-ehp'), B.boss ? B.flags.reduce((s, f) => s + f.hp, 0) : B.ehp, B.boss ? B.flags.length * en.flagHp : en.hp);
    // 塔は B.tower.maxHp（階クリアの画面では、仲間入りで上がったつぎの階の最大 HP）
    setBar($('bt-hhp'), B.hp, B.tower ? B.tower.maxHp : B.stats.hp);
    $('bt-left').textContent = `のこりミス${Math.max(0, K.missesAllowed({ hp: B.hp }, en))}`;
    $('bt-flags').innerHTML = flagsHTML();
  };
  // ログは1行ずつ足す（aria-live が足した行だけ読む）。直近3行だけ残す
  const say = line => {
    const log = $('bt-log');
    if (!log) return;
    const p = document.createElement('p');
    p.textContent = line;
    log.append(p);
    while (log.children.length > LOG_LINES) log.firstElementChild.remove();
  };

  // ---- 登場画面 ----
  // 編成の行（仲間を1枚でも持っているときだけ）: 編成 ◀ 名前 ▶ チーム 南アメリカ×3 ＋25% ［へんせい］。◀▶ は枠が2つ以上のときだけ。
  // チームボーナスは別の行にしない（スマホのボスでも［たたかう］が最初の画面に入るように）
  const teamRowHTML = () => {
    const teams = Array.isArray(B.d.teams) ? B.d.teams : [], tb = B.stats.team || {}, tm = teams[tb.slot ?? 0], many = teams.length > 1;
    return '<div class="rpg-bteam"><span class="rpg-bteam-k">編成</span>'
      + (many ? '<button type="button" class="linkbtn rpg-tsw" id="bt-tprev" aria-label="前の編成">◀</button>' : '')
      + `<b class="rpg-tname" id="bt-tname">${esc(tm?.n ?? '編成1')}</b>`
      + (many ? '<button type="button" class="linkbtn rpg-tsw" id="bt-tnext" aria-label="次の編成">▶</button>' : '')
      + (tb.bonus ? `<span class="rpg-bteam-b"><span class="rpg-bteam-bk">チーム </span>${esc(tb.group)}×${tb.n} <b>＋${Math.round(tb.bonus * 100)}%</b></span>` : '')
      + (typeof RPG.openTeam === 'function' && !B.tower ? '<button type="button" class="btn ghost rpg-tedit" id="bt-team">へんせい</button>' : '')   // 塔は編成の画面へ行くと回が終わるので出さない
      + '</div>';
  };
  const introHTML = () => {
    const { en, stats, mon, boss, d, id, floor } = B, g = stats.gauge, tm = stats.team || {};
    const hasCards = Object.keys(d.cards || {}).length > 0;
    return '<div class="rpg-bintro" id="bt-intro">'
      + `<p class="rpg-bmeet"><span class="rpg-bmeet-e" aria-hidden="true">${mon.e}</span><b>${esc(mon.n)}</b>があらわれた！</p>`
      + (hasCards ? teamRowHTML() : '')
      + (stats.party.length ? partyHTML(true)
        : hasCards && !tm.auto ? '<p class="hint">この編成には仲間がいないよ</p>'
          : `<p class="hint">仲間がいると強くなるよ（国旗ガチャ・${T.card.frJoin}回正解）</p>`)
      + `<p class="rpg-bline">倒すのに必要な正解: 約${K.hitsNeeded(stats, en)}回 ／ まちがえてOK: ${K.missesAllowed({ hp: B.hp }, en)}回まで</p>`
      + (B.tower ? `<p class="rpg-bline">HP はつぎの階に持ちこし（階を上がると${Math.round(TT.healPct * 100)}%回復、${TT.bossEvery}階ごとの中ボスをたおすと全回復）</p>` : '')
      + (g ? `<p class="rpg-bline">がんばりゲージ +${Math.round(TB.gaugeStep * 100 * g)}%</p>` : '')
      + (boss ? '<p class="rpg-bline">旗1枚につき正解1回で取りもどせる（Lv が足りないと2回かかることも）。旗を全部取りもどしたら勝ち！</p>' : '')
      + (id === DG[0].id && floor === 1 && !(d.floors[id] > 0) ? '<p class="rpg-bline">正解すると攻撃！ まちがえると反撃されるよ</p>' : '')
      + '<button type="button" class="btn" id="bt-fight">たたかう</button></div>';
  };

  // ---- 始める（開いていないフロアと、新しい版のデータのあいだは何もしないで false） ----
  const start = (id, floor) => {
    const dg = K.dungeonOf(id);
    floor = +floor;
    if (!dg || !Number.isInteger(floor) || floor < 1 || floor > BOSS || RPG.status === 'readOnly') return false;
    const d0 = RPG.get();
    if (!RPG.unlocked(d0, id) || floor > (d0.floors[id] || 0) + 1) return false;
    const m = missesNow(), t = todayStr();
    let d = null;
    RPG.tx(x => { K.ensureDay(x, m, t, Math.random); d = x; });
    d = d || RPG.get();
    stopTimer();   // 終わりの画面から［つぎのフロアへ］［もう一回］で始め直すとき
    const en = K.enemy(id, floor), stats = K.battleStats(d, id, floor), boss = en.boss;
    const flags = boss ? K.bossFlags(d, m, id, Math.random).map(a => ({ a, hp: en.flagHp, got: false })) : [];
    B = {
      id, floor, dg, en, boss, stats, d, mon: K.MONSTERS[id][floor - 1],
      run: K.newRun({ sid: `bt-${Date.now().toString(36)}`, kind: 'battle', mode: 'f2n', region: dg.r, n: 0, hint: false }, d),
      hp: stats.hp, ehp: boss ? 0 : en.hp,
      // 通常: 国の袋と、国ごとに前に出した形式。ボス: 旗（order はまだ取りもどしていない旗の番号で、先頭がいまの旗）と出した問題の数 k
      queue: boss ? [] : K.battleBag(d, m, id, floor, Math.random), last: {},
      flags, order: flags.map((_, i) => i), k: 0, again: false,
      need: boss ? flags.length : K.hitsNeeded(stats, en), got: [],
      phase: 'intro', q: null, shownAt: 0, answered: false, waiting: false, timer: 0, win: null, next: null,
      combo: 0, maxCombo: 0, rights: 0, mistakes: [], missed: new Set(),
    };
    sec.innerHTML = stageHTML();
    drawTop();
    $('bt-col').innerHTML = introHTML();
    if (sec.hidden) { RPG.opts = {}; show('battle'); }   // render からもう一度 start しない
    $('bt-fight')?.focus({ preventScroll: true });
    return true;
  };
  // いまのバトルの強さ（塔は全員に地域ボーナス・ゲージなし）
  const statsOf = d => B.tower ? K.towerStats(d) : K.battleStats(d, B.id, B.floor);
  // 塔の HP: hp が数なら 1..maxHp におさめる。無ければ maxHp
  const towerHp = (hp, maxHp) => hp === null || hp === undefined || !Number.isFinite(+hp) ? maxHp : Math.max(1, Math.min(maxHp, Math.round(+hp)));
  // 登場画面で使う編成を切り替える（step は +1 / -1、端で回る）。tsel を書いて、強さ・必要な正解の数・上の列を描き直す。
  // フォーカスは押したボタン（キーなら［たたかう］）に戻す。新しい版のデータのあいだは何もしない
  const switchTeam = (step, focusId) => {
    if (!B || B.phase !== 'intro' || RPG.status === 'readOnly') return;
    const n = Array.isArray(B.d.teams) ? B.d.teams.length : 0;
    if (n < 2) return;
    const cur = B.stats.team?.slot ?? 0, to = ((cur + step) % n + n) % n;
    if (RPG.tx(x => { x.tsel = to; return true; }) !== true) return;
    B.d = RPG.get();
    B.stats = statsOf(B.d);
    B.hp = B.tower ? towerHp(B.tower.hp0, B.stats.hp) : B.stats.hp;
    if (B.tower) B.tower.maxHp = B.stats.hp;
    if (!B.boss) B.need = K.hitsNeeded(B.stats, B.en);
    drawParty();
    drawTop();
    $('bt-col').innerHTML = introHTML();
    ($(focusId) || $('bt-fight'))?.focus({ preventScroll: true });
  };
  // 編成画面へ（drill:screen でバトルは片付く。［← バトルにもどる］で同じフロアの登場画面を start が作り直す）
  const editTeam = () => {
    if (!B || B.phase !== 'intro' || B.tower || typeof RPG.openTeam !== 'function') return;
    RPG.openTeam({ id: B.id, floor: B.floor });
  };
  // 始めていない画面（RPG.open を通らずに開いた・始めるのに失敗した）
  const idle = () => {
    sec.innerHTML = '<div class="rpg-bend"><p class="hint">バトルは冒険ホームのダンジョンから始めてね</p>'
      + '<div class="row center"><button type="button" class="btn" id="bt-home">冒険ホームへ</button></div></div>';
  };
  // バトルを片付ける（タイマー・B・画面）。にげたときと、始めるのに失敗したとき
  const drop = () => { stopTimer(); B = null; sec.replaceChildren(); };
  // start を呼ぶ（画面と、終わりの画面の［つぎのフロアへ］［もう一回］）。例外はページの例外にせず console.error('[rpg]') にし、
  // 途中まで描いたバトル（B を作ったあとの上の列・登場画面）を片付けてから、始めていない画面を出す
  const tryStart = (id, floor) => {
    try { return start(id, floor); } catch (e) {
      console.error('[rpg]', e);
      drop();
      idle();
      return false;
    }
  };
  // 画面（screenRender.battle）。RPG.open('battle', {id, floor}) のときだけ始める
  const render = () => {
    const o = RPG.opts || {};
    if (o.tower) {   // RPG.open('battle', {tower: true})（冒険ホームの英雄の塔の［挑戦］）
      RPG.opts = {};
      if (tryTower(1, null, 0, true)) return;
    }
    if (o.id !== undefined && o.floor !== undefined) {
      RPG.opts = {};
      if (tryStart(o.id, o.floor)) return;
    }
    if (!B) idle();
  };

  // ---- 出題 ----
  const fight = () => {
    if (!B || B.phase !== 'intro') return;
    setPhase('question');
    nextQ();
  };
  const refill = () => B.tower ? K.towerRefill(B.floor, B.last, Math.random) : K.refillBag(B.id, B.floor, B.last, Math.random);
  const nextQ = () => {
    if (B.boss) {
      // 新しい旗（後ろに回した旗がもう一度来たときも）は bossMode、旗が残ったときの同じ国のもう1問は前の形式の次
      const f = B.flags[B.order[0]];
      const mode = B.tower ? (B.again ? K.towerNextMode(B.q.mode, B.floor) : K.towerBossMode(B.k, B.floor))
        : B.again ? K.nextMode(B.q.mode, BOSS, K.chapterOf(B.id)) : K.bossMode(B.k, K.chapterOf(B.id));
      B.k++;
      B.q = { a: f.a, mode };
    } else {
      if (!B.queue.length) B.queue = refill();
      const x = B.queue.shift();
      B.q = { a: x.a, mode: x.mode };
    }
    showQ();
  };
  // いまの問題（B.q）を描く。札はここで決める（苦手な国・今日の手配書でまだ達成していない国）
  const showQ = () => {
    const { a, mode } = B.q, c = byA.get(a), d = B.d, bo = d.bounty;
    B.answered = false; B.waiting = false;
    B.last[a] = mode;
    const tags = [
      K.isWeak(d, missesNow(), a) && '⚠ 前にまちがえた国',
      bo.a.includes(a) && !bo.done.includes(a) && !B.run.game.bounty[a] && '手配中',
    ].filter(Boolean);
    const box = document.createElement('div');
    box.className = 'bq'; box.id = 'bt-q';
    box.innerHTML = (tags.length ? `<p class="rpg-tags">${tags.map(s => `<span class="rpg-tag">${s}</span>`).join('')}</p>` : '')
      + `<p class="qlabel">${LABEL[mode]}</p>`
      + (mode === 'f2n' ? `<img class="qflag" src="${flag(a)}" alt="国旗">` : '')
      + (mode === 'n2f' ? `<p class="qbig">${esc(c.n)}</p>` : '');
    if (mode === 'm2f') box.append(zoomableMap(c, '出題中の国の位置', { region: B.dg.r }));
    const byName = mode === 'f2n', ch = document.createElement('div');
    ch.className = 'choices' + (byName ? ' textc' : '');
    // 鏡の地球は似た旗の4択（おとり選びは rpg-core の similarChoices）、宇宙のテーマのある星はテーマの国だけの4択（themeChoices）。
    // 塔は similarFrom 階から、1問ごとに similarRate で似た旗の4択（ストーリーでは乱数を引かない）
    B.similar = !!B.tower && K.towerSimilar(B.floor, Math.random);
    const opts = K.chapterOf(B.id) === 2 || B.similar ? K.similarChoices(a, Math.random).map(x => byA.get(x))
      : B.dg.t ? K.themeChoices(a, B.dg, Math.random).map(x => byA.get(x)) : makeQuestion(c).opts;
    opts.forEach((o, k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'choice' + (byName ? '' : ' flagc'); b.dataset.a = o.a;
      b.innerHTML = byName ? `<kbd>${k + 1}</kbd><span>${esc(o.n)}</span>` : `<kbd>${k + 1}</kbd><img src="${flag(o.a)}" alt="選択肢${k + 1}の国旗">`;
      ch.append(b);
    });
    box.append(ch);
    $('bt-col').replaceChildren(box);
    clearTop(box);   // 答え合わせのあとで下までスクロールしていても、問いの文が上の列の下に隠れない
    box.scrollIntoView({ block: 'nearest' });
    B.shownAt = performance.now();
    // 次の問題の国旗だけうしろで先に読んでおく（待たない。ボスは旗の順が答えで変わるので読まない）
    if (!B.boss && B.queue[0] && typeof preloadFlags === 'function') preloadFlags([B.queue[0].a]);
  };

  // ---- 答える ----
  const answer = a => {
    if (!B || B.answered || B.phase !== 'question') return;
    B.answered = true;
    const { q } = B, right = a === q.a;
    for (const b of sec.querySelectorAll('.choice')) {
      b.disabled = true;
      if (b.dataset.a === q.a) b.classList.add('ok'); else if (b.dataset.a === a) b.classList.add('ng');
    }
    // 記録: misses はその場で書く（クイズと同じ ±1、0 未満にしない）。ほかは run に積んで、終わりにまとめて書く
    const before = missOf(q.a);
    if (!(misses && typeof misses === 'object')) misses = {};
    misses[q.a] = right ? Math.max(0, before - 1) : before + 1;
    store.set('misses', misses);
    K.runAnswer(B.run, { a: q.a, right, first: !B.missed.has(q.a), hint: false, mode: q.mode, missesBefore: before, missesAfter: misses[q.a] });
    emit('rpg:answer', { a: q.a, right, mode: q.mode, dungeon: B.id, boss: B.boss });
    if (right) hit(); else miss(a);
  };
  // 自動で進む（タイマーの中の例外はページの例外にせず console.error('[rpg]') にする）
  const wait = () => {
    B.waiting = true;
    B.timer = setTimeout(() => { try { advance(); } catch (e) { console.error('[rpg]', e); } }, TB.autoNextMs);
  };
  const hit = () => {
    const { q } = B;
    B.rights++;
    const crit = Math.random() < TB.critRate, dmg = K.damage(B.stats.atk, B.combo, crit);
    // 仲間が1枚以上いれば後ろに「（チリ・ペルーの援護）」を足して、仲間カードが跳ねる（assist）。
    // スマホのログは1行で末尾が … で切れるので、ダメージを先に書く
    const mates = B.stats.party.map(c => nameOf(c.a)).join('・');
    const head = `${crit ? '会心！ ' : ''}${nameOf(q.a)}！ `, tail = mates ? `（${mates}の援護）` : '';
    B.combo++;
    B.maxCombo = Math.max(B.maxCombo, B.combo);
    if (B.boss) {   // ボスはいまの旗の残りだけ（余りは持ち越さない）
      const f = B.flags[B.order[0]];
      f.hp = Math.max(0, f.hp - dmg);
      B.again = f.hp > 0;
      if (!B.again) { f.got = true; B.order.shift(); }
      say(B.again ? `${head}${B.mon.n}に${dmg}ダメージ${tail}` : `${head}旗を取りもどした${tail}`);
    } else {
      B.ehp = Math.max(0, B.ehp - dmg);
      B.got.push(q.a);
      say(`${head}${B.mon.n}に${dmg}ダメージ${tail}`);
    }
    drawTop();
    if (mates) assist();
    RPG.fx('hit', $('bt-mon'), dmg, B.combo);   // モンスターが揺れてダメージの数字が浮かぶ（ドパガキ ON なら効果音・紙吹雪・COMBO）
    if (B.boss ? !B.order.length : B.ehp === 0) return finish(true);
    wait();
  };
  // 上の列の仲間に .rpg-assist を 600ms 付ける（跳ねる・光るは rpg.css。続けて正解したら付け直して最初から）
  const assist = () => {
    const ul = sec.querySelector('.rpg-btop .rpg-party');
    if (!ul) return;
    clearTimeout(B.assistTimer);
    ul.classList.remove('rpg-assist');
    void ul.offsetWidth;   // 付け直したときもアニメーションを最初から
    ul.classList.add('rpg-assist');
    B.assistTimer = setTimeout(() => ul.classList.remove('rpg-assist'), ASSIST_MS);
  };
  // 自動送り（待っているあいだのステージのタップと Enter も）
  const advance = () => {
    if (!B || !B.waiting) return;
    stopTimer();
    nextQ();
  };
  const miss = picked => {   // picked: 押した国コード（鏡の地球の答え合わせで見比べる）
    const { q } = B;
    B.mistakes.push({ a: q.a, mode: q.mode });
    B.missed.add(q.a);
    B.combo = 0;
    B.hp = Math.max(0, B.hp - B.en.atk);
    if (B.boss) { B.order.push(B.order.shift()); B.again = false; }   // いまの旗は後ろに回す
    else {   // 2問あとに同じ国を別の形式で
      if (!B.queue.length) B.queue = refill();
      B.queue.splice(1, 0, { a: q.a, mode: B.tower ? K.towerNextMode(q.mode, B.floor) : K.nextMode(q.mode, B.floor, K.chapterOf(B.id)) });
    }
    drawTop();
    say(`${B.mon.n}の反撃！ ${B.en.atk}ダメージ`);
    RPG.fx('miss', $('bt-hhp'));   // 旅人の HP が赤く光る（ドパガキ ON なら効果音・振動・赤いフラッシュ）
    setPhase('reveal');
    // 答え合わせは選択肢の場所と入れかえて出し、［つぎへ］を押すまで待つ。m2f は地図をもう1枚出さない
    const c = byA.get(q.a), rv = document.createElement('div');
    rv.className = 'reveal rpg-reveal'; rv.id = 'bt-reveal';
    rv.innerHTML = `<p class="verdict ng">ざんねん。正解は「${esc(c.n)}」</p>${factsHTML(c)}`;
    if (B.dg.t) rv.querySelector('.verdict').insertAdjacentHTML('afterend', `<p class="rpg-rv-theme">${esc(c.n)}は${esc(K.THEMES[B.dg.t].n)}だよ</p>`);   // 宇宙: テーマの一言
    const pc = (K.chapterOf(B.id) === 2 || B.similar) && picked !== q.a ? byA.get(picked) : null;
    if (pc) {   // 鏡の地球（と塔の似た旗の問題）: 押した国と正解の国旗を並べて見比べる
      const f = (x, cap) => `<figure><img src="${flag(x.a)}" alt="${esc(cap)}の国旗"><figcaption>${esc(cap)}</figcaption></figure>`;
      rv.querySelector('.verdict').insertAdjacentHTML('afterend', `<p class="rpg-rv-pick">えらんだのは「${esc(pc.n)}」</p><div class="rpg-rv-pair">${f(pc, pc.n)}${f(c, c.n)}</div>`);
    }
    if (q.mode !== 'm2f') rv.append(mapSvg(c, `${c.n}の位置`, { region: B.dg.r }));
    const nx = document.createElement('button');
    nx.type = 'button'; nx.className = 'btn next'; nx.id = 'bt-next'; nx.textContent = 'つぎへ ⏎';
    rv.append(nx);
    sec.querySelector('#bt-q .choices').replaceWith(rv);
    nx.focus({ preventScroll: true });
    // スマホは上の列のすぐ下に答え合わせの頭を出す。PC はふつう選択肢の場所に収まるので動かない。
    // 収まらないとき（幅 900〜1050px・横向きのスマホなど）だけ、右の列の中を［つぎへ］が見えるまでスクロールする（PC のページはスクロールしない）
    if (clearTop(rv)) rv.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    else nx.scrollIntoView({ block: 'nearest' });
  };
  // ［つぎへ］: HP が 0 なら負け（復活はない）
  const next = () => {
    if (!B || B.phase !== 'reveal') return;
    if (B.hp <= 0) return finish(false);
    setPhase('question');
    nextQ();
  };

  // ---- 終わり（1回の RPG.tx で全部書く。イベントは tx が返ってから） ----
  // 次のフロア。ボスのあとは次のダンジョンの F1（地図喰いのあとは無し）
  const nextOf = (id, floor) => {
    if (floor < BOSS) return { id, floor: floor + 1 };
    if (K.CHAPTERS.some(c => c.last === id)) return null;   // 章の最後（地図喰い）のあとは無し。ストーリーは冒険ホームで出す
    const g = DG[DG.findIndex(x => x.id === id) + 1];
    return g ? { id: g.id, floor: 1 } : null;
  };
  const finish = win => {
    if (B.tower) return finishTower(win);
    stopTimer();
    setPhase('end');
    B.win = win;
    const b = B, t = todayStr(), key = `${b.id}:${b.floor}`, mistakes = b.mistakes.length;
    const res = RPG.tx(d => {
      const owned0 = Object.keys(d.cards);
      const receipt = K.settleRun(d, b.run, null, t);
      const shares = RPG.milestones(owned0, Object.keys(d.cards));   // 仲間の節目（50か国・地域の国を全部）
      const first = win && (d.floors[b.id] || 0) < b.floor;
      const coins = K.battleReward(b.en.s, { win, first, boss: b.boss, rights: b.rights });
      d.coins = Math.min(K.BIG, d.coins + coins);
      d.earned = Math.min(K.BIG, d.earned + coins);
      if (win) { d.floors[b.id] = Math.max(d.floors[b.id] || 0, b.floor); delete d.gauge[key]; }
      else d.gauge[key] = Math.min(TB.gaugeMax, (d.gauge[key] || 0) + 1);
      const st = d.st, add = k => { st[k] = Math.min(K.BIG, st[k] + 1); };
      add(win ? 'win' : 'lose');
      if (win && b.boss) add('bossWins');
      if (win && !mistakes) add('nodmg');
      st.combo = Math.max(st.combo, b.maxCombo);
      return { receipt, coins, first, gauge: d.gauge[key] || 0, d, shares };
    });
    if (res) {
      const { receipt: rc, d } = res;
      emit('rpg:battle', { dungeon: b.id, floor: b.floor, boss: b.boss, win, first: res.first, mistakes,
        gauge: res.gauge, maxCombo: b.maxCombo, lv: d.lv, recLv: b.en.recLv });
      if (b.boss && res.first) emit('rpg:clear', { dungeon: b.id });
      RPG.emitCoins(d, res.coins, 'battle');
      RPG.emitCoins(d, rc.overcome.length * T.overcome, 'overcome');
      RPG.emitCoins(d, rc.bounty.length * T.bounty + (rc.bountyAll ? T.bountyAll : 0), 'bounty');
      RPG.announce(rc, d);
    }
    if (B !== b) return;   // イベントを受けた側が画面を変えた
    drawEnd(res || { receipt: null, coins: 0, first: false, gauge: 0, d: null, shares: [] });
  };
  // ボスを初めて倒したときのシェアの文（仲間の数はバトルのあとのセーブ。ユーザーが入れた文字は入れない）
  const bossShareText = (dg, d) => {
    const mates = `仲間 ${K.owned(d)}/${C.length}か国 ${T.share.tag}`;
    if (dg.id === 'blackhole') return `国旗クエストで星喰いをたおして、宇宙を取りもどした！ ${mates}`;
    if (dg.ch === 3) { const n = K.MONSTERS[dg.id][4].n; return `国旗クエストで${n.startsWith(dg.land) ? n : `${dg.land}の${n}`}をたおした！ ${mates}`; }   // 月のウサギ大王・金星の炎は星の名前を重ねない
    if (dg.id === 'mworld') return `国旗クエストで鏡の地図喰いをたおして、ふたつの地球を守った！ ${mates}`;
    return dg.r === 'all' ? `国旗クエストで地図喰いをたおして、世界を取りもどした！ ${mates}` : `国旗クエストで${dg.land}を取りもどした！ ${mates}`;
  };
  const drawEnd = ({ receipt: rc, coins, first, gauge, d, shares }) => {
    const b = B, win = b.win;
    b.next = win ? nextOf(b.id, b.floor) : null;
    $('bt-flee').hidden = true;
    if (win) $('bt-mon')?.classList.add('rpg-dead');   // 倒した: 小さくなって消える（CSS）
    // 仲間・昇格・克服・手配書（クイズの結果のパネルと同じ文）
    const lines = rc ? [
      rc.joined.length && `🤝 ${names(rc.joined)}が仲間になった！`,
      rc.promoted.length && `🏅 ${names(rc.promoted)}がシルバーに！`,
      rc.overcome.length && `✨ 克服！ ${names(rc.overcome)}はもう苦手じゃない +${fmt(T.overcome * rc.overcome.length)}`,
      rc.bounty.length && `📜 手配書 ${names(rc.bounty)} +${fmt(T.bounty * rc.bounty.length)}${rc.bountyAll ? `（3件ぜんぶ +${fmt(T.bountyAll)}）` : ''}`,
    ].filter(Boolean) : [];
    let html = '<div class="rpg-bend" id="bt-end">';
    if (win) {
      html += `<p class="rpg-bend-h">勝利！ ${COIN}+${fmt(coins)}${first ? `<small>（はじめてのクリア ×${TB.firstMul}）</small>` : ''}</p>`;
      if (b.boss && first) html += `<p class="rpg-bend-x">${esc(b.dg.land)}を取りもどした！</p>`;
    } else {
      const missed = [...new Set(b.mistakes.map(x => x.a))].map(a => byA.get(a)).filter(Boolean);
      html += '<p class="rpg-bend-h">やられた…！ でも、まちがえた国はもう覚えたはず</p>'
        + `<p class="rpg-bline">がんばり賞 ${COIN}+${fmt(coins)}</p><p class="rpg-bline">がんばりゲージ ${gauge}/${TB.gaugeMax}</p>`
        + (missed.length ? '<p class="rpg-lbl">まちがえた国</p><ul class="misslist">'
          + missed.map(c => `<li><img src="${flag(c.a)}" alt=""><b>${esc(c.n)}</b><span>${esc(c.c)}</span></li>`).join('') + '</ul>' : '');
    }
    html += lines.map(l => `<p class="rpg-bline">${l}</p>`).join('')
      + '<div class="rpg-shares" id="bt-shares" hidden></div>'
      + '<div class="row center">'
      + (win ? '' : '<button type="button" class="btn ghost" id="bt-practice">この地域を練習する</button><button type="button" class="btn ghost" id="bt-again">もう一回</button>')
      + '<button type="button" class="btn ghost" id="bt-home">冒険ホームへ</button>'
      + (b.next ? '<button type="button" class="btn" id="bt-nextfloor">つぎのフロアへ</button>' : '')
      + '</div></div>';
    $('bt-col').innerHTML = html;
    RPG.drawShares($('bt-shares'), shares || []);   // 仲間の節目に届いたら、その場に［シェア］（設計書 §3.7）
    // ボスを初めて倒した: 取りもどした行の下に［シェア］（押したときだけ共有する）
    if (win && b.boss && first && d) {
      const sb = RPG.shareButton(b.id === 'blackhole' ? 'final3' : b.id === 'mworld' ? 'final2' : b.dg.ch === 3 ? `boss-${b.id}` : b.dg.r === 'all' ? 'final' : `boss-${b.id}`, bossShareText(b.dg, d));   // 地図喰いは final、鏡の地図喰いは final2、星喰いは final3
      sb.id = 'bt-share';
      $('bt-end').querySelector('.rpg-bend-x').after(sb);
    }
    if (win) RPG.fx('win', $('bt-end'));
    else SND.play('lose');
    clearTop($('bt-end'));
    $('bt-end').scrollIntoView({ block: 'nearest' });
    ($('bt-nextfloor') || $('bt-again') || $('bt-home')).focus({ preventScroll: true });
  };
  // この地域を練習する（S と P を書きかえるのはここだけ）
  const practice = () => {
    S.region = B.dg.ch === 3 ? 'all' : B.dg.r; store.set('settings', S);   // 宇宙は地域で絞らない（前に選んでいた地域ではなく全世界で練習する）
    P.kind = 'practice'; store.set('setup', P);
    window.leaveTheme?.();   // まとめページのテーマ（index.html の THEME）が残っていると、この地域ではなくテーマで出題してしまう
    show('setup');
  };

  /* ---------- 英雄の塔（B.tower があるときだけ通る道。設計書 §6） ---------- */
  // f 階を hp（無ければ最大）で始める。cleared はこの回で勝った階。intro なら「あらわれた」画面、ほかはすぐ問題。
  // dungeonOf・unlocked・floors は見ない。地図喰いを倒していない・新しい版のデータのあいだは何もしないで false
  const startTowerFloor = (f, hp, cleared, intro) => {
    if (!Number.isInteger(f) || f < 1 || f > TT.maxFloor || RPG.status === 'readOnly' || !K.towerOpen(RPG.get())) return false;
    const m = missesNow(), t = todayStr();
    let d = null;
    RPG.tx(x => { K.ensureDay(x, m, t, Math.random); d = x; });
    if (RPG.status === 'readOnly') return false;   // いま読んだら新しい版のデータだった（別のタブが書いた）
    d = d || RPG.get();
    stopTimer();
    const en = K.towerEnemy(f), stats = K.towerStats(d), boss = en.boss;
    const flags = boss ? K.towerFlags(d, m, f, Math.random).map(a => ({ a, hp: en.flagHp, got: false })) : [];
    B = {
      id: K.TOWER.id, floor: f, dg: K.TOWER, en, boss, stats, d, mon: K.towerMonster(f),
      run: K.newRun({ sid: `bt-${Date.now().toString(36)}`, kind: 'battle', mode: 'f2n', region: 'all', n: 0, hint: false }, d),
      hp: towerHp(hp, stats.hp), ehp: boss ? 0 : en.hp,
      queue: boss ? [] : K.towerBag(d, m, f, Math.random), last: {},
      flags, order: flags.map((_, i) => i), k: 0, again: false,
      need: boss ? flags.length : K.hitsNeeded(stats, en), got: [],
      phase: intro ? 'intro' : 'question', q: null, shownAt: 0, answered: false, waiting: false, timer: 0, win: null, next: null,
      combo: 0, maxCombo: 0, rights: 0, mistakes: [], missed: new Set(),
      // hp0: 登場画面で編成を切り替えたときの HP（最初の階だけ）。ended: rpg:tower-end を出したか
      tower: { maxHp: stats.hp, cleared, hp0: intro ? hp : null, ended: false }, similar: false,
    };
    sec.innerHTML = stageHTML();
    drawTop();
    if (intro) $('bt-col').innerHTML = introHTML();
    if (sec.hidden) { RPG.opts = {}; show('battle'); }
    // 階を始めるたび（2階から先と［もう一度］はバトル画面のままで drill:screen が出ない）。badges.js はバトル中としてトーストを保留する
    emit('rpg:tower-floor', { floor: f });
    if (intro) $('bt-fight')?.focus({ preventScroll: true });
    else nextQ();
    return true;
  };
  // startTowerFloor を呼ぶ（tryStart と同じく、例外は console.error('[rpg]') にして始めていない画面を出す）。
  // 片付ける前に、その回（始めかけた階の B、まだなら前の階の B）を終わりにする（rpg:tower-end は回で1回だけ）
  const tryTower = (f, hp, cleared, intro) => {
    const prev = B;
    try { return startTowerFloor(f, hp, cleared, intro); } catch (e) {
      console.error('[rpg]', e);
      const r = B && B.tower ? B : prev;
      if (r && r.tower) { try { endTower(r); } catch (err) { console.error('[rpg]', err); } }
      drop();
      idle();
      return false;
    }
  };
  // その回の終わり（負け・やめる・にげる・画面を離れる）。1回の回で1回だけ rpg:tower-end
  const endTower = b => {
    if (b.tower.ended) return;
    b.tower.ended = true;
    emit('rpg:tower-end', { cleared: b.tower.cleared, best: RPG.get().tower?.best ?? 0 });
  };
  // 1階の終わり（1回の RPG.tx で全部書く）。勝てば塔のごほうびと best、負けは st.lose だけ。
  // floors・ゲージ・bossWins・nodmg・combo・rpg:clear はさわらない
  const finishTower = win => {
    stopTimer();
    const b = B, f = b.floor, t = todayStr(), mistakes = b.mistakes.length;
    b.win = win;
    setPhase('end');
    const res = RPG.tx(d => {
      const owned0 = Object.keys(d.cards);
      const receipt = K.settleRun(d, b.run, null, t);
      const shares = RPG.milestones(owned0, Object.keys(d.cards));
      const best0 = d.tower.best, r = win ? K.towerReward(f, best0) : { coins: 0, bonus: 0 }, coins = r.coins + r.bonus;
      d.coins = Math.min(K.BIG, d.coins + coins);
      d.earned = Math.min(K.BIG, d.earned + coins);
      if (win) d.tower.best = Math.max(best0, f);
      d.st[win ? 'win' : 'lose'] = Math.min(K.BIG, d.st[win ? 'win' : 'lose'] + 1);
      return { receipt, coins, base: r.coins, bonus: r.bonus, newBest: d.tower.best > best0, d, shares };
    });
    // 勝っても保存できなかった（新しい版のデータ）なら、クリアに数えず回を終える
    const saved = win && !!res;
    if (saved) {
      setPhase('tclear');
      b.tower.cleared = Math.max(b.tower.cleared, f);
      // 回復はつぎの階の最大 HP で（この階で仲間入りすると、おまかせ編成の最大 HP が上がる）
      b.tower.maxHp = K.towerStats(res.d).hp;
      b.hp = K.towerHeal(b.hp, b.tower.maxHp, f);
    }
    if (res) {
      const { receipt: rc, d } = res;
      emit('rpg:battle', { dungeon: b.id, floor: f, boss: b.boss, win, first: res.newBest, mistakes,
        gauge: 0, maxCombo: b.maxCombo, lv: d.lv, recLv: b.en.recLv });
      RPG.emitCoins(d, res.coins, 'tower');
      RPG.emitCoins(d, rc.overcome.length * T.overcome, 'overcome');
      RPG.emitCoins(d, rc.bounty.length * T.bounty + (rc.bountyAll ? T.bountyAll : 0), 'bounty');
      RPG.announce(rc, d);
      emit('rpg:tower', { floor: f, win, best: d.tower.best, newBest: res.newBest, coins: res.coins });
    }
    if (!saved) endTower(b);
    if (B !== b) return;   // イベントを受けた側が画面を変えた
    const r = res || { receipt: null, coins: 0, base: 0, bonus: 0, shares: [] };
    if (saved) drawTowerClear(r); else drawTowerEnd(r);
  };
  // 仲間・昇格・克服・手配書の行（drawEnd と同じ文）
  const receiptLines = rc => rc ? [
    rc.joined.length && `🤝 ${names(rc.joined)}が仲間になった！`,
    rc.promoted.length && `🏅 ${names(rc.promoted)}がシルバーに！`,
    rc.overcome.length && `✨ 克服！ ${names(rc.overcome)}はもう苦手じゃない +${fmt(T.overcome * rc.overcome.length)}`,
    rc.bounty.length && `📜 手配書 ${names(rc.bounty)} +${fmt(T.bounty * rc.bounty.length)}${rc.bountyAll ? `（3件ぜんぶ +${fmt(T.bountyAll)}）` : ''}`,
  ].filter(Boolean) : [];
  // 階クリアの画面（phase 'tclear'）: もらったコイン・はじめて勝った階のボーナス・回復したあとの HP。［やめる］［つぎの階へ］
  const drawTowerClear = ({ receipt: rc, base, bonus, shares }) => {
    const b = B, f = b.floor;
    $('bt-flee').hidden = true;
    $('bt-mon')?.classList.add('rpg-dead');
    drawTop();   // 回復した HP を上の列にも
    $('bt-col').innerHTML = '<div class="rpg-bend rpg-tclear" id="bt-tclear">'
      + `<p class="rpg-bend-h">${fmt(f)}階クリア！ ${COIN}+${fmt(base)}</p>`
      + (bonus ? `<p class="rpg-bend-x">はじめて勝った階 ${COIN}+${fmt(bonus)}</p>` : '')
      + `<p class="rpg-bline">HP ${fmt(b.hp)}/${fmt(b.tower.maxHp)}${b.boss ? '（中ボスをたおして全回復！）' : `（${Math.round(TT.healPct * 100)}%回復）`}</p>`
      + receiptLines(rc).map(l => `<p class="rpg-bline">${l}</p>`).join('')
      + '<div class="rpg-shares" id="bt-shares" hidden></div>'
      + '<div class="row center"><button type="button" class="btn ghost" id="bt-tquit">やめる</button>'
      + `<button type="button" class="btn" id="bt-tnext">つぎの階へ（${fmt(f + 1)}階）</button></div></div>`;
    RPG.drawShares($('bt-shares'), shares || []);
    RPG.fx('win', $('bt-tclear'));
    clearTop($('bt-tclear'));
    $('bt-tclear').scrollIntoView({ block: 'nearest' });
    $('bt-tnext').focus({ preventScroll: true });
  };
  // 回の終わりの画面（phase 'end'。負け・やめる）: 「英雄の塔 n階まで（自己ベスト m階）」。［冒険へ］［もう一度（1階から）］
  const drawTowerEnd = ({ receipt: rc, shares }) => {
    const b = B, cl = b.tower.cleared, best = RPG.get().tower?.best ?? 0, lost = b.win === false;
    $('bt-flee').hidden = true;
    const missed = lost ? [...new Set(b.mistakes.map(x => x.a))].map(a => byA.get(a)).filter(Boolean) : [];
    $('bt-col').innerHTML = '<div class="rpg-bend rpg-tend" id="bt-end">'
      + `<p class="rpg-bend-h">${lost ? 'やられた…！' : 'おつかれさま！'}</p>`
      + (RPG.status === 'readOnly' ? `<p class="rpg-warn" role="status">${RPG.warn}</p>` : '')   // 保存できなかった（新しい版のデータ）
      + `<p class="rpg-bend-x">英雄の塔 ${cl ? `${fmt(cl)}階まで` : lost ? '1階でたおれた' : 'クリアした階なし'}${best ? `<small>（自己ベスト ${fmt(best)}階）</small>` : ''}</p>`
      + (missed.length ? '<p class="rpg-lbl">まちがえた国</p><ul class="misslist">'
        + missed.map(c => `<li><img src="${flag(c.a)}" alt=""><b>${esc(c.n)}</b><span>${esc(c.c)}</span></li>`).join('') + '</ul>' : '')
      + receiptLines(rc).map(l => `<p class="rpg-bline">${l}</p>`).join('')
      + '<div class="rpg-shares" id="bt-shares" hidden></div>'
      + '<div class="row center"><button type="button" class="btn ghost" id="bt-home">冒険へ</button>'
      + '<button type="button" class="btn" id="bt-tretry">もう一度（1階から）</button></div></div>';
    RPG.drawShares($('bt-shares'), shares || []);
    if (lost) SND.play('lose');
    clearTop($('bt-end'));
    $('bt-end').scrollIntoView({ block: 'nearest' });
    $('bt-tretry').focus({ preventScroll: true });
  };
  // ［つぎの階へ］: HP を持ちこして、すぐ問題。始められなかったら（新しい版のデータなど）その回はここまで
  // （例外のときは tryTower が回を終えて片付けている）
  const towerNext = () => {
    if (!B || !B.tower || B.phase !== 'tclear') return;
    const b = B;
    if (tryTower(b.floor + 1, b.hp, b.tower.cleared, false) || B !== b) return;
    setPhase('end');
    endTower(b);
    if (B === b) drawTowerEnd({ receipt: null, shares: [] });
  };
  // ［やめる］: その回はここまで（best は勝ったときにもう書いてある）
  const towerQuit = () => {
    if (!B || !B.tower || B.phase !== 'tclear') return;
    const b = B;
    setPhase('end');
    endTower(b);
    if (B === b) drawTowerEnd({ receipt: null, shares: [] });
  };

  // ---- にげる（ペナルティなし・報酬なし・ゲージも増えない） ----
  // バトルが続いていれば st.flee を数える。それから片付ける（run は捨てる。misses はもう書いてある）
  // 塔は st.flee を数えず、その回をそこで終わりにする（rpg:tower-end）
  const flee = () => {
    if (!B) return;
    if (B.tower) endTower(B);
    else if (ONGOING.has(B.phase)) RPG.tx(d => { d.st.flee = Math.min(K.BIG, d.st.flee + 1); });
    drop();
  };
  // ［← にげる］と Esc。先に片付けてから冒険ホームへ（show が出す drill:screen では、もう数えない）
  const askFlee = () => {
    if (!B || B.phase === 'end' || B.phase === 'tclear' || !confirm(B.tower ? FLEE_ASK_TOWER : FLEE_ASK)) return;
    flee();
    show('rpg');
  };
  // バトル中にトップバーなどで別の画面へ行ったら、確認なしでにげたことにする（登場画面と終わりの画面では片付けるだけ）
  document.addEventListener('drill:screen', e => {
    try { if (e.detail?.name !== 'battle' && B) flee(); } catch (err) { console.error('[rpg]', err); }
  });

  /* ---------- 押す・キー ---------- */
  // ダブルクリックの2回目（e.detail > 1）は無視。選択肢は出題から guardMs のあいだ押せない（自動送りを待たずに進んだタップが次の問題に当たらない）
  sec.addEventListener('click', e => {
    try {
      if (e.detail > 1) return;
      const btn = e.target.closest?.('button');
      if (!B) { if (btn?.id === 'bt-home') show('rpg'); return; }
      if (btn?.classList.contains('choice')) {
        if (performance.now() - B.shownAt >= TB.guardMs) answer(btn.dataset.a);
        return;
      }
      if (btn) {
        const b = B;
        ({
          'bt-flee': askFlee, 'bt-fight': fight, 'bt-next': next, 'bt-practice': practice,
          'bt-tprev': () => switchTeam(-1, 'bt-tprev'), 'bt-team': editTeam,
          // 'bt-tnext' は登場画面では次の編成、塔の階クリアの画面ではつぎの階へ（同時には出ない）
          'bt-tnext': () => b.phase === 'tclear' ? towerNext() : switchTeam(1, 'bt-tnext'),
          'bt-tquit': towerQuit, 'bt-tretry': () => tryTower(1, null, 0, true),
          'bt-nextfloor': () => b.next && tryStart(b.next.id, b.next.floor),
          'bt-again': () => tryStart(b.id, b.floor),
          'bt-home': () => show('rpg'),
        })[btn.id]?.();
        return;
      }
      if (B.waiting) advance();   // 自動送りを待っているあいだにステージをタップ → すぐ次へ
    } catch (err) { console.error('[rpg]', err); }
  });
  // #scr-battle が見えていて、#detail が開いておらず、入力欄にフォーカスがないときだけ。キーの押しっぱなし（e.repeat）は無視
  document.addEventListener('keydown', e => {
    try {
      if (!B || sec.hidden || $('detail')?.open || e.target?.matches?.('input, select, textarea') || e.repeat) return;
      if (/^[1-4]$/.test(e.key)) {
        const b = sec.querySelectorAll('.choice')[+e.key - 1];
        if (b && !b.disabled) b.click();
      } else if (e.key === 'Enter') {
        // フォーカスが押せるボタンにあるときは、ボタン自身の click に任せる（二重に進まない）
        const f = document.activeElement;
        if (f instanceof HTMLButtonElement && !f.disabled) return;
        if (B.phase === 'intro') $('bt-fight')?.click();
        else if (B.phase === 'reveal') $('bt-next')?.click();
        else if (B.waiting) advance();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && B.phase === 'intro') {
        e.preventDefault();
        switchTeam(e.key === 'ArrowLeft' ? -1 : 1, 'bt-fight');
      } else if (e.key === 'Escape') askFlee();
    } catch (err) { console.error('[rpg]', err); }
  });

  /* ---------- 起動: 画面は <section> を作ってから登録する ---------- */
  const foot = wrap.querySelector(':scope > footer');
  if (foot) foot.before(sec); else wrap.append(sec);
  registerScreen('battle', render);

  window.RPG_BATTLE = {
    start: tryStart,   // 外から呼んでも、例外のときは片付けてから始めていない画面を出す
    // いまの問題の国コード（問題・答え合わせのあいだ。ほかは null）
    cur: () => B && B.q && B.phase !== 'intro' && B.phase !== 'end' ? B.q.a : null,
    state: () => ({
      phase: B ? B.phase : null, mode: B && B.q ? B.q.mode : null, shownAt: B ? B.shownAt : 0, win: B ? B.win : null,
      // 塔: いまの階・HP・最大 HP・この回で勝った階（塔でなければ null）。similar はいまの問題が似た旗の4択か
      tower: B && B.tower ? { f: B.floor, hp: B.hp, maxHp: B.tower.maxHp, cleared: B.tower.cleared } : null,
      similar: !!(B && B.similar),
      // 次の問題の国（先に国旗を読んでおく国。ボス・まだ決まっていないときは null）
      next: B && !B.boss && B.queue?.[0] ? B.queue[0].a : null,
    }),
    // 英雄の塔を1階から（地図喰いを倒していなければ false）
    startTower: () => tryTower(1, null, 0, true),
    // 開発用: 塔の f 階から（hp を渡せばその HP で。f − 1 階まで勝ったことにする）。開いていないセーブでは false
    debugTower: (f, hp) => { f = +f; return tryTower(f, hp, Number.isInteger(f) ? f - 1 : 0, true); },
    // テストと開発用: いまの問題をその国・形式に置きかえる（ボスはいまの旗の国も入れかえる）。置きかえたら true
    force(a, mode) {
      if (!B || !byA.has(a) || !MODES.has(mode) || B.phase !== 'question') return false;
      stopTimer();
      if (B.boss) {
        const i = B.order[0], j = B.flags.findIndex(f => f.a === a && !f.got);
        if (j >= 0 && j !== i) B.flags[j].a = B.flags[i].a;   // 同じ国の旗が2枚にならないように入れかえる
        B.flags[i].a = a;
        B.again = false;
      }
      B.q = { a, mode };
      showQ();
      return true;
    },
  };
})();
