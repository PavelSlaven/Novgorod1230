# Lower Dvina place coordinates: authoring candidate

Status: **candidate, not approved**. Opus reviews these authored positions and derived line directions before use. This directory is authoring input, not runtime data. The existing directed graph alone defines movement; coordinates create no edges, access, visibility, or other semantic relations. Runtime does not read this catalog.

## What the coordinates mean

- `candidate.json` places 32 paired G3/G4 sectors and 195 canonical G5 places in WGS84 within the technical G1 cell. Each point has `precision_class: authored_reconstruction`; `precision_m` is tolerance **on the authored game map**, not measured historical position error. `historical_basis` and `historical_uncertainty` separately state how little is known about a place in 1230.
- `sector_polygon` is the authored extent of a G4 sector; each G5 `footprint` is a small authored place extent within its parent. Polygon coordinates use GeoJSON `[lon, lat]` order. Sector interiors and sibling G5 footprints must not overlap. These shapes are playable reconstruction, not excavated boundaries.
- `flow_skeletons` and `shoreline_skeletons` describe the authored local frame used to check water direction and bank placement. They follow the broad modern branching pattern, not traced banks of 1230. The [G1 dossier](../staging/cells/gn_nov_g1_xp017_yp026/content_revision_002/g1-dossier.json) supplies technical cell corners; the [claim ledger](../staging/cells/gn_nov_g1_xp017_yp026/content_revision_002/claim-ledger.json) explicitly says the channel, island, and shoreline geometry around 1230 is unknown.
- The identifiable historical *areas* are Vikh Tuy and Zaostrovye. `recognized_area` marks those groups; it does not identify a surveyed medieval point. Evidence keys resolve through `evidence_sources` to a claim ID or short quotation and URL. G5 `reasoning` explains its functional offset from its G4 sector.

[Kravtsova et al. 2023](https://sciencejournals.ru/view-article/?a=VodRes2301010Kravtsova&j=vodres&n=1&v=50&y=2023) describes the modern delta fan and documents changing banks and islands. That source supports the broad frame, not these individual coordinates. `preview.svg` was not used as geometry.

## Derivation and checks

From this directory:

```sh
node derive.mjs /path/to/final-line-names-candidate.json > derived-report.json
node --test --test-isolation=none --test-reporter=spec derive.test.mjs
```

The script reads active spatial-v3 connection bindings and route segments. It outputs all 454 directed G5 bindings and 86 directed world routes. Every nonzero line gets a WGS84 straight-line distance, azimuth, and one of eight compass directions. Water lines also get a current-relative direction by projection onto the authored flow skeleton; land lines state that river direction does not apply. Reverse directions must agree. A zero-length pair needs an explicit co-location explanation; it has no compass direction.

Old route minutes and method come from active `spatial_v3_world_route_segments.json`. Active local connection profiles record action cost, not minutes. Old local minutes, names, line kinds, and directional `qualifier` values therefore come only from the separately reviewed `line-names` candidate supplied on the command line. Those minutes are editorial baselines (`distance_derived: false`), not measurements. The report retains them under `base_minutes` and labels the old speed-band flags as a legacy review. It does not change either source catalog.

### Proposed travel minutes

`travel-calibration.json` is the unapproved speed table. Each directed line has `proposed_minutes = max(1, round(distance_m × sinuosity_factor / 1000 / effective_speed_kmh × 60))`, plus old minutes, difference, assumed route distance, mode, and effective speed. The route distance is an editorial multiple of the WGS84 straight line, since no surveyed path exists. Rounding is to the nearest whole minute. For river craft, a provisional 1.0 km/h current bias is added downstream and subtracted upstream from the 4.0 km/h still-water rate; crossing and open water have their own rates. This is a static authoring estimate, not seasonal or tidal simulation.

| Mode | Effective km/h | Route factor |
| --- | ---: | ---: |
| Path | 3.0 | 1.20 |
| Forest | 2.2 | 1.40 |
| Bog or offroad | 0.8 | 1.50 |
| Shore or yard | 2.5 | 1.25 |
| Craft downstream | 5.0 | 1.15 |
| Craft upstream | 3.0 | 1.15 |
| Craft across current | 3.5 | 1.15 |
| Craft on open water | 4.0 | 1.05 |

Every numeric rate and route factor in this table is an **editorial assumption for review**, not a measured 1230 value. For scale, a [modern walking field study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10426037/) measured 1.39 m/s on a trail and 1.2 m/s in forest among Tsimane participants in Bolivia; an [experimental paddled boat](https://exarc.net/issue-2025-1/rev/monoxylon-expeditions-archaeological-experiment) reached 5.5 km/h with a large crew in a different setting. [Leshchev et al. (2015)](https://www.researchgate.net/publication/276177038_Fieldworks_in_the_Northern_Dvina_estuary_in_March_2014) measured about 0.14–0.45 m/s at stations in the **modern winter** Northern Dvina estuary; tides slowed and briefly reversed the flow. Those observations give a scale for the provisional 1.0 km/h bias, not a fixed speed for each channel or a reconstruction of 1230. Sources, short quotes, and assumptions are recorded separately in `travel-calibration.json`.

`proposed_over_30_minutes` marks directed lines that need a later review for route segments of at most 30 minutes; `suggested_segment_count = ceil(proposed_minutes / 30)` is informational only. This catalog adds no intermediate nodes or edges. A future Spatial CR and owner approval are required before any minute change reaches active data.

## Current review state

`derived-report.json` was generated with the final `fleet/line-names` candidate `novgorod_m2c_line_names_v1` (version 1, still unapproved). All 540 directed lines have compass directions and proposed minutes; all 32 G4 sectors / 195 G5 footprints pass geometry validation. Proposals range from 2 to 772 minutes; 505 of 540 differ from old editorial minutes, and 132 directed lines (66 reciprocal endpoint pairs) exceed 30 minutes. The longest is `cross_g4_18` through forest: 772 minutes for a long authored straight-line span; its suggested 26 segments are a review prompt, not route geometry. The old-minute comparison still flags 170 lines against the former editorial speed bands. Eighteen directed name findings represent nine reciprocal pairs whose names say «берегом» but whose authored line is not sufficiently aligned with or near a shoreline skeleton. The report lists every old→proposed minute and exact ID. Opus must review the calibration and the line-name owner must resolve the name proposals before approval.

## Shoreline name proposals

These are proposals for the owner of `m2c-line-names`; this catalog does not rename any line. Each row covers a forward/reverse pair. For local rows, prepend `pepv3__g4route_gn_nov_g3_xp017_yp026_r2_` to the pair suffix; world-route IDs and both directed IDs are in `derived-report.json`. Alignment is the absolute cosine of the angle to the nearest authored shoreline tangent (1 means parallel); distance is from the line midpoint to that skeleton. The editorial check requires alignment at least cos(45°) and distance at most 500 m. These are game-map measurements, not historical shore surveys.

| Pair suffix or world route | Alignment | Shore distance | Proposal | Reason |
| --- | ---: | ---: | --- | --- |
| `driftwood_bar_cycle` | 0.974 | 3,242 m | Rename | Parallel to the schematic bank, but too far away to call this a bank route. |
| `sheltered_inner_reach_4` | 0.036 | 325 m | Relay along bank | Near the bank, but the endpoint line crosses it almost perpendicularly. Preserve the bank phrase only after reauthoring endpoints or route trace. |
| `sheltered_landing_terrace_cycle` | 0.074 | 1,056 m | Rename | Neither near nor along the bank; the authored endpoints span the flood edge and water approach. |
| `vikhtuy_river_approach_cycle` | 0.229 | 107 m | Relay along bank | Close to the bank, but the flood-edge to water-approach chord cuts across it. |
| `west_side_channel_3` | 0.073 | 128 m | Relay along bank | Close to the bank, but the mud-bank chord cuts across it. |
| `west_side_channel_5` | 0.012 | 119 m | Relay along bank | Close to the bank, but the seasonal-barrier to exit chord cuts across it. |
| `zaostrovye_landing_cycle` | 0.801 | 3,568 m | Rename | Parallel in angle, but the nearest authored bank is several kilometres away. |
| `cross_g4_14` | 0.839 | 1,414 m | Rename | Parallel in angle, but outside the 500 m bank corridor. |
| `g3route_gn_nov_g2_xp017_yp026_r2_zaostrovye_archaeological_area_2` | 0.819 | 4,061 m | Rename | Parallel in angle, but several kilometres from the nearest authored bank. |

“Relay along bank” means a later owner decision about the authored route or endpoints. No shift is made here, since the present geometry passes containment and bank-side checks and the current task does not redraw sectors for old minutes.
