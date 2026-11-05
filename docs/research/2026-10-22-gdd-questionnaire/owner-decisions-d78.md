---
name: owner-decisions-d78
description: SUPERSEDED in part by D158 (10-08): narration is free, only world facts come from data. Owner 2026-10-03 — opening atmosphere comes from data (option a + projection fix), narrator invents nothing; most local-model problems come from incorrect input transmission → army research + issue on what and how each role receives
metadata:
  type: project
---

Owner, 2026-10-03 ~16:00Z.

1. **Opening.** Option (a) together with item 1: atmosphere comes from world data and the narrator invents nothing. «Плеск воды или шелест листьев — не проблема»: such ambient details are fine once they come from data (place, season, weather, water and vegetation), so supply them, don't forbid them.
2. **Directive (standing):** «В целом надо внимательно относиться к тому, в каком виде и что передаётся в локальную модель. Большинство проблем с ней происходит как раз из-за некорректной передачи.» Before blaming the model, audit what reaches it: content, form, language, contradictions with the norms, data lost in projection, role parameters.
3. **Ordered:** a separate army research and a GitHub issue for it.

**How to apply:**
- Any LLM failure → first check the actual payload: system prompt, user payload, role params, schema.
- Opening fixes: project frame light/season and ambient data; Russian prompt where length follows the facts.

Related: [[owner-decisions-d77]], [[bench-check-mandatory]].
