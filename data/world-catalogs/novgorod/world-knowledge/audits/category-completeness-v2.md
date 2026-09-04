# Category completeness audit v2 — PR92

This initial BLOCK is retained as the pre-correction finding. Any subsequent
verdict must identify the changed cartography/validator snapshot explicitly.

## CONTRACT AUDIT FINDING

scope: `production-v1/category-cartography.json`, its validator/test, active
Lower Dvina location and materialization consumers.

source_set:

- `AGENTS.md` §§5, 10, 25.1, 28;
- `data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md` §§4–8;
- `data/knowledge-source/corpus/DOCUMENTS/world_knowledge_platform_implementation_contract.md` §98.1;
- `apps/game-server/src/composition/production-spatial-v3.js`;
- active loader graph rooted at
  `apps/game-server/src/internal/lower-dvina-trace-production-materialization-profiles.js`,
  `lower-dvina-trace-spatial-semantic-profile.js`, and
  `lower-dvina-trace-scene-presentation.js`;
- independent profile/location inputs named below.

source_statuses: governing `AGENTS.md`; active World Knowledge contract and
production composition; approved scenario profiles are active runtime inputs.
`category-cartography.json` is authoring inventory, not runtime authority.

observed_implementation:

1. `validateCategoryCartography()` checks location profiles from one supplied
   `locations` object. Current test supplies only
   `phase-0b/location-topology-set.json`.
2. Current test builds `materializationProfiles` by iterating
   `cartography.materialization_profile_mappings`, then reads paths declared by
   same artifact. Removing an active profile from cartography removes it from
   test input; test still can pass. This is self-referential, not independent
   active-profile discovery.
3. Validator resolves every expected family against `domain_rollups`, not the
   `families` domain → subdomain → family rows. Thus a location can name a
   broad domain rollup and pass although no actual family covers its need.
4. Runtime composition independently loads four materialization profiles:
   O2a, O2b, A1, and F1 local fire. Cartography maps only first three.
   Composition also loads S1 spatial-semantic materialization and v2 scene
   presentation as active location consumers.

required_by_active_contract: §98.1 requires independent search from real
location/materialization needs, explicit distinction of active bindings, and
one missing/partial entry per gap with reason, applicability, and consumer.
Filled claims/cells and structural validation do not establish completeness.

target_if_any: none. This audit proposes no new world facts, stock, topology,
or runtime materializer.

conflict:

- `lower_dvina_trace_f1_local_exact_fire_profile_v1` is loaded at startup from
  `phase-m10-content/local-fire-profile.json`, status `approved`, yet absent
  from `materialization_profile_mappings`.
- Its concrete needs—ignition/firesteel, kindling and split fuel, combustion,
  burn/recheck, and water extinguishing—have no F1 consumer mapping. Existing
  broad `process-fuel-and-heating` cannot prove this mapping because it is not
  referenced by F1 and test never enumerates F1.
- S1 requires an ordinary fishing-camp structure with `interior_space` and
  declares a riverbank context of nets, boats, timber, reeds, sand and stones.
  V2 presentation independently makes four locations consume shore/wreck
  debris, reed/sedge/willow edge, camp shelter/nets/boats, shed timber/wattle,
  and storehouse wood/bark/container debris. Cartography maps only broad
  rollups; no family-level relation demonstrates these consumers.
- `trace_ld_v1_loc_fishing_camp` omits craft and physical families despite
  runtime-visible fishing nets, boats and wet riverbank; mapping only
  environment/material-culture/NPC rollups is too coarse.
- Missing list is incomplete for current consumers. It notes general flora and
  generic process chains, but not active fire lifecycle, river-work/fishing
  gear lifecycle, or habitable ordinary structure/interior-space families.

independent evidence:

| Consumer | Independent source | Required factual family / current gap |
| --- | --- | --- |
| F1 fire | `phase-m10-content/local-fire-profile.json`; production loader | `craft_technology → fire/hearth process → ignition, fuel combustion, tending/extinguishing`; `physics_material_science → thermal/water interaction → fire suppression`. Missing consumer mapping. |
| S1 structure | `phase-m12-content/spatial-semantic-profile.json`; production composition | `architecture_settlement → ordinary shelter → enclosure/interior-space and weather protection`. No family-level mapping. |
| fishing camp | `phase-1b-v26/scene-presentation-v2.json` and `phase-0b/location-topology-set.json` | `craft_technology → river work → nets/boats/drying/repair`; `physics_material_science → wet river work → traction/buoyancy/material wetting`. Current location mapping omits both domains. |
| wreck shore | same presentation + O2a ambient profile | `environment → riparian flora/shore substrate → willow/reed/sedge, wet sand, driftwood/debris`. `flora-woody-shrub-herbatic-aquatic-taxonomy` records part of this gap but lacks consumer/applicability fields demanded by §98.1. |
| drying shed/storehouse | presentation + location topology | `architecture_settlement → ordinary work/storage structure → enclosure, ventilation/drying, storage protection`; `material_culture → containers/packaging remnants`. Broad rollups mask unsupported subfamilies. |

precedence_resolution: runtime composition and its pinned approved inputs
define actual consumers. Cartography's own list cannot define audit universe.
Location presentation is a player-safe projection, not proof of stock; only
its factual-context demand is audited here.

first_bad_boundary: `world-knowledge-category-cartography.test.js:23-24`
derives required materialization profiles from cartography itself. Validation
then accepts rollup IDs instead of `families` IDs in
`category-cartography.js:53-57`.

correct_owner: PR92 cartography authoring validator/test and cartography data;
not runtime materializers, scene profiles, or persistence owners.

required_code_delta:

1. Build test/validator input from independent production composition manifest
   or a small explicit active-consumer registry outside cartography. It must
   enumerate O2a, O2b, A1, F1, S1 and active scene-presentation location refs;
   compare cartography against that set bidirectionally.
2. Validate mapping IDs against concrete `families` (and require the mapped
   family domain to fit consumer need), not only `domain_rollups`.

required_docs_delta:

1. Add F1, S1 and scene-presentation v2 as active consumers, with their
   independent source paths/statuses.
2. Add concrete partial/missing records, each with `domain`, `subdomain`,
   `family`, applicability and consumer: fire lifecycle/water extinguishing;
   fishing gear/boat/net work; ordinary shelter/interior-space; riparian flora
   and shoreline substrate/debris; drying/storage environmental functions.
3. Correct location mappings at family granularity. Do not claim local stock,
   NPC presence, topology, recipes, or exact mechanics.

required_tests:

- A test deleting F1/S1/presentation-derived consumer mapping must fail.
- A test replacing a concrete family ID with matching broad rollup must fail.
- An unseen equivalent consumer (for example ordinary river landing with wet
  boat/net work) must be represented by general family applicability, not a
  location-name branch.

severity: P1

verdict: BLOCK

Minimal acceptance condition: externalize active-consumer discovery and make
family-level mappings prove all independently discovered active consumers;
then rerun one independent completeness audit. No completeness claim is
appropriate until these gaps are recorded and checked.

---

## Post-correction audit — current PR92 working tree

snapshot: `category-cartography.js`,
`world-knowledge-category-cartography.test.js`, and production-v1 cartography
read on 2026-09-04 after the binding-test change.

observed improvement:

- Test now has an external fixed `ACTIVE_CONSUMER_PATHS` list and rejects a
  deleted materialization mapping.
- Materialization mappings now resolve IDs against concrete `families` rather
  than `domain_rollups`; O2a/O2b/A1/F1/S1/presentation mappings are present.
- Focused test passes: `node --test
  tools/world-catalog-workflow/test/world-knowledge-category-cartography.test.js`.

remaining conflict:

1. This is only partial externalization. Runtime composition loads F1 through
   `lower-dvina-trace-local-fire-profile.js` from
   `phase-m10-content/local-fire-profile.json`; test/cartography instead use
   the duplicate `phase-m12-content/local-fire-profile.json`. Therefore the
   required test set is not derived from actual production loader binding and
   can validate the wrong F1 artifact.
2. Location mappings and World Knowledge profile mappings still use rollup IDs
   (for example `environment-resources-terrain-and-ecology`), and validator
   still validates those against `rollups`. Replacing a location mapping with
   a matching broad rollup passes; no concrete family proves wreck shore,
   fishing camp, drying shed, or storehouse needs. The materialization-only
   fix does not repair this first bad boundary for locations.
3. `missing_families` remains five coarse IDs with only `id`, `coverage`, and
   `reason`. §98.1 requires each missing/partial family to state domain,
   subdomain, family, applicability and consumer. Current five do not do so.
   They also omit distinct active-consumer gaps: F1 ignition/fuel/burn/water
   extinguishing; S1 shelter/interior-space; fishing gear/boat/net wet-work;
   riparian plant/substrate/debris; and drying/storage environmental function.
4. No direct structural rule rejects an empty `families` collection with its
   own typed error. Current materialization mappings incidentally fail when
   their IDs disappear, but location/profile mappings can still be satisfied
   solely by rollups.

minimal required delta:

- Make one independently owned active-consumer fixture reflect the exact
  runtime loader paths (including the actual F1 m10 path), then test it
  bidirectionally against cartography.
- Require concrete family IDs for location and WK-profile mappings too; add a
  negative test using a valid rollup ID where a family ID is required.
- Replace/expand each coarse missing entry with factual
  `domain → subdomain → family`, applicability and named consumer. Keep all
  coverage `missing`/`partial`; this does not authorize world facts.

severity: P1

verdict: BLOCK

Structural progress is real for materialization mappings, but active F1 path,
location-family proof, and §98.1 missing-family records remain incomplete.

---

## Final correction audit — structural cartography control

snapshot: final PR92 working tree read on 2026-09-04.

verified corrections:

1. F1 mapping and independent fixture now name the actual production loader
   input: `phase-m10-content/local-fire-profile.json`.
2. World Knowledge profile, location, and materialization mappings all name
   concrete IDs from `families`; validator creates `semanticFamilies` from
   those rows and validates all three mapping kinds against it. Rollups no
   longer satisfy those consumer mappings.
3. `missing_families` has 12 rows. Every row supplies `domain`, `subdomain`,
   `family`, `location_applicability`, four-axis `applicability`,
   non-empty `consumer_refs`, `coverage: missing`, and `reason`. Validator
   rejects missing/empty required values.
4. Focused structural check passed:
   `node --test tools/world-catalog-workflow/test/world-knowledge-category-cartography.test.js`.

structural verdict: PASS

This PASS means only that current independently enumerated consumers are bound
to semantic-family IDs and declared gaps have required §98.1 shape. It is not
a claim that factual data is complete.

data-population limits: BLOCK for full factual completeness

The declared missing families remain real, source-backed-data gaps: woody and
riparian flora; toxic/food and wild-fibre plants; amphibian/reptile and
invertebrate context; ordinary shelter/interior space; storage ventilation and
dryness; net/boat/wet-work maintenance; riparian substrate/debris;
occupation-location-access; and fire extinguishing/water interaction. Current
`partial` families likewise do not establish local stock, NPC presence,
topology, recipes, or exact mechanics.

No further cartography-structure change is required for this audit. Filling a
listed gap requires separately approved factual sources and remains outside
this PR's structural acceptance.
