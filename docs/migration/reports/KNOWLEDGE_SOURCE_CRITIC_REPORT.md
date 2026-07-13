# Отчёт независимого критического аудита: canonical docs, world_base и knowledge-source

Дата: 2026-07-13
Релиз: `0.23.0-migration.23`
Проверенный head: `63600d93b76312ccd95305dea78281dd9874d6b0`
GitHub Actions: run `#63` (`29271952334`), job `86891569589`

## Метод

После полного зелёного clean-clone CI отдельный агент-критик в read-only режиме прочитал `CRITIC_PROMPT.md`, handoff-нормативы, действующие инструкции репозитория, полный diff PR №2, контракты, тесты, generated artifacts и предыдущий critic report. Фактический CI evidence перепроверен через GitHub CLI.

## Подтверждённые свойства

- все 13 файлов handoff-пакета прошли `sha256sum -c CHECKSUMS.sha256`;
- четыре новых норматива импортированы byte-for-byte с ожидаемыми bytes и SHA-256;
- corpus: 26 документов, 19 legacy и 7 native;
- graph: 19 semantic и 7 structural-only документов, 1302 nodes, 3602 links, 11 hyperedges;
- у structural-only nodes нет новых semantic links;
- RAG: 813 approved semantic chunks и 346 lexical-only chunks без embeddings;
- `coverage.lexical_indexed` точно совпадает с файлами lexical index;
- schema reference содержит ровно 62 текущие DDL-таблицы и 1679 колонок; 790 отсутствующих описаний отмечены явно;
- описания используются только из утверждённого `field-descriptions.js`;
- run `#63` реально выполнил DDL в PostgreSQL 16 с `ON_ERROR_STOP=1` и проверил 62 таблицы, `world_reader`, `USAGE`, отсутствие `CREATE`, 62 `SELECT` grants и отсутствие write grants;
- generation и повторная generation в clean clone дали пустой diff.

## Findings

### MAJOR-1 — public writer оставался legacy

Статус на проверенном head: **CHANGES REQUIRED**.

`tools/docs-tools/src/index.js` экспортировал `writeKnowledgeSourceOutputs` из legacy `knowledge-source.js`, хотя `knowledge:generate` и `docs:generate` использовали v2 materializer. Публичный writer падал на семи native-документах и мог расходиться с CLI output.

Исправление после аудита:

- public export перенаправлен на `writeKnowledgeSourceOutputsV2` под каноническим именем;
- добавлен regression test через public package import;
- тест проверяет полный v2 output map, 7 structural nodes, coverage 19/7, 346 lexical chunks и отсутствие embeddings.

Исправление требует нового full test, clean-clone CI и повторного независимого аудита.

### MAJOR-2 — release evidence был устаревшим

Статус на проверенном head: **CHANGES REQUIRED**.

`MIGRATION_STATUS.md`, `TEST_REPORT.md` и PR body не отражали run `#63` и фактические 26/19/7 документов. Репозиторные отчёты обновлены этим циклом; PR body должен быть синхронизирован после финального CI.

### NOTE — byte-policy critic rule

Handoff `Правило вызова агента-критика.txt`: 9109 bytes, SHA-256 `b3049ee06f6462081641bffdc0d12dc2596905ba401560e740f1c98c3192ec96`. Canonical `code_critic_invocation_rule.txt`: 8960 bytes, SHA-256 `7a0d690a18f39e264cd39eca3b83eae5c943de97e4219b3f8034b98da9289165`.

Различие ограничено CRLF/LF; нормализованный текст идентичен. Согласно handoff-инструкции второй canonical document не создан и тексты самостоятельно не объединялись. Требуется только решение владельца по byte-policy; автоматическое изменение запрещено.

## Итог аудита для head `63600d93...`

`CHANGES REQUIRED`

PR остаётся draft. После исправлений обязательны полный тестовый цикл, новый clean-clone CI и повторный независимый critic audit.
