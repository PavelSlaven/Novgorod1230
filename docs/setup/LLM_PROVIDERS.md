# Gameplay LLM

`npm run play:local` автоматически подготавливает и запускает pinned
`HauhauCS/Gemma4-26B-A4B-Uncensored-HauhauCS-Balanced` через managed CUDA
`llama.cpp` и OpenAI-compatible `chat/completions`. Python, Ollama, LM Studio,
vLLM, ручная загрузка весов, endpoint и API key не нужны. После первого
provisioning игра работает offline.

Перед загрузкой launcher проверяет Windows x64, NVIDIA GPU, 24 GiB VRAM,
32 GiB RAM и 30 GiB свободного места. Если конфигурация не поддерживается,
новая партия блокируется с фактической диагностикой; в ⚙ можно выбрать
произвольный внешний OpenAI-compatible `baseUrl`, model и optional API key.
Другую локальную/облачную модель игра сама не запускает.

Настройка сохраняется в `%LOCALAPPDATA%\Novgorod1230\llm-settings.json`.
API key остаётся только в локальном файле и не попадает в browser read model,
логи или telemetry. Сброс возвращает managed Gemma.

Выбранный provider проходит через единый `@rus/llm-runtime` во все production
planner, NPC, narrator, auditor и repair calls. Каждый вызов получает
`maxTokens = 20_000` и transport timeout 120 с. При local/custom режиме нет
fallback на DeepSeek или другую модель: connection/auth/model/timeout/response
ошибка типизирована, незавершённый ход не фиксируется.
