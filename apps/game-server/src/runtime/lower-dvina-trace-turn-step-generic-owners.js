import {
  applyApprovedFixedBodyEffect,
  stateModifier
} from '@rus/body-state';
import { deepFreeze, plain } from
  './lower-dvina-trace-turn-step-runtime-common.js';
import {
  activityKey,
  admitTurnStepOwnerProfiles,
  bodyEventKey,
  directBodyContext,
  expandActivityProfiles,
  expandDirectBodyProfiles,
  fixedBodyProfile,
  ownerFail,
  requireBodyResult,
  samePin,
  semanticBodyContext,
  validBodyPart
} from './lower-dvina-trace-turn-step-owner-profiles.js';

export const GENERIC_BODY_EFFECT_REF =
  'trace_ld_v1_turn_step_generic_body_effect_v1';

const BODY_METRICS = ['health', 'satiety', 'energy'];

export function createLowerDvinaTraceTurnStepGenericOwners({
  profiles,
  artifactPin
} = {}) {
  const admitted = admitTurnStepOwnerProfiles(profiles, artifactPin);
  const semanticActivityProfiles = expandActivityProfiles(admitted);
  const directBodyEventProfiles = expandDirectBodyProfiles(admitted);
  const activityByKey = new Map(semanticActivityProfiles.map(
    (profile) => [activityKey(profile), profile]));
  const bodyEventByKey = new Map(directBodyEventProfiles.map(
    (profile) => [bodyEventKey(profile), profile]));
  const bodyProfileDefinitions = new Map([
    ...semanticActivityProfiles,
    ...directBodyEventProfiles
  ].map((profile) => [profile.body_effect_profile_ref, profile]));

  const semanticActivityScheduleOwner = Object.freeze({
    resolve({ activity } = {}) {
      const selected = activityByKey.get(activityKey(activity));
      if (!selected) ownerFail('TRACE_TURN_STEP_ACTIVITY_PROFILE_DATA_GAP');
      return deepFreeze({
        profile_ref: selected.profile_ref,
        profile_pin: structuredClone(admitted.profile_pin),
        duration_class: selected.duration_class,
        effort: selected.effort,
        duration_minutes: selected.duration_minutes
      });
    }
  });

  const semanticActivityOwner = Object.freeze({
    resolve({ activity, actor } = {}) {
      const selected = activityByKey.get(activityKey(activity));
      const schedule = semanticActivityScheduleOwner.resolve({ activity });
      const context = semanticBodyContext(selected);
      const bodyResult = applyApprovedFixedBodyEffect({
        body_state: actor?.body,
        body_effect_profile: fixedBodyProfile(
          selected, admitted.profile_pin, context),
        selected_context: context
      });
      requireBodyResult(bodyResult);
      const changesBody = Object.values(bodyResult.proposal.exact_deltas)
        .some((value) => value !== 0);
      return deepFreeze({
        ...schedule,
        body_effect_ref: changesBody ? GENERIC_BODY_EFFECT_REF : null,
        body_effect_profile_ref: selected.body_effect_profile_ref,
        exact_deltas: structuredClone(bodyResult.proposal.exact_deltas),
        body_state_after: structuredClone(bodyResult.state_after)
      });
    }
  });

  const bodyEventOwner = Object.freeze({
    resolve({ event, actor } = {}) {
      const selected = bodyEventByKey.get(bodyEventKey(event));
      if (!selected || !validBodyPart(event?.body_part_ref,
        admitted.direct_body_part_policy)) {
        ownerFail('TRACE_TURN_STEP_BODY_EVENT_PROFILE_DATA_GAP');
      }
      const context = directBodyContext(event);
      const result = applyApprovedFixedBodyEffect({
        body_state: actor?.body,
        body_effect_profile: fixedBodyProfile(
          selected, admitted.profile_pin, context),
        selected_context: context
      });
      requireBodyResult(result);
      return deepFreeze({
        body_effect_ref: selected.body_effect_profile_ref,
        composite_body_effect_ref: GENERIC_BODY_EFFECT_REF,
        payload: {
          body_effect_ref: selected.body_effect_profile_ref,
          profile_pin: structuredClone(admitted.profile_pin),
          selected_context: context,
          exact_deltas: structuredClone(result.proposal.exact_deltas),
          state_after: structuredClone(result.state_after),
          selection_policy: 'fixed_approved_effect',
          rng_consumption: 'forbidden'
        }
      });
    }
  });

  const genericCheckContextOwner = Object.freeze({
    resolve({ check, actor, working_projection: projection } = {}) {
      const policy = admitted.generic_check_modifier_policy;
      const attribute = actor?.attributes?.[check?.attribute_ref];
      if (!plain(attribute) || !Number.isFinite(attribute.value)) {
        ownerFail('TRACE_TURN_STEP_CHECK_ATTRIBUTE_DATA_GAP');
      }
      let skillBonus = 0;
      if (check.skill_ref != null) {
        const skill = actor?.skills?.[check.skill_ref];
        if (!plain(skill) || !Number.isFinite(skill.bonus)) {
          ownerFail('TRACE_TURN_STEP_CHECK_SKILL_DATA_GAP');
        }
        skillBonus = skill.bonus;
      }
      const relevantMetrics = policy.state_relevance_by_attribute[
        check.attribute_ref];
      if (!Array.isArray(relevantMetrics)
          || relevantMetrics.length === 0
          || relevantMetrics.some((metric) => !BODY_METRICS.includes(metric))
          || !plain(actor?.body)
          || BODY_METRICS.some((metric) =>
            !Number.isFinite(actor.body[metric]))
          || !Array.isArray(actor.body.active_conditions)) {
        ownerFail('TRACE_TURN_STEP_CHECK_STATE_DATA_GAP');
      }
      const loadCategory = projection?.inventory?.load_category;
      if (!Object.hasOwn(policy.load_category_modifiers, loadCategory)) {
        ownerFail('TRACE_TURN_STEP_CHECK_EQUIPMENT_DATA_GAP');
      }
      if (policy.circumstance_policy !== 'explicit_absence_yields_zero') {
        ownerFail('TRACE_TURN_STEP_CHECK_CIRCUMSTANCE_DATA_GAP');
      }
      return deepFreeze({
        attribute_value: attribute.value,
        skill_bonus: skillBonus,
        state_modifier: stateModifier(actor.body, relevantMetrics),
        equipment_modifier: policy.load_category_modifiers[loadCategory],
        circumstance_modifier: 0,
        policy_profile_ref: policy.profile_ref,
        policy_profile_pin: structuredClone(admitted.profile_pin),
        check_policy_ref: structuredClone(policy.check_policy_ref),
        consequence_policy_ref:
          structuredClone(policy.consequence_policy_ref)
      });
    }
  });

  const bodyEffect = Object.freeze({
    apply({ committed_state: state, consequence } = {}) {
      if (consequence?.body_effect_ref !== GENERIC_BODY_EFFECT_REF) {
        ownerFail('TRACE_TURN_STEP_GENERIC_BODY_EFFECT_REF_INVALID');
      }
      const components = (consequence.state_changes ?? []).filter(
        ({ kind }) => ['semantic_activity', 'direct_body_event'].includes(kind));
      if (components.length === 0 || !plain(state?.body_state)) {
        ownerFail('TRACE_TURN_STEP_BODY_EFFECT_DATA_GAP');
      }
      let bodyState = structuredClone(state.body_state);
      const proposals = [];
      for (const component of components) {
        const profileRef = component.body_effect_profile_ref;
        const definition = bodyProfileDefinitions.get(profileRef);
        if (!definition
            || !samePin(component.profile_pin, admitted.profile_pin)) {
          ownerFail('TRACE_TURN_STEP_BODY_EFFECT_PROFILE_MISMATCH');
        }
        const profile = fixedBodyProfile(
          definition, admitted.profile_pin, component.body_effect_context);
        const result = applyApprovedFixedBodyEffect({
          body_state: bodyState,
          body_effect_profile: profile,
          selected_context: component.body_effect_context
        });
        requireBodyResult(result);
        bodyState = structuredClone(result.state_after);
        proposals.push({
          ...structuredClone(result.proposal),
          state_after: structuredClone(result.state_after)
        });
      }
      const exactDeltas = Object.fromEntries(BODY_METRICS.map((metric) => [
        metric,
        proposals.reduce((sum, proposal) =>
          sum + proposal.exact_deltas[metric], 0)
      ]));
      return deepFreeze({
        owner: '@rus/body-state',
        applied: true,
        proposal: {
          schema: 'rus.body_state.composite_fixed_effect_proposal.v1',
          profile_ref: GENERIC_BODY_EFFECT_REF,
          profile_pin: structuredClone(admitted.profile_pin),
          component_proposals: proposals,
          exact_deltas: exactDeltas,
          selection_policy: 'ordered_committed_step_components',
          rng_consumption: 'forbidden'
        },
        state_after: bodyState
      });
    }
  });

  return Object.freeze({
    semanticActivityScheduleOwner,
    semanticActivityOwner,
    bodyEventOwner,
    genericCheckContextOwner,
    bodyEffect,
    ordinaryResultPolicy: deepFreeze(structuredClone(
      admitted.ordinary_result_policy))
  });
}

export function createLowerDvinaTraceCompositeBodyEffect({
  genericBodyEffect,
  fallback
} = {}) {
  if (typeof fallback?.apply !== 'function') {
    throw new TypeError('fallback bodyEffect.apply is required');
  }
  return Object.freeze({
    apply(input) {
      return input?.consequence?.body_effect_ref === GENERIC_BODY_EFFECT_REF
        ? genericBodyEffect.apply(input)
        : fallback.apply(input);
    }
  });
}

export function createLowerDvinaTraceTurnStepVisibleProjector({
  fallback
} = {}) {
  if (typeof fallback?.project !== 'function') {
    throw new TypeError('fallback visibleProjector.project is required');
  }
  return Object.freeze({
    async project(input) {
      const consequence = input?.consequence;
      const synthetic = plain(consequence?.visible_seed)
        && Array.isArray(consequence.visible_seed.completed_steps)
        && !Array.isArray(consequence.observations)
        && consequence.phase3_kind == null
        && consequence.phase4_kind == null
        && consequence.phase5_kind == null
        && consequence.phase6_kind == null
        && consequence.phase7_kind == null;
      if (!synthetic) return fallback.project(input);
      const directSeeds = Object.entries(consequence.visible_seed)
        .filter(([key, value]) => key.startsWith('turn_step_') && plain(value));
      const body = input.body_update?.state_after ?? {};
      return deepFreeze({
        version: 1,
        schema: 'visible_context_package',
        visible_scene: consequence.visible_seed.clarification
          ? 'Требуется уточнение дальнейшего действия.'
          : 'Заявленное действие завершено.',
        visible_changes: directSeeds.map(([key]) => key),
        sensory_details: [],
        visible_npc: [],
        visible_objects: [],
        known_context: [
          ...(Number.isFinite(body.health) ? [`health:${body.health}`] : []),
          ...(Number.isFinite(body.satiety) ? [`satiety:${body.satiety}`] : []),
          ...(Number.isFinite(body.energy) ? [`energy:${body.energy}`] : [])
        ],
        uncertainties: consequence.visible_seed.clarification
          ? ['Фактическое действие не применено до уточнения.'] : [],
        allowed_tensions: [],
        do_not_imply: [
          'hidden_fact', 'uncommitted_body_delta', 'uncommitted_time'
        ]
      });
    }
  });
}
