import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { validatePropertyRelation } from '@rus/items-property';

const source = resolve('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d');
const checker = resolve('tools/world-catalog-workflow/src/lower-dvina-trace-phase-0d-check.mjs');
const files = [
  'definition.json',
  'activity-check-consequence-profiles.json',
  'npc-decision-schedule-policies.json',
  'movement-bindings.json',
  'location-access-policies.json',
  'location-capacity-contracts.json',
  'body-environment-profiles.json',
  'promise-policy.json',
  'completion-rules.json',
  'epilogue-rules.json'
];
const contentKeys = {
  'definition.json': 'definition',
  'activity-check-consequence-profiles.json': 'activity_check_consequence_profiles',
  'npc-decision-schedule-policies.json': 'npc_decision_schedule_policies',
  'movement-bindings.json': 'movement_bindings',
  'location-access-policies.json': 'location_access_policies',
  'location-capacity-contracts.json': 'location_capacity_contracts',
  'body-environment-profiles.json': 'body_environment_profiles',
  'promise-policy.json': 'promise_policy',
  'completion-rules.json': 'completion_rules',
  'epilogue-rules.json': 'epilogue_rules'
};
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = (directory, name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const writeJson = (directory, name, value) => writeFileSync(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`);
const runChecker = (directory = source, validationOnly = directory !== source) => spawnSync(
  process.execPath,
  [checker, ...(validationOnly ? ['--validation-only', '--directory', directory] : [])],
  { encoding: 'utf8' }
);
const refreshDigests = (directory) => {
  const definition = readJson(directory, 'definition.json');
  for (const [file, key] of Object.entries(contentKeys)) {
    if (file === 'definition.json') continue;
    definition.resolved_policy_refs[key].digest = digest(resolve(directory, file));
  }
  writeJson(directory, 'definition.json', definition);

  const manifest = readJson(directory, 'manifest.json');
  for (const file of files) {
    const value = digest(resolve(directory, file));
    manifest.files[file] = value;
    manifest.content_refs[contentKeys[file]].digest = value;
  }
  const aggregate = Object.entries(manifest.files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}`)
    .join('\n') + '\n';
  manifest.content_digest = createHash('sha256').update(aggregate).digest('hex');
  writeJson(directory, 'manifest.json', manifest);
};
const withFixture = (mutate, { refresh = true } = {}) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'trace-0d-'));
  cpSync(source, directory, { recursive: true });
  try {
    mutate(directory);
    if (refresh) refreshDigests(directory);
    return runChecker(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const mutateJson = (directory, name, mutate) => {
  const value = readJson(directory, name);
  mutate(value);
  writeJson(directory, name, value);
};
const assertRejected = (result, pattern) => {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(`${result.stderr}\n${result.stdout}`, pattern);
};

test('phase 0D canonical package validates all nine declarative categories', () => {
  const result = runChecker();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scenario_revision, 4);
  assert.equal(report.policy_category_count, 9);
  assert.equal(report.unresolved_count, 0);
});

test('danger retreat has one exact access, capacity, position, elapsed, consequence, and next-boundary path', () => {
  const activities = readJson(source, 'activity-check-consequence-profiles.json');
  const danger = activities.activity_profiles.find(
    ({ profile_id }) => profile_id === 'trace_ld_v1_activity_danger_resolution'
  );
  const branchCounts = danger.semantic_execution_branches.reduce((counts, branch) => {
    counts.set(branch.semantic_option_id, (counts.get(branch.semantic_option_id) ?? 0) + 1);
    return counts;
  }, new Map());
  assert.deepEqual(
    [...branchCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
    [
      ['coordinate_bounded_group_response', 1],
      ['retreat_from_threat', 1]
    ]
  );

  const retreat = danger.semantic_execution_branches.find(
    ({ semantic_option_id }) => semantic_option_id === 'retreat_from_threat'
  );
  assert.deepEqual(retreat.required_committed_facts, [
    'zhdanko_resistance_threat_committed',
    'danger_retreat_option_committed'
  ]);
  assert.equal(retreat.atomic_resolution_profile_ref, undefined);
  assert.deepEqual(retreat.position_transition, {
    actor_slot: 'player_clerk',
    location_ref: 'trace_ld_v1_loc_zhdanko_storehouse',
    source_zone_ref: 'narrow_threshold',
    destination_zone_ref: 'yard',
    access_policy_ref: 'trace_ld_v1_access_zhdanko_storehouse',
    capacity_contract_ref: 'trace_ld_v1_capacity_zhdanko_storehouse',
    position_write_owner: '@rus/party-store',
    position_write_owner_contract_ref: '@rus/party-store:logical_write_plan',
    clock_write: 'forbidden'
  });
  assert.equal(retreat.time_contract.root_time_profile_ref, 'trace_ld_v1_time_1m');
  assert.equal(retreat.time_contract.clock_write, 'single_if_branch_admitted_and_completed');
  assert.equal(retreat.time_contract.child_clock_write, 'forbidden');
  assert.equal(retreat.consequence_ref, 'trace_ld_v1_consequence_player_retreated_from_zhdanko_threat_to_yard');
  assert.deepEqual(retreat.preserved_property_state, [
    'trace_ld_v1_item_zhdanko_axe:holder=zhdanko_storehouse_controller',
    'trace_ld_v1_item_zhdanko_axe:controller=zhdanko_storehouse_controller'
  ]);
  assert.equal(retreat.forbidden_effect_classes.includes('body_harm'), true);
  assert.equal(retreat.forbidden_effect_classes.includes('item_disarm'), true);
  assert.equal(retreat.forbidden_effect_classes.includes('temporary_restraint'), true);
  assert.deepEqual(retreat.next_meaningful_boundary, {
    kind: 'npc_decision_recompute',
    required_committed_fact: 'player_retreated_from_zhdanko_threat_to_yard',
    decision_owner: '@rus/npc-runtime',
    npc_policy_ref: 'trace_ld_v1_npc_zhdanko_decisions',
    same_command_npc_execution: 'forbidden',
    world_continues: true
  });
});

test('revision 4 exact-supersedes revision 3 and remains unpublished without party selections', () => {
  const definition = readJson(source, 'definition.json');
  assert.equal(definition.supersedes_definition_ref.revision, 3);
  assert.equal(definition.readiness.phase_status, 'phase_0_complete');
  assert.equal(definition.readiness.materialization_status, 'definition_accepted_for_later_materialization');
  assert.equal(definition.readiness.publication_status, 'not_publishable');
  assert.deepEqual(definition.required_unresolved_refs, []);
  assert.deepEqual(definition.concrete_party_selections.npc_decisions, []);
  assert.equal(definition.concrete_party_selections.game_timestamp, null);
});

test('superseded definition ID is exact', () => {
  const result = withFixture((directory) => mutateJson(directory, 'definition.json', (value) => {
    value.supersedes_definition_ref.id = 'another_scenario';
  }));
  assertRejected(result, /TRACE_0D_DEFINITION_CHAIN/);
});

test('manifest requires each of the nine policy records', async (t) => {
  for (const key of Object.values(contentKeys).filter((key) => key !== 'definition')) {
    await t.test(key, () => {
      const result = withFixture((directory) => {
        mutateJson(directory, 'manifest.json', (manifest) => {
          delete manifest.content_refs[key];
        });
      }, { refresh: false });
      assertRejected(result, /TRACE_0D_CONTENT_REFS/);
    });
  }
});

test('schema, version and digest mismatches fail closed', async (t) => {
  await t.test('schema', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => { value.schema = 'rus.unknown.v1'; }));
    assertRejected(result, /TRACE_0D_CONTENT_REF|TRACE_0D_POLICY_IDENTITY/);
  });
  await t.test('version', () => {
    const result = withFixture((directory) => mutateJson(directory, 'promise-policy.json', (value) => { value.revision = 2; }));
    assertRejected(result, /TRACE_0D_CONTENT_REF|TRACE_0D_POLICY_REF/);
  });
  await t.test('digest', () => {
    const result = withFixture((directory) => mutateJson(directory, 'manifest.json', (value) => { value.files['completion-rules.json'] = '0'.repeat(64); }), { refresh: false });
    assertRejected(result, /TRACE_0D_DIGEST_MISMATCH/);
  });
  await t.test('dependency path', () => {
    const result = withFixture((directory) => mutateJson(directory, 'manifest.json', (value) => { value.immutable_dependency_refs.phase_0c_manifest.path = 'wrong.json'; }), { refresh: false });
    assertRejected(result, /TRACE_0D_DEPENDENCY_REF/);
  });
  await t.test('owner schema ref', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.owner_schema_ref.digest = '0'.repeat(64);
    }));
    assertRejected(result, /TRACE_0D_OWNER_SCHEMA_REF|TRACE_0D_OWNER_SCHEMA_DIGEST/);
  });
});

test('co-owner contracts are exact versioned dependencies rather than free strings', async (t) => {
  const activities = readJson(source, 'activity-check-consequence-profiles.json');
  assert.deepEqual(Object.keys(activities.co_owner_contract_refs).sort(), ['atomic_conflict_resolution', 'checks_rng', 'exact_time', 'property_transition_profile', 'scene_observation_projection']);
  assert.deepEqual(activities.co_owner_contract_refs.checks_rng.public_entrypoints, ['@rus/checks-rng:executeCheck']);
  assert.equal(activities.co_owner_contract_refs.exact_time.schema_id, 'rus.time_events_history.game_timestamp_and_elapsed.v1');
  assert.equal(activities.co_owner_contract_refs.atomic_conflict_resolution.schema_id, 'rus.combat_health.atomic_conflict_resolution_profile.v1');
  assert.equal(activities.co_owner_contract_refs.atomic_conflict_resolution.runtime_resolution_execution, 'deferred_to_first_use_integration');
  assert.equal(activities.co_owner_contract_refs.scene_observation_projection.schema_id, 'rus.visibility_knowledge_memory.committed_scene_observation.v1');
  assert.equal(activities.co_owner_contract_refs.scene_observation_projection.runtime_observation_execution, 'deferred_to_first_use_integration');
  const epilogue = readJson(source, 'epilogue-rules.json');
  assert.deepEqual(epilogue.co_owner_contract_refs.visible_only_narration.public_entrypoints, ['@rus/narration:runNarrationFlow']);
  const npc = readJson(source, 'npc-decision-schedule-policies.json');
  assert.equal(npc.co_owner_contract_refs.property_transition_profile.schema_id, 'rus.items_property.approved_transition_profile.v1');
  assert.equal(npc.co_owner_contract_refs.property_transition_profile.runtime_transition_execution, 'deferred_to_first_use_integration');
  assert.deepEqual(npc.co_owner_contract_refs.property_transition_profile.existing_support_entrypoints, [
    '@rus/items-property:validateInventoryTopology',
    '@rus/items-property:resolveInventoryAccess',
    '@rus/items-property:validatePropertyRelation',
    '@rus/items-property:planInventoryTransfer'
  ]);
  assert.equal(JSON.stringify(npc.co_owner_contract_refs).includes('createSpatialV3DomainMutationService'), false);
  assert.deepEqual(
    validatePropertyRelation({ item_id: 'item-1', relation_type: 'holder', subject_id: 'actor-1' }),
    { ok: true, errors: [] }
  );
  assert.equal(validatePropertyRelation({ relation_type: 'holder', subject_id: 'actor-1' }).ok, false);
  const partyStoreRegistry = JSON.parse(readFileSync(resolve('packages/party-store/src/declarative-content-contracts.v1.json'), 'utf8'));
  assert.equal(partyStoreRegistry.contracts.some(({ schema_id }) => schema_id.includes('property_transition')), false);

  await t.test('missing RNG ref', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      delete value.co_owner_contract_refs.checks_rng;
    }));
    assertRejected(result, /TRACE_0D_CO_OWNER_REF_SET/);
  });
  await t.test('atomic conflict owner ref missing', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      delete value.co_owner_contract_refs.atomic_conflict_resolution;
    }));
    assertRejected(result, /TRACE_0D_CO_OWNER_REF_SET/);
  });
  await t.test('combat-health immutable dependency removed', () => {
    const result = withFixture((directory) => mutateJson(directory, 'manifest.json', (value) => {
      delete value.immutable_dependency_refs.combat_health_declarative_contracts;
    }), { refresh: false });
    assertRejected(result, /TRACE_0D_DEPENDENCY_SET/);
  });
  await t.test('scene observation co-owner ref missing', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      delete value.co_owner_contract_refs.scene_observation_projection;
    }));
    assertRejected(result, /TRACE_0D_CO_OWNER_REF_SET/);
  });
  await t.test('incompatible time schema version', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => {
      value.co_owner_contract_refs.exact_time.schema_version = 2;
    }));
    assertRejected(result, /TRACE_0D_CO_OWNER_REF/);
  });
  await t.test('time registry digest mismatch', () => {
    const result = withFixture((directory) => mutateJson(directory, 'body-environment-profiles.json', (value) => {
      value.co_owner_contract_refs.exact_time.digest = '0'.repeat(64);
    }));
    assertRejected(result, /TRACE_0D_CO_OWNER_REF|TRACE_0D_CO_OWNER_DIGEST/);
  });
  await t.test('narration entrypoint mismatch', () => {
    const result = withFixture((directory) => mutateJson(directory, 'epilogue-rules.json', (value) => {
      value.co_owner_contract_refs.visible_only_narration.public_entrypoints = ['@rus/narration:visible_only_narration'];
    }));
    assertRejected(result, /TRACE_0D_CO_OWNER_REF/);
  });
  await t.test('property transition co-owner ref missing', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      delete value.co_owner_contract_refs.property_transition_profile;
    }));
    assertRejected(result, /TRACE_0D_CO_OWNER_REF_SET/);
  });
  await t.test('property transition entrypoint mismatch', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.co_owner_contract_refs.property_transition_profile.existing_support_entrypoints = ['@rus/party-store/spatial-v3-domain-integration:createSpatialV3DomainMutationService'];
    }));
    assertRejected(result, /TRACE_0D_CO_OWNER_REF/);
  });
  await t.test('property transition falsely claims runtime execution', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.co_owner_contract_refs.property_transition_profile.runtime_transition_execution = 'createSpatialV3DomainMutationService';
    }));
    assertRejected(result, /TRACE_0D_CO_OWNER_REF/);
  });
  await t.test('property transition adds the P23 service as a runtime entrypoint', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.co_owner_contract_refs.property_transition_profile.public_entrypoints = ['@rus/party-store/spatial-v3-domain-integration:createSpatialV3DomainMutationService'];
    }));
    assertRejected(result, /TRACE_0D_CO_OWNER_REF/);
  });
  await t.test('unpinned co-owner string', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.owner_contracts.push('@rus/checks-rng:executeCheck');
    }));
    assertRejected(result, /TRACE_0D_CO_OWNER_STRING_REF/);
  });
  await t.test('unpinned items-property string', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.owner_contracts.push('@rus/items-property:planInventoryTransfer');
    }));
    assertRejected(result, /TRACE_0D_CO_OWNER_STRING_REF/);
  });
  await t.test('co-owner immutable dependency removed', () => {
    const result = withFixture((directory) => mutateJson(directory, 'manifest.json', (value) => {
      delete value.immutable_dependency_refs.time_events_history_declarative_contracts;
    }), { refresh: false });
    assertRejected(result, /TRACE_0D_DEPENDENCY_SET/);
  });
  await t.test('items-property immutable dependency removed', () => {
    const result = withFixture((directory) => mutateJson(directory, 'manifest.json', (value) => {
      delete value.immutable_dependency_refs.items_property_declarative_contracts;
    }), { refresh: false });
    assertRejected(result, /TRACE_0D_DEPENDENCY_SET/);
  });
});

test('activity/check/consequence validation rejects missing refs and unsafe authority', async (t) => {
  await t.test('empty semantic option set', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => { value.activity_profiles[0].semantic_option_ids = []; }));
    assertRejected(result, /TRACE_0D_ACTIVITY_OPTIONS/);
  });
  await t.test('unknown activity check', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => { value.activity_profiles[0].check_ref = 'unknown_check'; }));
    assertRejected(result, /TRACE_0D_ACTIVITY_CHECK/);
  });
  await t.test('unknown semantic option ID', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => { value.activity_profiles[0].semantic_option_ids = ['invented_option']; }));
    assertRejected(result, /TRACE_0D_ACTIVITY_OPTIONS/);
  });
  await t.test('unknown consequence', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => { value.activity_profiles[0].consequence_refs[0] = 'unknown_consequence'; }));
    assertRejected(result, /TRACE_0D_ACTIVITY_CONSEQUENCE/);
  });
  await t.test('known but wrong consequence mapping', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.check_profiles[0].outcome_refs.success = 'trace_ld_v1_consequence_onisim_stabilized';
      value.activity_profiles[0].consequence_refs[0] = 'trace_ld_v1_consequence_onisim_stabilized';
    }));
    assertRejected(result, /TRACE_0D_CHECK_CONSEQUENCE_MAPPING/);
  });
  await t.test('second clock owner', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => { value.secondary_clock_owner = '@rus/turn'; }));
    assertRejected(result, /TRACE_0D_TIME_RNG_OWNER|TRACE_0D_CLOCK_OWNER/);
  });
  await t.test('movement clock owner', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => { value.clock_owner = '@rus/movement-routes'; }));
    assertRejected(result, /TRACE_0D_TIME_RNG_OWNER/);
  });
  await t.test('exact elapsed rational binding mismatch', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.time_profiles[0].exact_elapsed.denominator = 2;
    }));
    assertRejected(result, /TRACE_0D_TIME_PROFILE/);
  });
  await t.test('retry rerolls', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => { value.check_profiles[0].retry_policy = 'roll_again'; }));
    assertRejected(result, /TRACE_0D_CHECK_RETRY/);
  });
  await t.test('evidence appears without discovery', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => { value.check_profiles[0].admitted_evidence_by_outcome.failure = ['trace_ld_v1_evidence_blue_wool']; }));
    assertRejected(result, /TRACE_0D_CHECK_EVIDENCE_DISCOVERY/);
  });
  await t.test('surrender check creates confession', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.check_profiles.find(({ check_id }) => check_id === 'trace_ld_v1_check_ratsha_surrender_attempt').admitted_evidence_by_outcome.success = ['trace_ld_v1_evidence_ratsha_confession'];
    }));
    assertRejected(result, /TRACE_0D_CONFESSION_FROM_CHECK/);
  });
  await t.test('danger success atomic effect loses its exact producer', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      delete value.atomic_resolution_profiles[0].ordered_atomic_stages.find(
        ({ stage_id }) => stage_id === 'temporary_restraint'
      ).producer_consequence_ref;
    }));
    assertRejected(result, /TRACE_0D_ATOMIC_RESOLUTION/);
  });
  await t.test('danger reorders disarm before the committed strike', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const stages = value.atomic_resolution_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_atomic_group_danger_resolution'
      ).ordered_atomic_stages;
      const strike = stages.findIndex(({ stage_id }) => stage_id === 'optional_zhdanko_strike');
      const disarm = stages.findIndex(({ stage_id }) => stage_id === 'axe_control_transition');
      [stages[strike], stages[disarm]] = [stages[disarm], stages[strike]];
    }));
    assertRejected(result, /TRACE_0D_ATOMIC_RESOLUTION/);
  });
  await t.test('Ratsha attack outcome loses its exact producer', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      delete value.atomic_resolution_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_atomic_ratsha_attack_resolution'
      ).result_producer.producer_consequence_ref;
    }));
    assertRejected(result, /TRACE_0D_RATSHA_ATTACK_RESOLUTION/);
  });
  await t.test('Ratsha attack resolution no longer requires the committed player response', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.atomic_resolution_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_atomic_ratsha_attack_resolution'
      ).required_committed_inputs.required_facts = ['ratsha_attack_attempt_committed'];
    }));
    assertRejected(result, /TRACE_0D_RATSHA_ATTACK_RESOLUTION/);
  });
  await t.test('Ratsha player response set loses a closed variant', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.player_response_contracts[0].response_variants.pop();
    }));
    assertRejected(result, /TRACE_0D_PLAYER_RESPONSE/);
  });
  await t.test('Ratsha nonlethal hold success loses its exact restraint producer', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const resolution = value.atomic_resolution_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_atomic_ratsha_attack_resolution'
      );
      const binding = resolution.response_effect_bindings.find(
        ({ option_id }) => option_id === 'attempt_nonlethal_hold_of_ratsha'
      );
      delete binding.result_variants.find(
        ({ result_id }) => result_id === 'ratsha_nonlethal_hold_succeeded'
      ).producer_consequence_ref;
    }));
    assertRejected(result, /TRACE_0D_RATSHA_RESPONSE_EFFECT/);
  });
  await t.test('Ratsha break-contact response loses its exact zone-position producer', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const resolution = value.atomic_resolution_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_atomic_ratsha_attack_resolution'
      );
      const binding = resolution.response_effect_bindings.find(
        ({ option_id }) => option_id === 'break_contact_within_drying_shed'
      );
      delete binding.result_variants.find(
        ({ result_id }) => result_id === 'player_break_contact_to_shed_approach_committed'
      ).position_transition;
    }));
    assertRejected(result, /TRACE_0D_RATSHA_RESPONSE_EFFECT/);
  });
  await t.test('Ratsha escape is no longer gated by the committed post-response state', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      const option = value.decision_policies.find(
        ({ policy_id }) => policy_id === 'trace_ld_v1_npc_ratsha_decisions'
      ).option_set.find(({ option_id }) => option_id === 'continue_escape_after_resolved_attack');
      option.preconditions.push('not_restrained');
      delete option.required_any_of_committed_facts;
      delete option.none_of_committed_facts;
    }));
    assertRejected(result, /TRACE_0D_RATSHA_ATTACK_EXECUTION/);
  });
  await t.test('danger resolution returns to an unpinned owner string', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const danger = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_danger_resolution'
      );
      danger.semantic_execution_branches.find(
        ({ semantic_option_id }) => semantic_option_id === 'coordinate_bounded_group_response'
      ).outcome_contract.selection_owner = 'existing_combat_items_npc_atomic_effect_owners';
    }));
    assertRejected(result, /TRACE_0D_DANGER_EXECUTION/);
  });
  await t.test('danger retreat execution branch is missing', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const danger = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_danger_resolution'
      );
      danger.semantic_execution_branches = danger.semantic_execution_branches.filter(
        ({ semantic_option_id }) => semantic_option_id !== 'retreat_from_threat'
      );
    }));
    assertRejected(result, /TRACE_0D_ACTIVITY_EXECUTION_BRANCH/);
  });
  await t.test('danger retreat has a duplicate execution branch', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const danger = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_danger_resolution'
      );
      const duplicate = structuredClone(danger.semantic_execution_branches.find(
        ({ semantic_option_id }) => semantic_option_id === 'retreat_from_threat'
      ));
      duplicate.branch_id = 'trace_ld_v1_danger_execution_retreat_duplicate';
      danger.semantic_execution_branches.push(duplicate);
    }));
    assertRejected(result, /TRACE_0D_ACTIVITY_EXECUTION_BRANCH/);
  });
  await t.test('danger retreat is bound to the group-disarm atomic profile', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const danger = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_danger_resolution'
      );
      danger.semantic_execution_branches.find(
        ({ semantic_option_id }) => semantic_option_id === 'retreat_from_threat'
      ).atomic_resolution_profile_ref = 'trace_ld_v1_atomic_group_danger_resolution';
    }));
    assertRejected(result, /TRACE_0D_DANGER_RETREAT_EXECUTION/);
  });
  await t.test('danger retreat loses its exact destination zone', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const danger = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_danger_resolution'
      );
      delete danger.semantic_execution_branches.find(
        ({ semantic_option_id }) => semantic_option_id === 'retreat_from_threat'
      ).position_transition.destination_zone_ref;
    }));
    assertRejected(result, /TRACE_0D_DANGER_RETREAT_POSITION/);
  });
  await t.test('danger retreat loses its exact access and capacity refs', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const danger = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_danger_resolution'
      );
      const transition = danger.semantic_execution_branches.find(
        ({ semantic_option_id }) => semantic_option_id === 'retreat_from_threat'
      ).position_transition;
      delete transition.access_policy_ref;
      delete transition.capacity_contract_ref;
    }));
    assertRejected(result, /TRACE_0D_DANGER_RETREAT_ACCESS/);
  });
  await t.test('danger retreat adds automatic disarm and harm', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const danger = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_danger_resolution'
      );
      const retreat = danger.semantic_execution_branches.find(
        ({ semantic_option_id }) => semantic_option_id === 'retreat_from_threat'
      );
      retreat.automatic_effect_classes = ['body_harm', 'item_disarm'];
    }));
    assertRejected(result, /TRACE_0D_DANGER_RETREAT_EFFECT/);
  });
  await t.test('danger retreat adds a second clock write', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const danger = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_danger_resolution'
      );
      danger.semantic_execution_branches.find(
        ({ semantic_option_id }) => semantic_option_id === 'retreat_from_threat'
      ).position_transition.clock_write = 'single';
    }));
    assertRejected(result, /TRACE_0D_DANGER_RETREAT_TIME/);
  });
  await t.test('Onisim alive again depends on treatment', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.scene_observation_profiles[0].treatment_dependency = 'trace_ld_v1_activity_first_aid_onisim';
    }));
    assertRejected(result, /TRACE_0D_SCENE_OBSERVATION/);
  });
  await t.test('temporary decision writes a generic boolean without typed disposition', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const activity = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_temporary_decision'
      );
      activity.committed_fact_outputs = ['temporary_decision_committed'];
      activity.consequence_refs = [];
    }));
    assertRejected(result, /TRACE_0D_TEMPORARY_DISPOSITION/);
  });
  await t.test('temporary disposition uses an unproduced summary fact for Ratsha custody', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const option = value.temporary_disposition_contracts[0].custody_options.find(
        ({ option_id }) => option_id === 'hold_zhdanko_ratsha_absent'
      );
      delete option.required_committed_actor_predicates_any_of;
      option.required_committed_facts = ['ratsha_absent_or_not_surrendered'];
    }));
    assertRejected(result, /TRACE_0D_TEMPORARY_DISPOSITION|TRACE_0D_ACTIVITY_OPTIONS/);
  });
  await t.test('temporary disposition merges present-not-held Ratsha into physical absence', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const options = value.temporary_disposition_contracts[0].custody_options;
      const absent = options.find(({ option_id }) => option_id === 'hold_zhdanko_ratsha_absent');
      absent.required_committed_actor_predicates_any_of = [
        'ratsha_storehouse_helper:outside_fishing_camp',
        'ratsha_storehouse_helper:not_in_temporary_custody'
      ];
      const presentIndex = options.findIndex(
        ({ option_id }) => option_id === 'hold_zhdanko_ratsha_present_not_held'
      );
      options.splice(presentIndex, 1);
      value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_temporary_decision'
      ).semantic_option_ids = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_temporary_decision'
      ).semantic_option_ids.filter((optionId) => optionId !== 'hold_zhdanko_ratsha_present_not_held');
    }));
    assertRejected(result, /TRACE_0D_TEMPORARY_DISPOSITION|TRACE_0D_ACTIVITY_OPTIONS/);
  });
  await t.test('property disposition uses an abbreviated external owner ID', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.temporary_disposition_contracts[0].property_options.find(
        ({ option_id }) => option_id === 'preserve_recovered_property_for_savva_handover'
      ).owner_must_remain = 'savva_tverdich';
    }));
    assertRejected(result, /TRACE_0D_TEMPORARY_PROPERTY_OWNER/);
  });
  await t.test('destroyed packet admits two mutually exclusive property dispositions', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const option = value.temporary_disposition_contracts[0].property_options.find(
        ({ option_id }) => option_id === 'preserve_recovered_property_for_savva_handover'
      );
      option.required_committed_facts = ['packet_lost_or_destroyed'];
      option.none_of_committed_facts = [];
    }));
    assertRejected(result, /TRACE_0D_TEMPORARY_DISPOSITION/);
  });
});

test('failed checks retain only approved evidence-resolution continuations', () => {
  const value = readJson(source, 'activity-check-consequence-profiles.json');
  const checks = new Map(value.check_profiles.map((profile) => [profile.check_id, profile]));
  assert.deepEqual(checks.get('trace_ld_v1_check_detailed_wreck_inspection').admitted_evidence_by_outcome.failure, []);
  assert.match(checks.get('trace_ld_v1_check_detailed_wreck_inspection').failure_continuation.approved_route, /testimonial_plus_documentary/);
  assert.match(checks.get('trace_ld_v1_check_eremey_cooperation').failure_continuation.approved_route, /physical_plus_other_testimony_or_documentary/);
  assert.equal(checks.get('trace_ld_v1_check_ratsha_surrender_attempt').failure_continuation.state, 'dangerous_scene_open');
  assert.equal(checks.get('trace_ld_v1_check_risky_first_aid').failure_continuation.state, 'rescue_open');
});

test('danger, arrival observation, and temporary disposition have closed producer chains', () => {
  const activities = readJson(source, 'activity-check-consequence-profiles.json');
  const promise = readJson(source, 'promise-policy.json');
  const stages = new Map(activities.atomic_resolution_profiles[0].ordered_atomic_stages.map(
    (stage) => [stage.stage_id, stage]
  ));
  assert.equal(stages.get('group_disarm_admission').producer_consequence_ref, 'trace_ld_v1_consequence_bounded_group_disarm_transition_admitted');
  assert.equal(stages.get('axe_control_transition').producer_transition_ref, 'trace_ld_v1_property_zhdanko_axe_disarmed_to_eremey');
  assert.equal(stages.get('optional_zhdanko_strike').producer_consequence_ref, 'trace_ld_v1_consequence_zhdanko_axe_poll_strike_on_ratsha');
  assert.equal(stages.get('optional_ratsha_wound').producer_body_effect_ref, 'trace_ld_v1_body_danger_2m');
  assert.equal(stages.get('temporary_restraint').producer_consequence_ref, 'trace_ld_v1_consequence_bounded_group_restraint_applied');
  assert.deepEqual(
    activities.atomic_resolution_profiles[0].ordered_atomic_stages.map(({ stage_id }) => stage_id),
    ['optional_zhdanko_strike', 'optional_ratsha_wound', 'group_disarm_admission', 'axe_control_transition', 'temporary_restraint']
  );
  const ratshaAttackResolution = activities.atomic_resolution_profiles.find(
    ({ profile_id }) => profile_id === 'trace_ld_v1_atomic_ratsha_attack_resolution'
  );
  assert.equal(ratshaAttackResolution.result_producer.committed_fact_output, 'ratsha_attack_outcome_resolved');
  assert.equal(
    ratshaAttackResolution.result_producer.producer_consequence_ref,
    'trace_ld_v1_consequence_ratsha_attack_outcome_resolved'
  );
  assert.deepEqual(ratshaAttackResolution.required_committed_inputs.required_facts, [
    'ratsha_attack_attempt_committed',
    'ratsha_attack_player_response_committed'
  ]);
  const playerResponse = activities.player_response_contracts[0];
  assert.deepEqual(playerResponse.ordered_commit_boundaries, [
    'ratsha_attack_attempt_committed',
    'exact_player_response_variant_committed',
    'ratsha_attack_outcome_resolved',
    'separate_ratsha_escape_decision'
  ]);
  assert.deepEqual(playerResponse.response_variants.map(({ option_id }) => option_id), [
    'defend_in_place_against_ratsha',
    'attempt_nonlethal_hold_of_ratsha',
    'break_contact_within_drying_shed'
  ]);
  const responseEffectBindings = new Map(ratshaAttackResolution.response_effect_bindings.map(
    (binding) => [binding.option_id, binding]
  ));
  const holdResults = new Map(responseEffectBindings.get('attempt_nonlethal_hold_of_ratsha').result_variants.map(
    (result) => [result.result_id, result]
  ));
  assert.equal(
    holdResults.get('ratsha_nonlethal_hold_succeeded').producer_consequence_ref,
    'trace_ld_v1_consequence_ratsha_nonlethal_hold_succeeded'
  );
  assert.deepEqual(
    holdResults.get('ratsha_nonlethal_hold_succeeded').committed_fact_outputs,
    ['ratsha_temporary_restraint_committed']
  );
  assert.equal(
    holdResults.get('ratsha_nonlethal_hold_failed').producer_consequence_ref,
    'trace_ld_v1_consequence_ratsha_nonlethal_hold_failed'
  );
  const breakContactResults = new Map(responseEffectBindings.get('break_contact_within_drying_shed').result_variants.map(
    (result) => [result.result_id, result]
  ));
  assert.deepEqual(
    breakContactResults.get('player_break_contact_to_shed_approach_committed').position_transition,
    {
      actor_ref: 'player_clerk',
      location_ref: 'trace_ld_v1_loc_old_drying_shed',
      source_zone_ref: 'shed_interior',
      destination_zone_ref: 'shed_approach',
      access_policy_ref: 'trace_ld_v1_access_old_drying_shed',
      capacity_contract_ref: 'trace_ld_v1_capacity_old_drying_shed',
      position_write_owner_contract_ref: '@rus/party-store:logical_write_plan'
    }
  );

  const observation = activities.scene_observation_profiles[0];
  assert.equal(observation.trigger.route_terminal_commit_ref, 'trace_ld_v1_route_camp_to_shed');
  assert.equal(observation.treatment_dependency, 'forbidden');
  assert.equal(observation.committed_fact_output, 'onisim_found_alive');

  const disposition = activities.temporary_disposition_contracts[0];
  assert.equal(disposition.selection_contract.custody_cardinality, 'exactly_one');
  assert.equal(disposition.selection_contract.property_cardinality, 'exactly_one');
  assert.equal(disposition.selection_contract.promise_cardinality, 'exactly_one');
  const absentRatsha = disposition.custody_options.find(
    ({ option_id }) => option_id === 'hold_zhdanko_ratsha_absent'
  );
  const presentRatsha = disposition.custody_options.find(
    ({ option_id }) => option_id === 'hold_zhdanko_ratsha_present_not_held'
  );
  assert.deepEqual(absentRatsha.required_committed_actor_predicates, [
    'ratsha_storehouse_helper:outside_fishing_camp'
  ]);
  assert.equal(absentRatsha.committed_fact_output, 'temporary_custody_zhdanko_ratsha_absent');
  assert.deepEqual(presentRatsha.required_committed_actor_predicates, [
    'ratsha_storehouse_helper:at_fishing_camp',
    'ratsha_storehouse_helper:not_in_temporary_custody'
  ]);
  assert.equal(
    presentRatsha.committed_fact_output,
    'temporary_custody_zhdanko_ratsha_present_not_held'
  );
  assert.equal(presentRatsha.ratsha_presence_effect.capacity_counting, 'count_as_present_actor');
  assert.equal(presentRatsha.ratsha_presence_effect.npc_decision_status, 'continues_from_committed_state');
  assert.equal(
    disposition.property_options.find(
      ({ option_id }) => option_id === 'preserve_recovered_property_for_savva_handover'
    ).owner_must_remain,
    'trace_ld_v1_external_owner_savva_tverdich'
  );
  assert.deepEqual(disposition.promise_options.find(
    ({ option_id }) => option_id === 'preserve_active_no_summary_killing_promise'
  ).required_witness_slots, ['eremey_fisher', 'trace_ld_v1_audience_slot_participating_fisher']);
  assert.equal(JSON.stringify(activities).includes('temporary_decision_committed'), false);
  assert.deepEqual(promise.transitions.find(({ to }) => to === 'fulfilled').requires, ['promise_fulfillment_basis_committed']);
  assert.deepEqual(promise.transitions.find(({ to }) => to === 'broken').requires, ['promise_breach_basis_committed']);
  assert.deepEqual(
    promise.lifecycle_input_projections.map(({ projected_committed_fact }) => projected_committed_fact),
    ['promise_activation_basis_committed', 'promise_fulfillment_basis_committed', 'promise_breach_basis_committed']
  );
  assert.equal(promise.history_and_current_state_contract.history_event_storage, 'append_only');
  assert.equal(promise.history_and_current_state_contract.current_state_cardinality, 'exactly_one');
  assert.equal(promise.history_and_current_state_contract.initial_current_state_fact, 'promise_current_not_offered');
  assert.deepEqual(
    promise.transitions.find(({ to }) => to === 'fulfilled').current_state_projection,
    {
      state_slot: 'trace_ld_v1_promise_no_summary_killing_current_state',
      expected_previous_fact: 'promise_current_active',
      next_fact: 'promise_current_fulfilled',
      replace_previous_projection: true,
      superseded_current_facts: ['promise_current_active']
    }
  );
});

test('Ratsha attack and promise lifecycle have reachable ordered producer chains', () => {
  const activities = readJson(source, 'activity-check-consequence-profiles.json');
  const promise = readJson(source, 'promise-policy.json');
  const completion = readJson(source, 'completion-rules.json');
  const consequences = new Map(activities.consequence_profiles.map((value) => [value.consequence_id, value]));
  const attackResolution = activities.atomic_resolution_profiles.find(
    ({ profile_id }) => profile_id === 'trace_ld_v1_atomic_ratsha_attack_resolution'
  );
  const response = activities.player_response_contracts[0];

  assert.deepEqual(response.ordered_commit_boundaries, [
    'ratsha_attack_attempt_committed',
    'exact_player_response_variant_committed',
    'ratsha_attack_outcome_resolved',
    'separate_ratsha_escape_decision'
  ]);
  assert.ok(attackResolution.required_committed_inputs.required_facts.includes('ratsha_attack_player_response_committed'));
  assert.deepEqual(
    consequences.get(response.response_commit_consequence_ref).committed_fact_outputs,
    ['ratsha_attack_player_response_committed']
  );
  assert.deepEqual(
    consequences.get(response.post_response_resolution_consequence_ref).committed_fact_outputs,
    ['ratsha_attack_outcome_resolved']
  );

  const projections = new Map(promise.lifecycle_input_projections.map((value) => [value.projection_id, value]));
  const activation = projections.get('trace_ld_v1_projection_surrender_to_promise_activation_basis');
  assert.deepEqual(activation.source_committed_facts, ['ratsha_surrender_without_further_harm_committed']);
  assert.deepEqual(promise.transitions.find(({ to }) => to === 'active').requires, [activation.projected_committed_fact]);

  const fulfillment = projections.get('trace_ld_v1_projection_disposition_to_promise_fulfillment_basis');
  const breach = projections.get('trace_ld_v1_projection_disposition_to_promise_breach_basis');
  assert.deepEqual(promise.transitions.find(({ to }) => to === 'fulfilled').requires, [fulfillment.projected_committed_fact]);
  assert.deepEqual(promise.transitions.find(({ to }) => to === 'broken').requires, [breach.projected_committed_fact]);
  assert.deepEqual(promise.lifecycle_evaluation_order, [
    'factual_disposition_or_world_event_commit',
    'lifecycle_input_projection',
    'promise_current_state_transition',
    'promise_completion_gate_projection',
    'completion_evaluation'
  ]);
  assert.ok(completion.completion_states.find(
    ({ completion_state_id }) => completion_state_id === 'trace_ld_v1_completion_full'
  ).all_of_committed_facts.includes(promise.completion_gate_projection.projected_committed_fact));
  assert.ok(promise.completion_gate_projection.forbidden_current_state_facts.includes('promise_current_active'));
});

test('carry contract can rebind Mikula to the second fisher without losing committed work', () => {
  const movement = readJson(source, 'movement-bindings.json');
  const route = movement.route_bindings.find(({ route_id }) => route_id === 'trace_ld_v1_route_shed_to_camp_carry_onisim');
  assert.equal(route.carried_actor_rules.minimum_carrier_count, 3);
  assert.deepEqual(route.carried_actor_rules.initial_carrier_binding, ['player_clerk', 'eremey_fisher', 'background_fisher_1']);
  assert.deepEqual(route.carried_actor_rules.carrier_candidate_slots, ['player_clerk', 'eremey_fisher', 'background_fisher_1', 'background_fisher_2']);
  assert.equal(route.carried_actor_rules.carrier_rebinding.canonical_replacement_path.outgoing_slot, 'player_clerk');
  assert.equal(route.carried_actor_rules.carrier_rebinding.canonical_replacement_path.incoming_slot, 'background_fisher_2');
  assert.equal(route.carried_actor_rules.carrier_rebinding.preserve_committed_elapsed, true);
  assert.equal(route.carried_actor_rules.carrier_rebinding.preserve_committed_route_progress, true);
  assert.match(route.carried_actor_rules.carrier_rebinding.load_recalculation, /outgoing_incoming_and_remaining/);
  assert.equal(route.carried_actor_rules.carrier_rebinding.no_valid_replacement_failure, 'typed_carry_rebinding_unavailable');
});

test('completion uses one primary state plus ordered compatible dimensions', () => {
  const completion = readJson(source, 'completion-rules.json');
  assert.deepEqual(completion.completion_outcome_model.primary_state_precedence, [
    'trace_ld_v1_completion_full',
    'trace_ld_v1_completion_case_open',
    'trace_ld_v1_completion_partial'
  ]);
  assert.deepEqual(completion.completion_outcome_model.evaluation_order, [
    'validate_dimension_conflicts',
    'select_primary_state'
  ]);
  assert.equal(
    completion.completion_outcome_model.primary_state_cardinality,
    'exactly_one_after_dimension_conflict_validation'
  );
  assert.deepEqual(completion.completion_states.map(({ completion_state_id }) => completion_state_id), completion.completion_outcome_model.primary_state_precedence);
  assert.ok(completion.completion_states.find(({ completion_state_id }) => completion_state_id === 'trace_ld_v1_completion_full').none_of_committed_facts.includes('seal_damaged'));
  assert.deepEqual(completion.completion_dimensions.map(({ dimension_id }) => dimension_id), completion.completion_outcome_model.dimension_order);
  assert.equal(completion.completion_outcome_model.cross_dimension_composition, 'allowed');
  assert.equal(completion.completion_outcome_model.intra_dimension_conflict, 'typed_completion_dimension_conflict');
  assert.equal(completion.selected_completion_outcome, null);
  assert.equal(Object.hasOwn(completion, 'selected_completion_state'), false);
  const simultaneousFacts = new Set(['seal_damaged', 'promise_current_broken', 'conclusion:principal_zhdanko', 'zhdanko_fled']);
  const selectedValues = Object.fromEntries(completion.completion_dimensions.map((dimension) => {
    const matching = dimension.values.filter((value) => value.when_any_of_committed_facts?.some((fact) => simultaneousFacts.has(fact)));
    const selected = matching[0] ?? dimension.values.find(({ when_no_known_fact }) => when_no_known_fact === true);
    return [dimension.dimension_id, selected.value_id];
  }));
  assert.equal(selectedValues.seal_state, 'damaged');
  assert.equal(selectedValues.principal_resolution, 'zhdanko_established');
  assert.equal(selectedValues.principal_presence, 'fled');
  assert.equal(selectedValues.promise_state, 'broken');
});

test('primary completion partition is exhaustive after dimension conflict validation', () => {
  const completion = readJson(source, 'completion-rules.json');
  const states = new Map(completion.completion_states.map((state) => [state.completion_state_id, state]));
  const resolve = (factValues) => {
    const facts = new Set(factValues);
    for (const dimension of completion.completion_dimensions) {
      const matching = dimension.values.filter(
        ({ when_any_of_committed_facts: inputs }) => inputs?.some((fact) => facts.has(fact))
      );
      if (matching.length > 1) return { result: 'typed_completion_dimension_conflict', selected: [] };
    }
    const selected = new Set();
    for (const stateId of completion.completion_outcome_model.primary_state_precedence) {
      const state = states.get(stateId);
      const all = state.all_of_committed_facts ?? [];
      const any = state.any_of_committed_facts ?? [];
      const none = state.none_of_committed_facts ?? [];
      const excludedStates = state.none_of_completion_states ?? [];
      if (
        all.every((fact) => facts.has(fact))
        && (any.length === 0 || any.some((fact) => facts.has(fact)))
        && none.every((fact) => !facts.has(fact))
        && excludedStates.every((excluded) => !selected.has(excluded))
      ) selected.add(stateId);
    }
    return {
      result: selected.size === 1 ? [...selected][0] : 'typed_no_or_ambiguous_completion_match',
      selected: [...selected]
    };
  };
  const full = states.get('trace_ld_v1_completion_full');
  const matrix = [
    {
      name: 'Zhdanko unresolved',
      facts: ['temporary_disposition_outcome_committed', 'onisim_found_alive', 'sealed_packet_returned', 'seal_intact', 'conclusion:physical_attack_pattern', 'conclusion:ratsha_participated'],
      expected: 'trace_ld_v1_completion_partial'
    },
    {
      name: 'Ratsha unresolved',
      facts: ['temporary_disposition_outcome_committed', 'onisim_found_alive', 'sealed_packet_returned', 'seal_intact', 'conclusion:physical_attack_pattern', 'conclusion:principal_zhdanko'],
      expected: 'trace_ld_v1_completion_partial'
    },
    {
      name: 'Onisim unresolved',
      facts: ['temporary_disposition_outcome_committed', 'sealed_packet_returned', 'seal_intact', 'conclusion:physical_attack_pattern', 'conclusion:ratsha_participated', 'conclusion:principal_zhdanko'],
      expected: 'trace_ld_v1_completion_partial'
    },
    {
      name: 'intact packet and incomplete investigation',
      facts: ['temporary_disposition_outcome_committed', 'sealed_packet_returned', 'seal_intact', 'conclusion:physical_attack_pattern'],
      expected: 'trace_ld_v1_completion_partial'
    },
    {
      name: 'full conjunction',
      facts: full.all_of_committed_facts,
      expected: 'trace_ld_v1_completion_full'
    },
    {
      name: 'temporary decision absent',
      facts: ['onisim_found_alive', 'sealed_packet_returned', 'seal_intact'],
      expected: 'trace_ld_v1_completion_case_open'
    }
  ];
  for (const entry of matrix) {
    const resolution = resolve(entry.facts);
    assert.equal(resolution.result, entry.expected, entry.name);
    assert.equal(resolution.selected.length, 1, entry.name);
  }
  assert.deepEqual(
    resolve(['temporary_disposition_outcome_committed', 'sealed_packet_returned', 'packet_lost_or_destroyed']),
    { result: 'typed_completion_dimension_conflict', selected: [] }
  );
  const unresolvedSnapshot = new Set(['temporary_disposition_outcome_committed']);
  for (const dimension of completion.completion_dimensions) {
    const matching = dimension.values.filter(
      ({ when_any_of_committed_facts: inputs }) => inputs?.some((fact) => unresolvedSnapshot.has(fact))
    );
    if (matching.length === 0) {
      assert.equal(dimension.values.find(({ when_no_known_fact }) => when_no_known_fact === true).value_id.match(/unresolved/u) !== null, true);
    }
  }
});

test('NPC decisions and schedule reject unknown options and scene timers', async (t) => {
  await t.test('Ratsha option missing', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.decision_policies.find(({ actor_slot }) => actor_slot === 'ratsha_storehouse_helper').option_set.pop();
    }));
    assertRejected(result, /TRACE_0D_NPC_OPTION|TRACE_0D_RATSHA_OPTIONS/);
  });
  await t.test('NPC option has no precondition', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => { value.decision_policies[0].option_set[0].preconditions = []; }));
    assertRejected(result, /TRACE_0D_NPC_PRECONDITION/);
  });
  await t.test('unknown NPC option ID', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => { value.decision_policies[0].option_set[0].option_id = 'invented_option'; }));
    assertRejected(result, /TRACE_0D_NPC_OPTION/);
  });
  await t.test('ordinary NPC option loses its exact execution binding', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.decision_execution_bindings = value.decision_execution_bindings.filter(
        ({ execution_binding_id }) => execution_binding_id !== 'trace_ld_v1_decision_execution_ratsha_attack_escape'
      );
    }));
    assertRejected(result, /TRACE_0D_DECISION_EXECUTION_SET|TRACE_0D_DECISION_EXECUTION_PAIR/);
  });
  await t.test('ordinary NPC execution references unknown movement', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.decision_execution_bindings.find(
        ({ execution_binding_id }) => execution_binding_id === 'trace_ld_v1_decision_execution_fisher_1_escort'
      ).movement_refs = ['unknown_route'];
    }));
    assertRejected(result, /TRACE_0D_DECISION_MOVEMENT_REF|TRACE_0D_FISHER_EXECUTION/);
  });
  await t.test('Ratsha attack again hides escape behind the same decision boundary', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      const binding = value.decision_execution_bindings.find(
        ({ execution_binding_id }) => execution_binding_id === 'trace_ld_v1_decision_execution_ratsha_attack_escape'
      );
      binding.movement_refs = ['trace_ld_v1_route_shed_to_camp'];
      binding.time_contract.roots.push({
        root_ref: 'trace_ld_v1_route_shed_to_camp',
        time_profile_ref: 'trace_ld_v1_time_12m',
        clock_write: 'single_if_route_admitted_and_completed'
      });
    }));
    assertRejected(result, /TRACE_0D_RATSHA_ATTACK_EXECUTION/);
  });
  await t.test('Ratsha surrender omits weapon-control transition', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.decision_execution_bindings.find(
        ({ execution_binding_id }) => execution_binding_id === 'trace_ld_v1_decision_execution_ratsha_surrender_without_confession'
      ).property_transition_refs = [];
    }));
    assertRejected(result, /TRACE_0D_RATSHA_SURRENDER_EXECUTION/);
  });
  await t.test('Zhdanko resistance loses its elapsed root', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      const binding = value.decision_execution_bindings.find(
        ({ execution_binding_id }) => execution_binding_id === 'trace_ld_v1_decision_execution_zhdanko_resist_with_axe'
      );
      binding.time_contract = { mode: 'no_additional_elapsed_at_parent_confrontation_boundary' };
    }));
    assertRejected(result, /TRACE_0D_ZHDANKO_RESIST_EXECUTION|TRACE_0D_DECISION_PARENT_TIME/);
  });
  await t.test('Zhdanko submission omits voluntary bag handover admission', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      const binding = value.decision_execution_bindings.find(
        ({ execution_binding_id }) => execution_binding_id === 'trace_ld_v1_decision_execution_zhdanko_deny_submit'
      );
      binding.ordered_atomic_effects = binding.ordered_atomic_effects.filter(
        (effect) => effect !== 'commit_voluntary_bag_handover_admission'
      );
    }));
    assertRejected(result, /TRACE_0D_ZHDANKO_SUBMIT_EXECUTION/);
  });
  await t.test('no-additional elapsed decision has no exact parent execution', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      delete value.decision_execution_bindings.find(
        ({ execution_binding_id }) => execution_binding_id === 'trace_ld_v1_decision_execution_ratsha_surrender_without_confession'
      ).time_contract.parent_execution_refs;
    }));
    assertRejected(result, /TRACE_0D_DECISION_PARENT_TIME/);
  });
  await t.test('no-additional elapsed decision points to an incompatible parent', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.decision_execution_bindings.find(
        ({ execution_binding_id }) => execution_binding_id === 'trace_ld_v1_decision_execution_onisim_report'
      ).time_contract.parent_execution_refs = ['trace_ld_v1_activity_ratsha_negotiation'];
    }));
    assertRejected(result, /TRACE_0D_DECISION_PARENT_TIME/);
  });
  await t.test('no-additional elapsed decision claims a clock write', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.decision_execution_bindings.find(
        ({ execution_binding_id }) => execution_binding_id === 'trace_ld_v1_decision_execution_fisher_1_carry'
      ).time_contract.clock_write = 'single';
    }));
    assertRejected(result, /TRACE_0D_DECISION_PARENT_TIME/);
  });
  await t.test('schedule uses scene number', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => { value.schedule_policies[0].scene_number = 11; }));
    assertRejected(result, /TRACE_0D_SCENE_TIMER/);
  });
  await t.test('schedule hides scene number in a value', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.schedule_policies[0].boundary_policy = 'after_scene_number_11';
    }));
    assertRejected(result, /TRACE_0D_ZHDANKO_SCHEDULE|TRACE_0D_SCENE_TIMER/);
  });
  await t.test('definition selects NPC decision', () => {
    const result = withFixture((directory) => mutateJson(directory, 'definition.json', (value) => { value.concrete_party_selections.npc_decisions = ['deny_and_submit']; }));
    assertRejected(result, /TRACE_0D_PARTY_SELECTION/);
  });
});

test('every closed NPC option resolves to one executable declarative binding', () => {
  const npc = readJson(source, 'npc-decision-schedule-policies.json');
  const optionPairs = npc.decision_policies.flatMap((policy) => (
    policy.option_set.map((option) => `${policy.policy_id}:${option.option_id}`)
  ));
  const bindingPairs = npc.decision_execution_bindings.map(
    (binding) => `${binding.policy_id}:${binding.option_id}`
  );
  assert.equal(optionPairs.length, 25);
  assert.deepEqual([...bindingPairs].sort(), [...optionPairs].sort());
  assert.equal(new Set(bindingPairs).size, bindingPairs.length);
  for (const binding of npc.decision_execution_bindings) {
    assert.ok(binding.execution_kind);
    assert.ok(binding.time_contract.mode);
    assert.ok(Array.isArray(binding.activity_profile_refs));
    assert.ok(Array.isArray(binding.movement_refs));
    assert.ok(Array.isArray(binding.consequence_refs));
    assert.ok(Array.isArray(binding.property_transition_refs));
    assert.ok(Array.isArray(binding.body_effect_refs));
    assert.ok(binding.write_targets.length > 0);
    assert.ok(binding.forbidden_write_targets.includes('completion_state'));
    assert.ok(binding.typed_failure);
    if (binding.time_contract.mode.startsWith('no_additional_elapsed')) {
      assert.ok(binding.time_contract.parent_execution_refs.length > 0);
      assert.equal(binding.time_contract.clock_write, 'forbidden');
      assert.equal(binding.write_targets.includes('elapsed_game_time'), false);
    }
  }
  const attack = readJson(source, 'activity-check-consequence-profiles.json').activity_profiles.find(
    ({ profile_id }) => profile_id === 'trace_ld_v1_activity_ratsha_attack_and_escape_attempt'
  );
  assert.equal(attack.followup_escape_admission.same_command_route_admission, 'forbidden');
  assert.equal(attack.followup_escape_admission.requires_committed_attack_resolution, 'ratsha_attack_outcome_resolved');
  assert.equal(attack.followup_escape_admission.requires_new_player_action_commit, 'ratsha_attack_player_response_committed');
  assert.deepEqual(attack.followup_escape_admission.required_order, [
    'ratsha_attack_attempt_committed',
    'ratsha_attack_player_response_committed',
    'ratsha_attack_outcome_resolved'
  ]);
  assert.equal(attack.followup_escape_admission.requires_new_npc_decision_option_id, 'continue_escape_after_resolved_attack');
});

test('Zhdanko autonomous schedule resolves every option to exact declarative execution inputs', () => {
  const npc = readJson(source, 'npc-decision-schedule-policies.json');
  const activities = readJson(source, 'activity-check-consequence-profiles.json');
  const movement = readJson(source, 'movement-bindings.json');
  const schedule = npc.schedule_policies[0];
  const executionById = new Map(npc.schedule_execution_bindings.map((binding) => [binding.execution_binding_id, binding]));
  const activityById = new Map(activities.activity_profiles.map((profile) => [profile.profile_id, profile]));
  const consequenceIds = new Set(activities.consequence_profiles.map(({ consequence_id }) => consequence_id));
  assert.equal(schedule.option_set.length, 8);
  assert.equal(executionById.size, 8);
  for (const option of schedule.option_set) {
    const execution = executionById.get(option.execution_binding_ref);
    assert.equal(execution.schedule_option_id, option.option_id);
    assert.deepEqual(
      activityById.get(execution.activity_profile_ref).semantic_option_ids,
      option.option_id === 'attempt_departure'
        ? ['attempt_departure', 'flee_without_weapon']
        : [option.option_id]
    );
    assert.equal(consequenceIds.has(execution.consequence_ref), true);
    const movementRoot = ['move_bag', 'attempt_departure'].includes(option.option_id);
    assert.equal(execution.elapsed_plan.clock_write, movementRoot ? 'delegated_to_root_movement_binding' : 'single_via_schedule_elapsed_contract');
    assert.equal(execution.write_targets.filter((target) => target === 'elapsed_game_time').length, movementRoot ? 0 : 1);
  }
  const exit = movement.active_scope_exit_bindings[0];
  assert.equal(exit.destination_contract.kind, 'outside_active_scenario_scope');
  assert.equal(exit.destination_contract.destination_location_ref, null);
  assert.equal(exit.destination_contract.destination_instance_materialization, 'forbidden');
  assert.equal(exit.terminal_fact_timing, 'only_after_full_exit_interval_and_property_transition_commit');
  assert.deepEqual(exit.departure_load_variants.map(({ committed_load_state }) => committed_load_state), ['bag_not_controlled', 'bag_controlled_not_loaded', 'bag_loaded']);
});

test('Zhdanko composite actions have one root elapsed and included non-additive child intervals', () => {
  const npc = readJson(source, 'npc-decision-schedule-policies.json');
  const movement = readJson(source, 'movement-bindings.json');
  assert.equal(npc.schedule_elapsed_contract.committed_elapsed_owner_mode, 'direct_party_clock');
  assert.equal(npc.schedule_elapsed_contract.clock_arithmetic_owner, '@rus/time-events-history');
  assert.equal(npc.schedule_elapsed_contract.clock_write_count_per_completed_execution, 1);
  const prepare = npc.schedule_execution_bindings.find(({ schedule_option_id }) => schedule_option_id === 'prepare_boat');
  assert.deepEqual(
    prepare.elapsed_plan.closed_variants.storehouse_interior.stages.map(({ duration_minutes }) => duration_minutes),
    [5, 5]
  );
  assert.deepEqual(
    prepare.elapsed_plan.closed_variants.river_access.stages.map(({ duration_minutes }) => duration_minutes),
    [10]
  );
  const localRoles = movement.local_transition_bindings[0].elapsed_accounting.parent_execution_roles;
  assert.equal(localRoles.trace_ld_v1_schedule_execution_move_bag.clock_owner_mode, 'direct_party_clock');
  assert.equal(localRoles.trace_ld_v1_schedule_execution_move_bag.clock_write, 'single');
  assert.equal(localRoles.trace_ld_v1_schedule_execution_prepare_boat.clock_owner_mode, 'shared_root_transport_clock');
  assert.equal(localRoles.trace_ld_v1_schedule_execution_prepare_boat.clock_write, 'forbidden');
  const exitRole = movement.active_scope_exit_bindings[0].elapsed_accounting.parent_execution_roles.trace_ld_v1_schedule_execution_attempt_departure;
  assert.equal(exitRole.clock_owner_mode, 'direct_party_clock');
  assert.equal(exitRole.clock_write, 'single');
});

test('tied road bag has one approved opening path shared by player inspection and document destruction', () => {
  const npc = readJson(source, 'npc-decision-schedule-policies.json');
  const activities = readJson(source, 'activity-check-consequence-profiles.json');
  const open = npc.property_transition_profiles.find(({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_road_bag_opened_for_access');
  const recover = npc.property_transition_profiles.find(({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_road_bag_recovered_to_player_control');
  const destroy = npc.property_transition_profiles.find(({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_packet_destroyed');
  const player = activities.activity_profiles.find(({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal');
  const intactVariant = player.execution_variant_contract.closed_variants.find(({ variant_id }) => variant_id === 'tied_bag_intact_packet');
  const npcExecution = npc.schedule_execution_bindings.find(({ schedule_option_id }) => schedule_option_id === 'attempt_document_destruction');
  assert.equal(open.requires.closure_state, 'tied');
  assert.equal(open.duration_minutes, 2);
  assert.deepEqual(open.elapsed_accounting, {
    role: 'included_child_interval',
    clock_write: 'forbidden',
    duration_accounting: 'included_in_parent_root_total_never_additive'
  });
  assert.equal(open.interruption_boundary, 'container_open_transition_boundary');
  assert.equal(open.writes.closure_state, 'open');
  assert.equal(intactVariant.ordered_transition_stages[0].property_transition_ref, recover.transition_profile_id);
  assert.equal(intactVariant.ordered_transition_stages[1].property_transition_ref, open.transition_profile_id);
  assert.equal(npcExecution.elapsed_plan.stages[0].property_transition_refs[0], open.transition_profile_id);
  assert.equal(destroy.requires.access_transition_ref, open.transition_profile_id);
  assert.equal(npcExecution.elapsed_plan.stages[1].requires_committed_stage_id, npcExecution.elapsed_plan.stages[0].stage_id);
});

test('road bag recovery preserves Savva ownership and requires one approved control-transfer basis', () => {
  const npc = readJson(source, 'npc-decision-schedule-policies.json');
  const activities = readJson(source, 'activity-check-consequence-profiles.json');
  const recovery = npc.property_transition_profiles.find(
    ({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_road_bag_recovered_to_player_control'
  );
  const inspection = activities.activity_profiles.find(
    ({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
  );
  assert.deepEqual(recovery.admission_variants.map(({ variant_id }) => variant_id), [
    'recovery_after_zhdanko_submission',
    'recovery_after_zhdanko_disarm',
    'voluntary_handover',
    'bounded_group_recovery',
    'recovery_after_departure_with_bag_left'
  ]);
  assert.equal(recovery.requires_common.owner_ref, 'trace_ld_v1_external_owner_savva_tverdich');
  assert.equal(recovery.writes.holder_ref, 'player_clerk');
  assert.equal(recovery.writes.controller_ref, 'player_clerk');
  assert.equal(recovery.owner_change, 'forbidden');
  assert.match(recovery.contained_item_effect, /inherit_parent_container_position_holder_and_controller/);
  assert.equal(inspection.recovery_admission_contract.physical_proximity_alone_is_insufficient, true);
  assert.deepEqual(
    inspection.recovery_admission_contract.method_variants.map(({ method_id }) => method_id),
    [
      'recover_after_zhdanko_submission',
      'recover_after_zhdanko_disarm',
      'accept_voluntary_handover',
      'bounded_group_recovery',
      'recover_after_zhdanko_fled_leaving_bag'
    ]
  );
});

test('bag inspection remains executable without an optional participating fisher', () => {
  const npc = readJson(source, 'npc-decision-schedule-policies.json');
  const activities = readJson(source, 'activity-check-consequence-profiles.json');
  const inspection = activities.activity_profiles.find(
    ({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
  );
  const intactVariant = inspection.execution_variant_contract.closed_variants.find(
    ({ variant_id }) => variant_id === 'tied_bag_intact_packet'
  );
  const finalStage = intactVariant.ordered_transition_stages.at(-1);
  const carrierVariant = inspection.post_inspection_carrier_contract.closed_variants[0];
  const carrierTransition = npc.property_transition_profiles.find(
    ({ transition_profile_id }) => transition_profile_id === carrierVariant.property_transition_ref
  );
  assert.equal(finalStage.property_transition_ref, 'trace_ld_v1_property_packet_recovered_to_player');
  assert.equal(Object.hasOwn(finalStage, 'property_transition_refs'), false);
  assert.equal(inspection.post_inspection_carrier_contract.inspection_completion_independent_of_carrier_assignment, true);
  assert.equal(inspection.post_inspection_carrier_contract.no_selection_effect, 'retain_committed_player_holder_and_controller');
  assert.deepEqual(inspection.post_inspection_carrier_contract.elapsed_accounting, {
    role: 'optional_atomic_effect_at_final_inspection_boundary',
    clock_write: 'forbidden',
    duration_accounting: 'included_in_selected_inspection_variant_total_never_additive'
  });
  assert.equal(carrierVariant.requires_materialized_slot, 'trace_ld_v1_audience_slot_participating_fisher');
  assert.equal(carrierTransition.requires.participating_fisher_slot_materialized, true);
  assert.equal(inspection.post_inspection_carrier_contract.selected_unavailable_variant, 'typed_bag_carrier_variant_not_admitted');
});

test('bounded group bag recovery is reachable only from committed disarm facts and axe control', () => {
  const npc = readJson(source, 'npc-decision-schedule-policies.json');
  const activities = readJson(source, 'activity-check-consequence-profiles.json');
  const inspection = activities.activity_profiles.find(
    ({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
  );
  const method = inspection.recovery_admission_contract.method_variants.find(
    ({ method_id }) => method_id === 'bounded_group_recovery'
  );
  const disarmConsequence = activities.consequence_profiles.find(
    ({ consequence_id }) => consequence_id === 'trace_ld_v1_consequence_bounded_group_disarm_committed'
  );
  const axeTransition = npc.property_transition_profiles.find(
    ({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_zhdanko_axe_disarmed_to_eremey'
  );
  assert.deepEqual(method.requires_all_committed_facts, disarmConsequence.committed_fact_outputs);
  assert.deepEqual(method.requires_committed_property_predicates, [{
    subject_ref: 'trace_ld_v1_item_zhdanko_axe',
    holder_ref: axeTransition.writes.holder_ref,
    controller_ref: axeTransition.writes.controller_ref,
    source_transition_ref: axeTransition.transition_profile_id
  }]);
});

test('intact packet recovery produces the exact full-completion packet and seal facts', () => {
  const npc = readJson(source, 'npc-decision-schedule-policies.json');
  const activities = readJson(source, 'activity-check-consequence-profiles.json');
  const completion = readJson(source, 'completion-rules.json');
  const recovery = npc.property_transition_profiles.find(
    ({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_packet_recovered_to_player'
  );
  const consequence = activities.consequence_profiles.find(
    ({ consequence_id }) => consequence_id === 'trace_ld_v1_consequence_intact_packet_returned_and_seal_observed'
  );
  const projection = completion.committed_property_state_projection_inputs.find(
    ({ projection_id }) => projection_id === 'trace_ld_v1_projection_intact_packet_to_completion_facts'
  );
  const full = completion.completion_states.find(
    ({ completion_state_id }) => completion_state_id === 'trace_ld_v1_completion_full'
  );
  const sealDimension = completion.completion_dimensions.find(({ dimension_id }) => dimension_id === 'seal_state');
  const fullMapping = completion.evidence_resolution_outcome_to_completion_state.find(
    ({ evidence_outcome }) => evidence_outcome === 'conclusion:principal_zhdanko'
  );
  assert.equal(consequence.required_property_transition_ref, recovery.transition_profile_id);
  assert.equal(consequence.committed_property_state_projection.requires_committed_state.seal_state, recovery.requires.seal_state);
  assert.deepEqual(consequence.committed_fact_outputs, ['sealed_packet_returned', 'seal_intact']);
  assert.deepEqual(projection.projected_committed_facts, consequence.committed_fact_outputs);
  assert.ok(projection.projected_committed_facts.every((fact) => full.all_of_committed_facts.includes(fact)));
  assert.ok(sealDimension.values.find(({ value_id }) => value_id === 'intact').when_any_of_committed_facts.includes('seal_intact'));
  assert.equal(full.all_of_committed_facts.includes('seal_state_established'), false);
  assert.deepEqual(fullMapping.additional_committed_facts_required, [
    'onisim_found_alive',
    'sealed_packet_returned',
    'seal_intact',
    'conclusion:physical_attack_pattern',
    'conclusion:ratsha_participated',
    'temporary_disposition_outcome_committed',
    'promise_state_admitted_for_full_completion'
  ]);
});

test('destroyed packet remains discoverable and projects exact partial-completion facts', () => {
  const npc = readJson(source, 'npc-decision-schedule-policies.json');
  const activities = readJson(source, 'activity-check-consequence-profiles.json');
  const completion = readJson(source, 'completion-rules.json');
  const destruction = npc.property_transition_profiles.find(
    ({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_packet_destroyed'
  );
  const destructionConsequence = activities.consequence_profiles.find(
    ({ consequence_id }) => consequence_id === 'trace_ld_v1_consequence_zhdanko_document_destroyed'
  );
  const inspection = activities.activity_profiles.find(
    ({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
  );
  const destroyedVariant = inspection.execution_variant_contract.closed_variants.find(
    ({ variant_id }) => variant_id === 'open_bag_destroyed_packet'
  );
  const destroyedRecovery = npc.property_transition_profiles.find(
    ({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_destroyed_packet_recovered_to_player'
  );
  const completionProjection = completion.committed_property_state_projection_inputs.find(
    ({ projection_id }) => projection_id === 'trace_ld_v1_projection_destroyed_packet_to_completion_facts'
  );
  const partial = completion.completion_states.find(
    ({ completion_state_id }) => completion_state_id === 'trace_ld_v1_completion_partial'
  );
  assert.deepEqual(destructionConsequence.committed_property_state_projection.requires_committed_state, destruction.writes);
  assert.deepEqual(completionProjection.requires_committed_state, destruction.writes);
  assert.deepEqual(completionProjection.projected_committed_facts, destructionConsequence.committed_fact_outputs);
  assert.equal(destroyedVariant.requires_committed_state.bag_closure_state, 'open');
  assert.equal(destroyedVariant.ordered_transition_stages.at(-1).property_transition_ref, destroyedRecovery.transition_profile_id);
  assert.equal(destroyedRecovery.requires.seal_state, 'destroyed');
  assert.equal(destroyedRecovery.writes.seal_state, 'preserve_destroyed');
  assert.ok(completionProjection.projected_committed_facts.every((fact) => completion.completion_dimensions.some(
    ({ values }) => values.some(
      ({ when_any_of_committed_facts: inputs }) => inputs?.includes(fact)
    )
  )));
  const completedFacts = new Set([
    ...completionProjection.projected_committed_facts,
    ...activities.consequence_profiles.find(
      ({ consequence_id }) => consequence_id === 'trace_ld_v1_consequence_destroyed_packet_state_observed'
    ).committed_fact_outputs,
    'temporary_disposition_outcome_committed'
  ]);
  assert.equal(partial.all_of_committed_facts.every((fact) => completedFacts.has(fact)), true);
  assert.equal(Object.hasOwn(partial, 'any_of_committed_facts'), false);
});

test('completion fact provenance closes every input over exact internal or typed external sources', () => {
  const completion = readJson(source, 'completion-rules.json');
  const completionFacts = new Set();
  for (const state of completion.completion_states) {
    for (const field of ['all_of_committed_facts', 'any_of_committed_facts', 'none_of_committed_facts']) {
      for (const fact of state[field] ?? []) completionFacts.add(fact);
    }
  }
  for (const dimension of completion.completion_dimensions) {
    for (const value of dimension.values) {
      for (const fact of value.when_any_of_committed_facts ?? []) completionFacts.add(fact);
    }
  }
  const provenanceFacts = [
    ...completion.completion_fact_provenance.internal_producers,
    ...completion.completion_fact_provenance.external_committed_sources
  ].flatMap(({ fact_ids }) => fact_ids);
  assert.deepEqual([...new Set(provenanceFacts)].sort(), [...completionFacts].sort());
  assert.equal(completion.completion_fact_provenance.undeclared_fact_policy, 'forbidden');
});

test('external completion sources resolve to actual 0C outputs, arrival observation, and exact NPC consequence facts', () => {
  const completion = readJson(source, 'completion-rules.json');
  const activities = readJson(source, 'activity-check-consequence-profiles.json');
  const body = readJson(source, 'body-environment-profiles.json');
  const evidence = JSON.parse(readFileSync(resolve(
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0c/clue-evidence-graph-set.json'
  ), 'utf8'));
  const external = new Map(completion.completion_fact_provenance.external_committed_sources.map(
    (entry) => [entry.source_ref, entry]
  ));
  const evidenceOutputs = new Set([
    ...evidence.conclusions.map((conclusionId) => `conclusion:${conclusionId}`),
    ...evidence.principal_inference_policy.cross_chain_inference.approved_combinations.map(({ outcome_ref }) => outcome_ref),
    ...evidence.principal_inference_policy.partial_outcomes.map(
      ({ partial_outcome_id }) => `partial_outcome:${partial_outcome_id}`
    )
  ]);
  const evidenceSource = external.get('trace_ld_v1_clue_evidence_graph_set');
  assert.deepEqual(evidenceSource.fact_ids, [
    'conclusion:physical_attack_pattern',
    'conclusion:ratsha_participated',
    'conclusion:principal_zhdanko',
    'partial_outcome:trace_ld_v1_principal_without_direct_voice'
  ]);
  assert.equal(evidenceSource.fact_ids.every((fact) => evidenceOutputs.has(fact)), true);

  const bodyProjection = external.get('trace_ld_v1_observation_onisim_alive_at_drying_shed');
  const observation = activities.scene_observation_profiles.find(
    ({ profile_id }) => profile_id === bodyProjection.source_ref
  );
  const condition = body.condition_profiles.find(
    ({ condition_profile_id }) => condition_profile_id === observation.trigger.subject_body_condition_ref
  );
  assert.equal(condition.subject, bodyProjection.requires_source_subject);
  assert.deepEqual(
    new Set(bodyProjection.requires_any_committed_source_state),
    new Set([condition.state, ...condition.permitted_transitions.filter((state) => state === 'stabilized_unable_to_walk')])
  );
  assert.equal(bodyProjection.source_consequence_ref, observation.producer_consequence_ref);
  assert.equal(bodyProjection.requires_route_terminal_commit_ref, observation.trigger.route_terminal_commit_ref);
  assert.equal(bodyProjection.treatment_dependency, 'forbidden');
  assert.deepEqual(bodyProjection.fact_ids, ['onisim_found_alive']);
  assert.equal(bodyProjection.unmapped_death_state_policy, 'fail_closed_no_dead_completion_value');

  for (const [producerRef, expectedFact] of [
    ['trace_ld_v1_consequence_zhdanko_submission_committed', 'zhdanko_submission_committed'],
    ['trace_ld_v1_consequence_bounded_group_disarm_committed', 'zhdanko_disarmed_and_temporarily_restrained']
  ]) {
    const producer = completion.completion_fact_provenance.internal_producers.find(
      ({ producer_ref }) => producer_ref === producerRef
    );
    const consequence = activities.consequence_profiles.find(({ consequence_id }) => consequence_id === producerRef);
    assert.deepEqual(producer.source_output_fact_ids, consequence.committed_fact_outputs);
    assert.deepEqual(producer.fact_ids, [expectedFact]);
    assert.equal(consequence.committed_fact_outputs.includes(expectedFact), true);
  }
});

test('epilogue hides unobserved packet destruction and reveals it only after committed observation', () => {
  const epilogue = readJson(source, 'epilogue-rules.json');
  const projection = epilogue.objective_to_player_visible_projection;
  const projectDimension = (dimensionId, objectiveValueId, visibleFacts) => {
    const rule = projection.dimension_projection_rules.find(({ dimension_id }) => dimension_id === dimensionId);
    const valueRule = rule.objective_value_visibility.find(({ objective_value_id }) => objective_value_id === objectiveValueId);
    return visibleFacts.has(valueRule.requires_visible_committed_fact)
      ? valueRule.visible_value_id
      : rule.unobserved_value_id;
  };
  const unobservedFacts = new Set();
  assert.equal(projectDimension('packet_state', 'lost_or_destroyed', unobservedFacts), 'unresolved');
  assert.equal(projectDimension('seal_state', 'damaged', unobservedFacts), 'unresolved');
  const observedFacts = new Set(['destroyed_packet_state_observed', 'destroyed_seal_state_observed']);
  assert.equal(projectDimension('packet_state', 'lost_or_destroyed', observedFacts), 'lost_or_destroyed');
  assert.equal(projectDimension('seal_state', 'damaged', observedFacts), 'damaged');
  assert.equal(epilogue.terminal_projection_allowlist.includes('committed_property_state'), false);
  assert.equal(epilogue.terminal_projection_allowlist.includes('visible_committed_property_projection'), true);
  assert.deepEqual(epilogue.narration_input_schema.required, [
    'visible_completion_state',
    'visible_completion_dimensions',
    'visible_committed_facts',
    'elapsed_game_time'
  ]);
});

test('Zhdanko autonomous schedule fails closed on incomplete or invented execution semantics', async (t) => {
  await t.test('schedule option loses execution binding', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      delete value.schedule_policies[0].option_set[0].execution_binding_ref;
    }));
    assertRejected(result, /TRACE_0D_SCHEDULE_EXECUTION_REF/);
  });
  await t.test('execution binding points to unknown activity', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.schedule_execution_bindings[0].activity_profile_ref = 'unknown_activity';
    }));
    assertRejected(result, /TRACE_0D_SCHEDULE_EXECUTION/);
  });
  await t.test('execution binding points to wrong time profile', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.schedule_execution_bindings[0].time_profile_ref = 'trace_ld_v1_time_2m';
    }));
    assertRejected(result, /TRACE_0D_SCHEDULE_EXECUTION_CHAIN/);
  });
  await t.test('execution binding points to unknown consequence', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.schedule_execution_bindings[0].consequence_ref = 'unknown_consequence';
    }));
    assertRejected(result, /TRACE_0D_SCHEDULE_EXECUTION/);
  });
  await t.test('boat preparation cannot handle already-at-river actor state', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.schedule_execution_bindings.find(({ schedule_option_id }) => schedule_option_id === 'prepare_boat').movement_selection.closed_variants.river_access = 'trace_ld_v1_local_transition_storehouse_to_river_access';
    }));
    assertRejected(result, /TRACE_0D_PREPARE_BOAT_MOVEMENT/);
  });
  await t.test('bag movement omits the moving actor', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.schedule_execution_bindings.find(({ schedule_option_id }) => schedule_option_id === 'move_bag').movement_subject_refs.shift();
    }));
    assertRejected(result, /TRACE_0D_MOVE_BAG_SUBJECTS/);
  });
  await t.test('bag resource loses its exact opening zone', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.schedule_resource_bindings.find(({ resource_binding_id }) => resource_binding_id.endsWith('road_bag')).opening_zone_ref = 'unknown_zone';
    }));
    assertRejected(result, /TRACE_0D_SCHEDULE_BAG_RESOURCE/);
  });
  await t.test('packet no longer inherits bag position', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.schedule_resource_bindings.find(({ resource_binding_id }) => resource_binding_id.endsWith('sealed_packet')).physical_position_rule = 'independent_position';
    }));
    assertRejected(result, /TRACE_0D_SCHEDULE_PACKET_RESOURCE/);
  });
  await t.test('bag move loses contained-item inheritance', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.property_transition_profiles.find(({ transition_profile_id }) => transition_profile_id.endsWith('bag_to_river_access')).contained_item_effect = 'none';
    }));
    assertRejected(result, /TRACE_0D_BAG_MOVE_TRANSITION/);
  });
  await t.test('departure invents an external location', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => {
      value.active_scope_exit_bindings[0].destination_contract.destination_location_ref = 'invented_escape_harbor';
    }));
    assertRejected(result, /TRACE_0D_SCOPE_EXIT/);
  });
  await t.test('departure records fled before terminal commit', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => {
      value.active_scope_exit_bindings[0].terminal_fact_timing = 'at_activity_start';
    }));
    assertRejected(result, /TRACE_0D_SCOPE_EXIT/);
  });
  await t.test('departure load state selects the wrong property transition', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => {
      value.active_scope_exit_bindings[0].departure_load_variants[0].committed_load_state = 'bag_loaded';
    }));
    assertRejected(result, /TRACE_0D_SCOPE_EXIT_VARIANT/);
  });
  await t.test('document destruction detaches packet from its container', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.property_transition_profiles.find(({ transition_profile_id }) => transition_profile_id.endsWith('packet_destroyed')).container_relation_change = 'detach';
    }));
    assertRejected(result, /TRACE_0D_DOCUMENT_DESTRUCTION/);
  });
  await t.test('schedule assumes inaccessible packet is already accessible', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      const option = value.schedule_policies[0].option_set.find(({ option_id }) => option_id === 'attempt_document_destruction');
      option.preconditions = ['packet_controlled', 'packet_physically_accessible', 'destruction_means_available', 'no_interrupting_witness_prevents_action'];
    }));
    assertRejected(result, /TRACE_0D_DOCUMENT_DESTRUCTION_PRECONDITION/);
  });
  await t.test('document destruction skips approved bag opening stage', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      const execution = value.schedule_execution_bindings.find(({ schedule_option_id }) => schedule_option_id === 'attempt_document_destruction');
      execution.elapsed_plan.stages.shift();
      execution.property_transition_refs.shift();
    }));
    assertRejected(result, /TRACE_0D_SCHEDULE_ELAPSED_PLAN|TRACE_0D_DOCUMENT_DESTRUCTION_REACHABILITY/);
  });
  await t.test('approved bag opening transition is removed', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.property_transition_profiles = value.property_transition_profiles.filter(
        ({ transition_profile_id }) => transition_profile_id !== 'trace_ld_v1_property_road_bag_opened_for_access'
      );
    }));
    assertRejected(result, /TRACE_0D_PROPERTY_TRANSITION_SET/);
  });
  await t.test('player bag inspection skips approved bag opening stage', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const activity = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
      );
      activity.execution_variant_contract.closed_variants.find(
        ({ variant_id }) => variant_id === 'tied_bag_intact_packet'
      ).ordered_transition_stages.splice(1, 1);
    }));
    assertRejected(result, /TRACE_0D_ACTIVITY_TIME|TRACE_0D_PLAYER_BAG_OPEN_PATH/);
  });
  await t.test('player bag inspection skips control recovery', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const activity = value.activity_profiles.find(({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal');
      activity.execution_variant_contract.closed_variants.find(
        ({ variant_id }) => variant_id === 'tied_bag_intact_packet'
      ).ordered_transition_stages.shift();
    }));
    assertRejected(result, /TRACE_0D_ACTIVITY_TIME|TRACE_0D_PLAYER_BAG_OPEN_PATH/);
  });
  await t.test('road bag recovery accepts physical proximity without an admission basis', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      const recovery = value.property_transition_profiles.find(
        ({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_road_bag_recovered_to_player_control'
      );
      recovery.admission_variants = [{
        variant_id: 'physical_proximity',
        source_holder_ref: 'zhdanko_storehouse_controller',
        source_controller_ref: 'zhdanko_storehouse_controller'
      }];
    }));
    assertRejected(result, /TRACE_0D_BAG_RECOVERY_TRANSITION|TRACE_0D_BAG_RECOVERY_BASIS/);
  });
  await t.test('bounded group recovery loses its executable admission producer', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const activity = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
      );
      activity.recovery_admission_contract.method_variants = activity.recovery_admission_contract.method_variants.filter(
        ({ method_id }) => method_id !== 'bounded_group_recovery'
      );
    }));
    assertRejected(result, /TRACE_0D_BAG_RECOVERY_METHOD/);
  });
  await t.test('bounded group recovery references an unproduced admission fact', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const activity = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
      );
      activity.recovery_admission_contract.method_variants.find(
        ({ method_id }) => method_id === 'bounded_group_recovery'
      ).requires_all_committed_facts[0] = 'group_response_admitted';
    }));
    assertRejected(result, /TRACE_0D_BAG_RECOVERY_METHOD|TRACE_0D_BAG_RECOVERY_REACHABILITY/);
  });
  await t.test('bounded group recovery loses the committed axe-control predicate', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const activity = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
      );
      activity.recovery_admission_contract.method_variants.find(
        ({ method_id }) => method_id === 'bounded_group_recovery'
      ).requires_committed_property_predicates[0].source_transition_ref = 'unknown_transition';
    }));
    assertRejected(result, /TRACE_0D_BAG_RECOVERY_REACHABILITY/);
  });
  await t.test('optional carrier assignment becomes mandatory for inspection completion', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const activity = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
      );
      activity.post_inspection_carrier_contract.inspection_completion_independent_of_carrier_assignment = false;
    }));
    assertRejected(result, /TRACE_0D_PLAYER_BAG_OPEN_PATH/);
  });
  await t.test('intact packet inspection again requires the optional fisher transition', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const activity = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
      );
      const variant = activity.execution_variant_contract.closed_variants.find(
        ({ variant_id }) => variant_id === 'tied_bag_intact_packet'
      );
      const finalStage = variant.ordered_transition_stages.at(-1);
      finalStage.property_transition_refs = [
        finalStage.property_transition_ref,
        'trace_ld_v1_property_road_bag_assigned_to_participating_fisher'
      ];
      delete finalStage.property_transition_ref;
    }));
    assertRejected(result, /TRACE_0D_PLAYER_BAG_OPEN_PATH/);
  });
  await t.test('recovery admission allows proximity as a method', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const activity = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
      );
      activity.recovery_admission_contract.physical_proximity_alone_is_insufficient = false;
    }));
    assertRejected(result, /TRACE_0D_BAG_RECOVERY_METHOD/);
  });
  await t.test('road bag recovery changes Savva ownership', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      const recovery = value.property_transition_profiles.find(
        ({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_road_bag_recovered_to_player_control'
      );
      recovery.requires_common.owner_ref = 'player_clerk';
    }));
    assertRejected(result, /TRACE_0D_BAG_RECOVERY_TRANSITION/);
  });
  await t.test('road bag recovery does not propagate control to contained items', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      const recovery = value.property_transition_profiles.find(
        ({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_road_bag_recovered_to_player_control'
      );
      recovery.contained_item_effect = 'preserve_previous_holder_and_controller';
    }));
    assertRejected(result, /TRACE_0D_BAG_RECOVERY_TRANSITION/);
  });
  await t.test('road bag recovery accepts an unknown source controller', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      const recovery = value.property_transition_profiles.find(
        ({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_road_bag_recovered_to_player_control'
      );
      recovery.admission_variants.find(({ variant_id }) => variant_id === 'voluntary_handover').source_controller_ref = 'unknown_controller';
    }));
    assertRejected(result, /TRACE_0D_BAG_RECOVERY_BASIS/);
  });
  await t.test('packet destruction ignores parent closure state', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      delete value.property_transition_profiles.find(({ transition_profile_id }) => transition_profile_id.endsWith('packet_destroyed')).requires.parent_closure_state;
    }));
    assertRejected(result, /TRACE_0D_DOCUMENT_DESTRUCTION/);
  });
  await t.test('destroyed packet observation path is removed', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const activity = value.activity_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
      );
      activity.execution_variant_contract.closed_variants = activity.execution_variant_contract.closed_variants.filter(
        ({ variant_id }) => variant_id !== 'open_bag_destroyed_packet'
      );
    }));
    assertRejected(result, /TRACE_0D_PLAYER_BAG_OPEN_PATH/);
  });
  await t.test('destroyed packet recovery requires an intact seal', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.property_transition_profiles.find(
        ({ transition_profile_id }) => transition_profile_id === 'trace_ld_v1_property_destroyed_packet_recovered_to_player'
      ).requires.seal_state = 'intact';
    }));
    assertRejected(result, /TRACE_0D_RECOVERED_PROPERTY_ALLOCATION/);
  });
  await t.test('destroyed property state no longer projects completion facts', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const consequence = value.consequence_profiles.find(
        ({ consequence_id }) => consequence_id === 'trace_ld_v1_consequence_zhdanko_document_destroyed'
      );
      consequence.committed_property_state_projection.committed_fact_outputs.pop();
    }));
    assertRejected(result, /TRACE_0D_DESTROYED_PACKET_PROJECTION/);
  });
  await t.test('schedule execution adds a second elapsed clock write', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.schedule_execution_bindings[0].write_targets.push('elapsed_game_time');
    }));
    assertRejected(result, /TRACE_0D_SCHEDULE_EXECUTION|TRACE_0D_SCHEDULE_ELAPSED_PLAN/);
  });
  await t.test('movement child claims its own elapsed clock write', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => {
      value.local_transition_bindings[0].elapsed_accounting.parent_execution_roles.trace_ld_v1_schedule_execution_prepare_boat.clock_write = 'single';
    }));
    assertRejected(result, /TRACE_0D_LOCAL_TRANSITION/);
  });
  await t.test('movement-root execution also writes elapsed time', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      value.schedule_execution_bindings.find(({ schedule_option_id }) => schedule_option_id === 'move_bag').write_targets.push('elapsed_game_time');
    }));
    assertRejected(result, /TRACE_0D_SCHEDULE_ELAPSED_PLAN/);
  });
  await t.test('boat preparation treats child movement as additive time', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => {
      const prepare = value.schedule_execution_bindings.find(({ schedule_option_id }) => schedule_option_id === 'prepare_boat');
      prepare.elapsed_plan.closed_variants.storehouse_interior.total_minutes = 15;
    }));
    assertRejected(result, /TRACE_0D_SCHEDULE_ELAPSED_PLAN|TRACE_0D_PREPARE_BOAT_ELAPSED/);
  });
});

test('unknown deferred ref reopens the package and fails closed', () => {
  const result = withFixture((directory) => mutateJson(directory, 'definition.json', (value) => {
    value.required_unresolved_refs = [{ category: 'invented_future_policy', resolution_status: 'unresolved' }];
  }));
  assertRejected(result, /TRACE_0D_UNRESOLVED/);
});

test('movement, access and capacity reject broken physical contracts', async (t) => {
  await t.test('unknown endpoint', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => { value.route_bindings[0].destination_endpoint = 'unknown'; }));
    assertRejected(result, /TRACE_0D_ROUTE_ENDPOINT/);
  });
  await t.test('zero route duration', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => { value.route_bindings[0].duration_minutes = 0; }));
    assertRejected(result, /TRACE_0D_ROUTE_TIME/);
  });
  await t.test('Onisim teleports independently', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => {
      value.route_bindings.find(({ route_id }) => route_id.includes('carry_onisim')).carried_actor_rules.independent_movement = 'allowed';
    }));
    assertRejected(result, /TRACE_0D_CARRY_TELEPORT/);
  });
  await t.test('carry hard-codes Mikula as required carrier', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      const activity = value.activity_profiles.find(({ profile_id }) => profile_id === 'trace_ld_v1_activity_make_stretcher_and_carry');
      activity.participant_slots.required.push('player_clerk');
    }));
    assertRejected(result, /TRACE_0D_CARRY_ACTIVITY/);
  });
  await t.test('carry lacks replacement candidate', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => {
      value.route_bindings.find(({ route_id }) => route_id.includes('carry_onisim')).carried_actor_rules.carrier_candidate_slots.pop();
    }));
    assertRejected(result, /TRACE_0D_CARRY_CONTRACT/);
  });
  await t.test('carry replacement resets elapsed time', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => {
      value.route_bindings.find(({ route_id }) => route_id.includes('carry_onisim')).carried_actor_rules.carrier_rebinding.preserve_committed_elapsed = false;
    }));
    assertRejected(result, /TRACE_0D_CARRY_REBINDING/);
  });
  await t.test('carry replacement resets route progress', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => {
      value.route_bindings.find(({ route_id }) => route_id.includes('carry_onisim')).carried_actor_rules.carrier_rebinding.preserve_committed_route_progress = false;
    }));
    assertRejected(result, /TRACE_0D_CARRY_REBINDING/);
  });
  await t.test('carry replacement skips load recalculation', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => {
      value.route_bindings.find(({ route_id }) => route_id.includes('carry_onisim')).carried_actor_rules.carrier_rebinding.load_recalculation = 'keep_old_load';
    }));
    assertRejected(result, /TRACE_0D_CARRY_REBINDING/);
  });
  await t.test('carry replacement has no typed failure', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => {
      value.route_bindings.find(({ route_id }) => route_id.includes('carry_onisim')).carried_actor_rules.carrier_rebinding.no_valid_replacement_failure = null;
    }));
    assertRejected(result, /TRACE_0D_CARRY_REBINDING/);
  });
  await t.test('access policy removed', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-access-policies.json', (value) => { value.access_policies.pop(); }));
    assertRejected(result, /TRACE_0D_ACCESS_GAPS|TRACE_0D_DANGER_RETREAT_ACCESS/);
  });
  await t.test('capacity binding has unknown participant', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => { value.capacity_contracts[0].admission_model.allowed_participant_slots.push('unknown_slot'); }));
    assertRejected(result, /TRACE_0D_CAPACITY_SLOT/);
  });
});

test('capacity contracts admit legal branch variation without fixed scene casts', () => {
  const capacity = readJson(source, 'location-capacity-contracts.json');
  const byLocation = new Map(capacity.capacity_contracts.map((contract) => [contract.location_ref, contract]));
  for (const contract of byLocation.values()) {
    assert.equal(contract.admission_model.kind, 'constraint_based');
    assert.equal(Object.hasOwn(contract.admission_model, 'supported_compositions'), false);
    assert.equal(contract.admission_model.location_actor_bounds.min, 0);
  }
  const camp = byLocation.get('trace_ld_v1_loc_fishing_camp').admission_model;
  const shed = byLocation.get('trace_ld_v1_loc_old_drying_shed').admission_model;
  const storehouse = byLocation.get('trace_ld_v1_loc_zhdanko_storehouse').admission_model;
  assert.equal(camp.optional_bindings.includes('onisim_boatman'), true);
  assert.equal(camp.required_bindings.includes('onisim_boatman'), false);
  assert.equal(shed.optional_bindings.includes('ratsha_storehouse_helper'), true);
  assert.equal(shed.required_bindings.includes('ratsha_storehouse_helper'), false);
  assert.equal(storehouse.optional_bindings.includes('zhdanko_storehouse_controller'), true);
  assert.equal(storehouse.required_bindings.includes('zhdanko_storehouse_controller'), false);
  assert.equal(storehouse.optional_bindings.includes('player_clerk'), true);
  assert.equal(storehouse.entry_group_bounds.min, 1);
});

test('capacity contracts reject fixed casts and incomplete constraints', async (t) => {
  await t.test('fixed supported composition returns', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => {
      value.capacity_contracts[0].admission_model.supported_compositions = [['player_clerk']];
    }));
    assertRejected(result, /TRACE_0D_CAPACITY_MODEL/);
  });
  await t.test('unknown social role', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => {
      value.capacity_contracts[0].admission_model.allowed_social_role_refs.push('nov_role_unknown');
    }));
    assertRejected(result, /TRACE_0D_CAPACITY_ROLE/);
  });
  await t.test('required and optional bindings do not cover allowed slots', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => {
      value.capacity_contracts[0].admission_model.optional_bindings.pop();
    }));
    assertRejected(result, /TRACE_0D_CAPACITY_BINDINGS/);
  });
  await t.test('location requires a precomposed cast', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => {
      value.capacity_contracts[0].admission_model.location_actor_bounds.min = 2;
    }));
    assertRejected(result, /TRACE_0D_CAPACITY_EMPTY_LOCATION/);
  });
  await t.test('invalid actor bounds', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => {
      value.capacity_contracts[0].admission_model.location_actor_bounds.max = -1;
    }));
    assertRejected(result, /TRACE_0D_CAPACITY_BOUNDS/);
  });
  await t.test('unknown zone assignment', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => {
      value.capacity_contracts[0].admission_model.zone_assignment.rules[0].allowed_zone_refs = ['unknown_zone'];
    }));
    assertRejected(result, /TRACE_0D_CAPACITY_ZONE_ASSIGNMENT/);
  });
  await t.test('zone assignment uses an unresolved access policy', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => {
      const storehouse = value.capacity_contracts.find(({ location_ref }) => location_ref === 'trace_ld_v1_loc_zhdanko_storehouse');
      storehouse.admission_model.zone_assignment.rules[1].when.policy_ref = 'unknown_access_policy';
    }));
    assertRejected(result, /TRACE_0D_CAPACITY_PREDICATE/);
  });
  await t.test('incompatible combination returns to an opaque string', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => {
      value.capacity_contracts[0].admission_model.incompatible_combinations[0].condition = 'carried_actor_somewhere';
    }));
    assertRejected(result, /TRACE_0D_CAPACITY_PREDICATE/);
  });
  await t.test('carried actor limit admits unknown slot', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => {
      value.capacity_contracts[0].admission_model.carried_actor_limits.allowed_slots.push('unknown_slot');
    }));
    assertRejected(result, /TRACE_0D_CAPACITY_CARRIED/);
  });
  await t.test('audience alias counts as another actor', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => {
      value.capacity_contracts[0].admission_model.binding_identity_rules[0].counts_as_additional_actor = true;
    }));
    assertRejected(result, /TRACE_0D_CAPACITY_IDENTITY/);
  });
  await t.test('overflow has no typed outcome', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => {
      value.capacity_contracts[0].overflow_failure = null;
    }));
    assertRejected(result, /TRACE_0D_CAPACITY_CONTRACT/);
  });
  await t.test('temporary holding permits an unguarded held actor', () => {
    const result = withFixture((directory) => mutateJson(directory, 'location-capacity-contracts.json', (value) => {
      value.transit_and_holding_contracts.find(({ contract_id }) => contract_id.endsWith('temporary_holding')).admission_model.guard_bounds_when_held_actor_present.min = 0;
    }));
    assertRejected(result, /TRACE_0D_CAPACITY_HOLDING/);
  });
});

test('body, promise, completion and epilogue remain separated and bounded', async (t) => {
  await t.test('body profile missing', () => {
    const result = withFixture((directory) => mutateJson(directory, 'body-environment-profiles.json', (value) => { value.effect_profiles.pop(); }));
    assertRejected(result, /TRACE_0D_BODY_PROFILE|TRACE_0D_DECISION_BODY_REF/);
  });
  await t.test('instant Onisim recovery', () => {
    const result = withFixture((directory) => mutateJson(directory, 'body-environment-profiles.json', (value) => {
      value.effect_profiles.find(({ effect_profile_id }) => effect_profile_id.includes('first_aid')).condition_transitions = ['instant_recovery'];
    }));
    assertRejected(result, /TRACE_0D_TREATMENT_BOUNDARY/);
  });
  await t.test('promise uses a separate fisher witness', () => {
    const result = withFixture((directory) => mutateJson(directory, 'promise-policy.json', (value) => { value.witness_binding.required_witness_slots[1] = 'background_fisher_2'; }));
    assertRejected(result, /TRACE_0D_PROMISE_WITNESS/);
  });
  await t.test('promise means pardon', () => {
    const result = withFixture((directory) => mutateJson(directory, 'promise-policy.json', (value) => { value.forbidden_effects = value.forbidden_effects.filter((entry) => entry !== 'pardon'); }));
    assertRejected(result, /TRACE_0D_PROMISE_SCOPE/);
  });
  await t.test('promise fulfilment bypasses the typed temporary disposition', () => {
    const result = withFixture((directory) => mutateJson(directory, 'promise-policy.json', (value) => {
      value.transitions.find(({ to }) => to === 'fulfilled').requires = ['no_summary_killing_or_revenge_committed'];
    }));
    assertRejected(result, /TRACE_0D_PROMISE_ACTIVATION/);
  });
  await t.test('promise activation projection loses the surrender producer', () => {
    const result = withFixture((directory) => mutateJson(directory, 'promise-policy.json', (value) => {
      value.lifecycle_input_projections.find(
        ({ projection_id }) => projection_id === 'trace_ld_v1_projection_surrender_to_promise_activation_basis'
      ).source_producer_ref = 'unknown_surrender_producer';
    }));
    assertRejected(result, /TRACE_0D_PROMISE_PROJECTION/);
  });
  await t.test('promise fulfilment projection loses its factual disposition input', () => {
    const result = withFixture((directory) => mutateJson(directory, 'promise-policy.json', (value) => {
      value.lifecycle_input_projections.find(
        ({ projection_id }) => projection_id === 'trace_ld_v1_projection_disposition_to_promise_fulfillment_basis'
      ).source_committed_facts = ['temporary_disposition_outcome_committed'];
    }));
    assertRejected(result, /TRACE_0D_PROMISE_PROJECTION/);
  });
  await t.test('promise breach projection loses its typed breach producer', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.temporary_disposition_contracts[0].promise_options.find(
        ({ option_id }) => option_id === 'commit_scope_breach_for_active_promise'
      ).committed_fact_output = 'unproduced_breach_fact';
    }));
    assertRejected(result, /TRACE_0D_TEMPORARY_DISPOSITION|TRACE_0D_PROMISE_PROJECTION/);
  });
  await t.test('full completion is admitted while promise remains active', () => {
    const result = withFixture((directory) => {
      mutateJson(directory, 'promise-policy.json', (value) => {
        value.completion_gate_projection.allowed_current_state_facts.push('promise_current_active');
        value.completion_gate_projection.forbidden_current_state_facts =
          value.completion_gate_projection.forbidden_current_state_facts.filter((fact) => fact !== 'promise_current_active');
      });
    });
    assertRejected(result, /TRACE_0D_PROMISE_COMPLETION_GATE/);
  });
  await t.test('full completion drops the terminal promise-state gate', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.completion_states.find(
        ({ completion_state_id }) => completion_state_id === 'trace_ld_v1_completion_full'
      ).all_of_committed_facts = value.completion_states.find(
        ({ completion_state_id }) => completion_state_id === 'trace_ld_v1_completion_full'
      ).all_of_committed_facts.filter((fact) => fact !== 'promise_state_admitted_for_full_completion');
    }));
    assertRejected(result, /TRACE_0D_FULL_COMPLETION|TRACE_0D_COMPLETION_PROVENANCE/);
  });
  await t.test('promise transition retains the superseded active current-state fact', () => {
    const result = withFixture((directory) => mutateJson(directory, 'promise-policy.json', (value) => {
      value.transitions.find(({ to }) => to === 'fulfilled').current_state_projection.replace_previous_projection = false;
    }));
    assertRejected(result, /TRACE_0D_PROMISE_ACTIVATION/);
  });
  await t.test('promise history event is reused as its current state', () => {
    const result = withFixture((directory) => mutateJson(directory, 'promise-policy.json', (value) => {
      const transition = value.transitions.find(({ to }) => to === 'broken');
      transition.current_state_projection.next_fact = transition.history_event_output;
    }));
    assertRejected(result, /TRACE_0D_PROMISE_ACTIVATION|TRACE_0D_COMPLETION_PRODUCER/);
  });
  await t.test('temporary disposition reads stale promise history instead of current state', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.temporary_disposition_contracts[0].promise_options.find(
        ({ option_id }) => option_id === 'preserve_active_no_summary_killing_promise'
      ).required_committed_facts = ['promise_activated'];
    }));
    assertRejected(result, /TRACE_0D_TEMPORARY_DISPOSITION/);
  });
  await t.test('completion consumes append-only promise history', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.completion_dimensions.find(({ dimension_id }) => dimension_id === 'promise_state')
        .values.find(({ value_id }) => value_id === 'broken')
        .when_any_of_committed_facts = ['promise_broken'];
      value.completion_fact_provenance.internal_producers.find(
        ({ producer_ref }) => producer_ref === 'trace_ld_v1_promise_no_summary_killing'
      ).fact_ids = ['promise_current_active', 'promise_current_fulfilled', 'promise_broken'];
    }));
    assertRejected(result, /TRACE_0D_COMPLETION_PROVENANCE|TRACE_0D_COMPLETION_PRODUCER/);
  });
  await t.test('partial evidence automatically completes', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => { value.evidence_resolution_outcome_to_completion_state[1].never_automatic = false; }));
    assertRejected(result, /TRACE_0D_EVIDENCE_COMPLETION/);
  });
  await t.test('completion comes from one check', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => { value.separation_rules.one_check_outcome_is_insufficient = false; }));
    assertRejected(result, /TRACE_0D_COMPLETION_SEPARATION/);
  });
  await t.test('completion loses the destroyed packet state projection', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.committed_property_state_projection_inputs = value.committed_property_state_projection_inputs.filter(
        ({ projection_id }) => projection_id !== 'trace_ld_v1_projection_destroyed_packet_to_completion_facts'
      );
    }));
    assertRejected(result, /TRACE_0D_DESTROYED_PACKET_COMPLETION_INPUT/);
  });
  await t.test('intact packet projection invents a different completion fact', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.committed_property_state_projection_inputs.find(
        ({ projection_id }) => projection_id === 'trace_ld_v1_projection_intact_packet_to_completion_facts'
      ).projected_committed_facts[0] = 'sealed_packet_unknown_fact';
    }));
    assertRejected(result, /TRACE_0D_INTACT_PACKET_COMPLETION_INPUT|TRACE_0D_COMPLETION_PROVENANCE/);
  });
  await t.test('intact packet consequence omits the seal fact', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.consequence_profiles.find(
        ({ consequence_id }) => consequence_id === 'trace_ld_v1_consequence_intact_packet_returned_and_seal_observed'
      ).committed_fact_outputs.pop();
    }));
    assertRejected(result, /TRACE_0D_INTACT_PACKET_PROJECTION|TRACE_0D_INTACT_PACKET_COMPLETION_INPUT/);
  });
  await t.test('full completion restores the abstract seal alias', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      const full = value.completion_states.find(
        ({ completion_state_id }) => completion_state_id === 'trace_ld_v1_completion_full'
      );
      full.all_of_committed_facts[full.all_of_committed_facts.indexOf('seal_intact')] = 'seal_state_established';
    }));
    assertRejected(result, /TRACE_0D_FULL_COMPLETION/);
  });
  await t.test('full evidence mapping restores an abstract packet alias', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      const mapping = value.evidence_resolution_outcome_to_completion_state.find(
        ({ evidence_outcome }) => evidence_outcome === 'conclusion:principal_zhdanko'
      );
      mapping.additional_committed_facts_required[
        mapping.additional_committed_facts_required.indexOf('sealed_packet_returned')
      ] = 'packet_return_state';
    }));
    assertRejected(result, /TRACE_0D_EVIDENCE_COMPLETION/);
  });
  await t.test('completion input loses its exact producer', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.completion_fact_provenance.internal_producers.find(
        ({ producer_ref }) => producer_ref === 'trace_ld_v1_consequence_intact_packet_returned_and_seal_observed'
      ).fact_ids.pop();
    }));
    assertRejected(result, /TRACE_0D_COMPLETION_PROVENANCE|TRACE_0D_COMPLETION_PRODUCER/);
  });
  await t.test('0C completion source references a renamed outcome absent from the pinned graph', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.completion_fact_provenance.external_committed_sources.find(
        ({ source_ref }) => source_ref === 'trace_ld_v1_clue_evidence_graph_set'
      ).fact_ids[0] = 'conclusion:renamed_physical_attack_pattern';
    }));
    assertRejected(result, /TRACE_0D_COMPLETION_PROVENANCE|TRACE_0D_COMPLETION_EXTERNAL_SOURCE/);
  });
  await t.test('Onisim alive projection references an unknown body condition record', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => {
      value.scene_observation_profiles.find(
        ({ profile_id }) => profile_id === 'trace_ld_v1_observation_onisim_alive_at_drying_shed'
      ).trigger.subject_body_condition_ref = 'trace_ld_v1_condition_unknown_onisim_state';
    }));
    assertRejected(result, /TRACE_0D_SCENE_OBSERVATION|TRACE_0D_COMPLETION_EXTERNAL_SOURCE/);
  });
  await t.test('unreachable Onisim death fact returns to completion space', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.completion_states.find(
        ({ completion_state_id }) => completion_state_id === 'trace_ld_v1_completion_partial'
      ).any_of_committed_facts = ['onisim_dead'];
      value.completion_dimensions.find(
        ({ dimension_id }) => dimension_id === 'onisim_fate'
      ).values.splice(1, 0, { value_id: 'dead', when_any_of_committed_facts: ['onisim_dead'] });
    }));
    assertRejected(result, /TRACE_0D_COMPLETION_COVERAGE|TRACE_0D_COMPLETION_PROVENANCE|TRACE_0D_COMPLETION_EXTERNAL_SOURCE/);
  });
  await t.test('Zhdanko presence source no longer matches its consequence outputs', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.completion_fact_provenance.internal_producers.find(
        ({ producer_ref }) => producer_ref === 'trace_ld_v1_consequence_zhdanko_submission_committed'
      ).source_output_fact_ids = ['zhdanko_held'];
    }));
    assertRejected(result, /TRACE_0D_COMPLETION_PRODUCER/);
  });
  await t.test('promise lifecycle omits its current-state completion fact', () => {
    const result = withFixture((directory) => mutateJson(directory, 'promise-policy.json', (value) => {
      delete value.transitions.find(({ to }) => to === 'active').current_state_projection.next_fact;
    }));
    assertRejected(result, /TRACE_0D_PROMISE_ACTIVATION|TRACE_0D_COMPLETION_PRODUCER/);
  });
  await t.test('completion returns to ambiguous single selected state', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.selected_completion_state = null;
    }));
    assertRejected(result, /TRACE_0D_COMPLETION_INSTANCE/);
  });
  await t.test('completion drops an independent outcome dimension', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.completion_dimensions.pop();
    }));
    assertRejected(result, /TRACE_0D_COMPLETION_COMPOSITION/);
  });
  await t.test('completion maps one committed fact to conflicting values', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      const dimension = value.completion_dimensions.find(({ dimension_id }) => dimension_id === 'seal_state');
      dimension.values.find(({ value_id }) => value_id === 'intact').when_any_of_committed_facts.push('seal_damaged');
    }));
    assertRejected(result, /TRACE_0D_COMPLETION_DIMENSION/);
  });
  await t.test('completion changes primary state precedence', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.completion_outcome_model.primary_state_precedence.reverse();
    }));
    assertRejected(result, /TRACE_0D_COMPLETION_COMPOSITION/);
  });
  await t.test('partial completion is narrowed back to degradation flags', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.completion_states.find(
        ({ completion_state_id }) => completion_state_id === 'trace_ld_v1_completion_partial'
      ).any_of_committed_facts = ['seal_damaged', 'zhdanko_fled'];
    }));
    assertRejected(result, /TRACE_0D_COMPLETION_COVERAGE/);
  });
  await t.test('primary state selection runs before dimension conflict validation', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.completion_outcome_model.evaluation_order.reverse();
    }));
    assertRejected(result, /TRACE_0D_COMPLETION_COMPOSITION/);
  });
  await t.test('fact absence is allowed to synthesize a negative dimension value', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      value.completion_outcome_model.primary_state_partition_policy.negative_fact_inference_from_absence = 'allowed';
    }));
    assertRejected(result, /TRACE_0D_COMPLETION_COMPOSITION/);
  });
  await t.test('full completion admits a damaged seal dimension', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => {
      const full = value.completion_states.find(({ completion_state_id }) => completion_state_id === 'trace_ld_v1_completion_full');
      full.none_of_committed_facts = full.none_of_committed_facts.filter((fact) => fact !== 'seal_damaged');
    }));
    assertRejected(result, /TRACE_0D_FULL_COMPLETION/);
  });
  await t.test('epilogue omits composite dimensions', () => {
    const result = withFixture((directory) => mutateJson(directory, 'epilogue-rules.json', (value) => {
      value.allowed_completion_dimensions.pop();
    }));
    assertRejected(result, /TRACE_0D_EPILOGUE_COMPLETION/);
  });
  await t.test('epilogue exposes unobserved destroyed packet state', () => {
    const result = withFixture((directory) => mutateJson(directory, 'epilogue-rules.json', (value) => {
      const rule = value.objective_to_player_visible_projection.dimension_projection_rules.find(
        ({ dimension_id }) => dimension_id === 'packet_state'
      ).objective_value_visibility.find(({ objective_value_id }) => objective_value_id === 'lost_or_destroyed');
      rule.requires_visible_committed_fact = 'packet_lost_or_destroyed';
    }));
    assertRejected(result, /TRACE_0D_EPILOGUE_VISIBILITY/);
  });
  await t.test('epilogue exposes unobserved damaged seal state', () => {
    const result = withFixture((directory) => mutateJson(directory, 'epilogue-rules.json', (value) => {
      const rule = value.objective_to_player_visible_projection.dimension_projection_rules.find(
        ({ dimension_id }) => dimension_id === 'seal_state'
      ).objective_value_visibility.find(({ objective_value_id }) => objective_value_id === 'damaged');
      rule.requires_visible_committed_fact = 'seal_damaged';
    }));
    assertRejected(result, /TRACE_0D_EPILOGUE_VISIBILITY/);
  });
  await t.test('epilogue allowlist admits raw committed property state', () => {
    const result = withFixture((directory) => mutateJson(directory, 'epilogue-rules.json', (value) => {
      value.terminal_projection_allowlist.push('committed_property_state');
    }));
    assertRejected(result, /TRACE_0D_HIDDEN_PROJECTION|TRACE_0D_EPILOGUE_ALLOWLIST/);
  });
  await t.test('narration takes raw objective completion dimensions', () => {
    const result = withFixture((directory) => mutateJson(directory, 'epilogue-rules.json', (value) => {
      value.narration_input_schema.required.push('completion_dimensions');
    }));
    assertRejected(result, /TRACE_0D_EPILOGUE_COMPLETION/);
  });
  await t.test('narration writes factual state', () => {
    const result = withFixture((directory) => mutateJson(directory, 'epilogue-rules.json', (value) => { value.narration_factual_writes = 'allowed'; }));
    assertRejected(result, /TRACE_0D_NARRATION_WRITE/);
  });
  await t.test('epilogue invents court punishment', () => {
    const result = withFixture((directory) => mutateJson(directory, 'epilogue-rules.json', (value) => { value.forbidden_claims = value.forbidden_claims.filter((entry) => entry !== 'punishment_without_committed_authority_and_policy'); }));
    assertRejected(result, /TRACE_0D_EPILOGUE_BOUNDARY/);
  });
});

test('fallback, aliases, automatic normalization, runtime handlers and boatman changes fail closed', async (t) => {
  await t.test('fallback', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => { value.fallback_policy = 'permitted'; }));
    assertRejected(result, /TRACE_0D_SEMANTIC_FALLBACK/);
  });
  await t.test('alias', () => {
    const result = withFixture((directory) => mutateJson(directory, 'movement-bindings.json', (value) => { value.alias_map = {}; }));
    assertRejected(result, /TRACE_0D_SEMANTIC_FALLBACK/);
  });
  await t.test('automatic normalization', () => {
    const result = withFixture((directory) => mutateJson(directory, 'npc-decision-schedule-policies.json', (value) => { value.automatic_normalization = true; }));
    assertRejected(result, /TRACE_0D_SEMANTIC_FALLBACK/);
  });
  await t.test('runtime handler', () => {
    const result = withFixture((directory) => mutateJson(directory, 'activity-check-consequence-profiles.json', (value) => { value.runtime_handler = 'execute'; }));
    assertRejected(result, /TRACE_0D_RUNTIME_BINDING/);
  });
  await t.test('universal quest engine', () => {
    const result = withFixture((directory) => mutateJson(directory, 'completion-rules.json', (value) => { value.quest_engine = {}; }));
    assertRejected(result, /TRACE_0D_RUNTIME_BINDING/);
  });
  await t.test('extra JSON artifact', () => {
    const result = withFixture((directory) => {
      writeJson(directory, 'extra-policy.json', { schema: 'rus.extra.v1' });
    });
    assertRejected(result, /TRACE_0D_EXTRA_ARTIFACT/);
  });
  await t.test('boatman digest', () => {
    const result = withFixture((directory) => mutateJson(directory, 'manifest.json', (value) => { value.legacy_boatman_regression_refs.scenario.digest = '0'.repeat(64); }), { refresh: false });
    assertRejected(result, /TRACE_0D_BOATMAN_REGRESSION/);
  });
});
