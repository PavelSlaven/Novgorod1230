import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFailureSummary, createDiagnosticJournal } from '../src/ui/diagnostic-events.js';
import { buildDeterministicVisiblePackage } from '../src/world/visibility.js';
import {
  attachDiagnosticJournal,
  generateNarratorProse,
  generateVisibleContextPackage
} from '../src/world/provider.js';
import { createFreshWorld } from '../src/world/new-game.js';
import { createWorldState } from '../src/world/state.js';
import { planMasterTurnSync } from '../src/world/master.js';
import { buildCanonicalPlayerSeedFixture } from './player-seed-fixtures.js';

function mockVisiblePackage(overrides = {}) {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Двор у переправы.',
    visible_changes: ['дым'],
    sensory_details: ['холод'],
    visible_npc: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: [],
    ...overrides
  };
}

function mockChoice(content) {
  return {
    ok: true,
    async json() {
      return {
        choices: [{
          message: {
            content: typeof content === 'string' ? content : JSON.stringify(content)
          }
        }]
      };
    }
  };
}

function createFreshWorldFetchMock({ trackStage } = {}) {
  return async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = String(body.messages?.[1]?.content ?? '');
    const stageText = `${systemText}\n${userText}`;
    let payload = null;
    try {
      payload = JSON.parse(userText);
    } catch {
      payload = null;
    }
    const track = (name) => trackStage?.(name);

    if (/SemanticAuditRepairer/i.test(systemText)) {
      return mockChoice({
        version: 1,
        schema: 'semantic_audit',
        pass: true,
        concerns: [],
        evidence: ['repaired audit']
      });
    }

    if ((/semantic_audit/i.test(systemText) || /отдельный проверяющий/i.test(stageText))
      && !/PlayerSeedShaper/i.test(systemText)) {
      if (/Visible context audit|visible_context_package/i.test(stageText)) track('visible_context_audit');
      if (/Narrator audit/i.test(stageText)) track('narrator_audit');
      return mockChoice({
        version: 1,
        schema: 'semantic_audit',
        pass: true,
        concerns: [],
        evidence: ['ok']
      });
    }

    if (/VisibleContextDossierRepairer/i.test(systemText)) {
      track('visible_context_dossier_repair');
      return mockChoice('repaired visible dossier');
    }
    if (/VisibleContextShaper/i.test(systemText)) {
      track('visible_context_shape');
      const narrative = payload?.input?.narrative ?? {};
      return mockChoice(mockVisiblePackage({
        visible_scene: String(narrative.scene ?? 'Открытие: двор у переправы.')
      }));
    }
    if (/агент отбора видимого контекста/i.test(systemText)) {
      track('visible_context_dossier');
      return mockChoice('visible dossier for opening');
    }

    if (/MasterNarrativeShaper/i.test(systemText)) {
      track('master_narrative');
      return mockChoice({
        version: 1,
        schema: 'master_narrative',
        scene: 'Открытие: двор у переправы.',
        consequence: 'Видна утренняя сцена.',
        visible_details: ['двор', 'переправа'],
        npc_reactions: ['люди заняты делом'],
        next_pressure: 'день начинается'
      });
    }

    if (/narrator/i.test(stageText) || /UI-прозы/i.test(stageText) || /prose для UI/i.test(stageText)) {
      if (/SemanticDataShaper/i.test(systemText) && /narrator-прозы/i.test(systemText)) {
        track('narrator_prose');
        return mockChoice('Двор у переправы держится в рабочей тишине.');
      }
      if (/narrator/i.test(systemText) && !/Repairer/i.test(systemText)) {
        track('narrator_dossier');
        return mockChoice('Narrator dossier.');
      }
    }

    if (/HistoricalDataShaper/i.test(stageText) || /historical_frame/i.test(stageText) || /историческую рамку/i.test(stageText)) {
      if (/HistoricalDataShaper/i.test(stageText)) {
        track('historical_frame');
        return mockChoice({
          version: 1,
          schema: 'historical_frame',
          year: 1241,
          season: 'осень',
          regionName: 'Новгородская земля',
          regionHint: 'Новгородская земля',
          settlementType: 'двор у переправы',
          pressure: 'дорога',
          conflict: 'власть',
          startTextHint: 'двор у переправы'
        });
      }
      return mockChoice('Historical frame dossier.');
    }

    if (
      /PlaceSeedPurposeOwnershipShaper/i.test(stageText)
      || /ShapePurposeOwnership/i.test(stageText)
      || /PlaceSeedLivelihoodRoadsShaper/i.test(stageText)
      || /ShapeLivelihoodRoads/i.test(stageText)
      || /PlaceSeedAccessHazardsRhythmShaper/i.test(stageText)
      || /ShapeAccessHazardsRhythm/i.test(stageText)
      || /PlaceSeedShaper/i.test(stageText)
      || /schema=place_seed/i.test(stageText)
    ) {
      if (/PlaceSeedPurposeOwnershipShaper/i.test(stageText) || /ShapePurposeOwnership/i.test(stageText)) {
        return mockChoice({
          placeName: 'Двор у переправы',
          placeKind: 'дорожный двор',
          purpose: 'переправа',
          formalOwner: 'хозяин',
          actualManager: 'приказчик',
          dependentGroups: ['служки']
        });
      }
      if (/PlaceSeedLivelihoodRoadsShaper/i.test(stageText) || /ShapeLivelihoodRoads/i.test(stageText)) {
        return mockChoice({ livelihood: ['переправа'], roads: ['тракт'] });
      }
      if (/PlaceSeedAccessHazardsRhythmShaper/i.test(stageText) || /ShapeAccessHazardsRhythm/i.test(stageText)) {
        return mockChoice({ accessRules: ['ночью вход ограничен'], hazards: ['грязь'], rhythm: 'утро' });
      }
      if (/PlaceSeedShaper/i.test(systemText) || /schema=place_seed/i.test(systemText)) {
        track('place_seed');
        return mockChoice({
          version: 1,
          schema: 'place_seed',
          placeName: 'Двор у переправы',
          placeKind: 'дорожный двор',
          purpose: 'переправа',
          formalOwner: 'хозяин',
          actualManager: 'приказчик',
          dependentGroups: ['служки'],
          livelihood: ['переправа'],
          roads: ['тракт'],
          accessRules: ['ночью'],
          hazards: ['грязь'],
          rhythm: 'утро'
        });
      }
      return mockChoice('Place seed dossier.');
    }

    if (/SocialTissueShaper/i.test(stageText) || /social_tissue/i.test(stageText) || /социальную ткань/i.test(stageText)) {
      if (/SocialTissueShaper/i.test(stageText) || /outputRules/i.test(userText) || /schema["':\s]*social_tissue/i.test(stageText)) {
        track('social_tissue');
        return mockChoice({
          version: 1,
          schema: 'social_tissue',
          formalOwner: 'хозяин',
          actualManager: 'приказчик',
          dependentGroups: [],
          families: ['семья'],
          trade: ['торг'],
          rumors: ['слух'],
          tensions: ['напряжение'],
          obligations: ['долг'],
          rhythm: 'утро',
          accessRules: []
        });
      }
      return mockChoice('Social tissue dossier.');
    }

    if (/PlayerSeed/i.test(stageText) || /player_seed/i.test(stageText) || /персонажа игрока/i.test(stageText)) {
      if (/PlayerSeedShaper/i.test(stageText)) {
        track('player_seed');
        return mockChoice(buildCanonicalPlayerSeedFixture({
          name: 'Путник',
          role: 'путник',
          status: 'чужой'
        }));
      }
      return mockChoice('Player seed dossier.');
    }

    if (/actor_profiles/i.test(userText) || /ActorProfileShaper/i.test(stageText)) {
      if (/ActorProfileShaper/i.test(stageText)) {
        track('actor_profiles');
        return mockChoice({
          version: 1,
          schema: 'actor_profiles',
          player: { name: 'Путник', role: 'путник' },
          npcs: []
        });
      }
      return mockChoice('Actor dossier.');
    }

    if (/location_profiles/i.test(userText) || /LocationProfileShaper/i.test(stageText)) {
      if (/LocationProfileShaper/i.test(stageText)) {
        track('location_profiles');
        return mockChoice({
          version: 1,
          schema: 'location_profiles',
          locations: [{
            id: 'yard',
            purpose: 'двор',
            access: 'открыт',
            ownership: 'хозяин',
            hazards: [],
            users: [],
            periods: [],
            currentPeriod: null
          }]
        });
      }
      return mockChoice('Location dossier.');
    }

    if (/semantic dossier/i.test(systemText)) {
      return mockChoice('Generic dossier.');
    }

    return mockChoice('ok');
  };
}

function buildFrame(world) {
  const plan = planMasterTurnSync(world, 'осматриваюсь');
  return plan.frame;
}

test('generateNarratorProse production fails on master_narrative input', async () => {
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const world = createWorldState({ startText: 'двор' });
    const frame = buildFrame(world);
    await assert.rejects(
      () => generateNarratorProse(frame, {
        version: 1,
        schema: 'master_narrative',
        scene: 'Сцена.'
      }, { DEEPSEEK_API_KEY: 'test-key', NODE_TEST_CONTEXT: '' }),
      /requires approved visible_context_package/i
    );
  } finally {
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('buildDeterministicVisiblePackage not allowed in production', () => {
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const world = createWorldState({ startText: 'двор' });
    assert.throws(
      () => buildDeterministicVisiblePackage(world, { scene: 'двор' }),
      /Deterministic visible package is forbidden in production/i
    );
  } finally {
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('opening pipeline calls visible context before narrator prose', async () => {
  const stages = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    if (/агент отбора видимого контекста/i.test(systemText)) {
      stages.push('visible_context_package');
      if (/VisibleContextShaper/i.test(systemText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [{
                message: {
                  content: JSON.stringify(mockVisiblePackage({ visible_scene: 'Открытие.' }))
                }
              }]
            };
          }
        };
      }
      return { ok: true, async json() { return { choices: [{ message: { content: 'visible dossier' } }] }; } };
    }
    if (/narrator/i.test(systemText)) {
      stages.push('narrator_prose');
      if (/semantic_audit/i.test(systemText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['ok']
                  })
                }
              }]
            };
          }
        };
      }
      if (/SemanticDataShaper/i.test(systemText) && /narrator-прозы/i.test(systemText)) {
        return { ok: true, async json() { return { choices: [{ message: { content: 'Открытие сцены.' } }] }; } };
      }
      return { ok: true, async json() { return { choices: [{ message: { content: 'Dossier.' } }] }; } };
    }
    if (/semantic_audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  version: 1,
                  schema: 'semantic_audit',
                  pass: true,
                  concerns: [],
                  evidence: ['ok']
                })
              }
            }]
          };
        }
      };
    }
    return { ok: true, async json() { return { choices: [{ message: { content: 'ok' } }] }; } };
  };
  try {
    const world = createWorldState({ startText: 'двор' });
    const openingPlan = planMasterTurnSync(world, 'осматриваюсь');
    const openingNarrative = {
      scene: 'Открытие.',
      consequence: 'Видно.',
      visible_details: ['двор'],
      npc_reactions: [],
      next_pressure: 'утро'
    };
    const env = { DEEPSEEK_API_KEY: 'test-key', NODE_TEST_CONTEXT: '1' };
    const visibleContextResult = await generateVisibleContextPackage(world, openingNarrative, env, {});
    const proseResult = await generateNarratorProse(openingPlan.frame, visibleContextResult.data, env, {});
    assert.ok(visibleContextResult.data?.schema === 'visible_context_package');
    assert.ok(proseResult.prose);
    const visibleIdx = stages.indexOf('visible_context_package');
    const proseIdx = stages.indexOf('narrator_prose');
    assert.ok(visibleIdx >= 0 && proseIdx > visibleIdx, stages.join(','));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invalid narrator audit uses SemanticAuditRepairer', async () => {
  let auditCalls = 0;
  let repairCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    if (/SemanticAuditRepairer/i.test(systemText)) {
      repairCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  version: 1,
                  schema: 'semantic_audit',
                  pass: true,
                  concerns: [],
                  evidence: ['repaired audit']
                })
              }
            }]
          };
        }
      };
    }
    if (/narrator-аудит/i.test(systemText)) {
      auditCalls += 1;
      if (auditCalls === 1) {
        return {
          ok: true,
          async json() {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({ version: 1, schema: 'semantic_audit', pass: true, concerns: [], evidence: [] })
                }
              }]
            };
          }
        };
      }
    }
    if (/narrator/i.test(systemText) && !/аудит/i.test(systemText)) {
      return { ok: true, async json() { return { choices: [{ message: { content: 'Dossier ok.' } }] }; } };
    }
    if (/SemanticDataShaper/i.test(systemText) && /narrator-прозы/i.test(systemText)) {
      return { ok: true, async json() { return { choices: [{ message: { content: 'Проза.' } }] }; } };
    }
    return { ok: true, async json() { return { choices: [{ message: { content: 'ok' } }] }; } };
  };
  try {
    const world = createWorldState({ startText: 'двор' });
    const frame = buildFrame(world);
    const result = await generateNarratorProse(frame, mockVisiblePackage(), { DEEPSEEK_API_KEY: 'test-key', NODE_TEST_CONTEXT: '1' });
    assert.ok(result.prose);
    assert.equal(repairCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('pass=false narrator audit triggers NarratorDossierRepairer and re-audit', async () => {
  let auditCalls = 0;
  let dossierRepairCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    if (/NarratorDossierRepairer/i.test(systemText)) {
      dossierRepairCalls += 1;
      return { ok: true, async json() { return { choices: [{ message: { content: 'Исправленный dossier.' } }] }; } };
    }
    if (/narrator-аудит/i.test(systemText)) {
      auditCalls += 1;
      const pass = auditCalls >= 2;
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  version: 1,
                  schema: 'semantic_audit',
                  pass,
                  concerns: pass ? [] : ['dossier выходит за пакет'],
                  evidence: pass ? ['ok after repair'] : ['лишний факт в dossier']
                })
              }
            }]
          };
        }
      };
    }
    if (/SemanticDataShaper/i.test(systemText) && /narrator-прозы/i.test(systemText)) {
      return { ok: true, async json() { return { choices: [{ message: { content: 'Финальная проза.' } }] }; } };
    }
    if (/narrator/i.test(systemText) && !/NarratorProseRepairer/i.test(systemText)) {
      return { ok: true, async json() { return { choices: [{ message: { content: 'Первый dossier.' } }] }; } };
    }
    return { ok: true, async json() { return { choices: [{ message: { content: 'ok' } }] }; } };
  };
  try {
    const world = createWorldState({ startText: 'двор' });
    const frame = buildFrame(world);
    const result = await generateNarratorProse(frame, mockVisiblePackage(), { DEEPSEEK_API_KEY: 'test-key', NODE_TEST_CONTEXT: '1' });
    assert.equal(result.prose, 'Финальная проза.');
    assert.equal(dossierRepairCalls, 1);
    assert.ok(auditCalls >= 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('prose validation fail triggers NarratorProseRepairer', async () => {
  let proseRepairCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    if (/NarratorProseRepairer/i.test(systemText)) {
      proseRepairCalls += 1;
      const user = JSON.parse(body.messages?.[1]?.content ?? '{}');
      assert.ok(Array.isArray(user.validationErrors) && user.validationErrors.length > 0);
      assert.ok(user.previousProse);
      return { ok: true, async json() { return { choices: [{ message: { content: 'Утренний двор тих.' } }] }; } };
    }
    if (/semantic_audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  version: 1,
                  schema: 'semantic_audit',
                  pass: true,
                  concerns: [],
                  evidence: ['ok']
                })
              }
            }]
          };
        }
      };
    }
    if (/SemanticDataShaper/i.test(systemText) && /narrator-прозы/i.test(systemText)) {
      return { ok: true, async json() { return { choices: [{ message: { content: 'К вечеру двор затихает, хотя часы ещё показывают утро.' } }] }; } };
    }
    if (/narrator/i.test(systemText)) {
      return { ok: true, async json() { return { choices: [{ message: { content: 'Dossier.' } }] }; } };
    }
    return { ok: true, async json() { return { choices: [{ message: { content: 'ok' } }] }; } };
  };
  try {
    const world = createWorldState({ startText: 'двор' });
    world.clock = { day: 1, hour: 8, minute: 0 };
    const frame = buildFrame(world);
    const result = await generateNarratorProse(frame, mockVisiblePackage(), { DEEPSEEK_API_KEY: 'test-key', NODE_TEST_CONTEXT: '1' });
    assert.equal(result.prose, 'Утренний двор тих.');
    assert.equal(proseRepairCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('narrator retry repair carries previous output and accumulated errors', async () => {
  let capturedRepairPayload = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    if (/NarratorProseRepairer/i.test(systemText)) {
      capturedRepairPayload = JSON.parse(body.messages?.[1]?.content ?? '{}');
      return { ok: true, async json() { return { choices: [{ message: { content: 'Утро на дворе.' } }] }; } };
    }
    if (/semantic_audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  version: 1,
                  schema: 'semantic_audit',
                  pass: true,
                  concerns: [],
                  evidence: ['ok']
                })
              }
            }]
          };
        }
      };
    }
    if (/SemanticDataShaper/i.test(systemText) && /narrator-прозы/i.test(systemText)) {
      return { ok: true, async json() { return { choices: [{ message: { content: 'Вечерний двор при утренних часах.' } }] }; } };
    }
    if (/narrator/i.test(systemText)) {
      return { ok: true, async json() { return { choices: [{ message: { content: 'Dossier.' } }] }; } };
    }
    return { ok: true, async json() { return { choices: [{ message: { content: 'ok' } }] }; } };
  };
  try {
    const world = createWorldState({ startText: 'двор' });
    world.clock = { day: 1, hour: 9, minute: 0 };
    const frame = buildFrame(world);
    await generateNarratorProse(frame, mockVisiblePackage(), { DEEPSEEK_API_KEY: 'test-key', NODE_TEST_CONTEXT: '1' });
    assert.ok(capturedRepairPayload);
    assert.ok(capturedRepairPayload.previousProse);
    assert.ok(Array.isArray(capturedRepairPayload.validationErrors));
    assert.ok(capturedRepairPayload.validationErrors.length > 0);
    assert.match(capturedRepairPayload.validationErrors.join(' '), /conflicts with world\.clock/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('diagnostics summary.validation shows only failed stage errors', () => {
  const journal = createDiagnosticJournal();
  journal.recordValidationFailure({
    label: 'Player audit',
    schema: 'player_seed',
    validation: { ok: false, errors: ['player_seed: old warning'] }
  });
  journal.recordValidationFailure({
    label: 'Narrator prose validation',
    schema: 'narrator_prose',
    validation: { ok: false, errors: ['prose: expected non-empty string'] }
  });
  const summary = buildFailureSummary(journal.events, { status: 'error' });
  assert.deepEqual(summary.validation, ['prose: expected non-empty string']);
  assert.deepEqual(summary.previousValidationWarnings.player_seed, ['player_seed: old warning']);
  assert.equal(summary.failedValidationStage, 'narrator_prose');
});

test('generateVisibleContextPackage does not use deterministic fallback in production', async () => {
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500, async text() { return 'fail'; } });
  try {
    const world = createWorldState({ startText: 'двор' });
    await assert.rejects(
      () => generateVisibleContextPackage(world, { scene: 'двор' }, { DEEPSEEK_API_KEY: 'test-key' }),
      /visible_context_package|LLM provider|fetch failed|500/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('invalid visible context audit uses SemanticAuditRepairer', async () => {
  let repairCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    if (/SemanticAuditRepairer/i.test(systemText)) {
      repairCalls += 1;
      return mockChoice({
        version: 1,
        schema: 'semantic_audit',
        pass: true,
        concerns: [],
        evidence: ['repaired visible audit']
      });
    }
    if (/агент отбора видимого контекста/i.test(systemText)) {
      return mockChoice('visible dossier');
    }
    if (/semantic_audit/i.test(systemText) && /visible_context_package/i.test(systemText)) {
      return mockChoice({
        version: 1,
        schema: 'semantic_audit',
        pass: true,
        concerns: [],
        evidence: []
      });
    }
    if (/VisibleContextShaper/i.test(systemText)) {
      return mockChoice(mockVisiblePackage({ visible_scene: 'Двор.' }));
    }
    return mockChoice('ok');
  };
  try {
    const world = createWorldState({ startText: 'двор' });
    const result = await generateVisibleContextPackage(world, { scene: 'двор' }, { DEEPSEEK_API_KEY: 'test-key', NODE_TEST_CONTEXT: '1' });
    assert.equal(result.data?.schema, 'visible_context_package');
    assert.equal(repairCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('production visible context package records LLM journal events', async () => {
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  const originalFetch = globalThis.fetch;
  const journal = createDiagnosticJournal();
  const hooks = attachDiagnosticJournal({ diagnosticJournal: journal });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    if (/агент отбора видимого контекста/i.test(systemText)) {
      return mockChoice('visible dossier');
    }
    if (/semantic_audit/i.test(systemText) && /visible_context_package/i.test(systemText)) {
      return mockChoice({
        version: 1,
        schema: 'semantic_audit',
        pass: true,
        concerns: [],
        evidence: ['visible dossier stays within master narrative']
      });
    }
    if (/VisibleContextShaper/i.test(systemText)) {
      return mockChoice(mockVisiblePackage({ visible_scene: 'Двор у переправы.' }));
    }
    return mockChoice('ok');
  };
  try {
    const world = createWorldState({ startText: 'двор' });
    const result = await generateVisibleContextPackage(
      world,
      { scene: 'двор', visible_details: ['ворота'], consequence: 'тишина', next_pressure: 'утро' },
      { DEEPSEEK_API_KEY: 'test-key' },
      hooks
    );
    const snapshot = journal.snapshot({ includeDiagnostics: true, includeRawDetails: true });
    assert.equal(result.usedFallback, false);
    assert.notEqual(result.provider, 'deterministic');
    assert.ok(snapshot.some((entry) => entry.kind === 'llm_call'));
    assert.ok(snapshot.some((entry) => entry.kind === 'llm_response'));
    assert.ok(snapshot.some((entry) => /visible/i.test(`${entry.label ?? ''} ${entry.phase ?? ''}`)));
    assert.ok(!snapshot.some((entry) => /deterministic/i.test(`${entry.label ?? ''} ${entry.message ?? ''} ${entry.provider ?? ''}`)));
  } finally {
    globalThis.fetch = originalFetch;
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('createFreshWorld production opening runs visible context before narrator prose', async () => {
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  const originalFetch = globalThis.fetch;
  const stages = [];
  globalThis.fetch = createFreshWorldFetchMock({ trackStage: (name) => stages.push(name) });
  try {
    const result = await createFreshWorld({
      startText: 'двор у переправы',
      playerName: 'Marek',
      env: { DEEPSEEK_API_KEY: 'test-key', START_TEXT: 'двор у переправы' }
    });
    assert.ok(result.openingText.length > 0);
    assert.ok(result.world.lastNarratorProse);
    const visibleIdx = stages.findIndex((name) => /visible_context/i.test(name));
    const narratorIdx = stages.findIndex((name) => /narrator_prose|narrator_dossier/i.test(name));
    assert.ok(visibleIdx >= 0, stages.join(','));
    assert.ok(narratorIdx > visibleIdx, stages.join(','));
    assert.match(result.openingText, /двор|переправ/i);
    assert.throws(
      () => buildDeterministicVisiblePackage(result.world, { scene: 'двор' }),
      /Deterministic visible package is forbidden in production/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
});
