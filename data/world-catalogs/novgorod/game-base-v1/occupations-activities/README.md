# occupations-activities — collector report

Коллектор: `collect-occupations-activities`. Все данные — `status=candidate`, не утверждены самим коллектором (правило проекта: автор не утверждает сам себя).

## Что сделано (со счётом по скриптам)

| Домен | Файл | Строк | Метод |
|---|---|---|---|
| occupations | `occupations/occupations_additions.csv` | 18 | keyword-поиск по `professions.csv` (скрипт) + авторская адаптация полей под схему `novgorod_occupations_v1_enriched.tsv`; проверено `check_occupations_additions.py` |
| carried_inventories | `carried_inventories/carried_inventories.csv` | 26 | чистая экстракция из `inventory_profiles.csv` (скрипт, без авторства) |
| activities_observable | `activities_observable/activities_new_occupations.csv` | 135 | чистая экстракция + cycle-check из `activities.csv`, ограничена 27 `PRO####` за 18 новыми occupation-строками |
| npc_runtime_profiles | — (README только) | 0 | не начато: ключевые источники (PR#98 `m2c-npc`, `rus13tpl npc_archetypes`) не в `sources_copied`, требуют либо копирования координатором, либо чтения из read-only PR#98 worktree отдельным проходом |
| skills_competences | — (README только) | 0 | не начато: требует живого чтения `world_base.skill_catalog`/`occupation_skill_defaults` (БД не запрашивалась) и WK apprenticeship-семейства |

## Главный результат для проекта

18 реально засвидетельствованных в источниках новгородских ремёсел (professions.csv master-архива + одна дозаполненная позиция по палитре тканей), которых не было в pinned `novgorod_occupations_v1_enriched.tsv`: ювелир-литейщик, косторез, токарь по дереву, скорняк, красильщик, верёвочник/канатчик, сетевязальщик, замочник, лучник-мастер, стрельник, каменщик, известежог, иконописец, пивовар/медовар, мясник, хлебник (рыночный), рыботорговец, кормилица — каждое с полным набором обязательных полей runtime-basis и явным `source_refs`.

Один занятие из брифа — **щитник** — не закрыто: в доступных источниках не нашлось отдельной ремесленной специализации, отличной от кузнеца/кожевника/плотника (см. gaps в `occupations/README.md`).

## Что НЕ сделано (сведено, без повтора деталей — см. README каждого домена)

- Перевод 31 caution-занятия существующего TSV в approved — не начато.
- Полный домен `npc_runtime_profiles` (профили для 55 занятий без профиля) — не начато.
- Полный домен `activities_observable` за пределами 18 новых занятий (2442 строки × 68+ занятий) — не начато, только узкая связанная часть.
- Полный домен `skills_competences` (разложение 12 навыков на подвиды) — не начато.
- Сверка через BOOK EVIDENCE (remote-машина, `ssh servak`) — не выполнена ни для одного домена в этом проходе.
- Живой запрос к `world_base` через `docker exec world-base-postgres-1 psql` — не выполнялся (контейнер не проверялся; экономия бюджета, так как для выполненной части он не был строго необходим).

## Критик-проблемы брифа

Критические замечания `critic_problems` из брифа коллектора (region_id/universal слой, приоритеты M2c/M3, отсутствующие источники sqlite/PDF/TSV) относятся к архитектурному триажу всего каталога и не были частью мандата этого collector-прохода (только «occupations-activities»); зафиксированы как контекст, не адресованы здесь.
