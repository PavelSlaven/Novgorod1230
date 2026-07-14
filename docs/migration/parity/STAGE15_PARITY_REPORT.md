# Stage 15 parity report

Релиз: `0.9.0-migration.9`

Stage 15 NPC placement сравнивался с baseline `stage15-npc-placement-0.8.0.js`.

Подтверждено:

- compatibility export surface;
- exact input и reference index;
- NPC placement structure and reference validation;
- G5 binding и uniqueness checks;
- audit contract;
- successful orchestration;
- format repair для malformed JSON;
- semantic repair для смысловых нарушений;
- result, permission и handoff shape.

Этот отчёт фиксирует историческую parity миграции `0.9.0`. После materialization v2 production Stage 15 создаёт NPC кодом из approved regional profile sets и placement rules; отсутствующие роли, мотивы или размещение не дополняются ни кодом, ни LLM.
