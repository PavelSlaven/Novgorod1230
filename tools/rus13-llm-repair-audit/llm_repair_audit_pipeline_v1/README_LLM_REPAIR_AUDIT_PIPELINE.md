# LLM repair/audit pipeline v1

Статус: рабочая спецификация пайплайна ремонта и аудита LLM-результатов.
Дата сборки: 2026-07-06T20:11:18Z

## Назначение

Пакет описывает, как обрабатывать результат LLM до записи в `party-базу`.

Код выполняет только технические функции: сохраняет raw output, парсит JSON, проверяет схему, фиксирует ошибки, вызывает repair/audit агентов, проверяет write-plan и выполняет атомарный commit только после прохождения ворот.

Код не создаёт мир, не чинит смысловые противоречия и не подставляет заглушки как игровые факты.

## Порядок

1. Capture raw LLM result.
2. Parse and schema validate.
3. Repair format only, if needed.
4. Audit source/status.
5. Audit semantic consistency.
6. Audit visibility leaks.
7. Validate DB write plan.
8. Atomic commit gate.
9. Post-commit audit snapshot.

## Основные файлы

- `llm_repair_audit_pipeline_v1.xlsx` — человекочитаемый справочник.
- `llm_repair_audit_pipeline_v1.json` — машинночитаемый манифест.
- `contracts/*.schema.json` — JSON Schema контрактов.
- `prompts/*.md` — промты repair/audit агентов.
- `sql/llm_repair_audit_commit_outline_v1.sql` — порядок транзакции.
- `scripts/llm_repair_audit_orchestrator_v1.py` — скелет оркестратора.
- `csv/*.csv` — табличные слои для аудита и импорта.

## Commit rule

Нельзя писать в authoritative party state, если есть хотя бы одна blocking issue в schema/source/semantic/visibility/db_write_plan слоях.

Warnings допустимы только если они явно не раскрывают скрытое состояние, не ломают историю партии и не повышают статус непроверенных источников.
