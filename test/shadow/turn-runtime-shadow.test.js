import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createPartyTurnRuntimeState as createLegacyRuntime,
  runPartyTurnPipeline as runLegacyTurn
} from '../../legacy/src/world/turn-runtime/index.js';
import { createTurnCommandRegistry, runTurnWorkflow } from '@rus/turn';
import { compareStructuralObservations } from '@rus/shadow-run';

const NOW = '2026-07-12T10:00:00.000Z';
const RAW_TEXT = 'Я внимательно осматриваю телегу.';

function firstScreen() {
  return {
    version: 1,
    schema: 'first_game_screen',
    request_id: 'req-shadow-turn',
    party_id: 'party-shadow',
    turn_number: 0,
    position_panel: { public_position_label: 'У ворот двора' },
    time_panel: { public_time_label: 'Раннее утро', public_light_label: 'Серый рассвет', public_weather_label: 'Морозно' },
    character_panel: { public_character_label: 'Путник', body_state_summary: ['Ты озяб.'], inventory_summary: ['Дорожная сумка.'], warning_badges: ['Холод'] },
    attention_panel: {
      visible_npcs: [{ label: 'Сторож' }],
      visible_items: [{ label: 'Телега' }],
      visible_containers: [],
      visible_exits: [{ label: 'Дорога' }],
      audible_or_sensory_cues: [{ label: 'Скрип колеса' }],
      known_context_hints: []
    },
    map_panel: {
      known_current_node: { label: 'Ворота', certainty: 'known' },
      known_nearby_nodes: [{ label: 'Двор', certainty: 'known' }],
      unknown_exits: []
    }
  };
}

function legacyModeResolution() {
  return {
    version: 1,
    schema: 'turn_mode_resolution',
    turn_id: 'turn:party-shadow:1',
    selected_primary_mode: 'attention',
    secondary_modes: [],
    intent: { raw_text: RAW_TEXT, normalized_intent: 'осмотреть телегу', player_words_are_world_facts: false },
    current_state_refs: {
      party_id: 'party-shadow',
      current_position_id: 'position:party-shadow',
      visible_context_id: 'visible:1',
      character_knowledge_map_id: 'knowledge:party-shadow'
    },
    accessibility_check: { can_attempt: true, requires_check: false, requires_time: false, requires_risk_resolution: false },
    resolution_plan: {
      subsystems: ['visible_context_projection'],
      checks_to_run: [],
      state_blocks_to_load: ['party_state', 'current_position', 'clock_weather_light', 'visible_context'],
      expected_writes: ['party_state', 'party_visible_context_package', 'party_narrator_output', 'party_player_visible_message']
    },
    target: null
  };
}

function legacyExecutors() {
  return {
    intentRouter: async () => ({
      version: 1,
      schema: 'turn_intent_route',
      candidate_primary_mode: 'attention',
      candidate_secondary_modes: [],
      required_state_blocks: ['party_state', 'current_position', 'clock_weather_light', 'visible_context']
    }),
    orchestrator: async () => legacyModeResolution(),
    auditor: async () => ({ version: 1, schema: 'turn_resolution_audit', pass: true, status: 'resolved', concerns: [], return_to_stage: null })
  };
}

function visibleContext() {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'У ворот стоит телега; на оглобле видна свежая грязь.',
    visible_changes: ['Ты внимательнее осмотрел телегу.'],
    sensory_details: ['Слышен слабый скрип колеса.'],
    visible_npc: [{ label: 'Сторож' }],
    visible_objects: [{ label: 'Телега' }],
    known_context: [],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: []
  };
}

function approvedNarration(requestId) {
  return {
    version: 1,
    schema: 'narration_flow_result',
    request_id: requestId,
    surface: 'turn',
    status: 'approved',
    pass: true,
    approved_output: {
      version: 1,
      schema: 'narration_output',
      output_id: `narration:${requestId}`,
      prose: 'На оглобле телеги темнеет свежая полоса грязи.',
      action_options: [],
      used_references: [],
      self_check: { no_new_world_facts: true }
    },
    final_audit: { version: 1, schema: 'narration_audit', pass: true, concerns: [], evidence: ['Grounded in visible context.'] },
    repair_request: null,
    generation_history: [],
    audit_history: [],
    repair_history: [],
    diagnostics: {}
  };
}

function modularServices() {
  const commandRegistry = createTurnCommandRegistry([{
    command_id: 'inspect_cart',
    matches: ({ player_input: input }) => input.raw_text === RAW_TEXT,
    mode: {
      selected_primary_mode: 'attention',
      secondary_modes: [],
      resolution_plan: {
        subsystems: ['visible_context_projection'], checks_to_run: [],
        state_blocks_to_load: ['party_state', 'current_position', 'clock_weather_light', 'visible_context'],
        expected_writes: ['party_state', 'party_visible_context_package', 'party_narrator_output', 'party_player_visible_message']
      }
    },
    availability: () => ({ version: 1, schema: 'turn_availability_decision', status: 'available', can_attempt: true, reasons: [], check_requests: [] }),
    consequence: () => ({ version: 1, schema: 'turn_consequence_package', status: 'resolved', duration_minutes: 0, visible_seed: { observation: 'Свежая грязь на оглобле.' }, hidden_update: {}, state_changes: [], suggested_actions: [] }),
    writeTargets: (request) => [
      { target: 'party_state', value: { turn_number: 1 } },
      { target: 'party_visible_context_package', value: request.visibleContext },
      { target: 'party_narrator_output', value: request.narration },
      { target: 'party_player_visible_message', value: { ready: true } }
    ]
  }]);
  return {
    commandRegistry,
    stateReader: {
      async read() {
        return {
          party_state: { party_id: 'party-shadow', state_version: 0 },
          current_position: { region_id: 'region-novgorod', place_id: 'place-gate' },
          clock_weather_light: { clock: { day: 1, hour: 9, minute: 0 }, weather: {}, light: {} },
          visible_context: visibleContext(),
          character_knowledge_map: [],
          relevant_hidden_state: { hidden_sentinel: 'must_not_leak' },
          relevant_events: []
        };
      }
    },
    modeResolver: { async resolve() { return legacyModeResolution(); } },
    availabilityResolver: { async resolve() { return { version: 1, schema: 'turn_availability_decision', status: 'available', can_attempt: true, reasons: [], check_requests: [] }; } },
    consequenceResolver: {
      async resolve() {
        return {
          version: 1,
          schema: 'turn_consequence_package',
          status: 'resolved',
          duration_minutes: 0,
          visible_seed: { observation: 'Свежая грязь на оглобле.' },
          hidden_update: {},
          state_changes: [],
          suggested_actions: []
        };
      }
    },
    visibleProjector: { async project() { return visibleContext(); } },
    persistedVisibleReader: { async read() { return visibleContext(); } },
    semanticResolver: async () => ({ status: 'unknown' }),
    decisionSecret: 'shadow-turn-secret',
    decisionExpiresAt: '2030-01-01T00:05:00.000Z',
    narrator: { async run(request) { return approvedNarration(request.request_id); } },
    writePlanner: {
      async plan(request) {
        return {
          version: 1,
          schema: 'party_turn_write_plan',
          party_id: request.party_id,
          turn_id: request.turn_id,
          write_targets: [
            { target: 'party_state', value: { turn_number: 1 } },
            { target: 'party_visible_context_package', value: request.visible_context },
            { target: 'party_narrator_output', value: request.narration },
            { target: 'party_player_visible_message', value: { ready: true } }
          ]
        };
      }
    },
    partyStore: { async commit(plan, meta) { return { committed: true, write_count: plan.write_targets.length, idempotency_key_seen: meta.idempotencyKey }; } }
  };
}

function hiddenLeak(value) {
  if (Array.isArray(value)) return value.some(hiddenLeak);
  if (!value || typeof value !== 'object') return String(value ?? '').includes('hidden_sentinel');
  for (const [key, nested] of Object.entries(value)) {
    if (['hidden_state', 'relevant_hidden_state', 'hidden_sentinel'].includes(key)) return true;
    if (hiddenLeak(nested)) return true;
  }
  return false;
}

function normalizeLegacy(result) {
  return {
    player_intent_contract: result.playerTurnInput.contract,
    party_id: result.playerTurnInput.party_id,
    turn_number: result.playerTurnInput.turn_number,
    turn_id: result.turnModeResolution.turn_id,
    mode: result.turnModeResolution.selected_primary_mode,
    audit: { pass: result.resolutionAudit.pass, status: result.resolutionAudit.status },
    write_targets: result.writePlan.write_targets.map((item) => item.target).sort(),
    committed: result.commitGate.pass,
    screen: {
      schema_family: result.partyScreenPayload.party_turn_screen.schema === 'party_turn_screen' ? 'turn_screen' : result.partyScreenPayload.party_turn_screen.schema,
      party_id: result.partyScreenPayload.party_turn_screen.party_id,
      turn_number: result.partyScreenPayload.party_turn_screen.turn_number,
      hidden_leak: hiddenLeak(result.partyScreenPayload.party_turn_screen)
    },
    no_new_world_facts: result.playerTurnInput.contract === 'intent_not_fact'
  };
}

function normalizeModular(result) {
  return {
    player_intent_contract: result.checkpoint.stages.normalize_intent.contract,
    party_id: result.party_id,
    turn_number: result.turn_number,
    turn_id: result.turn_id,
    mode: result.mode,
    audit: { pass: true, status: result.status },
    write_targets: result.checkpoint.stages.persistence_plan.write_targets.map((item) => item.target).sort(),
    committed: result.commit.committed === true,
    screen: {
      schema_family: result.screen.schema,
      party_id: result.screen.party_id,
      turn_number: result.screen.turn_number,
      hidden_leak: hiddenLeak(result.screen)
    },
    no_new_world_facts: result.checkpoint.stages.normalize_intent.contract === 'intent_not_fact'
  };
}

test('legacy and modular turn routes preserve approved structural properties on one input', async () => {
  const runtime = createLegacyRuntime({ partyScreenPayload: { first_game_screen: firstScreen() }, now: NOW });
  const originalCwd = process.cwd();
  const compatibilityRoot = await mkdtemp(join(tmpdir(), 'rus-shadow-turn-'));
  const runbookDir = join(compatibilityRoot, 'DOCUMENTS', 'documents-kg', 'corpus', 'DOCUMENTS');
  await mkdir(runbookDir, { recursive: true });
  await copyFile(new URL('../../data/shadow-corpus/base_turn_orcestration.txt', import.meta.url), join(runbookDir, 'base_turn_orcestration.txt'));
  let legacy;
  try {
    process.chdir(compatibilityRoot);
    legacy = await runLegacyTurn({ partyRuntimeState: runtime, rawText: RAW_TEXT, llmExecutors: legacyExecutors(), now: NOW });
  } finally {
    process.chdir(originalCwd);
  }
  const modular = await runTurnWorkflow({ party_id: 'party-shadow', turn_number: 1, request_id: 'shadow-turn-1', idempotency_key: 'shadow-turn-1', raw_text: RAW_TEXT, received_at: NOW }, modularServices(), { now: NOW, requestId: 'shadow-turn-1' });
  const comparison = compareStructuralObservations(normalizeLegacy(legacy), normalizeModular(modular));
  assert.equal(comparison.equivalent, true, JSON.stringify(comparison.differences, null, 2));
});

test('turn prose is not byte-compared while semantic and safety fields remain mandatory', () => {
  const left = { schema: 'turn_screen', prose: 'Один вариант текста.', audit: { pass: true }, hidden_leak: false };
  const right = { schema: 'turn_screen', prose: 'Другой допустимый вариант текста.', audit: { pass: true }, hidden_leak: false };
  assert.equal(compareStructuralObservations(left, right).equivalent, true);
  assert.equal(compareStructuralObservations(left, { ...right, audit: { pass: false } }).equivalent, false);
});
