# @rus/narration

## Назначение

Единый безопасный workflow генерации и ограниченного ремонта прозы для первого экрана и обычного хода.

## Владеет

- versioned `narration_request`, `narration_output` и `narration_flow_result`;
- проверкой visible-only входа;
- writer → deterministic structural validation → at most one format repair → semantic audit;
- один synthetic whole-prose segment и не более одной цельной semantic rewrite;
- full final semantic audit после semantic repair;
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

`writer.generate`, `formatRepairer.repair`, `auditor.audit`, `semanticRepairer.repair`.

## Инварианты

- writer и format repair получают confirmed outcome в исходном request; auditor и semantic repair получают его отдельным evidence-полем `confirmed_outcome`; auditor отдельно получает optional player-safe `action_intent_context` только как non-evidence для обнаружения intent-to-success;
- semantic failure не превращается в deterministic prose fallback;
- format repair и semantic repair независимы: каждый максимум один раз;
- malformed audit/repair, не единственная replacement цельного synthetic segment и final audit failure блокируют flow;
- semantic repair заменяет весь текст целиком; code-owned reassembly не смешивает старую и новую прозу;
- normal gameplay вызывает один LLM auditor, без router/senior cascade;
- approved result содержит ровно один утверждённый output;
- upstream repair не вызывает persistence.
