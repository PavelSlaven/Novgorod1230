# skills_competences — not produced in this pass (gap)

**Статус.** Домен не заполнен полноценно. Зафиксирована только разведка, чтобы следующий проход не повторял её.

## Что проверено

- `world_db skill_catalog` (12 approved навыков: athletics, stealth, melee_combat, ranged_combat, craft, household, survival, travel_transport, healing, observation, communication_trade, custom_law_literacy) — не запрашивался напрямую (`docker exec world-base-postgres-1 psql ...`) в этом проходе; список 12 навыков взят из текста брифа, не проверен вживую этим коллектором.
- WK-семейство `reconstructed-learning-and-apprenticeship` и `category-cartography` (partial family `education-apprenticeship-and-skill-transmission`) упомянуты в брифе как существующие/частичные источники, но не прочитаны этим коллектором в этом проходе.
- Новые occupation-строки (`occupations_additions.csv`, этот же коллектор) содержат `typical_tools`/`how_to_materialize_*`, из которых МОЖНО механически вывести кандидатные подвиды навыка (например: `occ_jeweler_caster` → литейное дело; `occ_wood_turner` → токарное дело; `occ_mason`+`occ_limeburner` → каменное/известковое строительное дело), но это разложение не выполнено.

## Почему не закрыт в этом проходе

Полноценное закрытие требует: (1) реального чтения 12-навычного `skill_catalog` и `occupation_skill_defaults` из `world_base` (БД или дампа), чтобы подвиды навыка ссылались на подлинные `parent_skill_id`, а не на текст брифа из вторых рук; (2) чтения WK apprenticeship-семейства для `learning_modes`; (3) содержательного разложения минимум 12 родительских навыков на проверяемые подвиды с уровнями и default-значениями по возрасту/полу/занятию — большой объём авторства, не уложившийся в бюджет этой сессии после доменов occupations/carried_inventories/activities_observable.

## Рекомендация для следующего прохода

1. Сначала `docker exec world-base-postgres-1 psql ... -c "SELECT * FROM skill_catalog;"` и `occupation_skill_defaults` (если контейнер не запущен — пропустить и явно сказать, что БД не проверялась, как требует задача).
2. Прочитать `wk:reconstructed-learning-and-apprenticeship` и family `education-apprenticeship-and-skill-transmission` из WK production-v1.
3. Разложить каждый из 12 навыков на 2-5 проверяемых подвидов, обязательно со ссылкой `parent_skill_id` на реальный id из БД, а не по памяти.
4. Присвоить `default_by_occupation` минимум для 18 новых occupation-строк этого коллектора (`occupations_additions.csv`) и для существующих 37 approved занятий, используя `typical_tools`/`typical_property` как содержательную опору, а не выдумывая уровни.
