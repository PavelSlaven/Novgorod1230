# LLM repair/audit pipeline v1 — report

Дата сборки: 2026-07-06T20:11:18Z

| Метрика | Значение |
|---|---:|
| Pipeline steps | 9 |
| Contracts | 10 |
| Error codes | 17 |
| Validation rules | 10 |
| State transitions | 13 |
| DB write mappings | 11 |
| Prompt templates | 6 |
| Source map records | 8 |

## Проверка границ

- Код не создаёт смысловые сущности мира.
- Repair agent не добавляет факты.
- Смысловой аудит выполняет LLM-аудитор.
- Скрытое состояние проверяется до player-facing вывода.
- Commit допускается только после прохождения всех blocking gates.
