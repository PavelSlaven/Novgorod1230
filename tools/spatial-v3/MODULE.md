# spatial-v3 tools

## Назначение

Набор CLI и проверок для authoring, импорта и проверки Spatial V3 migrations, contracts и readiness. Эти инструменты обслуживают разработку и проверку артефактов Spatial V3.

## Владеет

- CLI и генераторами данных Spatial V3;
- статическими проверками migration, projection и activation contracts;
- readiness-проверками Spatial V3 authoring и deployment artifacts.

## Не делает

- не принадлежит production runtime и не импортируется им;
- не управляет игровыми ходами или состоянием партии;
- не разрешает инструментам читать внутренности приложений, кроме явно перечисленных ниже проверок контрактов.

## Разрешённые зависимости

```architecture-tool-app-dependencies
[
  {"source":"check-p14.mjs","target":"apps/game-server","reason":"Contract check reads application source as text without importing or spawning it"},
  {"source":"check-p15.mjs","target":"apps/game-server","reason":"Contract check reads application source as text without importing or spawning it"},
  {"source":"check-p22.mjs","target":"apps/game-web","reason":"Contract check reads application source as text without importing or spawning it"}
]
```

## Проверки

- `node tools/spatial-v3/check-p14.mjs`
- `node tools/spatial-v3/check-p15.mjs`
- `node tools/spatial-v3/check-p22.mjs`
