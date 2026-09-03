import { deepFreeze, sha256 } from '@rus/kernel';
import { turnFailure } from './errors.js';
import {
  buildTurnStepOperationBatch,
  TURN_STEP_OPERATION_BATCH_TARGET
} from './turn-step-operation-batch.js';
import {
  requireTurnStepPreparedEffectLedger
} from './turn-step-prepared-effects.js';

const drafts = new WeakMap();

export function bindTurnStepWorkflowDraft(modeResolution, draft) {
  if (!modeResolution || typeof modeResolution !== 'object') {
    throw new TypeError('Turn step workflow draft requires mode resolution.');
  }
  drafts.set(modeResolution, deepFreeze(structuredClone(draft)));
  return modeResolution;
}

export function getTurnStepWorkflowDraft(modeResolution) {
  return drafts.get(modeResolution) ?? null;
}

export function turnStepDraftPreparedEffectLedger(draft) {
  const value = draft?.loop_result?.prepared_effect_ledger;
  return value == null ? null : requireTurnStepPreparedEffectLedger(value);
}

export function turnStepDraftOrdinaryAtomicWritePlan(draft) {
  return draft?.loop_result?.ordinary_materialization_atomic_write_plan ?? null;
}

export function turnStepDraftActionProductionAtomicWritePlans(draft) {
  return draft?.loop_result?.action_production_atomic_write_plans ?? [];
}

export function turnStepDraftLocalFireAtomicWritePlans(draft) {
  return draft?.loop_result?.local_fire_atomic_write_plans ?? [];
}

export function turnStepDraftSpatialSemanticAtomicWritePlan(draft) {
  return draft?.loop_result?.spatial_semantic_atomic_write_plan ?? null;
}

export function turnStepDraftBackgroundNpcSemanticAtomicWritePlan(draft) {
  return draft?.loop_result?.background_npc_semantic_atomic_write_plan ?? null;
}

export function turnStepDraftPreparedDomainSlice(draft) {
  return turnStepDraftPreparedDomainSlices(draft)[0] ?? null;
}

export function turnStepDraftPreparedDomainSlices(draft) {
  const ledger = turnStepDraftPreparedEffectLedger(draft);
  if (ledger == null) return [];
  const domains = ledger.slices.filter(
    ({ effect_kind: kind }) => kind === 'domain_command');
  const selectedCommandIds = draft.selected_command_ids
    ?? (draft.selected_command_id == null ? [] : [draft.selected_command_id]);
  if (domains.length !== selectedCommandIds.length
      || domains.some(({ owner_ref: ownerRef }, index) =>
        ownerRef !== selectedCommandIds[index])) {
    throw turnFailure(
      'TURN_STEP_PREPARED_EFFECT_INVALID',
      'Prepared domain slices must bind the selected commands in order.'
    );
  }
  return domains;
}

export function buildTurnStepPreparedDomainConsequence(draft) {
  const slices = turnStepDraftPreparedDomainSlices(draft);
  if (slices.length === 0) return null;
  let combined = structuredClone(slices[0].consequence);
  for (const [index, slice] of slices.slice(1).entries()) {
    combined = mergeDomainConsequence(
      combined,
      slice.consequence,
      index + 1
    );
  }
  return deepFreeze(combined);
}

export function buildTurnStepDraftConsequence(draft) {
  const fragments = draft?.loop_result?.consequence_fragments ?? [];
  const status = draft.loop_result.status === 'resolved'
    ? 'resolved'
    : 'partial';
  const consequence = {
    version: 1,
    schema: 'turn_consequence_package',
    status,
    duration_minutes: 0,
    visible_seed: {
      completed_steps: structuredClone(draft.loop_result.completed_steps),
      clarification: structuredClone(draft.loop_result.clarification)
    },
    hidden_update: {},
    state_changes: [],
    suggested_actions: []
  };
  for (const [index, fragment] of fragments.entries()) {
    validateConsequenceFragment(fragment, index);
    consequence.duration_minutes += Number(fragment.duration_minutes ?? 0);
    consequence.visible_seed = mergeRecord(
      consequence.visible_seed,
      fragment.visible_seed ?? {},
      `consequence_fragments[${index}].visible_seed`
    );
    consequence.hidden_update = mergeRecord(
      consequence.hidden_update,
      fragment.hidden_update ?? {},
      `consequence_fragments[${index}].hidden_update`
    );
    consequence.state_changes.push(...structuredClone(
      fragment.state_changes ?? []
    ));
    consequence.suggested_actions.push(...structuredClone(
      fragment.suggested_actions ?? []
    ));
    mergeOptionalScalar(consequence, fragment, 'body_effect_ref', index);
    mergeOptionalScalar(consequence, fragment, 'position_transition', index);
  }
  return deepFreeze(consequence);
}

export function mergeTurnStepDraftConsequence(base, draft) {
  const prepared = buildTurnStepDraftConsequence(draft);
  const merged = {
    ...structuredClone(base),
    duration_minutes: requireDuration(base.duration_minutes, 'command')
      + prepared.duration_minutes,
    visible_seed: mergeRecord(
      prepared.visible_seed,
      base.visible_seed,
      'visible_seed'
    ),
    hidden_update: mergeRecord(
      prepared.hidden_update,
      base.hidden_update,
      'hidden_update'
    ),
    state_changes: [
      ...prepared.state_changes,
      ...structuredClone(base.state_changes ?? [])
    ],
    suggested_actions: [
      ...prepared.suggested_actions,
      ...structuredClone(base.suggested_actions ?? [])
    ]
  };
  mergePreparedScalar(merged, prepared, base, 'body_effect_ref');
  mergePreparedScalar(merged, prepared, base, 'position_transition');
  return deepFreeze(merged);
}

export function turnStepDraftWriteTargets(draft) {
  const loopResult = draft?.loop_result;
  const fragments = loopResult?.write_fragments ?? [];
  const targets = [];
  if (!Array.isArray(fragments)) {
    throw invalidWriteFragment(null,
      'Semantic write_fragments must be an array.');
  }
  if (fragments.length > 0) {
    targets.push({
      target: TURN_STEP_OPERATION_BATCH_TARGET,
      value: turnStepDraftOperationBatch(draft)
    });
  }
  if (loopResult?.clarification) {
    targets.push({
      target: 'party_player_visible_message',
      value: { clarification: structuredClone(loopResult.clarification) }
    });
  }
  return deepFreeze(targets);
}

export function turnStepDraftOperationBatch(draft) {
  const fragments = draft?.loop_result?.write_fragments ?? [];
  return fragments.length === 0
    ? null
    : buildTurnStepOperationBatch(draft.loop_result);
}

export function mergeTurnStepDraftWriteTargets(draftTargets, commandTargets) {
  const merged = [
    ...structuredClone(draftTargets ?? []),
    ...structuredClone(commandTargets ?? [])
  ];
  const owners = new Set();
  for (const target of merged) {
    const name = String(target?.target ?? '').trim();
    if (!name || owners.has(name)) {
      throw turnFailure(
        'TURN_STEP_WRITE_TARGET_CONFLICT',
        `Semantic draft and domain command conflict on ${name || '<empty>'}.`,
        { target: name || null }
      );
    }
    owners.add(name);
  }
  return merged;
}

function mergeRecord(left, right, field) {
  if (!plain(left) || !plain(right)) {
    throw turnFailure(
      'TURN_STEP_CONSEQUENCE_FRAGMENT_INVALID',
      `${field} must be a JSON object.`,
      { field }
    );
  }
  const merged = structuredClone(left ?? {});
  for (const [key, value] of Object.entries(right ?? {})) {
    if (Object.hasOwn(merged, key) && sha256(merged[key]) !== sha256(value)) {
      throw turnFailure(
        'TURN_STEP_CONSEQUENCE_CONFLICT',
        `Semantic draft and domain command conflict on ${field}.${key}.`,
        { field, key }
      );
    }
    merged[key] = structuredClone(value);
  }
  return merged;
}

function validateConsequenceFragment(fragment, index) {
  const allowed = new Set([
    'duration_minutes',
    'visible_seed',
    'hidden_update',
    'state_changes',
    'suggested_actions',
    'body_effect_ref',
    'position_transition'
  ]);
  const valid = plain(fragment)
    && Object.keys(fragment).every((key) => allowed.has(key))
    && (!Object.hasOwn(fragment, 'duration_minutes')
      || validDuration(fragment.duration_minutes))
    && (!Object.hasOwn(fragment, 'visible_seed')
      || plain(fragment.visible_seed))
    && (!Object.hasOwn(fragment, 'hidden_update')
      || plain(fragment.hidden_update))
    && (!Object.hasOwn(fragment, 'state_changes')
      || Array.isArray(fragment.state_changes))
    && (!Object.hasOwn(fragment, 'suggested_actions')
      || Array.isArray(fragment.suggested_actions))
    && (!Object.hasOwn(fragment, 'body_effect_ref')
      || fragment.body_effect_ref === null
      || (typeof fragment.body_effect_ref === 'string'
        && fragment.body_effect_ref.trim().length > 0))
    && (!Object.hasOwn(fragment, 'position_transition')
      || plain(fragment.position_transition));
  if (!valid) {
    throw turnFailure(
      'TURN_STEP_CONSEQUENCE_FRAGMENT_INVALID',
      `Consequence fragment ${index} has unsupported or invalid fields.`,
      { index }
    );
  }
}

function mergeOptionalScalar(target, fragment, key, index) {
  if (!Object.hasOwn(fragment, key)) return;
  if (Object.hasOwn(target, key)
      && sha256(target[key]) !== sha256(fragment[key])) {
    throw turnFailure(
      'TURN_STEP_CONSEQUENCE_CONFLICT',
      `Consequence fragments conflict on ${key}.`,
      { field: key, index }
    );
  }
  target[key] = structuredClone(fragment[key]);
}

function mergePreparedScalar(target, prepared, base, key) {
  if (!Object.hasOwn(prepared, key)) return;
  if (Object.hasOwn(base, key)
      && sha256(prepared[key]) !== sha256(base[key])) {
    throw turnFailure(
      'TURN_STEP_CONSEQUENCE_CONFLICT',
      `Semantic draft and domain command conflict on ${key}.`,
      { field: key }
    );
  }
  target[key] = structuredClone(prepared[key]);
}

function requireDuration(value, owner) {
  if (!validDuration(value)) {
    throw turnFailure(
      'TURN_STEP_CONSEQUENCE_FRAGMENT_INVALID',
      `${owner} duration_minutes must be finite and non-negative.`,
      { owner }
    );
  }
  return Number(value);
}

function validDuration(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0;
}

function mergeDomainConsequence(left, right, index) {
  if (!plain(left) || !plain(right)
      || left.schema !== 'turn_consequence_package'
      || right.schema !== 'turn_consequence_package'
      || left.status !== 'resolved' || right.status !== 'resolved') {
    throw turnFailure(
      'TURN_STEP_CONSEQUENCE_FRAGMENT_INVALID',
      'Prepared domain consequences must be resolved consequence packages.',
      { index }
    );
  }
  const standard = new Set([
    'version', 'schema', 'status', 'duration_minutes', 'visible_seed',
    'hidden_update', 'state_changes', 'suggested_actions',
    'activity_attempt_id'
  ]);
  const merged = {
    ...structuredClone(left),
    duration_minutes: requireDuration(left.duration_minutes, 'domain')
      + requireDuration(right.duration_minutes, 'domain'),
    visible_seed: mergeRecord(
      left.visible_seed, right.visible_seed, `domain_consequences[${index}]`),
    hidden_update: mergeRecord(
      left.hidden_update, right.hidden_update,
      `domain_consequences[${index}].hidden_update`),
    state_changes: [
      ...structuredClone(left.state_changes ?? []),
      ...structuredClone(right.state_changes ?? [])
    ],
    suggested_actions: [
      ...structuredClone(left.suggested_actions ?? []),
      ...structuredClone(right.suggested_actions ?? [])
    ]
  };
  for (const [key, value] of Object.entries(right)) {
    if (standard.has(key)) continue;
    if (Object.hasOwn(merged, key) && sha256(merged[key]) !== sha256(value)) {
      throw turnFailure(
        'TURN_STEP_CONSEQUENCE_CONFLICT',
        `Prepared domain consequences conflict on ${key}.`,
        { field: key, index }
      );
    }
    merged[key] = structuredClone(value);
  }
  return merged;
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
