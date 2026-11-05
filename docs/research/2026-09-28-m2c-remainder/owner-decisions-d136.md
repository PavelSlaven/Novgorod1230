---
name: owner-decisions-d136
description: D136/D137 (10-07): #449 connect all unread game-base groups via a separate army task; CR #178 P0 item-material reader right after the PR98 playable-slice push; relayed by the helper
metadata:
  type: project
  modified: 2026-10-07T14:18:31.473Z
---

Owner answer relayed verbatim by the helper session (2026-10-07 ~06:10Z): «1. подключать, дать отдельную задачу армии. 2.да.»

**D136 — #449: connect, as a separate army task.** Groups: historical events, historical figures, health, recreation (game-base `history-events-knowledge`, `transport-health-recreation/health_body`, `recreation_culture`). I had recommended (a) only for events/figures and (b) for health/recreation; the owner said «подключать» without a carve-out, so all four are connected.
- How to apply: the army task names one consumer per group plus import path, owner and readback (#338 rule). Where no mechanic exists (health, recreation), the consumer is World Knowledge for the narrator and NPCs, not new mechanics (no hypothetical infrastructure). The helper drafts the task; I launch it when a D131 slot frees.

**D137 — CR #178 P0 (item properties contract with the material reader) goes right after the PR98 playable-slice push.** Item materials merged on 10-07 (archive-material-apply) are not read by the runtime until then.

Related: [[owner-decisions-d135]], [[feedback-data-task-needs-runtime-reader]].

**D138 (2026-10-07 ~07:10Z, owner directly in my chat): «Решение по выходам - да».** The opening (#495, task opening-wire) shows exits exactly as the opening screen shows them, with their terrain descriptions; the hardcoded `visible_exits: []` and «No perceived route» go. Norm match: situational_prose_requirements §5 lists «видимые exits/barriers» in the opening's necessary context, and the reader question «какие направления … очевидны».

**D139 (2026-10-07 ~07:20Z, owner directly in my chat): «Да, ставь объяснение присутствия сразу за opening-wire».** The next task after opening-wire implements `player_character_start_contract.md` §4: before the first turn the game explains how the hero got here, why now, what for, what he needs immediately and what inaction threatens; the explanation goes into the opening and is fixed before the first turn (§9). It is built only from the player's request plus approved data and code decisions (§5: the model creates no people, kinship, rights, events, items, occupations or toponyms). Today v17 marks reason_here, preceding_context and goal_stake as «unknown» (`canonical-opening-context.js:59`). Context: legacy new-game stages (stage-12 `require_reason_here`) and #109 RT-M7. Without this the opening fails the §5 norm (transferable to any nameless hero).

**D140 (2026-10-07 ~07:20Z, owner via the helper session, verbatim):** «Если нет — заводи issue и проси ведущего армию для заполнения этой дыры. Аналогично остальному, где нет источников — делаем игровую реконструкцию. Постройки вписывает в социалку, экономику и локации.»
- Buildings (#496 materializer CR; #498 data base fill): where the sources run out, build a game reconstruction with marks (D124/D125). Buildings must tie into social data (households → dwelling and ownership), the economy (cost, building, repair, services) and locations (v17 place families).
- General rule: any gap without sources is closed by a marked game reconstruction, not left empty.
- Army build-base-fill (#498; helper draft, sol-led: research and PLAN first, then reconstruction, sol approval, final pass) launches paired with buildings-on-nodes-plan (#496).

**D141 (2026-10-07 ~07:20Z, owner via the helper session, verbatim):** «параллельно проверь экономику. Мы её прорабатывали, но подключена ли? Если нет — заводи issue и проси ведущего армию для заполнения этой дыры. Аналогично остальному, где нет источников — делаем игровую реконструкцию.»
- Finding: the economy is not connected. `@rus/economy` (quoteLocalAmount) has no caller; 13 economy-trade-measures sets are candidate without the final approval (D88); world_base price_bands and region_economy are empty in v17; item value_band is a vocabulary gap. Recorded in CR #184 (comment 6032952019), no new issue.
- Army `economy-connect` (helper draft, sol-led): research and PLAN first. Covers final data approval, import, a consumer for each table (#338: item price and value per §9, exchange and barter, services and hiring, debt and pledge, value_band for #178, building cost for #498), a separate PLAN for the first exchange and price mechanic, and marked reconstruction (D124/D125). The calibration label stays internal (D71).

**D142 (2026-10-07 ~07:45Z, owner directly in my chat): «Оставить SHA как ссылку на утверждённое содержимое».** This answers the WR §21.1 conflict raised by CA body-needs-bind-4 (BNB4-03). Approval records may carry the sha256 of the approved content as the reference to «what exactly was approved», the equivalent of path + git commit that the runtime can check without git. Loaders keep gating on it. Option (a) as I put it also says: add the approval date to records, and signatures or receipts as a security mechanism stay forbidden. The WR §21.1 text still needs an amendment. It is a governance file, so I asked the owner to confirm that edit explicitly before touching it (AGENTS §1.1). Apply now: BNB4-03 is closed by D142; new approval records carry `approved_on`; older records get it at their next revision.

**D143 (2026-10-07 ~07:50Z, owner directly in my chat): «По ценам - нужны базовые цены на всё (нет источников - значит реконструкция), а далее будем применять различные коэффициенты понижающие/повышающие в зависимости от ситуации..»**
- Every priced thing gets an absolute base price: item categories and items, goods, services and labor, buildings (build and repair), pledges.
- Base prices come from sources where they exist, otherwise from a marked game reconstruction (D124/D125). The confidence/calibration label stays internal (D71/D72).
- Situational multipliers (condition, scarcity, season, region, famine phase, relation…) are applied by code on top of the base. This matches economy-connect's mechanics proposal (base × condition × scarcity).
- This supersedes my REVIEW-build-base-fill-01 item 3 («без абсолютных цен до D71»): building economics now need absolute base prices.

**D144 (2026-10-07 ~08:00Z, owner directly): «подтверждаю. Я это уже тебе передавал».** This is the explicit administrator instruction (AGENTS §1.1) to amend WR §21.1 per D142. New sentence: approval records carry who, when (date) and what — path and sha256 of the approved content (git commit if available); signatures and receipts are not used.

**D145 (same message): owner-questions helper.** «Я сейчас заведу отдельного помощника по вопросам к владельцу, будешь ему вопросы передавать, я ему буду отвечать, чтоб не терялось ничего.» From now on owner questions go to that dedicated helper session via SendMessage (once it appears in ListAgents). The owner answers there; that helper relays the answers. A relayed owner answer with a verbatim quote counts as the owner's answer, as with D135–D141.

**D146 (2026-10-07 ~10:40Z, owner directly in my chat): «По ценам - думаю надо сделать справочник по категориям, чтобы можно автоматически выводить цены и накладывать коэффициенты».**
- Prices get a category price reference, built on the same item category tree as the item catalog (D95 top sections and their kinds).
- Each category carries a rule: the sale unit; an anchor (cow, rye kad, labor day, iron…); a material × quantity + labor × time formula; and size/quality/finish factors.
- An item's price is derived by script from its category and attributes. Runtime-materialized items get prices the same way.
- An item-level price is only an exception, with a stated basis. Situational coefficients go on top, as in D143.
- The 972 candidate prices from economy-base-prices become the validation set: a category rule must reproduce them within tolerance, and divergences get reviewed.
- Apply: after revision-03 (felt hat + validator) I launch a sol task «справочник цен по категориям» with the plan to me, then approval, then connection to the game (economy is not connected yet, D141 / CR #184).

**D147 (2026-10-07 ~12:00Z, owner directly: «Согласен с рекомендациями»):**
- The runtime plan gets no separate summary issue. Issue #521 «Карта игрового прогресса» (pinned 10-07) is the single entry point: a link to the Runtime_Plan file in the PR98 branch, a one-line legend of E01–E18 / G1–G12 / M2c / D49, and the status table with evidence from demo builds.
- #133 (M2c) only links to #521. The same table is copied into the PR #98 description at each push.
- The plan file is updated via the demo session's draft → owner approval (via the owner-questions helper) → docs task.
- The demo-build session tracks game progress (owner-assigned duty, see [[demo-builds-session]]).

**D148 (2026-10-07 ~14:15Z, owner via the owner-questions helper, verbatim: «Вопросы все по рекомендациям. По точке - жди, сейчас ответит.»):**
- Runtime_Plan questions 1–7 (my own list, relayed verbatim by the helper; verified 14:22Z). Every recommendation is accepted:
  1. **А.** «Демо» = the LD quest as a v17 start. «Независимый авторский» = one of the 7 v17 starts. Soften the «differs by geometry» criterion (M2a, G1, §5.4).
  2. **А.** M7 = only seeding circumstances into a running party. The start and the hero go into the M2c slice.
  3. **А** for the slice: people on a place = a roll at first arrival plus ≥1 where the place profile declares it. Routines only move already created people. D23.1 is a later direction.
  4. **А.** D49 (1 temperament, 2 values, 1–2 goals, 1 fear) from the D29 dictionaries is the active set. Drop «1–3» from D1.
  5. **Б.** D30 stays: place types outside the start territory are a typed gap. Reconstruction only for yards, buildings and prices (#338).
  6. **В.** Static prices from the category reference are a small M2c item; causal economy goes to M6 (D127.3).
  7. After the PR #98 merge into main (D84), each stage M3–M8 goes to main as its own PR, with no long-lived draft.
- Next: final plan draft (the demo session's `plan-delta-draft-2026-10-07.md`) → docs task → CA.
- Dot (question 8): wait for the dot. No Slack reminder from the bot and no gate bypass. The owner expects the dot to answer.

**D149 (2026-10-07 ~16:35Z, owner via the owner-questions helper, verbatim: «Все по рекомендациям»)** — to my questions 9–11:
- **9. Price reference — variant Б.** Each item gets its own reconstructed measure (mass, size, labour time), marked «реконструкция» per D143. The numbers are game calibration (D71), and every measure has a basis. Goes to the price-category-reference task.
- **10. The three Runtime_Plan «предложения»:**
  - (1) yes — column «Срез D49» in §10 and marks at E01, E02, E03, E04, E08, E13, E16;
  - (2) yes — G10 place generation only for seeding into a running party (M7);
  - (3) no — «WK supplies technology as structured data» stays a bench hypothesis, not a norm.

  (1) and (2) go into a runtime-plan follow-up commit + CA.
- **11. Dot — variant А.** Re-post the 4 gate requests (route-label-d72-2, hist-data-fix-4, runtime-tools-boundary-2, ui-guard-dot-fix-2) as new threads with the same content, under a one-time new label. The push still waits for dot verdicts; this is no gate bypass and no reminder in the old threads.
