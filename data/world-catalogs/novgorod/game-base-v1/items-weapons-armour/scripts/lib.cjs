// Shared paths and loaders for items-weapons-armour build/validate.
const fs = require('fs'), path = require('path');
const { parseCsv, parseTsv } = require('./csv.cjs');
const ROOT = path.resolve(__dirname, '..');                       // .../game-base-v1/items-weapons-armour
const REPO = path.resolve(ROOT, '..', '..', '..', '..', '..');    // repo root (Novgorod-game-base)
const NOV = path.join(REPO, 'data', 'world-catalogs', 'novgorod');
const P = {
  authoring: f => path.join(ROOT, 'authoring', f),
  roles: path.join(REPO, 'data', 'novgorod-region', 'novgorod_social_roles_v1_enriched.tsv'),
  occs: path.join(REPO, 'data', 'novgorod-region', 'novgorod_occupations_v1_enriched.tsv'),
  wkDir: path.join(NOV, 'world-knowledge', 'production-v1'),
  costume: path.join(NOV, 'sources', 'costume-dataset-v1', 'data'),
  timeline: path.join(NOV, 'sources', 'nov-region-audit-v1', 'novgorod_historical_timeline_1230_1250_v1.json'),
  statusRules: path.join(NOV, 'sources', 'nov-region-audit-v1', 'novgorod_status_rules_v1.json'),
  bible: path.join(NOV, 'sources', 'character-bible-1230', 'novgorod_character_1230.md'),
  bibleItems: path.join(NOV, 'sources', 'character-bible-1230', 'data', 'items.json'),
  v5: path.join(REPO, 'data', 'knowledge-source', 'imports', 'item-container-120-v5', 'candidate', 'tables'),
  catalog: path.join(NOV, 'game-base-v1', 'catalog.json'),
  sqlite: 'C:/Users/Slaven/Downloads/novgorod_1230(1) (1).sqlite'
};
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const readCsv = f => parseCsv(fs.readFileSync(f, 'utf8'));
const readTsv = f => parseTsv(fs.readFileSync(f, 'utf8'));
function wkIndex() {
  const claims = {}, concepts = {};
  for (const f of fs.readdirSync(P.wkDir)) {
    if (!f.endsWith('.json') || f.startsWith('verification') || f === 'runtime-bundle.json' || f === 'vector-index.json') continue;
    let j; try { j = readJson(path.join(P.wkDir, f)); } catch { continue; }
    for (const c of j.claims || []) claims[c.claim_ref] = { file: f, status: c.review_status };
    for (const c of j.concepts || []) concepts[c.concept_ref] = { file: f, status: c.review_status };
  }
  return { claims, concepts };
}
const FREQ_W = { ubiquitous: 8, common: 4, contextual: 2, rare: 1 };
const COMBAT_ORDER = ['very_low', 'low', 'medium', 'medium_high'];
const COMBAT_W = { very_low: 1, low: 2, medium: 4, medium_high: 8 };
module.exports = { ROOT, REPO, NOV, P, readJson, readCsv, readTsv, wkIndex, FREQ_W, COMBAT_ORDER, COMBAT_W };
