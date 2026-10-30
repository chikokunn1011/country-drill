// 英語版（PR8）: 辞書（i18n/<名前>.js）の確かめ用の表（Markdown）と、冒険の語（tests/unit/en-rpg.test.mjs が使う）。
// PR7 の豆知識と同じ流れ: 訳す（translate）→ 別の AI が中身のずれを見る（faith）→ 別の AI が英語の自然さを見る（en。日本語を出さない）
// → 直した所だけもう一度 faith。表の頭に「ストーリーと名前の英訳の決まり」1〜5と冒険の語の一覧を出す（en は英語で）
// 使い方: node tools/dict_sheet.mjs <en-rpg|en-rpg-cards|…> [translate|faith|en] [--grep <正規表現>]（標準出力）
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// 冒険の語（Global Constraints の「冒険の語」と「PR8 で足す冒険の語」）。{ ja, term, en?, not? }
//   term: 表の頭に出す英語（en のシートは term だけを出す）
//   en:   キーが ja をふくむ値（{ one, other } は両方）が合う正規表現。固有の名前（Adventure・Traveler・Tower of Heroes・Map Eater・
//         Mirror Map Eater・Star Eater・Flag Quest・Friendship）だけ大文字小文字を見て、ほかは /i（文頭・ボタンで大文字になるため）。
//         en が無い行は表の頭に出すだけ（第・階・HP・ちょうど などの短い語・ふつうの語は、ほかの文のキーにも入るので見ない）
//   not:  合ってはいけない正規表現
// 長い ja も短い ja の行で見る（鏡の地図喰い のキーは 地図喰い の行でも見る。どちらも合う）
const GLOSSARY_BASE = [
  { ja: '冒険', term: 'Adventure', en: /Adventure/ },
  { ja: '英雄の塔', term: 'Tower of Heroes', en: /Tower of Heroes/ },
  { ja: 'ダンジョン', term: 'Dungeon (dungeon in a sentence)', en: /dungeon/i },
  { ja: '旅人', term: 'Traveler', en: /Traveler/ },
  { ja: '旅人のレベル', term: 'Traveler level', en: /Traveler level/i },
  { ja: 'バトル', term: 'battle', en: /battle/i },
  { ja: 'ボス', term: 'boss', en: /boss/i },
  { ja: '地域ボス', term: 'region boss', en: /region boss/i },
  { ja: '地図喰い', term: 'the Map Eater', en: /Map Eater/ },
  { ja: '仲間', term: 'ally (allies; never companion)', en: /\b(all(y|ies)|Allies)\b/i },
  { ja: 'なかよし度', term: 'Friendship', en: /Friendship/ },
  { ja: 'シルバー', term: 'Silver (ally rank)', en: /silver/i },
  { ja: '手配書', term: 'Wanted posters (one: Wanted poster)', en: /Wanted poster/i },
  { ja: '推奨', term: 'recommended Lv', en: /recommended/i },
];
const GLOSSARY_PR8 = [
  { ja: '国旗クエスト', term: 'Flag Quest', en: /Flag Quest/ },
  { ja: '冒険ホーム', term: 'Adventure home', en: /Adventure home/i },
  { ja: '冒険マップ', term: 'Adventure map', en: /Adventure map/i },
  { ja: '冒険ランキング', term: 'Adventure leaderboard', en: /Adventure leaderboard/i },
  { ja: '鏡の地図喰い', term: 'the Mirror Map Eater', en: /Mirror Map Eater/ },
  { ja: '星喰い', term: 'the Star Eater', en: /Star Eater/ },
  { ja: '地球', term: 'Earth', en: /earth/i },
  { ja: '鏡の地球', term: 'Mirror Earth', en: /Mirror Earth/i },
  { ja: '宇宙', term: 'Space', en: /space/i },
  { ja: '第{n}章', term: 'Chapter {n}' },
  { ja: 'ガチャ', term: 'Flag Draw (draw, Draw 1, Draw 10, Free draw, guaranteed ★3)', en: /\bdraw/i, not: /gacha/i },
  { ja: '国旗パック', term: 'Flag Pack', en: /Flag Pack/i },
  { ja: 'カード', term: 'card' },
  { ja: 'ブロンズ', term: 'Bronze', en: /bronze/i },
  { ja: 'ゴールド', term: 'Gold', en: /gold/i },
  { ja: 'かさね', term: 'Stack', en: /stack/i },
  { ja: 'おかえし', term: 'coins back', en: /coins? back/i },
  { ja: 'ランクアップ', term: 'Rank up', en: /rank(ed)?[ -]?ups?/i },
  { ja: 'こうげき', term: 'Attack', en: /attack/i },
  { ja: 'HP', term: 'HP' },
  { ja: '地域ボーナス', term: 'Region bonus', en: /region bonus/i },
  { ja: 'チームボーナス', term: 'Team bonus', en: /team bonus/i },
  { ja: '編成', term: 'Team (team slot, Auto, default name Team {n})', en: /team/i },
  { ja: '旅人カード', term: 'Traveler card', en: /Traveler card/i },
  { ja: 'すがた', term: 'look' },
  { ja: 'レベルアップ', term: 'Level up', en: /level[ -]?ups?/i },
  { ja: 'フロア', term: 'Floor (F1–F4)', en: /floor|\bF[1-4]\b/i },
  { ja: '階', term: 'floor (Tower of Heroes)' },
  { ja: '中ボス', term: 'mini-boss', en: /mini-boss/i },
  { ja: '余裕・ちょうど・きびしい', term: 'Easy, Just right, Tough' },
  { ja: '今日の手配書', term: 'Today’s Wanted posters', en: /Today’s Wanted posters/i },
  { ja: '手配中', term: 'Wanted', en: /Wanted/i },
  { ja: '克服', term: 'Overcome!', en: /overcom|conquer/i },
  { ja: 'がんばりゲージ', term: 'Effort gauge', en: /effort gauge/i },
  { ja: 'がんばり賞', term: 'Effort prize', en: /effort prize/i },
  { ja: 'にげる', term: 'Run' },
  { ja: 'たたかう', term: 'Fight' },
  { ja: '会心', term: 'Critical hit', en: /critical hit/i },
  { ja: '反撃', term: 'counterattack', en: /counterattack/i },
  { ja: '旗を取りもどす', term: 'win back a flag', en: /win back/i },
  { ja: 'コイン', term: 'coins ({n}k on the chip)', en: /coin/i },
  { ja: '自己ベスト', term: 'Personal best', en: /personal best/i },
  { ja: '引き継ぎコード', term: 'Transfer code', en: /transfer code/i },
  { ja: 'コードで復元', term: 'Restore from code', en: /restor(e|ed|ing) from (your |the )?(transfer )?code/i },
  { ja: 'かざり', term: 'Decorations', en: /decoration/i },
];
export const GLOSSARY = [...GLOSSARY_BASE, ...GLOSSARY_PR8];

// どの辞書の値にも出ない語
export const GLOSSARY_NO = [/companion/i, /\bgacha\b/i, /Map-?eater|Mapeater/, /\bpartner/i];

// キー → 理由。言い方の都合で語を使わない値だけ（足すときは確かめた AI の名前と理由）
export const GLOSSARY_OK = {
  'アフリカ大冒険': 'PR7 のバッジの名前（African Expedition）。名前の言葉遊び',
  '覚えて仲間に': 'PR7 のバッジの名前（Learn and Recruit）。名前の言葉遊び',
};

export const RULES_JA = [
  '日本語に書いてあることだけを訳す。出来事・だれが何をしたか・数（195の旗・6つの地域）・順番を足さない・落とさない・変えない。',
  '子ども向けのやさしい英語。2人称（旅人のきみ → `you, the Traveler`）。1文は短く、ゲームの語り（`…`・`!`）は日本語と同じ所に残す。',
  'モンスター・ダンジョンの名前は、日本語の名前の意味（動物・場所・性格）を残した英語のゲームの名前（`おしゃべりオウム` → `Chatty Parrot`）。日本語に無い性格や種類を足さない。実在の動物・地名は英語版 Wikipedia の記事名（`Bengal tiger`・`Great Red Spot`）。',
  '冒険の語（下の2つの一覧）を必ず使う。',
  '名前は Title Case・28字まで（390px の札・ボタンに入れるため）。鏡の手下の元になる名前（`Upside-Down {name}` に入る）は16字まで。ストーリーの1文は160字まで。',
];
export const RULES_EN = [
  'Translate only what the Japanese says. Don’t add, drop, or change events, who did what, numbers (195 flags, 6 regions), or order.',
  'Plain English for children. Second person (the Traveler → `you, the Traveler`). Short sentences; keep the game narration (`…`, `!`) where the original has it.',
  'Monster and dungeon names are English game names that keep the meaning of the original (animal, place, personality), e.g. `Chatty Parrot`. Don’t add a personality or kind the original doesn’t have. Real animals and places use the English Wikipedia article title (`Bengal tiger`, `Great Red Spot`).',
  'Always use the Adventure terms (the two lists below).',
  'Names are Title Case and up to 28 characters (they must fit labels and buttons at 390px). Base names used in `Upside-Down {name}` are up to 16 characters. Each story sentence is up to 160 characters.',
];

// 表のセル: | と改行をエスケープ
const cell = s => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
const valText = v => typeof v === 'string' ? v : `one: ${v.one}<br>other: ${v.other}`;

export function loadDictFile(name, root = ROOT) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(root, 'i18n', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
  return ctx.window.I18N_EN ?? {};
}

export function dictSheet(name, mode = 'translate', { grep } = {}) {
  if (!['translate', 'faith', 'en'].includes(mode)) throw new Error(`mode は translate|faith|en: ${mode}`);
  const dict = loadDictFile(name);
  const en = mode === 'en';
  const out = [];
  out.push(en ? `# ${name}: English check` : `# ${name}: ${mode === 'translate' ? '英訳' : '中身のずれの確かめ'}`, '');
  out.push(en ? '## Rules for the story and names' : '## ストーリーと名前の英訳の決まり', '');
  (en ? RULES_EN : RULES_JA).forEach((r, i) => out.push(`${i + 1}. ${r}`));
  const terms = (title, list) => {
    out.push('', `## ${title}`, '');
    for (const g of list) out.push(en ? `- ${g.term}` : `- ${g.ja} → ${g.term}`);
  };
  terms(en ? 'Adventure terms' : '冒険の語', GLOSSARY_BASE);
  terms(en ? 'Adventure terms added in PR8' : 'PR8 で足す冒険の語', GLOSSARY_PR8);
  out.push('');
  out.push(mode === 'translate' ? '| # | 日本語 | いまの英語 |' : mode === 'faith' ? '| # | 日本語 | English |' : '| # | English |');
  out.push(en ? '|---|---|' : '|---|---|---|');
  let i = 0;
  for (const [k, v] of Object.entries(dict)) {
    if (grep && !grep.test(k)) continue;
    i++;
    out.push(en ? `| ${i} | ${cell(valText(v))} |` : `| ${i} | ${cell(k)} | ${cell(valText(v))} |`);
  }
  return out.join('\n') + '\n';
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const gi = args.indexOf('--grep');
  const grep = gi >= 0 ? new RegExp(args[gi + 1]) : undefined;
  if (gi >= 0) args.splice(gi, 2);
  const [name, mode = 'translate'] = args;
  if (!name) { console.error('使い方: node tools/dict_sheet.mjs <en-rpg|en-rpg-cards|…> [translate|faith|en] [--grep <正規表現>]'); process.exit(1); }
  process.stdout.write(dictSheet(name, mode, { grep }));
}
