# D49 NPC: точные фрагменты исправлены, полная семантика FAIL

## Identity

17 октября 2026. Изолированный кандидат `982d20e603e2951e4d5218bbf6de8587d9613b06`, ветка `codex/d49-npc-audit-target`. Fleet job `20261017T103053.009866Z-1`; модель `qwen3.8-27b-uncensored-w4a16-tp2`.

## Preconditions

Единственная новая переменная относительно 3995a1959 — общая инструкция самопроверки точных текущих и исходных фрагментов перед JSON. Случаи, факты, user messages, схема и host validator неизменны. Четырнадцать случаев: восемь ожидаемых PASS, шесть FAIL. Параметры роли production: temperature 0, top_p 1, max_tokens 20000, thinking off. Четыре свежие облачные пробы gpt-6-sol medium, независимая оценка gpt-6-sol high и replay действующего host прошли 4/4; это не квалификация полного набора Qwen.

[Независимый Contract Auditor дельты](../work/audits/d49-npc-fragment-delta-982d20e60.md): PASS_WITH_NOTES. Автор сообщил 13 профильных тестов и syntax/architecture/docs/diff PASS. В этом сборе результатов они не повторялись. Полные production captures получены на 982d20e60, transport на серверном a7e58d44; provider/settings/default-role файлы побайтно равны. Fake-fetch сверил 14 запросов. Реальные ответы затем воспроизведены через локальный host именно 982d20e60. C8 waiver касается только дефекта проверяющего инструмента #745, не смыслового порога.

Первое оформление BENCH-OK не содержало обязательной строки «куда» и было отклонено до создания задания; исправленный BENCH-OK-2 создал единственный job. Повторных модельных вызовов не было.

## Gameplay transcript

Это стенд частного аудитора, не игровая партия. Точные окончательные ответы модели:

### iron-hook-supported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[]}
~~~

### iron-hook-unsupported

~~~json
{
  "utterance_fragments": [
    {
      "text": "Микула, ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "приманить рыбу лучше ",
      "factual": true,
      "claim_ids": [
        "bench_iron_hook"
      ]
    },
    {
      "text": "железным крючком или острогом.",
      "factual": true,
      "claim_ids": [
        "bench_iron_hook"
      ]
    }
  ],
  "concerns": [
    {
      "kind": "unsupported_fact",
      "reason": "World knowledge подтверждает использование железа для крючков и острог, но не утверждает, что это лучший способ приманить рыбу.",
      "quote": "приманить рыбу лучше "
    }
  ]
}
~~~

### boat-context-supported

~~~json
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
  "concerns": []
}
~~~

### boat-context-unsupported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"на каждом берегу есть лодка, ","factual":true,"claim_ids":["bench_boat_context"]},{"text":"чтобы вытащить сеть.","factual":true,"claim_ids":["bench_boat_context"]}],"concerns":[{"kind":"contradiction_with_source","reason":"Источник утверждает, что лодка упомянута как один из контекстов, но это не свидетельство судна на каждом берегу.","quote":"на каждом берегу есть лодка"}]}
~~~

### net-work-supported

~~~json
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
  "concerns": []
}
~~~

### net-work-unsupported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"я лично ","factual":false,"claim_ids":[]},{"text":"умею ","factual":true,"claim_ids":["bench_net_work"]},{"text":"ставить ","factual":true,"claim_ids":["bench_net_work"]},{"text":"любую ","factual":true,"claim_ids":["bench_net_work"]},{"text":"сеть ","factual":true,"claim_ids":["bench_net_work"]},{"text":"без ","factual":true,"claim_ids":["bench_net_work"]},{"text":"лодки.","factual":true,"claim_ids":["bench_net_work"]}],"concerns":[{"kind":"unsupported_fact","reason":"World knowledge подтверждает лишь общий контекст работы сетями, не личное умение NPC ставить любую сеть без лодки.","quote":"я лично умею ставить любую сеть без лодки."}]}
~~~

### bark-float-supported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"берестяные полосы использовали для скрученных и сшитых поплавков.","factual":true,"claim_ids":["bench_bark_float"]}],"concerns":[]}
~~~

### bark-float-unsupported

~~~json
{
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
  ],
  "concerns": [
    {
      "kind": "unsupported_fact",
      "reason": "Источник (claim:population-bark-float) указывает, что форма и соединение поплавков зависели от снасти, что противоречит утверждению об их единообразии.",
      "quote": "все поплавки делали одинаково из бересты."
    }
  ]
}
~~~

### fish-food-supported

~~~json
{
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
  ],
  "concerns": []
}
~~~

### fish-food-unsupported

~~~json
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
      "reason": "Источник подтверждает лишь то, что рыба была пищей, но не утверждает, что она ежедневно идёт в изобилии именно у этого берега.",
      "quote": "рыба каждый день в изобилии идёт именно у этого берега."
    }
  ]
}
~~~

### repair-retained

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[],"original_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[],"supported":true,"retained":true},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":["bench_iron_hook"],"supported":true,"retained":true}]}
~~~

### repair-dropped

~~~json
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
  "concerns": [
    {
      "kind": "missing_retained_fact",
      "reason": "Факт о железных крючках и острогах из original_speech не сохранён в новой речи.",
      "quote": ""
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
  ]
}
~~~

### neutral-control

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[]}
~~~

### repair-dropped-claimless-original

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[],"original_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[],"supported":true,"retained":true},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":[],"supported":true,"retained":false}]}
~~~

## Persistence/readback

Игровые БД и сохранения в прогоне не использовались. Опубликован exit_code 0. Все 14 finish_reason=stop; reasoning tokens 0. Локальный raw сверён с серверным, все запросы — с frozen dry-run, все parsed outputs — с provider content. Дедуплицированный пакет судьи обратимо восстановил 14 полных запросов.

## Findings

# Независимая семантическая оценка Qwen NPC fragment benchmark

Проверены все 14 полных запросов: общий system, полный request, текущий plan, original_speech там, где он передан, и полный сырой ответ модели. Дедуплицированный judge-packet.json посимвольно сверен с final-outputs.jsonl: 14/14. Ожидания из cases.json использованы только для подсчёта host, не как основание смыслового решения.

Модель во всех случаях: qwen3.8-27b-uncensored-w4a16-tp2. finish_reason во всех случаях: stop. Host: 14/14 ожидаемых решений, 8 PASS и 6 FAIL. Полный смысловой порог: 10/14 качественных ответов модели; совместно верные host и семантика: 10/14. Семантический FAIL здесь означает неполную либо неточную диагностику модели, даже если host верно отклонил plan. Форматно текущие и исходные фрагменты восстановили текст в 14/14, цитаты concerns точные, длины kind/reason допустимы. Три пустых списка claim_ids при отсутствии текущих claims допустимы.

## Случаи

### iron-hook-supported
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host PASS; semantic PASS.
- Реплика: «железо использовали для рыболовных крючков и острог.» Источник claim:population-iron-hook: «Железо использовали для рыболовных крючков и острог; готовый инструмент требовал обработки металла.» bench_iron_hook привязан к точному факту; interpretation и reason его не расширяют. «Микула» опирается на самопредставление собеседника в истории.
- dislike: []; improve: []; missing_facts: [].

### iron-hook-unsupported
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host FAIL; semantic FAIL.
- Реплика: «приманить рыбу лучше железным крючком или острогом.» Источник claim:population-iron-hook говорит только «Железо использовали для рыболовных крючков и острог». Ответ модели: «не утверждает, что это лучший способ приманить рыбу». Верно замечено отсутствие превосходства, но самостоятельно не разобрана функция приманивания крючком и острогой: факт их использования не доказывает даже эту функцию. Та же неподтверждённая посылка повторена в claims и interpretation; reason «в пределах переданных сведений» её не оправдывает.
- dislike: [«не утверждает, что это лучший способ приманить рыбу» — не разделены пригодность как приманки и сравнительное «лучше»].
- improve: [Указать обе независимые лакуны: источник удостоверяет использование железа для крючков и острог, но не их функцию приманивания и не превосходство; не добавлять механики ловли.]
- missing_facts: [свидетельство функции приманивания, свидетельство сравнительного превосходства].

### boat-context-supported
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host PASS; semantic PASS.
- Реплика: «сеть при такой ловле вытаскивают на берег или в лодку.» claim:population-boat-work: «При описанной ловле сети вытаскивали на берег или в лодку.» bench_boat_context и interpretation сохраняют эту ограниченную связь; утверждения о наличии лодки сейчас нет.
- dislike: []; improve: []; missing_facts: [].

### boat-context-unsupported
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host FAIL; semantic FAIL.
- Реплика: «на каждом берегу есть лодка, чтобы вытащить сеть.» claim:population-boat-work подтверждает только извлечение сети «на берег или в лодку»; claim:population-boat-context уточняет: «это не свидетельство судна на каждом берегу». Модель диагностировала «contradiction_with_source», хотя источник не сообщает несовместимого факта о количестве лодок; здесь отсутствие подтверждения универсального «на каждом». Цель вытащить сеть в общем контексте поддержана, наличие лодки всюду — нет. Неподтверждённый универсальный факт также повторён в claims и interpretation.
- dislike: [«contradiction_with_source» — эпистемическое ограничение источника ошибочно названо противоречием].
- improve: [Поменять диагноз на отсутствие свидетельства для «на каждом берегу есть лодка», сохранив подтверждённый общий контекст вытаскивания сети.]
- missing_facts: [точное свидетельство наличия лодки на каждом берегу].

### net-work-supported
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host PASS; semantic PASS.
- Реплика: «новгородский рыбный промысел включал работу сетями.» claim:population-net-work: «Новгородский рыбный промысел включал работу сетями». bench_net_work описывает общий промысел; личный навык Михаила не утверждается.
- dislike: []; improve: []; missing_facts: [].

### net-work-unsupported
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host FAIL; semantic PASS.
- Реплика: «я лично умею ставить любую сеть без лодки.» claim:population-net-work разрешает лишь общий контекст работы сетями и прямо говорит: «не доказательство навыка конкретного человека». Диагноз модели: «не личное умение NPC ставить любую сеть без лодки». Он охватывает личное умение, действие «ставить», универсальное «любую» и условие «без лодки»; повтор того же факта в claims/interpretation также отвергнут. Разбиение на мелкие фактические фрагменты не меняет верного полного диагноза.
- dislike: []; improve: []; missing_facts: [точное свидетельство личного навыка Михаила, охвата любой сети и работы без лодки].

### bark-float-supported
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host PASS; semantic PASS.
- Реплика: «берестяные полосы использовали для скрученных и сшитых поплавков.» claim:population-bark-float: «Берестяные полосы использовали для скрученных и сшитых поплавков». bench_bark_float и interpretation не добавляют исключительности или одинаковой формы.
- dislike: []; improve: []; missing_facts: [].

### bark-float-unsupported
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host FAIL; semantic FAIL.
- Реплика: «все поплавки делали одинаково из бересты.» claim:population-bark-float: «Берестяные полосы использовали для скрученных и сшитых поплавков; форма и соединение зависели от снасти.» Модель указала только «противоречит утверждению об их единообразии». Эта часть обоснована изменчивостью формы/соединения. Независимое «все поплавки ... из бересты» источником не подтверждено: засвидетельствовано использование бересты для части поплавков, не исключительность материала. Та же пара чрезмерных утверждений повторена в claims и interpretation.
- dislike: [«противоречит утверждению об их единообразии» — пропущена отдельная универсальность материала].
- improve: [Отдельно отметить отсутствие свидетельства для «все ... из бересты» и несовместимость одинакового изготовления с зависимостью формы/соединения от снасти.]
- missing_facts: [свидетельство исключительного использования бересты для всех поплавков; одинаковость уже расходится с переданной зависимостью от снасти].

### fish-food-supported
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host PASS; semantic PASS.
- Реплика: «в средневековом Новгороде рыба служила пищей и предметом хозяйственных отношений.» claim:population-fish-food: «Рыба засвидетельствована как пища и предмет хозяйственных отношений в средневековом Новгороде.» bench_fish_food точно соответствует источнику.
- dislike: []; improve: []; missing_facts: [].

### fish-food-unsupported
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host FAIL; semantic FAIL.
- Реплика: «рыба каждый день в изобилии идёт именно у этого берега.» Модель верно не нашла подтверждения ежедневности, изобилию и этому берегу, но заявила: «Источник подтверждает лишь то, что рыба была пищей». claim:population-fish-food на деле подтверждает «пища и предмет хозяйственных отношений». Слово «лишь» делает диагноз неверным описанием источника. Текущие наблюдения подтверждают воду и кромку берега, не улов. Неподтверждённый местный прогноз повторён в claims и interpretation.
- dislike: [«лишь то, что рыба была пищей» — потеряна прямо переданная хозяйственная роль рыбы].
- improve: [Точно назвать оба подтверждённых свойства рыбы — пища и предмет хозяйственных отношений — и отдельно отсутствие данных о ежедневном обилии у данного берега.]
- missing_facts: [свидетельство ежедневности, изобилия и точного места хода рыбы].

### repair-retained
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host PASS; semantic PASS.
- Исходная и новая речь одинаковы: «Микула, железо использовали для рыболовных крючков и острог.» claim:population-iron-hook подтверждает факт; исходный bench_iron_hook сохранён в новой речи и claims. original_fragments верно отмечают factual supported retained.
- dislike: []; improve: []; missing_facts: [].

### repair-dropped
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host FAIL; semantic PASS.
- Исходная речь содержит «железо использовали для рыболовных крючков и острог.» с bench_iron_hook; claim:population-iron-hook подтверждает её. Новая речь: «Микула, не знаю.» Модель верно дала пустые текущие claims, исходному факту supported:true/retained:false и диагноз «Факт о железных крючках и острогах из original_speech не сохранён в новой речи.» Нынешнее «не знаю» само по себе не утверждает предел прошлого знания.
- dislike: []; improve: []; missing_facts: [] — факт уже предоставлен, нарушено сохранение.

### neutral-control
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host PASS; semantic PASS.
- Новая речь: «Микула, не знаю.» В request есть вопрос «Подскажи, как у такого берега ловить рыбу без лодки и чем её лучше приманить?»; текущего фактического утверждения и original_speech нет. Пустые claims и concerns верны; private «Нейтральный отказ от ответа без фактического утверждения» соответствует речи.
- dislike: []; improve: []; missing_facts: [].

### repair-dropped-claimless-original
- model/finish: qwen3.8-27b-uncensored-w4a16-tp2 / stop. Host PASS; semantic PASS.
- Исходная речь: «железо использовали для рыболовных крючков и острог.» claim:population-iron-hook поддерживает смысл, но исходные claims: []. Новая речь: «Микула, не знаю.» Модель верно поставила исходному факту supported:true/retained:false и не предъявила concern: без исходного claim сохранение не обязательно; новый claim создавать нельзя.
- dislike: []; improve: []; missing_facts: [].

## improve_general

Проверять независимо каждую сторону составного утверждения: инструмент и его предполагаемую функцию; функцию и сравнительное превосходство; «все предметы из материала» и «все одинаковы». При диагностике не превращать «источник не доказывает» в «источник противоречит». В reason перечислять все фактически подтверждённые части источника, даже когда они не спасают текущую реплику.

## Непроверенное

Новых вызовов модели не было. Оценка относится к этим 14 фиксированным входам и ответам, не к иной выборке. Ручная семантическая оценка не утверждает историческую истинность world_knowledge за пределами переданного request. Токены работы оценщика недоступны; токены вызовов Qwen записаны в deterministic-check.json, но здесь не использованы как метрика качества.

## Result

**FAIL: host 14/14, полная семантика 10/14, совместно 10/14.** Кандидат не принят в интеграцию. Точная структура больше не падает на этой выборке, но четыре смысловых диагноза неполны либо неточны. Порог 14/14 сохранён. [Короткий архитектурный разбор](../work/audits/d49-npc-semantic-completeness-982d20e60.md) не обнаружил потери нужных фактов во входе и не обосновал очередную правку кода; рекомендована проверка более способной модели той же роли на неизменном наборе.

Расход Qwen: 125203 входных + 1901 выходных = 127104 токенов. Точная телеметрия агентов Codex недоступна. Реализация, оценка модели и Contract Auditor выполнялись разными агентами. Итоговый HEAD CI, полный аудит интеграции и живой D49 с save/reload не заменяются этим стендом.

results SHA-256: `492b625cadd2c56b6f39d96b7750c870e03ca7c4948d296432346563a0ef92f8`; dry-run SHA-256: `4f91e630004c56eb32d2311170cf1cf900cd7e82b00d2c2f4e461266731b421e`.
