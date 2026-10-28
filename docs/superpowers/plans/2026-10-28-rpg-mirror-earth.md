# 国旗クエスト 第2章「鏡の地球」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 地図喰いを倒したあとに開く第2章「鏡の地球」（鏡の7ダンジョン・似た旗の選択肢・章タブ・章の終わりのストーリー）と、レベル上限99を入れる。

**Architecture:** `rpg-core.js` の `DUNGEONS` に章番号 `ch` を足して鏡の7つを後ろに並べる（ステージ番号 36〜70）。開く順・次のフロア・セーブの形は今の「並び順」の仕組みのまま延ばす。選択肢だけ `RPG_CORE.similarChoices` に差しかえ、冒険ホームは章タブで7つずつ見せる。

**Tech Stack:** 素の JS（クラシック script）、d3（冒険マップ）、node:test（単体）、Playwright（e2e）、PostgreSQL 16（SQL テスト）、Supabase

**Spec:** `docs/superpowers/specs/2026-10-28-rpg-story-next-design.md`（§2〜4・§7・§8・§9 の1つ目）

## Global Constraints

- 出題は国旗・国名・場所だけ（f2n・n2f・m2f）。首都は問わない
- 数値は全部 `TUNING`（`rpg-core.js`）に置く。ほかのファイルに倍率・値段を直接書かない
- `rpg-*.js` はクラシック script。外側に `const` / `let` / `function` を書かない（IIFE の中だけ）
- 画面の文はやさしい日本語（今の冒険の口調）。ファイル名は半角英数字
- 変えた JS / CSS は `index.html` の `?v=` を1つ上げる
- SQL は `create or replace` だけ（drop しない）。本番 DB への適用はチコの明示OKのあと、サイトの公開より先
- テスト: `node --test 'tests/unit/*.test.mjs'`、`node --test 'tests/e2e/*.test.mjs'`（playwright install はしない）、`bash tests/sql/run.sh`
- 開発用パネルの e2e テスト1件は前から不安定（無関係）

## Review Focus

1. 前からのセーブ（地球の途中・Lv50 で止まっていた人）を読んでも何も消えず、Lv50 の人はそのまま 51 へ上げられる → Task 1 のテスト `old_save_keeps_and_levels_past_50`
2. 更新前に地図喰いを倒していた人は、次に冒険ホームを開いたとき地球クリアのストーリーが1回だけ出て、鏡の地球が開いている → Task 3 のテスト `story_once_for_old_clear`
3. 似た旗の組に入っていない国・国の少ない細かい地域の国でも、選択肢はいつも4つ・重なり無し・正解入り → Task 1 のテスト `similar_choices_always_four`
4. 鏡の地球を進めた人の冒険ランキングの記録（ダンジョン8以上・フロア36以上・Lv51以上）がサーバーで弾かれない → Task 4 の SQL テスト
5. 鏡の地図喰い（全世界）のボス戦で、地域ボーナスが全員にかかり、旗が12枚そろう → Task 1 のテスト `mirror_world_boss`

---

### Task 1: 章と鏡の7ダンジョン・レベル上限・似た旗の選択肢（rpg-core.js）

**Files:**
- Modify: `rpg-core.js`（`TUNING`・`DUNGEONS`・`MONSTERS`・`REGION_DUNGEONS`・`recLv`・`fresh`/`sanitize`・exports）
- Modify: `tests/unit/rpg_load.mjs`（`loadCtx` で countries.js のあと daily-core.js も読む）
- Test: `tests/unit/rpg-core.test.mjs`

**Interfaces:**
- Produces:
  - `DUNGEONS[i].ch`（1 か 2）、鏡のものは `base`（元の id）も持つ。鏡の id: `msamerica` `moceania` `mnamerica` `meurope` `masia` `mafrica` `mworld`（この順で今の7つの後ろ）
  - `CHAPTERS = [{ ch: 1, name: '地球', e: '🌍', last: 'world' }, { ch: 2, name: '鏡の地球', e: '🪞', last: 'mworld' }]`
  - `chapterOf(id) -> 1 | 2 | null`、`dungeonsOf(ch) -> DUNGEONS の部分配列`
  - `similarChoices(a: string, rng: () => number) -> string[4]`（正解 a を含む国コード4つ、並びはシャッフル）
  - `STORY_IDS = ['ch1', 'ch2']`、セーブに `story: string[]`
  - `REGION_DUNGEONS` は今と同じ6つ（`ch === 1 && r !== 'all'`）

- [ ] **Step 1: 失敗するテストを書く**（`tests/unit/rpg-core.test.mjs` に追加・書きかえ）

```js
test('mirror_dungeons', () => {
  const ids = K.DUNGEONS.map(g => g.id);
  assert.deepEqual(ids.slice(7), ['msamerica', 'moceania', 'mnamerica', 'meurope', 'masia', 'mafrica', 'mworld']);
  for (const g of K.DUNGEONS.slice(7)) {
    const b = K.dungeonOf(g.base);
    assert.equal(g.ch, 2); assert.equal(g.r, b.r); assert.equal(g.flags, b.flags);
    assert.equal(K.MONSTERS[g.id].length, 5);
  }
  assert.equal(K.chapterOf('world'), 1); assert.equal(K.chapterOf('mworld'), 2); assert.equal(K.chapterOf('x'), null);
  assert.equal(K.dungeonsOf(2).length, 7);
  assert.deepEqual(plain(K.REGION_DUNGEONS.map(g => g.id)), ['samerica', 'oceania', 'namerica', 'europe', 'asia', 'africa']);
  assert.equal(K.stageOf('msamerica', 1), 36); assert.equal(K.stageOf('mworld', 5), 70);
});
test('rec_lv_by_chapter', () => {
  assert.equal(K.recLv(35), 41);            // 地球は今のまま
  assert.equal(K.recLv(36), 42);            // 41 + round((s-35) × 0.8)
  assert.equal(K.recLv(40), 45);
  assert.equal(K.recLv(70), 69);
});
test('mirror_world_boss', () => {
  const en = K.enemy('mworld', 5);
  assert.equal(en.boss, true); assert.equal(en.flags, 12); assert.equal(en.recLv, 69);
  // 全世界なので、どの地域の仲間にも地域ボーナス
  const d = dWith(K, { cards: { jp: [1, 0], br: [1, 0] } });
  assert.ok(K.party(d, 'mworld').every(p => p.atk === K.cardAtk([1, 0], 0, true)));
});
test('similar_choices_always_four', () => {
  const rng = mulberry32(7);
  for (const c of C) for (let i = 0; i < 3; i++) {
    const o = K.similarChoices(c.a, rng);
    assert.equal(o.length, 4); assert.equal(new Set(o).size, 4); assert.ok(o.includes(c.a));
  }
  // 似た旗の組（td ro ad md）は組の国が先に入る
  assert.deepEqual([...K.similarChoices('td', rng)].sort(), ['ad', 'md', 'ro', 'td']);
  // 組に無い国は同じ細かい地域（13グループ）から
  const o = K.similarChoices('mn', rng).filter(a => a !== 'mn');
  assert.ok(o.every(a => K.groupOf(a) === '東アジア'));
});
test('old_save_keeps_and_levels_past_50', () => {
  const s = K.sanitize({ ...K.fresh(T0), lv: 50, floors: { world: 5, msamerica: 2, bogus: 3 }, story: ['ch1', 'zzz', 'ch1'] }, T0);
  assert.equal(s.lv, 50); assert.equal(s.floors.msamerica, 2); assert.equal(s.floors.bogus, undefined);
  assert.deepEqual(plain(s.story), ['ch1']);
  assert.deepEqual(plain(K.sanitize({ ...K.fresh(T0) }, T0).story), []);
  assert.equal(K.sanitize({ ...K.fresh(T0), lv: 120 }, T0).lv, 99);
  assert.ok(Number.isFinite(K.levelCost(50))); assert.equal(K.levelCost(99), Infinity);
});
```

既存の `TUNING` の deepEqual は `maxLv: 99`・`recStep2: 0.8` に、`maxLevelUp` の上限のテストは `{ to: 99, cost: 152390 }` に、`levelCost(50) === Infinity` は `levelCost(99)` に書きかえる。

- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/unit/rpg-core.test.mjs` / Expected: 上の6つが FAIL
- [ ] **Step 3: 実装する**
  - `TUNING.hero.maxLv = 99`、`TUNING.battle.recStep2 = 0.8`
  - `recLv(s)`: `s <= 35` は今の式、それより先は `41 + Math.round((s - 35) * recStep2)`（35 と 41 も `TUNING` から出す必要はない。地球の最後のステージ＝`5 × dungeonsOf(1).length`、そこでの `recLv` を基準にする）
  - 鏡の `DUNGEONS`: 名前・ボスは設計書 §4.1 の表のとおり。`plate` は `'PLATE 08 · MIRROR S. AMERICA'` … `'PLATE 14 · MIRROR WORLD'`、`land` は `'鏡の南アメリカ'` … `'鏡の世界'`、`color` は元の色を暗くしたもの（例 `#3f6b3b`）。手下 F1〜F4 は元の絵文字に「鏡の」「さかさ」を付けた名前
  - `similarChoices`: 候補の順は ①`globalThis.DAILY_CORE?.SIMILAR` の同じ組（シャッフル）②`groupOf` が同じ国 ③同じ地域 ④全部。上から重なりなしで3つ取って a と合わせ、シャッフルして返す。SIMILAR は呼ぶたびに読む（daily-core.js が無くても②から動く）
  - `fresh` に `story: []`、`sanitize` は `STORY_IDS` に入るものだけ・重なりなし
- [ ] **Step 4: 通るのを確かめる** — Run: `node --test 'tests/unit/*.test.mjs'` / Expected: 全部 PASS（`rpg-balance.test.mjs` も。地球の数字は変えていないので帯は同じ）
- [ ] **Step 5: Commit** — `git commit -m "国旗クエスト: 鏡の地球の7ダンジョン・レベル上限99・似た旗の選択肢（core）"`

### Task 2: バトルを鏡の地球に対応させる（rpg-battle.js）

**Files:**
- Modify: `rpg-battle.js`（`showQ` の選択肢・答え合わせ・`nextOf`・`bossShareText`・シェアの kind）
- Modify: `index.html`（`rpg-core.js` `rpg-battle.js` の `?v=`）
- Test: `tests/e2e/rpg_battle.test.mjs`

**Interfaces:**
- Consumes: Task 1 の `chapterOf`・`similarChoices`・`CHAPTERS`
- Produces: シェアの kind `'final2'`（鏡の地図喰い）。`rpg:battle` / `rpg:clear` の形は変えない（`dungeon` に鏡の id が入るだけ）

- [ ] **Step 1: 失敗する e2e を書く**

```js
t('mirror_similar_choices', async page => {
  // 地球を全部クリアしたセーブで鏡のアマゾン F1 を始め、開発用の force で チャド(td)・国旗→国名 を出す
  // 選択肢の国コード（.choice[data-a]）が ad md ro td の4つ
});
t('mirror_reveal_shows_picked', async page => {
  // 同じ問題でルーマニア(ro)を押す → #bt-reveal に「えらんだのは「ルーマニア」」と ro と td の国旗の img が2枚並ぶ
});
t('earth_last_boss_has_no_next', async page => {
  // 地図喰いのボスに勝つ → 終わりの画面に［つぎのフロアへ］が無い（ストーリーは冒険ホームで出す）。鏡の地図喰いも同じ
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/e2e/rpg_battle.test.mjs` / Expected: 3つ FAIL
- [ ] **Step 3: 実装する**
  - `showQ`: `K.chapterOf(B.id) === 2` なら `makeQuestion(c).opts` のかわりに `K.similarChoices(a, Math.random).map(x => byA.get(x))`
  - 答え合わせ（まちがえたとき）: 鏡の地球では、押した国の名前と、押した国・正解の国旗を並べて出す（`.rpg-rv-pair`、`rpg.css` に2列の小さい国旗）。`answer(a)` から押した国コードを渡す
  - `nextOf`: `CHAPTERS` の `last` のボスのあとは `null`
  - `bossShareText`: 鏡の地図喰いは「国旗クエストで鏡の地図喰いをたおして、ふたつの地球をつないだ！ ${mates}」、kind は `'final2'`。ほかの鏡のボスは今の文の `dg.land` がそのまま入る
- [ ] **Step 4: 通るのを確かめる** — Run: `node --test tests/e2e/rpg_battle.test.mjs tests/e2e/rpg.test.mjs` / Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "国旗クエスト: 鏡の地球のバトル（似た旗の選択肢・押した旗との見比べ）"`

### Task 3: 冒険ホームの章タブと章の終わりのストーリー（rpg.js・rpg.css）

**Files:**
- Modify: `rpg.js`（`homeHTML`・`amapGeo`/`amapHTML`・`plateHTML` の並べ方・`nextAction`・新しい `storyDialog`・`SPOT` の引き方・開発用パネル）
- Modify: `rpg.css`（章タブ、鏡の地図の色、ストーリーの dialog、`--rpg-r-m*` の色）
- Modify: `index.html`（`rpg.js` `rpg.css` の `?v=`）
- Test: `tests/e2e/rpg_amap.test.mjs`、`tests/e2e/rpg_home.test.mjs`

**Interfaces:**
- Consumes: Task 1 の `CHAPTERS`・`chapterOf`・`dungeonsOf`・`story`
- Produces: `#rpg-chtabs`（`button[data-ch]`、`aria-pressed`、開いていない章は `disabled` で 🔒）、`<dialog id="rpg-story-dlg">`（body に1つ）

- [ ] **Step 1: 失敗する e2e を書く**

```js
t('chapter_tabs', async page => {
  // 新しいセーブ: タブは 🌍地球 が押されていて 🪞鏡の地球 は disabled。マップのダンジョンは7つ、図版も7つ
  // 地図喰いを倒したセーブ: 鏡の地球のタブを押すとマップが .is-mirror になり、ダンジョン msamerica..mworld の7つ。ヘッダーは「ダンジョン 0/7・フロア 0/35」
  // 冒険ホームを開いた直後の章は、次に挑むフロアの章（鏡のアマゾン F1 なら鏡の地球）
});
t('story_once_for_old_clear', async page => {
  // floors.world = 5、story なしのセーブで冒険ホームを開く → #rpg-story-dlg が開いて地球クリアの文（「鏡のような裂け目」を含む）
  // 閉じる → セーブの story が ['ch1']。読み込み直しても出ない
});
t('all_clear_after_mirror', async page => {
  // floors.world = 5 だけ: つぎにやることは鏡のアマゾン F1。全部（14個）5: 「全クリア！」の文
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/e2e/rpg_amap.test.mjs tests/e2e/rpg_home.test.mjs` / Expected: 3つ FAIL
- [ ] **Step 3: 実装する**
  - 章タブを冒険マップの上に出す。選んだ章（`chSel`、冒険ホームを離れたら空にもどる＝`dgSel` と同じ扱い）の `dungeonsOf(ch)` だけをマップ・図版に使う。進み具合のヘッダーと棒も章の分だけ数える
  - 鏡の章は `SPOT[g.base]`・`BEND` を使い回し、地域の塗りは `featCountry` の地域と `g.r` で同じように引く。`<svg>` に `is-mirror` を付け、`rpg.css` で夜の地図の色にする
  - ストーリー: `STORY_END = { ch1: [設計書 §3「地球クリア」＋「第2章 はじまり」の文], ch2: [§3「第2章クリア」の文] }`。冒険ホームを描いたあと、`last` のボスを倒していて `story` に無い章が1つでもあれば、古い順に1つ dialog で出す。［閉じる］で `tx` して `story` に足す（読み取り専用のときは出さない）
  - 開発用パネルの「全部開ける」は14個とも
- [ ] **Step 4: 通るのを確かめる** — Run: `node --test 'tests/e2e/rpg*.test.mjs'` / Expected: PASS（前から不安定な1件を除く）。スマホ幅 360px とPC 1280px のスクショを `/mnt/project-files/country-drill-story-20261028/` に保存
- [ ] **Step 5: Commit** — `git commit -m "国旗クエスト: 冒険ホームに章タブと章の終わりのストーリー"`

### Task 4: ランキングの上限を広げる（SQL）とバッジの Lv 上限

**Files:**
- Modify: `supabase/schema.sql`（`rpg_record_ok` と `rpg_players` のコメント）
- Modify: `badges.js`（`RPG_MAX.lv` を 99）、`index.html`（`badges.js` の `?v=`）
- Test: `tests/sql/test_schema.sql`、`tests/unit/badges.test.mjs`

**Interfaces:**
- Produces: `rpg_record_ok(p_lv, p_dungeons, p_floors)` の条件が `lv 1〜99`・`dungeons 0〜21`・`floors 0〜105`・`dungeons × 5 <= floors`（第3章の分まで先に広げる。引数と名前は同じなので `create or replace` だけ）

- [ ] **Step 1: 失敗するテストを書く**（`tests/sql/test_schema.sql`）

```sql
assert (rpg_register('00000000-0000-4000-8000-0000000000a1', 'カガミ', 69, 14, 70)->>'ok')::boolean, '鏡の地球を全部';
assert rpg_register('00000000-0000-4000-8000-0000000000a2', 'ホシ', 100, 0, 0)->>'reason' = 'bad_record', 'Lv100';
assert rpg_register('00000000-0000-4000-8000-0000000000a3', 'ソラ', 5, 22, 110)->>'reason' = 'bad_record', 'ダンジョン22';
```

今の「ダンジョン8 は bad_record」のテストは「ダンジョン22」に書きかえる。`badges.test.mjs` には rpg の lv 99 が 99 のまま残るテストを足す。

- [ ] **Step 2: 失敗を確かめる** — Run: `bash tests/sql/run.sh` / Expected: 上の assert で FAIL
- [ ] **Step 3: 実装する** — `rpg_record_ok` の数字だけ変える
- [ ] **Step 4: 通るのを確かめる** — Run: `bash tests/sql/run.sh && node --test 'tests/unit/*.test.mjs'` / Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "冒険ランキング: 鏡の地球と Lv99 の記録を受け付ける"`

### 本番に出すとき（全タスクのあと）

1. ブランチ全体のレビュー → PR（本文に「SQL を先に本番へ」と書く）
2. チコの OK をもらったら、Supabase MCP で `rpg_record_ok` の `create or replace` だけを本番に流す（drop なし）
3. そのあと PR をマージ（1〜2分で Pages に出る）。本番の見た目はチコに確かめてもらう
