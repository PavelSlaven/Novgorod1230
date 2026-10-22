import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { auditFreshNpcSpeech } from
  '../src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js';
import { CLAIM_KINDS_RULE, FACTUAL_ASSERTION_RULE } from
  '../src/runtime/lower-dvina-trace-phase-2-conversation-prompt-contract.js';

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

function semanticRepairUser(intentOpen) {
  const source = targets.semantic_repair.user;
  const quote = source.original_output?.interpretation?.intent;
  assert.equal(typeof quote, 'string');
  return {
    ...source,
    validation_errors: [
      ...source.validation_errors,
      ...(intentOpen ? [{
        code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
        category: 'semantic_grounding',
        retryable: true,
        concern_kinds: ['unsupported_intent'],
        path: '$.interpretation.intent',
        quote,
        message: 'Rewrite the complete response without unsupported factual assertions.'
      }] : [])
    ]
  };
}

function npcSystem(request, kind = null, user = null) {
  return captureSystem(roleRunner => {
    const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner });
    return kind === null ? model(request) : model(request, { repair: {
      kind,
      original_output: user.original_output,
      validation_errors: user.validation_errors
    } });
  });
}

const request = targets.responder.user;
const systems = {
  responder: await npcSystem(request),
  semantic_closed: await npcSystem(request, 'semantic', semanticRepairUser(false)),
  semantic_open: await npcSystem(request, 'semantic', semanticRepairUser(true)),
  format: await npcSystem(request, 'format', targets.format_repair.user),
  auditor: await captureSystem(roleRunner => auditFreshNpcSpeech({
    roleRunner,
    plan: targets.auditor.user.plan,
    request: targets.auditor.user.request
  }))
};

function parts(text) {
  return text.replace(/\s+/gu, ' ').split(/[.!?;]\s+/u);
}

function namesCompletedOrCurrentAction(part) {
  return /\baction\b/iu.test(part)
    && /\b(?:already\s+(?:done|completed|happened)|completed|current|happening\s+now|ongoing)\b/iu.test(part)
    && /\b(?:assertion|claim|statements?)\b/iu.test(part);
}

function negatesSupport(part) {
  return /\b(?:needs?\s+no|does\s+not\s+need|need\s+not|not.{0,24}requir|without.{0,24}(?:claim|evidence|audit|check))\b/iu.test(part);
}

function supportingPart(text, requirement) {
  return parts(text).find(part => namesCompletedOrCurrentAction(part)
    && requirement(part) && !negatesSupport(part)) ?? null;
}

function auditorOwn(full) {
  assert.equal(full.includes(FACTUAL_ASSERTION_RULE), true);
  assert.equal(full.includes(CLAIM_KINDS_RULE), true);
  return full.replace(FACTUAL_ASSERTION_RULE, '')
    .replace(CLAIM_KINDS_RULE, '');
}

test('current action in the shared factual rule requires its own claim', () => {
  const clause = supportingPart(FACTUAL_ASSERTION_RULE, part =>
    /\b(?:needs?|requires?)\b.{0,90}\b(?:its\s+own|a\s+separate|separate|own)\s+claim\b/iu.test(part));
  assert.ok(clause, 'FACTUAL_ASSERTION_RULE must require its own claim for an assertion of completed or current action');
});

test('auditor own system requires exact evidence and audit for completed or current action', () => {
  const own = auditorOwn(systems.auditor);
  const clause = supportingPart(own, part =>
    /\b(?:needs?|requires?)\b.{0,100}\b(?:exact|matching)\b.{0,100}\bevidence\b/iu.test(part)
    && /\b(?:audit|check)\b/iu.test(part));
  assert.ok(clause, 'auditor own system must require exact request evidence and audit for an assertion of completed or current action');
});

test('responder and semantic repairs require exact evidence for completed or current action', () => {
  for (const name of ['responder', 'semantic_closed', 'semantic_open']) {
    const clause = supportingPart(systems[name], part =>
      /\b(?:needs?|requires?)\b.{0,100}\bexact\s+evidence\b/iu.test(part));
    assert.ok(clause, `${name} must require exact evidence for an assertion of completed or current action`);
  }
  if (parts(systems.format).some(namesCompletedOrCurrentAction)) {
    const clause = supportingPart(systems.format, part =>
      /\b(?:needs?|requires?)\b.{0,100}\bexact\s+evidence\b/iu.test(part));
    assert.ok(clause, 'format repair must require exact evidence for an assertion of completed or current action');
  }
});

test('no shared or captured role rule licenses unsupported completed or current action', () => {
  for (const [name, system] of Object.entries({
    factual_rule: FACTUAL_ASSERTION_RULE,
    auditor_own: auditorOwn(systems.auditor),
    responder: systems.responder,
    semantic_closed: systems.semantic_closed,
    semantic_open: systems.semantic_open,
    format: systems.format
  })) {
    const contrary = parts(system).find(part =>
      namesCompletedOrCurrentAction(part) && negatesSupport(part));
    assert.equal(contrary, undefined,
      `${name} must not permit an assertion of completed or current action without its own support`);
  }
});
