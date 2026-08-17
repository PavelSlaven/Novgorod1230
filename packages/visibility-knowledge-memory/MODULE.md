# @rus/visibility-knowledge-memory

## Назначение

Pure player-safety projection boundary: validates and constructs narrator-safe visible data and validates/merges knowledge-memory facts. В temporal flow вызывается только from committed factual state/change set, never as a source of facts or a pre-commit persistence substitute.

## Владеет

- Владеет visible package allow-list, hidden-leak detection/stripping, memory/knowledge validation and deterministic merge, safe narrator package, factual conversation audience projection и deterministic resolution утверждённого evidence graph из committed facts/statements.
- Владеет чистой player-safe проекцией `portrait_spec_v1` из canonical actor
  identity, sanitized visible equipped items и presentation-only state.

## Не владеет

Не владеет objective truth, perception calculation, time/body/movement rules, narration, UI rendering, DB reads/writes, commit or presentation delivery.

## Public API и контракты

Phase 10 API: `resolveCompositeCompletionOutcome` принимает только
provenance-validated committed inputs; `projectPlayerSafeCompletionOutcome`
раскрывает terminal dimension values только через visible committed facts.

`VISIBLE_PACKAGE_KEYS`, `detectHiddenLeaks`, `stripHiddenForNarrator`, `validateVisibleContext`, `mergeKnowledgeFacts`, `validateMemoryFact`, `buildSafeNarratorPackage`, `buildPlayerSafeVisiblePackageEnvelope`, `projectConversationAudience`, `resolveEvidenceConclusions`, `resolveAuthoredStatementEvidence`. Conversation audience строится только из фактических per-listener perception results: actual listener/witness получает received knowledge независимо от наличия response boundary. Statement evidence появляется только из committed statement с exact authored structured claim и source knowledge/perception lineage; wording остаётся решением conversation responder и не обязано дословно совпадать с authored template. Ordinary или несвязанная speech остаётся statement, но не становится evidence. Evidence resolver принимает exact authored graph и committed evidence refs, не превращает отсутствие в отрицание и не назначает legal consequence. Projection не назначает responder и не раскрывает private knowledge другого NPC. Inputs are plain closed data; visible context requires version `1`, schema `visible_context_package`, `visible_scene` and only allowed keys. Outputs are frozen sanitized package, validation `{ ok, errors }`, leak paths or merged facts. The Temporal caller supplies the persisted `visible_package_persistence_envelope` only after factual commit; this module never reads an uncommitted state snapshot as presentation truth.

`projectActorPortraitSpecV1({ identity, visible_equipment, presentation })`
принимает только committed, server-sanitized data, разрешает ровно один visible
base/outer/headwear item на slot и завершает `assertPortraitSpecV1`. Для
historical/incomplete/ambiguous state возвращается `null`; projection не делает
draw, не исправляет и не сохраняет state.

## Ошибки, зависимости и effects

Invalid package/fact is reported in result errors (including hidden-leak paths); this module does not silently grant knowledge or infer missing fields. Depends only on `@rus/kernel`; has no I/O, DB, LLM, persistence or UI side effects.

## Target / activation и тесты

Temporal visible-package persistence is target current
`temporal-world-v1.1` / `4.4.0-target.1`; its visible-envelope definition is
compatible with immutable `temporal-world-v1` / `4.3.0-target.1`: factual commit and pending presentation
status are owned by the game-server transaction. This package creates and
validates the player-safe candidate from candidate post-change facts before the
combined commit; narration and the final screen consume only the persisted
package after commit. It neither activates target nor dual-writes before the
versioned production activation cutover. Revision 17 /
`spatial-v3-production-v7` activates deterministic authored evidence
resolution; historical revision 18 / production v8 additionally activates
provenance-validated composite completion and player-safe projection. Revision
19 / production v9 adds the pure, non-persisted `portrait_spec_v1` projection
from sanitized actor facts and visible equipped items and remains a historical
recovery path. Active revision 20 / M8 / Phase 1A v16 / Phase 1B v15 inherits
the same visibility owner boundary unchanged. `test/domain.test.js` covers allow-list,
leak stripping/detection, safe-package, evidence, completion and memory
contracts.
