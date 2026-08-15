# Stage 11 — player-character

Изолированная LLM-генерация персонажа внутри утверждённых рамок Stages 2–10.
Разрешённые explicit player appearance values сохраняются как intent; затем
общий code-owned helper заполняет только пропуски из pinned Stage 7 player
candidate set и строго валидирует `actor_base_appearance_v1`. Код не сочиняет
биографию, статус, связи, навыки или имущество.
