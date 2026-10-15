// Minimal-diff JSON editing for the admin page.
//
// setPath(text, ['documents', 'Outline.pdf', 'title'], 'New title') returns the same
// text with only that one value replaced (or inserted), so commits made from the admin
// page change a single line and keep the file's formatting, key order, and line endings.

const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
const skipWs = (t, i) => { while (i < t.length && isWs(t[i])) i++; return i; };

function scanString(t, i) {
  for (i++; i < t.length; i++) {
    if (t[i] === '\\') i++;
    else if (t[i] === '"') return i + 1;
  }
  throw new SyntaxError('Unterminated string');
}

function scanValue(t, i) {
  const c = t[i];
  if (c === '"') return scanString(t, i);
  if (c === '{' || c === '[') {
    let depth = 0;
    for (; i < t.length; i++) {
      const d = t[i];
      if (d === '"') i = scanString(t, i) - 1;
      else if (d === '{' || d === '[') depth++;
      else if ((d === '}' || d === ']') && --depth === 0) return i + 1;
    }
    throw new SyntaxError('Unterminated object');
  }
  const m = /^[^,}\]\s]+/.exec(t.slice(i, i + 64));
  if (!m) throw new SyntaxError(`Unexpected character at ${i}`);
  return i + m[0].length;
}

/** The members of the object starting at t[start] === '{'. */
function members(t, start) {
  if (t[start] !== '{') throw new SyntaxError(`Expected an object at ${start}`);
  const list = [];
  let i = skipWs(t, start + 1);
  if (t[i] === '}') return { list, close: i };
  for (;;) {
    const keyStart = i;
    const keyEnd = scanString(t, i);
    const key = JSON.parse(t.slice(keyStart, keyEnd));
    i = skipWs(t, keyEnd);
    if (t[i] !== ':') throw new SyntaxError(`Expected ':' at ${i}`);
    const valStart = skipWs(t, i + 1);
    const valEnd = scanValue(t, valStart);
    list.push({ key, keyStart, valStart, valEnd });
    i = skipWs(t, valEnd);
    if (t[i] === ',') { i = skipWs(t, i + 1); continue; }
    if (t[i] === '}') return { list, close: i };
    throw new SyntaxError(`Expected ',' or '}' at ${i}`);
  }
}

const lineIndent = (t, pos) => {
  const lineStart = t.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*/.exec(t.slice(lineStart))[0];
};

function insertMember(t, start, { list, close }, key, value) {
  const nl = t.includes('\r\n') ? '\r\n' : '\n';
  const encode = (indent) => JSON.stringify(value, null, 2).replace(/\n/g, nl + indent);
  if (list.length) {
    const last = list[list.length - 1];
    const inline = !t.slice(start, last.keyStart).includes('\n');
    if (inline) return `${t.slice(0, last.valEnd)}, ${JSON.stringify(key)}: ${JSON.stringify(value)}${t.slice(last.valEnd)}`;
    const indent = lineIndent(t, last.keyStart);
    return `${t.slice(0, last.valEnd)},${nl}${indent}${JSON.stringify(key)}: ${encode(indent)}${t.slice(last.valEnd)}`;
  }
  const outer = lineIndent(t, start);
  const inner = outer + '  ';
  return `${t.slice(0, start + 1)}${nl}${inner}${JSON.stringify(key)}: ${encode(inner)}${nl}${outer}${t.slice(close)}`;
}

export function setPath(text, keys, value) {
  let start = skipWs(text, 0);
  for (let k = 0; k < keys.length; k++) {
    const obj = members(text, start);
    const m = obj.list.find((x) => x.key === keys[k]);
    if (!m) {
      let v = value;
      for (let j = keys.length - 1; j > k; j--) v = { [keys[j]]: v };
      return insertMember(text, start, obj, keys[k], v);
    }
    if (k === keys.length - 1) return text.slice(0, m.valStart) + JSON.stringify(value) + text.slice(m.valEnd);
    start = m.valStart;
  }
  return text;
}
