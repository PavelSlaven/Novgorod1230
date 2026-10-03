# M2c NPC composition candidate

Status: **authoring candidate; independent approval pending; not importable or executable**.
The candidate addresses issue #133 M2c step 4 for the exact approved target
revision `novgorod_spatial_v3_target_contract_approval_001`: 32 G4@1 and the
25 proposed G5 template families. It creates no NPC and changes no topology.

`candidate.json` contains one composition row per exact G4, nine reusable
role/occupation profiles, source references for appearance, equipment and
routines, five regional-context profiles and seven typed integration gaps.
Profile identifiers beginning `m2c_npc_` identify definitions in this file;
they are not claimed to be existing World Base rows. The JSON is a review
artifact, not a new public runtime schema or an alternate NPC owner.

## Authoring interpretation

- Select by exact revision, G4 id/version and generated template id/version.
  A missing or different tuple is a data gap. There is no family fallback.
- Counts 0–2 and equal weights are explicit low-confidence gameplay
  reconstruction choices. They are not archaeological population estimates.
  An empty result is allowed; a nonempty result still needs all exact runtime
  bindings listed below. These are proposed finite selection inputs, not a
  vocabulary limiting future NPC roles or semantic actions.
- Archaeological settlement and burial labels do not prove habitation in
  1230. Their rows propose passing people only, without household, burial
  workers, offices or religious facts.
- A role compatible with a river context does not supply a boat, cargo or
  legal access. Water scenes require a real vessel, occupancy and activity
  binding. Position and equipment checks remain with their existing owners.
- All nine role/occupation pairs exist with `status=approved`; each role is
  explicitly present in the occupation's `allowed_social_role_ids`. The four
  seasonal schedule fields exist for every pair. Their prose is source basis,
  not an executable Temporal activity.
- Appearance reuses the existing two demographic and eight appearance
  facets. The source profiles are approved in v4 and have an approved
  authoring carry-forward to v6. Neither is a target-revision activation.
  Appearance never determines ethnicity, language or regional origin.
- Existing equipment approval covers adult male fisher/boatman clothing and
  two occupational profiles, with its recorded gaps. It supplies no general
  outfit for women, merchants, guides, hunters or household workers. Failed
  equipment coverage cannot silently select a man or another occupation.
- `ordinary_day_work_routine_v1@1` is an existing 1440-minute routine source.
  Transferring it beyond its scenario binding is proposed analogy, awaiting
  approval. The source's exact timestamps, four phases and semantic owner
  must be preserved; M2c does not turn seasonal prose into elapsed-time rules.
- Regional origins now use bounded primary evidence: the
  [1191/1192 treaty](https://www.furthark.com/hanseaticleague/src_pri_1190novgorodgotland.shtml)
  names Gotland and German merchants; its edition gives a broader 1189–1199
  range, while the
  [museum record](https://www.hansemuseum.eu/records/handelsvertrag-mit-dem-fuersten-von-nowgorod/)
  gives 1191/1192. The
  [Novgorod First Chronicle entry for 1228](https://litopys.org.ua/novglet/novg23.htm)
  names Izhorians and Karelians around Ladoga/Neva. The latter passage concerns
  conflict, not ordinary merchants. Applying either source to ordinary
  Lower Dvina guests is explicitly low-confidence analogical authoring.
  Gotland and German guest profiles each have eight exact target contexts;
  Karelian and Ingrian traveler profiles each have six. “Baltic” describes
  trading geography here; it does not assert Baltic ethnicity. These sources
  supply no local frequency or individual language proficiency.
- All five `regional_context_profiles` remain draft. Equal `gameplay_weight`
  is an editorial choice separate from historical evidence. Language is
  explicitly unknown (`language_repertoire: null`); it is not inferred from
  origin, phenotype or occupation. Language-dependent mechanics still need
  approved language/proficiency/source references. Source-backed regional
  context does not complete equipment, body or activity readiness.

## Required owner handoff

Use `materializeApprovedProceduralNpc` in `@rus/materialization` once an
approved target binding supplies the exact actor catalog/profile pins, seed,
generated G5 position/anchor, actor attributes, approved Temporal activity,
body profile and activated clothing/equipment candidates with property basis.
`@rus/npc-runtime` owns routines and Temporal transitions; existing item and
persistence owners retain their responsibilities. NPC creation is code-owned
and precedes narration.

The old `g4_npc_materialization_rules` and `region_npc_profile_sets` tables have
v2 `world_revisions`/`graph_nodes` dependencies. Inserting Spatial v3 IDs into
those fields is not a supported import. A reviewed binding through the
existing Spatial v3 reader/materialization flow is required. This candidate
does not introduce a second reader, persistence path or approval channel.

The existing NPC materializer now accepts an optional exact
`regional_context_ref` with `g4_ref` and `generation_template_ref`. It resolves
the approved row in `approved_bundle.regional_context_profiles`, rejects
revision/role/occupation/G4/template mismatches before RNG and copies the
result into private `semantic_state.regional_context`. It neither changes
appearance draws nor declares origin visible to the player. Historical
callers without this binding retain their previous output. The generated
adapter must require a complete approved binding before nonzero NPC creation;
these draft rows are deliberately rejected.

`runtime-bindings.json` supplies the subsequent body, activity, routine,
clothing/property and placement authoring. The initial candidate's gap inventory
is historical and is superseded by these explicit drafts. No profile is
production-ready until exact target runtime pins and imported approvals exist.
Final import data requires independent `gpt-6-sol` high approval under the
owner's latest instruction, plus Contract Auditor review.

The placement policy reserves arrival for the player and uses focus/departure
for ordinary NPCs. A water G6 without an existing carrier-supported position
has an explicitly empty initial NPC baseline. This is gameplay authoring with
provenance and directness, and makes no historical frequency claim or boat.

## Verification performed

Read-only validation compared all 32 tuples with the target nodes, all 25
template IDs with the expansion candidate, nine role/occupation pairs with
the enriched TSV sources, 36 seasonal source fields, all ten appearance
facets, source-path existence and the routine's 1440-minute total. All passed.
This checks references and coverage; it is not a runtime or historical
approval. The generated NPC compiler and adapter have an isolated PostgreSQL
test covering atomic P16 actor/body/equipment/routine persistence, reload and
idempotent replay. That test uses synthetic approved fixtures; it is not
production data approval or production activation evidence.

The approved generated import manifest is `../m2c-npc-import-manifest.json`.
Its isolated PostgreSQL test imports the full P12 dependency closure and reads
all 32 exact compositions through the production reader before compilation.
Independent Sol high draft and postpromotion verdicts are recorded in
`approval.json`.

The separate canonical initial candidate binds only the south approach of the
dry pine ridge. Its zero-to-two count and equal forest worker/hunter/guide
weights are explicit initial gameplay choices. It has distinct canonical
regional applicability and three binding rows; generated applicability is not
borrowed. `canonical-initial/approval.json` records its independent data review.
The separate import manifest is `../m2c-npc-canonical-import-manifest.json`.
