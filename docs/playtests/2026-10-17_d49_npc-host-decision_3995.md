# NPC audit: вычисление решения хостом — qualification FAIL

## Identity

17 октября 2026. Кандидат `3995a19593e09d9f351bd18c04bb440590366e5a`, изолированная ветка `codex/d49-npc-audit-target`. Fleet job `20261017T100516.216876Z-1`, фактическая модель Qwen `qwen3.8-27b-uncensored-w4a16-tp2`, endpoint profile gpu3, одна карта/int8 KV/65536.

## Preconditions

Из private wire удалено дублирующее поле model pass. Хост получает semantic concerns и точные фрагменты и выводит решение из них и существующих проверок отсутствующего claim и потери подтверждённого исходного факта. Также уточнены общие инструкции о независимых частях утверждения и различии отсутствия свидетельства от противоречия. Новый owner, state, role или вызов не добавлены. Случаи, входные факты и параметры прежние: 14 случаев, восемь ожидаемых PASS и шесть FAIL; temperature 0, top_p 1, max_tokens 20000, thinking off.

Ведущий принял целый private audit protocol как одну проверяемую версию. Этот прогон не разделяет причинный вклад трёх изменений и не даёт права приписывать улучшение отдельно удалению pass. Исходный 11/14 результат предыдущего кандидата остаётся FAIL.

[Scoped Contract Auditor](../work/audits/d49-npc-host-decision-3995a1959.md): PASS_WITH_NOTES по архитектуре. 191 затронутый тест и 13 профильных тестов, syntax, architecture, docs, diff checks — PASS. Четырнадцать production fake-fetch captures и server dry-run совпали с frozen wire. Две свежие облачные пробы gpt-6-sol medium прошли production replay и независимую оценку gpt-6-sol high, 2/2. Судья явно исправил собственное ошибочное толкование «no redundant pass» как запрета повторных истинных concerns; исходный вердикт сохранён, ответы модели и критерии не менялись. Пользователь разрешил Codex вместо Sonnet. Единственный waiver C8 #745 касается склейки двух валидных JSON user messages проверяющим инструментом, не семантики.

## Gameplay transcript

Один последовательный стендовый прогон, без retries. Это private auditor, не игровые ходы. Ниже точные окончательные ответы модели; private reasoning исключено из пакета судьи и отчёта.

### iron-hook-supported

~~~json
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
 "concerns": []
}
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
      "text": "железным крючком ",
      "factual": true,
      "claim_ids": [
        "bench_iron_hook"
      ]
    },
    {
      "text": "или ",
      "factual": false,
      "claim_ids": []
    },
    {
      "text": "острогог.",
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
      "kind": "unsupported_fact",
      "reason": "Источник (claim:population-boat-work) указывает, что лодка — допустимый контекст, но прямо оговаривает, что это не свидетельство судна на каждом берегу. Утверждение «на каждом берегу» противоречит этому ограничению.",
      "quote": "на каждом берегу есть лодка, чтобы вытащить сеть."
    }
  ]
}
~~~

### net-work-supported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"новгородский рыбный промысел включал работу сетями.","factual":true,"claim_ids":["bench_net_work"]}],"concerns":[]}
~~~

### net-work-unsupported

~~~json
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
      "reason": "Утверждение о личном навыке ставить любую сеть без лодки не подтверждено ни памятью, ни текущими наблюдениями, ни world_knowledge (которое описывает общие практики, а не навыки конкретного NPC).",
      "quote": "я лично умею ставить любую сеть без лодки."
    }
  ]
}
~~~

### bark-float-supported

~~~json
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
  "concerns": []
}
~~~

### bark-float-unsupported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"все поплавки делали одинаково из бересты.","factual":true,"claim_ids":["bench_bark_float"]}],"concerns":[{"kind":"unsupported_fact","reason":"World knowledge указывает, что форма и соединение поплавков зависели от снасти, что противоречит утверждению об одинаковом изготовлении.","quote":"все поплавки делали одинаково из бересты."}]}
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
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"рыба каждый день в изобилии идёт именно у этого берега.","factual":true,"claim_ids":["bench_fish_food"]}],"concerns":[{"kind":"unsupported_fact","reason":"World knowledge подтверждает рыбу как пищу, но не утверждает ежедневное изобилие именно у данного берега.","quote":"рыба каждый день в изобилии идёт именно у этого берега."}]}
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
      "kind": "lost_confirmed_fact",
      "reason": "Факт о применении железа для крючков и острог подтверждён world_knowledge и имел claim в original_speech, но отсутствует в новой речи.",
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

Игровые БД, сохранения и службы моделей не менялись. Опубликованный результат: exit_code 0, 37.181 с. Время отдельных вызовов runner не записал. Все 14 finish_reason=stop. Скачанный results.jsonl сверён с серверным; каждый фактический запрос совпал с frozen wire, parsed output — с окончательным provider content. Lossless judge packet проверен обратным восстановлением всех запросов по JSON-значениям.

## Findings

# Независимый вердикт: Qwen, 14 случаев NPC grounding

Пакет: `judge-packet.json`, точный `final_content` по каждому случаю; private chain отсутствует и не читалась. Рубрика: `d49-npc-host-decision-bench/RUBRIC.md`. Модель: `qwen3.8-27b-uncensored-w4a16-tp2`; job `20261017T100516.216876Z-1`; frozen input `3995a1959`. Плановые исходники и `runtime_text` сверены по пакету. Никаких ответов не переписано, структурный INVALID не пересчитан как FAIL.

## Итог

- Ожидание: 8 PASS, 6 FAIL. Host: 13/14 exact match — 8 PASS, 5 FAIL, 1 INVALID. Все 14 вызовов имеют raw response, JSON разбирается, `finish_reason=stop`.
- Полная смысловая оценка по frozen FULL rubric: 12/14. `boat-context-unsupported` ошибочно трактует отсутствие свидетельства как противоречие; `bark-float-unsupported` диагностирует лишь «одинаково» и пропускает самостоятельное «все из бересты». `iron-hook-unsupported` смысловой дефект верно найден, но структура ответа невалидна. Одновременно все ворота (host + полный смысл): 11/14. Критерий 14/14 не достигнут.
- Токены провайдера из `deterministic-check.json`: prompt 123607, completion 1953, total 125560; reasoning field length 0 для всех. Это usage модели, не затраты этого аудитора.
- Границы проверки: речь, claims и разрешённые source refs, private interpretation/reason, original_speech и сохранение её фактов, точность фрагментов/цитат, виды ошибок. `reason` и `interpretation.grounded_contribution` в неподдержанных планах повторяют тот же неподдержанный тезис или заявляют «в пределах переданных сведений»; один concern по сути тезиса достаточен, но повторение не служит отдельным свидетельством.

## По случаям

1. **iron-hook-supported — PASS / host PASS / смысл верен.** «железо использовали для рыболовных крючков и острог» точно подтверждено `claim:population-iron-hook`; `bench_iron_hook` привязан, ref разрешён. Обращение «Микула» подтверждено текущим сообщением/историей. Точные полные фрагменты; частные поля новых фактов не добавляют.
2. **iron-hook-unsupported — FAIL / host INVALID / смысл отказа верен.** «приманить рыбу лучше» не следует из использования железа для крючков и острог: функция приманивания и сравнительное «лучше» не засвидетельствованы. Concern верный, цитата точная. Но fragment `острогог.` не совпадает с исходным `острогом.`: вся utterance не покрыта точно, потому host `TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID`. Смысловая удача не засчитывается как host FAIL.
3. **boat-context-supported — PASS / host PASS / смысл верен.** «сеть при такой ловле вытаскивают на берег или в лодку» прямо сказано в `claim:population-boat-work`; `bench_boat_context` и разрешённый ref корректны. Наличие лодки сейчас не утверждается.
4. **boat-context-unsupported — FAIL / host FAIL / диагноз семантически неверен.** «на каждом берегу есть лодка» не подтверждено: `claim:population-boat-work` допускает лодку как контекст и отдельно задаёт найм/право; `claim:population-boat-context` сообщает «это не свидетельство судна на каждом берегу». Но concern пишет «противоречит этому ограничению». Формулировка источника об отсутствии свидетельства не является точным несовместимым фактом о мире. Должно быть `unsupported_fact` с причиной «нет свидетельства наличия лодки на каждом берегу», без заявления противоречия. Кроме того, пояснение о каждом берегу принадлежит `claim:population-boat-context`, а не названному в reason `claim:population-boat-work`. Цитата/фрагменты корректны; направление FAIL верно, full semantic нет.
5. **net-work-supported — PASS / host PASS / смысл верен.** «новгородский рыбный промысел включал работу сетями» прямо подтверждено `claim:population-net-work`. Нет переноса общего факта на личный навык.
6. **net-work-unsupported — FAIL / host FAIL / смысл верен.** «я лично умею ставить любую сеть без лодки» — личный навык и универсальность, которых нет в `memory.records` или иных точных фактах; профессиональный контекст `claim:population-net-work` их не доказывает. Диагноз указывает отсутствие свидетельства, не противоречие.
7. **bark-float-supported — PASS / host PASS / смысл верен.** «берестяные полосы использовали для скрученных и сшитых поплавков» прямо подтверждено `claim:population-bark-float`; `bench_bark_float`/ref корректны.
8. **bark-float-unsupported — FAIL / host FAIL / full semantic не пройден.** «все поплавки делали одинаково из бересты» содержит два независимых аспекта. `claim:population-bark-float` говорит лишь об использовании берестяных полос для поплавков, а не обо всех поплавках; форма и соединение зависели от снасти, что несовместимо с «одинаково». Concern диагностирует только второй аспект. Frozen rubric требует проверить каждый независимый аспект; system message требует после первого нарушения проверить остальные стороны составного утверждения. Второй объект concern не обязателен, но reason должен охватить обе стороны. Направление FAIL верное, полная диагностика нет.
9. **fish-food-supported — PASS / host PASS / смысл верен.** «в средневековом Новгороде рыба служила пищей и предметом хозяйственных отношений» прямо подтверждено `claim:population-fish-food`; ref разрешён.
10. **fish-food-unsupported — FAIL / host FAIL / смысл верен.** «рыба каждый день в изобилии идёт именно у этого берега» добавляет время, количество и конкретное место, которых `claim:population-fish-food` не подтверждает. Диагноз верно говорит об отсутствии свидетельства; текущее наблюдение берега этого не меняет.
11. **repair-retained — PASS / host PASS / смысл верен.** Исходный подтверждённый факт «железо использовали для рыболовных крючков и острог» с `bench_iron_hook` сохранён в новой речи дословно, claim и ref сохранены. `original_fragments` отмечают supported=true/retained=true корректно.
12. **repair-dropped — FAIL / host FAIL / смысл верен.** Исходный подтверждённый факт с `bench_iron_hook` исчез; новая «не знаю» не содержит факта и не требует claim. `lost_confirmed_fact` с пустой quote допустим для отсутствующего фрагмента; original supported=true/retained=false верно.
13. **neutral-control — PASS / host PASS / смысл верен.** «не знаю» — текущая неуверенность без утверждения о прошлой памяти; `claims:[]` допустимы. Обращение не создаёт новых отношений.
14. **repair-dropped-claimless-original — PASS / host PASS / смысл верен.** Исходное применение железа фактически подтверждено `runtime_text`, но в original_speech нет исходного claim. По рубрике его можно опустить, новый claim создавать нельзя. `supported=true`, `retained=false`, `claim_ids:[]` корректны; concern не нужен.

Во всех остальных 13 случаях текущие фрагменты в исходном порядке конкатенируются в точный `utterance_text`; исходные фрагменты во всех трёх repair случаях также покрывают текст точно. Все непустые concern.quote — точные подстроки текущей речи. `kind`/`reason` укладываются в ограничения длины. Нет ложного вывода о прошлой памяти или нынешнем имуществе NPC.

## Замечания для улучшения

**dislike**
1. `iron-hook-unsupported`: `"острогог."` — несуществующая подстрока, разрушает весь структурный ответ.
2. `boat-context-unsupported`: `"Утверждение «на каждом берегу» противоречит этому ограничению."` — отсутствие свидетельства названо противоречием; source ref приписан неточно.
3. `bark-float-unsupported`: `"форма и соединение поплавков зависели от снасти"` — верно разбирает «одинаково», но не проверяет отдельное «все ... из бересты».

**improve**
1. В `iron-hook-unsupported` заменить последний фрагмент на точное `"острогом."`, сохранить concern об отсутствии основания для приманивания и сравнительного «лучше».
2. В `boat-context-unsupported` сохранить FAIL и цитату, но reason сформулировать как отсутствие свидетельства лодки на каждом берегу, опираясь на переданные `claim:population-boat-work` и `claim:population-boat-context` без ложной атрибуции или «противоречит».
3. В `bark-float-unsupported` сохранить FAIL; в одном reason назвать оба аспекта: форма/соединение зависели от снасти, а данных, что все поплавки были из бересты, нет.

**missing_facts:** Для PASS случаев недостающих фактов нет. Для FAIL случаев именно недостающие свидетельства о приманивании/«лучше», лодке на каждом берегу, личном умении, всех поплавках из бересты и их одинаковом изготовлении, ежедневном изобилии у этого берега; пакет их не предоставляет и достраивать их нельзя. В `bark-float-unsupported` отдельно есть точное несовместимое указание о зависимости формы и соединения от снасти.

**improve_general:** Следить за буквальной реконструкцией фрагментов перед выдачей JSON и различать «источник не доказывает X» от «источник доказывает не-X». В составном утверждении диагностировать каждый самостоятельный аспект. Содержательные правила и условия теста не менять.

## Result

**FAIL: production 13/14; полная семантика 12/14; совместно 11/14.** В iron-hook-unsupported модель написала «острогог.» вместо исходного «острогом.»: точная проверка фрагментов отклонила ответ. В boat-context-unsupported отсутствие свидетельства всё ещё ошибочно названо противоречием. В bark-float-unsupported диагноз пропустил независимую неподтверждённую всеобщность материала. Судья первоначально применил к этому случаю минимальное требование public contract вместо заранее замороженного полного критерия; после сверки рубрики явно исправил оценку. Первоначальный отчёт сохранён как judge-original.md рядом с результатами, ответы модели не менялись. Проверки не ослаблены; кандидат не принят в интеграцию. Следующий шаг по форме ответа требует отдельного архитектурного разбора; две неполадки смысла остаются отдельными незакрытыми дефектами того же owner.

Расход Qwen: 123607 входных + 1953 выходных = 125560 токенов. Reasoning tokens: 0. Точная телеметрия Codex недоступна. Автор реализации, авторы облачных проб и независимые аудиторы — разные агенты. Full npm test на итоговом HEAD, полный финальный аудит и живой D49 с сохранением/загрузкой ещё обязательны.

- results SHA-256: 1632f3ecee17b3a866f43f388c86aa7c37c94e8ca0e4a8a651ccd7ab502c62a8
- dry-run SHA-256: b4a26415b5aa17b62f6c8bbb9b38c2d984c7baf6936d05437a3854b7e8d9d031
- RUN-SHA256: f1c74bfecab96af88d4e4ab0ec3ee614de00806de65e1e8417e10f686ab79cda
- CATALOG-SHA256: fd324b67a7b8cfa671d2b99640cab4c8ba3c6039db91e107cd0c682dccefed98
- WIRE-REVIEW-SHA256: f9ae926e3963067d4ea4d02b0af20f82b6a51e701b5235a658b0e89060d9dfb8
