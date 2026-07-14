export function parseTsv(text) {
  const rows = parseDelimited(String(text ?? ''), '\t');
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return body.filter((row) => row.some((value) => value !== '')).map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ''])));
}

function parseDelimited(input, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/u, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (quoted) throw new TypeError('unterminated quoted TSV field');
  if (field !== '' || row.length > 0) {
    row.push(field.replace(/\r$/u, ''));
    rows.push(row);
  }
  return rows;
}

export function parseJsonCell(value, fallback = null) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}
