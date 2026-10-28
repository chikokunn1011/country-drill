// 管理ページの、この端末のセーブ（localStorage）をさわる部品。DOM には触らない。
// ブラウザでは <script src="admin-save.js"> で window.ADMIN_SAVE になる（テストでは vm で読み込む）。
// 本編の形を守る: rpg は RPG_CORE.sanitize、badges は BADGES_CORE.sanitize を通してから書く。形が壊れた JSON は保存しない。
(() => {
  const RC = globalThis.RPG_CORE, BC = globalThis.BADGES_CORE, DC = globalThis.DAILY_CORE;
  const SNAPS = 'adminSnaps', ERRORS = 'adminErrors';   // 管理ページ自身の置き場。入れかえ・書き出しの対象にしない
  const OWN = new Set([SNAPS, ERRORS]);
  const SNAP_MAX = 5;
  const REGIONS = ['アジア', 'ヨーロッパ', 'アフリカ', '北・中央アメリカ', '南アメリカ', 'オセアニア'];
  // 初めて使う人に戻すとき消すキー
  const FIRST = ['settings', 'setup', 'misses', 'nickname', 'rpg', 'badges', 'daily', 'rpgRank', 'rpgRankPending', 'bview', 'bdgcat'];

  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const bytesOf = s => { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
  const parse = s => { try { return { ok: true, v: JSON.parse(s) }; } catch { return { ok: false }; } };

  function create(storage, now = () => Date.now()) {
    const iso = () => new Date(now()).toISOString();
    const rpgToday = () => RC.today(new Date(now()));
    // storage の例外は全部ここで受けて { ok:false, reason:'storage' } にする
    const guard = f => { try { return f(); } catch { return { ok: false, reason: 'storage' }; } };
    const allKeys = () => { const ks = []; for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k != null) ks.push(k); } return ks; };

    const keys = () => guard(() => allKeys().sort().map(key => ({ key, bytes: bytesOf(storage.getItem(key) ?? '') })));
    const read = key => guard(() => {
      const raw = storage.getItem(key);
      if (raw == null) return { ok: false, reason: 'missing', raw: null };
      const p = parse(raw);
      return p.ok ? { ok: true, value: p.v } : { ok: false, reason: 'not_json', raw };
    });
    const remove = key => guard(() => { storage.removeItem(key); return { ok: true }; });

    // 本編の形にそろえた文字列。rpg / badges 以外はそのまま。形が合わなければ null
    const shaped = (key, v) => {
      if (key === 'rpg') {
        if (!isObj(v)) return null;
        const s = RC.sanitize(v, rpgToday());
        return s && s.v ? JSON.stringify(s) : null;
      }
      if (key === 'badges') {
        if (!isObj(v)) return null;
        const s = BC.sanitize(v, BC.makeX(globalThis.COUNTRIES));
        return s && s.got ? JSON.stringify(s) : null;
      }
      return JSON.stringify(v);
    };
    const write = (key, text) => {
      const p = parse(text);
      if (!p.ok) return { ok: false, reason: 'not_json' };
      const out = key === 'rpg' || key === 'badges' ? shaped(key, p.v) : text;
      if (out == null) return { ok: false, reason: 'bad_shape' };
      return guard(() => { storage.setItem(key, out); return { ok: true }; });
    };

    // ---- 書き出し・読み戻し ----
    const exportAll = () => {
      const data = {};
      for (const k of allKeys().sort()) if (!OWN.has(k)) data[k] = storage.getItem(k);
      return { app: 'country-drill', kind: 'save', at: iso(), data };
    };
    const importAll = obj => {
      if (!isObj(obj) || obj.app !== 'country-drill' || obj.kind !== 'save' || !isObj(obj.data)) return { ok: false, reason: 'bad_file' };
      if (!Object.values(obj.data).every(v => typeof v === 'string')) return { ok: false, reason: 'bad_file' };
      return guard(() => {
        const backup = exportAll();
        for (const k of allKeys()) if (!OWN.has(k) && !(k in obj.data)) storage.removeItem(k);
        for (const [k, v] of Object.entries(obj.data)) if (!OWN.has(k)) storage.setItem(k, v);
        return { ok: true, backup };
      });
    };

    // ---- スナップショット（最大5個。古いものから消える） ----
    const snaps = () => { const p = parse(storage.getItem(SNAPS) ?? '[]'); return p.ok && Array.isArray(p.v) ? p.v.filter(s => isObj(s) && typeof s.name === 'string' && isObj(s.data)) : []; };
    const snapList = () => snaps().map(({ name, at }) => ({ name, at }));
    const snapSave = name => guard(() => {
      const list = snaps().filter(s => s.name !== name);   // 同じ名前は置きかえ
      list.push({ name, at: iso(), data: exportAll().data });
      storage.setItem(SNAPS, JSON.stringify(list.slice(-SNAP_MAX)));
      return { ok: true };
    });
    const snapLoad = name => {
      const s = snaps().find(x => x.name === name);
      return s ? importAll({ app: 'country-drill', kind: 'save', data: s.data }) : { ok: false, reason: 'missing' };
    };
    const snapDelete = name => guard(() => { storage.setItem(SNAPS, JSON.stringify(snaps().filter(s => s.name !== name))); return { ok: true }; });

    // ---- 冒険（rpg） ----
    const rpgGet = () => {
      const r = read('rpg');
      if (r.reason === 'storage') throw new Error('storage');   // 読めないときに新品で上書きしない
      return RC.sanitize(r.ok ? r.value : RC.fresh(rpgToday()), rpgToday());
    };
    // 今の rpg（無ければ新品）を fn で変えて、sanitize して書く。書いた値を返す
    const rpgEdit = fn => guard(() => {
      const x = rpgGet();
      fn(x);
      const s = RC.sanitize(x, rpgToday());
      storage.setItem('rpg', JSON.stringify(s));
      return s;
    });
    const rpgCoins = delta => rpgEdit(x => { x.coins = clamp(x.coins + Math.round(+delta || 0), 0, RC.BIG); });
    const rpgSetLv = n => rpgEdit(x => { x.lv = clamp(Math.round(+n) || 1, 1, RC.TUNING.hero.maxLv); });
    const rpgSetFloor = (id, floor) => RC.DUNGEONS.some(g => g.id === id)
      ? rpgEdit(x => { x.floors[id] = clamp(Math.round(+floor) || 0, 0, 5); }) : null;
    const rpgUnlockAll = () => rpgEdit(x => { for (const g of RC.DUNGEONS) x.floors[g.id] = Math.max(x.floors[g.id] || 0, 4); });
    const rpgClearAll = () => rpgEdit(x => { for (const g of RC.DUNGEONS) x.floors[g.id] = 5; });
    const rpgStoryReset = () => rpgEdit(x => { x.story = []; });
    const rpgSetPity = n => rpgEdit(x => { x.pity = Math.max(0, Math.round(+n) || 0); });
    // 仲間カードを n 枚。初めては ★1、あとは重ねる（上限は sanitize が切る）
    const rpgGiveCard = (code, n = 1) => rpgEdit(x => {
      for (let i = 0; i < Math.max(1, Math.round(+n) || 1); i++) {
        const c = x.cards[code];
        x.cards[code] = c ? [c[0], c[1] + 1] : [1, 0];
      }
    });
    // rpgRankDel は残す（本編がランキングの行を消しに行く）
    const rpgWipe = () => guard(() => { for (const k of ['rpg', 'rpgRank', 'rpgRankPending']) storage.removeItem(k); return { ok: true }; });

    // ---- バッジ ----
    const badgesRead = () => {
      const r = read('badges');
      if (r.reason === 'storage') throw new Error('storage');
      const X = BC.makeX(globalThis.COUNTRIES);
      return { X, d: BC.sanitize(r.ok ? r.value : BC.fresh(), X) };
    };
    const badgesWrite = (d, X) => { storage.setItem('badges', JSON.stringify(BC.sanitize(d, X))); };
    const stepKeys = () => BC.makeCatalog(globalThis.COUNTRIES).flatMap(b => b.tiers.map((_, i) => `${b.id}@${i + 1}`));
    // 全ステップを取ったことにする。sent にも入れて払い出しを起こさない
    const badgesAll = () => guard(() => {
      const { X, d } = badgesRead(), t = now(), ks = stepKeys();
      for (const k of ks) if (!(k in d.got)) d.got[k] = t;
      d.sent = [...new Set([...d.sent, ...ks])];
      badgesWrite(d, X);
      return { ok: true };
    });
    const badgesNone = () => remove('badges');
    const badgeToggle = key => guard(() => {
      const { X, d } = badgesRead();
      if (key in d.got) delete d.got[key]; else d.got[key] = now();
      badgesWrite(d, X);
      return { ok: true };
    });

    // ---- 今日の難問 ----
    const dailyQuestions = day => {
      const C = globalThis.COUNTRIES, by = new Map(C.map(c => [c.a, c]));
      return DC.build(day, C).map(q => ({ a: q.a, n: by.get(q.a)?.n ?? '', mode: q.mode, opts: q.opts }));
    };
    const dailyReset = () => remove('daily');

    // ---- 設定 ----
    const settingsGet = () => { const r = guard(() => read('settings')); return r.ok && isObj(r.value) ? r.value : {}; };
    const settingsSet = patch => guard(() => { const s = { ...settingsGet(), ...patch }; storage.setItem('settings', JSON.stringify(s)); return s; });
    // バックアップは呼ぶ側が先に snapSave する
    const firstTime = () => guard(() => { for (const k of FIRST) storage.removeItem(k); return { ok: true }; });

    // ---- データ点検（countries.js） ----
    const checkData = () => {
      const C = globalThis.COUNTRIES, problems = [], seen = new Set();
      if (C.length !== 195) problems.push(`国の数が195じゃない（${C.length}か国）`);
      C.forEach((c, i) => {
        const id = c.a || `#${i}`;
        if (c.a) { if (seen.has(c.a)) problems.push(`a が重複: ${c.a}`); seen.add(c.a); } else problems.push(`${id}: a が無い`);
        if (!c.n) problems.push(`${id}: n（国名）が無い`);
        if (!c.r) problems.push(`${id}: r（地域）が無い`);
        else if (!REGIONS.includes(c.r)) problems.push(`${id}: 地域が6つのどれでもない（${c.r}）`);
        if (!Array.isArray(c.ll) || c.ll.length !== 2 || !c.ll.every(Number.isFinite)) problems.push(`${id}: ll（緯度経度）が無い`);
      });
      return { problems, counts: { countries: C.length, regions: new Set(C.map(c => c.r).filter(r => REGIONS.includes(r))).size } };
    };

    return {
      keys, read, write, remove, exportAll, importAll, snapList, snapSave, snapLoad, snapDelete,
      rpgGet, rpgEdit, rpgCoins, rpgSetLv, rpgSetFloor, rpgUnlockAll, rpgClearAll, rpgStoryReset, rpgSetPity, rpgGiveCard, rpgWipe,
      badgesAll, badgesNone, badgeToggle, dailyQuestions, dailyReset, settingsGet, settingsSet, firstTime, checkData,
    };
  }

  globalThis.ADMIN_SAVE = { create };
})();
