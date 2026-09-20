# M3 procedural materialization data sufficiency

Status: authoring/readiness input for PR #98. Source files, candidate bundles,
approved records and records activated under the exact runtime pin are distinct.
Only the last class is executable runtime data.

## Owner map

| Requirement | Canonical owner data | Reader/compiler | Persisted/runtime owner | Current state |
|---|---|---|---|---|
| G4/G5/G6 topology | Spatial-v3 v6 closure | existing Spatial-v3 reader | existing spatial materializer/committer | executable |
| landscape/water/land use/place function | `world_base` template and regional-binding tables | procedural profile compiler | compiled profile is not activated yet | source exists; runtime activation unproved |
| work items/containers/finite stock | approved item-container-120 V5 normalized rows | runtime-catalog reader + compiler | Stage 16/items-property/resource nodes | authoring approval PASS; activation `not_requested`; runtime use forbidden |
| ordinary NPC basis | approved enriched occupations/social roles/legal/social-position maps; approved demographic/appearance | actor/role/occupation readers + compiler | Stage 15/16, NPC runtime | schedules, knowledge, behavior/goals and appearance are usable; concrete clothing/tools still blocked by inactive item catalog |
| light/weather/activity/body-time | approved Temporal v4 datasets | existing temporal/environment/body owners | existing temporal persistence | executable; derive current state, never author strings in scene profile |
| presentation | committed entity/group/item/NPC refs | existing perception/opening projection | existing presentation owner | projector currently omits first-entry ordinary objects at state version 0 |

## Compiler boundary

`compileProceduralSceneProfile` consumes only exact approved owner records and a
binding containing refs. Output components retain owner table/id, category,
source field, exact quantity bounds and selection weight. It does not author
physical nouns, prose, probabilities or default quantities.

- required components bypass RNG;
- optional candidate choice may use only source weights;
- source weight is never interpreted as presence probability;
- absent explicit presence policy means `optional_presence_policy: null`;
- every declared applicable required layer must be covered or compilation
  returns `PROCEDURAL_SCENE_PROFILE_DATA_GAP`.

## Immutable v6 authoring overlay

`procedural-scene-v2/authoring-overlay.json` revision 3 contains three new
route-free candidate rows compiled from approved WK claim/evidence refs and the
exact Spatial-v3 v6 scene/G5/parent/G6 closure. It does not promote or copy the
old draft landscape/water/land-use/place rows and contains no quantity or
capacity.

The paired artifact is an approval **request**, not an attestation. The three
route-free rows now have separate row-scoped authoring attestations, while
`import_authorized=false`, `activation_authorized=false`, and no activation
request/event exists. Candidate rows are not executable runtime data.

## Functional mapping candidate

`procedural-scene-v2/functional-mapping-v1` adds one versioned, deterministic
functional-layer candidate and a separate approval request. It is not
self-approved and defines mappings only: no runtime item, container, stock,
place group or event is created.

- fishing `tool` selects only independently usable trap/net/spear alternatives
  by exact V5 profile/category IDs; `work_material` is a separate finite spare
  line/float/sinker component group, without claiming a compatible repair
  operation; both retain V5 entry weight, quantity, inventory, category and
  source refs and require a committed runtime source;
- fishing `storage` and `work_zone`, plus dormant drying `storage` and
  `work_zone`, are persistent place-function groups over exact approved G6
  slots, not item/container claims;
- natural shore remains a typed owner-context group without local taxon or
  resource presence; wreck material requires a separate committed wreck/source;
- one committed material source cannot appear in two functional item layers or
  count as both unrevealed stock and a created item.

The remaining typed gaps are fishing container compatibility, active drying
tool/material and conditional container ownership, and conditional finite wreck
source identity. Functional mapping candidate is independently authoring-approved
for `authoring_mapping_only`; import and activation remain forbidden.

## Combined disposable import pack

`procedural-scene-v2/import-pack-v1` deterministically combines exact overlay
rows, three row attestations, approved functional mappings, V5 approval/target
pins and Spatial-v3 v6 compatibility tuple. Candidate, promotion manifest,
approval request and pre-approval ledger have sealed digests. Rows, statuses,
forbidden implications, materialization limits and all five remaining gaps stay
byte-equivalent to approved upstream artifacts.

Compiler emits eleven normalized generated-cache records: three profiles,
seven mappings and one approval/limits/gaps record. Generic catalog membership
inserts them into `world_base.procedural_scene_compiled_records`; payloads omit
authoring evidence prose/source descriptors and contain no runtime instances,
stock, containers, processes or operations. Table is append-only and is the
existing runtime-catalog readback owner, not a second persistence path.

Request asks only `approve_disposable_local_authoring_import` for a disposable
local PR-candidate database. It grants no operator, production, activation,
default, deploy or rematerialization authority. Ledger deliberately has no
approval attestation yet, no runtime capability, and zero activation events.
Safe wrapper refuses import until a separate exact independent attestation is
provided, then uses existing baseline registration and catalog import owners;
it never creates an activation request or event.

## Current family gaps

| Family | Existing nearest data | Blocking gap |
|---|---|---|
| natural shore | approved route-free row plus approved typed natural-layer authoring mapping | landing/access/safety/local taxon/stock remain forbidden; conditional wreck material requires separate committed source |
| inland fishing worksite | approved route-free row plus approved tool/work-material/place-function authoring mappings | container compatibility remains typed conditional gap; no station/catch/route or runtime stock implied |
| drying/storage workspace | approved editorial place row plus approved dormant storage/work-zone authoring mappings | dormant variant implies no object/process/NPC; active tool/material and conditional container remain process-owned gaps |

## DATA GAP: executable activation

- required capability: compile three exact current-v6 families from approved imported rows;
- correct owner: runtime-catalog activation and world-base authoring workflow;
- missing proof: independent approval attestation and completed disposable-DB
  execution of baseline registration plus no-activation import/readback for the
  exact v6 tuple; integration test is present but was skipped locally because
  Docker was unavailable;
- nearest data: source archive, item candidate bundle and v6 spatial manifest;
- why insufficient: candidates/manifests do not prove active rows;
- minimum delta: independently approve or reject exact combined import request;
  if approved, run baseline registration plus import/readback in disposable DB.
  Activation remains a separate forbidden step;
- acceptance: unknown/draft/missing/ambiguous record hard-blocks before runtime.

## DATA GAP: finite resources

- required capability: source-owned quantities and ambient policy for each
  material category used by baseline/remainder;
- correct owner: item/resource profile plus existing `party_resource_nodes`;
- missing data: the mapping preserves existing V5 quantity/mechanics refs, but
  no runtime stock or source instance exists; natural origin is not an infinite
  policy;
- minimum delta: exact quantity/profile refs and explicit ambient policies only
  where authoring data says conditional abundance;
- acceptance: depletion, reload, CAS concurrency and rollback with one shared
  remainder across synonyms/positions/request IDs.

Until these gaps close, no compiled artifact is eligible for production loading
and no gameplay/model acceptance run may claim procedural baseline coverage.

### Explicit status decisions

- item-container-120 V5 authoring approval is PASS and immutable; building/layout/
  content profiles and G4/item rules remain `NOT ACTIVE`. This overlay reads them
  only as approved authoring evidence and does not consume them as runtime truth;
- enriched occupations/social roles plus approved legal/social-position seeds:
  usable for NPC schedule, property, knowledge, behavior, relationships and goals;
- actor demographic/appearance owner and `materializeActorBaseAppearance`:
  implementation is usable, but exact current-v6 active readback contains no
  applicable entries because the appearance candidate activation is false;
  runtime wiring therefore remains blocked instead of falling back to candidate data;
- Temporal v4 daylight/weather/activity/body-time/remote-catchup/propagation:
  usable through existing owners; initial environment derivation is implemented
  and tested, but production loading remains gated on exact profile pins in the
  compiled scene artifact;
- draft name pools: not usable; ordinary unrecognized label remains player-safe
  until a name has approved/authored basis.
