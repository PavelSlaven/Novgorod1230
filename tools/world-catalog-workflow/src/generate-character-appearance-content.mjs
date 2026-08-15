import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ACTOR_BASE_APPEARANCE_VOCABULARY } from '@rus/actors';
import { canonicalDigest } from '@rus/materialization';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../../../apps/game-server/src/internal/lower-dvina-trace-phase-1a-bundle.js';

const root = process.cwd();
const scenarioRoot = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const contentRoot = `${scenarioRoot}/phase-m7-content`;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const rawDigest = async (path) => sha256(await readFile(resolve(root, path)));
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
async function writeJson(path, value) {
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), json(value));
  return rawDigest(path);
}
function digestFileMap(files) {
  return sha256(`${Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, digest]) => `${name}:${digest}`).join('\n')}\n`);
}

const vocabulary = ACTOR_BASE_APPEARANCE_VOCABULARY;

function appearanceEntries() {
  return Object.entries(vocabulary).flatMap(([facet, values]) => values.map((optionValue) => ({
    entry_id: `nov_1200_1250_${facet}_${optionValue}`,
    facet,
    option_value: optionValue,
    weight: 1,
    ...(applicability(facet, optionValue) == null ? {} : { applicability: applicability(facet, optionValue) }),
    status: 'approved'
  })));
}

function applicability(facet, value) {
  if (facet === 'hair_style' && value === 'braided') return { 'appearance.hair.length': ['long'] };
  if (facet === 'hair_style' && value === 'loose') return { 'appearance.hair.length': ['medium', 'long'] };
  if (facet === 'hair_style' && value === 'wavy') return { 'appearance.hair.length': ['short', 'medium', 'long'] };
  if (facet === 'facial_hair' && value !== 'none') {
    return { sex_category: ['male'], age_category: ['adult', 'middle_aged', 'old'] };
  }
  return null;
}

const entries = appearanceEntries();
const participantV1 = await readJson(`${scenarioRoot}/phase-0b/participant-profile-set.json`);
const participantV2 = structuredClone(participantV1);
participantV2.revision = 2;
participantV2.profiles = participantV2.profiles.map((profile) => ({
  ...profile,
  revision: 2,
  actor_base_appearance_profile: {
    schema: 'rus.actor_base_appearance_candidate_set.v1',
    profile_id: `${profile.profile_id}_appearance_v1`,
    region_id: 'gn_nov_g1_xp017_yp026',
    period: { start_year: 1200, end_year: 1250 },
    approved_entries: structuredClone(entries),
    fallback_policy: 'forbidden'
  }
}));
participantV2.candidate_sets = participantV2.candidate_sets.map((candidateSet) => ({
  ...candidateSet,
  candidates: candidateSet.candidates.map((candidate) => candidate.profile_id.startsWith('trace_ld_v1_')
    ? { ...candidate, revision: 2 }
    : candidate)
}));

const playerV1 = await readJson(`${scenarioRoot}/player-profile.json`);
const playerV2 = {
  ...structuredClone(playerV1),
  revision: 2,
  identity: { sex_category: 'male', age_category: 'young_adult' },
  actor_base_appearance_profile: {
    schema: 'rus.actor_base_appearance_candidate_set.v1',
    profile_id: 'lower_dvina_trace_player_mikula_appearance_v1',
    region_id: 'gn_nov_g1_xp017_yp026',
    period: { start_year: 1200, end_year: 1250 },
    approved_entries: structuredClone(entries),
    fallback_policy: 'forbidden'
  }
};
const playerDigest = await writeJson(`${contentRoot}/player-profile.json`, playerV2);
const playerParticipantSet = participantV2.candidate_sets.find(({ slot }) => slot === 'player_clerk');
playerParticipantSet.candidates = [{
  profile_id: playerV2.profile_id,
  revision: 2,
  digest: playerDigest
}];
const participantDigest = await writeJson(`${contentRoot}/participant-profile-set.json`, participantV2);

const playerSetV1 = await readJson(`${scenarioRoot}/player-profile-set.json`);
const playerSetV2 = {
  ...structuredClone(playerSetV1),
  profile_set_id: 'lower_dvina_trace_player_profile_set_v2',
  revision: 2,
  profile_candidates: [{ id: playerV2.profile_id, revision: 2, digest: playerDigest }]
};
const playerSetDigest = await writeJson(`${contentRoot}/player-profile-set.json`, playerSetV2);

const visual = {
  base: {
    schema: 'item_visual_profile_snapshot_v1', version: 1,
    garment_kind: 'base_garment', equipment_slot: 'base_garment', neckline: 'slit_round',
    sleeve_form: 'narrow', outer_form: 'none', visible_fabric: 'light_linen', trim: 'none',
    main_visible_color: 'undyed_linen', secondary_visible_color: 'undyed_linen', headwear_kind: 'none'
  },
  outer: (color, trim = 'none') => ({
    schema: 'item_visual_profile_snapshot_v1', version: 1,
    garment_kind: 'outer_garment', equipment_slot: 'outer_garment', neckline: 'high_closed',
    sleeve_form: 'narrow', outer_form: 'front_open', visible_fabric: 'wool', trim,
    main_visible_color: color, secondary_visible_color: color, headwear_kind: 'none'
  })
};
const actorSlots = [
  ['player_clerk', 'brown'],
  ['onisim_boatman', 'charcoal'],
  ['eremey_fisher', 'ochre'],
  ['ratsha_storehouse_helper', 'dark_blue'],
  ['zhdanko_storehouse_controller', 'forest_green'],
  ['background_fisher_1', 'brown'],
  ['background_fisher_2', 'charcoal']
];
const itemVisualProfiles = [{
  visual_profile_id: 'trace_ld_v1_visual_profile_base_shirt',
  item_template_ref: 'trace_ld_v1_item_base_shirt',
  visual_profile_snapshot: structuredClone(visual.base),
  status: 'approved'
}, ...actorSlots.map(([slot, color]) => ({
  visual_profile_id: `trace_ld_v1_visual_profile_${slot}_outer`,
  item_template_ref: slot === 'ratsha_storehouse_helper'
    ? 'trace_ld_v1_item_ratsha_caftan'
    : 'trace_ld_v1_item_working_outer_garment',
  visual_profile_snapshot: visual.outer(
    color, slot === 'ratsha_storehouse_helper' ? 'edge_band' : 'none'),
  status: 'approved'
}))];
const equipmentCandidates = actorSlots.flatMap(([slot, color]) => [
  equipmentCandidate(slot, 'base', 'trace_ld_v1_item_base_shirt', 'trace_ld_v1_inventory_profile_base_shirt', 'trace_ld_v1_visual_profile_base_shirt', 'base_garment'),
  equipmentCandidate(slot, 'outer', slot === 'ratsha_storehouse_helper'
    ? 'trace_ld_v1_item_ratsha_caftan'
    : 'trace_ld_v1_item_working_outer_garment', slot === 'ratsha_storehouse_helper'
    ? 'trace_ld_v1_inventory_profile_ratsha_caftan'
    : 'trace_ld_v1_inventory_profile_working_outer_garment',
  `trace_ld_v1_visual_profile_${slot}_outer`, 'outer_garment')
]);
function equipmentCandidate(
  slot, suffix, template, profile, visualProfile, equipmentSlot
) {
  return {
    equipment_candidate_id: `trace_ld_v1_initial_garment_${slot}_${suffix}`,
    target_actor_slot_ref: slot,
    instance_key: `${slot}_${suffix}_garment`,
    item_template_ref: template,
    inventory_profile_ref: profile,
    visual_profile_ref: visualProfile,
    owner_ref: slot,
    holder_ref: slot,
    controller_ref: slot,
    physical_position: 'equipped',
    equipment_slot_category_id: equipmentSlot,
    condition_state: 'serviceable',
    legal_status: 'owned',
    claim_state: 'established',
    status: 'approved'
  };
}

const itemV4Path = `${scenarioRoot}/phase-6-content/item-container-set-overlay.json`;
const itemV5 = {
  schema: 'rus.trace_item_container_set_overlay.v1',
  set_id: 'trace_ld_v1_item_container_set',
  revision: 5,
  status: 'approved',
  publication_status: 'unpublished',
  supersedes_ref: {
    id: 'trace_ld_v1_item_container_set', revision: 4,
    schema: 'rus.trace_item_container_set_overlay.v1', path: itemV4Path,
    digest: await rawDigest(itemV4Path)
  },
  fallback_policy: 'forbidden',
  normalization_policy: 'forbidden',
  alias_policy: 'forbidden',
  item_template_additions: [
    {
      item_template_id: 'trace_ld_v1_item_base_shirt', semantic_category: 'linen_shirt',
      base_catalog_ref: { template_id: 'item_tpl_nov_linen_base_garment_v1', inventory_profile_id: 'trace_ld_v1_inventory_profile_base_shirt' },
      causal_basis: 'Approved ordinary linen base garment for the initial actor equipment profile.', status: 'approved'
    },
    {
      item_template_id: 'trace_ld_v1_item_working_outer_garment', semantic_category: 'wool_outer_garment',
      base_catalog_ref: { template_id: 'item_tpl_nov_wool_outer_garment_v1', inventory_profile_id: 'trace_ld_v1_inventory_profile_working_outer_garment' },
      causal_basis: 'Approved ordinary wool outer garment for the initial actor equipment profile.', status: 'approved'
    }
  ],
  item_template_overrides: [{
    item_template_id: 'trace_ld_v1_item_ratsha_caftan',
    base_catalog_ref: { template_id: 'item_tpl_nov_wool_outer_garment_v1', inventory_profile_id: 'trace_ld_v1_inventory_profile_ratsha_caftan' }
  }],
  item_inventory_profiles: [
    { inventory_profile_id: 'trace_ld_v1_inventory_profile_base_shirt', item_template_ref: 'trace_ld_v1_item_base_shirt', mass_grams: 350, carry_form: 'regular', external_hand_cost: 0, status: 'approved' },
    { inventory_profile_id: 'trace_ld_v1_inventory_profile_working_outer_garment', item_template_ref: 'trace_ld_v1_item_working_outer_garment', mass_grams: 1300, carry_form: 'regular', external_hand_cost: 0, status: 'approved' },
    { inventory_profile_id: 'trace_ld_v1_inventory_profile_ratsha_caftan', item_template_ref: 'trace_ld_v1_item_ratsha_caftan', mass_grams: 1500, carry_form: 'regular', external_hand_cost: 0, status: 'approved' }
  ],
  item_visual_profiles: itemVisualProfiles,
  initial_equipment_candidates: equipmentCandidates,
  excludes: ['runtime_handler', 'persistence', 'party_instance', 'api', 'ui']
};
const itemDigest = await writeJson(`${contentRoot}/item-container-set-overlay.json`, itemV5);

const definitionV18Path = `${scenarioRoot}/phase-m6-content/definition.json`;
const definitionV18 = await readJson(definitionV18Path);
const definitionV19 = structuredClone(definitionV18);
definitionV19.revision = 19;
definitionV19.supersedes_definition_ref = {
  id: 'lower_dvina_trace_v1', revision: 18, path: definitionV18Path,
  digest: await rawDigest(definitionV18Path)
};
definitionV19.immutable_content_refs.player_profile_set = {
  id: playerSetV2.profile_set_id, revision: 2, digest: playerSetDigest
};
definitionV19.immutable_content_refs.participant_profile_set = {
  id: participantV2.profile_set_id, revision: 2, digest: participantDigest
};
definitionV19.immutable_content_refs.item_container_set = {
  id: itemV5.set_id, revision: 5, digest: itemDigest
};
definitionV19.scope = [...definitionV19.scope, 'canonical_actor_appearance_and_equipment_driven_portraits'];
const definitionDigest = await writeJson(`${contentRoot}/definition.json`, definitionV19);

const contentFiles = {
  'definition.json': definitionDigest,
  'item-container-set-overlay.json': itemDigest,
  'participant-profile-set.json': participantDigest,
  'player-profile-set.json': playerSetDigest,
  'player-profile.json': playerDigest
};
const m6ManifestPath = `${scenarioRoot}/phase-m6-content/manifest.json`;
const contentManifest = {
  schema: 'rus.lower_dvina_trace_m7_content_manifest.v1',
  package_id: 'lower_dvina_trace_m7_content_v1', revision: 1,
  scenario_id: 'lower_dvina_trace_v1', scenario_definition_revision: 19,
  status: 'approved', publication_status: 'unpublished',
  superseded_package_ref: {
    path: m6ManifestPath, id: 'lower_dvina_trace_m6_content_v1', revision: 1,
    schema: 'rus.lower_dvina_trace_m6_content_manifest.v1', digest: await rawDigest(m6ManifestPath)
  },
  superseded_definition_ref: definitionV19.supersedes_definition_ref,
  files: contentFiles,
  content_refs: {
    definition: contentRef('definition.json', 'lower_dvina_trace_v1', 19, definitionV19.schema, definitionDigest),
    player_profile: contentRef('player-profile.json', playerV2.profile_id, 2, playerV2.schema, playerDigest),
    player_profile_set: contentRef('player-profile-set.json', playerSetV2.profile_set_id, 2, playerSetV2.schema, playerSetDigest),
    participant_profile_set: contentRef('participant-profile-set.json', participantV2.profile_set_id, 2, participantV2.schema, participantDigest),
    item_container_set: contentRef('item-container-set-overlay.json', itemV5.set_id, 5, itemV5.schema, itemDigest)
  },
  content_digest_algorithm: 'sha256_sorted_file_map_v1',
  content_digest: digestFileMap(contentFiles),
  fallback_policy: 'forbidden', normalization_policy: 'forbidden', alias_policy: 'forbidden'
};
const contentManifestDigest = await writeJson(`${contentRoot}/manifest.json`, contentManifest);

const oldBindingsPath = `${scenarioRoot}/phase-1a-v14/materialization-bindings.json`;
const historicalBundle = await loadLowerDvinaTraceMaterializationBundle({
  rootDir: root,
  scenarioDefinitionRevision: 18
});
const mergedTemplates = structuredClone(historicalBundle.item_container_set.item_templates);
const mergedTemplateById = new Map(mergedTemplates.map((template) => [template.item_template_id, template]));
for (const template of itemV5.item_template_additions) {
  mergedTemplates.push(structuredClone(template));
  mergedTemplateById.set(template.item_template_id, mergedTemplates.at(-1));
}
for (const templatePatch of itemV5.item_template_overrides) {
  Object.assign(mergedTemplateById.get(templatePatch.item_template_id), structuredClone(templatePatch));
}
const sealedSelectionInventory = structuredClone(
  historicalBundle.materialization_bindings.sealed_selection_inventory
);
sealedSelectionInventory.inventory_id = 'lower_dvina_trace_phase_1a_sealed_selection_inventory_v10';
sealedSelectionInventory.source_artifact_digests.participant_profile_set = participantDigest;
sealedSelectionInventory.source_artifact_digests.item_container_set = itemDigest;
replaceSealedGroup('participants', participantV2.participant_slots
  .filter((slot) => slot !== 'player_clerk')
  .map((slot) => {
    const candidateSet = participantV2.candidate_sets.find((candidate) =>
      candidate.slot === slot || candidate.slots?.includes(slot));
    const candidate = candidateSet.candidates[0];
    const profile = participantV2.profiles.find((value) =>
      value.profile_id === candidate.profile_id && value.revision === candidate.revision);
    return { record_id: slot, record_digest: canonicalDigest(profile) };
  }));
replaceSealedGroup('items', mergedTemplates
  .filter(({ item_template_id: id }) => id !== 'trace_ld_v1_item_mikula_knife')
  .map((template) => ({
    record_id: template.item_template_id,
    record_digest: canonicalDigest(template)
  })));
function replaceSealedGroup(kind, records) {
  const group = sealedSelectionInventory.required_groups.find(({ selection_kind }) =>
    selection_kind === kind);
  const sorted = records.sort((left, right) => left.record_id.localeCompare(right.record_id));
  group.required_record_count = sorted.length;
  group.required_records_digest = canonicalDigest(sorted);
  delete group.allowed_records_digests;
}
const bindings = {
  schema: 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
  binding_set_id: 'lower_dvina_trace_phase_1a_materialization_bindings_v15',
  revision: 15, status: 'approved', scenario_id: 'lower_dvina_trace_v1',
  scenario_definition_revision: 19,
  superseded_binding_ref: {
    path: oldBindingsPath, id: 'lower_dvina_trace_phase_1a_materialization_bindings_v14',
    revision: 14, schema: 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    digest: await rawDigest(oldBindingsPath)
  },
  binding_resolution_policy: 'reuse_exact_revision_18_materialization_with_actor_appearance_and_stage16_equipment_candidates_or_fail_closed',
  fallback_policy: 'forbidden', normalization_policy: 'forbidden',
  actor_appearance_materialization: {
    owner: '@rus/materialization', contract_owner: '@rus/actors',
    selection_policy: 'approved_applicable_weighted_entries_stable_id_order',
    draw_order: 'after_revision_18_choices_stable_actor_slot_order',
    runtime_llm: 'forbidden'
  },
  initial_equipment_materialization: {
    owner: '@rus/new-game:stage-16-item-placement',
    transition_owner: '@rus/items-property', source_ref: itemV5.set_id,
    candidate_to_instance_mapping: 'participant_slot_to_materialized_actor_instance',
    outfit_materializer: 'forbidden'
  },
  sealed_selection_inventory: sealedSelectionInventory,
  excludes: ['renderer_rng', 'actor_clothing_state', 'portrait_persistence', 'runtime_llm']
};
const bindingsPath = `${scenarioRoot}/phase-1a-v15/materialization-bindings.json`;
const bindingsDigest = await writeJson(bindingsPath, bindings);
const oldPhase1aPath = `${scenarioRoot}/phase-1a-v14/manifest.json`;
const phase1aManifest = {
  schema: 'rus.lower_dvina_trace_phase_1a_manifest.v1',
  package_id: 'lower_dvina_trace_phase_1a_v15', revision: 15, status: 'approved',
  scenario_id: 'lower_dvina_trace_v1', scenario_definition_revision: 19,
  publication_status: 'internal_only', materialization_status: 'phase_1a_internal',
  superseded_package_ref: {
    path: oldPhase1aPath, id: 'lower_dvina_trace_phase_1a_v14', revision: 14,
    schema: 'rus.lower_dvina_trace_phase_1a_manifest.v1', digest: await rawDigest(oldPhase1aPath)
  },
  base_definition_ref: {
    path: `${contentRoot}/manifest.json`, id: contentManifest.package_id, revision: 1,
    schema: contentManifest.schema, digest: contentManifestDigest
  },
  content_refs: {
    materialization_bindings: {
      path: bindingsPath, digest: bindingsDigest, schema: bindings.schema,
      id: bindings.binding_set_id, revision: 15
    }
  },
  fallback_policy: 'forbidden'
};
await writeJson(`${scenarioRoot}/phase-1a-v15/manifest.json`, phase1aManifest);

const firstPlayableV1Root = 'data/world-catalogs/novgorod/first-playable-v1';
const firstPlayableV2Root = 'data/world-catalogs/novgorod/first-playable-v2';
const firstPlayableCatalog = await readJson(`${firstPlayableV1Root}/catalog.json`);
firstPlayableCatalog.catalog_id = 'lower_dvina_first_playable_content_v2';
firstPlayableCatalog.version = 2;
firstPlayableCatalog.item_visual_profiles = [
  {
    visual_profile_id: 'first_playable_visual_profile_base_shirt',
    item_template_ref: 'item_tpl_nov_linen_shirt_v1',
    visual_profile_snapshot: structuredClone(visual.base),
    status: 'approved'
  },
  ...['brown', 'ochre'].map((color) => ({
    visual_profile_id: `first_playable_visual_profile_outer_${color}`,
    item_template_ref: 'item_tpl_nov_wool_outer_garment_v1',
    visual_profile_snapshot: visual.outer(color),
    status: 'approved'
  }))
];
firstPlayableCatalog.baseline_traveller_appearance = {
  actor_base_identity: {},
  actor_base_appearance_profile: {
    schema: 'rus.actor_base_appearance_candidate_set.v1',
    profile_id: 'first_playable_baseline_traveller_appearance_v1',
    region_id: 'gn_nov_g1_xp017_yp026',
    period: { start_year: 1200, end_year: 1250 },
    approved_entries: structuredClone(entries),
    fallback_policy: 'forbidden'
  }
};
for (const [setId, set] of Object.entries(firstPlayableCatalog.character_candidate_sets)) {
  set.actor_base_identity = {
    sex_category: 'male',
    age_category: setId === 'player_boatman' ? 'young_adult' : 'adult'
  };
  set.actor_base_appearance_profile = {
    schema: 'rus.actor_base_appearance_candidate_set.v1',
    profile_id: `first_playable_${setId}_appearance_v1`,
    region_id: 'gn_nov_g1_xp017_yp026',
    period: { start_year: 1200, end_year: 1250 },
    approved_entries: structuredClone(entries),
    fallback_policy: 'forbidden'
  };
  for (const equipment of set.equipment_profile_candidates) {
    delete equipment.clothing_template_refs;
    for (const allocation of equipment.initial_item_allocations) {
      if (allocation.template_id === 'item_tpl_nov_linen_shirt_v1') {
        Object.assign(allocation, {
          physical_position: 'equipped', equipment_slot_category_id: 'base_garment',
          visual_profile_ref: 'first_playable_visual_profile_base_shirt'
        });
      } else if (allocation.template_id === 'item_tpl_nov_wool_outer_garment_v1') {
        Object.assign(allocation, {
          physical_position: 'equipped', equipment_slot_category_id: 'outer_garment',
          visual_profile_ref: `first_playable_visual_profile_outer_${setId === 'player_boatman' ? 'brown' : 'ochre'}`
        });
      } else {
        allocation.physical_position = allocation.equipment_role === 'work_tool' ? 'hands' : 'external';
      }
    }
  }
}
const fisherEquipment = firstPlayableCatalog.character_candidate_sets.scene_fisher
  .equipment_profile_candidates[0];
fisherEquipment.initial_item_allocations.push(
  {
    slot_id: 'linen-shirt', display_name: 'нижняя рубаха',
    template_id: 'item_tpl_nov_linen_shirt_v1', category_id: 'cat_item_object_linen_shirt_v1',
    quantity_profile_id: 'quantity_item_tpl_nov_linen_shirt_v1_count_v5',
    quantity_candidates: [{ quantity: 1, unit_id: 'piece' }], equipment_role: 'worn_clothing',
    physical_position: 'equipped', equipment_slot_category_id: 'base_garment',
    visual_profile_ref: 'first_playable_visual_profile_base_shirt'
  },
  {
    slot_id: 'wool-outer-garment', display_name: 'верхняя шерстяная одежда',
    template_id: 'item_tpl_nov_wool_outer_garment_v1', category_id: 'cat_item_object_wool_outer_garment_v1',
    quantity_profile_id: 'quantity_item_tpl_nov_wool_outer_garment_v1_count_v5',
    quantity_candidates: [{ quantity: 1, unit_id: 'piece' }], equipment_role: 'worn_clothing',
    physical_position: 'equipped', equipment_slot_category_id: 'outer_garment',
    visual_profile_ref: 'first_playable_visual_profile_outer_ochre'
  }
);
const firstPlayableScenario = await readJson(`${firstPlayableV1Root}/scenario.json`);
firstPlayableScenario.version = 2;
firstPlayableScenario.content_catalog_ref = 'lower_dvina_first_playable_content_v2@2';
const firstPlayableCatalogDigest = await writeJson(`${firstPlayableV2Root}/catalog.json`, firstPlayableCatalog);
const firstPlayableScenarioDigest = await writeJson(`${firstPlayableV2Root}/scenario.json`, firstPlayableScenario);
const firstPlayableManifestV1 = await readJson(`${firstPlayableV1Root}/manifest.json`);
const firstPlayableSourceEvidence = await Promise.all(
  firstPlayableManifestV1.source_evidence.map(async (source) => ({
    ...structuredClone(source),
    sha256: await rawDigest(source.path)
  }))
);
const firstPlayableManifest = {
  ...structuredClone(firstPlayableManifestV1),
  catalog_id: 'lower_dvina_first_playable_content_v2',
  catalog_version: 2,
  scenario_version: 2,
  source_evidence: firstPlayableSourceEvidence,
  candidate_sets: Object.fromEntries(Object.entries(firstPlayableCatalog.character_candidate_sets)
    .map(([id, set]) => [id, {
      compatible_tuple_count: firstPlayableManifestV1.candidate_sets[id].compatible_tuple_count,
      digest: canonicalDigest(set)
    }])),
  canonical_digest: canonicalDigest({
    catalog_digest: firstPlayableCatalogDigest,
    scenario_digest: firstPlayableScenarioDigest,
    predecessor_digest: firstPlayableManifestV1.canonical_digest
  }),
  supersedes_ref: {
    path: `${firstPlayableV1Root}/manifest.json`,
    id: firstPlayableManifestV1.catalog_id,
    revision: 1,
    schema: firstPlayableManifestV1.schema,
    digest: await rawDigest(`${firstPlayableV1Root}/manifest.json`)
  }
};
await writeJson(`${firstPlayableV2Root}/manifest.json`, firstPlayableManifest);

const worldV3ManifestPath = 'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v3/manifest.json';
const worldV4Root = 'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4';
const worldRevisionId = 'novgorod_spatial_v3_production_v4_candidate_001';
const worldV3Manifest = await readJson(worldV3ManifestPath);
const categoryRows = [];
const categoryIds = new Set();
function category(id, domain, facet, label) {
  if (categoryIds.has(id)) return id;
  categoryIds.add(id);
  categoryRows.push({
    id, domain, parent_category_id: null, stable_code: id, facet,
    preferred_label: label,
    definition: `Approved ${label} component for actor appearance or visible garment semantics.`,
    scope_note: 'Closed component vocabulary for Novgorod 1200-1250 materialization.',
    inclusion_rules: 'Use only through an approved regional option or exact item-template binding.',
    exclusion_rules: 'No semantic fallback, inference, or renderer-side selection.',
    replaced_by_category_id: null, title: label, status: 'approved'
  });
  return id;
}
const optionRows = entries.map((entry) => ({
  id: entry.entry_id,
  world_revision_id: worldRevisionId,
  region_id: 'region_novgorod_land',
  category_id: category(`actor.${entry.facet}.${entry.option_value}`,
    'actor_appearance', entry.facet, `${entry.facet}:${entry.option_value}`),
  valid_from: '1200-01-01', valid_to: '1250-12-31',
  weight: entry.weight, applicability: entry.applicability ?? {}, status: 'approved'
}));
const demographicProfileId = 'novgorod_1200_1250_demographic_profile_v1';
const appearanceProfileId = 'novgorod_1200_1250_appearance_profile_v1';
const demographicRows = [{
  id: demographicProfileId, region_id: 'region_novgorod_land',
  demographic_option_id: null, minimum_age: null, maximum_age: null,
  weight: 1, status: 'approved'
}];
const appearanceRows = [{
  id: appearanceProfileId, region_id: 'region_novgorod_land',
  appearance_option_id: null, weight: 1, status: 'approved'
}];
const demographicEntryRows = entries.filter(({ facet }) =>
  ['sex_category', 'age_category'].includes(facet)).map((entry) => ({
  id: `${demographicProfileId}:${entry.entry_id}`,
  demographic_profile_id: demographicProfileId, facet: entry.facet,
  option_id: entry.entry_id, weight: 1, applicability: entry.applicability ?? {}, status: 'approved'
}));
const appearanceEntryRows = entries.filter(({ facet }) =>
  !['sex_category', 'age_category'].includes(facet)).map((entry) => ({
  id: `${appearanceProfileId}:${entry.entry_id}`,
  appearance_profile_id: appearanceProfileId, facet: entry.facet,
  option_id: entry.entry_id, weight: 1, applicability: entry.applicability ?? {}, status: 'approved'
}));
const garmentProfiles = [
  ['item_tpl_nov_linen_shirt_v1', visual.base],
  ['item_tpl_nov_wool_outer_garment_v1', visual.outer('brown')]
];
const garmentBindingRows = garmentProfiles.flatMap(([templateId, snapshot]) =>
  Object.entries(snapshot)
    .filter(([kind]) => !['schema', 'version'].includes(kind))
    .map(([kind, value]) => {
    const bindingKind = kind === 'equipment_slot' ? 'equipment_slot'
      : kind === 'sleeve_form' ? 'sleeve_form'
        : kind;
    const categoryId = category(`garment.${bindingKind}.${value}`,
      'garment_visual_semantics', bindingKind, `${bindingKind}:${value}`);
    return {
      id: `${templateId}:${bindingKind}`,
      item_template_id: templateId,
      category_id: categoryId,
      binding_kind: bindingKind,
      packing_slot_cost: null,
      packing_bundle_size: null,
      exclusivity_group: null,
      requires_regional_permission: false,
      status: 'approved'
    };
    }));
const provenanceRows = [{
  id: 'prov_character_appearance_v1',
  title: 'Canonical character appearance and equipment-driven portrait authoring',
  source_type: 'project_note',
  summary: 'Approved bounded actor components and item-owned visible garment semantics.',
  reliability_level: 'project_canonical',
  status: 'approved',
  confidence: 'high'
}];
const worldDatasets = new Map([
  ['source_records', provenanceRows],
  ['universal_categories', categoryRows],
  ['region_category_options', optionRows],
  ['region_demographic_profiles', demographicRows],
  ['region_demographic_profile_entries', demographicEntryRows],
  ['region_appearance_profiles', appearanceRows],
  ['region_appearance_profile_entries', appearanceEntryRows],
  ['item_template_category_bindings', garmentBindingRows]
]);
const preEntries = [];
for (const [table, rows] of worldDatasets) {
  const file = `datasets/${table}.json`;
  const digestValue = await writeJson(`${worldV4Root}/${file}`, rows);
  preEntries.push({ table, file, sha256: digestValue });
}
const worldCatalogDigest = canonicalDigest(preEntries);
const worldRevisionRows = [{
  id: worldRevisionId,
  parent_revision_id: worldV3Manifest.world_revision_id,
  title: 'Novgorod Spatial-v3 production v4 canonical actor appearance successor',
  effective_from: '1230-01-01', effective_to: '1250-12-31',
  catalog_digest: worldCatalogDigest, status: 'approved'
}];
const spatialWorldRevisionRows = [{
  id: worldRevisionId,
  parent_revision_id: worldV3Manifest.world_revision_id,
  catalog_digest: worldCatalogDigest,
  status: 'approved',
  provenance_ref: 'prov_character_appearance_v1',
  deprecated_at: null
}];
for (const [table, rows] of [
  ['world_revisions', worldRevisionRows],
  ['spatial_v3_world_revisions', spatialWorldRevisionRows]
]) {
  const file = `datasets/${table}.json`;
  preEntries.push({ table, file, sha256: await writeJson(`${worldV4Root}/${file}`, rows) });
}
const dependencies = {
  source_records: [],
  universal_categories: [],
  region_category_options: ['world_revisions', 'universal_categories'],
  region_demographic_profiles: ['region_category_options'],
  region_demographic_profile_entries: ['region_demographic_profiles', 'region_category_options'],
  region_appearance_profiles: ['region_category_options'],
  region_appearance_profile_entries: ['region_appearance_profiles', 'region_category_options'],
  item_template_category_bindings: ['universal_categories'],
  world_revisions: [],
  spatial_v3_world_revisions: ['world_revisions', 'source_records']
};
const worldManifest = {
  schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v2',
  bundle_id: 'novgorod-spatial-v3-production-v4-candidate-001',
  release_id: 'spatial-v3-production-v4',
  world_revision_id: worldRevisionId,
  parent_revision_id: worldV3Manifest.world_revision_id,
  parent_manifest_path: worldV3ManifestPath,
  parent_manifest_sha256: await rawDigest(worldV3ManifestPath),
  status: 'approved', release_status: 'validated_candidate_not_active',
  production_activation: false, canonical_head_changed: false,
  operator_db_touched: false, runtime_selectable_in_canonical_production: false,
  boundary_crossing_capability: worldV3Manifest.boundary_crossing_capability,
  actor_appearance_capability: 'ready_for_runtime_acceptance',
  delete_policy: 'forbid', compiler_version: 'character-appearance-v1-compiler@1',
  approved_authoring_content_digest: canonicalDigest({ entries, garmentBindingRows }),
  catalog_digest: worldCatalogDigest,
  datasets: preEntries.map((entry) => ({
    ...entry, status: 'approved', delete_policy: 'forbid',
    depends_on: dependencies[entry.table]
  }))
};
worldManifest.canonical_output_digest = canonicalDigest(worldManifest);
const worldManifestDigest = await writeJson(`${worldV4Root}/manifest.json`, worldManifest);

const phase1aV15ManifestPath = `${scenarioRoot}/phase-1a-v15/manifest.json`;
const phase1aV15Digest = await rawDigest(phase1aV15ManifestPath);
const phase1bV13Path = `${scenarioRoot}/phase-1b-v13`;
const phase1bBindingV13 = await readJson(`${phase1bV13Path}/publication-binding.json`);
const phase1bBindingV14 = {
  ...structuredClone(phase1bBindingV13),
  binding_id: 'lower_dvina_trace_phase_1b_publication_v14',
  revision: 14,
  superseded_binding_ref: {
    path: `${phase1bV13Path}/publication-binding.json`,
    id: phase1bBindingV13.binding_id, revision: 13, schema: phase1bBindingV13.schema,
    digest: await rawDigest(`${phase1bV13Path}/publication-binding.json`)
  },
  phase_1a_manifest_ref: {
    path: phase1aV15ManifestPath, id: phase1aManifest.package_id,
    revision: 15, schema: phase1aManifest.schema, digest: phase1aV15Digest
  },
  scenario_definition_ref: {
    path: `${contentRoot}/definition.json`, id: 'lower_dvina_trace_v1',
    revision: 19, schema: definitionV19.schema, digest: definitionDigest
  },
  materializer_binding_id: bindings.binding_set_id,
  opening_projection: {
    ...structuredClone(phase1bBindingV13.opening_projection),
    projection_id: 'lower_dvina_trace_phase_1b_opening_projection_v13'
  },
  execution_identity: {
    ...structuredClone(phase1bBindingV13.execution_identity),
    scenario_definition_revision: 19,
    phase_1a_manifest_digest: phase1aV15Digest,
    scenario_definition_digest: definitionDigest
  },
  world_compatibility: {
    ...structuredClone(phase1bBindingV13.world_compatibility),
    production_world_revision_id: worldRevisionId,
    production_world_catalog_digest: worldCatalogDigest,
    lineage: [
      ...structuredClone(phase1bBindingV13.world_compatibility.lineage),
      {
        path: `${worldV4Root}/manifest.json`,
        world_revision_id: worldRevisionId,
        parent_revision_id: worldV3Manifest.world_revision_id,
        world_catalog_digest: worldCatalogDigest,
        status: 'approved', digest: worldManifestDigest
      }
    ]
  }
};
const phase1bV14Root = `${scenarioRoot}/phase-1b-v14`;
const phase1bBindingV14Digest = await writeJson(`${phase1bV14Root}/publication-binding.json`, phase1bBindingV14);
const phase1bManifestV13 = await readJson(`${phase1bV13Path}/manifest.json`);
const phase1bManifestV14 = {
  ...structuredClone(phase1bManifestV13),
  package_id: 'lower_dvina_trace_phase_1b_v14', revision: 14,
  superseded_package_ref: {
    path: `${phase1bV13Path}/manifest.json`, id: phase1bManifestV13.package_id,
    revision: 13, schema: phase1bManifestV13.schema,
    digest: await rawDigest(`${phase1bV13Path}/manifest.json`)
  },
  content_refs: {
    publication_binding: {
      path: `${phase1bV14Root}/publication-binding.json`,
      id: phase1bBindingV14.binding_id, revision: 14,
      schema: phase1bBindingV14.schema, digest: phase1bBindingV14Digest
    }
  }
};
const phase1bManifestV14Digest = await writeJson(`${phase1bV14Root}/manifest.json`, phase1bManifestV14);

console.log(JSON.stringify({
  world_revision_id: worldRevisionId,
  world_catalog_digest: worldCatalogDigest,
  world_manifest_digest: worldManifestDigest,
  phase_1b_manifest_digest: phase1bManifestV14Digest
}, null, 2));

function contentRef(path, id, revision, schema, digest) {
  return { path, id, revision, schema, digest };
}

console.log(JSON.stringify({ content_manifest_digest: contentManifestDigest, definition_digest: definitionDigest, phase_1a_revision: 15 }, null, 2));
