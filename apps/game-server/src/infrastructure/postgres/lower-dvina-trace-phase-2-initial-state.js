import {
  loadPhase2BodyHistory,
  loadPhase2Conditions,
  phase2IntegrityError
} from './lower-dvina-trace-phase-2-read.js';
import { canonicalDigest as sha256 } from '@rus/materialization';
import { loadApprovedCanonicalNaturalInitialRule,
  loadApprovedG4NaturalPlacementCatalog } from '@rus/runtime-catalog';
import { prepareG4NaturalBaseline } from '../../runtime/g4-natural-baseline.js';
import { serverError } from '../../errors.js';

/** Initial-state-only supplier. Read in the same consistent transaction as the
 * current scene. Any committed gameplay/Temporal/body change ends this rule. */
export async function readInitialCanonicalNaturalSourceState({ transaction,
  partyId, actorId, snapshot, sceneClosure, verifiedCatalog, pin, rule_ref } = {}) {
  const approved = loadApprovedCanonicalNaturalInitialRule({ verifiedCatalog, pin, rule_ref });
  if (typeof transaction?.query !== 'function') initialGap('initial_transaction_required');
  const result = await transaction.query(`SELECT p.world_revision_id,p.world_catalog_digest,
    p.state_version AS party_state_version,s.party_id AS session_party_id,
    s.state_version AS session_state_version,
    s.turn_number,s.last_turn_id,s.stage26_result,
    initial.state_payload,initial.state_digest,to_jsonb(body) AS body,to_jsonb(clock) AS clock,
    (SELECT coalesce(jsonb_agg(c ORDER BY c.condition_id),'[]')
      FROM party_runtime.party_actor_active_conditions c
      WHERE c.party_id=p.party_id AND c.actor_kind='player_character' AND c.actor_id=$2) AS conditions,
    (SELECT count(*)::int FROM party_runtime.party_body_temporal_history h
      WHERE h.party_id=p.party_id AND h.subject_kind='player_character' AND h.subject_id=$2) AS body_history_count,
    (SELECT coalesce(jsonb_agg(c),'[]') FROM party_runtime.party_v3_change_sets c
      WHERE c.party_id=p.party_id) AS change_sets
    FROM party_runtime.parties p
    LEFT JOIN party_runtime.party_server_sessions s ON s.party_id=p.party_id
    JOIN party_runtime.party_state_snapshots initial ON initial.party_id=p.party_id AND initial.state_version=0
    JOIN party_runtime.party_actor_body_states body ON body.party_id=p.party_id
      AND body.actor_kind='player_character' AND body.actor_id=$2
    JOIN party_runtime.party_clocks clock ON clock.party_id=p.party_id
    WHERE p.party_id=$1`, [partyId, actorId]);
  if (result.rows.length !== 1) initialGap('committed_initial_snapshot_required');
  const row = result.rows[0]; const payload = row.state_payload;
  const identity = payload?.request_identity; const expected = payload?.persisted_projection;
  const initialIds = payload?.initial_spatial_v3_runtime;
  const rule = approved.rule; const environment = payload?.immediate?.environment_snapshot;
  const timeInput = approved.initial_environment_inputs;
  // Opening projects perception before attaching its first server session.
  // Only an actual absent LEFT JOIN row skips the session-specific checks.
  const sessionValid = row.session_party_id === null
    ? ['session_state_version', 'turn_number', 'last_turn_id', 'stage26_result'].every((key) => row[key] === null)
    : row.session_party_id === partyId && Number(row.turn_number) === 0
      && row.last_turn_id == null && Number.isSafeInteger(Number(row.session_state_version))
      && Number(row.session_state_version) >= 1 && row.stage26_result?.scenario_id === approved.scenario_id;
  if (Number(row.party_state_version) !== 0 || !sessionValid
    || payload?.schema !== 'rus.authored_start_initial_party_snapshot.v3'
    || !row.state_digest || sha256(payload) !== row.state_digest
    || !expected || sha256(expected) !== payload.persisted_projection_digest
    || identity?.party_id !== partyId || identity.scenario_id !== approved.scenario_id
    || !/^[a-f0-9]{64}$/u.test(identity.scenario_manifest_digest ?? '')
    || !Array.isArray(payload.policy_profile_pins)
    || payload.policy_profile_pins.filter((value) => value?.key === rule.id
      && value.revision === rule.version && value.digest === approved.source_candidate_sha256).length !== 1
    || !identity.idempotency_key
    || identity.world_revision_id !== approved.world_pin.world_revision_id
    || identity.world_catalog_digest !== approved.world_pin.world_catalog_digest
    || row.world_revision_id !== identity.world_revision_id
    || row.world_catalog_digest !== identity.world_catalog_digest
    || payload.immediate?.player?.instance_id !== actorId
    || expected.player?.character_id !== actorId
    || initialIds?.g5 !== snapshot?.site?.id || initialIds?.baseline !== snapshot?.baseline?.id
    || initialIds?.position !== snapshot?.location?.scene_position_id
    || snapshot.location.party_id !== partyId || snapshot.location.owner_id !== actorId
    || sceneClosure?.header?.id !== rule.scene_template_ref.id
    || sceneClosure.header.version !== rule.scene_template_ref.version
    || sceneClosure.header.canonical_digest !== rule.scene_template_ref.canonical_digest
    || environment?.schema !== 'rus.approved_initial_environment.v1'
    || !timeInput || sha256(environment.calendar_date) !== sha256(timeInput.calendar_date)
    || environment.local_minute_of_day !== timeInput.local_minute_of_day
    || !sameTimestamp(payload.immediate.timestamp, timeInput.game_timestamp)) {
    initialGap('exact_unchanged_initial_state_required');
  }
  const changeSetId = expected.body?.updated_change_set_id;
  if (!changeSetId || row.change_sets?.length !== 1
    || row.change_sets[0].id !== changeSetId || row.change_sets[0].operation_kind !== 'new_game'
    || Number(row.body_history_count) !== 0
    || !matchesInitialRow(row.body, expected.body)
    || !matchesInitialRow(row.clock, expected.clock)
    || !sameTimestamp(row.clock, payload.immediate.timestamp)
    || !Array.isArray(expected.conditions) || expected.conditions.length !== row.conditions?.length
    || expected.conditions.some((condition) => !row.conditions.some((actual) =>
      actual.condition_id === condition.condition_id && matchesInitialRow(actual, condition)))) {
    initialGap('initial_body_clock_or_commit_changed');
  }
  // P16 writes carry the initial change set. Position equality alone would admit
  // wait/body changes, and party state alone would miss independent scene writes.
  const currentRows = [snapshot.site, snapshot.baseline, snapshot.location,
    ...snapshot.positions, ...snapshot.g6, ...snapshot.acoustic_profiles,
    ...snapshot.visibility_links, ...snapshot.acoustic_edges, ...snapshot.portals];
  if (currentRows.some((value) => Number(value.state_version) !== 1
    || value.updated_change_set_id !== changeSetId)) initialGap('initial_scene_changed');
  const placementCatalog = loadApprovedG4NaturalPlacementCatalog({ verifiedCatalog, pin });
  const placement = placementCatalog.placements.find((value) =>
    value.id === rule.placement_candidate.placement_ref.id
    && value.version === rule.placement_candidate.placement_ref.version);
  const baseline = prepareG4NaturalBaseline({ verifiedCatalog, pin,
    g4_ref: { ...rule.g4_ref, world_revision_id: rule.world_revision_id },
    scene_template_ref: rule.scene_template_ref, current_environment: environment });
  const positionId = snapshot.location.scene_position_id;
  const source_observations = placement.visual_layers.map((layer) => ({ layer,
    source_position_id: positionId,
    source_state: baseline.layers.find((value) => value.layer === layer)?.applicability === 'present'
      ? 'present' : 'absent',
    ...Object.fromEntries(['stable_cover', 'dynamic_occlusion', 'concealment']
      .map((key) => [key, rule.visual_initial_state[key]])) }));
  // The approved initial rule supplies no sound occurrence. It cannot establish
  // moving water or turn a static descriptor into an acoustic source.
  if (rule.audible_initial_state?.source_state !== 'absent'
    || placement.acoustic_layers.length !== 0 || snapshot.portals.length !== 0) {
    initialGap('initial_current_source_rule_required');
  }
  return { party_id: partyId, actor_id: actorId, position_id: positionId,
    current_environment: structuredClone(environment), source_observations,
    visual_capability: rule.actor_initial_state.visual_capability,
    hearing_capability: rule.actor_initial_state.hearing_capability,
    canonical_initial_state: { verified: true, rule_ref: { id: rule.id, version: rule.version },
      party_id: partyId, actor_id: actorId, position_id: positionId,
      scenario_id: approved.scenario_id, initial_request_identity: structuredClone(identity),
      initial_snapshot_identity: { state_version: 0, state_digest: row.state_digest } } };
}

function matchesInitialRow(actual, expected) {
  return actual != null && expected != null && Object.entries(expected).every(([key, value]) =>
    value !== null && typeof value === 'object' ? actual[key] != null && sha256(actual[key]) === sha256(value)
      : value === null ? actual[key] === null : String(actual[key]) === String(value));
}
function sameTimestamp(left, right) {
  return ['whole_minutes', 'subminute_numerator', 'subminute_denominator'].every((key) =>
    left?.[key] != null && right?.[key] != null && String(left[key]) === String(right[key]));
}
function initialGap(reason) {
  throw serverError('NATURAL_SCENE_PERCEPTION_DATA_GAP',
    'The approved initial perception rule has no current unchanged initial state.',
    { status: 409, details: { reason } });
}

export async function loadInitialTracePhase2State({
  partyId,
  row,
  phase1A,
  partyPool,
  temporalSourceProof
}) {
  const initial = await phase1A.loadInternal(partyId);
  if (!initial) throw phase2IntegrityError();
  const actorId = initial.player.instance_id;
  const [activeConditions, bodyEffectHistory] = await Promise.all([
    loadPhase2Conditions(partyPool, partyId, actorId),
    loadPhase2BodyHistory(partyPool, partyId, actorId)
  ]);
  return {
    party_id: partyId,
    scenario_id: row.stage26_result?.scenario_id ?? null,
    actor_id: actorId,
    world_identity: {
      world_revision_id: row.world_revision_id,
      world_catalog_digest: row.world_catalog_digest
    },
    party_state: {
      state_version: 0,
      session_state_version: Number(row.session_state_version),
      body_state_version: Number(row.body_state_version),
      clock_state_version: Number(row.clock_state_version),
      turn_number: Number(row.turn_number)
    },
    player_profile: initial.player.dossier,
    body_state: {
      ...initial.body,
      active_conditions: activeConditions
    },
    body_effect_history: bodyEffectHistory,
    position: {
      ...initial.position,
      location_ref: initial.position.location_ref
        ?? 'trace_ld_v1_loc_wreck_shore'
    },
    prepared_scenes: structuredClone(initial.prepared_scenes),
    ...(initial.first_entry_preparation == null ? {} : {
      first_entry_preparation: structuredClone(initial.first_entry_preparation)
    }),
    npcs: structuredClone(initial.npcs),
    promise_instances: structuredClone(initial.promise_instances ?? []),
    interactions: [],
    route_history: [],
    route_knowledge: [],
    clock: initial.timestamp,
    clock_weather_light: {
      clock: initial.timestamp,
      weather: {},
      light: {}
    },
    environment_snapshot: initial.environment_snapshot,
    sealed_selections: initial.sealed_selections,
    policy_pins: initial.policy_profile_pins,
    relevant_events: [],
    historical_events: [],
    items: initial.items.map((item) => ({
      item_id: item.item_id,
      run_id: item.run_id,
      template_id: item.template_id,
      profile_id: item.profile_id,
      category_id: item.category_id,
      quantity: item.quantity,
      state_version: item.state_version,
      condition_state: item.condition_state,
      legal_status: item.legal_status,
      placement: {
        item_id: item.item_id,
        anchor_id: item.placement.anchor_id,
        container_id: item.placement.container_id,
        holder_npc_id: item.placement.holder_npc_id,
        holder_character_id: item.placement.holder_character_id,
        physical_position: item.placement.physical_position,
        equipment_slot_category_id:
          item.placement.equipment_slot_category_id,
        attached_item_id: item.placement.attached_item_id
      },
      ownership: {
        item_id: item.item_id,
        ownership_id: item.ownership.ownership_id,
        owner_npc_id: item.ownership.owner_npc_id,
        owner_character_id: item.ownership.owner_character_id,
        owner_external_ref: item.ownership.owner_external_ref,
        owner_party: item.ownership.owner_party,
        controller_npc_id: item.ownership.controller_npc_id,
        controller_character_id: item.ownership.controller_character_id,
        claim_state: item.ownership.claim_state
      },
      state: item.state
    })),
    containers: structuredClone(initial.containers ?? []),
    container_placements: (initial.containers ?? []).map((container) => ({
      party_id: partyId,
      container_id: container.container_id,
      anchor_id: container.anchor_id,
      parent_container_id: container.parent_container_id,
      holder_npc_id: container.holder_npc_id,
      holder_character_id: container.holder_character_id,
      physical_position: container.physical_position,
      equipment_slot_category_id: container.equipment_slot_category_id
    })),
    knowledge: [],
    opening_identity: {
      opening_screen_digest: row.stage26_result.opening_screen_digest
    },
    initial_snapshot_identity: initial.initial_snapshot_identity,
    materialization_trace: initial.materialization_trace,
    temporal_boundary_candidates:
      structuredClone(temporalSourceProof.candidates),
    temporal_source_proof: structuredClone(temporalSourceProof)
  };
}
