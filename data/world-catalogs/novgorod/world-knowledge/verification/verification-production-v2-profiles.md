# production-v2 coverage profiles — approval (#154, WR §21.1)

Independent approval pass: Claude Opus 5.5 (high reasoning), separate from the author passes. Candidate state: commit `6e59b2834f8ea9ebf6459e97db251482b799f7d0`, file `data/world-catalogs/novgorod/world-knowledge/production-v2/foundation.json`.

## Reviewed change (production-v1 → production-v2)

- 9 profiles changed `purposes`: `npc_decision` added for physics_material_science, psychology_behavior, social_behavior (D15); `conversation` added for domains with actor-visible claims; `narration` not extended (D16 uses existing narration profiles); `conversation` kept off psychology_behavior and social_behavior (contract §15).
- All profiles and the manifest moved from `reviewed` to `production` once every claim had an APPROVE record.

## Verdict

- First pass: REJECT for `wk-profile:environment:scientific-foundations-v1` only — it had `conversation` without `npc_decision`, so speech was wider than NPC decisions (against D15). The other 8 profile changes and the status flip were approved as they are.
- Fix applied at the candidate commit above: `npc_decision` added to `wk-profile:environment:scientific-foundations-v1`. The approver stated that a script check of purposes is enough after this fix; the script check found no profile with `conversation` or `narration` but without `npc_decision`, no change of `narration` against production-v1, and no `conversation` on psychology_behavior or social_behavior.
- Same pass: 53 claims open since production-v1 that became reachable by `conversation` through these profiles were reviewed one by one — 4 kept (fisher craft, `role_bound`), 49 narrowed to `domain_internal_only` (historiography, service wording, modern science); their records are in `verification-production-v2-F13-narrowed.md`.

## Limits

- D15 "NPC decisions see all domains" takes effect only with #153 part B (`npc_decision` removed from the actor-facing purposes in `@rus/world-knowledge`); until then `npc_decision` still filters `domain_internal_only`.
- Contract §15 lists the purposes of the psychology and social layers; its text must follow D15 through CORPUS_EDIT (#153).
