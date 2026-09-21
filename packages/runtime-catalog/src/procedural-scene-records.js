import { deepFreeze, fail, isDigest, rowsFrom } from './shared.js';
import { canonicalStringify } from './canonical-records.js';
import { createHash } from 'node:crypto';

const V1_FINAL_COMPILED_RECORDS = Object.freeze([
  ['approval:final-candidate', 'approval_metadata', 'fbe813d750c573fa999247ae34543897d2f1e930aa7a91b4ae095edc34515d0b'],
  ['mapping:drying_dormant_storage_place_group_v1', 'mapping', 'db93a214385e2c40ebd53d74c64d006d2840f3242658e7f76dbb595125792884'],
  ['mapping:drying_dormant_work_zone_place_group_v1', 'mapping', '23c9d79d909e9368b2175060fd73bbc65e195e8653f31e87bf662affea1e3c16'],
  ['mapping:fishing_storage_place_group_v1', 'mapping', '592d96e3cc158179fd7a1eb1aa0fc6c4d5140af6f8fab82dc9590a84dd9817e9'],
  ['mapping:fishing_tool_group_v1', 'mapping', 'd50fe162aecc4068ec45138b7fb4ab3b83cacb547ebe318d281a884e6670b7cd'],
  ['mapping:fishing_work_material_group_v1', 'mapping', '93ab0cb7e025220cf14892929ab55906d1eefaa9804afb0099f96405cbf24d04'],
  ['mapping:fishing_work_zone_place_group_v1', 'mapping', 'd6d06e557a1f6c1b8369b12dbf07e4c68c566f9d0ce9a23dbfce27777085fb18'],
  ['mapping:natural_shore_typed_layers_v1', 'mapping', 'c67d0b6e24e4fe0368505ec268eb36d9cae7eb3a31f3c76bfde161b0380a4f07'],
  ['profile:actor-appearance-v6', 'profile', 'e5870c4b4bd1e307bea6242c885a12ce8c069a2aa5a87a0aa2ff0a43a4a21a27'],
  ['profile:novgorod_drying_storage_workspace_v3', 'profile', '7570bd6c541702e4c31f6b7fc3790d6a848ff9c587903cd116cea6a1daccff29'],
  ['profile:novgorod_inland_fishing_worksite_v3', 'profile', '2f2fd76ac7214bf8fe1d8695935220f884dbd238ecadc6aa9320342796b1326a'],
  ['profile:novgorod_natural_shore_v3', 'profile', '13830b3dae7f5a0de927ef0a4682896861d82d4cba753860dcf010fda623f531'],
  ['profile:npc-equipment:novgorod_commoner_male_basic_clothing_v1', 'profile', '55fd8db7201192d85c87b9a1ba7ac0373882ae052a6a3d679743e7d4266709a6'],
  ['profile:npc-equipment:novgorod_fishing_water_equipment_v1', 'profile', 'e87718350c8f3a4f62de911600fb0671ff9febc35a820ef1562dccf8d6259245'],
  ['profile:npc-equipment:novgorod_transport_guiding_equipment_v1', 'profile', 'a8bb272e606ab5a456932d746ad7d2fa1376abc1cd39c7cf7c88f35263d6802d'],
  ['profile:onomastics-1230-1250', 'profile', 'f075cf3f5addaae44159ad7bca7c6d3662ed2fbdbb7178d9c951e7de67c3dd7a'],
  ['profile:regional-drying-workspace', 'profile', 'c5b4ee8014329ddeae40768c9ee2cb40fb8dd2c735ea942ffdbd5a6f8669ad6b'],
  ['profile:regional-land_use', 'profile', 'edb709b7cfd343ff27c373d87417d898dd82508898ee2bce7484b19fa3966b0c'],
  ['profile:regional-landscape', 'profile', 'b3a01dea1181e0f79f044545269c69370b039874278eebedfb85a6bb67201330'],
  ['profile:regional-place', 'profile', '1252a7b94f7dde8946bfbd20cb45b8f38cf69b7bb647b8cad327b84072a3a99e'],
  ['profile:regional-water', 'profile', 'c0dfad691543272dbd1a316b9d9bfc0a51cff55c21dc31c893aaebcf2fa4b032']
]);
const V2_POLICY_RECORD = Object.freeze([
  'policy:functional-actor-allocation-v1', 'mapping',
  '206bfd1717325dad781cb9ff429f2bae09d39fb6fee63f3029da310ce864a00a',
  '667d8400e0e02310ede7d97be624194467c95da748f6a7114b934ad6657e930f'
]);
const V1_SOURCE_PACK_DIGEST =
  '4ddd8a0bd3770312808166599e8a57801939c7fc2b915c2fcc3c7db7030422af';

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
  const isV1 = pin?.catalog_revision_id ===
      'procedural_scene_final_candidate_v1_001'
    && pin.catalog_digest ===
      '4ece07fb44abff19490f998a8712144ff18c76daa3080489b51f1df3e705950c';
  const isV2 = pin?.catalog_revision_id ===
      'procedural_scene_final_candidate_v2_001'
    && pin.catalog_digest ===
      '6fcf5c50d01bd56605a037de3d79cd1aa5e56a1c520db70bd0ab5b6ade6b1361';
  if (verifiedCatalog?.schema !== 'rus.verified_item_catalog.v2'
      || verifiedCatalog.verified !== true
      || canonicalStringify(verifiedCatalog.pin) !== canonicalStringify(pin)
      || (!isV1 && !isV2)) {
    fail('PROCEDURAL_COMPILED_CATALOG_PIN_MISMATCH',
      'Exact activated procedural final-candidate pin is required.');
  }
  const records = verifiedCatalog.records_by_table
    ?.procedural_scene_compiled_records;
  const expected = new Map([...V1_FINAL_COMPILED_RECORDS,
    ...(isV2 ? [V2_POLICY_RECORD] : [])].map(([id, kind, payload, source]) =>
    [id, { kind, payload, source: source ?? V1_SOURCE_PACK_DIGEST }]));
  const seen = new Set();
  if (!Array.isArray(records) || records.length !== expected.size
      || records.some((record) => record.status !==
        'approved_authoring_not_runtime_selectable'
          || String(record.version) !== '1'
          || expected.get(record.record_id)?.kind !== record.record_kind
          || seen.has(record.record_id)
          || record.source_pack_digest !== expected.get(record.record_id)?.source
          || record.payload_digest !== expected.get(record.record_id)?.payload
          || (record.record_id !== V2_POLICY_RECORD[0]
            && record.payload_digest !== createHash('sha256')
              .update(canonicalStringify(record.payload)).digest('hex'))
          || (seen.add(record.record_id), false))
      || seen.size !== expected.size
      || verifiedCatalog.import_audit?.approval_attestation_digest !== (isV2
        ? '2917b993a9e9c63e1989725cee35e63bd0ed32dfece583a782dfb27f1c3f4772'
        : '0204d109cbe18d06aed0957be3c10d12a088e15368cc0e7eb865b1382538ef7c')
      || verifiedCatalog.import_audit?.import_audit_digest !==
        pin.import_audit_digest) {
    fail('PROCEDURAL_COMPILED_CATALOG_MISSING',
      'Activated procedural compiled records are missing or invalid.');
  }
  const allocationPolicy = records.find(({ record_id: id }) =>
    id === V2_POLICY_RECORD[0]) ?? null;
  if (isV2 && allocationPolicy?.payload?.runtime_status !==
      'pending_runtime_inventory_owner_validation')
    fail('PROCEDURAL_COMPILED_CATALOG_MISSING',
      'V2 allocation policy is not runtime-gated.');
  return deepFreeze({
    schema: 'rus.verified_procedural_compiled_catalog.v1', verified: true,
    pin: structuredClone(pin),
    profiles: records.filter(({ record_kind: kind }) => kind === 'profile'),
    mappings: records.filter(({ record_kind: kind }) => kind === 'mapping'),
    approval_metadata: records.find(({ record_kind: kind }) =>
      kind === 'approval_metadata'),
    allocation_policy: allocationPolicy,
    runtime_item_creation_authorized: false,
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
