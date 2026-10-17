# Identity

- Date: 2026-10-17
- Source checkout: `/srv/novgorod-work/tmp/d49-566-activity-capture-d4f3948-20261017/clone`, exact source HEAD `29f4e1f62f93920f65cf8eb3c731de2cf6e3be80`.
- Temporary capture harness: `test/integration/held-item-visible-npc-production-capture-29f4e1f.test.js`, SHA-256 `0d24b4ab1fda44f657e1b81b560d05ac2ba1a097c143fb721e9b020e473663f4`.
- Request: `issue-566-fisher-seed-000005`; scenario `novgorod_vikhtuy_work_storage_v1`; provider was the harness fake fetch target. Model calls: 0.
- This is a failed single production capture, not a paired model benchmark. The original opening writer user JSON is preserved in [`2026-10-17_d49-activity_29f4e1f_opening-writer-user.json`](2026-10-17_d49-activity_29f4e1f_opening-writer-user.json).

# Preconditions

The focused `npm run spatial-v3:check-p12` dry check exited 0. The broad P12 suite was not repeated: earlier Linux runs had seven known archive extraction failures because `tar -xOf` was applied to ZIP files. A previous `--test-name-pattern="^$"` preflight unexpectedly executed the test and failed during fixture PostgreSQL bootstrap; it is not a skipped PASS. The subsequent literal no-match preflight also is not treated as a skipped PASS. The one authorized capture used the isolated `pg-slot` only.

# Gameplay transcript

The capture began the production opening path and recorded four fake-provider requests: opening writer, opening audit, private World Knowledge planner, and private turn-step planner. The player-visible opening prose/screen was not saved, so it cannot be reconstructed from fixture data and is not reported here. The LOOK action, turn writer inputs, reload checks, and visible-status persistence assertions were not reached.

The run stopped with `ReferenceError: approvedActivityRecords is not defined` at `apps/game-server/src/runtime/lower-dvina-trace-turn-step-fire-visible.js:392:56`. The captured error had `turn_commit_status: 'not_started'`. No gameplay commit was reported by this run.

# Persistence/readback

No NPC/item/activity reload or database readback assertion completed. In particular, the planned activity text, net reference, `snapshotFisher@4`, `canonicalcomposition@2`, same-process `getPartyScreen`, and new-runtime reload checks were not executed. The requested `holder.visible_status === approvedActivity` check therefore has no runtime result.

# Findings

Offline inspection of the actual captured opening writer user input confirms it contains the character, current work-yard location, visible water/shore/tree shapes, clothing, weather, season, and time. It does **not** contain the approved activity “Осматривает рыболовную сеть.”, a fishing-net fact/reference, or named provenance fields. The actual opening audit input is retained privately in OS Temp and was inspected offline; this is not a runtime assertion or proof of audit outcome. No activity or item fact was added to the captured writer input.

The opening role detector matched the saved wire shape: the writer request had the `сцена` user key; the subsequent audit request had `сцена` plus `проверяемая_проза`. This only identifies the observed request roles; it does not establish a successful opening response.

# Result

FAIL, with the first production error above. Four fake requests were captured before the failure; turn commit and requested persistence assertions did not run. Model calls: 0. The harness process exited 1. Its own isolated PostgreSQL containers were confirmed absent after completion; unrelated containers were left untouched. Private full wire and private audit/planner material remain in the OS Temp capture directory and are not included in this report.
