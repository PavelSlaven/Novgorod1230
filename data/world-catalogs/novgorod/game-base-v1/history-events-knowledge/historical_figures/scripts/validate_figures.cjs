// .cjs: package.json at repo root sets "type": "module"; kept as CommonJS (fix 2026-09-26).
const fs = require('fs');
const path = require('path');
function parseCsv(file) {
  const text = fs.readFileSync(file, 'utf8').trim().split('\n');
  const header = text[0].split(',');
  return text.slice(1).map(line => {
    const vals = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) { if (c === '"' && line[i+1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c; }
      else { if (c === '"') inQ = true; else if (c === ',') { vals.push(cur); cur = ''; } else cur += c; }
    }
    vals.push(cur);
    const row = {}; header.forEach((h, i) => row[h] = vals[i]); return row;
  });
}
const OUT = process.argv[2];
const rows = parseCsv(path.join(OUT, 'figures.csv'));
let missingRef = 0;
for (const r of rows) if (!r.source_refs || r.source_refs.length < 5) missingRef++;
console.log('rows:', rows.length, 'missing source_refs:', missingRef);

// overlap check per normalized office keyword bucket (посадник / архиепископ / тысяцкий / приглашённый князь)
function bucket(office, row) {
  const o = office.toLowerCase();
  const ext = /внешн|литовск|шведск|монгольск|орденск|дерпт/i.test((row.significance || '') + ' ' + (row.location_refs || '') + ' ' + office);
  if (ext) return null; // external actors (Batu, Birger, Hermann, Andreas, Mindaugas) are not Novgorod officeholders
  if (/на покое/i.test(office)) return null; // 2026-09-26: retired/emeritus office-holder (e.g. Antony), not a concurrent claim on the office
  if (o.includes('посадник') && !o.includes('быв')) return 'посадник';
  if (o.includes('архиепископ') || o.includes('владыка')) return 'архиепископ';
  if (o.includes('тысяцк')) return 'тысяцкий';
  if (o.includes('приглашённый князь') || o.includes('князь новгородский')) return 'князь';
  return null;
}
const byBucket = {};
for (const r of rows) {
  const b = bucket(r.office, r);
  if (!b) continue;
  (byBucket[b] = byBucket[b] || []).push(r);
}
let overlaps = [];
for (const [b, list] of Object.entries(byBucket)) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], c = list[j];
    if (a.name_ru === c.name_ru) continue;
    if (a.office_start && a.office_end && c.office_start && c.office_end &&
        a.office_start <= c.office_end && c.office_start <= a.office_end) {
      overlaps.push(`${b}: ${a.name_ru} [${a.office_start}..${a.office_end}] overlaps ${c.name_ru} [${c.office_start}..${c.office_end}]`);
    }
  }
}
console.log('office-window overlaps found:', overlaps.length);
overlaps.forEach(o => console.log(' -', o));
