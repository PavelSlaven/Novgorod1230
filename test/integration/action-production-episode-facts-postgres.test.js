import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';

import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from '../spatial-v3/presence-rules-production-e2e-fixture.js';
import { createProductionLlmRoleRunner } from
  '../../apps/game-server/src/infrastructure/provider/openai-compatible.js';
import { DEFAULT_GAMEPLAY_MODEL, createLlmSettingsOwner } from
  '../../apps/game-server/src/runtime/llm-settings.js';
import { identifyLlmTestRole } from '../spatial-v3/llm-test-role.js';

const MAKE = 'Оторву полосу от подола рубахи.';
const LOOK = 'Осматриваюсь вокруг.';

function narrationRole(user) {
  if (!Array.isArray(user?.['Обязательные положения текущего эпизода'])) return null;
  if (Object.hasOwn(user, 'Отклонённая проза')) return 'gameplay_narrator_semantic_repair';
  if (Array.isArray(user['Отрывки прозы'])) return 'gameplay_narrator_auditor';
  return 'gameplay_narrator';
}

function capturedRole(call, user) {
  const proseRole = narrationRole(user);
  if (proseRole) return proseRole;
  if (call.role_id || call.roleId) return call.role_id ?? call.roleId;
  const known = identifyLlmTestRole(call);
  if (known) return known;
  if (call.messages?.[0]?.content?.includes('Audit only the supplied move_entity'))
    return 'turn_step_grounding_auditor';
  return 'unclassified';
}

function providerParameters(call) {
  return Object.fromEntries(Object.entries(call).filter(([key]) =>
    key !== 'messages' && !/^(?:api_key|authorization|base_url|endpoint|url)$/iu.test(key)));
}

function wireStrings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(wireStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(wireStrings);
  return [];
}

function sourceFactStrings(value) {
  if (Array.isArray(value)) return value.flatMap(sourceFactStrings);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    /physical_description|qualitative_facts/u.test(key) ? wireStrings(entry) : sourceFactStrings(entry));
}

function entityReferences(value) {
  if (Array.isArray(value)) return value.flatMap(entityReferences);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    if (/^(?:actor|item|entity|npc|route|scene|position|party).*_(?:id|ref)$/iu.test(key)
        && typeof entry === 'string') return [entry];
    return entityReferences(entry);
  });
}

function narrationFacts(call) {
  return (call.user['Обязательные положения текущего эпизода'] ?? [])
    .map((line) => line.replace(/^[^:]+:\s*/u, '')).filter(Boolean);
}

function privateRequiredFacts(call) {
  return (call.user['Обязательные положения текущего эпизода'] ?? [])
    .map((line) => line.replace(/^[^:]+:\s*/u, '')).filter(Boolean);
}

/** Shared setup plus the real A1 MAKE turn; capture includes its exact provider request body. */
function installMakeFetch(seen) {
  seen.narrationLog = [];
  const restoreBase = installPresenceProductionE2eFetch({ observeText: LOOK,
    narrationLog: seen.narrationLog });
  const base = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    try {
      seen.totalHttpRequests += 1;
      assert.equal(String(url), 'https://target-acceptance.invalid/chat/completions');
      const response = await scripted(url, init);
      if (seen.captureMake) {
        const call = JSON.parse(init.body);
        const user = JSON.parse(call.messages.find((message) => message.role === 'user').content);
        const body = await response.clone().json();
        const content = body?.choices?.[0]?.message?.content;
        seen.makeCalls.push({
          rawBody: init.body,
          role: capturedRole(call, user),
          providerParameters: providerParameters(call),
          system: call.messages[0].content, user,
          output: typeof content === 'string' ? JSON.parse(content) : content,
        });
      }
      return response;
    } catch (error) { seen.stubError ??= error; throw error; }
  };
  const scripted = async (url, init) => {
    const call = JSON.parse(init.body);
    const system = call.messages[0].content.replace(/^(?:Return a valid json object\.|Верните корректный объект JSON\.)\s*/u, '');
    const user = JSON.parse(call.messages.find((message) => message.role === 'user').content);
    const role = identifyLlmTestRole(call);
    const narration = narrationRole(user);
    const respond = (output) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 });
    if (seen.captureMake && narration === 'gameplay_narrator_auditor') {
      seen.makeAudits = (seen.makeAudits ?? 0) + 1;
      const segments = (user['Отрывки прозы'] ?? []).map(({ segment_id }) => segment_id);
      const required = user['Обязательные положения текущего эпизода'] ?? [];
      assert.ok(segments.length > 0, 'MAKE narration audit must include a prose segment');
      if (seen.makeAudits === 1) return respond({
        reviewed_segments: segments,
        source_reviews: required.map((line) => ({
          ref: /^(visible_change|uncertainty)_[0-9]+:/u.exec(line)?.[0].slice(0, -1),
          segment_choices: segments,
        })),
        unsupported: [{ segment_choice: segments[0], kind: 'unsupported_attempt',
          reason: 'Детерминированный capture: запросить semantic repair.' }],
        literary_failures: [], evidence: [],
      });
    }
    if (seen.captureMake && narration === 'gameplay_narrator_semantic_repair') {
      const required = user['Обязательные положения текущего эпизода'] ?? [];
      const facts = required.map((line) => line.replace(/^[^:]+:\s*/u, '')).filter(Boolean);
      assert.ok(facts.length > 0, 'semantic repair must retain required performed facts');
      return respond({ replacements: [{ prose: `Уже выполнено: ${facts.join(' ')}` }] });
    }
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
    if (role === 'turn_step_planner') {
      const request = user.request ?? user;
      if (request.root_player_action === LOOK) return base(url, init);
      const actor = request.actor.actor_id ?? request.actor.actor_ref;
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

test('D49 action production facts stay on the actual writer/auditor/repair wire and commit',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const seen = { makeSteps: [], makeCalls: [], captureMake: false, totalHttpRequests: 0 };
    const restoreFetch = installMakeFetch(seen);
    t.after(() => restoreFetch());
    const llmSettings = await qualifiedSettings();
    const { runtime } = await createPresenceProductionRoot({ ...env, llmSettings });
    let partyId = null;
    let ownerOutcome = null;
    let delivered = null;
    const persist = async () => {
      const capturePath = process.env.D49_ACTION_WIRE_CAPTURE_PATH?.trim();
      if (!capturePath) return;
      await writeFile(capturePath, JSON.stringify({
        source: { scenario: 'novgorod_vikhtuy_work_storage_v1' },
        action: MAKE, realModelCalls: 0, fakeProviderHttpRequests: seen.totalHttpRequests,
        wireCapturedDuringSubmitTurn: seen.makeCalls.map(({ rawBody, role, providerParameters,
          system, user, output }) => ({ rawBody, role,
          parsed: { providerParameters, system, user, output } })), ownerOutcome,
        delivered: delivered ? { main_prose: delivered.main_prose } : null,
      }, null, 2), { encoding: 'utf8', mode: 0o600 });
    };
    try {
      const opening = await runtime.startNewGame({
        scenario_id: 'novgorod_vikhtuy_work_storage_v1',
        request_id: 'd49-action-capture-start' });
      assert.equal(opening.screen.schema, 'first_game_screen');
      await runtime.acknowledgeOpening(opening.party_id, {
        client_ack_id: 'd49-action-capture-ack' });
      partyId = opening.party_id;
      await runtime.submitTurn(partyId, { raw_text: LOOK, request_id: 'd49-action-capture-look' });
      const itemsSql = 'SELECT item_id, state_version, state FROM party_runtime.party_items WHERE party_id=$1 ORDER BY item_id';
      const placementsSql = 'SELECT item_id, holder_character_id, physical_position, anchor_id, scene_position_id FROM party_runtime.party_item_placements WHERE party_id=$1 ORDER BY item_id';
      const beforeItems = await rows(env.partyPool, itemsSql, [partyId]);
      const beforePlacements = await rows(env.partyPool, placementsSql, [partyId]);
      ownerOutcome = { beforeItems, beforePlacements };
      await persist();
      seen.captureMake = true;
      await runtime.submitTurn(partyId, { raw_text: MAKE, request_id: 'd49-action-capture-make' });
      seen.captureMake = false;
      const afterItems = await rows(env.partyPool, itemsSql, [partyId]);
      const afterPlacements = await rows(env.partyPool, placementsSql, [partyId]);
      const visiblePackages = await rows(env.partyPool,
        'SELECT committed_state_version, visible_payload FROM party_runtime.party_visible_packages WHERE party_id=$1 ORDER BY committed_state_version::bigint DESC LIMIT 2',
        [partyId]);
      ownerOutcome = { beforeItems, afterItems, beforePlacements, afterPlacements, visiblePackages };
      delivered = (await runtime.getPartyScreen(partyId)).screen;
      await persist();
      assert.deepEqual(seen.makeSteps, [1]);
      assert.equal(afterItems.length, beforeItems.length + 1, 'one action-produced item committed');
      const priorIds = new Set(beforeItems.map(({ item_id }) => item_id));
      const added = afterItems.filter(({ item_id }) => !priorIds.has(item_id));
      assert.equal(added.length, 1);
      assert.match(added[0].item_id, /^a1-result:/u);
      assert.ok(afterItems.some(({ item_id, state_version }) =>
        beforeItems.some((row) => row.item_id === item_id && Number(state_version) > Number(row.state_version))),
        'source item updated in place');
      const roles = seen.makeCalls.map(({ role }) => role);
      for (const role of ['turn_step_planner', 'gameplay_narrator',
        'gameplay_narrator_auditor', 'gameplay_narrator_semantic_repair']) {
        assert.ok(roles.includes(role), 'captured production role ' + role);
      }
      assert.equal(seen.makeCalls.filter(({ role }) => role === 'gameplay_narrator_auditor').length,
        2, 'one fake rejection followed by passing audit');
      assert.equal(seen.makeCalls.filter(({ role }) =>
        role === 'gameplay_narrator_semantic_repair').length, 1, 'exactly one repair');
      assert.ok(roles.lastIndexOf('gameplay_narrator_auditor')
        > roles.indexOf('gameplay_narrator_semantic_repair'), 'final audit follows repair');
      assert.ok(seen.makeCalls.every(({ role }) => role !== 'unclassified'),
        'every captured provider request has a classified role');

      const writer = seen.makeCalls.find(({ role }) => role === 'gameplay_narrator');
      const audits = seen.makeCalls.filter(({ role }) => role === 'gameplay_narrator_auditor');
      const repair = seen.makeCalls.find(({ role }) => role === 'gameplay_narrator_semantic_repair');
      const writerFacts = narrationFacts(writer);
      assert.ok(writerFacts.length > 0, 'writer receives committed current-beat facts');
      assert.ok(writerFacts.some((fact) => /оторван|оторвал|отделен|отделён|отделил/iu.test(fact)),
        'writer receives the performed source-to-output relation');
      for (const fact of ['отрезанная полоса льняной ткани', 'отделена от подола',
        'рубаха с укороченным подолом', 'подол укорочен']) {
        assert.ok(writerFacts.some((line) => line.toLocaleLowerCase('ru').includes(fact)),
          `writer receives action/source fact: ${fact}`);
      }
      const auditFacts = privateRequiredFacts(audits[0]);
      const repairFacts = privateRequiredFacts(repair);
      assert.deepEqual(auditFacts, repairFacts,
        'factual audit and semantic repair receive the same ordered atomic facts');
      assert.ok(auditFacts.length >= writerFacts.length,
        'auditor and repair retain the writer facts plus private validation context');
      assert.deepEqual(auditFacts.filter((fact) => writerFacts.includes(fact)), writerFacts,
        'auditor preserves the writer facts in order');
      assert.deepEqual(repairFacts.filter((fact) => writerFacts.includes(fact)), writerFacts,
        'repair preserves the writer facts in order');
      const writerWire = JSON.stringify(writer.user);
      assert.doesNotMatch(writerWire, /Оторву полосу от подола рубахи/u,
        'raw player intent is not writer evidence');
      assert.doesNotMatch(writerWire, /removed_physical_fact_refs/u,
        'writer receives no mechanics references');
      const planner = seen.makeCalls.find(({ role }) => role === 'turn_step_planner');
      const plannerInput = planner.user.request ?? planner.user;
      const actor = plannerInput.actor.actor_id ?? plannerInput.actor.actor_ref;
      const sourceItem = plannerInput.player_safe_state.items.find(({ name, placement }) =>
        name === 'нижняя рубаха' && placement?.holder_character_id === actor);
      assert.ok(sourceItem, 'source item is player-safe visible to the planner');
      const writerStrings = wireStrings(writer.user);
      const writerEntityIds = entityReferences(plannerInput).filter((id) => writerStrings
        .some((value) => value.includes(id)));
      assert.deepEqual(writerEntityIds, [], 'writer receives no entity IDs or references');
      const visibleSupport = JSON.stringify(writer.user.optional_support
        ?? writer.user['Переданные сведения об обстановке'] ?? {});
      assert.match(visibleSupport, /нижняя рубаха/u,
        'source is recognized in the current player-safe visible context');
      const unrelatedPersistedFacts = sourceFactStrings(beforeItems
        .filter(({ item_id }) => item_id !== sourceItem.item_id).map(({ state }) => state))
        .filter((fact) => fact && !visibleSupport.includes(fact));
      for (const fact of unrelatedPersistedFacts) {
        assert.ok(!writerFacts.some((line) => line.includes(fact)),
          `writer does not receive unrelated hidden source fact: ${fact}`);
      }
      for (const call of [...audits, repair]) {
        assert.deepEqual(privateRequiredFacts(call), auditFacts,
          'all factual review requests preserve the same action facts in order');
      }
      assert.ok(delivered.main_prose.trim().length > 0);
    } finally {
      try {
        if (partyId && ownerOutcome && !Object.hasOwn(ownerOutcome, 'afterItems')) {
          ownerOutcome.afterItems = await rows(env.partyPool,
            'SELECT item_id, state_version, state FROM party_runtime.party_items WHERE party_id=$1 ORDER BY item_id',
            [partyId]);
        }
        await persist();
      } finally {
        if (seen.stubError) console.error('SCRIPTED MODEL ERROR', seen.stubError);
        await runtime.close();
      }
    }
  });
