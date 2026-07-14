# @rus/cutover

## Назначение

Автономный migration-tool для управляемого 13-шагового переключения с legacy route на modular runtime. Инструмент применяет только versioned feature-flag profiles, запускает обязательные gates и выпускает доказуемый cutover report.

## Что модуль владеет

- контрактом `rus.cutover_plan.v1`;
- контрактом `rus.cutover_report.v1`;
- накопительным feature-flag profile для каждого шага;
- запуском smoke, полного shadow corpus, DB dry-run, diagnostics и rollback checks;
- статическим доказательством, что modular runtime import graph не входит в `legacy/`;
- рекомендацией `cutover_complete` или `no_go`.

## Что модуль не делает

- не удаляет legacy source;
- не меняет игровые правила и не создаёт данные мира;
- не вызывает live provider и не пишет в production DB;
- не пропускает шаги и не объявляет default до прохождения gates;
- не хранит секреты и не изменяет deployment environment автоматически.

## Public API

`loadCutoverPlan`, `validateCutoverPlan`, `buildCutoverProfile`, `inspectRuntimeImportGraph`, `runStagedCutover`, `renderCutoverReportMarkdown`.

## Инварианты

Шаги идут строго 1-13. Каждый шаг обязан пройти smoke, shadow, DB dry-run, diagnostics и rollback. Modular default допустим только после шага game-web. Любой failed gate или import в `legacy/` блокирует cutover. Legacy остаётся явным rollback route до финализации.
