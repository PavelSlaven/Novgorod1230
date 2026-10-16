import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateConversationContributionPlan } from '@rus/npc-runtime';
import { buildProviderRequestPayload } from
  '../../../packages/llm-runtime/src/provider-request.js';
import { allowedNpcContributionReferences } from
  '../src/runtime/lower-dvina-trace-m2-conversation-projections.js';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-conversation-llm.js';

const fixtures = new URL('./fixtures/fixc2-05-npc-reference-provenance/',
  import.meta.url);
const expectedDigests = new Map([
  ['real-wire-126.json',
    '21795a8f8088cfb1b23572a4450a012fe27707af3f283eda603bfe675b739d8a'],
  ['real-wire-127.json',
    'ef321964e49b048a962546300d7ad51782d2b173219c008a2aca1381d1931bd1']
]);

function readWire(name) {
  const bytes = readFileSync(new URL(name, fixtures));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    expectedDigests.get(name));
  const wire = JSON.parse(bytes);
  const payload = JSON.parse(wire.request.messages.find(({ role }) =>
    role === 'user').content);
  const providerResponse = JSON.parse(wire.response);
  return { wire, user: payload.request ?? payload, payload,
    output: JSON.parse(
    providerResponse.choices[0].message.content) };
}

function requestWithProjectedReferences(user) {
  const request = structuredClone(user);
  delete request.world_knowledge;
  const npc = request.npc;
  request.allowed_references = allowedNpcContributionReferences({
    targetRef: request.npc_ref,
    targetActor: {
      instance_id: npc.instance_id,
      identity_state: npc.identity_state,
      machine_state: npc.machine_state,
      knowledge_profile_snapshot: {
        profile_id: request.allowed_references.knowledge_refs.find(
          ({ entity_kind }) => entity_kind === 'knowledge_scope')?.entity_id
      }
    },
    conversationActorRefs: request.allowed_references.actor_refs,
    npcContributionReferencePolicy: request.allowed_references
  }, {
    entityRefs: request.allowed_references.entity_refs,
    knowledgeRefs: request.allowed_references.knowledge_refs
  });
  return request;
}

test('real NPC conversation wires resolve claims only to projected own refs',
  async () => {
    for (const name of expectedDigests.keys()) {
      const { wire, user, payload, output } = readWire(name);
      const request = requestWithProjectedReferences(user);
      const capturedGroundedRequest = structuredClone(user);
      const calls = [];
      const model = createLowerDvinaTraceNpcSemanticModel({
        roleRunner: { async run(call) {
          calls.push(structuredClone(call));
          return { output };
        } },
        worldKnowledgeGrounder: { async ground(currentRequest) {
          return { ...capturedGroundedRequest,
            allowed_references: currentRequest.allowed_references };
        } }
      });
      const { request: preparedRequest } = await model.prepareRequest(request);
      const repair = payload.request == null ? null : {
        original_output: payload.original_output,
        validation_errors: payload.validation_errors
      };
      const plan = await model(preparedRequest, { repair });

      assert.equal(validateConversationContributionPlan(plan, preparedRequest),
        true, `${name}: captured claims should resolve against projected refs`);
      assert.equal(calls.length, 1);
      const capturedSystem = wire.request.messages.find(({ role }) =>
        role === 'system').content;
      const expectedSystem = repair == null ? capturedSystem : capturedSystem.replace(
        'preserve the response meaning.',
        'при ошибке `utterance_mixed_script` исправить написание слова, названного в ошибке `utterance_mixed_script` (поле `word`), заменив буквы так, чтобы слово стало русским; остальные слова и их порядок, смысл, refs, enum values и operations не менять, новых фактов не добавлять.');
      assert.equal(calls[0].messages[0].content, expectedSystem,
        `${name}: only the required repair instruction changes`);
      assert.deepEqual(calls[0].overrides,
        { temperature: wire.request.temperature,
          maxTokens: wire.request.max_tokens });
      const providerConfig = {
        model: wire.request.model,
        maxTokens: wire.request.max_tokens,
        responseFormat: wire.request.response_format,
        compatibility: 'openai_compatible',
        temperature: wire.request.temperature,
        topP: wire.request.top_p,
        reasoningEffort: wire.request.reasoning_effort,
        ...(wire.request.chat_template_kwargs?.enable_thinking === false
          ? { thinking: { type: 'disabled' } } : {})
      };
      const afterPayload = buildProviderRequestPayload(providerConfig,
        calls[0].messages);
      const beforeUser = JSON.parse(wire.request.messages[1].content);
      const afterUser = JSON.parse(afterPayload.messages[1].content);
      const beforeModelRequest = beforeUser.request ?? beforeUser;
      const normalizedAfterUser = structuredClone(afterUser);
      const normalizedAfterRequest = normalizedAfterUser.request
        ?? normalizedAfterUser;
      normalizedAfterRequest.allowed_references =
        structuredClone(beforeModelRequest.allowed_references);
      assert.deepEqual(normalizedAfterUser, beforeUser,
        `${name}: user changes only the explicit reference allowlist`);
      assert.deepEqual(afterPayload.messages[0],
        { role: 'system', content: expectedSystem },
        `${name}: system message survives provider projection`);
      for (const key of ['model', 'max_tokens', 'temperature', 'top_p',
        'response_format', 'chat_template_kwargs', 'reasoning_effort']) {
        assert.deepEqual(afterPayload[key], wire.request[key],
          `${name}: provider parameter ${key} is unchanged`);
      }
      assert.deepEqual(plan.speech.claims.map(({ source_knowledge_refs }) =>
        source_knowledge_refs), [[request.npc_ref], [{ entity_kind:
          'activity_profile', entity_id: 'activity_m2c_npc_fisher_initial_work_v1' }]]);

      const foreignNpcClaim = structuredClone(plan);
      const otherNpcRef = request.allowed_references.actor_refs.find(
        ({ entity_kind, entity_id }) => entity_kind === 'npc'
          && entity_id !== request.npc_ref.entity_id);
      assert.ok(otherNpcRef, `${name}: fixture includes another NPC actor`);
      foreignNpcClaim.speech.claims[0].source_knowledge_refs = [otherNpcRef];
      assert.equal(validateConversationContributionPlan(foreignNpcClaim,
        preparedRequest), false, `${name}: another actor is not own knowledge`);

      const foreignActivityClaim = structuredClone(plan);
      foreignActivityClaim.speech.claims[1].source_knowledge_refs = [{
        entity_kind: 'activity_profile',
        entity_id: 'activity_m2c_npc_hunter_initial_work_v1'
      }];
      assert.equal(validateConversationContributionPlan(foreignActivityClaim,
        preparedRequest), false, `${name}: another NPC activity is not allowed`);
    }
  });

test('NPC source refs require projected identity and active current activity',
  () => {
    const targetRef = { entity_kind: 'npc', entity_id: 'npc-own' };
    const context = {
      targetRef,
      targetActor: {
        instance_id: 'npc-own',
        identity_state: { public_role_label: 'рыбак' },
        machine_state: { current_activity: {
          status: 'active', activity_ref: 'activity-own'
        } },
        knowledge_profile_snapshot: { profile_id: 'profile-own' }
      },
      conversationActorRefs: [targetRef,
        { entity_kind: 'npc', entity_id: 'npc-other' }],
      npcContributionReferencePolicy: {}
    };

    const active = allowedNpcContributionReferences(context);
    assert.deepEqual(active.knowledge_refs, [
      { entity_kind: 'activity_profile', entity_id: 'activity-own' },
      { entity_kind: 'knowledge_scope', entity_id: 'profile-own' },
      targetRef
    ]);

    const inactive = allowedNpcContributionReferences({
      ...context,
      targetActor: { ...context.targetActor,
        machine_state: { current_activity: {
          status: 'completed', activity_ref: 'activity-own'
        } } }
    });
    assert.equal(inactive.knowledge_refs.some(({ entity_id }) =>
      entity_id === 'activity-own'), false);

    const unprojected = allowedNpcContributionReferences({
      ...context,
      targetActor: { ...context.targetActor, identity_state: null,
        machine_state: {} }
    });
    assert.equal(unprojected.knowledge_refs.some(({ entity_id }) =>
      entity_id === 'npc-own' || entity_id === 'activity-own'), false);
  });
