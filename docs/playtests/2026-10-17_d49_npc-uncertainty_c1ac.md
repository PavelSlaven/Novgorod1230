# Проверка NPC grounding и сохранения фактов — #247

## Результат

**FAIL: 10/13 семантических решений верны.** Ложные отказы: net-work-supported, fish-food-supported, repair-retained. Потеря подтверждённого исходного факта теперь обнаружена; контрольная неуверенность без исходного факта принята. Кандидат не принят в integration.

## Условия

- Кандидат: c1ac52f66df50e0f5747f5936480eccec6e9970d.
- Запрос: 20261017T055524.947635Z-1; published=true, exit=0, duration=40.283 s.
- Каталог: /srv/novgorod-work/fleet/tasks/codex-d49-conversation/out/bench/npc-uncertainty-c1ac.
- Модель: qwen3.8-27b-uncensored-w4a16-tp2; endpoint gpu3, int8 KV, context 65536.
- Все 13 HTTP body совпали с замороженными входами; все finish_reason=stop.
- Это отдельный модельный стенд, не игровой маршрут. Партии и БД не изменялись. Подготовка отчёта не вызывает модель.
- metadata.json описывает подготовку (model_calls=0); фактический запуск подтверждается results.jsonl. Серверный a7e58d44f использовался для неизменённого provider runtime; входы владельца сняты с c1ac52f66.
- Облачная проверка двух контролей прошла до Qwen; остальные одиннадцать облачных ответов не получались. Локальный scoped Contract Auditor: PASS_WITH_NOTES. Полный итоговый аудит D49 ещё требуется.

## SHA-256 исходных артефактов

- results.jsonl: 9d38445f0687067c07ecaf576b4d77c8fc062af43650a6cbe6a74730b094616d
- dry-run.jsonl: 7c6fa8f8a43e3af613bfe308da1d9dea9d7e6519e15bad68feba597d8df08b74
- cases.json: 247444c799d49acf8f27131f9607cdc63bbef3f87df1536d36a1b5866171febe
- metadata.json: 87f4f5dc96430788091375896c3e784e92e830dee787142320be780893a79bff
- judge.md: 8db2cec2e65f823177372e32ce6ed515b491cd215a39ae79ecab00eb910cba6c

## Дословные ответы модели

Полные сообщения скопированы без редактирования из raw_response.choices[0].message.content. Частные request body в отчёт не включены.

### iron-hook-supported — finish stop

```json
{
  "pass": true,
  "concerns": [],
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "железо использовали для рыболовных крючков и острог.",
      "factual": true,
      "claim_ids": [
        "bench_iron_hook"
      ]
    }
  ]
}
```

### iron-hook-unsupported — finish stop

```json
{"pass":false,"concerns":[{"kind":"unsupported_causal_claim","reason":"Источники подтверждают использование железа для крючков и острог, но не утверждают, что это лучший способ приманить рыбу.","quote":"приманить рыбу лучше"}],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"приманить рыбу лучше ","factual":true,"claim_ids":[]},{"text":"железным крючком или острогом.","factual":true,"claim_ids":["bench_iron_hook"]}]}
```

### boat-context-supported — finish stop

```json
{
  "pass": true,
  "concerns": [],
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "сеть при такой ловле вытаскивают на берег или в лодку.",
      "factual": true,
      "claim_ids": [
        "bench_boat_context"
      ]
    }
  ]
}
```

### boat-context-unsupported — finish stop

```json
{"pass":false,"concerns":[{"kind":"unsupported_fact","reason":"World knowledge указывает, что лодка — один из контекстов, но не на каждом берегу. Утверждение «на каждом берегу» не подтверждено.","quote":"на каждом берегу есть лодка"}],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"на каждом берегу есть лодка, ","factual":true,"claim_ids":["bench_boat_context"]},{"text":"чтобы вытащить сеть.","factual":true,"claim_ids":["bench_boat_context"]}]}
```

### net-work-supported — finish stop

```json
{
  "pass": false,
  "concerns": [
    {
      "kind": "incomplete_answer",
      "reason": "Реплика не отвечает на вопрос о приманке, хотя в request есть подтверждённые сведения о крючках (claim:population-iron-hook).",
      "quote": ""
    }
  ],
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "новгородский рыбный промысел включал работу сетями.",
      "factual": true,
      "claim_ids": [
        "bench_net_work"
      ]
    }
  ]
}
```

### net-work-unsupported — finish stop

```json
{
  "pass": false,
  "concerns": [
    {
      "kind": "ungrounded_personal_claim",
      "reason": "Утверждение о личном умении ставить любую сеть без лодки не подтверждено ни записями памяти, ни текущими наблюдениями, ни world_knowledge, которые описывают лишь общие практики.",
      "quote": "я лично умею ставить любую сеть без лодки"
    }
  ],
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "я лично умею ставить любую сеть без лодки.",
      "factual": true,
      "claim_ids": [
        "bench_net_work"
      ]
    }
  ]
}
```

### bark-float-supported — finish stop

```json
{"pass":true,"concerns":[],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"берестяные полосы использовали для скрученных и сшитых поплавков.","factual":true,"claim_ids":["bench_bark_float"]}]}
```

### bark-float-unsupported — finish stop

```json
{"pass":false,"concerns":[{"kind":"unsupported_quantifier","reason":"World knowledge указывает, что форма и соединение поплавков зависели от снасти, что противоречит утверждению, что все делали одинаково.","quote":"все поплавки делали одинаково"}],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"все поплавки делали одинаково из бересты.","factual":true,"claim_ids":["bench_bark_float"]}]}
```

### fish-food-supported — finish stop

```json
{
  "pass": false,
  "concerns": [
    {
      "kind": "unanswered_question",
      "reason": "Реплика не отвечает на прямой вопрос собеседника о способе ловли без лодки и приманке, ограничиваясь общим фактом.",
      "quote": ""
    }
  ],
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "в средневековом Новгороде рыба служила пищей и предметом хозяйственных отношений.",
      "factual": true,
      "claim_ids": [
        "bench_fish_food"
      ]
    }
  ]
}
```

### fish-food-unsupported — finish stop

```json
{
  "pass": false,
  "concerns": [
    {
      "kind": "ungrounded_fact",
      "reason": "Утверждение о ежедневном изобилии рыбы у конкретного берега не подтверждено ни текущими наблюдениями, ни мировой энциклопедией, ни записями памяти.",
      "quote": "рыба каждый день в изобилии идёт именно у этого берега"
    }
  ],
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "рыба каждый день в изобилии идёт именно у этого берега.",
      "factual": true,
      "claim_ids": [
        "bench_fish_food"
      ]
    }
  ]
}
```

### repair-retained — finish stop

```json
{
  "pass": false,
  "concerns": [
    {
      "kind": "ungrounded_fact",
      "reason": "Реплика утверждает, что железо использовали для рыболовных крючков и острог, но в speech.claims нет записи с этим смыслом, хотя источник (claim:population-iron-hook) это подтверждает.",
      "quote": "железо использовали для рыболовных крючков и острог"
    }
  ],
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "железо использовали для рыболовных крючков и острог.",
      "factual": true,
      "claim_ids": []
    }
  ]
}
```

### repair-dropped — finish stop

```json
{
  "pass": false,
  "concerns": [
    {
      "kind": "lost_confirmed_fact",
      "reason": "Факт о применении железа для крючков и острог подтверждён world_knowledge, но отсутствует в новой реплике.",
      "quote": ""
    }
  ],
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "не знаю.",
      "factual": false,
      "claim_ids": []
    }
  ]
}
```

### neutral-control — finish stop

```json
{"pass":true,"concerns":[],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}]}
```

## Независимая оценка — дословно

# Независимая семантическая приёмка Qwen NPC audit

`audited_head`: `c1ac52f66df50e0f5747f5936480eccec6e9970d`; worktree `codex/d49-npc-audit-target` чистый. Scope: 13 сохранённых ответов `qwen3.8-27b-uncensored-w4a16-tp2`, точные `request_body` и production validator `auditFreshNpcSpeech`. Код, контракты и входы не изменялись. Существующий scoped Contract Auditor (`d49-npc-uncertainty-bench/contract-audit.md`) принят как контекст, полный аудит повторно не проводился.

**Итог: FAIL, 10/13 верных семантических решений.** Ответы модели: 4 `pass:true`, 9 `pass:false`. Ожидание по точным источникам: 7 принять, 6 отклонить. Три ложных отказа: `net-work-supported`, `fish-food-supported`, `repair-retained`. Все 13 ответов структурно приняты production validator; это не подтверждает правильность его LLM-суждения.

| Кейс | Вердикт ответа | Семантическая оценка |
|---|---|---|
| `iron-hook-supported` | `pass:true` | **PASS.** `claim:population-iron-hook` дословно подтверждает применение железа для крючков и острог; фактический фрагмент связан с `bench_iron_hook`, обращение нефактическое. |
| `iron-hook-unsupported` | `pass:false`, `unsupported_causal_claim` | **PASS.** Факт применения железа не подтверждает превосходство крючка/остроги как приманки. Цитата `приманить рыбу лучше` точна; этот фрагмент фактичен и не имеет поддерживающего claim. Помета `bench_iron_hook` у второго фрагмента не устраняет неподтверждённую функцию всей фразы. |
| `boat-context-supported` | `pass:true` | **PASS.** `claim:population-boat-work` допускает вытаскивание сети на берег или в лодку именно при описанной ловле; фрагмент связан с `bench_boat_context`. Наличие лодки в текущей сцене не утверждается. |
| `boat-context-unsupported` | `pass:false`, `unsupported_fact` | **PASS.** «На каждом берегу есть лодка» расширяет возможный хозяйственный контекст до всеобщего текущего наличия. Источник этого не даёт. Фактические фрагменты помечены claim ID, но соответствующий claim и его ref сами не подтверждают универсальный квантор; concern правильно блокирует план. |
| `net-work-supported` | `pass:false`, `incomplete_answer` | **FAIL.** `claim:population-net-work` прямо подтверждает работу сетями в новгородском рыбном промысле; фрагмент и `bench_net_work` соответствуют источнику. Модель отвергла лишь потому, что речь не ответила на вопрос о приманке. Текущий audit prompt прямо запрещает считать неполный ответ самостоятельным concern. |
| `net-work-unsupported` | `pass:false`, `ungrounded_personal_claim` | **PASS.** Общая практика сетевого промысла не доказывает личное умение NPC ставить любую сеть без лодки. Фрагмент фактичен; `bench_net_work` с общим ref не поддерживает личный навык и квантор «любую». |
| `bark-float-supported` | `pass:true` | **PASS.** `claim:population-bark-float` прямо подтверждает берестяные полосы для скрученных и сшитых поплавков; factual-фрагмент связан с `bench_bark_float`. |
| `bark-float-unsupported` | `pass:false`, `unsupported_quantifier` | **PASS.** Источник говорит, что форма и соединение зависели от снасти; «все ... одинаково» не подтверждено и противоречит этому уточнению. Фактический фрагмент отмечен, но claim/ref недостаточен. |
| `fish-food-supported` | `pass:false`, `unanswered_question` | **FAIL.** `claim:population-fish-food` прямо подтверждает рыбу как пищу и предмет хозяйственных отношений в средневековом Новгороде; factual-фрагмент связан с `bench_fish_food`. Неответ на вопрос о ловле не является grounding concern по текущему prompt. |
| `fish-food-unsupported` | `pass:false`, `ungrounded_fact` | **PASS.** Общий исторический факт о пище/обмене не доказывает ежедневное изобилие рыбы именно у текущего берега. Фактический фрагмент помечен; `bench_fish_food` не поддерживает место, частоту и количество. |
| `repair-retained` | `pass:false`, `ungrounded_fact` | **FAIL.** Новая и `original_speech` совпадают; речь сохраняет исходный подтверждённый факт. В `plan.speech.claims` **есть** `bench_iron_hook` с тем же content_summary и ref `claim:population-iron-hook`; модель ошибочно сообщила, что записи нет, и выставила фактическому фрагменту `claim_ids:[]`. Это ложный `unclaimed_factual_utterance` при replay. |
| `repair-dropped` | `pass:false`, `lost_confirmed_fact` | **PASS.** `original_speech` с `bench_iron_hook` содержит подтверждённый факт про крючки и остроги; новый plan «Микула, не знаю.» его теряет. Concern имеет пустую quote, поскольку удалённого текста нет в новой реплике. Оба фрагмента новой реплики нефактические, `claim_ids:[]`; это не утверждение о пределе всей памяти NPC. |
| `neutral-control` | `pass:true` | **PASS.** Request и plan совпадают с `repair-dropped`, но `original_speech` и `initial_audit_feedback` отсутствуют. «Не знаю» само по себе нефактично, claims пусты; обязанности сохранить исходный факт нет. |

Во всех 13 ответах `utterance_fragments` покрывают текущий `utterance_text` в порядке; обращения «Микула,» отмечены как нефактические. `claims` нового плана во всех положительных фактических кейсах есть и ссылаются на разрешённые knowledge refs; в двух вариантах «не знаю» `claims:[]`. Три неверных concern не имеют опоры в request. У отрицательных кейсов структурно допустимый `claim_ids` не означает, что смысл claim подтверждён источником: соответствующее semantic concern правильно отклоняет его. Проверка не выявила отдельной ошибки в private `interpretation`/`reason`: они не добавляют нового факта сверх речи, который менял бы эти вердикты.

Нормативная граница: ACTIVE `npc_conversation_mode_contract.md` §37.2 требует сохранить подтверждённые факты `original_speech`, связать фактические фрагменты с существующими claims и признаёт неуверенность/отказ нефактическими. Текущий audit prompt дополнительно исключает concern за неполный ответ. Производственный код проверяет JSON, полное покрытие, допустимые claim IDs и проводит заявленный `pass`/`concerns` в результат, но смысл источника остаётся ответственностью модели. Здесь `net-work-supported`, `fish-food-supported` и `repair-retained` ошибочно ушли бы в semantic repair/typed failure.

Проверки: `node .../verify.mjs .../d49-npc-uncertainty-qwen-result` — PASS: 13 точных request bodies, HTTP envelopes, `finish_reason=stop`, одна модель. Отдельный read-only replay всех 13 через импорт `auditFreshNpcSpeech`, `roleRunner.run` возвращал сохранённый `output` (13 вызовов, 0 вызовов модели): 4 `true`, 9 `TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED`, ни одного invalid-result/exception. `git rev-parse HEAD`, `git status --short`, `git diff --check` — указанный HEAD, чистое дерево, diff check PASS. Данные оценивались по `request_body`/`results.jsonl`, а не только по `expected` из `cases.json`.

Ограничение: это квалификация сохранённых 13 Qwen ответов; нового вызова модели и статистики устойчивости по повторным сэмплам не было. Граф CBM из родительского исследования устарел относительно worktree; материальные файлы и сохранённые запросы сверены прямым чтением.
