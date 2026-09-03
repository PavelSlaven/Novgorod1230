import { normalizedPartyAssets } from './lower-dvina-trace-phase-1a-read-assets.js';

export function buildActualPersistedProjection({
  player,
  position,
  startSpatial,
  preparedSpatial,
  npcs,
  npcSchedules,
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
        schedule_records: npcSchedules.filter(({ npc_id: id }) => id === npc.npc_id)
          .map(({ time_band, schedule_profile_id, g5_node_id }) => ({
            time_band,
            schedule_profile_id,
            g5_node_id
          })),
        profile_candidate_set_digest: npc.profile_candidate_set_digest,
        state_version: Number(npc.state_version),
        created_change_set_id: npc.created_change_set_id,
        updated_change_set_id: npc.updated_change_set_id
      }))
    } : {}),
    ...normalizedPartyAssets({ items, containers, obligations, clock })
  };
}
