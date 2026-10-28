// 管理ページの、この端末のセーブ（localStorage）をさわる部品。DOM には触らない。
// ブラウザでは <script src="admin-save.js"> で window.ADMIN_SAVE になる（テストでは vm で読み込む）。
// 本編の形を守る: rpg は RPG_CORE.sanitize、badges は BADGES_CORE.sanitize を通してから書く。形が壊れた JSON は保存しない。
(() => {
  const RC = globalThis.RPG_CORE, BC = globalThis.BADGES_CORE, DC = globalThis.DAILY_CORE;
  const SNAPS = 'adminSnaps', ERRORS = 'adminErrors';   // 管理ページ自身の置き場。入れかえ・書き出しの対象にしない
  const OWN = new Set([SNAPS, ERRORS]);
  const SNAP_MAX = 5;
  const REGIONS = ['アジア', 'ヨーロッパ', 'アフリカ', '北・中央アメリカ', '南アメリカ', 'オセアニア'];
  const BROKEN = 'rpg-broken-', KEEP_BROKEN = 3;   // rpg.js と同じ（壊れたセーブの写しは新しいものから3つ）
  const RANK_DEL = 'rpgRankDel';                      // rpg-rank.js が次の起動でランキングの行を消しに行く合言葉の列
  // 初めて使う人に戻すとき消すキー。rpgRankDel（消しに行く途中の合言葉）と、rpg-broken-* / badges-broken（壊れたセーブの写し）は残す。
  // 写しは本編が状態として読まないので「初めて」のふるまいは変わらず、壊れたセーブの唯一の写しを消さずにすむ
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
      // 書く前に全部確かめる。rpg / badges は write と同じ shaped を通した文字列を入れる
      const put = {};
      for (const [k, v] of Object.entries(obj.data)) {
        if (OWN.has(k)) continue;
        if (k === 'rpg' || k === 'badges') {
          const p = parse(v), out = p.ok ? shaped(k, p.v) : null;
          if (out == null) return { ok: false, reason: 'bad_file' };
          put[k] = out;
        } else put[k] = v;
      }
      let backup;
      try {
        backup = exportAll();
        for (const k of allKeys()) if (!OWN.has(k) && !Object.hasOwn(put, k)) storage.removeItem(k);
        for (const [k, v] of Object.entries(put)) storage.setItem(k, v);
        return { ok: true, backup };
      } catch {
        // 途中で失敗したら、バックアップの中身に戻す（戻せる分だけ）
        if (backup) {
          try { for (const k of allKeys()) if (!OWN.has(k) && !Object.hasOwn(backup.data, k)) storage.removeItem(k); } catch {}
          for (const [k, v] of Object.entries(backup.data)) { try { storage.setItem(k, v); } catch {} }
        }
        return { ok: false, reason: 'storage', backup };
      }
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
    // 本編（rpg.js の load）と同じ読み方。RPG_CORE.migrate を通し、{ d, readOnly, backup, broken, raw } を返す。
    // broken = JSON でない・形が壊れていて新品に置きかわる。readOnly = 新しい版（v > VERSION）のデータ。backup = 本編なら写しを取る
    const rpgLoad = () => {
      const raw = storage.getItem('rpg'), t = rpgToday();   // storage の例外はそのまま外へ（読めないときに新品で上書きしない）
      if (raw == null) return { ...RC.migrate(null, t), broken: false, raw };
      const p = parse(raw);
      if (!p.ok) return { d: RC.sanitize(RC.fresh(t), t), readOnly: false, backup: true, broken: true, raw };
      const m = RC.migrate(p.v, t);
      const v = isObj(p.v) ? p.v.v : null;
      return { ...m, broken: m.backup && !(isObj(p.v) && (v === undefined || (Number.isInteger(v) && v >= 1))), raw };
    };
    // rpg.js の backupRaw と同じ: rpg-broken-<時刻>-<k> に写し、新しい順に3つだけ残す
    const backupRaw = str => {
      if (typeof str !== 'string') return;
      const t = now();
      let k = 0;
      while (storage.getItem(`${BROKEN}${t}-${k}`) !== null) k++;
      storage.setItem(`${BROKEN}${t}-${k}`, str);
      const order = key => (/^(\d+)-(\d+)$/.exec(key.slice(BROKEN.length)) || [0, -1, -1]).slice(1).map(Number);
      const ks = allKeys().filter(key => key.startsWith(BROKEN));
      ks.sort((x, y) => { const [t1, k1] = order(x), [t2, k2] = order(y); return t2 - t1 || k2 - k1; });
      for (const key of ks.slice(KEEP_BROKEN)) storage.removeItem(key);
    };
    const rpgGet = () => rpgLoad().d;
    // 今の rpg（無ければ新品）を fn で変えて、sanitize して書く。書いた値を返す。
    // 壊れたセーブ（JSON でない など）は { ok:false, reason:'not_json' }、新しい版のセーブは { ok:false, reason:'newer' } で、どちらも書かない
    // （本編も新しい版は書かない。壊れたものは上書きせず、書き出し・入れかえで直してもらう）
    const rpgEdit = fn => guard(() => {
      const r = rpgLoad();
      if (r.readOnly) return { ok: false, reason: 'newer' };
      if (r.broken) return { ok: false, reason: 'not_json' };
      if (r.backup) backupRaw(r.raw);   // v の無い v1 など、本編が写しを取ってから直すもの
      const x = r.d;
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
    // 仲間カードを n 枚。初めては ★1、あとは重ねる。重ねは stackMax で止める（越えると sanitize がカードごと消すので）
    const rpgGiveCard = (code, n = 1) => rpgEdit(x => {
      for (let i = 0; i < Math.max(1, Math.round(+n) || 1); i++) {
        const c = x.cards[code];
        x.cards[code] = c ? [c[0], Math.min(c[1] + 1, RC.TUNING.card.stackMax)] : [1, 0];
      }
    });
    // rpg-rank.js の unregister と同じ: 登録の合言葉（rpgRank.token と rpgRankPending）を rpgRankDel に足してから消す。
    // 本編が次の起動で rpgRankDel の合言葉でランキングの行を消しに行く
    const queueRankDel = () => {
      const get = k => { const p = parse(storage.getItem(k) ?? 'null'); return p.ok ? p.v : null; };
      const r = get('rpgRank'), pending = get('rpgRankPending'), cur = get(RANK_DEL);
      const list = Array.isArray(cur) ? cur.filter(x => typeof x === 'string') : [];
      const tokens = [isObj(r) && typeof r.token === 'string' ? r.token : null, typeof pending === 'string' ? pending : null]
        .filter((x, i, a) => x && !list.includes(x) && a.indexOf(x) === i);
      if (tokens.length) storage.setItem(RANK_DEL, JSON.stringify([...list, ...tokens]));
      storage.removeItem('rpgRank'); storage.removeItem('rpgRankPending');
    };
    // 本編の「冒険データを消す」と同じ: 新しい版のデータなら消さない（{ ok:false, reason:'newer' }）。壊れたセーブは写しを取ってから消す
    const rpgWipe = () => guard(() => {
      const r = rpgLoad();
      if (r.readOnly) return { ok: false, reason: 'newer' };
      if (r.backup) backupRaw(r.raw);
      storage.removeItem('rpg');
      queueRankDel();
      return { ok: true };
    });

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
    const firstTime = () => guard(() => { queueRankDel(); for (const k of FIRST) storage.removeItem(k); return { ok: true }; });

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
