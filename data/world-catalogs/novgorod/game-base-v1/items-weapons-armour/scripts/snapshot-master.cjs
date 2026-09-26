// One-time snapshot of MASTER_ARCHIVE_v1 military material-culture rows into authoring/.
// Usage: node scripts/snapshot-master.cjs <path to MASTER .../normalized_source_tables/occupations>
const fs = require('fs'), path = require('path');
const { parseCsv, writeCsv } = require('./csv.cjs');
const src = process.argv[2];
if (!src) { console.error('need MASTER occupations dir'); process.exit(1); }
const out = path.join(__dirname, '..', 'authoring');
const items = parseCsv(fs.readFileSync(path.join(src, 'material_culture_items.csv'), 'utf8'));
const CATS = new Set(['weapons', 'armor', 'helmets', 'shields', 'military_equipment', 'fortifications', 'hunting']);
const COLS = ['item_id', 'name_ru', 'category', 'subcategory', 'description_ru', 'who_used', 'social_scope', 'military_scope', 'period_from', 'period_to', 'materials', 'construction', 'dimensions', 'weight_if_known', 'wear_and_condition', 'historical_confidence', 'evidence_basis', 'source_ids', 'anachronism_risk', 'do_not_confuse_with', 'generation_policy'];
const rows = items.filter(r => CATS.has(r.category)).map(r => Object.fromEntries(COLS.map(c => [c, r[c]])));
writeCsv(path.join(out, 'master_military_snapshot.csv'), COLS, rows);
const used = new Set(); rows.forEach(r => JSON.parse(r.source_ids || '[]').forEach(s => used.add(s)));
const srcs = parseCsv(fs.readFileSync(path.join(src, 'sources.csv'), 'utf8')).filter(r => used.has(r.source_id));
writeCsv(path.join(out, 'master_sources_snapshot.csv'), ['source_id', 'title', 'authors', 'year', 'url', 'trust_level'], srcs);
console.log('master rows', rows.length, 'sources', srcs.length);
