---
name: owner-decisions-d75
description: "Owner 2026-10-02 evening (D75), answers to evening review #229: acct2 bank reset pressed ~17:39Z; Cursor cycle resets end of October; owner live playtest of the slice once opening passes ≥9/10; M7 #109 starts with four start parameters, more later"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-02T18:53:21.267Z
---

Owner, ~19:15Z, answering the four questions of evening review #229: «1 да 2 в конце октября 3 что за стартовые параметры? 4 да».

1. **acct2 bank reset.** The owner pressed it around 17:39Z (20:39 MSK). The week reading dropped from 97% to 0%. Which reset was pressed is not stated. I marked the soonest-expiring one in `fleet/resets.tsv`: `acct2 2026-10-04 used:2026-10-02` (backup `resets.tsv.bak-20261002-d75`). acct2 still has 10-05, 10-22 and 10-29 avail; main has 10-29.
2. **Cursor.** The cycle resets at the end of October. The pool percentage is still unknown; the 09-30 snapshot (91%) is stale.
3. **M7 #109 — decided: start with four parameters, extend later** («да, начнём с 4, потом увеличим», ~19:30Z). The owner declined my GitHub comment on #109 recording this, so do not re-post it unasked. What I explained:
   - the four parameters are region, season, occupation and social position, extracted from the player's free description; the code then picks a compatible procedural start;
   - character, goal and backstory are player-authored fields (D11), not world state;
   - my recommendation: start with these four; any additional parameter needs its own owner, a source of allowed values and its own check.
   Source: `fleet/tasks/prep-m7-brief/out/prep-m7-brief.md:7,31,59`.
4. **Owner live playtest.** Yes: schedule the owner's live playtest of the v17 slice once opening-audit passes ≥9/10 (the D49 «ready» criterion).

**How to apply:**
- acct2 is fresh until the global reset 10-03 17:00Z; keep it loaded with luna armies (wave 5 launched 10-02).
- When the opening fix reaches ≥9/10 on N=10, offer the owner a playtest slot.

Related: [[owner-decisions-d74]], [[owner-decisions-d49]], [[codex-credits-grant-2026]].
