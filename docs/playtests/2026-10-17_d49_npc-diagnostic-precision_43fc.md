# NPC diagnosis precision 43fc: Qwen — FAIL

## Условия

Кандидат 43fcbb36e163353475163fdb868b9ed2e188b2ae добавил три строки общего private audit prompt: различать отсутствие подтверждения и прямое противоречие, не добавлять в диагностику новых фактов. Модель, topology, owner, persistence, лимиты и параметры запроса не менялись. Все 14 frozen user messages совпали с 7f05; изменён только system. 76 focused tests, syntax, architecture, docs и diff checks PASS. Независимый широкий архитектурный аудит включает 43fc: PASS_WITH_NOTES по проверенной конструкции; финальная приёмка D49 остаётся BLOCK.

Cloud preflight на двух boat-cases: 2/2 semantic и production validator PASS. Автор configured gpt-6-sol medium, отдельный судья high; actual telemetry недоступна. Пользователь разрешил Codex вместо Sonnet. Это subset2/14, не вся квалификация.

Fleet job 20261017T075859.987129Z-1 опубликован: exit0, 37.788s, endpoint gpu3, одна карта/int8 KV/65536. Сумма raw usage 123649 prompt + 1980 completion = 125629 токенов. Все14 finish_reason=stop; модель в raw qwen3.8-27b-uncensored-w4a16-tp2. Сервисы моделей не менялись, игровых БД не касались. Результат сначала скопирован из завершённого staging, затем SHA-256 сверен с официально опубликованным файлом: a4ca95b6666a72c56683fef96588f78bc664f42325b86f161de78b85ed5d04d1.

Catalog SHA-256 48b7ab7318abb9bd7bdd3e36ec463eda93cf6004f1b0edb25e158d11c1a5d564; dry SHA-256 c6023aa6346311cd88f664c86b493e2c2a6d60de9de017fd526c223e1ee79c13; wire-review SHA-256 a965823644d99dd78eb37b20e8bd5a741c425b1e58b3ea02ea8c76125039f7a2. Единственный C8 #745 waiver касался reviewer concatenation двух валидных JSON user messages, не семантики. Подготовительный preflight сначала отклонил два файла wire-review*.md; приложение переименовано reviewer-supplement.md. Затем preflight и BENCH-OK verify PASS до единственного запуска.

## Итог

**FAIL: 13/14 production structure/decisions и 13/14 полной семантики.** Boat-case снова путает отсутствие подтверждения с противоречием, отрицает подтверждённую возможную функцию лодки и возвращает reason268 при лимите240; production выдаёт 503. В repair-dropped raw pass:true ошибочен, но код правильно отклоняет потерю supported claimed fact по original_fragments. Assertions и лимит не ослаблены. Ветка не интегрирована на основании этого прогона.

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
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"сеть при такой ловле вытаскивают на берег или в лодку.","factual":true,"claim_ids":["bench_boat_context"]}],"concerns":[],"pass":true}
```

### boat-context-unsupported

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"на каждом берегу есть лодка, ","factual":true,"claim_ids":["bench_boat_context"]},{"text":"чтобы вытащить сеть.","factual":true,"claim_ids":["bench_boat_context"]}],"concerns":[{"kind":"contradiction_with_source","reason":"World knowledge (claim:population-boat-context) прямо указывает, что упоминание лодки не является свидетельством судна на каждом берегу. Утверждение о наличии лодки на каждом берегу противоречит этому.","quote":"на каждом берегу есть лодка, "},{"kind":"unsupported_causal_link","reason":"Связь между наличием лодки и вытаскиванием сети (claim:population-boat-work) описывает допустимый контекст, но не утверждает, что лодка используется именно для этого на каждом берегу. Утверждение о цели 'чтобы вытащить сеть' не подтверждено как универсальная практика.","quote":"чтобы вытащить сеть."}],"pass":false}
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
      "kind": "unsupported_fact",
      "reason": "Утверждение о личном умении ставить любую сеть без лодки не подтверждено: world_knowledge подтверждает лишь общий контекст работы сетями, а не навык конкретного NPC.",
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
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"все поплавки делали одинаково из бересты.","factual":true,"claim_ids":["bench_bark_float"]}],"concerns":[{"kind":"grounding_mismatch","reason":"World knowledge указывает, что форма и соединение поплавков зависели от снасти, что противоречит утверждению об одинаковом изготовлении всех.","quote":"все поплавки делали одинаково из бересты."}],"pass":false}
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
      "kind": "unsupported_fact",
      "reason": "World knowledge подтверждает рыбу как пищу, но не утверждает ежедневное изобилие именно у данного берега.",
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
      "retained": false
    }
  ]
}
```

### neutral-control

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
  "concerns": [],
  "pass": true
}
```

### repair-dropped-claimless-original

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[],"pass":true,"original_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[],"supported":true,"retained":true},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":[],"supported":true,"retained":false}]}
```

## Независимая оценка дословно

# Независимый judge: NPC grounding auditor, Qwen14

**Вердикт: qualification не пройдена.** Production `auditFreshNpcSpeech` на owner HEAD `43fcbb36e163353475163fdb868b9ed2e188b2ae` возвращает 8 `PASS`, 5 семантических `FAIL` и 1 `INVALID` вместо ожидаемых 8 `PASS` / 6 `FAIL`. Порог 14/14 production structure/decisions: **13/14** точных исходов; если учитывать лишь бинарное «пропустить/отклонить», 14/14, но шестой отказ не имеет валидной диагностики и завершается `TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID` (503). Порог 14/14 semantic support/retention/diagnostics: **13/14** на production verdict; диагноз `boat-context-unsupported` неверно объявляет отсутствие свидетельства противоречием и отвергает подтверждённую возможную функцию лодки. Сырое решение `repair-dropped` дополнительно внутренне противоречиво (`pass:true` при `supported:true, retained:false`), но production-код правильно переводит его в semantic `FAIL`.

Основание: 14 замороженных `cases.json`, все `request.messages` из `results.jsonl` и `dry-run.jsonl`, каждый `raw_response.choices[0].message.content`, исходные `request.world_knowledge.facts.runtime_text`, `allowed_references`, память и план. Все 14 user request имеют одинаковый фактический request; варьируются plan и наличие/содержание original_speech. World Knowledge подтверждает железные крючки и остроги, извлечение сети на берег или в лодку, общий сетной промысел, берестяные поплавки и рыбу как пищу/предмет хозяйственных отношений. `memory.records` пуста; наблюдения сообщают лишь о воде, кромке берега и очертаниях деревьев. Нынешнего улова, лодки на каждом берегу и личного умения NPC источники не устанавливают. Вход `original_speech` — отвергнутый кандидат, а не источник фактов. Контракт: active `npc_conversation_mode_contract.md` §37.2; runtime owner: `apps/game-server/src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js`.

| № | Кейс | Ожидание | Raw pass | Production | Смысл и диагноз |
|---:|---|---|---|---|---|
| 1 | `iron-hook-supported` | PASS | true | PASS | Железные крючки/остроги прямо подтверждены `claim:population-iron-hook`; claim и фрагмент совпадают. |
| 2 | `iron-hook-unsupported` | FAIL | false | FAIL | «Лучше приманить» не следует из использования инструмента; `grounding_mismatch` верен. Фрагментация на «или» избыточна, исход не меняет. |
| 3 | `boat-context-supported` | PASS | true | PASS | Сеть извлекали на берег или в лодку; точный `claim:population-boat-work`. |
| 4 | `boat-context-unsupported` | FAIL | false | **INVALID** | «На каждом берегу есть лодка» не доказано. `claim:population-boat-context` говорит «это не свидетельство», но не утверждает отсутствие лодки: `contradiction_with_source` неверен. Отдельный `unsupported_causal_link` на «чтобы вытащить сеть» отрицает возможное назначение, уже подтверждённое `claim:population-boat-work`. Его `reason` — 268 символов при лимите 240; replay бросает `TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID`. |
| 5 | `net-work-supported` | PASS | true | PASS | Общий новгородский сетной промысел прямо подтверждён `claim:population-net-work`. |
| 6 | `net-work-unsupported` | FAIL | false | FAIL | Личное умение ставить любую сеть без лодки не следует из общего промысла; `unsupported_fact` верен. |
| 7 | `bark-float-supported` | PASS | true | PASS | Берестяные полосы для поплавков прямо подтверждены `claim:population-bark-float`. |
| 8 | `bark-float-unsupported` | FAIL | false | FAIL | «Все поплавки одинаково» не следует из источника; источник указывает зависимость формы/соединения от снасти. Диагноз по существу верен. |
| 9 | `fish-food-supported` | PASS | true | PASS | Рыба как пища и предмет хозяйственных отношений подтверждена `claim:population-fish-food`. |
| 10 | `fish-food-unsupported` | FAIL | false | FAIL | Ежедневное изобилие у конкретного берега не подтверждено; `unsupported_fact` верен. |
| 11 | `repair-retained` | PASS | true | PASS | Исходный поддержанный факт, его claim и смысл сохранены; `original_fragments` корректны. |
| 12 | `repair-dropped` | FAIL | **true** | **FAIL** | Модель сама отметила исходный факт `supported:true, retained:false`, но вернула `pass:true`, `concerns:[]`. Код детерминированно добавил `supported_original_fact_dropped` и отклонил. |
| 13 | `neutral-control` | PASS | true | PASS | Тот же нейтральный план «не знаю» без original_speech не содержит проверяемого факта; пропуск корректен. |
| 14 | `repair-dropped-claimless-original` | PASS | true | PASS | Исходная фактическая фраза без исходного claim может быть опущена по §37.2; `claim_ids:[]`, `retained:false` не активируют retention-ограничение. |

## Dislike

1. Кейс 4: формально подходящий `pass:false` скрывает некорректную классификацию и невалидный размер concern. Production получает 503, а не полезный semantic feedback.
2. Кейс 12: `pass:true` противоречит собственной разметке сохранения; код исправляет итог, но модель не соблюдает требуемую внутреннюю согласованность.
3. Кейс 2: дробление единого утверждения на «приманить рыбу лучше», «железным крючком», «или», «острогом» делает отдельное `factual:true` для союза бессодержательным. Код принимает форму, поскольку проверяет точное покрытие, а не качество смыслового сегментирования.

## Improve

- Для кейса 4 нужен один короткий `unsupported_fact`/`missing_evidence` о недоказанном универсальном наличии лодки, с точной цитатой «на каждом берегу есть лодка»; не объявлять противоречие там, где источник лишь ограничивает вывод. Возможность вытаскивать сеть в лодку не отрицать. Каждый `reason` ≤ 240 символов.
- Для кейса 12 модель должна поставить `pass:false` и concern `supported_original_fact_dropped` с пустой `quote`; либо сохранить исходный факт и claim в новой речи. Production-проверка уже верно отклоняет потерю.
- Для кейса 2 объединять зависимые слова одного утверждения в осмысленный фактический фрагмент.

## Missing facts

В `request` нет факта о лодке на каждом берегу, ежедневном обильном улове у этого берега или личном опыте NPC с любой сетью. Это **отсутствие доказательства**, не доказательство противоположного. `claim:population-boat-context` прямо формулирует границу свидетельства; он не сообщает, что где-то лодки нет. `claim:population-boat-work` подтверждает допустимую работу с лодкой при извлечении сети, но не универсальную доступность судна. Дополнительный внешний исторический источник для оценки этих 14 входов не нужен: аудитор обязан судить по переданному request.

## Improve general

Сохранять разделение полномочий active §37.2: модель судит о смысле и точности диагноза; код проверяет JSON, покрытие фрагментами, refs и согласованность удержания исходного подтверждённого claimed-факта. Не вводить второго владельца семантики в код. Перед production qualification нужна новая реальная модельная проба с теми же неизменными `cases/expected` после исправления model-facing инструкции либо поведения модели; этот результат не достигает обоих порогов.

## Replay и происхождение

Точный wire всех 14 `results.jsonl.request_body` совпал с `dry-run.jsonl.request`, включая system/user messages, `model`, `temperature:0`, `max_tokens:20000`, `response_format`, `chat_template_kwargs`, `top_p`. Вызов настоящего `auditFreshNpcSpeech` на HEAD с fake `roleRunner.run` вернул точные production результаты таблицы; переданные `messages`, `scope`, `role_id`, `request_identity`, `temperature`, `maxTokens` сверены по каждой строке. Все 14 raw имеют уникальный `chatcmpl` id, `finish_reason:stop`, `model:qwen3.8-27b-uncensored-w4a16-tp2`, ненулевые usage, корректное `prompt_tokens + completion_tokens = total_tokens`; `output` каждой строки дословно разбирается из raw `choices[0].message.content`. Сумма usage: 123649 prompt + 1980 completion tokens. Поле `model` само по себе не подтверждает endpoint. По переданному подтверждению fleet результат job `20261017T075859.987129Z-1` официально опубликован: exit 0, runner 37.788s, endpoint `gpu3`, одна карта / int8 KV / 65536. Локальный SHA-256 `results.jsonl` — `a4ca95b6666a72c56683fef96588f78bc664f42325b86f161de78b85ed5d04d1`, совпадает с опубликованным hash, сообщённым владельцем. SHA-256 `dry-run.jsonl` — `c6023aa6346311cd88f664c86b493e2c2a6d60de9de017fd526c223e1ee79c13`. Сервисный endpoint независимо из локальных JSONL не устанавливается.


## Приёмка

Изолированный стенд аудитора не является живым разговором. D49 и save/reload не выполнены этим прогоном. Полный CI итогового интегрированного HEAD остаётся обязательным.
