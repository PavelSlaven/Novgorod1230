# PR92 final open-world audit

## Verdict: PASS

- Exact HEAD: `6709cb2e793515039ac45ffded2b9938ce9468af`
- Scope: read-only independent review of PR92 World Knowledge provenance rebinding, its active static authoring contract, and unchanged runtime seams.
- Changed surface: nine `data/world-catalogs/novgorod/world-knowledge/**` verification/research metadata files only; no package, server, workflow, runtime-bundle, schema, binding, planner, materializer, or state-owner file changed.

## Evidence

1. `git diff --name-only HEAD^ HEAD` reports nine files; `non_wk_files=0` and `runtime_code_files=0`. The 76 changed records only rebind `candidate_ref` from excluded `research/` paths to exact committed `production-v1` promoted copies. Claim references, digests, verdicts, evidence, limits, runtime bundle, vector inputs, and gameplay code remain unchanged.
2. Active WK contract §§0.1, 0.2, 0.4, 0.5, 35.1, 98.1, and 112.12 separates static factual-family/cartography work from gameplay. Category, place-first, and military-first cartography identify authoring needs only: they do not assert presence, create a location/object/scenario allowlist, materialize an entity, or activate gameplay.
3. `@rus/world-knowledge` remains the sole read-only factual-retrieval module: caller-provided compiled bundle in, bounded slice out. Its interface owns validation, applicability, coverage, ranking, and actor-safe filtering; it owns no LLM call, filesystem/network/DB I/O, presence, materialization, mechanics, persistence, narration, or party state.
4. Game-server `createProductionWorldKnowledgeGrounder` derives `allowed_domains` from active `bundle.coverage_profiles`, then passes one bounded factual plan through the existing `@rus/turn` planner seam and WK Core. The compiled bundle has 11 declared/active domains and 1,655 claims: no fixed 20-domain list exists. `max_domains: 3` is a per-query context budget, not a domain vocabulary.
5. Grounding explicitly states that WK supplies compatibility, never current presence; committed player/NPC-safe state alone proves entities, resources, access, hidden facts, exact mechanics, outcomes, and changes. Thus ordinary claims remain conditional premises while authoritative geography, identity, state, and materialization remain with existing owners.
6. Static review cases include unseen equivalents (unfamiliar mushroom, soaked wedge, porous attachment, unfamiliar wooden repair, shirt alteration, flatbread) and confirm retrieval composes general premises without a named object/location/scenario handler or recipe. PR92 adds no case-specific runtime branch.
7. Active contract §112.12 labels Gameplay Gap Auditor as a future gameplay-testing phase. PR92 neither invokes it nor treats static cartography/provenance approval as saturation, gameplay activation, or a second planner/materializer/state owner.

## Design review

`@rus/world-catalog-workflow` is the deep authoring module: approval, cartography and promoted-copy validation stay behind its authoring interface. `@rus/world-knowledge` is the deep read-only retrieval module; game-server is its composition adapter and retains only I/O/failure-envelope locality. This PR preserves those seams and adds no shallow parallel path. Reality and trade closures are general conditional factual families, not facts about a named scene, object, route, holder, stock, price, force, or outcome.

## Findings

### P0

None.

### P1

None.

### P2

None.

### P3

None. Gameplay Gap Auditor remains a target by active contract; this static PR correctly does not activate it.

## Checks run

```text
node --test tools/world-catalog-workflow/test/world-knowledge-population.test.js
# pass 48, fail 0

git diff --check HEAD^ HEAD
# pass
```
