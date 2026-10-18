# Cataclysm P3: progress report — 2026-10-19

**Status: WIP; P3 acceptance remains open.** This report records a frozen snapshot of the P3 worktree, based on `25e705074e6741944cc36d38ce05ac2cbc8f3fff` (merged PR #768). It does not claim successful native P3 acceptance, real speech T11/T12 acceptance, or permission to start P5/P6. The normative experiment protocol remains [cataclysm-p3-experiment.md](cataclysm-p3-experiment.md); CR is [#767](https://github.com/PavelSlaven/Novgorod1230/issues/767).

## What changed in this snapshot

- `tools/cataclysm-prototype/p3-boundary.js` and `p3-runner.js` add a typed semantic-action boundary over the existing turn/NPC models and native execution seam. The boundary uses observed native entity identities and operation identity/replay; it does not own physical effects. The runner records complete before/after attempts and enforces the experiment budget of 72 provider attempts and three resets per variant.
- `tools/cataclysm-prototype/generations.py` adds a cold P3-to-P4 join through the existing coordinator. It validates and hashes the complete request, rejects changed payload reuse, preserves operation outcomes for replay, stages native work, and checks the exact candidate reload snapshot before publishing. P3 work remains explicitly pending native acceptance.
- `apps/game-server/src/runtime/lower-dvina-trace-m2-conversation-statements.js` extracts a helper for applying an already-projected player-statement audience. The current production caller still builds its own projection and routes through that helper. `apps/game-server/test/lower-dvina-trace-m2-player-audience-owner.test.js` covers the shared seam. The prototype uses the existing conversation owner; its same-language/full-comprehension social fixture is synthetic and labeled as such.
- `tools/cataclysm-prototype/native-semantic-input.patch`, `novgorod_semantic_test.cpp`, and the small `novgorod_slice_test.cpp` delta contain the native input seam, item-use/NPC/speech probes, and identity regressions. Pickup identity transfer is allowed only for a successful whole-item move into a distinct destination. It validates the complete nested pocket tree before moving any UID; partial-charge and merge behavior retain existing semantics. The RLE writer stops grouping adjacent items when their UIDs differ; the existing reader and format remain unchanged.
- `docs/implementation/cataclysm-p3-experiment.md` records the approved experiment boundary, cases, and acceptance gates. `p3-boundary.test.js` and `test_generations.py` cover the semantic boundary and coordinator behavior.

## Checks and evidence

Historical/code-level checks, with their scope preserved:

- `node --test tools/cataclysm-prototype/p3-boundary.test.js`: 26 passed in the P3-to-P4 join handoff. An earlier combined owner/boundary run had 24 checks (2 owner + 22 boundary); that is a separate earlier revision.
- `python3 -m unittest tools/cataclysm-prototype/test_generations.py` under WSL: 19 passed in the later join delta review. An earlier join revision had 15 passed. Native Windows Python invocation failed because `fcntl` is unavailable; the WSL run passed.
- The native identity package reports a fresh `cata_test` build after the recursive tree-preflight fix. Its focused identity run reports 36 assertions across four cases passed. These are native build/focused identity checks, not the full P3 matrix or T11/T12 acceptance.
- The latest reported selected-UID pickup check moved UID `3585155` from ground to inventory. A new create/read projection reports visible-item UIDs stable across the observed reload; an earlier projection had 20 UID changes among 147 visible identities, which led to the RLE diagnosis and fix. Do not treat the earlier result as a passing post-fix full matrix.
- The native source review approved running the scoped identity preflight after the recursive tree-aware fix (`SAFE_TO_RUN`). It was not a P3 runtime acceptance verdict.
- P4 recovery was technically accepted and merged in PR #768. Its recorded full `npm test` result used exact head `cb5fd4b2388757465d7400fd85a5cd4b317614e2` (CI run 39170915001, success); P4 p95 was 2814.188907999778 ms across 20 samples plus one warm-up, maximum generation size 1,205,151 bytes, and 15 fault cases passed. Those results do not prove P3 speech behavior.

For this publication task, no native build, native run, paid model call, or full integration run was performed. The native and JS/Python results above come from the cited earlier handoffs and evidence, not from a new run here. Here, `npm run docs:check` passed (8 generated files, 0 activation findings), `npm run architecture:check` passed, and `git diff --cached --check -- . ':(exclude)**/*.patch' ':(exclude)*.patch'` passed. The native patch artifact has 14 whitespace-only lines; they are preserved byte-for-byte from the native worker snapshot and excluded from the whitespace check.

## Problems found and current state

| Finding | Resolution or current state |
|---|---|
| Whole-item pickup changed identity because native copy construction allocated a new UID. | Scoped native fix moves identity only after successful distinct-destination whole transfer; recursive type/pocket/child shape is preflighted before any UID mutation. Partial transfer, merge, and mismatch do not rewrite identity. |
| Map-item RLE serialization retained one UID and a count, losing the other identities on reload. | Writer now avoids combining different UIDs; legacy reader and encoding remain compatible. UIDs already lost in older saves cannot be reconstructed. Fresh full P3 create/read acceptance after the fix remains open. |
| Earlier flat descendant comparison could match different nested item trees and transfer UIDs to the wrong nodes. | Independent source review blocked the earlier approach. Recursive tree-aware preflight and mismatch tests resolved that source finding; the later review found no remaining source blocker for the scoped preflight. |
| P2/P4 regression assertions expected the old UID churn behavior. | The approved adjustment changes those specific expectations to identity stability while retaining other assertions. The native worker's latest rebuild/retest is still in progress at snapshot time. |
| Flashlight use still has an unresolved targetless transform / battery-guard behavior; NPC target selection and the newest full runtime matrix are not closed. | Keep P3 open. Investigate through the actual native owner and fresh isolated cases; do not infer success from schema tests or the selected-UID pickup case. |
| Real speech acceptance T11/T12 has not been run. | Issue #758 and umbrella #762 remain open. Existing timing/hearing checks are not a substitute for the real speech, listener, persisted social outcome, and replay acceptance. |

## Acceptance still required

1. Finish the native worker's current build and focused P2/P4 regression rerun, then capture a fresh P3 create/read and exact UID projection after reload. Resolve the flashlight and NPC-target observations in real native execution.
2. Freeze the adapter and independent T06/T07 held-out inputs, capture the actual native wire evidence before any model request, and run the sealed T06–T10 package within its 72-attempt/three-reset-per-variant limits. The current nine-variant/27-reset pack is only a candidate, not a sealed result. T09 needs one real initial NPC choice, zero-call replay, a real native interrupt, persisted cause/status across reload, and the actual next-owner request for the same NPC; a second paid choice inside T09 is not required.
3. Join P3 to the accepted P4 coordinator using one full request and one staged native apply. Confirm physical and social outcomes share one generation, reload snapshot equality, and replay before any repeated native action or model request. Changed payload must reject.
4. Run real T11/T12 speech after the P3/P4 checkpoint: exact utterance, native duration/hearing/listeners, one existing conversation-owner social record, persistence/reload, and replay with no duplicate effect. These remain the P3 acceptance blockers tracked by #758 and #762.
5. Obtain final independent Contract Auditor review and required CI on the final P3 head. Only after P3 and P4 speech gates pass may P5 start; then P6 must complete the full T01–T18 matrix, metrics, and verdict. P7–P9 remain outside this slice.

## Snapshot boundary

This report and source snapshot were copied into a separate publication worktree from the active P3 source checkout. The native patch and native test files were hashed before and after copying; hashes matched the copied files at capture time. Any native-worker edits after that capture are not included in this snapshot and remain unfinished follow-up work. No source checkout files were modified by this publication task.
