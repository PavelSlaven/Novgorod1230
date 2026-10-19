> Исторический source audit e84cb0877. Итоговые native/runtime результаты обновлены в [результате задания](../../TASK03-LIVE-RESULT.md) и [проверке финального delta](REPLY03D-FINAL-DELTA-REVIEW.md).

# Reply03d — Contract Auditor, внутренний проход

Применён `.agents/skills/contract-audit/SKILL.md`, каноническая процедура AR §25.1. Это независимый read-only аудит источников и реализации, **не внешняя приёмка Sonnet/Opus, не P3 GO, не готовность живой dev-пробы**. Код не изменялся. Создан только этот отчёт.

## CONTRACT AUDIT FINDING

audited_head: `e84cb0877d840ae1bfdb3630fbafcb7ab5149ec2` + SHA256-манифест ниже.

scope: delta `dd98d4674` / `ef58f5d67` → проверенное рабочее дерево: selected-NPC native→Node→operation→reply; resident AF_UNIX orchestration; устранение early-review #1/#7/#9; repair=1 и D219 как существующий baseline выбранного плана. Содержание нового итогового current-result, который ещё готовит ведущий, **не входит** в этот проход. Предыдущие TASK03-LIVE-RESULT/TASK03-REPLY03C остаются checkpoint/history, их таблицы не признаны финальными. Появившаяся во время чтения правка `dev-world/start.json:13` зафиксирована отпечатком, но реальная загрузка мира не проверена.

source_set / source_statuses:

- `AGENTS.md` + все шесть `docs/governance/*.md`: GOVERNING, неизменны.
- `data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md`: active navigation index, прочитан для precedence/status и применимых Player semantic / provider / NPC / Conversation / Time / UI строк; неизменён.
- `turn_step_llm_contract.md`: ACTIVE player-turn; `npc_autonomous_decision_contract.md`: ACTIVE NPC subjective boundary; `npc_conversation_mode_contract.md`: ACTIVE conversation, §4.1–4.5, §5, определения intended_addressee/actual_listener/bystander; `temporal_world_and_interruptible_activities.md`: ACTIVE time/activities. Они продолжают определять production и не активируют CDDA prototype.
- `tools/cataclysm-prototype/MODULE.md:3–6,20–25,57–59`: изолированный native prototype, CDDA — physical/time/save owner, production runtime/bindings не подключены. `packages/turn/MODULE.md`, `npc-runtime/MODULE.md`, `llm-runtime/MODULE.md`, `visibility-knowledge-memory/MODULE.md`, `time-events-history/MODULE.md` подтверждают существующих owners.
- `TASK03-PLAN.md`: REFERENCE / утверждённый план dev-пробы, D219 + разрешённое private `target_actor_ref` (`:82–100`); не production contract. Нормы/CR до P7 и canonical/public изменения остаются запрещены.
- Формальные schemas — `packages/turn/src/turn-step-contracts/request-schema.js:27–57`, `plan-schema.js:64`; native frame остаётся private transport frame. `p3-dev-config.json` задаёт 30 calls / 1 repair только dev запуску. Native upstream закреплён README на `0d8843f1c500052c3e026e3da6f8edaf5e00b626`.

observed_implementation:

1. `native-live-input.patch:320–379`: точный исходный CHAT predicate вынесен в общую `chat_available_creatures`, используется исходным CHAT и `select_chat_target`; родное `creature_select_menu(...,false)` сохраняет cancel/zero/one/multiple semantics. Нового selector/параллельного фильтра нет. Проверенный аналог: upstream `npctalk.cpp:1063–1077`, menu `:751–782`; ссылки сохранены в плане/предыдущем checkpoint.
2. `novgorod_semantic.cpp:625–640,726–734`: выбранный native NPC ID становится optional `target_actor_ref`. Cancel/не-NPC/нет кандидатов оставляют поле отсутствующим. `p3-live-coordinator.mjs:55–65` передаёт ref приватно. `p3-boundary.js:657–675,737–743` заполняет существующий `emit_interaction.target_actor_refs`, не меняя canonical request/output schemas.
3. `p3-boundary.js:414–433`: ответ разрешён только выбранному NPC с совпавшими ref/id, фактическим actualHeardListenerIds и видимостью/identity после native refresh. Hearing не подменён intended audience; witness не становится ответчиком по порядку массива. Native speaker lookup `novgorod_semantic.cpp:325–336` повторно использует общий CHAT candidate owner.
4. `novgorod_semantic.cpp:657–675,702–717`: старые request IDs игнорируются до apply, result закрывает fd; следующий intent открывает новое соединение. Общий apply/finish через обычный native loop сохранён. Node не выполняет CDDA process-per-action, не пишет live userdir, не запускает save или вложенный do_turn. Coordinator — transport/orchestration adapter существующих semantic owners.
5. `novgorod_semantic_test.cpp:754–758` теперь ждёт EOF и отвергает **любые лишние байты readback**. Это закрывает прежний слабый oracle stale-ID; отсутствие ID guard вызывает отказ/readback либо ошибку вместо зелёного теста. Peer больше не закрывается через 100 мс, устраняя прежнюю гонку timeout fixture. Оба замечания предыдущего review исправлены исходниками; native PASS этим не заявлен.
6. `p3-live-coordinator.mjs:72–96`: no-action/unsupported сообщает границу шести действий/радиуса; native refusal и busy имеют отдельные сообщения; already-applied/unknown не обещают rollback.
7. Repair остаётся у `packages/turn/src/npc-semantic-decision.js`: единый repairAttempts учитывает structural+semantic, live передаёт 1; default 2 не менялся этим delta. Хороший ответ: 1 responder + grounding auditor; bad+bad: 2 responder attempts, третьей нет. Общий budget считает все роли, включая repair/audit. Новый retry loop и второй planner не введены.
8. D219 baseline: `native-autosave-options.patch` меняет только максимум 1000→3600; runtime profile true/3600/5, родной do_turn/autosave/quicksave не переписан. `run-p3-dev.sh:87–96,133` получает начальный timeout из existing role configs, role_phase задаёт timeout текущей роли. Нет нового общего intent budget. Optional whole-set completion 5b и goto 7 не объявлены реализованными.

required_by_active_contract: один authoritative owner; точная речь и раздельные intended_addressee / actual_listener; безопасный субъективный NPC context; formal turn/decision schemas и существующие repair owners; честное описание фактически выполненных проверок.

target_if_any: только изолированная ограниченная dev-проба по TASK03-PLAN; никакой promotion proposed/target в ACTIVE.

conflict: нового блокирующего противоречия governing/active contract в проверенном **code delta** не найдено. Полного production conversation/time/persistence соответствия у прототипа нет и здесь не заявлено.

precedence_resolution: governing/active нормы сохраняют силу; plan/owner approval разрешает private frame и ограниченную dev-пробу, не меняет production нормы. `git diff dd98d4674 -- AGENTS.md docs/governance data/knowledge-source schemas packages` пуст — public/canonical schemas/contracts/exports/active bindings не изменены. Изменения ограничены tools prototype и его evidence/docs.

first_bad_boundary: в проверенном code delta не установлена; фактическая незакрытая граница — native runtime verification, ниже.

correct_owner: CDDA — выбор/видимость/слух/physical apply/loop/time/save; `@rus/turn` — turn/decision/repair; существующий role runtime — модельные роли; Node — private transport/coordinator.

required_code_delta: по source audit отсутствует; требуется исправить/объяснить реальные native focused failures у native/test owner до заявления готовности.

required_docs_delta: ведущий готовит current-result с точными logs/counts/ограничениями. Старый checkpoint не переписывать как новый PASS. Для настоящего gameplay run нужен отчёт WR §24.1; никакого такого прогона этот аудит не выполнял.

required_tests: реальный `[novgorod_live]` после исправлений, затем PTY menu cancel/monster/selected NPC E2E, два последовательных речевых intent, save/exit/reload. Остальные deferred scopes ниже.

severity: P2 (verification/runtime limitation, не найденный новый production contract violation).

verdict: **PASS_WITH_NOTES для указанного source/code delta. Готовность dev-пробы и final acceptance НЕ подтверждены.**

## Выполнено и осталось

- Выполнено лично: focused Node на `p3-boundary.test.js`, `p3-live-coordinator.test.js`, `packages/turn/test/npc-semantic-decision-stale-repair.test.js` — **46/46 PASS, 0 fail/skip**; `git diff --check` PASS. Два JS-файла без repair suite дают 43, поэтому старый count не смешивается с полным focused count 46.
- Native не запускался этим аудитором. Прочитанный локальный `.tmp.driveupload/task03/reply03d-build-exits.txt` содержит **build=0, focused=1**; `reply03d-focused.log` — **18 cases: 14 pass / 4 fail; 265 assertions: 260 pass / 5 fail**, включая 65 CHAT candidates вместо 1 и unexpected UI в headless тесте. Это промежуточный чужой прогон, **не final native PASS**; ведущий/native owner должен устранить и подтвердить новым логом. Причину всех failures здесь не диагностировал.
- Deferred: curses warm start, правильная real-world scene load после directional terrain fix, native zero/one/multiple/cancel/monster, полная selected-NPC цепочка и actual hearing, две живые реплики с ответами, provider/Qwen в разрешённом бюджете, autosave hour/sleep real-time throttle и native save/exit/restart. Optional 5b/7, P3/T09/T10 GO не закрыты.
- `knowledge:{}`, `memory:{}`, `social_context:{}` (`p3-boundary.js:471`) — известный gap субъективного контекста и памяти. Сейчас не исправлялся; успешный fake speech test не доказывает полноценного NPC roleplay/сохранения conversation history. Не выдавать пустые контексты за соответствие production conversation contract.
- CBM discovery из предыдущего прохода сохранён; повторно выполнены detect_changes(dd98), coverage всех implementation/module/schema опор и scope tools. Индекс metadata_changed, C++ Catch tests partial, scope known_gaps; выводы проверены прямым source/diff чтением. Неполный граф не использован как доказательство отсутствия изменений. `rg` недоступен, использован PowerShell fallback.
- Новые LLM/Docker/sealed/PTY/large suites не запускались. Внешняя Sonnet/Opus проверка — отдельный проход после подготовки результата ведущим.

## Проверенный объект

SHA256 ниже вычислен от UTF-8 строк `path SHA256`, отсортированных по path и соединённых LF без финального LF. Это отпечаток scope для AR §25.1, не runtime integrity механизм. Изменение перечисленных implementation/plan файлов требует сверки нового объекта; будущая правка current-result вне данного scope не получает автоматического одобрения.
Scope manifest SHA256: `EBBB0BA4D974D39AC940EB7CF8FF552678009BCDDADC1F315E69A19535AFE5E8`

```text
packages/turn/src/npc-semantic-decision.js 3A4003FC4DDB513E435B2C6DD2D6BCD1D0E11E1822339247EF9E756DF1C7D0B0
packages/turn/src/turn-step-contracts/plan-schema.js 0540E7671E41998248903A88890F125FD505C81775B5A67A70F107A0F5E10E70
packages/turn/src/turn-step-contracts/request-schema.js 405C9E5CDE1C023CACC32041B432E3845FA99AC989BEFD3B7FF8EF6060BB5271
packages/turn/test/npc-semantic-decision-stale-repair.test.js 158015197AB1858280EFE3A1ED199E23ADEB0B6F3AF9B86A4CFA3160510B379E
tools/cataclysm-prototype/dev-world/start.json 04DF0E0FF3D852690BE447D9503A10BB4835BB3BE3231D1A79991668ACB92944
tools/cataclysm-prototype/MODULE.md 65594E1B8B4B6E708FBCC3A1EB8B133A637A6C32CC81F1935F8101B3E1820DAD
tools/cataclysm-prototype/native-autosave-options.patch CB900D6CB3C567E1CF8B5B45A4EBB5222A838DA61972A077AFD561601399B2AA
tools/cataclysm-prototype/native-live-input.patch C494F893E652A6F67D783DF00776BB56F36BEBA45AF4EB77531BE03956A047F8
tools/cataclysm-prototype/novgorod_semantic_test.cpp 110A0C57D502458EBD47466214352C36E36B47684EDF6AD6172EA953A1EF33FE
tools/cataclysm-prototype/novgorod_semantic.cpp B6E461177D712E43E8D8E3DBCA7C558E71545B11C8399DFCDBF49E1FCB4CE2B6
tools/cataclysm-prototype/novgorod_semantic.h D04270328FCF292D8F483627E4C2284E1AD3AD3021C92F1C18D1928BE5AEFD39
tools/cataclysm-prototype/p3-boundary.js FF9BBBCB855CC26FC05D83B8C7288310C5C9EC2F0CB4B5E9B7EE823C0AF547DB
tools/cataclysm-prototype/p3-boundary.test.js C3699867C67F9FC78AA2BC41DBFBB1A08E930CD49AA197C5F2AA2F9ECF2AEE27
tools/cataclysm-prototype/p3-dev-config.json 1D20B16B2E04C2ED707FCAB16A4F4233433C17262E2717FECE576D5894439472
tools/cataclysm-prototype/p3-live-coordinator.mjs DB4CD8BA17E73A93F710CFA2CD1039F95FED0F78A4CA4FC7B004F9A975FF331B
tools/cataclysm-prototype/p3-live-coordinator.test.js 6EE3C69CBFD090CA1B997420ABB4A9B0703CA0A94C371F25509C3DC3A31A9C9C
tools/cataclysm-prototype/p3-live-socket.js DF06C34DADF9E907184B19251079BC7ACA46760FB194B603810F406570A83F79
tools/cataclysm-prototype/run-p3-dev.sh 02D32345C5AD2390F813A5A5C28F210C6D1B532D16E6731D65D8D6CBBA9FA76D
tools/cataclysm-prototype/TASK03-PLAN.md 876D466E476C3038199D537514EC02A942D9D7629B86A2E756B5DEB358C29733
tools/cataclysm-prototype/test_dev_launcher.py C6860D308CAA0C9E78D434F50126DABB202CEB9D0FFF3543D82B122AAFA200B8
```
