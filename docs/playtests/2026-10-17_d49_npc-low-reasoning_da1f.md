# NPC audit low reasoning da1f — FAIL, отменён

## Условия и результат

Кандидат da1f49fa696ec05b5dae32916f58d1ffe60c72f8 изменял только выбор reasoningEffort low у существующего NPC grounding auditor. Все 14 полных system/user сообщений и остальные provider options остались прежними относительно 43fcbb36e. Точный production capture с fake fetch и production-builder dry-run подтвердили wire. Роль, модель, количество вызовов, repair policy, 120 секунд на вызов и 360 секунд на ход не менялись.

Независимый scoped Contract Auditor: PASS_WITH_NOTES; это не приёмка качества. Ведущий повторно использовал прежнюю облачную пробу на двух побайтно неизменных входах только как input preflight D157, что аудитор отдельно признал допустимым. Нового cloud call или проверки облачного low не заявляется. Настроенные прежние авторы gpt-6-sol medium, независимый судья gpt-6-sol high; фактическая runtime telemetry Codex недоступна. Пользователь разрешил Codex вместо недоступного Sonnet.

Fleet job 20261017T082403.755466Z-1: published=true, exit_code=0, duration=223.307s, endpoint gpu3, одна карта/int8 KV/65536. Фактический target model qwen3.8-27b-uncensored-w4a16-tp2. Один последовательный прогон 14 случаев без повтора; БД, сохранения и службы моделей не изменялись. Все finish_reason=stop. Каждый вызов 10.856–26.092 секунды; это соблюдение transport deadline, не замер полного игрового хода. В 14/14 provider response было непустое private reasoning поле; содержимое не публикуется и оценщику не передавалось. Usage: 123985 prompt + 23607 completion = 147592 токена Qwen.

**FAIL:** точная production-структура/решение 12/14; полная семантика с диагностикой 12/14; совместно 11/14. Железному крючку ошибочно приписано лучшее приманивание рыбы; отсутствие свидетельства о лодке названо противоречием; верный отказ о поплавках получил reason 251 при пределе 240 и стал INVALID. Порог 14/14, ограничения фактов и размер диагностики не ослаблялись.

Изменение low отменено commit a99a8ffdf00b2d283e8a66413b25d05d8905b3b9; git diff --exit-code 43fcbb36e HEAD прошёл. Дерево NPC восстановлено точно. Прежний 43fc также остаётся непрошедшим квалификацию (13/14); этот откат не делает его готовым. В recovery ветку кандидат не перенесён.

## Проверки и происхождение

После прогона напрямую прочитан фактический server template `Qwen3.8-27B-Uncensored-W4A16-AutoRound-ru/chat_template.jinja`: строки 46–55 различают low/medium/xhigh; low добавляет инструкцию краткого рассуждения, medium этой инструкции не добавляет. Установленный vLLM `entrypoints/openai/chat_completion/protocol.py:579,587–588` передаёт reasoning_effort шаблону и включает thinking. Полный шаблон (170 строк) не содержит запрета на художественную прозу. Первоначальный разведчик не смог найти нужный container interpreter; ведущий установил фактический контейнер `/novgorod-bench-gpu3` через cgroup процесса и прочитал файлы через `/proc/<pid>/root`, без изменения службы. Это подтверждение пути параметра, не положительный результат качества.

76 focused tests, syntax (2404 файла), architecture, docs и diff checks на кандидате ранее прошли. Здесь повторно: полный wire каждого результата совпал с frozen dry-run; final JSON совпал с parsed output; реальные auditFreshNpcSpeech и его validator переиграны с fake roleRunner без модели. Независимый оценщик прочитал все 14 полных request и final content, приватное reasoning не читал. После отката повторные тесты не запускались, поскольку дерево тождественно прежнему 43fc. Full npm test на итоговом интегрированном HEAD, живой D49 и save/reload ещё обязательны.

- results.jsonl SHA-256: 47b20b449b95d535c52cec8dc5430e6c0f4e7aa046e72b00035224db3a351858
- dry-run SHA-256: b461a81a31d4f4f46ace6018047693a7f41e1c9aa41b84b3225afa14f280ab75
- RUN-SHA256: fb7bd76c343b9eae9efd04498fe86066daf9ebd3c143873611da7e9056e48418
- CATALOG-SHA256: f31527461ef4bde569de4ac4f7a7b18b0d7338110ede6416c8832b21ae15b22d
- WIRE-REVIEW-SHA256: eaf411516c68c4844f21e539465ed9db00f59fcde67eb276f219ef54d4aacfe4

Перед очередью отдельный preflight-only прошёл. Единственное исключение C8 #745 касалось склейки двух валидных JSON user messages в review tooling; оно привязано к этому dry SHA и не снимает семантических требований. Сначала серверный dry-run остановился из-за Windows default path в временном runner; путь исправлен на существующий server transport checkout, затем dry-run и preflight прошли до утверждения и вызова модели. При выдаче результатов staging успел переместиться в publication; первая попытка копирования получила ENOENT, после чего прочитан официальный опубликованный результат. Неуспешных или дополнительных модельных вызовов из этих ошибок не было.

## Дословные окончательные ответы

Ниже только choices[0].message.content без редактирования. Private reasoning исключён.

### iron-hook-supported

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[],"pass":true}
```

### iron-hook-unsupported

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"приманить рыбу лучше железным крючком или острогом.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[],"pass":true}
```

### boat-context-supported

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"сеть при такой ловле вытаскивают на берег или в лодку.","factual":true,"claim_ids":["bench_boat_context"]}],"concerns":[],"pass":true}
```

### boat-context-unsupported

```json
{"utterance_fragments":[{"text":"Микула,","factual":false,"claim_ids":[]},{"text":"на каждом берегу есть лодка, чтобы вытащить сеть.","factual":true,"claim_ids":["bench_boat_context"]}],"concerns":[{"kind":"contradiction_with_world_knowledge","reason":"claim:population-boat-context в world_knowledge.facts прямо гласит: «это не свидетельство судна на каждом берегу». Утверждение «на каждом берегу есть лодка» противоречит этому переданному факту.","quote":"на каждом берегу есть лодка, чтобы вытащить сеть."}],"pass":false}
```

### net-work-supported

```json
{"utterance_fragments":[{"text":"Микула,","factual":false,"claim_ids":[]},{"text":"новгородский рыбный промысел включал работу сетями.","factual":true,"claim_ids":["bench_net_work"]}],"concerns":[],"pass":true}
```

### net-work-unsupported

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"я лично умею ставить любую сеть без лодки.","factual":true,"claim_ids":["bench_net_work"]}],"concerns":[{"kind":"grounding_personal_ability","reason":"claim:population-net-work явно гласит «не доказательство навыка конкретного человека»; личная способность «я лично умею ставить любую сеть» не подтверждена ни памятью (records:[]), ни текущим наблюдением; «любую сеть» — избыточная граница.","quote":"я лично умею ставить любую сеть без лодки."}],"pass":false}
```

### bark-float-supported

```json
{"utterance_fragments":[{"text":"Микула,","factual":false,"claim_ids":[]},{"text":"берестяные полосы использовали для скрученных и сшитых поплавков.","factual":true,"claim_ids":["bench_bark_float"]}],"concerns":[],"pass":true}
```

### bark-float-unsupported

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"все поплавки делали одинаково из бересты.","factual":true,"claim_ids":["bench_bark_float"]}],"concerns":[{"kind":"contradiction_with_source","reason":"Источник claim:population-bark-float гласит: «форма и соединение зависели от снасти». Claim утверждает «одинаково» — прямое противоречие. Также «все поплавки» шире источника, который говорит лишь о берестяных полосах для скрученных и сшитых поплавков.","quote":"все поплавки делали одинаково из бересты."}],"pass":false}
```

### fish-food-supported

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"в средневековом Новгороде рыба служила пищей и предметом хозяйственных отношений.","factual":true,"claim_ids":["bench_fish_food"]}],"concerns":[],"pass":true}
```

### fish-food-unsupported

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"рыба каждый день в изобилии идёт именно у этого берега.","factual":true,"claim_ids":["bench_fish_food"]}],"concerns":[{"kind":"overreach_source","reason":"claim:population-fish-food attests fish as food and economic relations in medieval Novgorod generally; it does not support daily frequency, abundance, or this specific shore.","quote":"рыба каждый день в изобилии идёт именно у этого берега."}],"pass":false}
```

### repair-retained

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[],"pass":true,"original_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[],"supported":true,"retained":true},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"],"supported":true,"retained":true}]}
```

### repair-dropped

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[{"kind":"lost_supported_fact","reason":"Поддержанный факт original_speech (bench_iron_hook, ref claim:population-iron-hook) не сохранён в новой речи; новый plan — отказ «не знаю» без этого факта.","quote":""}],"pass":false,"original_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[],"supported":false,"retained":true},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"],"supported":true,"retained":false}]}
```

### neutral-control

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[],"pass":true}
```

### repair-dropped-claimless-original

```json
{"utterance_fragments":[{"text":"Микула,","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[],"pass":true,"original_fragments":[{"text":"Микула,","factual":false,"claim_ids":[],"supported":false,"retained":false},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":[],"supported":true,"retained":false}]}
```

## Дословная независимая оценка

# Слепая оценка final outputs: NPC grounding auditor, Qwen low

Объект: 14 замороженных пар из `cases.json` и полные request + только `final_content` из `final-outputs.jsonl`; checkout `da1f49fa696ec05b5dae32916f58d1ffe60c72f8`. Модель `qwen3.8-27b-uncensored-w4a16-tp2`, `reasoning_effort=low`, `temperature=0`, `top_p=1`, `max_tokens=20000`, `response_format=json_object`. Все 14 ответов есть, `finish_reason=stop`, JSON разбирается и совпадает с сохранённым `output`. Private reasoning не читал и не воспроизвожу.

Итог: **low не прошёл квалификацию; изменение low следует откатить.** Точная production-структура и решение: **12/14**. Семантическое решение по отношению source → claim: **13/14**; полный критерий «поддержка/сохранение/корректная диагностика»: **12/14** (ошибка iron-hook и неверный диагноз boat-context). Совместно оба обязательных критерия выполняют **11/14**. Недействительный bark-float ответ верно отвергает смысл, но production даёт `INVALID`, а не ожидаемый `FAIL`. Возврат прежнего режима сам по себе не доказывает его пригодность: нужна отдельная приёмка по тому же порогу 14/14.

| Кейс | Ожидалось → production | Смысл и диагностика | Решающее свидетельство из final output |
|---|---|---|---|
| iron-hook-supported | PASS → PASS | верно | «железо использовали для рыболовных крючков и острог» |
| iron-hook-unsupported | FAIL → **PASS** | **ложный пропуск**: источник говорит об использовании железа, не о лучшем приманивании рыбы | «приманить рыбу лучше железным крючком или острогом»; `concerns:[]`, `pass:true` |
| boat-context-supported | PASS → PASS | верно | «сеть при такой ловле вытаскивают на берег или в лодку» |
| boat-context-unsupported | FAIL → FAIL | отказ верен; **диагноз чрезмерен**: источник не доказывает лодку на каждом берегу, но и не доказывает её отсутствие | `kind:contradiction_with_world_knowledge`; причина: «это не свидетельство судна на каждом берегу» |
| net-work-supported | PASS → PASS | верно | «новгородский рыбный промысел включал работу сетями» |
| net-work-unsupported | FAIL → FAIL | верно: общий промысел не подтверждает личное умение NPC | «я лично умею ставить любую сеть без лодки»; `kind:grounding_personal_ability` |
| bark-float-supported | PASS → PASS | верно | «берестяные полосы использовали для скрученных и сшитых поплавков» |
| bark-float-unsupported | FAIL → **INVALID** | смысл отказа верен; production отвергает `reason` длиной **251** при пределе **240** | «все поплавки делали одинаково из бересты»; `pass:false`, но `TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID` |
| fish-food-supported | PASS → PASS | верно | «рыба служила пищей и предметом хозяйственных отношений» |
| fish-food-unsupported | FAIL → FAIL | верно: историческая пища/обмен не доказывают частоту и этот берег | «рыба каждый день в изобилии идёт именно у этого берега»; `kind:overreach_source` |
| repair-retained | PASS → PASS | верно: исходный подтверждённый факт и claim сохранены | исходный факт `supported:true, retained:true`; новый `bench_iron_hook` присутствует |
| repair-dropped | FAIL → FAIL | верно: «не знаю» теряет подтверждённый исходный факт | `kind:lost_supported_fact`; исходный факт `supported:true, retained:false` |
| neutral-control | PASS → PASS | верно: исходной речи нет; «не знаю» без факта | `concerns:[]`, `pass:true` |
| repair-dropped-claimless-original | PASS → PASS | верно: исходная фактическая фраза без claim не создаёт обязанности сохранять её в repair | исходный фрагмент `factual:true, claim_ids:[], retained:false`; `pass:true` |

**dislike**

1. «приманить рыбу лучше железным крючком или острогом» проходит с `pass:true`: совпадение предметов и ref подменило проверку отношения «лучше приманить».
2. «это не свидетельство судна на каждом берегу» названо `contradiction_with_world_knowledge`: отсутствие подтверждения выдано за доказанное противоположное состояние.
3. Диагноз к «все поплавки делали одинаково из бересты» содержит 251 символ; корректный `pass:false` не попадает в semantic repair из-за неверной private-формы.

**improve** — правки к оценённым ответам, только из переданных фактов:

1. `iron-hook-unsupported`: `pass:false`; concern с точной цитатой текущей речи и причиной: source подтверждает применение железа для крючков и острог, но не сравнительную эффективность приманивания.
2. `boat-context-unsupported`: сохранить `pass:false`, заменить вид и причину на недостаточную опору: лодка допустима при извлечении сети, наличие у каждого берега не установлено.
3. `bark-float-unsupported`: оставить отказ и точную цитату, сократить `reason` до ≤240 символов: источник подтверждает берестяные полосы для некоторых поплавков и зависимость формы от снасти; «все» и «одинаково» не следуют.

**missing_facts**: в request нет свидетельства о сравнительной способности железного крючка/остроги приманивать рыбу; нет инвентаря лодок каждого берега, личного навыка NPC ставить любую сеть, одинаковой формы всех поплавков, ежедневного обильного улова именно у этого берега. Эти пробелы объясняют требуемый отказ; их нельзя восполнять из общих исторических фактов. Для pass-кейсов источник и исходный claim достаточны; для `neutral-control` и claimless original обязательного сохраняемого claim нет.

**improve_general**: минимальный причинный урок — модель на low может сохранить JSON и правильные имена refs, но ошибиться в предикате/кванторе и в кратком диагностическом поле. Нужна проверка всех обязательных полей и полной смысловой связи, а не оценка только `pass` или синтаксиса. Новые prompt patches по этим 14 наблюдениям не предлагаю. Отказ от low до новой квалификации — самый малый безопасный шаг.

Проверки: сверены 14 полных request, `source_runtime_text`, планы (utterance, claims, interpretation, reason), исходные речи repair, все final outputs; `final_content` всех 14 распарсен и равен `output`; причина `INVALID` сверена с `valid()` в `apps/game-server/src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js` и §37.2 active conversation contract. Проверен HEAD; рабочее дерево checkout чистое. Runner: published exit 0, 223.307 с, gpu3; вызовы 10.856–26.092 с, usage 123985 prompt + 23607 completion tokens; private reasoning field непуст у 14/14 (только факт наличия). Телеметрия токенов этой Codex-оценки недоступна; эскалации и доработок кода не было.

## Scoped Contract Auditor

# CONTRACT AUDIT FINDING

audited_head: `da1f49fa696ec05b5dae32916f58d1ffe60c72f8` (чистый checkout `codex/d49-npc-audit-target`); delta от `43fcbb36e163353475163fdb868b9ed2e188b2ae`.
scope: только выбор `low` для private `npc_conversation_grounding_auditor`, его production wire, caller, transport и профильный тест. Остальные ветки D49 повторно не аудировались.
source_set: root `AGENTS.md`, весь `docs/governance/*.md`, `CONTRACT_INDEX.md` (§1–§8.1), `MODULE_INDEX.md`, `packages/llm-runtime/MODULE.md`, `apps/game-server/MODULE.md`, `apps/game-web/MODULE.md`, `tools/local-play/MODULE.md`; active `turn_step_llm_contract.md` §16, `npc_conversation_mode_contract.md` §37.2, NPC autonomous и World Knowledge строки индекса; фактические caller/adapter/registry/provider-request/runtime и focused tests. Санитизированные before/after/dry-run и прежние cloud raw — evidence, не нормы.
source_statuses: governing — `AGENTS.md` и governance; index — active navigation; turn-step, conversation, NPC autonomous, World Knowledge — ACTIVE в применимой области; MODULE — owner boundary; bench plan и Temp raw — временные свидетельства. Proposed umbrella и исторические snapshots не использованы как production authority.
observed_implementation: `auditFreshNpcSpeech` передаёт `overrides: { temperature: 0, maxTokens: 20_000, reasoningEffort: 'low' }` (стр. 120–140). Production `roleRunner` сохраняет override при clamp бюджета (adapter стр. 19–51). `resolveLlmExecutionConfig` сначала выбирает explicit custom provider/model (provider-config стр. 232–258), затем применяет caller override (стр. 278–280); `applyProviderOverrides` снимает `thinking: disabled` и ставит `reasoningEffort: low` (provider-request стр. 72–83). Wire содержит `reasoning_effort: low` без `enable_thinking=false` (стр. 102–115). Registry сохраняет тот же role/model/default limits. Ни новый вызов, ни fallback, ни другой provider в delta не добавлены.
required_by_active_contract: turn-step §16, строки 1409–1424: единый provider, Qwen/default custom endpoint, 20 000 токенов, 120 с transport, role caller вправе выбрать уровень. Conversation §37.2: private auditor проверяет все факты речи и прежние claims, semantic repair или typed failure при нарушении. Governing WR §24.3–24.4 требует план стенда и полный before/after request для изменения параметров; AR §25.1 — аудит изменения MODULE и LLM boundary.
target_if_any: гипотеза стенда — улучшить один ошибочный диагноз прежнего Qwen 43fc, сохранив 14/14 структуру и семантику; это не active норма и пока не доказано.
conflict: контрактного расхождения в проверенной delta нет. Ограничение приёмки: фактический endpoint ещё не подтвердил выполнение `low`, качество 14 случаев и latency. Прежний Qwen 43fc дал 13/14, один неверный диагноз с reason 268 > 240.
precedence_resolution: governing → active contracts → MODULE/active provider configuration → код/tests; предыдущее поведение `off` было baseline, право изменить его принадлежит caller по активному контракту. Уточнение MODULE соответствует коду, не узаконивает нарушение нормы.
first_bad_boundary: не обнаружена в delta. Возможный провал качества/timeout проявится на реальном Qwen provider response, после текущего static/wire boundary.
correct_owner: game-server conversation caller выбирает сложность; `@rus/llm-runtime` только применяет override и собирает transport wire; сроки хода — game-server turn budget.
required_code_delta: по результату аудита нет.
required_docs_delta: по результату аудита нет; MODULE и CHANGELOG уже обновлены, generated manifest пересчитан в delta.
required_tests: для контракта — focused caller и transport wire; для итоговой приёмки — разрешённый live Qwen стенд по `BENCH-PLAN.md`, независимая оценка 14/14 и замер времени в рамках 120 с на вызов / 360 с на ход. Финальный exact-HEAD CI и live gameplay gate остаются ответственностью ведущего.
severity: P3 (примечания к ещё не выполненной приёмке, не дефект контракта).
verdict: PASS_WITH_NOTES для данной delta. Final acceptance полного D49: BLOCK до живого low прогона, независимого quality verdict и обязательных merge gates.

## Проверка wire и облачной пробы

`node Temp/d49-npc-low-reasoning-bench/validate.mjs`: PASS, 14 frozen запросов, 8 PASS / 6 FAIL ожидаемых исходов, все сообщения before/after равны, прочие wire поля равны; единственное различие — удалён `chat_template_kwargs.enable_thinking=false`, добавлен `reasoning_effort=low`. `capture.mjs` подменял fetch для 14 запросов, модель не вызывалась. Сам аудитор выполнил `validate.mjs` и `git diff --check 43fc..da1f` — оба с кодом 0. Focused 76, syntax/architecture/docs checks переданы ведущим; здесь повторно не запускались.

Оба старых cloud-input из `d49-npc-precision-bench` и новых из `d49-npc-low-reasoning-bench` сравнены: все три `messages` равны для `boat-context-supported` и `boat-context-unsupported`; changed top-level fields только reasoning mode. Старый независимый `cloud-judge.md` дал PASS на этих 2/14 точных входах; это допустимая повторная ссылка как **input preflight** D157 без нового cloud call, если ведущий принимает неизменность сообщений как критерий этой части. Она не доказывает `low` в Qwen, исход остальных 12 случаев или latency. Новый cloud call нужен только при отдельном требовании проверить облачную модель именно в изменённом режиме либо при изменении system/user; текущие governing правила такого повторного вызова для побайтно прежнего входа не устанавливают. Разрешение Codex вместо Sonnet и прежние model route беру из переданного ведущим контекста; собственного разрешения пользователем не утверждаю.

CBM: проект `C-Users-Slaven-Documents-Novgorod` indexed, generation `2026-10-16T05:26:03Z`, но это primary `main` HEAD `55fa99ba...`, а не audited worktree. `search_graph`/`trace_path` нашли caller, `check_index_coverage` вернул metadata_changed/missing для затронутых code/MODULE путей; выводы сверены прямым чтением exact checkout. `detect_changes` от 43fc на primary дал чужой diff и для данной delta не применим; authoritative scope установлен `git diff 43fc..da1f`.
