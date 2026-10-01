import assert from 'node:assert/strict';
import test from 'node:test';
import { createNeedsCheckMaterializationGuard } from
  '../../apps/game-server/src/runtime/needs-check-materialization-guard.js';
import { createLlmDiagnostics } from
  '../../apps/game-server/src/runtime/llm-diagnostics.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
} from './presence-rules-production-e2e-fixture.js';

const PLANNER = 'Return only one JSON object containing the semantic choice for one turn step.';

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
        output_class: 'ordinary_mundane', result_descriptor: resultDescriptor } }],
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
      if (action === 'Найду павлина.') {
        return respond(discoveryPlan(request, 'павлин', seen.positionRef));
      }
      if (action === 'Сделаю железный капкан из рубахи.') {
        return respond(actionProductionPlan(request, 'железный капкан'));
      }
      if (action === 'Осматриваю нижнюю рубаху.') {
        return respond({ ...plannerBase(action), resolution: 'direct',
          goal_result: 'achieved', activity: { owner: 'semantic',
            duration_class: 'moment', effort: 'none' }, operations: [],
          direct_result_kind: 'player_safe_item_observation',
          reason_code: 'inspect_existing_item', reason: 'Осматриваю известную вещь.' });
      }
      if (action === 'Сделаю павлина из рубахи.') {
        return respond(actionProductionPlan(request, 'павлин'));
      }
      if (action === 'Распущу шов на рубахе.') {
        return respond(actionProductionPlan(request, 'нижняя рубаха', 'preserve_source'));
      }
    }
    if (system.startsWith('Return only JSON with exactly mode and support_refs.')) {
      seen.assessmentCalls = (seen.assessmentCalls ?? 0) + 1;
      return respond({ mode: 'discovery', support_refs: [] });
    }
    if (system.startsWith('Return only {"pass":true,"concerns":[]}')) {
      seen.groundingAuditCalls = (seen.groundingAuditCalls ?? 0) + 1;
      return respond({ pass: true, concerns: [] });
    }
    if (system.startsWith('Return only one JSON object containing the ordinary semantic choice.')) {
      seen.ordinaryCalls += 1;
      seen.ordinaryModes ??= [];
      seen.ordinaryModes.push(request.mode);
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

test('production root preserves D59 allowed A1 paths and existing-item inspection',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const seen = { plannerCalls: 0, ordinaryCalls: 0, ordinaryModes: [], positionRef: null };
    const restoreFetch = installDeterministicFetch(seen);
    t.after(() => restoreFetch());
    let llmDiagnostics = createLlmDiagnostics({ developerMode: true });
    let { runtime } = await createPresenceProductionRoot({ ...env,
      extraConfig: { developerMode: true, llmDiagnostics } });
    t.after(async () => { if (runtime) await runtime.close(); });
    const partyId = await publicStartScenario(runtime,
      'novgorod_vikhtuy_work_storage_v1');
    seen.positionRef = (await env.partyPool.query(`SELECT scene_position_id
      FROM party_runtime.party_journey_locations WHERE party_id=$1
        AND owner_kind='actor'`, [partyId])).rows[0]?.scene_position_id;
    assert.equal(typeof seen.positionRef, 'string');
    let ordinal = 0;
    const requestId = () => `needs-check-${partyId}-${ordinal++}`;

    const inspectItems = () => env.partyPool.query(`SELECT item_id,state::text AS state
      FROM party_runtime.party_items WHERE party_id=$1 ORDER BY item_id`, [partyId]);
    const inspectPresence = () => env.partyPool.query(`SELECT scope_kind,scope_id,
      state_version,aggregate_payload::text AS payload
      FROM party_runtime.party_ordinary_materialization_aggregates
      WHERE party_id=$1 ORDER BY scope_kind,scope_id`, [partyId]);
    const inspectCommits = () => env.partyPool.query(`SELECT request_identity,
      input_digest,transition_digest,write_plan_digest,resolution,
      from_party_state_version,to_party_state_version
      FROM party_runtime.party_ordinary_materialization_commits
      WHERE party_id=$1 ORDER BY request_identity`, [partyId]);
    const beforeInspectItems = (await inspectItems()).rows;
    assert.ok(beforeInspectItems.some(({ state }) => state.includes('нижняя рубаха')));
    const beforeInspectPresence = (await inspectPresence()).rows;
    const beforeInspectCommits = (await inspectCommits()).rows;
    const inspection = await runtime.submitTurn(partyId, {
      raw_text: 'Осматриваю нижнюю рубаху.', request_id: requestId() });
    assert.deepEqual((await inspectItems()).rows, beforeInspectItems,
      'inspection does not change committed items');
    assert.deepEqual((await inspectPresence()).rows, beforeInspectPresence,
      'inspection does not change the ordinary presence ledger');
    assert.deepEqual((await inspectCommits()).rows, beforeInspectCommits,
      'inspection does not write presence commits');
    assert.match(inspection.screen?.main_prose ?? '', /рубах/iu,
      'player receives the observation of the shirt');

    const peacockItemsBefore = (await env.partyPool.query(`SELECT item_id FROM
      party_runtime.party_items WHERE party_id=$1 ORDER BY item_id`, [partyId]))
      .rows.map(({ item_id }) => item_id);
    await runtime.submitTurn(partyId, { raw_text: 'Сделаю павлина из рубахи.',
      request_id: requestId() });
    const peacockItemsAfter = (await env.partyPool.query(`SELECT item_id,state::text AS state
      FROM party_runtime.party_items WHERE party_id=$1 ORDER BY item_id`, [partyId])).rows;
    assert.ok(peacockItemsAfter.some(({ item_id, state }) =>
      !peacockItemsBefore.includes(item_id) && state.includes('павлин')),
    'regional_presence-only peacock A1 result passes and is committed');

    const itemIdsBeforePreserve = (await env.partyPool.query(`SELECT item_id FROM
      party_runtime.party_items WHERE party_id=$1 ORDER BY item_id`, [partyId]))
      .rows.map(({ item_id }) => item_id);
    await runtime.submitTurn(partyId, { raw_text: 'Распущу шов на рубахе.',
      request_id: requestId() });
    const itemIdsAfterPreserve = (await env.partyPool.query(`SELECT item_id FROM
      party_runtime.party_items WHERE party_id=$1 ORDER BY item_id`, [partyId]))
      .rows.map(({ item_id }) => item_id);
    assert.deepEqual(itemIdsAfterPreserve, itemIdsBeforePreserve,
      'preserve_source passes without creating an independent item');

    const blockerDescriptorRequestId = requestId();
    let blockerDescriptorError;
    try {
      await runtime.submitTurn(partyId, {
        raw_text: 'Сделаю железный капкан из рубахи.',
        request_id: blockerDescriptorRequestId
      });
    } catch (error) {
      blockerDescriptorError = error;
    }
    assert.notEqual(blockerDescriptorError?.code,
      'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED',
      'player A1 must not be refused by the needs-check blocker');
    const blockerDescriptorReport = llmDiagnostics.takeLogReport({
      party_id: partyId, request_id: blockerDescriptorRequestId });
    assert.equal(blockerDescriptorReport?.gameplay_traces?.some(({ event }) =>
      event === 'needs_check_candidate_filtered'), false,
    'player A1 must not emit a needs-check filter trace');
  });

test('legacy pinned catalog without a blocker requirement retains prior behavior', async () => {
  const worldPin = { world_revision_id: 'world-v1',
    world_catalog_digest: 'a'.repeat(64) };
  const pin = { schema: 'rus.runtime_catalog_pin.v2',
    catalog_revision_id: 'legacy-test', import_id: 'legacy-import',
    catalog_digest: 'b'.repeat(64), runtime_contract_digest: 'c'.repeat(64) };
  const guard = createNeedsCheckMaterializationGuard({
    resolveRegion: async () => { throw new Error('legacy pin must not query region'); },
    calendarProfile: { profile_id: 'unused-for-legacy-v1' }
  });
  await assert.doesNotReject(guard({
    committedState: { position: { g4_id: 'g4' } },
    candidate: { name: 'Колёсная прялка' }, catalogContext: {
      pin, world_pin: worldPin, needs_check_blocker_snapshot: null,
      needs_check_blocker_snapshot_required: false
    } }));
});
