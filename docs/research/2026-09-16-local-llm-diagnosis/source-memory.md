---
name: novgorod-2026-09-16-diagnosis-and-local-llm
description: "Pre-Runtime-plan diagnosis of why Novgorod1230 stalled (scenario code vs general mechanisms), the LLM-GM spike, and how to run the game on the home qwen server (2026-09-16)."
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-09-24T19:55:40.813Z
---

Imported 2026-09-24 from memory of project `C:\Users\Slaven\Claude` (source: `~/.claude/projects/C--Users-Slaven-Claude/memory/novgorod1230.md`, written 2026-09-16 on branch `codex/turn-forensic-demo-studio`). Predates Runtime_Plan M0–M8 / v17; numbers are historical, verify before use.

**Diagnosis.** Engine sound, but project scaled scenario code instead of general mechanisms: 74k of 97.5k lines in `apps/game-server/src` were `lower-dvina-trace-*`; all production handler bindings scenario-bound; playable world 4 G5 nodes. Authored content reachable only by near-literal phrasing ("подробно осмотреть место крушения" → roll + clues; paraphrases → silent generic fallback) — i.e. a command parser, contradicting the project formula. Metric to watch: `lines(lower-dvina-trace-*) / lines(packages)` (was 0.66, must fall). Catalog revisions store only CHANGED files — a missing file in a revision is not lost content; check `content_refs`.

**Narration.** Prose quality is a contract problem: narrator prompt was 6458 chars of English negation rules at `temperature: 0`, forbidding any bridge/cause/sensation, so output = rephrased fact list. With facts fixed and delivery (movement, gaze, pacing) given to the narrator, same model wrote reference-quality Russian.

**LLM-GM spike** (`C:\Users\Slaven\Documents\Novgorod-gm-spike`, README there): interpreter → resolver (truth + ops/beats) → code arbiter (dice, routes/time, knowledge channels, presence, single item holder, atomic commit) → per-NPC voices → player-safe narrator; offscreen tick every 20+ game min. 72 turns on TP2 qwen: median 14.4 s, p95 24.2 s, ~4 calls; 42% accepted first try, 49% after arbiter feedback. Resolver with thinking: correct but 149 s/turn. Qwen quirks: stray CJK tokens, `content` None when thinking exhausts max_tokens.

**Local qwen run.** `%LOCALAPPDATA%\Novgorod1230\llm-settings.json`: `mode: "custom"`, `base_url: http://192.168.1.100:11437/v1`, model `qwen3.8-27b-uncensored-w4a16-tp2` (server details: `servak_access.md` in the `C--Users-Slaven-Claude` memory). Stops managed Gemma download; Giga-Embeddings 480M still downloads. On 2026-09-16 qwen failed narration-auditor gate 4/5, which blocked server startup.

Git Bash GNU tar breaking on `C:\` paths was fixed in PR #136/#140 (System32 bsdtar); see [[research-scripts-and-deterministic-checks]].
