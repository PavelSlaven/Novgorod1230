// Minimal RFC4180 CSV reader/writer (UTF-8, header row).
const fs = require('fs');
function parseRows(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c === '\r') { }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.length > 1 || r[0] !== '');
}
function parseCsv(text) {
  const [h, ...rs] = parseRows(text);
  return rs.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
function parseTsv(text) {
  const [h, ...rs] = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(l => l.split('\t'));
  return rs.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
const esc = v => { v = v == null ? '' : Array.isArray(v) ? v.join(' | ') : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function writeCsv(file, cols, rows) {
  fs.writeFileSync(file, [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n', 'utf8');
  return rows.length;
}
module.exports = { parseCsv, parseTsv, writeCsv };
