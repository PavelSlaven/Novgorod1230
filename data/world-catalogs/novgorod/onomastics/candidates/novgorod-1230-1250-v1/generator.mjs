import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../../..');

export const AUTHORING_ATTESTATION = {
  schema: 'rus.onomastics.independent_authoring_attestation.v1',
  candidate_id: 'novgorod-1230-1250-onomastics-v1',
  candidate_version: '1.0.0-candidate.1',
  candidate_ref: 'git:614b9f2b4cd34649b2946b59e51accbc87eb90d5:data/world-catalogs/novgorod/onomastics/candidates/novgorod-1230-1250-v1/candidate.json',
  auditor_ref: '/root/onomastic_approval_audit',
  independence_basis: 'read-only audit separate from candidate authoring',
  reviewed_at: '2026-09-21',
  candidate_sha256: '8cf9e590332f044830c517d6cd259dcce3a7d6c8fb3f38a068009af928eef1fc',
  approval_request_sha256: '1e3749bd00f2425e95ffa1e32a2ae38f0fb7de4127a782130ebf7b211b6ac897',
  source_authoring_sha256: 'd62bf88816200530de5e1c5c83b5c0d5f210d2b64a178c8d6eee6eaf8a3d01e9',
  source_records_sha256: '19d84e4cf7c222d61b193790b1e7139a994968530da167b697cbbb1c4e44ea12',
  record_sources_sha256: 'cf350e5b60945334a179e0aac2bc64a3312ffa9924ae0a3709e5753b9f778d19',
  compiled_name_count: 54,
  source_record_count: 9,
  record_source_count: 58,
  contextual_authoring_only_count: 6,
  excluded_count: 9,
  verdict: 'APPROVE_AUTHORING_ONLY',
  import_enabled: false,
  activation_enabled: false,
  limits: 'Approval applies only to the versioned 1230-1250 authoring candidate. It does not approve runtime import, activation, other periods, contextual B1 entries, or pending/rejected entries.'
};

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
  writeJson('independent-authoring-attestation.json', AUTHORING_ATTESTATION);
}
