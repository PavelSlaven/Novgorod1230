# law_justice_governance — правонарушения, процедуры, институты

Статус: **candidate**. Автор данных себя не утверждает (WR §21.1). Приоритет по брифу — M3, но данные собраны
сейчас, так как источники (WK approved claims) уже существуют и не требуют нового исследования.
Группа `game-base-v1`, домен `law_justice_governance`.

## Файлы (`law/`), общая схема (17 колонок, `law_type` различает смысл строки)

| Файл | law_type | Строк | Что внутри |
|---|---|---|---|
| `offences_sanctions.csv` | offence | 19 | 8 WK-backed строк и архивные тематические кандидаты; кандидаты не задают неподтверждённые санкции |
| `procedures.csv` | procedure | 47 | 12 WK-backed строк и архивные тематические кандидаты; права, процедуры и отношения ограничены evidence/caveats |
| `institutions.csv` | institution | 15 | 13 WK-backed строк и 2 архивных темы; летописные эпизоды остаются датированными свидетельствами, не постоянными правилами |

Итого 81 строка: 33 строки на основе 32 approved WK claims и 48 новых архивных записей. Ещё 8 архивных refs прикреплены
к конкретным WK-backed строкам; 4 refs объединены с парными архивными темами в 3 записи. Отдельный `add_variant` добавляет
provenance к owner row, а не отдельную строку. Все архивные записи остаются тематическими scopes,
не новыми игровыми механиками.
Все три файла посчитаны скриптом (`reports/counts.json`).

## Метод

- **Авторский вход** (суждение): `scripts/seed_law_rows.py` классифицирует 32 **уже approved** WK claims
  и учитывает 60 архивных refs: 48 новых тем, 8 ссылок на конкретные правила, 4 refs, объединённых с парными
  темами. Архивная provenance хранится в имеющихся
  полях `source_refs`, `jurisdiction` и `period_caveat`; новый public schema field не добавлялся.
- **Механика** (скрипт): `scripts/build_law.py` проверяет существование и approved-статус WK claims, normalized
  названия, reviewer semantic-merge map с положительными и отрицательными пробами, archive ref, basis,
  confidence, период/регион и per-ref provenance.
- **institutions.csv**: почти каждая строка — единичный датированный летописный эпизод, а не постоянное
  правило (это прямо сказано в самих WK claims). Колонка `period_caveat` переносит эту оговорку в каждую
  строку, чтобы she не потерялась при использовании данных ниже по цепочке (`@rus/social-law`, реакция NPC).
- Связи между общими и частными темами, а также с конкретными правилами/социальными нормами записаны в `note_ru`
  существующих строк как текстовые ссылки. Они не вводят отдельный relation schema и не объединяют записи.
  `witness_requirement` прикреплён к `lw_proc_witness_status_exceptions`. Для B-реконструкций
  `household_property` и `pledged_property` сохранён `basis=logical_necessity`.

## Источники

- **A** (первоисточник): Русская Правда, Пространная редакция — http://www.hist.msu.ru/ER/Etext/RP/
  (МГУ, публикация текста изд. 1953 г.). Статьи процитированы по номерам, данным в approved WK claims
  (`residual-law-norms-v1.json`), НЕ по прямой цитате текста — см. «Известный пробел» ниже.
- **B**: Янин В.Л. «Новгородские посадники», 2-е изд., 2003 — https://www.klex.ru/1fg3.
- **WK production-v1** (approved): `residual-law-norms-v1.json` (19 claims), `residual-government-law-v1.json`
  (7 claims), `residual-government-law-v2.json` (6 claims). Все 32 claim_ref использованы (`reports/validation.json`).
- НПЛ (Новгородская первая летопись) — цитируется как `src_novgorod_first_chronicle`, тем же id, что уже
  используется в `data/novgorod-region/novgorod_social_roles_v1_enriched.tsv`.

## Как собрать

```
cd scripts
python3 build_law.py
```
Скрипт читает `world-knowledge/production-v1/residual-*.json` локального checkout и
`scripts/archive_rule_candidates.json`. Пишет только в эту папку (`law/*.csv`, `reports/*.json`).

## Известные пробелы

- **Денежные суммы не подтверждены и НЕ выдуманы.** Approved WK claims сознательно избегают называть точные
  суммы (гривна/куна/резана/вира/продажа) там, где не проверили издание напрямую — они описывают, ЧТО
  различает статья, а не сколько платить. Попытка получить текст статей через WebFetch с
  http://www.hist.msu.ru/ER/Etext/RP/ 2026-09-26 провалилась дважды: главная страница — фреймсет без текста,
  а `prp_t.htm` вернул содержание, которое НЕ совпадает с WK claims для тех же номеров статей (модель fetch-инструмента
  явно галлюцинировала общий текст о наследстве вместо реальных статей о вире, закупе и телесных повреждениях).
  Этот вывод отброшен и никуда не попал. `amount_units_ref` во всех строках оставлен пустым; резолюция сумм
  на `currencies_measures` и сверка с изданием 1953 г. (сканом или klex/hist.msu после ручной проверки) —
  открытый гэп для следующего прохода, а не то, что можно закрыть скриптом сейчас.
- **conflict_templates / status_and_law_effects (draft, rus13tpl)** ссылаются на «закон» текстом
  (`law_involvement`), но не на конкретные `lw_id` этого домена — связка сделана только для закупа/тиуна/ряда
  через `procedure_refs`/`note_ru` в социальных ролях; остальные 40 конфликтных шаблонов (см.
  `incidents_conflicts/`) не сведены построчно с этим law_justice_governance — это отдельная задача сверки.
- **MASTER `legal_rules`/`property_rules`** представлены 60 archive refs: 48 новых тематических кандидатов,
  8 refs к конкретным действующим правилам и 4 refs, сведённые в 3 канонические темы. Отдельный
  `add_variant` ref прикреплён к существующей записи. Они не утверждают конкретных санкций,
  процедур или прав сверх источников и оговорок crosswalk; широкие topic scopes требуют дальнейшего
  предметного подтверждения. Прямой дубль WK-backed строки не создаётся.
- **Другие WK-семейства**, упомянутые в критике (`residual-law-offence-testimony`,
  `bounded_property_inquiry_and_institutional_contact`) — не найдены отдельными файлами в
  `world-knowledge/production-v1/` под этими именами; вероятно, это внутренние ярлыки семейств claims
  внутри `residual-law-norms-v1.json`/`social-institutions.json`, а не отдельные файлы. Не проверено
  окончательно — гэп для владельца WK.
