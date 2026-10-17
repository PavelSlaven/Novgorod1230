# D49 #685 — NPC-held item reaches the actual writer request

## Identity

Source: `42a9b3ebc8e179ca4d49dc22af6f3988ec4a6382`, 2026-10-17. This is an isolated production PostgreSQL regression with a deterministic provider stub, not a literary-quality playtest. Real model calls: 0.

The remote checkout retained physical HEAD `abaae04bb2684dac8d975b97b7ebcc5212e6e398`; SHA-256 comparison verified all 22 changed content paths against the source tree. Five additional CLI mode changes had identical content. Manifest SHA-256: `85b58ffa71f5cc6a76ab781c3eacabdbb63c524eec4c20834f6c0f0f64bbd063`.

## Preconditions

Fresh isolated databases; scenario `novgorod_vikhtuy_work_storage_v1`, request `issue-594-pine-ridge-clear-sight-seed-000024`. Existing saves and model services were not used. The production test asserts committed NPC ownership/hand placement and clear current observation before checking the narrator input.

## Gameplay transcript

Start, acknowledge opening, then exact player input: **«Осматриваюсь вокруг.»**

The actual writer request before the fix omitted the observed held item. After the fix its description of the same visible NPC includes **«В руках — рыболовная сеть.»** The complete captured requests are [before](2026-10-17_d49-held-item_42a9b3eb_writer-before.json) and [after](2026-10-17_d49-held-item_42a9b3eb_writer-after.json). These are writer inputs; no claim about the literary quality of the stub's delivered prose is made.

Writer system messages and parameters are identical. Only `Переданные сведения об обстановке.Люди[0]` differs. Request hashes: before `ef2d466c41e63766160f03aed66e4e80447c18bb5b5a4ecf2b71897b9d7b1c03`; after `a88863b2517745df986fd8b9f5006d792f79c0e8dad07a9af1f1971f533029e6`.

## Persistence/readback

The production test reads the committed held-item placement and independently requests current player-safe visibility. Both the safe cue and writer input contain the net. This regression does not test save/reload or item transfer; D49 acceptance remains pending. Its isolated containers were removed after completion.

## Findings

The existing visibility owner now carries eligible held items through the closed NPC cue. Partial observation clears detailed cues; old held-item cues are not replayed. Missing or unsafe labels return the existing typed `player_safe_item_label_required` gap. No item ledger, item transfer, new visibility owner or model call was added.

The first pair retained full wire captures but lost TAP/exit output when its orchestration was interrupted. Baseline RED is therefore evidenced by its actual writer input, not by a claimed failing test exit. One subsequent candidate run retained both TAP and exit code; baseline was not repeated.

## Result

The candidate regression passed **1/1**, **0 failures**, exit **0**, duration **521,864 ms**:

```sh
D49_HELD_ITEM_WIRE_CAPTURE_PATH=<isolated-artifact-path> \
  /srv/novgorod-work/fleet/bin/pg-slot node --test --test-concurrency=1 --test-isolation=none \
  --test-reporter=tap --test-name-pattern='fresh production Vikhtuy start' --test-timeout=1800000 \
  test/integration/held-item-visible-npc-production-postgres.test.js
```

Focused checks: 77/77 on the preceding candidate; 36/36 including missing/unsafe-label regression on `42a9b3eb`. Architecture, generated docs and syntax checks passed for the affected code. Independent Contract Auditor: **PASS_WITH_NOTES** on `42a9b3eb`; the note about pending PG verification is addressed by this later run. Baseline wire and the complete candidate writer request were read by the lead. Artistic prose, full final CI and the live D49 route with save/reload are not accepted by this report.
