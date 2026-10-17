# D49: Codex preflight on actual opening and LOOK inputs

## Identity

2026-10-18. Source candidate `75eebb20ae4adf4bde177d8ef1ef9b135912961f`; LOOK control `adf805b75751ab95f85284cbd55f294552c2f3cf`. Scenario seed: `issue-566-fisher-seed-000091`. This is one bounded surrogate-model campaign, not a live gameplay run. Production input capture is recorded in [the #749 report](2026-10-18_d49_75eebb20_actual91-observation-capture.md).

## Preconditions

Root approved a written plan before generation. The user authorized Codex in place of Sonnet. Exactly one fresh independent agent per case, configured `gpt-6-sol`, reasoning `medium`; no retry, rewriting or self-scoring. Three independent blind reviewers received complete system/user inputs, verbatim outputs, the established D158/D49 rubrics and the Opus style anchor. They did not see the source mapping or one another's reports. Opus is a style reference, never a source of world facts.

The captured request targets Qwen TP2, temperature 0, top_p 1, thinking disabled, max_tokens 20000. A coding-agent surrogate does not reproduce those API/sampling controls. No Qwen/API call or production model activation occurred in this campaign. This is not full D158 calibration: no new unusual/adversarial cases or historical A0/E anchor group were generated. Findings cannot qualify production Qwen or establish stable game quality.

The controlled LOOK pair differs only in required propositions (18 to 2). System instructions, parameters and full scene support match. Opening is a separate candidate gate. Input retains the hero's confirmed action, visible person inspecting the held net, appearance/equipment, place, vegetation, ground, weather and daylight. All 16 current sensory facts remain available to the writer. Previously seen background no longer has to be recited as a new outcome. The old repair request was not captured; no old/new repair-wire equivalence is claimed.

## Gameplay transcript

These are unedited surrogate responses to actual production-composed requests, not texts shown by the live game after its production auditor. No new player turns were submitted in this campaign.

### A: current opening

Request SHA-256: `b90cc98ce2217d75fb7fca9fc22ba4a08c7461998f125b2782e8cb3367ea800c`. Output SHA-256: `9f5cc44c7494ecf27a841adbe04a304e5ddfaccbb5f809aa8b91b79596bb40a0`.

Literary scores: 6, 5, 5; mean 5.33/10. Required coverage: all three reviewers PASS. Protocol feel: all three reviewers **partly**.

```text
На хозяйственном дворе Микула, лесной промысловик, чувствовал себя готовым к работе: ран на нём не было, сил хватало, и сильный голод не тревожил. На нём были нижняя рубаха и штаны, под ногами — низкая кожаная обувь. Облачное летнее небо давало ровный дневной свет; ветра почти не чувствовалось.

Двор лежал на низкой ровной земле с илистым и глинистым грунтом. Трава, осоки и кустарник покрывали её, между ними попадались остатки трав и обломки ветвей. Виднелись отдельные деревья, нижняя растительность, кромка берега и речной проток; у воды тоже росла зелень.

Микула заметил человека с рыболовной сетью в руках. Крепкий мужчина средних лет, светлокожий, с широким лицом, зелёными глазами, короткими русыми волнистыми волосами и густой бородой, осматривал сеть. На нём была одежда из неокрашенного льна и коричневые низкие кожаные башмаки. Взгляд Микулы ненадолго задержался на сети.
```

### B: current LOOK

Request SHA-256: `65611eaa50feee6f079eb5392275abdec000c66669e58c7fe74ec731ae053c41`. Output SHA-256: `b9407ae8c91ecbf232bc44e6230ce637f91fe32b25105cfb0ee5528583e783d8`.

Literary scores: 5, 6, 6; mean 5.67/10. Required coverage: all three reviewers PASS. Protocol feel: all three reviewers **partly**.

```text
Микула внимательно оглядел хозяйственный двор. Ровная низкая земля была илистой, с глиной; среди травы и осок лежали обломки кустарниковых ветвей. Взгляд прошёл по кустарнику, отдельным деревьям и остановился у кромки берега, за которой виднелся речной проток. Облачный летний день держал всё в ровном свете, и при слабом ветре трава у воды почти не шевелилась.

В поле зрения был крепкий мужчина средних лет с широкой физиономией, густой бородой и русыми волнистыми волосами. Он осматривал рыболовную сеть, которую держал в руках. Микула задержал на ней взгляд: после земли и берега это движение человеческих рук казалось самой живой подробностью двора.
```

### C: control LOOK

Request SHA-256: `d9062090d6a170092671d35fcab0cb1dc53da02b563eebfc8f98bf3d8f92e9bf`. Output SHA-256: `a116663cc5a34c21fffe7c56552ecbef8fcdefa30db7818231f9698fafb03f5d`.

Literary scores: 5, 5, 5; mean 5.00/10. Required coverage: all three reviewers PASS. Protocol feel: all three reviewers **partly**.

```text
Микула внимательно оглядел хозяйственный двор. Под ногами лежал илистый, глинистый грунт; местность была низкой и ровной. Взгляд дошёл до речного протока и кромки берега, вернулся к отдельным деревьям и опустился к нижнему ярусу растительности. Трава, осоки и кустарник покрывали землю, у воды виднелась растительность, а на поверхности лежали остатки трав и осок, обломки кустарниковых ветвей. Микула всматривался в эти подробности, стараясь удержать в памяти облик места целиком.

Стоял светлый летний день. Небо было затянуто облаками, осадков не было, ветер едва ощущался; взгляд различал всё с обычной ясностью. Среди увиденного был крепкий мужчина средних лет с густой бородой. Он держал в руках рыболовную сеть и осматривал её. Микула ещё раз посмотрел на сеть: занятость человека на мгновение притянула к себе всё его внимание.
```

## Persistence/readback

No DB or save was modified in this campaign. The source capture's isolated PostgreSQL/reload proof belongs to the linked #749 report. The three response JSONs parsed successfully; all packets and reference files were hash-checked. Final composition must still be tested through the live game, production audit/repair, save and reload.

## Findings

- Literary threshold remains FAIL in every case. Reducing mandatory background recitation alone did not yield an accepted narrative in this small sample; the control is 5.00, current LOOK 5.67, opening 5.33 out of 10. This single pair is not a statistical model comparison.
- All nine assessments say `protocol_feel=partly`; none say `yes`. **Partly is not absence of protocol.** Reviewer 1's auxiliary numeric `protocol=0` means zero explicit `yes`; it does not satisfy a stricter requirement for fully non-protocol prose. Original categorical findings are preserved here.
- Factuality is disputed for A/B: reviewers 1 and 3 PASS; reviewer 2 FAIL. A concern: debris said to lie among vegetation. B concerns: channel described beyond the bank edge, grass almost still in weak wind. Reviewer 3 explicitly treats the grass sentence as compatible sensory telling under D158. No majority vote silently converts this disagreement into factual acceptance. C is factual PASS for all three.
- Required facts and execution outcomes are preserved according to all three reviewers. Literary weakness is reported separately from factuality. No repair was prompted to invent an event, and no generated text was revised to pass the review.
- Shared diagnosis: the prose still presents the hero's condition, environment and NPC appearance as consecutive lists. Attention shifts create some linkage but do not reach the required literary quality. The data/input correction remains useful independently of this failed quality gate.

## Result

**FAIL: prose quality; D49 acceptance remains open.** No full-game success, production Qwen qualification, stable quality, or post-audit narrative is claimed. Full CI and live D49 with save/reload remain separate required checks. Preserve this failed campaign as evidence; do not overwrite it with a later sample.
