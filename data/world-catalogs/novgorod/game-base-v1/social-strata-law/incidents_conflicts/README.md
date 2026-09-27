# incidents_conflicts — бытовые конфликты и происшествия

Статус: **candidate**. Автор данных себя не утверждает (WR §21.1). Приоритет по брифу — M3.
Группа `game-base-v1`, домен `incidents_conflicts`, целевая таблица `world_base.conflict_templates`
(сейчас 0 строк; DDL — `infra/world-base/schema/05.sql` в PR #98 worktree, read-only).

## Файлы (`conflicts/`)

| Файл | Строк | Что внутри |
|---|---|---|
| `incidents.csv` | 40 | Одна строка на каждый шаблон конфликта из черновика rus13tpl: тип, место, участники, триггеры, признаки, эскалация, разрешение, реакция власти/церкви, память |
| `escalation_rules.csv` | 5 | Общие правила эскалации (кто оскорблён, попытка силой забрать вещь и т.п.) — пропущены через скрипт как есть |
| `resolution_rules.csv` | 5 | Общие способы разрешения (свидетель, старший, мировая и т.п.) |
| `status_law_effects.csv` | 5 | Правила влияния статуса на подозрение и обвинение |

Все четыре файла посчитаны скриптом (`reports/counts.json`).

## Метод

- **Источник** (черновик, не утверждён): `tools/rus13-novgorod-regional-templates/novgorod_local_conflict_templates_v1.json`
  (main checkout) — 40 `conflict_templates` + 5 `conflict_escalation_rules` + 5 `conflict_resolution_rules` +
  5 `status_and_law_effects`, `status: draft`, `requires_human_audit: true`.
- **conflict_type**: у 40 шаблонов сценарные типы (`boat_damage`, `closed_ferry`, `runaway_suspicion`, ...),
  а не 14 значений из CHECK-constraint `world_base.conflict_templates.conflict_type`
  (`debt, property, trade, family, labor, status, religious, road, theft, violence, tax, duty, stranger, resource` —
  проверено скриптом напрямую по `05.sql` в PR #98 worktree). `scripts/participant_and_type_map.py` содержит
  явную таблицу перевода всех 40 значений в один из 14 — это классификационное суждение, не механика; 5 из
  40 (`beasts`, `famine`, `disease`, `witness`, `boat_damage`) отмечены как **слабое соответствие** и перечислены
  в отчёте (`reports/validation.json.weak_fit_conflict_types_used`) — голод и болезнь по своей природе не спор
  между людьми, а фоновое кризисное состояние; они помещены в `resource` только как наименее плохой вариант
  из 14 и требуют решения владельца при утверждении (возможно, для них нужна отдельная категория вне
  `conflict_type`, а не подгонка).
- **Участники**: 73 различных русских термина в `participants_by_role` резолвлены в `nov_role_*` (пинованный
  файл или `social_strata_legal_status/roles/new_role_candidates.tsv`), в `nov_occ_*`
  (`novgorod_occupations_v1_enriched.tsv`) или явно оставлены `generic:<label>`, когда термин — сюжетная функция,
  а не тип человека («две стороны», «обидчик», «обиженный», «случайные люди», «сосед» и т.п.). Скрипт проверяет,
  что каждый `role`/`occupation` реально существует; `generic` — осознанный, а не пропущенный случай.
- **Разрешение (resolution_refs)**: только 3 шаблона (`conflict_debt_dispute`, `conflict_witness_argument`,
  `conflict_guarantor`) явно и однозначно сведены с конкретной строкой `law_justice_governance`
  (`lw_proc_debt_denial_witness_oath`, `lw_proc_witness_status_exceptions`, `lw_proc_zakup_complaint_route`).
  Остальные 37 помечены `обычай, C` — в самом источнике разрешение описано обычаем (свидетель, мировая,
  посредник), а не статьёй закона, и выдумывать более точную ссылку значило бы фабриковать связь, которой
  источник не даёт.

## Как собрать

```
cd scripts
python build_incidents.py
```
Скрипт читает: черновик rus13tpl и `05.sql` (PR #98 worktree) — оба read-only; пинованный TSV ролей и
occupations TSV (main checkout, read-only); собственный `new_role_candidates.tsv` из
`social_strata_legal_status/` (эта же коллекция, читается, не пишется). Пишет только в эту папку.

## Известные пробелы

- **`pf_ids` не резолвлены.** 42 русских обозначения места (`двор`, `торг`, `брод`, `лодочная зона`, ...) оставлены
  как есть в колонке `where_common_ru`; перевод в `pf_id` из `place-first-cartography.json` (WK) требует того же
  типа словаря перевода, что уже сделан для вещей в `items-household-personal/items/archetype_pf_map.csv` —
  не сделано в этом проходе по времени, это следующий шаг перед импортом в `world_base.conflict_templates`
  (acceptance-правило брифа этого не требовало явно, но таблица без `pf_id` не резолвит презенс-правила).
- **`timer_rule` пуст.** Таймеры относятся к отдельному черновику
  `tools/rus13-novgorod-regional-templates/novgorod_deferred_event_templates_v1.json` (41 шаблон, 4 timer_rules,
  5 visibility_rules, 5 memory_rules) — как отметил critic, у этого файла нет домена-владельца в каталоге вообще
  (не только для incidents_conflicts). Читать/сводить этот файл здесь не входило в бриф этой коллекции построчно
  (бриф упоминает его только как цель "через CR"); он не тронут и не скопирован, чтобы не создавать второго
  неполного владельца для него без решения архитектора.
- **`frequency_class` = `unspecified` во всех 40 строках.** Источник не даёт частотный класс ни по одному
  правилу (в отличие, например, от `item_place_frequency`, где класс явно указан в master); присвоение
  частоты без основания запрещено правилом проекта («Частоты/веса только по заявленному правилу»), поэтому
  оставлено пустым, а не угадано.
- **`conflict_type` DDL перечень слишком узкий для этого черновика** — сама формулировка брифа отметила
  это как ошибку каталога (`conflict_templates` был указан целью только у `military_security`, хотя почти
  все 40 типов мирные); эта коллекция не меняет DDL и не решает вопрос владельца, только документирует
  перевод 40→14 как явное классификационное суждение для будущего аудита.
