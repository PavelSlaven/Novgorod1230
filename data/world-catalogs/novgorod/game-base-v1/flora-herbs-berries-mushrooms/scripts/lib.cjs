// shared helpers for flora-herbs-berries-mushrooms build scripts (candidate data)
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(__dirname, 'src');
function readTsv(file) {
  const lines = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\r/g, '').split('\n').filter(l => l.trim());
  const head = lines[0].split('\t');
  return lines.slice(1).map((l, i) => {
    const c = l.split('\t');
    while (c.length < head.length) c.push('');
    if (c.length !== head.length) throw new Error(`${file}:${i + 2} has ${c.length} cols, expected ${head.length} (${c[0]})`);
    const o = {}; head.forEach((h, j) => { o[h] = (c[j] || '').trim(); }); return o;
  });
}
function months(spec) {
  if (!spec || spec === '—' || spec === '-' ) return [];
  const out = new Set();
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
    if (!m) throw new Error('bad month spec ' + spec);
    let a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || a > 12 || b < 1 || b > 12) throw new Error('month out of range ' + spec);
    for (let x = a; ; x = x % 12 + 1) { out.add(x); if (x === b) break; }
  }
  return [...out].sort((x, y) => x - y);
}
function csvCell(v) { v = v == null ? '' : String(v); return /[",\n;]/.test(v) || /^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function writeCsv(file, rows, cols) {
  const out = [cols.join(',')].concat(rows.map(r => cols.map(c => csvCell(r[c])).join(','))).join('\n') + '\n';
  fs.writeFileSync(path.join(ROOT, file), out, 'utf8');
}
const wikiUrl = lat => 'https://en.wikipedia.org/wiki/' + lat.replace(/ subsp\..*$/, '').replace(/ /g, '_');
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
module.exports = { fs, path, ROOT, SRC, readTsv, months, writeCsv, csvCell, wikiUrl, readJson };
