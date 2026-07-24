# Temporal World v4 — повторный внешний authoring-аудит

## Итоговый статус

Все 13 обязательных семейств заполнены authoring records со статусом `approved`. Для каждого семейства присутствуют dataset, normalized references, provenance, source history с SHA-256, независимое decision и authoring approval manifest. Во всех решениях `data_gaps: []`.

Approval относится к authoring-данным. Он не активирует runtime и не заменяет developer-owned DDL, importer, PostgreSQL integration, schema generation, repository CI, code critic и P28.

## Каноническая база проверки

Проверка выполнена против `PavelSlaven/Novgorod1230`, ветка `main`, commit `520c0ea8cc366fc16c949a874c710f3547a322f6`, а также против exact bytes handoff-пакета.

Полностью учтены обязательные и профильные требования:

- `AGENTS.md`;
- `.github/AGENTS.md`;
- `development_rules.txt`;
- `code_critic_invocation_rule.txt`;
- `code_driven_world_materialization_architecture.md`;
- `world_base_materialization_table_requirements.md`;
- `llm_documentation_navigation.md`;
- `time_system.txt`;
- `character_parameters.txt`;
- `historical_events_and_figures.txt`;
- Temporal World v4 normative contract и связанные ADR владельцев времени, NPC, access, environment и world processes;
- `FAMILY_REQUIREMENTS.json` и корневой `README.md` handoff-пакета.

## Исправления повторного аудита

- Удалены файлы вне разрешённой рабочей области.
- Calendar epoch переведён в канонический `GameTimestamp`; добавлены calendar system, local-offset convention, daypart и season rules. Общегражданский January-1/Common-Era epoch явно помечен как проектная вычислительная конвенция, а не реконструкция местного средневекового летосчисления.
- Generic annual daylight data заменены воспроизводимой Julian-date-aware таблицей для 1230–1233 годов. Runtime получает frozen exact authored boundaries и не выполняет astronomy, binary-float arithmetic или rounding.
- Activity family сведена к замкнутому минимальному набору: ожидание, сон, ручной труд, чтение/рецитация, трапеза/отдых и узкая стабильная пересадка между co-located carriers. Интенсивности унифицированы с body profiles; participant-departure disposition и body-effect bindings заданы явно.
- Activity execution policy фиксирует exact progress, resource/participant handling, committed-state preservation и полный deterministic same-time order.
- Body rates исправлены на exact `100/72 = 25/18` points/hour и heavy `25/12`; runtime metric `energy` явно связан с канонической «бодростью». Sleep recovery `25/9` points/hour помечен как gameplay-реконструкция, поддерживающая нейтральный цикл 16 часов бодрствования / 8 часов сна.
- NPC static command tokens заменены request-bound `cmd.v1` token contracts; authored default отсутствует; perception использует только factual signals и разрешённый knowledge scope.
- Exact event использует due condition `current GameTimestamp >= scheduled_at`, one-shot idempotency, source-bound effect proposal и approved resolution class/ordinal.
- Place schedule отделяет physical portal state от authorization и содержит прямые bindings на calendar и activity profiles.
- Weather candidates сделаны составными и однозначными, weights выровнены до `1`, RNG identity зафиксирован как `mulberry32_v1` с SHA-256 canonical seed. Selection выполняется оркестратором, environment owner не получает прямого RNG-доступа. Неавторизованный temperature effect исключён.
- Historical famine rule хранит source precision `calendar year`, exact formal `GameTimestamp` range для представления этого года и не придумывает более узкую дату, цену, население или mortality number.
- Traversal same-time order исправлен: completion/arrival facts возникают до hazard/access evaluation. Dynamic recheck policies и world revision связаны version/source/applicability bindings.
- Carrier rescue/recovery использует только `spatial_candidate_gap`, один root clock, exact synchronized slices и две явные переходные процедуры без teleport fallback.
- Все cross-family references и controlled-vocabulary values связаны с version, source IDs, applicability и transferred source bytes.

## Источниковая модель

1. Temporal World v4 normative contract из handoff.
2. Canonical repository snapshot и exact canonical project files (`character_parameters.txt`, `historical_events_and_figures.txt`).
3. Approved controlled vocabularies и Spatial v3 dynamic recheck rows.
4. External source excerpts: USNO, NOAA, Wikidata, Project Gutenberg и EpiMedDat.
5. Явно помеченные bounded gameplay/historical reconstructions, разрешённые пользователем. Они являются редакторскими решениями для игры и не выдаются за первичные исторические факты.

## Структура результата

- `RETURN_TREE/.../datasets/` — approved records и normalized references для 13 families;
- `RETURN_TREE/.../source-approval/` — provenance и source histories;
- `RETURN_TREE/.../sources/` — transferred source/excerpt bytes и прозрачные reconstruction decisions;
- `AUDITOR_DECISIONS/` — 13 решений `approved`;
- `RETURN_TREE/.../approvals/` — authoring approval manifests;
- `RETURN_PACKAGE_INDEX.json` — фактические counts и package verdicts.

## Финальные проверки после последней содержательной правки

Один неизменяемый final candidate проверен три раза подряд.

| Цикл | Handoff validator | Semantic audit | Digest/source audit | Daylight reproduction | Замечания |
|---|---|---|---|---|---|
| 1 | `ok: true`, errors `0` | `ok: true`, issues `0` | `ok: true`, issues `0` | exact match, 1461 dates | `0` |
| 2 | `ok: true`, errors `0` | `ok: true`, issues `0` | `ok: true`, issues `0` | exact match, 1461 dates | `0` |
| 3 | `ok: true`, errors `0` | `ok: true`, issues `0` | `ok: true`, issues `0` | exact match, 1461 dates | `0` |

Команды каждого цикла:

```text
node tools/validate-auditor-return.mjs
python /mnt/data/temporal_semantic_audit_v2.py
python /mnt/data/temporal_digest_audit_v2.py
python RETURN_TREE/.../calendar_daylight_derivation_v2.py + exact comparison with stored table
```

Три цикла выполняются на identical tree digest. Единственные сообщения штатного validator — 13 предусмотренных README предупреждений `normalized table binding left for developer schema review`; это developer-owned DDL binding, а не data gap и не authoring defect.

После упаковки ZIP дополнительно выполняются integrity test и fresh-extraction acceptance тем же validator/audit suite.

## Developer-owned integration after return

Разработчик связывает physical tables, реализует deterministic importer, пересобирает schema reference и финальные hashes, выполняет PostgreSQL integration, repository validators, independent code critic и P28. До этого пакет не используется как production runtime catalog.

## Известные ограничения

- Daylight values — воспроизводимая whole-minute gameplay reconstruction для Julian years 1230–1233, а не наблюдённые средневековые часы. Вне покрытия требуется новая approved версия.
- Common-Era year numbering и January-1 epoch — вычислительная игровая конвенция; они не утверждают конкретный местный стиль средневекового новгородского летосчисления.
- Monastic NPC/place schedule — сравнительная реконструкция, не прямое доказательство православного новгородского распорядка.
- Weather candidates/factors, sleep recovery и transfer duration — явно помеченные gameplay reconstructions, не исторические статистические или медицинские утверждения.
- Historical famine rule сохраняет year-level source precision; numerical local-effect magnitude требует отдельного source-backed profile и не выводится скрыто.
