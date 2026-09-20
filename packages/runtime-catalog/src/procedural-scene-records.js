import { deepFreeze, fail, isDigest, rowsFrom } from './shared.js';
import { canonicalStringify } from './canonical-records.js';

const REGIONAL_SQL = Object.freeze({
  landscape: `SELECT template.* FROM world_base.landscape_templates template
    JOIN world_base.region_landscape_templates regional
      ON regional.landscape_template_id=template.id
    WHERE template.id=ANY($1::text[]) AND template.status='approved'
      AND regional.region_id='region_novgorod_land'
      AND regional.status='approved' AND regional.is_allowed=TRUE
    ORDER BY template.id`,
  water: `SELECT template.* FROM world_base.water_body_templates template
    JOIN world_base.region_water_body_templates regional
      ON regional.water_body_template_id=template.id
    WHERE template.id=ANY($1::text[]) AND template.status='approved'
      AND regional.region_id='region_novgorod_land'
      AND regional.status='approved' AND regional.is_allowed=TRUE
    ORDER BY template.id`,
  land_use: `SELECT template.* FROM world_base.land_use_templates template
    JOIN world_base.region_land_use_templates regional
      ON regional.land_use_template_id=template.id
    WHERE template.id=ANY($1::text[]) AND template.status='approved'
      AND regional.region_id='region_novgorod_land'
      AND regional.status='approved' AND regional.is_allowed=TRUE
    ORDER BY template.id`,
  place: `SELECT template.* FROM world_base.place_templates template
    JOIN world_base.region_place_templates regional
      ON regional.place_template_id=template.id
    WHERE template.id=ANY($1::text[]) AND template.status='approved'
      AND regional.region_id='region_novgorod_land'
      AND regional.status='approved' AND regional.is_allowed=TRUE
    ORDER BY template.id`
});

export function loadApprovedProceduralCompiledCatalog({ verifiedCatalog,
  pin }) {
  if (verifiedCatalog?.schema !== 'rus.verified_item_catalog.v2'
      || verifiedCatalog.verified !== true
      || canonicalStringify(verifiedCatalog.pin) !== canonicalStringify(pin)
      || pin?.catalog_revision_id !==
        'procedural_scene_final_candidate_v1_001'
      || pin.catalog_digest !==
        '4ece07fb44abff19490f998a8712144ff18c76daa3080489b51f1df3e705950c') {
    fail('PROCEDURAL_COMPILED_CATALOG_PIN_MISMATCH',
      'Exact activated procedural final-candidate pin is required.');
  }
  const records = verifiedCatalog.records_by_table
    ?.procedural_scene_compiled_records;
  if (!Array.isArray(records) || records.length !== 21
      || records.some((record) => record.status !==
        'approved_authoring_not_runtime_selectable'
          || !['profile', 'mapping', 'approval_metadata']
            .includes(record.record_kind))) {
    fail('PROCEDURAL_COMPILED_CATALOG_MISSING',
      'Activated procedural compiled records are missing or invalid.');
  }
  return deepFreeze({
    schema: 'rus.verified_procedural_compiled_catalog.v1', verified: true,
    pin: structuredClone(pin),
    profiles: records.filter(({ record_kind: kind }) => kind === 'profile'),
    mappings: records.filter(({ record_kind: kind }) => kind === 'mapping'),
    approval_metadata: records.find(({ record_kind: kind }) =>
      kind === 'approval_metadata'),
    universal_categories: structuredClone(
      verifiedCatalog.records_by_table.universal_categories ?? [])
  });
}

export async function loadApprovedProceduralSceneRecordBundle({
  worldBaseReader, worldPin, runtimeCatalogPin, bindings,
  verifiedItemCatalog
} = {}) {
  if (typeof worldBaseReader?.read !== 'function'
      || !isDigest(worldPin?.world_catalog_digest)
      || !worldPin?.world_revision_id
      || runtimeCatalogPin?.schema !== 'rus.runtime_catalog_pin.v2'
      || runtimeCatalogPin.compatible_world_revision_id
        !== worldPin.world_revision_id
      || runtimeCatalogPin.compatible_world_catalog_digest
        !== worldPin.world_catalog_digest
      || bindings?.schema !== 'rus.procedural_scene_authoring_bindings.v1'
      || verifiedItemCatalog?.schema !== 'rus.verified_item_catalog.v2'
      || verifiedItemCatalog.verified !== true
      || verifiedItemCatalog.pin?.catalog_digest
        !== runtimeCatalogPin.catalog_digest) {
    throw new TypeError('Exact world/domain pins, bindings and verified item catalog are required.');
  }
  const worldRows = rowsFrom(await worldBaseReader.read(
    `SELECT id,catalog_digest,status FROM world_base.world_revisions
      WHERE id=$1 AND catalog_digest=$2 AND status='approved'`,
    [worldPin.world_revision_id, worldPin.world_catalog_digest]));
  if (worldRows.length !== 1) gap('PROCEDURAL_SCENE_WORLD_PIN_MISSING');
  const events = rowsFrom(await worldBaseReader.read(
    `SELECT event_id,event_type,catalog_scope,catalog_revision_id,catalog_digest,
            compatible_world_revision_id,compatible_world_catalog_digest
       FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope=$1 ORDER BY event_sequence DESC LIMIT 1`,
    [runtimeCatalogPin.catalog_scope]));
  if (events.length !== 1) gap('PROCEDURAL_SCENE_ACTIVATION_MISSING');
  const activation = events[0];
  if (activation.event_type !== 'activate'
      || activation.catalog_revision_id !== runtimeCatalogPin.catalog_revision_id
      || activation.catalog_digest !== runtimeCatalogPin.catalog_digest
      || activation.compatible_world_revision_id !== worldPin.world_revision_id
      || activation.compatible_world_catalog_digest !== worldPin.world_catalog_digest) {
    gap('PROCEDURAL_SCENE_ACTIVATION_PIN_MISMATCH');
  }
  const active = bindings.bindings.filter(({ status }) => status === 'approved');
  const ids = (key, many = false) => [...new Set(active.flatMap((binding) => {
    const value = binding[key];
    return many ? value ?? [] : value == null ? [] : [value];
  }))].sort();
  const [landscape, water, landUse, place, npc] = await Promise.all([
    readRegional(worldBaseReader, 'landscape', ids('landscape_template_ref')),
    readRegional(worldBaseReader, 'water', ids('water_body_template_ref')),
    readRegional(worldBaseReader, 'land_use', ids('land_use_template_refs', true)),
    readRegional(worldBaseReader, 'place', ids('place_template_ref')),
    readNpcProfiles(worldBaseReader, ids('npc_profile_set_ref'))
  ]);
  return deepFreeze({
    schema: 'rus.procedural_scene_approved_record_bundle.v1',
    world_pin: structuredClone(worldPin),
    activation: { status: 'active', event_id: activation.event_id,
      world_revision_id: worldPin.world_revision_id,
      world_catalog_digest: worldPin.world_catalog_digest },
    records_by_table: {
      landscape_templates: landscape, water_body_templates: water,
      land_use_templates: landUse, place_templates: place,
      region_npc_profile_sets: npc,
      ...pickItemTables(verifiedItemCatalog.records_by_table)
    }
  });
}

export async function loadApprovedProceduralActorTemporalBundle({
  worldBaseReader, worldPin, actorCatalog, actorProfileCatalog,
  temporalRecords
} = {}) {
  if (typeof worldBaseReader?.read !== 'function'
      || actorCatalog?.schema !== 'rus.live_world_runtime.approved_actor_catalog.v1'
      || actorProfileCatalog?.schema !== 'rus.verified_actor_profile_catalog.v1'
      || actorProfileCatalog.verified !== true
      || actorProfileCatalog.world_pin?.world_revision_id !== worldPin?.world_revision_id
      || actorProfileCatalog.world_pin?.world_catalog_digest
        !== worldPin?.world_catalog_digest
      || !Array.isArray(temporalRecords)
      || temporalRecords.some(({ status }) => status !== 'approved')) {
    throw new TypeError('Exact approved actor and Temporal inputs are required.');
  }
  const roles = actorCatalog.roles.filter(({ status }) => status === 'approved');
  const occupations = actorCatalog.occupations.filter(({ status }) =>
    status === 'approved');
  const refs = (records, key) => [...new Set(records.map((record) => record[key])
    .filter(Boolean))].sort();
  const [roleArchetypes, occupationArchetypes, legalStatuses,
    socialPositions, skillDefaults] = await Promise.all([
    readOwnerRows(worldBaseReader, 'social_role_archetypes',
      refs(roles, 'role_archetype_id')),
    readOwnerRows(worldBaseReader, 'occupation_archetypes',
      refs(occupations, 'occupation_archetype_id')),
    readOwnerRows(worldBaseReader, 'legal_status_archetypes',
      refs(roles, 'legal_status_archetype_id')),
    readOwnerRows(worldBaseReader, 'social_position_archetypes',
      refs(roles, 'social_position_archetype_id')),
    readSkillDefaults(worldBaseReader,
      refs(occupations, 'occupation_archetype_id'))
  ]);
  return deepFreeze({ schema: 'rus.procedural_actor_temporal_bundle.v1',
    world_pin: structuredClone(worldPin), roles: structuredClone(roles),
    occupations: structuredClone(occupations), role_archetypes: roleArchetypes,
    occupation_archetypes: occupationArchetypes,
    legal_status_archetypes: legalStatuses,
    social_position_archetypes: socialPositions,
    occupation_skill_defaults: skillDefaults,
    actor_profiles: structuredClone(actorProfileCatalog.records_by_table),
    temporal_records: structuredClone(temporalRecords) });
}

const OWNER_SQL = Object.freeze({
  social_role_archetypes: `SELECT * FROM world_base.social_role_archetypes WHERE id=ANY($1::text[]) AND status='approved' ORDER BY id`,
  occupation_archetypes: `SELECT * FROM world_base.occupation_archetypes WHERE id=ANY($1::text[]) AND status='approved' ORDER BY id`,
  legal_status_archetypes: `SELECT * FROM world_base.legal_status_archetypes WHERE id=ANY($1::text[]) AND status='approved' ORDER BY id`,
  social_position_archetypes: `SELECT * FROM world_base.social_position_archetypes WHERE id=ANY($1::text[]) AND status='approved' ORDER BY id`
});
async function readOwnerRows(reader, table, ids) {
  if (ids.length === 0) return [];
  const rows = rowsFrom(await reader.read(OWNER_SQL[table], [ids]));
  if (rows.length !== ids.length) gap('PROCEDURAL_ACTOR_DEPENDENCY_DATA_GAP');
  return rows;
}
async function readSkillDefaults(reader, ids) {
  if (ids.length === 0) return [];
  return rowsFrom(await reader.read(
    `SELECT * FROM world_base.occupation_skill_defaults WHERE occupation_archetype_id=ANY($1::text[]) AND status='approved' ORDER BY occupation_archetype_id,skill_id`,
    [ids]));
}

async function readRegional(reader, kind, ids) {
  if (ids.length === 0) return [];
  return rowsFrom(await reader.read(REGIONAL_SQL[kind], [ids]));
}
async function readNpcProfiles(reader, ids) {
  if (ids.length === 0) return [];
  return rowsFrom(await reader.read(
    `SELECT * FROM world_base.region_npc_profile_sets
      WHERE id=ANY($1::text[]) AND status='approved' ORDER BY id`, [ids]));
}
function pickItemTables(records = {}) {
  return Object.fromEntries(['item_profile_sets','item_profile_entries',
    'item_templates','universal_categories'].map((key) =>
    [key, structuredClone(records[key] ?? [])]));
}
function gap(code) { fail(code, code); }
