# Формулы проекта

## Статус

Этот справочник описывает production v3 formulas. Принятое историческое P28
evidence само не активировало runtime; последующий
`versioned production activation cutover` завершён release
`spatial-v3-production-v1`. v2 выведен из корпуса (#146 шаг 4) и не является production-правилом
и не смешан с v3. Профильные документы владеют назначением формул;
этот файл — единственный источник их записи и owner mapping.

Для Temporal World v4 профильным active target-нормативом является
`temporal_world_and_interruptible_activities.md`. Формулы ниже используют
decimal-string rational DTO и exact `BigInt` core; ни один consumer не
округляет duration и не переносит domain effects в time owner.

## 1. Движение: positive rational factor model

```text
exact_interval_duration = base_minutes
                        × method_factor
                        × environment_factor
                        × load_factor
                        × body_factor
                        × pace_factor
                        × interval_progress_fraction
                        + explicit_additive_delays
```

Все множители — положительные reduced rationals. `base_minutes` уже включает permanent geometry, normal surface, ordinary gradient и normal path quality одного baseline method; эти факты повторно не множатся. Иной method получает один approved rational factor или отдельный authored segment/route variant.

`environment_factor` — ровно один approved composite/worst applicable factor для weather, light и transient terrain. Нельзя независимо стекать mud/snow/darkness без ADR. Fixed waiting, ferry queue и аналогичные fixed costs — `explicit_additive_delays`, не multiplier.

## 2. Exact clock и slicing invariant

```text
world_time_after = world_time_before + actual_exact_elapsed
crossed_whole_minute_boundaries = whole_minute_index(after) - whole_minute_index(before)
```

`actual_exact_elapsed` хранится reduced rational. Любое разбиение одной физической длительности на slices обязано сохранять final timestamp, cumulative elapsed и total crossed boundaries. Округление не является authoritative update.

## 3. Delay identity

```text
delay_application_identity = versioned_delay_ref + application_scope + occurrence_key
```

Одна identity применяется не более одного раза under idempotency. `segment_once`/`step_once` не повторяются между technical slices; `interval_once` создаётся interval recheck. Missing, duplicate или nonpositive factor/delay — typed rejection (`time_delay_occurrence_invalid`/`time_factor_invalid`).

## 4. Владельцы

| Formula / invariant | Единственный owner | Потребители |
|---|---|---|
| duration и factor/delay resolution | `@rus/movement-routes` | turn, time events |
| exact timestamp и crossed-minute derivation | `@rus/time-events-history` | turn, persistence |
| dynamic snapshot | `@rus/movement-routes` | traversal executor |
| synchronized carrier-local slice | turn orchestrator | movement, time events |
| body effects from elapsed time | `@rus/body-state` | turn boundary handler |
| NPC schedule/perception effects | `@rus/npc-runtime` | turn boundary handler |
| weather/light effects | `@rus/environment-state` | turn boundary handler |
| historical phase local effects | профильный domain owner | turn boundary handler |
| remote catch-up/propagation | `@rus/world-processes` | turn boundary handler |

Consumers не копируют формулы и не пересчитывают duration. Target источник:
`spatial_architecture_standard_g0_g6.md` §11.2–§11.10. До `versioned
production activation cutover` это target, не active runtime formula.


---
