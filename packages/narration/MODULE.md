# @rus/narration

## Назначение

Единый безопасный workflow генерации и ограниченного ремонта прозы для первого экрана и обычного хода.

## Владеет

- versioned `narration_request`, `narration_output` и `narration_flow_result`;
- проверкой visible-only входа;
- exactly one writer call → deterministic schema/visible-only/hidden-leak validation → at most one format/contract repair → repeat deterministic validation;
- историей генераций и ремонтов.

## Не делает

- не читает hidden state, БД или глобальный runtime context;
- не выбирает LLM provider и не импортирует provider SDK;
- не создаёт факты мира кодом;
- не определяет последствия хода;
- не строит UI и не пишет party state.

## Публичный API

- `runNarrationFlow(request, ports, options)`;
- validators для request/output/audit/result;
- `createNarrationService(ports, defaults)` для workflow composition root;
- константы схем и repair routes.

## Порты

`writer.generate`, `formatRepairer.repair`.

## Инварианты

- narrator получает только validated visible context;
- semantic failure не превращается в deterministic prose fallback;
- repair ограничен одним вызовом и всегда повторно валидируется детерминированно;
- normal gameplay path не вызывает LLM auditor, router или senior cascade;
- approved result содержит ровно один утверждённый output;
- upstream repair не вызывает persistence.
