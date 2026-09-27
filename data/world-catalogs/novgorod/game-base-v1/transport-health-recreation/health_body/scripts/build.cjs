'use strict';
// Deterministic extraction for domain health_body.
// Source: book evidence (verified). Structured fields are keyword-derived (deterministic);
// content authoring beyond keyword tags stays in facts_summary for a follow-up authoring pass.
const path = require('path');
const lib = require('../../scripts/lib.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const GROUP_SOURCES = path.join(ROOT, 'sources');
const OUT = path.resolve(__dirname, '..');

const bookFile = path.join(GROUP_SOURCES, 'book_evidence_transport_health_recreation.csv');
const rows = lib.loadBookEvidence(bookFile, 'health_body');
const byEntity = lib.groupByEntity(rows);

const KIND_RULES = [
  [/лечец|резалник|летец|лекар|хирург/i, 'caregiver_role'],
  [/повитуха|роды в бане|бан(я|ник)/i, 'birth_and_bathhouse'],
  [/волхв|знахар|заговор|науз|чародей/i, 'folk_healing_practice'],
  [/монастыр/i, 'institutional_care'],
  [/мор\b|эпидеми/i, 'epidemic'],
  [/голод|худоба/i, 'famine_and_hunger'],
  [/травм|рана|побои|трепанац|хирург/i, 'injury'],
  [/лихорадк|огневиц|огненная|проказ|эрготизм|утин/i, 'disease'],
  [/детство|взрослени|постриг|посажение на коня|кормил/i, 'lifecycle_childhood'],
  [/продолжительность жизни|палеопатолог/i, 'lifecycle_demography'],
  [/уход за|посещение больного|милостыня/i, 'care_practice'],
  [/конский мор/i, 'animal_disease'],
];
function classify(name) {
  for (const [re, kind] of KIND_RULES) if (re.test(name)) return kind;
  return 'other';
}

const rowsOut = [];
let seq = 1;
for (const [entity, facts] of byEntity) {
  const confidences = facts.map(f => f.confidence);
  const sourceRefs = [...new Set(facts.map(lib.bookRef))];
  const factsSummary = [...new Set(facts.map(f => `${f.fact_type}: ${f.value}`))]
    .join(' | ')
    .slice(0, 1200);
  const periods = [...new Set(facts.map(f => f.period).filter(Boolean))];
  const isHistoricalPracticeOnly = /волхв|знахар|заговор|науз|чародей/i.test(entity);
  rowsOut.push({
    hl_id: 'hlb_' + String(seq++).padStart(3, '0'),
    kind: classify(entity),
    name_ru: entity,
    facts_summary: factsSummary,
    period_care_practice_note: isHistoricalPracticeOnly
      ? 'historical practice only, not medical advice' : '',
    period: periods.join(';'),
    fact_count: facts.length,
    source_refs: sourceRefs.join(';'),
    confidence: lib.worstConfidence(confidences),
    status: 'candidate',
  });
}

lib.writeCsv(
  path.join(OUT, 'health_entities.csv'),
  ['hl_id', 'kind', 'name_ru', 'facts_summary', 'period_care_practice_note', 'period',
    'fact_count', 'source_refs', 'confidence', 'status'],
  rowsOut
);

console.error('health_entities.csv rows:', rowsOut.length);
const byKind = {};
rowsOut.forEach(r => byKind[r.kind] = (byKind[r.kind] || 0) + 1);
console.error('by kind:', byKind);
