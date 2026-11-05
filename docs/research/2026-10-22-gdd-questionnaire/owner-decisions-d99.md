---
name: owner-decisions-d99
description: "D99 (10-06) — item sections final structure after the RimWorld comparison (one section per item, Еда incl. ingredients, Тара, Обломки и остатки, Упряжь и повозки…); item names = literary words, archaic only in NPC speech; 18 container names approved"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-06T08:41:46.989Z
---

D99 (2026-10-06). The owner, after the RimWorld comparison (research from game Defs 1.5/1.6), said: «Да, согласен. И по разделам вещей тоже согласен.»

**Sections (draft r3 is built on these):**
- One section per item; the engine may allow more, but the data does not use it (RimWorld practice).
- «Еда» absorbs «Ингредиенты». An ingredient is a use, not a section: any food product can go into cooking. All 113 food+ingredient second memberships disappear.
- Generic name of an item with no own name = material + kind («железный ключ»). Condition («ржавый») is a separate property.
- New sections:
  - «Обломки и остатки» (RimWorld Chunks): chips, bones, slag, boat debris, scraps;
  - «Тара»: bags, sacks, boxes, chests, barrels, storage pots. Containers get a section like every item; placements and selectors stay outside.
- «Конская упряжь» → «Упряжь и повозки» (+106 cart/sledge parts).
- Placement fixes:
  - seals, plombs, bullae → «Письменное» (writing and its authentication);
  - fasteners (10) → «Сырьё и материалы»;
  - «Утварь» = for the home (food, drink, light, cleaning, personal care), «Инструменты» = for work and crafts.
- «Прочее» is only an explicit authoring residual; never offered to the model at runtime.

The result is 19 sections + «Прочее»: Одежда, Доспехи и щиты, Оружие, Еда, Напитки, Снадобья, Инструменты, Утварь и посуда, Тара, Ключи и замки, Украшения, Деньги и ценности, Письменное, Сырьё и материалы, Упряжь и повозки, Культовые предметы, Музыкальные инструменты, Игры и игрушки, Обломки и остатки.

**Naming rule:** a player-facing name (screen, narrator) is an understandable literary Russian word for a thing that existed in the epoch. This follows situational_prose_requirements.md:117 (no pseudo-archaism) and PC (anachronism = a thing, not a word). Archaic words (тул, кошница, мошна, голк, горнец) are only for NPC speech (D60).

**Container names, owner-approved verbatim:** короб, ведро, корзина, бочка, сундук, кошель, поясная сумка, кувшин, ножны (нож), ножны (меч), игольница, колчан, мешок, ларец, малый мешок, горшок, кадка, ящик. The interim ap (CHANGES_REQUIRED, archaic words) is superseded by the owner's own approval. No Opus final for these 18.

**How to apply:**
- item-top-categories r3 applies the ap findings plus D99, then a short sol re-check → Opus final → import.
- irc-code bench v2 uses the r3 menu.
- item-generic-names writes the 18 names and plans the load path.
- The norm sentence needs a CORPUS_EDIT update.

Related: [[owner-decisions-d95]], [[owner-decisions-d96]], [[owner-decisions-d92]].

**D103 (10-06), section generic names (item_name_ru):** «Письменное» → «писчая вещь» (kept); «Тара» → «контейнер» (owner: «контейнер вполне подходит»); «Упряжь и повозки» → «упряжь». The owner floated «транспорт?»; I advised against it, since a single saddle is not «транспорт». Owner 10-06: «ок, тогда оставляй упряжь» — final. These names show only for items with neither an own name nor a kind, which is rare.

**D104 (10-06):** owner: «чтобы такого не было, надо будет провести аудит стартовых сущностей и убедиться, что там всё ок». Fleet task `start-entities-audit` covers all 7 v17 starts: every player-visible entity (place, scene, items, containers, NPCs, natural objects). It checks the name source and its approval status, the section, and the absence of service text, and reads the real opening via the PG acceptance. Report to the owner first; fixes come as separate tasks.
