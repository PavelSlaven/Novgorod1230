---
name: codex-credits-grant-2026
description: "Main ChatGPT/Codex account (grandfathered Pro 200) got a one-time 62,500-credit grant; Pro 200 allowance halves from 2026-10-30; one full reset expires 10-29; fleet spends credits automatically after the weekly limit"
metadata:
  node_type: memory
  type: project
  originSessionId: 54079181-b55a-4a07-9f95-23c7eaa6e6a2
  modified: 2026-09-30T14:02:12.649Z
---

Seen 2026-09-30 in the owner's screenshot (Settings → credits) and in the Codex rollout snapshot on servak (main CODEX_HOME).

- **Grant.** 62,500 usage credits (about $2,500) sit on the main account. Rollouts show `credits.balance: "62500"` and `plan_type: pro`.
  - Press (MakeUseOf 09-30, X posts): a one-time grant to existing Pro 200 subscribers, as compensation, expiring 2026-12-31.
  - The exact terms are in OpenAI's email to the owner, which I have not seen.
  - Auto reload is OFF, so there are no real charges after the grant runs out.
- **Plan cut.**
  - Official Pro tiers article: grandfathered Pro 200 keeps the old allowance through 2026-10-29, then moves to a lower one.
  - Press: Codex/Work drops from 20× to 10× Plus, and GPT-6 Pro chat from 200 to 100 per week.
- **Credit mechanics (official credits article).** Included usage is spent first, then the credit balance (Codex, Work, Word/Excel/PowerPoint). GitHub code review has its own «enable credits use» toggle; the bot says «add credits … and enable them for code reviews».
- **Reset.** One banked «Full reset» (5-hour, weekly or both), expiring 2026-10-29.
- **Effect on the fleet.**
  - On 09-30 at 06:45Z the main account's weekly `used_percent` was 78; it resets 2026-10-03 20:16Z.
  - Past 100%, the main account keeps running on credits. There is no limit error, so the fleet does not switch accounts (fleet:297 switches only on a limit or auth error).
  - New luna sessions go to the less-loaded account (`pick_luna_home`). sol stays on main, so sol burns the credits.
  - Rates per 1M tokens: luna 2.5/0.25/12.5, sol 6.1 50/2.5/250, Astra 250/25/1250. On 09-29 sol used about 3000 credits and all luna about 60.
  - Spending evenly until 12-31 comes to about 680 credits a day.

- **Banked resets (owner's screenshots, 09-30).**
  - main: 1 full reset, expires 10-29.
  - acct2: 4 full resets (week + 5 h), expiring 10-04, 10-05, 10-22 and 10-29.
  - acct2 is plan_type `team` (a Business seat). Its weekly window opened 09-29 ~20:53Z and resets 10-06 20:53Z; at 13:20Z on 09-30 it stood at 5 h 4%, week 11%.
  - Official rule (help 20001498): a full reset refreshes the 5-hour and weekly windows and starts a NEW 7-day window from that moment, cancelling the scheduled reset. It is consumed only if something is refreshed.
- **Owner decisions D52 (09-30; #133 comment 5912660733).**
  1. Auto reload stays off.
  2. Credits and limits go on the board and into the evening review.
  3. Use every reset on both accounts.
  4. No Codex GitHub review.
  5. Model routing unchanged; recheck around 10-07 whether the credits last past 10-30.
  6. **acct2 must NEVER spend credits, only resets.** The owner stressed «важно». acct2 rollouts show `credits.has_credits: true, balance: null` (workspace credits), so the server could charge them past the limit.
     - Guard: `fleetlib.NO_CREDITS = {"acct2": 85}` and `fleetlib.py ok acct2 <home>` (exit 0 only below 85% of both windows).
     - bin/fleet `luna2_ok` sits in `pick_luna_home`, and a run guard after the account choice covers sticky sessions, HOME_ONCE and a fixed CODEX_HOME. The account moves to main, which forces a fresh session.
     - acct2 reset advice fires from 85% of the week.
     - Tested on fake accounts: 6 `ok` cases, 7 pick/guard cases and 2 advice cases. Backups: `*.bak-20260930-nocredits`.
     - Residual risk: a run already in progress can cross 100%. OpenAI says an active turn continues «subject to fair use», and whether that is billed is not documented. The server-side switch is on the owner's side (see the handoff question).
- **Implemented 09-30.**
  - `fleet/bin/fleetlib.py` gained `limits <home>`, `report [resets.tsv]` (both accounts, resets left, advice) and `creditlog <home> <since>` (spent = sum of drops, added = sum of rises). `rate` is unchanged (outputs compared).
  - `fleet/resets.tsv` holds the reset list; I mark a reset `used:<date>` when the owner says he pressed it.
  - `board.py` shows a «Codex основной / второй» line under «Сборка», plus amber advice. The JS merge refreshes `#lim`. Backups: `*.bak-20260930-limits`.
  - The evening review SKILL.md got a credits/resets bullet; the owner report now lists which reset to press.
  - Advice rule: press when the week is ≥99% with ≥48 h to the natural reset; otherwise on the day before expiry (UTC+3). Tested on 7 synthetic cases.

**Why:** the grant is free capacity that expires, and from 10-30 the plan cut halves the fleet's included Codex.

**How to apply:**
- When the board or the review shows advice, tell the owner which reset to press.
- After he presses it, edit resets.tsv.
- Around 10-07, report the credit burn: `creditlog /root/.codex 2026-10-01T00:00:00+03:00`.
- Ask the owner before changing model or account routing to spend credits or resets.

Related: [[servak-fleet]], [[chatgpt-dots-evaluation]], [[owner-decisions-d50]].
