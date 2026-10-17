# NPC audit medium 686ea — FAIL, требуется исправление формата диагностики

## Identity

Кандидат 686ea46d5f16ec8f75d1db729133edccbb752377, изолированная ветка codex/d49-npc-audit-target. Fleet job 20261017T084520.393686Z-1, 17 октября 2026. Фактическая модель ответа из provider body: qwen3.8-27b-uncensored-w4a16-tp2; endpoint gpu3, одна карта/int8 KV/65536.

## Preconditions

Все 14 полных system/user сообщений совпадают с 43fc; изменён только режим существующего private NPC auditor с off на medium. Неудачный low предварительно полностью отменён. Роль, модель, temperature 0, top_p 1, max_tokens 20000, 120 секунд на вызов, общий бюджет хода 360 секунд, количество вызовов, repair policy и валидатор не менялись. Medium разрешён active turn-step §16. Фактический серверный шаблон при medium не добавляет инструкцию краткого рассуждения, присутствующую при low; это гипотеза, не гарантия результата.

Независимый scoped Contract Auditor: PASS_WITH_NOTES. Предыдущие два облачных ответа на побайтно тех же messages использованы только как input preflight, что отдельно принято аудитором и временным ведущим; это не новая cloud medium проба и не доказательство качества остальных случаев. Пользователь ранее разрешил Codex вместо недоступного Sonnet. Единственное исключение C8 #745 касается склейки двух JSON сообщений в review tooling; семантических исключений нет.

## Gameplay transcript

Это стенд private NPC-аудитора на снятых production-входах и парных вариантах, не игровой ход. Все 14 вызовов выполнены последовательно один раз, без retries. Каждый wire совпал с frozen dry-run, parsed output совпал с final provider content. Дословные окончательные ответы ниже; private reasoning не публикуется и судье не передавалось.

### iron-hook-supported

~~~json
{"utterance_fragments":[{"text":"Микула,","factual":false,"claim_ids":[]},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[],"pass":true}
~~~

### iron-hook-unsupported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"приманить рыбу лучше железным крючком или острогом.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[{"kind":"ungrounded_claim","reason":"Источник (claim:population-iron-hook) констатирует: «Железо использовали для рыболовных крючков и острог». Не утверждает, что это «лучше» для «приманки»; крючок и острог — инструменты для ловли/вытаскивания, не приманка.","quote":"приманить рыбу лучше железным крючком или острогом."}],"pass":false}
~~~

### boat-context-supported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"сеть при такой ловле вытаскивают на берег или в лодку.","factual":true,"claim_ids":["bench_boat_context"]}],"concerns":[],"pass":true}
~~~

### boat-context-unsupported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"на каждом берегу есть лодка, чтобы вытащить сеть.","factual":true,"claim_ids":["bench_boat_context"]}],"concerns":[{"kind":"grounding_contradiction","reason":"claim:population-boat-work описывает альтернативу (на берег или в лодку), а claim:population-boat-context прямо говорит: «это не свидетельство судна на каждом берегу»; утверждение «на каждом берегу есть лодка» несовместимо.","quote":"на каждом берегу есть лодка"}],"pass":false}
~~~

### net-work-supported

~~~json
{"utterance_fragments":[{"text":"Микула,","factual":false,"claim_ids":[]},{"text":"новгородский рыбный промысел включал работу сетями.","factual":true,"claim_ids":["bench_net_work"]}],"concerns":[],"pass":true}
~~~

### net-work-unsupported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"я лично умею ставить любую сеть без лодки.","factual":true,"claim_ids":["bench_net_work"]}],"concerns":[{"kind":"personal_skill_overclaim","reason":"Источник claim:population-net-work явно гласит: «не доказательство навыка конкретного человека». Claim утверждает «лично умею» — противоречие с явным ограничителем источника.","quote":"я лично умею ставить любую сеть без лодки."},{"kind":"quantifier_overclaim","reason":"Источник упоминает «работа сетями» как профессиональный контекст, но не подтверждает «любую» сеть. Квантор «любую» не имеет точного свидетельства в request.","quote":"любую сеть"}],"pass":false}
~~~

### bark-float-supported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"берестяные полосы использовали для скрученных и сшитых поплавков.","factual":true,"claim_ids":["bench_bark_float"]}],"concerns":[],"pass":true}
~~~

### bark-float-unsupported

~~~json
{"utterance_fragments":[{"text":"Микула,","factual":false,"claim_ids":[]},{"text":"все поплавки делали одинаково из бересты.","factual":true,"claim_ids":["bench_bark_float"]}],"concerns":[{"kind":"contradiction_with_source","reason":"Source: 'форма и соединение зависели от снасти' (varied by gear). Claim: 'все… одинаково' (all identical). Direct contradiction.","quote":"все поплавки делали одинаково из бересты."}],"pass":false}
~~~

### fish-food-supported

~~~json
{"utterance_fragments":[{"text":"Микула,","factual":false,"claim_ids":[]},{"text":"в средневековом Новгороде рыба служила пищей и предметом хозяйственных отношений.","factual":true,"claim_ids":["bench_fish_food"]}],"concerns":[],"pass":true}
~~~

### fish-food-unsupported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"рыба каждый день в изобилии идёт именно у этого берега.","factual":true,"claim_ids":["bench_fish_food"]}],"concerns":[{"kind":"unsupported_claim","reason":"claim:population-fish-food подтверждает лишь, что рыба засвидетельствована как пища и предмет хозяйственных отношений в средневековом Новгороде. Детали «в изобилии», «каждый день» и «именно у этого берега» в источнике отсутствуют; текущие наблюдения фиксируют лишь воду, кромку берега и деревья, без рыбы.","quote":"рыба каждый день в изобилии идёт именно у этого берега."}],"pass":false}
~~~

### repair-retained

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[],"pass":true,"original_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[],"supported":false,"retained":true},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"],"supported":true,"retained":true}]}
~~~

### repair-dropped

~~~json
{"utterance_fragments":[{"text":"Микула,","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[{"kind":"lost_supported_fact","reason":"Исходный факт bench_iron_hook (железо для крючков и острог) подтверждён claim:population-iron-hook; с исходным claim обязан сохраниться, но новая речь его не содержит.","quote":""}],"pass":false,"original_fragments":[{"text":"Микула,","factual":false,"claim_ids":[],"supported":false,"retained":false},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"],"supported":true,"retained":false}]}
~~~

### neutral-control

~~~json
{"utterance_fragments":[{"text":"Микула, не знаю.","factual":false,"claim_ids":[]}],"concerns":[],"pass":true}
~~~

### repair-dropped-claimless-original

~~~json
{"utterance_fragments":[{"text":"Микула,","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[],"pass":true,"original_fragments":[{"text":"Микула,","factual":false,"claim_ids":[],"supported":false,"retained":false},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":[],"supported":true,"retained":false}]}
~~~

## Persistence/readback

Игровые БД, сохранения и службы моделей не изменялись. Результат стенда опубликован: exit_code 0, duration 285.518 секунды. Задержка между завершением worker и publication устранена очередным штатным циклом fleet без вмешательства и повторного вызова модели. Первая попытка копирования staging совпала с его удалением после publication и получила ENOENT; затем прочитан официальный опубликованный result. Это не потеря ответов и не доказанный дефект fleet.

## Findings

Точное production-решение/формат: **13/14**. fish-food-unsupported верно отклонён по смыслу, но reason содержит 305 символов при лимите 240; production validator вернул TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID. Лимит и assertions не ослаблены. Полная независимая семантическая оценка:

# Independent blind review: 14-case Qwen NPC grounding audit

Источник: полный `final-outputs.jsonl` (только `request` и `final_content`), `cases.json`, `RUBRIC.md`, `deterministic-check.json`; приватный `results.jsonl` не читался. Исходники: `npc_conversation_mode_contract.md` §37.2 и фактический валидатор `lower-dvina-trace-npc-speech-grounding-audit.js` на HEAD `686ea46d5f16ec8f75d1db729133edccbb752377`. Во всех 14 строках модель `qwen3.8-27b-uncensored-w4a16-tp2`, `finish_reason=stop`; все 14 `final_content` — разбираемый JSON и в точности совпадают с сохранённым `output`. `production` — фактический результат сервера, а не моя оценка.

| № | Case | Модель / finish | Production / JSON | Смысл | Итог | Решающая цитата или причина |
|---:|---|---|---|---|---|---|
| 1 | `iron-hook-supported` | Q/stop | PASS / да | PASS | PASS | «железо использовали для рыболовных крючков и острог» точно поддержано `claim:population-iron-hook`; claim/ref и разметка верны. |
| 2 | `iron-hook-unsupported` | Q/stop | FAIL / да | FAIL | FAIL | Правильно отвергнуто «приманить рыбу лучше», но reason добавляет не данное источником: «для ловли/вытаскивания, не приманка». Источник фиксирует применение железа для крючков/острог, не сравнительную эффективность и не эту дополнительную функцию/отрицание. |
| 3 | `boat-context-supported` | Q/stop | PASS / да | PASS | PASS | «при такой ловле вытаскивают на берег или в лодку» совпадает с `claim:population-boat-work`; нет утверждения о лодке сейчас или у каждого берега. |
| 4 | `boat-context-unsupported` | Q/stop | FAIL / да | FAIL | FAIL | Решение верно, `kind=grounding_contradiction` ложен: «это не свидетельство судна на каждом берегу» означает отсутствие доказательства, не доказательство отсутствия. |
| 5 | `net-work-supported` | Q/stop | PASS / да | PASS | PASS | «новгородский рыбный промысел включал работу сетями» точно поддержано `claim:population-net-work`. |
| 6 | `net-work-unsupported` | Q/stop | FAIL / да | FAIL | FAIL | Верно отвергнуты «я лично умею» и «любую», но reason говорит «противоречие» из «не доказательство навыка конкретного человека»; это отсутствие личного свидетельства, не несовместимый факт. |
| 7 | `bark-float-supported` | Q/stop | PASS / да | PASS | PASS | Применение берестяных полос для скрученных и сшитых поплавков точно подтверждено. |
| 8 | `bark-float-unsupported` | Q/stop | FAIL / да | FAIL | FAIL | Диагноз «Direct contradiction» обоснован для «одинаково» (форма зависела от снасти), но пропущено отдельное неподтверждённое «все ... из бересты»: источник не устанавливает исключительный материал всех поплавков. |
| 9 | `fish-food-supported` | Q/stop | PASS / да | PASS | PASS | Рыба как пища и предмет хозяйственных отношений в средневековом Новгороде поддержана `claim:population-fish-food`. |
| 10 | `fish-food-unsupported` | Q/stop | INVALID / да | PASS | FAIL | «каждый день в изобилии ... у этого берега» верно отвергнуто по смыслу, но `concerns[0].reason` имеет 305 символов при лимите 240: `TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID`, а не корректный FAIL. |
| 11 | `repair-retained` | Q/stop | PASS / да | PASS | PASS | Поддержанный исходный факт остался в новой речи с тем же `bench_iron_hook`; `supported=true, retained=true`. |
| 12 | `repair-dropped` | Q/stop | FAIL / да | FAIL | FAIL | Потеря поддержанного исходного факта правильно отмечена, но для исходного «Микула,» задано `retained:false`, хотя новая речь тоже начинается «Микула,». |
| 13 | `neutral-control` | Q/stop | PASS / да | PASS | PASS | «Микула, не знаю.» — нынешний отказ без фактического утверждения; исходной речи для сохранения нет. |
| 14 | `repair-dropped-claimless-original` | Q/stop | PASS / да | FAIL | FAIL | Отсутствие исходного claim действительно разрешает опустить поддержанный факт. Но исходное «Микула,» снова помечено `retained:false` при том же обращении в новой речи. |

`Q` = фактическая модель выше. Счёт: 13/14 точных production-решений и форматов (8 PASS, 5 FAIL, 1 INVALID); 8/14 ответов с полной смысловой верностью, включая диагностику и флаги фрагментов; 7/14 проходят оба порога. Первое плохое место по порядку — case 2: reason вышел за переданные факты. Первая ошибка production-формата — case 10: длина reason 305 > 240. Порог **14/14 + 14/14 не достигнут: FAIL**.

| Case | dislike (точная проблема) | improve (только из переданных фактов) | missing_facts |
|---|---|---|---|
| `iron-hook-unsupported` | «для ловли/вытаскивания, не приманка» вводит дополнительную функцию и отрицание. | Оставить: источник подтверждает применение железа для крючков и острог, но не превосходство для приманивания. | Свидетельство о сравнительной эффективности приманивания; источник не задаёт её. |
| `boat-context-unsupported` | «прямо говорит ... несовместимо» подменяет отсутствие свидетельства противоречием. | `kind`/reason: нет подтверждения лодки на каждом берегу; источник описывает альтернативу берег/лодка и прямо ограничивает вывод. | Наличие лодки у каждого берега. |
| `net-work-unsupported` | «противоречие с явным ограничителем источника» — неверное описание неполного доказательства. | Диагностировать отсутствие записи личного навыка Михаила; отдельно сохранить верное замечание про «любую» сеть. | Личный навык Михаила, все виды сетей и работа без лодки. |
| `bark-float-unsupported` | «все… одинаково» отмечено, но «все ... из бересты» осталось без оценки. | Назвать два разных дефекта: единая форма противоречит зависимости от снасти; исключительность бересты не подтверждена. | Данные о материале каждого поплавка. |
| `fish-food-unsupported` | `reason` длиной 305 символов. | Сократить до: «Источник подтверждает рыбу как пищу и предмет хозяйственных отношений; не подтверждает ежедневное изобилие у этого берега». | Текущий локальный улов, частота и количество. |
| `repair-dropped` | `original_fragments` для «Микула,» содержит `retained:false`. | Указать `retained:true` для точного сохранённого обращения; отказ по потерянному факту оставить. | Нет; исходный факт точно подтверждён. |
| `repair-dropped-claimless-original` | `original_fragments` для «Микула,» содержит `retained:false`. | Указать `retained:true` для обращения; исходный фактический фрагмент остаётся `supported:true, retained:false`, но без claim его можно опустить и сохранить `pass:true`. | Нет; исходному факту недостаёт именно исходного claim, который repair не вправе создать. |

Для остальных семи PASS-строк: `dislike` — нет; `improve` — не требуется; `missing_facts` — нет для проверяемых отношений.

`improve_general`: различать «источник не доказывает» и «источник утверждает обратное» в каждом `kind`/`reason`; проверять каждое самостоятельное отношение внутри одного предложения; выставлять `retained` по фактическому присутствию исходного фрагмента и соблюдать лимит 240 символов. Видимые причины ошибок уже находятся в переданных источниках и инструкции; вывод о внутреннем механизме модели не делаю. Новых модельных вызовов, правок кода и повторных прогонов не было.
CBM coverage: оба процитированных файла имеют `no_recorded_issue`, но `freshness=metadata_changed` на поколении `2026-10-16T05:26:03Z`; выводы сверены прямым чтением фактического контракта и валидатора.

## Scoped Contract Auditor

# CONTRACT AUDIT FINDING

audited_head: `686ea46d5f16ec8f75d1db729133edccbb752377`, чистый checkout `codex/d49-npc-audit-target`; проверенная delta от `a99a8ffdf` (пять файлов). Базовый frozen capture: `43fcbb36e163353475163fdb868b9ed2e188b2ae`.

scope: только выбор `medium` для private `npc_conversation_grounding_auditor`, его caller/transport wire, профильный тест, MODULE, CHANGELOG и generated manifest. Прочие изменения D49 здесь повторно не аудировались.

source_set: root `AGENTS.md`, весь governing-корпус `docs/governance/` (`README.md`, `PRODUCT_CONSTITUTION.md`, `ARCHITECTURE_INVARIANTS.md`, `WORKFLOW_RULES.md`, `AUDIT_RULES.md`, `GIT_SAFETY_RULES.md`), `CONTRACT_INDEX.md` (§1–§8.1), `MODULE_INDEX.md`; `packages/llm-runtime/MODULE.md`, `apps/game-server/MODULE.md`; active `turn_step_llm_contract.md` §16 и `npc_conversation_mode_contract.md` §37.2; production caller `lower-dvina-trace-npc-speech-grounding-audit.js`, conversation caller, role adapter/registry, provider config/request, профильный тест. Frozen packet и прежняя cloud-проба — evidence, не нормы. Nested `AGENTS.md` в затронутых `apps`/`packages` не найден.

source_statuses: governing — `AGENTS.md` и governance; индекс — active navigation; turn-step и conversation — ACTIVE в данном scope; MODULE — owner boundary. Temp packet — временное свидетельство. Proposed/migration документы не применялись как production authority.

observed_implementation: `auditFreshNpcSpeech` вызывает ту же роль с `temperature: 0`, `maxTokens: 20_000`, `reasoningEffort: 'medium'` (стр. 120–140). Registry сохраняет default Qwen, JSON mode и пределы. `applyProviderOverrides` для OpenAI-compatible provider удаляет disabled thinking и ставит `reasoningEffort: medium` (provider-request, стр. 72–83); payload выдаёт `reasoning_effort: medium` без `enable_thinking=false` (стр. 102–115). В diff нет нового вызова, provider fallback, изменения prompt или семантического валидатора. MODULE описывает именно этот выбор роли.

required_by_active_contract: turn-step §16, стр. 1409–1424: один provider, 20 000 output tokens, 120 с transport; caller может явно выбрать `medium`, transport не повышает уровень сам. Conversation §37.2 требует private grounding и сохранения подтверждённых исходных фактов при semantic repair либо typed failure. Governing §25.1 требует аудит MODULE/LLM boundary.

target_if_any: гипотеза стенда — `medium` улучшит качество NPC-аудита относительно неудачного `low` без изменения входа/лимитов. Гипотеза пока не подтверждена живой моделью.

conflict: в проверенной delta конфликт с active contract не обнаружен. `medium` разрешён контрактом, выбран role caller, не transport. Качество, 14/14 и latency ещё не установлены.

precedence_resolution: governing → active contracts → MODULE/active role config → production code/tests. Предыдущий default `off` — baseline, не запрет caller override.

first_bad_boundary: для данной delta не найден. Возможный провал проявится на реальном provider response/latency, после проверенного static wire.

correct_owner: game-server conversation caller выбирает reasoning policy; `@rus/llm-runtime` применяет override и transport limits.

required_code_delta: по аудиту нет.

required_docs_delta: по аудиту нет; MODULE, CHANGELOG и generated manifest уже входят в delta.

required_tests: живой последовательный Qwen-прогон 14 frozen случаев без retries, независимая проверка структуры/семантики 14/14 и времени; затем финальные gates exact HEAD у ведущего. Static/capture проверки не заменяют эти gates.

severity: P3 (ограничение приёмки; подтверждённого дефекта контракта нет).

verdict: PASS_WITH_NOTES для medium delta. Final acceptance полного D49 остаётся BLOCK до живой проверки качества и обязательных gates.

## Evidence и пределы

Сам аудитор выполнил `node C:/Users/Slaven/AppData/Local/Temp/d49-npc-medium-bench/validate.mjs`: PASS, 14 frozen запросов, пять пар отношения к источнику и retention/claimless controls; packet фиксирует 8 ожидаемых PASS и 6 FAIL. SHA-256 из `metadata.json`: before `558d23150d39b2ec13b252068d067991c02a3da3a2c18b2995b5d3acff12cd02`, after `a067285d131e58545a46f62cf1a32b2d69f5ab76ce964052dd80e5557766962a`, dry-run `20a5e8d00cee5de3f834889c4c5a9ada5e728656189ad932493b30d53edd0f6c`. Валидатор проверил равенство всех `messages` и прочих wire-полей; изменились только удаление `chat_template_kwargs.enable_thinking=false` и добавление `reasoning_effort=medium`. `capture.mjs` использовал fake fetch: 14 structural captures, 0 реальных model calls. Также `git diff --check a99a8ffdf HEAD` завершился с кодом 0; checkout чистый.

Для двух boat-context случаев самостоятельно сравнены прежние `d49-npc-precision-bench/cloud-input-*` и текущие `cloud-input-*`: полные `messages` равны; отличается только `reasoning_effort` на верхнем уровне. Прежние два cloud-ответа допустимо повторно сослать **только как input preflight** для неизменных сообщений; новый cloud вызов не заявляется. Прежняя cloud оценка не доказывает поведение Qwen при `medium`, остальные 12 случаев, latency либо общую готовность. Разрешение Codex вместо Sonnet получено из контекста ведущего, не устанавливалось этим аудитором.

CBM: primary project `C-Users-Slaven-Documents-Novgorod` indexed, generation `2026-10-16T05:26:03Z`, относится к другому checkout. `check_index_coverage` для затронутых путей дал `metadata_changed`/`missing`; все существенные выводы сверены прямым чтением exact checkout. `detect_changes` на primary вернул посторонний diff, поэтому scope взят из `git diff a99a8ffdf HEAD` в проверяемом worktree. Профильные тесты (13), syntax (2404), architecture/docs checks и fake-fetch capture выполнены исполнителем по переданному ведущим контексту; этот аудитор повторно запускал только валидатор packet и `git diff --check`.

## Result

**FAIL.** Требуется 14/14 по production-формату/решениям и полной семантике. Все finish_reason=stop; вызовы 14.516–27.894 секунды. Это transport latency, не измерение полного игрового хода. Private reasoning присутствует в 14/14 ответах; его содержимое не читалось для оценки и не публикуется. Фактический usage: 123621 prompt + 30475 completion = 154096 токенов Qwen. Точная telemetry Codex и разведчика недоступна.

13 focused tests, syntax 2404 файла, architecture/docs/diff, 14 fake-fetch production captures, dry-run validator и preflight ранее прошли. После реального прогона выполнена проверка всех wire и повторный вызов production auditFreshNpcSpeech с fake roleRunner и сохранёнными outputs. Full npm test и живой D49 на итоговом интегрированном HEAD остаются обязательными.

После независимой оценки medium отменён commit 538a59fcb. `git diff --exit-code 43fcbb36e HEAD` прошёл: дерево снова тождественно 43fc. Повторять тесты на тождественном дереве не требовалось. Начатая узкая инструкция о краткости reason остановлена: она не исправляет остальные смысловые дефекты. Её незакоммиченный diff сохранён только в Temp и снят с checkout; реальные модели не вызывались. До снятия прошли 13 focused tests, syntax, architecture, docs, diff и 14 fake-fetch captures. Этот временный пакет не является прошедшим кандидатом. Непрошедшие изменения в recovery ветку не переносились.

- results.jsonl SHA-256: 70081009cc22594c6f0a1c0e57dff7bec84cff7c8e9006e25c8ded9a9b30ea71
- dry-run SHA-256: 20a5e8d00cee5de3f834889c4c5a9ada5e728656189ad932493b30d53edd0f6c
- RUN-SHA256: 5ba85b507650d5574bce73c706c83b41a6d4d759160274c27e3180f968320f39
- CATALOG-SHA256: 807a925e063475780422d8fbf0ba5b04409f44265f5fc0cf587a5e222409a8d1
- WIRE-REVIEW-SHA256: df9996e7b66c450a94df3c74529a869b8ab321372f98f6f4cb064c0c4136b707
