// 英語版（PR5）: js の中の日本語の文字列を見つける（tests/unit/i18n.test.mjs が使う）。
// 本物の JS の構文解析はしない。コメント・文字列・テンプレート・正規表現を見分けるだけの字句の読み方:
//   ・// と /* */ のコメントは飛ばす（// i18n-data:start 〜 // i18n-data:end の目印だけ見る）
//   ・/ は、直前の意味のある文字が ( , = : [ ! & | ? { } ; + > か行頭、または直前の語が return・typeof などの
//     キーワードなら正規表現として読み飛ばす（ほかは割り算）
//   ・テンプレートの ${…} は入れ子で読む（中の文字列も1つずつ拾う）

// 日本語の文字（かな・漢字・和文の記号・全角の記号）。どこでもこれを使う
export const JA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}　-〿・ー！-｠]/u;

const REGEX_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '>']);
// このキーワードのあとの / も正規表現（return /…/ など）
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await']);
// 文字列のエスケープを読む（\' \" \\ \n \t \uXXXX \u{…}。ほかは \ を外すだけ。行の続きの \改行 は消す）
const ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
const unesc = s => s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, (m, e) => {
  if (e[0] === 'u' && e.length > 1) return String.fromCodePoint(parseInt(e[1] === '{' ? e.slice(2, -1) : e.slice(1), 16));
  if (e[0] === 'x' && e.length > 1) return String.fromCharCode(parseInt(e.slice(1), 16));
  if (e === '\n' || e === '\r\n' || e === '\r') return '';
  return ESC[e] ?? e;
});
const ID_CHAR = /[\w$]/;

// src の中の、日本語をふくむ文字列・テンプレート文字列ごとに { text, line, wrapped, exempt, data }。
//   wrapped: T( の第1引数（シングルクォートの文字列だけ。すぐあとが , か ) のとき。T('あ' + x) はちがう）
//   exempt:  いちばん内側の呼び出しが console.<x>( か Error(（関数の本体 {…} の中からは外を見ない）
// text はエスケープを読んだあとの文字（T('a\'b') のキーは a'b）
//   data:    // i18n-data:start 〜 // i18n-data:end の中
// テンプレートの text は、${…} を '${…}' に置きかえた文字の部分
export function scanJs(src) {
  return lex(src, t => JA_RE.test(t));
}

// T('…' の第1引数（シングルクォートで直接書いたもの）
export function tKeys(src) {
  return lex(src, () => true).filter(e => e.wrapped).map(e => e.text);
}

// 字句を読んで、keep(text) が真の文字列・テンプレートを返す
function lex(src, keep) {
  const out = [];
  let i = 0, line = 1, data = false;
  let last = null, sigOnLine = false;   // 直前の意味のある文字、この行に意味のある文字があったか
  // 開いているかっこ: { ch, callee, body }。callee は ( の前の名前（a.b.c）、無ければ null。
  // body は ) か => のあとの {（関数などの本体）
  const stack = [];
  // 直前のトークン（文字列が T( の第1引数かを見るため）
  let prevTok = null, prevTok2 = null;
  const tok = t => { prevTok2 = prevTok; prevTok = t; };
  const sig = c => { last = c; sigOnLine = true; };

  const calleeBefore = () => {
    // いま読んだ ( の前の名前を、空白を飛ばして後ろから読む
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    let end = j + 1;
    while (j >= 0 && (ID_CHAR.test(src[j]) || src[j] === '.')) j--;
    const name = src.slice(j + 1, end);
    return name && /^[A-Za-z_$]/.test(name) ? name : null;
  };
  const innermostCall = () => {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].body) return null;
      if (stack[k].ch === '(' && stack[k].callee) return stack[k].callee;
    }
    return null;
  };
  const isExempt = () => {
    const c = innermostCall();
    return !!c && /^(?:console\.\w+|Error)$/.test(c);
  };
  const record = (text, startLine, wrapped) => {
    if (keep(text)) out.push({ text, line: startLine, wrapped, exempt: isExempt(), data });
  };

  // 引用符 q の文字列を読む（i は開きの引用符）。中身を返す
  const readString = q => {
    let s = '';
    i++;
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') { s += src[i] + (src[i + 1] ?? ''); if (src[i + 1] === '\n') line++; i += 2; continue; }
      if (src[i] === '\n') line++;   // 閉じ忘れ。行は数える
      s += src[i++];
    }
    i++;
    return unesc(s);
  };
  // 正規表現を読み飛ばす（i は開きの /）
  const skipRegex = () => {
    i++;
    let cls = false;
    while (i < src.length && src[i] !== '\n') {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (cls) { if (c === ']') cls = false; }
      else if (c === '[') cls = true;
      else if (c === '/') break;
      i++;
    }
    i++;
    while (i < src.length && /[a-z]/i.test(src[i])) i++;
  };
  // テンプレートを読む（i は開きの `）。${…} の中は code() で入れ子に読む
  const readTemplate = () => {
    const startLine = line;
    // 入れ子の中で記録されるより前に、外のテンプレートの場所を取っておく
    const at = out.length, exempt = isExempt(), d = data;
    let s = '';
    i++;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { s += src[i] + (src[i + 1] ?? ''); if (src[i + 1] === '\n') line++; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2;
        stack.push({ ch: '${' });
        last = '{'; sigOnLine = true; tok('{');
        code(true);
        s += '${…}';
        continue;
      }
      if (src[i] === '\n') line++;
      s += src[i++];
    }
    i++;
    s = unesc(s);
    if (keep(s)) out.splice(at, 0, { text: s, line: startLine, wrapped: false, exempt, data: d });
  };

  // コードを読む。inTpl なら、対になる } で戻る（テンプレートの ${…}）
  function code(inTpl) {
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (c === '\n') { line++; sigOnLine = false; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && n === '/') {
        const e = src.indexOf('\n', i);
        const body = src.slice(i + 2, e < 0 ? src.length : e).trim();
        if (body === 'i18n-data:start') data = true;
        else if (body === 'i18n-data:end') data = false;
        i = e < 0 ? src.length : e;
        continue;
      }
      if (c === '/' && n === '*') {
        const e = src.indexOf('*/', i + 2), end = e < 0 ? src.length : e + 2;
        for (let k = i; k < end; k++) if (src[k] === '\n') line++;
        i = end;
        continue;
      }
      if (c === '\'' || c === '"') {
        const startLine = line;
        const first = c === '\'' && prevTok === '(' && prevTok2 === 'T';
        const s = readString(c);
        let j = i;
        while (j < src.length && /\s/.test(src[j])) j++;
        const wrapped = first && (src[j] === ',' || src[j] === ')');
        record(s, startLine, wrapped);
        sig('x'); tok('str');
        continue;
      }
      if (c === '`') { readTemplate(); sig('x'); tok('tpl'); continue; }
      if (c === '/') {
        if (!sigOnLine || REGEX_BEFORE.has(last) || last === 'kw') { skipRegex(); sig('x'); tok('re'); continue; }
        i++; sig('/'); tok('/');
        continue;
      }
      if (ID_CHAR.test(c)) {
        let j = i;
        while (j < src.length && ID_CHAR.test(src[j])) j++;
        const w = src.slice(i, j);
        // T の前が . や名前の続きなら T( ではない（x.T( など）
        const p = src[i - 1];
        tok(w === 'T' && p !== '.' ? 'T' : 'id');
        i = j; sig(p !== '.' && REGEX_AFTER_WORD.has(w) ? 'kw' : 'x');
        continue;
      }
      if (c === '(' || c === '[' || c === '{') {
        stack.push({ ch: c, callee: c === '(' ? calleeBefore() : null, body: c === '{' && (last === ')' || last === '>') });
        i++; sig(c); tok(c);
        continue;
      }
      if (c === ')' || c === ']' || c === '}') {
        const top = stack.pop();
        i++;
        if (top?.ch === '${') { if (inTpl) return; }
        sig(c); tok(c);
        continue;
      }
      i++; sig(c); tok(c);
    }
  }
  code(false);
  return out;
}

// index.html の本文の <script>（src なし・ld+json 以外）を /* ---------- <名前> ---------- */ で切る。
// 名前は最初の （ か ' ----------' まで。head の script は '先読み'
export function inlineSections(indexHtml) {
  const res = {};
  const bodyAt = indexHtml.search(/<body[\s>]/);
  for (const m of indexHtml.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(m[1]) || /application\/ld\+json/.test(m[1])) continue;
    const src = m[2];
    if (m.index < bodyAt) { res['先読み'] = (res['先読み'] ?? '') + src; continue; }
    const marks = [...src.matchAll(/\/\* ---------- ([^（\n]*?)(?:（| ----------)/g)];
    if (!marks.length) continue;
    marks.forEach((k, j) => {
      const from = j === 0 ? 0 : k.index, to = marks[j + 1]?.index ?? src.length;
      res[k[1].trim()] = src.slice(from, to);
    });
  }
  return res;
}
