# parameters — характеристики категорий, которые назначает код (домен category_parameters)

Статус: **candidate**. Скрипт: `scripts/build-category-parameters.mjs`. Целевая таблица: `world_base.universal_parameter_definitions` (09.sql; поля category_id, parameter_key, value_type ∈ boolean|integer|number|text|enum, constraints). Сейчас в ней 0 строк.

## Что здесь

| Файл | Строк | Что |
|---|---|---|
| `parameter_definitions.csv` | 16 | Универсальный набор параметров: масса, полоса размера, материал, техника, единица и диапазон количества, складываемость, делимость, переносимость, вместимость, горючесть, плавучесть, прочность, полоса ценности, качество, порча. Для каждого: тип, допустимые значения, правило по умолчанию, основание, домены. |
| `category_parameters.csv` | 3 697 | Строка на пару (листовая категория, обязательный параметр). Всего 300 листьев: item object_type 223, container_form 18, garment 59. 870 значений взяты из источника, 2 827 строк — только правило. |

## Правила

- **Значение только из источника.** Значение ставится, только если его даёт шаблон v5 (`item_templates`, `item_template_quantity_profiles`, `item_template_category_bindings`, `container_templates`, `container_template_facet_bindings`). Тогда `value_is_sourced=true`, `assignment_rule=by_template`.
- **Масса из v5 — игровая.** Масса в v5 взята из `src_gameplay_physical_policy_v3` («редакторские игровые диапазоны … не являются историческими измерениями»), поэтому confidence C.
- **Без шаблона — только правило.** Для категорий без шаблона пишется правило (`by_material`, `by_form`, `by_size_band`) с основанием, без числа. Таких item-листьев 121.
- **Проверка чисел.** Скрипт `validate.mjs` проверяет, что число без источника нигде не появилось.
- **Обязательный набор по домену:**
  - item: 14 параметров;
  - container: 9;
  - garment: 7;
  - food: 5.

  Проверка требует, чтобы у каждого листа были как минимум масса, материал и полоса ценности.

## Известные пробелы

- **Нет словарей.** Нет утверждённых шкал для `value_band` (её даёт группа economy-trade-measures), `durability_class` и `quality_class`.
- **Нет таблицы по материалам.** Горючесть и плавучесть заданы правилом «по материалу», но таблицы материал → свойство нет. Она должна прийти из materials_registry (группа nature-materials-weather). Основание — approved WK `material-response.json`, `foundations-physical.json`, `physical-interaction.json`.
- **Нет массы без шаблона.** Масса для категорий без шаблона v5 требует плотности материалов и полос размера, а такого источника нет.
- **Не все домены.** Листья food, flora и fauna не охвачены: этих категорий ещё нет в реестре.
