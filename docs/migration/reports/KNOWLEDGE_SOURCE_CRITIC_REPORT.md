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

## Повторный аудит head `c0d1716d...`

GitHub Actions run `#64` (`29273051182`), job `86895239724`: PASS по всем шагам, включая real PostgreSQL DDL, generation/reproducibility и full tests.

Итог: `CHANGES REQUIRED`.

- public writer remediation подтверждён как закрытый;
- PR body подтверждён актуальным;
- обнаружен hardcoded числовой порог в `canonical-corpus-registry.test.js` вместо exact-сравнения с manifest;
- `MIGRATION_STATUS.md` и `TEST_REPORT.md` требовали синхронизации с run `#64`.

Порог заменён чтением `corpus-manifest.json` и сравнением с `manifest.documents.length`; отчёты синхронизированы. Для допуска обязательны новый clean-clone run и очередной независимый аудит.

## Третий аудит head `c132601c...`

GitHub Actions run `#65` (`29273919381`), job `86898128637`: PASS по всем workflow steps.

Итог: `CHANGES REQUIRED`.

Подтверждены public v2 writer и manifest-derived delegation count. Найдены дополнительные MAJOR:

- approved semantic index копировался без semantic subset hash и exact ordered chunk parity;
- v2 graph path не проверял source file и line ranges;
- повторный `knowledge:import` удалял native records и aliases;
- public-writer regression содержал hardcoded native/lexical counts;
- отсутствовали обязательные negative tests manifest/alias/traversal и runtime semantic/lexical artifacts.

Remediation после аудита:

- semantic vectors принимаются только после совпадения approved `corpus_hash`, всех chunk metadata/text fields и embedding dimensions;
- graph snapshot fail-closed проверяет каждый source file, положительные line numbers, EOF и порядок диапазона;
- legacy re-import сливается с проверенными native records/aliases и не переписывает source README;
- native/lexical expectations вычисляются из manifest и artifacts;
- добавлены отрицательные тесты semantic drift, graph corruption, repeat import, registry corruption и runtime digest/missing artifacts.

Для допуска обязательны новый clean-clone run и следующий независимый аудит.

## Четвёртый аудит head `4f12cad2...`

GitHub Actions run `#66` (`29275637037`), job `86903889998`: PASS по всем workflow steps.

Итог: `CHANGES REQUIRED`.

Подтверждено закрытие всех findings третьего цикла. Найдены дополнительные gaps:

- graph snapshot допускал отсутствие `source_location`, не проверял `source_file` и мог принять traversal либо рассогласованные source-пути;
- строка после завершающего newline ошибочно считалась существующей, поэтому structural nodes шести native-документов имели `line_end` на единицу больше логического EOF;
- legacy verifier и migration test сохраняли hardcoded значения `29`/`19`, а contract map описывал фиксированные 19 входных файлов;
- migration/test evidence всё ещё ссылался на run `#65` вместо фактического run `#66`.

Remediation после аудита:

- оба graph source-поля обязательны, проходят path-safety и должны ссылаться на один canonical corpus file;
- line ranges проверяются по логическому числу строк без фиктивной строки после terminal newline; structural nodes получают те же согласованные provenance-поля;
- legacy inventory verifier и тест сравнивают точные множества путей, вычисленные из текущего manifest; contract map больше не фиксирует число файлов;
- migration/test evidence синхронизирован с run `#66`.

Для допуска обязательны полный локальный цикл, новый clean-clone run и пятый независимый аудит.

## Пятый аудит head `b38e2954...`

GitHub Actions run `#67` (`29276773280`), job `86907721340`: PASS по всем workflow steps.

Итог: `CHANGES REQUIRED`.

Подтверждено закрытие findings четвёртого цикла. Найдены дополнительные MAJOR:

- provenance links и hyperedges не проходил обязательную path/EOF validation;
- graph semantic source set не был связан с exact approved RAG semantic set, поэтому native-документ мог вытеснить обязательный structural node;
- links/hyperedges не проверялись на endpoints structural-only nodes;
- legacy import записывал target bytes до обнаружения native ID/path collision;
- migration/test evidence оставался на run `#66` вместо фактического run `#67`.

Remediation после аудита:

- единый validator проверяет `source_file`, `source_location.file`, path safety и logical line range у каждого node, link и hyperedge;
- любой semantic provenance вне approved embedding document set отклоняется, а отсутствующий approved semantic graph source считается ошибкой;
- reserved structural-only IDs запрещены в semantic snapshot и в endpoints links/hyperedges;
- legacy import строит и валидирует полный план, включая aliases/IDs/paths и все входные bytes, до первой записи;
- добавлены отрицательные тесты corrupted link/hyperedge provenance, graph/RAG set mismatch, structural endpoints и native collision without mutation;
- evidence синхронизирован с run `#67`.

Для допуска обязательны полный локальный цикл, новый clean-clone run и шестой независимый аудит.

## Проверка remediation пятого аудита

Implementation commit `c759f45f4212a08dd94b043212caa5a797ef878a` прошёл clean-clone GitHub Actions run `#68` (`29277900087`), job `86911487538`. Все фактические steps завершились `success`, включая PostgreSQL 16 DDL, corpus gate, deterministic generation, reproducibility и full test suite.

Этот evidence update не меняет implementation. Финальный admission verdict требует независимого шестого аудита evidence head.

## Шестой аудит head `afed3740...`

Evidence-head run `#69` (`29278114051`), job `86912220316`: PASS по всем workflow steps.

Итог: `CHANGES REQUIRED`.

- `hyperedge.member_source_files` обходил exact approved semantic set, включая native, missing и traversal paths;
- import-history conflict проверялся после записи legacy targets, manifest, aliases и inventory;
- parity report сохранял исторические mode names вместо текущих generated contracts.

Remediation после аудита:

- каждый member source проходит path safety, corpus existence и approved semantic-set checks и учитывается в graph provenance set;
- import history разбирается, валидируется и материализуется в memory до первой записи import plan; conflict не меняет manifest, aliases, inventory или corpus targets;
- parity report синхронизирован с текущими graph/RAG generation modes;
- добавлены negative tests native/missing/traversal member sources и history conflict without mutation.

Для допуска обязательны полный локальный цикл, новый clean-clone run и следующий независимый аудит.

## Проверка remediation шестого аудита

Implementation commit `3cb8eab2c7acc0f272d792018d39d659a829fba9` прошёл clean-clone run `#70` (`29279548326`), job `86917091894`. Все workflow steps завершились `success`, включая PostgreSQL 16 DDL, corpus, generation/reproducibility и full tests.

Финальный admission verdict требует независимого аудита evidence head после синхронизации этих отчётов.

## Седьмой аудит head `a0821be3...`

Evidence-head run `#71` (`29279761828`), job `86917792948`: PASS по всем workflow steps.

Итог: `CHANGES REQUIRED`.

- `MIGRATION_PHASES_SHORT.md` и `MIGRATION_MANIFEST.json` дублировали mutable corpus/graph/RAG/test counts и старый critic verdict вместо делегирования каноническим manifests и evidence reports;
- malformed JSON import history корректно отклонялся до записи, но эта fail-before-write ветка не была закреплена автоматическим regression test.

Remediation после аудита:

- корневые migration summaries делегируют corpus, graph и RAG counts соответствующим manifests, а test/critic evidence — каноническим отчётам;
- отдельный integration contract запрещает возврат дублируемых mutable counts и проверяет согласованность corpus/graph/RAG document coverage;
- negative test malformed import history подтверждает byte-неизменность manifest, aliases, inventory и всех corpus targets;
- targeted tests и полный локальный цикл проходят; для допуска остаются новый clean-clone CI и повторный независимый аудит.

## Проверка remediation седьмого аудита

Implementation commit `c04dcd59a40bf30332a5cc11288840a833e816f0` прошёл clean-clone run `#72` (`29281004340`), job `86921895682`. Все workflow steps завершились `success`, включая PostgreSQL 16 DDL, corpus, deterministic generation/reproducibility и full tests.

Финальный admission verdict требует независимого аудита evidence head после синхронизации этих отчётов.

## Восьмой аудит head `97d7c29...`

Evidence-head run `#73` (`29281176623`), job `86922469253`: PASS по всем workflow steps.

Итог: `CHANGES REQUIRED`.

- `KNOWLEDGE_SOURCE_CORPUS_MIGRATION_REPORT.md` сохранял stale значения 19 total documents, 1295 total graph nodes, test totals `9/9` и `310/310`, а также старый `PASS WITH NOTES` как текущеподобный admission verdict;
- migration-summary contract покрывал только корневые сводки и не блокировал возврат stale evidence в остальных knowledge-source reports.

Remediation после аудита:

- corpus migration report делегирует mutable counts и coverage canonical corpus/graph/RAG manifests, а test/critic evidence — соответствующим отчётам;
- integration contract проверяет corpus migration report и запрещает stale `9/9`/`310/310` во всех `KNOWLEDGE_SOURCE*.md`;
- negative contract сначала воспроизвёл stale report и после исправления проходит;
- targeted tests и полный локальный цикл проходят; для допуска остаются новый clean-clone CI и повторный независимый аудит.

## Проверка remediation восьмого аудита

Implementation commit `cfb98442aeda85495da42af7071af05fe18d6dac` прошёл clean-clone run `#74` (`29282256574`), job `86926064785`. Все workflow steps завершились `success`, включая PostgreSQL 16 DDL, corpus, deterministic generation/reproducibility и full tests.

Финальный admission verdict требует независимого аудита evidence head после синхронизации этих отчётов.
