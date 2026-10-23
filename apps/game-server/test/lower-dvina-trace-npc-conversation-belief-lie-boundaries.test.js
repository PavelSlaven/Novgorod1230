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

function section(system, start, end) {
  const first = system.indexOf(start);
  const last = system.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `missing section: ${start}`);
  return system.slice(first, last);
}

test('NPC past claims admit belief and a lie that hides a known fact', async () => {
  const systems = Object.fromEntries(await Promise.all(
    Object.entries(builders).map(async ([role, build]) =>
      [role, await build(targets[role].user)])));
  const issues = [];
  const obsolete = [
    'A knowingly_false claim instead cites the exact known fact it contradicts.',
    ', or a knowingly_false claim cites in source_knowledge_refs the exact known fact it contradicts.',
    '; for knowingly_false, the known fact must be the one contradicted.'
  ];
  const sources = [
    'knowledge.known_facts', 'memory.recent_events',
    'memory.relevant_long_term_events', 'source_knowledge_refs'
  ];
  for (const [role, system] of Object.entries(systems)) {
    const past = section(system, 'Past first-person activity or observation',
      role === 'auditor' ? 'An empty or missing memory' : 'npc.identity.name_or_label');
    for (const phrase of obsolete) {
      if (system.includes(phrase)) issues.push(`${role}: obsolete past rule: ${phrase}`);
    }
    for (const source of sources) {
      if (!past.includes(source)) issues.push(`${role}: missing past source: ${source}`);
    }
    for (const phrase of ['believed_true', 'knowledge.beliefs',
      'grounds the belief, not objective truth',
      'contradicted by the visible false assertion']) {
      if (!past.includes(phrase)) issues.push(`${role}: missing belief or lie condition: ${phrase}`);
    }
    if (!past.includes('same past assertion')) {
      issues.push(`${role}: cited fact or event no longer checks the same past assertion`);
    }
    if (!system.includes('npc.current_activity')
      || !system.includes('memory.current_observations')
      || !system.includes('A cited message proves only what was said')) {
      issues.push(`${role}: a current or reported observation protection is missing`);
    }
    if (role === 'auditor') {
      for (const phrase of [
        'npc.current_activity describes only requested_at; it never proves earlier or future work, place, observation, or experience.',
        'An empty or missing memory never proves a negative past observation',
        'A record of speech proves only what was said',
        'memory.current_observations grounds only its exact present fact_text'
      ]) {
        if (!system.includes(phrase)) issues.push(`${role}: missing protection: ${phrase}`);
      }
    } else {
      for (const phrase of [
        'It never proves where the NPC was, what the NPC did, or what the NPC saw at an earlier time.',
        'never proves an earlier observation',
        'never invent a negative observation from it',
        'received or public-history message proves only'
      ]) {
        if (!system.includes(phrase)) issues.push(`${role}: missing protection: ${phrase}`);
      }
    }
  }
  const mandatory = section(systems.auditor, 'Mandatory failure: reject a first-person',
    'A cited known fact or event');
  for (const phrase of [
    'knowledge.known_facts', 'memory.recent_events', 'memory.relevant_long_term_events',
    'a believed_true claim cites in source_knowledge_refs the exact knowledge.beliefs entry',
    'the exact known fact contradicted by its visible false assertion'
  ]) {
    if (!mandatory.includes(phrase)) issues.push(`auditor mandatory failure omits ${phrase}`);
  }
  const cited = section(systems.auditor, 'A cited known fact or event',
    'Saying that the NPC does not remember');
  for (const phrase of [
    'a cited belief must state the same belief about that past',
    'the one contradicted by the visible false assertion',
    'record of speech proves only what was said'
  ]) {
    if (!cited.includes(phrase)) issues.push(`auditor citation rule omits ${phrase}`);
  }
  for (const system of Object.values(systems)) {
    for (const sentence of system.split(/[.!?]\s+/u)) {
      assert.equal(/knowingly_false/u.test(sentence)
        && /\bor (?:hides|hidden)\b/u.test(sentence), false, sentence);
    }
    assert.match(system, /speaker_posture withheld[^\n]*without a false assertion/u);
    assert.match(system, /source_knowledge_refs cite the exact known fact concealed/u);
  }
  assert.deepEqual(issues, [], 'past belief and concealed known fact have consistent support');
});
