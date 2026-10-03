import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-records.js';
import { loadApprovedG4NaturalPlacementCatalog } from './g4-natural-placement-catalog.js';
import { deepFreeze, fail } from './shared.js';

export function loadApprovedCanonicalNaturalInitialRule({ verifiedCatalog, pin, rule_ref } = {}) {
  const placements = loadApprovedG4NaturalPlacementCatalog({ verifiedCatalog, pin });
  const rows = verifiedCatalog.records_by_table.procedural_scene_compiled_records.filter((row) =>
    row.payload?.schema === 'rus.g4_natural_canonical_initial_rule.v1'
    && row.payload.rule?.id === rule_ref?.id && row.payload.rule.version === rule_ref?.version);
  if (rows.length !== 1) invalid('exact_initial_rule_required');
  const row = rows[0]; const payload = row.payload; const rule = payload.rule;
  const bound = placements.placements.filter((p) => p.id === rule.placement_candidate?.placement_ref?.id
    && p.version === rule.placement_candidate.placement_ref.version);
  if (row.record_id !== `profile:${rule.id}` || row.record_kind !== 'profile'
    || Number(row.version) !== rule.version || !Number.isSafeInteger(rule.version) || rule.version < 1
    || row.status !== 'approved_authoring_not_runtime_selectable'
    || row.payload_digest !== createHash('sha256').update(canonicalStringify(payload)).digest('hex')
    || payload.world_pin?.world_revision_id !== pin.compatible_world_revision_id
    || payload.world_pin?.world_catalog_digest !== pin.compatible_world_catalog_digest
    || !/^[a-f0-9]{64}$/u.test(payload.source_candidate_sha256 ?? '')
    || payload.placement_candidate_sha256 !== placements.source_candidate_sha256
    || rule.placement_candidate?.sha256 !== placements.source_candidate_sha256
    || rule.world_revision_id !== payload.world_pin.world_revision_id
    || typeof payload.scenario_id !== 'string' || !payload.scenario_id
    || !rule.canonical_g5_ref?.id || !Number.isSafeInteger(rule.canonical_g5_ref.version)
    || rule.canonical_g5_ref.version < 1 || bound.length !== 1
    || rule.scope !== 'exact_canonical_initial_scene_only'
    || rule.source_binding_kind !== 'approved_canonical_initial_endpoint'
    || rule.placement_cause !== 'authored_initial_state') invalid('initial_rule_membership');
  const placement = bound[0];
  if (rule.g4_ref?.id !== placement.g4_ref.id || rule.g4_ref?.version !== placement.g4_ref.version
    || canonicalStringify(rule.scene_template_ref) !== canonicalStringify(placement.scene_template_ref)
    || ['source_endpoint_slot_key', 'g6_scene_slot_key', 'required_position_slot_key', 'required_position_instance_ordinal']
      .some((key) => rule[key] !== placement[key])) invalid('initial_source_binding');
  return deepFreeze({ ...structuredClone(payload), verified: true,
    rule: { ...structuredClone(rule), status: 'approved' }, pin: structuredClone(pin) });
}
function invalid(reason) { fail('G4_NATURAL_INITIAL_RULE_INVALID',
  'Exact activated canonical initial perception rule is required.', { reason }); }
