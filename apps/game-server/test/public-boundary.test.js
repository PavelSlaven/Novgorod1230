import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicPayload, findUnsafePlayerText } from
  '../src/public-boundary.js';
import { phase3CommittedNpcUtterances } from
  '../src/runtime/lower-dvina-trace-npc-utterances.js';
import { errorEnvelope, successEnvelope } from '../src/http/contracts.js';
import { validatePortraitSpecRequest } from '../src/portrait-lab/request.js';
import { normalizeLlmSettingsCandidate } from
  '../src/runtime/llm-settings.js';
import { createApiClient } from '../../game-web/src/api/client.js';
import { renderAppState } from '../../game-web/src/app/router.js';
import { text, visibleText } from
  '../src/runtime/lower-dvina-trace-player-safe-json.js';
import { projectVisibleContext } from
  '../src/runtime/lower-dvina-trace-player-safe-visible-context.js';
import { projectRoutes } from
  '../src/runtime/lower-dvina-trace-player-safe-world.js';
import { projectKnownContext, projectKnowledge } from
  '../src/runtime/lower-dvina-trace-player-safe-world.js';
import { projectInteractions } from
  '../src/runtime/lower-dvina-trace-player-safe-entities.js';

test('public prose detector catches service markers without scanning structure', () => {
  for (const value of [
    'npc:local_fisher_17', 'npc_local_fisher_17', 'TURN_STEP_PLAN_INVALID',
    'SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP', 'MODEL_RESPONSE_INVALID',
    'typed_gap', 'INFERENCE: берёза сбрасывает листья',
    'sha256:0123456789abcdef0123456789abcdef', 'pf_rural_yard',
    'cg4v3__gn_nov_g1_xp017_yp026',
    'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area',
    'baseline:g4_node_ab12', 'baseline:g5_node_ab12', 'game_policy',
    'runtime_text', 'status: available', 'visible_status=ready', 'status: unknown'
  ]) {
    assert.ok(findUnsafePlayerText(value), value);
  }

  const payload = {
    entity_ref: { entity_kind: 'npc', entity_id: 'npc_local_fisher_17' },
    error: { code: 'TURN_STEP_PLAN_INVALID' },
    prose: 'Ветер шевелит траву у воды.'
  };
  assert.equal(assertPublicPayload(payload), payload);
});

test('generated prose and labels reject ordinal service placeholders without matching ordinary counts', () => {
  for (const prose of ['Вы идёте через Проход 2.', 'Впереди Выход 12.', 'Рядом человек (2).',
    'Вы выбираете «проход 2».', 'Вы идёте через выход 3.']) {
    assert.equal(findUnsafePlayerText(prose, { generatedProse: true })?.category, 'ordinal_placeholder');
    assert.throws(() => assertPublicPayload({ main_prose: prose }), { code: 'PUBLIC_PAYLOAD_SERVICE_TEXT' });
  }
  assert.equal(findUnsafePlayerText('к руслу (3)', { label: true })?.category, 'ordinal_placeholder');
  for (const prose of ['Вы идёте через проход к реке.', 'За проход 2 человека успели выйти.',
    'У выхода стоят 2 человека.', 'На стене 12 зарубок.']) {
    assert.equal(findUnsafePlayerText(prose, { generatedProse: true }), null, prose);
  }
  // Raw input belongs to its own owner, never the publication scan.
  const payload = { action_input: 'Выход 2.', entity_ref: { entity_id: 'npc_internal_1' } };
  assert.equal(assertPublicPayload(payload), payload);
});

test('published visible fields reject service text and ordinal placeholder labels', () => {
  for (const payload of [
    { prose: 'У берега npc:local_fisher_17 чинит сеть.' },
    { prose: 'SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP' },
    { conversation: { semantic_exchange: {
      npc_utterance: 'INFERENCE: служебный черновик'
    } } },
    { panels: { route: { data: { movement: {
      options: [{ label: 'Проход 2' }]
    } } } } },
    { panels: { people: { data: { visible_npcs: [
      { display_label: 'человек (1)' }
    ] } } } }
  ]) {
    assert.throws(() => assertPublicPayload(payload), {
      code: 'PUBLIC_PAYLOAD_SERVICE_TEXT'
    });
  }
});

test('people and map display fields use the shared publication guard', () => {
  for (const field of ['appearance', 'activity', 'role', 'status', 'state',
    'mood', 'approximate_area', 'approximate_direction', 'certainty',
    'current_task', 'role_label', 'placeholder', 'observed_conditions',
    'place_label', 'date', 'formula', 'die', 'place', 'calendar', 'health',
    'energy', 'satiety']) {
    assert.throws(() => assertPublicPayload({ panels: {
      people: { data: { visible_npcs: [{ [field]: 'INFERENCE: npc_test' }] } },
      map: { data: { [field]: 'INFERENCE: npc_test' } }
    } }), { code: 'PUBLIC_PAYLOAD_SERVICE_TEXT' }, field);
  }
  assert.doesNotThrow(() => assertPublicPayload({ panels: {
    people: { data: { visible_npcs: [{ appearance: 'Усталое лицо.' }] } },
    map: { data: { approximate_direction: 'К северу от реки.' } }
  } }));
});

test('success envelope applies the same visible-content guard', () => {
  assert.throws(() => successEnvelope({ prose: 'INFERENCE: факт.' }), {
    code: 'PUBLIC_PAYLOAD_SERVICE_TEXT'
  });
  assert.equal(successEnvelope({ prose: 'Ветер шумит в камышах.' }).ok, true);
  const leaf = phase3CommittedNpcUtterances({
    statements: [{ statement_id: 'statement-2',
      speaker_ref: { entity_kind: 'npc', entity_id: 'npc-2' },
      utterance_text: 'Я видел лодку.' }],
    audiences: [{ statement_ref: { entity_kind: 'conversation_statement',
      entity_id: 'statement-2' }, received_messages: [{
      listener_ref: { entity_kind: 'player_character', entity_id: 'player-1' },
      comprehension: 'full', utterance_text: 'Я видел лодку.'
    }] }]
  })[0];
  const published = successEnvelope({ exact_npc_utterances: [leaf] });
  assert.deepEqual(Object.keys(published.data.exact_npc_utterances[0]).sort(),
    ['speaker_ref', 'utterance_text']);
  assert.throws(() => successEnvelope({ exact_npc_utterances: [{ ...leaf,
    utterance_text: 'INFERENCE: служебная метка', provenance: {
      ...leaf.provenance, receipt_utterance_text: 'INFERENCE: служебная метка'
    } }] }), {
    code: 'PUBLIC_PAYLOAD_SERVICE_TEXT'
  });
});

test('exact NPC speech leaf requires statement receipt provenance', () => {
  const semantic = {
    statements: [{ statement_id: 'statement-1',
      speaker_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
      utterance_text: 'The passage is available.' }],
    audiences: [{ statement_ref: { entity_kind: 'conversation_statement',
      entity_id: 'statement-1' }, received_messages: [{
      listener_ref: { entity_kind: 'player_character', entity_id: 'player-1' },
      comprehension: 'full', utterance_text: 'The passage is available.'
    }] }]
  };
  const [leaf] = phase3CommittedNpcUtterances(semantic);
  assert.equal(leaf.utterance_text, 'The passage is available.');
  const payload = { exact_npc_utterances: [leaf] };
  assert.equal(assertPublicPayload(payload), payload);
  assert.throws(() => assertPublicPayload({ exact_npc_utterances: [{
    ...leaf, provenance: { ...leaf.provenance,
      precommit_service_marker_check: 'unknown' }
  }] }), { code: 'PUBLIC_PAYLOAD_EXACT_SPEECH_INVALID' });
  assert.throws(() => assertPublicPayload({ utterance_text: 'npc_internal_1' }), {
    code: 'PUBLIC_PAYLOAD_SERVICE_TEXT'
  });
});

test('error envelope hides internal 4xx codes and preserves UI validation codes', () => {
  const internal = errorEnvelope(Object.assign(new Error(
    'The committed record is unavailable.'), {
    code: 'TRACE_PHASE_4_CONTRACT_GAP', status: 409
  }));
  assert.equal(internal.status, 409);
  assert.deepEqual(internal.body.error, {
    code: 'TEMPORARY_ACTION_UNAVAILABLE',
    message: 'Действие временно недоступно. Попробуйте ещё раз.'
  });
  assert.doesNotMatch(JSON.stringify(internal), /TRACE_PHASE_4_CONTRACT_GAP/u);

  for (const code of ['REQUEST_BODY_INVALID', 'TURN_INPUT_REQUIRED',
    'PORTRAIT_REQUEST_FIELD_UNKNOWN', 'LLM_SETTINGS_FIELD_UNKNOWN',
    'LIVE_WORLD_TOPOLOGY_COMMITTED_MOVEMENT_DENIED']) {
    const response = errorEnvelope(Object.assign(new Error('Bad input.'), {
      code, status: 400
    }));
    assert.equal(response.body.error.code, code);
  }
});

test('player-safe projection checks prose only when caller marks it visible', () => {
  assert.equal(text('npc_local_fisher_17'), 'npc_local_fisher_17');
  assert.throws(() => visibleText('npc_local_fisher_17', { path: 'visible' }), {
    code: 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID'
  });
  assert.equal(visibleText('У берега шумят волны.', { path: 'visible' }),
    'У берега шумят волны.');
  const projected = projectVisibleContext({ schema: 'visible_context_package',
    visible_scene: 'INFERENCE: private draft', visible_changes: [],
    sensory_details: [], visible_npc: [], visible_objects: [],
    known_context: [], uncertainties: [] });
  assert.equal(Object.hasOwn(projected, 'visible_scene'), false);
});

test('ordinary Russian prose does not trigger the service detector', () => {
  for (const value of [
    'Вы прошли узкий проход и вышли к берегу.',
    'Первый рыбак поправил одежду, второй смотрел на воду.',
    'В 1230 году на дворе было прохладно.',
    'Человек у костра молча чинил сеть.'
  ]) assert.equal(findUnsafePlayerText(value), null, value);
  for (const value of ['available', 'ready', 'unknown',
    'The passage is available and the result is unknown.']) {
    assert.equal(findUnsafePlayerText(value), null, value);
  }
  assert.equal(findUnsafePlayerText('A quiet river_side path.'), null);
  assert.ok(findUnsafePlayerText('npc_plan_invalid'));
  assert.equal(findUnsafePlayerText('ready', { statusField: true })?.category,
    'data_status');
});

test('uppercase abbreviations, identifier boundaries, and ordinary numbers are explicit', () => {
  for (const prose of ['NASA исследует небо.', 'НАТО обсуждает рубежи.',
    'BBC сообщает о реке.', 'U.S.A. далеко за морем.',
    'R&D заняты новым делом.', 'В 1230 году было прохладно.',
    'За 2 дня рыбак починил 3 сети.']) {
    assert.equal(findUnsafePlayerText(prose), null, prose);
  }
  for (const marker of ['A_B', 'API_KEY']) {
    assert.ok(findUnsafePlayerText(`служебная метка ${marker}`), marker);
  }
});

test('unknown-field messages keep allowlisted 400 codes but are sanitized end to end', async () => {
  const cases = [
    { validate: () => normalizeLlmSettingsCandidate({ UNKNOWN_FIELD: 'synthetic' }),
      code: 'LLM_SETTINGS_FIELD_UNKNOWN', marker: 'UNKNOWN_FIELD',
      clientMethod: 'applyLlmSettings', endpoint: '/api/v1/llm-settings' },
    { validate: () => validatePortraitSpecRequest({ npc_internal_1: 'synthetic' }),
      code: 'PORTRAIT_REQUEST_FIELD_UNKNOWN', marker: 'npc_internal_1',
      clientMethod: 'normalizePortraitSpec', endpoint: '/api/v1/portrait-spec' }
  ];
  for (const { validate, code, marker, clientMethod, endpoint } of cases) {
    let failure;
    assert.throws(validate, (error) => { failure = error; return true; });
    for (const developerMode of [false, true]) {
      const response = errorEnvelope(failure, { developerMode });
      assert.equal(response.status, 400);
      assert.deepEqual(response.body.error, {
        code, message: 'Некорректный запрос.'
      });
      assert.doesNotMatch(JSON.stringify(response), new RegExp(marker, 'u'));

      let requestedUrl;
      const api = createApiClient({ fetchImpl: async (url) => {
        requestedUrl = url;
        return new Response(
        JSON.stringify(response.body), { status: response.status,
          headers: { 'content-type': 'application/json' } });
      } });
      await assert.rejects(api[clientMethod]({}), (error) => {
        assert.equal(requestedUrl, endpoint);
        assert.equal(error.httpStatus, 400);
        assert.equal(error.code, code);
        assert.equal(error.message, 'Некорректный запрос.');
        const html = renderAppState({ view: 'landing', status: 'error',
          error, developerMode });
        assert.doesNotMatch(html, new RegExp(`${marker}|${code}`, 'u'));
        assert.match(html, /Некорректный запрос\./u);
        return true;
      });
    }
  }
});

test('safe allowlisted validation text and its 400 status survive in both modes', () => {
  let failure;
  assert.throws(() => validatePortraitSpecRequest({ text: 42 }), (error) => {
    failure = error;
    return true;
  });
  for (const developerMode of [false, true]) {
    const response = errorEnvelope(failure, { developerMode });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body.error, {
      code: 'PORTRAIT_TEXT_TYPE_INVALID', message: 'text must be a string.'
    });
  }
});

test('player-safe movement labels drop ordinals and retain structural refs', () => {
  const projected = projectVisibleContext({ version: 1,
    schema: 'visible_context_package', visible_objects: [{
      entity_ref: { entity_kind: 'scene_movement_edge', entity_id: 'edge-1' },
      display_label: 'Проход 2'
    }], visible_npc: [{
      entity_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
      display_label: 'человек (1)', recognition: 'unrecognized'
    }] });
  assert.equal(projected.visible_objects[0].display_label, 'проход');
  assert.equal(projected.visible_objects[0].entity_ref.entity_id, 'edge-1');
  assert.equal(projected.visible_npc[0].display_label, 'человек');
  assert.equal(projectRoutes([{ route_id: 'route-1', label: 'Вдоль берега — выход 2' }])[0].label,
    'Вдоль берега');
});

test('optional contaminated text is suppressed while structured refs survive', () => {
  const projected = projectVisibleContext({ version: 1,
    schema: 'visible_context_package', visible_scene: 'У берега тихо.',
    visible_changes: ['npc_internal_1 ушёл'], sensory_details: [],
    visible_objects: [{
      entity_ref: { entity_kind: 'scene_movement_edge', entity_id: 'edge-1' },
      display_label: 'npc_internal_1',
      observable_cues: { ordinary_remainder: {
        ordinary_descriptor: 'INFERENCE: скрытый текст'
      } }
    }], visible_npc: [], known_context: [], uncertainties: [] });
  assert.equal(projected.visible_changes.length, 0);
  assert.equal(projected.visible_objects[0].entity_ref.entity_id, 'edge-1');
  assert.equal(projected.visible_objects[0].display_label, 'переход');
  assert.equal(projected.visible_objects[0].observable_cues.ordinary_remainder,
    undefined);

  const knowledge = projectKnowledge([{ fact_id: 'fact-1',
    text: 'claim:private_ref не показывать' }]);
  assert.equal(knowledge[0].fact_id, 'fact-1');
  assert.equal(knowledge[0].text, undefined);
  const interactions = projectInteractions([{ interaction_id: 'exchange-1',
    content: 'TURN_INTERNAL_ERROR' }]);
  assert.equal(interactions[0].interaction_id, 'exchange-1');
  assert.equal(interactions[0].content, undefined);
  assert.deepEqual(projectKnownContext({ biography: 'pending' }), ['pending']);
  assert.throws(() => assertPublicPayload({ visible_status: 'ready' }), {
    code: 'PUBLIC_PAYLOAD_SERVICE_TEXT'
  });
});
