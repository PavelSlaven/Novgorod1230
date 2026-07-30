import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const PATHS = Object.freeze({
  manifest: `${ROOT}/phase-3-content/manifest.json`,
  definition: `${ROOT}/phase-3-content/definition.json`,
  knowledge_lie_memory_rules: `${ROOT}/phase-3-content/knowledge-lie-memory-rules.json`,
  npc_decision_schedule_policies: `${ROOT}/phase-3-content/npc-decision-schedule-policies.json`,
  activity_check_consequence_profiles:
    `${ROOT}/phase-3-content/activity-check-consequence-profiles.json`,
  phase_1a_manifest: `${ROOT}/phase-1a-v4/manifest.json`,
  materialization_bindings: `${ROOT}/phase-1a-v4/materialization-bindings.json`,
  previous_definition: `${ROOT}/phase-0d-v4/definition.json`,
  previous_knowledge_lie_memory_rules: `${ROOT}/phase-0c/knowledge-lie-memory-rules.json`,
  previous_npc_decision_schedule_policies: `${ROOT}/phase-0d/npc-decision-schedule-policies.json`,
  previous_activity_check_consequence_profiles:
    `${ROOT}/phase-0d/activity-check-consequence-profiles.json`,
  previous_phase_1a_manifest: `${ROOT}/phase-1a-v3/manifest.json`,
  previous_materialization_bindings: `${ROOT}/phase-1a-v3/materialization-bindings.json`,
  historical_phase_1b_manifest: `${ROOT}/phase-1b-v3/manifest.json`,
  historical_phase_1b_publication_binding: `${ROOT}/phase-1b-v3/publication-binding.json`,
  participant_profile_set: `${ROOT}/phase-0b/participant-profile-set.json`,
  location_topology_set: `${ROOT}/phase-0b/location-topology-set.json`,
  location_access_policies: `${ROOT}/phase-0d/location-access-policies.json`,
  location_capacity_contracts: `${ROOT}/phase-0d/location-capacity-contracts.json`,
  movement_bindings: `${ROOT}/phase-0d/movement-bindings.json`,
  boatman_scenario: 'data/world-catalogs/novgorod/first-playable-v1/scenario.json',
  boatman_manifest: 'data/world-catalogs/novgorod/first-playable-v1/manifest.json'
});

const EXPECTED = Object.freeze({
  previous_definition: '1591b10d19deb48393b42fd4d84ad5c770ab8cdc153af2f94a4d7c749383f729',
  previous_knowledge_lie_memory_rules:
    '6c296a6ebe096633ae58c9ff45dc4a44f92ce56d7843e10bc3133718e6155046',
  previous_npc_decision_schedule_policies:
    'd37ba0f3c22b248304ce108e20067f39e9c5bfd8bdae1b03350e270d51ad50ca',
  previous_activity_check_consequence_profiles:
    '5eefc71c6a73c1604f606d1f84862cf5f6d7a774a957f10ad9ead7e950717654',
  previous_phase_1a_manifest:
    '6f115e878a663b6aacb654bf7fe86b651467e1da06161907faac06770d4a9925',
  previous_materialization_bindings:
    'f929b61aa1e5dcb6e6163837373b3d4ab1431ed786d32e262a019a362a3f51dd',
  historical_phase_1b_manifest:
    'aee59570994151f9177445d03ae8a4dcf29c098f2ffb7c7a198c8c43406818eb',
  historical_phase_1b_publication_binding:
    'c5b6aa615c21ac351bbc2d1cbe6774337017f71213205858b4fdedb960a55b45',
  boatman_scenario: '50f00903cad0075edabd24bd69c9eaa6d88ee967a19eabb69de7c23c1898598f',
  boatman_manifest: '0ce7b06b6a3706810976bc0dd7ac20695cb502594bf8e200b4e6d67e3e2162cb'
});

const EVASION_WRITES = Object.freeze([
  'statement_record',
  'speaker_memory_record',
  'player_journal_entry',
  'npc_decision_history'
]);
const DISCLOSURE_WRITES = Object.freeze([
  'statement_record',
  'speaker_memory_record',
  'player_journal_entry',
  'audience_knowledge_proposal',
  'route_knowledge_disclosure',
  'npc_decision_history'
]);

export async function loadLowerDvinaTracePhase3Content({
  rootDir = process.cwd()
} = {}) {
  const entries = await Promise.all(
    Object.entries(PATHS).map(async ([key, path]) => {
      const raw = await readFile(resolve(rootDir, path));
      return [key, JSON.parse(raw.toString('utf8')), sha256(raw)];
    })
  );
  const result = { raw_digests: {}, paths: structuredClone(PATHS) };
  for (const [key, value, digest] of entries) {
    result[key] = value;
    result.raw_digests[key] = digest;
  }
  return result;
}

export function validateLowerDvinaTracePhase3Content(bundle) {
  validateSupersedes(bundle);
  validateCampBinding(bundle);
  validateParticipantPlacements(bundle);
  validateInteractionMappings(bundle);
  validateActivityCheckConsequenceProfiles(bundle);
  validateNpcExecutionBindings(bundle);
  validateDefinitionsAndManifests(bundle);
  validateImmutableDigests(bundle);
  return Object.freeze({
    pass: true,
    scenario_definition_revision: 8,
    phase_1a_revision: 4
  });
}

function validateSupersedes(bundle) {
  const manifest = bundle.manifest;
  const knowledge = bundle.knowledge_lie_memory_rules;
  const npc = bundle.npc_decision_schedule_policies;
  const bindings = bundle.materialization_bindings;
  if (!exactRef(
    manifest?.superseded_definition_ref,
    PATHS.previous_definition,
    'lower_dvina_trace_v1',
    7,
    'rus.trace_scenario_definition.v1',
    EXPECTED.previous_definition
  )
    || !exactRef(
      manifest?.superseded_content_refs?.knowledge_lie_memory_rules,
      PATHS.previous_knowledge_lie_memory_rules,
      'trace_ld_v1_knowledge_lie_memory_rules',
      1,
      'rus.trace_knowledge_lie_memory_rules.v1',
      EXPECTED.previous_knowledge_lie_memory_rules
    )
    || !exactRef(
      manifest?.superseded_content_refs?.npc_decision_schedule_policies,
      PATHS.previous_npc_decision_schedule_policies,
      'trace_ld_v1_npc_decision_schedule_policies',
      1,
      'rus.trace_npc_decision_schedule_policies.v1',
      EXPECTED.previous_npc_decision_schedule_policies
    )
    || !exactRef(
      manifest?.superseded_content_refs?.activity_check_consequence_profiles,
      PATHS.previous_activity_check_consequence_profiles,
      'trace_ld_v1_activity_check_consequence_profiles',
      1,
      'rus.trace_activity_check_consequence_profiles.v1',
      EXPECTED.previous_activity_check_consequence_profiles
    )
    || !exactRef(
      knowledge?.supersedes_ref,
      PATHS.previous_knowledge_lie_memory_rules,
      'trace_ld_v1_knowledge_lie_memory_rules',
      1,
      'rus.trace_knowledge_lie_memory_rules.v1',
      EXPECTED.previous_knowledge_lie_memory_rules
    )
    || !exactRef(
      npc?.supersedes_ref,
      PATHS.previous_npc_decision_schedule_policies,
      'trace_ld_v1_npc_decision_schedule_policies',
      1,
      'rus.trace_npc_decision_schedule_policies.v1',
      EXPECTED.previous_npc_decision_schedule_policies
    )
    || !exactRef(
      bundle.activity_check_consequence_profiles?.supersedes_ref,
      PATHS.previous_activity_check_consequence_profiles,
      'trace_ld_v1_activity_check_consequence_profiles',
      1,
      'rus.trace_activity_check_consequence_profiles.v1',
      EXPECTED.previous_activity_check_consequence_profiles
    )
    || !exactRef(
      bindings?.superseded_binding_ref,
      PATHS.previous_materialization_bindings,
      'lower_dvina_trace_phase_1a_materialization_bindings_v3',
      3,
      'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
      EXPECTED.previous_materialization_bindings
    )) {
    fail('TRACE_PHASE_3_SUPERSEDES_MISMATCH', 'Phase 3 must exact-supersede the immutable current chain.');
  }
}

function validateCampBinding(bundle) {
  const binding = bundle.materialization_bindings?.camp_spatial_binding;
  const anchor = binding?.anchor_template;
  const locations = bundle.location_topology_set?.location_profiles
    ?.filter((value) => value.location_profile_id === 'trace_ld_v1_loc_fishing_camp');
  const access = bundle.location_access_policies?.access_policies
    ?.filter((value) => value.policy_id === 'trace_ld_v1_access_fishing_camp');
  const capacities = bundle.location_capacity_contracts?.capacity_contracts
    ?.filter((value) => value.contract_id === 'trace_ld_v1_capacity_fishing_camp');
  const zone = capacities?.[0]?.zones?.filter((value) => value.zone_id === 'working_camp');
  const route = bundle.movement_bindings?.route_bindings
    ?.filter((value) => value.route_id === 'trace_ld_v1_route_wreck_to_camp');
  const candidate = locations?.[0]?.spatial_candidate_set?.candidates?.[0];
  if (locations?.length !== 1 || access?.length !== 1 || capacities?.length !== 1
    || zone?.length !== 1 || route?.length !== 1
    || locations[0].region_ref !== 'gn_nov_g1_xp017_yp026'
    || candidate?.g3_node_ref?.id !==
      'gn_nov_g3_xp017_yp026_r2_vikhtuy_river_approach'
    || candidate?.g4_node_ref?.id !==
      'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_river_approach'
    || binding.location_profile_ref !== locations[0].location_profile_id
    || binding.node_template_ref !== locations[0].scene_template_ref
    || binding.node_slot_ref !== locations[0].location_profile_id
    || binding.entry_route_ref !== route[0].route_id
    || binding.entry_endpoint_ref !== route[0].destination_endpoint
    || anchor?.template_id !== 'trace_ld_v1_g5_anchor_fishing_camp_working_camp_v1'
    || anchor.slot_key !== zone[0].zone_id
    || anchor.npc_capacity !== zone[0].max_actors
    || !Number.isInteger(anchor.item_capacity) || anchor.item_capacity < 0
    || !Number.isInteger(anchor.container_capacity) || anchor.container_capacity < 0
    || anchor.state?.access_policy_ref !== access[0].policy_id
    || anchor.state?.capacity_contract_ref !== capacities[0].contract_id
    || anchor.state?.zone_ref !== zone[0].zone_id) {
    fail('TRACE_PHASE_3_CAMP_BINDING_INVALID', 'The camp G5/anchor binding is incomplete or incompatible.');
  }
}

function validateParticipantPlacements(bundle) {
  const placements = bundle.materialization_bindings?.initial_participant_placements;
  const participantSlots = new Set(bundle.participant_profile_set?.participant_slots);
  const expected = new Map([
    ['eremey_fisher', 'scene'],
    ['background_fisher_1', 'background'],
    ['background_fisher_2', 'background']
  ]);
  if (!Array.isArray(placements) || placements.length !== expected.size
    || new Set(placements.map((value) => value.instance_key)).size !== expected.size
    || new Set(placements.map((value) => value.participant_slot_ref)).size !== expected.size
    || placements.some((value) => (
      !expected.has(value.participant_slot_ref)
      || !participantSlots.has(value.participant_slot_ref)
      || value.instance_key !== value.participant_slot_ref
      || value.location_profile_ref !== 'trace_ld_v1_loc_fishing_camp'
      || value.anchor_template_ref !==
        bundle.materialization_bindings.camp_spatial_binding.anchor_template.template_id
      || value.zone_ref !== 'working_camp'
      || value.materialization_depth !== expected.get(value.participant_slot_ref)
      || value.profile_binding_source !== 'sealed_participant_selection'
      || value.instance_identity_policy !== 'deterministic_party_run_slot'
    ))) {
    fail('TRACE_PHASE_3_PARTICIPANT_PLACEMENT_INVALID', 'Initial participant placements must bind exactly three sealed slots.');
  }
}

function validateInteractionMappings(bundle) {
  const rules = bundle.knowledge_lie_memory_rules;
  const mappings = rules?.interaction_persistence_mappings;
  const statements = new Set(rules?.statement_templates?.map((value) => value.statement_template_id));
  const memories = new Set(rules?.memory_records?.map((value) => value.memory_template_id));
  const journals = new Set(rules?.player_facing_text_records?.map((value) => value.journal_template_id));
  if (rules?.knowledge_lie_memory_rules_id !== 'trace_ld_v1_knowledge_lie_memory_rules'
    || rules.revision !== 2 || !Array.isArray(mappings) || mappings.length !== 2) {
    fail('TRACE_PHASE_3_INTERACTION_MAPPING_INVALID', 'Exactly two versioned Eremey mappings are required.');
  }
  const byStatement = new Map(mappings.map((value) => [value.statement_template_ref, value]));
  const evasion = byStatement.get('trace_ld_v1_statement_eremey_first_answer');
  const disclosure = byStatement.get('trace_ld_v1_statement_eremey_disclosure');
  for (const mapping of [evasion, disclosure]) {
    if (!mapping || !statements.has(mapping.statement_template_ref)
      || mapping.speaker_ref !== 'eremey_fisher'
      || !sameSet(mapping.audience_refs, ['player_clerk'])
      || mapping.timestamp_projection?.source_record !== 'committed_activity'
      || mapping.timestamp_projection?.source_field !== 'game_timestamp'
      || mapping.timestamp_projection?.write_policy !== 'copy_exact_committed_value'
      || mapping.timestamp_projection?.clock_write !== 'forbidden'
      || mapping.statement_projection?.write_target !== 'statement_record'
      || mapping.statement_projection?.objective_truth_projection !== 'forbidden'
      || mapping.speaker_memory_projection?.write_target !== 'speaker_memory_record'
      || mapping.speaker_memory_projection?.remembering_participant_ref !== 'eremey_fisher'
      || !memories.has(mapping.speaker_memory_projection?.template_ref)
      || mapping.player_journal_projection?.write_target !== 'player_journal_entry'
      || mapping.player_journal_projection?.remembering_participant_ref !== 'player_clerk'
      || !journals.has(mapping.player_journal_projection?.template_ref)
      || !mapping.forbidden_outputs?.includes('objective_world_fact')) {
      fail('TRACE_PHASE_3_INTERACTION_MAPPING_INVALID', 'Statement, memory and journal projections must resolve exactly.');
    }
  }
  if (evasion.route_knowledge_disclosure != null
    || evasion.audience_knowledge_proposal != null
    || evasion.evidence_input != null) {
    fail('TRACE_PHASE_3_EVASION_DISCLOSURE_FORBIDDEN', 'Evasion cannot disclose a route, evidence or new knowledge.');
  }
  const routeIds = new Set(bundle.movement_bindings.route_bindings.map((value) => value.route_id));
  if (disclosure.route_knowledge_disclosure?.route_ref !== 'trace_ld_v1_route_camp_to_shed'
    || disclosure.route_knowledge_disclosure?.movement !== 'forbidden'
    || !routeIds.has(disclosure.route_knowledge_disclosure.route_ref)
    || disclosure.evidence_input?.evidence_ref !== 'trace_ld_v1_evidence_blue_wool'
    || disclosure.evidence_input?.admission !== 'committed_discovered_and_player_accessible_only'
    || disclosure.evidence_input?.raw_text_claim_is_evidence !== false) {
    fail('TRACE_PHASE_3_DISCLOSURE_ROUTE_INVALID', 'Disclosure must use the approved route and committed evidence only.');
  }
}

function validateActivityCheckConsequenceProfiles(bundle) {
  const profiles = bundle.activity_check_consequence_profiles;
  const consequence = profiles?.consequence_profiles?.filter(
    (value) => value.consequence_id === 'trace_ld_v1_consequence_eremey_remains_guarded'
  );
  const check = profiles?.check_profiles?.filter(
    (value) => value.check_id === 'trace_ld_v1_check_eremey_cooperation'
  );
  const firstTalk = profiles?.activity_profiles?.filter(
    (value) => value.profile_id === 'trace_ld_v1_activity_first_eremey_talk'
  );
  const evidenceTalk = profiles?.activity_profiles?.filter(
    (value) => value.profile_id === 'trace_ld_v1_activity_eremey_with_evidence'
  );
  if (profiles?.schema !== 'rus.trace_activity_check_consequence_profiles.v1'
    || profiles.set_id !== 'trace_ld_v1_activity_check_consequence_profiles'
    || profiles.revision !== 2
    || consequence?.length !== 1
    || !sameSet(consequence[0].write_target_classes, ['activity_history'])
    || consequence[0].write_target_classes.includes('relationship_delta_proposal')
    || !consequence[0].forbidden_write_targets?.includes('completion_state')
    || check?.length !== 1
    || check[0].outcome_refs?.failure !==
      'trace_ld_v1_consequence_eremey_remains_guarded'
    || firstTalk?.length !== 1
    || !sameSet(firstTalk[0].write_target_classes, ['perception_report'])
    || evidenceTalk?.length !== 1
    || !sameSet(
      evidenceTalk[0].write_target_classes,
      ['npc_decision_admission', 'activity_history']
    )) {
    fail(
      'TRACE_PHASE_3_EREMEY_RELATIONSHIP_RULE_MISSING',
      'Eremey guarded failure must persist activity history without an unapproved relationship delta.'
    );
  }
}

function validateNpcExecutionBindings(bundle) {
  const policies = bundle.npc_decision_schedule_policies;
  const bindings = policies?.decision_execution_bindings ?? [];
  const effects = policies?.statement_effect_contracts ?? [];
  if (policies?.set_id !== 'trace_ld_v1_npc_decision_schedule_policies'
    || policies.revision !== 2) {
    fail('TRACE_PHASE_3_NPC_POLICY_INVALID', 'NPC policy revision 2 is required.');
  }
  const evasion = bindings.find((value) => value.option_id === 'evade_and_withhold');
  const disclosure = bindings.find((value) => value.option_id === 'bounded_disclosure');
  const evasionEffect = effects.find((value) => (
    value.statement_effect_contract_id === 'trace_ld_v1_statement_effect_eremey_evasion'
  ));
  const disclosureEffect = effects.find((value) => (
    value.statement_effect_contract_id === 'trace_ld_v1_statement_effect_eremey_disclosure'
  ));
  if ([...(evasion?.write_targets ?? []), ...(disclosure?.write_targets ?? []),
    ...(evasionEffect?.write_targets ?? []), ...(disclosureEffect?.write_targets ?? [])]
    .includes('relationship_delta_proposal')) {
    fail('TRACE_PHASE_3_RELATIONSHIP_RULE_MISSING', 'Relationship writes require a separate approved transition record.');
  }
  if (!evasion || !disclosure || !evasionEffect || !disclosureEffect
    || evasion.interaction_persistence_mapping_ref !==
      'trace_ld_v1_mapping_eremey_first_answer_v1'
    || disclosure.interaction_persistence_mapping_ref !==
      'trace_ld_v1_mapping_eremey_disclosure_v1'
    || !sameSet(evasion.write_targets, EVASION_WRITES)
    || !sameSet(disclosure.write_targets, DISCLOSURE_WRITES)
    || !sameSet(evasionEffect.write_targets, EVASION_WRITES.filter((value) => value !== 'npc_decision_history'))
    || !sameSet(disclosureEffect.write_targets, DISCLOSURE_WRITES.filter((value) => value !== 'npc_decision_history'))) {
    fail('TRACE_PHASE_3_NPC_POLICY_INVALID', 'Eremey execution bindings must resolve the approved common write targets.');
  }
}

function validateDefinitionsAndManifests(bundle) {
  const manifest = bundle.manifest;
  const definition = bundle.definition;
  const phase1A = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  if (manifest?.schema !== 'rus.lower_dvina_trace_phase_3_content_manifest.v1'
    || manifest.package_id !== 'lower_dvina_trace_phase_3_content_v1'
    || manifest.revision !== 1 || manifest.scenario_definition_revision !== 8
    || manifest.status !== 'approved' || manifest.publication_status !== 'internal_only'
    || ['fallback_policy', 'normalization_policy', 'alias_policy']
      .some((key) => manifest[key] !== 'forbidden')
    || definition?.scenario_id !== 'lower_dvina_trace_v1' || definition.revision !== 8
    || definition.required_unresolved_refs?.length !== 0
    || definition.immutable_content_refs?.knowledge_lie_memory_rules?.revision !== 2
    || definition.immutable_content_refs.knowledge_lie_memory_rules.digest !==
      bundle.raw_digests.knowledge_lie_memory_rules
    || definition.resolved_policy_refs?.npc_decision_schedule_policies?.revision !== 2
    || definition.resolved_policy_refs.npc_decision_schedule_policies.digest !==
      bundle.raw_digests.npc_decision_schedule_policies
    || definition.resolved_policy_refs?.activity_check_consequence_profiles?.revision !== 2
    || definition.resolved_policy_refs.activity_check_consequence_profiles.digest !==
      bundle.raw_digests.activity_check_consequence_profiles
    || phase1A?.package_id !== 'lower_dvina_trace_phase_1a_v4'
    || phase1A.revision !== 4 || phase1A.scenario_definition_revision !== 8
    || phase1A.base_definition_ref?.path !== PATHS.manifest
    || phase1A.base_definition_ref?.digest !== bundle.raw_digests.manifest
    || phase1A.base_definition_ref?.package_id !== manifest.package_id
    || bindings?.binding_set_id !== 'lower_dvina_trace_phase_1a_materialization_bindings_v4'
    || bindings.revision !== 4 || bindings.scenario_definition_revision !== 8
    || phase1A.content_refs?.materialization_bindings?.path !== PATHS.materialization_bindings
    || phase1A.content_refs.materialization_bindings.digest !==
      bundle.raw_digests.materialization_bindings) {
    fail('TRACE_PHASE_3_MANIFEST_INVALID', 'Phase 3 definition and Phase 1A revision 4 are not exact.');
  }
}

function validateImmutableDigests(bundle) {
  for (const [key, digest] of Object.entries(EXPECTED)) {
    if (bundle.raw_digests?.[key] !== digest) {
      fail('TRACE_PHASE_3_IMMUTABLE_DEPENDENCY_CHANGED', `Immutable dependency ${key} changed.`);
    }
  }
  for (const [key, manifestKey, id, schema] of [
    ['participant_profile_set', 'participant_profile_set',
      'trace_ld_v1_participant_profile_set', 'rus.trace_participant_profile_set.v1'],
    ['location_topology_set', 'location_topology_set',
      'trace_ld_v1_location_topology_set', 'rus.trace_location_topology_set.v1'],
    ['location_access_policies', 'location_access_policies',
      'trace_ld_v1_location_access_policies', 'rus.trace_scene_access_policy_set.v1'],
    ['location_capacity_contracts', 'location_capacity_contracts',
      'trace_ld_v1_location_capacity_contracts', 'rus.trace_scene_capacity_contract_set.v1'],
    ['movement_bindings', 'movement_bindings',
      'trace_ld_v1_movement_bindings', 'rus.trace_movement_bindings.v1']
  ]) {
    const ref = bundle.manifest?.reused_content_refs?.[manifestKey];
    if (ref?.path !== PATHS[key] || ref.id !== id || ref.revision !== 1
      || ref.schema !== schema || ref.digest !== bundle.raw_digests?.[key]) {
      fail(
        'TRACE_PHASE_3_REUSED_CONTENT_MISMATCH',
        `Reused immutable content mismatch for ${manifestKey}.`
      );
    }
  }
  for (const [key, filename] of [
    ['definition', 'definition.json'],
    ['knowledge_lie_memory_rules', 'knowledge-lie-memory-rules.json'],
    ['activity_check_consequence_profiles', 'activity-check-consequence-profiles.json'],
    ['npc_decision_schedule_policies', 'npc-decision-schedule-policies.json']
  ]) {
    const ref = bundle.manifest?.content_refs?.[key];
    if (ref?.path !== filename || ref.digest !== bundle.raw_digests?.[key]
      || bundle.manifest?.files?.[filename] !== bundle.raw_digests?.[key]) {
      fail('TRACE_PHASE_3_CONTENT_DIGEST_MISMATCH', `Content digest mismatch for ${key}.`);
    }
  }
  const lines = Object.entries(bundle.manifest.files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, digest]) => `${name}:${digest}`)
    .join('\n') + '\n';
  if (bundle.manifest.content_digest_algorithm !==
      'sha256_sorted_filename_colon_digest_lf_v1'
    || bundle.manifest.content_digest !== sha256(lines)
    || bundle.phase_1a_manifest.content_refs.materialization_bindings.digest !==
      bundle.raw_digests.materialization_bindings) {
    fail('TRACE_PHASE_3_CONTENT_DIGEST_MISMATCH', 'Package root or Phase 1A binding digest mismatch.');
  }
}

function exactRef(ref, path, id, revision, schema, digest) {
  return ref?.path === path && ref.id === id && ref.revision === revision
    && ref.schema === schema && ref.digest === digest;
}

function sameSet(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && expected.every((value) => actual.includes(value))
    && new Set(actual).size === actual.length;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const bundle = await loadLowerDvinaTracePhase3Content();
    const result = validateLowerDvinaTracePhase3Content(bundle);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      pass: false,
      code: error.code ?? 'TRACE_PHASE_3_CONTENT_INVALID',
      message: error.message
    })}\n`);
    process.exitCode = 1;
  }
}
