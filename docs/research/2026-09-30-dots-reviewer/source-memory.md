---
name: chatgpt-dots-evaluation
description: "ChatGPT dots (DevDay 2026-09-29, always-on GPT-6 Astra agent) as an extra reviewer — Turkey eligible, cost/limits, risks, proposed advisory trial; owner decision pending"
metadata:
  node_type: memory
  type: project
  originSessionId: 54079181-b55a-4a07-9f95-23c7eaa6e6a2
  modified: 2026-09-30T13:51:42.122Z
---

On 2026-09-30 the owner asked whether a ChatGPT dot could be a free extra reviewer. I checked the facts against official pages that day (help.openai.com 20001530 and 20001529, openai.com/index/introducing-dots, the supported-countries list, Pro tiers, and Codex plan usage).

- **Eligibility.** Pro (any tier) or Business Premium, in markets outside the EEA, Switzerland and the UK. Turkey is on the ChatGPT supported list, so it is eligible. The rollout is gradual and can take days. A dot can be created only in the desktop app (Windows works) or desktop web. acct2 (the small plan) gets no dot.
- **Cost.** The first dot is included in Pro. Talking to it does not count toward ChatGPT limits. The plan includes an allowance for «deeper work» with extended limits in the first month; per the release notes, dots usage does not count toward plan allowances for that month, and the terms after it are unpublished. Tasks it starts in Codex or ChatGPT Work draw from the shared Codex/Work pool, which is the fleet's pool.
- **Control.** Plugin permissions are shared with ChatGPT, Work and Codex. Custom Rules are soft. Dot memory can only be removed by deleting the dot. Local computer access is optional and off by default.
- **Repo access.** PavelSlaven/Novgorod1230 is PUBLIC, so a dot can read code, PRs and CI without a GitHub connector.
- **Side note.** The grandfathered Pro 200 allowance lasts until 2026-10-29, then drops. The fleet's Codex budget may shrink; check which Pro tier the owner has.

**My proposal (not yet approved):**
- The dot is an advisory reviewer only. Opus high stays the approver under the project rules.
- No local computer, no Codex or Work tasks, no GitHub writes.
- Blind trial on 3 closed deliveries with known Opus findings, scored by a script (known defects caught vs false positives).

**Plain ChatGPT chat and Codex GitHub review (same day, owner's follow-up question).**
- **Pro chat limits.** Only text chats with GPT-5.6 Luna are unlimited, within abuse guardrails. The reasoning models (GPT-6 Astra, GPT-5.6) have limits («5x higher»).
- **Why chat can't be wired in.**
  - Chat has no API on the subscription.
  - Automating chatgpt.com through a browser breaks the terms: the Pro tiers article says «automatically extracting data» is prohibited and can get the account restricted. That is the same account that runs the Codex fleet.
  - The ChatGPT GitHub app is read-only, so it cannot comment on PRs.
  - Event-triggered PR tasks run in Work, which draws from the shared Work/Codex pool.
- **Codex GitHub review has NO separate limit.** I first claimed it did, then rechecked the same day at the owner's request; the claim was wrong.
  - Bot `chatgpt-codex-connector`, P0/P1 findings only. It reads `## Code Review Rules` from the protected AGENTS.md. `@codex fix …` can push to the branch.
  - No separate review allowance is published for Pro. The pricing page only says local reviews count toward the general limits. The Business/Enterprise rate card bills code review like any other Codex work (model GPT-5.3-Codex).
  - Two Pro users on 2026-09-29 (openai/codex#31001, community thread 1402074) show that `code_review_rate_limit` is null in `/backend-api/wham/usage`. The daily breakdown puts `github_code_review` in the same pool as Exec, up to two-thirds of a day's usage. Reviews get refused with «usage limits for code reviews» while the CLI works; that bug has been open since July.
  - The separate «Code review» meter seen in March 2026 (#15477) is gone.
  - Conclusion: reviews eat the fleet's Codex/Work pool, and the gate is flaky.
  - **Owner D52 (09-30): no Codex review at all.**
- **Dot trial:** the owner has not answered yet. It is free only until about 10-29.
- **Dots are free only for a month.** Release notes: «For the next month, dots usage won't count toward eligible Pro… plan allowances. After this period, we'll share usage terms».
- **Channel idea for dots.** A separate GitHub account for the dot with no repo rights: in a public repo it can only comment. The owner creates it.
- **Owner check on his account.** Codex → Settings → Usage: is there a «Code review» line, and does «GitHub code review» land in the shared pool? The built-in browser is not signed in to ChatGPT.

**Why:** the Claude limit is the bottleneck, and on 09-29 25 of 38 Opus passes were rework. A free pre-filter could save Opus passes.

**How to apply:** if the owner approves a trial, record the decision (#133 plus memory) and set it up as proposed. If the dots terms change after the first month, recheck the allowance before relying on it. Related: [[plane-evaluation]], [[show-owner-before-publishing]], [[servak-fleet]].

**Notion AI (10-05).** Considered as a third advisory reviewer: a Custom Agent with a Slack trigger and the Claude model, on Notion credits. There is no official model API, so unofficial SDKs are out under ToS. Owner is on the free Notion plan and declined: «не думаю, что оно того стоит». Don't propose it again unless the plan changes.
