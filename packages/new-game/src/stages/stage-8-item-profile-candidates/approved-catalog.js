import { STAGE8_OUTPUT_SCHEMA } from './policy.js';

const DOMAIN_FIELDS = Object.freeze({
  item_profiles: 'item_profile_candidates',
  containers: 'container_profile_candidates',
  equipment: 'equipment_candidates',
  quantities: 'quantity_requirements',
  property_rules: 'property_rule_candidates'
});

export function normalizeStage8ItemProfilePolicy(policy = {}) {
  const required = Array.isArray(policy.required_candidate_domains)
    ? policy.required_candidate_domains
    : Object.keys(DOMAIN_FIELDS);
  return Object.freeze({
    target_profiles_max: Number.isInteger(Number(policy.target_profiles_max)) && Number(policy.target_profiles_max) > 0 ? Number(policy.target_profiles_max) : 160,
    require_sources: policy.require_sources !== false,
    required_candidate_domains: Object.freeze([...new Set(required.filter((domain) => DOMAIN_FIELDS[domain]))])
  });
}

export function validateStage8ItemProfileRetrieverInput(input = {}) {
  const concerns = [];
  if (input?.version !== 1) concerns.push(concern('ITEM_PROFILE_INPUT_VERSION_INVALID', 'version', 'Stage 8 input version must be 1.'));
  if (input?.schema !== 'item_profile_retriever_input') concerns.push(concern('ITEM_PROFILE_INPUT_SCHEMA_INVALID', 'schema', 'Stage 8 input schema is invalid.'));
  for (const field of ['request_id', 'historical_frame', 'regional_context_package', 'candidate_place_template_set', 'npc_candidate_set', 'world_revision_id', 'approved_catalog_snapshot']) if (input?.[field] == null) concerns.push(concern('ITEM_PROFILE_INPUT_MISSING_FIELD', field, `Stage 8 input is missing ${field}.`));
  const snapshot = input?.approved_catalog_snapshot;
  if (snapshot && (snapshot.schema !== 'approved_item_catalog_snapshot' || snapshot.version !== 1)) concerns.push(concern('ITEM_PROFILE_APPROVED_SNAPSHOT_INVALID', 'approved_catalog_snapshot', 'Stage 8 requires approved_item_catalog_snapshot version 1.'));
  if (snapshot?.world_revision_id !== input?.world_revision_id) concerns.push(concern('ITEM_PROFILE_REVISION_PIN_MISMATCH', 'approved_catalog_snapshot.world_revision_id', 'Approved catalog snapshot must match the pinned world revision.'));
  if (!/^[a-f0-9]{64}$/u.test(String(snapshot?.catalog_digest ?? ''))) concerns.push(concern('ITEM_PROFILE_CATALOG_DIGEST_INVALID', 'approved_catalog_snapshot.catalog_digest', 'Approved catalog snapshot requires a SHA-256 catalog digest.'));
  for (const field of Object.values(DOMAIN_FIELDS)) if (snapshot && !Array.isArray(snapshot[field])) concerns.push(concern('ITEM_PROFILE_APPROVED_BLOCK_MISSING', `approved_catalog_snapshot.${field}`, `${field} must be an array.`));
  return audit(concerns);
}

export async function retrieveApprovedItemProfileCandidates(input = {}) {
  const policy = normalizeStage8ItemProfilePolicy(input.item_profile_policy);
  const frame = normalizeFrame(input.historical_frame);
  const snapshot = input.approved_catalog_snapshot ?? {};
  const output = {};
  const rejected = [];
  for (const [domain, field] of Object.entries(DOMAIN_FIELDS)) {
    const source = snapshot[field] ?? [];
    const eligible = source.filter((record) => isApprovedApplicable(record, input.world_revision_id, frame));
    output[field] = eligible.slice(0, policy.target_profiles_max).map((record) => structuredClone(record));
    rejected.push(...source.filter((record) => !eligible.includes(record)).map((record) => ({ domain, candidate_id: candidateId(record), reason_code: rejectionCode(record, input.world_revision_id, frame) })));
  }
  const dataGaps = policy.required_candidate_domains.flatMap((domain) => {
    const field = DOMAIN_FIELDS[domain];
    return output[field].length === 0 ? [{ code: 'REQUIRED_APPROVED_CANDIDATE_SET_EMPTY', severity: 'hard_block', domain, field, world_revision_id: input.world_revision_id, region_id: frame.region_id, year: frame.year, season: frame.season }] : [];
  });
  const ready = dataGaps.length === 0;
  return Object.freeze({
    version: 1,
    schema: STAGE8_OUTPUT_SCHEMA,
    request_id: input.request_id,
    selection_status: ready ? 'ready' : 'blocked',
    world_revision_id: input.world_revision_id,
    source_catalog_digest: snapshot.source_catalog_digest ?? null,
    catalog_digest: snapshot.catalog_digest,
    frame,
    ...output,
    rejected_candidates: Object.freeze(rejected),
    data_gaps: Object.freeze(dataGaps),
    downstream_constraints: Object.freeze({
      must_preserve: Object.freeze(['world_revision_id', 'source_catalog_digest', 'catalog_digest', 'candidate IDs', 'quantity requirement IDs']),
      must_not_create_yet: Object.freeze(['item_instance_id', 'container_instance_id', 'ownership relation']),
      hard_block_on_empty_required_candidate_set: true
    }),
    source_trace: Object.freeze([{
      source_kind: 'approved_item_catalog_snapshot',
      world_revision_id: input.world_revision_id,
      source_catalog_digest: snapshot.source_catalog_digest ?? null,
      catalog_digest: snapshot.catalog_digest
    }]),
    audit: Object.freeze({ pass: ready, concerns: Object.freeze(dataGaps), evidence: Object.freeze([{ kind: 'approved_catalog_filter', rejected_count: rejected.length }]) })
  });
}

export function validateItemProfileCandidateSet(output = {}, { input = {}, policy = {} } = {}) {
  const concerns = [];
  if (output?.version !== 1 || output?.schema !== STAGE8_OUTPUT_SCHEMA) concerns.push(concern('ITEM_PROFILE_OUTPUT_SCHEMA_INVALID', 'schema', 'Stage 8 output schema/version is invalid.'));
  if (output?.request_id !== input?.request_id) concerns.push(concern('ITEM_PROFILE_REQUEST_ID_MISMATCH', 'request_id', 'Stage 8 request_id must match input.'));
  if (output?.world_revision_id !== input?.world_revision_id) concerns.push(concern('ITEM_PROFILE_REVISION_PIN_MISMATCH', 'world_revision_id', 'Stage 8 output must preserve world revision pin.'));
  if (output?.source_catalog_digest !== (input?.approved_catalog_snapshot?.source_catalog_digest ?? null)) concerns.push(concern('ITEM_PROFILE_SOURCE_CATALOG_DIGEST_MISMATCH', 'source_catalog_digest', 'Stage 8 output must preserve the source domain catalog digest.'));
  if (output?.catalog_digest !== input?.approved_catalog_snapshot?.catalog_digest) concerns.push(concern('ITEM_PROFILE_CATALOG_DIGEST_MISMATCH', 'catalog_digest', 'Stage 8 output must preserve catalog digest.'));
  const normalized = normalizeStage8ItemProfilePolicy(policy);
  for (const [domain, field] of Object.entries(DOMAIN_FIELDS)) {
    if (!Array.isArray(output?.[field])) { concerns.push(concern('ITEM_PROFILE_OUTPUT_BLOCK_MISSING', field, `${field} must be an array.`)); continue; }
    for (const candidate of output[field]) {
      if (candidate?.status !== 'approved') concerns.push(concern('ITEM_PROFILE_DRAFT_CANDIDATE_FORBIDDEN', field, `${field} may contain approved records only.`));
      if (candidate?.world_revision_id !== input?.world_revision_id) concerns.push(concern('ITEM_PROFILE_CANDIDATE_REVISION_MISMATCH', field, `${candidateId(candidate)} has another world revision.`));
    }
    if (normalized.required_candidate_domains.includes(domain) && output[field].length === 0 && !output?.data_gaps?.some((gap) => gap.code === 'REQUIRED_APPROVED_CANDIDATE_SET_EMPTY' && gap.domain === domain)) concerns.push(concern('ITEM_PROFILE_TYPED_DATA_GAP_MISSING', field, `Empty required ${domain} must emit typed data gap.`));
  }
  if (output.selection_status === 'ready' && concerns.length === 0 && output.audit?.pass !== true) concerns.push(concern('ITEM_PROFILE_AUDIT_FAILED', 'audit.pass', 'Ready Stage 8 output requires passing audit.'));
  if (output.selection_status === 'blocked' && !Array.isArray(output.data_gaps)) concerns.push(concern('ITEM_PROFILE_TYPED_DATA_GAP_MISSING', 'data_gaps', 'Blocked Stage 8 output requires typed data_gaps.'));
  return audit(concerns);
}

function isApprovedApplicable(record, revisionId, frame) {
  if (record?.status !== 'approved' || record.world_revision_id !== revisionId) return false;
  if (record.region_id && frame.region_id && record.region_id !== frame.region_id) return false;
  const from = yearValue(record.valid_from_year ?? record.valid_from);
  const to = yearValue(record.valid_to_year ?? record.valid_to);
  if (Number.isInteger(frame.year) && ((Number.isInteger(from) && frame.year < from) || (Number.isInteger(to) && frame.year > to))) return false;
  const seasons = record.allowed_seasons ?? record.applicability?.allowed_seasons;
  if (Array.isArray(seasons) && seasons.length > 0 && !seasons.includes('all') && !seasons.includes(frame.season)) return false;
  return true;
}
function rejectionCode(record, revisionId, frame) { if (record?.status !== 'approved') return 'NOT_APPROVED'; if (record.world_revision_id !== revisionId) return 'REVISION_MISMATCH'; if (record.region_id && frame.region_id && record.region_id !== frame.region_id) return 'REGION_MISMATCH'; return 'PERIOD_OR_SEASON_MISMATCH'; }
function normalizeFrame(value = {}) { return Object.freeze({ region_id: value.region?.region_id ?? value.region_id ?? null, year: value.year?.value ?? value.year ?? null, season: value.calendar?.season ?? value.season ?? null }); }
function yearValue(value) { if (Number.isInteger(value)) return value; if (typeof value === 'string' && /^\d{4}/u.test(value)) return Number(value.slice(0, 4)); return null; }
function candidateId(value) { return value?.item_profile_candidate_id ?? value?.container_profile_candidate_id ?? value?.equipment_candidate_id ?? value?.quantity_requirement_id ?? value?.property_rule_candidate_id ?? value?.id ?? null; }
function concern(code, field, message) { return Object.freeze({ code, severity: 'hard_block', field, message }); }
function audit(concerns) { return Object.freeze({ pass: concerns.length === 0, concerns: Object.freeze(concerns), evidence: Object.freeze([{ kind: 'stage8_approved_catalog_contract' }]) }); }
