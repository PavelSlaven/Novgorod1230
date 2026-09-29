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

The script reads active spatial-v3 connection bindings and route segments. It outputs all 454 directed G5 bindings and 86 directed world routes. Every nonzero line gets endpoint-based WGS84 distance, azimuth, and one of eight compass directions. `candidate.json` may hold one canonical `route_trace` per existing local pair or world-route pair: ordered WGS84 points, with each leg marked `water` plus a `waterbody_ref`, or `land`. Reverse graph direction uses the same points and reverses their order; no graph edge or node is added. Current-relative direction is derived per water leg from its assigned body; the whole-line label uses first leg and the report gives length shares for down/up/across. Only explicitly marked, geometrically transverse crossings say «поперёк течения»; still-water legs say «без течения». A zero-length pair needs an explicit co-location explanation; it has no compass direction.

Old route minutes and method come from active `spatial_v3_world_route_segments.json`. Active local connection profiles record action cost, not minutes. Old local minutes, names, line kinds, and directional `qualifier` values therefore come only from the separately reviewed `line-names` candidate supplied on the command line. Those minutes are editorial baselines (`distance_derived: false`), not measurements. The report retains them under `base_minutes` and labels the old speed-band flags as a legacy review. It does not change either source catalog.

`validateCandidate` checks G4 sectors and G5 footprints against the G1 cell, parent sectors, one another, and declared bank sides. `validateSpatialTopology` checks each authored trace leg (or the endpoint chord where no trace exists): land legs cannot cross water axes; water legs must stay in their referenced body corridor; trace transitions must meet; water G4/G5 points must be in their assigned body; dry G4 representative points and dry G5 footprints must remain outside all body corridors. It reports missing traces for long water routes, invalid body assignments, and invalid transverse crossings. The report keeps the diagnostic count of land portions inside water corridors separately. A passing geometry check alone does not establish passing topology.

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

`derived-report.json` covers all 454 local bindings and 86 world routes, with 33 authored traces. Geometry is valid for all 32 G4 sectors and 195 G5 footprints. Blocking topology checks now pass: nonwater/flow-axis intersections 0; water corridor violations 0; missing required route traces 0; dry G5/G4 in water corridors 0; water G5/G4 outside assigned corridors 0. No explicit topology exception is needed.

The two A-place-geo-04 connectors are narrow authored reconstructions (`north_reed_backwater_inlet`: `backwater_mouth`; `north_dry_island_cove_inlet`: `side_channel`), marked `authored_reconstruction` and `editorial_assumption`. They make the existing `cross_g4_22` and `cross_g4_23` boat routes continuous through existing arms and leave the conservative connected-land component intact. The 20 m raster test buffers each axis by half its authored width plus half a cell diagonal, clips land cells to the technical G1 polygon, and checks the 15 dry G4 anchors plus `large_island_head`; all 16 fall in the same land component. This is a geometric screening invariant, not surveyed terrain.

The shoal-bar foot route (`g3route_…_shoal_bar_field_1`) now follows a land trace around the authored water axes; its candidate trace is about 44.4 km and proposed duration is 976 minutes each way. Water routes follow the full-cell arms: `cross_g4_22` is about 47.4 km (732/829 proposed minutes); `cross_g4_23` about 56.9 km (876/993 minutes). These long estimates follow the map and current editorial calibration; they are not changes to active minutes. The active graph has no `movement.shore_transfer` route to `large_island_head`: `cross_g4_06/07/08` use `movement.small_river_craft`; current shore-transfer routes are `cross_g4_09/14`. The raster confirms connected dry land at the island-head point, but cannot make that graph method discrepancy disappear. Spatial should reconcile the requested shore-transfer relationship before approval.

The report derives all eight compass directions for 540 directed lines and proposes minutes for each. It records 177 legacy-minute speed outliers and six directed name findings; 87 proposed durations exceed 30 minutes, with maximum 993 minutes (`cross_g4_23`). These are review candidates, not active data. River-direction totals and all line-level results are in JSON; 34 directed lines are `неоценимо` for river direction under the existing per-leg classification.

`nonwater_corridor_intrusion_count` is an additional diagnostic (112 directed lines). It includes land-access links whose endpoint is a water G5 inside its assigned corridor; it does not mean the line crosses a water-body axis. The blocking checks use authored trace legs and reject actual axis crossings, water legs outside their assigned corridor, and dry G4/G5 geometry inside water corridors.
