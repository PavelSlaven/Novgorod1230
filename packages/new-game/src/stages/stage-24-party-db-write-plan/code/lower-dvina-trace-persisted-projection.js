import { sha256 } from '@rus/kernel';

export function buildLowerDvinaTracePersistedProjection({
  result,
  changeSetId,
  runRecord,
  choiceRecords
}) {
  const player = result.immediate.player;
  const playerId = player.instance_id;
  const preparedScenes = result.immediate.prepared_scenes ?? [];
  const preparedNpcs = result.immediate.npcs ?? [];
  const preparedContainers = result.immediate.containers ?? [];
  return {
    schema: 'rus.lower_dvina_trace_persisted_projection.v2',
    materialization_run: structuredClone(runRecord),
    materialization_choices: choiceRecords.map((choice) => ({
      ...structuredClone(choice),
      rng_draw: String(choice.rng_draw)
    })),
    player: {
      character_id: playerId,
      dossier: structuredClone(player.dossier),
      role_ref: {
        id: player.dossier.social_status.social_role_id,
        source: 'approved_scenario_profile'
      },
      occupation_ref: {
        id: player.dossier.social_status.occupation_id,
        source: 'approved_scenario_profile'
      },
      skill_profile_snapshot: structuredClone(player.dossier.skills),
      name_profile_snapshot: structuredClone(player.dossier.identity),
      language_profile_snapshot: {},
      knowledge_profile_snapshot: structuredClone(player.dossier.knowledge),
      profile_candidate_set_digest: result.trace.choices
        .find((choice) => choice.choice_key === 'player_profile').candidate_set_digest,
      state_version: 1,
      created_change_set_id: changeSetId,
      updated_change_set_id: changeSetId
    },
    body: {
      body_profile_ref: {
        id: result.immediate.body.profile_id,
        schema: result.immediate.body.schema,
        revision: result.immediate.body.version,
        digest: result.immediate.body.record_digest
      },
      health: result.immediate.body.values.health,
      energy: result.immediate.body.values.energy,
      satiety: result.immediate.body.values.satiety,
      state_version: 1,
      updated_change_set_id: changeSetId
    },
    conditions: result.immediate.body.condition_bindings.map((condition) => ({
      condition_id: `condition_${sha256([result.party_id, playerId, condition.state]).slice(0, 24)}`,
      condition_profile_ref: structuredClone(condition),
      status: 'active',
      state_version: 1,
      created_change_set_id: changeSetId,
      terminal_change_set_id: null
    })).sort((left, right) => left.condition_id.localeCompare(right.condition_id)),
    spatial: {
      node: {
        g5_node_id: result.immediate.spatial.node.instance_id,
        run_id: result.run_id,
        parent_g4_id: result.immediate.spatial.node.parent_g4_id,
        template_id: result.immediate.spatial.node.template_id,
        slot_key: result.immediate.spatial.node.slot_key,
        state: structuredClone(result.immediate.spatial.node.state)
      },
      anchor: {
        anchor_id: result.immediate.spatial.anchor.instance_id,
        g5_node_id: result.immediate.spatial.anchor.node_id,
        template_id: result.immediate.spatial.anchor.template_id,
        slot_key: result.immediate.spatial.anchor.slot_key,
        npc_capacity: result.immediate.spatial.anchor.npc_capacity,
        item_capacity: result.immediate.spatial.anchor.item_capacity,
        container_capacity: result.immediate.spatial.anchor.container_capacity,
        state: structuredClone(result.immediate.spatial.anchor.state)
      },
      position: {
        g4_id: result.immediate.spatial.position.g4_id,
        g5_node_id: result.immediate.spatial.position.g5_node_id,
        g5_anchor_id: result.immediate.spatial.position.g5_anchor_id
      },
      ...(result.request_identity.scenario_definition_revision >= 8 ? {
        prepared_scenes: preparedScenes.map((scene) => ({
          location_profile_ref: scene.location_profile_ref,
          node: {
            g5_node_id: scene.node.instance_id,
            run_id: result.run_id,
            parent_g4_id: scene.node.parent_g4_id,
            template_id: scene.node.template_id,
            slot_key: scene.node.slot_key,
            state: structuredClone(scene.node.state)
          },
          anchor: {
            anchor_id: scene.anchor.instance_id,
            g5_node_id: scene.anchor.node_id,
            template_id: scene.anchor.template_id,
            slot_key: scene.anchor.slot_key,
            npc_capacity: scene.anchor.npc_capacity,
            item_capacity: scene.anchor.item_capacity,
            container_capacity: scene.anchor.container_capacity,
            state: structuredClone(scene.anchor.state)
          }
        })).sort((left, right) => left.node.g5_node_id.localeCompare(right.node.g5_node_id))
      } : {})
    },
    ...(result.request_identity.scenario_definition_revision >= 8 ? {
      npcs: preparedNpcs.map((npc) => ({
        npc_id: npc.instance_id,
        run_id: result.run_id,
        profile_set_id: npc.profile_id,
        profile_level: npc.profile_level,
        anchor_id: npc.anchor_id,
        identity_state: structuredClone(npc.identity_state),
        machine_state: structuredClone(npc.machine_state),
        semantic_state: {
          ...structuredClone(npc.semantic_state),
          participant_slot_ref: npc.participant_slot_ref,
          location_profile_ref: npc.location_profile_ref,
          zone_ref: npc.zone_ref,
          profile_revision: npc.profile_revision,
          profile_record_digest: npc.profile_record_digest
        },
        role_ref: structuredClone(npc.role_ref),
        occupation_ref: structuredClone(npc.occupation_ref),
        skill_profile_snapshot: {},
        name_profile_snapshot: structuredClone(npc.identity_state),
        language_profile_snapshot: {},
        knowledge_profile_snapshot: structuredClone(npc.knowledge_profile_snapshot),
        profile_candidate_set_digest: npc.profile_candidate_set_digest,
        state_version: 1,
        created_change_set_id: changeSetId,
        updated_change_set_id: changeSetId
      })).sort((left, right) => left.npc_id.localeCompare(right.npc_id))
    } : {}),
    items: result.immediate.items.map((item) => ({
      item_id: item.instance_id,
      run_id: result.run_id,
      template_id: item.template_id,
      profile_id: item.profile_id,
      category_id: item.category_id,
      quantity: item.quantity,
      condition_state: item.condition_state,
      legal_status: item.legal_status,
      state: structuredClone(item.state),
      placement: {
        anchor_id: item.anchor_id ?? null,
        container_id: null,
        holder_npc_id: item.holder_npc_id ?? null,
        holder_character_id: item.holder_character_id ?? null,
        physical_position: item.physical_position,
        equipment_slot_category_id: null
      },
      ownership: {
        ownership_id: `ownership_${item.instance_id}`,
        container_id: null,
        owner_npc_id: item.owner_npc_id ?? null,
        owner_character_id: item.owner_character_id ?? null,
        owner_party: false,
        owner_external_ref: null,
        controller_npc_id: item.controller_npc_id ?? null,
        controller_character_id: item.controller_character_id ?? null,
        claim_state: item.claim_state
      }
    })).sort((left, right) => left.item_id.localeCompare(right.item_id)),
    containers: preparedContainers.map((container) => ({
      container_id: container.instance_id,
      run_id: result.run_id,
      template_id: container.template_id,
      anchor_id: container.anchor_id ?? null,
      parent_container_id: null,
      holder_npc_id: container.holder_npc_id ?? null,
      holder_character_id: null,
      physical_position: null,
      equipment_slot_category_id: null,
      condition_state: container.state?.physical_condition?.overall ?? null,
      closure_state: container.closure_state,
      state: {
        ...structuredClone(container.state),
        owner_external_ref: container.owner_external_ref,
        controller_npc_id: container.controller_npc_id
      },
      state_version: 1
    })).sort((left, right) => left.container_id.localeCompare(right.container_id)),
    obligations: (result.immediate.promise_instances ?? []).map((promise) => ({
      obligation_id: promise.instance_id,
      policy_ref: structuredClone(promise.policy_ref),
      policy_version: String(promise.policy_ref.revision),
      promisor_ref: {
        entity_kind: 'player_character',
        entity_id: promise.promisor_actor_id
      },
      beneficiary_ref: {
        entity_kind: 'npc',
        entity_id: promise.beneficiary_actor_id
      },
      witness_refs: promise.witness_actor_ids.map((actorId) => ({
        entity_kind: 'npc',
        entity_id: actorId
      })),
      scope_snapshot: structuredClone(promise.scope_snapshot),
      current_state: promise.current_state,
      current_state_fact: promise.current_state_fact,
      state_version: promise.state_version,
      created_change_set_id: changeSetId,
      last_change_set_id: changeSetId
    })).sort((left, right) => left.obligation_id.localeCompare(right.obligation_id)),
    clock: {
      whole_minutes: result.immediate.timestamp.whole_minutes,
      subminute_numerator: result.immediate.timestamp.subminute_numerator,
      subminute_denominator: result.immediate.timestamp.subminute_denominator,
      clock_owner_kind: 'party',
      clock_owner_id: null,
      state_version: 1,
      updated_change_set_id: changeSetId
    }
  };
}
