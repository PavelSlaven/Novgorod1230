# NPC original-fragments: полный Qwen-прогон 7f05 — FAIL

## Условия и provenance

Кандидат: 7f055415b5311ee0f83966bc534406c556b1c323, отдельный worktree codex/d49-npc-audit-target. Existing private grounding owner добавляет original_fragments: смысловую поддержку и сохранение определяет тот же LLM-аудитор, код проверяет полное покрытие текста, исходные claim IDs и согласованность результата. Нового owner, persistence, model call или repair loop нет.

Один fleet bench-request job 20261017T073351.770413Z-1, 14 последовательных вызовов, exit 0, 37.187 s. Ответы сообщают модель qwen3.8-27b-uncensored-w4a16-tp2; все finish_reason=stop. Сумма usage: 123019 prompt + 2014 completion = 125033 токена. Существующие model services не изменялись. Catalog SHA-256 9f97cb3b1f55ba8137a4e5ee04de713c0a696de9ca846a7d43007fa7a75e8000; dry-run SHA-256 bb34c066f5c7ed537822db3695ac36838aac5d41f8103147c414252ce335a92a; results SHA-256 83d20b63e9586e35bbb58b607f0a12898089f12c3222b507f79a40bee4d66d97.

Сохранены все non-system messages и provider options предыдущего 9f833 кандидата. Cloud preflight: 3/3 semantic и structural PASS, отдельные настроенные gpt-6-sol medium авторы и gpt-6-sol high судья; независимой model telemetry нет. Scoped Contract Auditor: PASS_WITH_NOTES, generic mocks не доказывают семантику. 76 focused tests, syntax, architecture, docs и diff checks PASS. Дополнительно исполнитель запускал local test:apps: exit 1 с видимыми Docker errors, вывод обрезан; другие ошибки исключить нельзя. Final full CI обязателен.

Временный ведущий Codex разрешил конкретный прогон после preflight. C8 #745 waiver ограничен соединением двух валидных JSON user messages инструментом wire review и точным dry-run hash; модель получила исходные отдельные messages. Семантических исключений не было.

## Результат

Решения PASS/FAIL совпали 14/14; production validator 14/14. Полная семантика **13/14, FAIL**: в boat-context-unsupported модель правильно отказала, но отсутствие доказательства назвала прямым противоречием. Это не считается успешной квалификацией. Следующий кандидат 43fcbb36 уточняет только общее правило диагностики; его результат здесь не утверждается.

## Ответы дословно

### iron-hook-supported

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[],"pass":true}
```

### iron-hook-unsupported

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"приманить рыбу лучше ","factual":true,"claim_ids":["bench_iron_hook"]},{"text":"железным крючком ","factual":true,"claim_ids":["bench_iron_hook"]},{"text":"или ","factual":true,"claim_ids":["bench_iron_hook"]},{"text":"острогом.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[{"kind":"grounding_mismatch","reason":"World knowledge подтверждает использование железа для крючков и острог, но не утверждает, что это лучший способ приманить рыбу.","quote":"приманить рыбу лучше "}],"pass":false}
```

### boat-context-supported

```json
{
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
  ],
  "concerns": [],
  "pass": true
}
```

### boat-context-unsupported

```json
{
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "на каждом берегу есть лодка, чтобы вытащить сеть.",
      "factual": true,
      "claim_ids": [
        "bench_boat_context"
      ]
    }
  ],
  "concerns": [
    {
      "kind": "grounding_contradiction",
      "reason": "World knowledge прямо указывает, что лодка упомянута как один из контекстов, но это не свидетельство судна на каждом берегу. Утверждение о наличии лодки на каждом берегу противоречит переданному факту.",
      "quote": "на каждом берегу есть лодка, чтобы вытащить сеть."
    }
  ],
  "pass": false
}
```

### net-work-supported

```json
{
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
  ],
  "concerns": [],
  "pass": true
}
```

### net-work-unsupported

```json
{
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
  ],
  "concerns": [
    {
      "kind": "grounding",
      "reason": "Свидетельство (world_knowledge) подтверждает лишь общий контекст работы сетями, а не личный навык NPC ставить «любую» сеть «без лодки».",
      "quote": "я лично умею ставить любую сеть без лодки."
    }
  ],
  "pass": false
}
```

### bark-float-supported

```json
{
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "берестяные полосы использовали для скрученных и сшитых поплавков.",
      "factual": true,
      "claim_ids": [
        "bench_bark_float"
      ]
    }
  ],
  "concerns": [],
  "pass": true
}
```

### bark-float-unsupported

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"все поплавки делали одинаково из бересты.","factual":true,"claim_ids":["bench_bark_float"]}],"concerns":[{"kind":"grounding_mismatch","reason":"World knowledge указывает, что форма и соединение поплавков зависели от снасти, что противоречит утверждению об одинаковом изготовлении.","quote":"все поплавки делали одинаково из бересты."}],"pass":false}
```

### fish-food-supported

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"в средневековом Новгороде рыба служила пищей и предметом хозяйственных отношений.","factual":true,"claim_ids":["bench_fish_food"]}],"concerns":[],"pass":true}
```

### fish-food-unsupported

```json
{
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
  ],
  "concerns": [
    {
      "kind": "grounding",
      "reason": "World knowledge подтверждает рыбу как пищу, но не утверждает ежедневное изобилие именно у этого берега.",
      "quote": "рыба каждый день в изобилии идёт именно у этого берега."
    }
  ],
  "pass": false
}
```

### repair-retained

```json
{
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
  ],
  "concerns": [],
  "pass": true,
  "original_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": [],
      "supported": true,
      "retained": true
    },
    {
      "text": "железо использовали для рыболовных крючков и острог.",
      "factual": true,
      "claim_ids": [
        "bench_iron_hook"
      ],
      "supported": true,
      "retained": true
    }
  ]
}
```

### repair-dropped

```json
{
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
  ],
  "original_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": [],
      "supported": true,
      "retained": true
    },
    {
      "text": "железо использовали для рыболовных крючков и острог.",
      "factual": true,
      "claim_ids": [
        "bench_iron_hook"
      ],
      "supported": true,
      "retained": false
    }
  ],
  "concerns": [
    {
      "kind": "missing_retained_fact",
      "reason": "Поддержанный факт original_speech (использование железа для крючков) не сохранён в новой речи.",
      "quote": ""
    }
  ],
  "pass": false
}
```

### neutral-control

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[],"pass":true}
```

### repair-dropped-claimless-original

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[],"pass":true,"original_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[],"supported":true,"retained":true},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":[],"supported":true,"retained":false}]}
```

## Независимая оценка дословно

# Independent Qwen NPC audit judge

**Verdict: FAIL under full semantic rubric.** Expected PASS/FAIL decisions match in all 14 cases; production structure passes 14/14. Full semantic accuracy is 13/14 because one diagnostic reason asserts a contradiction that the supplied source does not establish. Both structure and full semantics: 13/14. No repository files were changed.

Checkout: `7f055415b5311ee0f83966bc534406c556b1c323` (`codex/d49-npc-audit-target`). Active contract: `data/knowledge-source/corpus/DOCUMENTS/npc_conversation_mode_contract.md:1907-1921`; validator: `apps/game-server/src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js:1-230`. The contract assigns meaning and source correspondence to the auditor; the code validates shape and exact fragment coverage. Cases and source `runtime_text` were checked against each captured request, not solely against the listed expected verdict.

| Case (`results.jsonl` line) | Expected | Actual production | Structure | Full semantics | Decisive source check |
|---|---:|---:|---:|---:|---|
| `iron-hook-supported` (1) | PASS | PASS | PASS | PASS | `claim:population-iron-hook`: iron was used for hooks and spears. |
| `iron-hook-unsupported` (2) | FAIL | FAIL | PASS | PASS | Same source gives material use, not the best way to lure fish. |
| `boat-context-supported` (3) | PASS | PASS | PASS | PASS | `claim:population-boat-work`: the net was taken ashore or into a boat in the described fishing. |
| `boat-context-unsupported` (4) | FAIL | FAIL | PASS | **FAIL** | Source does not establish a boat at *every* shore; verdict is right, diagnosis overstates this as contradiction. |
| `net-work-supported` (5) | PASS | PASS | PASS | PASS | `claim:population-net-work`: Novgorod fishing included work with nets. |
| `net-work-unsupported` (6) | FAIL | FAIL | PASS | PASS | General occupation does not establish this NPC's skill with every net without a boat; `memory.records` is empty. |
| `bark-float-supported` (7) | PASS | PASS | PASS | PASS | `claim:population-bark-float`: twisted and sewn birch bark floats are attested. |
| `bark-float-unsupported` (8) | FAIL | FAIL | PASS | PASS | Source says float form and joining varied by tackle, not that all were identical. |
| `fish-food-supported` (9) | PASS | PASS | PASS | PASS | `claim:population-fish-food`: fish was food and part of economic relations. |
| `fish-food-unsupported` (10) | FAIL | FAIL | PASS | PASS | Source says nothing about daily abundance at this shore; current observations only mention water, shore edge, trees. |
| `repair-retained` (11) | PASS | PASS | PASS | PASS | Supported iron fact has original claim and is retained in current speech and claims. |
| `repair-dropped` (12) | FAIL | FAIL | PASS | PASS | Same supported, claimed original fact is absent from current `не знаю`; original fragment correctly marked `retained:false`. |
| `neutral-control` (13) | PASS | PASS | PASS | PASS | Current `не знаю` expresses uncertainty, not a categorical limit of NPC knowledge; no original speech. |
| `repair-dropped-claimless-original` (14) | PASS | PASS | PASS | PASS | Original iron fact has no original claim. §37.2 permits omission; `supported:true` does not itself impose retention. |

**Material error, exact evidence.** In `results.jsonl:4`, `concerns[0]` uses `kind:"grounding_contradiction"` and says `Утверждение о наличии лодки на каждом берегу противоречит переданному факту.` The captured request's `world_knowledge.facts` says `Лодка упомянута как один из контекстов извлечения сети; это не свидетельство судна на каждом берегу.` The paired `claim:population-boat-work` says boats are a permitted context and access/rights are separate. These are limits on evidence, not evidence that some shore lacks a boat. Minimum causal gap: auditor converted **not established** into **contradicted**. The plan still must fail for unsupported universality. No code fix is inferred from this result.

**Structural replay and provenance.** A temporary replay script (removed after execution) imported the actual validator from this checkout, fed each parsed raw model response through a fake `roleRunner`, compared all 14 emitted messages to full captured wire messages and each full captured wire request to `dry-run.jsonl`; checked role, request identity, temperature, token limit, response format, final finish reason, and `JSON.parse(raw_response.choices[0].message.content) === output`. All 14 passed; validator decisions match table, including `supported_original_fact_dropped` for case 12. The 14 distinct raw chat completions report `model=qwen3.8-27b-uncensored-w4a16-tp2`, `system_fingerprint=vllm-0.28.0-aa272468`, `finish_reason=stop`, `created=2026-10-17T07:35:51Z..07:36:25Z`. Raw usage sums: 123,019 prompt + 2,014 completion = **125,033 tokens**. This establishes captured response provenance and local replay, not an independently observed remote endpoint or full CI/D49 qualification.



## Persistence / приёмка

Это изолированный стенд аудитора, не живой разговор и не browser D49. Игровые данные не менялись. **FAIL**, merge на основании этого прогона не выполнялся.
