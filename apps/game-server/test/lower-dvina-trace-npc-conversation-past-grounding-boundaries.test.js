import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { auditFreshNpcSpeech } from
  '../src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js';

const targets = JSON.parse(await readFile(new URL(
  './fixtures/npc-conversation-target-prompts.json', import.meta.url), 'utf8'));

async function captureSystem(run) {
  const calls = [];
  const roleRunner = { async run(call) {
    calls.push(call);
    return { output: { pass: true, concerns: [] } };
  } };
  try {
    await run(roleRunner);
  } catch (error) {
    if (calls.length === 0) throw error;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].messages[0].role, 'system');
  return calls[0].messages[0].content;
}

const model = roleRunner => createLowerDvinaTraceNpcSemanticModel({ roleRunner });
const builders = {
  responder: user => captureSystem(roleRunner => model(roleRunner)(user)),
  semantic_repair: user => captureSystem(roleRunner => model(roleRunner)(
    user.request, { repair: {
      kind: 'semantic', original_output: user.original_output,
      validation_errors: user.validation_errors
    } })),
  format_repair: user => captureSystem(roleRunner => model(roleRunner)(
    user.request, { repair: {
      kind: 'format', original_output: user.original_output,
      validation_errors: user.validation_errors
    } })),
  auditor: user => captureSystem(roleRunner => auditFreshNpcSpeech({
    roleRunner, plan: user.plan, request: user.request
  }))
};

const oldRestrictions = [
  'memory.recent_events is what the speaker heard',
  'requires an exact memory.recent_events entry',
  'needs an exact memory record',
  'Mandatory failure: when memory.recent_events has no exact supporting event',
  'A cited memory.recent_events entry must support'
];
const requiredPastSources = [
  'knowledge.known_facts',
  'memory.recent_events',
  'memory.relevant_long_term_events',
  'source_knowledge_refs',
  'knowingly_false'
];

function section(system, start, end) {
  const first = system.indexOf(start);
  const last = system.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, 'past-grounding section is present');
  return system.slice(first, last);
}

test('NPC conversation roles ground first-person past in known facts or memory events',
  async () => {
    const systems = Object.fromEntries(await Promise.all(
      Object.entries(builders).map(async ([role, build]) =>
        [role, await build(targets[role].user)])));
    const issues = [];
    for (const [role, system] of Object.entries(systems)) {
      for (const old of oldRestrictions) {
        if (system.includes(old)) issues.push(role + ': obsolete restriction: ' + old);
      }
      const pastRule = section(system, 'Past first-person activity or observation',
        role === 'auditor' ? 'An empty or missing memory' : 'npc.identity.name_or_label');
      for (const source of requiredPastSources) {
        if (!pastRule.includes(source)) issues.push(role + ': missing past source: ' + source);
      }
      if (!/same past (?:event|assertion)/u.test(pastRule)) {
        issues.push(role + ': missing same-past-event condition');
      }
      if (!pastRule.includes('denial')) {
        issues.push(role + ': missing negative-past condition');
      }
      if (role !== 'auditor') {
        const memoryRule = section(system, 'memory.recent_events',
          'memory.current_observations');
        if (!memoryRule.includes('memory.relevant_long_term_events')) {
          issues.push(role + ': long-term memory absent from memory-field rule');
        }
      }
    }
    const auditFailure = section(systems.auditor, 'Mandatory failure:',
      'Saying that the NPC does not remember');
    for (const source of requiredPastSources) {
      if (!auditFailure.includes(source)) {
        issues.push('auditor: mandatory failure omits ' + source);
      }
    }
    assert.deepEqual(issues, [], 'first-person past is restricted to recent memory');
    for (const [role, system] of Object.entries(systems)) {
      assert.match(system, /cited message proves only what was said/u, role);
      assert.match(system, /npc\.current_activity/u, role);
      assert.match(system, /memory\.current_observations/u, role);
      if (role === 'auditor') {
        assert.ok(system.includes('npc.current_activity describes only requested_at; it never proves earlier or future work, place, observation, or experience.'), role);
        assert.match(system, /empty or missing memory never proves a negative past observation/iu);
        assert.match(system, /record of speech proves only what was said/u);
        assert.match(system, /current-observation citation supports only its exact fact_text/u);
      } else {
        assert.ok(system.includes('It never proves where the NPC was, what the NPC did, or what the NPC saw at an earlier time.'), role);
        assert.match(system, /Missing or empty memory is not evidence/u);
        assert.match(system, /never invent a negative observation from it/u);
        assert.match(system, /never proves an earlier observation/u);
        assert.match(system, /received or public-history message proves only/u);
      }
    }
  });
