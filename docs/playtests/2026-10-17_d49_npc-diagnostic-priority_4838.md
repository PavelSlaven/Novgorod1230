# NPC audit: порядок диагностических инструкций — qualification FAIL

## Identity

17 октября 2026. Production-кандидат 4838818dfa13aa9ef0922a37a84b3a0f39ee2ae3; test-only follow-up 3caadc2c751128801a3437c4e8752d6be7147f6d. Изолированная ветка codex/d49-npc-audit-target. Fleet job 20261017T093251.975900Z-1, модель ответа qwen3.8-27b-uncensored-w4a16-tp2, endpoint gpu3, одна карта/int8 KV/65536.

## Preconditions

Неизменённый блок concern format, quote, reason и различения отсутствия подтверждения от противоречия перенесён в конец существующего prompt. Ни слова этого блока не добавлено и не удалено. Остальные инструкции, все 14 входных случаев, две user messages, модель, thinking off, temperature 0, top_p 1, max_tokens 20000 и validator сохранены. Новый владелец, вызов, retry или сохраняемое состояние не появились.

Две свежие облачные пробы выполнены отдельным gpt-6-sol medium, структурно воспроизведены через настоящий auditFreshNpcSpeech: 2/2. Первоначальный независимый судья gpt-6-sol high отверг второй ответ из-за отсутствия повторной диагностики той же мысли в private-полях. Независимый разбор и scoped Contract Auditor подтвердили, что §37.2 не требует такой дублирующей причины. Исходный FAIL сохранён рядом с разбором; он не переписан в PASS. Временный ведущий принял только ограниченный input preflight. Это разрешённая пользователем замена Sonnet на Codex, не утверждение о качестве всех 14 Qwen-случаев. Точная runtime telemetry Codex недоступна.

Scoped Contract Auditor — PASS_WITH_NOTES, [дословный отчёт](../work/audits/d49-npc-priority-3caadc2c7.md). Обязательный порог 14/14 структуры, решений и полной семантики не менялся. Единственное исключение C8 #745 касается ошибочной склейки двух валидных JSON user messages проверяющим инструментом и привязано к dry-run SHA. Семантических исключений нет.

## Gameplay transcript

Это стенд private NPC-аудитора, не игровой ход. Выполнен один последовательный прогон 14 случаев, без retries. Каждый фактический wire сверён с frozen dry-run, parsed output — с окончательным provider content. Ниже дословные окончательные ответы; private reasoning не передавалось судье и не публикуется.

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
  "concerns": [],
  "pass": true
}
~~~

### iron-hook-unsupported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"приманить рыбу лучше ","factual":true,"claim_ids":["bench_iron_hook"]},{"text":"железным крючком ","factual":true,"claim_ids":["bench_iron_hook"]},{"text":"или ","factual":false,"claim_ids":[]},{"text":"острогом.","factual":true,"claim_ids":["bench_iron_hook"]}],"concerns":[{"kind":"grounding_mismatch","reason":"World knowledge подтверждает использование железа для крючков и острог, но не утверждает, что это лучший способ приманить рыбу.","quote":"приманить рыбу лучше "}],"pass":false}
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
  "concerns": [],
  "pass": true
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
      "kind": "grounding_contradiction",
      "reason": "World knowledge прямо указывает, что упоминание лодки не является свидетельством судна на каждом берегу, что противоречит утверждению в речи.",
      "quote": "на каждом берегу есть лодка, чтобы вытащить сеть."
    }
  ],
  "pass": false
}
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
  "concerns": [],
  "pass": true
}
~~~

### net-work-unsupported

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"я лично умею ","factual":true,"claim_ids":["bench_net_work"]},{"text":"ставить ","factual":true,"claim_ids":["bench_net_work"]},{"text":"любую ","factual":true,"claim_ids":["bench_net_work"]},{"text":"сеть ","factual":true,"claim_ids":["bench_net_work"]},{"text":"без ","factual":true,"claim_ids":["bench_net_work"]},{"text":"лодки.","factual":true,"claim_ids":["bench_net_work"]}],"concerns":[{"kind":"grounding","reason":"Нет точного свидетельства в request, что NPC лично умеет ставить любую сеть без лодки; world_knowledge подтверждает лишь общий контекст работы сетями.","quote":"я лично умею ставить любую сеть без лодки."}],"pass":false}
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
  "concerns": [],
  "pass": true
}
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
      "kind": "grounding_mismatch",
      "reason": "Утверждение о том, что все поплавки делали одинаково, противоречит источнику, который указывает, что форма и соединение зависели от снасти.",
      "quote": "все поплавки делали одинаково из бересты."
    }
  ],
  "pass": false
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
  "concerns": [],
  "pass": true
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
      "kind": "grounding",
      "reason": "World knowledge подтверждает рыбу как пищу, но не утверждает ежедневное изобилие именно у данного берега.",
      "quote": "рыба каждый день в изобилии идёт именно у этого берега."
    }
  ],
  "pass": false
}
~~~

### repair-retained

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
  ],
  "concerns": [],
  "pass": true
}
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
~~~

### neutral-control

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[],"pass":true}
~~~

### repair-dropped-claimless-original

~~~json
{"utterance_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[]},{"text":"не знаю.","factual":false,"claim_ids":[]}],"concerns":[],"pass":true,"original_fragments":[{"text":"Микула, ","factual":false,"claim_ids":[],"supported":true,"retained":true},{"text":"железо использовали для рыболовных крючков и острог.","factual":true,"claim_ids":[],"supported":true,"retained":false}]}
~~~

## Persistence/readback

Игровые БД и сохранения этот стенд не использовал. Службы моделей не менялись. Процесс завершился с exit_code 0 за 37.932 секунды. Оконченные ответы сначала прочитаны из staging; после штатной публикации SHA официального results.jsonl совпал с локальной копией. Повторного запуска или вмешательства в публикацию не было. Per-call timing этот runner не записывал.

## Findings

Production auditFreshNpcSpeech на сохранённых ответах вернул все 14 ожидаемых решений в валидном формате. Все finish_reason=stop. Независимая полная оценка:

# Blind semantic review: 14 NPC private-audit responses

Candidate HEAD: 3caadc2c751128801a3437c4e8752d6be7147f6d. Job: 20261017T093251.975900Z-1; runner exit 0, aggregate duration 37.932 s. Per-call timings were not recorded. Actual wire model: qwen3.8-27b-uncensored-w4a16-tp2; finish_reason=stop in all 14 rows. Reviewed lossless semantic-review.json (common request plus each request_specific, full target and final output), checked final-outputs.jsonl metadata without reading private reasoning/raw_response. Governing source: ACTIVE npc_conversation_mode_contract.md §37.2; index marks it ACTIVE. RUBRIC.md and predeclared cases.json read before judgement. No new model call.

Counts: production acceptance labels match fixture expectation 14/14. Model's own pass bit matches semantic accept/reject 13/14: repair-dropped says pass:true, whereas original supported claim was dropped. Full semantic qualification including truthful and complete diagnosis is 11/14. Joint production decision plus full semantic qualification is 11/14. Three failing rows: boat-context-unsupported, bark-float-unsupported, repair-dropped. This does not meet 14/14 quality threshold. Positive controls, unsupported relation detection in other rows, and claimless-original exception behave as intended.

Deterministic checks over all 14 parsed outputs: current and original fragment text concatenate to exact utterances in every applicable row; all nonempty concern quotes are exact current-utterance substrings; longest concern reason is 150 characters (limit 240); no model output contains an absent-original original_fragments field. This validates syntax and exactness, not semantic truth.

## Per-case verdicts

1. **iron-hook-supported — PASS.** Source claim: «Железо использовали для рыболовных крючков и острог». Current speech, claim summary, grounded_contribution and ref say precisely this; «Микула» is an address, not a factual claim. Model marks the factual clause with bench_iron_hook, pass:true and no concern. Dislike: none. Improve: none. Missing facts for this proposition: none.

2. **iron-hook-unsupported — PASS as rejection.** Current speech and summary say «приманить рыбу лучше железным крючком или острогом». Source establishes tool manufacture/use, not lure function or comparative superiority. Model pass:false; quote «приманить рыбу лучше » is exact and reason identifies unsupported lure superiority. The same unsupported assertion in grounded_contribution needs no duplicate concern. Dislike: no substantive defect; word-level factual fragments are unnecessarily fine-grained. Improve: keep one factual phrase for the lure relation and diagnose it once. Missing facts: effectiveness as lure, comparison with alternatives.

3. **boat-context-supported — PASS.** Source explicitly allows drawing a net «на берег или в лодку» for the described fishing. Speech, claim and interpretation keep that limited context, without asserting that a boat is available here. Correct pass:true, exact factual fragment, no concern. Dislike: none. Improve: none. Missing facts for this proposition: none.

4. **boat-context-unsupported — FAIL full qualification; rejection itself correct.** Speech/claim/interpretation assert «на каждом берегу есть лодка». Source says a boat is one possible net-drawing context and expressly says this does not evidence a vessel at each shore. That is *absence of support* for universal availability; it does not establish a counterexample or incompatible fact. Model reason falsely says «что противоречит утверждению в речи» and kind is grounding_contradiction. Exact quote and pass:false are correct, diagnosis is not. Dislike: «противоречит» without a supplied incompatible fact. Improve: state that the source does not establish a boat at every shore; keep pass:false. Missing facts: availability of a boat at each shore and at the present shore.

5. **net-work-supported — PASS.** World Knowledge states Novgorodian fishing included net work. Speech says exactly that at population/trade level. It does not turn the source into this NPC's skill. Correct pass:true and factual claim mapping. Dislike: none. Improve: none. Missing facts for this proposition: none.

6. **net-work-unsupported — PASS as rejection.** «я лично умею ставить любую сеть без лодки» adds personal skill, universal gear scope and boat independence to a population-level trade source. No memory or actor skill fact supplies those. Model pass:false with exact full-speech quote and reason explicitly distinguishes general context from personal ability. Repetition in grounded_contribution is the same defect. Dislike: no substantive defect; many one-word factual fragments reduce diagnostic clarity. Improve: one or two factual clauses around the unsupported personal-skill relation. Missing facts: this NPC's net-setting ability, every net type, no-boat performance.

7. **bark-float-supported — PASS.** «берестяные полосы использовали для скрученных и сшитых поплавков» matches the source; no exclusivity or uniform shape is asserted. Correct pass:true, claim mapping and no concern. Dislike: none. Improve: none. Missing facts for this proposition: none.

8. **bark-float-unsupported — FAIL full qualification; rejection itself correct.** «все поплавки делали одинаково из бересты» contains two strengthened assertions: every float used birch bark, and all were made in one manner. Source attests some bark floats and states shape/joining varied with tackle, contradicting uniform manufacture. Model pass:false catches uniformity but reason only mentions «все поплавки делали одинаково»; it omits unsupported exclusivity of material. Its generic kind grounding_mismatch also does not signal the contradiction expressed in the reason. Dislike: incomplete diagnosis for «все поплавки ... из бересты». Improve: in the same concise concern, distinguish material exclusivity (unsupported) from identical form/joining (contradicted by source); no second duplicate concern is needed. Missing facts: any evidence that all floats used birch bark.

9. **fish-food-supported — PASS.** Historical fish as food and object of economic relations is exact source meaning. Speech/claim/interpretation retain that scope. Correct pass:true and factual fragment. Dislike: none. Improve: none. Missing facts for this proposition: none.

10. **fish-food-unsupported — PASS as rejection.** «рыба каждый день в изобилии идёт именно у этого берега» changes a historical food/economy fact into daily local abundance. No such observation or record is supplied. Model pass:false and exact quote; reason names both daily abundance and this shore. It does not falsely assert contradiction. Dislike: none. Improve: none. Missing facts: repeated catch or fish-flow observations at this shore, abundance measure, daily continuity.

11. **repair-retained — PASS.** Original and current utterances and claims are identical; iron hook/spear fact is source-supported and retained with the same original claim. Both fragment arrays mark that fact supported/retained and current pass:true. Dislike: none. Improve: none. Missing facts: none.

12. **repair-dropped — FAIL full qualification and model semantic decision.** Original speech contains the supported, claimed iron hook/spear fact; current «Микула, не знаю.» drops it, and new claims are empty. Model's own original_fragments correctly mark the factual original supported:true, retained:false, yet it returns pass:true and concerns:[]—internally inconsistent and contrary to §37.2. Production labels this FAIL, but that structural rejection does not supply the required semantic concern from the model. Dislike: supported:true plus retained:false beside pass:true and no concern. Improve: pass:false and one retention concern with quote:"" identifying the omitted supported original fact/claim bench_iron_hook. Missing facts: none; the required fact is already supplied.

13. **neutral-control — PASS.** Same neutral «не знаю» plan as case 12, but no original_speech to preserve. It makes no objective or categorical memory claim. pass:true, claims:[], no original_fragments and no concerns are correct. Dislike: none. Improve: none. Missing facts: none for neutral refusal.

14. **repair-dropped-claimless-original — PASS.** Original text contains the historical iron fact and source supports it; model marks supported:true, retained:false. Original speech has no claim, so §37.2 explicitly permits omission; repair cannot create a new claim. Current neutral response needs no claim. pass:true is correct. Dislike: none. Improve: none. Missing facts: none; the source fact is available, but the original claim is absent by fixture design.

Private interpretation and reason were checked in every plan. They repeat the same sourced/unsourced proposition or describe conversational purpose; no separate private-only unsupported fact appears in these 14 inputs. Thus no private-only defect can be claimed from this set. No concern should be duplicated merely because the same proposition appears in speech, claim summary and grounded_contribution.

## Improve general

1. Derive pass from the factual original fragments after evaluating retained: supported factual fragment with an original claim and retained:false must force pass:false and a concise empty-quote concern.
2. Distinguish “source lacks evidence” from “source supplies an incompatible fact” in both kind and reason. A source saying “this is not evidence for every shore” does not prove absence at every shore.
3. For compound claims, check each independent quantifier/function/material/condition. One concern may cover several facets of one sentence, but it must name all independent unsupported or contradicted facets.
4. Keep fragment boundaries around meaningful clauses where practical; the server's exact-text reconstruction is already satisfied, while isolated words obscure the relation being checked.

## Result

**FAIL квалификации: production 14/14, исходная независимая семантическая оценка 11/14.** Кандидат не принят в интеграцию. Замечания по лодке, составному утверждению о поплавках и согласованию model pass с original_fragments сохранены; последнее отдельно проверяется на соответствие границе между семантическим решением модели и вычисляемым решением host. До этого разбора результат не повышается. D49 остаётся не принят.

Фактический расход Qwen: 123649 prompt + 2115 completion = 125764 токенов. Непустых private reasoning fields: 0; null-поля считаются пустыми. Точная телеметрия Codex/разведчиков недоступна. Эскалации: независимый Contract Auditor и отдельный semantic judge; после реализации исправлено только ожидание порядка в существующем тесте, все прежние проверяемые фразы сохранены.

Проверки: 13/13 профильных тестов; syntax (2404 файла), architecture, docs, git diff --check; 14 production fake-fetch capture, локальный и серверный provider-builder dry-run, catalog validator и fleet preflight. После реального прогона — exact wire/output equality и replay настоящего auditFreshNpcSpeech для всех 14 сохранённых ответов. Full npm test на итоговом интегрированном HEAD и живой D49 с сохранением/загрузкой ещё обязательны.

- results.jsonl SHA-256: bac571bfccc640255e26a58c3cf813c8e949d6d2b77189e3216fbc0e56d449ea
- dry-run SHA-256: 9b7c9423445bc0b534db33f1d8420d37756fdb7db584e71d536fcb3f5908c70f
- RUN-SHA256: 1222b038a424af96d8c033a66b500321441ec9266c13136d02c4e452256e412f
- CATALOG-SHA256: 0ee24f2967c59bf09f1f615c2535b905894f48c59bf0d93b5ef924476410f2bf
- WIRE-REVIEW-SHA256: 313c0766185c894cddb021a9c1e103b6c07a933429fa254e0e5c0a3d4d3cd0de

## Последующий разбор границы model/host

Отдельный gpt-6-sol high проверил два спорных аспекта без нового модельного прогона. Исходная оценка 11/14 не пересчитана: внутренне противоречивый model pass нарушает текущую зафиксированную инструкцию; достоверный, но частичный диагноз не повышен постфактум до полной квалификации. При этом публичное сохранение факта в случае 12 уже защищено кодом. Для будущего кандидата предложено убрать дублирующий модельный pass и оставить итоговый допуск одному существующему host owner. Этот внутренний wire потребует новых тестов, независимого Contract Auditor и свежих модельных ответов; старые ответы его не квалифицируют.

# D49 NPC retention and diagnosis adjudication

Scope: read-only design adjudication for candidate `3caadc2c751128801a3437c4e8752d6be7147f6d` (`codex/d49-npc-audit-target`). This is not final Contract Auditor and does not certify D49 quality or integration. No model call or test run. Inputs: `C:/Users/Slaven/AppData/Local/Temp/d49-npc-priority-qwen-result/semantic-review.json`, `judge.md`, `lead-review.md`, `cases.json`, source at that HEAD. The two named recovery audits under `docs/work/audits/` are absent from this checkout and `HEAD` tree, so no conclusion depends on them.

## Case 12: repair-dropped

**Frozen gate: FAIL stays FAIL.** The model output has `original_fragments` marking the originally claimed iron-hook/spear fact `factual:true, supported:true, retained:false`, while the current utterance is neutral, `claims:[]`. This is the correct semantic classification of the lost fact. Yet the same output says `pass:true, concerns:[]`: it violates the *current prompt/wire instruction* to decide pass from supported-fact retention and report a concern (`lower-dvina-trace-npc-speech-grounding-audit.js:70-117`). The judge is justified in calling the model output internally inconsistent under this frozen role interface and predeclared 14/14 model-quality gate. Do not recast the existing run as 14/14 or lower its threshold. The boat false-contradiction failure remains independently real.

**Active public behavior succeeds for this case.** `npc_conversation_mode_contract.md:1921` requires repair to preserve supported original facts with original claims and to end in typed failure on repeated audit failure. It does not specify a model-authored `pass` bit. The existing host derives `supported_original_fact_dropped` from the model's semantic fragment flags plus exact claim-ID membership (`lower-dvina-trace-npc-speech-grounding-audit.js:146-163`), supplies a brief reason with empty quote as §37.2 requires for a missing retained fact (`:157-159, :166-175`), and returns FAIL despite `pass:true`. The repair caller passes original speech and initial feedback to the repeated audit (`lower-dvina-trace-conversation-llm.js:247-255, :280-305`); the model's divergent bit cannot admit the plan. This is a prompt/wire-quality failure, not an observed public retention failure. Semantic support and retention flags remain model-owned; exact claim-set comparison and final admission remain code-owned, consistent with Product Constitution §6–7 and Architecture Invariants §28.5.

**Smallest general correction for a *future* candidate:** remove the redundant model `pass` field and its consistency instruction from the private auditor wire; keep model-authored semantic fragments and concerns, and compute final pass once in the existing `auditFreshNpcSpeech` from semantic concerns plus its already present `missing`/`dropped` checks. Generate the missing-claim and dropped-supported-fact diagnostics there, as the current code already does. Do not add a role, classifier, retry, storage, or case-specific rule. Tests and a fresh predeclared model run would be required; this output cannot validate the revised wire. No §37.2 edit is needed for that internal-shape change: it already assigns fragment semantics to the auditor and exact coverage/claim validation to code, without mandating a separate model pass bit. A scoped Contract Auditor is still required for the prompt/LLM boundary change. If diagnostic provenance itself is to become a different public rule, change §37.2 explicitly first.

## Case 8: bark-float-unsupported

The claim has two independent facets: all floats use birch bark (not established by attested bark-float use), and all are made alike (incompatible with the source saying form and joining depend on tackle). `semantic-review.json` case 8 contains the full clause as an exact quote, `pass:false`, and a truthful reason for the second facet. The model does not name the universal-material facet. This is a *partial explanation*, not a false explanation or a missed rejection. By contrast, repeating the same unsupported proposition in speech, claim summary and `grounded_contribution` does not create three independent concerns.

The active §37.2 requires concrete `concern_kinds`, a brief diagnostic reason and exact current-utterance quote; it does not require an exhaustive clause-by-clause list of every defect. The prompt asks the auditor to inspect all factual assertions and list violations (`lower-dvina-trace-npc-speech-grounding-audit.js:13-18, :62-65, :80-117`), so the omitted facet is a model-instruction quality weakness. The actual repair prompt expressly says to fix unsupported assertions across the *whole original speech even when concern kinds name only part of the problem* (`lower-dvina-trace-phase-2-npc-conversation-prompts.js:132-151`); the caller passes original speech and diagnostic pointers (`lower-dvina-trace-conversation-llm.js:169-184`). The single valid diagnosis points to the entire compound clause and is sufficient to invoke and guide that repair. If the predeclared model gate explicitly requires complete independent-facet diagnosis, keep this row FAIL under that stricter gate; do not silently re-score it. That completeness requirement is above the active public semantic contract and the repair consumer's minimum. No contract edit is needed to keep one truthful, concrete concern per compound claim; an explicit new completeness obligation would need a prospective criterion/contract change and fresh evaluation.

## Evidence and limits

Index `CONTRACT_INDEX.md:102-105, :179-181` marks conversation and related NPC contracts ACTIVE. Graph Verify found `auditFreshNpcSpeech` and `createLowerDvinaTraceNpcSemanticModel`; depth-1 trace found the latter as direct caller. Graph generation `2026-10-16T05:26:03Z` is stale for candidate HEAD: coverage reports `metadata_changed` for all cited source/norm files and graph snippet showed old auditor code. All decisive line claims above come from direct checkout source, not stale graph. No repo files changed; source checkout was clean. The frozen full-Qwen run remains below 14/14 semantic qualification regardless of this design adjudication.
