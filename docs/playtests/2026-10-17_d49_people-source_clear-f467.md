# D49: связанный захват источника сведений о человеке

## Identity

**PARTIAL / не приёмка игры и не оценка художественности.** Это диагностический захват начального состояния и собранного запроса рассказчику без реальных вызовов модели и без игрового хода. Захват выполнен на коде HEAD `f4674cffda83c9a91a148d5184198bc1b132dfea`, в отдельной временной PostgreSQL партии. Он дополняет, но не переписывает [предыдущий частичный захват](2026-10-17_d49_people-source_capture_f467.md), где цепочка данных была неполной.

- Сценарий: `novgorod_vikhtuy_work_storage_v1`.
- Request ID: `issue-594-pine-ridge-clear-sight-seed-000024`.
- Party ID: `party:61f97719fce106b56e5d0c7f`.
- Начальный источник: `data/world-catalogs/novgorod/live-world-runtime-v17/capacity-v2-start-successors/novgorod_vikhtuy_work_storage_v1.start.json`, SHA-256 `b516be19445f4e292453300cf5d8d56bf8943529e0dfeececf86665731e6cb08`.
- Provider был заменён тестовым `fakefetch`; обработано два запроса, в том числе один запрос рассказчика. Реальных model calls: **0**. Fakefetch вернул техническую заглушку; она не является художественным ответом модели и не оценивается как проза.
- Временный запуск: `node --test --test-isolation=none --test-reporter=tap test/spatial-v3/d49-clear-capture-20261017.test.js`, под `flock -w 600 /srv/novgorod-work/fleet/locks/pg1`, `timeout 1500`, с отдельным TCP-only PostgreSQL 16.14 fixture. Временный тест после прогона удалён; два ранее существовавших untracked capture-теста не менялись.
- Итог лога: 1 test, 1 pass, 0 fail, 0 skipped; duration `514987.695399 ms`. В stderr есть предупреждение pg о будущей несовместимости одновременного `client.query()`; тест прошёл.

## Preconditions

Проверенная начальная партия использовала светлое время, ясную погоду, обычную видимость и слабый или отсутствующий ветер. Экран обозначил место «На хозяйственном дворе», героя Микулу как лесного промысловика и два видимых пути: «по глинистой тропе» и «травяным проходом». В игровом вводе действий не было; `acknowledgeOpening` только подтвердил доставку первого экрана. Версия состояния осталась `0` до и после подтверждения.

В служебных метаданных захвата runtime manifest имеет статус `approved`, а исходный authored start-файл указывает `pending_independent_data_approval`, `approved: false`, `import_authorized: false`, `activation_authorized: false`. Это наблюдаемое расхождение статусов метаданных. Этот тест не устанавливает, какой статус имеет нормативный приоритет, и не доказывает дефект либо production-активацию authored source.

## Gameplay transcript

1. **Инициализация партии.** Использован request ID `issue-594-pine-ridge-clear-sight-seed-000024` и указанный сценарий. Первый экран сообщил место, имя и занятие героя, состояние тела, видимое окружение и два маршрута. Проверяемая погодная запись: лето, 1 июля 1230 года, дневной свет, ясно, без осадков, обычная видимость, слабый или отсутствующий ветер.
2. **Подтверждение экрана.** Player action не отправлялся. Экран получил `delivery_status: acknowledged`; версия сохранённого состояния осталась `0`.
3. **Сбор данных для рассказчика.** Writer request перехвачен во время старта партии. После подтверждения экрана отдельно прочитаны committed snapshot, observation и player-safe visible context той же party, сохранившей версию `0`. Это диагностическая трасса, а не ход игрока. Fakefetch ответил заглушкой; художественный результат отсутствует.

Player-safe writer request сохранён ниже дословно. System и user совпадают с захваченными сообщениями запроса рассказчика; endpoint и служебные заголовки не публикуются.

**System:**

```text
Верните корректный объект JSON.

Верните только {"prose":"<полное вступление>"}. Напишите связную
литературную прозу на русском языке в третьем лице и прошедшем времени. Назовите
героя по имени из сведений; местоимение выбирайте по его полу, если он известен.
Обычно уместны 2–4 абзаца. Используйте переданную сцену.
Охватите каждый смысл из группы обязательный_смысл.
Если переданы сведения об окружении,
передайте главные воспринимаемые черты, достаточные для ориентации героя.
Не требуйте пересказа каждой детали окружения.
Остальные факты сцены используйте там, где они помогают рассказу. Неуказанные
история, цели, обязанности, люди, строения и маршруты остаются неупомянутыми;
пустой список наблюдений не означает, что место пусто или тихо.
Мир сцены задан только сведениями: люди и животные; предметы, строения, вода, местность и растительность; пути, их стороны, направления и куда они ведут; где находятся люди и чем заняты; имена, родство и должности; события, их причины и исходы; тело, физическое состояние, силы, раны, одежда и снаряжение героя; прошлое героя, его черты и цель; сколько прошло времени. К этому проза ничего не добавляет и переданного не меняет. Проза не утверждает, что чего-то нет, если сведения молчат, и не добавляет к миру того, чего они не называют. Имя человека звучит в прозе, только если герой его знает. Переданная подпись видимого человека в переданных сведениях о людях уже учитывает знание героя: данное там имя ему известно, а описание незнакомого человека не раскрывает его имени. Имена из справки о мире или скрытого прошлого этим не разрешаются. Сведения о мире справочные: проза передаёт их уверенность обычными словами, не дополняет их фактами из собственной памяти и не выдаёт общее знание за то, что есть здесь и сейчас.
Рассказ — то, как герой переживает этот мир, и здесь проза свободна: свет и тень, тепло и прохлада, запахи, фоновые звуки, то, что под ногами, если они естественно следуют из места, растительности, времени года, погоды и времени суток; мысли, чувства, впечатления и оценки героя в эту минуту, в том числе его догадки о других людях, поданные как догадки; мелкие движения тела героя, ничего не меняющие в мире; связки, переходы, ритм и порядок, в котором взгляд выхватывает подробности. Рассказ не противоречит сведениям и не создаёт зацепок, то есть признаков людей, жилья, воды, дичи и иной добычи, опасности или следов, которых нет в сведениях. Звук или запах, который сам выдаёт людей, животных, работу, воду или жильё, — факт мира, а не фон. Чувства героя соразмерны сведениям: тревога и угроза, которых сведения не дают, не нагнетаются. Мысль героя не утверждает новых фактов о мире и его прошлом. Герой не совершает поступков, которых игрок не выбирал. Мелкое движение тела героя, ничего не меняющее в мире, поступком не является.
Свяжите переданные факты в сцену, а не в досье, журнал заданий, список, меню
команд или отчёт о состоянии. Обычное состояние, одежду и прочие необязательные
подробности упоминайте, только если они работают на сцену. opening source_hint —
лишь необязательная опора, это не вся сцена.
```

**User:**

```json
{"сцена":{"обязательный_смысл":["Микула — лесной промысловик.","человек"],"факты":["Микула — лесной промысловик.","Текущее место: На хозяйственном дворе.","Пол героя: мужской.","Ранений нет; сил достаточно для работы; сильного голода нет.","Поверхность покрыта илистым и глинистым грунтом.","Местность низкая и ровная.","Виден речной проток.","Видна кромка берега.","Видны отдельные деревья.","Виден нижний ярус растительности.","Землю покрывают трава, осоки и кустарник.","У воды видна растительность.","На поверхности видны остатки трав и осок, обломки кустарниковых ветвей.","Направление пути: по глинистой тропе. Зрительная различимость пути: отчётливая.","Направление пути: травяным проходом. Зрительная различимость пути: отчётливая.","У героя: нижняя рубаха.","У героя: штаны.","У героя: низкая кожаная обувь.","Небо ясное.","Осадков нет.","Видимость обычная.","Ветер отсутствует или слабый.","Лето.","День."],"персонажи":[{"имя":"человек","факты":["Виден молодой мужчина.","Телосложение: стройное.","Кожа: бледная.","Черты лица: круглые.","Глаза: тёмные.","Лысина.","Нижняя одежда: тонкий лён, круглый вырез с разрезом, узкие рукава, цвета неокрашенного льна.","Обувь: низкие кожаные башмаки, кожа, коричневого цвета.","Одежда ниже пояса: прямая нижняя одежда, неокрашенный лён, цвета неокрашенного льна."]}]}}
```

Само player-safe наблюдение человека содержало подпись «человек», статус узнавания `unrecognized`, видимые признаки молодого мужчины (стройное телосложение, бледная кожа, круглые черты лица, тёмные глаза, лысина) и сведения о видимой одежде и обуви. Ни имени NPC, ни его занятия, положения относительно героя или текущего действия в этом наблюдении не было.

## Persistence/readback

Все следующие звенья относятся к одной party `party:61f97719fce106b56e5d0c7f`:

- Начальный source и runtime setup создали эту партию по указанному request ID.
- В committed snapshot записан один NPC и его placement в узле сцены `focus:0`; placement находится в `entity_placements` и имеет ту же party ID.
- `readEntityObservations` вернул одну запись для того же NPC с visibility `clear`; её видимые признаки совпали с теми, что вошли в safe visible context.
- Current visible context для той же party включил место «На хозяйственном дворе», береговой и растительный контекст, два пути и одного NPC с подписью «человек» и только видимыми признаками.
- Writer request был собран при старте той же party. В его `персонажи` попал тот же человек и видимые сведения, что и в отдельно прочитанной после ack проекции состояния версии `0`. Соответствие source, committed placement, observation, visible context и writer input подтверждено в пределах одного запуска; последующие диагностические чтения не были причиной уже собранного запроса.
- В snapshot есть частное `machine_state.current_activity`; player-safe observation и writer input эту активность не содержат. Публичный слой не даёт основания превращать частный план/состояние NPC в утверждение о том, что игрок видит его действие. Захват также не доказывает, что NPC фактически выполнял это действие в сцене.
- Для партии сохранена одна запись `party_state_snapshots` версии `0`. До и после ack версия была `0`; ход не выполнялся, поэтому этот отчёт не проверяет сохранение игровых последствий после хода или reload.

Текущий writer request сравнивался с прежним frozen input `29f51870665514b8dba10c9a27a430003b101b24c281764ecde1a96e489a2fba`. Этот SHA относится к frozen input artifact, а не к идентификатору тела текущего запроса. Сравнение `08-writer-comparison.json` подтверждает равенство system message и перечисленных параметров, но полный wire **не равен**: NPC facts и погодные/сценовые данные различаются. Старый вход относится к request `d49-real-vikhtuy-f467-opening` и другой party `party:58b9d6343d49225d32813c0c`; сравнения нельзя трактовать как одну партию или один и тот же writer input.

## Findings

1. **Трасса связана.** Удалось подтвердить, что сведения о видимом человеке доходят от committed placement через visibility observation и safe projection до writer input в одной свежей партии.
2. **Видимость ограничена.** Наблюдение подтверждает внешность и одежду. Оно не сообщает player-safe положение относительно героя или видимое занятие. Приватное состояние NPC нельзя подставлять вместо этих сведений; этот захват сам по себе не доказывает, что видимое занятие должно присутствовать.
3. **Старый вход не эквивалентен новому.** System и параметры совпали, но NPC и средовые факты — нет. Хеш frozen input не является хешем тела запроса этого прогона.
4. **Статусы source требуют отдельного разрешения по precedence.** У fixture runtime manifest и authored source разные статусы; этот диагностический прогон их расхождение фиксирует, но не квалифицирует как ошибку.

Артефакты захвата остались вне репозитория в `/srv/novgorod-work/tmp/d49-clear-capture-20261017/`; содержимое committed snapshot и приватное состояние не копировались в репозиторий. SHA-256 сохранённых файлов:

| Файл | SHA-256 |
|---|---|
| `00-provenance.json` | `aa90a8aa87f0021c04c5e7b7aa632ed35754c5644a230595e6754849c7275a58` |
| `00-source.json` | `ec52e7586dd90c09a65dcb4bf83dbe06f9bce78378a539252bda7d88ea0b98b9` |
| `02-opening.json` | `76688ad70f1b8af2e20a144f1100d82a112946a8b257ba5780404d59b8af7e6c` |
| `02-ack.json` | `8aa9e92e0311596ea91f3abd998a23ba51a8511eb45d46c2cc7c3a6c572c9e25` |
| `03-committed.json` | `c799f4ee9832e9916552cd4d5c8114500e2e7be9a2fd607c48cae5d0fe5c0e26` |
| `04-visible.json` | `0ec223595b31fa7d652aeeb577e828c919e5f82cc3176ac829af84e28c18c508` |
| `05-observations.json` | `fde0e5a34c2bbdb088f2cb4f68926f59b02ac361fa59be1b3d3978bfcf790a8e` |
| `05-environment.json` | `602940bb6aceff5a4a2361d6f2cbc248978f7500fd2440614cd775cf0741f274` |
| `06-writer.json` | `c50ace2709978a4436c70a78b225cc2c8567c3f912846161e9a1f61709d340a8` |
| `07-summary.json` | `a159c20f43f86474de9b2e597751d468f0b96c16cb457f7ba7c785b432c1c3e4` |
| `08-writer-comparison.json` | `aa1b74a20ab9bb8ff054de7e2b6a51efe4cc6238385c350e8a297d94e88042ec` |
| `capture.test.js` | `526cd8703fccd0a4e80ca7fe9a534eb7b7a7148db7bd1bdc9742fc3acb9f58c5` |
| `test.log` | `ff781932aba2833e1959a21bc2c726a6b9517e7ff5ce6ccdf106738c78a87e95` |

## Result

**PARTIAL.** Связность данных от источника до входа рассказчика подтверждена для одной партии. Захват не включает реальную прозу, разговор, игровой ход, сохранение после хода, повторную загрузку или живой D49 в браузере; художественность не оценивалась. Реальных вызовов модели не было. Исполнитель проверил синтаксис временного теста до запуска; фактический capture test завершился 1/1 pass, 0 fail. `npm run docs:check` прошёл: 8 generated files, 0 activation-boundary findings. `git diff --cached --check` прошёл перед фиксацией отчёта.

## Последующий независимый Contract Auditor

Ниже дословный read-only разбор источника и предлагаемого общего исправления. Он уточняет precedence отдельно от capture: утверждённый manifest подтверждает точное начальное состояние, но не разрешает переносить старое занятие на изменившееся состояние NPC. Реализация ещё не принята.

CONTRACT AUDIT FINDING

scope: D49: canonical Vikhtuy opening NPC activity authority, temporal/NPC ownership, player-safe visible projection; review only of proposed fix before implementation.
source_set: root AGENTS.md; all governing files; CONTRACT_INDEX §1–§3.1, §4–§7, §8.1 NPC agency + Time/activities; ACTIVE npc_autonomous_decision_contract.md, turn_step_llm_contract.md, temporal_world_and_interruptible_activities.md; owners packages/npc-runtime/MODULE.md, packages/time-events-history/MODULE.md, packages/visibility-knowledge-memory/MODULE.md, packages/contracts/MODULE.md; exact v17 target start manifest, target runtime-profile artifact, canonical-initial NPC profiles, approved Vikhtuy start and data-approval; capture artifacts; current legacy projection and ordinary remainder contract/code/tests. CBM indexed local checkout, but cited paths metadata_changed and the server checkout is a different HEAD; direct server/source reads govern.
source_statuses: NPC and Temporal contracts ACTIVE. v17 target-start manifest status approved, activation_authorized=true and pins exact Vikhtuy start SHA b516be19445f4e292453300cf5d8d56bf8943529e0dfeececf86665731e6cb08. Its approved successor data record is APPROVE_DATA_ONLY and expressly excludes import/activation authority. Separately target-runtime-profiles-approved.json says approved=true but import_authorized=false and activation_authorized=false. Canonical-initial NPC dataset record for m2c_npc_fisher_v1 and activity record are approved; the per-profile observable_activity and activity_profile_ref are pinned in the record. Therefore the start’s committed NPC/current_activity at state 0 is real approved initial state; the standalone profile artifact does not establish a globally active runtime binding or ongoing authority. Do not reject the exact committed initial fact solely due the candidate start file’s pending flags: approved manifest binds and activates the exact successor start. Conversely, do not treat it as approval to keep projecting that activity after activity/profile/state changes.
observed_implementation: Captured state 0 contains active NPC profile m2c_npc_fisher_v1, current_activity_ref activity_m2c_npc_fisher_initial_work_v1 and active current_activity summary. Opening visible context omits activity. Legacy lower-dvina-trace-phase-2-current-visible.js:74 maps machine_state.current_activity.summary directly to visible_status; this can disclose private schedule text and is not the approved observable phrasing. Existing ordinary_remainder already has ordinary_activity field in player-safe observable_cues; semantic remainder validators require the LLM-produced ordinary_activity to be null because schedule/current work is code-owned. No new schema or persistence ledger is needed.
required_by_active_contract: NPC/Temporal remain sole owners of current activity, transitions and current committed state. Player-safe perception may expose only an authorized observable projection. NPC agency/activity are not narration authority; cues must reflect committed state, not routine/profile intent detached from it. Existing ordinary_activity slot is suitable for a code-projected cue; it must not be sourced from the LLM remainder.
target_if_any: At requested observation time, derive cue only when the exact active/pinned NPC runtime profile and current_activity_ref match the approved observable_activity source, the NPC and activity are active, and current state supports observation. Remove/suppress cue on activity-ref change, paused/completed/non-active activity, unknown/mismatched profile/source, or unavailable time/state. Keep current visible projection fail-closed and avoid exposing current_activity.summary as visible_status. A routine transition must naturally change/suppress the cue by reading current Temporal/NPC state; no scenario ID branch.
conflict: Omitting the activity loses an approved observable initial action. Copying private current_activity.summary leaks internal text and wrongly equates execution state with player-safe wording. Extending profile authorization globally would also exceed the approved start’s scope.
precedence_resolution: Governing PC §7 and AI §13–16 require one owner and player-safe projection. Active NPC/Temporal contracts and their MODULEs own execution and state. Exact approved manifest/start and committed snapshot establish the specific initial condition; candidate metadata flags do not negate that binding, while the profile artifact’s import/activation=false prevents treating it as an independent standing runtime binding. Current committed state wins after the initial snapshot.
first_bad_boundary: NPC/Temporal state → game-server visible-NPC projection: missing authorized observable cue, with legacy branch exposing private execution summary.
correct_owner: Temporal/NPC runtime owner for validation/derivation from current state; game-server visibility projection for placing the approved text in existing player-safe observable_cues. No narration or LLM ownership.
required_code_delta: General ref/profile-resolved projection; exact profile+activity ref association; check current activity/status and requested time; project approved observable_activity.value into observable_cues.ordinary_remainder.ordinary_activity; never fallback to summary; use null/omit when validation fails. Avoid scenario-specific IDs and avoid a second owner.
required_docs_delta: None appears necessary for a local code fix within existing ACTIVE contracts and schema. Do not alter protected governing docs or promote the target runtime-profile candidate merely to bless code. If implementation needs a new persistent field/public shape or wider active binding, stop and route for explicit contract/cutover review.
required_tests: Focused projection tests for exact matching active state, mismatched profile/ref, changed ref, inactive/paused/unknown state, and requested-time transition/reload; ensure the legacy private summary never leaks and existing ordinary remainder LLM output remains null. Capture start remains state version 0/no game or model call.
severity: P1
verdict: PASS_WITH_NOTES

CBM note: list_projects/index_status and search_graph were run. Coverage for the cited projection/contracts was metadata_changed and recommended direct reads; local graph HEAD is not the server f4674cffda83c9a91a148d5184198bc1b132dfea. Source conclusions above were checked directly in the server checkout/capture. No tests or mutations run; no contract delta is currently required.

## Уточнение независимого аудита после проверки предметов

Первоначальный разбор выше сохранён дословно. Последующее уточнение отменяет предложение напрямую копировать observable_activity.value: это редакционная policy, а не безопасная реплика для рассказчика. Сначала требуется общий путь наблюдения предмета в руках через владельцев items и visibility. Ниже — полный addendum аудитора.

# Addendum — D49 observable activity authority

The earlier verdict remains **PASS_WITH_NOTES** verbatim; this addendum narrows its proposed projection path. This review is based only on capture files `03-committed.json`, `04-visible.json`, and the seven selected item rows in the committed snapshot. No code or DB readback was performed.

## New evidence

At state version 0, the committed snapshot has the active fisher profile/activity and the English `current_activity.summary` text. The same text appears as `observable_activity.value` in the profile source, but its wording is editorial policy: it embeds constraints about how to interpret the action and what outcomes must not be inferred. Matching profile/activity refs establishes applicability of the policy, not that this string is ready as a player-safe factual cue or fit for direct rendering.

The same committed snapshot contains seven persisted items. One is `item_be91bc68b10267482d9cd1a6`, template `item_tpl_nov_fishing_net_v1`, display name «рыболовная сеть», held by this NPC at physical position `hands`. The visible projection includes the NPC’s identity and three equipped garments, but no net and no activity cue. This is snapshot evidence only; it does not establish PG item-row readback. The prior source inspection indicates exterior/equipment projection reads worn/equipped positions, which explains why a hand-held object is missing.

## Revised minimum path

Do not copy or translate `observable_activity.value`, and do not project `current_activity.summary`. Treat the approved value as a policy bound on permitted meaning. First make the existing player-safe scene projection include perceptible hand-held items through the current item/visibility owners, using committed placement and visual facts. Then expose activity only through an already authorized player-safe representation or an explicitly reviewed representation that derives from both the active temporal activity and its observable object/context. A profile/ref match alone is insufficient. If no such representation exists, keep the activity cue absent pending that owner-boundary decision; do not invent wording or new facts.

This is a completeness gap across NPC/Temporal state and item visibility, not merely a missing NPC string. No DDL or new ledger is indicated. The source candidate’s false activation flags remain distinct from the exact activated start manifest; neither authorizes direct rendering of editorial policy.

## Still unproven

The capture does not prove current DB item-row readback, actual optical visibility of the held net under Spatial rules, or that the approved editorial policy is licensed as player-facing content. No PG/model calls, tests, or mutations were run.
