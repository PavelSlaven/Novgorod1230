import { createHash } from 'node:crypto';
import FIRST_PLAYABLE_CATALOG from
  '../../../../../data/world-catalogs/novgorod/first-playable-v1/catalog.json'
  with { type: 'json' };
import FIRST_PLAYABLE_MANIFEST from
  '../../../../../data/world-catalogs/novgorod/first-playable-v1/manifest.json'
  with { type: 'json' };

export const SCENARIO_ID = 'lower_dvina_late_summer_open_water_v1';
export const START_G4 =
  'g4v3__gn_nov_g3_xp017_yp026_r2_sheltered_landing_terrace';
export const HIGH_G5 =
  'cg5v3__gn_nov_g4_xp017_yp026_r2_sheltered_landing_terrace_high_platform';
export const LANDING_G5 =
  'cg5v3__gn_nov_g4_xp017_yp026_r2_sheltered_landing_terrace_landing_edge';
export const CONTENT_DIGEST =
  '96fc2ceeca78efbed32da26a69b540dba18f7939488edab34ede173d35438124';
export const PLAYER_PROFILE_SET =
  FIRST_PLAYABLE_CATALOG.character_candidate_sets.player_boatman;
export const NPC_PROFILE_SET =
  FIRST_PLAYABLE_CATALOG.character_candidate_sets.scene_fisher;
export const TRANSPORT_CONTRACT =
  FIRST_PLAYABLE_CATALOG.transport_contracts[0];
export const ACTIVITY_PROFILES = Object.freeze(
  FIRST_PLAYABLE_CATALOG.activity_profiles.map((profile) =>
    Object.freeze({ ...profile, status: 'approved' }))
);
export const LOCAL_RISK_PROFILE = Object.freeze(
  FIRST_PLAYABLE_CATALOG.local_risk_profiles.find(
    ({ risk_profile_id: id }) =>
      id === 'risk_landing_edge_slip_nonfatal_v1'
  )
);
export const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
export const choose = (values, seed) => values[Number.parseInt(hash(seed).slice(0, 8), 16) % values.length];
export const json = (value) => JSON.stringify(value);
export const ref = (entity_kind, entity_id, version = 1) => ({ entity_kind, entity_id, version });
export const action = (option_id, label) => ({ option_id, label });
export const sealedPins = (pins) => ({
  schema: 'rus.first_playable_dependency_pins.v1',
  pins,
  canonical_digest: hash(json(pins))
});

export function resolvePlayerProfile(requestId) {
  const name = choose(
    PLAYER_PROFILE_SET.name_candidates,
    `${requestId}:player:name`
  );
  return {
    name_id: name.name_id,
    name: name.display_name,
    role_id: choose(
      PLAYER_PROFILE_SET.role_candidates,
      `${requestId}:player:role`
    ),
    occupation_id: choose(
      PLAYER_PROFILE_SET.occupation_candidates,
      `${requestId}:player:occupation`
    ),
    skill_profile: choose(
      PLAYER_PROFILE_SET.skill_profile_candidates,
      `${requestId}:player:skills`
    ),
    language_profile: choose(
      PLAYER_PROFILE_SET.language_profile_candidates,
      `${requestId}:player:language`
    ),
    knowledge_profile: choose(
      PLAYER_PROFILE_SET.knowledge_profile_candidates,
      `${requestId}:player:knowledge`
    ),
    body_profile: choose(
      PLAYER_PROFILE_SET.body_profile_candidates,
      `${requestId}:player:body`
    ),
    equipment_profile: resolveEquipmentProfile(
      choose(
        PLAYER_PROFILE_SET.equipment_profile_candidates,
        `${requestId}:player:equipment`
      ),
      `${requestId}:player:equipment`
    ),
    candidate_set_digest:
      FIRST_PLAYABLE_MANIFEST.candidate_sets.player_boatman.digest
  };
}

export function resolveEquipmentProfile(profile, seed) {
  return {
    ...structuredClone(profile),
    initial_item_allocations:
      (profile.initial_item_allocations ?? []).map((allocation) => ({
        ...structuredClone(allocation),
        resolved_quantity: structuredClone(choose(
          allocation.quantity_candidates,
          `${seed}:item:${allocation.slot_id}`
        ))
      })),
    initial_container_allocations:
      (profile.initial_container_allocations ?? []).map((allocation) => ({
        ...structuredClone(allocation),
        resolved_count: choose(
          allocation.count_candidates,
          `${seed}:container:${allocation.slot_id}`
        )
      }))
  };
}

export function resolveNpcProfile(requestId) {
  const name = choose(
    NPC_PROFILE_SET.name_candidates,
    `${requestId}:npc:name`
  );
  return {
    name_id: name.name_id,
    name: name.display_name,
    role_id: choose(
      NPC_PROFILE_SET.role_candidates,
      `${requestId}:npc:role`
    ),
    occupation_id: choose(
      NPC_PROFILE_SET.occupation_candidates,
      `${requestId}:npc:occupation`
    ),
    language_profile: choose(
      NPC_PROFILE_SET.language_profile_candidates,
      `${requestId}:npc:language`
    ),
    knowledge_profile: choose(
      NPC_PROFILE_SET.knowledge_profile_candidates,
      `${requestId}:npc:knowledge`
    ),
    equipment_profile: resolveEquipmentProfile(
      choose(
        NPC_PROFILE_SET.equipment_profile_candidates,
        `${requestId}:npc:equipment`
      ),
      `${requestId}:npc:equipment`
    ),
    profile_candidate_set_digest:
      FIRST_PLAYABLE_MANIFEST.candidate_sets.scene_fisher.digest
  };
}

export function versionedTextRef(entityKind, value) {
  const matched = String(value).match(/^(.+)@(\d+)$/u);
  if (!matched) throw new TypeError(`Versioned ref is required: ${value}`);
  return ref(entityKind, matched[1], Number(matched[2]));
}
