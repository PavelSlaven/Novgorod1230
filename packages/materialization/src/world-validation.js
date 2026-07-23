import { canonicalDigest, MATERIALIZER_VERSION, MaterializationError, RNG_VERSION } from './core.js';

export function assertMaterializationInput(input) {
  if (input?.schema !== 'world_materialization_request_v2' || input?.version !== 2) throw new MaterializationError('MATERIALIZATION_INPUT_INVALID', 'Expected world_materialization_request_v2.');
  for (const key of ['party_id', 'run_id', 'world_revision_id', 'region_id', 'g1_id', 'g4_id', 'trigger', 'catalog_digest', 'materializer_version', 'rng_algorithm_id']) if (!input[key]) throw new MaterializationError('MATERIALIZATION_INPUT_INVALID', `${key} is required.`);
  if (input.materializer_version !== MATERIALIZER_VERSION || input.rng_algorithm_id !== RNG_VERSION) throw new MaterializationError('MATERIALIZATION_VERSION_PIN_MISMATCH', 'Unsupported materializer or RNG algorithm pin.');
  if (!input.historical_frame || typeof input.historical_frame !== 'object' || Array.isArray(input.historical_frame) || !input.existing_party_state || typeof input.existing_party_state !== 'object' || Array.isArray(input.existing_party_state) || !input.seed_context || typeof input.seed_context !== 'object' || Array.isArray(input.seed_context)) throw new MaterializationError('MATERIALIZATION_INPUT_INVALID', 'historical_frame, seed_context and existing_party_state are required objects.');
  if (!Number.isInteger(input.occurrence) || input.occurrence < 0) throw new MaterializationError('MATERIALIZATION_INPUT_INVALID', 'occurrence must be a non-negative integer.');
  if (!['new_game', 'first_entry', 'expansion'].includes(input.trigger)) throw new MaterializationError('MATERIALIZATION_TRIGGER_INVALID', 'Repair requires a separate strict repair procedure and is not accepted by baseline materialization.');
  if (typeof input.existing_party_state.baseline_exists !== 'boolean') throw new MaterializationError('MATERIALIZATION_INPUT_INVALID', 'existing_party_state.baseline_exists must be explicit.');
  if (!Array.isArray(input.catalog_bundle?.rules) || !Array.isArray(input.catalog_bundle?.candidates)) throw new MaterializationError('MATERIALIZATION_INPUT_INVALID', 'Catalog bundle rules and candidates are required.');
  if (typeof input.catalog_bundle.player_start_anchor_slot_key !== 'string' || !input.catalog_bundle.player_start_anchor_slot_key.trim()) throw new MaterializationError('MATERIALIZATION_INPUT_INVALID', 'Catalog bundle player_start_anchor_slot_key is required.');
  const actualBundleDigest = canonicalDigest(input.catalog_bundle);
  if (input.catalog_bundle_digest != null) {
    if (input.catalog_bundle_digest !== actualBundleDigest) throw new MaterializationError('CATALOG_BUNDLE_DIGEST_MISMATCH', 'Catalog bundle digest does not match the supplied immutable projection.');
  } else if (actualBundleDigest !== input.catalog_digest) {
    throw new MaterializationError('CATALOG_DIGEST_MISMATCH', 'Legacy catalog digest does not match the supplied bundle.');
  }
  for (const rule of input.catalog_bundle.rules) {
    if (!rule.rule_id || !rule.slot_key || !rule.domain || !Array.isArray(rule.candidate_ids)) throw new MaterializationError('MATERIALIZATION_RULE_INVALID', 'Every rule requires IDs, domain and candidate_ids.');
    if (!Number.isInteger(rule.min_count) || !Number.isInteger(rule.max_count) || rule.min_count < 0 || rule.max_count < rule.min_count) throw new MaterializationError('MATERIALIZATION_RULE_INVALID', `Invalid count range for ${rule.rule_id}.`);
    if (!['g5_node', 'g5_anchor', 'g5_edge', 'npc', 'item', 'container', 'relation', 'ownership', 'schedule'].includes(rule.domain)) throw new MaterializationError('MATERIALIZATION_RULE_INVALID', `Unsupported domain for ${rule.rule_id}.`);
  }
}

export function assertApplicableRecord(record, input, kind) {
  const year = Number(input.historical_frame?.calendar?.year ?? input.historical_frame?.year?.value ?? input.historical_frame?.year);
  const season = input.historical_frame?.calendar?.season;
  const allowedSeasons = record.allowed_seasons ?? [];
  if (record.status !== 'approved' || record.world_revision_id !== input.world_revision_id || record.region_id !== input.region_id
    || !Number.isInteger(year) || !Number.isInteger(record.valid_from_year) || !Number.isInteger(record.valid_to_year)
    || year < record.valid_from_year || year > record.valid_to_year
    || !Array.isArray(allowedSeasons) || allowedSeasons.length === 0 || (!allowedSeasons.includes('all') && !allowedSeasons.includes(season))) {
    throw new MaterializationError('MATERIALIZATION_APPLICABILITY_MISMATCH', `Approved ${kind} is inactive or outside the pinned revision, region or historical period.`, { record_id: record.rule_id ?? record.candidate_id, kind });
  }
}

export function compareRule(left, right) { return left.slot_key.localeCompare(right.slot_key) || left.rule_id.localeCompare(right.rule_id); }
export function chooseCount(rule, random, eligibleCount) {
  if (eligibleCount === 0) return 0;
  const width = rule.max_count - rule.min_count + 1;
  return rule.min_count + (width > 1 ? random.nextIndex(width) : 0);
}
export function weightedCandidate(candidates, draw) {
  const total = candidates.reduce((sum, candidate) => sum + approvedWeight(candidate), 0);
  let point = draw % total;
  for (const candidate of candidates) {
    point -= approvedWeight(candidate);
    if (point < 0) return candidate;
  }
  return candidates.at(-1);
}
export function approvedWeight(candidate) { return Number.isInteger(candidate?.weight) && candidate.weight > 0 ? candidate.weight : 1; }
export function partitionInstances(instances) {
  const output = { g5_nodes: [], g5_edges: [], g5_anchors: [], npcs: [], items: [], containers: [], relations: [], ownership: [], schedules: [] };
  const mapping = { g5_node: 'g5_nodes', g5_edge: 'g5_edges', g5_anchor: 'g5_anchors', anchor: 'g5_anchors', npc: 'npcs', item: 'items', container: 'containers', relation: 'relations', ownership: 'ownership', schedule: 'schedules' };
  for (const instance of instances) output[mapping[instance.domain] ?? 'relations'].push(instance);
  return output;
}
