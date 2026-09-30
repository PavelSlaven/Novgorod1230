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

`route-land-lines.mjs` applies deterministic A* to the remaining dry-line pairs on a 20 m grid, retrying at 10 m when needed. Each authored water corridor, at that body's own width, is blocked; an endpoint can connect to dry cells only within its assigned water endpoint allowance. A found path becomes a land `route_trace`, simplified only when each shortcut remains outside every water corridor. If neither grid finds a path, the script writes a `topology_exceptions` entry with directed line IDs, the chord/axis crossing or closest corridor approach, search failure, and the ford/footbridge/ferry finding. The exceptions remain unapproved review items. Run it against a disposable copy when re-deriving:

```sh
node route-land-lines.mjs /path/to/final-line-names-candidate.json /tmp/place-candidate.json
```

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

`derived-report.json` covers 454 local bindings and 86 world routes, with 42 authored traces. All 32 G4 sectors and 195 G5 footprints pass geometry validation. All four dry/water placement counters are zero; the flow skeleton network is continuous; all 18 dry anchors fall in one land component in the focused raster test. The route search found 13 dry pairs. Twelve pairs have explicit, unapproved topology exceptions (24 directed lines): `cross_g4_09`, `cross_g4_10`, `backwater_wetlands_1`, `central_main_channel_1`, `island_head_mosaic_1`, `river_sea_transition_1`, `channel_split_islet_3`, `_5`, `_cross`, `large_island_head_3`, `_4`, and `_cross`. There are no unclassified topology blockers; the report status is `valid_with_exceptions`, not approval. Eight exception locations are exact chord/axis intersections; four are labeled nearest chord/axis approaches because the chord does not cross the axis. The search metadata records that both grid resolutions failed endpoint access for these cases, so the claimed crossing kind and acceptance remain for Opus to decide.

The PLAN-place-geo-7 layout changes preserve the directed graph, line-names, spatial-v3, and runtime. The eight requested G4 representative placements and associated G5 clusters were adjusted; 53 G5 positions moved during this pass. Names Vikh Tuy and Zaostrovye remain area-level recognitions only, with no historically anchored points. Current evidence classes: 0 anchored, 46 reconstructed, 181 schematic. All 540 lines receive one of eight compass directions. River projection leaves 4 directed water lines unassessable; line-level findings are in the report. Fourteen name findings, 167 legacy speed findings, and 83 proposed transitions over 30 minutes also remain review items.

The five requested shore-route IDs are present in `candidate.json`: `south_main_channel_1`, `north_main_channel_1`, `river_sea_transition_1`, `east_distributary_belt_1`, and `west_distributary_belt_1`. Land-only trace legs without a segment override use `movement.foot`; explicit segment methods still take precedence. Generated travel estimates and topology exceptions remain authoring proposals, pending Opus approval.
