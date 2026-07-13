# Stage 26 — First Game Screen

## Назначение

Формирует первый экран игрока только из утверждённого postcommit public state, утверждённого visible context и утверждённой narrator prose.

## Делает

- проверяет точный Stage 26 input и digests;
- строит reference index из разрешённых публичных ссылок;
- проецирует панели первого экрана;
- выполняет детерминированные проверки структуры и утечек;
- вызывает переданные audit/repair executors через порты;
- формирует Stage 26 success/failure result.

## Не делает

- не читает hidden state;
- не обращается к БД;
- не вызывает provider SDK;
- не создаёт delivery attempt и acknowledgement;
- не импортирует соседние stages;
- не придумывает недостающие факты, ссылки, действия или подписи.

## Публичный API

Основной subpath `@rus/new-game/stages/stage-26` экспортирует только definition, runner, input/projection/validation boundaries и security scanner. Полный старый набор экспортов доступен только через переходный subpath `@rus/new-game/stages/stage-26/compat` для legacy-фасада.

## Разрешённые зависимости

- `@rus/contracts`
- `@rus/kernel`
- `@rus/pipeline-engine`
- внутренние файлы Stage 26

## Запрещённые зависимости

- `legacy`
- Stages 21–25
- `@rus/presentation`
- `@rus/party-store`
- `@rus/world-base`
- provider SDK
- UI/server

## Инварианты

- player-visible prose равна утверждённой narrator prose;
- неизвестные маршруты не раскрывают destination truth;
- repair не меняет immutable bindings и topology ссылок;
- delivery permissions выдаются только после deterministic validation и обоих аудитов;
- concern codes, severity и repair routing совместимы с baseline 0.2.0.
