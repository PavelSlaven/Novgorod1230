# @rus/environment-state

## Назначение

`@rus/environment-state` — active-norm Temporal World v4 owner чистого вывода
weather/light/access environment state и boundary-effect proposals.
Historical P28 evidence не активировало runtime; последующий `versioned
production activation cutover` release `spatial-v3-production-v1` включил
его в sole production v3 composition.

## Владеет

- применением supplied approved weather, light и access profiles к supplied exact clock;
- выводом environment snapshot и ближайших domain boundaries;
- proposal соответствующего weather, light или access effect.

## Не владеет

Не владеет exact clock arithmetic и due-time scheduling (`@rus/time-events-history`), place/access persistence or validation boundary (`@rus/turn`/`@rus/party-store`), start-time environment gate, narration или workflow orchestration.

## Public API

- `findNearestEnvironmentBoundaries(input)` — frozen ordered formal `temporal_boundary_candidate` set для weather, light или place access.
- `deriveEnvironment(input)` — frozen environment snapshot с одним composite movement factor и ближайшей boundary.
- `proposeEnvironmentBoundaryEffect({ input, candidate })` — frozen proposal `weather_transition`, `light_transition` или `portal_access_invalidated` только для кандидата из текущего approved set.

## Формальные контракты

Input включает exact clock, sealed approved weather/light transition profiles, place-access context, composition policy и dependency pins. Все применимые profile/policy/provenance refs должны быть version-pinned; input не изменяется. Outputs содержат status, formal result/proposal и trace. Движение использует один factor по approved `maximum_rational` composition, не складывает weather и light factors. Boundary order — exact timestamp, затем boundary id; interval `(from,to]` передаётся в trace.

## Typed errors и gaps

При неверном exact timestamp, absent/incompatible profile or pins, empty candidate set или неразрешённом effect proposal возвращается frozen hard block с `time_timestamp_invalid`, `weather_profile_gap` или `event_rule_gap`; contract failure даёт `generated_schema_mismatch`. Нет default weather/light/access override и нет semantic fallback.

## Зависимости, IO и persistence

Разрешены `@rus/kernel`, `@rus/contracts` и `@rus/time-events-history`. Пакет не читает DB, network, LLM, narration, UI, global clock или random source, не обращается к authoring data самостоятельно и не имеет side effects. Он не пишет SQL и не создаёт persistence plan: `@rus/turn` — единственный workflow consumer, а factual commit выполняет target `CombinedAtomicCommitter`.

## Activation и тесты

В active `spatial-v3-production-v1` предложения применяются только единым
combined write plan; rollback отбрасывает uncommitted proposal. Production v2
не является fallback. Partial activation, dual write и перерасчёт уже
committed facts из изменившихся authoring data запрещены. Tests:
`test/environment-state.test.js` проверяет
dawn/light, artificial light и weather transition, exact ordering boundaries,
access invalidation proposal, typed blocks и отсутствие implicit defaults.
