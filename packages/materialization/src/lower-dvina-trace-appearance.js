import { materializeActorBaseAppearance } from './actor-base-appearance.js';
import { failLowerDvinaTraceMaterialization as fail } from
  './lower-dvina-trace-contract.js';

export function materializeRevision19ActorAppearances({
  bundle,
  playerId,
  name,
  random,
  choices,
  npcs
}) {
  const player = materializeActorBaseAppearance({
    identity: {
      character_id: playerId,
      name: name.display_name,
      name_candidate_id: name.id,
      ...structuredClone(bundle.player_profile.identity)
    },
    approved_entries:
      bundle.player_profile.actor_base_appearance_profile?.approved_entries,
    random,
    choice_key_prefix: 'appearance:player_clerk',
    choice_ordinal_offset: choices.length
  });
  choices.push(...player.choices);

  const seenSlots = new Set();
  for (const npc of stableNpcs(npcs)) {
    if (seenSlots.has(npc.participant_slot_ref)) {
      fail('TRACE_M7_ACTOR_SLOT_DUPLICATE',
        `Actor slot ${npc.participant_slot_ref} materialized more than once.`);
    }
    seenSlots.add(npc.participant_slot_ref);
    const profiles = bundle.participant_profile_set.profiles.filter(
      (profile) => profile.profile_id === npc.profile_id
        && profile.revision === npc.profile_revision
    );
    if (profiles.length !== 1) {
      fail('TRACE_M7_ACTOR_PROFILE_INVALID',
        `Actor profile ${npc.profile_id} is not exact.`);
    }
    const profile = profiles[0];
    const completed = materializeActorBaseAppearance({
      identity: {
        ...structuredClone(npc.identity_state),
        sex_category: profile.sex_category,
        age_category: profile.age_category
      },
      approved_entries:
        profile.actor_base_appearance_profile?.approved_entries,
      random,
      choice_key_prefix:
        `appearance:${npc.participant_slot_ref}:${npc.instance_id}`,
      choice_ordinal_offset: choices.length
    });
    choices.push(...completed.choices);
    npc.identity_state = {
      ...structuredClone(completed.identity),
      appearance_contract_version: 'actor_base_appearance_v1'
    };
  }
  return {
    playerIdentity: {
      ...structuredClone(player.identity),
      appearance_contract_version: 'actor_base_appearance_v1'
    }
  };
}

function stableNpcs(npcs) {
  return [...npcs].sort((left, right) =>
    left.participant_slot_ref.localeCompare(right.participant_slot_ref)
      || left.instance_id.localeCompare(right.instance_id));
}
