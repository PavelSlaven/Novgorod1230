# combat-data candidate bench

Hypothesis: the candidate's source-bound check/harm/health rules and exact rational action duration can be checked mechanically; the timing alternative can be compared without calling a model or claiming historical measurement.

Variants A/B/C are 5, 6 and 10 seconds for one bounded melee step. B is the current D71 proposal. The runner executes a seeded synthetic sample and compares exact elapsed time for ten steps. Synthetic neutral input factors are test fixtures only.

Run from any directory:

```sh
python3 /srv/novgorod-work/fleet/tasks/combat-data/out/bench/combat-data/runner.py
```

This writes `results.json` beside the runner. It does not call a model, server, database or network. It declares 15 combat challenges and executes 16 explicit data-level assertions across the 15 cases; their results separately list all declared, executed, and `not_run` assertions. Runtime/model-dependent assertions remain `not_run` with a reason. It also runs all 15 body-mapping fixtures, including complete provenance snapshots, and a separate 15-case NPC body-state description evaluation. The description evaluation checks exact candidate phrase selection at cut-point edges, omission of unavailable values, and exhaustive coverage of all 303 integer inputs plus 36 fractional boundary checks (12 per metric), including 29.5 and 69.5, for health, energy and satiety. Values must be finite and are never rounded; out-of-range/non-finite values are rejected. It also executes check/harm boundary assertions and deterministic arithmetic. It does not assess naturalness, readability, tone, variation, NPC choices or actual model behavior, verify generic v17 applicability, prove persistence/replay, or pass D41. Those text qualities require later blinded human review; live model testing and placement at `/srv/novgorod-work/benches/combat-data/` remain reviewer-owned.

The 15 declared challenges cover ordinary/authored NPCs, free-action paraphrase, exact and unknown weapon facts, unknown protection, changed perception, surrender, feasible/infeasible exits, zero health, sub-minute time and redelivery. Only data-level assertions are executed; player-action parsing, perception, NPC choice, movement feasibility, clock integration and replay behavior are explicitly `not_run`. D71 labels and case IDs are internal and must never enter model/player projection.


The manifest also contains 15 executable synthetic body-mapping cases. They compare candidate arms A/B/C with explicit actor attribute and identity snapshots, then check persisted-body precedence, missing/invalid inputs, readback failure and unapproved mapping behavior. `approval_fixture` is test-only and does not change the production candidate status. The runner evaluates candidate rules, exact expected outputs, profile bounds and deterministic identity handling. It also executes the DTO selector mapping itself against non-10 endurance and rejects energy/satiety selector substitution; these are transformation tests, not production initialization.


D71 body proposal variants: A=`100/80/70` flat analogue, B (current candidate)=health `100`, energy `clamp(80 + 2 × (endurance − 10), 60, 100)`, satiety `70`, C=`100/60/60` lower-start sensitivity arm. All values are unapproved gameplay calibrations; A is an analogy to a scoped first-playable candidate only. Script-first compares their exact outputs over 12 deterministic synthetic cases, including persistence/readback/missing-input behavior. It reports no winner and does not promote the candidate. The six-second attack proposal is bounded to 5–10 seconds and is compared exactly against 5/6/10-second alternatives.

The D72 body-state context proposal uses D71 cut points 30/70 to map an authoritative current NPC readback to one short state-only phrase per metric. The 15 script-first cases cover both sides of the cut points and unavailable values; the runner also checks all 303 integer metric inputs and 36 fractional boundary inputs for exactly one band. This catches mapping gaps and candidate-text drift, but it cannot judge naturalness or whether an NPC makes a sensible choice. The fixed descriptions contain no symptom, injury or cause claims. Thresholds and vocabulary remain pending owner and D67 approval, and they do not govern attack/surrender decisions.


## Optional owner API compatibility probe

`body-interface.mjs` is an optional probe and is excluded from the primary script-first runner and its approval result. It imports owner APIs only after verifying an explicit `--runtime-root` checkout has exact HEAD `8ef2b6494a88589ef88b7bacf13a9c427408e91d` and clean pinned source paths from `manifest.json`; a missing, mismatched, or unverifiable checkout reports `not_run` without importing modules. Run it from a clean checkout at that pin:

```sh
node /srv/novgorod-work/fleet/tasks/combat-data/out/bench/combat-data/body-interface.mjs --runtime-root /srv/novgorod-work/worktrees/combat-min
```

The probe checks compatibility with the pinned actor materializer and body-state initializer only; it does not approve candidate values or enable production emission.
