import { canonicalDigest, createRandomSource, deriveSeed, MaterializationError } from './core.js';
import { weightedCandidate } from './world-validation.js';
import { freeze } from './spatial-v3-validation.js';
import { deriveSpatialV3ExpansionCapacity } from './spatial-v3-expansion-capacity.js';

const exact = (row, id, version) => row?.id === id && row.version === version;
const gap = (code, reason) => { throw new MaterializationError(code, reason); };
const one = (rows, predicate, reason) => {
  const matches = (rows ?? []).filter(predicate);
  if (matches.length !== 1) gap('SPATIAL_EXPANSION_RULE_GAP', reason);
  return matches[0];
};

/** Pure P20 selection. The caller supplies a locked, exact P12/P16 snapshot. */
export function selectSpatialV3Expansion({ closure, snapshot, now, party_id, slot_ref,
  directional_exit, entry_binding, candidate_ordinal, terminal_ordinal } = {}) {
  const profile = closure?.profile;
  if (typeof party_id !== 'string' || !party_id.trim() || profile?.status !== 'approved'
    || !profile.world_revision_id || !Number.isSafeInteger(candidate_ordinal) || candidate_ordinal < 0) {
    gap('SPATIAL_EXPANSION_INPUT_INVALID', 'Approved profile, party and non-negative ordinal are required.');
  }
  const strategies = [
    ['adjacency_rule_set', 'adjacency', 'through_same_exit'],
    ['connectivity_rule_set', 'connectivity', 'existing_exit_reachable'],
    ['seed_policy', 'seed', 'mulberry32_v1']
  ];
  for (const [role, kind, strategy] of strategies) {
    const rule = one(closure.expansion_rule_sets, (row) => row.dependency_role === role, `Missing exact ${role}.`);
    if (!exact(rule, profile[`${role}_id`], profile[`${role}_version`])
      || rule.rule_kind !== kind || rule.status !== 'approved' || rule.world_revision_id !== profile.world_revision_id
      || !rule.canonical_digest || rule.authoring_digest !== rule.canonical_digest || rule.canonical_ordinal !== 0) {
      gap('SPATIAL_EXPANSION_RULE_GAP', `Unapproved or mismatched ${role}.`);
    }
    if (rule.strategy !== strategy) gap('SPATIAL_EXPANSION_STRATEGY_UNSUPPORTED', `Unsupported ${kind} strategy: ${rule.strategy}.`);
  }
  const slot = one(closure.slots, (row) => exact(row, slot_ref?.id, slot_ref?.version), 'Exact expansion slot is missing.');
  if (slot.status !== 'approved' || slot.profile_id !== profile.id || slot.profile_version !== profile.version
    || slot.world_revision_id !== profile.world_revision_id || slot.continuation_role !== 'through'
    || slot.directional_exit_id !== directional_exit?.id || slot.directional_exit_version !== directional_exit?.version) {
    gap('SPATIAL_EXPANSION_RULE_GAP', 'Through adjacency must preserve the exact selected directional exit.');
  }
  const exit = one(closure.directional_exits, (row) => exact(row, directional_exit.id, directional_exit.version), 'Selected exit is absent.');
  if (exit.status !== 'approved' || exit.g4_id !== slot.g4_id || exit.g4_version !== slot.g4_version) {
    gap('SPATIAL_EXPANSION_RULE_GAP', 'Selected exit belongs to another G4 or is unapproved.');
  }
  const terminal = one(closure.terminal_policies, (row) => exact(row, slot.terminal_policy_id, slot.terminal_policy_version), 'Terminal policy is missing.');
  if (terminal.status !== 'approved' || terminal.policy_kind !== 'world_route_exit'
    || terminal.target_directional_exit_id !== exit.id || terminal.target_directional_exit_version !== exit.version) {
    gap('SPATIAL_EXPANSION_RULE_GAP', 'Connectivity must terminate at the same existing directional exit.');
  }
  const identity = { party_id, world_revision_id: profile.world_revision_id, g4_profile_id: profile.id,
    g4_profile_version: profile.version, expansion_slot_key: `${slot.id}@${slot.version}`, candidate_ordinal };
  const idempotency_key = `resolve_frontier:${canonicalDigest(identity)}`;
  const seed_context = { ...identity, idempotency_basis: idempotency_key };
  const seed = deriveSeed(seed_context);
  const random = createRandomSource({ seed: seed.uint32, version: 'mulberry32_v1' });
  const choices = [];
  if (candidate_ordinal === 0) {
    one(closure.entry_slot_rules, (row) => row.entry_binding_id === entry_binding?.id
      && row.entry_binding_version === entry_binding?.version && row.slot_id === slot.id && row.slot_version === slot.version,
    'Initial frontier requires an exact approved entry-to-slot edge.');
    if (terminal_ordinal !== undefined) gap('SPATIAL_EXPANSION_INPUT_INVALID', 'Initial terminal ordinal is selected by the approved rule.');
    const lengthRule = one(closure.continuation_length_rules,
      (row) => exact(row, slot.continuation_length_rule_id, slot.continuation_length_rule_version), 'Continuation rule is missing.');
    const lengths = (closure.continuation_length_candidates ?? []).filter((row) =>
      row.rule_id === lengthRule.id && row.rule_version === lengthRule.version).sort((a, b) => a.terminal_ordinal - b.terminal_ordinal);
    if (lengthRule.status !== 'approved' || !['fixed', 'deterministic_weighted'].includes(lengthRule.selection_kind)
      || !lengths.length || (lengthRule.selection_kind === 'fixed' && lengths.length !== 1)
      || lengths.some((row) => !Number.isSafeInteger(row.terminal_ordinal) || row.terminal_ordinal < 0 || row.terminal_ordinal > slot.max_instances)) {
      gap('SPATIAL_EXPANSION_RULE_GAP', 'Continuation candidates must be approved and within slot bounds.');
    }
    terminal_ordinal = choose(lengths, random, choices,
      `${identity.expansion_slot_key}:terminal_length`,
      (row) => `${row.rule_id}@${row.rule_version}:${row.terminal_ordinal}`).terminal_ordinal;
  }
  if (!Number.isSafeInteger(terminal_ordinal) || terminal_ordinal < candidate_ordinal || terminal_ordinal > slot.max_instances) {
    gap('SPATIAL_EXPANSION_INPUT_INVALID', 'Continuation requires its committed terminal ordinal within slot bounds.');
  }
  const common = { idempotency_key, seed_context, seed_digest: seed.digest, terminal_ordinal,
    slot, directional_exit: exit, terminal_policy: terminal, choices };
  if (candidate_ordinal === terminal_ordinal) return freeze({ ok: true, status: 'terminal', ...common,
    rng_draw_count: random.drawCount });
  const capacity = deriveSpatialV3ExpansionCapacity({ closure, snapshot, now });
  const candidates = capacity.available_candidates.filter((row) => row.slot_id === slot.id && row.slot_version === slot.version)
    .sort((a, b) => a.template_id < b.template_id ? -1 : a.template_id > b.template_id ? 1 : a.template_version - b.template_version);
  if (!candidates.length) return freeze({ ok: false, code: capacity.reservable_residual_capacity < capacity.committed_residual_capacity
    ? 'expansion_capacity_temporarily_reserved' : 'continuation_capacity_violation', ...common, capacity });
  for (const candidate of candidates) {
    if (candidate.compatibility_rule_id != null || candidate.compatibility_rule_version != null) {
      gap('SPATIAL_EXPANSION_STRATEGY_UNSUPPORTED', 'A template compatibility rule needs its authoritative evaluator.');
    }
    const successor = one(closure.successor_frontier_rules, (row) => row.g5_template_id === candidate.template_id
      && row.g5_template_version === candidate.template_version && row.source_expansion_slot_id === slot.id
      && row.source_expansion_slot_version === slot.version, 'Exact successor rule is missing.');
    if (successor.successor_kind !== 'through_successor' || successor.target_expansion_slot_id !== slot.id
      || successor.target_expansion_slot_version !== slot.version || successor.terminal_policy_id !== terminal.id
      || successor.terminal_policy_version !== terminal.version || successor.condition_rule_id != null
      || successor.condition_rule_version != null) {
      gap('SPATIAL_EXPANSION_RULE_GAP', 'Successor must retain the same slot and terminal exit without unevaluated conditions.');
    }
  }
  const selected = choose(candidates.map((row) => ({ ...row, weight: row.selection_weight })), random,
    choices, identity.expansion_slot_key, (row) => `${row.template_id}@${row.template_version}`);
  return freeze({ ok: true, status: 'generation', ...common, capacity, selected_template: selected,
    rng_draw_count: random.drawCount });
}

function choose(candidates, random, choices, slot_key, candidateId) {
  if (candidates.some((row) => !Number.isSafeInteger(row.weight) || row.weight <= 0)
    || !Number.isSafeInteger(candidates.reduce((total, row) => total + row.weight, 0))) {
    gap('SPATIAL_EXPANSION_RULE_GAP', 'Selection weights must be positive safe integers.');
  }
  const rng_draw = random.nextUint32();
  const selected = weightedCandidate(candidates, rng_draw);
  choices.push({ choice_ordinal: choices.length, slot_key,
    candidate_set_digest: canonicalDigest(candidates), candidate_ids: candidates.map(candidateId),
    selected_id: candidateId(selected), rng_draw });
  return selected;
}
