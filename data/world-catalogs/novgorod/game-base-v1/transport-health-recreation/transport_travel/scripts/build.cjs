'use strict';
// Deterministic extraction for domain transport_travel.
// Sources: book evidence (verified), region route guidance TSV (draft, copied source).
// Output: route_modes.csv (direct derivation of route guidance), transport_entities.csv
// (entity-level aggregation of book-evidence facts, classified by keyword rules).
const path = require('path');
const fs = require('fs');
const lib = require('../../scripts/lib.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const GROUP_SOURCES = path.join(ROOT, 'sources');
const REGION_SOURCES = path.resolve(ROOT, '..', '..', 'sources', 'nov-region-audit-v1');
const OUT = path.resolve(__dirname, '..');

// ---------- 1. route_modes.csv : direct derivation from route guidance TSV ----------
const guidanceFile = path.join(REGION_SOURCES, 'novgorod_region_route_guidance.tsv');
const guidance = lib.loadCsvObjects(guidanceFile, '\t');

// Source is an LLM draft (see ../../../sources/nov-region-audit-v1/PROVENANCE.md: status=draft,
// requires_human_historical_audit=true; main external source for the classification itself is
// Historic England "Pre-industrial roads" — an English typology used here only as analogy, not
// Novgorod-specific evidence). By the group's confidence rule an unaudited LLM draft / analogy
// caps at C regardless of the source file's own "medium"/"medium_high"/"medium_low" label.
const routeModeRows = guidance.map(g => ({
  rm_id: g.id.replace(/^rrtg_/, 'trm_'),
  route_template_id: g.route_template_id,
  name_ru: g.template_title,
  is_allowed: g.is_allowed,
  is_common: g.is_common,
  is_rare: g.is_rare,
  generation_weight: g.generation_weight,
  generation_weight_basis: 'unverified_llm_draft_no_stated_rule',
  allowed_edge_types: g.allowed_edge_types,
  compatible_landscape_template_ids: g.compatible_landscape_template_ids,
  compatible_water_body_template_ids: g.compatible_water_body_template_ids,
  compatible_place_template_ids: g.compatible_place_template_ids,
  regional_limits_ru: g.regional_limits,
  game_use_ru: g.game_use,
  limits_ru: g.limits,
  status: 'candidate',
  confidence: 'C',
  sources: g.sources,
  source_refs: 'file:data/world-catalogs/novgorod/sources/nov-region-audit-v1/novgorod_region_route_guidance.tsv#' + g.id,
  note: g.audit_notes,
}));

lib.writeCsv(
  path.join(OUT, 'route_modes.csv'),
  ['rm_id', 'route_template_id', 'name_ru', 'is_allowed', 'is_common', 'is_rare', 'generation_weight',
    'generation_weight_basis', 'allowed_edge_types', 'compatible_landscape_template_ids',
    'compatible_water_body_template_ids', 'compatible_place_template_ids',
    'regional_limits_ru', 'game_use_ru', 'limits_ru', 'status', 'confidence', 'sources', 'source_refs', 'note'],
  routeModeRows
);

// ---------- 2. transport_entities.csv : book-evidence aggregation ----------
const bookFile = path.join(GROUP_SOURCES, 'book_evidence_transport_health_recreation.csv');
const rows = lib.loadBookEvidence(bookFile, 'transport_travel');
const byEntity = lib.groupByEntity(rows);

// keyword -> kind classification (deterministic, first match wins)
const KIND_RULES = [
  [/паром|перевоз/i, 'ferry_crossing'],
  [/брод/i, 'ford'],
  [/мост/i, 'bridge'],
  [/волок/i, 'portage'],
  [/ладья|струг|насад|ушкуй|учан|челн|плот|судно|киль|обшивка|нагель|весло|уключина|черпак/i, 'watercraft_or_part'],
  [/сани|салазки|волокуша/i, 'sledge'],
  [/телега|колесо тележное|тележная ось/i, 'cart'],
  [/оглобля|хомут|дуга/i, 'harness_part'],
  [/лыжи|коньки/i, 'ski_skate'],
  [/порож|лоцман/i, 'hazard_river_rapids'],
  [/мыт|гостинополье/i, 'toll_point'],
  [/гостеприимство|странноприимница|ночлег/i, 'hospitality'],
  [/мостник|устав о мостех/i, 'infrastructure_law'],
  [/суд над вором/i, 'road_law'],
  [/конь \(цена\)|подводы|возчик|путь гостя/i, 'logistics_role_or_price'],
  [/дорог|путь|переход/i, 'road_or_route'],
  [/верховая езда/i, 'riding'],
];
function classify(name) {
  for (const [re, kind] of KIND_RULES) if (re.test(name)) return kind;
  return 'other';
}

const HAZARD_KEYWORDS = [
  ['лёд', 'лед'], ['половодь', 'ice_or_flood'], ['разбо', 'robbery'], ['порог', 'rapids'],
  ['тон', 'drowning'], ['мор', 'sea_storm_risk'],
];

const entityRows = [];
let seq = 1;
for (const [entity, facts] of byEntity) {
  const confidences = facts.map(f => f.confidence);
  const sourceRefs = [...new Set(facts.map(lib.bookRef))];
  const factsSummary = [...new Set(facts.map(f => `${f.fact_type}: ${f.value}`))]
    .join(' | ')
    .slice(0, 1200);
  const hazardHits = [...new Set(
    facts
      .map(f => `${f.fact_type} ${f.value} ${f.note}`)
      .join(' ')
      .toLowerCase()
      .match(/лёд|лед|половодь|разбо|порог|тон[ую]|шторм/g) || []
  )];
  const periods = [...new Set(facts.map(f => f.period).filter(Boolean))];
  entityRows.push({
    tr_id: 'trv_' + String(seq++).padStart(3, '0'),
    kind: classify(entity),
    name_ru: entity,
    facts_summary: factsSummary,
    hazard_keywords: hazardHits.join(';'),
    period: periods.join(';'),
    fact_count: facts.length,
    source_refs: sourceRefs.join(';'),
    confidence: lib.worstConfidence(confidences),
    status: 'candidate',
  });
}

lib.writeCsv(
  path.join(OUT, 'transport_entities.csv'),
  ['tr_id', 'kind', 'name_ru', 'facts_summary', 'hazard_keywords', 'period', 'fact_count',
    'source_refs', 'confidence', 'status'],
  entityRows
);

console.error('route_modes.csv rows:', routeModeRows.length);
console.error('transport_entities.csv rows:', entityRows.length);
const byKind = {};
entityRows.forEach(r => byKind[r.kind] = (byKind[r.kind] || 0) + 1);
console.error('by kind:', byKind);
