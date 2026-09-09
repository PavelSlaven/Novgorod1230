# PR92 review repair v2

## Acceptance boundary

This report supersedes the acceptance labels in the three historical
`final-*.md` files. It records the corrective candidate, not merge approval.
The final exact-commit CI and independent audit verdicts belong to the PR92
acceptance comment after this candidate is committed. A green earlier commit
does not certify a later commit.

**Full factual completeness is not established.** The corrected category map
classifies all 871 production claims into 105 semantic families. Independent
re-audit records nine partially covered factual families, not the previous
incorrect claim that twelve families have no evidence. Neither the 81 basic
envelopes nor the corpus size proves exhaustive gameplay coverage. No merge or
deployment is approved.

## CI defect

The review baseline was `782a9b4162dbc2358ad947ea0b929beaa081ace6`.
Its full CI failed because the knowledge retrieval policy pinned an obsolete
corpus-manifest digest (`RETRIEVAL_POLICY_STALE`). The scoped repair commit
`d8b264bc007b489c00d0f93a35d2a2e6a5197b60` passed full CI run
[33857564204](https://github.com/PavelSlaven/Novgorod1230/actions/runs/33857564204).
The subsequent contract edit updates the manifest and policy together.

The next candidate `71c7ff3a3fb81f95ce7ad42232dc00d6a3bc1e60` failed run
[33861113013](https://github.com/PavelSlaven/Novgorod1230/actions/runs/33861113013)
with PostgreSQL `57P03` in Phase 3. Socket-only `pg_isready` accepted the image's
temporary initialization server before the final TCP server started. Nine
integration bootstraps now explicitly probe TCP `127.0.0.1`, matching the
existing Phase 1a/1b pattern. Production database code is unchanged. Phase 3
and all eight sibling integration files passed locally.

## Per-claim approval

Production now contains **871 claims**, 664 concepts, 259 sources, 543 evidence
records and 12 profiles. Its descriptor includes three verification fragments
with exactly one independent `APPROVE` per active claim. Each verdict binds the
claim, both localizations, direct concepts, predicate, evidence and sources.
The compiler rejects missing, duplicate, stale, rejected or unresolved approval.
Compiled claims retain `verification_ref`; reviewer records stay authoring-only.
This is trusted editorial traceability, not authentication of an auditor.

Candidate references now require `git:<40-hex-commit>:<relative-json>#<claim_ref>`.
The production test reads the actual historical Git object and compares its
claim and localizations against authoring. It does not merely read the current
file at that path. Informal candidate IDs remain in review metadata, not in the
machine reference. Pure compilation validates syntax; repository checks resolve
the committed candidate and review artifact.

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

The final independent review found that the earlier 26-family map classified
only 51 claims, although domain rollups covered all claims. That insufficient
control is replaced: the semantic-family union itself must cover all 871.
Removing a claim from that union, omitting applicability axes, or duplicating a
family fails validation. Consumer mappings were rebuilt from concrete needs.

`verification/cartography-gap-review-v2.md` supersedes the old gap assertions.
Amphibian/reptile and invertebrate coverage already existed; current NPC access
is not a missing factual matrix. Nine partial areas remain: tree ecology,
aquatic/herb functions, plant identification, wild fibres, interior functions,
storage conditions, net/boat maintenance, riparian debris and applied water
extinguishing. Each records existing support and the specific missing dimension.
Bounded cartography review: PASS_WITH_LIMITS, not exhaustive factual completeness.
WK remains factual grounding for the existing materializer: no state, instance,
stock, access, topology or ordinary-action whitelist is created by this map.

## Verification of this corrective candidate

- World-catalog workflow tests: **212/212** (includes compiler approval gate,
  production equivalence, archive dispositions, fauna, foundations and category
  cartography).
- WK Core/planner/vector and server grounding/materialization bridge: **38/38**.
- Knowledge-source tests: **54/54** after the contract/manifest/policy update.
- Final cartography/compiler/production changes: all **212 workflow tests**
  rerun and passed. Independent scoped Standards review passed; its focused
  category/production run passed **48/48**, including historical candidate reads.
- Corrected PostgreSQL readiness: Phase 3 passed; eight sibling integration
  files passed **10/10** tests including nested tests. No retry waiver used.
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
