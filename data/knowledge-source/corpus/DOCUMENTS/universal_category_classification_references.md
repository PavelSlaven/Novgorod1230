# Реестр внешних классификационных опор

**Статус:** справочное приложение к `UNIVERSAL_CATEGORY_CLASSIFICATION_POLICY.md`
**Дата проверки:** `2026-07-15`
Этот файл не подтверждает историческую применимость понятий к Новгородской земле XIII века. Он фиксирует внешние схемы, которые допускается использовать для определения терминов, иерархий и mappings. Историческое присутствие подтверждается отдельными региональными источниками и bindings.

## 1. Общая модель контролируемого словаря

### W3C SKOS Reference

Использование в проекте:

- preferred и alternative labels;
- definitions и scope notes;
- broader/narrower/related relations;
- exact/close/broad/narrow/related mappings;
- проектирование контролируемых словарей без обязательного внедрения RDF в runtime.

Официальный источник: W3C Recommendation `SKOS Simple Knowledge Organization System Reference`.

## 2. Предметы, материалы, строения и помещения

### Getty Art & Architecture Thesaurus — AAT

Использование в проекте:

- object types;
- functions;
- materials;
- techniques;
- components;
- built environment;
- room and building concepts;
- mappings проектных древнерусских категорий.

AAT используется как reference vocabulary. Специфические исторические типы проекта сохраняют собственные stable IDs, определения и источники.

Официальный источник: Getty Vocabulary Program, Art & Architecture Thesaurus Online.

## 3. Ландшафт

### FAO Land Cover Classification System — LCCS

Использование в проекте:

- land cover;
- структура растительного покрова;
- отделение land cover от land use;
- построение совместимого словаря базовой среды.

Официальный источник: Food and Agriculture Organization of the United Nations, LCCS documentation.

### EUNIS Habitat Classification

Использование в проекте:

- habitat mappings;
- европейские наземные и пресноводные местообитания;
- сопоставление проектных природных комплексов с более широкими habitat concepts.

Официальный источник: European Environment Agency, EUNIS Habitat Classification.

### World Reference Base for Soil Resources — WRB

Использование в проекте:

- optional soil mappings;
- терминология почв;
- классификация только там, где почва подтверждена источниками и влияет на игру.

WRB не обязателен для каждой локации и не должен заставлять редактора придумывать неизвестный тип почвы.

Официальный источник: IUSS Working Group WRB, `World Reference Base for Soil Resources`.

## 4. NPC

### ISO 7250-1

Использование в проекте:

- нейтральная антропометрическая терминология;
- определения базовых измерений тела;
- проектирование stature/body-size facets.

Стандарт не используется для этнической, моральной или психологической классификации.

Официальный источник: International Organization for Standardization, ISO 7250-1.

### ISO/CIE 11664-4

Использование в проекте:

- optional machine-readable colour values CIE L*a*b*;
- только при необходимости точного сопоставления цвета.

Игровой runtime может использовать человекочитаемые project labels без обязательного хранения лабораторных измерений.

Официальный источник: ISO и International Commission on Illumination, ISO/CIE 11664-4.

### Five-Factor Model / International Personality Item Pool

Использование в проекте:

- компактный профиль устойчивых личностных тенденций;
- пять независимых осей;
- проектирование категорий черт, но не клинических диагнозов.

Модель не заменяет цели, мотивы, знания, социальные обязанности, текущее состояние и decision policy.

Официальный источник: International Personality Item Pool и академическая модель Big Five/Five-Factor Model.

## 5. Исторические профессии

### HISCO — Historical International Standard Classification of Occupations

Использование в проекте:

- optional crosswalk исторических занятий;
- task/function definition;
- межрегиональное сопоставление профессий.

HISCO не подтверждает наличие конкретной профессии в Новгородской земле 1230 года. Для этого требуется отдельный исторический источник и региональный binding.

Официальный источник: History of Work Information System / International Institute of Social History.

## 6. Животные

Глубокая внешняя таксономическая система в первом релизе не требуется.

Допускается:

- необязательное научное название в справочных данных;
- ссылка на современный признанный taxon только для устранения неоднозначности;
- исторические и археозоологические источники для регионального присутствия.

Не требуется:

- полный таксономический граф;
- Darwin Core;
- обязательные внешние taxon IDs;
- подвиды;
- генетические линии;
- современные породы без исторического основания.

Основной игровой слой использует common types и game roles из проектного словаря.

## 7. Правило обновления

При добавлении или обновлении внешней схемы фиксируются:

```text
scheme_id
scheme title
authority
version or release date
canonical reference
snapshot digest
license or usage note
review date
```

Изменение внешней версии не изменяет автоматически active project categories и старые party instances. Требуется отдельная редакторская ревизия, migration assessment и audit.
