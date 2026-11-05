---
name: owner-decisions-d159
description: "D159 (10-08) — prose liveliness threshold ≥8/10 mean by blind judges, protocol texts excluded entirely (0); PC:252 wording approved and committed by lead (0b3479f40)"
metadata:
  node_type: memory
  type: project
  originSessionId: b18be067-2ea2-4675-8b46-3e075512a88a
  modified: 2026-10-08T08:15:10.994Z
---

D159 (2026-10-08 ~08:12Z, owner via lead, verbatim): «14 да. 15 пороги выше, не ниже 8 из 10. Тексты-протоколы надо исключить вовсе.»

- **14:** PRODUCT_CONSTITUTION:252 gets my wording («Ощущения, мысли и чувства героя и связки рассказа свободны…»). The lead committed it himself: 0b3479f40 on fleet/pc252-d158. CA ca-pc252-d158-1 is running.
- **15:** the prose judge rubric #593 needs mean liveliness ≥ 8/10 by blind judges, and protocol_feel = yes in no text at all. I updated `d158/30-judge-rubric.md` (sha d95cf052). protocol_feel = «partly» is not settled by D159 — I asked the lead.

**Why/How to apply:** every prose acceptance (D41 benches, CR #158 qualification) uses these thresholds.

Benchmark from the 10-08 trial: Sonnet's best arm 7.3–8, qwen's 5.7–6. So qwen needs real input flesh (D158 p.2: #594 #595 #596 #566) plus the new prompt. Prompt work alone will not reach 8.

Related: [[owner-decisions-prose-freedom-1008]], [[prose-helper-protocol]].
