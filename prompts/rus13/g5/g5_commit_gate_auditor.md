# аудитор commit gate G5

## Задача

Decide if the G5 materialization can be committed to party DB.

## Доступ к скрытому состоянию

yes

## Контракт ответа

Верни только JSON по контракту `G5AuditReport`.

## Ограничения

Block commit on any missing FK plan, template violation, G1-G4 mutation, visibility leak or missing current_position.

Код не создаёт недостающие якоря, предметы, NPC, причины, маршруты или скрытые факты. Если данных не хватает, верни структурированную ошибку и repair target.
