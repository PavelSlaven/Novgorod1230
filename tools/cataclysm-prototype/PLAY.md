# Native prototype agent boundary

- Запускай только отдельный native `cataclysm` userdir и focused `cata_test`.
- Это bare native agent harness: тестовый ввод вызывает штатные CDDA actions.
- Не подключай provider/model, sealed T06–T12, production runtime или player saves.
- Свободная речь и authored materialization не готовы; не заявляй их проверенными.
- Один полностью автоматический P1 curses smoke из PowerShell в корне репозитория:
  `powershell -ExecutionPolicy Bypass -File tools/cataclysm-prototype/run-p1-curses.ps1 -Smoke`.
  Reset — повтори эту же команду: каждый запуск копирует неизменный P1 fixture в
  новый userdir, выбирает English,
  загружает мир,
  выполняет ходы, делает `Esc` → `S` → `Y` для save-and-quit, затем `Q` → `Y`
  для выхода. Лог, сравнение save/RNG hashes и exit code остаются в
  `artifacts/YYYY-MM-DD/task01/p1-curses-*`.
- Сборки используют фиксированный default `artifacts/2026-10-19/nativebuild`;
  при переносе укажи `-NativeBuildRoot`. Для native focused tests и speech probe
  используй `native-smoke.ps1`. Известные controls запускаются только явно через
  `-Controls`.
- Сборки, временные миры и evidence создавай только в `artifacts/YYYY-MM-DD/`.
