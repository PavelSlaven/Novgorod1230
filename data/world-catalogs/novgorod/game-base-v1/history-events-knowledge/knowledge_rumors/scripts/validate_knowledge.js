const fs = require('fs'); const path = require('path');
function parseCsv(file) {
  const text = fs.readFileSync(file, 'utf8').trim().split('\n');
  const header = text[0].split(',');
  return text.slice(1).map(line => {
    const vals = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) { const c = line[i];
      if (inQ) { if (c === '"' && line[i+1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c; }
      else { if (c === '"') inQ = true; else if (c === ',') { vals.push(cur); cur = ''; } else cur += c; } }
    vals.push(cur); const row = {}; header.forEach((h, i) => row[h] = vals[i]); return row;
  });
}
const OUT = process.argv[2];
const rows = parseCsv(path.join(OUT, 'knowledge_rumors.csv'));
let noEventOrClass = 0, letterGenreNoPool = 0;
for (const r of rows) {
  if (r.kind === 'rumor' && !r.event_ref) noEventOrClass++;
  if (r.kind === 'letter_genre' && !r.text_pool_ref) letterGenreNoPool++;
}
console.log('rows:', rows.length);
console.log('rumor rows missing event_ref/generic_class:', noEventOrClass);
console.log('letter_genre rows missing text_pool_ref:', letterGenreNoPool);
