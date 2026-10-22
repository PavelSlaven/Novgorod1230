import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { auditFreshNpcSpeech } from
  '../src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js';
import { CLAIM_KINDS_RULE, FACTUAL_ASSERTION_RULE } from
  '../src/runtime/lower-dvina-trace-phase-2-conversation-prompt-contract.js';

const targets = JSON.parse(await readFile(new URL(
  './fixtures/npc-conversation-target-prompts.json', import.meta.url), 'utf8'));

test('auditor treats future commitments as speech and audits factual assertions',
  async () => {
    let system;
    await auditFreshNpcSpeech({
      roleRunner: { async run(call) {
        system = call.messages[0].content;
        return { output: { pass: true, concerns: [] } };
      } },
      plan: targets.auditor.user.plan,
      request: targets.auditor.user.request
    });
    assert.equal(typeof system, 'string');
    const own = system.replace(FACTUAL_ASSERTION_RULE, '')
      .replace(CLAIM_KINDS_RULE, '');
    assert.match(own,
      /A spoken offer, acceptance of a request for future action, promise, or statement of future intention is a statement event/u);
    assert.match(own,
      /The absence of a supporting operation is not a reason to reject that speech/u);
    assert.match(own,
      /Factual premises within such speech need claims and the ordinary audit/u);
    assert.match(own,
      /An already completed or current action assertion needs exact request evidence and audit/u);
    assert.match(own,
      /A selected operation is checked against its contract by the action owner/u);
    assert.match(own,
      /A route-specific offer to guide asserts route knowledge\./u);
    assert.match(own,
      /Route guidance, including such an offer, needs the matching exact supplied disclose_known_route operation and refs\./u);
    assert.doesNotMatch(system,
      /Reject an offer or promise of a future physical or code-owned action without its exact permitted supporting operation/u);
  });
