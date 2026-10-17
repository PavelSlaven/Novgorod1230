# D49 #749: actual91 authored opening and repeated LOOK capture

## Identity

- Change: #749, current source commit `75eebb20ae4adf4bde177d8ef1ef9b135912961f`.
- Successful production-composition capture: `/srv/novgorod-work/tmp/d49-observation-final-75eebb20-20261018/run-actual91-final-role-capture-75eebb20-20261018`, exit code 0; 1 test passed.
- Temporary harness SHA-256: `65578cc28105b94d18f889e32fd1a6ebb74966213dcd3da53b41d958b47d7df1`. The harness used the deterministic fake provider; real model calls: 0.
- Local evidence bundle: `%TEMP%\d49-749-75eebb20-20261018\`; `production-wire.ndjson` preserves raw user/system/provider-parameter requests, with `metadata.txt`, `test.log`, `exit-code.txt`, and the sensory-only opening baseline summary. Wire SHA-256: `DBEBFA8015A991046099A9F7FDC16BEF278403BB223406DF18DA042501DAF522`.
- The successful capture proves the production role inputs and persistence flow. It is not a full D49 gameplay run and does not qualify literary/style quality.

## Preconditions

- Fresh isolated PostgreSQL slot, source HEAD exactly #749 commit `75eebb20ae4adf4bde177d8ef1ef9b135912961f`, tracked source tree clean.
- Production authored start: scenario `novgorod_vikhtuy_work_storage_v1`, deterministic seed request `issue-566-fisher-seed-000091`; selected visible Fisher and fishing net.
- Player input for both observation turns: `Осматриваюсь вокруг.`. The provider is deterministic and test-only.

## Gameplay transcript

1. The production start and ACK complete. The opening writer receives the authored Vikhtuy scene.
2. First LOOK runs through the production composition. The writer, auditor, forced semantic repair and final auditor receive the same complete sensory support. The required beat retains the observation result and visible NPC result.
3. A new production runtime reads the same party, submits LOOK again, and completes another writer/auditor cycle. The held-item/NPC screen assertions remain intact.

These are composition and role-input assertions; fake prose is not presented as a player-quality result.

## Persistence/readback

- The committed Stage26 `opening_perceived_context.sensory_details` contains 16 canonical facts.
- In the successful capture, first LOOK support contains all 16; its required beat contains 2 facts: `Обстановка внимательно изучена.` and the visible NPC result.
- After runtime reload, second LOOK support again contains all 16; its required beat again contains those 2 kinds of result. The production same-party committed visible-package/state-snapshot join executes.
- Captured turn request indices from JSON: first LOOK rows 6–9 (writer, auditor, semantic repair, final auditor); after reload rows 14–15 (writer, auditor). Both writers carry 16 sensory support facts and 2 required facts.

The first experimental report overstated the authored opening writer source as having 16 sensory lines. A script compared the persisted 16-fact opening baseline with the exact opening writer `сцена.факты`: 15 match, and the omitted line is `Стоит светлое время дня.`. The opening projection already says `День.` and intentionally deduplicates that daylight line in prose. The typed canonical baseline still retains it. This is a 15-of-16 source projection, not byte parity with opening prose.

## Findings

Attempt history is retained; failed evidence was not overwritten.

| Source / harness | Run directory | Outcome |
|---|---|---|
| `37ee1d4b0e2aad0c7a31e30216243c5e276180f3`; harness `46b40f892c92b3f311686c3cb251b4c631adef87e88cb130b2786ec477722f20` | `/srv/novgorod-work/tmp/d49-observation-749-37ee1d4b0-20261017/run-actual91-20261017` | Failed old-fact assertion. Scripted count from captured LOOK: 18 required facts, 16 sensory support facts. |
| `f701ea729db8bd957607cee7cacdb4197d60efb5`; same harness SHA | `/srv/novgorod-work/tmp/d49-observation-749-37ee1d4b0-20261017/run-actual91-f701-20261018` | Failed old-fact assertion. Scripted auditor count: 9 required facts — observation, 7 typed weather/light facts, and NPC result. The earlier claim of 16 required facts for this capture was incorrect. |
| `3976faae54b7e8b94323e5f564ca8984ed266e1e`; instrumentation SHA-256 `ae5416d6fddb48f6f571b4705ba38aad88d0fe31a4697cfa6565c6f28f2ad5d7`; same harness SHA | `/srv/novgorod-work/tmp/d49-observation-diagnostic-3976-20261018/run-diagnostic-actual91-3976-20261018` | Read-only runtime diagnostic; failed the same old-fact assertion. Captured source values showed the 9-fact prior survived repository, state reader and direct-observation matching; the absent facts were typed weather/light context omitted from the opening baseline. |
| `75eebb20ae4adf4bde177d8ef1ef9b135912961f`; harness SHA-256 `c1921cadc11fe4c215d316810cdd0894eb5bb5cd52fa972903689ae28a33c815` | `/srv/novgorod-work/tmp/d49-observation-final-75eebb20-20261018/run-actual91-final-75eebb20-20261018` | Harness-only `ReferenceError: readback is not defined`; no code result. |
| Same source; harness SHA-256 `429bfb47e57a15666703408cf667dead9cb84a0fd02f96b7320d3fff3a5773f5` | `/srv/novgorod-work/tmp/d49-observation-final-75eebb20-20261018/run-actual91-final-75eebb20-retry-20261018` | Production LOOK reached writer and auditors, but the temporary harness did not record the repair request it returned directly. Offline replay of the saved audit request through the same fixture builder and production audit interpreter yielded a valid, actionable `missing_visible_change` concern; this was a harness capture gap. |
| Same source; corrected harness SHA in Identity | `/srv/novgorod-work/tmp/d49-observation-final-75eebb20-20261018/run-actual91-final-role-capture-75eebb20-20261018` | PASS. The throwaway harness now records the intercepted repair role input; 16 requests captured, first LOOK roles and reloaded second LOOK roles verified. |

The repository production integration test now keeps this opening-baseline/first-LOOK/reload/next-LOOK assertion chain. It retains the existing held-net checks. Syntax and saved-wire assertions were checked locally; the final PostgreSQL integration test is for CI and is **not claimed as run** here.

## Result

The #749 behavior is evidenced on the actual91 authored start and a reloaded second LOOK: unchanged canonical opening sensory facts stay available to the writer/auditor/repair path as support without being repeated as required beat; the executed observation and perceived NPC result remain required. The run uses a deterministic fake provider, so it does not assess full D49 prose or style.

