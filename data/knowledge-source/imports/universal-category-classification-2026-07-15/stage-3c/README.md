# Stage 3C — promotion в новую world revision

**Статус:** `blocked_by_approved_subset_empty`

## Цель

Подготовить version-pinned promotion новой item/container revision без изменения прежней approved revision, без activation и без автоматического изменения существующих партий.

## Фактический результат

Stage 3B-2 установил `0/120` templates, готовых к approval. Поэтому promotion корректно остановлен typed gap `APPROVED_SUBSET_EMPTY` до начала транзакции. Revision `world_revision_novgorod_1230_item_catalogue_002` не создана и не импортирована.

## Реализованный механизм

`buildRevisionPromotionPlan` требует новую stable revision ID и explicit approval attestation, копирует только перечисленный approved subset, проверяет approved dependency closure, формирует canonical digests, сохраняет rollback plan и запрещает activation внутри promotion.

`applyRevisionPromotionPlan` выполняет insert/readback внутри одной transaction adapter, проверяет count/digest, неизменность parent revision и откатывает транзакцию при mismatch.

## Интеграция

1. Stage 3B должен дать непустой reviewed subset с полной dependency closure.
2. Обновляется exact ID list и approval attestation.
3. Выполняется promotion dry-run и transactional apply/readback.
4. Только отдельной прямой командой выполняется activation.

Текущий Stage 3C не импортировал ни одной строки: это ожидаемый hard block, а не частичный успех.
