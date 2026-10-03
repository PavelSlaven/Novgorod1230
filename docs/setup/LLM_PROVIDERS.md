# Gameplay LLM

Default gameplay model — exact
`qwen3.8-27b-uncensored-w4a16-tp2` через пользовательский OpenAI-compatible
vLLM endpoint. `npm run play:local` не скачивает, не provisions и не запускает
gameplay model. Он отдельно подготавливает обязательный Giga WK runtime.

Открой ⚙, укажи `baseUrl`, exact model и optional API key, затем выполни
проверку и Apply. До успешной настройки UI остаётся `unconfigured` и не
запускает новую партию. Старый сохранённый режим `local` мигрирует в это же
состояние без fallback.

Настройка сохраняется в `%LOCALAPPDATA%\Novgorod1230\llm-settings.json`.
API key остаётся только в локальном файле и не попадает в browser read model,
логи или telemetry. Сброс удаляет активный provider и возвращает
`unconfigured` с exact Qwen model prefill.

Выбранный provider проходит через единый `@rus/llm-runtime` во все production
planner, NPC, narrator, auditor и repair calls. Каждый вызов получает
`maxTokens = 20_000` и transport timeout не более 120 с; поздний вызов
ограничивается остатком шестиминутного safety deadline всего хода. Fallback на
managed model, DeepSeek или другой provider отсутствует: connection/auth/model/timeout/response
ошибка типизирована, незавершённый ход не фиксируется.
