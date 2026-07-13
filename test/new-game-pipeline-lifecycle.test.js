import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinalWorldStartBundle,
  composeApprovedStartPosition,
  composeValidatedPlayerSeed,
  createNewGamePipelineContext,
  runStage16ItemPlacement,
  runStage20VisibleContext,
  runStage22NarratorProse,
  runStage15NpcPlacement,
  runStage21VisibleContextAudit,
  validateVisibleHiddenBoundary
} from '../src/world/new-game-pipeline/index.js';

test('validated_player_seed composes deterministically from approved dossier and validated refs', () => {
  const approvedStartPosition = composeApprovedStartPosition({
    validatedG5PositionRefs: {
      region_id: 'region_novgorod_land',
      place_id: 'place_001',
      location_id: 'location_001',
      minilocation_id: 'mini_001',
      anchor_id: 'anchor_001'
    },
    validatedStartSceneRefs: {
      selected_candidate_id: 'candidate_001',
      region_id: 'region_novgorod_land',
      place_id: 'place_001',
      location_id: 'location_001'
    },
    requestId: 'req_seed'
  });
  const result = composeValidatedPlayerSeed({
    approvedPlayerDossier: {
      character_id: 'pc_001',
      attributes: {
        strength: 8,
        agility: 9
      }
    },
    approvedStartPosition: approvedStartPosition.artifact,
    validatedStartSceneRefs: {
      selected_candidate_id: 'candidate_001'
    },
    requestId: 'req_seed'
  });

  assert.equal(approvedStartPosition.pass, true);
  assert.equal(result.pass, true);
  assert.equal(result.artifact.composition_kind, 'deterministic_composition_artifact');
  assert.equal(result.artifact.current_position.anchor_id, 'anchor_001');
  assert.deepEqual(result.artifact.position, result.artifact.current_position);
  assert.equal(result.artifact.player_dossier.character_id, 'pc_001');
});

test('approved_start_position fails when full spatial chain is missing', () => {
  const result = composeApprovedStartPosition({
    validatedG5PositionRefs: {
      region_id: 'region_novgorod_land',
      place_id: 'place_001',
      location_id: 'location_001'
    },
    validatedStartSceneRefs: {}
  });

  assert.equal(result.pass, false);
  assert.ok(result.concerns.every((item) => item.code === 'START_POSITION_CONTRACT_ERROR'));
  assert.ok(result.concerns.some((item) => /anchor_id|minilocation_id/u.test(item.field ?? item.message)));
});

test('validated_player_seed fails when approved_start_position is missing', () => {
  const result = composeValidatedPlayerSeed({
    approvedPlayerDossier: { character_id: 'pc_001' },
    approvedStartPosition: null,
    validatedStartSceneRefs: {}
  });

  assert.equal(result.pass, false);
  assert.ok(result.concerns.some((item) => item.code === 'START_POSITION_CONTRACT_ERROR'));
});

test('validated_player_seed fails on raw dossier position mismatch instead of trusting it', () => {
  const approvedStartPosition = composeApprovedStartPosition({
    validatedG5PositionRefs: {
      region_id: 'region_novgorod_land',
      place_id: 'place_001',
      location_id: 'location_001',
      minilocation_id: 'mini_001',
      anchor_id: 'anchor_001'
    },
    validatedStartSceneRefs: {
      region_id: 'region_novgorod_land',
      place_id: 'place_001',
      location_id: 'location_001'
    }
  });

  const result = composeValidatedPlayerSeed({
    approvedPlayerDossier: {
      character_id: 'pc_001',
      start_position: {
        region_id: 'region_novgorod_land',
        place_id: 'place_001',
        location_id: 'location_001',
        minilocation_id: 'mini_001',
        anchor_id: null
      }
    },
    approvedStartPosition: approvedStartPosition.artifact,
    validatedStartSceneRefs: { selected_candidate_id: 'candidate_001' }
  });

  assert.equal(result.pass, false);
  assert.ok(result.concerns.some((item) => item.code === 'PLAYER_POSITION_MISMATCH'));
});

test('pre dependency gate blocks stage launch before validated player seed is frozen', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_pre_dep' });
  context.setStageOutput(3, { schema: 'historical_frame' });
  context.setStageOutput(7, { schema: 'npc_candidate_set' });
  context.setStageOutput(9, { schema: 'selected_start_node' });
  context.setStageOutput(11, { schema: 'player_character_game_profile' });
  context.setStageOutput(13, { schema: 'g5_scene_graph_draft' });
  context.setStageOutput(14, { schema: 'g5_scene_audit', pass: true });

  await assert.rejects(
    runStage15NpcPlacement(context, {
      executor: async () => ({ schema: 'initial_npc_placement_draft' })
    }),
    /required frozen artifact player_seed_contract is missing/u
  );

  assert.equal(context.getLifecycleState(15).pre_dependency_gate.pass, false);
});

test('pre dependency gate blocks narrator before visible audit', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_narrator_pre_dep' });
  context.setStageOutput(20, { schema: 'visible_context_package' });

  await assert.rejects(
    runStage22NarratorProse(context, {
      executor: async () => ({ schema: 'narrator_starting_prose', prose: 'ok', action_options: [] })
    }),
    /required stage 21 output is missing|pre_dependency_gate/u
  );
});

test('visible context stage fails when temporal_context is missing', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_visible_temporal' });
  context.setStageOutput(3, {
    schema: 'historical_frame',
    clock: { day: 3, hour: 18, minute: 0, time_of_day: 'evening' }
  });
  context.setStageOutput(9, { schema: 'selected_start_node' });
  context.setStageOutput(11, { schema: 'player_character_game_profile' });
  context.setStageOutput(13, { schema: 'g5_scene_graph_draft' });
  context.setStageOutput(14, { schema: 'g5_scene_audit', pass: true });
  context.setStageOutput(15, { schema: 'initial_npc_placement_draft' });
  context.setStageOutput(16, { schema: 'initial_item_placement_draft' });
  context.setStageOutput(17, { schema: 'time_light_consistency_audit', pass: true });
  context.setStageOutput(18, { schema: 'character_knowledge_map' });
  context.setStageOutput(19, { schema: 'full_hidden_scene_state' });

  await assert.rejects(
    runStage20VisibleContext(context, {
      executor: async () => ({
        version: 1,
        schema: 'visible_context_package',
        visible_scene: 'Тихий двор.',
        visible_npc: [],
        visible_objects: [],
        known_context: [],
        uncertainties: [],
        allowed_tensions: [],
        do_not_imply: []
      })
    }),
    /temporal_context is required/u
  );
});

test('visible context stage passes only observable inputs to the builder contract', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_visible_builder_contract' });
  seedVisibleContextDependencies(context);
  let capturedInput = null;

  await runStage20VisibleContext(context, {
    executor: async ({ input }) => {
      capturedInput = structuredClone(input);
      return validVisibleContextStage20Output();
    }
  });

  assert.ok(capturedInput);
  assert.ok(capturedInput.candidate_observations_input);
  assert.ok(capturedInput.visible_context_builder_input);
  assert.equal('master_narrative' in capturedInput.visible_context_builder_input, false);
  assert.equal('visibleNpcs' in capturedInput.visible_context_builder_input, false);
  assert.equal('visibleObjects' in capturedInput.visible_context_builder_input, false);
  assert.equal('npc_reactions' in capturedInput.visible_context_builder_input, false);
  assert.equal('visible_details' in capturedInput.visible_context_builder_input, false);
  assert.equal('playerKnowledge' in capturedInput.visible_context_builder_input, false);
});

test('visible context stage rejects duplicate observable objects from one source path', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_visible_duplicate_objects' });
  seedVisibleContextDependencies(context);

  await assert.rejects(
    runStage20VisibleContext(context, {
      executor: async () => validVisibleContextStage20Output({
        observable_fact_ledger: {
          ...baseObservableLedger(),
          observed_objects: [
            observableObject({ observable_id: 'obs_obj_001', label: 'кошель кожаный', dedupe_key: 'pouch|same', source_path: 'visibleObjects[0]' }),
            observableObject({ observable_id: 'obs_obj_002', label: 'кошель кожаный', dedupe_key: 'pouch|same', source_path: 'visibleObjects[0]' })
          ]
        },
        visible_context_package: validVisibleContextFixture({
          visible_objects: [{ label: 'кошель кожаный' }]
        })
      })
    }),
    /duplicate detected|OBSERVABLE_LEDGER_DUPLICATE_OBJECT/u
  );
});

test('visible context stage rejects scene visible object without visibility basis', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_visible_missing_basis' });
  seedVisibleContextDependencies(context);

  await assert.rejects(
    runStage20VisibleContext(context, {
      executor: async () => validVisibleContextStage20Output({
        observable_fact_ledger: {
          ...baseObservableLedger(),
          observed_objects: [
            observableObject({
              observable_id: 'obs_obj_001',
              label: 'нож рабочий',
              dedupe_key: 'knife|work',
              source_path: 'visibleObjects[0]',
              anchor_id: null,
              location_basis: 'unknown',
              interactable: true,
              projection_policy: {
                allow_in_visible_scene: true,
                allow_in_visible_npc: false,
                allow_in_visible_objects: true,
                allow_as_interactable: true,
                reason: 'ошибочно помечен как interactable'
              }
            })
          ]
        },
        visible_context_package: validVisibleContextFixture({
          visible_objects: [{ label: 'нож рабочий' }]
        })
      })
    }),
    /visibility basis|interactable observed_object/u
  );
});

test('visible context stage keeps carried inventory out of scene visible_objects', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_visible_inventory_mix' });
  seedVisibleContextDependencies(context);

  await assert.rejects(
    runStage20VisibleContext(context, {
      executor: async () => validVisibleContextStage20Output({
        observable_fact_ledger: {
          ...baseObservableLedger(),
          observed_objects: [
            observableObject({
              observable_id: 'obs_obj_001',
              label: 'кошель кожаный',
              dedupe_key: 'pouch|carried',
              source_path: 'inventory[0]',
              object_context: 'carried_inventory',
              projection_policy: {
                allow_in_visible_scene: false,
                allow_in_visible_npc: false,
                allow_in_visible_objects: false,
                allow_as_interactable: false,
                reason: 'предмет при персонаже, не объект сцены'
              }
            })
          ]
        },
        visible_context_package: validVisibleContextFixture({
          visible_objects: [{ label: 'кошель кожаный' }]
        })
      })
    }),
    /not backed by an observable object projection policy/u
  );
});

test('visible context stage does not project rumor knowledge as objective known_context', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_visible_rumor_knowledge' });
  seedVisibleContextDependencies(context);

  await assert.rejects(
    runStage20VisibleContext(context, {
      executor: async () => validVisibleContextStage20Output({
        observable_fact_ledger: {
          ...baseObservableLedger(),
          character_knowledge: [{
            text: 'В Новгороде хлеб дорожает.',
            knowledge_type: 'rumor',
            truth_status: 'believed',
            projection_label: 'персонаж слышал'
          }]
        },
        visible_context_package: validVisibleContextFixture({
          known_context: ['В Новгороде хлеб дорожает.']
        })
      })
    }),
    /not backed by objective character_knowledge/u
  );
});

test('narrator stage fails when prose omits required temporal marker', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_narrator_temporal_marker' });
  context.setStageOutput(20, validVisibleContextFixture({
    temporal_context: {
      moment: 'вечер',
      hour: 18,
      minute: 0,
      light_state: 'сумерки',
      time_markers_allowed: ['вечер', 'сумерки'],
      time_markers_forbidden: ['утро', 'полдень', 'дневной свет'],
      uncertainty_notes: []
    }
  }));
  context.setStageOutput(21, { version: 1, schema: 'visible_context_audit', pass: true, concerns: [], evidence: ['ok'] });

  await assert.rejects(
    runStage22NarratorProse(context, {
      executor: async () => ({
        version: 1,
        schema: 'narrator_starting_prose',
        prose: 'Двор настороженно молчит.',
        action_options: []
      })
    }),
    /allowed temporal marker|temporal_context/u
  );
});

test('npc placement rejects visible NPC without anchor or offscreen cue', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_npc_visible_anchor' });
  context.setStageOutput(3, { schema: 'historical_frame' });
  context.setStageOutput(7, { schema: 'npc_candidate_set' });
  context.setStageOutput(9, { schema: 'selected_start_node' });
  context.setStageOutput(11, { schema: 'player_character_game_profile' });
  context.setStageOutput(13, { schema: 'g5_scene_graph_draft' });
  context.setStageOutput(14, { schema: 'g5_scene_audit', pass: true });
  context.freezeArtifact({
    artifact_id: 'player_seed:req_npc_visible_anchor',
    stage_id: 1401,
    schema: 'player_seed_contract',
    version: 1,
    hash: 'seed',
    frozen_paths: ['root.current_position.anchor_id'],
    produced_by: 'deterministic_composition',
    validation_status: 'passed',
    audit_status: 'not_required',
    dependency_status: 'passed',
    artifact: {
      current_position: {
        region_id: 'region_novgorod_land',
        place_id: 'place_001',
        location_id: 'location_001',
        minilocation_id: 'mini_001',
        anchor_id: 'anchor_001'
      }
    }
  });

  await assert.rejects(
    runStage15NpcPlacement(context, {
      executor: async () => ({
        version: 1,
        schema: 'initial_npc_placement_draft',
        visible_npcs: [{ npc_id: 'npc_001', description: 'Стоит рядом.' }]
      })
    }),
    /visible actor requires placement or offscreen sensory cue/u
  );
});

test('audit stage invalid JSON is classified as semantic_audit_format failure', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_audit_format' });
  context.setStageOutput(20, { schema: 'visible_context_package' });

  await assert.rejects(
    runStage21VisibleContextAudit(context, {
      input: {},
      executor: async () => 'not-json'
    }),
    /invalid JSON/u
  );

  assert.equal(context.getGateResult(21).gate_kind, 'semantic_audit_format');
});

test('visible hidden boundary rejects hidden motive and accepts observable sign', () => {
  const leaked = validateVisibleHiddenBoundary({
    visible_npcs: [{ description: 'Он лжёт и что-то замышляет.' }]
  }, { visiblePaths: ['visible_npcs'] });
  const observable = validateVisibleHiddenBoundary({
    visible_npcs: [{ description: 'Стоит у амбара и держит связку ключей.' }]
  }, { visiblePaths: ['visible_npcs'] });

  assert.equal(leaked.length > 0, true);
  assert.equal(observable.length, 0);
});

test('item placement rejects visible item without placement', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_item_placement' });
  for (const [id, schema] of [[3, 'historical_frame'], [8, 'item_profile_candidate_set'], [9, 'selected_start_node'], [11, 'player_character_game_profile'], [13, 'g5_scene_graph_draft'], [14, 'g5_scene_audit'], [15, 'initial_npc_placement_draft']]) {
    context.setStageOutput(id, { schema, pass: true });
  }
  context.freezeArtifact({
    artifact_id: 'npc:req_item_placement',
    stage_id: 15,
    schema: 'initial_npc_placement_draft',
    version: 1,
    hash: 'npc-hash',
    frozen_paths: ['root.visible_npcs[0].npc_id'],
    produced_by: 'npc_placement',
    validation_status: 'passed',
    audit_status: 'passed',
    dependency_status: 'passed',
    artifact: { visible_npcs: [{ npc_id: 'npc_001', anchor_id: 'anchor_001' }] }
  });

  await assert.rejects(
    runStage16ItemPlacement(context, {
      executor: async () => ({
        version: 1,
        schema: 'initial_item_placement_draft',
        visible_items: [{ item_id: 'item_001', description: 'лежит рядом' }],
        initial_item_placement_audit: { pass: true, blocking_issues: [] }
      })
    }),
    /visible item requires holder\/container\/location\/anchor/u
  );
});

test('repair anti-regression blocks prose repair that nulls current_position', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_repair_null_position' });
  const baseline = {
    version: 1,
    schema: 'initial_npc_placement_draft',
    visible_npcs: [{ npc_id: 'npc_001', anchor_id: 'anchor_001' }],
    current_position: {
      region_id: 'region_novgorod_land',
      place_id: 'place_001',
      location_id: 'location_001',
      minilocation_id: 'mini_001',
      anchor_id: 'anchor_001'
    }
  };
  context.setStageOutput(14, { schema: 'g5_scene_audit', pass: true });
  context.freezeArtifact({
    artifact_id: 'player_seed:req_repair_null_position',
    stage_id: 1401,
    schema: 'player_seed_contract',
    version: 1,
    hash: 'seed',
    frozen_paths: ['root.current_position.anchor_id'],
    produced_by: 'deterministic_composition',
    validation_status: 'passed',
    audit_status: 'not_required',
    dependency_status: 'passed',
    artifact: { current_position: baseline.current_position }
  });
  context.setStageOutput(3, { schema: 'historical_frame' });
  context.setStageOutput(7, { schema: 'npc_candidate_set' });
  context.setStageOutput(9, { schema: 'selected_start_node' });
  context.setStageOutput(11, { schema: 'player_character_game_profile' });
  context.setStageOutput(13, { schema: 'g5_scene_graph_draft' });
  context.setRepairBaseline(15, {
    artifact: {
      ...baseline,
      frozen_paths: ['root.current_position.anchor_id']
    },
    mutable_scope: {
      allowed_mutable_paths: ['root.visible_npcs[0].description'],
      forbidden_mutable_paths: ['root.current_position.anchor_id']
    }
  });

  await assert.rejects(
    runStage15NpcPlacement(context, {
      executor: async () => ({
        ...baseline,
        current_position: null
      })
    }),
    /repair changed unapproved path|repair changed forbidden path/u
  );
});

test('repair output must remain JSON object and cannot be prose summary', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_repair_prose' });
  context.setStageOutput(14, { schema: 'g5_scene_audit', pass: true });
  context.freezeArtifact({
    artifact_id: 'player_seed:req_repair_prose',
    stage_id: 1401,
    schema: 'player_seed_contract',
    version: 1,
    hash: 'seed',
    frozen_paths: ['root.current_position.anchor_id'],
    produced_by: 'deterministic_composition',
    validation_status: 'passed',
    audit_status: 'not_required',
    dependency_status: 'passed',
    artifact: {
      current_position: {
        region_id: 'region_novgorod_land',
        place_id: 'place_001',
        location_id: 'location_001',
        minilocation_id: 'mini_001',
        anchor_id: 'anchor_001'
      }
    }
  });
  context.setStageOutput(3, { schema: 'historical_frame' });
  context.setStageOutput(7, { schema: 'npc_candidate_set' });
  context.setStageOutput(9, { schema: 'selected_start_node' });
  context.setStageOutput(11, { schema: 'player_character_game_profile' });
  context.setStageOutput(13, { schema: 'g5_scene_graph_draft' });
  context.setRepairBaseline(15, {
    artifact: {
      version: 1,
      schema: 'initial_npc_placement_draft',
      visible_npcs: [{ npc_id: 'npc_001', anchor_id: 'anchor_001' }]
    },
    mutable_scope: {
      allowed_mutable_paths: ['root.visible_npcs[0].description'],
      forbidden_mutable_paths: []
    }
  });

  await assert.rejects(
    runStage15NpcPlacement(context, {
      executor: async () => 'Краткое резюме вместо JSON'
    }),
    /JSON object|invalid JSON|wrong schema/u
  );
});

test('final world start bundle includes frozen artifact refs and save plan', () => {
  const context = createNewGamePipelineContext({ requestId: 'req_bundle' });
  context.freezeArtifact({
    artifact_id: 'player_seed:req_bundle',
    stage_id: 1401,
    schema: 'player_seed_contract',
    version: 1,
    hash: 'abc',
    frozen_paths: ['root.current_position.anchor_id'],
    produced_by: 'deterministic_composition',
    validation_status: 'passed',
    audit_status: 'not_required',
    dependency_status: 'passed',
    artifact: { current_position: { anchor_id: 'anchor_001' } }
  });
  context.setStageOutput(13, { schema: 'g5_scene_graph_draft' });
  context.setStageOutput(15, { schema: 'initial_npc_placement_draft' });
  context.setStageOutput(16, { schema: 'initial_item_placement_draft' });
  context.setStageOutput(19, { schema: 'full_hidden_scene_state' });
  context.setStageOutput(20, { schema: 'visible_context_package' });
  context.setStageOutput(22, { schema: 'narrator_starting_prose' });

  const bundle = buildFinalWorldStartBundle(context, { party_db_write_plan: { schema: 'party_db_write_plan' } });
  assert.equal(bundle.schema, 'final_world_start_bundle');
  assert.equal(bundle.artifacts.save_plan.schema, 'party_db_write_plan');
  assert.equal(bundle.frozen_artifact_refs.length, 1);
});

function validVisibleContextFixture(overrides = {}) {
  return {
    version: 1,
    schema: 'visible_context_package',
    temporal_context: {
      moment: 'утро',
      hour: 8,
      minute: 0,
      light_state: 'утренний свет',
      time_markers_allowed: ['утро', 'утренний свет'],
      time_markers_forbidden: ['вечер', 'полдень', 'ночь'],
      uncertainty_notes: []
    },
    visible_scene: 'Двор просыпается.',
    visible_position: { label: 'у ворот' },
    visible_npc: [],
    visible_objects: [],
    sensory_details: [],
    known_context: [],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: [],
    ...overrides
  };
}

function validVisibleContextStage20Output(overrides = {}) {
  const ledger = overrides.observable_fact_ledger ?? baseObservableLedger();
  return {
    version: 1,
    schema: 'visible_context_stage_output',
    observable_fact_ledger: ledger,
    observable_fact_ledger_audit: overrides.observable_fact_ledger_audit ?? {
      version: 1,
      schema: 'observable_fact_ledger_audit',
      pass: true,
      concerns: [],
      evidence: ['observable ledger approved']
    },
    observable_projection_report: overrides.observable_projection_report ?? {
      observed_npc_count: ledger.observed_npcs.length,
      observed_object_count: ledger.observed_objects.length,
      sensory_cue_count: ledger.sensory_cues.length
    },
    observable_dedupe_report: overrides.observable_dedupe_report ?? {
      duplicate_object_paths: [],
      duplicate_sources: []
    },
    rejected_or_unsafe_sources: overrides.rejected_or_unsafe_sources ?? [],
    visible_context_package: overrides.visible_context_package ?? validVisibleContextFixture()
  };
}

function baseObservableLedger() {
  return {
    version: 1,
    schema: 'observable_fact_ledger',
    observed_npcs: [{
      observable_id: 'obs_npc_001',
      source_path: 'materialized_npcs.scene_npcs[0]',
      npc_id: null,
      npc_origin: 'observed_background_npc',
      label: 'двое крестьян',
      observed_behavior: 'чинят телегу',
      visibility: 'visible',
      confidence: 'direct_observation',
      forbidden_inferences: [],
      projection_policy: {
        allow_in_visible_scene: true,
        allow_in_visible_npc: true,
        allow_in_visible_objects: false,
        allow_as_interactable: false,
        reason: 'фигура видна в сцене'
      }
    }],
    observed_objects: [
      observableObject({
        observable_id: 'obs_obj_001',
        label: 'корзина с товаром',
        dedupe_key: 'basket|goods',
        source_path: 'scene.visible_objects[0]',
        anchor_id: 'anchor_001',
        location_basis: 'explicit'
      })
    ],
    sensory_cues: [],
    character_knowledge: [{
      text: 'ночью рынок пустеет',
      knowledge_type: 'social_common_knowledge',
      truth_status: 'confirmed',
      projection_label: 'персонаж знает'
    }],
    uncertainties: [],
    rejected_or_unsafe_sources: []
  };
}

function observableObject(overrides = {}) {
  return {
    observable_id: 'obs_obj_default',
    source_path: 'scene.visible_objects[0]',
    item_id: null,
    label: 'объект',
    count: 1,
    dedupe_key: 'object|default',
    visibility: 'visible',
    anchor_id: 'anchor_001',
    location_basis: 'explicit',
    interactable: false,
    needs_anchor_if_interactable: true,
    object_context: 'scene_object',
    projection_policy: {
      allow_in_visible_scene: true,
      allow_in_visible_npc: false,
      allow_in_visible_objects: true,
      allow_as_interactable: false,
      reason: 'видимый объект сцены'
    },
    duplicate_sources: [],
    ...overrides
  };
}

function seedVisibleContextDependencies(context) {
  context.setStageOutput(3, {
    schema: 'historical_frame',
    clock: { day: 3, hour: 18, minute: 0, time_of_day: 'evening', light_profile: 'сумерки' }
  });
  context.setStageOutput(9, { schema: 'selected_start_node' });
  context.setStageOutput(11, { schema: 'player_character_game_profile' });
  context.setStageOutput(13, { schema: 'g5_scene_graph_draft', current_position: { anchor_id: 'anchor_001' } });
  context.setStageOutput(14, { schema: 'g5_scene_audit', pass: true });
  context.setStageOutput(15, { schema: 'initial_npc_placement_draft' });
  context.setStageOutput(16, { schema: 'initial_item_placement_draft' });
  context.setStageOutput(17, { schema: 'time_light_consistency_audit', pass: true });
  context.setStageOutput(18, { schema: 'character_knowledge_map' });
  context.setStageOutput(19, { schema: 'full_hidden_scene_state' });
}
