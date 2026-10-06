import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  PRESENCE_E2E_MOVE_TEXT,
} from './presence-rules-production-e2e-fixture.js';
import { createProductionLlmRoleRunner } from
  '../../apps/game-server/src/infrastructure/provider/deepseek.js';
import { DEFAULT_GAMEPLAY_MODEL, createLlmSettingsOwner } from
  '../../apps/game-server/src/runtime/llm-settings.js';
import { turnStepOperationChoices } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import { identifyLlmTestRole } from './llm-test-role.js';

const TAKE = 'Беру валежник.';
const MAKE = 'Оторву полосу от подола рубахи.';
const TAKE_THREE = 'Возьму три палки из валежника.';
const WALK = PRESENCE_E2E_MOVE_TEXT;
const LOOK = 'Осматриваюсь вокруг.';

const direct = (operations, extra = {}) => ({ interpretation: { adaptation: 'literal' },
  resolution: 'direct', goal_result: 'achieved',
  activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
  operations, check: null, continuation: null, clarification: null, direct_result_kind: null,
  operation_choice: null, reason_code: 'take', reason: 'Игрок берёт валежник.', ...extra });

/** Deterministic model: walking and narration come from the shared presence fixture; only
 * the take turn (planner, ordinary Stage B, grounding auditor) is scripted here. Stage A
 * must never be asked for a finite-only scope. */
function installTakeFetch(seen) {
  const restoreBase = installPresenceProductionE2eFetch({ observeText: LOOK });
  const base = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    try { return await scripted(url, init); } catch (error) { seen.stubError ??= error; throw error; }
  };
  const scripted = async (url, init) => {
    const call = JSON.parse(init.body);
    const system = call.messages[0].content.replace(/^Return a valid json object\.\s*/u, '');
    const user = JSON.parse(call.messages.find((message) => message.role === 'user').content);
    const role = identifyLlmTestRole(call);
    const respond = (output) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 });
    const beat = user.required_current_beat;
    if (system.startsWith('Return only {"prose"') && beat != null
        && beat.changes.length === 0 && beat.uncertainties.length === 0) {
      // First arrival at a new place: nothing changed, the prose is the visible scene itself.
      const scene = user.optional_support ?? {};
      return respond({ prose: [scene.visible_scene, ...(scene.sensory_details ?? []),
        ...(scene.visible_objects ?? []).map(({ display_label: label }) => label),
        ...(scene.visible_npc ?? []).map(({ display_label: label }) => label)]
        .filter(Boolean).join('. ') });
    }
    if (role === 'world_knowledge_query_planner'
        && user.purpose === 'materialization_support') {
      return respond({ schema: 'world_knowledge_query_plan_v1', query_locale: 'ru',
        domains: ['environment', 'material_culture'],
        focus_refs: ['wk:material_culture:wood'], requested_predicates: [],
        search_hints: ['Является ли валежник обычной частью древесного материала в окрестностях?'] });
    }
    if (system.startsWith('Return only JSON with exactly mode and support_refs.')) {
      return respond({ mode: 'discovery', support_refs: [] });
    }
    if (system.startsWith('Return only one JSON object containing the ordinary semantic choice')) {
      seen.ordinaryModes.push(user.mode);
      const quantity = user.required_quantity?.value ?? seen.nextQuantity ?? 1;
      assert.equal(user.mode, 'resolve_presence', 'Stage A must not run for a finite-only scope');
      return respond({ resolution: 'materialize', semantic_materialization_kind: 'standalone_item',
        semantic_admission_class: 'common_mundane', world_knowledge_claim_refs: [],
        world_knowledge_constraint_refs: [], world_knowledge_constraint_verdict: 'clear',
        reason_code: 'materialize', entities: [{ semantic_type: 'deadwood_material_portion',
          name: 'валежник', presence_expectation: 'routine', mechanics_proposal: {
            mass_grams: 50 * quantity, external_hand_cost: 1, carry_form: 'regular',
            packing_slot_cost: 0, quantity: { value: quantity, unit: 'item' },
            container: null } }] });
    }
    if (system.startsWith('Return only {"pass":true,"concerns":[]}') || system.startsWith('Возвращай только {"pass"')) {
      seen.auditorCalls += 1;
      return respond({ pass: true, concerns: [] });
    }
    if (role === 'turn_step_planner') {
      const request = user.request ?? user;
      const visible = request.player_safe_state?.current_visible_context?.visible_objects ?? [];
      const actor = request.actor.actor_id ?? request.actor.actor_ref;
      if (request.root_player_action === TAKE || request.root_player_action === TAKE_THREE) {
        seen.plannerSteps.push(request.step_index);
        const item = visible.find(({ entity_ref: ref, display_label: label, visible_status: status }) =>
          ref.entity_kind === 'item' && label === 'валежник' && status === 'available');
        if (item != null) return respond(direct([{ op: 'move_entity',
          entity_ref: item.entity_ref.entity_id,
          placement: { relation: 'held_by', target_ref: actor } }]));
        const source = visible.find(({ entity_ref: ref }) =>
          ref.entity_kind === 'ordinary_resource_source');
        assert.ok(source, 'finite source must be visible to the planner at focus');
        const wanted = request.root_player_action;
        return respond({ interpretation: { player_goal: wanted, grounded_attempt: wanted,
          adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_discovery', actor_ref: actor, discovery_kind: 'inspect',
          target_refs: [source.entity_ref.entity_id], query: source.display_label,
          ...(wanted === TAKE_THREE ? { quantity: { value: 3, unit: 'item' } } : {}) }],
        check: null, continuation: { remaining_intent: wanted, depends_on_refs: [] },
        clarification: null, direct_result_kind: null, operation_choice: null,
        reason_code: 'ordinary_material_prerequisite', reason: 'Сначала источник.' });
      }
      if (request.root_player_action === MAKE) {
        seen.makeSteps.push(request.step_index);
        const shirt = request.player_safe_state.items.find(({ name, placement }) =>
          name === 'нижняя рубаха' && placement?.holder_character_id === actor);
        assert.ok(shirt, 'own shirt must be a planner-visible item');
        return respond({ interpretation: { player_goal: MAKE, grounded_attempt: MAKE,
          adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
        direct_result_kind: null, operation_choice: null,
        operations: [{ op: 'request_item_use', actor_ref: actor, item_ref: shirt.item_id,
          use_kind: 'other', target_refs: [], action_production: { source_refs: [shirt.item_id],
            tool_refs: [], requested_output_count: null, identity_mode: 'independent_outputs',
            origin: 'direct_partition', result_class: 'partial_transformation',
            material_extent: 'minor', output_class: 'ordinary_mundane',
            result_descriptor: { display_name: 'полоса ткани',
              physical_description: 'отрезанная полоса льняной ткани',
              qualitative_facts: ['отделена от подола'], removed_physical_fact_refs: [],
              inscription_text: null, physical_form: 'long',
              source_fact_delta: { physical_description: 'рубаха с укороченным подолом',
                qualitative_facts: ['подол укорочен'], removed_physical_fact_refs: [],
                physical_form: 'regular' } } } }],
        check: null, continuation: null, clarification: null, reason_code: 'action_production',
        reason: 'Игрок отрывает полосу от рубахи.' });
      }
      const moves = turnStepOperationChoices(request).filter(({ operation }) =>
        operation.op === 'request_movement');
      const pick = moves.find(({ operation }) => operation.movement_kind === 'local'
        && /подход/u.test(operation.description ?? ''))
        ?? moves.find(({ operation }) => operation.movement_kind === 'route');
      if (pick != null) return respond({ interpretation: { player_goal: request.root_player_action,
        grounded_attempt: request.root_player_action, adaptation: 'literal' },
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operation_family: 'request_movement', operation_choice: pick.choice_id, check: null,
      continuation: null, clarification: null, direct_result_kind: null,
      reason_code: 'visible_movement', reason: 'Иду.' });
    }
    return base(url, init);
  };
  return () => { globalThis.fetch = base; restoreBase(); };
}

/** Custom (qualified) provider identity, as a stored settings record would carry it. */
async function qualifiedSettings() {
  const roleRunner = createProductionLlmRoleRunner({ env: {} });
  const owner = createLlmSettingsOwner({ qualifyCustom: async (candidate) => {
    const described = roleRunner.describe({ scope: 'turn_runtime', role_id: 'ordinary_materialization',
      overrides: { temperature: 0, maxTokens: 20_000 }, provider_snapshot: candidate });
    const { provider, model, scope, role_id: roleId, config_hash: configHash } = described;
    return { provider, model, scope, role_id: roleId, config_hash: configHash,
      qualification_version: 71 };
  } });
  await owner.apply({ mode: 'custom', compatibility: 'openai_compatible',
    base_url: 'https://target-acceptance.invalid', model: DEFAULT_GAMEPLAY_MODEL,
    api_key: 'isolated-fixture-key' });
  return owner;
}

async function rows(pool, sql, params) { return (await pool.query(sql, params)).rows; }

test('make at the canonical start (A1) and take at a generated G5: results persist across a restart',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t, { withTestWaveEnrichment: false });
    const seen = { ordinaryModes: [], plannerSteps: [], auditorCalls: 0, nextQuantity: 1, makeSteps: [] };
    const restoreFetch = installTakeFetch(seen);
    t.after(() => restoreFetch());
    const llmSettings = await qualifiedSettings();
    const { runtime } = await createPresenceProductionRoot({ ...env, llmSettings });
    let reloaded = null;
    try {
      let partyId = null;
      let madeSnapshot = null;
      for (let attempt = 0; attempt < 6 && partyId == null; attempt += 1) {
        const opening = await runtime.startNewGame({
          scenario_id: 'novgorod_pine_ridge_approach_v1',
          request_id: `finite-take-start-${attempt}` });
        await runtime.acknowledgeOpening(opening.party_id, {
          client_ack_id: `finite-take-ack-${attempt}` });
        let n = 0;
        await runtime.submitTurn(opening.party_id, { raw_text: LOOK,
          request_id: `finite-take-${attempt}-look` });
        // Some parties start in fog: no visible passage (documented risk) — take a fresh party.
        const lookScreen = (await runtime.getPartyScreen(opening.party_id)).screen;
        if ((lookScreen.panels?.route?.data?.movement?.options ?? []).length === 0) continue;
        // Make (A1) at the canonical start place: tear a strip from the own shirt.
        const madeSql = `SELECT item_id, state_version FROM party_runtime.party_items
          WHERE party_id=$1 AND state::text LIKE '%action_production%' ORDER BY item_id`;
        const before = await rows(env.partyPool, madeSql, [opening.party_id]);
        await runtime.submitTurn(opening.party_id, { raw_text: MAKE,
          request_id: `finite-take-${attempt}-make` });
        const made = await rows(env.partyPool, madeSql, [opening.party_id]);
        assert.deepEqual(seen.makeSteps, [1]);
        assert.equal(made.length, before.length + 2, 'new strip + changed source shirt');
        assert.ok(made.some(({ item_id: id }) => id.startsWith('a1-result:')), 'new strip item');
        assert.ok(made.some(({ state_version: v }) => v === '2'), 'source shirt changed in place');
        madeSnapshot = { sql: madeSql, made };
        for (const step of [WALK, WALK, WALK]) {
          await runtime.submitTurn(opening.party_id, { raw_text: step,
            request_id: `finite-take-${attempt}-${n++}` });
        }
        const generated = (await rows(env.partyPool,
          `SELECT 1 FROM party_runtime.party_g5_sites WHERE party_id=$1 AND origin='generated'`,
          [opening.party_id])).length > 0;
        if (generated) {
          await runtime.submitTurn(opening.party_id, { raw_text: WALK,
            request_id: `finite-take-${attempt}-focus` });
          partyId = opening.party_id;
        }
      }
      assert.ok(partyId, 'a generated G5 must be reached within 6 parties');
      const stock = () => rows(env.partyPool, `SELECT resource_node_id, quantity_numerator
        FROM party_runtime.party_resource_nodes WHERE party_id=$1
          AND resource_node_id LIKE 'm2c_finite_deadwood_v1:%'`, [partyId]);
      const held = () => rows(env.partyPool, `SELECT p.item_id, p.holder_character_id,
        p.physical_position FROM party_runtime.party_item_placements p
        WHERE p.party_id=$1 AND p.item_id LIKE 'ordinary_item_%'`, [partyId]);
      const before = await stock();
      assert.equal(before.length, 1);
      assert.equal(before[0].quantity_numerator, '60');
      assert.deepEqual(await held(), []);

      await runtime.submitTurn(partyId, { raw_text: TAKE, request_id: 'finite-take-1' });

      const after = await stock();
      assert.equal(after[0].quantity_numerator, '59');
      const inHand = await held();
      assert.equal(inHand.length, 1);
      assert.equal(inHand[0].physical_position, 'hands');
      assert.ok(inHand[0].holder_character_id, 'held by the player character');
      assert.deepEqual(seen.ordinaryModes, ['resolve_presence']);
      assert.deepEqual(seen.plannerSteps, [1, 2]);

      // A different quantity is a different request identity: a second, distinct take works.
      seen.nextQuantity = 3;
      await runtime.submitTurn(partyId, { raw_text: TAKE_THREE, request_id: 'finite-take-2' });
      assert.equal((await stock())[0].quantity_numerator, '56');
      assert.equal((await held()).length, 2);

      reloaded = await createPresenceProductionRoot({ ...env, llmSettings });
      const screen = await reloaded.runtime.getPartyScreen(partyId);
      assert.ok(screen.screen.main_prose.trim().length > 0);
      assert.equal((await stock())[0].quantity_numerator, '56');
      assert.equal((await held()).length, 2);
      assert.deepEqual(await rows(env.partyPool, madeSnapshot.sql, [partyId]), madeSnapshot.made);
    } finally {
      if (seen.stubError) console.error('SCRIPTED MODEL ERROR', seen.stubError);
      if (reloaded) await reloaded.runtime.close();
      await runtime.close();
    }
  });
