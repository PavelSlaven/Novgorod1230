# Последний Qwen NPC grounding audit D49 — FAIL

## Identity

- Кандидат: `9f833c1b40ad4efd805ec8883342b01aaff7bfa9`; provider server: `a7e58d44f`; исходный кандидат: `57c2da6b3da4f06b19b20de87a844e51e2f30a6b`.
- Задание: `20261017T065826.215917Z-1`; длительность 31.563 с.
- Проверяемая модель: `qwen3.8-27b-uncensored-w4a16-tp2` через настроенный production-провайдер; роль `npc_conversation_grounding_auditor`.
- Это модельный стенд, не игровой ход. Party, видимого результата игроку, commit мира и readback нет.

## Preconditions

- Заморожено 14 случаев; ожидания: 8 PASS и 6 FAIL. Все 14 фактических request body совпали с dry-run, вызовов fake fetch — 14, вызовов модели при dry-run — 0.
- Предыдущий результат и источник сведены в `metadata.json`; private request body и provider traces не публикуются.
- Независимый судья: configured `gpt-6-sol` high. Фактическая model telemetry и токены судьи недоступны.

## Gameplay transcript

- Player input: неприменимо — 14 frozen NPC audit inputs, а не игровой run.
- Ответы ниже скопированы посимвольно из `raw_response.choices[0].message.content`, без правки, нормализации и повторной оценки. Во всех случаях `finish_reason=stop`.

### `iron-hook-supported` — finish stop

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[],"pass":true}
```

### `iron-hook-unsupported` — finish stop

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"приманить рыбу лучше железным крючком или острогом.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[{"kind":"grounding_mismatch","reason":"World knowledge подтверждает использование железа для крючков и острог, но не утверждает, что это лучший способ приманить рыбу.","quote":"приманить рыбу лучше железным крючком или острогом."}],"pass":false}
```

### `boat-context-supported` — finish stop

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"сеть при такой ловле вытаскивают на берег или в лодку.","factual":true,"claim_ids":["bench_boat_context"]}],"concerns":[],"pass":true}
```

### `boat-context-unsupported` — finish stop

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"на каждом берегу есть лодка, ","factual":true,"claim_ids":["bench_boat_context"]},{"text":"чтобы вытащить сеть.","factual":true,"claim_ids":["bench_boat_context"]}],"concerns":[{"kind":"grounding_contradiction","reason":"World knowledge (claim:population-boat-context) прямо указывает, что лодка упомянута как один из контекстов, но это не свидетельство судна на каждом берегу. Утверждение «на каждом берегу» противоречит этому.","quote":"на каждом берегу есть лодка, "},{"kind":"grounding_contradiction","reason":"World knowledge (claim:population-boat-work) описывает процесс вытаскивания сетей на берег или в лодку, но не утверждает, что лодка используется именно для того, чтобы вытащить сеть (как единственное или обязательное средство).","quote":"чтобы вытащить сеть."}],"pass":false}
```

### `net-work-supported` — finish stop

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"новгородский рыбный промысел включал работу сетями.","factual":true,"claim_ids":["bench_net_work"]}],"concerns":[],"pass":true}
```

### `net-work-unsupported` — finish stop

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"я лично умею ","factual":true,"claim_ids":["bench_net_work"]},{"text":"ставить ","factual":true,"claim_ids":["bench_net_work"]},{"text":"любую ","factual":true,"claim_ids":["bench_net_work"]},{"text":"сеть ","factual":true,"claim_ids":["bench_net_work"]},{"text":"без ","factual":true,"claim_ids":["bench_net_work"]},{"text":"лодки.","factual":true,"claim_ids":["bench_net_work"]}],"concerns":[{"kind":"grounding","reason":"Утверждение о личном навыке (умею) требует точной записи в memory.records, которой нет. World knowledge подтверждает лишь общий контекст, не личный опыт NPC.","quote":"я лично умею ставить любую сеть без лодки."}],"pass":false}
```

### `bark-float-supported` — finish stop

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"берестяные полосы использовали для скрученных и сшитых поплавков.","factual":true,"claim_ids":["bench_bark_float"]}],"concerns":[],"pass":true}
```

### `bark-float-unsupported` — finish stop

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"все поплавки делали одинаково из бересты.","factual":true,"claim_ids":["bench_bark_float"]}],"concerns":[{"kind":"grounding_mismatch","reason":"World knowledge указывает, что форма и соединение поплавков зависели от снасти, что противоречит утверждению об одинаковом изготовлении всех.","quote":"все поплавки делали одинаково из бересты."}],"pass":false}
```

### `fish-food-supported` — finish stop

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"в средневековом Новгороде рыба служила пищей и предметом хозяйственных отношений.","factual":true,"claim_ids":["bench_fish_food"]}],"concerns":[],"pass":true}
```

### `fish-food-unsupported` — finish stop

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"рыба каждый день в изобилии идёт именно у этого берега.","factual":true,"claim_ids":["bench_fish_food"]}],"concerns":[{"kind":"grounding","reason":"World knowledge подтверждает рыбу как пищу, но не утверждает ежедневное изобилие именно у этого берега.","quote":"рыба каждый день в изобилии идёт именно у этого берега."}],"pass":false}
```

### `repair-retained` — finish stop

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
  "pass": true
}
```

### `repair-dropped` — finish stop

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

### `neutral-control` — finish stop

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[],"pass":true}
```

### `repair-dropped-claimless-original` — finish stop

```json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[],"pass":true}
```

## Persistence/readback

- Стенд не изменял party/DB и не выполнял readback. Production validator replay готовых ответов зафиксирован в независимой оценке ниже.

## Findings

- Независимый verdict: semantic **13/14**, structural **14/14**, оба **13/14**. Gate **FAIL** (нужно 14/14); `repair-dropped` ошибочно принят после утраты поддержанного исходного факта с `bench_iron_hook`.
- `raw_response.usage` по 14 ответам: prompt 120275, completion 1404, total 121679 токенов (по исходной оценке).

### Независимая оценка (дословно)

# Независимый verdict: последний Qwen NPC grounding audit

**Снимок:** `9f833c1b40ad4efd805ec8883342b01aaff7bfa9` (read-only worktree). **Судья:** configured `gpt-6-sol`, reasoning `high`. **Модель проверяемых ответов:** `qwen3.8-27b-uncensored-w4a16-tp2`. Предыдущие judge-отчёты не читались. Новых вызовов моделей и HTTP не было.

**Итог:** semantic **13/14**, structural **14/14**, both **13/14**. Gate **FAIL**: нужно 14/14. Проблемный ID: `repair-dropped`.

Структура означает: ответ успешно прошёл настоящий `auditFreshNpcSpeech` из `apps/game-server/src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js`, включая точное покрытие текста фрагментами, формат concerns и ссылки на claim IDs. Семантика означает: итоговый `pass` или `FAIL` соответствует точным свидетельствам request и правилу сохранения поддержанных фактов исходной речи. Структурный validator не доказывает семантическую правильность `pass`.

| ID | Expected | Actual / validator | Struct | Semantic | Основание |
|---|---|---|---|---|---|
| `iron-hook-supported` | PASS | PASS | ✓ | ✓ | «железо использовали для рыболовных крючков и острог» дословно следует `claim:population-iron-hook`; в этом случае original_speech не передана. |
| `iron-hook-unsupported` | FAIL | FAIL | ✓ | ✓ | «приманить рыбу лучше железным крючком или острогом» добавляет неподтверждённое превосходство/функцию приманки. |
| `boat-context-supported` | PASS | PASS | ✓ | ✓ | «сеть при такой ловле вытаскивают на берег или в лодку» поддержано `claim:population-boat-work`; доступность конкретной лодки не заявлена. |
| `boat-context-unsupported` | FAIL | FAIL | ✓ | ✓ | «на каждом берегу есть лодка» не следует из возможного хозяйственного контекста. Второй concern о «чтобы вытащить сеть» чрезмерен: источник допускает вытаскивание сети в лодку. Это не меняет верный итог FAIL. |
| `net-work-supported` | PASS | PASS | ✓ | ✓ | Общая практика новгородского рыбного промысла сетями точно поддержана. |
| `net-work-unsupported` | FAIL | FAIL | ✓ | ✓ | «я лично умею ставить любую сеть без лодки» — личный навык и абсолютная граница; общий World Knowledge их не доказывает. |
| `bark-float-supported` | PASS | PASS | ✓ | ✓ | Использование берестяных полос для скрученных и сшитых поплавков поддержано. |
| `bark-float-unsupported` | FAIL | FAIL | ✓ | ✓ | «все поплавки делали одинаково» противоречит зависимости формы и соединения от снасти. |
| `fish-food-supported` | PASS | PASS | ✓ | ✓ | Рыба как пища и предмет хозяйственных отношений в средневековом Новгороде поддержана. |
| `fish-food-unsupported` | FAIL | FAIL | ✓ | ✓ | «каждый день в изобилии ... именно у этого берега» добавляет частоту, количество и локальную доступность без свидетельства. |
| `repair-retained` | PASS | PASS | ✓ | ✓ | Исходный подтверждённый факт и исходный `bench_iron_hook` сохранены в новом plan. |
| `repair-dropped` | FAIL | **PASS** | ✓ | **✗** | Исходный подтверждённый факт с `bench_iron_hook` исчез; новая речь «Микула, не знаю.» имеет `claims:[]`. Модель вернула `concerns:[]`, `pass:true`. |
| `neutral-control` | PASS | PASS | ✓ | ✓ | Та же нынешняя неуверенность «не знаю», но `original_speech` отсутствует; поддержанный факт сохранять не требуется. |
| `repair-dropped-claimless-original` | PASS | PASS | ✓ | ✓ | В `original_speech` есть фраза про железо, но `claims:[]`; активный контракт прямо разрешает опустить поддержанный факт без исходного claim. |

### Причинный разрыв `repair-dropped`

Один и тот же `request_body.messages[2].content` содержит **оба** объекта: `original_speech.utterance_text = "Микула, железо использовали для рыболовных крючков и острог."` с исходным claim `bench_iron_hook` и `plan.speech.utterance_text = "Микула, не знаю."` с `claims:[]`. `request.world_knowledge.facts` содержит `claim:population-iron-hook`: «Железо использовали для рыболовных крючков и острог; готовый инструмент требовал обработки металла.» Ref также есть в `request.allowed_references.knowledge_refs`. Значит, исходный факт действительно поддержан — сам ID claim не использовался как доказательство. `initial_audit_feedback` отсутствует, но правило сохранения от feedback не зависит.

Активный `npc_conversation_mode_contract.md` §37.2 требует, чтобы semantic repair сохранил поддержанные факты с исходным claim. Production prompt повторяет: «каждый факт исходной речи с исходным claim и точным свидетельством в request должен остаться в новой речи с тем же смыслом и исходным claim». Модель разметила только текущую нефактическую речь и дала `pass:true`; сравнение с исходной подтверждённой речью в её verdict не отразилось. Кодовый validator проверил форму и текущие фрагменты, поэтому вернул `true`; это ожидаемый предел его структурной роли, а не доказательство поддержки ответа.

### Проверки и пределы

- `results.jsonl` и `dry-run.jsonl`: 14 уникальных ID; 14/14 тел запросов равны; 14/14 `raw_response.choices[0].message.content` парсятся в сохранённый `output`; 14/14 `finish_reason=stop`.
- Replay каждого `output` через production `auditFreshNpcSpeech`: 14/14 структурно приняты; 5 verdict FAIL и 9 verdict PASS. Корректны 13.
- В проверенных factual claims все используемые source refs присутствуют и в `world_knowledge.facts`, и в `allowed_references.knowledge_refs`; смысл проверен по `runtime_text`, не по названию ref.
- Телеметрия Qwen из `raw_response.usage`: prompt **120275**, completion **1404**, total **121679** токенов за 14 ответов. Телеметрия токенов судьи недоступна.
- Временные скрипты проверки удалены; checkout после проверки без изменений. Никаких выводов о качестве модели вне этих 14 зафиксированных случаев.

## Source artifacts (SHA-256)

- `results.jsonl`: `3d1b4d98db46dd679105d6255e0fac2b119e14dd30fb2067f65554e092c85894`
- `dry-run.jsonl`: `05b233f66402f9a7d228442bc071da27bd555c0a079e1f262fa6ee3bf2cb91a5`
- `cases.json`: `4bee19a852c79a3463b0728b9a22413a836efa99a1faf36450b43718430f4a29`
- `metadata.json`: `7df44f543a5a1112cc83997624bdfc868bddf0830ca426bc4fb636c7ec42fdc9`
- `judge.md`: `ca448a404615b467c77135e8b724902c752ffcae834048bed56048f73dc53524`

## Result

**FAIL.** Приёмка D49 не завершена; это verdict только 14 замороженных случаев, не всего каталога.
