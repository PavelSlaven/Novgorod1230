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

async function systems() {
  return Object.fromEntries(await Promise.all(Object.entries(builders)
    .map(async ([role, build]) => [role, await build(targets[role].user)])));
}

function section(system, start, end) {
  const first = system.indexOf(start);
  const last = system.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `missing section: ${start}`);
  return system.slice(first, last);
}

function past(system, role) {
  return section(system, 'Past first-person activity or observation',
    role === 'auditor' ? 'An empty or missing memory' : 'npc.identity.name_or_label');
}

const pRoles = ['responder', 'semantic_repair', 'format_repair'];
const allRoles = [...pRoles, 'auditor'];
const occurrences = (system, fragment) => system.split(fragment).length - 1;

test('P1: absent evidence permits not remembering, never a negative past',
  async () => {
    const captured = await systems();
    const issues = [];
    for (const role of pRoles) {
      const rule = past(captured[role], role);
      for (const fragment of [
        'no known fact, belief, memory event, observation, or perceived message in the request answers the asked past',
        'say in the speaker\'s own words that they do not remember or know it',
        'never turn that absence into a negative assertion about the speaker\'s past'
      ]) {
        if (!rule.includes(fragment)) issues.push(`${role}: missing ${fragment}`);
      }
    }
    if (!captured.auditor.includes(
      'passes as genuine uncertainty only if no known fact, belief, memory event, observation, or perceived message in the request answers it')) {
      issues.push('auditor: missing conditional uncertainty');
    }
    if (!captured.auditor.includes('An empty or missing memory never proves a negative past observation')) {
      issues.push('auditor: missing negative-past guard');
    }
    assert.deepEqual(issues, []);
  });

test('P2: a habit or craft does not establish a timed event or current act',
  async () => {
    const captured = await systems();
    const issues = [];
    for (const role of allRoles) {
      const rule = past(captured[role], role);
      for (const fragment of ['habit', 'craft', 'usual practice',
        'an activity now', 'an event at a particular past time']) {
        if (!rule.includes(fragment)) issues.push(`${role}: missing ${fragment}`);
      }
    }
    if (!captured.auditor.includes('at its stated time rather than only a habit')) {
      issues.push('auditor: mandatory failure accepts a habit as a timed event');
    }
    assert.deepEqual(issues, []);
  });

test('P3: a cited belief must itself describe the asserted past', async () => {
  const captured = await systems();
  const issues = [];
  for (const role of allRoles) {
    const rule = past(captured[role], role);
    for (const fragment of [
      'The cited belief itself must describe the asserted past',
      'an intention, belief about the future, or general stance does not support it'
    ]) {
      if (!rule.includes(fragment)) issues.push(`${role}: missing ${fragment}`);
    }
  }
  if (!captured.auditor.includes(
    'itself describing that past rather than an intention or general stance')) {
    issues.push('auditor: mandatory failure accepts a future intention');
  }
  assert.deepEqual(issues, []);
});

test('P4: the auditor intro directs first-person past to cited records',
  async () => {
    const captured = await systems();
    const intro = section(captured.auditor, 'Audit the supplied NPC speech plan',
      'A factual assertion states something');
    assert.match(intro, /matching exact request evidence/u);
    assert.match(intro,
      /For first-person past assertions, the matching record must be cited in source_knowledge_refs and satisfy the past rule below/u);
    assert.match(intro, /mere presence elsewhere in the request is insufficient/u);
  });

test('P5: current observations support the same meaning across roles',
  async () => {
    const captured = await systems();
    const issues = [];
    for (const role of pRoles) {
      if (!captured[role].includes('A claim needs the same meaning as the cited fact_text')) {
        issues.push(`${role}: present observation does not require the same meaning`);
      }
    }
    if (!captured.semantic_repair.includes(
      'A current_observation permits only a claim with the same meaning as its fact_text')) {
      issues.push('semantic_repair: repair observation rule differs');
    }
    for (const fragment of [
      'memory.current_observations grounds only its exact present fact_text when a claim has the same meaning, not necessarily the same words',
      'current-observation citation supports only its exact fact_text when the claim has the same meaning, not necessarily the same words'
    ]) {
      if (!captured.auditor.includes(fragment)) issues.push(`auditor: missing ${fragment}`);
    }
    const auditObservation = captured.auditor.slice(
      captured.auditor.indexOf('Mandatory failure: a current-observation'));
    if (auditObservation.includes('nearby')) {
      issues.push('auditor: nearby remains a forbidden observation word');
    }
    assert.deepEqual(issues, []);
  });

test('C27 and C28 past sources and protections remain available', async () => {
  const captured = await systems();
  const issues = [];
  for (const role of allRoles) {
    const rule = past(captured[role], role);
    for (const fragment of [
      'knowledge.known_facts', 'memory.recent_events',
      'memory.relevant_long_term_events', 'source_knowledge_refs',
      'believed_true', 'knowledge.beliefs',
      'grounds the belief, not objective truth', 'contradicts or hides',
      'same past assertion', 'denial'
    ]) {
      if (!rule.includes(fragment)) issues.push(`${role}: missing ${fragment}`);
    }
    for (const fragment of ['npc.current_activity', 'memory.current_observations',
      'A cited message proves only what was said']) {
      if (!captured[role].includes(fragment)) issues.push(`${role}: missing ${fragment}`);
    }
  }
  if (!captured.auditor.includes('An empty or missing memory never proves a negative past observation')) {
    issues.push('auditor: missing empty-memory guard');
  }
  for (const role of pRoles) {
    if (!captured[role].includes('never invent a negative observation from it')) {
      issues.push(`${role}: missing negative-observation guard`);
    }
  }
  assert.deepEqual(issues, []);
});

test('each new sentence appears only in its intended role', async () => {
  const captured = await systems();
  const expected = [
    { roles: allRoles,
      sentence: 'A known fact about a habit, craft, or usual practice supports only that usual practice, not an activity now or an event at a particular past time.' },
    { roles: allRoles,
      sentence: 'The cited belief itself must describe the asserted past; an intention, belief about the future, or general stance does not support it.' },
    { roles: pRoles,
      sentence: 'If no known fact, belief, memory event, observation, or perceived message in the request answers the asked past, say in the speaker\'s own words that they do not remember or know it; never turn that absence into a negative assertion about the speaker\'s past.' },
    { roles: ['auditor'],
      sentence: 'For first-person past assertions, the matching record must be cited in source_knowledge_refs and satisfy the past rule below; its mere presence elsewhere in the request is insufficient.' },
    { roles: ['semantic_repair'],
      sentence: 'A current_observation permits only a claim with the same meaning as its fact_text, cited by its exact source ref.' },
    { roles: pRoles,
      sentence: 'memory.current_observations contains present facts directly perceptible to this co-located NPC.' },
    { roles: pRoles,
      sentence: 'A claim needs the same meaning as the cited fact_text and the exact observation_ref in speech.claims.source_knowledge_refs.' },
    { roles: pRoles,
      sentence: 'It never proves an earlier observation, memory, cause, continuation, hidden fact, merely possible condition, unseen object, required next action, or broader conclusion.' },
    { roles: ['auditor'],
      sentence: 'memory.current_observations grounds only its exact present fact_text when a claim has the same meaning, not necessarily the same words, and the matching observation_ref is cited in source_knowledge_refs; it proves no past observation, cause, or hidden fact.' },
    { roles: ['auditor'],
      sentence: 'Mandatory failure: a current-observation citation supports only its exact fact_text when the claim has the same meaning, not necessarily the same words; reject a merely possible condition, unseen object, explanation, required next action, or broader conclusion.' },
    { roles: ['auditor'],
      sentence: 'Mandatory failure: reject a first-person assertion that the NPC saw, did, or experienced something earlier, or that it did not, unless a knowledge.known_facts entry or event from memory.recent_events or memory.relevant_long_term_events is cited in source_knowledge_refs and supports the same past assertion at its stated time rather than only a habit, a believed_true claim cites in source_knowledge_refs the exact knowledge.beliefs entry stating the same belief about that past and itself describing that past rather than an intention or general stance, or a knowingly_false claim cites in source_knowledge_refs the exact known fact it contradicts or hides.' }
  ];
  const issues = [];
  for (const { roles, sentence } of expected) {
    for (const role of allRoles) {
      const want = roles.includes(role) ? 1 : 0;
      const got = occurrences(captured[role], sentence);
      if (got !== want) issues.push(`${role}: expected ${want}, got ${got}: ${sentence}`);
    }
  }
  assert.deepEqual(issues, []);
});

test('no system repeats a sentence of at least 40 characters', async () => {
  const captured = await systems();
  const repeated = [];
  for (const [role, system] of Object.entries(captured)) {
    const counts = new Map();
    for (const sentence of system.split('. ').map(s => s.trim()).filter(
      s => s.length >= 40)) {
      counts.set(sentence, (counts.get(sentence) ?? 0) + 1);
    }
    for (const [sentence, count] of counts) {
      if (count > 1) repeated.push(`${role}: ${count} × ${sentence}`);
    }
  }
  assert.deepEqual(repeated, []);
});
