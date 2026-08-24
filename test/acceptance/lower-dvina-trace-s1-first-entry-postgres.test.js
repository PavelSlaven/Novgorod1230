import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { isSpatialSemanticRemainderInScope } from
  '../../packages/turn/src/turn-step-spatial-semantic-remainder.js';

import { startLowerDvinaProductionAcceptanceEnv } from
  '../helpers/lower-dvina-production-acceptance-env.js';
import { createCanonicalPhase11LlmResponder } from
  '../helpers/lower-dvina-phase-11-llm.js';

const CAMP_TEMPLATE = 'trace_ld_v1_tpl_fishing_camp';
const A1_SOURCE_ITEM_ID = 'item:s1-first-entry-a1-source';

test('public Trace first entry provisions fishing camp once; S1 resolves only later',
  { timeout: 300_000 }, async (context) => {
    const environment = await startLowerDvinaProductionAcceptanceEnv({
      llmRespond: s1Responder()
    });
    context.after(() => environment.close());

    const started = await post(environment, '/api/v1/new-games', {
      scenario_id: 'lower_dvina_trace_v1', request_id: 's1-first-entry-new'
    });
    const partyId = started.party_id;
    await post(environment,
      `/api/v1/parties/${encodeURIComponent(partyId)}/opening-ack`, {
        client_ack_id: 's1-first-entry-ack'
      });
    assert.deepEqual(await campRows(environment, partyId), {
      g5: 0, baselines: 0, g6: 0, positions: 0, edges: 0, visibility: 0, envelopes: 0,
      claims: ['reserved'], actorAtCamp: 0, npcPlacements: 0
    });
    await submit(environment, partyId, 's1-first-entry-inspection',
      'Осмотреть место крушения подробно.');

    await submit(environment, partyId, 's1-first-entry-move',
      'Дойти до рыбацкого стана.');
    assert.equal(s1Calls(environment), 0);
    assert.deepEqual(await campRows(environment, partyId), {
      g5: 1, baselines: 1, g6: 2, positions: 2, edges: 2, visibility: 2, envelopes: 1,
      claims: ['consumed'], actorAtCamp: 1, npcPlacements: 3
    });
    assert.equal(await resolutionCount(environment, partyId), 0);
    assert.equal(await firstEntryChangeCount(environment, partyId), 1);
    const topologyBeforeLook = await campRows(environment, partyId);

    await environment.restartRoot();
    await get(environment,
      `/api/v1/parties/${encodeURIComponent(partyId)}/screen`);
    assert.deepEqual(await campRows(environment, partyId), {
      g5: 1, baselines: 1, g6: 2, positions: 2, edges: 2, visibility: 2, envelopes: 1,
      claims: ['consumed'], actorAtCamp: 1, npcPlacements: 3
    });

    const look = await submit(environment, partyId, 's1-first-entry-look',
      'Осмотреться.');
    assert.equal(s1Calls(environment), 1);
    assert.equal(await resolutionCount(environment, partyId), 1);
    assert.deepEqual(await campRows(environment, partyId), topologyBeforeLook,
      'S1 look must not materialize topology after entry');
    const committedResolution = await resolution(environment, partyId);
    assert.equal(typeof committedResolution.local_ref, 'string');
    assert.equal(typeof committedResolution.semantics.name, 'string');
    assert.equal(typeof committedResolution.semantics.description, 'string');
    const calls = s1Calls(environment);
    await environment.restartRoot();
    const reloaded = await get(environment,
      `/api/v1/parties/${encodeURIComponent(partyId)}/screen`);
    const local = reloaded.screen.visible_context.visible_objects.find(
      ({ entity_ref: ref }) => ref?.entity_kind === 'spatial_local_reference');
    assert.deepEqual(local, { entity_ref: { entity_kind: 'spatial_local_reference',
      entity_id: committedResolution.local_ref },
    display_label: committedResolution.semantics.name,
    recognition: 'recognized', visible_status: 'замечен' });
    const inspected = await submit(environment, partyId,
      's1-first-entry-inspect-local', 'Осмотреть низкую плетёную загородку.');
    assert.equal(inspected.screen.visible_context.visible_objects.some(
      ({ entity_ref: ref }) => ref?.entity_id === committedResolution.local_ref),
    true);
    assert.equal(s1Calls(environment), calls,
      'a reloaded visible local ref must not invoke the S1 model again');
    assert.equal(await resolutionCount(environment, partyId), 1);
    assert.deepEqual(await resolution(environment, partyId), committedResolution);
    assert.deepEqual(await submit(environment, partyId, 's1-first-entry-look',
      'Осмотреться.'), look);
    assert.equal(s1Calls(environment), calls);
    assert.equal(await resolutionCount(environment, partyId), 1);
    assert.deepEqual(await resolution(environment, partyId), committedResolution);
    assert.equal(await firstEntryChangeCount(environment, partyId), 1);

    await seedA1SourceItem(environment, partyId);

    const beforeMove = await journeyPosition(environment, partyId);
    const beforeEnterTime = await currentTimestamp(environment, partyId);
    await submit(environment, partyId, 's1-first-entry-enter-local',
      'Войти за низкую плетёную загородку.');
    assert.equal(s1Calls(environment), calls,
      'committed local movement must not invoke the S1 model');
    const afterMove = await journeyPosition(environment, partyId);
    assert.notEqual(afterMove, beforeMove);
    assert.deepEqual(await currentTimestamp(environment, partyId),
      beforeEnterTime, 'action-cost entry must not advance the clock');
    await environment.restartRoot();
    const moved = await get(environment,
      `/api/v1/parties/${encodeURIComponent(partyId)}/screen`);
    assert.equal(moved.screen.visible_context.visible_objects.some(
      ({ entity_ref: ref }) => ref?.entity_id === committedResolution.local_ref), true);
    assert.equal(JSON.stringify(moved).includes('formal_spatial_refs'), false);
    assert.equal(JSON.stringify(moved).includes('movement_edge_ref'), false);
    assert.equal(await journeyPosition(environment, partyId), afterMove);

    await submit(environment, partyId, 's1-first-entry-a1-inside',
      'Разделить доступный предмет на две обычные части.');
    const producedInside = await sceneItems(environment, partyId, afterMove);
    assert.equal(producedInside.length, 2);
    await environment.restartRoot();
    assert.deepEqual(await sceneItems(environment, partyId, afterMove),
      producedInside, 'A1 outputs must reload at the exact S1 interior');

    const beforeExitTime = await currentTimestamp(environment, partyId);
    await submit(environment, partyId, 's1-first-entry-exit-local',
      'Выйти из-за низкой плетёной загородки.');
    assert.equal(s1Calls(environment), calls,
      'reverse committed local movement must not invoke the S1 model');
    assert.equal(await journeyPosition(environment, partyId), beforeMove);
    assert.deepEqual(await currentTimestamp(environment, partyId),
      beforeExitTime, 'action-cost exit must not advance the clock');
    assert.deepEqual(await sceneItems(environment, partyId, afterMove),
      producedInside, 'actor exit must not move A1 outputs from the interior');
    assert.deepEqual(await campRows(environment, partyId), topologyBeforeLook);
    assert.deepEqual(await resolution(environment, partyId), committedResolution);
    await environment.restartRoot();
    const exited = await get(environment,
      `/api/v1/parties/${encodeURIComponent(partyId)}/screen`);
    assert.equal(JSON.stringify(exited).includes('formal_spatial_refs'), false);
    assert.equal(JSON.stringify(exited).includes('movement_edge_ref'), false);
    assert.equal(await journeyPosition(environment, partyId), beforeMove);
  });

test('public first entry is singleton; failed later S1 leaves committed entry intact',
  { timeout: 300_000 }, async (context) => {
    let failS1 = false;
    const environment = await startLowerDvinaProductionAcceptanceEnv({
      llmRespond: s1Responder(() => failS1)
    });
    context.after(() => environment.close());

    const concurrent = await startTraceParty(environment, 's1-concurrent');
    const attempts = await Promise.allSettled([
      submit(environment, concurrent, 's1-concurrent-left',
        'Дойти до рыбацкого стана.'),
      submit(environment, concurrent, 's1-concurrent-right',
        'Дойти до рыбацкого стана.')
    ]);
    assert.ok(attempts.some(({ status }) => status === 'fulfilled'));
    assert.equal(await firstEntryChangeCount(environment, concurrent), 1);
    assert.deepEqual(await campRows(environment, concurrent), {
      g5: 1, baselines: 1, g6: 2, positions: 2, edges: 2, visibility: 2, envelopes: 1,
      claims: ['consumed'], actorAtCamp: 1, npcPlacements: 3
    });

    const invalid = await startTraceParty(environment, 's1-invalid-route');
    const beforeInvalid = await campRows(environment, invalid);
    await postResponse(environment,
      `/api/v1/parties/${encodeURIComponent(invalid)}/turns`, {
        ...environment.requestIdentity(invalid, 's1-invalid-route-turn'),
        raw_text: 'Дойти к несуществующей переправе.'
      });
    assert.deepEqual(await campRows(environment, invalid), beforeInvalid);
    assert.equal(await firstEntryChangeCount(environment, invalid), 0);

    const failed = await startTraceParty(environment, 's1-model-failure');
    await submit(environment, failed, 's1-model-failure-move',
      'Дойти до рыбацкого стана.');
    const entry = await campRows(environment, failed);
    failS1 = true;
    const failure = await postResponse(environment,
      `/api/v1/parties/${encodeURIComponent(failed)}/turns`, {
        ...environment.requestIdentity(failed, 's1-model-failure-look'),
        raw_text: 'Осмотреться.'
      });
    assert.equal(failure.ok, false);
    assert.equal(s1Calls(environment), 1);
    assert.deepEqual(await campRows(environment, failed), entry);
    assert.equal(await resolutionCount(environment, failed), 0);
    assert.equal(await firstEntryChangeCount(environment, failed), 1);
  });

function s1Responder(shouldFail = () => false) {
  const base = createCanonicalPhase11LlmResponder();
  return async (request) => {
    if (request.model === 'fixture-intent-router'
        && String(request.input?.raw_text).includes('несуществующей переправе')) {
      return { status: 'unknown', reason_code: 'unknown_intent' };
    }
    if (request.model === 'fixture-spatial-semantic-descriptor') {
      if (shouldFail()) throw new Error('intentional S1 fixture failure');
      return {
        schema: 'rus.s1_spatial_semantic_proposal.v1',
        request_id: request.input.request_id,
        name: 'Низкая плетёная загородка',
        description: 'Сырая плетёная загородка у берега, без особого значения.',
        semantic_requirements: ['interior_space']
      };
    }
    if (['fixture-turn-step-planner', 'fixture-turn-step-planner-repair']
        .includes(request.model)
        && (request.input?.request ?? request.input)?.root_player_action
          === 'Разделить доступный предмет на две обычные части.') {
      const turn = request.input.request ?? request.input;
      const source = turn.player_safe_state.items.find((item) =>
        item?.item_id === A1_SOURCE_ITEM_ID
          && item?.placement?.holder_character_id === turn.actor.actor_id
      )?.item_id;
      assert.equal(typeof source, 'string');
      const operation = { op: 'request_item_use', actor_ref: turn.actor.actor_id,
        item_ref: source, use_kind: 'other', target_refs: [],
        action_production: { source_refs: [source], tool_refs: [],
          requested_output_count: 2, identity_mode: 'independent_outputs',
          origin: 'direct_partition', result_class: 'ordinary_physical_result',
          material_extent: 'whole', output_class: 'ordinary_mundane',
          result_descriptor: { display_name: 'обычная часть предмета',
            physical_description: 'Две отделённые части исходного предмета.',
            qualitative_facts: ['видны следы разделения'],
            removed_physical_fact_refs: [], inscription_text: null,
            physical_form: 'compact', source_fact_delta: null } } };
      return { schema: 'turn_step_plan_v1', request_id: turn.request_id,
        committed_state_version: turn.committed_state_version,
        working_revision: turn.working_revision, step_index: turn.step_index,
        interpretation: { player_goal: turn.root_player_action,
          grounded_attempt: turn.remaining_intent, adaptation: 'literal' },
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
        operations: [operation], check: null, continuation: null,
        clarification: null, reason_code: 'partition_visible_item_inside_s1',
        reason: 'Разделить доступный предмет через A1.' };
    }
    if (['fixture-turn-step-planner', 'fixture-turn-step-planner-repair']
        .includes(request.model)
        && ['Войти за низкую плетёную загородку.',
          'Выйти из-за низкой плетёной загородки.'].includes(
          (request.input?.request ?? request.input)?.root_player_action)) {
      const turn = request.input.request ?? request.input;
      const target = turn.player_safe_state.visible_objects.find(
        ({ entity_ref: ref }) => ref?.entity_kind === 'spatial_local_reference')
        ?.entity_ref?.entity_id;
      assert.equal(typeof target, 'string');
      const operation = { op: 'request_movement', actor_ref: turn.actor.actor_id,
        movement_kind: 'local', target_ref: target };
      assert.equal(isSpatialSemanticRemainderInScope({ operation,
        playerSafeState: turn.player_safe_state }), true);
      return { schema: 'turn_step_plan_v1', request_id: turn.request_id,
        committed_state_version: turn.committed_state_version,
        working_revision: turn.working_revision, step_index: turn.step_index,
        interpretation: { player_goal: turn.root_player_action,
          grounded_attempt: turn.remaining_intent, adaptation: 'literal' },
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [operation], check: null,
        continuation: null, clarification: null,
        reason_code: 'enter_reloaded_s1_local',
        reason: 'Войти в видимую локальную деталь.' };
    }
    if (['fixture-turn-step-planner', 'fixture-turn-step-planner-repair']
        .includes(request.model)
        && (request.input?.request ?? request.input)?.root_player_action
          === 'Осмотреть низкую плетёную загородку.') {
      const turn = request.input.request ?? request.input;
      const target = turn.player_safe_state.visible_objects.find(
        ({ entity_ref: ref }) => ref?.entity_kind === 'spatial_local_reference')
        ?.entity_ref?.entity_id;
      assert.equal(typeof target, 'string');
      const operation = { op: 'request_discovery', actor_ref: turn.actor.actor_id,
        discovery_kind: 'inspect', target_refs: [target],
        query: 'осмотреть видимую загородку' };
      assert.equal(isSpatialSemanticRemainderInScope({ operation,
        playerSafeState: turn.player_safe_state }), true);
      return { schema: 'turn_step_plan_v1', request_id: turn.request_id,
        committed_state_version: turn.committed_state_version,
        working_revision: turn.working_revision, step_index: turn.step_index,
        interpretation: { player_goal: turn.root_player_action,
          grounded_attempt: turn.remaining_intent, adaptation: 'literal' },
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [operation], check: null,
        continuation: null, clarification: null,
        reason_code: 'inspect_reloaded_s1_local',
        reason: 'Осмотреть уже видимую локальную деталь.' };
    }
    return base(request);
  };
}

async function startTraceParty(environment, label) {
  const started = await post(environment, '/api/v1/new-games', {
    scenario_id: 'lower_dvina_trace_v1', request_id: `${label}-new`
  });
  await post(environment,
    `/api/v1/parties/${encodeURIComponent(started.party_id)}/opening-ack`, {
      client_ack_id: `${label}-ack`
    });
  await submit(environment, started.party_id, `${label}-inspection`,
    'Осмотреть место крушения подробно.');
  return started.party_id;
}

function s1Calls(environment) {
  return environment.llm.requests.filter(({ model }) =>
    model === 'fixture-spatial-semantic-descriptor').length;
}

async function campRows(environment, partyId) {
  const { rows: [row] } = await environment.partyPool.query(`
    SELECT
      (SELECT count(*)::int FROM party_runtime.party_g5_sites
       WHERE party_id=$1 AND generated_template_ref#>>'{entity_ref,entity_id}'=
         'trace_ld_v1_loc_fishing_camp') AS g5,
      (SELECT count(*)::int FROM party_runtime.party_scene_baselines
       WHERE party_id=$1 AND scene_template_ref#>>'{entity_ref,entity_id}'=$2) AS baselines,
      (SELECT count(*)::int FROM party_runtime.party_g6_instances
       WHERE party_id=$1 AND source_scene_template_ref#>>'{entity_ref,entity_id}'=$2) AS g6,
      (SELECT count(*)::int FROM party_runtime.scene_position_nodes p
       JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id
       WHERE p.party_id=$1 AND g.source_scene_template_ref#>>'{entity_ref,entity_id}'=$2) AS positions,
      (SELECT count(*)::int FROM party_runtime.scene_movement_edges e
       JOIN party_runtime.party_scene_baselines b ON b.id=e.scene_baseline_id
       WHERE e.party_id=$1 AND b.scene_template_ref#>>'{entity_ref,entity_id}'=$2) AS edges,
      (SELECT count(*)::int FROM party_runtime.visibility_links v
       JOIN party_runtime.party_scene_baselines b ON b.id=v.scene_baseline_id
       WHERE v.party_id=$1 AND b.scene_template_ref#>>'{entity_ref,entity_id}'=$2) AS visibility,
      (SELECT count(*)::int FROM party_runtime.party_spatial_semantic_envelopes
       WHERE party_id=$1 AND envelope->>'position_ref' IN (
         SELECT p.id FROM party_runtime.scene_position_nodes p
         JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id
         WHERE p.party_id=$1 AND g.source_scene_template_ref#>>'{entity_ref,entity_id}'=$2
       )) AS envelopes,
      (SELECT count(*)::int FROM party_runtime.party_journey_locations l
       JOIN party_runtime.scene_position_nodes p ON p.id=l.scene_position_id
       JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id
       WHERE l.party_id=$1 AND l.owner_kind='actor'
         AND g.source_scene_template_ref#>>'{entity_ref,entity_id}'=$2) AS "actorAtCamp",
      (SELECT count(*)::int FROM party_runtime.entity_placements e
       WHERE e.party_id=$1 AND e.entity_kind='npc'
         AND e.position_node_id IN (
           SELECT p.id FROM party_runtime.scene_position_nodes p
           JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id
           WHERE p.party_id=$1
             AND g.source_scene_template_ref#>>'{entity_ref,entity_id}'=$2
         )) AS "npcPlacements",
      (SELECT coalesce(array_agg(c.claim_status ORDER BY c.id), ARRAY[]::text[])
       FROM party_runtime.preparation_claims c
       JOIN party_runtime.preparation_snapshots s
         ON s.id=c.preparation_snapshot_id
       JOIN party_runtime.preparation_snapshot_members m
         ON m.preparation_snapshot_id=c.preparation_snapshot_id
        AND m.ordinal=c.preparation_member_ordinal
       WHERE s.party_id=$1
         AND m.source_authoring_ref->'entity_ref'->>'entity_id'=
         'trace_ld_v1_loc_fishing_camp') AS claims`, [partyId, CAMP_TEMPLATE]);
  return row;
}

async function resolutionCount(environment, partyId) {
  return Number((await environment.partyPool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_spatial_semantic_resolutions WHERE party_id=$1`,
    [partyId])).rows[0].count);
}

async function resolution(environment, partyId) {
  return (await environment.partyPool.query(
    `SELECT local_ref,semantics FROM party_runtime.party_spatial_semantic_resolutions
      WHERE party_id=$1`, [partyId]
  )).rows[0];
}

async function journeyPosition(environment, partyId) {
  return (await environment.partyPool.query(
    `SELECT scene_position_id FROM party_runtime.party_journey_locations
      WHERE party_id=$1 AND owner_kind='actor'`, [partyId]
  )).rows[0].scene_position_id;
}

async function currentTimestamp(environment, partyId) {
  return (await environment.partyPool.query(
    `SELECT s.state_payload->'timestamp' AS timestamp
       FROM party_runtime.parties p
       JOIN party_runtime.party_state_snapshots s
         ON s.party_id=p.party_id AND s.state_version=p.state_version
      WHERE p.party_id=$1`, [partyId])).rows[0].timestamp;
}

async function sceneItems(environment, partyId, positionId) {
  return (await environment.partyPool.query(
    `SELECT entity_id FROM party_runtime.entity_placements
      WHERE party_id=$1 AND entity_kind='item'
        AND placement_kind='scene_position' AND position_node_id=$2
      ORDER BY entity_id`, [partyId, positionId])).rows.map(
    ({ entity_id: id }) => id);
}

async function seedA1SourceItem(environment, partyId) {
  const { rows: [{ actor_id: actorId }] } = await environment.partyPool.query(
    `SELECT actor_id FROM party_runtime.party_actor_body_states
      WHERE party_id=$1 AND actor_kind='player_character'`, [partyId]);
  assert.equal(typeof actorId, 'string');
  const runtimeInstanceMechanicsSnapshot = {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'fixture:s1-first-entry', step_index: 1,
      operation_ref: 'fixture:s1-first-entry-seed',
      origin_kind: 'ambient_ordinary', source_refs: ['fixture:s1-source'] },
    mechanics: { mass_grams: 400, external_hand_cost: 0,
      carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: 1, unit: 'item' }, container: null }
  };
  const state = {
    lifecycle_status: 'active',
    runtime_instance_mechanics_snapshot: runtimeInstanceMechanicsSnapshot,
    ordinary_metadata: { semantic_type: 'ordinary_wood_piece',
      name: 'обычный деревянный брусок',
      origin: { kind: 'ordinary_direct_action_result',
        source_refs: ['fixture:s1-source'] },
      semantic_facts: [], operation_history: [] }
  };
  await environment.partyPool.query(
    `INSERT INTO party_runtime.party_items
      (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
       condition_state,legal_status,state,state_version)
     VALUES ($1,$2,NULL,NULL,NULL,NULL,1,'ordinary_runtime_instance',
       'owned',$3::jsonb,1)`, [partyId, A1_SOURCE_ITEM_ID,
      JSON.stringify(state)]);
  await environment.partyPool.query(
    `INSERT INTO party_runtime.party_item_placements
      (party_id,item_id,anchor_id,container_id,holder_npc_id,
       holder_character_id,physical_position,equipment_slot_category_id,
       attached_item_id)
     VALUES ($1,$2,NULL,NULL,NULL,$3,'hands',NULL,NULL)`,
    [partyId, A1_SOURCE_ITEM_ID, actorId]);
  await environment.partyPool.query(
    `INSERT INTO party_runtime.party_ownership
      (party_id,ownership_id,item_id,container_id,owner_npc_id,
       owner_character_id,owner_party,controller_npc_id,
       controller_character_id,claim_state)
     VALUES ($1,$2,$3,NULL,NULL,$4,false,NULL,$4,'established')`,
    [partyId, `ownership:${A1_SOURCE_ITEM_ID}`, A1_SOURCE_ITEM_ID, actorId]);
  const { rows: [{ state_version: stateVersion, state_payload: payload }] } =
    await environment.partyPool.query(
      `SELECT party.state_version,snapshot.state_payload
         FROM party_runtime.parties party
         JOIN party_runtime.party_state_snapshots snapshot
           ON snapshot.party_id=party.party_id
          AND snapshot.state_version=party.state_version
        WHERE party.party_id=$1`, [partyId]);
  payload.items ??= [];
  payload.items.push({
    item_id: A1_SOURCE_ITEM_ID, template_id: null, quantity: 1,
    condition_state: 'ordinary_runtime_instance', legal_status: 'owned', state,
    runtime_instance_mechanics_snapshot: runtimeInstanceMechanicsSnapshot,
    placement: {
      anchor_id: null, container_id: null, holder_npc_id: null,
      holder_character_id: actorId, physical_position: 'hands',
      equipment_slot_category_id: null, attached_item_id: null
    }
  });
  await environment.partyPool.query(
    `UPDATE party_runtime.party_state_snapshots
        SET state_payload=$3::jsonb,state_digest=$4
      WHERE party_id=$1 AND state_version=$2`,
    [partyId, stateVersion, JSON.stringify(payload), canonicalDigest(payload)]);
}

async function firstEntryChangeCount(environment, partyId) {
  return Number((await environment.partyPool.query(
    `SELECT count(*)::int AS count FROM party_runtime.party_v3_change_sets
      WHERE party_id=$1 AND operation_kind='first_entry'`, [partyId]
  )).rows[0].count);
}

async function submit(environment, partyId, label, rawText) {
  const identity = environment.requestIdentity(partyId, label);
  return post(environment, `/api/v1/parties/${encodeURIComponent(partyId)}/turns`, {
    ...identity, raw_text: rawText
  });
}

async function post(environment, pathname, body) {
  const response = await postResponse(environment, pathname, body);
  assert.equal(response.ok, true,
    `${response.status}: ${JSON.stringify(response.payload)}`);
  return response.payload.data;
}

async function postResponse(environment, pathname, body) {
  const response = await fetch(`${environment.baseUrl}${pathname}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  return { ok: response.ok, status: response.status, payload };
}

async function get(environment, pathname) {
  const response = await fetch(`${environment.baseUrl}${pathname}`);
  const payload = await response.json();
  assert.equal(response.ok, true, `${response.status}: ${JSON.stringify(payload)}`);
  return payload.data;
}
