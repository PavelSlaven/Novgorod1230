# Проверка NPC grounding и сохранения исходных claims — #247

## Результат

**FAIL: 12/14 семантических решений верны; 11/14 одновременно семантически верны и структурно допустимы.** fish-food-supported получил ложный отказ; repair-dropped ошибочно принят после потери подтверждённого исходного факта с claim. В fish-food-unsupported отказ верен, но лишний пробельный фрагмент делает ответ структурно недопустимым. Кандидат не принят в integration.

## Условия

- Кандидат: 57c2da6b3da4f06b19b20de87a844e51e2f30a6b.
- Запрос: 20261017T062746.516863Z-1; published=true, exit_code=0, duration=31.37 s.
- Каталог: /srv/novgorod-work/fleet/tasks/codex-d49-conversation/out/bench/npc-claimless-57c2.
- Модель: qwen3.8-27b-uncensored-w4a16-tp2; endpoint gpu3, int8 KV, context 65536.
- Все 14 фактических HTTP body совпали с замороженными входами; все finish_reason=stop. Ожидалось 8 PASS и 6 FAIL.
- Production replay через auditFreshNpcSpeech: 13 структурно допустимых ответов, 1 недопустимый. Структурная допустимость не доказывает правильности смыслового решения.
- Это отдельный модельный стенд, не игровой маршрут. Партии и БД не изменялись. Подготовка отчёта не вызывает модель.
- metadata.json описывает подготовку; фактический запуск подтверждён results.jsonl. Серверный a7e58d44f использован для неизменённого provider runtime; входы владельца сняты с 57c2da6b3.
- Облачная проверка шести случаев прошла до Qwen: пять корректных PASS и один корректный FAIL; фактические авторы — отдельные агенты gpt-6-sol medium, независимый оценщик — gpt-6-sol high. Это не HTTP-пробы Qwen. Scoped Contract Auditor: PASS_WITH_NOTES. Полный итоговый аудит D49 ещё требуется.
- Transient systemd unit успешно завершился в 06:28:36 UTC; публикация результата была доставлена позднее. Задержка доставки не была ошибкой модели. Предупреждение loopback literal не помешало публикации.

## SHA-256 исходных артефактов

- results.jsonl: 8d5fb92fcb9dda9a7f31312a93c24dcc47ffe8aff3de9fc1e33eab6384b98036
- dry-run.jsonl: 889256a264f984a26cd8c5616ae6d552453c9e5d75bbb5797f01654838eaa9b4
- cases.json: 4bee19a852c79a3463b0728b9a22413a836efa99a1faf36450b43718430f4a29
- metadata.json: 8f6fef12bba8d5c01b3726a8a6b41f3cbf66bda8615b566687b545002602ee8b
- judge.md: b92b1500b206b97480321532244a7258bee1011a37a0676bc53b423c8453d7ea

## Дословные ответы модели

Сообщения скопированы без редактирования из raw_response.choices[0].message.content. Частные request body в отчёт не включены.

### iron-hook-supported — finish stop

```json
{"pass":true,"concerns":[],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"]}]}
```

### iron-hook-unsupported — finish stop

```json
{"pass":false,"concerns":[{"kind":"grounding_mismatch","reason":"World knowledge подтверждает использование железа для крючков и острог, но не утверждает, что это лучший способ приманить рыбу.","quote":"приманить рыбу лучше железным крючком или острогом"}],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"приманить рыбу лучше железным крючком или острогом.","factual":true,"claim_ids":["bench_iron_hook"]}]}
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
{"pass":false,"concerns":[{"kind":"grounding_contradiction","reason":"World knowledge states a boat is a context for net retrieval, not evidence of a boat on every shore. The claim asserts a boat on every shore.","quote":"на каждом берегу есть лодка"}],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"на каждом берегу есть лодка, ","factual":true,"claim_ids":["bench_boat_context"]},{"text":"чтобы вытащить сеть.","factual":true,"claim_ids":["bench_boat_context"]}]}
```

### net-work-supported — finish stop

```json
{"pass": true, "concerns": [], "utterance_fragments": [{"text": "Микула, ", "factual": false, "claim_ids": []}, {"text": "новгородский рыбный промысел включал работу сетями.", "factual": true, "claim_ids": ["bench_net_work"]}]}
```

### net-work-unsupported — finish stop

```json
{"pass":false,"concerns":[{"kind":"grounding","reason":"Утверждение о личном умении ставить любую сеть без лодки не подтверждено ни памятью, ни текущими наблюдениями, ни world_knowledge (которая описывает общие практики, а не навыки конкретного NPC).","quote":"я лично умею ставить любую сеть без лодки"}],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"я лично умею ставить любую сеть без лодки.","factual":true,"claim_ids":["bench_net_work"]}]}
```

### bark-float-supported — finish stop

```json
{"pass": true, "concerns": [], "utterance_fragments": [{"text": "Микула, ", "factual": false, "claim_ids": []}, {"text": "берестяные полосы использовали для скрученных и сшитых поплавков.", "factual": true, "claim_ids": ["bench_bark_float"]}]}
```

### bark-float-unsupported — finish stop

```json
{"pass": false, "concerns": [{"kind": "grounding_mismatch", "reason": "Claim утверждает, что все поплавки делали одинаково, но source_knowledge_ref указывает, что форма и соединение зависели от снасти.", "quote": "все поплавки делали одинаково"}], "utterance_fragments": [{"text": "Микула, ", "factual": false, "claim_ids": []}, {"text": "все поплавки делали одинаково из бересты.", "factual": true, "claim_ids": ["bench_bark_float"]}]}
```

### fish-food-supported — finish stop

```json
{
"pass": false,
"concerns": [
{
"kind": "ungrounded_fact",
"reason": "Утверждение о средневековом Новгороде как месте действия не подтверждено ни в identity_state, ни в world_knowledge, ни в текущих наблюдениях.",
"quote": "в средневековом Новгороде"
}
],
"utterance_fragments": [
{
"text": "Микула, ",
"factual": false,
"claim_ids": []
},
{
"text": "в средневековом Новгороде ",
"factual": true,
"claim_ids": []
},
{
"text": "рыба служила пищей и предметом хозяйственных отношений.",
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
{"pass":false,"concerns":[{"kind":"grounding","reason":"Утверждение об изобилии и ежедневном ходе рыбы у конкретного берега не подтверждено ни текущими наблюдениями, ни памятью, ни world_knowledge (общий факт о рыбе как пище не доказывает локальное изобилие).","quote":"рыба каждый день в изобилии идёт именно у этого берега"}],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"рыба каждый день в изобилии идёт именно у этого берега.","factual":true,"claim_ids":["bench_fish_food"]},{"text":" ","factual":false,"claim_ids":[]}]}
```

### repair-retained — finish stop

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

### repair-dropped — finish stop

```json
{"pass": true, "concerns": [], "utterance_fragments": [{"text": "Микула, ", "factual": false, "claim_ids": []}, {"text": "не знаю.", "factual": false, "claim_ids": []}]}
```

### neutral-control — finish stop

```json
{"pass": true, "concerns": [], "utterance_fragments": [{"text": "Микула, ", "factual": false, "claim_ids": []}, {"text": "не знаю.", "factual": false, "claim_ids": []}]}
```

### repair-dropped-claimless-original — finish stop

```json
{"pass":true,"concerns":[],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}]}
```

## Независимая оценка — дословно

# Независимый аудит Qwen: NPC speech grounding

Источник: `results.jsonl`, `dry-run.jsonl`, `cases.json`; исходные `request`, `plan`, `original_speech` и `claims` прочитаны из wire для всех 14 случаев. Норма: ACTIVE `npc_conversation_mode_contract.md` §37.2, строка 1921; код: `lower-dvina-trace-npc-speech-grounding-audit.js` на `57c2da6b3da4f06b19b20de87a844e51e2f30a6b`. Ожидания fixtures не принимались за доказательство.

| Случай | Семантика | Структура | Основание |
|---|---|---|---|
| iron-hook-supported | верно PASS | valid | Использование железа для крючков и острог подтверждено source и claim. |
| iron-hook-unsupported | верно FAIL | valid | Источник не доказывает превосходство как приманки. |
| boat-context-supported | верно PASS | valid | Извлечение сети на берег или в лодку подтверждено. |
| boat-context-unsupported | верно FAIL | valid | Лодка на каждом берегу не подтверждена. |
| net-work-supported | верно PASS | valid | Общая практика сетного промысла подтверждена. |
| net-work-unsupported | верно FAIL | valid | Личный навык NPC ставить любую сеть без лодки не подтверждён. |
| bark-float-supported | верно PASS | valid | Использование бересты для поплавков подтверждено. |
| bark-float-unsupported | верно FAIL | valid | Единообразие всех поплавков противоречит оговорке источника о зависимости формы от снасти. |
| fish-food-supported | **ошибка FAIL вместо PASS** | valid | `runtime_text` source `claim:population-fish-food` прямо называет средневековый Новгород; claim `bench_fish_food` охватывает весь факт. Фрагмент `в средневековом Новгороде ` ошибочно отмечен `claim_ids:[]`; код дополнительно создаёт `unclaimed_factual_utterance`. |
| fish-food-unsupported | верно FAIL | **invalid** | Ежедневное изобилие у данного берега не подтверждено, но лишний фрагмент `" "` после конца `utterance_text` ломает точное покрытие. Production `valid()` отвергает весь ответ. |
| repair-retained | верно PASS | valid | Поддержанный исходный факт и тот же claim сохранены. |
| repair-dropped | **ошибка PASS вместо FAIL** | valid | `original_speech` содержит подтверждённый факт о железных крючках и острогах с исходным `bench_iron_hook`. Новая речь `Микула, не знаю.` и `claims:[]` удалили его; §37.2 требует сохранения. |
| neutral-control | верно PASS | valid | `original_speech` отсутствует; нефактическая неуверенность допустима без claim. |
| repair-dropped-claimless-original | верно PASS | valid | В исходной речи факт подтверждён источником, но исходного claim нет. §37.2 разрешает опустить его; новая речь нефактическая, сохранённое типизированное решение выразимо. |

Итог: **12/14 правильных смысловых решений; 11/14 одновременно правильных и принимаемых валидатором. Общий gate FAIL.** Replay вызовом production `auditFreshNpcSpeech()` с сохранёнными wire и fake roleRunner: 13 структурно valid, 1 invalid (`fish-food-unsupported`). Wire verifier `verify.mjs`: 14/14 case IDs/request bodies совпали, модель одна, finish `stop`; он не оценивает семантику. Новых вызовов модели нет. Это один frozen run, без оценки стабильности по повторам.

