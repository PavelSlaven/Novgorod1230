---
name: owner-decisions-d81
description: D81 (10-04) — I personally read every LLM prompt (full system + user payload + params) before accepting any prompt/input change
metadata:
  node_type: memory
  type: feedback
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-04T21:38:37.535Z
---

Owner, 2026-10-04 ~19:40Z: «Промты проконтролируй лично, каждый, чтобы опять там мусора не было».

**Why:** the #230 army found garbage in role inputs (DTO dumps, jargon, English, contradictory demands, forbidden lists), the main blocker of the first playtest (D80).

**How to apply:**
- Every READY that changes a prompt, a role's input projection or role params ships `prompt-review-<role>.md`: full system + user captured via `buildProviderRequestPayload` before/after, plus effective params. I read it in full myself (not a subagent) before CLOSE/commit.
- Check against [[local-model-context-rules]]; send findings back with file:line.
- Repo norm since PR #234: WR §24.4.

Related: [[owner-decisions-d83]], [[owner-decisions-d79]].
