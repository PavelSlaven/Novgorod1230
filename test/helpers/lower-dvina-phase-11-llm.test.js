import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalPhase11LlmResponder } from './lower-dvina-phase-11-llm.js';

test('canonical local fixture serves the active S1 descriptor role', async () => {
  const response = await createCanonicalPhase11LlmResponder()({
    model: 'fixture-spatial-semantic-descriptor',
    input: { request_id: 's1-local', approved_envelope: {
      required_semantic_requirements: ['interior_space'] } }
  });
  assert.deepEqual(response, {
    schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: 's1-local',
    name: 'Низкая плетёная загородка',
    description: 'Сырая плетёная загородка у берега, без особого значения.',
    semantic_requirements: ['interior_space']
  });
});

test('canonical combat fixture returns only semantic choices', async () => {
  const response = await createCanonicalPhase11LlmResponder()({
    model: 'fixture-npc-combat-decider', input: {
      npc_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
      decision_reasons: { perceived_changes: [] },
      operation_contract: {
        allowed_intent_kinds: ['hold'], allowed_force_limits: ['avoid_harm'],
        allowed_risk_postures: ['ordinary'], engageable_actor_refs: [],
        controllable_actor_refs: [], protectable_refs: [],
        holdable_scope_refs: [{ entity_kind: 'location',
          entity_id: 'trace_ld_v1_loc_zhdanko_storehouse' }],
        reachable_destination_refs: [], break_contact_destination_refs: []
      }
    }
  });
  assert.equal('schema' in response, false);
  assert.equal(response.operation_choice, 'operation_1');
  assert.equal(response.force_choice, 'force_1');
  assert.equal(response.risk_choice, 'risk_1');
});

test('canonical local fixture routes a free general look into the shared planner',
  async () => {
    const plan = await createCanonicalPhase11LlmResponder()({
      model: 'fixture-turn-step-planner', input: {
        request_id: 'look-local', committed_state_version: 1,
        working_revision: 0, step_index: 1,
        root_player_action: 'Осматриваюсь вокруг.',
        remaining_intent: 'Осматриваюсь вокруг.',
        actor: { actor_id: 'player-local' },
        player_safe_state: { spatial_semantic: {
          semantic_grounding_available: true, position_ref: 'position:local' } }
      }
    });
    assert.deepEqual(plan.operations, [{ op: 'request_discovery',
      actor_ref: 'player-local', discovery_kind: 'look',
      target_refs: ['position:local'], query: 'осмотреться' }]);
  });

test('canonical fixture selects the supplied known-route operation', async () => {
  const operation = { op: 'request_movement', actor_ref: 'player-local',
    movement_kind: 'route', target_ref: 'location:unseen',
    route_ref: 'route:unseen', description: 'Пройти по известной дороге' };
  const plan = await createCanonicalPhase11LlmResponder()({
    model: 'fixture-turn-step-planner', input: {
      request_id: 'known-route', committed_state_version: 1,
      working_revision: 0, step_index: 1,
      root_player_action: 'Пройти известной тропой к старой сушильне.',
      remaining_intent: 'Пройти известной тропой к старой сушильне.',
      actor: { actor_id: 'player-local' },
      player_safe_state: { items: [], combat_sessions: [] },
      available_domain_operations: [operation]
    }
  });
  assert.equal(plan.operation_choice,
    'domain_operation_1_request_movement_route');
  assert.equal(plan.operation_family, 'request_movement');
  assert.equal('operations' in plan, false);
});

test('canonical fixture preserves an opaque supplied combat target', async () => {
  const operation = { op: 'request_combat', actor_ref: 'player-local',
    intent_kind: 'control', target_refs: ['npc:ratsha-unseen'],
    protected_refs: [], scope_ref: null, destination_ref: null,
    force_limit: 'nonlethal_if_possible', risk_posture: 'ordinary' };
  const plan = await createCanonicalPhase11LlmResponder()({
    model: 'fixture-turn-step-planner', input: {
      request_id: 'combat-local', committed_state_version: 1,
      working_revision: 0, step_index: 1,
      root_player_action: 'Сдержать Ратшу, не убивая его.',
      remaining_intent: 'Сдержать Ратшу, не убивая его.',
      actor: { actor_id: 'player-local' },
      player_safe_state: { items: [], npcs: [], combat_sessions: [{
        status: 'active', scope_ref: {
          entity_kind: 'location',
          entity_id: 'trace_ld_v1_loc_old_drying_shed'
        }
      }] },
      available_domain_operations: [operation]
    }
  });
  assert.equal(plan.operation_choice,
    'domain_operation_1_request_combat');
  assert.equal(plan.operation_family, 'request_combat');
  assert.equal('operations' in plan, false);
});

test('canonical fixture grounds bag recovery through its safe container ref',
  async () => {
    const operation = { op: 'request_item_use', actor_ref: 'player-local',
      use_kind: 'operate', item_ref: 'container:road-bag', target_refs: [] };
    const plan = await createCanonicalPhase11LlmResponder()({
      model: 'fixture-turn-step-planner', input: {
        request_id: 'recover-bag', committed_state_version: 1,
        working_revision: 0, step_index: 1,
        root_player_action: 'Забрать дорожную сумку у Жданко.',
        remaining_intent: 'Забрать дорожную сумку у Жданко.',
        actor: { actor_id: 'player-local' },
        player_safe_state: { items: [], containers: [{
          container_id: 'container:road-bag',
          template_id: 'trace_ld_v1_container_road_bag'
        }], combat_sessions: [] },
        available_domain_operations: [operation]
      }
    });
    assert.equal(plan.operation_choice,
      'domain_operation_1_request_item_use_operate');
    assert.equal(plan.operation_family, 'request_item_use');
    assert.equal('operations' in plan, false);
  });

test('canonical local fixture copies exact required player operation', async () => {
  const operation = {
    op: 'emit_interaction', interaction_kind: 'present_item_as_evidence',
    actor_ref: { entity_kind: 'player_character', entity_id: 'player-1' },
    target_ref: { entity_kind: 'npc', entity_id: 'eremey-1' },
    entity_ref: { entity_kind: 'item', entity_id: 'item:blue-wool' }
  };
  const request = {
    request_id: 'eremey-clue', conversation_id: 'conversation-1',
    state_version: 1, raw_text: 'Показать Еремею синюю шерсть.',
    speaker_ref: operation.actor_ref,
    player_safe_context: {
      target_npc_ref: operation.target_ref,
      required_resolution: 'check_required',
      required_check: {
        attribute_ref: 'attribute:presence', skill_ref: 'skill:persuasion',
        difficulty_band: 'hard'
      },
      required_supporting_operation: operation,
      available_check: {
        attribute_ref: 'attribute:strength', skill_ref: 'skill:athletics',
        difficulty_band: 'ordinary'
      }
    }
  };

  for (const model of [
    'fixture-player-conversation-interpreter',
    'fixture-player-conversation-interpreter-repair'
  ]) {
    const plan = await createCanonicalPhase11LlmResponder()({ model,
      input: { request } });
    assert.equal(plan.resolution, 'check_required');
    assert.equal(plan.check.attribute_ref, 'attribute:presence');
    assert.equal(plan.check.skill_ref, 'skill:persuasion');
    assert.equal(plan.check.difficulty_band, 'hard');
    assert.deepEqual(plan.supporting_operations, [operation]);
    assert.notStrictEqual(plan.supporting_operations[0], operation);
  }
});

test('canonical local fixture mirrors required Eremey route reply fields',
  async () => {
    const playerRef = { entity_kind: 'player_character', entity_id: 'player-1' };
    const operation = {
      op: 'disclose_known_route', target_ref: playerRef,
      route_ref: 'route:camp-to-shed',
      source_knowledge_scope_ref: 'knowledge:eremey-route'
    };
    const plan = await createCanonicalPhase11LlmResponder()({
      model: 'fixture-npc-conversation-responder', input: { request: {
        request_id: 'eremey-required-route', boundary_id: 'boundary-1',
        conversation_id: 'conversation-1', exchange_id: 'exchange-1',
        state_version: 1,
        npc_ref: { entity_kind: 'npc', entity_id: 'eremey-1' },
        public_conversation_history: [{ speaker_ref: playerRef }],
        decision_scope: {
          required_resolution: 'check_required',
          required_check: {
            attribute_ref: 'attribute:presence', skill_ref: 'skill:persuasion',
            difficulty_band: 'hard'
          },
          required_supporting_operation: operation,
          operation_contract: { disclose_known_route: {
            route_ref: operation.route_ref,
            source_knowledge_scope_ref: operation.source_knowledge_scope_ref
          } }
        }
      } }
    });

    assert.equal(plan.resolution, 'check_required');
    assert.deepEqual(plan.check, {
      purpose: 'resolve social delivery',
      attribute_ref: 'attribute:presence', skill_ref: 'skill:persuasion',
      difficulty_band: 'hard', outcomes: {
        clean_success: { delivery_quality: 'compelling', observable_effects: [] },
        success: { delivery_quality: 'credible', observable_effects: [] },
        success_with_cost: {
          delivery_quality: 'credible_with_visible_cost', observable_effects: []
        },
        failure_with_consequence: {
          delivery_quality: 'unconvincing', observable_effects: []
        },
        severe_failure: {
          delivery_quality: 'transparently_manipulative', observable_effects: []
        }
      }
    });
    assert.deepEqual(plan.supporting_operations, [operation]);
    assert.deepEqual(plan.primary_addressee_ref, playerRef);
    assert.deepEqual(plan.intended_addressee_refs, [playerRef]);
    assert.deepEqual(plan.speech.claims[0].source_knowledge_refs, [{
      entity_kind: 'knowledge_scope', entity_id: operation.source_knowledge_scope_ref
    }]);
  });

test('canonical fixture keeps Onisim testimony ahead of an unrelated route candidate',
  async () => {
    const responder = createCanonicalPhase11LlmResponder();
    const onisim = 'npc:onisim-unseen';
    const plannerInput = {
      request_id: 'testimony-turn', committed_state_version: 1,
      working_revision: 0, step_index: 1,
      root_player_action: 'Попросить Онисима рассказать, что он знает о Жданко и свёртке.',
      remaining_intent: 'Попросить Онисима рассказать, что он знает о Жданко и свёртке.',
      actor: { actor_id: 'player-1' },
      player_safe_state: { combat_sessions: [], items: [], containers: [],
        npcs: [] },
      available_domain_operations: [{ op: 'emit_interaction',
        actor_ref: 'player-1', interaction_kind: 'request',
        target_actor_refs: ['npc:eremey-unseen'],
        content: 'Поговорить с Еремеем', instrument_refs: [] }, {
        op: 'emit_interaction',
        actor_ref: 'player-1', interaction_kind: 'request',
        target_actor_refs: [onisim], content: 'Выслушать Онисима',
        instrument_refs: [] }]
    };
    await responder({ model: 'fixture-turn-step-planner', input: {
      ...plannerInput, player_safe_state: {
        ...plannerInput.player_safe_state,
        npcs: [{ participant_slot_ref: 'onisim_boatman', instance_id: onisim }]
      }
    } });
    await responder({ model: 'fixture-turn-step-planner', input: plannerInput });

    const plan = await responder({ model: 'fixture-npc-conversation-responder',
      input: { request: {
        request_id: 'onisim-testimony', boundary_id: 'boundary-1',
        conversation_id: 'conversation-1', exchange_id: 'exchange-1',
        state_version: 1, npc_ref: { entity_kind: 'npc', entity_id: onisim },
        public_conversation_history: [{ speaker_ref: {
          entity_kind: 'player_character', entity_id: 'player-1' } }],
        decision_scope: { operation_contract: { disclose_known_route: {
          route_ref: 'route:unrelated',
          source_knowledge_scope_ref: 'knowledge:unrelated' } } }
      } } });

    assert.equal(plan.speech.claims[0].claim_id,
      'trace_ld_v1_assertion_onisim_testimony');
    assert.deepEqual(plan.supporting_operations, []);
  });

test('canonical fixture distinguishes evidence and disposition activity targets',
  async () => {
    const evidence = { op: 'request_activity', actor_ref: 'player-1',
      activity_kind: 'other', target_refs: ['case-evidence'],
      description: 'Сопоставить доказательства' };
    const dispositionRefs = [
      'hold_ratsha_and_zhdanko_for_authorized_handover',
      'preserve_recovered_property_for_savva_handover',
      'preserve_active_no_summary_killing_promise'
    ];
    const disposition = { op: 'request_activity', actor_ref: 'player-1',
      activity_kind: 'other', target_refs: dispositionRefs,
      description: 'Принять временное решение' };
    const plan = await createCanonicalPhase11LlmResponder()({
      model: 'fixture-turn-step-planner', input: {
        request_id: 'disposition', committed_state_version: 1,
        working_revision: 0, step_index: 1,
        root_player_action: 'Зафиксировать временное решение по людям, имуществу и обещанию.',
        remaining_intent: 'Зафиксировать временное решение по людям, имуществу и обещанию.',
        actor: { actor_id: 'player-1' },
        player_safe_state: { combat_sessions: [], items: [], containers: [],
          temporary_disposition_options: {
            custody_option_refs: [dispositionRefs[0]],
            property_option_refs: [dispositionRefs[1]],
            promise_option_refs: [dispositionRefs[2]] } },
        available_domain_operations: [evidence, disposition]
      }
    });
    assert.equal(plan.operation_choice.startsWith('domain_operation_2_'), true,
      JSON.stringify(plan));
    assert.equal(plan.operation_family, 'request_activity');
  });
