import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NEEDS_CHECK_BLOCKER } from '@rus/runtime-catalog';
import { createLowerDvinaTracePhase1ARepository } from
  '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { errorEnvelope } from '../../apps/game-server/src/http/contracts.js';
import { createNeedsCheckMaterializationGuard } from
  '../../apps/game-server/src/runtime/needs-check-materialization-guard.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
} from './presence-rules-production-e2e-fixture.js';

const PLANNER = 'Return only one JSON object containing the semantic choice for one turn step.';
const BLOCKED_MESSAGE = 'Ход не сохранён. Здесь такой вещи не знают.';
const snapshot = JSON.parse(readFileSync(new URL(
  '../../data/world-catalogs/novgorod/game-base-v1/needs_check_blockers.v2.json',
  import.meta.url), 'utf8'));

function respond(output) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(output) } }]
  }), { status: 200 });
}

function plannerBase(playerGoal) {
  return { interpretation: { player_goal: playerGoal,
    grounded_attempt: playerGoal, adaptation: 'literal' },
  resolution: 'domain_request', goal_result: 'pending',
  activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
  check: null, continuation: null, clarification: null,
  direct_result_kind: null, operation_choice: null };
}

function discoveryPlan(request, query, positionRef) {
  const actor = request.actor.actor_id ?? request.actor.actor_ref;
  assert.equal(typeof positionRef, 'string', 'committed scene position is required');
  return { ...plannerBase(request.root_player_action),
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_discovery', actor_ref: actor,
      discovery_kind: 'search', target_refs: [positionRef], query }],
    continuation: { remaining_intent: request.root_player_action,
      depends_on_refs: [] },
    reason_code: 'ordinary_material_prerequisite',
    reason: 'Сначала нужно найти подходящий предмет.' };
}

function actionProductionPlan(request, descriptorName, identityMode = 'independent_outputs') {
  const actor = request.actor.actor_id ?? request.actor.actor_ref;
  const shirt = request.player_safe_state.items.find(({ name }) =>
    name === 'нижняя рубаха');
  assert.ok(shirt, 'production-root start must expose the committed shirt');
  const sourceFactDelta = identityMode === 'preserve_source' ? null : {
    physical_description: 'рубаха с вырезанной полосой ткани',
    qualitative_facts: ['от ткани отделена полоса'],
    removed_physical_fact_refs: [], physical_form: 'regular'
  };
  const resultDescriptor = { display_name: identityMode === 'preserve_source'
    ? null : descriptorName,
    physical_description: identityMode === 'preserve_source'
      ? 'нижняя рубаха с распущенным швом'
      : `новый предмет «${descriptorName}»`,
    qualitative_facts: [], removed_physical_fact_refs: [],
    inscription_text: null,
    physical_form: identityMode === 'preserve_source' ? 'regular' : 'bulky',
    source_fact_delta: sourceFactDelta };
  return { ...plannerBase(request.root_player_action),
    operations: [{ op: 'request_item_use', actor_ref: actor,
      item_ref: shirt.item_id, use_kind: 'other', target_refs: [],
      action_production: { source_refs: [shirt.item_id], tool_refs: [],
        requested_output_count: null, identity_mode: identityMode,
        origin: identityMode === 'preserve_source' ? null : 'direct_partition',
        result_class: identityMode === 'preserve_source'
          ? 'ordinary_physical_result' : 'partial_transformation',
        material_extent: identityMode === 'preserve_source' ? null : 'minor',
        output_class: 'ordinary_mundane', result_descriptor } }],
    reason_code: 'action_production',
    reason: 'Пробую обработать имеющуюся вещь.' };
}

function ordinaryResponse(request, proposalName = null) {
  if (request.mode === 'seed_scope') return {
    resolution: 'no_change', density_band_proposal: null,
    background_groups: [], entities: [], presence_resolutions: [],
    reason_code: 'no_change'
  };
  if (proposalName == null) return { resolution: 'no_change',
    semantic_materialization_kind: 'standalone_item',
    semantic_admission_class: 'common_mundane', reason_code: 'no_change' };
  return { resolution: 'materialize',
    semantic_materialization_kind: 'standalone_item',
    semantic_admission_class: 'common_mundane',
    ...(request.world_knowledge == null ? {} : {
      world_knowledge_claim_refs: [],
      world_knowledge_constraint_refs:
        (request.world_knowledge.hard_constraints ?? []).map(({ claim_ref }) => claim_ref),
      world_knowledge_constraint_verdict: 'clear'
    }),
    entities: [{ semantic_type: 'household_tool', name: proposalName,
      presence_expectation: 'plausible', mechanics_proposal: {
        mass_grams: 900, external_hand_cost: 0, carry_form: 'bulky',
        packing_slot_cost: 3,
        quantity: { value: 1, unit: 'item' }, container: null
      } }], reason_code: 'materialize' };
}

function installDeterministicFetch(seen) {
  const restorePresenceFetch = installPresenceProductionE2eFetch();
  const baseFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) !== 'https://target-acceptance.invalid/chat/completions') {
      return baseFetch(url, init);
    }
    const call = JSON.parse(init.body);
    const system = call.messages[0].content.replace(/^Return a valid json object\.\s*/u, '');
    const user = JSON.parse(call.messages.find(({ role }) => role === 'user').content);
    const request = user.request ?? user;
    if (system.startsWith(PLANNER)) {
      const action = request.root_player_action;
      seen.plannerCalls += 1;
      if (action === 'Найду колесную прялку.') {
        return respond(discoveryPlan(request, 'Колёсная прялка', seen.positionRef));
      }
      if (action === 'Найду павлина.') {
        return respond(discoveryPlan(request, 'павлин', seen.positionRef));
      }
      if (action === 'Осматриваю нижнюю рубаху.') {
        const shirt = request.player_safe_state.items.find(({ name }) =>
          name === 'нижняя рубаха');
        assert.ok(shirt);
        return respond({ ...plannerBase(action), operations: [{
          op: 'request_discovery', actor_ref: request.actor.actor_id
            ?? request.actor.actor_ref, discovery_kind: 'inspect',
          target_refs: [shirt.item_id], query: shirt.name }],
        reason_code: 'inspect_existing_item', reason: 'Осматриваю известную вещь.' });
      }
      if (action === 'Сделаю колесную прялку из рубахи.') {
        return respond(actionProductionPlan(request, 'Колёсная прялка'));
      }
      if (action === 'Сделаю железный капкан из рубахи.') {
        return respond(actionProductionPlan(request, 'железный капкан'));
      }
      if (action === 'Распущу шов на рубахе.') {
        return respond(actionProductionPlan(request, 'нижняя рубаха', 'preserve_source'));
      }
    }
    if (system.startsWith('Return only one JSON object containing the ordinary semantic choice.')) {
      seen.ordinaryCalls += 1;
      return respond(ordinaryResponse(user, null));
    }
    if (system.startsWith('You are a strict evidence auditor of Russian game prose.')) {
      const ids = user.segments.map(({ segment_id }) => segment_id);
      const sources = [...user.required_current_beat.changes,
        ...user.required_current_beat.uncertainties];
      return respond({ reviewed_segments: ids,
        source_reviews: sources.map(({ ref }) => ({ ref, segment_choices: ids })),
        unsupported: [], literary_failures: [], evidence: ['deterministic test response'] });
    }
    if (system.startsWith('Return only {"pass"')) {
      return respond({ pass: true, failed_checks: [], concerns: [], evidence: [] });
    }
    if (system.startsWith('Return only {"prose"')) {
      const beat = user.required_current_beat;
      const text = [...(beat?.changes ?? []), ...(beat?.uncertainties ?? [])]
        .map(({ text: value }) => value).filter(Boolean).join('\n\n')
        || user.optional_support?.visible_scene || 'Вокруг тихо.';
      return respond({ prose: text });
    }
    if (system.includes('ordinary_materialization')) {
      seen.ordinaryCalls += 1;
      return respond(ordinaryResponse(user, null));
    }
    return baseFetch(url, init);
  };
  return () => { globalThis.fetch = baseFetch; restorePresenceFetch(); };
}

function blockerQueueId(name, context = '') {
  return NEEDS_CHECK_BLOCKER.matches({ snapshot,
    candidate: { name, context, region: 'region_novgorod_land', year: 1230 } })?.queue_id;
}

async function committedFingerprint(partyPool, partyId) {
  const state = await createLowerDvinaTracePhase1ARepository({
    query: partyPool.query.bind(partyPool) }).loadInternal(partyId);
  const rows = async (sql, params = [partyId]) => (await partyPool.query(sql, params)).rows;
  return {
    party: await rows(`SELECT state_version FROM party_runtime.parties WHERE party_id=$1`),
    catalogPin: await rows(`SELECT catalog_revision_id,catalog_digest,import_id,
      activation_event_id FROM party_runtime.party_catalog_pins WHERE party_id=$1`),
    clock: state.clock,
    snapshots: await rows(`SELECT state_version,state_digest FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 ORDER BY state_version`),
    items: await rows(`SELECT item_id,template_id,profile_id,category_id,quantity,
      condition_state,legal_status,state::text AS state
      FROM party_runtime.party_items WHERE party_id=$1 ORDER BY item_id`),
    presence: await rows(`SELECT scope_kind,scope_id,state_version,aggregate_payload::text AS payload
      FROM party_runtime.party_ordinary_materialization_aggregates
      WHERE party_id=$1 ORDER BY scope_kind,scope_id`),
    presenceCommits: await rows(`SELECT request_identity,input_digest,transition_digest,
      write_plan_digest,resolution,from_party_state_version,to_party_state_version
      FROM party_runtime.party_ordinary_materialization_commits
      WHERE party_id=$1 ORDER BY request_identity`),
    p16: await rows(`SELECT idempotency_key,request_id,payload_hash,physical_plan_digest,
      status,committed_result::text AS result FROM party_runtime.commit_idempotency
      ORDER BY idempotency_key`, [])
  };
}

async function assertBlocked(runtime, partyId, requestId, text, expectedQueueId) {
  let caught;
  await assert.rejects(runtime.submitTurn(partyId, { raw_text: text,
    request_id: requestId }), (error) => { caught = error; return true; });
  assert.equal(caught.code, 'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED');
  assert.equal(caught.turn_commit_status, 'not_started');
  const publicFailure = errorEnvelope(caught, { requestId });
  assert.equal(publicFailure.status, 409);
  assert.deepEqual(publicFailure.body.error, { code: 'WORLD_ACTION_UNAVAILABLE',
    message: BLOCKED_MESSAGE, turn_commit_status: 'not_started' });
  assert.doesNotMatch(JSON.stringify(publicFailure), /queue_id|HNT\d{4}|fchk_/u);
  const privateReport = runtime.llmDiagnostics.takeLogReport({
    party_id: partyId, request_id: requestId });
  const failure = privateReport?.gameplay_traces?.find(({ event }) =>
    event === 'workflow_failed');
  assert.equal(failure?.error?.details?.queue_id, expectedQueueId,
    'private trace must retain the matched queue ID');
  assert.equal(privateReport?.aggregate?.repair_calls, 0,
    'typed blocker must not start model repair');
}

test('production root blocks O1/A1 anachronisms before commit and preserves allowed paths',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const seen = { plannerCalls: 0, ordinaryCalls: 0, positionRef: null };
    const restoreFetch = installDeterministicFetch(seen);
    t.after(() => restoreFetch());
    let { runtime } = await createPresenceProductionRoot({ ...env,
      extraConfig: { developerMode: true } });
    t.after(async () => { if (runtime) await runtime.close(); });
    const partyId = await publicStartScenario(runtime,
      'novgorod_vikhtuy_work_storage_v1');
    seen.positionRef = (await env.partyPool.query(`SELECT scene_position_id
      FROM party_runtime.party_journey_locations WHERE party_id=$1
        AND owner_kind='actor'`, [partyId])).rows[0]?.scene_position_id;
    assert.equal(typeof seen.positionRef, 'string');
    let ordinal = 0;
    const requestId = () => `needs-check-${partyId}-${ordinal++}`;

    const beforeO1 = await committedFingerprint(env.partyPool, partyId);
    const ordinaryBefore = seen.ordinaryCalls;
    const o1Request = requestId();
    await assertBlocked(runtime, partyId, o1Request,
      'Найду колесную прялку.', blockerQueueId('Колёсная прялка'));
    assert.equal(seen.ordinaryCalls, ordinaryBefore,
      'O1 query guard must stop before Stage A/Stage B materialization model calls');
    assert.deepEqual(await committedFingerprint(env.partyPool, partyId), beforeO1,
      'O1 refusal must leave party state, clock, items, presence and P16 unchanged');

    const beforeA1 = await committedFingerprint(env.partyPool, partyId);
    await assertBlocked(runtime, partyId, requestId(),
      'Сделаю колесную прялку из рубахи.',
      blockerQueueId('Колёсная прялка', 'новый предмет «Колёсная прялка»'));
    await assertBlocked(runtime, partyId, requestId(),
      'Сделаю железный капкан из рубахи.',
      blockerQueueId('железный капкан', 'новый предмет «железный капкан»'));
    assert.deepEqual(await committedFingerprint(env.partyPool, partyId), beforeA1,
      'A1 refusals must leave party state, clock, items, presence and P16 unchanged');

    await runtime.submitTurn(partyId, { raw_text: 'Осматриваю нижнюю рубаху.',
      request_id: requestId() });

    const beforePeacockOrdinary = seen.ordinaryCalls;
    await runtime.submitTurn(partyId, { raw_text: 'Найду павлина.',
      request_id: requestId() });
    assert.ok(seen.ordinaryCalls > beforePeacockOrdinary,
      'regional_presence-only peacock query reaches ordinary materialization applicability');

    await runtime.submitTurn(partyId, { raw_text: 'Распущу шов на рубахе.',
      request_id: requestId() });
    const repeatId = `needs-check-repeat-${partyId}`;
    const beforeRepeat = await committedFingerprint(env.partyPool, partyId);
    await assertBlocked(runtime, partyId, repeatId,
      'Найду колесную прялку.', blockerQueueId('Колёсная прялка'));
    await runtime.close();
    runtime = null;
    ({ runtime } = await createPresenceProductionRoot({ ...env,
      extraConfig: { developerMode: true } }));
    await assertBlocked(runtime, partyId, repeatId,
      'Найду колесную прялку.', blockerQueueId('Колёсная прялка'));
    assert.deepEqual(await committedFingerprint(env.partyPool, partyId), beforeRepeat,
      'retry after runtime restart must repeat the refusal without committing');
  });

test('legacy v1 pin without a blocker snapshot retains the pre-feature behavior', async () => {
  const worldPin = { world_revision_id: 'world-v1',
    world_catalog_digest: 'a'.repeat(64) };
  const pin = { schema: 'rus.runtime_catalog_pin.v2',
    catalog_revision_id: 'procedural_scene_final_candidate_v1_001' };
  const guard = createNeedsCheckMaterializationGuard({
    worldBaseReader: { async read() { throw new Error('legacy pin must not query world rows'); } },
    calendarProfile: { profile_id: 'unused-for-legacy-v1' }
  });
  await assert.doesNotReject(guard({ partyId: 'legacy-party',
    committedState: { position: { g4_id: 'g4' } },
    candidate: { name: 'Колёсная прялка' }, catalogContext: {
      pin, world_pin: worldPin, needs_check_blocker_snapshot: null
    } }));
});
