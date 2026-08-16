import { createHash } from 'node:crypto';
import {
  createRandomSource,
  deriveSeed,
  materializeActorBaseAppearance
} from '@rus/materialization';
import FIRST_PLAYABLE_CATALOG_V1 from
  '../../../../../data/world-catalogs/novgorod/first-playable-v1/catalog.json'
  with { type: 'json' };
import FIRST_PLAYABLE_MANIFEST_V1 from
  '../../../../../data/world-catalogs/novgorod/first-playable-v1/manifest.json'
  with { type: 'json' };
import FIRST_PLAYABLE_CATALOG_V2 from
  '../../../../../data/world-catalogs/novgorod/first-playable-v2/catalog.json'
  with { type: 'json' };
import FIRST_PLAYABLE_MANIFEST_V2 from
  '../../../../../data/world-catalogs/novgorod/first-playable-v2/manifest.json'
  with { type: 'json' };

const CATALOGS = Object.freeze({
  1: { catalog: FIRST_PLAYABLE_CATALOG_V1, manifest: FIRST_PLAYABLE_MANIFEST_V1 },
  2: { catalog: FIRST_PLAYABLE_CATALOG_V2, manifest: FIRST_PLAYABLE_MANIFEST_V2 }
});
export const CURRENT_FIRST_PLAYABLE_CATALOG_VERSION = 2;

export const SCENARIO_ID = 'lower_dvina_late_summer_open_water_v1';
export const START_G4 =
  'g4v3__gn_nov_g3_xp017_yp026_r2_sheltered_landing_terrace';
export const HIGH_G5 =
  'cg5v3__gn_nov_g4_xp017_yp026_r2_sheltered_landing_terrace_high_platform';
export const LANDING_G5 =
  'cg5v3__gn_nov_g4_xp017_yp026_r2_sheltered_landing_terrace_landing_edge';
export const CONTENT_DIGEST =
  FIRST_PLAYABLE_MANIFEST_V2.canonical_digest;
export const PLAYER_PROFILE_SET =
  FIRST_PLAYABLE_CATALOG_V2.character_candidate_sets.player_boatman;
export const NPC_PROFILE_SET =
  FIRST_PLAYABLE_CATALOG_V2.character_candidate_sets.scene_fisher;
export const TRANSPORT_CONTRACT =
  FIRST_PLAYABLE_CATALOG_V2.transport_contracts[0];
export const ACTIVITY_PROFILES = Object.freeze(
  FIRST_PLAYABLE_CATALOG_V2.activity_profiles.map((profile) =>
    Object.freeze({ ...profile, status: 'approved' }))
);
export const LOCAL_RISK_PROFILE = Object.freeze(
  FIRST_PLAYABLE_CATALOG_V2.local_risk_profiles.find(
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

export function resolvePlayerProfile(requestId, { catalogVersion = CURRENT_FIRST_PLAYABLE_CATALOG_VERSION } = {}) {
  const { catalog, manifest } = catalogFor(catalogVersion);
  const profileSet = catalog.character_candidate_sets.player_boatman;
  const name = choose(
    profileSet.name_candidates,
    `${requestId}:player:name`
  );
  return {
    name_id: name.name_id,
    name: name.display_name,
    role_id: choose(
      profileSet.role_candidates,
      `${requestId}:player:role`
    ),
    occupation_id: choose(
      profileSet.occupation_candidates,
      `${requestId}:player:occupation`
    ),
    skill_profile: choose(
      profileSet.skill_profile_candidates,
      `${requestId}:player:skills`
    ),
    language_profile: choose(
      profileSet.language_profile_candidates,
      `${requestId}:player:language`
    ),
    knowledge_profile: choose(
      profileSet.knowledge_profile_candidates,
      `${requestId}:player:knowledge`
    ),
    body_profile: choose(
      profileSet.body_profile_candidates,
      `${requestId}:player:body`
    ),
    equipment_profile: resolveEquipmentProfile(
      choose(
        profileSet.equipment_profile_candidates,
        `${requestId}:player:equipment`
      ),
      `${requestId}:player:equipment`,
      catalog.item_visual_profiles
    ),
    candidate_set_digest:
      manifest.candidate_sets.player_boatman.digest,
    catalog_version: catalogVersion,
    identity: resolveActorIdentity(profileSet, `${requestId}:player:appearance`, catalogVersion)
  };
}

export function resolveEquipmentProfile(profile, seed, itemVisualProfiles = []) {
  return {
    ...structuredClone(profile),
    initial_item_allocations:
      (profile.initial_item_allocations ?? []).map((allocation) => ({
        ...structuredClone(allocation),
        ...resolveItemVisualProfile(allocation, itemVisualProfiles),
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

export function resolveNpcProfile(requestId, { catalogVersion = CURRENT_FIRST_PLAYABLE_CATALOG_VERSION } = {}) {
  const { catalog, manifest } = catalogFor(catalogVersion);
  const profileSet = catalog.character_candidate_sets.scene_fisher;
  const name = choose(
    profileSet.name_candidates,
    `${requestId}:npc:name`
  );
  return {
    name_id: name.name_id,
    name: name.display_name,
    role_id: choose(
      profileSet.role_candidates,
      `${requestId}:npc:role`
    ),
    occupation_id: choose(
      profileSet.occupation_candidates,
      `${requestId}:npc:occupation`
    ),
    language_profile: choose(
      profileSet.language_profile_candidates,
      `${requestId}:npc:language`
    ),
    knowledge_profile: choose(
      profileSet.knowledge_profile_candidates,
      `${requestId}:npc:knowledge`
    ),
    equipment_profile: resolveEquipmentProfile(
      choose(
        profileSet.equipment_profile_candidates,
        `${requestId}:npc:equipment`
      ),
      `${requestId}:npc:equipment`,
      catalog.item_visual_profiles
    ),
    profile_candidate_set_digest:
      manifest.candidate_sets.scene_fisher.digest,
    catalog_version: catalogVersion,
    identity: resolveActorIdentity(profileSet, `${requestId}:npc:appearance`, catalogVersion)
  };
}

export function resolveLegacyPlayerProfile(requestId) {
  return resolvePlayerProfile(requestId, { catalogVersion: 1 });
}

export function resolveLegacyNpcProfile(requestId) {
  return resolveNpcProfile(requestId, { catalogVersion: 1 });
}

export function resolveBaselinePlayerAppearance(requestId) {
  const source = FIRST_PLAYABLE_CATALOG_V2.baseline_traveller_appearance;
  if (source?.actor_base_appearance_profile?.profile_id
      !== 'first_playable_baseline_traveller_appearance_v1') {
    throw new TypeError('Baseline traveller appearance profile is required.');
  }
  return Object.freeze({
    appearance_profile_id:
      source.actor_base_appearance_profile.profile_id,
    identity: resolveActorIdentity(
      source, `${requestId}:baseline-player:appearance`,
      CURRENT_FIRST_PLAYABLE_CATALOG_VERSION)
  });
}

function resolveActorIdentity(profileSet, seedContext, catalogVersion) {
  if (catalogVersion === 1) return null;
  const seed = deriveSeed({
    scope: 'first_playable_actor_appearance_v1',
    catalog_version: catalogVersion,
    seed_context: seedContext
  });
  const materialized = materializeActorBaseAppearance({
    identity: profileSet.actor_base_identity,
    approved_entries: profileSet.actor_base_appearance_profile?.approved_entries,
    random: createRandomSource({ seed: seed.uint32 }),
    choice_key_prefix: seedContext
  }).identity;
  return Object.freeze({
    ...structuredClone(materialized),
    appearance_contract_version: 'actor_base_appearance_v1'
  });
}

function catalogFor(version) {
  const selected = CATALOGS[version];
  if (!selected) throw new TypeError(`Unsupported first-playable catalog version: ${version}`);
  return selected;
}

function resolveItemVisualProfile(allocation, profiles) {
  if (allocation.visual_profile_ref == null) return {};
  if (allocation.visual_profile_snapshot != null) {
    throw new TypeError('Item allocation cannot own a visual profile snapshot.');
  }
  const matches = profiles.filter((profile) =>
    profile?.visual_profile_id === allocation.visual_profile_ref
    && profile.status === 'approved');
  const profile = matches[0];
  const snapshot = profile?.visual_profile_snapshot;
  if (matches.length !== 1 || profile.item_template_ref !== allocation.template_id
      || snapshot?.schema !== 'item_visual_profile_snapshot_v1'
      || snapshot.version !== 1
      || snapshot.equipment_slot !== allocation.equipment_slot_category_id) {
    throw new TypeError(
      `Approved item visual profile is invalid: ${allocation.visual_profile_ref}`
    );
  }
  return { visual_profile_snapshot: structuredClone(snapshot) };
}

export function versionedTextRef(entityKind, value) {
  const matched = String(value).match(/^(.+)@(\d+)$/u);
  if (!matched) throw new TypeError(`Versioned ref is required: ${value}`);
  return ref(entityKind, matched[1], Number(matched[2]));
}
