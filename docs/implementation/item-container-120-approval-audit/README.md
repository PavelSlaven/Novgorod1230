# Item/container 120 approval audit

## Цель

Проверить фактическую готовность полного набора из 120 item/container templates к approval и promotion. Если все обязательные gates выполнены — подготовить approval. Если хотя бы один обязательный gate не выполнен — сохранить fail-closed результат без изменения статусов шаблонов.

## Каноническая база проверки

- Repository: `PavelSlaven/Novgorod1230`.
- Base branch: `main`.
- Base commit: `8c9e8db9b275e2be9b9e5eb28b59c49e8baef068`.
- Working branch: `chatgpt/item-container-120-approval-audit`.

Изучены актуальные:

- `AGENTS.md`;
- `.github/AGENTS.md`;
- `data/knowledge-source/corpus/DOCUMENTS/development_rules.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/code_critic_invocation_rule.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md`;
- `data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b1/PROMOTION_READINESS_REPORT.md`;
- `data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b2/STAGE_3B2_REVIEW_REPORT.md`;
- `data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b2/AUDIT_SUMMARY.json`;
- `data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3c/PROMOTION_RESULT.json`;
- `data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b1/bundle/item_templates.json`.

## Фактический результат

Approval не выполнен.

Канонические reports фиксируют:

- templates total: `120`;
- item templates: `102`;
- container templates: `18`;
- ready for approval: `0`;
- blocked: `120`;
- activation: `forbidden`;
- promotion result: `blocked`;
- target revision: `blocked_not_created`;
- inserted rows: `0`.

Все 120 templates остаются `draft`.

## Блокирующие gates

По `AUDIT_SUMMARY.json` полный набор заблокирован по следующим обязательным направлениям:

- narrow typology: 120;
- dating and region: 120;
- materials and construction: 120;
- physical parameters: 120;
- commonness and access: 120;
- quantity models: 12;
- container compatibility: 18;
- materialization chain: 120.

`STAGE_3B2_REVIEW_REPORT.md` подтверждает, что для 120 templates подобраны source candidates, но отсутствуют page/object-level extraction и claim-scoped evidence, необходимые для утверждения конкретной типологии, материала, конструкции, физических параметров, распространённости и социальной доступности.

## Принятое решение

Статусы шаблонов не изменяются. Approval attestation, promotion request и новая world revision не создаются.

Это соответствует fail-closed требованиям проекта:

- код и процесс не могут считать отсутствие evidence разрешением;
- пустой approved candidate set является hard block;
- частичная promotion полного набора запрещена текущим контрактом;
- human approval не может заменить отсутствующие исторические и технические evidence bindings.

## Что требуется до повторного approval

Для каждого template необходимо закрыть его фактические blockers утверждёнными данными и повторно запустить штатный all-120 readiness gate. Approval допустим только когда report вернёт:

- `templates_ready_for_approval = 120`;
- `templates_blocked = 0`;
- `approval_cohort_ready = true`;
- полную approved dependency closure.

## Изменённые файлы

- добавлен только этот audit README;
- игровые данные, template statuses, runtime candidates, revisions, DDL и код не изменялись.

## Проверки

Фактически выполнена сверка канонических файлов GitHub `main` и их согласованности по totals/statuses. Локальные npm/PostgreSQL/Graphify проверки не запускались: в текущей среде отсутствует канонический локальный checkout, а правила проекта запрещают использовать GitHub API как замену локальной разработке и тестам.

## Аудит

Результат содержательного аудита: `CHANGES REQUIRED BEFORE APPROVAL`.

Это не результат отдельного агента-критика и не заявляется как `PASS`. Отдельный critic должен быть вызван после фактического закрытия evidence gaps и подготовки approval-кандидата.

## Ограничения

Этот PR документирует текущий fail-closed статус и даёт Codex точную точку сверки. Он не утверждает, что шаблоны исторически неверны; он утверждает только, что канонический пакет на текущем `main` не содержит достаточных evidence и approved dependency closure для их promotion.
