import { canonicalDigest } from '@rus/materialization';
import { projectSemanticConversationSnapshot } from
  './lower-dvina-trace-conversation-state.js';

export function applyTurn10CompanionState({ next, factual, changeSetId,
  rootTurnId, workingRevision, turn10Contracts }) {
  const semantic = factual.consequence.conversation?.semantic_exchange;
  if (semantic?.exact_elapsed_minutes !== 0
      || semantic.exchange?.time_budget?.elapsed_minutes !== 0
      || semantic.pending_npc_execution != null
      || semantic.pending_player_execution != null) {
    fail('TRACE_TURN10_CONVERSATION_STATE_INVALID');
  }
  let projected = projectSemanticConversationSnapshot({
    state: next,
    semanticExchange: semantic,
    rootTurnId,
    workingRevision,
    appliedChangeSetId: changeSetId
  });
  const commitments = collectCommitments(
    semantic, changeSetId, turn10Contracts);
  projected.route_participant_commitments = appendUnique(
    projected.route_participant_commitments,
    commitments,
    (entry) => `${entry.npc_ref.entity_id}:${entry.role}`,
    'TRACE_TURN10_COMMITMENT_CONFLICT'
  );
  const admissions = commitments
    .filter(({ role }) => ['guide', 'escort'].includes(role))
    .map((entry) => ({
      npc_ref: structuredClone(entry.npc_ref),
      role: entry.role,
      activity_ref: entry.activity_ref,
      route_ref: entry.route_ref,
      execution_binding_ref: entry.execution_binding_ref,
      status: 'admitted',
      change_set_id: changeSetId
    }));
  projected.route_activity_admissions = appendUnique(
    projected.route_activity_admissions,
    admissions,
    (entry) => `${entry.npc_ref.entity_id}:${entry.activity_ref}`,
    'TRACE_TURN10_ADMISSION_CONFLICT'
  );
  applyGuideKnowledge(projected, semantic, commitments);
  projected.turn10_companion_resolution = {
    schema: 'rus.lower_dvina_trace_turn_10_companion_resolution.v1',
    status: 'completed',
    conversation_id:
      semantic.statements?.[0]?.conversation_id
      ?? semantic.exchange?.contributions?.[0]?.conversation_id,
    commitment_count: commitments.length,
    commitment_refs: commitments.map(({ npc_ref: npcRef, role }) => ({
      npc_ref: npcRef, role
    })),
    change_set_id: changeSetId
  };
  projected.last_turn.consequence = {
    ...projected.last_turn.consequence,
    turn10_kind: 'companion_request',
    companion_resolution:
      structuredClone(projected.turn10_companion_resolution)
  };
  return projected;
}

function collectCommitments(semantic, changeSetId, contracts) {
  const commitments = [];
  const roleIds = new Set();
  for (const entry of semantic.npc_outcomes ?? []) {
    const outcome = entry.outcome;
    if (!entry.applied || outcome?.kind !== 'route_participation') continue;
    if (!['guide', 'stay_with_onisim', 'escort'].includes(outcome.role)
        || roleIds.has(outcome.role)
        || typeof outcome.execution_binding_ref !== 'string') {
      fail('TRACE_TURN10_COMMITMENT_INVALID');
    }
    roleIds.add(outcome.role);
    validateOutcome(entry, outcome, contracts);
    commitments.push({
      npc_ref: structuredClone(entry.npc_ref),
      role: outcome.role,
      execution_binding_ref: outcome.execution_binding_ref,
      activity_ref: outcome.activity_ref,
      route_ref: outcome.route_ref,
      protected_actor_slot: outcome.protected_actor_slot,
      source_request_id: entry.request_id,
      change_set_id: changeSetId
    });
  }
  return commitments;
}

function applyGuideKnowledge(projected, semantic, commitments) {
  const guide = commitments.find(({ role }) => role === 'guide');
  if (!guide?.route_ref) return;
  const statementRef = semantic.npc_outcomes.find(({ outcome }) =>
    outcome?.role === 'guide')?.contribution_ref?.entity_id;
  projected.route_knowledge = [...new Set([
    ...(projected.route_knowledge ?? []), guide.route_ref
  ])].sort();
  projected.knowledge = appendUnique(projected.knowledge, [{
    fact_id: guide.route_ref,
    knowledge_state: 'known_from_committed_source',
    evidence_refs: statementRef ? [statementRef] : []
  }], (entry) => entry.fact_id, 'TRACE_TURN10_KNOWLEDGE_CONFLICT');
}

function validateOutcome(entry, outcome, contracts) {
  if (contracts == null) return;
  const expectedByNpc = new Map([
    [contracts.actors.eremey.instance_id,
      contracts.binding.npc_operations.eremey_guide],
    [contracts.actors.participatingFisher.instance_id,
      contracts.binding.npc_operations.participating_fisher_stay],
    [contracts.actors.otherFisher.instance_id,
      contracts.binding.npc_operations.other_fisher_escort]
  ]);
  const expected = expectedByNpc.get(entry.npc_ref?.entity_id);
  if (expected == null
      || outcome.role !== expected.role
      || outcome.execution_binding_ref !== expected.execution_binding_ref
      || outcome.activity_ref !== (expected.activity_ref ?? null)
      || outcome.route_ref !== (expected.route_ref ?? null)
      || outcome.protected_actor_slot
        !== (expected.protected_actor_slot ?? null)) {
    fail('TRACE_TURN10_COMMITMENT_INVALID');
  }
}

function appendUnique(current = [], additions = [], identity, code) {
  const byId = new Map(current.map((entry) => [identity(entry), entry]));
  for (const entry of additions) {
    const id = identity(entry);
    const prior = byId.get(id);
    if (prior && canonicalDigest(prior) !== canonicalDigest(entry)) fail(code);
    if (!prior) byId.set(id, structuredClone(entry));
  }
  return [...byId.values()];
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
