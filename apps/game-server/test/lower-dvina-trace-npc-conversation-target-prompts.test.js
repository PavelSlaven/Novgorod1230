import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateClaim } from
  '../../../packages/npc-runtime/src/conversation-contribution-contract.js';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { auditFreshNpcSpeech } from
  '../src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js';
import { CLAIM_KINDS_RULE, FACTUAL_ASSERTION_RULE } from
  '../src/runtime/lower-dvina-trace-phase-2-conversation-prompt-contract.js';

const targets = JSON.parse(await readFile(new URL(
  './fixtures/npc-conversation-target-prompts.json', import.meta.url), 'utf8'));

const wire = (system, userText) => (/json/iu.test(system)
  || /json/iu.test(userText) ? system : `Return a valid json object.\n\n${system}`);

async function capture(run) {
  const calls = [];
  const roleRunner = {
    async run(call) {
      calls.push(call);
      return { output: { pass: true, concerns: [] } };
    }
  };
  try {
    await run(roleRunner);
  } catch {
    // only the captured model call matters here
  }
  assert.equal(calls.length, 1);
  const [system, user] = calls[0].messages;
  return wire(system.content, user.content);
}

const npcModel = (roleRunner) => createLowerDvinaTraceNpcSemanticModel({
  roleRunner
});

const builders = {
  responder: (user) => capture((roleRunner) => npcModel(roleRunner)(user)),
  auditor: (user) => capture((roleRunner) => auditFreshNpcSpeech({
    roleRunner, plan: user.plan, request: user.request
  })),
  semantic_repair: (user) => capture((roleRunner) => npcModel(roleRunner)(
    user.request, { repair: {
      kind: 'semantic', original_output: user.original_output,
      validation_errors: user.validation_errors
    } })),
  format_repair: (user) => capture((roleRunner) => npcModel(roleRunner)(
    user.request, { repair: {
      kind: 'format', original_output: user.original_output,
      validation_errors: user.validation_errors
    } }))
};

for (const [name, build] of Object.entries(builders)) {
  test(`production ${name} system prompt equals the approved target`,
    async () => {
      const target = targets[name];
      const produced = await build(target.user);
      assert.equal(produced, wire(target.system, JSON.stringify(target.user)));
    });
}

const occurrences = (text, part) => text.split(part).length - 1;

test('one complete claim-kind rule reaches every NPC speech system prompt',
  async () => {
    for (const [name, build] of Object.entries(builders)) {
      const produced = await build(targets[name].user);
      assert.equal(occurrences(produced, CLAIM_KINDS_RULE), 1, name);
    }
  });

test('the claim-kind rule marks genuine uncertainty separately', () => {
  assert.match(CLAIM_KINDS_RULE, /\buncertain\b/iu);
  assert.match(CLAIM_KINDS_RULE,
    /\b(?:unknown|not know|does not know|lack of knowledge)\b/iu);
});

test('the claim-kind rule marks withheld knowledge of a secret', () => {
  assert.match(CLAIM_KINDS_RULE, /\bwithheld\b/iu);
  assert.match(CLAIM_KINDS_RULE, /\bsecret\b/iu);
  assert.match(CLAIM_KINDS_RULE, /\bknown\b/iu);
});

test('the claim-kind rule requires exact source references', () => {
  assert.match(CLAIM_KINDS_RULE, /\bsource_knowledge_refs\b/iu);
  assert.match(CLAIM_KINDS_RULE, /\bexact\b/iu);
  assert.match(CLAIM_KINDS_RULE, /\bknown fact\b/iu);
});

test('semantic repair calls for a visible change to rejected speech',
  async () => {
    const system = await builders.semantic_repair(targets.semantic_repair.user);
    const repairRule = system.split('Return only one plain JSON object')[0];
    assert.match(repairRule, /\b(?:unsupported|rejected)\b/iu);
    assert.match(repairRule, /\b(?:utterance_text|visible|spoken)\b/iu);
    assert.match(repairRule, /\b(?:change|remove|replace|rewrite)\b/iu);
  });

test('semantic repair separates missing knowledge from a withheld known fact',
  async () => {
    const system = await builders.semantic_repair(targets.semantic_repair.user);
    const repairRule = system.split('Return only one plain JSON object')[0];
    assert.match(repairRule, /\b(?:known_facts|known fact)\b/iu);
    assert.match(repairRule, /\b(?:not know|unknown|uncertain|doubt)\b/iu);
    assert.match(repairRule, /\b(?:withhold|withheld|conceal|hide)\b/iu);
  });

async function auditorSpecificSystem() {
  const system = await builders.auditor(targets.auditor.user);
  return system.replace(FACTUAL_ASSERTION_RULE, '')
    .replace(CLAIM_KINDS_RULE, '');
}

test('the auditor checks facts embedded in ignorance and invitations',
  async () => {
    const system = await auditorSpecificSystem();
    assert.match(system, /\b(?:not know|does not know|ignorance)\b/iu);
    assert.match(system, /\b(?:inside|embedded|within)\b/iu);
    assert.match(system, /\b(?:invite|invitation|offer)\b/iu);
  });

test('the auditor judges visible speech instead of a hidden claim summary',
  async () => {
    const system = await auditorSpecificSystem();
    assert.match(system, /\butterance_text\b/iu);
    assert.match(system, /\bcontent_summary\b/iu);
    assert.match(system, /\b(?:visible|spoken|heard)\b/iu);
  });

test('the auditor compares cited memory content with the utterance',
  async () => {
    const system = await auditorSpecificSystem();
    assert.match(system, /\bmemory\.recent_events\b/iu);
    assert.match(system,
      /(?:memory\.recent_events[\s\S]{0,220}utterance_text|utterance_text[\s\S]{0,220}memory\.recent_events)/iu);
  });

test('the name authority rule is stated once and the old tail is gone',
  async () => {
    for (const name of ['responder', 'semantic_repair', 'format_repair']) {
      const produced = await builders[name](targets[name].user);
      assert.equal(produced.includes('Never use that name without this field.'),
        false, name);
      assert.equal(occurrences(produced,
        'name_or_label is the only authority for the speaker own name'), 1,
      name);
      assert.equal(produced.includes('canonical_name'), false, name);
    }
    const auditor = await builders.auditor(targets.auditor.user);
    assert.equal(auditor.includes('may pass without a claim'), false);
  });

function balancedObject(text, start) {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error('unbalanced shape');
}

test('the claim skeleton in the responder prompt satisfies the claim contract',
  async () => {
    const produced = await builders.responder(targets.responder.user);
    const marker = 'never emitted literally:\n';
    assert.notEqual(produced.indexOf(marker), -1);
    const shape = JSON.parse(balancedObject(produced,
      produced.indexOf(marker) + marker.length));
    const [skeleton] = shape.speech.claims;
    const known = targets.responder.user.knowledge.known_facts[0];
    const source = known?.fact_ref ?? { entity_kind: 'npc_identity',
      entity_id: targets.responder.user.npc_ref.entity_id };
    const claim = JSON.parse(JSON.stringify(skeleton)
      .replaceAll('<new short id>', 'claim-1')
      .replaceAll('<the asserted fact in Russian>', 'Факт.')
      .replaceAll('<believed_true, knowingly_false, mixed, uncertain, or withheld>',
        'believed_true'));
    for (const key of ['source_knowledge_refs', 'mentioned_entity_refs']) {
      claim[key] = [{ entity_kind: source.entity_kind,
        entity_id: source.entity_id }];
    }
    assert.equal(validateClaim(claim), true);
    assert.deepEqual(Object.keys(skeleton).sort(), [
      'claim_id', 'content_summary', 'form', 'mentioned_entity_refs',
      'source_knowledge_refs', 'speaker_posture'
    ]);
  });

function presentationRequest(socialContext) {
  return {
    npc: { identity: { name_or_label: 'Еремей' } },
    social_context: socialContext,
    allowed_references: { knowledge_refs: [] }
  };
}

function introduction(text) {
  return { contribution_kind: 'speech', speech: { utterance_text: text,
    interaction_tags: [], claims: [] } };
}

test('first-contact duty reads the name from form A identity', async () => {
  const request = presentationRequest({ first_contact_introduction: {} });
  const model = npcModel({ async run() { return { output: {} }; } });

  const missing = await model.validateFreshPlan(
    introduction('Здравствуй.'), request);
  assert.deepEqual(missing.errors.flatMap(({ concern_kinds: kinds }) => kinds),
    ['first_contact_introduction_missing']);

  const noRoleRunnerCalls = [];
  const passing = createLowerDvinaTraceNpcSemanticModel({
    roleRunner: { async run(call) {
      noRoleRunnerCalls.push(call);
      return { output: { pass: true, concerns: [] } };
    } }
  });
  const result = await passing.validateFreshPlan(
    introduction('Я Еремей, здешний.'), request);
  assert.equal(result, true);
  assert.equal(noRoleRunnerCalls.length, 1);
});

test('without the first-contact marker no name is required', async () => {
  const request = presentationRequest({});
  const calls = [];
  const model = npcModel({ async run(call) {
    calls.push(call);
    return { output: { pass: true, concerns: [] } };
  } });

  const result = await model.validateFreshPlan(
    introduction('Здравствуй.'), request);
  assert.equal(result, true);
  assert.equal(calls.length, 1);
});

test('the grounding auditor passes path and quote to the repair errors',
  async () => {
    const request = presentationRequest({});
    const concern = { kind: 'unsupported_past_observation',
      path: '$.speech.utterance_text', quote: 'тридцать лет тут живу' };
    const model = npcModel({ async run() {
      return { output: { pass: false, concerns: [concern] } };
    } });

    const result = await model.validateFreshPlan(
      introduction('Тридцать лет тут живу.'), request);

    assert.equal(result.pass, false);
    assert.equal(result.errors.length, 1);
    assert.deepEqual(result.errors[0].concern_kinds, [concern.kind]);
    assert.equal(result.errors[0].path, concern.path);
    assert.equal(result.errors[0].quote, concern.quote);
    assert.equal(result.errors[0].category, 'semantic_grounding');
  });
