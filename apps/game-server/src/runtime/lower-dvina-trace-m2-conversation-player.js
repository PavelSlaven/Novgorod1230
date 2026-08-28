import {
  createM2ConversationContext,
  prepareM2PlayerConversationPlan
} from './lower-dvina-trace-m2-conversation-exchange.js';
import {
  accessibleBlueWoolItem
} from './lower-dvina-trace-phase-3-admission.js';
import {
  EVIDENCE_INTERACTION,
  EVIDENCE_OPERATION,
  fail,
  PROMISE_OPERATION,
  ref,
  sameRef
} from './lower-dvina-trace-m2-conversation-shared.js';

const PLAYER_PLAN_STAGE_SCHEMA =
  'rus.trace_player_conversation_plan_stage.v1';

export async function prepareTracePhase3PlayerConversationPlan(input) {
  const { contracts } = input;
  const target = contracts.actors.find(
    ({ ref }) => ref === contracts.ids.eremeyRef
  );
  const availableEvidence = phase3AvailableEvidence(input.state, contracts);
  return prepareM2PlayerConversationPlan(createM2ConversationContext({
    ...input,
    phase: 'phase_3',
    checkResult: null,
    targetActor: target,
    actualNpcActors: contracts.actors,
    availableEvidence,
    ...(input.evidence ? {
      requiredResolution: 'check_required',
      requiredCheck: {
        attribute_ref: contracts.check.attribute,
        skill_ref: contracts.check.skill,
        difficulty_band: contracts.check.check_id
      },
      requiredSupportingOperation: {
        op: EVIDENCE_OPERATION,
        interaction_kind: EVIDENCE_INTERACTION,
        actor_ref: ref('player_character', input.state.actor_id),
        target_ref: ref('npc', target.instance_id),
        entity_ref: structuredClone(availableEvidence.item_ref)
      }
    } : {}),
    playerOperationContract: phase3PlayerOperationContract(availableEvidence)
  }));
}

export async function prepareTracePhase4PlayerConversationPlan(input) {
  const { contracts } = input;
  const target = contracts.actors.ratsha_storehouse_helper;
  const actualNpcActors = Object.entries(contracts.actors)
    .map(([ref, actor]) => ({ ref, ...structuredClone(actor) }));
  return prepareM2PlayerConversationPlan(createM2ConversationContext({
    ...input,
    phase: 'phase_4',
    checkResult: null,
    offerStage: null,
    targetActor: { ref: 'ratsha_storehouse_helper', ...target },
    actualNpcActors,
    playerOperationContract: {
      [PROMISE_OPERATION]: {
        owner: '@rus/social-law',
        policy_ref: contracts.promisePolicy.policy_id
      }
    }
  }));
}

export function buildTracePhase3ConversationCheckRequests({
  plan,
  state,
  contracts,
  evidence
}) {
  const presentedEvidence = phase3PresentedEvidence({ state, contracts, plan });
  if (presentedEvidence !== evidence) {
    fail(
      'TRACE_M2_PLAYER_EVIDENCE_OPERATION_REQUIRED',
      'Evidence presentation must match the executed supporting operation.'
    );
  }
  if (plan.resolution === 'automatic') return [];
  if (plan.check?.attribute_ref !== contracts.check.attribute
      || plan.check?.skill_ref !== contracts.check.skill
      || plan.check?.difficulty_band !== contracts.check.check_id) {
    fail(
      'TRACE_M2_PLAYER_CHECK_UNSUPPORTED',
      'Player conversation requested a check outside the approved profile.'
    );
  }
  return [{
    check_id: contracts.check.check_id,
    difficulty: contracts.check.dc,
    attribute_value:
      state.player_profile.attributes[contracts.check.attribute].value,
    skill_bonus: state.player_profile.skills[contracts.check.skill].bonus,
    state_modifier: contracts.check.modifiers.state,
    equipment_modifier: presentedEvidence
      ? contracts.check.modifiers.item_or_evidence : 0,
    circumstance_modifier: contracts.check.modifiers.circumstance,
    profile_version: contracts.check.version,
    consequence_refs: structuredClone(contracts.check.outcome_refs),
    retry_policy: contracts.check.retry_policy
  }];
}

export function phase3AvailableEvidence(state, contracts) {
  const item = accessibleBlueWoolItem(state, contracts);
  return item === null ? null : Object.freeze({
    evidence_ref: contracts.ids.evidence,
    item_ref: ref('item', item.item_id)
  });
}

export function phase3PlayerOperationContract(availableEvidence) {
  return availableEvidence === null ? {} : {
    [EVIDENCE_OPERATION]: {
      owner: '@rus/visibility-knowledge-memory',
      interaction_kind: EVIDENCE_INTERACTION,
      evidence_ref: availableEvidence.evidence_ref,
      item_ref: structuredClone(availableEvidence.item_ref)
    }
  };
}

export function phase3PresentedEvidence({ state, contracts, plan }) {
  const available = phase3AvailableEvidence(state, contracts);
  const operation = plan.supporting_operations?.find(
    ({ op } = {}) => op === EVIDENCE_OPERATION
  );
  if (!operation) return false;
  const target = contracts.actors.find(
    ({ ref: actorRef }) => actorRef === contracts.ids.eremeyRef
  );
  if (available === null
      || operation.interaction_kind !== EVIDENCE_INTERACTION
      || !sameRef(operation.actor_ref, ref('player_character', state.actor_id))
      || !sameRef(operation.target_ref, ref('npc', target?.instance_id))
      || !sameRef(operation.entity_ref, available.item_ref)) {
    fail(
      'TRACE_M2_PLAYER_EVIDENCE_OPERATION_INVALID',
      'Evidence presentation must reference the accessible item and addressee.'
    );
  }
  return true;
}

export function buildPlayerConversationPlanStage(plan) {
  return {
    schema: PLAYER_PLAN_STAGE_SCHEMA,
    plan: structuredClone(plan)
  };
}

export function requirePlayerConversationPlanStage(availability) {
  const plan = availability.causal_stages?.find(
    ({ schema }) => schema === PLAYER_PLAN_STAGE_SCHEMA
  )?.plan;
  if (!plan) fail('TRACE_M2_PLAYER_PLAN_STAGE_MISSING');
  return plan;
}
