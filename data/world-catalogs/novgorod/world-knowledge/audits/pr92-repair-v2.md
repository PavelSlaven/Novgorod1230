# PR92 review repair v2

## Acceptance boundary

This report supersedes the acceptance labels in the three historical
`final-*.md` files. It records the corrective candidate, not merge approval.
The final exact-commit CI and independent audit verdicts belong to the PR92
acceptance comment after this candidate is committed. A green earlier commit
does not certify a later commit.

**Full factual completeness remains BLOCK.** Category cartography exposes
12 missing families; neither the 81 basic envelopes nor the corpus size proves
that all gameplay categories are populated. No merge or deployment is approved.

## CI defect

The review baseline was `782a9b4162dbc2358ad947ea0b929beaa081ace6`.
Its full CI failed because the knowledge retrieval policy pinned an obsolete
corpus-manifest digest (`RETRIEVAL_POLICY_STALE`). The scoped repair commit
`d8b264bc007b489c00d0f93a35d2a2e6a5197b60` passed full CI run
[33857564204](https://github.com/PavelSlaven/Novgorod1230/actions/runs/33857564204).
The subsequent contract edit updates the manifest and policy together.

## Per-claim approval

Production now contains **871 claims**, 664 concepts, 259 sources, 543 evidence
records and 12 profiles. Its descriptor includes three verification fragments
with exactly one independent `APPROVE` per active claim. Each verdict binds the
claim, both localizations, direct concepts, predicate, evidence and sources.
The compiler rejects missing, duplicate, stale, rejected or unresolved approval.
Compiled claims retain `verification_ref`; reviewer records stay authoring-only.
This is trusted editorial traceability, not authentication of an auditor.

The review reconciled exact candidate verdicts, not shard names or ordinal row
positions. New source checks corrected the NIST publication (960-16e3, not the
unrelated 960-17), USDA, ASTM and DoITPoMS anchors. Six broad historical claims
were rebound to independently checked Kolchin/Rybina/Desyatinny evidence.
Monk–Johnston printed p.317 supports the four Troitsky statements only with
their existing probable/inferred/medium qualifications.

Two whole claims did not receive approval: `novgorod-wood-bone-horn-classes`
and `woodworked-objects-and-waste`. Their original payloads are preserved in
`research/unapproved-foundation-v2.json`, outside the production descriptor;
their unresolved verdicts remain in the independent review records. Their old
`review_status` flags are not a promotion authority. The source-repair report
explains the unsupported conjunctions. No historical or scientific fact was
invented to retain a corpus count.

## Categories and materialization

`production-v1/category-cartography.json` separates semantic families from
informational domain rollups and source inventory. It maps the active WK,
location, O2a/O2b/A1/F1/S1 and scene-presentation consumers to concrete families.
Tests independently enumerate the actual runtime profile paths, including F1
under phase-m10, and reject missing consumers and family refs.

The independent category audit passed this structural control but identified
12 missing families. These concern flora, amphibian/reptile and invertebrate
context, shelter interiors, storage environment, fishing maintenance, riparian
materials, occupation/location/access and extinguishing. WK remains factual
grounding for the existing materializer: no state, instance, stock, access,
topology or ordinary-action whitelist is created by this map.

## Verification of this corrective candidate

- World-catalog workflow tests: **212/212** (includes compiler approval gate,
  production equivalence, archive dispositions, fauna, foundations and category
  cartography).
- WK Core/planner/vector and server grounding/materialization bridge: **38/38**.
- Knowledge-source tests: **54/54** after the contract/manifest/policy update.
- `architecture:check`, `docs:check`, `knowledge:check`, all seven
  `knowledge:controls`, and `git diff --check`: PASS.
- Exact embedding-input equality checked. The existing pinned vectors for
  **3070 unchanged inputs** are retained; only four ru/en vectors belonging to
  the two unapproved claims were removed. No model or dimensions changed.
- Fresh 133-case retrieval run: PASS (`retrieval-repair-v2-report.json`).
  Hybrid Recall@10/20: 0.941729/0.960526; hard-constraint recall and
  applicability precision: 1; hybrid noise: 0.511911. Thresholds unchanged.
  The shavings probe no longer requires the quarantined unsupported claim;
  its still-approved contextual-waste premise remains required.

Old retrieval and live-prose reports remain historical measurements; their
PASS labels do not automatically transfer to this candidate. Exact-HEAD full
CI and final independent review must be reported separately after commit.
