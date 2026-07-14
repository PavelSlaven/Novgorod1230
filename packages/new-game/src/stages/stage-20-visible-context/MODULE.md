# Stage 20 — Visible Context

Формирует `visible_context_package` только из утверждённых результатов Stages 3–19. Модуль владеет входной проекцией, visibility filter, deterministic precheck, LLM builder/repair orchestration и handoff к независимому аудиту.

## Владеет
- контрактом Stage 20;
- фильтрацией видимого/слышимого/известного;
- проверкой ссылок и hidden/knowledge boundary;
- format, semantic и senior repair history;
- digest и разрешением только на Stage 21.

## Не делает
Не создаёт мир кодом, не меняет сцену/время, не пишет прозу, не пишет БД, не импортирует соседние stages и не знает provider SDK.

## Зависимости
Разрешены `@rus/contracts` и нейтральный `src/visible-context` boundary. Запрещены legacy implementation, sibling stages, DB, UI/server и provider SDK.
