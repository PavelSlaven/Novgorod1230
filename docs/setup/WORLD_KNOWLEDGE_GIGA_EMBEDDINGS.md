# Giga embeddings для World Knowledge

`npm run play:local` сам устанавливает managed Python 3.11.11 через pinned
`uv`, exact dependencies и snapshot
`ai-sage/Giga-Embeddings-instruct-480M-0826@0c94f705aa35719324fb46f7e75b0a5c275da6e4`.
Системный Python и ручная загрузка не нужны. Runtime использует локальный путь,
`local_files_only=True`, `HF_HUB_OFFLINE=1` и `TRANSFORMERS_OFFLINE=1`.

Артефакты хранятся в `%LOCALAPPDATA%\Novgorod1230`; resumable-загрузки и
checksum не позволяют молча принять неполный либо другой snapshot. Веса не
входят в Git и Hugging Face после успешного provisioning не требуется.

Ручная диагностическая проверка уже подготовленного runtime:

```powershell
npm run world-knowledge:giga-readiness
```

Она кодирует русский и английский запросы, проверяет размерность 1024,
нормализацию, повторяемость и production vector retrieval.
