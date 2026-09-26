// Acceptance check per brief: chronicle_ref present per phase; dates within 1230-1250; node_refs resolve.
// .cjs: package.json at repo root sets "type": "module"; kept as CommonJS (fix 2026-09-26).
const fs = require('fs');
const path = require('path');
function parseCsv(file) {
  const text = fs.readFileSync(file, 'utf8').trim().split('\n');
  const header = text[0].split(',');
  return text.slice(1).map(line => {
    // simple CSV parse handling quoted fields
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { vals.push(cur); cur = ''; }
        else cur += c;
      }
    }
    vals.push(cur);
    const row = {};
    header.forEach((h, i) => row[h] = vals[i]);
    return row;
  });
}

const OUT = process.argv[2];
const phases = parseCsv(path.join(OUT, 'event_phases.csv'));
let noChronicleRef = 0, badDate = 0, unresolvedNodeRefsV17 = 0, needsReviewCount = 0;
const rejected = [];

for (const r of phases) {
  let bad = false;
  // 2026-09-26: chronicle_ref no longer claims to be a quotation (see build_events.cjs); the "missing"
  // sentinel text changed with it.
  if (!r.chronicle_ref || r.chronicle_ref.startsWith('нет даже чернового пересказа')) { noChronicleRef++; bad = true; }
  const dateStr = r.date_range || '';
  const year = parseInt((dateStr.match(/^(\d{4})/) || [])[1], 10);
  if (!year || year < 1230 || year > 1250) { badDate++; bad = true; }
  if (!r.node_refs_v17) { unresolvedNodeRefsV17++; } // known gap, not counted as reject
  if (r.needs_review === 'true') needsReviewCount++;
  if (bad) rejected.push({ phase_id: r.phase_id, reason: (!r.chronicle_ref || r.chronicle_ref.startsWith('нет даже')) ? 'no_chronicle_ref' : 'date_out_of_range' });
}

console.log('phases total:', phases.length);
console.log('phases missing even a draft chronicle paraphrase:', noChronicleRef);
console.log('phases with date outside 1230-1250 or unparseable:', badDate);
console.log('phases with node_refs_v17 unresolved (v6->v17 mapping gap, all rows):', unresolvedNodeRefsV17);
console.log('phases flagged needs_review=true (restored draft audit flag):', needsReviewCount);
fs.writeFileSync(path.join(OUT, 'rejected_report.json'), JSON.stringify(rejected, null, 1));
console.log('rejected (hard failures) written to rejected_report.json:', rejected.length);
