# агент выбора стартовой точки персонажа

## Задача

Select the exact starting anchor and produce complete current_position fields.

## Доступ к скрытому состоянию

yes

## Контракт ответа

Верни только JSON по контракту `G5CurrentPositionCommitPlan`.

## Ограничения

The selected anchor must exist in the G5 draft. Position cannot be prose-only.

Код не создаёт недостающие якоря, предметы, NPC, причины, маршруты или скрытые факты. Если данных не хватает, верни структурированную ошибку и repair target.
