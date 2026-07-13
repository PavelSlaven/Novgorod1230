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

Код не создаёт NPC, роли, мотивы или размещение; эти данные принимаются только из LLM output.
