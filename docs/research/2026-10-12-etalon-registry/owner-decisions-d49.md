---
name: owner-decisions-d49
description: "Owner 2026-09-29 (D49): refocus on a playable runtime slice with parallel runtime tasks; data work is NOT paused, Codex luna continues it in parallel"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-09-29T16:14:15.196Z
---

**Superseded (2026-10-05):** пункт «разворот только в узлах/точках маршрута, не посреди сегмента» (аудит, ответ 1) заменён D56: разворот возможен в середине линии (см. [[owner-decisions-d56]]).

On 2026-09-29 the owner said the project felt stalled. My diagnosis:
- No live playtest since 09-25.
- PR #98 is 711 commits ahead of main.
- Almost the whole fleet worked on game-base data, while runtime ran one task at a time.
- The new data has no runtime readers.

The owner answered: «да, переключаемся, нарезай задачи по рантайму. НО по данным на паузу ставить не надо, пусть codex luna продолжает. У нас много ресурсов, делаем задачи параллельно».

**Decisions:**
1. **Priority one: the runtime and a playable slice on v17 from PR #98.** The slice is: start → walk out → meet people with names and character → talk → take or make an item. «Done» means a live playtest passes, not green tests.
2. **Runtime tasks run in parallel,** on separate executors (Claude Sonnet, Cursor composer), each with clear file and owner boundaries.
3. **Data continues in parallel,** driven by Codex luna. This covers imp-crafts PR-B, `needs_check` batches, imp-routed and #201. Data is not paused.
4. **Proposed and accepted as part of the same package:**
   - a live game run on servak every evening, with «what the player saw that is new» added to [[evening-review]];
   - merge PR #98 into main once the slice is playable, not at the end of M2c.

**Owner answers to the slice questions (same day):**
- **Start.** «Сначала починить Вихтую»: the slice starts in Vikhtuy, and intra-G4 canonical traversal (XL) is on the critical path. I had recommended pine_ridge.
- **People.** They appear after the player leaves the start place, with at least 1 on every slice place. The start place may be empty.
- **Name pool.** It goes in through a world_base DDL with its own Contract Auditor, as the sprint plan says. I had recommended the runtime-catalog scope.
- **Character.** 1 temperament + 2 values + 1–2 occupation goals + 1 fear, seeded. The per-occupation goals and fears are authored in task npc-goals (Codex luna); Opus approves them.

**Tasks started 2026-09-29 ~12:30Z:**
- rt-walk, rt-talk, rt-items: Claude Sonnet.
- rt-narr: Cursor composer-2.5.
- npc-goals: Codex luna.
- Common rules: `fleet/rt-common.md`. Recon: `fleet/rt-slice/recon-d9bb04e9.json`.
- Queued:
  - rt-names (DDL, after main is merged into PR #98);
  - rt-people (canonical NPC creation, min ≥ 1);
  - rt-harness (live run, after r2a-claude DONE-2);
  - R-1b-activate/D27 (r2a-claude next).
- MAX_CLAUDE in fleet raised from 3 to 4.

**Fog and darkness (owner, same day, answering D47.9).** «туман и темнота в данном случае суть одна и та же — NPC и персонажи плохо видят в них. Надо с этим сразу решать вопрос».
- Treat both as one class: poor visibility, symmetric for player characters and NPCs.
- Poor visibility must never strand the player without movement. r2a-claude measured the current behaviour: every party starting in dense_fog had zero movement options (4 of 4).
- A design recon workflow ran the same day.

**Passage naming and travel (owner, same day):**
- Name a passage by the connecting line itself («тропинкой вдоль ручья», «по мосткам»). Never by the destination: the player may not know it.
- **No «Проход N» ordinal labels anywhere.**
- Moving between places is not teleportation.
- Consequences for today's work:
  - the walk-labels D1-C catalog («к воде», «ко дворам») named destinations — it is not merged into PR #98 and is on hold;
  - the D1-N and local-edge ordinal catalogs are to be replaced.
- The owner asked for an analysis of the map and location model and of possible contradictions in his contracts. Workflow `map-locations-architecture-review` launched the same day.

**Map model decisions (owner, 2026-09-29, «По всем пунктам да»),** after the map review (result: scratchpad `map-review-result.json`):
1. Positions inside a place (arrival/focus/departure) are hidden from the player. Passing through a place is one transition phrase that names the line.
2. One line model for every move between places. A G5–G5 connection gets the same properties as a route segment (line kind, environment, method, minutes). No separate `way` entity.
3. The names of the 227 lines are authored: a draft from place data plus the closed carrier vocabulary of v6, approved by Opus.
4. Poor visibility: lines from the current place are always offered, by hearing and touch, with time ×1.5. No «lose the way» in the slice. This settles fog items A and C.
5. Moves between places take minutes by line kind from a calibrated profile. Zero-time moves are allowed only inside one scene.
6. One CR to the Spatial standard covers:
   - a line-name field and a ban on ordinals;
   - the canonical G5–G5 connection;
   - travel time;
   - a near-visibility floor;
   - along/toward-landmark direction contexts;
   - fog as a poor-visibility class;
   - rt-walk P1.

   Stale v2 texts get a separate docs task.

The owner then asked (same day):
- Can the v6 graph (11 carrier types, 10 605 edges) be restored?
- The map needs several routes to a place, exits to different places, and forks along the road.
- Road landmarks he introduced, which NPCs can tell about: were they lost?
- Off-road travel: a character who does not know the route can still reach a place by holding a direction.

A second review workflow was launched to answer these.

**Realistic map decisions (owner, 2026-09-29, «По карте везде да»),** after the second review (scratchpad `map-review2-result.json`). Facts found:
- The start cell has no v6 data.
- v6 is a draft: no inter-place roads, no forks.
- Road landmarks were lost in the v3 transition. The landmark engine `@rus/environment-landmarks` survives only under tag `backup/pr8-before-reconstruction-2026-07-16`, and table `graph_edge_knowledge_rules` exists but is empty.

Decided:
1. **Slice D49 contains lines only:** kind, name, minutes, 8 cardinal directions, live execution of the routes between sectors, forks as places, and a unique-label invariant. Landmarks and NPC direction-telling are stage 2; off-road travel and bearing are stage 3; v6 for 70 cells is stage 4.
2. **Off-road travel** uses authored «бездорожье» lines between neighbouring sectors with concrete G5 entries. «Hold a direction» is a chain of lines inside a direction cone up to a stop condition.
3. **«Wrong place» after the slice:** the traveller arrives at the nearest river, road or landmark and loses time, but is never stranded (needs a §11.7 change).
4. **Landmarks of the start cell** are written by Codex luna from WK and place data (only what exists or logically must), approved by Opus.
5. **NPCs may be wrong or lie** about the road (false_belief, will_hide_or_lie), from stage 2.
6. **v6 returns** when the game leaves the start cell. Until then only its carrier vocabulary is used.

Three CRs go under one issue: Spatial; knowledge/conversation; plan contract (`request_movement` direction operand).

**Owner addition (same day):** a route may lead far away rather than to the neighbour (for example, along a river), and one exit may lead to several places. I verified this against the standard:
- A `world_route` runs from a canonical G5 to a canonical G5 in any G4. It may cross G4/G1 through waypoints and boundary points (§4.5, §4.10–4.11, :4187). Time is the sum of its segments, and upstream and downstream are separate routes.
- One gateway may serve several routes (:602).
- A fork is a canonical G5 junction, because a waypoint exposes no alternative (:624, :4214). Every point where a traveller can stop or turn (a landing, a crossroads) must therefore be a G5 junction.
- The owner asked me to double-check his statements («я начинаю путаться, перепроверяй»).

**Answers to the 13 map questions (owner, 2026-09-29):**
- Slice directions are river-relative, plus a separate geography task. New line kinds must stay addable through new registry versions. The CR technical decisions are accepted, and the corpus edit starts.
- Minutes: model values. Poor visibility has two grades, ×1.5 and ×3 for whiteout.
- Long routes: the owner proposed «nodes every 30 min (?)». I recommended route points every ≤30 min (stop, rest, turn back) rather than G5 places, plus a new CR rule that allows turning back at any internal point, since the standard's waypoint currently exposes no alternative. The owner approved it: «Устраивает». He also asked for a completeness audit of the map and navigation design («может мы ещё что-то упускаем»).
- Some exits need transport or a skill; without it there is risk. This is modelled as a line requirement plus a method risk profile.
- NPCs travel only on lines. No encounters on lines in the slice (encounters are stage 2). Seasons come in stage 3. Map growth goes to the Dvina neighbours first.
- The owner asked whether this system is better than coordinates. My answer is a hybrid:
  - the graph stays the only movement authority;
  - approximate place coordinates serve only as authoring source data, from which a script derives line directions, minute sanity checks, off-road candidates and landmark distances, all then approved;
  - the runtime never derives anything from coordinates (standard :5959, §17.8).

**After the completeness audit (owner, 2026-09-29; scratchpad `map-audit-result.json`, `map-audit-report.md`):**
- **Geography.** An authored reconstruction map is the game truth. Places are laid out inside the real framework of the delta arms (cardinal sides, flow to the sea, islands) so that line names, «downstream», minutes and distances all agree. Opus approves it; the data is marked «реконструкция, не историческая точка». Every line gets a cardinal direction, and off-road travel «по солнцу» works inside sectors. (The place-geo draft showed that real sources place points only to about 10 km, so directions were assessable for only 20 of 86 routes.)
- Audit answers, all accepted:
  1. Turn back only at route points, not mid-segment. The reverse route mirrors the forward one, and an anchor offers «дальше» and «назад».
  2. By default the traveller stops at every point. «Go to the end» continues until a notable event (dusk, a visibility grade change, weather).
  3. Instead of «both» scene slots: the reverse binding starts from the forward binding's slot. No template reissue.
  4. Moves show a rough duration band; the exact minutes stay hidden.
  5. The «known route to …» command is removed from the slice and returns in stage 2.
  6. At a route point in the slice the player can only wait, look around and use the inventory. An overnight stop comes in stage 2.
- Live bugs found and assigned to rt-walk: `assessAvailability` throws on any condition-set ref, and one boat-only path drops the whole path query.

**Water without a boat (owner, 2026-09-29).** «вместо лодки персонаж может поплыть на бревне или просто вплавь. Путь не должен быть закрыт, просто повышается риск.»
- In the slice the option works (option 1): the risk is real and code-resolved from a table (method × water state × season × length × load), with real consequences such as fatigue or cold, wet or lost items, being carried downstream, or near-drowning.
- Death is a separate game-wide question, so there is no death in the slice.
- A water line is never closed. Only a truly impassable physical boundary is closed.

**Movement risk (owner, 2026-09-29, all «да»):**
- New outcome `returned_to_departure`: the traveller turns back to the departure bank with a time loss. Standard §11.6, A.5 and A.12 are amended.
- An item carried off by the current is lost: it leaves the character and is marked «утонул в реке». No retrieval in the slice.
- No swimming skill in the slice: the risk is the same for everyone. The skill comes with character abilities later.
- Death stays a separate game-wide question.

**Lead session moves to servak (owner «да»).** It moves at the next natural boundary, once the current branches merge. I prepare the move and give the owner the launch command: tmux + Remote Control. Memory, skills, scripts and CLAUDE.local.md go to the work volume.

**Why:** the owner wants visible progress in the game. Resources are sufficient for parallel work.

**How to apply:**
- Slice the runtime tasks from the source plan (CURRENT_SPRINT, Runtime_Plan M2c, #133) and from [[m2c-remainder-inventory-2026-09-28]], re-verified at the PR #98 head.
- Never block data tasks for the sake of runtime tasks.
- Record the decision in #133.

Related: [[owner-decisions-d48]], [[servak-fleet]].
