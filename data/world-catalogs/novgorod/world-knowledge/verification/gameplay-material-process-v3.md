# Независимая проверка gameplay-material-process-v3

Проверяемый кандидат: `git:db45546e4ccdf5c743163b6fd045c0d031bce0fc:data/world-catalogs/novgorod/world-knowledge/production-v1/gameplay-material-process-v3.json`.

Проверка выполнена независимо от извлечения кандидата: заново прочитаны страницы Purdue, NIST и FAO. Проверяются только четыре нормализованных claim, их точные RU/EN runtime-тексты, условность, `knowledge_access` и границы источников. Это не утверждение о наличии зерна, огня, сети, сооружения, инструмента, исторической практике или результате в сцене.

## stored-grain-temperature-gradient-can-migrate-moisture

Источник: [Purdue University Extension, *Managing Dry Grain in Storage* — “Grain Temperature and Moisture Migration”](https://www.extension.purdue.edu/extmedia/aed/aed-20.html).

Повторно прочитанный источник прямо говорит, что при заметно разных температурах частей зерновой массы температура вызывает движение влаги; при охлаждении воздуха в более холодной верхней массе часть влаги осаждается на холодном зерне конденсацией и диффузией. Это подтверждает literal `temperature_gradient_can_move_moisture_toward_cooler_grain_zone_where_it_can_deposit` и оба runtime-текста:

- RU: «Разница температур в хранимом зерне может переносить влагу к более холодной зоне, где она может осаждаться; наличие зерна, его состояние и результат не заданы.»
- EN: “A temperature difference in stored grain can move moisture toward a cooler zone where it can deposit; no grain, state, or outcome is implied.”

Модальность `может/can` сохранена. `general_physical` допустим для качественного физического отношения; источник не даёт порогов, времени, сорта, объёма, влажности, хранилища или гарантии порчи. Verdict: `APPROVE`.

## stored-grain-airflow-can-reduce-temperature-differences

Источник: [Purdue University Extension, *Managing Dry Grain in Storage* — “Aerate for Temperature Control” и “Other Aeration Tips”](https://www.extension.purdue.edu/extmedia/aed/aed-20.html).

Источник определяет аэрацию как принудительное прохождение воздуха через зерно для управления температурой и описывает температурную зону, проходящую через массу; если цикл не проходит полностью, часть зерна остаётся с иной температурой. Это прямо поддерживает ограниченное `airflow_through_stored_grain_can_reduce_temperature_differences_when_it_reaches_the_grain` и точные тексты:

- RU: «Прохождение воздуха через хранимое зерно может уменьшать разницу температур, если воздух достигает зерна; устройство, поток и результат не заданы.»
- EN: “Airflow through stored grain can reduce temperature differences when it reaches the grain; no apparatus, flow, or outcome is implied.”

Условие достижения зерна не удалено. `domain_internal_only` не обещает обычному actor технического знания об аэрации. Источник связан с управляемой аэрацией; он не доказывает наличие вентилятора, бункера, потока, полного цикла или успешного исхода. Verdict: `APPROVE`.

## water-can-cool-class-a-fire-fuel-and-flame

Источник: [NIST, *Fire Fighting Properties (NISTIR 6191)* — official abstract](https://www.nist.gov/publications/fire-fighting-properties-nistir-6191); PDF: [NISTIR 6191](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir6191.pdf), abstract и заявленный кандидатный anchor §1.1.1.

Официальный abstract NIST прямо перечисляет fuel cooling и flame cooling среди механизмов, которыми вода подавляет и тушит fires, и говорит, что эксперименты исследуют механизмы подавления Class A fires. Independently extracted §1.1.1 определяет Class A как «ordinary combustibles such as wood, textiles, rubber and plastics», называет cooling fuel одним из четырёх способов тушения и сообщает, что основное подавление водой происходит охлаждением топлива. Вместе они прямо поддерживают literal `water_can_contribute_to_class_a_fire_suppression_by_fuel_and_flame_cooling` и оба текста:

- RU: «Вода может способствовать подавлению пожара обычных твёрдых горючих материалов, включая древесину и ткани, охлаждением топлива и пламени; успех, количество, безопасность и другие классы огня не подразумеваются.»
- EN: “Water can contribute to Class A fire suppression by cooling fuel and flame; success, amount, safety, and other fire classes are not implied.”

`может/can contribute` сохраняет условность; actual candidate field `knowledge_access.class` — `domain_internal_only`, и он не превращает источник в инструкцию по тушению. После отказа browser viewer и `web__run` (PDF превышает лимит), тот же URL извлечён локальным PDF reader: §1.1.1 реально прочитан и даёт exact wood/textiles anchor. Не утверждаются класс конкретного огня, количество воды, безопасность, успех или применимость к другим классам. Verdict: `APPROVE`.

## fishing-net-mending-or-worn-part-replacement-can-prolong-serviceability

Источник: [FAO, *Role of Fishery Technology in Management and Development of Freshwater Fisheries in Africa* — §§3.1.1.6, 3.1.2.6, 3.1.3.6, 3.1.6.6](https://www.fao.org/4/AC674E/AC674E03.htm).

Повторно прочитанные anchors сообщают: purse net должен регулярно чиниться для пятилетнего срока; регулярная починка нужна beach seine для сохранения эффективности, а замена изношенных частей позволяет использовать её три–пять лет; гиллнеты, подвешенные в тени вне использования, могут дольше сохранять эффективность, и изношенные/дырявые сети заменяют. Это подтверждает conditional relation `regular_mending_or_replacement_of_worn_net_parts_can_prolong_serviceability` и тексты:

- RU: «Починка сети или замена её изношенных частей может продлевать пригодность сети; конкретная сеть, волокно, историческая практика и результат не подразумеваются.»
- EN: “Mending a net or replacing its worn parts can prolong serviceability; no particular net, fibre, historical practice, or outcome is implied.”

`domain_internal_only` уместен: источник — современное руководство по конкретным freshwater net types, не общая гарантия для любой сети. Он не устанавливает новгородскую сеть, волокно, владельца, срок, регулярность конкретного ремонта, ресурс, историческую практику или результат. Verdict: `APPROVE`.

## Итог

Все четыре claim получают `APPROVE` как качественные, условные, source-bounded механизмы. Для water/Class A independently read NISTIR §1.1.1 прямо покрывает добавленные RU примеры древесины и тканей. Проверены четыре candidate digests из in-memory merged authoring pack; production descriptor, candidate и ledger не изменялись.
