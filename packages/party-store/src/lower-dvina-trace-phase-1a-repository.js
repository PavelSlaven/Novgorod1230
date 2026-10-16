import { deepFreeze, sha256 } from '@rus/kernel';
import { validateActorBaseAttributes } from '@rus/materialization';
import { computeMaterializationEnvelopeDigest,
  computeStage24ArtifactDigest } from '@rus/contracts';
import { normalizedContainer } from
  './lower-dvina-trace-phase-1a-read-assets.js';
import { loadLowerDvinaTraceItems, projectLowerDvinaTraceItemRow } from './lower-dvina-trace-items.js';

export { loadLowerDvinaTraceItems, projectLowerDvinaTraceItemRow };
import { buildActualPersistedProjection, projectPersistedNpcRoutineSchedules,
  NPC_ROUTINE_SCHEDULE_PROJECTION_COLUMNS, NPC_ROUTINE_SCHEDULE_PROJECTION_SELECT } from
  './lower-dvina-trace-phase-1a-projection.js';
import { projectPlayerSafeScenePackages } from
  './player-safe-scene-packages.js';

export { NPC_ROUTINE_SCHEDULE_PROJECTION_COLUMNS };

export function createLowerDvinaTracePhase1ARepository({query}={}) {
  if (typeof query !== 'function') throw new TypeError('query function is required.');
  const one = async (sql, values) => (await query(sql, values)).rows[0] ?? null;
  return Object.freeze({
    async loadSceneRefs(partyId) {
      const row = await one(
        `SELECT s.state_payload,r.created_refs
           FROM party_runtime.parties p
           JOIN party_runtime.party_state_snapshots s
             ON s.party_id=p.party_id AND s.state_version=0
           JOIN party_runtime.party_materialization_runs r
             ON r.party_id=p.party_id
            AND r.run_id=s.state_payload->'materialization_trace'->>'run_id'
            AND r.run_kind='baseline' AND r.status='committed'
          WHERE p.party_id=$1`, [partyId]
      );
      if (!row) return null;
      const refs = projectLowerDvinaTracePhase1ASceneRefs({ partyId,
        createdRefs: row.created_refs,
        initialSpatialV3: row.state_payload?.initial_spatial_v3,
        initialSpatialV3Runtime: row.state_payload?.initial_spatial_v3_runtime });
      const siteRef = refs.find(({ table }) => table === 'party_g5_sites');
      const site = siteRef == null ? null : await one(
        `SELECT created_change_set_id FROM party_runtime.party_g5_sites
          WHERE party_id=$1 AND id=$2`, [partyId, siteRef.id]);
      if (typeof site?.created_change_set_id !== 'string'
          || site.created_change_set_id === '') {
        throw rehydrateIncomplete('Committed Phase 1A scene has no creation change set.');
      }
      return Object.freeze({ refs, change_set_id: site.created_change_set_id });
    },
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
      const baselineRunId = snapshot.state_payload?.materialization_trace?.run_id;
      if (typeof baselineRunId !== 'string' || baselineRunId.length === 0) {
        throw rehydrateIncomplete('Committed Phase 1A snapshot has no baseline run identity.');
      }
      const run = await one(
        `SELECT party_id,run_id,g4_id,run_kind,occurrence,seed_digest,input_digest,catalog_digest,
                materializer_version,rng_version,result_digest,supersedes_run_id,repair_reason,
                idempotency_key,status,validation_report,trace,created_refs
           FROM party_runtime.party_materialization_runs
          WHERE party_id=$1 AND run_id=$2 AND run_kind=$3 AND status=$4`,
        [partyId, baselineRunId, 'baseline', 'committed']
      );
      if (!run) throw rehydrateIncomplete('Committed Phase 1A baseline run is unavailable.');
      const player = await one(
        `SELECT pc.character_id,pc.profile,apb.role_ref,apb.occupation_ref,apb.skill_profile_snapshot,
                apb.name_profile_snapshot,apb.language_profile_snapshot,apb.knowledge_profile_snapshot,
                apb.profile_candidate_set_digest,apb.attribute_profile_snapshot,
                apb.state_version AS profile_state_version,
                apb.created_change_set_id,apb.updated_change_set_id,
                b.body_profile_ref,b.health,b.energy,b.satiety,b.state_version AS body_state_version,
                b.updated_change_set_id AS body_updated_change_set_id
           FROM party_runtime.party_player_characters pc
           JOIN party_runtime.party_actor_profile_bindings apb
             ON apb.party_id=pc.party_id AND apb.actor_kind='player_character' AND apb.actor_id=pc.character_id
           JOIN party_runtime.party_actor_body_states b
             ON b.party_id=pc.party_id AND b.actor_kind='player_character' AND b.actor_id=pc.character_id
          WHERE pc.party_id=$1 AND pc.character_id=$2`,
        [partyId, snapshot.state_payload?.immediate?.player?.instance_id]
      );
      const position = await one('SELECT g4_id,g5_node_id,g5_anchor_id FROM party_runtime.party_positions WHERE party_id=$1', [partyId]);
      const spatialRows = (await query(
        `SELECT n.g5_node_id,n.run_id,n.parent_g4_id,n.template_id AS node_template_id,n.slot_key AS node_slot_key,
                n.state AS node_state,
                a.anchor_id,a.template_id AS anchor_template_id,a.slot_key AS anchor_slot_key,
                a.npc_capacity,a.item_capacity,a.container_capacity,a.state AS anchor_state
           FROM party_runtime.party_g5_nodes n
           JOIN party_runtime.party_g5_anchors a ON a.party_id=n.party_id AND a.g5_node_id=n.g5_node_id
          WHERE n.party_id=$1 AND n.run_id=$2
          ORDER BY n.g5_node_id,a.anchor_id`,
        [partyId, baselineRunId]
      )).rows;
      const clock = await one(
        `SELECT whole_minutes::text,subminute_numerator::text,subminute_denominator::text,
                clock_owner_kind,clock_owner_id,state_version,updated_change_set_id
           FROM party_runtime.party_clocks WHERE party_id=$1`,
        [partyId]
      );
      const choices = (await query(
        `SELECT party_id,run_id,choice_ordinal,slot_key,candidate_set_digest,candidate_ids,
                selected_id,rng_draw::text
           FROM party_runtime.party_materialization_choices
          WHERE party_id=$1 AND run_id=$2
          ORDER BY choice_ordinal`,
        [partyId, run?.run_id]
      )).rows;
      const items = await loadLowerDvinaTraceItems(query, partyId, [baselineRunId]);
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
          WHERE c.party_id=$1 AND c.run_id=$2 ORDER BY c.container_id`,
        [partyId, baselineRunId]
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
                placement.position_node_id AS position_id,
                n.identity_state,n.machine_state,n.semantic_state,
                apb.role_ref,apb.occupation_ref,apb.skill_profile_snapshot,
                apb.name_profile_snapshot,apb.language_profile_snapshot,
                apb.knowledge_profile_snapshot,apb.profile_candidate_set_digest,
                apb.attribute_profile_snapshot,
                apb.state_version,apb.created_change_set_id,apb.updated_change_set_id
           FROM party_runtime.party_npcs n
           JOIN party_runtime.party_actor_profile_bindings apb
             ON apb.party_id=n.party_id AND apb.actor_kind='npc' AND apb.actor_id=n.npc_id
           LEFT JOIN party_runtime.entity_placements placement ON placement.party_id=n.party_id
             AND placement.entity_kind='npc' AND placement.entity_id=n.npc_id
             AND placement.placement_kind='scene_position'
          WHERE n.party_id=$1 AND n.run_id=$2
          ORDER BY n.npc_id`,
        [partyId, baselineRunId]
      )).rows;
      const baselineNpcIds = npcs.map(({ npc_id }) => npc_id);
      const npcSchedules = (await query(
        `SELECT npc_id,time_band,schedule_profile_id,g5_node_id
           FROM party_runtime.party_npc_schedules
          WHERE party_id=$1 AND npc_id=ANY($2::text[])
          ORDER BY npc_id,time_band`,
        [partyId, baselineNpcIds]
      )).rows;
      const npcSpatialSchedules = Object.hasOwn(snapshot.state_payload?.persisted_projection ?? {}, 'npc_spatial_schedules')
        ? projectPersistedNpcRoutineSchedules(
            (await query(NPC_ROUTINE_SCHEDULE_PROJECTION_SELECT, [partyId, baselineNpcIds])).rows) : null;
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
      const counts = await one(
        `SELECT
          (SELECT count(*)::int FROM party_runtime.party_g5_nodes WHERE party_id=$1 AND run_id=$2) AS node_count,
          (SELECT count(*)::int FROM party_runtime.party_g5_anchors a
            WHERE a.party_id=$1 AND EXISTS (SELECT 1 FROM party_runtime.party_g5_nodes n
              WHERE n.party_id=a.party_id AND n.g5_node_id=a.g5_node_id AND n.run_id=$2)) AS anchor_count,
          (SELECT count(*)::int FROM party_runtime.party_g5_edges WHERE party_id=$1) AS edge_count,
          (SELECT count(*)::int FROM party_runtime.party_npcs WHERE party_id=$1 AND run_id=$2) AS npc_count,
          (SELECT count(*)::int FROM party_runtime.party_actor_profile_bindings b
            WHERE b.party_id=$1 AND ((b.actor_kind='player_character' AND b.actor_id=$3)
              OR (b.actor_kind='npc' AND b.actor_id=ANY($4::text[])))) AS profile_binding_count,
          (SELECT count(*)::int FROM party_runtime.party_containers WHERE party_id=$1 AND run_id=$2) AS container_count,
          (SELECT count(*)::int FROM party_runtime.party_obligations WHERE party_id=$1) AS obligation_count,
          (SELECT count(*)::int FROM party_runtime.party_character_knowledge WHERE party_id=$1) AS knowledge_count,
          (SELECT count(*)::int FROM party_runtime.party_visible_read_models WHERE party_id=$1) AS visible_count`,
        [partyId, baselineRunId, player?.character_id, baselineNpcIds]
      );
      const payload = snapshot.state_payload;
      const startSpatial = spatialRows.find(
        (value) => value.g5_node_id === payload?.immediate?.spatial?.node?.instance_id
          && value.anchor_id === payload?.immediate?.spatial?.anchor?.instance_id
      );
      const preparedSpatial = spatialRows.filter((value) => value !== startSpatial);
      const normalizedItems = items.map(projectLowerDvinaTraceItemRow);
      assertRoundTrip({
        snapshot,
        player,
        position,
        startSpatial,
        preparedSpatial,
        npcs,
        npcSchedules, npcSpatialSchedules,
        clock,
        run,
        choices,
        items,
        containers,
        obligations,
        conditions,
        counts,
        payload
      });
      let physicalPosition = {};
      if (payload.initial_spatial_v3?.canonical_scene_proposal != null) {
        const physical = (await query(`SELECT p.id AS position_id,p.g6_instance_id,
            g.host_kind,g.host_id,g.scene_baseline_id
          FROM party_runtime.party_journey_locations l
          JOIN party_runtime.scene_position_nodes p ON p.party_id=l.party_id AND p.id=l.scene_position_id
          JOIN party_runtime.party_g6_instances g ON g.party_id=p.party_id AND g.id=p.g6_instance_id
          WHERE l.party_id=$1 AND l.owner_kind='actor' AND l.owner_id=$2 AND l.location_kind='scene'
            AND p.status='active' AND g.status='active'`, [partyId, player.character_id])).rows;
        const scene = payload.initial_spatial_v3.canonical_scene_proposal;
        if (physical.length !== 1 || physical[0].position_id !== payload.initial_spatial_v3.selected_position_id
          || physical[0].host_kind !== 'g5_site' || physical[0].host_id !== scene.site_id
          || physical[0].scene_baseline_id !== scene.baseline_id) {
          throw Object.assign(new Error('Committed canonical start physical position differs from the approved snapshot.'),
            { code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE' });
        }
        physicalPosition = { position_id: physical[0].position_id, g6_instance_id: physical[0].g6_instance_id };
      }
      const normalizedContainers = containers.map(normalizedContainer);
      const hydratedNpcs = (payload.immediate.npcs ?? []).map((npc) => {
        const row = npcs.find(({ npc_id: id }) => id === npc.instance_id);
        return { ...structuredClone(npc), anchor_id: row.anchor_id,
          ...(row?.position_id == null ? {} : { position_id: row.position_id }), base_attributes:
          structuredClone(row?.attribute_profile_snapshot ?? null) };
      });
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
          skills: player.skill_profile_snapshot,
          ...(player.attribute_profile_snapshot == null ? {} : {
            base_attributes: structuredClone(player.attribute_profile_snapshot) })
        },
        body: { profile_ref: player.body_profile_ref, health: Number(player.health), energy: Number(player.energy), satiety: Number(player.satiety) },
        position: { ...position, ...physicalPosition, location_ref: startSpatial.node_state.location_profile_ref },
        prepared_scenes: payload.immediate.prepared_scenes ?? [],
        ...(payload.first_entry_preparation == null ? {} : {
          first_entry_preparation: {
            ...payload.first_entry_preparation,
            spatial_v3: payload.first_entry_spatial_v3
          }
        }),
        npcs: hydratedNpcs,
        timestamp: { whole_minutes: clock.whole_minutes, subminute_numerator: clock.subminute_numerator, subminute_denominator: clock.subminute_denominator },
        environment_snapshot: payload.immediate.environment_snapshot,
        hidden_truth: payload.hidden_truth,
        sealed_selections: payload.sealed_selections,
        historical_events: structuredClone(payload.historical_events ?? []),
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

    async loadPlayerSafeScenePackages(partyId) {
      const state = await this.loadInternal(partyId);
      const source = state?.materialization_trace?.procedural_scene_packages;
      if (source == null) return Object.freeze([]);
      if (source.schema !== 'rus.procedural_scene_party_packages.v1'
          || !Array.isArray(source.packages)
          || source.pin?.catalog_revision_id
            !== 'procedural_scene_final_candidate_v2_001'
          || source.pin?.catalog_digest !== state.materialization_trace.catalog_digest
          || source.digest !== computeStage24ArtifactDigest(source.packages)
          || source.packages.length === 0
          || source.packages.some((entry) => entry.party_id !== partyId
            || entry.run_id !== state.materialization_trace.run_id
            || entry.pin?.catalog_digest !== source.pin.catalog_digest
            || entry.scene_package_digest !== computeStage24ArtifactDigest({
              ...entry, scene_package_digest: undefined }))) {
        throw Object.assign(new Error('PROCEDURAL_SCENE_PACKAGES_TAMPERED'), {
          code: 'PROCEDURAL_SCENE_PACKAGES_TAMPERED' });
      }
      return projectPlayerSafeScenePackages(source.packages, state.items);
    },

    async loadIdempotency(idempotencyKey) {
      return one('SELECT idempotency_key,request_id,payload_hash,physical_plan_digest,status,committed_result FROM party_runtime.commit_idempotency WHERE idempotency_key=$1', [idempotencyKey]);
    }
  });
}

/** Map Phase1A's legacy domain refs to exact physical scene rows it authored. */
export function projectLowerDvinaTracePhase1ASceneRefs({ partyId,
  createdRefs, initialSpatialV3, initialSpatialV3Runtime } = {}) {
  const fail = () => { throw rehydrateIncomplete(
    'Committed Phase 1A scene refs do not match its physical scene proposal.'); };
  if (typeof partyId !== 'string' || !Array.isArray(createdRefs)
      || !initialSpatialV3 || !Array.isArray(initialSpatialV3.s1_physical_writes ?? [])) fail();
  const refs = new Set();
  for (const ref of createdRefs) {
    if (typeof ref?.domain !== 'string' || typeof ref.instance_id !== 'string'
        || ref.instance_id === '') fail();
    const key = `${ref.domain}\0${ref.instance_id}`;
    if (refs.has(key)) fail();
    refs.add(key);
  }
  if (initialSpatialV3.canonical_scene_proposal == null) {
    const spatial = initialSpatialV3;
    const runtime = initialSpatialV3Runtime;
    const ids = { g5: `g5:${spatial.node_id}`,
      baseline: `baseline:${spatial.node_id}`,
      g6: `g6:${spatial.anchor_id}`,
      position: `position:${spatial.anchor_id}` };
    const playerRefs = createdRefs.filter((ref) => ref.domain === 'player_character');
    if (typeof spatial.node_id !== 'string' || !refs.has(`g5_node\0${spatial.node_id}`)
        || typeof spatial.anchor_id !== 'string'
        || !refs.has(`g5_anchor\0${spatial.anchor_id}`)
        || runtime?.g5 !== ids.g5 || runtime?.baseline !== ids.baseline
        || runtime?.g6 !== ids.g6 || runtime?.position !== ids.position
        || playerRefs.length !== 1
        || runtime?.journey !== `journey-location:${partyId}:${playerRefs[0].instance_id}`) fail();
    const topology = spatial.s1_topology;
    const writes = spatial.s1_physical_writes ?? [];
    if (!Array.isArray(writes) || (topology == null && writes.length !== 0)
        || (topology != null && (!Array.isArray(topology.movement_edge_refs)
          || !Array.isArray(topology.visibility_link_refs)
          || topology.movement_edge_refs.length !== 2
          || topology.visibility_link_refs.length !== 2
          || writes.length !== 6))) fail();
    const expected = topology == null ? [] : [
      ['party_g6_instances', topology.g6_instance_ref, ids.baseline, ids.g5],
      ['scene_position_nodes', topology.position_ref, topology.g6_instance_ref],
      ...topology.movement_edge_refs.map((id) => ['scene_movement_edges', id]),
      ...topology.visibility_link_refs.map((id) => ['visibility_links', id])
    ];
    for (const [table, id, parent, host] of expected) {
      const rows = writes.filter((row) => row?.target_table === table && row.id === id);
      if (typeof id !== 'string' || !id || rows.length !== 1
          || (table === 'party_g6_instances'
            && (rows[0].record?.scene_baseline_id !== parent
              || rows[0].record?.host_kind !== 'g5_site'
              || rows[0].record?.host_id !== host))
          || (table === 'scene_position_nodes'
            && rows[0].record?.g6_instance_id !== parent)) fail();
    }
    const physicalRefs = [{ table: 'party_g5_sites', id: ids.g5 },
      { table: 'party_scene_baselines', id: ids.baseline },
      { table: 'party_g6_instances', id: ids.g6 },
      { table: 'scene_position_nodes', id: ids.position },
      ...writes.map((row) => ({ table: row.target_table, id: row.id }))];
    if (new Set(physicalRefs.map((ref) => `${ref.table}\0${ref.id}`)).size
        !== physicalRefs.length) fail();
    return Object.freeze(physicalRefs.sort((left, right) =>
      left.table.localeCompare(right.table) || left.id.localeCompare(right.id)));
  }
  const proposal = initialSpatialV3.canonical_scene_proposal;
  const nodeId = initialSpatialV3.node_id;
  if (typeof nodeId !== 'string' || !refs.has(`g5_node\0${nodeId}`)
      || proposal?.party_id !== partyId || proposal.site_id !== `g5:${nodeId}`
      || proposal.baseline_id !== `baseline:${nodeId}`
      || !Array.isArray(proposal.rows) || !Array.isArray(proposal.endpoints)) fail();
  const arrivals = proposal.endpoints.filter((endpoint) =>
    ['arrival', 'both'].includes(endpoint?.endpoint_role));
  const positions = proposal.rows.filter((row) =>
    row?.target_table === 'scene_position_nodes'
      && row.id === initialSpatialV3.selected_position_id);
  const baselines = proposal.rows.filter((row) =>
    row?.target_table === 'party_scene_baselines' && row.id === proposal.baseline_id);
  const g6Ids = new Set(proposal.rows.filter((row) =>
    row?.target_table === 'party_g6_instances'
      && row.record?.scene_baseline_id === proposal.baseline_id
      && row.record?.host_kind === 'g5_site' && row.record?.host_id === proposal.site_id)
    .map(({ id }) => id));
  if (arrivals.length !== 1 || arrivals[0].position_id !== initialSpatialV3.selected_position_id
      || positions.length !== 1 || baselines.length !== 1 || g6Ids.size === 0
      || !g6Ids.has(positions[0].record?.g6_instance_id)) fail();

  const physicalTables = new Set(['party_scene_baselines', 'party_g6_instances',
    'scene_position_nodes', 'scene_movement_edges']);
  const physicalRefs = [{ table: 'party_g5_sites', id: proposal.site_id },
    ...proposal.rows.filter((row) => physicalTables.has(row?.target_table))
      .map((row) => ({ table: row.target_table, id: row.id })),
    ...(initialSpatialV3.s1_physical_writes ?? []).map((row) => ({
      table: row?.target_table, id: row?.id
    })),
    ...createdRefs.filter(({ domain }) => domain === 'npc')
      .map(({ instance_id }) => ({ table: 'entity_placements', id: `npc:${instance_id}` }))];
  const unique = new Map();
  for (const ref of physicalRefs) {
    if (typeof ref.table !== 'string' || typeof ref.id !== 'string' || ref.id === '') fail();
    const key = `${ref.table}\0${ref.id}`;
    if (unique.has(key)) fail();
    unique.set(key, ref);
  }
  return Object.freeze([...unique.values()].sort((left, right) =>
    left.table.localeCompare(right.table) || left.id.localeCompare(right.id)));
}

function assertRoundTrip({
  snapshot,
  player,
  position,
  startSpatial,
  preparedSpatial,
  npcs,
  npcSchedules, npcSpatialSchedules,
  clock,
  run,
  choices,
  items,
  containers,
  obligations,
  conditions,
  counts,
  payload
}) {
  const expectedConditions = payload?.immediate?.body?.condition_bindings ?? [];
  const expectedPreparedScenes = payload?.immediate?.prepared_scenes ?? [];
  const expectedNpcs = payload?.immediate?.npcs ?? [];
  const materializationEnvelope = payload ? {
    version: payload.materialization_result_version ?? 1,
    schema: payload.materialization_result_schema
      ?? 'rus.lower_dvina_trace_party_materialization_result.v1',
    status: 'materialized',
    party_id: snapshot.party_id,
    run_id: run?.run_id,
    request_identity: payload.request_identity,
    immediate: payload.immediate,
    ...(payload.initial_spatial_v3 == null ? {} : {
      initial_spatial_v3: payload.initial_spatial_v3
    }),
    ...(payload.first_entry_preparation == null ? {} : {
      first_entry_preparation: payload.first_entry_preparation
    }),
    ...(run?.trace?.procedural_scene_packages == null ? {} : {
      procedural_scene_packages: run.trace.procedural_scene_packages
    }),
    hidden_truth: payload.hidden_truth,
    sealed_selections: payload.sealed_selections,
    policy_profile_pins: payload.policy_profile_pins,
    validation_report: run?.validation_report?.materialization,
    trace: run?.trace == null ? run?.trace : (() => {
      const trace = structuredClone(run.trace);
      delete trace.procedural_scene_packages;
      return trace;
    })()
  } : null;
  if (!payload || !['rus.lower_dvina_trace_initial_party_snapshot.v2',
    'rus.authored_start_initial_party_snapshot.v1',
    'rus.authored_start_initial_party_snapshot.v3'].includes(payload.schema)
    || !player || !position || !startSpatial || !clock || !run || !counts || choices.length === 0 || items.length === 0
    || payload.immediate.player.instance_id !== player.character_id
    || computeStage24ArtifactDigest(player.attribute_profile_snapshot ?? null)
      !== computeStage24ArtifactDigest(payload.immediate.player.base_attributes ?? null)
    || (payload.immediate.player.attribute_generation_gate === 'active'
      && !validateActorBaseAttributes(player.attribute_profile_snapshot))
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
    || (payload.initial_spatial_v3?.canonical_scene_proposal != null && npcs.some((npc) =>
      npc.position_id !== expectedNpcs.find(({ instance_id }) => instance_id === npc.npc_id)?.position_id))
    || npcs.some((npc) => JSON.stringify(npc.attribute_profile_snapshot ?? null)
      !== JSON.stringify(expectedNpcs.find(({ instance_id }) => instance_id
        === npc.npc_id)?.base_attributes ?? null))
    || expectedNpcs.some((npc) => npc.attribute_generation_gate === 'active'
      && !validateActorBaseAttributes(npc.base_attributes))
    || npcs.some((npc) => expectedNpcs.find(({ instance_id }) => instance_id
      === npc.npc_id)?.attribute_generation_gate === 'active'
      && !validateActorBaseAttributes(npc.attribute_profile_snapshot))
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
    || conditions.some((value) => value.status !== 'active'
      || !expectedConditions.some((expected) => expected.state === value.condition_profile_ref?.state))
    || sha256(originalMaterializationTrace(run.trace))
      !== sha256(payload.materialization_trace)
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
    npcSchedules,
    clock,
    items,
    containers,
    obligations,
    conditions,
    run,
    choices,
    includePreparedScenes: Object.hasOwn(expectedProjection?.spatial ?? {}, 'prepared_scenes'),
    includeNpcs: Object.hasOwn(expectedProjection ?? {}, 'npcs'),
    projectionSchema: expectedProjection?.schema
  });
  if (npcSpatialSchedules != null) {
    actualProjection.npc_spatial_schedules = npcSpatialSchedules;
  }
  const expectedDigest = sha256(expectedProjection);
  if (!['rus.lower_dvina_trace_persisted_projection.v2',
    'rus.authored_start_persisted_projection.v1'].includes(expectedProjection?.schema)
    || payload.persisted_projection_digest !== expectedDigest
      || sha256(actualProjection) !== expectedDigest) {
    const error = new Error('Committed Lower Dvina trace normalized projection differs from the approved snapshot.');
    error.code = 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE';
    throw error;
  }
}

function originalMaterializationTrace(trace) {
  const original = structuredClone(trace);
  delete original.procedural_scene_packages;
  return original;
}

function rehydrateIncomplete(message) {
  return Object.assign(new Error(message), {
    code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE'
  });
}
