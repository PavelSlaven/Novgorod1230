# Выбор gameplay LLM

`npm run play:local` можно запустить без `DEEPSEEK_API_KEY`. Откройте
<http://127.0.0.1:3000>, нажмите ⚙ и выберите режим:

- **По умолчанию** — DeepSeek из process environment;
- **Локальная Gemma 4** — preset
  [`HauhauCS/Gemma4-26B-A4B-Uncensored-HauhauCS-Balanced`](https://huggingface.co/HauhauCS/Gemma4-26B-A4B-Uncensored-HauhauCS-Balanced)
  с редактируемым default endpoint `http://127.0.0.1:8000/v1`;
- **Свой OpenAI-compatible endpoint** — произвольные `baseUrl`, model и
  optional API key для локального либо облачного сервера.

Локальную модель заранее запустите в любом inference engine, который реализует
`POST <baseUrl>/chat/completions`. Игра не скачивает модель и не управляет
engine-specific процессом. Нажмите **Проверить**, затем **Применить**; Apply
также выполняет обязательную gameplay qualification.

Выбор сохраняется между перезапусками в
`%LOCALAPPDATA%\Novgorod1230\llm-settings.json` на Windows или platform config
directory на других ОС. Путь можно заменить через `RUS_LLM_SETTINGS_PATH`.
Optional API key хранится только в этом локальном user-config и не возвращается
в browser, logs или telemetry.

Выбранные endpoint/model идут через единый `@rus/llm-runtime` во все production
gameplay, narrator, planner, auditor и repair calls. Каждый вызов получает
`maxTokens = 20_000` и timeout 120 с. Fallback на DeepSeek или другую модель
запрещён: connection, auth, model, timeout и response errors возвращают typed
ошибку, а незавершённый ход не сохраняется.
