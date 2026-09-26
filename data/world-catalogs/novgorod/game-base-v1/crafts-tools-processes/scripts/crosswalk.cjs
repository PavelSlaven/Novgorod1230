'use strict';
// Build materials_registry/material_crosswalk.csv: foreign material codes of other game-base domains -> mt_ids.
// Inputs: manual map (scripts/src/crosswalk-manual.cjs) + automatic resolution of foreign vocab names by Russian stems.
// Foreign vocabularies read if present: buildings materials_vocab.csv (mat_*), clothing materials_colors.csv (MAT###, kind=material).
const L = require('./lib.cjs');
const { path, fs, readCsv, writeCsv, DOMAIN_ROOT, GAME_BASE } = L;
const P = rel => path.join(DOMAIN_ROOT, rel);
const mats = readCsv(P('materials_registry/materials.csv'));
const deny = readCsv(P('materials_registry/late_materials_denylist.csv'));
const manual = require('./src/crosswalk-manual.cjs').map(([code, mt, method, note]) => ({ foreign_code: code, foreign_vocab: method.startsWith('vocab') ? 'buildings-interiors-containers/buildings/materials_vocab.csv' : 'free_token', foreign_name: '', mt_ids: mt, method, note }));
const seen = new Set(manual.map(r => r.foreign_code));
const resolve = L.makeResolver(mats, deny, []);
const rows = [...manual];
const vocabs = [
  ['buildings-interiors-containers/buildings/materials_vocab.csv', 'mat_id', 'name_ru', r => true],
  ['clothing-appearance/garments/materials_colors.csv', 'palette_id', 'name_ru', r => r.kind === 'material'],
];
const missing = [];
for (const [rel, idCol, nameCol, keep] of vocabs) {
  const p = path.join(GAME_BASE, rel);
  if (!fs.existsSync(p)) { missing.push(rel); continue; }
  for (const r of readCsv(p).filter(keep)) {
    const code = r[idCol];
    if (seen.has(code)) { rows.find(x => x.foreign_code === code).foreign_name = r[nameCol]; continue; }
    const x = resolve(r[nameCol]); seen.add(code);
    rows.push({ foreign_code: code, foreign_vocab: rel, foreign_name: r[nameCol], mt_ids: x.mt.join(';'), method: x.unresolved.length ? 'ru_name_stem_partial' : 'ru_name_stem', note: x.unresolved.length ? `не распознано: ${x.unresolved.join(' | ')}` : '' });
  }
}
const n = writeCsv(P('materials_registry/material_crosswalk.csv'), ['foreign_code', 'foreign_vocab', 'foreign_name', 'mt_ids', 'method', 'note'], rows);
const byMethod = rows.reduce((a, r) => ((a[r.method] = (a[r.method] || 0) + 1), a), {});
console.log(JSON.stringify({ rows: n, byMethod, unmapped: rows.filter(r => !r.mt_ids && !r.method.startsWith('out_of_scope')).map(r => r.foreign_code), missing_vocab_files: missing }, null, 2));
