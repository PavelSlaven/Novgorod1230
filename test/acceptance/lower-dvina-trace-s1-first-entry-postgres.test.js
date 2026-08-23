import assert from 'node:assert/strict';
import test from 'node:test';

import { startLowerDvinaProductionAcceptanceEnv } from
  '../helpers/lower-dvina-production-acceptance-env.js';
import { createCanonicalPhase11LlmResponder } from
  '../helpers/lower-dvina-phase-11-llm.js';

const CAMP_TEMPLATE = 'trace_ld_v1_tpl_fishing_camp';

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
      g5: 0, baselines: 0, g6: 0, positions: 0, envelopes: 0,
      claims: ['reserved'], actorAtCamp: 0, npcPlacements: 0
    });
    await submit(environment, partyId, 's1-first-entry-inspection',
      'Осмотреть место крушения подробно.');

    await submit(environment, partyId, 's1-first-entry-move',
      'Дойти до рыбацкого стана.');
    assert.equal(s1Calls(environment), 0);
    assert.deepEqual(await campRows(environment, partyId), {
      g5: 1, baselines: 1, g6: 1, positions: 1, envelopes: 1,
      claims: ['consumed'], actorAtCamp: 1, npcPlacements: 3
    });
    assert.equal(await resolutionCount(environment, partyId), 0);
    assert.equal(await firstEntryChangeCount(environment, partyId), 1);

    await environment.restartRoot();
    await get(environment,
      `/api/v1/parties/${encodeURIComponent(partyId)}/screen`);
    assert.deepEqual(await campRows(environment, partyId), {
      g5: 1, baselines: 1, g6: 1, positions: 1, envelopes: 1,
      claims: ['consumed'], actorAtCamp: 1, npcPlacements: 3
    });

    const look = await submit(environment, partyId, 's1-first-entry-look',
      'Осмотреться.');
    assert.equal(s1Calls(environment), 1);
    assert.equal(await resolutionCount(environment, partyId), 1);
    const committedResolution = await resolution(environment, partyId);
    assert.equal(typeof committedResolution.local_ref, 'string');
    assert.equal(typeof committedResolution.semantics.name, 'string');
    assert.equal(typeof committedResolution.semantics.description, 'string');
    const calls = s1Calls(environment);
    await environment.restartRoot();
    assert.deepEqual(await submit(environment, partyId, 's1-first-entry-look',
      'Осмотреться.'), look);
    assert.equal(s1Calls(environment), calls);
    assert.equal(await resolutionCount(environment, partyId), 1);
    assert.deepEqual(await resolution(environment, partyId), committedResolution);
    assert.equal(await firstEntryChangeCount(environment, partyId), 1);
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
      g5: 1, baselines: 1, g6: 1, positions: 1, envelopes: 1,
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
        semantic_requirements: []
      };
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
