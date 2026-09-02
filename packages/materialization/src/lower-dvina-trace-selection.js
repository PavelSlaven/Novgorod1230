import { canonicalDigest } from './core.js';
import { failLowerDvinaTraceMaterialization as fail } from
  './lower-dvina-trace-contract.js';

export function selectParticipants(set, playerProfile, bindings, random, choices) {
  const results = [];
  if (!Array.isArray(set.candidate_sets) || !Array.isArray(set.profiles)
      || !Array.isArray(set.participant_slots)) {
    fail('PARTICIPANT_SELECTION_INCOMPLETE', 'Exact participant data is required.');
  }
  for (const candidateSet of [...set.candidate_sets].sort((left, right) =>
    left.candidate_set_id.localeCompare(right.candidate_set_id))) {
    const slots = Array.isArray(candidateSet.slots)
      ? exactArray(candidateSet.slots,
        `participant set ${candidateSet.candidate_set_id}.slots`)
      : [requiredText(candidateSet.slot,
        `participant set ${candidateSet.candidate_set_id}.slot`)];
    if (!slots.every(Boolean)) {
      fail('MANDATORY_SLOT_MISSING',
        `Participant set ${candidateSet.candidate_set_id} has no exact slot.`);
    }
    for (const slot of slots) {
      const selected = choose({
        key: `participant:${slot}`, setRef: candidateSet.candidate_set_id,
        candidates: candidateSet.candidates, idOf: (value) => value.profile_id,
        random, choices
      });
      const profileRecords = [...set.profiles, playerProfile].filter((value) =>
        value?.profile_id === selected.profile_id
          && value?.revision === selected.revision);
      if (profileRecords.length !== 1) {
        fail('PARTICIPANT_PROFILE_REF_INVALID',
          `Participant profile ${selected.profile_id} is not exact.`);
      }
      const profile = profileRecords[0];
      if (candidateSet.slot && profile.slot
          && profile.slot !== candidateSet.slot && slot !== 'player_clerk') {
        fail('PARTICIPANT_PROFILE_REF_INVALID',
          `Participant profile ${selected.profile_id} is incompatible with slot ${slot}.`);
      }
      const materializationDepth =
        bindings.participant_materialization_depths?.[slot];
      if (!materializationDepth
          || slot === 'player_clerk'
            && materializationDepth !== 'immediate_player'
          || slot !== 'player_clerk'
            && profile.initial_materialization_depth !== materializationDepth) {
        fail('PARTICIPANT_MATERIALIZATION_DEPTH_MISSING',
          `Participant slot ${slot} has no approved depth.`);
      }
      results.push({
        selected_id: slot, slot_key: slot,
        selected_profile: structuredClone(selected),
        candidate_set_ref: candidateSet.candidate_set_id,
        candidate_record_digest: canonicalDigest(selected),
        record_digest: canonicalDigest(profile),
        causal_binding: slot === 'player_clerk'
          ? requiredText(profile.approval?.basis, 'player profile approval.basis')
          : requiredText(profile.causal_basis,
            `participant profile ${profile.profile_id}.causal_basis`),
        materialization_rule: materializationDepth,
        candidate_set_digest: choices.at(-1).candidate_set_digest
      });
    }
  }
  const expected = new Set(set.participant_slots);
  if (results.length !== expected.size
      || results.some((item) => !expected.has(item.slot_key))) {
    fail('PARTICIPANT_SELECTION_INCOMPLETE',
      'Participant slots must resolve exactly.');
  }
  return results;
}

export function completeAuthoredItemMechanics(bundle, profile) {
  if (bundle.definition_revision !== 32) return structuredClone(profile);
  const profileRef = profile?.inventory_profile_id ?? profile?.id;
  const matches = bundle.a1_authored_item_mechanics_profile?.profiles
    ?.filter(({ profile_ref: ref }) => ref === profileRef) ?? [];
  if (matches.length !== 1) {
    fail('TRACE_REVISION_32_ITEM_MECHANICS_INVALID',
      `Authored item profile ${String(profileRef)} has no exact mechanics.`);
  }
  return {
    ...structuredClone(profile),
    packing_slot_cost: matches[0].packing_slot_cost,
    quantity: structuredClone(matches[0].quantity),
    container: matches[0].container
  };
}

export function selectLocations(set, random, choices) {
  const profiles = exactArray(set.location_profiles,
    'location_topology_set.location_profiles');
  return [...profiles].sort((left, right) =>
    left.location_profile_id.localeCompare(right.location_profile_id))
    .map((location) => ({
      selected_id: location.location_profile_id,
      slot_key: location.location_profile_id,
      location: structuredClone(location),
      selected: structuredClone(choose({
        key: `location:${location.location_profile_id}`,
        setRef: location.spatial_candidate_set.candidate_set_id,
        candidates: location.spatial_candidate_set.candidates,
        idOf: (value) => value.g4_node_ref.id, random, choices
      })),
      record_digest: canonicalDigest(location)
    }));
}

export function choose({ key, setRef, candidates, idOf, random, choices }) {
  if (!setRef || !Array.isArray(candidates) || candidates.length === 0) {
    fail('REQUIRED_CANDIDATE_SET_EMPTY',
      `Candidate set ${String(setRef)} is empty.`);
  }
  const sorted = candidates.map((value) => ({ id: idOf(value), value }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  if (sorted.some((entry) => !entry.id)
      || new Set(sorted.map((entry) => entry.id)).size !== sorted.length) {
    fail('CANDIDATE_SET_INVALID',
      `Candidate set ${setRef} has missing or duplicate stable IDs.`);
  }
  const candidateIds = sorted.map((entry) => entry.id);
  const digest = canonicalDigest(candidateIds);
  const draw = random.nextUint32();
  const selected = sorted[draw % sorted.length];
  choices.push({
    choice_ordinal: choices.length, choice_key: key, slot_key: key,
    candidate_set_ref: setRef, candidate_digest: digest,
    candidate_set_digest: digest, candidate_ids: candidateIds,
    selected_id: selected.id, selected_weight: 1, rng_draw: draw,
    rng_counter: random.drawCount,
    rejection_summary: {
      rejected_count: 0, missing_count: 0, unapproved_count: 0,
      wrong_domain_count: 0
    }
  });
  return selected.value;
}

export function approved(values) {
  return (values ?? []).filter((value) => value?.status === 'approved');
}

export function requiredById(values, key, id) {
  const matches = (values ?? []).filter((value) =>
    value?.[key] === id && (value.status == null || value.status === 'approved'));
  if (matches.length !== 1) {
    fail('MANDATORY_RECORD_INVALID',
      `Required record ${id} must resolve exactly once.`);
  }
  return matches[0];
}

export function requiredPinnedById(values, key, id) {
  const matches = (values ?? []).filter((value) => value?.[key] === id);
  if (matches.length !== 1) {
    fail('MANDATORY_RECORD_INVALID',
      `Required pinned record ${id} must resolve exactly once.`);
  }
  return matches[0];
}

export function exactArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('MANDATORY_RECORD_INVALID', `${label} must be a non-empty exact array.`);
  }
  return value;
}

export function requiredText(value, label) {
  if (typeof value !== 'string' || !value) {
    fail('MANDATORY_RECORD_INVALID', `${label} is required.`);
  }
  return value;
}
