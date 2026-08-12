# @rus/social-law

## Назначение

Social role and occupation references, rights, restrictions, authority and legal consequence packages. Код модуля работает только с переданными данными и не создаёт смысловые сущности мира.

## Владеет

- social bindings and references
- rights/restriction evaluation
- authority and social-risk contracts
- legal consequence packages
- party-local commitment proposal from committed conversation facts
- temporary custody/property/promise applicability и typed temporary
  disposition proposal только из committed facts и approved contract

## Не делает

- inventing laws or social roles
- NPC motivations
- rolling checks or persistence

## Public API

- `validateSocialBinding`
- `evaluateRights`
- `validateAuthorityReference`
- `buildSocialRisk`
- `buildLegalConsequencePackage`
- `planPromiseLifecycle`
- `planPartyLocalCommitment`
- `resolveTemporaryDispositionOptions`
- `buildTemporaryDispositionProposal`

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. `resolveTemporaryDispositionOptions` вычисляет applicability только из committed facts; `buildTemporaryDispositionProposal` принимает уже сделанный игроком и проверенный `@rus/turn` exact selection и не выбирает вариант самостоятельно. `planPromiseLifecycle` принимает переданную exact approved policy и строит proposal только для разрешённых ею `initialize`, `not_offered → offered` или `offered → active`; `planPartyLocalCommitment` связывает только уже committed statement/perception/surrender facts и фактических witnesses. Policy отдельно задаёт стороны, обязанные полностью воспринять offer, и стороны, обязанные полностью воспринять acceptance; без factual acceptance perception commitment остаётся `offered`. Social delivery/check quality не активирует обещание самостоятельно и не выбирает ответ NPC. Persistence, legal completion и semantic fallback запрещены. Выходы, которые предназначены для handoff, замораживаются. Нарушения структуры возвращаются как `{ ok, errors }` либо выбрасываются только для неверно подключённого технического порта.

## Зависимости

Разрешён только `@rus/kernel`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. `planPromiseLifecycle` fail-closed выбрасывает `PromiseLifecyclePlanningError` с machine-readable `code`. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они существовали, но не импортирует legacy runtime. Unit/contract tests находятся в `test/domain.test.js`. Cutover выполняется отдельно после shadow run.
