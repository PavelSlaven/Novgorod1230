export function splitLeadingJson(text) {
  const values = [], gaps = [];
  let end = 0;
  while (end < text.length) {
    const start = end + (text.slice(end).match(/^\s*/u)?.[0].length ?? 0);
    let stop = start;
    if (text[start] === '{' || text[start] === '[') {
      const stack = [];
      let quoted = false, escaped = false;
      for (; stop < text.length; stop += 1) {
        const char = text[stop];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '{' || char === '[') stack.push(char);
        else if (char === '}' || char === ']') {
          if (stack.pop() !== (char === '}' ? '{' : '[')) break;
          if (stack.length === 0) { stop += 1; break; }
        }
      }
    } else if (text[start] === '"') {
      stop += 1;
      for (let escaped = false; stop < text.length; stop += 1) {
        if (escaped) escaped = false;
        else if (text[stop] === '\\') escaped = true;
        else if (text[stop] === '"') { stop += 1; break; }
      }
    } else {
      const scalar = text.slice(start).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s|$)/u);
      if (scalar) stop += scalar[0].length;
    }
    if (stop === start) break;
    const raw = text.slice(start, stop);
    try { JSON.parse(raw); } catch { break; }
    gaps.push(text.slice(end, start));
    values.push(raw);
    end = stop;
  }
  const tailStart = end + (text.slice(end).match(/^\s*/u)?.[0].length ?? 0);
  return { values, gaps, tailGap: text.slice(end, tailStart),
    tail: text.slice(tailStart) };
}

export function promptParts(messages) {
  const system = messages.filter(({ role }) => role === 'system')
    .map(({ content }) => content).join('\n\n');
  const user = messages.filter(({ role }) => role === 'user')
    .map(({ content }) => content).join('\n\n');
  const parsed = splitLeadingJson(user);
  return { system, user, ...parsed,
    instructions: system + (parsed.tail ? '\n\n' + parsed.tail : '') };
}

export function unquotedLatin(text) {
  const masked = text.replace(/```[\s\S]*?```|`[^`\n]*`/gu,
    (code) => code.replace(/[^\n]/gu, ' '));
  return [...masked.matchAll(/[A-Za-z_$][A-Za-z0-9_.$\[\]-]*/gu)]
    .filter(([word]) => word !== 'JSON' && word !== 'NPC')
    .map((match) => ({ word: match[0],
      line: text.slice(0, match.index).split('\n').length,
      fragment: text.slice(Math.max(0, match.index - 45), match.index + match[0].length + 45) }));
}

export function unexplainedCode(text) {
  const unfenced = text.replace(/```[\s\S]*?```/gu,
    (code) => code.replace(/[^\n]/gu, ' '));
  const fragments = new Map();
  for (const match of unfenced.matchAll(/`[^`\n]+`/gu)) {
    const lineStart = unfenced.lastIndexOf('\n', match.index) + 1;
    const lineEnd = unfenced.indexOf('\n', match.index + match[0].length);
    const line = unfenced.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
    const previous = fragments.get(match[0]);
    fragments.set(match[0], { code: match[0],
      explained: previous?.explained || /[А-Яа-яЁё]/u.test(line),
      line: text.slice(0, match.index).split('\n').length });
  }
  return [...fragments.values()].filter(({ explained }) => !explained);
}
