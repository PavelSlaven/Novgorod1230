# PR92 — static coverage checkpoint, 2026-09-05

## Status: integration checked; offline context acceptance pending

The user's clarified requirement permits plausible reconstruction from
neighbouring periods/settings and practical reasoning. WK contract §0.2
requires useful context about work, clothing, tools, household, means,
status and behaviour, not direct attestation of every ordinary detail.
Reviewed reconstruction remains distinguishable from attested knowledge.

The integrated corpus contains **1,295 approved claims, 856 concepts,
442 sources and 913 evidence records**. This includes 121 independently
reviewed editorial premises for ordinary, human, practical and public life.
Their committed candidates are `9e59d01` (ordinary/human), `6210be8`
(practical), `6dff36d` (public) and `1a96aea` (healer practice). Existing per-claim verification bindings
validate against the full assembled authoring input. No new approval system
or runtime owner was introduced.

Cartography has **182 supported families and 49 retained partial need
records**. The latter contain earlier direct-source-oriented limitations
and newly linked reconstruction support. They are not 49 independently
confirmed current P1 blockers, nor automatically closed P2 details: their
game-useful significance was independently reassessed on the 1,278-claim
bundle: no substantial residual family gap was confirmed under the approved
reconstruction criterion; bounded limits remain in the macro-gap audit.
Counts and a filled matrix
do not prove completeness of the map or world.

All 1,497 archive files retain their dispositions. The expanded vector
package contains **4,302 x 1,024 float32 entries (17,620,992 bytes)** and
uses the existing `wk-embedding:giga-480m-0826:v1` profile. No model or
dependency version changed.

## Checks actually completed on this integrated corpus

- Compiler: all 1,295 claims and independent approval bindings validate.
- Category-cartography validation passes on all included fragments and
  claims, with existing profiles and potential-consumer boundaries.
- Focused authoring, runtime, population, foundation and cartography tests:
  **85/85 pass**, including independent bindings and runtime/vector alignment.
- **253-case** gameplay retrieval benchmark: hybrid Recall@10 **0.995389**,
  Recall@20 **0.997365**, gate PASS.
- Unchanged **133-case** baseline on the expanded corpus: hybrid
  Recall@10/20 **0.969925**, gate PASS.
- Both retain hard-constraint recall and applicability precision **1.0**.
  Existing gates were not weakened. Documentation, knowledge-source and
  architecture checks also pass. A focused run started before the vector
  rebuild completed caught the expected old-index mismatch; after the aligned
  4,302-entry index was written, all 85 tests passed. No gate was changed.

The mixed ordinary-dispute probe still misses two relevant soft premises in
top 20; an aggregate pass is not perfect recall. Three new positive probes
initially omitted required material/moisture/temperature/process context.
Their fixtures now supply that stated hypothetical context and also test
rejection when it is absent; neither production filters nor claims were
changed to force retrieval. A kinship probe's
incorrect widow-claim expectation was corrected to the actual kin-help
premise after reading the claim text; neither corpus nor gate was changed
to force that result.

The published integration checkpoint `b83b3aa98f75440bc34bde9f46b6b52b5a60436f`
also passed GitHub `full-npm-test`. This certifies that checkpoint, not a
later candidate or final HEAD. Current readiness audit and a green final
exact-HEAD full suite remain mandatory before claiming merge readiness.

## Offline context acceptance — not live gameplay

Two independent generators supplied 50 unseen situations each for batch 01,
covering diverse people, work, places, relations and circumstances. This is
stochastic LLM sampling, not a seeded uniform statistical world sample.

The original template-based batch-01 review was rejected and replaced by
four concrete 25-case independent reads. They identified one substantial
gap, ordinary healer work, now addressed by six independently approved
editorial premises and three retrieval probes. The apparent requirement
for exact ski-fragment behaviour was correctly treated as unspecified
contact geometry, not a missing special-case fact; no ski handler or
fixture-specific production claim was added.

Batch 02's four independent reads cover 100 further cases and report no
substantial gap. **Neither batch 01 nor batch 02 counts toward acceptance**:
they predate explicit discipline-balanced sampling, and many cases place
technical objects in social dilemmas without testing the underlying process.
They remain useful diagnostic records, not whole-world coverage evidence.

Starting with batch 03, each hundred has 20 declared primary knowledge
areas with five cases each: 80 practical/natural/physical and 20 social or
institutional. Each case records its actual knowledge need. Reviewers must
check substantive diversity, not merely labels or objects mentioned.
The partition controls sampling only; it is not a closed world vocabulary.

Batch 03 now has 100 unique cases and 100 independent case reviews. A
structural check confirmed all 20 declared areas have five cases, all cases
state a knowledge need, and every cited claim exists in the reviewed
1,228-claim bundle. The substantive review nevertheless rejected seven
primary labels: `b03b-037`, `039`, `041`, `042`, `043`, `046`, `048` are
primarily structural, physiological or acoustic questions despite their
institutional, family or religious setting. **Batch 03 is diagnostic, not
a clean acceptance batch.** Future generators must make the required
knowledge central to the question, not just count people, objects or tags.

Reviewers reported 36 raw gap cases. These are leads, not 36 proven missing
families: secondary full-bundle reads already recover drying, wood repair,
wet-ground support, cooking, snow cooling, wedge splitting and plant
identification from general premises. Conversely, measurement/tare,
grain comminution, sound propagation and conditional independent trials
needed new general knowledge. The candidate-only checkpoint
`ce8f135152accb0fe35ed488371a4c9846f64b25` contains 32 proposed premises
across process, food/biology and measurement/sound/milling fragments. They
and 18 further practical/household/cleaning premises are now independently
approved and included above. The latter candidates are `17077c7` (corrected
practical and household bindings) and `c2f0c69` (cleaning mechanisms).
Independent source review corrected two bibliographic attributions,
beresta section anchors, an unclear plaster term and overbroad trauma
evidence/qualifiers before promotion. Unchanged premises were not sent
through redundant review chains.

The 36 raw leads resolve into 13 compositional/over-specific questions and
23 cases addressed by the newly reviewed general knowledge. In particular,
ambiguous smoke does not require a unique colour diagnosis; fresh fish
does not require an exact price or guaranteed shelf life; a cracked loaded
foundation does not require a guaranteed in-place repair. No special-case
recipe or gameplay handler was added. This is diagnostic gap disposition,
not an unseen acceptance result.

Batch 04 has two new independent 50-case inputs under the same stratified
rules and 100 WK-only context reviews against the 1,278-claim corpus.
All 20 declared areas contain five cases; reviewers report no substantive
domain mismatch. IDs and cited refs were checked. However, initial gap
reports falsely claimed existing lever, sharpening, wool, lime and
fermentation knowledge was absent. Those findings were corrected against
the full bundle, not used to add duplicate facts. Independent secondary
review by `/root/context_review_b01` resolved the nine remaining practical
leads through existing premises and cautious composition. The attributed
case answers retain limits; neither special recipes nor guaranteed outcomes
are required. The corpus was unchanged throughout this batch.
**Batch 04 is the first clean acceptance batch: 100 cases, no substantial
new gap after full-bundle triage.** This does not prove whole-world coverage.

Batch 05 contains another 100 independently generated, stratified cases.
Four reviewers read 25 each. Review quality checks corrected three answers
that initially described the wrong input circumstances and rejected several
false absence findings by looking up existing general premises. Genuine
remaining needs include wet-ground support, equine digestive distress,
large-ungulate track differentiation and plant-material/contact context.
Source investigation produced 17 premises in three fragments, now separately
verified and included in the descriptor/runtime. Candidates are `a2548c2`
(animal/plant) and `5a9d969` (corrected ground/material). The independent
review rejected two initially overbroad compound claims: birch chemistry
is now limited to studied Betula pendula material, and fibre/alkali behaviour
to the comparative study, not an assertion of safe cleaning.

The final eight raw case leads cover wet-ground passage and flooded ground,
groundwater in an excavation, bark/fuel context, alkaline textile response,
hoof-trace comparison, equine digestive distress and plant contact/bedding.
The new general premises supply those missing relationships. Observation
of a vanished channel, a guaranteed safe route or a fixed fresh-bark ignition
result still cannot be inferred from an underspecified scene; these are not
new recipes or local facts. **Batch 05 is diagnostic and resets the streak
to 0**, not acceptance after its gaps were used to fill the corpus.

Batch 06's two generators were blind to the corpus and previous samples.
Their new 100 inputs were not used to author the 17 additions. Independent
WK-only reviews now use the frozen 1,295-claim bundle.

The current clean streak is **0 of 3**. Contract §0.3 requires
three consecutive diverse independent batches of at least 100 cases with
no substantial new gap; a gap resets the streak. Replayed or imbalanced
cases cannot count as unseen acceptance. Missing exact names, figures,
legal powers or equally plausible ordinary variants are not by themselves
substantial gaps.

## Boundaries preserved

This work is static authoring, verification, cartography and offline WK
retrieval/context evaluation. It starts no live gameplay campaign and
repairs no inventory, ownership, materialization, persistence, body, combat,
NPC, narration or spatial owner. WK remains read-only grounding; it does
not create current state, canonical authority or exact mechanics.

The Gameplay Gap Auditor remains the target architecture for a separately
authorized gameplay-testing phase. Offline context sampling is not gameplay
saturation and cannot certify it. Earlier readiness snapshots and verdicts
are superseded; their history remains in Git.

## Future-testing finding: unowned ordinary item -> action production

- Classification: `CODE_MECHANICS_GAP`, P1, open; outside static WK repair
  scope.
- Prior trace: `gameplay-gap-50037af3-6cb8-4e9e-a89e-a3d29b30d2d8:trace:0`.
  Local retained reports are not published evidence.
- Symptom: an unowned ordinary runtime item was excluded by the ownership
  join before action-production commit. No compression, shaping, placement
  or narration result committed.
- Correct owner: action-production / items-property and persistence
  handoff, not World Knowledge or retrieval.
- Disposition: retain for a separately authorized gameplay-testing task;
  do not repair or replay it within this static phase.
