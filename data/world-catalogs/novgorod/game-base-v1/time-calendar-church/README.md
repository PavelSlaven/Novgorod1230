# time-calendar-church (candidate, collector pass)

Группа: календарь, праздники и посты, торговые дни, расписания, церковная
практика, жизненный цикл. Собрано сборщиком `collect-time-calendar-church`
по брифу `gb-retry/time-calendar-church.json`. **Статус — candidate,
сборщик не утверждает сам себя** (правило проекта): утверждение — отдельный
проход старшей модели.

## Что внутри

| Домен брифа | Файл(ы) | Строк | README |
|---|---|---|---|
| calendar_feasts_fasts | `time/calendar_1230_1250.csv` | 363 | [time/README.md](time/README.md) |
| schedules_routines | `time/schedules_routines.csv` | 16 | [time/README.md](time/README.md) |
| religion_church | `religion/church_practice.csv` | 148 | [religion/README.md](religion/README.md) |
| lifecycle_rites_burial | `religion/lifecycle_rites_burial.csv` | 19 | [religion/README.md](religion/README.md) |

Все четыре домена из брифа закрыты хотя бы одним candidate-датасетом со
`source_refs` и `confidence` на каждой строке; детали, методы и известные
пробелы — в README каждой подпапки, не повторяются здесь.

## Как пересобрать

```
cd time/scripts    && python paschalia.py --json ../paschalia_1230_1250.json && python build_calendar.py && python check_calendar.py && python build_schedules.py && python check_schedules.py
cd ../../religion/scripts && python build_religion.py && python check_religion.py
```

Все скрипты детерминированные (без сети, без LLM), читают только
перечисленные в README источники и падают ненулевым кодом, если проверка не
проходит (см. вывод `check_*.py`).

## Блокер v17, названный в брифе

Бриф просил «проверить блокер: в v17 temporal_authoring_records = 0, а старт
требует календарную запись». Проверка (read-only, main checkout /
PR #98 worktree) в рамках этой задачи **не выполнялась** — сборщик работал
только в своей поддиректории `Novgorod-game-base`, доступа на запись к
runtime и к БД `world_base` не запрашивал. Календарные данные, которые могли
бы закрыть эту запись (`temporal_authoring_records`, kind=calendar), теперь
есть как candidate в `time/calendar_1230_1250.csv`; перенос approved-версии в
`temporal_authoring_records` — задача владельца/следующего прохода, не этого
сборщика.

## critic_problems из брифа, относящиеся к этой группе

- **region_id/universal-флаг** (#1) — не добавлен ни в один файл этого
  прохода; см. gap в `time/README.md` и `religion/README.md`.
- **schedules_routines приоритет перевёрнут** (#5 в критике) — данные всё
  равно собраны в этом проходе (не отложены), несмотря на официальный
  приоритет M3 в брифе, поскольку зависимость от `npc_runtime_profiles`
  (M2c) была явно указана как перевёрнутая.
- **lifecycle_rites_burial отсутствовал как домен** (#8) — этот сборщик
  первым закрывает его (19 строк, включая непустой пул для G4
  `zaostrovye_burial_area`).
- Остальные critic_problems брифа (personal_items, historical_figures,
  historical_events, price_bands, speech_address, conflict_templates,
  materials_registry, anachronism_denylist_lexicon и т.д.) относятся к
  другим группам/сборщикам и не затронуты здесь.
