# Группа items-weapons-armour: оружие, доспех, военная организация и охрана

Статус: **candidate**. Сам себя сборщик не утверждает. Домены:

- `items/` — домен **weapons_armour**: оружие, доспех, право ношения, профили снаряжения, denylist. Подробности в `items/README.md`.
- `military/` — домен **military_security**: отряды, посты, укрепления, последствия, события 1220–1245 гг., вероятность боя по роли. Подробности в `military/README.md`.

## Как пересобрать

```
node scripts/build.cjs      # authoring/*.json + снимок MASTER + TSV репо -> items/*.csv, military/*.csv, counts.json
node scripts/validate.cjs   # проверки и резолв ссылок -> validation_report.json (exit 1 при ошибках)
```

Скрипт `scripts/snapshot-master.cjs <MASTER .../normalized_source_tables/occupations>` запускается один раз. Он снимает военные строки MASTER в `authoring/master_military_snapshot.csv` и `authoring/master_sources_snapshot.csv`, чтобы для сборки не был нужен архив.

## Авторский вход (`authoring/`)

- `weapon_kinds.json` — 71 вид со ссылками на источники; `out_of_scope` — записи источников, которые относятся к другим доменам.
- `access.json` — классы права ношения, матрица доступа, overrides.
- `equipment_profiles.json` — 16 профилей снаряжения с правилом весов.
- `military.json` — отряды, посты, укрепления, последствия, события и оценки вероятности боя.
- `denylist.json` — 27 запретов.
- `literature.json` — 17 библиографических источников с URL и уровнем A/B/C.

## Формат ссылок (`source_refs`)

`wk:claim:<id>` (WK production-v1, проверяется статус approved) · `master:mc:<ITEM_ID>` (MASTER_ARCHIVE_v1 material_culture_items, снимок) · `costume:<ID>` / `costume:anti:<ID>` · `v5:<id>` (item-container-120-v5 candidate) · `tsv:role:<id>#<поле>` / `tsv:occ:<id>#<поле>` (data/novgorod-region) · `timeline:<event_id>` (аудит nov-region) · `sqlite:<таблица>:<ключ>` (C:/Users/Slaven/Downloads/novgorod_1230(1) (1).sqlite) · `statusrules:<rule_id>` · `bible:§N <заголовок>` (библия персонажа) · `lit:<id>` (authoring/literature.json) · `catalog:conventions.<ключ>`.

## Итог проверки

`validation_report.json`: 0 ошибок, 8 предупреждений. Две строки MASTER с достоверностью D оставлены с достоверностью C и примечанием. У шести ролей вероятность боя не установлена. Проверено 1437 ссылок.
