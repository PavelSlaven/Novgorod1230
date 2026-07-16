# Stage 3B-1 — журнал решений

Все решения ниже действуют только для draft authoring bundle PR №7. Они не повышают `universal_category_classification_policy.md` выше `proposed` и не изменяют active materialization architecture.

| ID | Решение | Причина и отклонённая альтернатива | Совместимость и граница |
|---|---|---|---|
| D3B1-001 | Использовать отдельный supplemental manifest из 25 datasets. | Нельзя смешивать draft editorial data с approved base archive; отклонён вариант изменения `rus13-base-v1.tar.gz`. | `deletion_policy = none`; production import и runtime loading отсутствуют. |
| D3B1-002 | Сохранить 120 broad templates как `draft`: 102 items и 18 containers. | Исторические source families не дают основания утверждать узкую типологию, материал, массу или commonness; отклонено guessed enrichment. | Existing templates/party instances не удаляются и не рематериализуются. |
| D3B1-003 | Хранить category/template/profile/source links через FK-normalized rows. | Queryable plural IDs не могут быть единственным JSONB; отклонены ID arrays и free-text categories. | Existing legacy fields сохраняются до отдельного reviewed cutover. |
| D3B1-004 | На Stage 3B-1 15 typed source bindings оставались `draft/needs_review`, а 105 templates — explicit source gap. | Parent archive тогда доказуемо содержал только эти source IDs; отклонено преобразование source family или external mapping в historical approval. Этот historical state позднее заменён Stage 3B-2 source register, но reviewed closure всё ещё не достигнута. | Ни source binding, ни mapping не создают regional permission/materialization rule. |
| D3B1-005 | Bulk quantity profiles используют `g` и `explicit_only`. | Нужна детерминированная нормализованная единица без default; отклонены guessed historical measures и quantity fallback. | Profile draft-only; Stage 16 hard-blocks missing declared unit. |
| D3B1-006 | General container compatibility остаётся coarse; explicit entries есть только для специализированных containers. | Материал/closure/condition не прошли review; отклонено broad implicit permission для liquid/hot/sharp/bulky content. | Empty container разрешён лишь explicit candidate; runtime не расширяется. |
| D3B1-007 | Parent source IDs верифицируются digest-checked archive/CSV utility. | Audit ledger не может быть единственным evidence source; отклонён ручной allowlist external IDs. | Utility read-only; ошибочный archive/dataset/record создаёт `PARENT_SOURCE_*` hard block. |
| D3B1-008 | Promotion report генерируется из bundle, но не заявляет результат PostgreSQL lifecycle. | Generator не запускает PostgreSQL; отклонён статический `PASS` claim. | Фактическая PostgreSQL evidence остаётся в `POSTGRESQL_INTEGRATION_REPORT.md`; report фиксирует только derived readiness. |
| D3B1-009 | Activation proposal неисполняемый и предлагает 0 approved records. | Нет reviewed historical/material/physical/compatibility/legacy gates; отклонена частичная activation. | Не меняются revision status, runtime candidates и party instances. |
| D3C-010 | Promotion требует exact all-120 cohort, digest-bound human attestations и verified operator legacy export. | Partial approval скрывает неполную dependency closure; отклонены subset promotion и вывод об отсутствии legacy rows из пустого GitHub bundle. | Новый revision создаётся только transaction adapter-ом, остаётся inactive, parent revision и party pins не меняются. |

## Следующие решения, требующие отдельного задания

1. reviewed individual bibliography для 105 templates и review 15 draft bindings;
2. material, physical, quantity и container-compatibility review;
3. export и reviewed migration inventory external/local legacy rows;
4. формирование approved dependency closure и отдельный activation proposal/transaction.
