---
name: owner-decisions-d100
description: "D100–D102 (10-06) — speech-layer wording approved (no archaism/18th-c. stylization); LD port decisions + owner's plot example; acceptance tests are written by a senior model before the task, Opus verifies at the end"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-06T09:13:23.608Z
---

Owner, 2026-10-06, one message: «Да. И отдельное замечание про подгонку тестов — пусть тесты пишет старшая модель, до начала задания. А опус потом ещё и проверит сам. По решениям: 1. да. 2. да, я тебе сейчас сюжет приложу. Ему не надо следовать дословно, это просто как пример 3. да».

**D100 — speech manner wording approved.** The owner's concern is that speech must not slide into archaism or the 18th century («сударь», «извольте»). Group 1 of the bench produced «сударь», «Позвольте… изложить суть» and «инцидент». Approved B1 texts:
- Base line: «Говори живым русским языком: без старинных обращений и витиеватых оборотов, без канцелярских и современных словечек.»
- Standing, as vocabulary only:
  - low: «обиходными словами, какие в ходу за работой и по хозяйству; можно и грубовато»;
  - middle: «обычными житейскими словами»;
  - high: «складно и точно, со знанием дела; слова обдуманнее, но без витиеватости».
- Relation, as tone: senior «уважительно и сдержанно»; peer «запросто».
- Temperament lines unchanged; craft line unchanged.
- A scripted stylization/anachronism scan counts per arm: сударь, извольте, позвольте, батюшка, ибо, дабы, сие, инцидент, ситуация, информация, проблема.

**D101 — LD port.**
1. Start on the same Vikhtuy shore.
2. Keep the version of events and the roles as the quest basis. The owner attached a play-through example, «След на Нижней Двине» (Desktop/Русь 13 ВЕК/Пример отыгрыша сценария.txt), copied to servak for executors. It is not to be followed literally. Example specifics:
   - Микула Гаврилов сын, 20, junior clerk of Savva Tverdich; the sealed waxed-cloth bundle holds a debt record;
   - Ратша is Жданко's nephew (male) — the data said «помощница», so this needs reconciling;
   - Онисим survives with an injured leg; the ending decides the fate of Ratsha and Zhdanko;
   - the example shows d20 checks, time stamps, and state such as бодрость and озноб.
3. Delete nothing until the port is done and a full run, PG included, has passed.

**D102 — tests by a senior model before the task.**
- Acceptance and regression tests for a code task are written by a senior model (Codex sol, per D88/D90) before the executor starts, from the task's behaviour spec, and frozen by hash.
- The executor implements to them and may add tests, but never edits the frozen ones (test-diff guard → stop).
- Opus verifies the tests and the work itself at the final pass.
- My interpretation: «старшая модель» = sol. The owner may correct it.

**Why:** executors kept narrowing assertions to get green (turn-scene-fix: 4 CA rounds, a long list of reworded assertions). Speech stylization is a quality failure the owner cares about.

**How to apply:** new code tasks get a test-author step (sol) before the executor; the rule is recorded in the team-process skill and fleet RULES. The manner bench reruns with the D100 texts. A design task for the v17 quest start uses the plot example as reference. Related: [[owner-decisions-d94]], [[owner-decisions-d98]], [[owner-decisions-d88]].

**Addendum — owner's scenario spec (10-06).** The file «След на Нижней Двине Сценарий.txt» (Desktop/Русь 13 ВЕК) is copied to servak shared-ref as ld-scenario-spec-owner-20261006.txt (sha 0cf2a8dd…) and to the archive (owner-materials). It «должна заполнить все пробелы». It has two parts:
- **«Русь XIII век»** — the game vision: free-text actions; d20 for risky actions; 6 attributes and skills; time as a mechanic; health, satiety and vigor; the map is the character's knowledge; materiality of items; NPCs with memory; history as pressure; short, dangerous combat; no chosen hero.
- **The scenario** — a template plus a generator, not a fixed plot.
  - Fixed: era and region, late summer, junior-clerk role, hired boatman, waking after the wreck, boatman and bundle missing, signs it was no accident, the shore, the fishing camp, a fisher with partial info, one hidden truth, the goal, small scale.
  - Generated at party start: names and characters, culprit, motive, sequence, boatman's fate, items, extra places, clues, weather.
  - Requirements: hidden model before turn 1, clues derived from it, no retroactive culprit; 4–5 places, 3–5 key people, 4–7 clues; ≥3 independent routes; a failed check never destroys the only path; endings and epilogue as in the spec.
  - Old LD data and the play-through example are two instances, not canon.
- Vikhtuy and Zaostrovye are labelled «Нижняя Двина» in the v17 data, so the D101 start place fits.
- The generator maps to RT-M7 #109 (procedural starts / seeding). ld-quest-design got this as NOTE-…-owner-spec.

**D105 (10-06), quest start design decisions (ld-quest-design, all «да»):**
1. **Player character.** The player may describe the hero freely. The generator fits that into the fixed role (junior clerk) and fills the gaps. This reconciles D11/#109 with the spec.
2. **NPC sources.** Names come from approved epoch name pools; roles and occupations from approved role/occupation data. The model chooses within these and never invents authority, kinship or rights.
3. **First test** runs on one fixed variant: the old LD set, Zhdanko/Ratsha/Onisim. The owner's example is the second check variant; random generations come after.

Roles and motives are already framed by the spec («простая человеческая причина», no conspiracies). The design is accepted. Next work follows M7/#109 (generator) and #225 (mechanics), per the design's order. Per D102, acceptance tests are written by sol first.

**10-06 follow-up (owner: «1. да 2. да»):**
- The spec and the example are added verbatim to the repo as docs/plans/sled-na-nizhney-dvine-scenario-spec.md and docs/plans/sled-na-nizhney-dvine-example-playthrough.md. They are not normative. PR #238 to main (docs only); merge myself after green CI (D58).
- Generator design starts now in parallel, with no code until approved. Fleet task `scenario-generator-design` (codex, research, sol plan) writes a CR-level doc: schemas, deterministic validation, owners and persistence, the model step plus a bench outline, fixtures, acceptance-test behaviour for D102, and the task breakdown. Report to the owner first.

**D106 (10-06), owner:**
- **Generator failure policy: B.** Up to two new generations with other variants after the response plus one repair have failed. Each failure is logged; only then a closed refusal. This overrides the design's recommendation A.
- **Start audit decisions:**
  1. Yes — a runtime acceptance test over all 7 v17 starts and the first turn, written first by a senior model (D102).
  2. The 7 place titles are **not approved as they are**. Owner: «Персонаж может не знать, как называется место, пока не узнает о нём инфу. А ещё названия выглядят странно, словно служебные».
     - The principle: the on-screen place title is a natural description of what the character perceives.
     - A toponym (Вихтуй, Заостровье…) is shown only when the character knows it.
     - This matches the spatial standard for lines (line_toponym «в player projection только когда открыт знанием», spatial_architecture_standard_g0_g6.md:744/:2314), extended to places.
     - Titles must not read like service labels («промысловый участок», «рабочая площадка», the placeholder «Окрестности.»).
  3. Yes — audit and fix the rest: NPC data status and labels, natural place titles, clothing applicability, the hero-name source («Микула»).

**D107 (10-06), owner: «Названия ок».** The start place titles are approved as I proposed. The decision is recorded on #133 and #236 and executed by fleet task `start-titles-fix`.

| Start | Title |
|---|---|
| novgorod_pine_ridge_approach_v1 | «На подходе к лесной гряде» (kept) |
| novgorod_riverbank_approach_v1 | «У речного берега» (kept) |
| novgorod_reed_backwater_entrance_v1 | «У заболоченной заводи» (kept) |
| novgorod_vikhtuy_resource_edge_approach_v1 | «На лесном берегу протока» |
| novgorod_zaostrovye_settlement_approach_v1 | «На протоке у селения» |
| novgorod_vikhtuy_work_storage_v1 | «На хозяйственном дворе» |
| novgorod_vikhtuy_household_cluster_v1 | «Среди дворов» |

- The natural-scene placeholder «Окрестности.» on these places takes the same title as the place: one title per place.
- A toponym appears only once the character knows it. All 7 starts have `known_places: []`.

The rest of D106.3 needs no owner decision (my reading, told to the owner):
- **Name.** D11: the player's name, checked against the pool, or a name from the pool.
- **Hero description.** D66: free description is a general mechanic for all starts.
- **NPCs and player clothing.** They go through the data approval pipeline.

**D108 (10-06), owner principle.** «Тот, кем будет персонаж игрока не должно зависеть от выбора места. Игрок может создать любого персонажа в любом месте, а игра обязана предоставить ему реалистичное объяснение, почему и зачем он там. У нас это должно быть в контрактах.»

It came in reply to my menu-description options. Option B («Вы — лесной промысловик.») tied the role to the start; that was my error.

**Where the norm stands.**
- The rule is already written in `player_character_generation.txt`:
  - :35 — «причина нахождения здесь должны объяснять, почему он оказался именно в этой сцене именно сейчас»;
  - :37 — the player's year, region, occupation, status and biography are a request; empty fields get plausible values;
  - :64 — «кем угодно»;
  - §13 :506–535 — «почему персонаж здесь именно сейчас», 18 reasons.
- Both that file and `new_game_start_pipeline.txt` are `UNDECLARED / DOMAIN GUIDE` in CONTRACT_INDEX (:154, :151), so they are not ACTIVE.
- The v17 code violates it: the 7 start records fix role, occupation and the name «Микула» in `player_inputs`.

**How to apply.**
- A start is a place; the character is free, and the generator explains the presence.
- The LD quest keeps the clerk role from its own plot (D105); that is a quest premise, not a place premise.

Proposed follow-ups, waiting for owner OK:
- (a) The menu card shows only the place title (D107); no role description.
- (b) Make the rule ACTIVE via CORPUS_EDIT and Contract Auditor, showing the owner the exact wording first.
- (c) A design task for free character creation at any start: #109, D11 and D105 generalized.

**D109 (10-06), owner: «так» plus an audit of the guides.** It approves my three D108 steps, mapped one to one:
- (a) The start card in the menu shows only the place title (D107); the role description is removed.
- (b) The rule becomes ACTIVE via CORPUS_EDIT and Contract Auditor. The owner sees the exact wording first.
- (c) A design task for free character creation at any start (#109).

New order: «Проведи аудит этих руководств, там наверняка куча всего полезного есть, о чём забыли» (/team-process). There are 15 guides: the 14 `UNDECLARED / DOMAIN GUIDE` documents plus `world_regions.txt` (`REFERENCE / DOMAIN GUIDE`). For each one: what is useful, whether code or an ACTIVE contract already covers it, what was forgotten, what is obsolete against later decisions. The results go to the owner first.

Tasks:
- `guides-audit`, a research task: luna army, led by sol;
- `character-creation-design`, a research task led by sol.

Wording for (b) is drafted after the audit of `player_character_generation.txt` and `new_game_start_pipeline.txt`.

**D110 (10-06), owner: «1. да. 2. да. 3. да. 4. да. 5. да.»** These are the decisions of the character-creation design, `fleet/tasks/character-creation-design/out/character-creation-design.md`.
1. **The four M7 parameters (D75).** Region and season are the world frame; occupation and social position are the player's wishes for the hero. None of them binds the hero to a start role. The place is chosen separately.
2. **Preview before start.** One screen «вот ваш герой» with «Принять» / «Изменить», also for an empty request. When the free text conflicts with filled fields, the fields win.
3. **Failure policy is D106 B.** One repair, then up to two new variants, then a closed refusal with an explanation. The player may edit the request any number of times.
4. **Catalog gaps.** The model never invents occupations. Until the catalog is extended, the nearest approved occupation is used and explained to the player. Gaps are collected into a data-extension task.
5. **The clerk role** (D105) applies only inside the LD quest. It is never a filter on choosing a place.

Next:
- show the owner the norm wording (D109 b), then CORPUS_EDIT and CA;
- CR for #109, with acceptance tests written by sol first (D102), then the D41 bench, then the code.

**D111 (10-06), owner: «ок, ставь задачу».** It approves verbatim the 10-point norm «Персонаж игрока и место старта» that I showed. The norm is based on D108 and D110, with `player_character_generation.txt` as its source. It goes in as a new short native corpus document with status ACTIVE and a CONTRACT_INDEX row. The current violation is recorded in an LW entry: the 7 v17 starts hard-code role and name until #109 lands.

The text in short:
1. The start place never determines identity.
2. The request is free text plus optional fields; a field beats the text; empty fields are filled within approved data.
3. Keep the core of the request; downgrade the impossible with the cost explained.
4. Before turn 1, explain the path, why here and now, what for, the immediate need and the cost of inaction, inside the intro.
5. Only approved data; no invented people, kin, rights, events, items, occupations or toponyms; the place name only with a knowledge basis.
6. Name per D11; occupation from approved catalogs, or the nearest approved one, explained.
7. A preview with accept or change; unlimited changes.
8. Policy B; no partial party.
9. Commit before turn 1; no regeneration on retry or reload.
10. A quest role is a premise of the quest, not of the place.

Executed by fleet task `player-start-norm`: CORPUS_EDIT, then CA, then a PR into PR #98.

**D112 (10-06), owner: «1. Да. 2. Да, но обязательно заведи issue.»**
1. The 15 natural place titles from task `natural-place-titles` are accepted, with two edits that align them with the D107 wording:
   - «У заводи» instead of «У затона»;
   - «протока» instead of «протоки».
2. The monotony is accepted for now («У речного берега» covers 43 of 160 places). Natural data must be enriched later; filed as issue #242.

**How to apply:**
- A G5 label (D107) beats a natural-placement label in the place label catalog.
- The mapping «place → title» gets an independent sol check (ap task), then it is loaded into the catalog.
- When titles for the same kind of place are reused, keep D107's words.

**D113 (10-06), owner: «Так. Проведи ещё аудит, чтобы снова не потерять полезное.» (/team-process)** It came after landmarks were found lost in the map-workflow migration: old `map_g0_g4_workflow.txt` has 2375 lines; its active successor has 49.

Scope of the second audit — everything non-active that the earlier audits do not cover:
- **Corpus:**
  - `semantic_world_actions_materialization_and_processes_contract.md` (PROPOSED UMBRELLA TARGET, 4658 lines);
  - `llm_agent_prompt_templates.md`, `time_system.txt`, `historical_events_and_figures.txt`, `universal_category_classification_references.md`, `development_rules.txt`;
  - the SUPERSEDED / REDIRECT documents.
- **Outside the corpus:** `DOCUMENTS/` (59 files, ~68k lines), `legacy/` (~7.7k), `docs/plans/` (~5.4k), `docs/migration/` (103 files), `docs/archive/`.

A script dedups against the corpus first. The audit also proposes a rule that stops migrations from dropping content (a transfer map plus a CA check); that proposal goes to the owner first.

Task: `lost-knowledge-audit`. The earlier audits are `guides-audit` (15 guides plus 2 MIGRATION / ROLLBACK documents) and `landmarks-audit`.

**D114 (10-06), owner on landmarks (after landmarks-audit).**
1. «да» — landmarks are approved place data at the Spatial owner: 1–3 stable natural features per place, with provenance. Display goes through visibility (seen now) and knowledge (seen before). The narrator and the screen get only what is projected. Route points are placed per D56.
2. «да» — a place title uses a landmark by **knowledge**: seen before → the title stays, day or night. A first visit in the dark → a generic title until the landmark is seen. Same principle as D106.
3. Owner addition: «Временными ориентирами в том числе могут быть следы деятельности людей — дым, следы, брошенные вещи. Персонаж может увидеть например город по ориентирам — свет ночью, дым, шум — за несколько ячеек карты, если это реалистично.»
   - Temporary landmarks come from world state: smoke from fires and processes, tracks, abandoned items.
   - Long-range perception: a settlement is perceived across several map cells by light at night, smoke and noise, when realistic.

**Already in the norms.** The ACTIVE spatial standard §7.3 «World perception signals» (`spatial_architecture_standard_g0_g6.md:1272`) says distant bells, smoke, market, lights and barking travel via `world_perception_signal`. It gives the approximate direction and zone, not the exact path. Related:
- the contract name at `:4300`;
- temporal-v4 propagation profiles vocabulary;
- `temporal_world_and_interruptible_activities.md:2274`.

No runtime wiring was found except tests: specified but not wired.

Next: a design task (`landmarks-design`, CR level) covering stable plus temporary landmarks and world perception signals. Its result goes to the owner, then data and code tasks; #242 is related.

**D115 (10-06), owner: «да, начинай все пять. Заведи issue обязательно» (/team-process).** It approves the five steps after guides-audit:
- (а) Fold the 9 player-character rules (guides-audit findings 5–11 and others) into the #109 design and CR.
- (б) Check whether hunger, sleep and fatigue work in v17. The approved `body_time_effect` profiles have no production binding found. If they do not work, bind the approved profiles.
- (в) An NPC lifecycle design: background → scene → key promotion, demotion with kept memory. The rules are FORGOTTEN in `npc_generation_profiles.txt:183–231`.
- (г) Fix the site_connection transition that costs no traversal time (`movement_locations_regions.txt:71–75`). Sol writes the test first (D102).
- (д) Everything else goes into an issue so nothing is lost.

Issues are mandatory for each item.

**D116 (10-06), owner on the landmarks-design decisions: «1. да. 2. да. Обязательно заводи issue, чтобы не забылось опять. У нас это правило вроде есть?»**
1. Far signals: stage one shows direction and area without a number. The radius in cells comes later, by game calibration (D71) or a fit source → #249.
2. The lifecycle of residual smoke and track erasure belongs to the process and trace owners; no minutes now → #250.

Umbrella plan, 7 CR stages → #248. Its first comment holds the full design text. D116 is posted on #133.

Rule answer: there was only a partial rule — HOW_WE_WORK §9 (traps, owner decisions → issue), D57 (evening review → issue), and WR «отчёт или issue». The general rule «deferred → issue the same day» was added to team-process (see [[owner-decisions-d100]]).

**D117 (10-06), owner: «По всем найденным проблемам нужно заводить issue».** Standing rule. Every problem found gets its own GitHub issue the same day: what is wrong, why, the return condition, sources file:line. Sources are audits, reviews, CA, benches, runs and the evening review. Deferred items are covered too.

The only exception is a review finding fixed inside the same task before it closes; that task's issue tracks it. Executors list out-of-scope findings in DONE, and I file the issues.

The rule is in team-process §9 and fleet RULES. It is not yet a repo norm: WR (governance) still says «итоговый отчёт или issue», and changing it needs the owner's explicit request. A sweep of already-found problems without issues was started.

**D118 (10-06), owner: «1. да. 2. да.»**
1. Make D117 a repo norm. AGENTS.md (always-on rules) and WR §29 are edited on his explicit request. Approved text: «Найденная проблема, не исправленная в текущей задаче, и всё отложенное получают отдельный issue в тот же день: что не так, где (файл:строка), условие закрытия. Строки в отчёте недостаточно», plus «исполнитель под ведущим перечисляет такие проблемы в сдаче, issue заводит ведущий».
   - Commit 6fea9ba7, branch `docs/governance-found-problem-issues`, worktree servak `worktrees/gov-found-problems`.
   - CA on Codex sol; the governance merge is not mine to do (D58 excludes governance): ask the owner.
2. Natural place titles: forest_tract (10 places) «В лесу»; burial_area (3 places) «У места погребения». Apply after the ap re-check of A03.

**D119 (10-06), owner: «Да. Да.»**
1. NPC lifecycle (#245): all 7 recommendations of `npc-lifecycle-design` accepted:
   - key needs a lasting bond or consequence;
   - background→key allowed by start record or a pre-first-reply obligation;
   - demote key only after its consequences are closed or handed over;
   - compact history starts at 8 entries / 2 KiB (project numbers, checked on real data); open obligations are never evicted;
   - reuse the existing NPC transitions table;
   - compact history is rebuilt from sources;
   - compaction trims only the model input.
2. Rule fate map (#253): when a document is replaced, demoted or shortened, every old rule maps to its new place, an explicit owner drop, or an open gap with an owner. CA checks completeness. Lives in `docs/process/CORPUS_EDIT.md`.

Next: an NPC lifecycle CR (active NPC contract section via CORPUS_EDIT + CA; sol D102 tests) and a docs task for CORPUS_EDIT.

Owner also asked where the NPC family/household/elders/property norms went. Answer: they are game-base candidate data (`households-psychology-speech`), WK `family-social-context.json`, and `items_and_property.txt`. Runtime does not use them → #259.

**D120 (10-06), owner: «1. да. 2. да.»** He accepted the two CA clarifications to the issue rule (PR #263):
- the narrow exception: only a review finding fixed in the same task before it closes needs no issue;
- without a lead, the agent doing the task files the issue.

Commit 629174cc; CA round 2 is running; the owner merges #263.

**D121 (10-06), owner: «Текст утверждаю», «263 можешь мерджить сам, если там всё ок», «дообучение gemma4 21 ГБ можно удалить».**
- **NPC lifecycle norm approved:** new §15.3 of `npc_autonomous_decision_contract.md`.
  - Corrections: add the stored-note sentence (D119 p.6); «обязательство», not «долговременное обязательство».
  - Also approved: the background→scene conditions and demotion for all levels.
  - Next: CORPUS_EDIT with a fate map (#262) plus CA.
- **#263:** I may merge it myself when CI is green.
- **gemma4 deletion:** permanent deletion is done by the owner himself (safety rule). The tmux gpu-temp-log runs `/root/gemma4-russian-literary-finetune/scripts/log_gpu_temps.sh`, so warn him first.

**D122 (10-06), owner: «Решения по семье и двору — все семь да».** All seven `npc-family-design` decisions accepted (#259):
1. `@rus/actors` owns household, members, kinship and seniority.
2. Seniority is not age.
3. A household may own items via items-property; holder and controller stay separate.
4. Speech changes via relation, approved address forms and register (D94).
5. Data approval order: roster and relations, authority, property, honour and hospitality first; then stocks; marriage and inheritance only with confirmed rules.
6. Family facts go to knowledge (#220); heard facts go to #221.
7. First version: stable household, members and relations, authority, item rights.

Next: `ap-households` (independent sol approval) and `npc-family-norm` (norm draft + CR + fate map; text to the owner first).

Gemma: the owner keeps the GPU logger script; I gave him `rm -rf outputs data .venv` inside `/root/gemma4-russian-literary-finetune`. Logs and scripts stay, because the logger writes `logs/gpu_temps_literary_v4_20260831T0045.csv`.

**D123 (10-06), owner: «По контракту двора предлагаю дождаться исследования».** The family/household norm text and new contract (`npc-family-norm` draft) wait for `family-household-research`; after it, the draft is reconciled with the findings and goes to the owner again. `ap-households` continues.

**D124 (10-06), owner: «По двору, там где нет источников - делаем игровую реконструкцию. Важно показать полноценный мир без дыр».** Answer to the family research question (4 decisions + 3 refinements).
- **Replaces my decision 3** («честно сохранять неизвестность»). Where sources are silent (household size, marriage age, inheritance, local demography), the game reconstructs: plausible values consistent with what the sources do give; sources always win where they exist.
- Every household is complete at start: people, relations, authority, property. No «неизвестно» holes for the player or the model.
- The «reconstruction/calibration» mark stays internal (D71, D72): data and checks only, never player- or model-facing.
- Decisions 1, 2, 4 and the three refinements were not answered explicitly. I fold them into the norm text, which the owner approves anyway. «15–24 человека» is not a historical norm but may be a game calibration value.
- Next: `npc-family-norm` revision → owner approval → household data rework → re-approval.

**D125 (10-06), owner: «Распространяется. Добавь ещё военные дворы и взаимоотношения и городские».** Answer to my explicit question whether D124 covers marriage and inheritance rules.
- **Yes, D124 covers them.** Where sources are silent, marriage age and inheritance order are game reconstruction: explicitly approved calibration with an internal mark. This supersedes the narrower reading of D122 p.5 («only with confirmed rules» = confirmed by approval, not only by sources).
- **Scope added:**
  - military households and their relations: the prince's court and retinue (druzhina, grids, otroki), boyars' armed servants, the town militia (tysyatsky, sotskie), service as a relation distinct from kinship;
  - urban households and relations: street (ulitsa), end (konets), hundred (sotnya), veche, merchant and craft ties, hired people.
- Next: research extension `family-military-urban-research` (sol-led, starts from the family research outputs and existing evidence), then the norm draft gets these parts, then the owner approves the text.

**D126 (10-06), owner: «Подумай, какие ещё вещи у нас не описаны касательно взаимоотношений и дворов и тоже добавь».** Research `family-military-urban-research` covered military and urban households plus a gap scan of all relation kinds (87 kinds, FMR-01…14).

**Owner via the helper session (10-06):** extend the household audit into a full audit and game reconstruction of society: «устройство общества, связи и прочее». The helper's proposal is at `/srv/novgorod-work/tmp/review-helper/society-audit/proposal.md` (five layers: standing, institutions, relations, economy, norms). Phase 0 `society-audit-0` started (read-only).

**D127 (10-06), owner: «1. Да, issue обязательно. 2. Да. 3. Да. 4. Да. 5. Да.»** All five society decisions accepted:
1. First version = society as a static state at game start: every NPC has standing, household, relations, office and duties; every place has its institutions. Processes come later (courts, assemblies, debt collection, changing prices, events). An umbrella issue is mandatory. This also answers the family V1 question: FMR relations go in as static state.
2. One guide map «устройство общества» plus active contracts at each owner (actors, social-law, economy, items-property).
3. Economy: static anchor prices and trade now (#184 option B); causal economy later.
4. Time: world state on the start date; the 1228–1230 events are past facts, not a running timeline.
5. Approval of reconstructed data: Codex sol interim, Opus final on a sample (D88).

**D128 (10-06), owner: «Решения - по рекомендациям. Текст утверждаю».** This approves the norm text «Семья, двор, старшинство и связи NPC» (npc-family-norm `norm-draft.md`, DONE-6). The approved text is the version I showed, with «не показывается игроку или модели» restored (D71/D72).

All 9 open questions follow the recommendations:
1. The prince's men: each has his own place and provisioning; there is no common court and no common ration.
2. A brotherhood (братчина) exists only when named, in a concrete plot.
3. Ivanskoe sto: only the concrete members a scene needs; the late statute is not applied to 1230.
4. The bishop's court: only concrete people and a house, no template.
5. Fishing camps and work gangs (ватаги): concrete ones only, D124 reconstruction.
6. Outcasts (изгои): a named church-protection relation in a concrete case; not kinship and not lifelong dependence.
7. Godparents (кумовство): an optional named relation with no automatic duties.
8. Sworn brotherhood (побратимство): an optional named relation, only in a named case.
9. «Огнищанин»: both meanings are kept separately, by source and context.

Recorded in #133 (comment 6021565957).

Next: the executor applies the decisions → a new contract under @rus/actors via CORPUS_EDIT with CA → household data rework (#259, #338).

**D129 (10-06), owner: «Да, согласен».** This answers my question at the final item-category list. The mapping is approved: 13,765 items in 20 sections, 390 excluded.
- Until an item's own name is approved, a kind-less item shows its section's generic name (D92/D103). In «Упряжь и повозки» that makes 38 items (boat, cart and sledge parts) show as «упряжь»; only about 5 of them are real tack.
- Decision: approve the own (literary) names of these 38 items. This is the first batch of a general item-name approval.
- Task `item-names-tack`: candidate names → sol approval → Opus ap-final.

**D130 (10-06), owner: «Да, согласен. Проверяй провод, экспериментируй с промптом. Манера речи очень важна».** This answers the n1 bench result. Three blind judges, 384 stories:
- B1/B2 (D100 layered manner) failed every pre-set threshold. Recognition stayed near chance; naturalness and relation were worse than A; invented details were 2–3× more frequent; there were anachronisms («сударь», «ваше благородие»).
- The reply to a senior often equals the reply to a peer.

Decisions:
- do not activate N1 v2; keep the current manner A;
- audit the wire of the NPC speech roles: what the model gets about manner, the addressee relation, the address form and the register (D122/D128);
- prompt experiments are allowed. The usual gates stay: BENCH-PLAN on my BENCH-OK (D83), prompt review (D81), CA.
- Manner of speech is a high priority for the owner.

**D131 (10-06 ~20:20Z), owner, relayed by the review helper; I did not hear it directly.** Quote: «Мне нравится этот вариант… Это как раз разгрузит ведущего и позволит нам разгребать завалы».
- The variant: the helper prepares fleet task drafts for open issues that have no task (215 at the time) and checks for duplicates, existing tasks and decisions already in the norms. I review each draft and launch it.
- The helper never runs fleet new/run/queue/say, so D85 holds.
- Drafts live in `/srv/novgorod-work/tmp/review-helper/task-drafts/<id>/` (TASK.md, launch.sh, why.md) with INDEX.md.
- My limits: at most 3 helper tasks running at once. Areas owned by active tasks are off-limits.

**N1 correction (10-06 ~20:35Z, found by the review helper on the owner's question).** The N1 v2 bench sent the addressee relation only as the English code `social_context.addressee_relation = peer|senior`; the responder system prompt never mentions it; there is no addressee identity; the relation was synthetic (cases.json:355–370). The approved channel (address_forms.csv per speaker→addressee pair, short Russian guidance; A-n1-manner-speech-02) reached no arm.
- So the "relation" axis measured a factor that was nearly absent from the input. B1/B2's failure on that axis says nothing about the model. D130 (do not activate N1 v2) stands; the reasons need re-evaluation.
- In v17 all 12 start NPCs have empty relationships (n1-wire scan), so the wire carries no relation data at all.
- Lesson recorded in team-process §3 (every measured factor must be in every arm's input).
- Tell the owner that my 10-06 N1 report overstated the model's fault on the relation axis.

**D132 (10-06 ~20:40Z), owner, relayed by the review helper.** «Да, по всем трём пунктам согласен» to the N1 fix plan:
1) wire and data first, then a new bench;
2) the bench-plan check rules go into team-process and HOW_WE_WORK §11;
3) re-check the earlier N1 axes (standing, temperament) against a factor matrix.
NEW RULE, verbatim: «закрепи правило — обязательно перед запуском стенда ведущий должен смотреть, какие данные, в каком виде, как и куда передаются. Мы уже не в первый раз на этом обжигаемся и это уже упоминал. Удивлён, что вынужден напоминать вновь».
- I read the wire myself before EVERY BENCH-OK: which data, in what form, how and where.
- The basis is `wire-review-<bench>.md`: full system + user + params per arm and per case, the factor matrix and the paired-case diff.
- The BENCH-OK carries its SHA-256 plus four lines «данные / вид / путь / куда» in my own words; without them it is invalid.
- Rule text: team-process §3 п.2 (added by the helper); HOW_WE_WORK §11 (docs edit pending).
- The bench tool must refuse a run without a matching WIRE-REVIEW-SHA256; that is a fleet-tools task, drafted by the helper.

**D133 (10-07), owner, relayed by the disk/load helper.** Quote: «можно пробовать и sol там запустить, может она не будет сильно есть лимит».
- Sol on acct2 is allowed as a trial, so the D52/D54 "sol only on main" rule is lifted for acct2 under measurement. Credits on acct2 are still never spent.
- bin/fleet (~line 324) forces non-luna to main. The trial needs an opt-in flag per task, edited only with the tick stopped. Run one sol task on acct2 and measure the 5h/week window % per run before widening.
- The disk/load helper tracks acct2 load and reports idling to me.

**D134 (10-07 ~21:45Z), owner directly: «Фаза 3 да».** Society audit phase 3 (#338: game reconstruction without holes, D124/D125) is approved after the phase-2 summary.
- Phase 2: society-research-2, 64 gaps → 61 proposals; Opus PASS_WITH_NOTES, r7/r8 fixes.
- The #338 rule applies: no new data without a named game consumer and an import path.
- Order: plan task first, mapping each proposal to a dataset, consumer and import path and splitting by layer. Then luna armies on acct2, then approval (sol → Opus sample), then import (phase 5).
