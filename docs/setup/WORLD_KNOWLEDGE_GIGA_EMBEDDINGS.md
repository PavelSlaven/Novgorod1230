# Локальная подготовка Giga embeddings для World Knowledge

Production World Knowledge требует локальную модель
`ai-sage/Giga-Embeddings-instruct-480M-0826` на exact revision
`0c94f705aa35719324fb46f7e75b0a5c275da6e4`. Веса не входят в Git.

## Подготовка

Из корня репозитория:

```powershell
python -m pip install -r tools/world-catalog-workflow/requirements-embeddings.txt
python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='ai-sage/Giga-Embeddings-instruct-480M-0826', revision='0c94f705aa35719324fb46f7e75b0a5c275da6e4')"
```

При необходимости укажите тот же Python для game-server:

```powershell
$env:RUS_WORLD_KNOWLEDGE_PYTHON = 'C:\path\to\python.exe'
```

Runtime всегда запускает Transformers с `local_files_only=True` и передаёт
`HF_HUB_OFFLINE=1` и `TRANSFORMERS_OFFLINE=1`. Поэтому сеть во время игры не
используется, а отсутствующий exact snapshot завершает startup ошибкой.

## Проверка готовности

```powershell
npm run world-knowledge:giga-readiness
```

Проверка загружает exact snapshot полностью offline, кодирует русский и
английский запросы, подтверждает 1024 конечных L2-нормированных значения,
повторяемость русского вектора и выполняет поиск по production vector index.
Успех печатает JSON со `status: "ready"`; любая проблема с Python, cache,
profile, worker или vectors даёт ненулевой exit code.

Лицензионная запись находится в
`data/world-catalogs/novgorod/world-knowledge/embedding-profiles/GIGA_480M_0826_NOTICE.md`.
