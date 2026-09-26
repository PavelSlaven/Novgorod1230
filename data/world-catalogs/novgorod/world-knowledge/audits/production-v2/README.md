# production-v2 review artifacts (#154)

Author-side records for the final independent approval (WR §21.1). Not approvals.

- `step1-access-classifier-decisions.json` — first pass over the 1527 `domain_internal_only` claims of production-v1 (class, roles, confidence, rewrite_candidate, note).
- `step1-access-strict-review-decisions.json` — strict second pass after the contract audit of steps 1–2 over 276 opened claims (keep / keep_strip_prefix / revert_internal). Physics and chemistry claims open to `conversation` must be on this keep list (criterion (в)).
- `step1-2-access-counters.json` — production-v1 vs production-v2 classes, reach per purpose and per actor role, criterion (в).
- `approval-queue.json` — claims whose production-v1 verification no longer matches or that have none; they need the final approval.
- `step4-G1..G4-coverage.json` — audit needs (#151) per authoring group: covered / already_in_pack / no_source with the claims that cover them. New claims are in `production-v2/v2-g*.json`, book sources in `production-v2/v2-book-sources.json` (fb2 library, facts from `books-evidence-v1`).
- `step4-law-rewrites.json` — in-world rewrites of Russkaya Pravda and river-landing claims (text without article numbers or source wording) and their access class.
- `step3-time-precision.json` — review of the 8 `precision: unknown` claims; 7 narrowed to the catalogue date of their source.
- `step5-aliases-A1.json`, `step5-aliases-A2.json` — search aliases added for audit `retrieval_miss` needs, with the target claim or concept.
- `final-approval-verdicts.json` — final independent approval (Claude Opus 5.5, high reasoning) of 853 changed or new claims: 486 APPROVE, 364 REJECT, 3 NEEDS_REVIEW. Rejected changes were undone (existing claims back to their production-v1 state, access never widened; rejected new claims removed). Per-batch reports: `verification/verification-production-v2-*.md`.
- `final-access-counters.json` — production-v1 vs production-v2 after the approval.
- `step6-benchmark-v1.json`, `step6-benchmark-v2.json` — `benchmark-world-knowledge-vectors` on `benchmarks/retrieval-v1.json` (174 cases) for both revisions: both pass (hybrid recall@10 0.916 → 0.920, hard-constraint recall 1 → 1, applicability precision 1). Lexical-only hard-constraint recall drops 1 → 0 in v2; it is not a gate metric and needs a look. Vectors: 5648 entries × 1024, offline Giga 480M on CPU; unchanged texts reproduce v1 vectors (cosine ≈ 1).
- `step7-acceptance-plan-mode.json` — plan mode on the 120 audit situations (oracle plans, party date 1 Oct 1230, after the famine start). Of 226 in-scope needs closed in v2: missing_from_pack 27/124, retrieval_miss 3/91, access_filtered 0/11 (all npc_decision; this branch does not have #153 part B yet — recount after it lands). No need present in a v1 slice is lost in v2. 36 of 37 new claims appear in slices; both famine claims appear only with the event started.
