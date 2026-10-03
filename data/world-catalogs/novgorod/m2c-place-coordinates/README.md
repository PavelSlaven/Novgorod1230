# Lower Dvina place coordinates: authoring candidate

Status: **candidate, not approved**. Opus reviews these authored positions and derived line directions before use. This directory is authoring input, not runtime data. The existing directed graph alone defines movement; coordinates create no edges, access, visibility, or other semantic relations. Runtime does not read this catalog.

## What the coordinates mean

- `candidate.json` places 32 paired G3/G4 sectors and 195 canonical G5 places in WGS84 within the technical G1 cell. `precision_class` and `basis` use the requested `anchored`, `reconstructed`, or `schematic` classes. No point is `anchored`: the recognized Vikh Tuy and Zaostrovye areas do not identify exact medieval sites. `reconstructed` uses a provisional 1,500 m uncertainty; `schematic` has `precision_m: null` because only relative placement is defensible. `coordinate_precision_m` is the 25–50 m tolerance of the authored game-map point and must not be read as historical accuracy. `historical_basis` preserves the evidence distinction (`anchored_area`, `zone_description`, or `schematic`), while `historical_uncertainty` explains the limit for each place.
- `sector_polygon` is the authored extent of a G4 sector; each G5 `footprint` is a small authored place extent within its parent. Polygon coordinates use GeoJSON `[lon, lat]` order. Sector interiors and sibling G5 footprints must not overlap. These shapes are playable reconstruction, not excavated boundaries.
- `flow_skeletons` are typed authored water bodies. Each has its own width and current bias; G5 places and directed water lines refer to their assigned body. `shoreline_skeletons` check bank placement and shore names. These lines follow the broad modern branching pattern, not traced banks of 1230. The [G1 dossier](../staging/cells/gn_nov_g1_xp017_yp026/content_revision_002/g1-dossier.json) supplies technical cell corners; the [claim ledger](../staging/cells/gn_nov_g1_xp017_yp026/content_revision_002/claim-ledger.json) explicitly says the channel, island, and shoreline geometry around 1230 is unknown.
- The only name-recognized historical areas are Vikh Tuy and Zaostrovye; neither is an anchored point. `CLM_G1R2_VIKHTUY` records the 1136/37 charter form «оу Вихтоуга», while `CLM_G1R2_VIKHTUY_LOCALIZATION` permits only a Vitkurya/Toynokurya-area hypothesis. `CLM_G1R2_ZAOSTROVYE` supports an XI–XII c. settlement/burial context; exact layout and continuity in 1230 remain unproved. `recognized_area` marks groups, not surveyed medieval points. Other named reaches, shoals, ridges, channels, and landing approaches are functional authoring descriptions rather than identified real objects. Evidence keys resolve through `evidence_sources` to a claim ID, short quotation, or URL. Each G5 `reasoning` records its authored position relative to its G4 by function (approach, margin, landing, or resource edge), without asserting a fixed historic offset.

[Kravtsova et al. 2023](https://sciencejournals.ru/view-article/?a=VodRes2301010Kravtsova&j=vodres&n=1&v=50&y=2023) describes the modern delta fan and documents changing banks and islands. That source supports the broad frame, not these individual coordinates. `preview.svg` was not used as geometry.

## Derivation and checks

From this directory:

```sh
node derive.mjs /path/to/final-line-names-candidate.json > derived-report.json
node --test --test-isolation=none --test-reporter=spec derive.test.mjs
```

The script reads active spatial-v3 connection bindings and route segments. It outputs all 454 directed G5 bindings and 86 directed world routes. Every nonzero line gets endpoint-based WGS84 distance, azimuth, and one of eight compass directions. `candidate.json` may hold one canonical `route_trace` per existing local pair or world-route pair: ordered WGS84 points, with each leg marked `water` plus a `waterbody_ref`, or `land`. Reverse graph direction uses the same points and reverses their order; no graph edge or node is added. Current-relative direction is derived per water leg from its assigned body; the whole-line label comes from the first leg on flowing water (a line with no such leg is «без течения») and the report gives length shares for down/up/across. Only explicitly marked, geometrically transverse crossings say «поперёк течения»; every leg and line on a body with `current_bias_kmh` 0 says «без течения», by value and not by body type. A zero-length pair needs an explicit co-location explanation; it has no compass direction.

Old route minutes and method come from active `spatial_v3_world_route_segments.json`. Active local connection profiles record action cost, not minutes. Old local minutes, names, line kinds, and directional `qualifier` values therefore come only from the separately reviewed `line-names` candidate supplied on the command line. Those minutes are editorial baselines (`distance_derived: false`), not measurements. The report retains them under `base_minutes` and labels the old speed-band flags as a legacy review. It does not change either source catalog.

`validateCandidate` checks G4 sectors and G5 footprints against the G1 cell, parent sectors, one another, and declared bank sides. `validateSpatialTopology` checks each authored trace leg (or the endpoint chord where no trace exists): land legs cannot cross water axes; water legs must stay in their referenced body corridor; trace transitions must meet; water G4/G5 points must be in their assigned body; dry G4 representative points and dry G5 footprints must remain outside all body corridors. It reports missing traces for long water routes, invalid body assignments, and invalid transverse crossings. The report keeps the diagnostic count of land portions inside water corridors separately. A passing geometry check alone does not establish passing topology.

`route-land-lines.mjs` applies deterministic A* to the remaining dry-line pairs on a 20 m grid, retrying at 10 m when needed. Every authored water corridor, at that body's own width, is blocked. **One end-access rule** (`endpointAccess` in `land-route-search.mjs`, used by both the router and `validateSpatialTopology`): a water end (a place with `waterbody_ref`) may run inside water for the largest half-width + 50 m of every corridor that contains it, its own included; being inside a foreign corridor does not discard the end; the access segment must be clear of every other corridor; a dry end has no water access. A found path becomes a land `route_trace`, simplified only when each shortcut stays outside every corridor.

A failed search is either a **proven bank split** or a **blocker**. Only when the start and end dry-mask component sets are non-empty and disjoint does the script write a `topology_exceptions` entry, with those components (`endpoint_components`) and the corridor whose banks touch both (`barrier`, found from the raster, not from the chord); `validateSpatialTopology` accepts an exception only with that proof. Any other failure (an end that cannot reach dry land, an exhausted search, an access segment through a third corridor) makes the script throw: it must be fixed in the layout, not recorded. Run it against a disposable copy when re-deriving:

```sh
node route-land-lines.mjs /path/to/final-line-names-candidate.json /tmp/place-candidate.json
```

Further blocking checks in `validateSpatialTopology` / `validateFlowContinuity`: a flowing arm must drain through a chain of flowing water to the cell boundary or sea; a still pool is not a sink, so a mouth into one (`backwater_mouth`) and a closed pair of arms are dead ends and need `current_bias_kmh: 0`; a trace that runs out and turns back by more than 150° on one water body with both legs over 100 m is a spike (`route_trace_spikes`).

Name checks: a line containing «берегом» is judged against the shoreline skeletons — chord lines by alignment (45°) and distance (500 m); drawn routes by length-weighted mean distance (500 m) only, because a chord of a long detour says nothing about the bank; short land links (≤150 m) between one water place and one shore place are exempt (`shore_to_water_link`).

### Proposed travel minutes

`travel-calibration.json` is the unapproved speed table. Without a trace, proposed minutes use direct distance × mode factor / effective speed. With a trace, each leg uses its geodesic length and its mode/current; the residual editorial factor is 1.05 for water and 1.10 for land because the drawn route already captures its bends. Unrounded leg durations are summed and rounded once for the whole line. The report includes each leg's length, movement mode, current-relative direction, effective speed, duration, and candidate route point. For river craft, assigned-body current bias is added downstream and subtracted upstream from the 4.0 km/h still-water rate. Old-channel pools and reed backwaters have zero current bias. This is a static authoring estimate, not seasonal or tidal simulation.

| Mode | Effective km/h | Route factor |
| --- | ---: | ---: |
| Path | 3.0 | 1.20 |
| Forest track | 2.75 | 1.30 |
| Wetland path | 1.5 | 1.30 |
| Offroad, straight across country | 3.0 | 1.00 |
| Shore or yard | 2.5 | 1.25 |
| Craft downstream | 4.0 + assigned current bias | 1.15 |
| Craft upstream | 4.0 − assigned current bias | 1.15 |
| Craft across current | 3.5 | 1.15 |
| Craft on open water | 4.0 | 1.05 |
| Craft in still-water pool or backwater | 4.0 | 1.15 |

Every numeric rate and route factor in this table is an **editorial assumption for review**, not a measured 1230 value. For scale, a [modern walking field study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10426037/) measured 1.39 m/s on a trail and 1.2 m/s in forest among Tsimane participants in Bolivia; an [experimental paddled boat](https://exarc.net/issue-2025-1/rev/monoxylon-expeditions-archaeological-experiment) reached 5.5 km/h with a large crew in a different setting. [Leshchev et al. (2015)](https://www.researchgate.net/publication/276177038_Fieldworks_in_the_Northern_Dvina_estuary_in_March_2014) reported 21–22 and 45 cm/s at stations in the **modern winter** Northern Dvina estuary; tides slowed and briefly reversed the flow. Those observations give a scale for an editorial current bias, not a fixed speed for each channel or a reconstruction of 1230. Sources, short quotes, and assumptions are recorded separately in `travel-calibration.json`.

`proposed_over_30_minutes` marks directed lines that need a later review for route segments of at most 30 minutes; `suggested_segment_count = ceil(proposed_minutes / 30)` is informational only. This catalog adds no intermediate nodes or edges. A future Spatial CR and owner approval are required before any minute change reaches active data.

## Current review state

**Approved with limits** by Opus at `93206de2` (`APPROVE_WITH_LIMITS`; see [approval-attestation.json](approval-attestation.json) for the scope, the checks and the limits). The two mechanical follow-ups of that review are applied (REVIEW-place-geo-5), without a new Opus pass:

- **F1.** River-direction labels follow `current_bias_kmh`: 0 gives «без течения» for the leg and the line, whatever the body type; the line label comes from the first leg on flowing water. 30 line labels changed (14 pairs in both directions and the reverse of `cross_g4_07`/`cross_g4_08`); legs on current-0 water inside `cross_g4_07`/`cross_g4_08` (forward) were relabelled too. Minutes did not change. Consequence: labels up 84→68, down 78→66, no current 20→48, across 12 (the F2 re-route then moves one reverse label from up to down: 67/67).
- **F2.** `cross_g4_23` re-routed along the shortest water path (east axis to the split, `central_head_branch` to the cove vertex, then the cove to the landing): 4136 m instead of 6531 m; proposed minutes 108/107 → 77/58. New blocking check `water_trace_detours`: a water-only trace may be at most 1.15 × the shortest water path (20 m raster of the corridors, 8-neighbour); the other 13 water traces are at most 1.10.

Everything below describes the state at the time of approval; the F1/F2 changes above supersede the affected labels and the `cross_g4_23` trace.

`derived-report.json` covers 454 local bindings and 86 world routes, with 49 authored traces. All 32 G4 sectors and 195 G5 footprints pass geometry validation; the topology status is `valid` with **no exceptions**: all four dry/water placement counters are zero, the flow network drains, there are no trace spikes, and all 18 dry anchors lie in one land component in the focused raster test. The 12 pairs that the previous pass recorded as exceptions all have dry routes (10 were false exceptions of the old access rule; 2 needed one G5 point each moved onto the main bank). Nothing here is approved; Opus decides.

PLAN-place-geo-8 changes (graph, line-names, spatial-v3 and runtime untouched):

- End-access rule unified; exceptions need component proof (above).
- `central_head_branch`, `large_island_channels` and `backwater_mouth` are dead-end/standing-water arms with current 0.
- Moved G5 points: `central_current_split_upstream_nose` (802 m, left main edge above the split) and `mixing_reach_inner_approach` (485 m, right main edge) with their parent G4 sectors widened (convex hull); `central_navigation_reach_shoal_margin` (150 m up the left main edge, so its line to `deep_thread` has an along-flow component); `large_island_head_wet_hollow` (134 m up the arm, so it is ~260 m from its neighbours as in the graph). Route-trace endpoints follow the moved points.
- Six water traces (`cross_g4_24/13/21/04/12/05`) rebuilt as the axis stretch between the projections of their ends; `cross_g4_23` turns back between two different bodies (main → `island_split_channels`) and is not a spike by the rule.
- 30 `shoreline_skeletons` rebuilt from the current axes at half-width from the axis (miter joins to 1.4×, bevel beyond, points that fall back into the corridor dropped). The two independent `shore_zaostrovye_water_access_*` traces have no flow axis and are unchanged.
- Five previous A* traces (`channel_split_islet_5/cross`, `large_island_head_3/4/cross`) are gone: under the unified rule their short chords are valid, and the routes had U-turned.

Not done: making `large_island_head_wet_hollow` dry — the graph line `large_island_head_5` (wet_hollow → downstream_tail) is a `side_channel` water line and a dry end would leave its corridor. Names Vikh Tuy and Zaostrovye remain area-level recognitions only. Evidence classes: 0 anchored, 46 reconstructed, 181 schematic. All 540 lines get one of eight compass directions; no river direction is unassessable. There are 0 name findings, 166 legacy speed findings and 85 proposed transitions over 30 minutes; travel times of long world routes (for example `cross_g4_10`, 16 km) remain far from the old graph baselines and are review items.

The five requested shore-route IDs are present in `candidate.json`: `south_main_channel_1`, `north_main_channel_1`, `river_sea_transition_1`, `east_distributary_belt_1`, and `west_distributary_belt_1`. Land-only trace legs without a segment override use `movement.foot`; explicit segment methods still take precedence. Generated travel estimates remain authoring proposals, pending Opus approval.
