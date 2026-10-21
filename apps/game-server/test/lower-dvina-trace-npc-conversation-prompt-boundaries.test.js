import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { auditFreshNpcSpeech } from
  '../src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js';
import { CLAIM_KINDS_RULE, FACTUAL_ASSERTION_RULE } from
  '../src/runtime/lower-dvina-trace-phase-2-conversation-prompt-contract.js';

const targets = JSON.parse(await readFile(new URL(
  './fixtures/npc-conversation-target-prompts.json', import.meta.url), 'utf8'));

test('auditor checks future action against an operation, not an earlier promise',
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
      /\bfuture physical or code-owned action\b[\s\S]{0,100}\bsupporting operation\b/iu);
    assert.match(own, /\b(?:earlier|prior|remembered)\b[\s\S]{0,100}\bpromise\b/iu);
  });
