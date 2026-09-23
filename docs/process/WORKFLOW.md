# Рабочий цикл агента

> Процедура. Норм не создаёт: при конфликте действует AGENTS.md, CONTRACT_INDEX и профильные контракты. Проверено: 2026-09-22, commit c5501419.

Нормы, на которые опирается цикл: [AGENTS.md](../../AGENTS.md) §18–§29 и
[CONTRACT_INDEX](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md). Здесь — только порядок действий.

## Цикл из 6 шагов

### 1. Одна задача = новая сессия

- Вход — issue (для нетривиальной задачи — оформленный как CR) или прямое задание владельца.
- История прошлого чата не переносится: источник продолжения — код, issue/PR, актуальные документы
  (AGENTS §2: не использовать прошлый контекст разговора вместо актуального состояния репозитория).
- Старт: `git status --short --branch` и `git branch --show-current` (AGENTS §18); перечитать актуальный
  AGENTS.md из фактического checkout (AGENTS §2).

### 2. Change request

- Нужен ли CR и как его оформить — [CHANGE_REQUEST](CHANGE_REQUEST.md).
- Для небольшой локальной правки CR не пишется: короткий план или сразу работа (AGENTS §18).

### 3. Context pack

Собрать минимальный достаточный контекст, а не читать репозиторий целиком (AGENTS §19):

1. разделы governance по всем применимым строкам маршрутизации роутера [AGENTS.md](../../AGENTS.md) и
   CONTRACT_INDEX по его правилу чтения (§1–§3.1, применимая строка §8.1, строки §4–§7 для её документов);
2. `rg` по путям задачи в [LEGACY_WARNINGS](../work/LEGACY_WARNINGS.md) — известные костыли не рефакторить
   попутно;
3. `MODULE.md` владельцев (текущий owner — по [MODULE_INDEX.md](../../MODULE_INDEX.md), imports/callers, AGENTS §15);
4. нужные карты `docs/context/*` ([STACK](../context/STACK.md), [ARCHITECTURE](../context/ARCHITECTURE.md),
   [DB_SCHEMA](../context/DB_SCHEMA.md), [EDGE_CASES](../context/EDGE_CASES.md), [UI_KIT](../context/UI_KIT.md),
   [TESTING](../context/TESTING.md));
5. `codebase-memory-mcp` в режиме Verify (Tier 2) по AGENTS §19: `list_projects`, `index_status`, discovery
   владельца (`get_architecture`, `search_graph`, `trace_path`), сверка с исходниками. Настройка —
   [CODEBASE_MEMORY_MCP](../setup/CODEBASE_MEMORY_MCP.md). **Если CBM недоступен** (например, не настроен для
   текущего клиента) — выводы строятся на `rg` и прямом чтении, а в итоговом отчёте ставится отметка
   «CBM недоступен: выводы по rg/чтению». Для очевидной локальной задачи с известным owner граф не нужен (AGENTS §19);
6. нормативный поиск: `npm run knowledge:query -- --query "<потребность>"`, затем чтение исходного документа
   (AGENTS §20).

### 4. Короткие итерации

- Маленький шаг → focused/profile тест → следующий шаг (AGENTS §24). Команды — [TESTING](../context/TESTING.md).
- Полный `npm test` — merge gate в CI (AGENTS §24); локально — только в случаях, перечисленных в [TESTING](../context/TESTING.md).
- Посторонняя проблема не чинится попутно: запись в отчёт или новая LW/issue (AGENTS §29).

### 5. Проверки и Contract Auditor

- Проверки затронутой области по AGENTS §24 и матрице [TESTING](../context/TESTING.md).
- Contract Auditor — по триггерам AGENTS §25.1 (read-only, формат `CONTRACT AUDIT FINDING`). Правка нормативного
  документа — всегда триггер; см. [CORPUS_EDIT](CORPUS_EDIT.md).
- Перед завершением нетривиальной задачи — `detect_changes` и `check_index_coverage` (AGENTS §19), либо отметка о
  недоступности CBM.

### 6. Фиксация

См. раздел «Завершение» ниже.

## Взять следующую задачу

1. Открыть [CURRENT_SPRINT](../work/CURRENT_SPRINT.md) — упорядоченная выжимка; истина — issues/milestone и
   описание PR #98.
2. Проверить живой статус:

   ```powershell
   gh issue list --state open --label P2
   gh issue list --milestone "Runtime M3–M8" --state open
   ```

3. Взять **одну** задачу — первую открытую по порядку CURRENT_SPRINT, у которой нет незакрытых зависимостей.
   Если это первая задача нового milestone или этапа плана — сначала старт спринта для CBM по
   [AGENTS.md §19](../governance/WORKFLOW_RULES.md): подключение, `list_projects` / `index_status`, однократный
   `index_repository`, результат — в отчёт задачи. Команды и разбор сбоев —
   [CODEBASE_MEMORY_MCP](../setup/CODEBASE_MEMORY_MCP.md).
4. Runtime-трек: следующий этап Runtime_Plan не начинается без решения владельца. Выдача владельцем нового
   этапа может служить приёмкой предыдущего только при условиях Runtime_Plan §7.4; без подтверждения следующий
   этап не начинается
   ([Runtime_Plan](https://github.com/PavelSlaven/Novgorod1230/blob/codex/live-world-runtime/docs/plans/Novgorod1230_Runtime_Plan.md),
   ветка PR #98).
5. Если подходящей задачи нет или порядок неясен — остановиться и спросить владельца, а не выбирать самостоятельно.

## Завершение

1. **CHANGELOG.** Одна строка на PR в секции `## Unreleased` файла [CHANGELOG.md](../../CHANGELOG.md), формат
   `- <type>(<area>): что (#PR)`. Историю не бэкфиллить.
2. **Legacy warnings.** Новый или закрытый долг — в той же строке CHANGELOG отметкой `LW-### added` /
   `LW-### closed` и записью в [LEGACY_WARNINGS](../work/LEGACY_WARNINGS.md).
3. **Issue.** В описании PR — `Closes #N` для закрываемого issue. «Сделано» = issue закрыт; статус в
   CURRENT_SPRINT не ведётся.
4. **Runtime-PR.** Сводный статус этапа (текущий этап, `stage_base`, `tested_head`, состояние приёмки, аудит и
   т. д.) остаётся только в описании PR #98 — Runtime_Plan §7.2 называет его единственным местом сводного
   статуса. В CHANGELOG/CURRENT_SPRINT статус этапа не дублируется.
5. **Отчёт по AGENTS §29:** что изменено; какое поведение реализовано или исправлено; какие проверки фактически
   выполнены и их результат; реальные ограничения и блокировки (включая отметку о недоступности CBM, если была).
   Гипотетических улучшений «на будущее» не добавлять.
6. Commit, push, PR — только если они входят в задачу (AGENTS §26). После подтверждённого merge — уборка
   временных ресурсов по AGENTS §26.1.
