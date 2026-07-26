import {
  applyLowerDvinaBoundaryFailure,
  selectLowerDvinaBoundaryContext
} from '@rus/turn';
import { serverError } from '../../errors.js';
import { hash } from './shared.js';

const RECHECK_MINUTES = 15;

export function resolveBoundaryActivation({
  state,
  command,
  elapsedMinutes = 0
}) {
  const context = selectContext(state, elapsedMinutes);
  const check = resolveCheck({
    context,
    command,
    state,
    scope: `activation:${elapsedMinutes}`
  });
  if (check?.roll.result_kind === 'failure') {
    throw serverError(
      'BOUNDARY_PRE_DISPATCH_CHECK_FAILED',
      'Проверка перед отправлением не пройдена: контекст не переключён, время не прошло. Можно сохранить игру, подождать улучшения условий или отменить переход.',
      {
        status: 409,
        details: {
          check_policy_ref: check.policy_ref,
          roll: check.roll,
          elapsed_minutes: 0,
          context_switched: false,
          outgoing_traversal_created: false,
          next_choices: ['save', 'wait_for_conditions', 'cancel_dispatch']
        }
      }
    );
  }
  return { context, check };
}

export function resolveBoundarySegmentExecution({
  segment,
  state,
  command,
  activation
}) {
  const totalMinutes = segment.base_minutes;
  const intervals = [];
  let elapsed = 0;
  let progressPpm = 0;
  while (elapsed < totalMinutes) {
    const intervalMinutes = Math.min(
      RECHECK_MINUTES,
      totalMinutes - elapsed
    );
    const nextElapsed = elapsed + intervalMinutes;
    const nextProgress = Math.round(
      nextElapsed * 1_000_000 / totalMinutes
    );
    intervals.push({
      elapsed_minutes: intervalMinutes,
      planned_minutes: intervalMinutes,
      progress_before_ppm: progressPpm,
      planned_progress_after_ppm: nextProgress,
      actual_progress_after_ppm: nextProgress,
      result_kind: nextProgress === 1_000_000
        ? 'segment_completed'
        : 'progressed',
      result_code: nextProgress === 1_000_000
        ? 'lower_dvina_segment_completed'
        : 'lower_dvina_segment_progressed',
      condition_snapshot: activation.context,
      check: elapsed === 0 ? activation.check : null,
      consequence: null
    });
    elapsed = nextElapsed;
    progressPpm = nextProgress;
    if (elapsed >= totalMinutes) break;
    const context = selectContext(state, elapsed);
    const check = resolveCheck({
      context,
      command,
      state,
      scope: `recheck:${segment.segment_ref.entity_id}:${elapsed}`
    });
    if (check?.roll.result_kind !== 'failure') {
      activation = { context, check };
      continue;
    }
    const consequence = applyLowerDvinaBoundaryFailure({
      progressPpm,
      elapsedMinutes: elapsed,
      unresolvedFailureCount: 0
    });
    intervals.push({
      elapsed_minutes: consequence.elapsedMinutes - elapsed,
      planned_minutes: Math.min(
        RECHECK_MINUTES,
        totalMinutes - elapsed
      ),
      progress_before_ppm: progressPpm,
      planned_progress_after_ppm: Math.min(
        1_000_000,
        progressPpm + 1
      ),
      actual_progress_after_ppm: progressPpm,
      result_kind: consequence.state,
      result_code: 'lower_dvina_recheck_failed',
      condition_snapshot: context,
      check,
      consequence
    });
    return {
      ...segment,
      intervals,
      actual_progress_fraction: progressPpm / 1_000_000,
      actual_exact_elapsed: consequence.elapsedMinutes,
      result_kind: consequence.state,
      consequence,
      completed: false
    };
  }
  return {
    ...segment,
    intervals,
    actual_progress_fraction: 1,
    actual_exact_elapsed: totalMinutes,
    result_kind: 'segment_completed',
    consequence: null,
    completed: true
  };
}

export function resolveBoundarySegmentResume({
  segment,
  state,
  command,
  progressPpm
}) {
  if (!Number.isInteger(progressPpm)
      || progressPpm <= 0
      || progressPpm >= 1_000_000) {
    throw serverError(
      'BOUNDARY_RESUME_PROGRESS_INVALID',
      'Persisted boundary progress cannot be resumed safely.',
      { status: 409 }
    );
  }
  const activation = resolveBoundaryActivation({ state, command });
  const remainingMinutes = Math.round(
    segment.base_minutes * (1 - progressPpm / 1_000_000)
  );
  const interval = {
    elapsed_minutes: remainingMinutes,
    planned_minutes: remainingMinutes,
    progress_before_ppm: progressPpm,
    planned_progress_after_ppm: 1_000_000,
    actual_progress_after_ppm: 1_000_000,
    result_kind: 'segment_completed',
    result_code: 'lower_dvina_segment_completed',
    condition_snapshot: activation.context,
    check: activation.check,
    consequence: null
  };
  return {
    ...segment,
    intervals: [interval],
    actual_progress_fraction: 1,
    actual_exact_elapsed: remainingMinutes,
    result_kind: 'segment_completed',
    consequence: null,
    completed: true
  };
}

function selectContext(state, elapsedMinutes) {
  const resolved = selectLowerDvinaBoundaryContext(
    state.boundary_condition_timeline,
    elapsedMinutes
  );
  if (!resolved.ok) {
    throw serverError(
      resolved.code.toUpperCase(),
      'Утверждённая политика доступности перехода не допускает текущий контекст.',
      {
        status: 409,
        details: {
          elapsed_minutes: 0,
          context_switched: false,
          outgoing_traversal_created: false,
          dimension: resolved.dimension ?? null
        }
      }
    );
  }
  return resolved;
}

function resolveCheck({ context, command, state, scope }) {
  if (context.check == null) return null;
  const inputDigest = hash(
    `${command.canonical_digest}:boundary-d20:${scope}`
  );
  const value =
    (Number.parseInt(inputDigest.slice(0, 8), 16) % 20) + 1;
  const modifier = Number(
    state.player.skills[context.check.modifier_skill_id] ?? 0
  );
  return {
    ...structuredClone(context.check),
    policy_ref: {
      entity_kind: 'check_policy',
      entity_id: context.check.policy_id,
      version: 1
    },
    roll: {
      input_digest: inputDigest,
      value,
      modifier_skill_id: context.check.modifier_skill_id,
      modifier,
      target: context.check.target,
      result_kind:
        value + modifier >= context.check.target
          ? 'success'
          : 'failure'
    }
  };
}
