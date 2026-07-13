import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLocalEnv } from '../src/env.js';
import { createWorldState } from '../src/world/state.js';
import { buildMechanicsProposal, handlePlayerInput } from '../src/world/engine.js';
import { planMasterTurnSync } from '../src/world/master.js';
import { buildActionCheck } from '../src/world/checks.js';
import { loadDesignBundleSync, inspectDesignBundleCoverageSync } from '../src/world/corpus-loader.js';
import { buildUiState } from '../src/ui-state.js';
import { scheduleDelayedEvent } from '../src/world/delayed-events.js';
import { validateStateDeltaItemChange } from '../src/world/item-resolver.js';
import { applyMemoryJournalUpdate, validateMemoryJournalUpdate } from '../src/world/memory-journal.js';
import {
  buildNarratorShapeMessages,
  buildProsePromptHeader,
  buildStructuredShapePromptHeader,
  buildDeterministicVisiblePackage,
  buildVisibleContextInput,
  validateVisibleContextPackage
} from '../src/world/provider.js';

await loadLocalEnv();
process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'test-key';

const SENTINEL = 'OP7_HIDDEN_SENTINEL';

test('buildProsePromptHeader omits hidden section', () => {
  const header = buildProsePromptHeader({
    role: 'prose',
    task: 'write',
    sources: 'visible only',
    facts: 'none',
    visible: 'scene',
    constraints: 'no leaks',
    format: 'prose',
    criteria: 'ok'
  });
  assert.doesNotMatch(header, /# Скрытая информация/i);
});

test('buildStructuredShapePromptHeader avoids prose styling', () => {
  const header = buildStructuredShapePromptHeader({
    role: 'shaper',
    task: 'shape json',
    format: 'schema',
    constraints: 'no new facts'
  });
  assert.doesNotMatch(header, /художественн/i);
  assert.doesNotMatch(header, /# Скрытая информация/i);
});

test('buildNarratorShapeMessages excludes hidden audit dossier world fields', () => {
  const pkg = {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Двор утром.',
    visible_changes: ['шум у ворот'],
    sensory_details: [],
    visible_npc: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: []
  };
  const messages = buildNarratorShapeMessages(pkg, 'Двор шумит.', { pass: true }, { day: 1, hour: 9, minute: 0 }, 'утро');
  const payload = JSON.stringify(messages);
  assert.doesNotMatch(payload, /# Скрытая информация/i);
  assert.doesNotMatch(payload, /sourceDossier/i);
  assert.doesNotMatch(payload, /"audit"/i);
  assert.doesNotMatch(payload, /state_delta/i);
  assert.doesNotMatch(payload, /"input"/i);
  assert.doesNotMatch(payload, /"intent"/i);
  assert.doesNotMatch(payload, /"world"/i);
  assert.doesNotMatch(payload, /"witnesses"/i);
  assert.doesNotMatch(payload, /"dossier"/i);
});

test('hidden sentinel does not leak into visible package', () => {
  const world = createWorldState({ startText: 'двор' });
  world.scenarioFixture = true;
  world.hidden_state = { motive: SENTINEL };
  const input = buildVisibleContextInput(world, {
    scene: 'Двор.',
    consequence: 'Тишина.',
    visible_details: ['следы'],
    npc_reactions: [],
    next_pressure: 'ждать'
  });
  assert.equal(input.hiddenSentinelPresent, true);
  const pkg = buildDeterministicVisiblePackage(world, {
    scene: 'Двор.',
    consequence: 'Тишина.',
    visible_details: ['следы'],
    npc_reactions: [],
    next_pressure: 'ждать'
  });
  const validation = validateVisibleContextPackage(pkg);
  assert.equal(validation.ok, true);
  assert.doesNotMatch(JSON.stringify(pkg), new RegExp(SENTINEL));
});

test('hidden delayed event stays out of public ui state', () => {
  const world = createWorldState({ startText: 'двор' });
  scheduleDelayedEvent(world, {
    reason: SENTINEL,
    dueInMinutes: 120,
    result: 'тайный приказ',
    visibility: 'hidden'
  });
  const ui = buildUiState(world);
  const payload = JSON.stringify(ui.delayedEvents ?? []);
  assert.doesNotMatch(payload, new RegExp(SENTINEL));
  assert.equal((ui.delayedEvents ?? []).length, 0);
});

test('delayed clue appears without dueAt result effect', () => {
  const world = createWorldState({ startText: 'двор' });
  scheduleDelayedEvent(world, {
    reason: 'ожидание приказа',
    dueInMinutes: 120,
    result: 'тайный приказ',
    visibility: 'clue',
    visibleClue: 'стража нервно смотрит на ворота'
  });
  const ui = buildUiState(world);
  assert.equal((ui.delayedEvents ?? []).length, 1);
  const text = ui.delayedEvents[0];
  assert.match(text, /стража нервно/i);
  assert.doesNotMatch(text, /тайный приказ/i);
  assert.doesNotMatch(text, /к день/i);
});

test('materialize without basis is rejected', () => {
  const world = createWorldState({ startText: 'двор' });
  const result = validateStateDeltaItemChange(world, {
    op: 'materialize',
    item_id: 'item:test:1',
    source: 'visible_scene_object',
    cause: 'нашёл',
    evidence: ['след на полу'],
    item: { id: 'item:test:1', label: 'нож', owner_id: 'player', holder_id: 'player' }
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /materialization_basis/i);
});

test('materialize with basis evidence and owner passes', () => {
  const world = createWorldState({ startText: 'двор' });
  const result = validateStateDeltaItemChange(world, {
    op: 'materialize',
    materialization_basis: 'visible_scene_object',
    source_fact_ids: ['fact:knife-on-table'],
    item_id: 'item:test:1',
    source: 'visible_scene_object',
    cause: 'нашёл на столе',
    why_not_visible_before: 'был завален тканью',
    evidence: ['край лезвия виден под тканью'],
    owner_id: 'player',
    holder_id: 'player',
    item: { id: 'item:test:1', label: 'нож', owner_id: 'player', holder_id: 'player' }
  });
  assert.equal(result.ok, true);
});

test('buildMechanicsProposal does not mutate live world position', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const before = structuredClone(world.current_position);
  const plan = planMasterTurnSync(world, 'иду к реке');
  const check = buildActionCheck(world, plan.frame);
  buildMechanicsProposal(world, plan, plan.frame.intent, check);
  assert.deepEqual(world.current_position, before);
});

test('design bundles include llm agent prompt templates sections', () => {
  for (const task of ['master_narrative', 'new_game', 'player_seed']) {
    const coverage = inspectDesignBundleCoverageSync(task);
    assert.equal(coverage.ok, true, `${task} missing: ${coverage.missingRequired.join(', ')}`);
    const bundle = loadDesignBundleSync(task);
    assert.match(bundle, /llm_agent_prompt_templates\.md/);
    assert.match(bundle, /агент художественной прозы|агент отбора видимого контекста|промт агента структурирования/i);
  }
});

test('memory journal keeps hidden world changes out of character journal', () => {
  const world = createWorldState({ startText: 'двор' });
  const update = {
    version: 1,
    schema: 'memory_journal_update',
    character_journal: [{ type: 'event', text: 'У ворот шум.', source_in_world: 'ход', certainty: 'known' }],
    world_memory: [{ type: 'hidden_change', text: SENTINEL, visible_to_character: false }],
    discarded_as_noise: []
  };
  assert.equal(validateMemoryJournalUpdate(update).ok, true);
  applyMemoryJournalUpdate(world, update, { playerInput: 'жду', intentTag: 'wait', fallbackSummary: 'ожидание' });
  const journalText = JSON.stringify(world.journal ?? []);
  assert.doesNotMatch(journalText, new RegExp(SENTINEL));
  assert.ok((world.memory.worldMemory ?? []).some((entry) => String(entry.text).includes(SENTINEL)));
});

test('handlePlayerInput rolls back when master fails after mechanics proposal', async () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const beforeClock = structuredClone(world.clock);
  const beforePosition = structuredClone(world.current_position);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    if (/предварительный аудит риска/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify({ version: 1, schema: 'risk_audit', required: false, reason: 'test', factors: [], complexity: 'low', visibility: 'public' }) } }]
          };
        }
      };
    }
    throw new Error('master failed after proposal');
  };

  try {
    await assert.rejects(() => handlePlayerInput(world, 'иду к реке'), /master failed after proposal/);
    assert.deepEqual(world.clock, beforeClock);
    assert.deepEqual(world.current_position, beforePosition);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
