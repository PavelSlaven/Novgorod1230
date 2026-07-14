# @rus/narration

## Назначение

Единый безопасный workflow генерации, аудита и ремонта прозы для первого экрана и обычного хода.

## Владеет

- versioned `narration_request`, `narration_output`, `narration_audit` и `narration_flow_result`;
- проверкой visible-only входа;
- bounded generation → audit → repair → senior audit;
- историей генераций, аудитов и ремонтов;
- typed upstream repair request при невозможности утвердить прозу.

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

`writer.generate`, `auditor.audit`, `formatRepairer.repair`, `seniorWriter.repair`, `seniorAuditor.audit`, `router.route`.

## Инварианты

- narrator получает только validated visible context;
- semantic failure не превращается в deterministic prose fallback;
- repair ограничен счётчиком и всегда повторно аудируется;
- approved result содержит ровно один утверждённый output;
- upstream repair не вызывает persistence.
