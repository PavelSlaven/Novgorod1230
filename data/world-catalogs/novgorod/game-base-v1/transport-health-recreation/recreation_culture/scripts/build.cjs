'use strict';
// Deterministic extraction for domain recreation_culture.
// Source: book evidence (verified). Flags anachronism candidates by an explicit denylist
// (per AGENTS.md acceptance rule: playing cards etc. must never appear for 1230).
const path = require('path');
const lib = require('../../scripts/lib.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const GROUP_SOURCES = path.join(ROOT, 'sources');
const OUT = path.resolve(__dirname, '..');

const bookFile = path.join(GROUP_SOURCES, 'book_evidence_transport_health_recreation.csv');
const rows = lib.loadBookEvidence(bookFile, 'recreation_culture');
const byEntity = lib.groupByEntity(rows);

const KIND_RULES = [
  [/шахмат|шашки|мельниц|бабки|тавле/i, 'board_or_dice_game'],
  [/игрушк|коник|погремушк|мазло|санки-салазки детские|кукла|вертушка|жужжалка|лодочка из коры|хлопушк|игрушечн|палка-лошадка|кубарь/i, 'toy'],
  [/гусли|гудок|волынка|сопел|сопец|свистулька|бубен|варган|шумящие подвески|ботало|звон|музыкальные инструмент/i, 'instrument_or_sound'],
  [/скоморох|гудцы/i, 'performer_role'],
  [/пир|братчина|каша/i, 'feast_occasion'],
  [/святки|коляда|русал|купальск|масленица|гулянь/i, 'calendar_festival'],
  [/кулачный бой/i, 'physical_contest'],
  [/охота|ловы/i, 'hunting_leisure'],
  [/чтение/i, 'literacy_leisure'],
  [/бесовские игры|народный праздник/i, 'church_disapproved_practice'],
];
function classify(name) {
  for (const [re, kind] of KIND_RULES) if (re.test(name)) return kind;
  return 'other';
}

// Anachronism denylist: entities that must NOT appear for Novgorod ~1230 even if the source
// text mentions them for context/contrast (e.g. dated out, or a later/foreign import).
const ANACHRONISM_PATTERNS = [
  [/игральные карты/i, 'playing cards — post-medieval import, not attested for Rus 1230'],
  [/шашки полусферические/i, 'Varangian hemispherical draughts — extinct by turn of X-XI c., not 1230'],
];
// Generic caveat detection from the book evidence's own `note` field (not a name denylist):
// any entity whose facts carry a dating/attribution caveat gets flagged, so the caveat is not
// lost when facts_summary drops `note` (see VERIFICATION.md "Потеряны верифицированные оговорки").
const NOTE_CAVEAT_PATTERNS = [
  [/не использовать как c1230/i, 'источник (историография XIX в., реалии XIV–XV вв.) не подтверждает эту реалию для 1230 г.; не использовать как достоверную для c1230'],
  [/для 1230 .{0,20}редкост|редкост.{0,20}(для )?1230/i, 'для Новгорода 1230 г. — редкость/сомнительно, не типичная реалия'],
];
function anachronismFlag(entity, factsSummary, notesText) {
  const text = entity + ' ' + factsSummary;
  for (const [re, note] of ANACHRONISM_PATTERNS) if (re.test(text)) return note;
  for (const [re, note] of NOTE_CAVEAT_PATTERNS) if (re.test(notesText)) return note;
  return '';
}

const rowsOut = [];
let seq = 1;
for (const [entity, facts] of byEntity) {
  const confidences = facts.map(f => f.confidence);
  const sourceRefs = [...new Set(facts.map(lib.bookRef))];
  const factsSummary = [...new Set(facts.map(f => `${f.fact_type}: ${f.value}`))]
    .join(' | ')
    .slice(0, 1200);
  const notesText = [...new Set(facts.map(f => f.note).filter(Boolean))]
    .join(' | ')
    .slice(0, 1200);
  const periods = [...new Set(facts.map(f => f.period).filter(Boolean))];
  rowsOut.push({
    rc_id: 'rec_' + String(seq++).padStart(3, '0'),
    kind: classify(entity),
    name_ru: entity,
    facts_summary: factsSummary,
    notes: notesText,
    anachronism_flag: anachronismFlag(entity, factsSummary, notesText),
    period: periods.join(';'),
    fact_count: facts.length,
    source_refs: sourceRefs.join(';'),
    confidence: lib.worstConfidence(confidences),
    status: 'candidate',
  });
}

lib.writeCsv(
  path.join(OUT, 'recreation_entities.csv'),
  ['rc_id', 'kind', 'name_ru', 'facts_summary', 'notes', 'anachronism_flag', 'period', 'fact_count',
    'source_refs', 'confidence', 'status'],
  rowsOut
);

console.error('recreation_entities.csv rows:', rowsOut.length);
const byKind = {};
rowsOut.forEach(r => byKind[r.kind] = (byKind[r.kind] || 0) + 1);
console.error('by kind:', byKind);
console.error('anachronism flags:', rowsOut.filter(r => r.anachronism_flag).map(r => r.name_ru));
