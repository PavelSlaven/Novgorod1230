# NPC retention Qwen run — #247

## Identity

- Request: `20261017T052526.985566Z-1`; published: `true`; exit: `0`; duration: `34.675 s`.
- Endpoint: `gpu3`, `int8KV65536`. Model: `qwen3.8-27b-uncensored-w4a16-tp2`.
- Candidate: `c73c68a3b3b0f25958fb7512bf1770f56e22df63`; catalog: `npc-scope-f501` (immutable).
- Readback only: no new model or database calls were made while preparing this report.
- `metadata.json` records `model_calls: 0` and `qwen_calls: 0` for preparation, before this published run. These fields do not describe the subsequent run; `results.jsonl` contains 12 actual responses.

## Preconditions

- The published request completed successfully. All 12 records have model `qwen3.8-27b-uncensored-w4a16-tp2` and `finish_reason=stop`.
- Private request bodies are omitted. Server catalog: `/srv/novgorod-work/fleet/tasks/codex-d49-conversation/out/bench/npc-retention-c73`.

## Source SHA-256

- `results.jsonl`: `1157bd9f2d5d438bda52a2025f681770cddea0d05ad444c0ef46fdb49fe13cb7`
- `dry-run.jsonl`: `3f9d43a2d3ed7c4a5586de9252e85b1f1d3707c37aa10880dd87dffa3a1fe7ca`
- `cases.json`: `478c27ea4edf1d3ef273632da58819280b47bf2ebf8baffda3821ccaedae7cd4`
- `metadata.json`: `da60dd0b36f8193acd97e07550127013b59048787a0c9c75b8ce4d84af0f313d`
- `d49-npc-retention-qwen-judge.md`: `23c247e609d2c91502bdff590eb45c9f3568cfc8500a7512a30126910a9aeb6e`

## Gameplay transcript

This was an offline model bench/readback, not a gameplay turn. No party, world state, or persistence was changed. The 12 case outputs below are copied verbatim from each result record’s `raw_response.choices[0].message.content`; private requests are excluded.

### `iron-hook-supported` — finish `stop`

```json
{"pass": true, "concerns": [], "utterance_fragments": [{"text": "Микула, ", "factual": false, "claim_ids": []}, {"text": "железо использовали для рыболовных крючков и острог.", "factual": true, "claim_ids": ["bench_iron_hook"]}]}
```

### `iron-hook-unsupported` — finish `stop`

```json
{
  "pass": false,
  "concerns": [
    {
      "kind": "unsupported_causal_claim",
      "reason": "Утверждение о том, что именно крючок или острог лучше приманят рыбу, не подтверждено фактом о железном инструменте, который лишь констатирует его использование.",
      "quote": "приманить рыбу лучше железным крючком или острогом"
    }
  ],
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "приманить рыбу лучше железным крючком или острогом.",
      "factual": true,
      "claim_ids": [
        "bench_iron_hook"
      ]
    }
  ]
}
```

### `boat-context-supported` — finish `stop`

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

### `boat-context-unsupported` — finish `stop`

```json
{"pass":false,"concerns":[{"kind":"unsupported_fact","reason":"Утверждение «на каждом берегу есть лодка» противоречит точному свидетельству: лодка упомянута как один из контекстов, но это не свидетельство судна на каждом берегу.","quote":"на каждом берегу есть лодка"}],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"на каждом берегу есть лодка, ","factual":true,"claim_ids":["bench_boat_context"]},{"text":"чтобы вытащить сеть.","factual":true,"claim_ids":["bench_boat_context"]}]}
```

### `net-work-supported` — finish `stop`

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
      "text": "новгородский рыбный промысел включал работу сетями.",
      "factual": true,
      "claim_ids": [
        "bench_net_work"
      ]
    }
  ]
}
```

### `net-work-unsupported` — finish `stop`

```json
{
  "pass": false,
  "concerns": [
    {
      "kind": "unsupported_personal_claim",
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

### `bark-float-supported` — finish `stop`

```json
{"pass": true, "concerns": [], "utterance_fragments": [{"text": "Микула, ", "factual": false, "claim_ids": []}, {"text": "берестяные полосы использовали для скрученных и сшитых поплавков.", "factual": true, "claim_ids": ["bench_bark_float"]}]}
```

### `bark-float-unsupported` — finish `stop`

```json
{
  "pass": false,
  "concerns": [
    {
      "kind": "unsupported_fact",
      "reason": "Утверждение о том, что все поплавки делали одинаково, не подтверждается источником, который указывает лишь на использование бересты и зависимость формы от снасти.",
      "quote": "все поплавки делали одинаково"
    }
  ],
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "все поплавки делали одинаково из бересты.",
      "factual": true,
      "claim_ids": [
        "bench_bark_float"
      ]
    }
  ]
}
```

### `fish-food-supported` — finish `stop`

```json
{"pass":true,"concerns":[],"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"в средневековом Новгороде рыба служила пищей и предметом хозяйственных отношений.","factual":true,"claim_ids":["bench_fish_food"]}]}
```

### `fish-food-unsupported` — finish `stop`

```json
{"pass": false, "concerns": [{"kind": "unsupported_fact", "reason": "Утверждение об изобилии рыбы и её ежедневном ходе именно у этого берега не подтверждено ни текущими наблюдениями, ни world_knowledge, ни памятью NPC.", "quote": "рыба каждый день в изобилии идёт именно у этого берега"}], "utterance_fragments": [{"text": "Микула, ", "factual": false, "claim_ids": []}, {"text": "рыба каждый день в изобилии идёт именно у этого берега.", "factual": true, "claim_ids": ["bench_fish_food"]}]}
```

### `repair-retained` — finish `stop`

```json
{"pass": true, "concerns": [], "utterance_fragments": [{"text": "Микула, ", "factual": false, "claim_ids": []}, {"text": "железо использовали для рыболовных крючков и острог.", "factual": true, "claim_ids": ["bench_iron_hook"]}]}
```

### `repair-dropped` — finish `stop`

```json
{"pass": true, "concerns": [], "utterance_fragments": [{"text": "Микула, ", "factual": false, "claim_ids": []}, {"text": "не знаю.", "factual": false, "claim_ids": []}]}
```

## Persistence/readback

- No database writes or gameplay persistence occurred. The report reads the completed result artifacts only.

## Findings

Independent semantic judge: **FAIL, 11/12**. The `repair-dropped` answer incorrectly returned `pass:true`; repair dropped the supported iron hook/spear fact present in `original_speech`. The other 11 verdicts matched the judge. The exact independent judge report follows.

### Independent judge report (verbatim)

```markdown
# Независимая семантическая оценка Qwen, #247

Checkout: `c73c68a3b3b0f25958fb7512bf1770f56e22df63`, ветка `codex/d49-npc-audit-target`, чистое дерево. Источники: фактические `dry-run.jsonl` и `results.jsonl` из `d49-npc-retention-qwen-result`, `cases.json` лишь для идентификаторов; `CONTRACT_INDEX.md` (ACTIVE conversation contract), `npc_conversation_mode_contract.md` §37.2, текущий `lower-dvina-trace-npc-speech-grounding-audit.js`. Читал все 12 полных входов и выходов: речь/claims/interpretation/reason, точные WK `runtime_text`, допустимые refs; у repair — также полную `original_speech`. `verify.mjs` повторно подтвердил 12 совпадений request с frozen dry-run, модель `qwen3.8-27b-uncensored-w4a16-tp2`, все `finish_reason=stop`. Это проверка артефактов, не новый вызов модели.

| Case | Qwen → нужный verdict | Основание |
|---|---|---|
| `iron-hook-supported` | PASS → PASS | WK `claim:population-iron-hook` прямо подтверждает железные крючки и остроги; исходный claim покрывает речь. |
| `iron-hook-unsupported` | FAIL → FAIL | Источник подтверждает использование инструмента, но не превосходство крючка/остроги как приманки. Concern указывает точную подстроку. |
| `boat-context-supported` | PASS → PASS | WK `claim:population-boat-work` прямо допускает вытаскивание сети на берег или в лодку при описанной ловле. |
| `boat-context-unsupported` | FAIL → FAIL | Возможность лодки не доказывает её наличие **на каждом берегу**. Concern указывает неподтверждённую квантификацию. |
| `net-work-supported` | PASS → PASS | WK `claim:population-net-work` подтверждает работу сетями как часть промысла. |
| `net-work-unsupported` | FAIL → FAIL | Общий промысел не доказывает личный навык этого NPC ставить любую сеть без лодки. |
| `bark-float-supported` | PASS → PASS | WK `claim:population-bark-float` прямо подтверждает берестяные полосы в скрученных и сшитых поплавках. |
| `bark-float-unsupported` | FAIL → FAIL | Источник ограничивает форму снастью; «все ... одинаково» и исключительность бересты не подтверждены. |
| `fish-food-supported` | PASS → PASS | WK `claim:population-fish-food` прямо подтверждает рыбу как пищу и предмет хозяйственных отношений Новгорода. |
| `fish-food-unsupported` | FAIL → FAIL | Общий исторический факт не доказывает ежедневное изобилие именно у этого берега. |
| `repair-retained` | PASS → PASS | Исходный подтверждённый факт о железных крючках/острогах сохранён в новой речи и claim. |
| `repair-dropped` | **PASS → FAIL** | `original_speech` содержит тот же исходный claim и подтверждённую WK речь о железных крючках/острогах; новый plan «Микула, не знаю.» с `claims:[]` теряет этот факт. Отказ сам по себе нефактический, но §37.2 требует сохранить подтверждённый смысл. Нужен `pass:false`, concern о потере и `quote:""` (утраченной цитаты в новой речи нет). |

Итог: семантически верны 11/12 решений: 6/6 положительных и 5/6 отрицательных. Манера и неполнота ответа не стали причиной отказа; ошибку вызвала именно потеря факта при repair. Модель не выполнила явное указание актуального system prompt сравнить `original_speech` с новой речью. Случай `repair-dropped` — воспроизводимое нарушение цели #247, поэтому Qwen acceptance этого набора **FAIL**.

Проверил текущий production `auditFreshNpcSpeech` повторным вызовом с каждым frozen request/plan и реальным Qwen output через fake `roleRunner` без новых модельных запросов. Структурный validator принял все 12 форматов; для 5 обычных negative вернул `TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED`, для 6 positive вернул `true`, для `repair-dropped` ошибочно тоже `true`. Причина: `valid()` проверяет JSON, фрагменты, refs и цитаты, но семантическое сохранение `original_speech` поручено модели; `auditFreshNpcSpeech` затем доверяет `output.pass`. Именно это ограничение оговорено ACTIVE §37.2. Дальнейшее поведение после принятия плана этим изолированным прогоном не проверялось.

Проверки: `verify.mjs` PASS; профильный replay через настоящий `auditFreshNpcSpeech` выполнен для 12/12; `git status --short` пуст. Код не менял. Граф CBM отстаёт от HEAD; для выводов использованы прямые source/contract и фактические wire артефакты. Открыто: исправить failure удержания и повторить реальный Qwen прогон до приёмки.
```

## Result

**FAIL** — independent judge found 11/12 decisions correct; `repair-dropped` lost a confirmed fact. The published endpoint run itself exited 0 and returned 12 complete responses; successful transport does not mean semantic acceptance passed.
