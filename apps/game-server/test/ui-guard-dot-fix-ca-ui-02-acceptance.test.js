import assert from 'node:assert/strict';
import test from 'node:test';
import { findUnsafePlayerText } from '../src/public-boundary.js';
import { successEnvelope } from '../src/http/contracts.js';

// D102: authored on 7cd3c93c before the CA-UI-02 production fix; pin this file.
test('CA-UI-02: data-status tokens respect Unicode word boundaries at publication', async (t) => {
  for (const status of ['typed_gap', 'not_started']) {
    for (const prose of [`слово${status}слово`, `слово${status}`, `${status}слово`]) {
      await t.test(`detector accepts embedded token: ${prose}`, () => {
        assert.equal(findUnsafePlayerText(prose), null);
        assert.equal(findUnsafePlayerText(prose, { generatedProse: true }), null);
      });
      await t.test(`public envelope preserves embedded token: ${prose}`, () => {
        assert.equal(successEnvelope({ main_prose: prose }).data.main_prose, prose);
      });
    }
    for (const prose of [status, `«${status}»`, `"${status}"`, `(${status}),`]) {
      await t.test(`standalone service status remains blocked: ${prose}`, () => {
        // Overlapping marker families may report different categories.
        assert.ok(findUnsafePlayerText(prose));
        assert.ok(findUnsafePlayerText(prose, { generatedProse: true }));
        assert.throws(() => successEnvelope({ main_prose: prose }), {
          code: 'PUBLIC_PAYLOAD_SERVICE_TEXT'
        });
      });
    }
  }
});
