# Карта контрактов knowledge-source

| Контракт | Владелец | Вход | Выход / ошибка |
|---|---|---|---|
| Corpus manifest | `data/knowledge-source` | 19 зарегистрированных файлов | стабильные IDs, paths, SHA-256, bytes |
| File storage adapter | `@rus/knowledge-source` | explicit source/generated roots | bytes или typed file/integrity failure |
| Document reader | `@rus/knowledge-source` | `document_id` | неизменяемый исходный текст |
| Source location | `@rus/knowledge-source` | ID + line range | source-backed excerpt |
| Full-text search | `@rus/knowledge-source` | query + allowlist | буквальные кандидаты с provenance |
| Graph materializer | `@rus/docs-tools` | corpus + approved graph snapshot | validated graph + manifest |
| RAG materializer | `@rus/docs-tools` | corpus + approved embedding snapshot | rechunked index + manifest |
| Runtime injection | `apps/game-server` | explicit roots | `ports.knowledgeSource` для bindings |

Модуль не владеет семантической генерацией, LLM transport, состоянием партии или выбором игровых фактов.
