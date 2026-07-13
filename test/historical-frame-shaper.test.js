import test from 'node:test';
import assert from 'node:assert/strict';
import {
  explainHistoricalFrameValidation,
  explainHistoricalFrameEnvelope,
  buildHistoricalFrameOutputContract,
  buildHistoricalFrameAntiRegressionRules,
  mergeHistoricalFrameValidationErrors,
  getHistoricalFrameCanonicalExample,
  validateHistoricalFrame
} from '../src/world/json-contracts.js';
import { generateHistoricalFrame } from '../src/world/provider.js';

process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'test-key';

function buildValidHistoricalFrame(overrides = {}) {
  return {
    ...getHistoricalFrameCanonicalExample(),
    ...overrides
  };
}

function mockHistoricalFrameFetch(handlers = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';
    if (typeof handlers.resolve === 'function') {
      return handlers.resolve({ body, systemText, userText, calls });
    }
    if (/HistoricalDataShaper/i.test(systemText) && handlers.shaper) {
      return handlers.shaper({ body, systemText, userText, calls });
    }
    if (/HistoricalFrameRepairer/i.test(systemText) && handlers.repair) {
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
    if (/историческую рамку/i.test(systemText) || /historical frame/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: '1238 год, Новгородская земля, осень, сельское поселение.' } }],
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

test('buildHistoricalFrameOutputContract specifies string pressure/conflict and disputed examples', () => {
  const contract = buildHistoricalFrameOutputContract();
  assert.equal(contract.schema, 'historical_frame');
  assert.equal(contract.version, 1);
  assert.equal(contract.fields.pressure.type, 'string');
  assert.equal(contract.fields.conflict.type, 'string');
  assert.equal(contract.fields.schema.value, 'historical_frame');
  assert.equal(contract.fields.version.value, 1);
  assert.ok(contract.disputedFields.pressure);
  assert.match(contract.disputedFields.pressure.note, /never array/i);
  assert.ok(contract.disputedFields.regionHint);
  assert.ok(contract.disputedFields.settlementType);
  assert.notEqual(
    contract.disputedFields.regionHint.example,
    contract.disputedFields.settlementType.example
  );
});

test('explainHistoricalFrameEnvelope rejects wrong schema', () => {
  const audit = explainHistoricalFrameEnvelope({ version: 1, schema: 'semantic_audit', pass: true });
  assert.equal(audit.ok, false);
  assert.equal(audit.kind, 'wrong_schema');
});

test('pressure/conflict arrays fail validation', () => {
  const validation = explainHistoricalFrameValidation({
    ...buildValidHistoricalFrame(),
    pressure: ['беженцы', 'нехватка припасов'],
    conflict: ['посадники', 'купцы']
  });
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('; '), /pressure.*string.*array/i);
  assert.match(validation.errors.join('; '), /conflict.*string.*array/i);
});

test('mergeHistoricalFrameValidationErrors accumulates without duplicates', () => {
  const merged = mergeHistoricalFrameValidationErrors(
    ['root.pressure: expected string, got array'],
    ['root.conflict: expected string, got array', 'root.pressure: expected string, got array']
  );
  assert.equal(merged.length, 2);
});

test('HistoricalDataShaper prompt includes outputContract with types', async () => {
  let shapePayload = null;
  const mock = mockHistoricalFrameFetch({
    shaper({ userText }) {
      shapePayload = JSON.parse(userText);
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify(buildValidHistoricalFrame()) } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
          };
        }
      };
    }
  });

  try {
    await generateHistoricalFrame({ startText: '1238, Новгород.' });
    assert.ok(shapePayload?.outputContract);
    assert.equal(shapePayload.outputContract.fields.pressure.type, 'string');
    assert.ok(shapePayload.canonicalExample);
    assert.ok(shapePayload.outputContract.disputedFields.pressure);
    assert.equal(shapePayload.outputRules.maxArrayItems, undefined);
  } finally {
    mock.restore();
  }
});

test('repair returns full JSON path and accepts valid repair output', async () => {
  let repairPayload = null;
  const mock = mockHistoricalFrameFetch({
    shaper({ calls }) {
      const attempt = calls.filter((call) => /HistoricalDataShaper/i.test(call.messages?.[0]?.content ?? '')).length;
      if (attempt === 1) {
        const broken = buildValidHistoricalFrame();
        broken.pressure = ['беженцы', 'нехватка припасов'];
        broken.conflict = ['посадники', 'купцы'];
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
            choices: [{ message: { content: JSON.stringify(buildValidHistoricalFrame()) } }],
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
            choices: [{ message: { content: JSON.stringify(buildValidHistoricalFrame()) } }],
            usage: { prompt_tokens: 80, completion_tokens: 400, total_tokens: 480 }
          };
        }
      };
    }
  });

  try {
    const result = await generateHistoricalFrame({ startText: '1238, Новгород.' });
    assert.ok(result.data);
    assert.ok(validateHistoricalFrame(result.data));
    assert.ok(repairPayload);
    assert.ok(Array.isArray(repairPayload.validationErrors));
    assert.ok(repairPayload.validationErrors.length >= 2);
    assert.ok(repairPayload.outputContract);
    assert.ok(repairPayload.previousHistoricalFrame);
  } finally {
    mock.restore();
  }
});

test('accumulated validation errors passed to repair and retry', async () => {
  const seen = { repairErrors: null, retryInstruction: null };
  const mock = mockHistoricalFrameFetch({
    shaper({ userText, calls }) {
      const attempt = calls.filter((call) => /HistoricalDataShaper/i.test(call.messages?.[0]?.content ?? '')).length;
      const payload = JSON.parse(userText);
      if (payload.retryInstruction) seen.retryInstruction = payload.retryInstruction;
      if (attempt === 1) {
        const broken = buildValidHistoricalFrame();
        broken.pressure = ['беженцы'];
        broken.conflict = ['посадники'];
        broken.regionHint = 'сельское поселение';
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
            choices: [{ message: { content: JSON.stringify(buildValidHistoricalFrame()) } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
          };
        }
      };
    },
    repair({ userText }) {
      seen.repairErrors = JSON.parse(userText).validationErrors;
      const stillBroken = buildValidHistoricalFrame();
      stillBroken.pressure = ['still array'];
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
    await generateHistoricalFrame({ startText: '1238, Новгород.' });
    assert.ok(seen.repairErrors?.length >= 2);
    assert.ok(seen.retryInstruction);
    assert.match(seen.retryInstruction, /accumulated validationErrors/i);
    assert.match(seen.retryInstruction, /pressure: string, never array/i);
    for (const rule of buildHistoricalFrameAntiRegressionRules()) {
      assert.match(seen.retryInstruction, new RegExp(rule.split(':')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  } finally {
    mock.restore();
  }
});

test('parse failure skips semantic repair', async () => {
  let repairCalls = 0;
  const mock = mockHistoricalFrameFetch({
    shaper({ calls }) {
      const attempt = calls.filter((call) => /HistoricalDataShaper/i.test(call.messages?.[0]?.content ?? '')).length;
      if (attempt === 1) {
        return {
          ok: true,
          async json() {
            return {
              choices: [{ message: { content: '{"schema":"historical_frame","broken":' } }],
              usage: { prompt_tokens: 100, completion_tokens: 900, total_tokens: 1000 }
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify(buildValidHistoricalFrame()) } }],
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
          return { choices: [{ message: { content: 'repair note only' } }] };
        }
      };
    }
  });

  try {
    const result = await generateHistoricalFrame({ startText: '1238, Новгород.' });
    assert.ok(result.data);
    assert.equal(repairCalls, 0);
  } finally {
    mock.restore();
  }
});
