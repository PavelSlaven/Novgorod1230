# production-v2 review artifacts (#154)

Author-side records for the final independent approval (WR §21.1). Not approvals.

- `step1-access-classifier-decisions.json` — first pass over the 1527 `domain_internal_only` claims of production-v1 (class, roles, confidence, rewrite_candidate, note).
- `step1-access-strict-review-decisions.json` — strict second pass after the contract audit of steps 1–2 over 276 opened claims (keep / keep_strip_prefix / revert_internal). Physics and chemistry claims open to `conversation` must be on this keep list (criterion (в)).
- `step1-2-access-counters.json` — production-v1 vs production-v2 classes, reach per purpose and per actor role, criterion (в).
- `approval-queue.json` — claims whose production-v1 verification no longer matches or that have none; they need the final approval.
