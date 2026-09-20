import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../../..');

export const readFirstColumn = (file, delimiter = ',') => fs.readFileSync(file, 'utf8')
  .trim().split(/\r?\n/).slice(1).map(line => line.split(delimiter, 1)[0]);

export function compile(source) {
  const sourceIds = new Set(source.source_records.map(row => row.source_id));
  const names = source.names.filter(row => ['A1', 'A2'].includes(row.evidence_grade) && row.status === 'evidence_bound');
  for (const row of names) {
    if (!row.evidence.length || row.editorial_weight !== 1 || row.weight_basis !== 'editorial_equal_weight') {
      throw new Error(`invalid compiled evidence/weight: ${row.name_id}`);
    }
    for (const evidence of row.evidence) {
      if (!sourceIds.has(evidence.source_id) || !evidence.record_id || !evidence.document || !evidence.page_or_record || !evidence.section) {
        throw new Error(`incomplete evidence: ${row.name_id}`);
      }
    }
  }

  const ids = names.map(row => row.name_id);
  const pools = {
    russian_common_male: ids.filter(id => names.find(row => row.name_id === id).origin === 'novgorod_rus' && names.find(row => row.name_id === id).sex === 'male' && names.find(row => row.name_id === id).special_state === 'common'),
    russian_common_female: ids.filter(id => names.find(row => row.name_id === id).origin === 'novgorod_rus' && names.find(row => row.name_id === id).sex === 'female' && names.find(row => row.name_id === id).special_state === 'common'),
    monastic_male: ids.filter(id => names.find(row => row.name_id === id).admissions.includes('monastic')),
    dynastic_male: ids.filter(id => names.find(row => row.name_id === id).admissions.includes('dynastic')),
    baltic_west_contextual: []
  };
  return {
    schema_version: 'rus.novgorod.onomastic_candidate.v1',
    candidate_id: source.candidate_id,
    version: source.version,
    period: source.period,
    status: 'candidate_not_approved',
    import_enabled: false,
    activation_enabled: false,
    weight_policy: 'All compiled entries carry explicit editorial equal weight 1; corpus counts are evidence notes only and never weights.',
    names,
    pools,
    contextual_authoring_only: source.names.filter(row => row.status === 'contextual_authoring_only'),
    excluded: source.names.filter(row => !['evidence_bound', 'contextual_authoring_only'].includes(row.status)),
    unapproved_origin_gaps: source.unapproved_origin_gaps,
    selection_policy: source.selection_policy
  };
}

export function eligible(candidate, context) {
  if (!['novgorod_rus', 'baltic_west'].includes(context.origin)) {
    const error = new Error(`unsupported origin: ${context.origin}`);
    error.code = 'ONOMASTIC_ORIGIN_GAP';
    throw error;
  }
  const pool = context.origin === 'baltic_west' ? 'baltic_west_contextual'
    : context.dynastic_state ? `dynastic_${context.sex}`
      : context.monastic_state ? `monastic_${context.sex}`
        : `russian_common_${context.sex}`;
  return candidate.pools[pool] ?? [];
}

export function selectBySeed(candidate, context, seed) {
  const ids = eligible(candidate, context).slice().sort();
  if (!ids.length) {
    const error = new Error('no approved names for context');
    error.code = 'ONOMASTIC_CANDIDATE_GAP';
    throw error;
  }
  return ids[Math.abs(Number(seed)) % ids.length];
}

export function identityProjection(identity, knowledge) {
  const visible = { name: identity.current_name };
  if (identity.father_relation?.status === 'committed' && knowledge.includes('patronymic')) {
    visible.patronymic = identity.father_relation.patronymic;
  }
  return visible;
}

export function applyTonsure(identity, monasticName) {
  return { ...identity, current_name: monasticName, prior_names: [...(identity.prior_names ?? []), identity.current_name], monastic_state: true };
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(here, name), `${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = JSON.parse(fs.readFileSync(path.join(here, 'source-authoring.json'), 'utf8'));
  const candidate = compile(source);
  const positions = readFirstColumn(path.join(root, 'data/world-base-seeds/social_position_archetypes_v1.csv'));
  const roles = readFirstColumn(path.join(root, 'data/world-base-seeds/novgorod_role_position_map_v1.csv'));
  candidate.coverage = {
    social_position_archetype_ids: positions,
    role_ids: roles,
    social_position_count: positions.length,
    role_count: roles.length,
    rule: 'Position and occupation may modify form or priority, never eligibility in the common first-name pool.'
  };
  writeJson('candidate.json', candidate);
  writeJson('source-records.json', { schema_version: 'rus.onomastics.source_records.v1', records: source.source_records });
  writeJson('record-sources.json', {
    schema_version: 'rus.onomastics.record_sources.v1',
    records: candidate.names.flatMap(name => name.evidence.map(evidence => ({
      record_kind: 'onomastic_name', record_id: name.name_id, source_id: evidence.source_id,
      source_record_id: evidence.record_id, page_or_record: evidence.page_or_record, section: evidence.section
    })))
  });
  writeJson('approval-request.json', {
    schema_version: 'rus.onomastics.approval_request.v1',
    candidate_id: candidate.candidate_id,
    requested_decision: 'independent_per_entry_review',
    requester_may_approve: false,
    approval_status: 'pending_independent_review',
    import_enabled: false,
    activation_enabled: false,
    review_scope: ['compiled A1/A2 evidence bindings', 'editorial equal weights', 'contextual exclusions', 'selection policy', '30/30 position and 71/71 role coverage'],
    forbidden_promotion_source: 'tools/rus13-novgorod-regional-templates/novgorod_npc_name_pools_v1.json'
  });
}
