// 管理ページ（admin.html）の画面の動き。セーブの読み書きは admin-save.js（ADMIN_SAVE）に任せる。
// 変わる文字（キー名・セーブの中身・国名など）はいつも textContent / value / setAttribute で入れる。innerHTML は使わない。
// 本編の S（設定）はここでは作らない: sound.js は S が無いと「効果音オン・音量70」で鳴らすので、効果音のテスト（D10）が本編の設定に左右されない。
(() => {
  // ---- よそのページの iframe の中では何も出さない（meta の CSP では frame-ancestors が効かないので、ここで止める） ----
  if (window.top !== window.self) {
    document.documentElement.style.setProperty('display', 'none', 'important');
    try { window.top.location = location.href; } catch { /* 抜け出せなくても、隠したまま何も作らない */ }
    return;
  }
  // ---- 画面の色（本編の head の先読みと同じ）。DOM ができる前、head で読まれた時点で当てる ----
  try {
    const t = (JSON.parse(localStorage.getItem('settings')) || {}).theme ?? 'light';
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch { /* 読めなければ端末の設定のまま */ }
  const applyTheme = t => { if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };

  // D12 のつながるか確かめるだけに使う。admin-api.js が URL/KEY を出していればそれを使い、無ければ同じ値（admin-api.js と ranking.js と同じ）
  const SUPABASE = globalThis.ADMIN_API?.URL ?? 'https://vgdkklvhtvcamtxwjpke.supabase.co';
  const PUBLIC_KEY = globalThis.ADMIN_API?.KEY ?? 'sb_publishable_eFVPaD9rNRdqi_1LtXxmGg_yJACIRqV';
  const MODE_LABEL = { f2n: '国旗→国名', n2f: '国名→国旗', m2f: '場所→国旗', f2m: '国旗→場所' };
  const REGIONS = ['アジア', 'ヨーロッパ', 'アフリカ', '北・中央アメリカ', '南アメリカ', 'オセアニア'];

  const $ = id => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k.startsWith('data-') || k.startsWith('aria-')) e.setAttribute(k, v);
      else e[k] = v;
    }
    e.append(...kids);
    return e;
  };
  const pad = n => String(n).padStart(2, '0');
  const hms = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const ymd = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const fmtBytes = n => n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
  const fmtAt = iso => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${hms(d)}`; };

  let SAVE, toastTimer = 0, current = '';   // current: D2 で選んでいるキー

  function toast(msg, bad = false) {
    const t = $('adm-toast');
    t.textContent = msg;
    t.classList.toggle('bad', bad);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.textContent = ''; }, 3500);
  }
  const REASON = { not_json: 'JSONが壊れてるよ。保存しなかった', bad_shape: '本編のセーブの形じゃないよ。保存しなかった', storage: 'この端末に書けなかった（容量か設定）', bad_file: '国旗マスターのセーブファイルじゃないよ。何も変えてない', missing: '見つからなかった',
    newer: '新しい版のセーブなので変えられないよ（ページを読み直してね）' };
  const fail = r => toast(REASON[r?.reason] ?? 'うまくいかなかった', true);
  // ok:false の返事なら知らせて false。rpgEdit などは書いた値そのものを返すので、ok が無ければ成功
  const done = (r, msg) => { if (r && r.ok === false) { fail(r); return false; } if (msg) toast(msg); renderAll(); return true; };

  // 危ない操作: confirm で確かめて、OK なら自動でスナップショットを取ってからする（やめたときはスナップショットも取らない）
  function danger(label, fn) {
    if (!confirm(`「${label}」していい？\n（する前に今の状態をスナップショットに自動で取っておくよ）`)) return;
    const s = SAVE.snapSave(`自動 ${label} ${hms()}`);
    if (!s.ok) { toast('自動のスナップショットが取れなかったので、やめておいたよ', true); return; }
    safe('d-snaps', renderSnaps);
    fn();
  }

  // ---- タブ ----
  function showTab(name) {
    for (const b of $('adm-tabs').querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== `tab-${name}`;
    onTab(name);
  }

  // ---- D1・D2 セーブ一覧と中身 ----
  function renderKeys() {
    const r = SAVE.keys(), ul = $('d-keys');
    ul.replaceChildren();
    if (!Array.isArray(r)) { ul.append(el('li', { text: 'この端末のセーブが読めない' })); return; }
    if (!r.length) ul.append(el('li', { class: 'muted', text: 'セーブは何もないよ' }));
    for (const { key, bytes } of r) {
      ul.append(el('li', {},
        el('span', { class: 'grow' }, el('button', { class: 'keybtn', 'data-key': key, 'aria-pressed': String(key === current), text: key })),
        el('span', { class: 'mono muted', text: fmtBytes(bytes) })));
    }
  }
  function pick(key) {
    current = key;
    $('d-key').value = key;
    const r = SAVE.read(key);
    $('d-json').value = r.ok ? JSON.stringify(r.value, null, 2) : (r.raw ?? '');
    if (!r.ok && r.reason === 'not_json') toast('JSON じゃない値だよ（そのままでは保存できない）', true);
    renderKeys();
  }
  function saveJson() {
    const key = $('d-key').value.trim();
    if (!key) { toast('キーを入れてね', true); return; }
    const r = SAVE.write(key, $('d-json').value);
    if (r.ok === false) { toast(r.reason === 'not_json' ? 'JSONが壊れてる。保存しなかったよ' : REASON[r.reason] ?? 'うまくいかなかった', true); return; }
    toast(`${key} を保存したよ`);
    renderAll();
    pick(key);
  }
  function deleteKey() {
    const key = $('d-key').value.trim();
    if (!key) { toast('キーを選んでね', true); return; }
    danger(`${key} を消す`, () => {
      if (!done(SAVE.remove(key), `${key} を消したよ`)) return;
      current = ''; $('d-key').value = ''; $('d-json').value = '';
      renderKeys();
    });
  }
  async function copyJson() {
    try { await navigator.clipboard.writeText($('d-json').value); toast('コピーしたよ'); }
    catch { $('d-json').select(); toast('コピーできなかった。選んだので手でコピーしてね', true); }
  }

  // ---- D3 バックアップ ----
  let dlUrl = '';
  function prepareDownload() {   // a[download] を押した瞬間に、今のセーブで中身を作る
    const a = $('d-dl');
    if (dlUrl) URL.revokeObjectURL(dlUrl);
    dlUrl = URL.createObjectURL(new Blob([JSON.stringify(SAVE.exportAll(), null, 2)], { type: 'application/json' }));
    a.href = dlUrl;
    a.download = `country-drill-save-${ymd()}.json`;
  }
  async function importFile(e) {
    const input = e.target, file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { toast('ファイルが JSON じゃないよ。何も変えてない', true); return; }
    if (!obj || obj.app !== 'country-drill' || obj.kind !== 'save') { fail({ reason: 'bad_file' }); return; }
    danger('ファイルから読み戻す', () => done(SAVE.importAll(obj), 'ファイルから読み戻したよ'));
  }

  // ---- D4 スナップショット ----
  function renderSnaps() {
    const ul = $('d-snap-list'), list = SAVE.snapList();
    ul.replaceChildren();
    if (!list.length) ul.append(el('li', { class: 'muted', text: 'まだないよ' }));
    for (const s of list.slice().reverse()) {
      ul.append(el('li', { 'data-snap': s.name },
        el('span', { class: 'grow' }, el('b', { text: s.name }), ' ', el('span', { class: 'mono muted', text: fmtAt(s.at) })),
        el('button', { class: 'btn sm', 'data-act': 'load', text: '戻す' }),
        el('button', { class: 'btn danger sm', 'data-act': 'del', text: '消す' })));
    }
  }
  function snapAct(e) {
    const b = e.target.closest('[data-act]'), li = b?.closest('[data-snap]');
    if (!li) return;
    const name = li.dataset.snap;
    if (b.dataset.act === 'del') {
      if (confirm(`スナップショット「${name}」を消していい？`)) done(SAVE.snapDelete(name), '消したよ');
      return;
    }
    // 先に中身を取っておく（自動のスナップショットで5個を超えて、戻したいものが押し出されても戻せるように）
    const all = SAVE.read('adminSnaps'), snap = all.ok && Array.isArray(all.value) ? all.value.find(s => s && s.name === name) : null;
    if (!snap) { fail({ reason: 'missing' }); return; }
    danger(`「${name}」に戻す`, () => done(SAVE.importAll({ app: 'country-drill', kind: 'save', data: snap.data }), `「${name}」に戻したよ`));
  }
  function snapSave() {
    const name = $('d-snap-name').value.trim() || `手動 ${hms()}`;
    if (done(SAVE.snapSave(name), `「${name}」を保存したよ`)) $('d-snap-name').value = '';
  }

  // ---- D5 冒険 ----
  function renderRpg() {
    let x;
    try { x = SAVE.rpgGet(); } catch { $('d-rpg-sum').replaceChildren(el('dt', { text: '冒険' }), el('dd', { text: '読めない' })); return; }
    const has = SAVE.read('rpg').ok;
    const sum = [['セーブ', has ? 'あり' : 'まだない（さわると新しく作る）'], ['コイン', x.coins.toLocaleString('ja-JP')], ['Lv', x.lv],
      ['仲間', `${Object.keys(x.cards).length}か国`], ['天井カウンター', x.pity], ['ストーリー既読', `${x.story.length}話`]];
    $('d-rpg-sum').replaceChildren(...sum.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { class: 'mono', text: String(v) })]));
    $('d-rpg-lv').max = RPG_CORE.TUNING.hero.maxLv;
    if (document.activeElement !== $('d-rpg-lv')) $('d-rpg-lv').value = x.lv;
    if (document.activeElement !== $('d-rpg-pity')) $('d-rpg-pity').value = x.pity;
    const box = $('d-rpg-floors');
    box.replaceChildren(...RPG_CORE.DUNGEONS.map(g => {
      const sel = el('select', { 'data-floor': g.id, 'aria-label': `${g.name}のフロア` },
        ...[0, 1, 2, 3, 4, 5].map(n => el('option', { value: String(n), text: n === 5 ? '5 ★' : String(n) })));
      sel.value = String(x.floors[g.id] || 0);
      return el('label', { class: 'floor', title: g.name }, el('span', { text: g.name }), sel);
    }));
  }
  function rpgCard() {
    const code = $('d-rpg-card').value.trim().toLowerCase();
    const c = COUNTRIES.find(x => x.a === code);
    if (!c) { toast('その国コードは無いよ（jp・fr のような2文字）', true); return; }
    if (done(SAVE.rpgGiveCard(code), `${c.n} のカードをあげたよ`)) $('d-rpg-card').value = '';
  }

  // ---- D7 バッジ ----
  function renderBadges() {
    const r = SAVE.read('badges'), got = r.ok && r.value && r.value.got && typeof r.value.got === 'object' ? r.value.got : {};
    const cat = BADGES_CORE.makeCatalog(COUNTRIES), list = $('d-badges-list');
    let n = 0, total = 0;
    list.replaceChildren(...cat.flatMap(b => b.tiers.map((t, i) => {
      const key = `${b.id}@${i + 1}`, on = Object.hasOwn(got, key);
      total++; if (on) n++;
      const box = el('input', { type: 'checkbox', checked: on, 'data-step': key });
      return el('label', {}, box, el('span', { text: `${b.icon} ${b.name}${b.tiers.length > 1 ? ` ${i + 1}段目` : ''}「${t.title}」` }));
    })));
    $('d-badges-sum').textContent = `${n} / ${total} ステップ取ってる`;
  }

  // ---- D8 今日の難問 ----
  function renderDaily() {
    const input = $('d-daily-day');
    if (!input.value) input.value = DAILY_CORE.jstDay();
    const day = input.value, body = $('d-daily-body');
    if (!DAILY_CORE.validDay(day)) { body.replaceChildren(el('tr', {}, el('td', { colSpan: 4, text: '日付がおかしいよ' }))); return; }
    const qs = SAVE.dailyQuestions(day);
    body.replaceChildren(...qs.map((q, i) => el('tr', {},
      el('td', { class: 'n', text: String(i + 1) }),
      el('td', {}, q.n, ' ', el('span', { class: 'mono muted', text: q.a })),
      el('td', { text: MODE_LABEL[q.mode] ?? q.mode }),
      el('td', {}, el('span', { class: 'mono', text: `${q.opts.indexOf(q.a) + 1}番目` }), ' ', q.n))));
    const rec = SAVE.read('daily');
    $('d-daily-rec').textContent = rec.ok && rec.value
      ? `この端末の記録: ${rec.value.day ?? '?'}（${rec.value.status ?? '?'}${rec.value.correct != null ? `・${rec.value.correct}問正解` : ''}）`
      : 'この端末の記録: まだない';
  }

  // ---- D9 設定 ----
  function renderSettings() {
    const s = SAVE.settingsGet();
    $('d-set-theme').value = ['light', 'dark', 'auto'].includes(s.theme) ? s.theme : 'light';
    const reg = $('d-set-region'), cur = s.region ?? 'all';
    const opts = [['all', '全世界'], ...REGIONS.map(r => [r, r])];
    if (!opts.some(([v]) => v === cur)) opts.push([cur, cur]);
    reg.replaceChildren(...opts.map(([v, l]) => el('option', { value: v, text: l })));
    reg.value = cur;
    $('d-set-sound').checked = s.sound !== false;
    $('d-set-vol').value = Number.isFinite(+s.vol) ? s.vol : 70;
    $('d-set-vol-n').textContent = $('d-set-vol').value;
    $('d-set-dopa').checked = !!s.dopa;
  }
  function saveSettings() {
    const patch = { theme: $('d-set-theme').value, region: $('d-set-region').value, sound: $('d-set-sound').checked, vol: +$('d-set-vol').value, dopa: $('d-set-dopa').checked };
    if (done(SAVE.settingsSet(patch), '設定を保存したよ')) applyTheme(patch.theme);
  }

  // ---- D10 効果音 ----
  function renderSounds() {
    $('d-sound-list').replaceChildren(...SND.kinds.map(k => el('button', { class: 'btn ghost sm', 'data-snd': k, text: k })));
  }

  // ---- D12 端末の情報 ----
  function renderEnv(extra = {}) {
    const mm = q => matchMedia(q).matches;
    const keys = SAVE.keys(), used = Array.isArray(keys) ? keys.reduce((n, k) => n + k.bytes + k.key.length, 0) : null;
    const rows = [
      ['ブラウザ', navigator.userAgent],
      ['画面', `${screen.width}×${screen.height}（窓 ${innerWidth}×${innerHeight}・倍率 ${devicePixelRatio}）`],
      ['ダーク/ライト', `端末は${mm('(prefers-color-scheme: dark)') ? 'ダーク' : 'ライト'}・このページは${document.documentElement.dataset.theme ?? '端末に合わせる'}`],
      ['動きを減らす', mm('(prefers-reduced-motion: reduce)') ? 'オン' : 'オフ'],
      ['タッチ', mm('(hover: none) and (pointer: coarse)') ? 'タッチ中心' : 'マウス・トラックパッド'],
      ['localStorage', used == null ? '読めない' : `${fmtBytes(used)}（${keys.length}個のキー）`],
      ['オンライン', navigator.onLine ? 'オンライン' : 'オフライン'],
      ['Supabase', extra.ping ?? '下のボタンで確かめる'],
    ];
    $('d-env-list').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
  }
  let lastPing;
  async function ping() {
    renderEnv({ ping: 'しらべてる…' });
    const t0 = performance.now();
    try {
      const res = await fetch(`${SUPABASE}/auth/v1/health`, { headers: { apikey: PUBLIC_KEY }, signal: AbortSignal.timeout(8000) });
      lastPing = `つながる（HTTP ${res.status}・${Math.round(performance.now() - t0)}ms）`;
    } catch { lastPing = 'つながらない'; }
    renderEnv({ ping: lastPing });
  }

  // ---- D14 データ点検 ----
  function renderCheck() {
    const { problems, counts } = SAVE.checkData();
    const sum = $('d-check-sum');
    sum.replaceChildren(el('span', { class: problems.length ? 'ng' : 'ok', text: problems.length ? `${problems.length}件おかしい` : '問題なし' }),
      `（${counts.countries}か国・${counts.regions}地域）`);
    $('d-check-list').replaceChildren(...problems.map(p => el('li', { text: p })));
  }

  // 区画ごとに描く。1つが壊れたセーブで例外を出しても、その区画にだけ1行出して、ほかの区画は描く
  function safe(secId, fn) {
    const body = $(secId)?.querySelector('.body') ?? $(secId);
    let line = body?.querySelector(':scope > p[data-err]');
    try { fn(); line?.remove(); }
    catch (e) {
      if (!body) return;
      if (!line) { line = el('p', { class: 'ng', 'data-err': '' }); body.prepend(line); }
      line.textContent = `この区画を出せなかった（${String(e && e.message || e).slice(0, 200)}）`;
    }
  }
  function renderAll() {
    safe('d-saves', renderKeys); safe('d-snaps', renderSnaps); safe('d-rpg', renderRpg); safe('d-badges', renderBadges);
    safe('d-daily', renderDaily); safe('d-settings', renderSettings); safe('d-env', () => renderEnv({ ping: lastPing }));
  }

  // ======== ランキング（S1〜S4・S6・S7・S12〜S14）。サーバーから来た文字は textContent だけで入れる ========
  const PAGE = 100;
  const KIND_LABEL = { scores: 'タイムアタック', daily: '今日の難問', rpg: '冒険', trash: 'ゴミ箱' };
  const ACTION = { delete: '消す', restore: '戻す', rename: '名前を変える' };
  const LOGIN_MSG = { bad_login: 'メールかパスワードがちがうよ', not_admin: 'このアカウントは管理者じゃないよ', network: 'つながらなかった' };
  const RENAME_MSG = { bad_name: '名前は1〜12文字だよ', ng_name: '使えない言葉が入ってるよ', name_taken: 'その名前はもう使われてるよ', not_found: 'その記録はもう無いよ' };
  const fmtMs = ms => Number.isFinite(+ms) ? `${(ms / 1000).toFixed(2)}秒` : '';
  const fmtFull = iso => { const d = new Date(iso); return iso == null || Number.isNaN(+d) ? '' : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const str = v => v == null ? '' : String(v);
  // 表の列: [見出し, 値を文字にする関数, td の class]
  const COLS = {
    scores: [['id', r => str(r.id), 'n'], ['ボード', r => str(r.board), 'brk'], ['名前', r => str(r.nickname), 'name'], ['タイム', r => fmtMs(r.time_ms), 'n'],
      ['問題', r => str(r.questions), 'n'], ['いつ', r => fmtFull(r.created_at), 'n']],
    daily: [['id', r => str(r.id), 'n'], ['日付', r => str(r.day), 'n'], ['名前', r => str(r.nickname), 'name'], ['正解', r => `${str(r.correct)}/${str(r.total)}`, 'n'],
      ['タイム', r => fmtMs(r.time_ms), 'n'], ['いつ', r => fmtFull(r.created_at), 'n']],
    rpg: [['id', r => str(r.id), 'n'], ['名前', r => str(r.nickname), 'name'], ['Lv', r => str(r.lv), 'n'], ['ダンジョン', r => str(r.dungeons), 'n'],
      ['フロア', r => str(r.floors), 'n'], ['登録', r => fmtFull(r.created_at), 'n'], ['更新', r => fmtFull(r.updated_at ?? r.at), 'n']],
    trash: [['id', r => str(r.id), 'n'], ['種類', r => KIND_LABEL[r.kind] ?? str(r.kind), ''], ['名前', r => str(r.row_data?.nickname), 'name'],
      ['中身', r => trashSummary(r), 'brk'], ['消した', r => fmtFull(r.at), 'n']],
  };
  // CSV の列（行の生の値。ゴミ箱は row_data を JSON のまま）
  const CSV_COLS = {
    scores: ['id', 'board', 'nickname', 'time_ms', 'questions', 'created_at'],
    daily: ['id', 'day', 'nickname', 'correct', 'total', 'time_ms', 'created_at'],
    rpg: ['id', 'nickname', 'lv', 'dungeons', 'floors', 'created_at', 'updated_at'],
    trash: ['id', 'kind', 'at', 'row_data'],
  };
  function trashSummary(t) {
    const d = t.row_data || {};
    if (t.kind === 'scores') return `id ${str(d.id)}・${str(d.board)}・${fmtMs(d.time_ms)}`;
    if (t.kind === 'daily') return `id ${str(d.id)}・${str(d.day)}・${str(d.correct)}/${str(d.total)}・${fmtMs(d.time_ms)}`;
    if (t.kind === 'rpg') return `id ${str(d.id)}・Lv ${str(d.lv)}・ダンジョン ${str(d.dungeons)}・フロア ${str(d.floors)}`;
    return '';
  }
  function logDetail(l) {
    const d = l.detail || {};
    if (l.action === 'delete') { const ids = Array.isArray(d.ids) ? d.ids : []; return `${ids.length}件（id ${ids.slice(0, 20).join(', ')}${ids.length > 20 ? ' …' : ''}）`; }
    if (l.action === 'restore') return `戻した ${str(d.restored)}件・戻せなかった ${str(d.failed)}件`;
    if (l.action === 'rename') return `id ${str(d.id)}: ${str(d.before)} → ${str(d.after)}`;
    try { return JSON.stringify(d).slice(0, 300); } catch { return ''; }
  }

  let API;
  const R = { kind: 'scores', offset: 0, rows: [], total: 0, seq: 0, loaded: false };

  function setWho() {
    const on = API.loggedIn();
    $('adm-who').textContent = on ? (API.email() || 'ログイン中') : 'ログインしてない';
    $('adm-logout').hidden = !on;
  }
  function showLogin(msg = '') {
    R.loaded = false;
    $('r-login').hidden = false;
    $('r-dash').hidden = true;
    $('r-login-msg').textContent = msg;
    setWho();
    if (!$('tab-log').hidden) loadOps();
  }
  // 管理の関数を呼ぶ。だめなら知らせて null（relogin ならログイン画面へ）
  async function rpc(name, args) {
    try { return await API.call(name, args); }
    catch (e) {
      if (e.code === 'relogin') showLogin('ログインし直してね');
      else if (e.code === 'denied') toast('このアカウントは管理者じゃないよ', true);
      else if (e.code === 'network') toast('つながらなかった', true);
      else toast(`うまくいかなかった${e.status ? `（HTTP ${e.status}）` : ''}`, true);
      return null;
    }
  }
  async function showDash() {
    R.loaded = true;
    $('r-login').hidden = true;
    $('r-dash').hidden = false;
    $('r-login-msg').textContent = '';
    setWho();
    setKind(R.kind, false);
    await Promise.all([loadStats(), loadBoards()]);
    if (API.loggedIn()) await loadList();
  }

  // ---- S1・S14 件数と最後の記録 ----
  async function loadStats() {
    const s = await rpc('admin_stats', {});
    if (!s || s.ok === false) return;
    for (const k of ['scores', 'daily', 'rpg']) {
      $('r-dash').querySelector(`[data-n="${k}"]`).textContent = str(s.counts?.[k] ?? 0);
      $('r-dash').querySelector(`[data-sub="${k}"]`).textContent = k === 'rpg' ? '登録している人' : `今日 ${str(s.today?.[k] ?? 0)}・今週 ${str(s.week?.[k] ?? 0)}`;
    }
    const last = s.last_at ? Date.parse(s.last_at) : NaN, stale = $('r-stale');
    $('r-last').textContent = Number.isNaN(last) ? 'まだ記録がないよ' : `最後の記録: ${fmtFull(s.last_at)}`;
    if (Number.isNaN(last)) { stale.textContent = ''; stale.classList.remove('warn'); }
    else {
      const days = Math.max(0, Math.floor((Date.now() - last) / 86400e3));
      stale.textContent = `最後の記録から ${days}日（7日で Supabase が止まる）`;
      stale.classList.toggle('warn', days >= 5);
    }
    const log = Array.isArray(s.recent_log) ? s.recent_log : [];
    $('r-recent').replaceChildren(...(log.length ? log.map(l => el('li', {},
      el('span', { class: 'mono muted', text: fmtAt(l.at) }), el('b', { text: ACTION[l.action] ?? str(l.action) }),
      el('span', { text: KIND_LABEL[l.kind] ?? '' }), el('span', { class: 'grow', text: logDetail(l) })))
      : [el('li', { class: 'muted', text: 'まだないよ' })]));
  }
  async function loadBoards() {
    const r = await rpc('admin_boards', {});
    if (!r || !Array.isArray(r.boards)) return;
    const sel = $('r-f-board'), cur = sel.value;
    sel.replaceChildren(el('option', { value: '', text: 'ボード: 全部' }),
      ...r.boards.map(b => el('option', { value: str(b.board), text: `${str(b.board)}（${str(b.n)}）` })));
    sel.value = r.boards.some(b => b.board === cur) ? cur : '';
  }

  // ---- S2〜S4 一覧 ----
  function setKind(k, load = true) {
    R.kind = k; R.offset = 0;
    for (const b of $('r-kind').querySelectorAll('[data-kind]')) b.setAttribute('aria-pressed', String(b.dataset.kind === k));
    $('r-f-board').hidden = $('r-f-period').hidden = k !== 'scores';
    $('r-f-day').hidden = k !== 'daily';
    $('r-f-sort').hidden = k === 'trash';
    $('r-del').hidden = k === 'trash';
    $('r-restore').hidden = k !== 'trash';
    $('r-table').dataset.kind = k;
    if (load) loadList();
  }
  function filter() {
    const f = { q: $('r-f-q').value.trim(), limit: PAGE, offset: R.offset };
    if (R.kind !== 'trash') f.sort = $('r-f-sort').value;
    if (R.kind === 'scores') { if ($('r-f-board').value) f.board = $('r-f-board').value; f.period = $('r-f-period').value; }
    if (R.kind === 'daily' && $('r-f-day').value) f.day = $('r-f-day').value;
    return f;
  }
  async function loadList() {
    const seq = ++R.seq, tbl = $('r-table'), kind = R.kind;
    tbl.removeAttribute('data-ready');
    const r = await rpc('admin_list', { p_kind: kind, p_filter: filter() });
    if (seq !== R.seq) return;
    if (!r) return;
    if (r.ok === false || !Array.isArray(r.rows)) { toast('一覧が読めなかった', true); return; }
    if (!r.rows.length && R.offset > 0 && r.total > 0) { R.offset = Math.max(0, R.offset - PAGE); loadList(); return; }
    R.rows = r.rows; R.total = +r.total || 0;
    renderTable();
    tbl.dataset.kind = kind;
    tbl.dataset.ready = '';
  }
  function renderTable() {
    const cols = COLS[R.kind], tbl = $('r-table'), canRename = R.kind !== 'trash';
    const all = el('input', { type: 'checkbox', id: 'r-pick-all', 'aria-label': 'このページを全部選ぶ' });
    tbl.tHead.replaceChildren(el('tr', {}, el('th', { class: 'pick' }, all), ...cols.map(([h]) => el('th', { text: h })), ...(canRename ? [el('th', {})] : [])));
    const body = tbl.tBodies[0];
    if (!R.rows.length) body.replaceChildren(el('tr', {}, el('td', { colSpan: cols.length + 2, class: 'muted', text: 'ないよ' })));
    else body.replaceChildren(...R.rows.map(row => el('tr', { 'data-id': str(row.id) },
      el('td', { class: 'pick' }, el('input', { type: 'checkbox', 'data-pick': '', 'aria-label': `id ${str(row.id)} を選ぶ` })),
      ...cols.map(([, f, c]) => el('td', { class: c, text: f(row) })),
      ...(canRename ? [el('td', {}, el('button', { type: 'button', class: 'btn ghost sm', 'data-rename': '', text: '名前を変える' }))] : []))));
    const from = R.rows.length ? R.offset + 1 : 0;
    $('r-page').textContent = R.total ? `${from}〜${R.offset + R.rows.length} / ${R.total}` : '0件';
    $('r-prev').disabled = R.offset <= 0;
    $('r-next').disabled = R.offset + PAGE >= R.total;
    updatePicked();
  }
  const picked = () => [...$('r-table').tBodies[0].querySelectorAll('input[data-pick]:checked')].map(b => Number(b.closest('tr').dataset.id));
  const updatePicked = () => { const n = picked().length; $('r-picked').textContent = n ? `${n}件選んでる` : ''; };

  // ---- S6 消す・戻す ----
  async function delPicked() {
    const ids = picked();
    if (!ids.length) { toast('消す記録を選んでね', true); return; }
    if (!confirm(`${KIND_LABEL[R.kind]}の記録を ${ids.length}件消していい？\n（ゴミ箱に30日のこるよ）`)) return;
    const r = await rpc('admin_delete', { p_kind: R.kind, p_ids: ids });
    if (!r) return;
    if (r.ok === false) { toast('消せなかった', true); return; }
    toast(`${str(r.deleted)}件消したよ（ゴミ箱から戻せる）`);
    await Promise.all([loadList(), loadStats(), loadBoards()]);
  }
  async function restorePicked() {
    const ids = picked();
    if (!ids.length) { toast('戻す記録を選んでね', true); return; }
    const r = await rpc('admin_restore', { p_trash_ids: ids });
    if (!r) return;
    if (r.ok === false) { toast('戻せなかった', true); return; }
    toast(`${str(r.restored)}件戻したよ${r.failed ? `・戻せなかった ${str(r.failed)}件（同じ id か同じ名前がもうある）` : ''}`, !!r.failed);
    await Promise.all([loadList(), loadStats(), loadBoards()]);
  }
  // ---- S7 名前を変える（空で OK なら「名無しの旅人」＋数字） ----
  async function rename(id) {
    const row = R.rows.find(r => Number(r.id) === id);
    if (!row) return;
    const name = prompt('新しい名前（1〜12文字。空にすると「名無しの旅人」＋数字になるよ）', str(row.nickname));
    if (name == null) return;
    const r = await rpc('admin_rename', { p_kind: R.kind, p_id: id, p_name: name.trim() === '' ? null : name });
    if (!r) return;
    if (r.ok === false) { toast(RENAME_MSG[r.reason] ?? '名前を変えられなかった', true); return; }
    toast(`「${str(r.nickname)}」にしたよ`);
    await Promise.all([loadList(), loadStats()]);
  }
  // ---- S13 このページを CSV（BOM 付き UTF-8。= + - @ で始まる文字は表計算の式にならないよう ' を前に付ける） ----
  const csvCell = v => {
    if (v == null) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  let csvUrl = '';
  function prepareCsv() {
    const cols = CSV_COLS[R.kind], a = $('r-csv');
    const lines = [cols.join(','), ...R.rows.map(r => cols.map(c => csvCell(c === 'updated_at' ? r.updated_at ?? r.at : r[c])).join(','))];
    if (csvUrl) URL.revokeObjectURL(csvUrl);
    csvUrl = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
    a.href = csvUrl;
    a.download = `country-drill-${R.kind}-${ymd()}.csv`;
  }

  async function doLogin(e) {
    e.preventDefault();
    const btn = $('r-login-btn'), msg = $('r-login-msg');
    btn.disabled = true; msg.textContent = '';
    try {
      const r = await API.login($('r-email').value.trim(), $('r-pass').value);
      if (r.ok) { $('r-pass').value = ''; toast('ログインしたよ'); await showDash(); }
      else msg.textContent = LOGIN_MSG[r.reason] ?? 'ログインできなかった';
    } finally { btn.disabled = false; }
  }
  async function doLogout() {
    await API.logout();
    showLogin('');
    toast('ログアウトしたよ');
  }

  // ======== ログ: 操作ログ（admin_log_list）と端末のエラー記録（D13） ========
  const ops = { offset: 0, total: 0 };
  async function loadOps() {
    const tb = $('l-ops-table').tBodies[0], msg = $('l-ops-msg');
    if (!API.loggedIn()) {
      msg.textContent = 'ログインすると見られるよ（ランキングのタブから）';
      tb.replaceChildren(); $('l-ops-page').textContent = '';
      $('l-ops-prev').disabled = $('l-ops-next').disabled = true;
      return;
    }
    msg.textContent = '';
    const r = await rpc('admin_log_list', { p_limit: PAGE, p_offset: ops.offset });
    if (!r || !Array.isArray(r.rows)) return;
    ops.total = +r.total || 0;
    tb.replaceChildren(...(r.rows.length ? r.rows.map(l => el('tr', {},
      el('td', { class: 'n', text: fmtFull(l.at) }), el('td', { text: ACTION[l.action] ?? str(l.action) }),
      el('td', { text: KIND_LABEL[l.kind] ?? str(l.kind) }), el('td', { text: logDetail(l) })))
      : [el('tr', {}, el('td', { colSpan: 4, class: 'muted', text: 'まだないよ' }))]));
    $('l-ops-page').textContent = ops.total ? `${ops.offset + 1}〜${ops.offset + r.rows.length} / ${ops.total}` : '';
    $('l-ops-prev').disabled = ops.offset <= 0;
    $('l-ops-next').disabled = ops.offset + PAGE >= ops.total;
  }
  const readErrs = () => { try { const a = JSON.parse(localStorage.getItem('adminErrors')); return Array.isArray(a) ? a.filter(x => x && typeof x === 'object') : []; } catch { return []; } };
  function renderErrs() {
    const list = readErrs().slice().reverse();
    $('l-err-list').replaceChildren(...(list.length ? list.map(x => el('li', {},
      el('span', { class: 'mono muted', text: `${fmtFull(x.at)}${x.src ? `・${str(x.src)}${x.line ? `:${str(x.line)}` : ''}` : ''}` }),
      el('span', { class: 'msg', text: str(x.msg) })))
      : [el('li', { class: 'muted', text: 'まだないよ' })]));
  }
  async function copyErrs() {
    try { await navigator.clipboard.writeText(JSON.stringify(readErrs(), null, 2)); toast('コピーしたよ'); }
    catch { toast('コピーできなかった', true); }
  }
  function clearErrs() {
    if (!confirm('エラー記録を消していい？')) return;
    try { localStorage.removeItem('adminErrors'); toast('消したよ'); } catch { toast('消せなかった', true); }
    renderErrs();
  }

  function initRank() {
    API = ADMIN_API.create({});
    setWho();
    $('r-login').addEventListener('submit', doLogin);
    $('adm-logout').onclick = doLogout;
    $('r-reload').onclick = () => { loadStats(); loadBoards(); loadList(); };
    $('r-kind').addEventListener('click', e => { const b = e.target.closest('[data-kind]'); if (b) setKind(b.dataset.kind); });
    $('r-filter').addEventListener('submit', e => { e.preventDefault(); R.offset = 0; loadList(); });
    for (const id of ['r-f-board', 'r-f-period', 'r-f-day', 'r-f-sort']) $(id).addEventListener('change', () => { R.offset = 0; loadList(); });
    $('r-prev').onclick = () => { R.offset = Math.max(0, R.offset - PAGE); loadList(); };
    $('r-next').onclick = () => { R.offset += PAGE; loadList(); };
    $('r-del').onclick = delPicked;
    $('r-restore').onclick = restorePicked;
    $('r-csv').addEventListener('click', prepareCsv);
    $('r-table').addEventListener('change', e => {
      if (e.target.id === 'r-pick-all') for (const b of $('r-table').tBodies[0].querySelectorAll('input[data-pick]')) b.checked = e.target.checked;
      updatePicked();
    });
    $('r-table').addEventListener('click', e => { const b = e.target.closest('[data-rename]'); if (b) rename(Number(b.closest('tr').dataset.id)); });
    $('l-ops-load').onclick = loadOps;
    $('l-ops-prev').onclick = () => { ops.offset = Math.max(0, ops.offset - PAGE); loadOps(); };
    $('l-ops-next').onclick = () => { ops.offset += PAGE; loadOps(); };
    $('l-err-copy').onclick = copyErrs;
    $('l-err-clear').onclick = clearErrs;
    // 30分さわらないと admin-api.js がログアウト扱いにする。開いたままでも気づけるように時々見る
    setInterval(() => { if (R.loaded && !API.loggedIn()) showLogin('ログインし直してね'); }, 30_000);
  }
  function onTab(name) {
    if (name === 'rank') { if (!API.loggedIn()) { if (R.loaded) showLogin('ログインし直してね'); else { $('r-login').hidden = false; $('r-dash').hidden = true; setWho(); } } else if (!R.loaded) showDash(); }
    if (name === 'log') { renderErrs(); loadOps(); }
  }

  function init() {
    SAVE = ADMIN_SAVE.create(localStorage);
    $('adm-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });

    $('d-keys').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) pick(b.dataset.key); });
    $('d-json-save').onclick = saveJson;
    $('d-json-del').onclick = deleteKey;
    $('d-json-copy').onclick = copyJson;

    $('d-dl').addEventListener('click', prepareDownload);
    $('d-file').addEventListener('change', importFile);

    $('d-snap-save').onclick = snapSave;
    $('d-snap-list').addEventListener('click', snapAct);

    $('d-rpg').addEventListener('click', e => {
      const b = e.target.closest('[data-coins]');
      if (b) done(SAVE.rpgCoins(+b.dataset.coins), `コイン ${+b.dataset.coins > 0 ? '+' : ''}${b.dataset.coins}`);
    });
    $('d-rpg-floors').addEventListener('change', e => {
      const s = e.target.closest('[data-floor]');
      if (s) done(SAVE.rpgSetFloor(s.dataset.floor, +s.value), 'フロアを変えたよ');
    });
    $('d-rpg-lv-set').onclick = () => done(SAVE.rpgSetLv(+$('d-rpg-lv').value), 'Lv を変えたよ');
    $('d-rpg-pity-set').onclick = () => done(SAVE.rpgSetPity(+$('d-rpg-pity').value), '天井カウンターを変えたよ');
    $('d-rpg-unlock').onclick = () => done(SAVE.rpgUnlockAll(), '全部のダンジョンを開いたよ');
    $('d-rpg-clear').onclick = () => danger('全部クリア', () => done(SAVE.rpgClearAll(), '全部クリアにしたよ'));
    $('d-rpg-story').onclick = () => done(SAVE.rpgStoryReset(), 'ストーリー既読を消したよ');
    $('d-rpg-card-give').onclick = rpgCard;
    $('d-rpg-wipe').onclick = () => danger('冒険データを消す', () => done(SAVE.rpgWipe(), '冒険データを消したよ'));

    $('d-badges-all').onclick = () => done(SAVE.badgesAll(), '全部のバッジを取ったよ');
    $('d-badges-none').onclick = () => danger('バッジを全部消す', () => done(SAVE.badgesNone(), 'バッジを全部消したよ'));
    $('d-badges-list').addEventListener('change', e => {
      const box = e.target.closest('[data-step]');
      if (box) done(SAVE.badgeToggle(box.dataset.step), box.checked ? '取ったことにしたよ' : '取ってないことにしたよ');
    });

    $('d-daily-day').addEventListener('change', renderDaily);
    $('d-daily-reset').onclick = () => danger('今日の難問をやり直す', () => done(SAVE.dailyReset(), '今日の難問をもう一回できるようにしたよ'));

    $('d-set-vol').addEventListener('input', () => { $('d-set-vol-n').textContent = $('d-set-vol').value; });
    $('d-set-save').onclick = saveSettings;
    $('d-first').onclick = () => danger('初回状態に戻す', () => {
      if (done(SAVE.firstTime(), 'はじめての人にしたよ')) applyTheme('light');
    });

    $('d-sound-list').addEventListener('click', e => {
      const b = e.target.closest('[data-snd]');
      if (!b) return;
      // play は40ms以内の連打で null を返す（鳴らさないだけ）ので、返り値ではなく音の名前があるかだけ見る
      if (!SND.kinds.includes(b.dataset.snd)) toast('鳴らせなかった（その音は無いよ）', true);
      else SND.play(b.dataset.snd);
    });

    $('d-env-refresh').onclick = () => renderEnv({ ping: lastPing });
    $('d-env-ping').onclick = ping;
    addEventListener('online', () => renderEnv({ ping: lastPing }));
    addEventListener('offline', () => renderEnv({ ping: lastPing }));

    // 本編の別タブがセーブを書いたら描き直す
    addEventListener('storage', () => { renderAll(); renderErrs(); if (current && document.activeElement !== $('d-json')) pick(current); });

    initRank();
    safe('d-sound', renderSounds); safe('d-check', renderCheck); renderAll(); renderErrs();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
