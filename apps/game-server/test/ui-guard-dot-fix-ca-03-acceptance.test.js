import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { readFile, readdir } from 'node:fs/promises';
import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { buildProviderRequestPayload } from '../../../packages/llm-runtime/src/provider-request.js';
import { createHttpHandler } from '../src/http/handler.js';
import { projectVisibleContext, projectVisibleContextForPlayerPackage } from
  '../src/runtime/lower-dvina-trace-player-safe-visible-context.js';
import { phase2VisibleContextFromPayload } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { createLowerDvinaTraceNarrationService, narrationWire } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { reviewedNarration } from './narration-audit-fixture.js';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';

// D102: downstream player-safe projection, not the canonical authoring package.
// Omission must never turn into a synthetic factual scene or a raw spread leak.
const validScene = 'Площадка у мельницы.';
const markedScenes = ['INFERENCE: private draft', 'FACT: Берег.', 'Виден «npc:123».'];
const scene = (visible_scene = validScene, extra = {}) => ({
  version: 1, schema: 'visible_context_package', visible_scene,
  visible_changes: ['Вы поправили пояс.'], sensory_details: ['На земле лежит солома.'],
  visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'npc-1' }, display_label: 'Еремей' }],
  visible_objects: [], known_context: [], uncertainties: [], ...extra
});
const narratorRequest = (visible_context) => ({
  version: 1, schema: 'narration_request', request_id: 'ca03-acceptance',
  surface: 'turn', visible_context, context: {}
});
function assertSceneOmitted(context) {
  assert.equal(Object.hasOwn(context, 'visible_scene'), false, 'rejected scene must be absent');
  assert.doesNotMatch(JSON.stringify(context), /Обстановка не описана\.|INFERENCE:|FACT:|npc:123/u);
}
function phase2Payload(visible_scene) {
  return { perceived_scene: visible_scene, perceived_changes: ['Вы поправили пояс.'],
    sensory_details: ['На земле лежит солома.'], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: [] };
}
function providerPayload(call) {
  // Explicit offline transport fixture; no production secrets/settings/network.
  return buildProviderRequestPayload({ model: 'acceptance-fixture', maxTokens: 20_000,
    responseFormat: { type: 'json_object' }, compatibility: 'openai_compatible',
    thinking: { type: 'disabled' }, temperature: 0, topP: 1, ...call.overrides
  }, call.messages);
}
async function send(handler, method, url, body) {
  const req = Readable.from(body == null ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'localhost', 'x-request-id': 'ca03-http' } });
  const response = { writeHead(status) { this.status = status; },
    end(value) { this.body = JSON.parse(value); } };
  await handler(req, response);
  return response;
}

test('CA-03: normal and strict player-safe projections omit rejected scenes without replacing other facts', async (t) => {
  for (const marked of markedScenes) for (const strict of [false, true]) {
    await t.test(`${strict ? 'strict' : 'normal'}: ${marked}`, () => {
      const raw = scene(marked), before = structuredClone(raw);
      const projected = projectVisibleContext(raw, { strict });
      assertSceneOmitted(projected);
      const { visible_scene: _rejected, ...otherFacts } = before;
      assert.deepEqual(projected, otherFacts, 'unrelated facts must survive unchanged');
      assert.deepEqual(raw, before, 'projection must not rewrite its source');
    });
  }
});

test('CA-03: player-package assembly cannot restore a rejected scene via the original object spread', async (t) => {
  for (const marked of markedScenes) await t.test(marked, () => {
    const raw = scene(marked), before = structuredClone(raw), counts = [];
    const projected = projectVisibleContextForPlayerPackage(raw, {
      onLabelGapsOmitted: (count) => counts.push(count)
    });
    assertSceneOmitted(projected.visible_context);
    assert.deepEqual(projected.visible_context.visible_changes, raw.visible_changes);
    assert.deepEqual(projected.visible_context.visible_npc, raw.visible_npc);
    assert.equal(projected.omitted_label_gap_count, 0, 'scene omission is not an item-label gap');
    assert.deepEqual(counts, []);
    assert.deepEqual(raw, before);
  });
});

test('CA-03: valid scene and unrelated facts retain their exact values in every projection', () => {
  const raw = scene(), before = structuredClone(raw);
  assert.deepEqual(projectVisibleContext(raw), before);
  assert.deepEqual(projectVisibleContext(raw, { strict: true }), before);
  assert.deepEqual(projectVisibleContextForPlayerPackage(raw).visible_context, before);
  assert.equal(phase2VisibleContextFromPayload(phase2Payload(validScene)).visible_scene, validScene);
  assert.deepEqual(raw, before);
});

test('CA-03: absent and blank scenes remain absent without any fabricated text', async (t) => {
  for (const visible_scene of [undefined, '', '   ']) await t.test(String(visible_scene), () => {
    const raw = scene();
    if (visible_scene === undefined) delete raw.visible_scene;
    else raw.visible_scene = visible_scene;
    assertSceneOmitted(projectVisibleContext(raw));
    assertSceneOmitted(projectVisibleContextForPlayerPackage(raw).visible_context);
  });
});

test('CA-03: GET screen and POST turn HTTP responses omit rejected scenes and preserve valid ones', async (t) => {
  for (const perceived_scene of [...markedScenes, validScene]) await t.test(perceived_scene, async () => {
    // Real visible-payload projection and HTTP handler; only the root is an offline port fixture.
    const screen = { visible_context: phase2VisibleContextFromPayload(phase2Payload(perceived_scene)),
      main_prose: 'Вы поправили пояс.' };
    const handler = createHttpHandler({ root: {
      async getPartyScreen() { return { party_id: 'party-1', screen }; },
      async submitTurn() { return { party_id: 'party-1', screen }; }
    } });
    for (const [method, url, body] of [
      ['GET', '/api/v1/parties/party-1/screen'],
      ['POST', '/api/v1/parties/party-1/turns', {
        raw_text: 'Поправить пояс.', request_id: 'turn-1', idempotency_key: 'turn-1'
      }]
    ]) {
      const response = await send(handler, method, url, body);
      assert.equal(response.status, 200);
      assert.equal(response.body.ok, true);
      const context = response.body.data.screen.visible_context;
      if (perceived_scene === validScene) assert.equal(context.visible_scene, validScene);
      else assertSceneOmitted(context);
      assert.deepEqual(context.visible_changes, ['Вы поправили пояс.']);
      assert.equal(response.body.data.screen.main_prose, 'Вы поправили пояс.');
    }
  });
});

test('CA-03: narrationWire omits the rejected projected scene both with and without a current beat', async (t) => {
  for (const visible_changes of [[], ['Вы поправили пояс.']]) {
    await t.test(visible_changes.length ? 'current beat' : 'support only', () => {
      const projected = projectVisibleContext(scene(markedScenes[0], { visible_changes }));
      const wire = narrationWire(narratorRequest(projected));
      assertSceneOmitted(wire.optional_support);
      assert.deepEqual(wire.required_current_beat.changes.map(({ text }) => text), visible_changes);
      const safeWire = narrationWire(narratorRequest(projectVisibleContext(scene(validScene, { visible_changes }))));
      assert.equal(safeWire.optional_support.visible_scene, validScene);
    });
  }
});

// This storage fixture represents an already committed, valid Phase 2 head.
// Its rows are read by the production repository and cross-table validators.
// Unknown SQL is an error: the fixture cannot silently admit another write path.
function committedReadPool(snapshot, screen) {
  const visible_payload = phase2Payload(validScene);
  const last = snapshot.last_turn;
  const emptyTables = ['party_temporal_events', 'party_npc_spatial_schedules',
    'party_local_world_processes', 'party_world_route_endpoint_position_bindings',
    'party_npc_runtime_transitions', 'party_journey_locations', 'party_npcs',
    'scene_position_nodes', 'party_containers', 'party_spatial_semantic_envelopes',
    'party_spatial_semantic_resolutions', 'party_npc_knowledge'];
  return { async connect() { throw new Error('unexpected storage connection'); },
    async query(input) {
      const sql = typeof input === 'string' ? input : input.text;
      assert.match(sql.trim(), /^SELECT\b/u, 'read fixture must never accept a mutation');
      let rows;
      if (sql.includes('AS party_state_version')) rows = [{
        party_state_version: snapshot.party_state.state_version,
        session_state_version: snapshot.party_state.session_state_version,
        body_state_version: snapshot.party_state.body_state_version,
        clock_state_version: snapshot.party_state.clock_state_version,
        turn_number: snapshot.party_state.turn_number,
        world_revision_id: 'ca03-world', world_catalog_digest: 'ca03-catalog',
        delivery_ack_result: { pass: true }, screen,
        state_payload: snapshot, state_digest: canonicalDigest(snapshot)
      }];
      else if (sql.includes('FROM party_runtime.party_actor_body_states')) rows = [{
        ...snapshot.body_state, state_version: snapshot.party_state.body_state_version
      }];
      else if (sql.includes('FROM party_runtime.party_actor_active_conditions')) {
        rows = snapshot.body_state.active_conditions.map((condition) => ({
          condition_id: condition.storage_condition_id,
          condition_profile_ref: condition.condition_profile_ref,
          status: condition.status, state_version: condition.state_version
        }));
      } else if (sql.includes('FROM party_runtime.party_clocks')) rows = [{
        ...snapshot.clock, state_version: snapshot.party_state.clock_state_version
      }];
      else if (sql.includes('FROM party_runtime.party_items')) rows = snapshot.items;
      else if (sql.includes('FROM party_runtime.party_character_knowledge')) rows = snapshot.knowledge
        .map(({ fact_id, knowledge_state, evidence_refs }) => ({ fact_id, knowledge_state, evidence: evidence_refs }));
      else if (sql.includes('FROM party_runtime.party_visible_packages')) rows = [{
        visible_payload, package_digest: last.visible_package.package_digest,
        committed_state_version: String(snapshot.party_state.state_version)
      }];
      else if (sql.includes('FROM party_runtime.party_command_idempotency')) rows = [{
        request_id: last.request_id, semantic_command_snapshot: {
          input_digest: last.input_digest, selected_option_id: last.option_id,
          action_set_digest: last.action_set_digest, semantic_trace: last.semantic_trace
        }
      }];
      else if (sql.includes('FROM party_runtime.party_body_temporal_history')
        || sql.includes('FROM party_runtime.party_check_resolutions')
        || emptyTables.some((table) => new RegExp(`FROM party_runtime[.]${table}\\b`, 'u').test(sql))) rows = [];
      else throw new Error(`unmapped read fixture SQL: ${sql}`);
      return { rowCount: rows.length, rows: structuredClone(rows) };
    }
  };
}

async function assertRejectedSceneTurnDelivery(t, rejectedScene) {
  // Real turn workflow -> production repository -> Phase 2 visible-envelope
  // builder -> public HTTP boundary. Only committed read rows/P16/session ports
  // are fixtures. Corruption is injected into the candidate BEFORE persistence.
  const f = fixture();
  const snapshot = { ...structuredClone(f.state),
    schema: 'rus.lower_dvina_trace_phase_2_snapshot.v1', last_turn: {
      request_id: 'ca03-prior', idempotency_key: 'ca03-prior', input_digest: 'prior-input',
      option_id: 'prior-option', action_set_digest: 'prior-actions', semantic_trace: {},
      check_result: null, visible_package: { package_id: 'ca03-prior-visible',
        package_digest: computeSpatialV3CanonicalDigest(phase2Payload(validScene)) }
    }
  };
  const prior = { party_id: f.partyId, state_version: f.state.party_state.state_version,
    turn_number: f.state.party_state.turn_number, screen: {
      version: 1, schema: 'lower_dvina_trace_turn_screen', screen_status: 'ready',
      party_id: f.partyId, turn_number: f.state.party_state.turn_number,
      main_prose: 'Вы стоите у мельницы.', visible_context: scene()
    }
  };
  const baseline = structuredClone(f.state);
  const errors = [];
  let p16Calls = 0, candidateSeen = false;
  const repository = createLowerDvinaTracePhase2PostgresRepository({
    partyPool: committedReadPool(snapshot, prior.screen),
    committer: { async commit() {
      p16Calls += 1;
      throw new Error('unsafe visible scene reached P16');
    } }
  });
  // Validate the baseline rows before the regression; fixture errors are not RED.
  const loaded = await repository.loadPhase2State(f.partyId);
  assert.equal(loaded.party_state.turn_number, baseline.party_state.turn_number);
  assert.equal(loaded.current_visible_context.visible_scene, validScene);
  f.repository.commitPhase2Turn = (input) => {
    const writePlan = structuredClone(input.writePlan);
    const candidate = writePlan.write_targets.find(({ target }) => target === 'party_visible_context_package');
    assert.ok(candidate, 'production turn must supply a visible-context candidate');
    candidateSeen = true;
    candidate.value.visible_scene = rejectedScene;
    return repository.commitPhase2Turn({ ...input, writePlan });
  };
  const handler = createHttpHandler({ root: {
    async submitTurn(partyId, input) {
      try { return await f.runtime.submitTurn({ partyId, input }); }
      catch (error) {
        errors.push({ code: error.code, status: error.status, details: error.details,
          turn_commit_status: error.turn_commit_status, stack: error.stack });
        throw error;
      }
    },
    async getPartyScreen(partyId) {
      await f.runtime.validateSessionRead({ partyId });
      return structuredClone(prior);
    }
  } });
  const path = `/api/v1/parties/${encodeURIComponent(f.partyId)}`;
  const submitted = await send(handler, 'POST', `${path}/turns`, {
    raw_text: 'Осмотреть лодку, верёвку и следы.',
    request_id: 'ca03-unsafe-turn', idempotency_key: 'ca03-unsafe-turn'
  });
  const fetched = await send(handler, 'GET', `${path}/screen`);
  t.diagnostic(JSON.stringify({ candidate_seen: candidateSeen, p16_calls: p16Calls,
    committed: f.commitCount(), turn_number: f.state.party_state.turn_number,
    narrator_called: f.narratorInput() != null, post_status: submitted.status,
    post_error: submitted.body.error, get_status: fetched.status,
    get_screen_status: fetched.body.data?.screen?.screen_status, errors }));
  assert.equal(candidateSeen, true, 'regression must reach the production candidate builder');
  await t.test('typed internal gap from candidate projection', () => {
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP');
    assert.equal(errors[0].status, 409);
    assert.equal(errors[0].details?.reason, 'player_safe_visible_scene_required');
    assert.equal(errors[0].turn_commit_status, 'not_started');
  });
  await t.test('safe public refusal confirms the turn was not saved', () => {
    assert.equal(submitted.status, 409);
    assert.equal(submitted.body.ok, false);
    assert.deepEqual(submitted.body.error, {
      code: 'WORLD_ACTION_UNAVAILABLE',
      message: 'Ход не сохранён. Для этого действия не хватает данных мира.',
      turn_commit_status: 'not_started'
    });
    assert.doesNotMatch(JSON.stringify(submitted.body),
      /SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP|INFERENCE:|FACT:|npc:123|Обстановка не описана\.|\bstack\b/u);
  });
  await t.test('no commit, no state mutation and no narrator call', () => {
    assert.equal(p16Calls, 0, 'candidate must fail before P16 is entered');
    assert.equal(f.commitCount(), 0);
    assert.deepEqual(f.state, baseline, 'clock, turn number and every other state value must remain unchanged');
    assert.equal(f.narratorInput(), null);
  });
  await t.test('GET retains the previous committed screen without pending', () => {
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.ok, true);
    assert.deepEqual(fetched.body.data, prior);
    assert.equal(fetched.body.data.screen.screen_status, 'ready');
    assert.doesNotMatch(JSON.stringify(fetched.body), /pending|INFERENCE:|Обстановка не описана\./u);
  });
}

test('CA-03: rejected scene fails before commit with a safe public gap; valid scene reaches actual provider payloads', async (t) => {
  for (const visible_scene of [markedScenes[0], validScene]) await t.test(visible_scene, async (caseTest) => {
    if (visible_scene === markedScenes[0]) {
      await assertRejectedSceneTurnDelivery(caseTest, visible_scene);
      return;
    }
    const calls = [];
    const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
      const payload = providerPayload(call);
      const wire = JSON.parse(payload.messages[1].content);
      calls.push({ role: call.role_id, payload, wire });
      if (call.role_id === 'gameplay_narrator') return { output: { prose: 'Вы поправили пояс.' } };
      assert.equal(call.role_id, 'gameplay_narrator_auditor');
      return { output: reviewedNarration(wire.segments, { visible_change_1: ['s1'] }) };
    } } });
    const projected = projectVisibleContextForPlayerPackage(scene(visible_scene)).visible_context;
    const result = await service.run(narratorRequest(projected));
    assert.equal(result.status, 'approved');
    assert.deepEqual(calls.map(({ role }) => role), ['gameplay_narrator', 'gameplay_narrator_auditor']);
    for (const { wire, payload } of calls) {
      if (visible_scene === validScene) assert.equal(wire.optional_support.visible_scene, validScene);
      else assertSceneOmitted(wire.optional_support);
      assert.deepEqual(wire.required_current_beat.changes, [{ ref: 'visible_change_1', text: 'Вы поправили пояс.' }]);
      assert.doesNotMatch(payload.messages[1].content, /Обстановка не описана\.|INFERENCE:/u);
      assert.equal(payload.messages[0].role, 'system');
      assert.equal(typeof payload.messages[0].content, 'string');
    }
  });
});

test('CA-03: required-scene admission rejects unsafe, absent and blank scenes; valid/default modes retain behavior', async (t) => {
  for (const visible_scene of [...markedScenes, undefined, '', '   ']) {
    await t.test(`required: ${String(visible_scene)}`, () => {
      const raw = scene(visible_scene), before = structuredClone(raw), counts = [];
      if (visible_scene === undefined) delete raw.visible_scene;
      assert.throws(() => projectVisibleContextForPlayerPackage(raw, {
        requireScene: true, onLabelGapsOmitted: (count) => counts.push(count)
      }), (error) => {
        assert.equal(error.code, 'SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP');
        assert.equal(error.status, 409);
        assert.equal(error.details?.reason, 'player_safe_visible_scene_required');
        assert.doesNotMatch(JSON.stringify(error.details), /INFERENCE:|FACT:|npc:123/u);
        return true;
      });
      if (visible_scene === undefined) delete before.visible_scene;
      assert.deepEqual(raw, before);
      assert.deepEqual(counts, [], 'scene admission is not an item-label omission');
    });
  }
  const raw = scene();
  assert.deepEqual(projectVisibleContextForPlayerPackage(raw, { requireScene: true }),
    projectVisibleContextForPlayerPackage(raw), 'valid required mode must preserve the exact package');
  assertSceneOmitted(projectVisibleContextForPlayerPackage(scene(markedScenes[0])).visible_context);
});

// Small lexical scan, not a source-text substring guard: comments and literal
// bodies cannot provide a fictitious option, and named import aliases are found.
function tokens(source) {
  const result = [];
  const pattern = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|[A-Za-z_$][\w$]*|\.{3}|[^\s]/gu;
  for (const match of source.matchAll(pattern)) {
    const value = match[0];
    if (/^\s|^\/\//u.test(value) || value.startsWith('/*')) continue;
    result.push({ value, offset: match.index });
  }
  return result;
}
function argumentTokens(all, opening) {
  const args = [[]];
  let depth = 0;
  for (let i = opening + 1; i < all.length; i += 1) {
    const token = all[i], value = token.value;
    if (value === ')' && depth === 0) return args;
    if (value === ',' && depth === 0) { args.push([]); continue; }
    args.at(-1).push(token);
    if (['(', '{', '['].includes(value)) depth += 1;
    if ([')', '}', ']'].includes(value)) depth -= 1;
  }
  throw new Error('unterminated owner call');
}
function ownerCalls(source) {
  const all = tokens(source), aliases = new Set(), calls = [];
  for (let i = 0; i < all.length; i += 1) {
    if (all[i].value !== 'import' || all[i + 1]?.value !== '{') continue;
    let end = i + 2;
    while (end < all.length && all[end].value !== '}') end += 1;
    if (all[end + 1]?.value !== 'from'
      || !/lower-dvina-trace-player-safe-visible-context[.]js['"]$/u.test(all[end + 2]?.value ?? '')) continue;
    for (let j = i + 2; j < end; j += 1) {
      if (all[j].value === 'projectVisibleContextForPlayerPackage') {
        aliases.add(all[j + 1]?.value === 'as' ? all[j + 2].value : all[j].value);
      }
    }
  }
  for (let i = 0; i < all.length; i += 1) {
    if (!aliases.has(all[i].value) || all[i + 1]?.value !== '(') continue;
    const options = argumentTokens(all, i + 1)[1] ?? [];
    let depth = 0, required = false;
    for (let j = 0; j < options.length; j += 1) {
      const value = options[j].value;
      if (value === '{' || value === '[' || value === '(') depth += 1;
      if (value === '}' || value === ']' || value === ')') depth -= 1;
      // A later override or spread cannot establish the required mode.
      if (depth === 1 && value === '...') required = false;
      if (depth === 1 && /^(?:requireScene|'requireScene'|"requireScene")$/u.test(value)) {
        required = options[j + 1]?.value === ':' && options[j + 2]?.value === 'true';
      }
    }
    calls.push({ line: source.slice(0, all[i].offset).split('\n').length,
      required: options[0]?.value === '{' && required });
  }
  return calls;
}
async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) files.push(...await sourceFiles(url));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(url);
  }
  return files;
}

test('CA-03: every discovered persisted-package builder explicitly requires a safe scene', async (t) => {
  const expected = [
    'infrastructure/postgres/lower-dvina-trace-phase-2-writes.js',
    'infrastructure/postgres/lower-dvina-trace-phase-3-read-projection.js',
    'infrastructure/postgres/lower-dvina-trace-phase-4-write-projection.js',
    'infrastructure/postgres/lower-dvina-trace-phase-5-writes.js',
    'infrastructure/postgres/lower-dvina-trace-phase-6-writes.js',
    'infrastructure/postgres/lower-dvina-trace-phase-7-writes.js',
    'infrastructure/postgres/lower-dvina-trace-phase-8-writes.js',
    'infrastructure/postgres/lower-dvina-trace-phase-9-writes.js',
    'infrastructure/postgres/lower-dvina-trace-combat-writes.js',
    'infrastructure/postgres/lower-dvina-trace-turn-step-state.js',
    'runtime/spatial-v3-proposed-visible-context.js',
    'composition/production-spatial-v3.js'
  ];
  const root = new URL('../src/', import.meta.url), discovered = [];
  for (const file of await sourceFiles(root)) {
    const path = file.pathname.slice(root.pathname.length);
    for (const call of ownerCalls(await readFile(file, 'utf8'))) discovered.push({ path, ...call });
  }
  // The approved table must remain covered, but discovery has no allow-list:
  // adding another writer owner call automatically creates another assertion.
  for (const path of expected) assert.ok(discovered.some((call) => call.path === path),
    `approved persisted-package builder disappeared from coverage: ${path}`);
  assert.ok(discovered.length >= expected.length);
  for (const call of discovered) await t.test(`${call.path}:${call.line}`, () => {
    assert.equal(call.required, true, 'persisted-package projection must pass requireScene: true');
  });
});
