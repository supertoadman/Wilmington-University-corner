// A parser for JavaScript data literals (strings, numbers, true/false/null, arrays, objects)
// that never executes page code. The practice sets keep their data in inline <script> blocks, and
// the demo seeds from them, so (like scripts/lib/quiz.mjs, whose parser is not exported) anything
// that is not a literal makes the parse fail instead of running.

const BS = String.fromCharCode(92);
const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

/** Parse one literal starting at src[start]. Returns { value, end } or throws. */
export function parseLiteral(src, start) {
  let i = start;
  const ws = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith('//', i)) { const n = src.indexOf('\n', i); i = n < 0 ? src.length : n; } else if (src.startsWith('/*', i)) { const n = src.indexOf('*/', i); if (n < 0) throw new Error('comment'); i = n + 2; } else return;
    }
  };
  const string = () => {
    const quote = src[i++];
    let out = '';
    while (i < src.length && src[i] !== quote) {
      const c = src[i++];
      if (quote === '`' && c === '$' && src[i] === '{') throw new Error('template expression');
      if (c !== BS) { out += c; continue; }
      const e = src[i++];
      if (e === 'u') {
        const hex = src[i] === '{' ? src.slice(i + 1, src.indexOf('}', i)) : src.slice(i, i + 4);
        i += src[i] === '{' ? hex.length + 2 : 4;
        out += String.fromCodePoint(parseInt(hex, 16));
      } else if (e === 'x') { out += String.fromCharCode(parseInt(src.slice(i, i + 2), 16)); i += 2; } else if (e === '\r' || e === '\n') { if (e === '\r' && src[i] === '\n') i++; } else out += ESCAPES[e] ?? e;
    }
    if (src[i++] !== quote) throw new Error('unterminated string');
    return out;
  };
  const value = () => {
    ws();
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') return string();
    if (c === '[') {
      i++;
      const arr = [];
      for (;;) {
        ws();
        if (src[i] === ']') { i++; return arr; }
        arr.push(value());
        ws();
        if (src[i] === ',') i++; else if (src[i] !== ']') throw new Error('array');
      }
    }
    if (c === '{') {
      i++;
      const obj = Object.create(null);
      for (;;) {
        ws();
        if (src[i] === '}') { i++; return obj; }
        let key;
        if (src[i] === '"' || src[i] === "'") key = string();
        else { const m = /^[A-Za-z_$][\w$]*|^\d+(?:\.\d+)?/.exec(src.slice(i, i + 200)); if (!m) throw new Error('key'); key = m[0]; i += key.length; }
        ws();
        if (src[i++] !== ':') throw new Error('colon');
        obj[key] = value();
        ws();
        if (src[i] === ',') i++; else if (src[i] !== '}') throw new Error('object');
      }
    }
    const m = /^(?:-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|true|false|null|undefined)(?![\w$])/i.exec(src.slice(i, i + 40));
    if (!m) throw new Error('not a literal');
    i += m[0].length;
    return { true: true, false: false, null: null, undefined: undefined }[m[0].toLowerCase()] ?? Number(m[0]);
  };
  const v = value();
  return { value: v, end: i };
}

/** The literal assigned to `name` (`const NAME = [...]` or `{...}`), or null. */
export function literalNamed(src, name) {
  const m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(?=[\\[{])`).exec(src);
  if (!m) return null;
  try { return parseLiteral(src, m.index + m[0].length).value; } catch { return null; }
}
