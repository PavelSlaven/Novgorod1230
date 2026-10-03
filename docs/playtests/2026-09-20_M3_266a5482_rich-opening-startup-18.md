# M3 rich-opening attempt — neutral/legacy S1 validation spillover

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `266a54826a4c023d9facf70f392fbfe4018ebb99`
- Campaign: `m3-266a5482-rich-opening-18`
- Interface: real Chromium acceptance launcher → real server startup
- Start: `vikhtuy_fishing_camp_v1`
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

One fixed rich-opening campaign was declared: fresh party, direct use of the
opening-named rope, real restart, then same-rope readback.

## Gameplay transcript

No party or player turn was created. Server startup failed before the browser
could open the scenario.

## Persistence/readback

No gameplay or party rows were committed.

## Findings

- `createSpatialSemanticFirstEntryProvisioner` incorrectly required the new
  authored `opening_resolution` field from the immutable legacy Lower-Dvina S1
  profile as well as the neutral authored profile. Startup failed with
  `Exact approved S1 envelope profile is required.`
- Root fix scopes the added validation to
  `rus.live_world_runtime.s1_loaded_profile.v1`; legacy S1 remains unchanged.

## Result

`FAIL` — startup-only evidence, zero turns. Superseded only by a later exact-head
rich-opening campaign.
