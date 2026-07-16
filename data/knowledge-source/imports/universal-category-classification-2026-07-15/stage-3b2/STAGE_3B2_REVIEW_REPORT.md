# Stage 3B-2 — историко-редакторская проверка каталога

**Статус:** `completed_fail_closed_review`
**Регион и период:** Новгородская земля, около 1230 года
**Активация:** запрещена

## Результат

Проверены все 120 draft templates Stage 3B-1. Для каждой строки указан конкретный `source_record_id`; `source family` не используется как доказательство. Пятнадцать существующих bindings пересмотрены и сохранены только как поддержка широкого исторического присутствия. Для оставшихся 105 templates подобран конкретный библиографический source candidate. Ни один binding не доказывает узкую типологию, материал, конструкцию, физические параметры, commonness или социальную доступность без page/object-level extraction.

| Показатель | Значение |
|---|---:|
| Templates | 120 |
| Existing bindings reviewed | 15 |
| Remaining templates with explicit source candidate | 105 |
| Ready for approval | 0 |
| Blocked | 120 |
| Runtime candidate changes | 0 |
| Party-state changes | 0 |

## Принятые решения

1. `historical_presence` отделено от `narrow_typology`; широкая публикация по группе предметов не подтверждает конкретную форму template.
2. Существующие 15 bindings не удалены, но их допустимый смысл ограничен broad presence.
3. Регулярные mass/capacity estimates Stage 3B-1 не проходят физический review: они остаются blocking gaps.
4. Identity-gram quantity profiles не считаются историческими мерами и не задают скрытых количеств.
5. Container compatibility записана как editorial candidate policy, но блокируется до material/construction/capacity review и нормализованных relations.
6. Любая попытка promotion требует полностью approved dependency closure до materialization rule.

## Структура результата

- `SOURCE_REGISTER.json` — конкретные библиографические records и review двух parent records.
- `SOURCE_ASSIGNMENTS.json` — 120 explicit template-to-source assignments, сгруппированных по конкретным source records.
- `REVIEW_POLICIES.json` — обязательные физические, quantity, commonness/access и chain-поля.
- `QUANTITY_MODEL_REVIEW.json` — 12 bulk/food/water/trade templates.
- `CONTAINER_COMPATIBILITY_REVIEW.json` — 18 containers.
- `AUDIT_SUMMARY.json` — детерминированные totals и blocking counts.

## Интеграция

Этот пакет является редакторским evidence layer и не импортируется в `world_base`. Следующий этап должен извлечь для каждого template страницы/каталожные номера/конкретные находки, создать claim-scoped normalized bindings, проверить physical/quantity/compatibility data и только затем сформировать отдельный approved subset.
