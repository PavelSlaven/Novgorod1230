# @rus/body-state

## Назначение

Pure owner body metrics and target Temporal v4 body-time proposals. Из exact elapsed, approved body profile, explicit body/environment/condition context and pins он выводит изменение тела либо ближайший threshold boundary; clock arithmetic не дублирует.

## Владеет

- Владеет `health`/`satiety`/`energy`, conditions, body-state validation/modifiers, `calculateBodyTimeEffectProposal`, `predictNearestBodyThreshold`, direct-event body transition и edge-triggered threshold crossing между authoritative before/after states.
- Сохраняет supplied approved `decision_signal` descriptor на crossing; не вычисляет его category/significance и не создаёт NPC boundary.

## Не владеет

Не владеет clock/calendar/boundary selection, activity/traversal duration, combat intent, biography, persistence, DB, narration или effect commit.

## Public API и контракты

`BODY_METRICS`, `clampBodyMetric`, `normalizeBodyState`, `applyBodyStateChange`, `applyApprovedFixedBodyEffect`, `detectBodyThresholdCrossings`, `stateModifier`, `validateBodyState`; target API принимает closed approved profile + exact rational elapsed (или `(window_start, window_end]`), explicit `body_state_ref`, scope, environment snapshot, conditions and matching dependency pins. `applyApprovedFixedBodyEffect` отдельно применяет один exact digest-pinned semantic/direct event без владения clock или persistence. `detectBodyThresholdCrossings` сравнивает before/after, выдаёт crossing только на ребре и переносит approved generic `self` descriptor без самостоятельного выбора semantic significance. Выход — frozen `{ ok: true, body_change_proposal | threshold_candidate, validation_report, trace }`; threshold can be `null` when none is reached.

Versioned declarative registry `src/declarative-content-contracts.v2.json` exact-supersedes v1 и добавляет schema `rus.trace_body_environment_profiles.v2`. Runtime-ready fixed effect обязан содержать точные числовые deltas, точные `from`/`to` condition outcomes, единственную policy `fixed_approved_effect` и запрет RNG; ranges, `may`, aliases и неявный выбор значения блокируют admission. Registry остаётся generic: он не содержит scenario-specific IDs, runtime handlers или persistence.

## Ошибки, зависимости и effects

Malformed legacy body values return validation errors or range/type errors. Target inputs fail closed as `{ ok:false, status:'hard_block', error:{ code, message } }`, including `event_rule_gap`, `event_effect_gap`, `time_elapsed_invalid`, `generated_schema_mismatch`; approved-profile/pin gaps are never repaired locally. Depends on `@rus/kernel`, `@rus/contracts`, `@rus/time-events-history`; has no side effects, I/O, DB or LLM and never commits a proposal.

## Target / activation и тесты

Current `temporal-world-v1.1` / `4.4.0-target.1` behavior (with immutable
`temporal-world-v1` / `4.3.0-target.1` baseline) is active in
`spatial-v3-production-v1`. Historical P28 evidence did not activate it; the
later `versioned production activation cutover` did. Current revision 16 /
`spatial-v3-production-v6` retains that owner and additionally activates
direct-harm body transitions, edge-triggered threshold descriptors and their
one-writer handoff to the common combat/NPC signal pipeline; production v5 is
the explicit rollback source. `test/domain.test.js` covers base body API and
Temporal proposal/threshold hard-block behavior.
