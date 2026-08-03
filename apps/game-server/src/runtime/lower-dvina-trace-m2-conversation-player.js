import {
  createM2ConversationContext,
  prepareM2PlayerConversationPlan
} from './lower-dvina-trace-m2-conversation-exchange.js';
import {
  fail,
  PLAYER_OPERATION,
  PROMISE_OPERATION
} from './lower-dvina-trace-m2-conversation-shared.js';

const PLAYER_PLAN_STAGE_SCHEMA =
  'rus.trace_player_conversation_plan_stage.v1';

export async function prepareTracePhase3PlayerConversationPlan(input) {
  const { contracts } = input;
  const target = contracts.actors.find(
    ({ ref }) => ref === contracts.ids.eremeyRef
  );
  return prepareM2PlayerConversationPlan(createM2ConversationContext({
    ...input,
    phase: 'phase_3',
    checkResult: null,
    targetActor: target,
    actualNpcActors: contracts.actors,
    playerOperationContract: {
      [PLAYER_OPERATION]: {
        owner: '@rus/turn',
        utterance_policy: 'semantic_contribution'
      }
    }
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
      [PLAYER_OPERATION]: {
        owner: '@rus/turn',
        utterance_policy: 'semantic_contribution'
      },
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
    equipment_modifier: evidence
      ? contracts.check.modifiers.item_or_evidence : 0,
    circumstance_modifier: contracts.check.modifiers.circumstance,
    profile_version: contracts.check.version,
    consequence_refs: structuredClone(contracts.check.outcome_refs),
    retry_policy: contracts.check.retry_policy
  }];
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
