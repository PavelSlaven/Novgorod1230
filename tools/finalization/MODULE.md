# @rus/finalization

## Назначение

Автономный migration-tool для доказуемой финализации модульной миграции после staged cutover. Он проверяет release evidence, фиксирует автоматические gates и отделяет их от действий, которые может подтвердить только оператор или владелец проекта.

## Что модуль владеет

- контрактом `rus.finalization_plan.v1`;
- контрактом `rus.finalization_report.v1`;
- проверкой cutover, shadow, test, restore и runtime-import evidence;
- проверкой сохранения explicit legacy rollback route;
- чтением manual delete checklist без автоматического подтверждения;
- решением `automation_complete_manual_hold`, `finalization_complete` или `no_go`.

## Что модуль не делает

- не удаляет legacy source;
- не меняет live deployment configuration, credentials или production DB;
- не создаёт внешний архив старой папки без явно переданного оператором файла;
- не ставит подписи и не отмечает ручные пункты от имени владельца;
- не меняет игровые правила и состояние мира.

## Public API

`loadFinalizationPlan`, `validateFinalizationPlan`, `parseManualChecklist`, `collectFinalizationEvidence`, `runFinalization`, `renderFinalizationReportMarkdown`.

## Инварианты

Автоматические gates должны быть воспроизводимы из файлов релиза. Ручные gates всегда fail-closed. Полная финализация допустима только при явном operator evidence; отсутствие такого evidence не является ошибкой автоматической части, но сохраняет manual hold. Автоматическое удаление legacy запрещено при любом результате.
