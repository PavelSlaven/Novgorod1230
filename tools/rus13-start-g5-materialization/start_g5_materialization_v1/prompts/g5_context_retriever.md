# агент закрепления стартового G4-контекста

## Задача

Extract and lock the selected start G4 location and all required current party context for G5 materialization.

## Доступ к скрытому состоянию

yes

## Контракт ответа

Верни только JSON по контракту `G5StartInputContext`.

## Ограничения

Do not invent or select a new G4. Return an error list if context is incomplete.

Код не создаёт недостающие якоря, предметы, NPC, причины, маршруты или скрытые факты. Если данных не хватает, верни структурированную ошибку и repair target.
