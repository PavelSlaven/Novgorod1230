# Reply-03e: delivery и живой Qwen

2026-10-19. PR #770. **Delivery исправлен; живой речевой прогон частично успешен. STOP на существующей замене смысла ответа в LLM-owner. Не P3 GO; T09 не закрыт.**

## Проверенный код и запуск

План: `48410e31d`; окончательный код: `51cf8939cb08a57684b6bd457a2879b4970983de`, отправлен до E2E.
Игровой binary SHA256: `98051fa26a89f6288f3ba65c1e81338e5465257e6bdbb8f67c3a7fd7dcac5ad5`.
Сборка и runtime — ext4 `/home/slaven/cataclysm-recovery/task03-dev`; data/gfx/cache там же.
Коммиты после указанного code HEAD содержат только отчёт, evidence и документацию; нового исполнения они не добавляют.

```powershell
.\tools\cataclysm-prototype\run-p3-dev.ps1
```

Обе сессии запущены этой командой через настоящий PTY, без smoke-обвязки. В первой использовался существующий settings file и временный fetch-preload для обезличенных метрик/общего лимита30. Во второй `RUS_LLM_SETTINGS_PATH` и `NODE_OPTIONS` были unset: путь определил существующий settings owner. Файл владельца не менялся и не копировался. Новых вызовов модели во второй сессии не было.

## Что исправлено

- Canonical delivery проходит без расширения public schema; private `args.delivery` передаёт его native owner. Промпты не менялись.
- Громкость1 — родной минимум1; 2 — общий `Character::indoor_voice`, вынесенный из `npc::indoor_voice`; 3/4 — `get_shout_volume`. Родное правило и ветки NPC сохранены без второй копии (`npc.cpp:2116–2155`, `character.cpp:4641–4676` снимка0d8843f).
- Instant — одна эмиссия и родная цена chat `-get_speed()` (`npctalk.cpp:1541`); brief — прежняя native wait activity3s. Sustained — понятный отказ до мутаций. Матрица4×3 и malformed проверены.
- Native socket-тест проверяет реальный `target_actor_ref`: выбранный `npc:<id>`, пустой при отсутствии/отмене; CHAT не перехвачен.
- Причина обрезания установлена: наш `.width(70)` становился `_max_length` в `string_input_popup.cpp:45–90`. Override убран; родной предел1024 экранные колонки. Фактический ввод94 символа целиком отражён в planner output, включая конец «Ты меня слышишь?».
- PLAY описывает меню при2+ доступных видимых NPC, автоматический единственный адресат, Esc без ответа NPC, границы6 примитивов/радиус1, sustained и огрубление повышенного голоса до крика.

## Реальный E2E и сохранение

[Первый PTY](evidence/task03-delivery/native-first.txt), [повторный PTY](evidence/task03-delivery/native-reload.txt). В обоих evidence записаны code HEAD и binary SHA256. Это поток терминальных обновлений с удалённым ANSI, не реконструкция экрана.

1. F12 «Подожди на месте.» — native wait выполнен, журнал P показывает завершение и принятие.
2. F12 «Скажи дословно: „Добрый день, мастер. Я стою рядом и говорю обычным голосом. Ты меня слышишь?“» (94 символа с исходными кавычками) — planner выбрал loudness2/brief; NPC Qwen ответил **«Да, я тебя слышу. Добрый день.»**; audit принял, родной P показал эту речь.
3. Следующий F12 «Скажи: „Ты меня хорошо слышишь?“» — planner выбрал loudness2/instant. Qwen предложил **«Да, я тебя слышу.»**; audit отказал `unsupported_current_condition`. Существующий owner заменил ответ на **«Об этом я ничего подтвердить не могу.»**, повторный audit принял. В P прозвучала замена, а не первоначальный ответ Qwen.
4. Esc → S → Y, затем Q → Y — exit0. Повторный PS1 загрузил тот же постоянный мир и P с обеими фактически прозвучавшими репликами; повторные save/exit — exit0. Нового item UID failure не было. Игра/coordinator после выхода завершены.

Таким образом, действие, два последовательных intent, native речь, save/reload и длинный ввод подтверждены. **Два принятых ответа Qwen подряд не подтверждены.** Перестройкой промптов или повторением до удачи отказ не скрывался.
Замер warm12,634/16,321s из [предыдущего этапа](TASK03-LIVE-RESULT.md) относится к прежнему binary; этим двум новым PTY-сессиям точный startup latency не приписывается.

## Qwen: учёт всех вызовов

Общий ledger: **14/30** использовано, осталось16. До reply-03e было4; здесь NPC bench2 и actual PS1 ещё8. Все HTTP200, ответный model ID `qwen3.8-27b`, согласованный gateway alias `qwen3.8-27b-uncensored-w4a16-tp2`. Window65536; в каждом вызове prompt + max_tokens помещается в него. Предыдущий wire/alias PASS не повторялся: [история](TASK03-QWEN-RESULT.md).

| № | Роль/сценарий | Prompt | max_tokens | Время, мс |
|---|---|---:|---:|---:|
|5|NPC bench responder|2915|1000|3260|
|6|NPC bench audit|1153|256|697|
|7|Live wait planner|9054|20000|1401|
|8|Live long speech planner|9110|20000|2432|
|9|Live first responder|2927|1000|2329|
|10|Live first audit|1149|256|709|
|11|Live second planner|9070|20000|2141|
|12|Live second responder|2894|1000|2268|
|13|Live second audit, отказ|1110|256|766|
|14|Audit deterministic fallback|1101|256|454|

Метрики и безопасные model outputs: `evidence/task03-delivery/attempt-05…14*.json`.
[NPC bench](evidence/task03-delivery/qwen-npc-bench-result.json) использует существующий responder/auditor path с synthetic native readback, без planner; это не игровой E2E. Его принятый ответ: «Да, слышу тебя. Что случилось?».

## STOP: существующая semantic replacement

Узкая независимая проверка: [фактическая цепочка](evidence/task03-delivery/reply03e-grounding-note.md).
`apps/game-server/src/runtime/lower-dvina-trace-conversation-llm.js:48–55,89–134` при `semantic_grounding` возвращает программно составленную реплику без второго responder LLM. `packages/turn/src/npc-semantic-decision.js:258–279` учитывает один repair; live config по-прежнему max1. Call14 — второй audit, не второй responder.
Решение владельца по repair отказа семантики NPC — в [TASK03-REPAIR-RESULT.md](TASK03-REPAIR-RESULT.md); прежняя ссылка на §37.2 устарела.
По СТОП-правилу владельца дальнейшие Qwen/реализация остановлены. Это частичная живая проверка одного repair-прохода #773, **не** проверка двух плохих responder outputs с уходом в родной NPC. Fake-проверка ровно2 попыток остаётся успешной в focused suite.
Распорядителю: оформить отдельную находку owner/Contract Auditor и решить, как обрабатывать semantic rejection по активной норме; затем отдельный план правки существующего owner, focused fake и ограниченный повтор Qwen в оставшемся бюджете. Промпты без согласованного плана не менять.

## Фактически выполненные проверки

- JS boundary/coordinator **56/56 Windows и56/56 WSL**; [WSL лог](evidence/task03-delivery/reply03e-js-wsl.log).
- Native `[novgorod_live]`: **13 cases /571 assertions, exit0**; [лог](evidence/task03-delivery/reply03e-native-focused.log). Матрица4×3, malformed, selected/empty кадр включены.
- Native build409/409; исходный exit потерян при передаче помощнику. Root повторил `cmake --build ... --parallel 8`: **ninja:no work to do, exit0**, затем скопировал runtime и сверил SHA256. [Build record](evidence/task03-delivery/reply03e-build.md).
- Launcher focused/Python **31/31**, docs:generate/check, knowledge:check, architecture:check, test:docs **18/18** PASS; логи рядом. Финальный повтор docs/knowledge/architecture/test:docs после отчёта также PASS (`final-*.log`). Privacy-проверка43 файлов отчёта/evidence/PLAY: совпадений ключа и адреса owner settings0; значения не выводились.
- D219 **3 cases /86442 assertions** PASS в предыдущем этапе, не перезапускался: [исторический лог](evidence/task03-qwen/autosave-focused.log). Часовой рубеж после реальных301s; сон8h за2,10246s не дал дополнительных autosave до5min. Счётчики приёма поколения не проверялись:5b отсутствует.
- Native overlay apply-check и scoped технический аудит PASS_WITH_NOTES: [аудит](evidence/task03-delivery/reply03e-audit.md). Это не приёмка Claude Sonnet/Opus. Его чистый вывод относится к изменённой delivery дельте; последующая находка existing grounding owner описана выше.
- CBM detect_changes:52 seed symbols/20 impacted; coverage проверен. Metadata stale и Catch/PowerShell gaps сверены прямыми исходниками; полнота графа не заявляется.
- Перед code push origin/main6a5292b29 fetched, уже ancestor; нового merge не требовалось. Protected нормы не менялись. Sealed, Docker, main push и PR merge не выполнялись.

## Оставшееся

Память/knowledge/social context NPC пусты; причина rejection «слышу» без нового исследования не установлена. Optional5b (поколение, экран момента восстановления), назначенное движение NPC и повторное измерение warm на новом binary не сделаны после STOP. Multi-NPC меню вручную не прогонялось; focused filter/frame tests есть. Повышенный=крик, sustained отказ — согласованные ограничения. Native мир вне двора и test_data recurrence остаются. Full CI/test:apps и Docker-проверки здесь не запускались; P3 GO/final acceptance не заявляются.
