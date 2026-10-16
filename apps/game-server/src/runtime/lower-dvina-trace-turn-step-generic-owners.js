import {
  accumulateBodyTimeEffects,
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
export { createLowerDvinaTraceTurnStepVisibleProjector } from
  './lower-dvina-trace-turn-step-fire-visible.js';

export const GENERIC_BODY_EFFECT_REF =
  'trace_ld_v1_turn_step_generic_body_effect_v1';

/** A new admitted physical discovery uses the existing activity/time/body owner. */
export function ordinaryDiscoveryActivity({ operation, request, plan = null,
  ordinaryPlan, knownResolution = null, visibleSeed = null }) {
  const resolved = ['materialize', 'absent', 'no_change', 'authority_required'];
  const fresh = resolved.includes(ordinaryPlan?.resolution)
    && ordinaryPlan.request_identity ===
      `${request?.root_turn_id}:ordinary:presence:step:${request?.step_index}`;
  const presence = visibleSeed?.ordinary_presence_seed;
  const filteredSeedOnly = presence?.resolution === 'no_change'
    && ordinaryPlan?.transitions?.some(({ kind }) => kind === 'seed')
    && !Object.hasOwn(visibleSeed, 'ordinary_scene_seed');
  const resolvedKnown = knownResolution ?? (filteredSeedOnly ? presence : null);
  if (!fresh && !resolved.includes(resolvedKnown?.resolution)) return null;
  return ordinarySearchActivity(operation, plan);
}
export function ordinarySearchActivity(operation, plan = null) {
  return operation?.op === 'request_discovery'
    && (operation.discovery_kind === 'search'
      || operation.discovery_kind === 'inspect' && plan?.continuation === null)
    ? { owner: 'semantic', duration_class: 'short', effort: 'light' } : null;
}

const BODY_METRICS = ['health', 'satiety', 'energy'];

export function createLowerDvinaTraceTurnStepGenericOwners({
  profiles,
  artifactPin,
  selectedProfilePin,
  bodyTimeEffectAdapter = null
} = {}) {
  if (bodyTimeEffectAdapter != null
      && (typeof bodyTimeEffectAdapter.calculateProposals !== 'function'
        || bodyTimeEffectAdapter.trustedBodyNeedsProfile?.approved !== true)) {
    ownerFail('TRACE_TURN_STEP_BODY_TIME_ADAPTER_INVALID');
  }
  const admitted = admitTurnStepOwnerProfiles(profiles, artifactPin, selectedProfilePin);
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
      const requested = activity?.requested_duration_minutes;
      if (requested !== undefined
          && (!Number.isSafeInteger(requested) || requested < 1)) {
        ownerFail('TRACE_TURN_STEP_ACTIVITY_DURATION_INVALID');
      }
      return deepFreeze({
        profile_ref: selected.profile_ref,
        profile_pin: structuredClone(admitted.profile_pin),
        duration_class: selected.duration_class,
        effort: selected.effort,
        duration_minutes: requested ?? selected.duration_minutes
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
        body_effect_profile: semanticActivityFixedProfile({
          selected, profilePin: admitted.profile_pin, context,
          continuous: bodyTimeEffectAdapter != null
        }),
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
    supportsBodyTimeEffects: bodyTimeEffectAdapter != null,
    apply({ committed_state: state, consequence, time_update: timeUpdate } = {}) {
      const continuousActivity = bodyTimeEffectAdapter != null
        && consequence?.state_changes?.some(
          ({ kind }) => kind === 'semantic_activity');
      if (consequence?.body_effect_ref !== GENERIC_BODY_EFFECT_REF
          && !continuousActivity) {
        ownerFail('TRACE_TURN_STEP_GENERIC_BODY_EFFECT_REF_INVALID');
      }
      const components = (consequence.state_changes ?? []).filter(
        ({ kind }) => ['semantic_activity', 'direct_body_event'].includes(kind));
      if ((components.length === 0 && !continuousActivity)
          || !plain(state?.body_state)) {
        ownerFail('TRACE_TURN_STEP_BODY_EFFECT_DATA_GAP');
      }
      const continuousElapsed = continuousActivity
        ? exactElapsedFrom(timeUpdate) : null;
      const continuousActivityStarted = continuousElapsed == null
        || BigInt(continuousElapsed.numerator) > 0n;
      let bodyState = structuredClone(state.body_state);
      const proposals = [];
      for (const component of components) {
        const profileRef = component.body_effect_profile_ref;
        const definition = bodyProfileDefinitions.get(profileRef);
        if (!definition
            || !samePin(component.profile_pin, admitted.profile_pin)) {
          ownerFail('TRACE_TURN_STEP_BODY_EFFECT_PROFILE_MISMATCH');
        }
        const profile = component.kind === 'semantic_activity'
          ? semanticActivityFixedProfile({ selected: definition,
            profilePin: admitted.profile_pin,
            context: component.body_effect_context,
            continuous: bodyTimeEffectAdapter != null,
            activityStarted: continuousActivityStarted })
          : fixedBodyProfile(
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
      let continuousProposal = null;
      let exactStateAfter = null;
      if (continuousActivity) {
        const activity = consequence.state_changes.find(
          ({ kind }) => kind === 'semantic_activity');
        const exactElapsed = continuousElapsed;
        if (BigInt(exactElapsed.numerator) !== 0n) {
          const exactBodyBefore = state.body_time_exact_state
            ?? state.body_state;
          const fixedReplay = accumulateBodyTimeEffects({
            body_state_before: exactBodyBefore,
            slices: [{ exact_elapsed: { numerator: '0', denominator: '1' },
              fixed_effect_proposals: proposals, component_proposals: [] }]
          });
          if (fixedReplay?.ok !== true
              || fixedReplay.owner !== '@rus/body-state'
              || fixedReplay.applied !== true
              || !plain(fixedReplay.exact_state_after)) {
            ownerFail('TRACE_TURN_STEP_BODY_TIME_APPLY_INVALID', {
              body_error: fixedReplay?.error?.code ?? null
            });
          }
          const activityContext = bodyTimeEffectContext(state,
            fixedReplay.exact_state_after,
            timeUpdate?.clock_before);
          const calculated = bodyTimeEffectAdapter.calculateProposals({
            effort: activity.effort ?? activity.body_effect_context?.effort,
            exact_elapsed: exactElapsed,
            ...activityContext
          });
          if (calculated?.ok !== true || !Array.isArray(calculated.proposals)
              || calculated.proposals.length === 0) {
            ownerFail('TRACE_TURN_STEP_BODY_TIME_PROPOSAL_INVALID', {
              body_error: calculated?.error?.code ?? calculated?.code ?? null
            });
          }
          const componentsWithActivity = calculated.proposals.map((proposal) => ({
            ...structuredClone(proposal),
            activity_id: activity.activity_id,
            effort: activity.effort ?? activity.body_effect_context?.effort
          }));
          const applied = accumulateBodyTimeEffects({
            body_state_before: exactBodyBefore,
            slices: [{ exact_elapsed: exactElapsed,
              fixed_effect_proposals: proposals,
              component_proposals: componentsWithActivity }]
          });
          if (applied?.ok !== true || applied.owner !== '@rus/body-state'
              || applied.applied !== true || !plain(applied.state_after)
              || !plain(applied.exact_state_after)
              || !plain(applied.exact_changes)) {
            ownerFail('TRACE_TURN_STEP_BODY_TIME_APPLY_INVALID', {
              body_error: applied?.error?.code ?? null
            });
          }
          bodyState = structuredClone(applied.state_after);
          exactStateAfter = structuredClone(applied.exact_state_after);
          continuousProposal = {
            proposal_kind: 'body_time_effect_composite',
            fixed_effect_proposals: structuredClone(proposals),
            component_proposals: componentsWithActivity,
            exact_changes: structuredClone(applied.exact_changes)
          };
        }
      }
      const exactDeltas = Object.fromEntries(BODY_METRICS.map((metric) => [
        metric,
        proposals.reduce((sum, proposal) =>
          sum + proposal.exact_deltas[metric], 0)
      ]));
      return deepFreeze({
        owner: '@rus/body-state',
        applied: true,
        ...(exactStateAfter == null ? {} : {
          exact_state_after: exactStateAfter
        }),
        proposal: {
          ...(continuousProposal == null ? {
            schema: 'rus.body_state.composite_fixed_effect_proposal.v1',
            profile_ref: GENERIC_BODY_EFFECT_REF,
            profile_pin: structuredClone(admitted.profile_pin),
            component_proposals: proposals,
            exact_deltas: exactDeltas,
            selection_policy: 'ordered_committed_step_components',
            rng_consumption: 'forbidden'
          } : continuousProposal),
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
    bodyNeedsBindingPin: bodyTimeEffectAdapter?.trustedBindingPin ?? null,
    trustedBodyNeedsProfile:
      bodyTimeEffectAdapter?.trustedBodyNeedsProfile ?? null,
    ordinaryResultPolicy: deepFreeze(structuredClone(
      admitted.ordinary_result_policy))
  });
}

function semanticActivityFixedProfile({ selected, profilePin, context,
  continuous, activityStarted = true }) {
  const profile = fixedBodyProfile(selected, profilePin, context);
  if (!continuous) return profile;
  return deepFreeze({
    ...structuredClone(profile),
    exact_deltas: {
      health: selected.effort === 'extreme' && activityStarted
        ? selected.exact_deltas.health : 0,
      satiety: 0,
      energy: 0
    }
  });
}

function exactElapsedFrom(timeUpdate) {
  const exact = timeUpdate?.exact_elapsed?.exact_minutes
    ?? timeUpdate?.exact_elapsed;
  if (!plain(exact) || !/^-?(0|[1-9]\d*)$/u.test(String(exact.numerator))
      || !/^[1-9]\d*$/u.test(String(exact.denominator))) {
    ownerFail('TRACE_TURN_STEP_BODY_TIME_ELAPSED_INVALID');
  }
  return structuredClone(exact);
}

function bodyTimeEffectContext(committedState, bodyState, observedAt) {
  const actorId = committedState?.actor_id;
  const partyId = committedState?.party_id;
  const stateVersion = committedState?.party_state?.state_version;
  const environmentFact = committedState?.environment_snapshot;
  if (typeof actorId !== 'string' || actorId.length === 0
      || typeof partyId !== 'string' || partyId.length === 0
      || !Number.isSafeInteger(stateVersion) || !plain(environmentFact)
      || !plain(observedAt)) {
    ownerFail('TRACE_TURN_STEP_BODY_TIME_CONTEXT_MISSING');
  }
  const activeConditions = (bodyState.active_conditions ?? [])
    .map((condition) => condition?.id)
    .filter((id) => typeof id === 'string' && id.length > 0);
  return {
    body_state: exactBodyState(bodyState),
    body_state_ref: { entity_kind: 'body_state', entity_id: actorId },
    scope_ref: { entity_kind: 'party', entity_id: partyId },
    environment_fact: structuredClone(environmentFact),
    party_id: partyId,
    state_version: stateVersion,
    observed_at: structuredClone(observedAt),
    active_conditions: activeConditions
  };
}

function exactBodyState(bodyState) {
  return Object.fromEntries(BODY_METRICS.map((metric) => [
    metric, bodyState[metric] != null && typeof bodyState[metric] === 'object'
      ? structuredClone(bodyState[metric]) : decimalRational(bodyState[metric])
  ]));
}

function decimalRational(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    ownerFail('TRACE_TURN_STEP_BODY_TIME_STATE_INVALID');
  }
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/iu.exec(text);
  if (!match) ownerFail('TRACE_TURN_STEP_BODY_TIME_STATE_INVALID');
  const sign = match[1] === '-' ? -1n : 1n;
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? 0);
  let numerator = BigInt(`${match[2]}${fraction}`) * sign;
  let denominator = 10n ** BigInt(fraction.length);
  if (exponent > 0) numerator *= 10n ** BigInt(exponent);
  else if (exponent < 0) denominator *= 10n ** BigInt(-exponent);
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: String(numerator / divisor),
    denominator: String(denominator / divisor) };
}

function greatestCommonDivisor(left, right) {
  let a = left < 0n ? -left : left;
  let b = right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

export function createLowerDvinaTraceCompositeBodyEffect({
  genericBodyEffect,
  fallback
} = {}) {
  if (typeof fallback?.apply !== 'function') {
    throw new TypeError('fallback bodyEffect.apply is required');
  }
  return Object.freeze({
    supportsBodyTimeEffects:
      genericBodyEffect?.supportsBodyTimeEffects === true,
    apply(input) {
      const isContinuousActivity = genericBodyEffect?.supportsBodyTimeEffects
          === true
        && input?.effect_kind === 'semantic_activity';
      return input?.consequence?.body_effect_ref === GENERIC_BODY_EFFECT_REF
        || isContinuousActivity
        ? genericBodyEffect.apply(input)
        : fallback.apply(input);
    }
  });
}
