# Аудит промптов игры: идёт ли «протокольная проза» от навыка caveman

Дата: 2026-10-22. Автор: побочная сессия Claude (Sonnet 5.5), только чтение, репозиторий не менялся.

**Статус документа.** Это находки и предложения, а не приёмка и не утверждение. Автор не утверждает сам себя. Независимая проверка выводов и любых черновиков промптов — Opus по решению D225 (Sonnet и Haiku не ревьюят). Ни один файл репозитория не изменён; `AGENTS.md` и `docs/governance/*` не затрагивались. Запусков модели не было.

## 1. Короткий вывод

1. Гипотеза «промпты игры написаны телеграфным стилем caveman» по репозиторию **не подтверждается**. Рассказчик, аудитор и ремонтные промпты написаны длинными грамматическими английскими предложениями (в среднем 16 слов на предложение, коротких до 6 слов — 9–10%, стрелок нет). Это юридический, а не «пещерный» стиль.
2. Хронология тоже против гипотезы. Правки промптов рассказчика, аудитора и планировщика закончились 14.09, остальные промпты правились с 05.08 по 12.09 (кроме `conversation-llm.js`, до 19.10). Требование caveman в `AGENTS.md` и WR §18.1 появилось 23.09, то есть позже. Первое упоминание caveman в репозитории — 11.09, и оно про краткие отчёты, а не про промпты. После 23.09 в путях промптов только два коммита, оба 19.10, оба про речь и разговор NPC, не про рассказчика.
3. Настоящие телеграфные куски есть, но в промптах, которые просят JSON (планировщик, разговор, автономные NPC, бой, аудит). Влияние на прозу у них низкое.
4. Сухую прозу, по этому чтению, дают не стиль, а **содержание правил**: четыре механизма. (а) Правило `static_context_dump` запрещает пересказ неизменной обстановки сверх того, что нужно самому действию. (б) Аудитор отбраковывает любую чувственную деталь без точного факта. (в) Ремонтный промпт велит «сократить, а не украшать». (г) Нормы §2, §4.2 и §4.5 закрепляют запреты и второе лицо. Это совпадает с диагнозом владельца от 08.10 и с пробным стендом того дня.
5. **Решения владельца от 08.10 (D158, D159, D161) не дошли до `origin/main`** на снимке 21.10: рассказчик по-прежнему пишет во втором лице и с теми же запретами. Живая игра на main работает на тех же правилах, из-за которых проза была мёртвой.
6. Оговорки: Codex мог применять caveman в своих сессиях раньше, чем это попало в репозиторий, и репозиторий этого не покажет. Тексты фактов сцены (то, что рассказчик пересказывает) не проверялись — это самый важный непроверенный канал.
7. Предложение: прогнать стенд из раздела 7 (A0 против простого переписывания и против переписывания с рамкой D158). Запуск — только после «да» владельца и по плану ревьюера.

## 2. Метод и границы

- Снимок: локальный `main` устарел (55fa99ba5, 26.09). Читался `origin/main` на 181548e84 (21.10, слияние PR #788) через `git show`, `git log origin/main` и экспорт в временную папку. Fetch не делался.
- Поиск: `rg` по `prompt|system|instruction|few.?shot` в `apps/`, `packages/`, `tools/cataclysm-prototype/`, `data/` и корпусу норм. Живой путь подтверждён: `tools/cataclysm-prototype/p3-boundary.js` подключает роли `lower-dvina-trace-*` через `createProductionLlmRoleRunner`.
- Датирование: `git log -S"caveman"` по `AGENTS.md` и `docs/governance/WORKFLOW_RULES.md`; `git log` и `git blame` по каждому файлу промпта.
- Авторство: все коммиты на имя `PavelSlaven`, трейлеров Co-authored-by нет. Автора-Codex можно только **предполагать** по именам веток `codex/*` в слияниях (55 слияний из `PavelSlaven/codex/*`, 35 из claude/cursor/docs/feature, 63 удалённые ветки `origin/codex/*`). Для narration-llm и нормы прослежены конкретные PR; для остальных файлов дано окно дат, ветки не прослеживались.
- Маркеры телеграфности считались грубым скриптом по строковым литералам промптов (средняя длина предложения, доля коротких, предложения без глагола, стрелки, плотность запретов). Это эвристика, а не доказательство. Файлы `turn-step-prompts` (JSON few-shot) и `conversation-llm.js` слишком малы или нетипичны для вывода и в таблицу не включены; скрипт лежал во временной папке и в репозиторий не попал.
- **Не прочитано:** `lower-dvina-trace-npc-speech-grounding-audit.js` (только даты), `…-turn-step-grounding-audit-prompt.js`, `…-turn-step-repair-prompt.js` (только даты), `packages/narration` (внутренности сервиса), промпты `rus13`, narrator stage-22. Фактическая доля финальных текстов, прошедших ремонт в живой игре, неизвестна. Тексты фактов сцены и `opening_prose` приходят из опубликованных проекций и не разбирались.
- Данные пробного стенда 08.10 здесь не перепроверялись: цифры взяты из записей памяти (`owner-feedback-dead-prose-1008`, `owner-decisions-prose-freedom-1008`, `feedback-dont-strangle-writer`).

## 3. Датировка

| Событие | Дата | Коммит |
|---|---|---|
| Первое упоминание caveman в репозитории («краткие отчёты») | 2026-09-11 | `4c99a3844` |
| caveman обязателен в `AGENTS.md` и WR §18.1, добавлены `SKILL.md` | 2026-09-23 | `f1202ce02` |
| Ограничение и вынос caveman из правил | 2026-10-19 | `64087869a`, `4eb111d7e`, `c3b2db121`, `f2526988c` |
| Удаление из репозитория целиком | 2026-10-21 | `8df3f1ede`, `d02dee2a3`, `feb8e0e0a`, слияние PR #788 |

Текст самого навыка относится к ответам ассистента и прямо оставляет коммиты, PR и код обычным языком; промптам продукта он не предназначен.

| Файл (все под `apps/game-server/src/runtime/`) | Период правок | Коммитов / заметка |
|---|---|---|
| `lower-dvina-trace-narration-llm.js` | 30.08 – 14.09 | PR #88 (`codex/public-playtest-branch-aware-combat`), #93 (`codex/blind-gameplay-diagnostics`), #96 (`codex/turn-forensic-demo-studio`); последняя правка 14.09 |
| `…-narration-audit.js` | 11.09 – 14.09 | 14 |
| `…-narration-audit-values.js` | 12.09 | — |
| `…-conversation-llm.js` | 02.09 – 19.10 | 9; из-за правки 19.10 |
| `…-phase-2-npc-conversation-prompts.js` | 29.08 – 14.09 | — |
| `…-phase-2-player-conversation-prompts.js` | 29.08 – 14.09 | — |
| `…-turn-step-planner-instructions.js` | 01.09 – 12.09 | — |
| `…-phase-2-turn-step-prompts.js` | 01.09 – 12.09 | — |
| `…-turn-step-repair-prompt.js` | 09.09 – 12.09 | 11 |
| `…-turn-step-grounding-audit-prompt.js` | 11.09 – 12.09 | — |
| `…-npc-speech-grounding-audit.js` | 01.09 – 12.09 | 7 |
| `…-autonomous-llm.js` | 05.08 – 11.09 | — |
| `…-combat-llm.js` | 10.08 – 02.09 | — |
| `data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md` | 10.09 – 13.09 | `de231ff2f`, `4b5233713` |

После 23.09 в путях промптов только `b5aea0554` (ремонт заземлённой реплики через модель, 19.10) и `819df27c0` (19.10, контрольная точка P3; из путей промптов затронуты `lower-dvina-trace-m2-conversation-statements.js` и `lower-dvina-trace-conversation-llm.js`). Файлы рассказчика и аудитора обоими коммитами не тронуты.

Грубые метрики стиля (эвристика, строковые литералы промптов):

| Файл | Слов | Ср. слов в предложении | Коротких (≤6 слов), % | «Обрывков» без глагола | Запретов на 100 слов |
|---|---|---|---|---|---|
| narration-llm | 1246 | 16,0 | 9 | 4 | 5,5 |
| narration-audit | 1445 | 15,8 | 10 | 6 | 4,7 |
| turn-step-planner-instructions | 3049 | 19,5 | 4 | 7 | 4,3 |
| npc-conversation-prompts | 1283 | 16,2 | 5 | 3 | 5,4 |
| player-conversation-prompts | 452 | 14,6 | 16 | 3 | 6,2 |
| autonomous-llm | 360 | 15,7 | 9 | 4 | 5,8 |
| combat-llm | 120 | 12,0 | 0 | 1 | 6,7 |
| npc-speech-grounding-audit | 257 | 16,1 | 6 | 3 | 7,8 |

Для сравнения: настоящий caveman даёт среднюю длину предложения порядка 5–8 слов, много обрывков и стрелки. Здесь наоборот: длинные предложения и 4–8 запретов на каждые 100 слов.

## 4. Таблица находок

Все пути относительно корня репозитория, снимок `origin/main` 21.10. Авторство «Codex (предп.)» — по именам веток, прямых данных нет. Предложения — только формулировки для обсуждения, не правки.

| № | Путь:строки | Роль LLM | Автор и дата | Маркеры (цитата ≤15 слов) | Влияние на прозу | Предложение простыми словами |
|---|---|---|---|---|---|---|
| 1 | `apps/game-server/src/runtime/lower-dvina-trace-narration-llm.js:6-48` (`PROSE_RULES`; правило `static_context_dump` на стр. 25-30) | `gameplay_narrator`, `…_format_repair` | Codex (предп.), PR #88/#93/#96; 30.08 – 14.09 | Не телеграфно: длинные связные предложения. Накопление запретов. «Write connected, restrained literary Russian in second person.» «Sparse evidence calls for concise prose, not invented connective facts or a service report.» Правило `static_context_dump` (строки 25-30): «Retain a support detail only when it locates, contrasts, constrains, or constitutes the action…» | **Высокое.** Запрещает пересказ неизменной обстановки сверх нужного действию и требует краткости при скудных данных | Цель: «Write the scene as a passage of a good historical novel, in third person past tense.» Вместо запрета панорамы: «Show only what the supplied facts say about the place; you may add light, warmth, the ordinary smell and sound of the place, the character's thoughts and small movements.» Лицо и время — по D158, требует подтверждения владельца |
| 2 | то же `:50` (`DENSE_COMPOSITION_RULE`) | `gameplay_narrator`, `_format_repair`, `_semantic_repair` (подставляется три раза) | то же; 11.09 – 14.09 | Одна строка более 100 слов: группировать наблюдения «only by an explicit supplied object, place, or before/after relation»; «A dependent gerundial phrase or relative clause may provide that subordination» | **Среднее** (для плотных осмотров). Жёстко ограничивает, как связывать наблюдения с действием, что ведёт к однотипным оборотам | «When the player inspects something and several observations are supplied, tie each group of related observations to the inspecting action in the same sentence, or give it its own sentence with a perception verb. Vary sentence shapes.» Разбить длинную строку на короткие отдельные правила |
| 3 | то же `:52-68` (`GROUNDING_RULES`) | `gameplay_narrator`, `_format_repair` | то же | «Ground every sensation, action, temporal relation and causal link.» «A label supplies identity, not traits; a scene label supplies location, not ambience.» | **Высокое.** Требует источник для каждого ощущения и не даёт выводить обстановку из метки сцены | «The world comes only from the supplied facts: add no person, object, route, animal, sound, weather or event that is not supplied, and no cause that is not supplied. How it is told is yours: light, warmth, ordinary sounds and smells of the place, thoughts, small movements, connecting words.» |
| 4 | то же `:89-90` (ремонт) | `gameplay_narrator_semantic_repair` (температура 0,2) | то же | Одна строка около 320 слов. «With sparse support, shorten rather than embellish.» | **Высокое.** После отбраковки текст сокращают до скелета; если ремонт даёт значительную долю финальных текстов, он и определяет вид прозы | Убрать «shorten rather than embellish»; вместо этого «keep the passage short but readable as prose, joining supplied facts with ordinary connecting words, adding no new facts». Разбить на четыре абзаца: что вернуть, что исправить, что сохранить, что запрещено |
| 5 | `apps/game-server/src/runtime/lower-dvina-trace-narration-audit.js:26,40-41,63-69,111` | `gameplay_narrator_auditor` | Codex (предп.); 11.09 – 14.09, 14 коммитов | «Never use a style policy to license a new fact» (стр. 40). «Every sensory proposition without an exact supplied sensory fact is unsupported_sensory.» (стр. 111). «Plausibility is never evidence.» (стр. 26) | **Высокое (косвенно).** Отбраковывает любой нейтральный запах, звук, свет без точного факта и отправляет текст в ремонт (строка 4) | «Reject a text only if it adds a fact about the world that was not supplied: a person, thing, route, creature, sound, smell, weather, event or cause. Do not reject ordinary telling: light, warmth, thoughts, small movements, connecting words.» Правило «правдоподобие — не доказательство» оставить, но только для фактов мира |
| 6 | `apps/game-server/src/runtime/lower-dvina-trace-phase-2-npc-conversation-prompts.js:132,173,189,240` | NPC-ответчик в разговоре | Codex (предп.); 29.08 – 14.09 | Телеграфно в стр. 189: «Permitted non-speech uses its mapping: speech: null, supporting_operations empty». «Never invent a settlement, place, route, direction, distance, duration, supply…» «Missing or empty memory is not evidence» | **Среднее.** Контракт JSON телеграфен, но запрет называть место и дистанцию делает речь NPC скупой | Стр. 189: «By default the NPC speaks. If the NPC does not speak, set speech to null and leave supporting_operations empty; fill refs and handoff only as the request contract allows.» Запреты на выдумку места и маршрута оставить, но добавить «manner, feeling and idiom of speech are free» |
| 7 | `apps/game-server/src/runtime/lower-dvina-trace-phase-2-player-conversation-prompts.js:23,37` | планировщик реплики игрока | то же; 29.08 – 14.09 | Тот же телеграфный абзац, что в строке 6. «Use subjective/player-safe request data only…» | Низкое–среднее | Тот же простой пересказ контракта |
| 8 | `apps/game-server/src/runtime/lower-dvina-trace-turn-step-planner-instructions.js:45,62` | `turn_step_planner` | Codex (предп.); 01.09 – 12.09 | «Take-only achieved; later action continuation, making that compound plan pending.» «Describe only physical facts: no hidden truth, authenticity, currency, official status…» | **Низкое.** Самый телеграфный файл, но вывод идёт в JSON; на прозу влияет только через `player_safe_observation` | Строка 45: «The take is achieved; a later action continues it, so mark the compound plan as pending.» Остальное — без изменений до результата стенда |
| 9 | `apps/game-server/src/runtime/lower-dvina-trace-phase-2-turn-step-prompts.js:140-146` | аудит рассказа, разрешение семантики, few-shot JSON | то же; 01.09 – 12.09 | «Return only narration_audit JSON. Reject every unsupported fact.» | Низкое. Коротко, но обычным языком | Не менять; «Reject every unsupported fact» уточнить как «unsupported fact about the world» вместе с № 5 |
| 10 | `apps/game-server/src/runtime/lower-dvina-trace-autonomous-llm.js:76-120` | `npc_autonomous_decider` | то же; 05.08 – 11.09 | «emit_interaction is only an observable nonverbal action» | Низкое (выбор действия, не проза) | Не менять |
| 11 | `apps/game-server/src/runtime/lower-dvina-trace-combat-llm.js:31-50` | `npc_combat_decider` | то же; 10.08 – 02.09 | «Return only the semantic NPC combat choice.» | Низкое | Не менять |
| 12 | `apps/game-server/src/runtime/lower-dvina-trace-conversation-llm.js:130` | выбор из закрытого списка решений NPC | то же; 02.09 – 19.10 | «Choose exactly one option from the supplied closed NPC decision request.» | Низкое. Обычный язык | Не менять |
| 13 | `data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md:21,75,87,169,349` | норма, по которой пишут и проверяют промпты и прозу | Codex (предп.); 10.09 – 13.09 | Не телеграфно: канцелярит с английскими вставками. «Причинную связь можно утверждать только когда она передана.» (стр. 75; та же строка уже допускает «Литературная связь допустима пространственная, временная или наблюдательная»). «Авторский голос использует русский литературный текст, второе лицо `вы`» (стр. 87). «scene label не доказывает ambience, тишину или субъективный темп» (стр. 349) | **Высокое.** Цель в §1 правильная («сцены хорошего исторического романа», стр. 11-13), но запреты §2 и §4.2 и второе лицо §4.5 душат автора | §4.2: «Рассказчик не придумывает причины событий мира, но свободно связывает поданные факты словами, которые не добавляют фактов.» §4.5: третье лицо, прошедшее время (по D158/D161). Нормативный корпус: правка по процессу CORPUS_EDIT и с Contract Auditor, самостоятельно не делается |

Примечание по `docs/governance/PRODUCT_CONSTITUTION.md:252` («Рассказчик пишет прозу как книгу, глазами персонажа игрока, без выдумок сверх committed state и восприятия персонажа»): формулировка верная, владелец просил её уточнить 08.10, на main этого нет. Это защищённый файл governance; здесь только упоминание, правка возможна лишь по прямому запросу владельца.

## 5. Сравнение с жалобой владельца и D223

- Жалоба владельца (08.10, запись `owner-feedback-dead-prose-1008`): проза протокольная даже на облачной модели. Если плохо даже у сильной модели, ограничивает не размер модели, а промпт и правила. Телеграфность промптов этого не объясняет: рассказчик получает длинный грамматический английский текст, а выдаёт скупой.
- D223 (19.10): владелец предположил связь с caveman. Эта связь по датам и по стилю не подтверждается: промпты рассказчика закончены до обязательного caveman; где есть обрывки, это JSON-контракты, а не проза.
- Пробный стенд 08.10 (по записям памяти, сами данные не перепроверялись; 5 вариантов × 2 сцены, 3 судьи Sonnet, шкала «мир против рассказа»): текущий промпт 1–2 (Sonnet) и 1 (Qwen); строгий короткий промпт на богатых фактах около 2,7 и 3; свобода рассказа на голых фактах 7 и 5, но 4–8 выдуманных фактов мира на текст, плюс срыв лица и мелодрама у Qwen; свобода на богатых фактах (третье лицо) 7,3–8 и 5,7–6 при наименьшем числе выдумок. Лицо (второе или третье) — не главный рычаг. Главные рычаги: рамка «мир строго из данных, рассказ свободен» и богатство входных фактов.
- Граница владельца (D158): мир строго из данных; рассказ свободен (свет, тепло, нейтральные запахи и звуки обстановки, мысли, микродвижения, связки); третье лицо, прошедшее время; без выдуманных зацепок (дичь, дым, голоса, следы, жилища). Этого в промптах и в норме на main нет (строки 1–5, 13 таблицы).
- Гипотеза caveman остаётся **непроверенной в одном месте**: если тексты фактов сцены (`visible_scene`, `sensory_details`, `opening_prose` в опубликованных проекциях) писались телеграфно, рассказчик перескажет телеграфно при любом промпте. Это не промпт, поэтому в аудит не вошло, но стоит отдельной проверки скриптом (раздел 8).

## 6. Что делать с промптами до стенда

Ничего не менять на main. Любое переписывание — черновик в рабочей ветке или `out/`, по плану ревьюера (правило репозитория: промпты меняются по плану ревьюера), с независимым Opus-ревью. Нормы и governance — только по прямому запросу владельца.

## 7. План стенда (только план, ничего не запущено)

### 7.1 Что проверяем

- **H1, стиль.** Простое переписывание тех же правил обычным языком (без смены смысла) улучшает прозу. Это прямая проверка гипотезы про caveman и телеграфность.
- **H2, содержание.** Смена рамки правил на «мир из данных, рассказ свободен» (D158) улучшает прозу сильнее, чем смена стиля, и не увеличивает число выдумок.
- **H3, входные факты.** Богатые факты на входе дают ещё прирост (в стенде 08.10 это был сильный рычаг).

### 7.2 Три пакета для переписывания (черновики, по плану ревьюера)

- **P1. Блок писателя:** `WRITER_SHAPE` + `PROSE_RULES` + `GROUNDING_RULES` + `DENSE_COMPOSITION_RULE`, `narration-llm.js:6-70`. Строки 1–3 таблицы.
- **P2. Аудитор и ремонт:** `narrationAuditInstruction` (`narration-audit.js`) и ремонтный промпт `narration-llm.js:90`. Строки 4–5. Менять вместе с P1: иначе аудитор отбракует текст новой рамки, и ремонт сократит его до скелета.
- **P3. NPC-ответчик:** `npc-conversation-prompts.js` (стр. 132-240). Строка 6. Отдельный меньший блок на речь.

### 7.3 Ветви (какой текст идёт в промпт)

| Ветвь | Содержание | Что проверяет |
|---|---|---|
| A0 | Текущие промпты `origin/main` (зафиксировать sha и дамп сообщений) | Мёртвый якорь |
| B | Те же правила и та же строгость, но простым языком, короткими абзацами, без деепричастного блока | H1 |
| C | B + рамка D158 в писателе, аудиторе и ремонте, третье лицо, прошедшее время | H2 |
| D | C + более богатые факты на входе (по данным каталога, без выдумок) | H3 |
| E | Живой якорь из стенда 08.10 (готовые тексты, не пересоздавать; если файлов нет — эталон Opus на тех же фактах по `etalon-reference-runs`) | Верхняя планка |
| A1 | A0 без одной фразы «shorten rather than embellish» | Вклад ремонта |
| A2 | A0 с мягким правилом для чувственных деталей в аудиторе | Вклад аудитора |

Фаза 1 (ядро): A0, B, C, E. Фаза 2 (атрибуция), только если C заметно лучше A0: A1, A2, D. Для P3: A0, B и C (свобода манеры речи, знания NPC строго из его данных).

### 7.4 Вход

- Шесть сцен: две из стенда 08.10 (для сопоставимости) и четыре новые из реальных трасс ходов: осмотр с плотными фактами, ход со скудными фактами, ход с речью NPC, переход со временем. Для P3 — три разговора с NPC.
- Температура 0 (как в игре; ремонт 0,2), поэтому «сидов» нет: разнообразие даёт набор сцен. Каждую ячейку повторить дважды на одной четверти выборки, чтобы убедиться в детерминизме Qwen.
- Только локальный Qwen, как в игре; модель и слот брать из `servak-gpu-models` и конфигурации игры, не из этого плана. GPU0 не трогать.

### 7.5 Шаг 0, до любых прогонов (скриптами)

1. Дамп реальных сообщений (system и user), уходящих в Qwen для A0, и проверка по правилу D78/D79: промпт доходит целиком, контекст не обрезан, `style_policy` и `do_not_imply` на месте.
2. Телеметрия живых ходов: какая доля финальных текстов — первый ответ писателя, а какая — после отбраковки и ремонта. Если ремонт даёт много текстов, P2 важнее P1.
3. Скрипт сверки B и C с A0: наборы протокольных идентификаторов (`required_current_beat`, `static_context_dump`, `unsupported_sensory`, ключи JSON) должны совпасть, смысловые ограничения — быть проверены независимым Opus; автор черновика сам себя не проверяет.

### 7.6 Судьи и метрики

- Судьи: три Opus (D225), слепые, порядок вариантов перемешан на судью, метки ветвей скрыты; в каждый набор входят A0 и E. Читают как игрок: конечный текст на экране, речь NPC внутри повествования от третьего лица (D161).
- Рубрика «мир против рассказа»: оценка живости 1–10; список выдуманных фактов мира (по границе D158); срывы лица или времени; поля D186: `dislike` (с цитатами), `improve`, `missing_facts`, `improve_general`.
- Скриптом: длина в словах; доля повторяющихся начал предложений; число связок; срыв лица (местоимения второго лица в ветвях с третьим); число срабатываний STRANGLE-ALERT (`ph_scan.py`); число отбраковок аудитора и раундов ремонта; отношение длины после ремонта к длине первого ответа.

### 7.7 Решающие правила (предлагаю зафиксировать до прогона)

- H1 подтверждена, если B выше A0 по медиане живости не менее чем на 1,5 и число выдумок не выросло. Если нет — стиль промптов не причина.
- H2 подтверждена, если C выше B не менее чем на 2 при числе выдуманных зацепок не более 1 на текст.
- Ворота живости (D159): любое изменение, снижающее живость относительно A0, отклоняется.
- Если C выше A0, но выдумок много (как на голых фактах в 08.10), переходим к D, а не принимаем C.
- Порог — предложение; окончательные числа утверждает ревьюер до запуска.

### 7.8 Порядок и ворота

1. План отправляется ревьюеру; черновики P1–P3 пишет исполнитель по плану ревьюера (не эта сессия), в рабочей ветке или `out/`, без правок main, `AGENTS.md` и governance.
2. Независимое Opus-ревью черновиков на сохранение смысла.
3. Запуск стенда **только после «да» владельца** (режим 10-19: автозапусков нет). Прогон на servak, тяжёлое не на машине владельца.
4. Итог — отчёт в `codex-direct/` с таблицей по ветвям и решением по правилам 7.7; решение о правке main принимает владелец.

### 7.9 Чего стенд не покажет

- Влияние самих текстов фактов сцены (ветвь D лишь грубо меняет вход).
- Поведение на других моделях (игра — только локальный Qwen).
- Долгую связность сессии: стенд меряет отдельные ходы.

### 7.10 Иллюстративный черновик ветви C для писателя (P1), не проверен

```
Write the scene as a passage from a good historical novel, in Russian, in third person past tense.
Put the current beat first, and keep the order of the player's actions as supplied.
The world comes only from the supplied facts. Do not add a person, object, route, animal, sound, weather or event that is not supplied, and do not state a cause that is not supplied.
How the scene is told is yours: you may use light and warmth, the ordinary smell and sound of the place, the character's thoughts and small movements, and connecting words between supplied facts.
When several observations are supplied, tie each group of related observations to the inspecting action, or give it its own sentence with a perception verb. Vary the sentence shapes.
Keep confirmed speech verbatim, inside the narration, with the speaker named.
If a result is not supplied, say it is still unknown; do not describe an action that has not happened as done.
```

Этот текст — только иллюстрация формулировок для ревьюера; он не заменяет ни одной строки репозитория и не прошёл независимой проверки.

## 8. Открытые вопросы и следующие шаги

1. **Тексты фактов сцены.** Скриптом, только чтение: выбрать образцы `visible_scene`, `sensory_details` и `opening_prose` из опубликованных проекций, замерить те же маркеры, что в разделе 3, сравнить с авторской нормой. Это закроет оставшийся канал гипотезы.
2. **Доля ремонта в живой игре** (шаг 0.2) — без неё нельзя оценить вес P2.
3. **Непрочитанные файлы** из раздела 2 (аудиты заземления речи и хода, ремонт хода, `packages/narration`, `rus13`).
4. **Расхождение main и решений 08.10:** выяснить, где лежит работа «corpus-d158» и когда она попадёт на main. Утверждение «не в `origin/main` на снимке 21.10» — только про этот снимок; в неслитых ветках и worktree решения могли быть.
5. Нормы и governance не менять без прямого запроса владельца (`AGENTS.md` §1.1, поправка к §1.1).
