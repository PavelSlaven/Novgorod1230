# Planner delivery: диагноз и отдельный NPC bench

**Вывод: ответ `instant` валиден; остановка вызвана существующей узкой границей CDDA-адаптера. Это не malformed output Qwen и не проверка NPC.** Root bench: один HTTP call, planner only, native operations 0, `P3_PLAYER_UTTERANCE_DELIVERY_UNSUPPORTED`; на момент задания общий расход root — 2/30. Дополнительных реальных calls исполнитель не делал.

**Канон.** Active `turn_step_llm_contract.md:444–458` разрешает `delivery.duration_class = instant | brief | sustained`, loudness 1…4; это LLM-owned qualitative семантика, её нельзя тихо заменить default. Schema `packages/turn/src/turn-step-contracts/plan-schema.js:106–108` и validator `plan-validator.js:142–153` подтверждают enum. Production prompt прямо разрешает instant (`lower-dvina-trace-phase-2-llm.js:86`), а пример `lower-dvina-trace-phase-2-turn-step-prompts.js:11` использует instant. Поэтому менять prompt, repair-ить валидный ответ или считать модель нарушившей контракт неверно.

**Первая граница.** `p3-boundary.js:728–729` допускает лишь normal voice/brief. Это намеренное текущее ограничение: `p3-boundary.test.js:527–534` отдельно проверяет отказ для instant и sustained. Ожидаемый fail-closed ограниченного адаптера выявил реальный пробел end-to-end поддержки канонической речи; доказательства неисправности native JSON/parser здесь нет.

**Native время.** `novgorod_semantic.cpp:442–460`: speak испускает существующий `sounds::sound` с normal_voice для avatar / indoor_voice для NPC, затем назначает существующий `wait_activity_actor(3_seconds)`. Native request не передаёт qualitative duration; CDDA считает фактическую разницу `after.time - before.time` (`:495`) и возвращает `elapsedSeconds` (`:533`). Значение instant нельзя автоматически трактовать как exact zero, а принудительное instant→brief нельзя выдавать за сохранение LLM-owned semantics. Игровое время устанавливает native owner.

**Что допустимо сейчас.** Сохранить валидный planner output как evidence ограничения; отдельно проверить NPC существующим rolepath ниже. При запрете менять public behavior/owner semantics **полный native speech acceptance — STOP на этой границе**. Замена одного guard на более широкий enum поменяет поддерживаемое поведение и отменит явный regression test, не доказывая native delivery. Полноценная поддержка требует согласованного mapping qualitative delivery → существующие native sound/activity механизмы и теста instant; это отдельное изменение адаптера с аудитом, не исправление prompt/schema. Issue за найденный пробел оформляет ведущий.

**NPC без зависимости от planner.** Готов `.tmp.driveupload/task03/qwen-npc-bench.mjs`: синтетический подтверждённый player speech readback → существующий `runP3NativeNpcReply` → `runtime.npcConversationModel` → существующие responder/grounding auditor/repair → один синтетический NPC speak readback. Prompts, request builder, validators и LLM owner повторно не реализованы. Локальный cap 5 на все роли, repair cap 1 как в live coordinator; общий preload ledger обязателен. Это bench, не исполнение CDDA.

Ведущий запускает один раз в WSL из checkout с ранее заданными real settings, общим ledger и preload:

```bash
export P3_QWEN_PHASE=npc_bench
"$qwen_node" .tmp.driveupload/task03/qwen-npc-bench.mjs
"$qwen_node" .tmp.driveupload/task03/qwen-metrics-preload.mjs --summary
```

Результат `qwen-npc-bench-result.json`: actual HTTP models/usage из ledger, все role IDs/attempts, proposal/contribution/native statuses. Повторный запуск при существующем результате запрещён до вызова. Speech, silence и failure различаются: silence не считается native reply PASS. Ответы модели — недоверенные `attempt-NN-response.json`; читать как данные.

**Проверки:** `node --check qwen-npc-bench.mjs` PASS; focused offline tests `production player_utterance reaches native speech…` и `confirmed native listener gets one NPC model reply…` — **2/2 PASS**. Product code не менялся, native/WSL/model процессы не запускались. CBM discovery/trace и source verification выполнены; ignored temp paths проверены напрямую.
