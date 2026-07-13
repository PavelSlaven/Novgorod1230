import test from 'node:test';
import assert from 'node:assert/strict';
import {
  explainJsonObjectParse,
  explainPlayerSeedEnvelope,
  explainPlayerSeedCompactValidation,
  explainPlayerSeedValidation,
  buildPlayerSeedOutputContract,
  buildPlayerSeedAntiRegressionRules,
  mergePlayerSeedValidationErrors,
  resolvePlayerSeedDisplayName,
  validatePlayerSeedCompact
} from '../src/world/json-contracts.js';
import { buildFailureSummary, createDiagnosticJournal } from '../src/ui/diagnostic-events.js';
import { attachDiagnosticJournal, generatePlayerSeed } from '../src/world/provider.js';
import { buildCanonicalPlayerSeedFixture } from './player-seed-fixtures.js';
import { createWorldState } from '../src/world/state.js';

process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'test-key';

// Legacy provider-path coverage: generatePlayerSeed() is still used by src/world/new-game.js legacy flow,
// but the new new-game/start lifecycle runtime composes validated_player_seed via src/world/new-game-pipeline/composition.js.
const PLAYER_SEED_SHAPE_MIN_TOKENS = 3500;

function buildCompactPlayerSeedFixture(overrides = {}) {
  return buildCanonicalPlayerSeedFixture({
    knowledge_map: undefined,
    memory_profile: undefined,
    goals_profile: undefined,
    relations: undefined,
    property_and_access: undefined,
    skill_bonuses: undefined,
    family: undefined,
    memory: undefined,
    knowledge: undefined,
    fears: undefined,
    goals: undefined,
    obligations: undefined,
    current_position: undefined,
    ...overrides
  });
}

function mockPlayerSeedFetch(handlers = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';
    const handler = handlers.resolve?.({ body, systemText, userText, calls }) ?? handlers;
    if (typeof handler === 'function') {
      return handler({ body, systemText, userText, calls });
    }
    if (/PlayerSeedShaper/i.test(systemText) && handlers.shaper) {
      return handlers.shaper({ body, systemText, userText, calls });
    }
    if (/PlayerSeedRepairer/i.test(systemText) && handlers.repair) {
      return handlers.repair({ body, systemText, userText, calls });
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
            }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
          };
        }
      };
    }
    if (/player_seed/i.test(userText) && /Pipeline stage: player_seed/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: 'Сухой player dossier.' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
          };
        }
      };
    }
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}

test('explainJsonObjectParse separates parse, non-object, and success', () => {
  assert.equal(explainJsonObjectParse('not json').ok, false);
  assert.equal(explainJsonObjectParse('not json').kind, 'json_parse');
  assert.equal(explainJsonObjectParse('[]').kind, 'json_not_object');
  assert.equal(explainJsonObjectParse('{"schema":"player_seed"}').ok, true);
});

test('explainPlayerSeedEnvelope rejects wrong schema before field validation', () => {
  const audit = explainPlayerSeedEnvelope({ version: 1, schema: 'semantic_audit', pass: true });
  assert.equal(audit.ok, false);
  assert.equal(audit.kind, 'wrong_schema');
  assert.match(audit.errors[0], /wrong_schema/);
});

test('resolvePlayerSeedDisplayName allows null given_name with nickname', () => {
  assert.equal(resolvePlayerSeedDisplayName({
    given_name: null,
    nickname: 'Молчун'
  }), 'Молчун');
  assert.equal(resolvePlayerSeedDisplayName({
    given_name: null,
    nickname: 'Молчун',
    display_name: 'Молчун'
  }), 'Молчун');
});

test('buildPlayerSeedOutputContract includes field types and disputed examples', () => {
  const contract = buildPlayerSeedOutputContract();
  assert.equal(contract.schema, 'player_seed');
  assert.equal(contract.fields.skill_bonuses.type, 'object');
  assert.equal(contract.fields.skills.type, 'array');
  assert.ok(contract.disputedFields.skill_bonuses);
  assert.equal(contract.disputedFields.skill_bonuses.type, 'object');
  assert.match(contract.disputedFields.skill_bonuses.note, /never array/i);
  assert.ok(Array.isArray(contract.requiredKeys));
  assert.ok(contract.requiredKeys.includes('skill_bonuses'));
});

test('skill_bonuses validation distinguishes skills legacy adapter', () => {
  const validation = explainPlayerSeedValidation({
    ...buildCanonicalPlayerSeedFixture(),
    skill_bonuses: ['Хозяйство +3']
  });
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('; '), /skill_bonuses.*object.*skills is legacy/i);
});

test('mergePlayerSeedValidationErrors accumulates without duplicates', () => {
  const merged = mergePlayerSeedValidationErrors(
    ['root.bodyState: expected string, got object'],
    ['root.position: expected object, got string', 'root.bodyState: expected string, got object']
  );
  assert.equal(merged.length, 2);
});

test('PlayerSeedShaper prompt includes outputContract with types', async () => {
  let shapePayload = null;
  const mock = mockPlayerSeedFetch({
    shaper({ userText }) {
      shapePayload = JSON.parse(userText);
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify(buildCanonicalPlayerSeedFixture()) } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
          };
        }
      };
    }
  });

  try {
    const world = createWorldState({ startText: 'Апрель 1242, Новгород.' });
    await generatePlayerSeed(world);
    assert.ok(shapePayload?.outputContract);
    assert.equal(shapePayload.outputContract.fields.skill_bonuses.type, 'object');
    assert.ok(shapePayload.canonicalExample);
    assert.ok(shapePayload.outputContract.disputedFields.skill_bonuses);
    assert.equal(shapePayload.repairNotes, undefined);
  } finally {
    mock.restore();
  }
});

test('repair returns full JSON path and accepts valid repair output', async () => {
  let repairPayload = null;
  const mock = mockPlayerSeedFetch({
    shaper({ calls }) {
      const attempt = calls.filter((call) => /PlayerSeedShaper/i.test(call.messages?.[0]?.content ?? '')).length;
      if (attempt === 1) {
        const broken = buildCanonicalPlayerSeedFixture();
        broken.skill_bonuses = ['Хозяйство +3'];
        broken.knowledge_map = ['факт'];
        return {
          ok: true,
          async json() {
            return {
              choices: [{ message: { content: JSON.stringify(broken) } }],
              usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify(buildCanonicalPlayerSeedFixture()) } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
          };
        }
      };
    },
    repair({ userText, systemText }) {
      repairPayload = JSON.parse(userText);
      assert.match(systemText, /полный исправленный JSON/i);
      assert.match(systemText, /Не возвращай repair note/i);
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify(buildCanonicalPlayerSeedFixture()) } }],
            usage: { prompt_tokens: 80, completion_tokens: 400, total_tokens: 480 }
          };
        }
      };
    }
  });

  try {
    const world = createWorldState({ startText: 'Апрель 1242, Новгород.' });
    const result = await generatePlayerSeed(world);
    assert.ok(result.data);
    assert.ok(repairPayload);
    assert.ok(Array.isArray(repairPayload.validationErrors));
    assert.ok(repairPayload.validationErrors.length >= 2);
    assert.ok(repairPayload.outputContract);
    assert.ok(repairPayload.previousPlayerSeed);
  } finally {
    mock.restore();
  }
});

test('accumulated validation errors passed to repair and retry', async () => {
  const seen = { repairErrors: null, retryInstruction: null };
  const mock = mockPlayerSeedFetch({
    shaper({ userText, calls }) {
      const attempt = calls.filter((call) => /PlayerSeedShaper/i.test(call.messages?.[0]?.content ?? '')).length;
      const payload = JSON.parse(userText);
      if (payload.retryInstruction) seen.retryInstruction = payload.retryInstruction;
      if (attempt === 1) {
        const broken = buildCanonicalPlayerSeedFixture();
        broken.skill_bonuses = ['Хозяйство +3'];
        broken.knowledge_map = ['факт'];
        broken.memory_profile = ['память'];
        return {
          ok: true,
          async json() {
            return {
              choices: [{ message: { content: JSON.stringify(broken) } }],
              usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify(buildCanonicalPlayerSeedFixture()) } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
          };
        }
      };
    },
    repair({ userText }) {
      seen.repairErrors = JSON.parse(userText).validationErrors;
      const stillBroken = buildCanonicalPlayerSeedFixture();
      stillBroken.skill_bonuses = { ...stillBroken.skill_bonuses };
      stillBroken.knowledge_map = ['факт'];
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify(stillBroken) } }],
            usage: { prompt_tokens: 80, completion_tokens: 400, total_tokens: 480 }
          };
        }
      };
    }
  });

  try {
    const world = createWorldState({ startText: 'Апрель 1242, Новгород.' });
    await generatePlayerSeed(world);
    assert.ok(seen.repairErrors?.length >= 3);
    assert.ok(seen.retryInstruction);
    assert.match(seen.retryInstruction, /accumulated validationErrors/i);
    assert.match(seen.retryInstruction, /skill_bonuses: object, not array/i);
    for (const rule of buildPlayerSeedAntiRegressionRules()) {
      assert.match(seen.retryInstruction, new RegExp(rule.split(':')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  } finally {
    mock.restore();
  }
});

test('anti-regression retry keeps fixed skill_bonuses when repair partially succeeds', async () => {
  const seen = { secondShaperSeed: null };
  const mock = mockPlayerSeedFetch({
    shaper({ userText, calls }) {
      const attempt = calls.filter((call) => /PlayerSeedShaper/i.test(call.messages?.[0]?.content ?? '')).length;
      const payload = JSON.parse(userText);
      if (attempt >= 2) {
        seen.secondShaperSeed = payload.previousPlayerSeed;
        assert.match(payload.retryInstruction, /Do not regress/i);
      }
      if (attempt === 1) {
        const broken = buildCanonicalPlayerSeedFixture();
        broken.skill_bonuses = ['Хозяйство +3'];
        broken.knowledge_map = ['факт'];
        return {
          ok: true,
          async json() {
            return { choices: [{ message: { content: JSON.stringify(broken) } }] };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify(buildCanonicalPlayerSeedFixture()) } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
          };
        }
      };
    },
    repair() {
      const partial = buildCanonicalPlayerSeedFixture();
      partial.knowledge_map = ['still array'];
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: JSON.stringify(partial) } }] };
        }
      };
    }
  });

  try {
    const world = createWorldState({ startText: 'Апрель 1242, Новгород.' });
    await generatePlayerSeed(world);
    assert.ok(seen.secondShaperSeed);
    assert.ok(typeof seen.secondShaperSeed.skill_bonuses === 'object');
    assert.equal(Array.isArray(seen.secondShaperSeed.skill_bonuses), false);
  } finally {
    mock.restore();
  }
});

test('skills may remain string array while skill_bonuses must be object', () => {
  const seed = buildCanonicalPlayerSeedFixture({
    skills: ['Хозяйство +3', 'Атлетика +2'],
    skill_bonuses: { ...buildCanonicalPlayerSeedFixture().skill_bonuses }
  });
  const validation = explainPlayerSeedValidation(seed);
  assert.equal(validation.ok, true);
});

test('validatePlayerSeedCompact accepts minimal contract', () => {
  const compact = buildCompactPlayerSeedFixture();
  assert.ok(validatePlayerSeedCompact(compact));
  const validation = explainPlayerSeedCompactValidation(compact);
  assert.equal(validation.ok, true);
});

test('PlayerSeedShaper uses increased maxTokens', async () => {
  const mock = mockPlayerSeedFetch({
    shaper({ calls }) {
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify(buildCanonicalPlayerSeedFixture())
              }
            }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
          };
        }
      };
    }
  });

  try {
    const world = createWorldState({ startText: 'Апрель 1242, Новгород.' });
    await generatePlayerSeed(world);
    const shaperCall = mock.calls.find((call) => /PlayerSeedShaper/i.test(call.messages?.[0]?.content ?? ''));
    assert.ok(shaperCall);
    assert.ok(shaperCall.max_tokens >= PLAYER_SEED_SHAPE_MIN_TOKENS);
  } finally {
    mock.restore();
  }
});

test('legacy player seed parse failure skips semantic repair and preserves responseRaw', async () => {
  let repairCalls = 0;
  const journal = createDiagnosticJournal();
  const mock = mockPlayerSeedFetch({
    shaper({ calls }) {
      const attempt = calls.filter((call) => /PlayerSeedShaper/i.test(call.messages?.[0]?.content ?? '')).length;
      if (attempt === 1) {
        return {
          ok: true,
          async json() {
            return {
              choices: [{ message: { content: '{"schema":"player_seed","broken":' } }],
              usage: { prompt_tokens: 100, completion_tokens: PLAYER_SEED_SHAPE_MIN_TOKENS, total_tokens: 4100 }
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify(buildCanonicalPlayerSeedFixture()) } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
          };
        }
      };
    },
    repair() {
      repairCalls += 1;
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: 'replace name with null' } }] };
        }
      };
    }
  });

  try {
    const world = createWorldState({ startText: 'Апрель 1242, Новгород.' });
    const hooks = attachDiagnosticJournal({ diagnosticJournal: journal });
    const result = await generatePlayerSeed(world, process.env, hooks);
    assert.ok(result.data);
    assert.equal(repairCalls, 0);
    const shaperCalls = mock.calls.filter((call) => /PlayerSeedShaper/i.test(call.messages?.[0]?.content ?? ''));
    assert.ok(shaperCalls.length >= 2);
    const retryPayload = JSON.parse(shaperCalls[1].messages?.[1]?.content ?? '{}');
    assert.match(retryPayload.retryInstruction ?? '', /hit maxTokens/i);
    assert.match(retryPayload.retryInstruction ?? '', /Compact shape only/i);
    assert.ok(journal.snapshot({ includeRawDetails: true }).some((entry) => String(entry.phase ?? '') === 'semantic_shape'));
  } finally {
    mock.restore();
  }
});

test('wrong schema failure is explicit and skips semantic repair', async () => {
  let repairCalls = 0;
  const mock = mockPlayerSeedFetch({
    shaper({ calls }) {
      const attempt = calls.filter((call) => /PlayerSeedShaper/i.test(call.messages?.[0]?.content ?? '')).length;
      if (attempt === 1) {
        return {
          ok: true,
          async json() {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({ version: 1, schema: 'semantic_audit', pass: true, concerns: [], evidence: [] })
                }
              }],
              usage: { prompt_tokens: 50, completion_tokens: 40, total_tokens: 90 }
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify(buildCanonicalPlayerSeedFixture()) } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
          };
        }
      };
    },
    repair() {
      repairCalls += 1;
      return { ok: true, async json() { return { choices: [{ message: { content: 'noop' } }] }; } };
    }
  });

  try {
    const world = createWorldState({ startText: 'Апрель 1242, Новгород.' });
    await generatePlayerSeed(world);
    assert.equal(repairCalls, 0);
  } finally {
    mock.restore();
  }
});

test('buildFailureSummary suggests maxTokens fix on truncation', () => {
  const summary = buildFailureSummary([], {
    status: 'error',
    error: 'Output likely truncated at maxTokens=3500'
  });
  assert.match(summary.suggestedFix, /maxTokens|compact shape/i);
});
