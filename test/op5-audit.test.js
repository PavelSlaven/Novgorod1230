import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLocalEnv } from '../src/env.js';
import { createWorldState } from '../src/world/state.js';
import { applyStateDelta } from '../src/world/delta.js';
import { composeStateDiff, commitStateDiff } from '../src/world/state-diff.js';
import { getActiveStateValue } from '../src/world/profile-v2.js';
import { loadDesignBundleSync, inspectDesignBundleCoverageSync } from '../src/world/corpus-loader.js';
import {
  findDisallowedPublicKeys,
  findForbiddenPublicKeys,
  sanitizeActorPublicProfile,
  validateActorPublicProfile
} from '../src/world/json-contracts.js';
import { assertPublicUiState, buildUiState } from '../src/ui-state.js';
import { handlePlayerInput } from './party-turn-test-helpers.js';

await loadLocalEnv();
process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'test-key';

const SECRET = 'OP5_HIDDEN_SENTINEL';

function snapshotTurnFields(world) {
  return {
    clock: structuredClone(world.clock),
    current_position: structuredClone(world.current_position),
    masterNotes: structuredClone(world.memory?.masterNotes ?? []),
    lastRiskAudit: structuredClone(world.lastRiskAudit ?? null),
    lastCheck: structuredClone(world.lastCheck ?? null),
    fear: getActiveStateValue(world.player, 'fear'),
    carried: (world.player?.items?.carried_items ?? []).map((item) => item.label)
  };
}

test('party turn pipeline does not mutate position before auditor commit', async () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const beforePosition = structuredClone(world.current_position);

  try {
    await assert.rejects(
      () => handlePlayerInput(world, 'иду к реке', {
        llmExecutors: {
          auditor() {
            assert.deepEqual(world.current_position, beforePosition);
            throw new Error('stop before commit');
          }
        }
      }),
      /stop before commit/
    );
    assert.deepEqual(world.current_position, beforePosition);
  } finally {}
});

test('party turn pipeline leaves world untouched when auditor stage fails', async () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const before = snapshotTurnFields(world);

  try {
    await assert.rejects(
      () => handlePlayerInput(world, 'иду к реке', {
        llmExecutors: {
          auditor() {
            throw new Error('auditor stage failed');
          }
        }
      }),
      /auditor stage failed/
    );
    const after = snapshotTurnFields(world);
    assert.deepEqual(after.clock, before.clock);
    assert.deepEqual(after.current_position, before.current_position);
    assert.deepEqual(after.masterNotes, before.masterNotes);
    assert.equal(after.lastRiskAudit, before.lastRiskAudit);
    assert.equal(after.lastCheck, before.lastCheck);
    assert.deepEqual(after.carried, before.carried);
  } finally {}
});

test('state_delta.resources.inventory_add does not create items', () => {
  const world = createWorldState({ startText: 'двор' });
  applyStateDelta(world, { resources: { inventory_add: ['золотой кубок'] } });
  assert.equal(world.player.items.carried_items.some((item) => item.label === 'золотой кубок'), false);

  const diff = composeStateDiff(world, { resources: { inventory_add: ['золотой кубок'] } });
  assert.throws(
    () => commitStateDiff(world, diff),
    /state_delta\.resources\.inventory_add is forbidden/
  );
});

test('state_delta.resources.property_add does not create items', () => {
  const world = createWorldState({ startText: 'двор' });
  applyStateDelta(world, { resources: { property_add: ['клеть'] } });
  assert.equal(world.player.items.property_not_carried.some((item) => item.label === 'клеть'), false);

  const diff = composeStateDiff(world, { resources: { property_add: { label: 'клеть' } } });
  assert.throws(
    () => commitStateDiff(world, diff),
    /state_delta\.resources\.property_add is forbidden/
  );
});

test('design bundles include required sections without global truncation', () => {
  for (const task of ['inventory', 'movement', 'combat', 'master_narrative', 'player_seed']) {
    const bundle = loadDesignBundleSync(task);
    const coverage = inspectDesignBundleCoverageSync(task);
    assert.ok(coverage.includedSectionIds.length > 0, `${task}: no sections included`);
    assert.equal(coverage.missingRequired.length, 0, `${task}: missing ${coverage.missingRequired.join(', ')}`);
    assert.equal(coverage.ok, true, `${task}: coverage incomplete`);
    assert.doesNotMatch(bundle, /\[corpus bundle truncated\]/);
  }
});

test('player_seed design bundle includes mandatory player generation sections', () => {
  const coverage = inspectDesignBundleCoverageSync('player_seed');
  assert.equal(coverage.ok, true);
  const bundle = loadDesignBundleSync('player_seed');
  for (const heading of [
    '## 6. Характеристики',
    '## 7. Навыки',
    '## 8. Знания персонажа',
    '## 11. Имущество, инвентарь и доступ',
    '## 15. Историческая проверка',
    '## 19. Выходной результат генерации',
    '## 20. Ограничения генерации'
  ]) {
    assert.match(bundle, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('inventory bundle keeps no-item-creation rule excerpt', () => {
  const bundle = loadDesignBundleSync('inventory');
  assert.match(bundle, /(нельзя создавать|не создаёт предмет|fixed items)/i);
  assert.match(bundle, /(контейнер|container)/i);
});

test('validateActorPublicProfile rejects allowlist and pattern hidden keys', () => {
  assert.equal(validateActorPublicProfile({
    identity: { name: 'Стражник', visibleStatus: 'стражник' },
    mind: { internal_goal: ['убить игрока'] }
  }), null);
  assert.equal(validateActorPublicProfile({
    identity: { name: 'Стражник', visibleStatus: 'стражник', real_loyalty: 'шпион' }
  }), null);
  assert.ok(validateActorPublicProfile({
    identity: { name: 'Стражник', visibleStatus: 'стражник' },
    mind: { seen: ['ворота'], manner: ['строгий'] }
  }));
});

test('sanitizeActorPublicProfile strips non-allowlisted nested actor profile keys', () => {
  const clean = sanitizeActorPublicProfile({
    version: 1,
    kind: 'npc',
    identity: { name: 'Стражник', visibleStatus: 'стражник', trueStatus: 'шпион' },
    mind: { goals: ['работать'], hidden: [SECRET], future_knowledge: ['1250'] },
    knowledge: { secretPlans: ['bad'] }
  });
  assert.equal(clean.identity.trueStatus, undefined);
  assert.equal(clean.mind.hidden, undefined);
  assert.equal(clean.knowledge, undefined);
  assert.equal(clean.mind.goals, undefined);
  assert.equal(findDisallowedPublicKeys(clean).length, 0);
  assert.equal(findForbiddenPublicKeys(clean).length, 0);
});

test('buildUiState rejects saturated hidden actor profile leaks', () => {
  const world = createWorldState({ startText: 'двор' });
  world.npcs[0].actorProfile = {
    identity: { name: world.npcs[0].name, visibleStatus: 'стражник' },
    mind: { goals: ['работать'], hidden: [SECRET], private_notes: ['тайна'] }
  };
  const ui = buildUiState(world, { includeDebug: false });
  const payload = JSON.stringify(ui.visibleNpcs ?? ui.npcs ?? []);
  assert.doesNotMatch(payload, new RegExp(SECRET));
  assert.doesNotMatch(payload, /private_notes/);
  assertPublicUiState(ui);
});
