import { deepFreeze, sha256 } from '@rus/kernel';
import { computeMaterializationEnvelopeDigest } from '@rus/contracts';
import { normalizedContainer, normalizedPartyAssets } from
  './lower-dvina-trace-phase-1a-read-assets.js';
import { lowerDvinaTraceActionProductionAuthorityField,
  lowerDvinaTraceActionProductionAuthorityMatches,
  readLowerDvinaTraceActionProductionAuthorities } from
  './lower-dvina-trace-action-production-authority.js';

export function createLowerDvinaTracePhase1ARepository({query}={}) {
  if (typeof query !== 'function') throw new TypeError('query function is required.');
  const one = async (sql, values) => (await query(sql, values)).rows[0] ?? null;
  return Object.freeze({
    async loadInternal(partyId) {
      const snapshot = await one(
        `SELECT p.party_id,p.world_revision_id,p.world_catalog_digest,p.materializer_version,p.rng_version,
                p.state_version,p.status,s.state_payload,s.state_digest
           FROM party_runtime.parties p
           JOIN party_runtime.party_state_snapshots s ON s.party_id=p.party_id AND s.state_version=0
          WHERE p.party_id=$1`,
        [partyId]
      );
      if (!snapshot) return null;
      const player = await one(
        `SELECT pc.character_id,pc.profile,apb.role_ref,apb.occupation_ref,apb.skill_profile_snapshot,
                apb.name_profile_snapshot,apb.language_profile_snapshot,apb.knowledge_profile_snapshot,
                apb.profile_candidate_set_digest,apb.state_version AS profile_state_version,
                apb.created_change_set_id,apb.updated_change_set_id,
                b.body_profile_ref,b.health,b.energy,b.satiety,b.state_version AS body_state_version,
                b.updated_change_set_id AS body_updated_change_set_id
           FROM party_runtime.party_player_characters pc
           JOIN party_runtime.party_actor_profile_bindings apb
             ON apb.party_id=pc.party_id AND apb.actor_kind='player_character' AND apb.actor_id=pc.character_id
           JOIN party_runtime.party_actor_body_states b
             ON b.party_id=pc.party_id AND b.actor_kind='player_character' AND b.actor_id=pc.character_id
          WHERE pc.party_id=$1`,
        [partyId]
      );
      const position = await one('SELECT g4_id,g5_node_id,g5_anchor_id FROM party_runtime.party_positions WHERE party_id=$1', [partyId]);
      const spatialRows = (await query(
        `SELECT n.g5_node_id,n.run_id,n.parent_g4_id,n.template_id AS node_template_id,n.slot_key AS node_slot_key,
                n.state AS node_state,
                a.anchor_id,a.template_id AS anchor_template_id,a.slot_key AS anchor_slot_key,
                a.npc_capacity,a.item_capacity,a.container_capacity,a.state AS anchor_state
           FROM party_runtime.party_g5_nodes n
           JOIN party_runtime.party_g5_anchors a ON a.party_id=n.party_id AND a.g5_node_id=n.g5_node_id
          WHERE n.party_id=$1
          ORDER BY n.g5_node_id,a.anchor_id`,
        [partyId]
      )).rows;
      const clock = await one(
        `SELECT whole_minutes::text,subminute_numerator::text,subminute_denominator::text,
                clock_owner_kind,clock_owner_id,state_version,updated_change_set_id
           FROM party_runtime.party_clocks WHERE party_id=$1`,
        [partyId]
      );
      const run = await one(
        `SELECT party_id,run_id,g4_id,run_kind,occurrence,seed_digest,input_digest,catalog_digest,
                materializer_version,rng_version,result_digest,supersedes_run_id,repair_reason,
                idempotency_key,status,validation_report,trace,created_refs
           FROM party_runtime.party_materialization_runs
          WHERE party_id=$1 AND run_kind=$2 AND status=$3`,
        [partyId, 'baseline', 'committed']
      );
      const choices = (await query(
        `SELECT party_id,run_id,choice_ordinal,slot_key,candidate_set_digest,candidate_ids,
                selected_id,rng_draw::text
           FROM party_runtime.party_materialization_choices
          WHERE party_id=$1 AND run_id=$2
          ORDER BY choice_ordinal`,
        [partyId, run?.run_id]
      )).rows;
      const items = (await query(
        `SELECT i.item_id,i.run_id,i.template_id,i.profile_id,i.category_id,i.quantity,i.condition_state,i.legal_status,i.state,
                ip.anchor_id,ip.container_id AS placement_container_id,ip.holder_npc_id,ip.holder_character_id,
                ip.physical_position,ip.equipment_slot_category_id,
                o.ownership_id,o.container_id AS ownership_container_id,o.owner_npc_id,o.owner_character_id,o.owner_party,o.owner_external_ref,
                o.controller_npc_id,o.controller_character_id,o.claim_state
           FROM party_runtime.party_items i
           JOIN party_runtime.party_item_placements ip ON ip.party_id=i.party_id AND ip.item_id=i.item_id
           JOIN party_runtime.party_ownership o ON o.party_id=i.party_id AND o.item_id=i.item_id
          WHERE i.party_id=$1 ORDER BY i.item_id`,
        [partyId]
      )).rows;
      const containers = (await query(
        `SELECT c.container_id,c.run_id,c.template_id,c.anchor_id,
                c.parent_container_id,c.holder_npc_id,c.holder_character_id,
                c.physical_position,c.equipment_slot_category_id,
                c.condition_state,c.closure_state,c.state,c.state_version,
                o.ownership_id,o.owner_npc_id,o.owner_character_id,
                o.owner_party,o.owner_external_ref,o.controller_npc_id,
                o.controller_character_id,o.claim_state
           FROM party_runtime.party_containers c
           LEFT JOIN party_runtime.party_ownership o
             ON o.party_id=c.party_id AND o.container_id=c.container_id
          WHERE c.party_id=$1 ORDER BY c.container_id`,
        [partyId]
      )).rows;
      const conditions = (await query(
        `SELECT condition_id,condition_profile_ref,status,state_version,created_change_set_id,terminal_change_set_id
           FROM party_runtime.party_actor_active_conditions
          WHERE party_id=$1 AND actor_kind='player_character' AND actor_id=$2
          ORDER BY condition_id`,
        [partyId, player?.character_id]
      )).rows;
      const npcs = (await query(
        `SELECT n.npc_id,n.run_id,n.profile_set_id,n.profile_level,n.anchor_id,
                n.identity_state,n.machine_state,n.semantic_state,
                apb.role_ref,apb.occupation_ref,apb.skill_profile_snapshot,
                apb.name_profile_snapshot,apb.language_profile_snapshot,
                apb.knowledge_profile_snapshot,apb.profile_candidate_set_digest,
                apb.state_version,apb.created_change_set_id,apb.updated_change_set_id
           FROM party_runtime.party_npcs n
           JOIN party_runtime.party_actor_profile_bindings apb
             ON apb.party_id=n.party_id AND apb.actor_kind='npc' AND apb.actor_id=n.npc_id
          WHERE n.party_id=$1
          ORDER BY n.npc_id`,
        [partyId]
      )).rows;
      const obligations = (await query(
        `SELECT obligation_id,policy_ref,policy_version,promisor_ref,
                beneficiary_ref,witness_refs,scope_snapshot,current_state,
                current_state_fact,state_version,created_change_set_id,
                last_change_set_id
           FROM party_runtime.party_obligations
          WHERE party_id=$1
          ORDER BY obligation_id`,
        [partyId]
      )).rows;
      const actionProductionAuthorities =
        await readLowerDvinaTraceActionProductionAuthorities({
          query, partyId
        });
      const counts = await one(
        `SELECT
          (SELECT count(*)::int FROM party_runtime.party_g5_nodes WHERE party_id=$1) AS node_count,
          (SELECT count(*)::int FROM party_runtime.party_g5_anchors WHERE party_id=$1) AS anchor_count,
          (SELECT count(*)::int FROM party_runtime.party_g5_edges WHERE party_id=$1) AS edge_count,
          (SELECT count(*)::int FROM party_runtime.party_npcs WHERE party_id=$1) AS npc_count,
          (SELECT count(*)::int FROM party_runtime.party_actor_profile_bindings WHERE party_id=$1) AS profile_binding_count,
          (SELECT count(*)::int FROM party_runtime.party_containers WHERE party_id=$1) AS container_count,
          (SELECT count(*)::int FROM party_runtime.party_obligations WHERE party_id=$1) AS obligation_count,
          (SELECT count(*)::int FROM party_runtime.party_character_knowledge WHERE party_id=$1) AS knowledge_count,
          (SELECT count(*)::int FROM party_runtime.party_visible_read_models WHERE party_id=$1) AS visible_count`,
        [partyId]
      );
      const payload = snapshot.state_payload;
      const startSpatial = spatialRows.find(
        (value) => value.g5_node_id === payload?.immediate?.spatial?.node?.instance_id
          && value.anchor_id === payload?.immediate?.spatial?.anchor?.instance_id
      );
      const preparedSpatial = spatialRows.filter((value) => value !== startSpatial);
      assertRoundTrip({
        snapshot,
        player,
        position,
        startSpatial,
        preparedSpatial,
        npcs,
        clock,
        run,
        choices,
        items,
        containers,
        obligations,
        actionProductionAuthorities,
        conditions,
        counts,
        payload
      });
      const normalizedItems = items.map((item) => ({
        item_id: item.item_id,
        run_id: item.run_id,
        template_id: item.template_id,
        profile_id: item.profile_id,
        category_id: item.category_id,
        quantity: item.quantity,
        condition_state: item.condition_state,
        legal_status: item.legal_status,
        state: item.state,
        placement: {
          anchor_id: item.anchor_id,
          container_id: item.placement_container_id,
          holder_npc_id: item.holder_npc_id,
          holder_character_id: item.holder_character_id,
          physical_position: item.physical_position,
          equipment_slot_category_id: item.equipment_slot_category_id
        },
        ownership: {
          ownership_id: item.ownership_id,
          owner_npc_id: item.owner_npc_id,
          owner_character_id: item.owner_character_id,
          owner_external_ref: item.owner_external_ref,
          owner_party: item.owner_party,
          controller_npc_id: item.controller_npc_id,
          controller_character_id: item.controller_character_id,
          claim_state: item.claim_state
        }
      }));
      const normalizedContainers = containers.map(normalizedContainer);
      const normalizedObligations = obligations.map((obligation) => {
        const sealed = (payload.immediate.promise_instances ?? []).find(
          ({ instance_id: id }) => id === obligation.obligation_id
        );
        if (!sealed?.witness_slot_bindings) {
          const error = new Error('Witness binding missing.');
          error.code = 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE';
          throw error;
        }
        return {
          obligation_id: obligation.obligation_id,
          policy_ref: obligation.policy_ref,
          policy_version: obligation.policy_version,
          promisor_actor_id: obligation.promisor_ref.entity_id,
          beneficiary_actor_id: obligation.beneficiary_ref.entity_id,
          witness_actor_ids: obligation.witness_refs.map((ref) => ref.entity_id),
          witness_slot_bindings: structuredClone(sealed.witness_slot_bindings),
          scope_snapshot: obligation.scope_snapshot,
          current_state: obligation.current_state,
          current_state_fact: obligation.current_state_fact,
          state_version: Number(obligation.state_version),
          created_change_set_id: obligation.created_change_set_id,
          last_change_set_id: obligation.last_change_set_id
        };
      });
      return deepFreeze({
        party_id: partyId,
        request_identity: payload.request_identity,
        player: {
          instance_id: player.character_id,
          dossier: player.profile,
          role_ref: player.role_ref,
          occupation_ref: player.occupation_ref,
          skills: player.skill_profile_snapshot
        },
        body: { profile_ref: player.body_profile_ref, health: Number(player.health), energy: Number(player.energy), satiety: Number(player.satiety) },
        position,
        prepared_scenes: payload.immediate.prepared_scenes ?? [],
        npcs: payload.immediate.npcs ?? [],
        timestamp: { whole_minutes: clock.whole_minutes, subminute_numerator: clock.subminute_numerator, subminute_denominator: clock.subminute_denominator },
        environment_snapshot: payload.immediate.environment_snapshot,
        hidden_truth: payload.hidden_truth,
        ...lowerDvinaTraceActionProductionAuthorityField(
          payload.action_production_authority),
        sealed_selections: payload.sealed_selections,
        policy_profile_pins: payload.policy_profile_pins,
        materialization_trace: run.trace,
        choices,
        items: normalizedItems,
        containers: normalizedContainers,
        promise_instances: normalizedObligations,
        initial_snapshot_identity: { state_version: 0, state_digest: snapshot.state_digest },
        integrity: {
          anchors_match_plan: startSpatial.anchor_id === payload.immediate.spatial.anchor.instance_id
            && preparedSpatial.length === (payload.immediate.prepared_scenes ?? []).length,
          routes_match_plan: counts.edge_count === 0,
          npcs_match_plan: counts.npc_count === (payload.immediate.npcs ?? []).length,
          items_match_plan: items.length === payload.immediate.items.length,
          containers_match_plan: counts.container_count === payload.immediate.containers.length,
          knowledge_hash_matches: counts.knowledge_count === 0, knowledge_counts_match: counts.knowledge_count === 0,
          single_current_knowledge_map: counts.knowledge_count === 0,
          visible_context_digest_matches: counts.visible_count === 0,
          narrator_prose_digest_matches: payload.immediate.narrator_output == null,
          audit_snapshots_complete: payload.semantic_validation?.pass === true,
          source_trace_complete: run.trace?.result_digest === payload.materialization_trace?.result_digest
        }
      });
    },

    async loadVisible(partyId) {
      const state = await this.loadInternal(partyId);
      if (!state) return null;
      return deepFreeze({
        party_id: state.party_id,
        player: { character_id: state.player.instance_id, name: state.player.dossier.identity?.name, social_status: state.player.dossier.social_status },
        position: state.position,
        timestamp: state.timestamp,
        body: state.body,
        environment: state.environment_snapshot
      });
    },

    async loadIdempotency(idempotencyKey) {
      return one('SELECT idempotency_key,request_id,payload_hash,physical_plan_digest,status,committed_result FROM party_runtime.commit_idempotency WHERE idempotency_key=$1', [idempotencyKey]);
    }
  });
}

function assertRoundTrip({
  snapshot,
  player,
  position,
  startSpatial,
  preparedSpatial,
  npcs,
  clock,
  run,
  choices,
  items,
  containers,
  obligations,
  actionProductionAuthorities,
  conditions,
  counts,
  payload
}) {
  const expectedConditions = payload?.immediate?.body?.condition_bindings ?? [];
  const expectedPreparedScenes = payload?.immediate?.prepared_scenes ?? [];
  const expectedNpcs = payload?.immediate?.npcs ?? [];
  const materializationEnvelope = payload ? {
    version: 1,
    schema: 'rus.lower_dvina_trace_party_materialization_result.v1',
    status: 'materialized',
    party_id: snapshot.party_id,
    run_id: run?.run_id,
    request_identity: payload.request_identity,
    immediate: payload.immediate,
    hidden_truth: payload.hidden_truth,
    ...lowerDvinaTraceActionProductionAuthorityField(
      payload.action_production_authority),
    sealed_selections: payload.sealed_selections,
    policy_profile_pins: payload.policy_profile_pins,
    validation_report: run?.validation_report?.materialization,
    trace: run?.trace
  } : null;
  if (!payload || payload.schema !== 'rus.lower_dvina_trace_initial_party_snapshot.v2'
    || !player || !position || !startSpatial || !clock || !run || !counts || choices.length === 0 || items.length === 0
    || payload.immediate.player.instance_id !== player.character_id
    || payload.immediate.spatial.position.g4_id !== position.g4_id
    || payload.immediate.spatial.node.instance_id !== startSpatial.g5_node_id
    || payload.immediate.spatial.anchor.instance_id !== startSpatial.anchor_id
    || payload.immediate.timestamp.whole_minutes !== clock.whole_minutes
    || payload.materialization_trace.result_digest !== run.result_digest
    || computeMaterializationEnvelopeDigest(materializationEnvelope) !== run.result_digest
    || choices.length !== payload.materialization_trace.choices.length
    || items.length !== payload.immediate.items.length
    || conditions.length !== expectedConditions.length
    || counts.node_count !== 1 + expectedPreparedScenes.length
    || counts.anchor_count !== 1 + expectedPreparedScenes.length
    || preparedSpatial.length !== expectedPreparedScenes.length
    || counts.edge_count !== 0
    || counts.npc_count !== expectedNpcs.length
    || npcs.length !== expectedNpcs.length
    || counts.profile_binding_count !== 1 + expectedNpcs.length
    || counts.container_count !== payload.immediate.containers.length
    || counts.obligation_count !== (payload.immediate.promise_instances ?? []).length
    || counts.knowledge_count !== 0 || counts.visible_count !== 0
    || snapshot.state_digest !== sha256(payload)) {
    const error = new Error('Committed Lower Dvina trace party is partial or inconsistent.');
    error.code = 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE';
    throw error;
  }
  const expectedItemIds = new Set(payload.immediate.items.map((value) => value.instance_id));
  const expectedContainerIds = new Set(
    payload.immediate.containers.map((value) => value.instance_id)
  );
  const expectedNpcIds = new Set(expectedNpcs.map((value) => value.instance_id));
  if (items.some((value) => !expectedItemIds.has(value.item_id))
    || containers.some(
      (value) => !expectedContainerIds.has(value.container_id)
    )
    || npcs.some((value) => !expectedNpcIds.has(value.npc_id))
    || !lowerDvinaTraceActionProductionAuthorityMatches(
      actionProductionAuthorities, payload.action_production_authority)
    || conditions.some((value) => value.status !== 'active'
      || !expectedConditions.some((expected) => expected.state === value.condition_profile_ref?.state))
    || sha256(run.trace) !== sha256(payload.materialization_trace)
    || JSON.stringify(run.trace?.policy_profile_pins) !== JSON.stringify(payload.policy_profile_pins)) {
    const error = new Error('Committed Lower Dvina trace normalized rows do not match the sealed snapshot.');
    error.code = 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE';
    throw error;
  }
  if (!snapshot.state_digest || !payload.hidden_truth?.digest || !Array.isArray(payload.sealed_selections)) {
    const error = new Error('Committed Lower Dvina trace snapshot is incomplete.');
    error.code = 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE';
    throw error;
  }
  const expectedProjection = payload.persisted_projection;
  const actualProjection = buildActualPersistedProjection({
    player,
    position,
    startSpatial,
    preparedSpatial,
    npcs,
    clock,
    items,
    containers,
    obligations,
    conditions,
    run,
    choices,
    includePreparedScenes: Object.hasOwn(expectedProjection?.spatial ?? {}, 'prepared_scenes'),
    includeNpcs: Object.hasOwn(expectedProjection ?? {}, 'npcs')
  });
  const expectedDigest = sha256(expectedProjection);
  if (expectedProjection?.schema !== 'rus.lower_dvina_trace_persisted_projection.v2'
    || payload.persisted_projection_digest !== expectedDigest
    || sha256(actualProjection) !== expectedDigest) {
    const error = new Error('Committed Lower Dvina trace normalized projection differs from the approved snapshot.');
    error.code = 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE';
    throw error;
  }
}

function buildActualPersistedProjection({
  player,
  position,
  startSpatial,
  preparedSpatial,
  npcs,
  clock,
  items,
  containers,
  obligations,
  conditions,
  run,
  choices,
  includePreparedScenes,
  includeNpcs
}) {
  return {
    schema: 'rus.lower_dvina_trace_persisted_projection.v2',
    materialization_run: {
      party_id: run.party_id,
      run_id: run.run_id,
      g4_id: run.g4_id,
      run_kind: run.run_kind,
      occurrence: Number(run.occurrence),
      seed_digest: run.seed_digest,
      input_digest: run.input_digest,
      catalog_digest: run.catalog_digest,
      materializer_version: run.materializer_version,
      rng_version: run.rng_version,
      result_digest: run.result_digest,
      supersedes_run_id: run.supersedes_run_id,
      repair_reason: run.repair_reason,
      idempotency_key: run.idempotency_key,
      status: run.status,
      validation_report: run.validation_report,
      trace: run.trace,
      created_refs: run.created_refs
    },
    materialization_choices: choices.map((choice) => ({
      party_id: choice.party_id,
      run_id: choice.run_id,
      choice_ordinal: Number(choice.choice_ordinal),
      slot_key: choice.slot_key,
      candidate_set_digest: choice.candidate_set_digest,
      candidate_ids: choice.candidate_ids,
      selected_id: choice.selected_id,
      rng_draw: choice.rng_draw
    })),
    player: {
      character_id: player.character_id,
      dossier: player.profile,
      role_ref: player.role_ref,
      occupation_ref: player.occupation_ref,
      skill_profile_snapshot: player.skill_profile_snapshot,
      name_profile_snapshot: player.name_profile_snapshot,
      language_profile_snapshot: player.language_profile_snapshot,
      knowledge_profile_snapshot: player.knowledge_profile_snapshot,
      profile_candidate_set_digest: player.profile_candidate_set_digest,
      state_version: Number(player.profile_state_version),
      created_change_set_id: player.created_change_set_id,
      updated_change_set_id: player.updated_change_set_id
    },
    body: {
      body_profile_ref: player.body_profile_ref,
      health: Number(player.health),
      energy: Number(player.energy),
      satiety: Number(player.satiety),
      state_version: Number(player.body_state_version),
      updated_change_set_id: player.body_updated_change_set_id
    },
    conditions: conditions.map((condition) => ({
      condition_id: condition.condition_id,
      condition_profile_ref: condition.condition_profile_ref,
      status: condition.status,
      state_version: Number(condition.state_version),
      created_change_set_id: condition.created_change_set_id,
      terminal_change_set_id: condition.terminal_change_set_id
    })),
    spatial: {
      node: {
        g5_node_id: startSpatial.g5_node_id,
        run_id: startSpatial.run_id,
        parent_g4_id: startSpatial.parent_g4_id,
        template_id: startSpatial.node_template_id,
        slot_key: startSpatial.node_slot_key,
        state: startSpatial.node_state
      },
      anchor: {
        anchor_id: startSpatial.anchor_id,
        g5_node_id: startSpatial.g5_node_id,
        template_id: startSpatial.anchor_template_id,
        slot_key: startSpatial.anchor_slot_key,
        npc_capacity: startSpatial.npc_capacity,
        item_capacity: startSpatial.item_capacity,
        container_capacity: startSpatial.container_capacity,
        state: startSpatial.anchor_state
      },
      position,
      ...(includePreparedScenes ? {
        prepared_scenes: preparedSpatial.map((spatial) => ({
          location_profile_ref: spatial.node_state.location_profile_ref,
          node: {
            g5_node_id: spatial.g5_node_id,
            run_id: spatial.run_id,
            parent_g4_id: spatial.parent_g4_id,
            template_id: spatial.node_template_id,
            slot_key: spatial.node_slot_key,
            state: spatial.node_state
          },
          anchor: {
            anchor_id: spatial.anchor_id,
            g5_node_id: spatial.g5_node_id,
            template_id: spatial.anchor_template_id,
            slot_key: spatial.anchor_slot_key,
            npc_capacity: spatial.npc_capacity,
            item_capacity: spatial.item_capacity,
            container_capacity: spatial.container_capacity,
            state: spatial.anchor_state
          }
        }))
      } : {})
    },
    ...(includeNpcs ? {
      npcs: npcs.map((npc) => ({
        npc_id: npc.npc_id,
        run_id: npc.run_id,
        profile_set_id: npc.profile_set_id,
        profile_level: npc.profile_level,
        anchor_id: npc.anchor_id,
        identity_state: npc.identity_state,
        machine_state: npc.machine_state,
        semantic_state: npc.semantic_state,
        role_ref: npc.role_ref,
        occupation_ref: npc.occupation_ref,
        skill_profile_snapshot: npc.skill_profile_snapshot,
        name_profile_snapshot: npc.name_profile_snapshot,
        language_profile_snapshot: npc.language_profile_snapshot,
        knowledge_profile_snapshot: npc.knowledge_profile_snapshot,
        profile_candidate_set_digest: npc.profile_candidate_set_digest,
        state_version: Number(npc.state_version),
        created_change_set_id: npc.created_change_set_id,
        updated_change_set_id: npc.updated_change_set_id
      }))
    } : {}),
    ...normalizedPartyAssets({ items, containers, obligations, clock })
  };
}
