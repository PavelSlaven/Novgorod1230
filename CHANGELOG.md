# Changelog

## Unreleased
- test(spatial): the perception reload regression creates prior NPC perceptions with a real turn and real recognition, so the persisted body history stays consistent; the saved name is kept per NPC against a generic fresh label (#377, D84)
- fix(runtime-catalog): cache successful G4 projections and approved place-label validation (#527, #513)
- fix(body-state): bind approved satiety and awake-energy profiles to elapsed v17 activity time (#244)
- fix(llm-runtime): use neutral LLM_* deployment settings with Qwen default and fail closed without endpoint (#237)
- fix(spatial): evaluate prepared destination visibility with the root post-turn clock (#227)
- docs(tech-debt): record continuation route menu pending exit-one-action; LW-128 added (#227)
- fix(npc-runtime): apply D87 day-type selection to D-1 schedules (#98)
- fix(local-play): v17 slice acceptance requires a visible people panel for meet, a committed readable NPC answer for talk, and prior talk at the current place for take/make; D49 minimum is additive (#98)
- data(spatial): world-routes b2 candidate and generator with 24 cross pairs @2, Opus APPROVE_WITH_LIMITS and M1–M5 mechanical continuation; draft for b2 runtime reader (#98)
- fix(turn): repeated NPC waits pause the fire-rest schedule; first ordinary search after seed-only preflight costs 15 minutes under the shared plan-binding predicate; NPC inspects an available committed item by ref (#98)
- fix(turn-step): committed S1 resolutions stay visible at the formal destination after the move (visibility-only projection; no planner capability marker) (#98)
- feat(opening): opening narrator gets a compact Russian projection without ids or service fields and Russian instructions (measured arm P, D80); every Temporal day/light phase translated, held items keep «при вас» and condition, unknown values fail closed (#98)
- fix(npc): seasonal routine compare-and-set anchored on the schedule proof of the turn; destination visible NPCs captured from the admitted projection; LW-127 added (#98)
- fix(slice): v17 slice driver seeds the walk chain from the position before the turn and follows multi-step exit chains (#98)
- data(v17): 34 connection labels of the v17 start territories name the route line («Уйти по глинистой тропе») instead of «Проход N»; Opus approval, 4 rows withheld (#160, D49)
- fix(slice): v17 slice driver counts walk progress only on a site change, recovers pending presentation like the web client and keeps pre-repair opening prose in the trace (#98)
- fix(turn): world_process_step drops only exact duplicate facts, so a negated or conditional fact no longer hides the code-owned process state (#230)
- fix(npc): preserve model speech claims through required conversation assembly so the grounding audit receives them (#230)
- fix(npc): clarify that claims describe factual assertions, not NPC uncertainty or personal stance (#230)
- docs(tech-debt): record rejected NPC conversation projection; LW-129 added (#230)
- fix(wk): remove context_text, max_context_chars and omitWorldKnowledgeContextText from the World Knowledge wire (#98)
- fix(test): remove temporary fixture directories after tests, including setup failures (#231)
- fix(test): route Russian opening writer and audit fixtures by payload shape (#98)
- fix(game-base): sort builder file scans and pin sort locale; two-environment byte determinism check (#201)
- fix(turn): project world_process_step input to qualitative facts and opaque choices; keep runtime refs, versions and quantities server-side (#230)
- docs(tech-debt): LW-124 Julian leap-day inverse gap recorded; closed by the calendar fix in the same merge series
- fix(time): account for leap days in inverse calendar projection; recalculate historical profile derivations; LW-124 closed
- feat(materialization): O1 v1 — approved applicability selector (75 rules, 4 tuples) makes template closure strict only for the selected tuple and rule; everything else keeps the generic presence path (#133)
- feat(economy): pure @rus/economy owner — exact rational currency conversion by approved region/date/unit rates, one final half-up, unresolved/conflict/invalid outcomes, local-sum render without rates or metadata; no wiring yet (#184)
- docs(corpus): §9 adds exact scoped currency conversion and confirmed local-sum handoff (#184)
- feat(materialization): O1 typed-gap seam — first-arrival item rules can require template-backed item refs; a rule without a template yields a fail-closed typed gap before seed and RNG; zero or missing discovery weights are a typed gap; the wave validator rejects non-array variants (#163)
- docs(tech-debt): record seasonal NPC schedule handoff gap; LW-123 added (#98)
- docs(corpus): D72 — чистота служебной маркировки в model-facing и отображаемом тексте; правило публичной границы и ссылка Narration/UI в CONTRACT_INDEX (#98)
- docs(docs): добавлены шаблоны ADR/MODULE, навигация каталога стендов и уточнения текущего среза (#112, #121, #181, #216, #228)
- fix(game-base): make generators reproducible from tracked inputs and add read-only `--check` support (#201)
- docs(governance): PC §8.1 — a scenario is a plot laid through the free world: it defines only plot NPCs, facts, scenes, items and completion; it owns no mechanics (time, body, combat, checks, perception, conversation, knowledge and lies, materialization, ownership, movement stay with their general owners and work the same inside and outside a scenario); finishing a plot does not end the game (owner decision D66) (#226)
- docs(governance): PC §4/§9.1 — anachronism is excluded only from world stock; an actor’s making and invention are decided causally (materials, tool, skill, workable process), not by an anachronism list (D59) (#218)
- docs(sprint, process): CURRENT_SPRINT and HOW_WE_WORK brought to owner decisions D51–D57 and the next step of the D49 slice (#217)
- fix(turn): gate2-2 intercepts reality-limited achieved empty direct plans before semantic audit, cleans repair-selected not_achieved metadata and traces only accepted-attempt canonicalizations (LW-103 updated)
- feat(perception): D66 issue #225 v17 post-action perception path; profile approval pending (#98)
- fix(test): PostgreSQL test containers are awaited over TCP (pg_isready -h 127.0.0.1) so the temporary initdb server is no longer taken for ready; fixes Stage24 line 92 and the same race in 26 fixtures (#98)
- fix(test): orphan test-container reaper is PID-namespace aware — removes only dead owners from its own namespace; foreign-namespace, legacy pid-only and unreadable owner labels are kept (fail-closed), so parallel PG runs are no longer killed (#98)
- data(start-types): D62 — сад, бортничество и каменоломня «не применим по имеющимся данным», песок — кандидат; evidence-tooling; только кандидат, без активации
- fix(materialization): D59 filters needs_check only in O1/O2b/S1, preserves player actions and authored O2a, replaces matching NPC A1/create_entity/O1 proposals with wait; LW-122 added (#98)
- data(game-base): names-gaps D61 follow-up — exact candidate coverage, authoring checks and current draft/gap status (#98)
- docs(changelog): восстановлена запись о ранее выполненном закрытии LW-112: исходы людей первого прибытия теперь фиксируются в агрегате присутствия; LW-112 closed
- fix(spatial): rt-lines a5 — turn-back after a pause also allows interrupted_at_anchor/stranded and keys on travel-state status (refusal = turn_back_refused), no resume after returned_to_departure, zero-progress pause is no transit (Spatial 4.7.0 §4.10.1/§10.7.1/§10.8/A.4.1/F.1.1), A.4.1 gates synced in state-machines.js, line kinds are `line.*` with a vocabulary check, LINES_WAVE_MANIFEST repinned, gate test on attestation v6/224 tables.
- fix(spatial): rt-lines a6 — outcomes of a turn_back interval follow the direction after commit (mirrored true: returned_to_departure; mirrored false after a repeated turn back: segment_completed; interrupted_at_anchor/stranded on both sides), Spatial 4.7.0 §4.10.1/F.1.1, specifications regenerated, norm-text tests.
- fix(spatial): rt-lines a7 — a pause or interruption at progress zero after the start commit closes as interrupted_at_anchor at the departure endpoint (execution waiting_at_anchor, resumable, replay-safe), Spatial 4.7.0 §4.10.1/§10.8/§10.9/§11.6/A.4.1/F.1.1, A.4.1 gate synced in state-machines.js, norm-text tests.
- fix(spatial): rt-lines a8 — line kind profile edges use controlled_dependency_role values (route_kind excepted) with a validator check, the m2c_lines_v1_candidate source record names its approver (Opus a2) and is no longer marked unapproved, manifest and LINES_WAVE_MANIFEST repinned; orientation edge not added (no authoring version of the target).
- docs(corpus): rt-lines — Spatial 4.7.0 amendment revised before its code stage (D3, D56): no 30-minute segment ceiling and no `max_segment_minutes` (recheck slicing rule, `line_recheck_slicing_missing`), availability optional on a canonical connection binding, turn-back mid-segment (`returned_to_departure`), `fixed_time_interval` recheck policy (new contract blocks only in Appendix F.1.1: Appendix B and Temporal A.6 untouched, historical 4.2.0/4.3.0 snapshots byte-identical), stale v17 visibility text removed; contract specifications, typed errors and matrix regenerated (LW-097)
- data(spatial): rt-lines phase (а) step a1 — m2c-lines-v1 candidate (binding@3 with Spatial 4.7.0 line fields for all 454 local lines, names from the Opus-approved line-names, 8 line-kind profiles, swim alternatives for water kinds; D56: no length ceiling, long lines sliced by the kind's recheck policy) and its generator `tools/spatial-v3/build-line-wave.mjs`; not approved, not imported; world_base part 30.sql (line kind profiles, alternatives, line columns of bindings and segments; 222 -> 224 tables), import manifest m2c-lines-v1-import-manifest.json (draft, insert-only; pinned in bootstrap, not imported before the cutover) (LW-097 progress)
- data(game-base): D53 ferry-guard — the crossing guard is removed from pf_ferry_landing and pf_winter_ice_crossing (D-2 group, 6 schedule rows, 7 relationship rules, 14 address forms), the ferry post names the ferryman only, the term "сторож брода" is marked not attested; wave regenerated on pin 81d96576 (relationship 53→46, speech 98→84, schedule 167→161), people-d49 without the guard gap, both re-signed by Opus (APPROVE_WITH_LIMITS, wave attestation 4ca7a255); LW-121 added
- fix(test): local-movement acceptance keeps occupied passage listed, checks typed refusal and reopening (#216)
- fix(spatial): rt-lines — phase 0 (LW-097): poor visibility no longer hides lines (§7.1.1, only concealment does), the screen of a local move shows the passages of the arrival position instead of the position left ("Проход 2" with no operation), passages stay out of the narrator input; LW-097 progress note
- data(game-base): needs_check queues block generation — only anachronism doubts, per region and period; regional presence stays informational; fail-closed matcher in runtime-catalog, snapshot v2, Opus-approved classification 8/29 (D51 p.3) (#215)
- fix(items): A1 make works at places reached by walking (rt-make) — result destination on the scene position when the party has no g5 anchor, planner rule names `partial_transformation` and an allowed form, one repair for an invalid `physical_form`; LW-100/LW-103 updated, LW-118 added
- data(people): D49 minimum-one people — D-2 thresholds for pf_riverbank/pf_rural_yard/pf_village_lane (game-base pin c79852e7, wave regenerated, presence_rules 5740→5737), m2c pack v2 adds ferryman/householder/household-mistress profiles, clothing d2, canonical regional context (g4-only), fisher/servant v3 and G4 vikhtuy_locality min_count 1; crossing guard stays a gap (occupation not approved); approvals and request attestation pending
- fix(ux): first screen of the v17 start shows the visible passages (connection disclosure of the same visibility owner as a turn, canonical connections only; the provider gets the world-base reader), refused turns with nothing committed reach the player as typed `TURN_NOT_SAVED`/`WORLD_ACTION_UNAVAILABLE` (409, safe text) instead of a masked 500, neutral text for an unachieved direct goal (rt-ux)
- feat(people): rt-people — канонические места маршрута получают людей при первом прибытии: состав D-2 по place family и правила присутствия занятий/ролей (`decidePlacePeople`, `compilePlacePeopleBindings`, `readPlacePeopleClosure`), создание тем же писателем, что у сгенерированных мест; дыра данных никого не создаёт и пишется в `trace.first_entry.people.gaps`, прибытие не падает; regional context применим по `g4_ref`; исходы правил `occupation`/`social_role` пишет движок R-2a в агрегат `presence_resolutions`; профиль с одним значением `payload.actor_applicability.sex_category` задаёт пол; версия одного id профиля — новейшая утверждённая (норма корпуса); fix(spatial): видимый контекст отдаёт возраст `young_adult` как `young`; LW-113 added LW-114 added LW-115 added LW-116 added LW-117 added (rt-people)
- data(game-base): separate personal-name pools per people (D51) — Gotland and German guests, Korela, Izhora, Chud/Estonians, Smolensk guests; the Novgorod pool keeps only pp_novgorod_rus; Valit (Korela, 1337/38, significant) added, Igoland a typed gap; Opus approve_with_limits (names-foreign)
- fix(npc): rt-names — the people-data context `m2c_npc_regional_novgorod_land_d2_v1` is bound to the Novgorod name pool, so ferryman, householder, household mistress and the v3 fisher and servant get a name and a character; `npc_identity_import` request rebuilt (one more binding row), test on the real people-data profiles
- fix(npc): rt-names — the `npc_identity_import` request follows the per-people name pools of #214 (D51): 7 pools, 337 name rows (Иголанд removed, Валит added), only the Novgorod pool and its 266 ordinary entries approved; new request digest, review request regenerated (#214)
- feat(npc): rt-names — NPC get a name and a seeded character: world_base DDL `29.sql` (name pool key `(pool, form, sex, people)` and sex/people/class/status columns, context name bindings, D29 scale entries, occupation goal/fear items, provenance on the three new tables; 219→222 tables, 29 parts), v17 bootstrap stage `npc_identity_import` with a pinned request (candidate, attestation by the reviewer) and repinned schema fingerprint chain, `bundle.npc_identity` from the actor bundle loader, `identity_state.canonical_name` (null for contexts without a pool) and `semantic_state.character` (1 temperament, 2 values, 1-2 goals, 1 fear) from `materializeApprovedProceduralNpc` on separate seed streams, `name_profile_snapshot` at generated first entry; fresh-schema-request rebuilt for the reviewer's v5 attestation, schema reference generator understands UNIQUE drop/add; foreign peoples get their own pools (D51, their ordinary names stay draft), same-scene duplicate names and incomplete character data are open (#133) LW-107 added LW-108 added LW-109 added LW-110 added LW-111 added
- data(m2c-place-coordinates): authored game-map reconstruction of the start cell (32 G4 sectors, 195 G5 points and footprints, water bodies with width and current, shorelines, 49 route traces, topology valid with 0 exceptions) and a derived report of compass and river directions and proposed minutes for all 540 lines; approved with limits (Opus, 93206de2; F1/F2 mechanical continuation 540420fe); authoring input only, runtime and spatial-v3 unchanged, minutes are a draft for a Spatial CR (place-geo)
- feat(local-play): `npm run play:v17-slice` — tracked Linux driver for the live D49 slice run (Docker PG v17 bootstrap, real Qwen root, loopback HTTP, legs start/walk/meet/talk/take/make with SQL snapshots, `report.json` + playtest skeleton, always-cleanup); the presence e2e fixture bootstrap can run without a test context (rt-harness)
- data(game-base): D-rated review step 2 — imported walnut, cast copper snake amulet, imported cotton cloth, common buckthorn, Zverin convent included from indexed sources; katana, chintz and local rice as dated denials (#213)
- data(game-base): D-rated exclusions reviewed under D38 — risk-only rejections to structural needs_check queues, denials only for dated anachronism or physical impossibility, HW009 variant from the manifest (#212)
- fix(items): take from finite natural sources works on v17 — planner rule for `ordinary_resource_source`, code-owned grounding and finite-only seed, `finite_source` causal basis, spatial-v3 inventory load, resource-node physical key; A1 make works at canonical places (v5 inventory profiles, plan-profile pins) with a class-rule applicability file and canonical commons finite sources, both approved with limits (Opus, 81fbe5b7) (`a1-applicability-class.json`, `canonical-finite-applicability.json`); LW-100..106 added (rt-items)
- ci: гейт-job `full-npm-test` в `test.yml` (needs `full-profile` + `evidence-only`, `if: always()`) — зелёный только при успехе всех пяти suite, включая p12, и evidence-only; обязательная проверка main отчитывается после слияния PR #98, защиту менять не нужно (D51) (#98)
- fix(test): два красных теста CI PR #98 — `architecture-soft-limits` теперь утверждает отсутствие размерных проверок (порогов нет по решению владельца, AI §16, #208), а `m2c-presence-ddl-postgres` применяет все `world_base/schema/NN.sql` (28.sql добавляет 2 таблицы, 219) и ждёт PostgreSQL по TCP (#98)
- fix(conversation): rt-talk — a person met on the way is a conversation partner: `loadPhase2State` now reads the NPCs of the player's current site from `party_npcs` + placements (with `position_id`, `g6_instance_id`, `scene_position_g6` map; never persisted: every snapshot writer drops them) — before, generated-site NPCs were never in `state.npcs`; presence is the same G6 (position first, anchor only where a G6 is unknown, never null = null), one rule for partner selection, phase 3 admission and audience/nonverbal/evidence perception; conversation location falls back to the site when the position has no `location_ref`; neutral conversation sets `first_contact_introduction` on the first greeting and projects `semantic_state.character` into `social_context.npc_behavior`; prompt: exact self-introduction form, one sentence on temperament/values; frozen NPC responder fixtures regenerated; PG proof on a real v17 party (`test/spatial-v3/scene-npcs-v17-postgres.test.js`); LW-098, LW-099 added
- fix(spatial): rt-walk — вычислитель условий доступности по утверждённой политике (5 наборов = open, свет и видимость не закрывают, неизвестный набор = gap; допуск и recheck требуют `status: open`); нехватка метода движения блокирует только свою опцию планировщика (`movement_capability_missing`, метод в diagnostic), активация не-ready опции — типизированный отказ, контракт p18 изменён; LW-091 closed, LW-094 added, LW-095 added, LW-096 added (#98)
- feat(spatial): переходы между каноническими местами одного G4 (старты Вихтуя больше не тупик): связи `canonical_g5_connection_bindings`, `prepareCanonicalConnection` (P16 `resolve_frontier:canconn:…`), команды подхода и перехода, подписи `Проход N`; LW-091 added, LW-092 added, LW-093 added
- feat(m2c): canonical-walk G6 ambient baselines (147 rows) for the destinations of canonical G5 connections, coverage 195/195 target×slot; generator `scripts/promote-m2c-acoustic-packages.mjs` (base + approved packages → approved acoustic dataset, authoring versions, manifest, capacity-v2, P12 request); P12 request `m2c-p12-v17-walk-acoustics-v1` (12653 rows) — только свежий bootstrap: пересоздайте локальные пары `novgorod_world_v17` / `novgorod_party_v17`, живая v17 не догоняется (D27) (#98)
- fix(narration): rt-narr — a committed turn no longer waits for a next request to get its text (one in-request narrator retry, two passes total; recovery survives an ended turn budget), the first screen retries a Stage 23 handoff refusal once with one repair per request, `movement_blocked_reason_code` is committed by code only (none for occupants the actor does not perceive), movement buttons in game-web; LW-082 added LW-083 added
- feat(v17): D27 — the standard bootstrap imports the m2c NPC wave (stage `m2c_npc_wave_import`: pinned request, independent attestation in a sixth file `m2c_npc_wave_import.json` for `--run`, exact readback); p12 now runs in its own CI job; PG fixtures no longer import it themselves — пересоберите локальные пары `novgorod_world_v17` / `novgorod_party_v17` (#158) LW-035 updated LW-076 updated LW-077 updated LW-085 added LW-069 closed
- data(m2c-wave): m2c-npc-wave v1 regenerated on game-base pin 27bd6134 (#209): legacy region ids gone, 1236 environment presence rules excluded by the generator, approval.json awaits reviewer re-signature (`resign_required`); D27 stage not wired yet (#158) LW-084 added LW-077 closed
- fix(combat): weapon classification role returns only qualitative_class, code sets schema and request_id; LW-081 added (#188)
- fix(m2c): R-2a presence first arrival on target v17 — пересоберите локальные пары `novgorod_world_v17` / `novgorod_party_v17` (`bootstrap-live-world-v17.mjs`); штатный bootstrap без D27 даёт пустое presence на всех 7 стартах (typed `presence_gap` только в диагностике resolver/provisioner, в БД не пишется; старт v17 выбирается по `catalog_id`, не по `binding_revision`), m2c-npc-wave в production не импортируется (#158) LW-035 closed LW-071 closed LW-077 added LW-078 added
- fix(llm-runtime): `normalizeExecutionLimits` treats `requestTimeoutMs` as a ceiling (`Math.min` against the 120 s default) instead of always overwriting it, so the remaining turn budget survives the provider request timeout; a provider timeout under a budget-clamped `requestTimeoutMs` now reports `LLM_TURN_BUDGET_EXHAUSTED` instead of a generic provider timeout (#98)
- docs(spatial): CR #160 REVIEW-B1-CA-2 cleanup — restrained-actor refusal pinned and described, LW-080 added (occupancy refusal only at step 1; approach path over raw edges after the first step), private host paths removed from reports (#160)
- fix(data): CR #160 labels REWORK — one neutral approach phrase (`подход`) instead of the water/land split; stand 14/15 + 6/6 (#160)
- fix(spatial): CR #160 REVIEW-B1-CA F1-F14 — occupancy travels as `visible_status` and counts only perceived occupants (movement owner still decides the attempt via a server-only `attemptRefusal`); approach first step only from the local-scene owner's options; approach wording and the occupied text are approved data (`passage_phrases`, digest test instead of a runtime gate); turn outcome by structural grounding, not `reason_code`; one eligibility reader; validator provenance from the repository; restart test for the generated case; playtest report split; LW-075 extended, LW-079 (renumbered) with paths (#160)
- fix(spatial): CR #160 B1 step 7c — a not-yet-at-departure actor is offered the first local hop toward a reachable exit ("к руслу — подход к переправе", same local-scene owner, structurally distinct via route_ref); crossing stays departure-only; destination projection no longer fails on edges the admission owner has no row for (was the real cause of the denied crossing); exit-to-slot map now reaches the disclosure owner so the pass-target text reaches planner options; live run closes B1 (approach → crossing → restart → re-entry) (#160)
- fix(spatial): CR #160 B1 step 7 — pass-target exit description now shows at any visibility above `'none'` (was `'clear'`-only); ambient landscape `stable_cover` is `'partial'` for most of the map, so the old threshold made the description unreachable by player movement almost everywhere; found via live playtest (PLAN-OK-B1-step7)
- docs(legacy): LW-079 added — narration-audit can reject prose twice after a committed turn, leaving the player without text (owner #158 R-3), found by the same B1 live playtest (#160)
- fix(spatial): CR #160 B1 part 2 — occupied local edge status comes from the movement admission owner and reaches both the planner's visible option text and the route panel (same suffix, one source); LW-031 closed, LW-075 added (#160)
- feat(r1b): world_base 28.sql D-1/D-2 datasets, wave 11 tables, composition-over-presence validator; pin 337abf9e (#158)
- fix(r1): REVIEW-R1-fix-4 — approval identity, manifest_path, schema_version; internal readback symbol; LW-076 (#158)
- fix(r1): REVIEW-R1-fix-2/3 — wave bundle by table set, fail-closed approval fields, nodes closure required, positive PG on approved copy; LW-076 (#158)
- test(infra): opt-in NOVGOROD_TEST_DOCKER_APPARMOR_UNCONFINED=1 runs throwaway PG test containers without AppArmor (servak: AppArmor 4.1 + Docker 26.1 block unix sockets)
- docs(plan): находки восприятия 2026-09-28 — M2c: скрытое надетым (волосы под убором), частичная видимость; M4: подключение восприятия NPC; LW-074 added (#158)
- fix(r1): REVIEW-R1 — wave PG readback/negatives, approval fail-closed, people allowed_times, CI P12 postgres, generator pin from approval; LW-076 (#158)
- fix(r1): REVIEW-070d2 — chain ledger через `runSpatialV3TargetMigrations` + composite `beforeCommit`; restart skip без дублирования цикла DDL; acceptance fresh pools per restart; encoder close on startup failure; phase-11 test1 limit 450s; PG chain-ledger tests; LW-070/073 (#158)
- feat(r1): REVIEW-070 / PLAN-070b — variants objects in m2c generator @ `367a88c0`; D-3 npc/speech datasets; 27.sql UNIQUE+CHECK; corpus §3A.1/§3A.4/§8.1; fresh-schema request rebuild; generator fixture+tmpdir determinism; LW-073 (#158)
- feat(r1): REVIEW-069b п.3 — prose §3.1 thresholds; presence_rules `item_ref`/`variants` + §8.1/C12 rule-cause; m2c-npc-wave dataset generator @ `b1f249de` (#158) LW-072 added
- fix(r1): REVIEW-069 — explicit schedule projection columns instead of `SELECT *` and first-row slice (party-store owner, `candidate_profile_refs='[]'` checked); same column list in phase-2 temporal state; behavioral PG immutability test (error text, positive control, 23505/23514, 012–037 через раннер); `source_commit`/review.md tests; primary/secondary subjects keyed without region (LW-066); narration MODULE repair-then-fail-closed order; game-base-v1 files reverted to Codex state; fullsuite schema pins 217/133 (#158)
- fix(r1): REVIEW-067 — Lower Dvina projection ignores post-snapshot schedule columns (037 `candidate_profile_refs`); presence equal-season conflicts; fresh-schema CI/source_commit/review.md; PG behavioral DDL; prose index/MODULE/LW (#158)
- fix(r1): REVIEW-066 — party-store SCOPE_KINDS from contracts (g5); presence-rule negative validation + tests; LW-071 (#158)
- fix(r1): CR #158 REVIEW-065 — party weather log numeric timestamps; fresh-schema rebuild+test; presence primary/secondary+season overlap; `wild_arrival_cause` TEXT; corpus/LW/CHANGELOG sync; PG DDL test; attestation withdrawn (LW-069/070) (#158)
- feat(r1): CR #158 DONE-065 — CORPUS_EDIT §3A.1/`place_family` + §8.1 + D25 prose; DDL `27.sql` + party `037`; fresh-schema 217/37; LW-066..068 (#158)
- fix(wk): #153 REVIEW-063 — WK loader selects pack by `packRevision` (v1|v2 closed list); composition passes `release.world_knowledge_pack_revision` so v16 keeps production-v1 (#153)
- feat(wk): #153 step 7 — v17 pins World Knowledge `revision:production-v2` (loader bundle/vectors); v16 keeps `production-v1`; embedding profile unchanged; retrieval benchmark pass (#153)
- data(wk): World Knowledge pack revision production-v2 — D15 access reclassification with strict review, book-sourced claims, in-world law rewrites, 1230 famine claims gated by the event (D19/D22), final WR §21.1 approval of every changed claim, Giga vectors and benchmark; runtime pin is #153 step 7 (#154) LW-060..LW-065 added
- data(temporal-v4): 1230 famine rule re-issued 14.09.1230–31.12.1231 with book 667380 source (D19/D22, #154)
- fix(runtime): commit Gate1 activation-amendment attestation v2; assertGate1Authority runs full validateGate1RuntimeActivationAttestation; v2 forgery tests
- fix(runtime): Gate1 activation-amendment v2 (restart sha drift); fail-closed without attestation v2; LW-055 added
- fix(wk): #153 REVIEW-049 — Core `admittedCandidateRefs` + grounding scores admitted (not vector top-k); `rerank_applied` telemetry; `sufficient_enabled=false` caps SUFFICIENT; C26 single-field loader test; §63/LW-053/054 (#153, PR #98)
- fix(wk): #153 REVIEW-048 — sufficiency_profile mutation kills; owner-server D21 remeasure (GPU/CPU p95 + 120-sit audit ON/OFF) keeps rerank OFF; LW-053 (#153, PR #98) LW-053 updated
- feat(wk): #153 Part C D17/D21 — Core `rerankScores`, gated-off bge pin+provision, SUFFICIENT relevance floor, plan-mode harness in world-catalog-workflow, M16 body-only auth; §49/§63/§74; LW-053/054 (#153, PR #98)
- fix(wk): #153 REVIEW-044 — createTraceTurnRuntime grounder+telemetry wire (B1/B5); provider-failure degrade §73 (B2); F4 post-commit reload (B3); §15 coverage_profiles text; M2b exchange facets; degradation schema (#153, PR #98)
- fix(wk): #153 REVIEW-043 — m2 player WK factory+prepare test (A1); export v17 ports factory (A2); production grounder approved slice (A3); degradation telemetry+TypeError rethrow (A4); split purpose-access-b; §15 D15 align (#153, PR #98)
- fix(wk): #153 REVIEW-042 — durable narrator options (N1); behavioral F4 wire tests; WK catch+trace (N3); F5 punct/ё; frozen collect-all + 3 fixtures; CONTRACT_INDEX §14/67/73/102; LW-049/052 (#153, PR #98) LW-049 updated LW-052 updated
- fix(wk): #153 REVIEW-041 — narration ground-once+degrade; WK on wire; strip auth leak; post-commit authoritative; F5 utterance leak guard; §73/§102; LW-051/052 (#153, PR #98) LW-051 updated LW-052 added
- feat(wk): #153 Part B D15/D16/D20 - npc_decision outside ACTOR_FACING; narration+player interpreter WK wire; player social_role_id→role_ref; contract §14/§67 (#153, PR #98)
- fix(wk): #153 REVIEW-038 — turn historical_events via services 3rd arg; owner clock normalize; MODULE.md services wrap (#153, PR #98)
- fix(wk): #153 REVIEW-037 — drop request_id event Map; explicit historical_events ports; facet present reject; pack validator messages (#153, PR #98)
- fix(wk): #153 REVIEW-036 — party historical_events port; O1 clock through exactModelContext; N-1..N-6 started-historical/v3/facet validator; LW-049..051 (#153, PR #98) LW-049 updated LW-050 LW-051 added
- fix(wk): #153 REVIEW-035 A-01..A-12 — empty started_historical_events; party authoritative factory; O1 clock; facet registry; LF contract; LW-048/049 (#153, PR #98) LW-048 LW-049 added
- feat(wk): #153 Part A D18 — party calendar year, focus date/access filter, started_historical_events, time-events API, contract §13/§14/§53/§54 (#153, PR #98)
- fix(wk): #152 REVIEW-034 — N1 nested production cues; planner_plan vs effective_plan+default_query; real-Core vector-only PARTIAL (#152, PR #98)
- fix(wk): #152 REVIEW-033 — S1/N1/O1 semantic_input text; default-query capped at PARTIAL; disputes count; shared context_text strip; fail-closed encoder; F5 diagnostic/query; contract/LW-047 (#152, PR #98) LW-047 added
- fix(wk): #152 empty semantic_resolution plan -> default Core query; NPC semantic_input text; sufficiency beside verdict; strip duplicate context_text; cache_hit/miss telemetry; contract §50/§51/§60/§61/§63/§85 (#152, PR #98) LW-046 added
- docs(corpus): #146 шаг 4 REVIEW-031 — F1/F4–F6 + LW-039 (KSP сказуемое; ссылки на источник; candidate_hint; v2 выведен из корпуса; source_basis/REFERENCE долг) (#146, PR #98) LW-039 updated
- docs(corpus): #146 шаг 4 — вынос архивных приложений v2 из корпуса; MODULE_RULES §6→AI §10; KSP ordinary LLM/code; LW-039 norms closed (#146, PR #98) LW-028 LW-029 LW-039 updated
- docs(corpus): #146 шаг 3 REVIEW-029 — N1–N4/F13 (немагический мир NPC; полные «не ради…»; combat §40.12; LW-045 уточнён; CR #146 п.11 у «действующий»; INDEX §3) (#146, PR #98) LW-045 updated
- docs(corpus): #146 шаг 3 REVIEW-028 — восстановлены LLM-инварианты из промптов; conversation/repair→схема+владелец; spatial роли; погода LW-044; D9/D14 LW-045; CONTRACT_INDEX §2 метки; проза owner-acceptance (#146, PR #98) LW-044 LW-045 added
- docs(corpus): #146 шаг 3 — промпты→схема+владелец кода; spatial specialization H1; «целевой»→«действующий»; погода D7; проза блокирует приёмку этапа; CONTRACT_INDEX §2/§3/§4 WK/§8.1; LW-042 norms closed on branch (#146, PR #98) LW-042 updated LW-043 added
- docs(corpus): #146 шаг 2 REVIEW-026 — N1–N6/F11 (отслеживаемый в §5/§6/§9; set_entity_mechanics proposal; долг v17 на D9/D14; §17 нейтральный заголовок; D9 в npc §18.1; полная ссылка §3A.7) (#146, PR #98) LW-042 updated
- docs(corpus): #146 шаг 2 REVIEW-025 — F1–F15 (отслеживаемый ≠ significant/D10; O2b D3; subject_kind seed; D9 в схемах; долг v17; informational; D14; LW-042) (#146, PR #98) LW-042 updated
- docs(corpus): #146 шаг 2 — O1/O2b, снятие классового запрета оружия/денег/документов, опознавательный текст и владение (D9/D14), обычный NPC (D1/D8), `subject_kind`, combat/NPC mechanics от кода (#146, PR #98) LW-028 LW-042 updated
- docs(corpus): #146 шаг 1 — политика категорий ACTIVE (восстановлены §10–11.4), нормы наличия в `code_driven` §3A и world-base presence-таблица; CONTRACT_INDEX §4/§5/§8.1; REVIEW-023 (F1/F2/F4: proposed-self-contradiction, меч-в-лесу, facets, LW-008/042) (#146, PR #98) LW-039 updated
- feat(spatial): M2c — authoring профилей расширения G4 и основа atomic generation/traversal (#98)
- docs(context): карты v17, OWNERSHIP/pipelines/plan sync по #145 (#145, PR #98) LW-040 LW-041 added
- docs(sprint, process): CURRENT_SPRINT — решения D47–D50 и срез задач D49; HOW_WE_WORK — модели Codex по D48/D50, слияние data-PR (D45), показ владельцу, размер файла, правила процесса D48–D50 (§10.8) (#211)
- data(game-base): needs_check batch 2, variant material mismatches — point pair decisions with per-item reasons, 37 queued with concrete doubts (imp-variant-mat) (#210)
- data(game-base): needs_check batch 1, hunting/fishing cluster — exact gear/material variants, per-item queue reasons, scoped pair waivers in the ownership checker (imp-needs-hunt) (#209)
- chore(architecture): file-size limits removed; split code by responsibility (AI §16), MODULE_RULES item 7 reworded (#208)
- data(game-base): archive import PR-B for crafts and buildings-interiors — unambiguous decisions only, typed needs_check queue, directed material kinship in the ownership checker (imp-crafts) (#207)
- data(game-base): occupation goals and fears for the seeded NPC character (D49), 265 goals / 158 fears, explicit gaps (#206)
- data(game-base): checker владения архивными id — реестр таблиц, сведение словарей материалов, сверка маршрутов с решением получателя, период вариантов; хвосты одежды и оружия после PR-A (imp-crafts A1) (#204)
- data(game-base): пересобраны устаревшие generated outputs, сняты исключения freshness (#201)
- ci(tools): проба готовности PostgreSQL в тестах по TCP (`pg_isready -h 127.0.0.1`), повтор `docker pull` в merge-гейте, build-status понимает `.cjs`, тест свежести сгенерированных файлов game-base-v1 в `test:game-base` (#203)
- data(game-base): архетип занятий performance_entertainment (гусляр, певец, сказитель), скоморох — точный список занятий; чёрная крыса — редкий завоз по аналогии, общее правило согласованности fauna-групп (D47) (#202)
- data(game-base): один id региона region_novgorod_land, Ладога — subregion_scope=lower_volkhov_ladoga; проверка check-region-ids в npm test (#189)
- data(game-base): импорт архива для оружия и одежды, один владелец на архивный id, усиленный check-archive-ownership (imp-crafts PR-A, D47 п.14) (#200)
- data(economy): D44 — курсы БУЕ, якорные цены c1230, ценовые полосы категорий, стенды C2/C3 (econ-rates, #184) (#196)
- docs(sprint): CURRENT_SPRINT — трек экономики #184, импорт архивов D46, нормы #183, переправа #185, каркас карты #187, стенды #181, порядок data-PR по D45 (#194)
- data(places): правила присутствия окружения по типам мест — общие явления и факты по месту, полное покрытие PF × линза (lw-env, #176) (#198)
- data(world-catalog): связи ресурсов с земноводными, гнездящимися птицами и млекопитающими выведены из свойств видов; дубли грызунов и стартовая среда учтены в проверках (#197)
- data(people): D46 — архивные занятия, роли, темы права и отложенные варианты психологии (imp-people) (#195)
- data(food-drink): D46 — архивные пищевые сущности, варианты и состояния порчи, сезонность блюд по месяцам (imp-food) (#193)
- data(names-peoples): D46 — архивные личные имена, варианты и компоненты с origin-bound проекцией и fail-closed селекторами (#192)
- data(household): инвентарь домов и мастерских, следы быта, возвраты D40 (lw-house, #176) (#191)
- data(names-peoples): компоненты имён, продукты рыб и возвраты D40 (C016) (#186)
- data(resources): метки вещей (D9) и каталог ресурсов часть A — все виды привязаны (B3, #171) (#182)
- data(fauna): способы охоты, сезоны шкур, разделка туш и рыбы (C015, D37/D40) (#179)
- docs(process): стенд — обязательная проверка гипотез вне игры на локальной модели до плана реализации (решение владельца D41): HOW_WE_WORK §11, WORKFLOW, CHANGE_REQUEST и форма CR (поле «Стенд») (#180)
- docs(governance): PC §9.1 — критерий включения в мир и данные: существование, а не предполагаемая польза; наполнение по логике реальности без выдачи за источник (решения владельца D38, D40) (#177)
- docs(sprint): CURRENT_SPRINT — архитектура ресурсов #171 для B3/B4, навыки #170, PR данных #172 → #173, R-1b в #158 (#174)
- docs(process): HOW_WE_WORK — исполнители и их модели, режимы задач, обмен сообщениями, площадка servak и правила исполнителей на ней; CURRENT_SPRINT — задачи M2c B1–B6 по решениям D28–D32 (#168)
- data(world-catalog): игровая база game-base-v1 (кандидаты, 21 группа, STATUS.md) и книжные факты books-evidence-v1 (#155)
- feat(knowledge-source): lexical-only normative RAG; status/priority_tier from CONTRACT_INDEX; `reference` + `reference_results`; independent norm/reference search; drop semantic CLI/readiness fields; CONTRACT_INDEX §5 label align to `ACTIVE SPECIALIZATION` (owner acceptance pending) (#144, PR #150) LW-008 updated
- docs(governance): решения владельца 2026-09-26 — PC §9.1 (наличие решается при первом прибытии; typed gap только для вещей по authority-записи; опознавательный текст вещей не от LLM), WR §21.1 (утверждает старшая модель на высоком reasoning; путь и commit; правка снимает утверждение); HOW_WE_WORK и CURRENT_SPRINT по ним; LW-029 уточнён (#149) LW-042 added
- fix(test): CI 39bfe7c6 — loader-boundary тест `runtime-catalog` знает четыре read-only загрузчика (D-1/D-2, presence rules, category parents), а `m2c-presence-ddl-postgres` закрывает PG-пулы до удаления контейнера (порядок `t.after`, uncaughtException «postmaster exit») (#98)
- fix(test): тестовый `docker run` несёт метку pid владельца (`testContainerLabel()`); контейнеры убитых прогонов удаляет следующий Docker-тест; страж #142 требует метку (#147, PR #148)
- docs(process): обзор HOW_WE_WORK; замысел материализуемого мира (PC §9.1); правила об источниках истины (WR §2), скриптах и имеющихся знаниях (WR §19), утверждении данных (WR §21.1), регрессии плейтеста (WR §22), отчёте gameplay run (WR §24.1 из PR #98) и честности проверок (WR §24.2); поле уровня качества в CR; context dump на ветке этапа; исправлены неверные факты о `legacy/src` (#143) LW-026…LW-039 added
- fix(test): PostgreSQL-тесты удаляют контейнер вместе с anonymous volume (`docker rm -fv`, GS §26); страж в `test:tools` (#142)
- docs(work): CURRENT_SPRINT — Runtime-трек начинается с M2c (#133) по решению владельца (#134)
- fix(game-web): маркер готовности `data-scene-hydrated` у текущего кадра; browser e2e ждёт его вместо устаревшего кадра (#139, PR #141)
- fix(tooling): на Windows `tar` вызывается как System32 bsdtar в p10/p12-инструментах, тестах и staging-скриптах (#126, PR #140)
- docs(policy): KSP L39 — изменённый существующий active-документ сохраняет `baseline_gap`, новый получает `required_before_merge` (#115, PR #140) LW-006 closed
- chore(tooling): `npm run check:syntax` — детерминированная проверка синтаксиса изменённых JS/JSON (#138)
- docs(governance): роутер ведёт World Knowledge через строку IDX §8.1 без особого случая §6/§10; WR §20 требует обновлять CONTRACT_INDEX в том же PR (#111, PR #137) LW-009 closed
- docs(contracts): нормы World Knowledge и direct speech оставлены у профильных владельцев; индекс содержит навигацию и строку World Knowledge в матрице (#111, PR #136)
- docs(archive): снятое правило вызова критика перенесено в архив, ссылка индекса обновлена (#113, PR #136)
- feat(knowledge-source): `knowledge:read` читает раздел или диапазон из `knowledge:query` (#116, PR #136) LW-023 closed
- docs(history): текущие release и revision сверены с v16; планы и отчёт перенесены в архив (#120, PR #136) LW-017 closed
- docs(db): генерируемый справочник миграций `party_runtime` и актуальные counts `world_base` (#122, PR #136) LW-019 closed
- fix(docs): каталог npm-команд и проверка висячих вызовов в действующих инструкциях (#123, PR #136) LW-015 closed
- refactor(tooling): единый allowlist корневых Markdown-файлов для docs и architecture (#124, PR #136) LW-013 closed
- feat(docs): `knowledge:repin` пересчитывает существующие pins корпуса и generated-файлы (#125, PR #136) LW-005 closed
- fix(world-catalog): `tar` получает относительный путь архива для Windows (#126, PR #136)
- chore(infra): NocoDB закреплён, сломанный bootstrap удалён, esbuild остался у MapMaker (#128, PR #136) LW-022 closed
- docs(governance): обязательные навыки `caveman` и `ponytail` (WR §18.1, роутер, копии в `.agents/skills` и `.claude/skills`); `CBM_RUNTIME_DIR` вне AppData для общего daemon CBM с MSIX-Codex (#131)
- docs(governance): обязательная проверка, синхронизация и использование CBM в начале спринта (WR §19, роутер); подключение Claude Code и разбор зависшего daemon в CODEBASE_MEMORY_MCP (#130)
- docs(work): ссылки на backlog-issues #105–#128 в LEGACY_WARNINGS, CURRENT_SPRINT после завершения трека Docs (#129)
- docs(archive): конфликтующие инструкции агентов (`.cursorrules.txt`, `legacy/.cursor/rules/project.mdc`, `.github/README.md`, `.github/*.txt`) и журналы README перенесены в `docs/archive/`; README переписан как обзор для людей (#104) LW-021 closed
- docs(governance): AGENTS.md — роутер ≤16 КБ; правила без потерь перенесены в `docs/governance/*` (governing-корпус §1.3); правило чтения CONTRACT_INDEX; KSP читает найденные разделы вместо документов целиком (#103)
- docs(agents): карты `docs/context/*`, процедуры `docs/process/*`, CURRENT_SPRINT, реестр legacy warnings, skills-заглушки, issue/PR-шаблоны; CHANGELOG снят с регистрации в CANONICAL_PATHS (#102) LW-001…LW-025 added
- fix(docs): устранены семь противоречий в AGENTS.md (#97)
- feat(gameplay): Turn Forensic Demo Studio с replay-safe доставкой и quality gates (#96)
- docs(workflow): обязателен codebase-memory workflow (#95)
- chore(tooling): Graphify заменён на codebase-memory MCP (#94)
- feat(gameplay): диагностика blind playthrough и причинного gameplay flow (#93)
- feat(knowledge-source): production corpus и grounding для World Knowledge (#92)
- docs(governance): добавлены канонический индекс контрактов и Contract Auditor (#91)
- fix(narration): replay сохраняет подтверждённый outcome для player-safe presentation (#90)
- fix(narration): восстановлен approval post-commit presentation (#87)
- feat(logging): добавлено логирование по party (#89)
- fix(playtest): release gate учитывает достигнутую ветку open combat (#88)
- feat(llm): бюджет игровой задержки и Flash-first профили (#86)
- feat(llm): стабилизирован runtime и добавлен OpenAI-compatible endpoint (#85)
- feat(dev): добавлен локальный launcher игры (#84)
- feat(game-web): выборочно подключён UI authored scenes (#83)
- docs(agents): корневой AGENTS.md заменён конституцией проекта (#81)
- feat(npc): активирован autonomous NPC actor-step (#80)
- feat(gameplay): активирован spatial semantic remainder (#79)
- feat(world-process): активирован локальный exact fire (#78)
- feat(items): активирован crafting, создаваемый действиями игрока (#77)
- feat(items): активировано содержимое существующих контейнеров (#76)
- feat(world-discovery): активированы owners ресурсов и ambient source (#75)
- feat(world-discovery): активирован обычный поиск объектов O1 (#74)
- feat(world-base): добавлена foundation/shadow для semantic world materialization (#73)
- feat(characters): canonical appearance и портреты по экипировке (#72)
- feat(game-web): procedural landscape и портреты разговоров (#71)
- feat(game-web): player-safe scene affordances (#70)
- feat(game-web): интегрирован UI Lovable (#69)
- feat(art): добавлен процедурный Portrait Lab (#68)
- fix(gameplay): look отделён от осмотра wreck (#67)
- docs(agents): уточнена политика вопросов агента (#65)
- docs(gameplay): согласована цель turn temporal (#64)
- docs(gameplay): выровнена активная документация Lower Dvina (#63)
- docs(gameplay): канонизирована документация Lower Dvina (#62)
- feat(gameplay): добавлена full-stack acceptance Phase 11 (#61)
- fix(gameplay): исправлена граница видимости evidence Phase 10 (#60)
- feat(gameplay): добавлены детерминированное завершение Phase 10 и эпилог (#59)
- feat(gameplay): активированы собственность, evidence и временное распоряжение Phase 9 (#58)
- fix(combat): исправлено исполнение spatial intent (#57)
- fix(combat): исправлены инварианты cutover M3 (#56)
- feat(combat): активирован runtime M3 и Phase 8 Lower Dvina (#55)
- feat(npc): активирован autonomous NPC Phase 7 fire rest (#54)
- feat(gameplay): выполнен cutover player turn steps Lower Dvina M1 (#53)
- feat(npc): выполнен cutover разговоров Lower Dvina M2 (#52)
- feat(gameplay): реализован carry Onisim в Phase 6 (#51)
- feat(items): добавлены universal inventory archetypes (#50)
- feat(gameplay): реализовано лечение Onisim в Phase 5 (#49)
- feat(gameplay): реализована сдача Ratsha в Phase 4 (#48)
- feat(gameplay): реализован runtime fishing camp Phase 3 (#47)
- docs(gameplay): закреплены prerequisites fishing camp (#46)
- feat(gameplay): реализован осмотр wreck в Phase 2 (#45)
- feat(gameplay): выполнен cutover canonical body conditions Lower Dvina (#44)
- feat(gameplay): Phase 1A/1B переведены на definition revision 6 (#43)
- docs(gameplay): закреплён body effect осмотра wreck (#42)
- feat(gameplay): добавлены public scenario и opening screen Lower Dvina Phase 1B (#41)
- feat(gameplay): материализация party Lower Dvina Phase 1A (#40)
- docs(gameplay): зафиксирован точный контракт стартовой даты Lower Dvina (#39)
- feat(gameplay): добавлены declarative runtime policies Lower Dvina Phase 0D (#38)
- feat(gameplay): добавлены items и evidence Lower Dvina Phase 0C (#37)
- feat(gameplay): добавлены участники и локации Lower Dvina Phase 0B (#36)
- feat(gameplay): добавлен профиль Lower Dvina trace Phase 0A (#35)
- docs(gameplay): зафиксирован audit gap сценария Lower Dvina trace (#34)
- feat(world-db): добавлена безопасная forward migration legacy world (#33)
- docs(agents): упрощены инструкции и удалены автоматические Graphify gates (#32)
- docs(gameplay): записан production smoke Lower Dvina v3 (#31)
- feat(gameplay): активирован runtime Lower Dvina production v3 (#30)
- fix(gameplay): возобновляется cutover Lower Dvina после сброса party database (#29)
- fix(gameplay): разрешён retry после abandoned Lower Dvina preparation (#28)
- fix(gameplay): удаление устаревшей Lower Dvina party выполняется в порядке зависимостей (#27)
- fix(gameplay): повторно используется active predecessor при cutover Lower Dvina (#26)
- feat(gameplay): добавлен restart-safe production cutover Lower Dvina v3 (#25)
- feat(spatial): интегрирован boundary authoring Lower Dvina v1 (#24)
- fix(gameplay): исправлена database identity в production preflight (#23)
- feat(gameplay): создан first playable production path Lower Dvina (#22)
- docs(workflow): добавлено обязательное архивирование после merge (#21)
- fix(temporal): исправлен post-merge статус документации Temporal World v4 (#20)
- feat(temporal): добавлен Temporal World v4 и approved authoring data (#19)
- feat(items): добавлены инструменты активации runtime предметов и контейнеров (#18)
- feat(items): завершена materialization предметов и контейнеров (#17)
- docs(agents): добавлена политика простоты indie-разработки (#16)
- docs(agents): добавлена адаптивная политика моделей субагентов (#15)
- feat(spatial): добавлена архитектура G0–G6 v4.2 (#14)
- feat(tooling): добавлен hybrid Repository Intelligence layer (#13)
- docs(agents): добавлено правило оркестрации субагентов (#12)
- feat(knowledge-source): оформлен RAG и добавлен agent CLI (#11)
- feat(spatial): интегрирована Temporal travel, environment и perception runtime (#8)
- feat(world-base): добавлены Stage 3C promotion, legacy inventory и approved-only materialization (#7)
- data(npc): apply Opus-approved address forms and evidence for #510
- fix(npc): select address forms only for their materialized source rule, resolve role/occupation specificity, and preserve validated NPC profile refs on scene readback (#436, #532)
- docs(runtime-plan): apply D149 slice scope labels and M7 place-generation coverage; keep structured WK technology outside the norm (#98)
- docs(runtime-plan): apply owner decisions D147/D148 and the D49+ final delta; move the playable slice and player start to M2c, retain M7 seeding, and update merge and progress gates (#98)
- fix(game-server): preserve typed visible-scene gap after confirmed expansion rollback (#530, #531)
- fix(screen): preserve committed NPC perceptions when finalizing the People panel (#523)
- fix(architecture): keep runtime workers and catalog-pin ownership out of tools; audit both boundary directions (#459, #461)
- docs(governance): WR §21.1 — an approval record names the exact approved bytes: path and sha256 of the approved content (git commit when available) and the date; no signatures or receipts (owner decisions D142, D144)
- fix(game-base): resolve Novgorod SQLite refs exactly from the tracked read-only source; fail closed on unchecked refs (#469)
- fix(spatial): allow visible-package persistence against matching committed v0 snapshot (#467)
- fix(tools): portable main-module checks; the P05 checker now runs on Linux (#474)
- fix(runtime-boundary): move new-game projections out of tools, centralize committed v5 inventory defaults in items-property; LW-038/LW-106 closed (#326, #281)
- fix(game-base): apply approved master material corrections through a fail-closed overlay (#432, #431)
- fix(npc): materialize named NPC relationships only from approved rule and D-2 slot evidence, persist pairs atomically on first entry and authored starts
- fix(game-base): correct 1230 historical event dates and sources (both chronicle dates of the departure to Torzhok kept, neutral title), figure office bounds, recreation and health notes; health kinds for three epidemics; regression tests (#339, #340, #341, #325)
- data(combat): approved generic v17 execution profile landed; activation pending (#224)
- fix(tools): reject stale signed approvals, discover in-repository MapMaker symlink datasets, and test supplied calendar profiles (#306, #328, #350)
- fix(presentation): preserve current committed NPC speech on first delivery, pending screens and replay (#98)
- fix(docs-tools): сохранять полные пункты MODULE.md в индексе и убрать повтор World Knowledge (#354, #355)
- fix(test): compare route panel labels with planner operations in the D72 player-safe space (#98)
- docs(process): HOW_WE_WORK §11.2 — the lead reads the full bench wire (data, form, path, destination) before every BENCH-OK; wire-review file and its SHA-256 in the approval (D132) (#98)
- docs(npc): add approved ACTIVE family, household and named-relations norm (D122, D124–D128); record pending household data approval/import as LW-136 (#133, #259, #338)
- fix(turn-scene): keep current scene projection grounded in committed changes and drop prior-turn NPC speech from narration input (D80)
- docs(player-start): add D111 player character and start contract; LW-135 added (#109)
- docs(npc): apply approved NPC lifecycle and compact history norm in section 15.3 (D121, #245)
- fix(npc): replay committed conversation claims from the verified prepared request snapshot (#98)
- fix(spatial): use the D107 approved place label for v17 menu, opening, scene, route and narrator title; add LW-134
- fix(runtime): filter typed item gaps from model facts, operations and visible envelopes; resolve approved labels in inspection; ignore ordinal exits in WK and require schema-only router recognition
- fix(prompts/docs): align planner wording with reviewed Stage L text, correct addressed-request meaning, and record deferred group-3 P projection as LW-132
- fix(prompts): перевести промпты планировщика хода и маршрутизатора на русский (prompt-rev-turn)
- fix(turn): reject prepared follow-up refs outside projected allowlist; LW-131 added (#236)
- fix(items): keep unnamed visible items as typed label gaps; LW-130 added (prompt-rev-turn)
- fix(turn): current scene rebuilt from committed state each turn (departed items/NPCs dropped, speech never becomes the place title); movement narration from owner facts - site arrival from the destination package, route visible change, Spatial-signed local label (#98)
- fix(test): copy only the Phase 2 bundle closure and surface rollback errors (#235)
- feat(combat): scope approved missing-body initialization to combat participants and the existing P16 writer; admit request_combat from current scene readback without gating on unrelated NPC bodies; keep generic v17 execution fail-closed pending cutover; LW-099 updated (#224)
- docs(tech-debt): record D65 body-effect scoring limit and retreat-menu gap; LW-137 added (#224)

Правило: одна строка на PR в формате `- <type>(<area>): что (#PR)`; изменения техдолга отмечаются в той же строке как `LW-### added` / `LW-### closed` (реестр — `docs/work/LEGACY_WARNINGS.md`).
## 0.23.0-migration.24 — 2026-07-14

- chore(release): root version повышена до `0.23.0-migration.24` (#4)
- docs(readme): описана игра и завершённая migration перемещена в архив (#3)
- feat(world-base): восстановлены canonical docs, схема `world_base`, generated artifacts и clean-clone CI (#2)

## 0.23.0-migration.23 — 2026-07-12

### Added

- Byte-faithful canonical documentation corpus with 19 registered sources.
- `@rus/knowledge-source` read-only production module with typed fail-closed errors.
- Corpus, aliases, import-history, graph and RAG manifest schemas.
- Deterministic graph materialization from the approved semantic snapshot.
- Deterministic corpus rechunking with exact approved embedding-snapshot parity.
- Explicit `ports.knowledgeSource` production runtime binding.
- Unique-file review, corpus parity and migration reports.

### Changed

- Root release advanced to `0.23.0-migration.23`.
- `docs:check` now verifies corpus parity and generated graph/RAG freshness.
- Production startup fails closed when the corpus is damaged or generated artifacts are stale.

### Preserved

- Semantic graph relations and embedding vectors are not regenerated or invented by code.
- Legacy remains available only as rollback/evidence and is not deleted.
- Game rules and world semantics are unchanged.

## 0.20.0-migration.20 — 2026-07-12

### Added

- Autonomous `@rus/shadow-run` tool package.
- Versioned `rus.shadow_corpus.v1` manifest with 25 parity/isolation/rollback cases.
- Structural comparison policy covering all 12 normative categories.
- Legacy-versus-modular turn shadow case on one approved player intent.
- Rollback feature-flag gate and fail-closed production composition checks.
- JSON/Markdown `rus.shadow_run_report.v1` evidence.

### Result

- Shadow cases: 25/25 passed.
- Corpus checks: 114/114 passed.
- Blocking differences: 0.
- Non-blocking differences: 0.
- Recommendation: `go_to_staged_cutover`.
- Full regression suite: 291/291 passed.

### Preserved

- Legacy entrypoint remains default.
- No live provider call or production DB write is made by the shadow tool.
- Artistic prose is not compared byte-for-byte.
- Legacy source is retained for rollback and finalization.

### Next

- Staged cutover with repeated shadow and rollback checks.

## 0.19.0-migration.19 — 2026-07-12

### Added

- Canonical architecture, contract and pipeline documentation.
- Complete generated MODULE_INDEX for 20 production packages.
- Deterministic schema reference and generated manifest.
- Canonical document path registry, seed source/import registries and dated artifact manifests.
- Six documentation/generated-data tests.

### Changed

- Historical migration documents moved from repository root to canonical docs paths without duplicate copies.
- @rus/docs-tools extended with generate/check CLI.
- Architecture and release hygiene gates now enforce documentation, generated, seed and artifact policies.
- Release test count increased from 274 to 280.

### Preserved

- Game rules, LLM semantic ownership, DB schemas and runtime behavior.
- Legacy production entrypoint remains default.

### Next

- Production-corpus shadow run and structural comparison.

## 0.15.0-migration.15 — 2026-07-12

### Added

- `@rus/narration` with versioned request/output/audit/route/result contracts.
- Bounded generation, audit, repair and senior-audit flow.
- Adapter from approved new-game Stages 22–23 to common narration result.
- Versioned FirstGameScreen and TurnScreen read models.
- Character, Inventory, People, Route, Map, Journal and Diagnostic panels.
- Stage 26 → FirstGameScreen adapter.
- Narration/Presentation architecture and isolation tests.
- `NARRATION_PRESENTATION_MIGRATION_PLAN.md`.
- `NARRATION_PRESENTATION_PHASE_REPORT.md`.
- `NARRATION_PRESENTATION_CONTRACT_MAP.md`.

### Changed

- `@rus/turn` now requires `narrator.run` and returns a versioned TurnScreen.
- Custom turn screen projectors are validated against the same public contract.
- Architecture checker now enforces narration/presentation dependencies, cycles, ports and security markers.
- Root release version updated to `0.15.0-migration.15`.

### Preserved

- Stage 22/23/26 behavior and compatibility exports.
- Legacy application entrypoints remain default.
- Player input remains `intent_not_fact`.
- No deterministic semantic or prose fallback was added.

### Not changed

- Provider transport configuration.
- Database schemas or production adapters.
- HTTP routes and browser UI.
- Production shadow/cutover state.


## 0.14.0-migration.14 — 2026-07-12

- Создан единый `@rus/turn` workflow из 13 изолированных блоков.
- Turn workflow переведён на общий `@rus/pipeline-engine`.
- Удалён production deterministic semantic fallback: mode, availability и consequences требуют explicit resolvers.
- Approved D20 requests исполняются через injected `RandomSource`.
- Добавлены time update, hidden/visible security boundary, narration gate, write-plan gate, idempotent commit и screen projection.
- Добавлен `@rus/turn/compat` без legacy imports.
- Добавлены turn tests, architecture boundaries, plan/report/contract map.
- Legacy production entrypoint не переключён.

## 0.12.0-migration.12 — 2026-07-12

### Added

- Common modular new-game orchestrator for Stages 2–26.
- Immutable stage plan, orchestration context, checkpoints, resume and bounded repair routing.
- Frozen artifact registry with SHA-256 digests.
- Public entry `@rus/new-game/orchestrator`.
- Orchestrator integration tests, migration plan and phase report.

### Changed

- Stage 2 and Stage 3 definitions now execute through the common stage contract.
- The new-game definition registry now exposes all Stages 2–26.
- Root and `@rus/new-game` versions advanced to 0.12.0.

### Preserved

- Legacy production entrypoint and compatibility facades.
- Stage-local validators, auditors, repair contracts and semantic ownership.
- The rule that code does not invent world facts or infer absent semantic input.

### Next

- Production-corpus shadow run against the legacy route.
- DB-backed integration, browser E2E and staged cutover.

## 0.11.0-migration.11 — 2026-07-12

### Added

- Modular Stages 9–12 with explicit definitions and compatibility entries.
- Recovery-baseline fixtures and parity tests for the missing middle new-game segment.
- Architecture gates for source and dist/release facades, file limits, dependency isolation and cycles.
- `STAGES9_12_MIGRATION_PLAN.md` and `STAGES9_12_PHASE_REPORT.md`.

### Changed

- Legacy Stage 9–12 implementations replaced with one-line compatibility facades.
- Stage 9 split into contract, selection validation, source gate and orchestration modules.
- Stage 10 split into input, DB read checks, audit checks and orchestration modules.
- Stage 11 split into contract, validation, shared traversal and executor orchestration modules.
- Stage 12 split into code precheck, input/output validation and failed-audit modules.

### Preserved

- All named exports and representative behavior from the available recovery baseline.
- Candidate-bound selection, read-only audit semantics and immutable dossier boundary.
- Existing Stages 2–8 and 13–26 behavior.

### Next

- Common modular new-game orchestrator for Stages 2–26.
- Shadow run, DB-backed integration and browser E2E.

## 0.10.1-migration.10-recovery — 2026-07-12

### Added

- Modular Stages 2–8 with explicit stage definitions and compatibility entries.
- Golden baseline fixtures from the last available `0.9.0` archive.
- Stage 2–8 API parity, port-isolation, materialization-boundary and facade tests.
- Recovery migration plan and phase report.

### Changed

- Legacy Stage 2–8 files replaced with one-line compatibility facades.
- Stage 4–8 read-only retrievers are injected through explicit ports.
- Legacy data bindings are isolated in `packages/new-game/src/legacy-adapter.js`.
- Architecture checker now enforces Stage 2–8 boundaries.

### Preserved

- All named exports from the `0.9.0` Stage 2–8 baseline.
- Candidate-bound semantics and existing result shapes.
- The rule that code does not materialize world entities in early retrieval stages.

### Recovery limitation

- Drive documentation references modular Stages 9–12 in an unavailable `0.10.0` artifact. This release does not fabricate or claim that missing implementation.

## 0.9.0-migration.9 — 2026-07-11

### Added

- Modular Stages 13–16 with bounded public APIs and compatibility entries.
- Neutral G5 scene template/draft validation boundary.
- Stage 13–16 schemas, enums, limits and handoff contracts in `@rus/contracts`.
- Stage 13–16 LLM role/tier descriptors in `@rus/llm-runtime`.
- Baseline fixtures from release 0.8.0.
- Parity, security, repair, contracts/runtime and handoff integration tests.
- Stage 13/14/15/16 parity reports and G5 placement pipeline report.

### Changed

- Legacy Stage 13–16 files replaced with one-line compatibility facades.
- Stage 14 independent audit no longer imports Stage 13 implementation.
- Stage 16 validation split across draft, item, container, binding and audit modules.
- Legacy Stage 15–16 role adapters use runtime descriptors instead of inline tiers.
- Architecture checker covers Stages 13–16 and the neutral G5 boundary.
- All workspaces moved to version `0.9.0`.

### Preserved

- Legacy export surfaces and result shapes.
- G5, NPC and item placement semantics.
- Input, validation, audit, repair, permission and handoff behavior.
- Existing legacy failure baseline: 256/261.

### Not changed

- World-generation semantics.
- Database schemas.
- UI behavior.
- Stages 2–12.


## 0.8.0-migration.8 — 2026-07-11

### Added

- Modular Stages 17, 18 and 19 with bounded public APIs and compatibility entries.
- Neutral time-light consistency boundary.
- Weather and Stage 17–19 contracts in `@rus/contracts`.
- Stage 17–19 LLM role/tier descriptors in `@rus/llm-runtime`.
- Baseline fixtures from release 0.7.0.
- Parity, security, repair, handoff and Stage 17 → Stage 20 integration tests.
- Stage 17/18/19 parity reports and hidden-state pipeline report.

### Changed

- Legacy Stage 17–19 files replaced with one-line compatibility facades.
- Legacy weather retriever delegates validation to canonical contracts.
- Stage 19 validation split across bounded entity, disclosure and helper modules.
- Stage 18 digest uses canonical kernel SHA-256.
- Legacy role adapters use runtime descriptors instead of inline tier values.
- Architecture checker covers Stages 17–19 and the neutral time-light boundary.
- All workspaces moved to version `0.8.0`.

### Preserved

- Legacy export surfaces and result shapes.
- Input, validation, audit, repair and commit behavior.
- Concern codes, severity and ordering.
- Existing legacy failure baseline: 256/261.

### Not changed

- World-generation semantics.
- Database schemas.
- UI behavior.
- Stages 2–16.

## 0.7.0-migration.7 — 2026-07-11

### Added

- `@rus/new-game/stages/stage-20` и compatibility API для 17 прежних экспортов.
- `@rus/new-game/stages/stage-21` и compatibility API для 21 прежнего экспорта.
- Декларативные `stage20Definition` и `stage21Definition`.
- Нейтральный visible-context reference/filter/precheck boundary.
- Stage 20–21 schema names, audit enums, concern codes и routes в `@rus/contracts`.
- Visible-context role/tier descriptors в `@rus/llm-runtime`.
- Baseline fixtures Stages 20–21 версии 0.6.0.
- Parity, security, repair, integration, contracts/runtime и architecture tests.
- `STAGE20_PARITY_REPORT.md`, `STAGE21_PARITY_REPORT.md`, `VISIBLE_CONTEXT_PIPELINE_REPORT.md`.

### Changed

- `stage20-visible-context.js` заменён compatibility-фасадом.
- `stage21-visible-context-audit.js` заменён compatibility-фасадом.
- Stage 20 разделён по policy, input, references, validation и orchestration.
- Stage 21 разделён по policy, input, independent precheck, audit validation и orchestration.
- Stage 21 больше не импортирует Stage 20 implementation.
- Inline Stage 21 provider/model metadata заменена descriptor из `@rus/llm-runtime`.
- Все workspace packages и apps переведены на версию `0.7.0`.
- Architecture checker расширен правилами Stages 20–21 и neutral visible-context boundary.

### Preserved

- Stage 20 and Stage 21 legacy export surfaces.
- Visible-context and audit policies.
- Reference/filter/precheck behavior.
- Canonical package digest binding.
- Concern codes, severity and concern ordering.
- Format/semantic/senior repair behavior.
- Audit routing, histories, diagnostics and permissions.
- Legacy pipeline compatibility.

### Not changed

- Player-visible prose semantics.
- Stages 2–19 world-generation semantics.
- Stage 22–26 behavior.
- Database schemas.
- UI behavior.

## 0.6.0-migration.6 — 2026-07-11

### Added

- `@rus/new-game/stages/stage-22` с ограниченным публичным API.
- `@rus/new-game/stages/stage-22/compat` для прежних 22 экспортов.
- `@rus/new-game/stages/stage-23` с ограниченным публичным API.
- `@rus/new-game/stages/stage-23/compat` для прежних 23 экспортов.
- Декларативные `stage22Definition` и `stage23Definition`.
- Neutral narrator reference index.
- Narrator boundary schema names и enums в `@rus/contracts`.
- Golden baseline Stages 22–23 версии 0.5.0.
- Fixtures, parity, security, integration и architecture tests.
- `STAGE22_PARITY_REPORT.md`.
- `STAGE23_PARITY_REPORT.md`.
- `NARRATOR_PIPELINE_REPORT.md`.

### Changed

- `stage22-narrator-prose.js` заменён compatibility-фасадом.
- `stage23-narrator-prose-audit.js` заменён compatibility-фасадом.
- Stage 22 разделён по policy, input, references, precheck, output validation и orchestration.
- Stage 23 разделён по policy, input, structure validation, precheck, audit validation и orchestration.
- Stage 23 больше не импортирует Stage 22 implementation.
- Все workspace packages и apps переведены на версию `0.6.0`.
- Architecture checker расширен правилами Stages 22–23.

### Preserved

- 22 legacy-экспорта Stage 22.
- 23 legacy-экспорта Stage 23.
- Narrator и audit policies.
- Visible-context и prose digest binding.
- Action/reference validation.
- Concern codes, severity и порядок concerns.
- Format/semantic/senior repair behavior.
- Audit routing и upstream repair contracts.
- History и diagnostics shape.
- Stage 23 commit handoff.

### Not changed

- Player-visible prose semantics.
- Stage 20/21 visible-context generation and audit.
- Stage 24 write-plan behavior.
- Stage 25 transaction behavior.
- Stage 26 first-screen behavior.
- LLM provider transport.
- UI и database schemas.
- test(spatial): #199 — add v17 PG regression for first-action request_movement and commit/replay in two dense-fog starts; D41 prompt variants not integrated
- feat(local-play): v17 slice walk driver treats slot or site as progress, chains multi-step exits, site walk budget 8 (slice-reject-trace)
- feat(local-play): v17 slice report persists opening-attempt trace, presentation_recovery and failed delivery turns (slice-reject-trace)
# Changelog

## Unreleased

- feat(npc): select pinned D-1 routines on first entry; preserve identity through typed offstage/location gaps without invented placement; LW-125 added (first-entry context gap), LW-126 added (month-boundary applicability remains deferred after calendar-leap fix), LW-127 added (multi-movement placement CAS latent) (#227)
- docs(tech-debt): LW-124 Julian leap-day inverse gap recorded; closed by the calendar fix in the same merge series
- fix(time): account for leap days in inverse calendar projection; recalculate historical profile derivations; LW-124 closed
Правило: одна строка на PR в формате `- <type>(<area>): что (#PR)`; изменения техдолга отмечаются в той же строке как `LW-### added` / `LW-### closed` (реестр — `docs/work/LEGACY_WARNINGS.md`).

- feat(materialization): O1 v1 — approved applicability selector (75 rules, 4 tuples) makes template closure strict only for the selected tuple and rule; everything else keeps the generic presence path (#133)
- feat(economy): pure @rus/economy owner — exact rational currency conversion by approved region/date/unit rates, one final half-up, unresolved/conflict/invalid outcomes, local-sum render without rates or metadata; no wiring yet (#184)
- docs(corpus): §9 adds exact scoped currency conversion and confirmed local-sum handoff (#184)
- feat(materialization): O1 typed-gap seam — first-arrival item rules can require template-backed item refs; a rule without a template yields a fail-closed typed gap before seed and RNG; zero or missing discovery weights are a typed gap; the wave validator rejects non-array variants (#163)
- docs(tech-debt): record seasonal NPC schedule handoff gap; LW-123 added (#98)
- docs(corpus): D72 — чистота служебной маркировки в model-facing и отображаемом тексте; правило публичной границы и ссылка Narration/UI в CONTRACT_INDEX (#98)
- docs(docs): добавлены шаблоны ADR/MODULE, навигация каталога стендов и уточнения текущего среза (#112, #121, #181, #216, #228)
- fix(game-base): make generators reproducible from tracked inputs and add read-only `--check` support (#201)
- docs(governance): PC §8.1 — a scenario is a plot laid through the free world: it defines only plot NPCs, facts, scenes, items and completion; it owns no mechanics (time, body, combat, checks, perception, conversation, knowledge and lies, materialization, ownership, movement stay with their general owners and work the same inside and outside a scenario); finishing a plot does not end the game (owner decision D66) (#226)
- docs(governance): PC §4/§9.1 — anachronism is excluded only from world stock; an actor’s making and invention are decided causally (materials, tool, skill, workable process), not by an anachronism list (D59) (#218)
- docs(sprint, process): CURRENT_SPRINT and HOW_WE_WORK brought to owner decisions D51–D57 and the next step of the D49 slice (#217)
- fix(turn): gate2-2 intercepts reality-limited achieved empty direct plans before semantic audit, cleans repair-selected not_achieved metadata and traces only accepted-attempt canonicalizations (LW-103 updated)
- feat(perception): D66 issue #225 v17 post-action perception path; profile approval pending (#98)
- fix(test): PostgreSQL test containers are awaited over TCP (pg_isready -h 127.0.0.1) so the temporary initdb server is no longer taken for ready; fixes Stage24 line 92 and the same race in 26 fixtures (#98)
- fix(test): orphan test-container reaper is PID-namespace aware — removes only dead owners from its own namespace; foreign-namespace, legacy pid-only and unreadable owner labels are kept (fail-closed), so parallel PG runs are no longer killed (#98)
- data(start-types): D62 — сад, бортничество и каменоломня «не применим по имеющимся данным», песок — кандидат; evidence-tooling; только кандидат, без активации
- fix(materialization): D59 filters needs_check only in O1/O2b/S1, preserves player actions and authored O2a, replaces matching NPC A1/create_entity/O1 proposals with wait; LW-122 added (#98)

- data(game-base): names-gaps D61 follow-up — exact candidate coverage, authoring checks and current draft/gap status (#98)
- docs(changelog): восстановлена запись о ранее выполненном закрытии LW-112: исходы людей первого прибытия теперь фиксируются в агрегате присутствия; LW-112 closed
- fix(spatial): rt-lines a5 — turn-back after a pause also allows interrupted_at_anchor/stranded and keys on travel-state status (refusal = turn_back_refused), no resume after returned_to_departure, zero-progress pause is no transit (Spatial 4.7.0 §4.10.1/§10.7.1/§10.8/A.4.1/F.1.1), A.4.1 gates synced in state-machines.js, line kinds are `line.*` with a vocabulary check, LINES_WAVE_MANIFEST repinned, gate test on attestation v6/224 tables.
- fix(spatial): rt-lines a6 — outcomes of a turn_back interval follow the direction after commit (mirrored true: returned_to_departure; mirrored false after a repeated turn back: segment_completed; interrupted_at_anchor/stranded on both sides), Spatial 4.7.0 §4.10.1/F.1.1, specifications regenerated, norm-text tests.
- fix(spatial): rt-lines a7 — a pause or interruption at progress zero after the start commit closes as interrupted_at_anchor at the departure endpoint (execution waiting_at_anchor, resumable, replay-safe), Spatial 4.7.0 §4.10.1/§10.8/§10.9/§11.6/A.4.1/F.1.1, A.4.1 gate synced in state-machines.js, norm-text tests.
- fix(spatial): rt-lines a8 — line kind profile edges use controlled_dependency_role values (route_kind excepted) with a validator check, the m2c_lines_v1_candidate source record names its approver (Opus a2) and is no longer marked unapproved, manifest and LINES_WAVE_MANIFEST repinned; orientation edge not added (no authoring version of the target).
- docs(corpus): rt-lines — Spatial 4.7.0 amendment revised before its code stage (D3, D56): no 30-minute segment ceiling and no `max_segment_minutes` (recheck slicing rule, `line_recheck_slicing_missing`), availability optional on a canonical connection binding, turn-back mid-segment (`returned_to_departure`), `fixed_time_interval` recheck policy (new contract blocks only in Appendix F.1.1: Appendix B and Temporal A.6 untouched, historical 4.2.0/4.3.0 snapshots byte-identical), stale v17 visibility text removed; contract specifications, typed errors and matrix regenerated (LW-097)
- data(spatial): rt-lines phase (а) step a1 — m2c-lines-v1 candidate (binding@3 with Spatial 4.7.0 line fields for all 454 local lines, names from the Opus-approved line-names, 8 line-kind profiles, swim alternatives for water kinds; D56: no length ceiling, long lines sliced by the kind's recheck policy) and its generator `tools/spatial-v3/build-line-wave.mjs`; not approved, not imported; world_base part 30.sql (line kind profiles, alternatives, line columns of bindings and segments; 222 -> 224 tables), import manifest m2c-lines-v1-import-manifest.json (draft, insert-only; pinned in bootstrap, not imported before the cutover) (LW-097 progress)
- data(game-base): D53 ferry-guard — the crossing guard is removed from pf_ferry_landing and pf_winter_ice_crossing (D-2 group, 6 schedule rows, 7 relationship rules, 14 address forms), the ferry post names the ferryman only, the term "сторож брода" is marked not attested; wave regenerated on pin 81d96576 (relationship 53→46, speech 98→84, schedule 167→161), people-d49 without the guard gap, both re-signed by Opus (APPROVE_WITH_LIMITS, wave attestation 4ca7a255); LW-121 added
- fix(test): local-movement acceptance keeps occupied passage listed, checks typed refusal and reopening (#216)
- fix(spatial): rt-lines — phase 0 (LW-097): poor visibility no longer hides lines (§7.1.1, only concealment does), the screen of a local move shows the passages of the arrival position instead of the position left ("Проход 2" with no operation), passages stay out of the narrator input; LW-097 progress note
- data(game-base): needs_check queues block generation — only anachronism doubts, per region and period; regional presence stays informational; fail-closed matcher in runtime-catalog, snapshot v2, Opus-approved classification 8/29 (D51 p.3) (#215)
- fix(items): A1 make works at places reached by walking (rt-make) — result destination on the scene position when the party has no g5 anchor, planner rule names `partial_transformation` and an allowed form, one repair for an invalid `physical_form`; LW-100/LW-103 updated, LW-118 added
- data(people): D49 minimum-one people — D-2 thresholds for pf_riverbank/pf_rural_yard/pf_village_lane (game-base pin c79852e7, wave regenerated, presence_rules 5740→5737), m2c pack v2 adds ferryman/householder/household-mistress profiles, clothing d2, canonical regional context (g4-only), fisher/servant v3 and G4 vikhtuy_locality min_count 1; crossing guard stays a gap (occupation not approved); approvals and request attestation pending
- fix(ux): first screen of the v17 start shows the visible passages (connection disclosure of the same visibility owner as a turn, canonical connections only; the provider gets the world-base reader), refused turns with nothing committed reach the player as typed `TURN_NOT_SAVED`/`WORLD_ACTION_UNAVAILABLE` (409, safe text) instead of a masked 500, neutral text for an unachieved direct goal (rt-ux)
- feat(people): rt-people — канонические места маршрута получают людей при первом прибытии: состав D-2 по place family и правила присутствия занятий/ролей (`decidePlacePeople`, `compilePlacePeopleBindings`, `readPlacePeopleClosure`), создание тем же писателем, что у сгенерированных мест; дыра данных никого не создаёт и пишется в `trace.first_entry.people.gaps`, прибытие не падает; regional context применим по `g4_ref`; исходы правил `occupation`/`social_role` пишет движок R-2a в агрегат `presence_resolutions`; профиль с одним значением `payload.actor_applicability.sex_category` задаёт пол; версия одного id профиля — новейшая утверждённая (норма корпуса); fix(spatial): видимый контекст отдаёт возраст `young_adult` как `young`; LW-113 added LW-114 added LW-115 added LW-116 added LW-117 added (rt-people)
- data(game-base): separate personal-name pools per people (D51) — Gotland and German guests, Korela, Izhora, Chud/Estonians, Smolensk guests; the Novgorod pool keeps only pp_novgorod_rus; Valit (Korela, 1337/38, significant) added, Igoland a typed gap; Opus approve_with_limits (names-foreign)
- fix(npc): rt-names — the people-data context `m2c_npc_regional_novgorod_land_d2_v1` is bound to the Novgorod name pool, so ferryman, householder, household mistress and the v3 fisher and servant get a name and a character; `npc_identity_import` request rebuilt (one more binding row), test on the real people-data profiles
- fix(npc): rt-names — the `npc_identity_import` request follows the per-people name pools of #214 (D51): 7 pools, 337 name rows (Иголанд removed, Валит added), only the Novgorod pool and its 266 ordinary entries approved; new request digest, review request regenerated (#214)
- feat(npc): rt-names — NPC get a name and a seeded character: world_base DDL `29.sql` (name pool key `(pool, form, sex, people)` and sex/people/class/status columns, context name bindings, D29 scale entries, occupation goal/fear items, provenance on the three new tables; 219→222 tables, 29 parts), v17 bootstrap stage `npc_identity_import` with a pinned request (candidate, attestation by the reviewer) and repinned schema fingerprint chain, `bundle.npc_identity` from the actor bundle loader, `identity_state.canonical_name` (null for contexts without a pool) and `semantic_state.character` (1 temperament, 2 values, 1-2 goals, 1 fear) from `materializeApprovedProceduralNpc` on separate seed streams, `name_profile_snapshot` at generated first entry; fresh-schema-request rebuilt for the reviewer's v5 attestation, schema reference generator understands UNIQUE drop/add; foreign peoples get their own pools (D51, their ordinary names stay draft), same-scene duplicate names and incomplete character data are open (#133) LW-107 added LW-108 added LW-109 added LW-110 added LW-111 added
- data(m2c-place-coordinates): authored game-map reconstruction of the start cell (32 G4 sectors, 195 G5 points and footprints, water bodies with width and current, shorelines, 49 route traces, topology valid with 0 exceptions) and a derived report of compass and river directions and proposed minutes for all 540 lines; approved with limits (Opus, 93206de2; F1/F2 mechanical continuation 540420fe); authoring input only, runtime and spatial-v3 unchanged, minutes are a draft for a Spatial CR (place-geo)
- feat(local-play): `npm run play:v17-slice` — tracked Linux driver for the live D49 slice run (Docker PG v17 bootstrap, real Qwen root, loopback HTTP, legs start/walk/meet/talk/take/make with SQL snapshots, `report.json` + playtest skeleton, always-cleanup); the presence e2e fixture bootstrap can run without a test context (rt-harness)
- data(game-base): D-rated review step 2 — imported walnut, cast copper snake amulet, imported cotton cloth, common buckthorn, Zverin convent included from indexed sources; katana, chintz and local rice as dated denials (#213)
- data(game-base): D-rated exclusions reviewed under D38 — risk-only rejections to structural needs_check queues, denials only for dated anachronism or physical impossibility, HW009 variant from the manifest (#212)
- fix(items): take from finite natural sources works on v17 — planner rule for `ordinary_resource_source`, code-owned grounding and finite-only seed, `finite_source` causal basis, spatial-v3 inventory load, resource-node physical key; A1 make works at canonical places (v5 inventory profiles, plan-profile pins) with a class-rule applicability file and canonical commons finite sources, both approved with limits (Opus, 81fbe5b7) (`a1-applicability-class.json`, `canonical-finite-applicability.json`); LW-100..106 added (rt-items)
- ci: гейт-job `full-npm-test` в `test.yml` (needs `full-profile` + `evidence-only`, `if: always()`) — зелёный только при успехе всех пяти suite, включая p12, и evidence-only; обязательная проверка main отчитывается после слияния PR #98, защиту менять не нужно (D51) (#98)
- fix(test): два красных теста CI PR #98 — `architecture-soft-limits` теперь утверждает отсутствие размерных проверок (порогов нет по решению владельца, AI §16, #208), а `m2c-presence-ddl-postgres` применяет все `world_base/schema/NN.sql` (28.sql добавляет 2 таблицы, 219) и ждёт PostgreSQL по TCP (#98)
- fix(conversation): rt-talk — a person met on the way is a conversation partner: `loadPhase2State` now reads the NPCs of the player's current site from `party_npcs` + placements (with `position_id`, `g6_instance_id`, `scene_position_g6` map; never persisted: every snapshot writer drops them) — before, generated-site NPCs were never in `state.npcs`; presence is the same G6 (position first, anchor only where a G6 is unknown, never null = null), one rule for partner selection, phase 3 admission and audience/nonverbal/evidence perception; conversation location falls back to the site when the position has no `location_ref`; neutral conversation sets `first_contact_introduction` on the first greeting and projects `semantic_state.character` into `social_context.npc_behavior`; prompt: exact self-introduction form, one sentence on temperament/values; frozen NPC responder fixtures regenerated; PG proof on a real v17 party (`test/spatial-v3/scene-npcs-v17-postgres.test.js`); LW-098, LW-099 added
- fix(spatial): rt-walk — вычислитель условий доступности по утверждённой политике (5 наборов = open, свет и видимость не закрывают, неизвестный набор = gap; допуск и recheck требуют `status: open`); нехватка метода движения блокирует только свою опцию планировщика (`movement_capability_missing`, метод в diagnostic), активация не-ready опции — типизированный отказ, контракт p18 изменён; LW-091 closed, LW-094 added, LW-095 added, LW-096 added (#98)
- feat(spatial): переходы между каноническими местами одного G4 (старты Вихтуя больше не тупик): связи `canonical_g5_connection_bindings`, `prepareCanonicalConnection` (P16 `resolve_frontier:canconn:…`), команды подхода и перехода, подписи `Проход N`; LW-091 added, LW-092 added, LW-093 added
- feat(m2c): canonical-walk G6 ambient baselines (147 rows) for the destinations of canonical G5 connections, coverage 195/195 target×slot; generator `scripts/promote-m2c-acoustic-packages.mjs` (base + approved packages → approved acoustic dataset, authoring versions, manifest, capacity-v2, P12 request); P12 request `m2c-p12-v17-walk-acoustics-v1` (12653 rows) — только свежий bootstrap: пересоздайте локальные пары `novgorod_world_v17` / `novgorod_party_v17`, живая v17 не догоняется (D27) (#98)
- fix(narration): rt-narr — a committed turn no longer waits for a next request to get its text (one in-request narrator retry, two passes total; recovery survives an ended turn budget), the first screen retries a Stage 23 handoff refusal once with one repair per request, `movement_blocked_reason_code` is committed by code only (none for occupants the actor does not perceive), movement buttons in game-web; LW-082 added LW-083 added
- feat(v17): D27 — the standard bootstrap imports the m2c NPC wave (stage `m2c_npc_wave_import`: pinned request, independent attestation in a sixth file `m2c_npc_wave_import.json` for `--run`, exact readback); p12 now runs in its own CI job; PG fixtures no longer import it themselves — пересоберите локальные пары `novgorod_world_v17` / `novgorod_party_v17` (#158) LW-035 updated LW-076 updated LW-077 updated LW-085 added LW-069 closed
- data(m2c-wave): m2c-npc-wave v1 regenerated on game-base pin 27bd6134 (#209): legacy region ids gone, 1236 environment presence rules excluded by the generator, approval.json awaits reviewer re-signature (`resign_required`); D27 stage not wired yet (#158) LW-084 added LW-077 closed
- fix(combat): weapon classification role returns only qualitative_class, code sets schema and request_id; LW-081 added (#188)
- fix(m2c): R-2a presence first arrival on target v17 — пересоберите локальные пары `novgorod_world_v17` / `novgorod_party_v17` (`bootstrap-live-world-v17.mjs`); штатный bootstrap без D27 даёт пустое presence на всех 7 стартах (typed `presence_gap` только в диагностике resolver/provisioner, в БД не пишется; старт v17 выбирается по `catalog_id`, не по `binding_revision`), m2c-npc-wave в production не импортируется (#158) LW-035 closed LW-071 closed LW-077 added LW-078 added
- fix(llm-runtime): `normalizeExecutionLimits` treats `requestTimeoutMs` as a ceiling (`Math.min` against the 120 s default) instead of always overwriting it, so the remaining turn budget survives the provider request timeout; a provider timeout under a budget-clamped `requestTimeoutMs` now reports `LLM_TURN_BUDGET_EXHAUSTED` instead of a generic provider timeout (#98)
- docs(spatial): CR #160 REVIEW-B1-CA-2 cleanup — restrained-actor refusal pinned and described, LW-080 added (occupancy refusal only at step 1; approach path over raw edges after the first step), private host paths removed from reports (#160)
- fix(data): CR #160 labels REWORK — one neutral approach phrase (`подход`) instead of the water/land split; stand 14/15 + 6/6 (#160)
- fix(spatial): CR #160 REVIEW-B1-CA F1-F14 — occupancy travels as `visible_status` and counts only perceived occupants (movement owner still decides the attempt via a server-only `attemptRefusal`); approach first step only from the local-scene owner's options; approach wording and the occupied text are approved data (`passage_phrases`, digest test instead of a runtime gate); turn outcome by structural grounding, not `reason_code`; one eligibility reader; validator provenance from the repository; restart test for the generated case; playtest report split; LW-075 extended, LW-079 (renumbered) with paths (#160)
- fix(spatial): CR #160 B1 step 7c — a not-yet-at-departure actor is offered the first local hop toward a reachable exit ("к руслу — подход к переправе", same local-scene owner, structurally distinct via route_ref); crossing stays departure-only; destination projection no longer fails on edges the admission owner has no row for (was the real cause of the denied crossing); exit-to-slot map now reaches the disclosure owner so the pass-target text reaches planner options; live run closes B1 (approach → crossing → restart → re-entry) (#160)
- fix(spatial): CR #160 B1 step 7 — pass-target exit description now shows at any visibility above `'none'` (was `'clear'`-only); ambient landscape `stable_cover` is `'partial'` for most of the map, so the old threshold made the description unreachable by player movement almost everywhere; found via live playtest (PLAN-OK-B1-step7)
- docs(legacy): LW-079 added — narration-audit can reject prose twice after a committed turn, leaving the player without text (owner #158 R-3), found by the same B1 live playtest (#160)
- fix(spatial): CR #160 B1 part 2 — occupied local edge status comes from the movement admission owner and reaches both the planner's visible option text and the route panel (same suffix, one source); LW-031 closed, LW-075 added (#160)
- feat(r1b): world_base 28.sql D-1/D-2 datasets, wave 11 tables, composition-over-presence validator; pin 337abf9e (#158)
- fix(r1): REVIEW-R1-fix-4 — approval identity, manifest_path, schema_version; internal readback symbol; LW-076 (#158)
- fix(r1): REVIEW-R1-fix-2/3 — wave bundle by table set, fail-closed approval fields, nodes closure required, positive PG on approved copy; LW-076 (#158)
- test(infra): opt-in NOVGOROD_TEST_DOCKER_APPARMOR_UNCONFINED=1 runs throwaway PG test containers without AppArmor (servak: AppArmor 4.1 + Docker 26.1 block unix sockets)
- docs(plan): находки восприятия 2026-09-28 — M2c: скрытое надетым (волосы под убором), частичная видимость; M4: подключение восприятия NPC; LW-074 added (#158)
- fix(r1): REVIEW-R1 — wave PG readback/negatives, approval fail-closed, people allowed_times, CI P12 postgres, generator pin from approval; LW-076 (#158)
- fix(r1): REVIEW-070d2 — chain ledger через `runSpatialV3TargetMigrations` + composite `beforeCommit`; restart skip без дублирования цикла DDL; acceptance fresh pools per restart; encoder close on startup failure; phase-11 test1 limit 450s; PG chain-ledger tests; LW-070/073 (#158)
- feat(r1): REVIEW-070 / PLAN-070b — variants objects in m2c generator @ `367a88c0`; D-3 npc/speech datasets; 27.sql UNIQUE+CHECK; corpus §3A.1/§3A.4/§8.1; fresh-schema request rebuild; generator fixture+tmpdir determinism; LW-073 (#158)
- feat(r1): REVIEW-069b п.3 — prose §3.1 thresholds; presence_rules `item_ref`/`variants` + §8.1/C12 rule-cause; m2c-npc-wave dataset generator @ `b1f249de` (#158) LW-072 added
- fix(r1): REVIEW-069 — explicit schedule projection columns instead of `SELECT *` and first-row slice (party-store owner, `candidate_profile_refs='[]'` checked); same column list in phase-2 temporal state; behavioral PG immutability test (error text, positive control, 23505/23514, 012–037 через раннер); `source_commit`/review.md tests; primary/secondary subjects keyed without region (LW-066); narration MODULE repair-then-fail-closed order; game-base-v1 files reverted to Codex state; fullsuite schema pins 217/133 (#158)
- fix(r1): REVIEW-067 — Lower Dvina projection ignores post-snapshot schedule columns (037 `candidate_profile_refs`); presence equal-season conflicts; fresh-schema CI/source_commit/review.md; PG behavioral DDL; prose index/MODULE/LW (#158)
- fix(r1): REVIEW-066 — party-store SCOPE_KINDS from contracts (g5); presence-rule negative validation + tests; LW-071 (#158)
- fix(r1): CR #158 REVIEW-065 — party weather log numeric timestamps; fresh-schema rebuild+test; presence primary/secondary+season overlap; `wild_arrival_cause` TEXT; corpus/LW/CHANGELOG sync; PG DDL test; attestation withdrawn (LW-069/070) (#158)
- feat(r1): CR #158 DONE-065 — CORPUS_EDIT §3A.1/`place_family` + §8.1 + D25 prose; DDL `27.sql` + party `037`; fresh-schema 217/37; LW-066..068 (#158)
- fix(wk): #153 REVIEW-063 — WK loader selects pack by `packRevision` (v1|v2 closed list); composition passes `release.world_knowledge_pack_revision` so v16 keeps production-v1 (#153)
- feat(wk): #153 step 7 — v17 pins World Knowledge `revision:production-v2` (loader bundle/vectors); v16 keeps `production-v1`; embedding profile unchanged; retrieval benchmark pass (#153)
- data(wk): World Knowledge pack revision production-v2 — D15 access reclassification with strict review, book-sourced claims, in-world law rewrites, 1230 famine claims gated by the event (D19/D22), final WR §21.1 approval of every changed claim, Giga vectors and benchmark; runtime pin is #153 step 7 (#154) LW-060..LW-065 added
- data(temporal-v4): 1230 famine rule re-issued 14.09.1230–31.12.1231 with book 667380 source (D19/D22, #154)
- fix(runtime): commit Gate1 activation-amendment attestation v2; assertGate1Authority runs full validateGate1RuntimeActivationAttestation; v2 forgery tests
- fix(runtime): Gate1 activation-amendment v2 (restart sha drift); fail-closed without attestation v2; LW-055 added
- fix(wk): #153 REVIEW-049 — Core `admittedCandidateRefs` + grounding scores admitted (not vector top-k); `rerank_applied` telemetry; `sufficient_enabled=false` caps SUFFICIENT; C26 single-field loader test; §63/LW-053/054 (#153, PR #98)
- fix(wk): #153 REVIEW-048 — sufficiency_profile mutation kills; owner-server D21 remeasure (GPU/CPU p95 + 120-sit audit ON/OFF) keeps rerank OFF; LW-053 (#153, PR #98) LW-053 updated
- feat(wk): #153 Part C D17/D21 — Core `rerankScores`, gated-off bge pin+provision, SUFFICIENT relevance floor, plan-mode harness in world-catalog-workflow, M16 body-only auth; §49/§63/§74; LW-053/054 (#153, PR #98)
- fix(wk): #153 REVIEW-044 — createTraceTurnRuntime grounder+telemetry wire (B1/B5); provider-failure degrade §73 (B2); F4 post-commit reload (B3); §15 coverage_profiles text; M2b exchange facets; degradation schema (#153, PR #98)
- fix(wk): #153 REVIEW-043 — m2 player WK factory+prepare test (A1); export v17 ports factory (A2); production grounder approved slice (A3); degradation telemetry+TypeError rethrow (A4); split purpose-access-b; §15 D15 align (#153, PR #98)
- fix(wk): #153 REVIEW-042 — durable narrator options (N1); behavioral F4 wire tests; WK catch+trace (N3); F5 punct/ё; frozen collect-all + 3 fixtures; CONTRACT_INDEX §14/67/73/102; LW-049/052 (#153, PR #98) LW-049 updated LW-052 updated
- fix(wk): #153 REVIEW-041 — narration ground-once+degrade; WK on wire; strip auth leak; post-commit authoritative; F5 utterance leak guard; §73/§102; LW-051/052 (#153, PR #98) LW-051 updated LW-052 added
- feat(wk): #153 Part B D15/D16/D20 - npc_decision outside ACTOR_FACING; narration+player interpreter WK wire; player social_role_id→role_ref; contract §14/§67 (#153, PR #98)
- fix(wk): #153 REVIEW-038 — turn historical_events via services 3rd arg; owner clock normalize; MODULE.md services wrap (#153, PR #98)
- fix(wk): #153 REVIEW-037 — drop request_id event Map; explicit historical_events ports; facet present reject; pack validator messages (#153, PR #98)
- fix(wk): #153 REVIEW-036 — party historical_events port; O1 clock through exactModelContext; N-1..N-6 started-historical/v3/facet validator; LW-049..051 (#153, PR #98) LW-049 updated LW-050 LW-051 added
- fix(wk): #153 REVIEW-035 A-01..A-12 — empty started_historical_events; party authoritative factory; O1 clock; facet registry; LF contract; LW-048/049 (#153, PR #98) LW-048 LW-049 added
- feat(wk): #153 Part A D18 — party calendar year, focus date/access filter, started_historical_events, time-events API, contract §13/§14/§53/§54 (#153, PR #98)
- fix(wk): #152 REVIEW-034 — N1 nested production cues; planner_plan vs effective_plan+default_query; real-Core vector-only PARTIAL (#152, PR #98)
- fix(wk): #152 REVIEW-033 — S1/N1/O1 semantic_input text; default-query capped at PARTIAL; disputes count; shared context_text strip; fail-closed encoder; F5 diagnostic/query; contract/LW-047 (#152, PR #98) LW-047 added
- fix(wk): #152 empty semantic_resolution plan -> default Core query; NPC semantic_input text; sufficiency beside verdict; strip duplicate context_text; cache_hit/miss telemetry; contract §50/§51/§60/§61/§63/§85 (#152, PR #98) LW-046 added
- docs(corpus): #146 шаг 4 REVIEW-031 — F1/F4–F6 + LW-039 (KSP сказуемое; ссылки на источник; candidate_hint; v2 выведен из корпуса; source_basis/REFERENCE долг) (#146, PR #98) LW-039 updated
- docs(corpus): #146 шаг 4 — вынос архивных приложений v2 из корпуса; MODULE_RULES §6→AI §10; KSP ordinary LLM/code; LW-039 norms closed (#146, PR #98) LW-028 LW-029 LW-039 updated
- docs(corpus): #146 шаг 3 REVIEW-029 — N1–N4/F13 (немагический мир NPC; полные «не ради…»; combat §40.12; LW-045 уточнён; CR #146 п.11 у «действующий»; INDEX §3) (#146, PR #98) LW-045 updated
- docs(corpus): #146 шаг 3 REVIEW-028 — восстановлены LLM-инварианты из промптов; conversation/repair→схема+владелец; spatial роли; погода LW-044; D9/D14 LW-045; CONTRACT_INDEX §2 метки; проза owner-acceptance (#146, PR #98) LW-044 LW-045 added
- docs(corpus): #146 шаг 3 — промпты→схема+владелец кода; spatial specialization H1; «целевой»→«действующий»; погода D7; проза блокирует приёмку этапа; CONTRACT_INDEX §2/§3/§4 WK/§8.1; LW-042 norms closed on branch (#146, PR #98) LW-042 updated LW-043 added
- docs(corpus): #146 шаг 2 REVIEW-026 — N1–N6/F11 (отслеживаемый в §5/§6/§9; set_entity_mechanics proposal; долг v17 на D9/D14; §17 нейтральный заголовок; D9 в npc §18.1; полная ссылка §3A.7) (#146, PR #98) LW-042 updated
- docs(corpus): #146 шаг 2 REVIEW-025 — F1–F15 (отслеживаемый ≠ significant/D10; O2b D3; subject_kind seed; D9 в схемах; долг v17; informational; D14; LW-042) (#146, PR #98) LW-042 updated
- docs(corpus): #146 шаг 2 — O1/O2b, снятие классового запрета оружия/денег/документов, опознавательный текст и владение (D9/D14), обычный NPC (D1/D8), `subject_kind`, combat/NPC mechanics от кода (#146, PR #98) LW-028 LW-042 updated
- docs(corpus): #146 шаг 1 — политика категорий ACTIVE (восстановлены §10–11.4), нормы наличия в `code_driven` §3A и world-base presence-таблица; CONTRACT_INDEX §4/§5/§8.1; REVIEW-023 (F1/F2/F4: proposed-self-contradiction, меч-в-лесу, facets, LW-008/042) (#146, PR #98) LW-039 updated
- feat(spatial): M2c — authoring профилей расширения G4 и основа atomic generation/traversal (#98)
- docs(context): карты v17, OWNERSHIP/pipelines/plan sync по #145 (#145, PR #98) LW-040 LW-041 added
- docs(sprint, process): CURRENT_SPRINT — решения D47–D50 и срез задач D49; HOW_WE_WORK — модели Codex по D48/D50, слияние data-PR (D45), показ владельцу, размер файла, правила процесса D48–D50 (§10.8) (#211)
- data(game-base): needs_check batch 2, variant material mismatches — point pair decisions with per-item reasons, 37 queued with concrete doubts (imp-variant-mat) (#210)
- data(game-base): needs_check batch 1, hunting/fishing cluster — exact gear/material variants, per-item queue reasons, scoped pair waivers in the ownership checker (imp-needs-hunt) (#209)
- chore(architecture): file-size limits removed; split code by responsibility (AI §16), MODULE_RULES item 7 reworded (#208)
- data(game-base): archive import PR-B for crafts and buildings-interiors — unambiguous decisions only, typed needs_check queue, directed material kinship in the ownership checker (imp-crafts) (#207)
- data(game-base): occupation goals and fears for the seeded NPC character (D49), 265 goals / 158 fears, explicit gaps (#206)
- data(game-base): checker владения архивными id — реестр таблиц, сведение словарей материалов, сверка маршрутов с решением получателя, период вариантов; хвосты одежды и оружия после PR-A (imp-crafts A1) (#204)
- data(game-base): пересобраны устаревшие generated outputs, сняты исключения freshness (#201)
- ci(tools): проба готовности PostgreSQL в тестах по TCP (`pg_isready -h 127.0.0.1`), повтор `docker pull` в merge-гейте, build-status понимает `.cjs`, тест свежести сгенерированных файлов game-base-v1 в `test:game-base` (#203)
- data(game-base): архетип занятий performance_entertainment (гусляр, певец, сказитель), скоморох — точный список занятий; чёрная крыса — редкий завоз по аналогии, общее правило согласованности fauna-групп (D47) (#202)
- data(game-base): один id региона region_novgorod_land, Ладога — subregion_scope=lower_volkhov_ladoga; проверка check-region-ids в npm test (#189)
- data(game-base): импорт архива для оружия и одежды, один владелец на архивный id, усиленный check-archive-ownership (imp-crafts PR-A, D47 п.14) (#200)
- data(economy): D44 — курсы БУЕ, якорные цены c1230, ценовые полосы категорий, стенды C2/C3 (econ-rates, #184) (#196)
- docs(sprint): CURRENT_SPRINT — трек экономики #184, импорт архивов D46, нормы #183, переправа #185, каркас карты #187, стенды #181, порядок data-PR по D45 (#194)
- data(places): правила присутствия окружения по типам мест — общие явления и факты по месту, полное покрытие PF × линза (lw-env, #176) (#198)
- data(world-catalog): связи ресурсов с земноводными, гнездящимися птицами и млекопитающими выведены из свойств видов; дубли грызунов и стартовая среда учтены в проверках (#197)
- data(people): D46 — архивные занятия, роли, темы права и отложенные варианты психологии (imp-people) (#195)
- data(food-drink): D46 — архивные пищевые сущности, варианты и состояния порчи, сезонность блюд по месяцам (imp-food) (#193)
- data(names-peoples): D46 — архивные личные имена, варианты и компоненты с origin-bound проекцией и fail-closed селекторами (#192)
- data(household): инвентарь домов и мастерских, следы быта, возвраты D40 (lw-house, #176) (#191)
- data(names-peoples): компоненты имён, продукты рыб и возвраты D40 (C016) (#186)
- data(resources): метки вещей (D9) и каталог ресурсов часть A — все виды привязаны (B3, #171) (#182)
- data(fauna): способы охоты, сезоны шкур, разделка туш и рыбы (C015, D37/D40) (#179)
- docs(process): стенд — обязательная проверка гипотез вне игры на локальной модели до плана реализации (решение владельца D41): HOW_WE_WORK §11, WORKFLOW, CHANGE_REQUEST и форма CR (поле «Стенд») (#180)
- docs(governance): PC §9.1 — критерий включения в мир и данные: существование, а не предполагаемая польза; наполнение по логике реальности без выдачи за источник (решения владельца D38, D40) (#177)
- docs(sprint): CURRENT_SPRINT — архитектура ресурсов #171 для B3/B4, навыки #170, PR данных #172 → #173, R-1b в #158 (#174)
- docs(process): HOW_WE_WORK — исполнители и их модели, режимы задач, обмен сообщениями, площадка servak и правила исполнителей на ней; CURRENT_SPRINT — задачи M2c B1–B6 по решениям D28–D32 (#168)
- data(world-catalog): игровая база game-base-v1 (кандидаты, 21 группа, STATUS.md) и книжные факты books-evidence-v1 (#155)
- feat(knowledge-source): lexical-only normative RAG; status/priority_tier from CONTRACT_INDEX; `reference` + `reference_results`; independent norm/reference search; drop semantic CLI/readiness fields; CONTRACT_INDEX §5 label align to `ACTIVE SPECIALIZATION` (owner acceptance pending) (#144, PR #150) LW-008 updated
- docs(governance): решения владельца 2026-09-26 — PC §9.1 (наличие решается при первом прибытии; typed gap только для вещей по authority-записи; опознавательный текст вещей не от LLM), WR §21.1 (утверждает старшая модель на высоком reasoning; путь и commit; правка снимает утверждение); HOW_WE_WORK и CURRENT_SPRINT по ним; LW-029 уточнён (#149) LW-042 added
- fix(test): CI 39bfe7c6 — loader-boundary тест `runtime-catalog` знает четыре read-only загрузчика (D-1/D-2, presence rules, category parents), а `m2c-presence-ddl-postgres` закрывает PG-пулы до удаления контейнера (порядок `t.after`, uncaughtException «postmaster exit») (#98)
- fix(test): тестовый `docker run` несёт метку pid владельца (`testContainerLabel()`); контейнеры убитых прогонов удаляет следующий Docker-тест; страж #142 требует метку (#147, PR #148)
- docs(process): обзор HOW_WE_WORK; замысел материализуемого мира (PC §9.1); правила об источниках истины (WR §2), скриптах и имеющихся знаниях (WR §19), утверждении данных (WR §21.1), регрессии плейтеста (WR §22), отчёте gameplay run (WR §24.1 из PR #98) и честности проверок (WR §24.2); поле уровня качества в CR; context dump на ветке этапа; исправлены неверные факты о `legacy/src` (#143) LW-026…LW-039 added
- fix(test): PostgreSQL-тесты удаляют контейнер вместе с anonymous volume (`docker rm -fv`, GS §26); страж в `test:tools` (#142)
- docs(work): CURRENT_SPRINT — Runtime-трек начинается с M2c (#133) по решению владельца (#134)
- fix(game-web): маркер готовности `data-scene-hydrated` у текущего кадра; browser e2e ждёт его вместо устаревшего кадра (#139, PR #141)
- fix(tooling): на Windows `tar` вызывается как System32 bsdtar в p10/p12-инструментах, тестах и staging-скриптах (#126, PR #140)
- docs(policy): KSP L39 — изменённый существующий active-документ сохраняет `baseline_gap`, новый получает `required_before_merge` (#115, PR #140) LW-006 closed
- chore(tooling): `npm run check:syntax` — детерминированная проверка синтаксиса изменённых JS/JSON (#138)
- docs(governance): роутер ведёт World Knowledge через строку IDX §8.1 без особого случая §6/§10; WR §20 требует обновлять CONTRACT_INDEX в том же PR (#111, PR #137) LW-009 closed
- docs(contracts): нормы World Knowledge и direct speech оставлены у профильных владельцев; индекс содержит навигацию и строку World Knowledge в матрице (#111, PR #136)
- docs(archive): снятое правило вызова критика перенесено в архив, ссылка индекса обновлена (#113, PR #136)
- feat(knowledge-source): `knowledge:read` читает раздел или диапазон из `knowledge:query` (#116, PR #136) LW-023 closed
- docs(history): текущие release и revision сверены с v16; планы и отчёт перенесены в архив (#120, PR #136) LW-017 closed
- docs(db): генерируемый справочник миграций `party_runtime` и актуальные counts `world_base` (#122, PR #136) LW-019 closed
- fix(docs): каталог npm-команд и проверка висячих вызовов в действующих инструкциях (#123, PR #136) LW-015 closed
- refactor(tooling): единый allowlist корневых Markdown-файлов для docs и architecture (#124, PR #136) LW-013 closed
- feat(docs): `knowledge:repin` пересчитывает существующие pins корпуса и generated-файлы (#125, PR #136) LW-005 closed
- fix(world-catalog): `tar` получает относительный путь архива для Windows (#126, PR #136)
- chore(infra): NocoDB закреплён, сломанный bootstrap удалён, esbuild остался у MapMaker (#128, PR #136) LW-022 closed
- docs(governance): обязательные навыки `caveman` и `ponytail` (WR §18.1, роутер, копии в `.agents/skills` и `.claude/skills`); `CBM_RUNTIME_DIR` вне AppData для общего daemon CBM с MSIX-Codex (#131)
- docs(governance): обязательная проверка, синхронизация и использование CBM в начале спринта (WR §19, роутер); подключение Claude Code и разбор зависшего daemon в CODEBASE_MEMORY_MCP (#130)
- docs(work): ссылки на backlog-issues #105–#128 в LEGACY_WARNINGS, CURRENT_SPRINT после завершения трека Docs (#129)
- docs(archive): конфликтующие инструкции агентов (`.cursorrules.txt`, `legacy/.cursor/rules/project.mdc`, `.github/README.md`, `.github/*.txt`) и журналы README перенесены в `docs/archive/`; README переписан как обзор для людей (#104) LW-021 closed
- docs(governance): AGENTS.md — роутер ≤16 КБ; правила без потерь перенесены в `docs/governance/*` (governing-корпус §1.3); правило чтения CONTRACT_INDEX; KSP читает найденные разделы вместо документов целиком (#103)
- docs(agents): карты `docs/context/*`, процедуры `docs/process/*`, CURRENT_SPRINT, реестр legacy warnings, skills-заглушки, issue/PR-шаблоны; CHANGELOG снят с регистрации в CANONICAL_PATHS (#102) LW-001…LW-025 added
- fix(docs): устранены семь противоречий в AGENTS.md (#97)
- feat(gameplay): Turn Forensic Demo Studio с replay-safe доставкой и quality gates (#96)
- docs(workflow): обязателен codebase-memory workflow (#95)
- chore(tooling): Graphify заменён на codebase-memory MCP (#94)
- feat(gameplay): диагностика blind playthrough и причинного gameplay flow (#93)
- feat(knowledge-source): production corpus и grounding для World Knowledge (#92)
- docs(governance): добавлены канонический индекс контрактов и Contract Auditor (#91)
- fix(narration): replay сохраняет подтверждённый outcome для player-safe presentation (#90)
- fix(narration): восстановлен approval post-commit presentation (#87)
- feat(logging): добавлено логирование по party (#89)
- fix(playtest): release gate учитывает достигнутую ветку open combat (#88)
- feat(llm): бюджет игровой задержки и Flash-first профили (#86)
- feat(llm): стабилизирован runtime и добавлен OpenAI-compatible endpoint (#85)
- feat(dev): добавлен локальный launcher игры (#84)
- feat(game-web): выборочно подключён UI authored scenes (#83)
- docs(agents): корневой AGENTS.md заменён конституцией проекта (#81)
- feat(npc): активирован autonomous NPC actor-step (#80)
- feat(gameplay): активирован spatial semantic remainder (#79)
- feat(world-process): активирован локальный exact fire (#78)
- feat(items): активирован crafting, создаваемый действиями игрока (#77)
- feat(items): активировано содержимое существующих контейнеров (#76)
- feat(world-discovery): активированы owners ресурсов и ambient source (#75)
- feat(world-discovery): активирован обычный поиск объектов O1 (#74)
- feat(world-base): добавлена foundation/shadow для semantic world materialization (#73)
- feat(characters): canonical appearance и портреты по экипировке (#72)
- feat(game-web): procedural landscape и портреты разговоров (#71)
- feat(game-web): player-safe scene affordances (#70)
- feat(game-web): интегрирован UI Lovable (#69)
- feat(art): добавлен процедурный Portrait Lab (#68)
- fix(gameplay): look отделён от осмотра wreck (#67)
- docs(agents): уточнена политика вопросов агента (#65)
- docs(gameplay): согласована цель turn temporal (#64)
- docs(gameplay): выровнена активная документация Lower Dvina (#63)
- docs(gameplay): канонизирована документация Lower Dvina (#62)
- feat(gameplay): добавлена full-stack acceptance Phase 11 (#61)
- fix(gameplay): исправлена граница видимости evidence Phase 10 (#60)
- feat(gameplay): добавлены детерминированное завершение Phase 10 и эпилог (#59)
- feat(gameplay): активированы собственность, evidence и временное распоряжение Phase 9 (#58)
- fix(combat): исправлено исполнение spatial intent (#57)
- fix(combat): исправлены инварианты cutover M3 (#56)
- feat(combat): активирован runtime M3 и Phase 8 Lower Dvina (#55)
- feat(npc): активирован autonomous NPC Phase 7 fire rest (#54)
- feat(gameplay): выполнен cutover player turn steps Lower Dvina M1 (#53)
- feat(npc): выполнен cutover разговоров Lower Dvina M2 (#52)
- feat(gameplay): реализован carry Onisim в Phase 6 (#51)
- feat(items): добавлены universal inventory archetypes (#50)
- feat(gameplay): реализовано лечение Onisim в Phase 5 (#49)
- feat(gameplay): реализована сдача Ratsha в Phase 4 (#48)
- feat(gameplay): реализован runtime fishing camp Phase 3 (#47)
- docs(gameplay): закреплены prerequisites fishing camp (#46)
- feat(gameplay): реализован осмотр wreck в Phase 2 (#45)
- feat(gameplay): выполнен cutover canonical body conditions Lower Dvina (#44)
- feat(gameplay): Phase 1A/1B переведены на definition revision 6 (#43)
- docs(gameplay): закреплён body effect осмотра wreck (#42)
- feat(gameplay): добавлены public scenario и opening screen Lower Dvina Phase 1B (#41)
- feat(gameplay): материализация party Lower Dvina Phase 1A (#40)
- docs(gameplay): зафиксирован точный контракт стартовой даты Lower Dvina (#39)
- feat(gameplay): добавлены declarative runtime policies Lower Dvina Phase 0D (#38)
- feat(gameplay): добавлены items и evidence Lower Dvina Phase 0C (#37)
- feat(gameplay): добавлены участники и локации Lower Dvina Phase 0B (#36)
- feat(gameplay): добавлен профиль Lower Dvina trace Phase 0A (#35)
- docs(gameplay): зафиксирован audit gap сценария Lower Dvina trace (#34)
- feat(world-db): добавлена безопасная forward migration legacy world (#33)
- docs(agents): упрощены инструкции и удалены автоматические Graphify gates (#32)
- docs(gameplay): записан production smoke Lower Dvina v3 (#31)
- feat(gameplay): активирован runtime Lower Dvina production v3 (#30)
- fix(gameplay): возобновляется cutover Lower Dvina после сброса party database (#29)
- fix(gameplay): разрешён retry после abandoned Lower Dvina preparation (#28)
- fix(gameplay): удаление устаревшей Lower Dvina party выполняется в порядке зависимостей (#27)
- fix(gameplay): повторно используется active predecessor при cutover Lower Dvina (#26)
- feat(gameplay): добавлен restart-safe production cutover Lower Dvina v3 (#25)
- feat(spatial): интегрирован boundary authoring Lower Dvina v1 (#24)
- fix(gameplay): исправлена database identity в production preflight (#23)
- feat(gameplay): создан first playable production path Lower Dvina (#22)
- docs(workflow): добавлено обязательное архивирование после merge (#21)
- fix(temporal): исправлен post-merge статус документации Temporal World v4 (#20)
- feat(temporal): добавлен Temporal World v4 и approved authoring data (#19)
- feat(items): добавлены инструменты активации runtime предметов и контейнеров (#18)
- feat(items): завершена materialization предметов и контейнеров (#17)
- docs(agents): добавлена политика простоты indie-разработки (#16)
- docs(agents): добавлена адаптивная политика моделей субагентов (#15)
- feat(spatial): добавлена архитектура G0–G6 v4.2 (#14)
- feat(tooling): добавлен hybrid Repository Intelligence layer (#13)
- docs(agents): добавлено правило оркестрации субагентов (#12)
- feat(knowledge-source): оформлен RAG и добавлен agent CLI (#11)
- feat(spatial): интегрирована Temporal travel, environment и perception runtime (#8)
- feat(world-base): добавлены Stage 3C promotion, legacy inventory и approved-only materialization (#7)

## 0.23.0-migration.24 — 2026-07-14

- chore(release): root version повышена до `0.23.0-migration.24` (#4)
- docs(readme): описана игра и завершённая migration перемещена в архив (#3)
- feat(world-base): восстановлены canonical docs, схема `world_base`, generated artifacts и clean-clone CI (#2)

## 0.23.0-migration.23 — 2026-07-12

### Added

- Byte-faithful canonical documentation corpus with 19 registered sources.
- `@rus/knowledge-source` read-only production module with typed fail-closed errors.
- Corpus, aliases, import-history, graph and RAG manifest schemas.
- Deterministic graph materialization from the approved semantic snapshot.
- Deterministic corpus rechunking with exact approved embedding-snapshot parity.
- Explicit `ports.knowledgeSource` production runtime binding.
- Unique-file review, corpus parity and migration reports.

### Changed

- Root release advanced to `0.23.0-migration.23`.
- `docs:check` now verifies corpus parity and generated graph/RAG freshness.
- Production startup fails closed when the corpus is damaged or generated artifacts are stale.

### Preserved

- Semantic graph relations and embedding vectors are not regenerated or invented by code.
- Legacy remains available only as rollback/evidence and is not deleted.
- Game rules and world semantics are unchanged.

## 0.20.0-migration.20 — 2026-07-12

### Added

- Autonomous `@rus/shadow-run` tool package.
- Versioned `rus.shadow_corpus.v1` manifest with 25 parity/isolation/rollback cases.
- Structural comparison policy covering all 12 normative categories.
- Legacy-versus-modular turn shadow case on one approved player intent.
- Rollback feature-flag gate and fail-closed production composition checks.
- JSON/Markdown `rus.shadow_run_report.v1` evidence.

### Result

- Shadow cases: 25/25 passed.
- Corpus checks: 114/114 passed.
- Blocking differences: 0.
- Non-blocking differences: 0.
- Recommendation: `go_to_staged_cutover`.
- Full regression suite: 291/291 passed.

### Preserved

- Legacy entrypoint remains default.
- No live provider call or production DB write is made by the shadow tool.
- Artistic prose is not compared byte-for-byte.
- Legacy source is retained for rollback and finalization.

### Next

- Staged cutover with repeated shadow and rollback checks.

## 0.19.0-migration.19 — 2026-07-12

### Added

- Canonical architecture, contract and pipeline documentation.
- Complete generated MODULE_INDEX for 20 production packages.
- Deterministic schema reference and generated manifest.
- Canonical document path registry, seed source/import registries and dated artifact manifests.
- Six documentation/generated-data tests.

### Changed

- Historical migration documents moved from repository root to canonical docs paths without duplicate copies.
- @rus/docs-tools extended with generate/check CLI.
- Architecture and release hygiene gates now enforce documentation, generated, seed and artifact policies.
- Release test count increased from 274 to 280.

### Preserved

- Game rules, LLM semantic ownership, DB schemas and runtime behavior.
- Legacy production entrypoint remains default.

### Next

- Production-corpus shadow run and structural comparison.

## 0.15.0-migration.15 — 2026-07-12

### Added

- `@rus/narration` with versioned request/output/audit/route/result contracts.
- Bounded generation, audit, repair and senior-audit flow.
- Adapter from approved new-game Stages 22–23 to common narration result.
- Versioned FirstGameScreen and TurnScreen read models.
- Character, Inventory, People, Route, Map, Journal and Diagnostic panels.
- Stage 26 → FirstGameScreen adapter.
- Narration/Presentation architecture and isolation tests.
- `NARRATION_PRESENTATION_MIGRATION_PLAN.md`.
- `NARRATION_PRESENTATION_PHASE_REPORT.md`.
- `NARRATION_PRESENTATION_CONTRACT_MAP.md`.

### Changed

- `@rus/turn` now requires `narrator.run` and returns a versioned TurnScreen.
- Custom turn screen projectors are validated against the same public contract.
- Architecture checker now enforces narration/presentation dependencies, cycles, ports and security markers.
- Root release version updated to `0.15.0-migration.15`.

### Preserved

- Stage 22/23/26 behavior and compatibility exports.
- Legacy application entrypoints remain default.
- Player input remains `intent_not_fact`.
- No deterministic semantic or prose fallback was added.

### Not changed

- Provider transport configuration.
- Database schemas or production adapters.
- HTTP routes and browser UI.
- Production shadow/cutover state.


## 0.14.0-migration.14 — 2026-07-12

- Создан единый `@rus/turn` workflow из 13 изолированных блоков.
- Turn workflow переведён на общий `@rus/pipeline-engine`.
- Удалён production deterministic semantic fallback: mode, availability и consequences требуют explicit resolvers.
- Approved D20 requests исполняются через injected `RandomSource`.
- Добавлены time update, hidden/visible security boundary, narration gate, write-plan gate, idempotent commit и screen projection.
- Добавлен `@rus/turn/compat` без legacy imports.
- Добавлены turn tests, architecture boundaries, plan/report/contract map.
- Legacy production entrypoint не переключён.

## 0.12.0-migration.12 — 2026-07-12

### Added

- Common modular new-game orchestrator for Stages 2–26.
- Immutable stage plan, orchestration context, checkpoints, resume and bounded repair routing.
- Frozen artifact registry with SHA-256 digests.
- Public entry `@rus/new-game/orchestrator`.
- Orchestrator integration tests, migration plan and phase report.

### Changed

- Stage 2 and Stage 3 definitions now execute through the common stage contract.
- The new-game definition registry now exposes all Stages 2–26.
- Root and `@rus/new-game` versions advanced to 0.12.0.

### Preserved

- Legacy production entrypoint and compatibility facades.
- Stage-local validators, auditors, repair contracts and semantic ownership.
- The rule that code does not invent world facts or infer absent semantic input.

### Next

- Production-corpus shadow run against the legacy route.
- DB-backed integration, browser E2E and staged cutover.

## 0.11.0-migration.11 — 2026-07-12

### Added

- Modular Stages 9–12 with explicit definitions and compatibility entries.
- Recovery-baseline fixtures and parity tests for the missing middle new-game segment.
- Architecture gates for source and dist/release facades, file limits, dependency isolation and cycles.
- `STAGES9_12_MIGRATION_PLAN.md` and `STAGES9_12_PHASE_REPORT.md`.

### Changed

- Legacy Stage 9–12 implementations replaced with one-line compatibility facades.
- Stage 9 split into contract, selection validation, source gate and orchestration modules.
- Stage 10 split into input, DB read checks, audit checks and orchestration modules.
- Stage 11 split into contract, validation, shared traversal and executor orchestration modules.
- Stage 12 split into code precheck, input/output validation and failed-audit modules.

### Preserved

- All named exports and representative behavior from the available recovery baseline.
- Candidate-bound selection, read-only audit semantics and immutable dossier boundary.
- Existing Stages 2–8 and 13–26 behavior.

### Next

- Common modular new-game orchestrator for Stages 2–26.
- Shadow run, DB-backed integration and browser E2E.

## 0.10.1-migration.10-recovery — 2026-07-12

### Added

- Modular Stages 2–8 with explicit stage definitions and compatibility entries.
- Golden baseline fixtures from the last available `0.9.0` archive.
- Stage 2–8 API parity, port-isolation, materialization-boundary and facade tests.
- Recovery migration plan and phase report.

### Changed

- Legacy Stage 2–8 files replaced with one-line compatibility facades.
- Stage 4–8 read-only retrievers are injected through explicit ports.
- Legacy data bindings are isolated in `packages/new-game/src/legacy-adapter.js`.
- Architecture checker now enforces Stage 2–8 boundaries.

### Preserved

- All named exports from the `0.9.0` Stage 2–8 baseline.
- Candidate-bound semantics and existing result shapes.
- The rule that code does not materialize world entities in early retrieval stages.

### Recovery limitation

- Drive documentation references modular Stages 9–12 in an unavailable `0.10.0` artifact. This release does not fabricate or claim that missing implementation.

## 0.9.0-migration.9 — 2026-07-11

### Added

- Modular Stages 13–16 with bounded public APIs and compatibility entries.
- Neutral G5 scene template/draft validation boundary.
- Stage 13–16 schemas, enums, limits and handoff contracts in `@rus/contracts`.
- Stage 13–16 LLM role/tier descriptors in `@rus/llm-runtime`.
- Baseline fixtures from release 0.8.0.
- Parity, security, repair, contracts/runtime and handoff integration tests.
- Stage 13/14/15/16 parity reports and G5 placement pipeline report.

### Changed

- Legacy Stage 13–16 files replaced with one-line compatibility facades.
- Stage 14 independent audit no longer imports Stage 13 implementation.
- Stage 16 validation split across draft, item, container, binding and audit modules.
- Legacy Stage 15–16 role adapters use runtime descriptors instead of inline tiers.
- Architecture checker covers Stages 13–16 and the neutral G5 boundary.
- All workspaces moved to version `0.9.0`.

### Preserved

- Legacy export surfaces and result shapes.
- G5, NPC and item placement semantics.
- Input, validation, audit, repair, permission and handoff behavior.
- Existing legacy failure baseline: 256/261.

### Not changed

- World-generation semantics.
- Database schemas.
- UI behavior.
- Stages 2–12.


## 0.8.0-migration.8 — 2026-07-11

### Added

- Modular Stages 17, 18 and 19 with bounded public APIs and compatibility entries.
- Neutral time-light consistency boundary.
- Weather and Stage 17–19 contracts in `@rus/contracts`.
- Stage 17–19 LLM role/tier descriptors in `@rus/llm-runtime`.
- Baseline fixtures from release 0.7.0.
- Parity, security, repair, handoff and Stage 17 → Stage 20 integration tests.
- Stage 17/18/19 parity reports and hidden-state pipeline report.

### Changed

- Legacy Stage 17–19 files replaced with one-line compatibility facades.
- Legacy weather retriever delegates validation to canonical contracts.
- Stage 19 validation split across bounded entity, disclosure and helper modules.
- Stage 18 digest uses canonical kernel SHA-256.
- Legacy role adapters use runtime descriptors instead of inline tier values.
- Architecture checker covers Stages 17–19 and the neutral time-light boundary.
- All workspaces moved to version `0.8.0`.

### Preserved

- Legacy export surfaces and result shapes.
- Input, validation, audit, repair and commit behavior.
- Concern codes, severity and ordering.
- Existing legacy failure baseline: 256/261.

### Not changed

- World-generation semantics.
- Database schemas.
- UI behavior.
- Stages 2–16.

## 0.7.0-migration.7 — 2026-07-11

### Added

- `@rus/new-game/stages/stage-20` и compatibility API для 17 прежних экспортов.
- `@rus/new-game/stages/stage-21` и compatibility API для 21 прежнего экспорта.
- Декларативные `stage20Definition` и `stage21Definition`.
- Нейтральный visible-context reference/filter/precheck boundary.
- Stage 20–21 schema names, audit enums, concern codes и routes в `@rus/contracts`.
- Visible-context role/tier descriptors в `@rus/llm-runtime`.
- Baseline fixtures Stages 20–21 версии 0.6.0.
- Parity, security, repair, integration, contracts/runtime и architecture tests.
- `STAGE20_PARITY_REPORT.md`, `STAGE21_PARITY_REPORT.md`, `VISIBLE_CONTEXT_PIPELINE_REPORT.md`.

### Changed

- `stage20-visible-context.js` заменён compatibility-фасадом.
- `stage21-visible-context-audit.js` заменён compatibility-фасадом.
- Stage 20 разделён по policy, input, references, validation и orchestration.
- Stage 21 разделён по policy, input, independent precheck, audit validation и orchestration.
- Stage 21 больше не импортирует Stage 20 implementation.
- Inline Stage 21 provider/model metadata заменена descriptor из `@rus/llm-runtime`.
- Все workspace packages и apps переведены на версию `0.7.0`.
- Architecture checker расширен правилами Stages 20–21 и neutral visible-context boundary.

### Preserved

- Stage 20 and Stage 21 legacy export surfaces.
- Visible-context and audit policies.
- Reference/filter/precheck behavior.
- Canonical package digest binding.
- Concern codes, severity and concern ordering.
- Format/semantic/senior repair behavior.
- Audit routing, histories, diagnostics and permissions.
- Legacy pipeline compatibility.

### Not changed

- Player-visible prose semantics.
- Stages 2–19 world-generation semantics.
- Stage 22–26 behavior.
- Database schemas.
- UI behavior.

## 0.6.0-migration.6 — 2026-07-11

### Added

- `@rus/new-game/stages/stage-22` с ограниченным публичным API.
- `@rus/new-game/stages/stage-22/compat` для прежних 22 экспортов.
- `@rus/new-game/stages/stage-23` с ограниченным публичным API.
- `@rus/new-game/stages/stage-23/compat` для прежних 23 экспортов.
- Декларативные `stage22Definition` и `stage23Definition`.
- Neutral narrator reference index.
- Narrator boundary schema names и enums в `@rus/contracts`.
- Golden baseline Stages 22–23 версии 0.5.0.
- Fixtures, parity, security, integration и architecture tests.
- `STAGE22_PARITY_REPORT.md`.
- `STAGE23_PARITY_REPORT.md`.
- `NARRATOR_PIPELINE_REPORT.md`.

### Changed

- `stage22-narrator-prose.js` заменён compatibility-фасадом.
- `stage23-narrator-prose-audit.js` заменён compatibility-фасадом.
- Stage 22 разделён по policy, input, references, precheck, output validation и orchestration.
- Stage 23 разделён по policy, input, structure validation, precheck, audit validation и orchestration.
- Stage 23 больше не импортирует Stage 22 implementation.
- Все workspace packages и apps переведены на версию `0.6.0`.
- Architecture checker расширен правилами Stages 22–23.

### Preserved

- 22 legacy-экспорта Stage 22.
- 23 legacy-экспорта Stage 23.
- Narrator и audit policies.
- Visible-context и prose digest binding.
- Action/reference validation.
- Concern codes, severity и порядок concerns.
- Format/semantic/senior repair behavior.
- Audit routing и upstream repair contracts.
- History и diagnostics shape.
- Stage 23 commit handoff.

### Not changed

- Player-visible prose semantics.
- Stage 20/21 visible-context generation and audit.
- Stage 24 write-plan behavior.
- Stage 25 transaction behavior.
- Stage 26 first-screen behavior.
- LLM provider transport.
- UI и database schemas.
