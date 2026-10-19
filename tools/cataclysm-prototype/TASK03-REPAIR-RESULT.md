# Задание 03: NPC semantic repair, reply03f

2026-10-19. Рабочая ветка `codex/cataclysm-p3-semantic`; базовый HEAD перед правками `d4ad3ca6f5d83dcb99e748f45e2393240442038e`. Код опубликован коммитом `b5aea05547f7f65b31c41b64e914c3ab786ed958`. PS1/Qwen прогон выполнен на этом HEAD; финальный CI коммита отчёта ожидается после push. Ссылки задачи: #247, #329; закрытие этих задач данным изменением не заявлено. Это техническая сдача, не P3 GO и не внешняя приёмка.

## Результат

По решению владельца D210/D218 из NPC semantic repair удалена кодовая заготовка речи. При `semantic_grounding` отказе исходные `request`, `original_output` и `validation_errors` передаются в один repair-вызов того же `roleRunner`. Существующий `maxRepairAttempts: 1` ограничивает ответчика двумя генерациями. После repair проверяются сохранённые `contribution_kind` и `speech.dominant_act`; смена любого из них даёт typed `TURN_NPC_PLAN_INVALID`. Повторный grounding audit принимает или отклоняет именно текст модели. Новых NPC native operations при втором отказе нет.

После уже выполненного действия игрока второй отказ NPC даёт dev UI текст «Выбранный собеседник не ответил.» и сохраняет typed error, `partially_achieved` и фактический счётчик операций. Native actor projection не передаёт имя собеседника, поэтому имя в этом сообщении отсутствует. Request выбранного NPC содержит одну текущую observation с фактом, что он услышал реплику игрока, и ссылкой на native `perception_result_ref`. Текст услышанного не записывается как world truth: `knowledge` остаётся пустым. Public schemas, packages, prompt text и native C++ операции не менялись. Repair использует существующий путь вызова той же модели.

Код: `apps/game-server/src/runtime/lower-dvina-trace-conversation-llm.js`, `tools/cataclysm-prototype/p3-boundary.js`, `tools/cataclysm-prototype/p3-live-coordinator.mjs`. Focused regression: соседние `.test.js` / `.test.mjs` файлы. Владелец кода сообщил, что формальный guard сохраняет два поля, но не доказывает полную смысловую эквивалентность произвольной прозы до и после repair. Нормативная строка semantic repair в active `npc_conversation_mode_contract.md` §37.2 в этом изменении не внесена; это остаётся отдельной задачей по процедуре CORPUS_EDIT. Разрешение на правку корпуса в этом задании не заявляется.

## Проверки

| Проверка | Фактический результат |
|---|---|
| Focused game-server: grounding, contract, contract-continued, turn-step conversation, M2 phase3, first-contact, name-recognition | 53/53 PASS, 0 skip; [лог](evidence/task03-repair/reply03f-owner-focused.log) |
| P3 boundary/coordinator, Windows Node v24.16.0 | 59/59 PASS, 0 skip; [лог](evidence/task03-repair/reply03f-p3-windows.log) |
| Тот же P3 набор, WSL Linux Node v22.23.3 после guard | 59/59 PASS, 0 skip; [лог](evidence/task03-repair/reply03f-p3-final-linux.log) |
| `node scripts/check-syntax.mjs --base HEAD` для четырёх P3 JS/MJS | 4 файла, 0 ошибок; [лог](evidence/task03-repair/reply03f-p3-syntax.log) |
| Полный `test:apps` после правок | 1771 tests: 1770 PASS, 0 FAIL, 1 SKIP; exit 0; [лог](evidence/task03-repair/reply03f-test-apps.log) |

Единственный skip полного прогона — S1 live evaluation требует `DEEPSEEK_API_KEY` и в этом режиме не включалась. Packages не менялись; отдельный локальный `test:domain` не запускался, полный CI должен включить его. Windows 59/59 и Linux 59/59 относятся к focused P3 набору. Исторические C++/fake/native/Qwen результаты остаются в прежних отчётах; текущий живой прогон выделен ниже. В перечисленных автоматических проверках реальные LLM, Docker и native playtest не запускались.

## Фактический PS1/Qwen прогон

Ведущий выполнил две последовательные реплики через actual PS1 на frozen runtime HEAD `b5aea05547f7f65b31c41b64e914c3ab786ed958`. [Native stream](evidence/task03-repair/native-live.txt) сохранён без переписывания. Ответы backend — `qwen3.8-27b`, все шесть HTTP status 200; requested model ID в ledger — `qwen3.8-27b-uncensored-w4a16-tp2`.

1. Ввод: `Скажи дословно: «Добрый день, мастер. Ты меня слышишь?»`. Вызовы: 15 planner → 16 responder → 17 format repair. Оба ответа NPC отклонены как malformed `speech.claims`. Предложенный текст обеих попыток `Да, я тебя слышу. Добрый день.` **не прозвучал**. Результат: тишина NPC, dev UI `Выбранный собеседник не ответил.`. Это format repair, не успешный живой semantic-grounding repair.
2. Ввод: `Скажи дословно: «Спасибо. Ты меня хорошо слышишь?»`. Вызовы: 18 planner → 19 responder → 20 grounding auditor (`pass: true`, `concerns: []`). Принятый текст `Да, я тебя слышу. Говори.` прозвучал в native и виден в P message log.

| Вызов / роль | Время, ms | Prompt tokens | max_tokens | Ledger / ответ |
|---|---:|---:|---:|---|
| 15 planner | 2265 | 9086 | 20000 | [ledger](evidence/task03-repair/attempt-15.json), [ответ](evidence/task03-repair/attempt-15-response.json) |
| 16 responder | 2631 | 2979 | 1000 | [ledger](evidence/task03-repair/attempt-16.json), [ответ](evidence/task03-repair/attempt-16-response.json) |
| 17 format repair | 3505 | 3337 | 1000 | [ledger](evidence/task03-repair/attempt-17.json), [ответ](evidence/task03-repair/attempt-17-response.json) |
| 18 planner | 2252 | 9082 | 20000 | [ledger](evidence/task03-repair/attempt-18.json), [ответ](evidence/task03-repair/attempt-18-response.json) |
| 19 responder | 2479 | 2973 | 1000 | [ledger](evidence/task03-repair/attempt-19.json), [ответ](evidence/task03-repair/attempt-19-response.json) |
| 20 grounding auditor | 784 | 1214 | 256 | [ledger](evidence/task03-repair/attempt-20.json), [ответ](evidence/task03-repair/attempt-20-response.json) |

Save and quit подтверждён, затем выполнен Quit; PS1 завершился с exit 0. Native binary сохранил прежний SHA256. Старый code fallback, видимый в P, принадлежит истории предыдущего сохранения и не является новой речью этого прогона.

Итог живого прогона: **PARTIAL**. Цель двух принятых ответов подряд не достигнута. Последнее уточнение задачи допускает честный repair/тишину; ложная речь вместо отказа не добавлялась. Успешный semantic repair и второй grounding reject подтверждены fake E2E, не этим живым прогоном. Malformed claims остаётся фактическим пробелом живой модели.

## Дополнительные доказательства

`docs:generate`, `docs:check`, `knowledge:check`, `architecture:check` выполнены успешно; логи: [generate](evidence/task03-repair/reply03f-docs-generate.log), [docs](evidence/task03-repair/reply03f-docs-check.log), [knowledge](evidence/task03-repair/reply03f-knowledge-check.log), [architecture](evidence/task03-repair/reply03f-architecture-check.log). Эти результаты получены до финальной фиксации отчёта.

Перед фиксацией отчёта повторены [docs:generate](evidence/task03-repair/reply03f-final-docs-generate.log), [docs:check](evidence/task03-repair/reply03f-final-docs-check.log), [knowledge:check](evidence/task03-repair/reply03f-final-knowledge-check.log): exit 0. Privacy-проверка 27 файлов evidence/отчёта/PLAY не нашла ключ, base_url или host из owner settings. Frozen hashes шести code/test файлов совпали с техническим аудитом.

Сдачи исполнителей сохранены как исторические снимки frozen delta: [semantic owner](evidence/task03-repair/reply03f-owner.md), [P3](evidence/task03-repair/reply03f-p3.md). Указанные там незавершённые root-проверки заменены фактическими результатами таблицы выше; сами снимки не переписаны под более поздние события.

Native binary не менялся: SHA256 `98051fa26a89f6288f3ba65c1e81338e5465257e6bdbb8f67c3a7fd7dcac5ad5` (сверка ведущего). Конечный общий бюджет: 20/30 вызовов, остаток 10. Текущий PS1 прогон использовал вызовы 15–20. Дальнейших Qwen вызовов и правок prompt не выполнялось.

CI финального коммита отчёта проверяется после его push. Результат должен быть указан в окончательном комментарии PR со ссылкой на конкретный run/HEAD; сейчас зелёный CI финального коммита не заявлен.

## Открытое

- Независимый технический Contract Auditor: `PASS_WITH_NOTES` на frozen delta базового HEAD `d4ad3ca6f5d83dcb99e748f45e2393240442038e`; [полный вердикт](evidence/task03-repair/reply03f-contract-audit.md). Это не Sonnet/Opus acceptance и не разрешение production cutover. Итоговая приёмка остаётся у ведущего.
- В живом прогоне первый ответ и его единственный format repair остались malformed в `speech.claims`; NPC промолчал. Цель двух принятых ответов подряд не достигнута. Подтверждены честная тишина после отказа и один последующий принятый ответ; качество модели в целом этим не доказано.
- Отдельная находка для issue ведущего: `scripts/check-syntax.mjs:11` при явных путях без `--base` пропускает первый путь. Текущий прогон использовал `--base HEAD`; дефект вне scope и не исправлялся. Условие закрытия: все явные пути проверяются и это покрыто regression test.
