# social-strata-law — сословия, право и суд, бытовые конфликты

Коллектор: `collect-social-strata-law`. Статус группы: **candidate во всех трёх доменах** — ни одна строка
не утверждена самостоятельно (WR §21.1); утверждение — отдельный проход старшей модели/владельца.

Бриф коллектора: `scratchpad/gb-retry/social-strata-law.json` (прочитан целиком перед началом сборки).

## Домены

| Папка | Домен(ы) брифа | Приоритет брифа | Статус |
|---|---|---|---|
| `social_strata_legal_status/` | `social_strata_legal_status` | M2c | 11 новых кандидатов ролей, все archetype id проверены скриптом против approved seeds |
| `law_justice_governance/` | `law_justice_governance` | M3 | 33 строки из 32 approved WK claims (Русская Правда + новгородские летописные институты), все claim_ref проверены скриптом |
| `incidents_conflicts/` | `incidents_conflicts` | M3 | 40 конфликтов + 15 вспомогательных строк из черновика rus13tpl, тип и участники резолвлены и проверены скриптом |

Итого новых строк: **11 + 33 + 55 = 99**, во всех — `source_refs` и `confidence`, посчитано скриптами
(`*/reports/counts.json` в каждой папке).

## Что НЕ сделано (сознательно, не потеряно — см. README каждого домена)

- Денежные суммы Русской Правды (гривна/куна/резана) не подтверждены прямой цитатой издания — попытка
  получить текст через WebFetch дала галлюцинированный результат, который отброшен; суммы оставлены пустыми,
  а не выдуманы (`law_justice_governance/README.md`).
- `pf_ids` и `timer_rule` для `incidents_conflicts` не резолвлены (нужен отдельный словарь мест и отдельный
  черновик таймеров, который вообще не имеет владельца в каталоге — см. критику брифа).
- Более широкая ревизия женских/возрастных ролей сверх явно запрошенных в брифе не проводилась.
- MASTER `legal_rules`/`property_rules`/`social_role_profiles` (economy_social) прочитаны и признаны слишком
  общими (топик-уровень, без сумм и статей) для механического слияния — не включены построчно, чтобы не
  разбавлять данные WK-claims более низким качеством источника.

## Как пересобрать всё

```
cd social_strata_legal_status/scripts && python build_roles.py
cd ../../law_justice_governance/scripts && python build_law.py
cd ../../incidents_conflicts/scripts && python build_incidents.py
```
Каждый скрипт только читает main checkout (`C:/Users/Slaven/Documents/Novgorod`, read-only) и, где нужно,
PR #98 worktree (`C:/Users/Slaven/Documents/Novgorod-runtime`, read-only, только `infra/world-base/schema/05.sql`
на чтение constraint-списка). Пишет только внутри своей папки.
