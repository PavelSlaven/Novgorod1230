# architecture tools

## Назначение

Проверки архитектурных границ и структуры исходников репозитория.

## Владеет

- статическими проверками импортов, модульных границ и production wiring;
- проверкой архитектурных контрактов по исходникам приложений.

## Разрешённые зависимости

```architecture-tool-app-dependencies
[
  {"source":"check-boundaries.mjs","target":"apps/game-server","reason":"Проверка архитектурных границ читает исходники приложений как текст"},
  {"source":"check-boundaries.mjs","target":"apps/game-web","reason":"Проверка архитектурных границ читает исходники приложений как текст"}
]
```

## Проверки

- `node tools/architecture/check-boundaries.mjs`
- `node --test test/modules/runtime-tools-boundary.test.js`
