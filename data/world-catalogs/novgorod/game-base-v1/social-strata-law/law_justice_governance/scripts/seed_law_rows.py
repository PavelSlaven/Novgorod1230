# -*- coding: utf-8 -*-
"""
Authored classification of the 32 approved WK claims in
  world-knowledge/production-v1/residual-law-norms-v1.json      (19 claims)
  world-knowledge/production-v1/residual-government-law-v1.json (7 claims)
  world-knowledge/production-v1/residual-government-law-v2.json (6 claims)
into offence / procedure / institution rows for law_justice_governance.

IMPORTANT — no invented amounts. An attempt to fetch the public MSU edition
(http://www.hist.msu.ru/ER/Etext/RP/prp.htm) through WebFetch on 2026-09-26
returned a frameset with no article text, and a retry against prp_t.htm
produced content that did NOT match the WK claims for the same article
numbers (it invented unrelated inheritance amounts for articles the WK
claims describe as injury/credit/zakup rules) — a sign the fetch tool's
small model hallucinated from a page it could not actually read. That
output is discarded, not used anywhere in this dataset. Every row below
therefore carries only what the approved WK claim text itself states;
where the claim text does not give a monetary amount, amount_units_ref is
left empty and the gap is listed in the README rather than invented.
Confirming the exact articles/amounts against the primary edition or a
scanned print copy is listed as a gap for a later pass.

law_type: "offence" | "procedure" | "institution"
"""

import json
import re
from pathlib import Path

RP = "src_russkaya_pravda"  # Пространная редакция; http://www.hist.msu.ru/ER/Etext/RP/
YANIN = "src_yanin_novgorod_posadniki"  # https://www.klex.ru/1fg3
NPL = "src_novgorod_first_chronicle"  # НПЛ, как использован в существующих region_social_roles

HEADER = [
    "lw_id", "law_type", "title_ru", "offence", "victim_status_ref", "sanction_kind",
    "amount_units_ref", "procedure_refs", "jurisdiction", "who_reacts_rule",
    "property_effect", "note_ru", "period_caveat", "source_article_ref",
    "source_refs", "confidence", "status",
]

ROWS = [
    # ---------------------------------------------------------------
    # OFFENCES (residual-law-norms-v1.json)
    # ---------------------------------------------------------------
    {
        "lw_id": "lw_offence_bodily_injury_marks",
        "law_type": "offence",
        "title_ru": "Телесные повреждения: видимые следы против их отсутствия",
        "offence": "нанесение телесного повреждения (кровь или синяки против отсутствия видимых следов)",
        "victim_status_ref": "не определено статьёй; общий случай",
        "sanction_kind": "разное правовое последствие в зависимости от наличия видимых следов; требуется свидетель при их отсутствии",
        "amount_units_ref": "",
        "procedure_refs": "lw_proc_witness_no_visible_injury",
        "jurisdiction": "княжеский/общинный суд по месту",
        "who_reacts_rule": "потерпевший заявляет; свидетель подтверждает при отсутствии видимых следов",
        "property_effect": "",
        "note_ru": "Ст. 23 РП: кто начал столкновение, может изменить дело даже при видимых повреждениях.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 23",
        "source_refs": f"wk:claim:residual-law-visible-injury-and-witness; {RP}",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_offence_bodily_injury_three_payments",
        "law_type": "offence",
        "title_ru": "Телесные повреждения: три различных платежа",
        "offence": "нанесение телесного повреждения (категории по ст. 21-24)",
        "victim_status_ref": "не определено статьёй; общий случай",
        "sanction_kind": "три различных требования: штраф власти, плата пострадавшему, отдельная плата за лечение раны",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "княжеский/общинный суд по месту",
        "who_reacts_rule": "потерпевший заявляет",
        "property_effect": "",
        "note_ru": "Ст. 21-24 РП различают виды телесных повреждений; ст. 24 отдельно разводит штраф, плату потерпевшему и плату за лечение — это разные текстовые требования, а не единая современная компенсация.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 21-24",
        "source_refs": f"wk:claim:residual-law-injury-and-treatment-payments; {RP}",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_offence_unauthorized_horse_use",
        "law_type": "offence",
        "title_ru": "Самовольная езда на чужом коне",
        "offence": "поездка на чужом коне без спроса (не кража коня)",
        "victim_status_ref": "владелец коня",
        "sanction_kind": "отдельный платёж, отличный от платежа за кражу коня",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "общинный/княжеский суд по месту",
        "who_reacts_rule": "владелец коня заявляет",
        "property_effect": "конь возвращается владельцу",
        "note_ru": "Ст. 27 РП отдельно от статей о краже коня в соседних статьях: несанкционированное использование — не то же самое, что похищение.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 27",
        "source_refs": f"wk:claim:residual-law-unauthorized-horse-use; {RP}",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_offence_theft_caught_and_detained",
        "law_type": "offence",
        "title_ru": "Пойманный на месте воровства против задержанного до утра",
        "offence": "кража, при которой вор пойман на месте или задержан до утра",
        "victim_status_ref": "потерпевший от кражи",
        "sanction_kind": "убийство вора на месте кражи и убийство уже связанного и виденного другими вора различаются: последнее несёт отдельный платёж",
        "amount_units_ref": "",
        "procedure_refs": "lw_proc_detained_thief_to_princely_court",
        "jurisdiction": "княжеский суд для задержанного до утра вора",
        "who_reacts_rule": "потерпевший или очевидец задерживает; далее — княжеский суд",
        "property_effect": "",
        "note_ru": "Ст. 36 РП: убийство вора в момент кражи отличается от направления задержанного до утра вора на княжеский суд; убийство уже связанного и виденного другими влечёт отдельный платёж.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 36",
        "source_refs": f"wk:claim:residual-law-detained-thief-and-princely-court; {RP}",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_offence_zakup_property_loss_context",
        "law_type": "offence",
        "title_ru": "Утрата вверенного закупу имущества по обстоятельствам",
        "offence": "утрата имущества на хозяйском поручении, кража из хлева, потеря незагнанного скота",
        "victim_status_ref": "господин закупа (собственник имущества/скота)",
        "sanction_kind": "ответственность закупа зависит от обстоятельств утраты, не автоматична по одному факту недостачи",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "хозяин двора / общинный суд по месту",
        "who_reacts_rule": "хозяин двора предъявляет требование закупу",
        "property_effect": "разбор по обстоятельствам, не автомат",
        "note_ru": "Ст. 53-54 РП. См. также nov_role_zakup (social_strata_legal_status).",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 53-54",
        "source_refs": "wk:claim:residual-law-zakup-loss-context; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_offence_zakup_illegal_sale_to_slavery",
        "law_type": "offence",
        "title_ru": "Незаконная продажа закупа в обельное холопство",
        "offence": "продажа господином закупа в полное (обельное) холопство",
        "victim_status_ref": "закуп (nov_role_zakup)",
        "sanction_kind": "продажа объявляется незаконной; проданный получает свободу; на господина налагается штраф",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "княжеский суд",
        "who_reacts_rule": "сам закуп или свидетель обращается к власти",
        "property_effect": "закуп освобождается; статус холопства не признаётся",
        "note_ru": "Ст. 55 РП прямо отделяет закупа от полностью зависимого — продажа в обельное холопство недействительна.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 55",
        "source_refs": "wk:claim:residual-law-zakup-illegal-sale; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_offence_boundary_and_marked_tree",
        "law_type": "offence",
        "title_ru": "Изменение бортных знаков, нарушение межи, порубка межевого дуба",
        "offence": "изменение бортного знака на дереве, нарушение межи, порубка межевого или знакового дуба",
        "victim_status_ref": "владелец борти/земли",
        "sanction_kind": "платёж, размер не назван в доступном источнике",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "общинный/княжеский суд по месту",
        "who_reacts_rule": "владелец борти/межи заявляет",
        "property_effect": "",
        "note_ru": "Ст. 64-66 РП: знаки на деревьях и межевые деревья имеют правовое значение в тексте; это три различных действия, не одно общее «повреждение леса».",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 64-66",
        "source_refs": "wk:claim:residual-law-boundaries-and-marked-trees; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_offence_arson_barn_or_yard",
        "law_type": "offence",
        "title_ru": "Поджог гумна или двора",
        "offence": "сожжение овина/гумна или хозяйственного двора",
        "victim_status_ref": "владелец сожжённого имущества",
        "sanction_kind": "возмещение убытка предшествует дальнейшему княжескому действию; после возмещения — поток и разграбление",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "княжеский суд (поток и разграбление — крайняя княжеская санкция)",
        "who_reacts_rule": "потерпевший заявляет; далее вступает княжеская власть",
        "property_effect": "поток и разграбление имущества виновного после возмещения потерпевшему",
        "note_ru": "Ст. 79 РП различает убыток потерпевшего от последующей санкции — возмещение и «поток и разграбление» текстово разделены, не единое действие.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 79",
        "source_refs": "wk:claim:residual-law-arson-remedy-and-sanction; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    # ---------------------------------------------------------------
    # PROCEDURES (residual-law-norms-v1.json — credit, witness, status,
    # inheritance-as-procedure)
    # ---------------------------------------------------------------
    {
        "lw_id": "lw_proc_witness_no_visible_injury",
        "law_type": "procedure",
        "title_ru": "Свидетель при отсутствии видимых следов побоев",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "общинный/княжеский суд по месту",
        "who_reacts_rule": "потерпевший приводит свидетеля, если следов нет",
        "property_effect": "",
        "note_ru": "Ст. 23 РП. Дело о начавшем столкновение может изменить исход даже при наличии видимых повреждений.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 23",
        "source_refs": "wk:claim:residual-law-visible-injury-and-witness; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_proc_debt_denial_witness_oath",
        "law_type": "procedure",
        "title_ru": "Свод и рота при отрицании денежного долга",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "общинный/княжеский суд по месту",
        "who_reacts_rule": "кредитор приводит свидетелей их клятвы, чтобы вернуть отрицаемый долг",
        "property_effect": "возврат денег при успешном своде",
        "note_ru": "Ст. 43 РП: производство свидетелей и их клятва — путь к возврату при отрицании долга; заявление кредитора и эта процедура — разные вещи.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 43",
        "source_refs": "wk:claim:residual-law-debt-denial-witness-oath; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_proc_merchant_entrustment_oath_exception",
        "law_type": "procedure",
        "title_ru": "Купеческая рота без предварительных свидетелей",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "торговый обычай / общинный суд",
        "who_reacts_rule": "купец-должник подтверждает собственной клятвой при отсутствии предварительных свидетелей",
        "property_effect": "",
        "note_ru": "Ст. 44 РП: один купец доверяет деньги другому для торговли — предварительные свидетели не требуются, отрицание разбирается через клятву самого купца. Особый торговый случай, не отмена свидетелей для всех займов.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 44",
        "source_refs": "wk:claim:residual-law-merchant-entrustment-proof-exception; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_proc_interest_terms_witnesses",
        "law_type": "procedure",
        "title_ru": "Свидетели условий роста (реза, наставa, присопа)",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "общинный суд по месту",
        "who_reacts_rule": "стороны призывают свидетелей условий займа при его заключении",
        "property_effect": "возврат по тому, что оговорено при свидетелях",
        "note_ru": "Ст. 46 РП: деньги в рез, мёд в наставу, хлеб в присоп — свидетели условий требуются, возврат увязан с тем, что оговорили стороны.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 46",
        "source_refs": "wk:claim:residual-law-interest-agreement-and-witnesses; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_proc_monthly_vs_annual_interest",
        "law_type": "procedure",
        "title_ru": "Месячный рез на короткий срок против годового счёта",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "общинный суд по месту",
        "who_reacts_rule": "доказательство долга увязано со свидетелями и суммой",
        "property_effect": "",
        "note_ru": "Ст. 47 РП различает месячный рез на короткий срок от иного счёта, если деньги остаются до года; месячный процент не описан как бесконечно накапливающийся тариф.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 47",
        "source_refs": "wk:claim:residual-law-monthly-and-longer-interest; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_proc_creditor_priority_multiple_debts",
        "law_type": "procedure",
        "title_ru": "Порядок взыскания при нескольких кредиторах",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "общинный/княжеский суд по месту",
        "who_reacts_rule": "суд различает неосведомлённого приезжего гостя-купца, местных кредиторов и княжеские деньги",
        "property_effect": "продажа должника и распределение по приоритету; исключается тот, кто взял много процентов",
        "note_ru": "Ст. 51 РП: не равный раздел между всеми кредиторами, а порядок по статусу кредитора.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 51",
        "source_refs": "wk:claim:residual-law-creditor-priority; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_proc_zakup_complaint_route",
        "law_type": "procedure",
        "title_ru": "Жалоба закупа князю или судьям на обиду господина",
        "offence": "",
        "victim_status_ref": "закуп (nov_role_zakup)",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "княжеский суд",
        "who_reacts_rule": "сам закуп открыто уходит искать денег или обращается к князю/судьям — это НЕ бегство",
        "property_effect": "закуп получает «правду» (защиту), не обращается в обельное холопство",
        "note_ru": "Ст. 52 РП. См. nov_role_zakup (social_strata_legal_status) — прямая правовая опора роли.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 52",
        "source_refs": "wk:claim:residual-law-zakup-complaint-not-escape; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_proc_witness_status_exceptions",
        "law_type": "procedure",
        "title_ru": "Ограничение свидетельства холопа и исключения для тиуна/закупа",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "общинный/княжеский суд по месту",
        "who_reacts_rule": "свидетельство холопа по общему правилу не принимается; боярский тиун допускается при нужде; закуп — в малой тяжбе",
        "property_effect": "",
        "note_ru": "Ст. 59 РП: статусные категории (холоп/тиун/закуп) не взаимозаменяемы для целей свидетельства. Прямая опора nov_role_tiun и nov_role_zakup.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 59",
        "source_refs": "wk:claim:residual-law-status-and-witness-exceptions; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_proc_status_grounds_vs_agreement",
        "law_type": "procedure",
        "title_ru": "Основания обельного холопства против оговорённых условий ряда",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "общинный/княжеский суд по месту",
        "who_reacts_rule": "суд различает брак с робой без ряда, тиунство без ряда, взятие ключа без ряда (= холопство) от оговорённых условий ряда (= не холопство)",
        "property_effect": "",
        "note_ru": "Ст. 102-105 РП: получение хлеба или дачи по ряду отдельно не приравнивается к холопству. Прямая опора nov_role_tiun (borderline) и nov_role_ryadovich.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 102-105",
        "source_refs": "wk:claim:residual-law-dependency-and-agreement; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_proc_daughters_boyar_druzhina_inheritance",
        "law_type": "procedure",
        "title_ru": "Наследование дочерьми при отсутствии сыновей у боярина/дружинника",
        "offence": "",
        "victim_status_ref": "боярин или дружинник без сыновей",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "статусный, не общий княжеский выморочный порядок",
        "who_reacts_rule": "дочери получают имущество вместо перехода князю, если сыновей нет",
        "property_effect": "имущество не переходит князю у этой статусной группы; переходит дочерям",
        "note_ru": "Ст. 86 РП — статусно обусловленное правило (боярин/дружина), не универсальный запрет наследования дочерьми.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 86",
        "source_refs": "wk:claim:residual-law-daughters-and-status-inheritance; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_proc_widow_separate_property",
        "law_type": "procedure",
        "title_ru": "Отдельная доля вдовы от имущества мужа",
        "offence": "",
        "victim_status_ref": "вдова",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "общинный суд/раздел двора",
        "who_reacts_rule": "вдовья доля и то, что даровано мужем, отделяются от его наследства; дети также имеют долю в имуществе матери",
        "property_effect": "двор не описан как неразделённая собственность одного из супругов",
        "note_ru": "Ст. 88 РП.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 88",
        "source_refs": "wk:claim:residual-law-widow-separate-property; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_proc_stepchildren_paternal_estates",
        "law_type": "procedure",
        "title_ru": "Раздельное наследование по разным отцам при одной матери",
        "offence": "",
        "victim_status_ref": "дети от двух браков одной матери",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "общинный суд/раздел двора",
        "who_reacts_rule": "каждая группа детей получает имущество своего отца отдельно",
        "property_effect": "общая мать не объединяет отцовские наследства в один фонд",
        "note_ru": "Ст. 97 РП.",
        "period_caveat": "",
        "source_article_ref": "Пространная Правда, ст. 97",
        "source_refs": "wk:claim:residual-law-stepchildren-paternal-inheritance; " + RP,
        "confidence": "B",
        "status": "candidate",
    },
    # ---------------------------------------------------------------
    # INSTITUTIONS (residual-government-law-v1.json, v2.json)
    # Almost every claim here is explicitly a single dated chronicle
    # episode, NOT a standing rule — the WK text says so itself, and
    # that caveat is carried through into period_caveat verbatim in
    # spirit rather than dropped.
    # ---------------------------------------------------------------
    {
        "lw_id": "lw_inst_1230_archbishop_posadnik_tysyatsky",
        "law_type": "institution",
        "title_ru": "Кризис 1230 года: архиепископ, посадник, тысяцкий",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "город Новгород, 1230 год",
        "who_reacts_rule": "",
        "property_effect": "",
        "note_ru": "НПЛ называет архиепископа Спиридона, посадника Водовика, затем посадника Стефана Твердиславича и тысяцкого Никиту Петриловича.",
        "period_caveat": "Датированный ряд должностей в кризисе, НЕ правило их избрания, полномочий или текущие лица на любой другой момент.",
        "source_article_ref": "НПЛ, статья 1230 г.",
        "source_refs": f"wk:claim:residual-government-law-v1-1230-chronicle-names-archbishop-posadnik-and-tysyatsky; {NPL}; {YANIN}",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_inst_1230_veche_princely_oath",
        "law_type": "institution",
        "title_ru": "Вече на Ярославовом дворе и клятва князя (1230)",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "город Новгород, 1230 год",
        "who_reacts_rule": "",
        "property_effect": "",
        "note_ru": "НПЛ сообщает о вече на Ярославовом дворе и о клятве князя Ярослава на всех Ярославлих грамотах и всей воле новгородской.",
        "period_caveat": "Один кризисный эпизод, НЕ постоянная конституционная схема.",
        "source_article_ref": "НПЛ, статья 1230 г.",
        "source_refs": f"wk:claim:residual-government-law-v1-1230-records-veche-and-princely-oath-episode; {NPL}",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_inst_ends_and_streets_1220_1234",
        "law_type": "institution",
        "title_ru": "Прусский, Людин, Неревский концы; Кузьмодемьянская улица (1220-1234)",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "город Новгород",
        "who_reacts_rule": "",
        "property_effect": "",
        "note_ru": "Записи 1220-1234 гг. называют эти концы и улицу.",
        "period_caveat": "НЕ доказывает число концов, их дату, собрания или юрисдикцию — только сам факт упоминания в этот диапазон лет.",
        "source_article_ref": "НПЛ, записи 1220-1234 гг.",
        "source_refs": f"wk:claim:residual-government-law-v1-1220-1234-records-name-prussian-lyudin-and-nerev-ends; {NPL}",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_inst_1234_campaign_and_peace_germans",
        "law_type": "institution",
        "title_ru": "Поход Ярослава и новгородцев против немцев и мир (1234)",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "внешние отношения, 1234 год",
        "who_reacts_rule": "",
        "property_effect": "",
        "note_ru": "НПЛ под 1234 г.: поход и мир «на всей правде своей».",
        "period_caveat": "Один поход и соглашение, НЕ постоянная внешняя политика или текущая граница.",
        "source_article_ref": "НПЛ, статья 1234 г.",
        "source_refs": f"wk:claim:residual-government-law-v1-1234-records-campaign-and-peace-with-germans; {NPL}",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_inst_1229_whole_volost_envoys_to_yuri",
        "law_type": "institution",
        "title_ru": "Сбор всей волости и посольство к Юрию (1229)",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "внешние отношения, 1229 год",
        "who_reacts_rule": "",
        "property_effect": "",
        "note_ru": "НПЛ под 1229 г.: город собрал всю волость и послал послов к Юрию.",
        "period_caveat": "Один внешний эпизод, НЕ постоянный представительный институт или суверенитет территории.",
        "source_article_ref": "НПЛ, статья 1229 г.",
        "source_refs": f"wk:claim:residual-government-law-v1-1229-records-whole-volost-and-envoys-to-yuri; {NPL}",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_inst_1227_sorcery_accusation_burning",
        "law_type": "institution",
        "title_ru": "Обвинение в волховании и сожжение на Ярославовом дворе (1227)",
        "offence": "",
        "victim_status_ref": "четверо обвинённых",
        "sanction_kind": "насильственная расправа (сожжение)",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "Ярославов двор, 1227 год",
        "who_reacts_rule": "толпа/город реагирует на обвинение",
        "property_effect": "",
        "note_ru": "НПЛ под 1227 г.: четверых обвинённых в волховании сожгли на Ярославовом дворе. Прямая опора nov_role_znakharka (social_strata_legal_status).",
        "period_caveat": "Запись об обвинении и насилии, НЕ доказательство виновности, законного суда или обычной санкции.",
        "source_article_ref": "НПЛ, статья 1227 г.",
        "source_refs": f"wk:claim:residual-government-law-v1-1227-records-accusation-and-burning-episode; {NPL}",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_inst_halperin_sovereign_land_caution",
        "law_type": "institution",
        "title_ru": "Осторожность против проекции современного суверенного государства на «Новгородскую землю»",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "методологическая оговорка, не привязана к году",
        "who_reacts_rule": "",
        "property_effect": "",
        "note_ru": "Halperin: термин «Новгородская земля» редок в летописях и не служит именем стороны войны или договора.",
        "period_caveat": "Интерпретационное ограничение историографии, НЕ описание текущей политики 1230 года.",
        "source_article_ref": "",
        "source_refs": "wk:claim:residual-government-law-v1-halperin-limits-sovereign-land-projection",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_inst_1215_posadnik_tysyatsky_joint_invite",
        "law_type": "institution",
        "title_ru": "Совместный выезд посадника и тысяцкого приглашать князя (1215)",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "город Новгород, 1215 год",
        "who_reacts_rule": "",
        "property_effect": "",
        "note_ru": "Посадник и тысяцкий вместе ездили от Новгорода приглашать Ярослава Всеволодовича на княжение.",
        "period_caveat": "Один датированный совместный выезд, НЕ постоянное полномочие или текущая делегация.",
        "source_article_ref": "",
        "source_refs": f"wk:claim:residual-government-law-v2-1215-posadnik-and-tysyatsky-jointly-invite-prince; {YANIN}",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_inst_1218_1219_princely_vs_novgorod_tysyatsky",
        "law_type": "institution",
        "title_ru": "Различение «своего тысяцкого» князя и новгородских должностных лиц (1218-1219)",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "город Новгород, 1218-1219 гг.",
        "who_reacts_rule": "",
        "property_effect": "",
        "note_ru": "Источник различает «своего тысяцкого» князя от новгородских должностных лиц.",
        "period_caveat": "Ограниченное различение в конфликтном эпизоде, НЕ универсальная должностная схема.",
        "source_article_ref": "",
        "source_refs": "wk:claim:residual-government-law-v2-1218-distinguishes-princely-and-novgorodian-tysyatsky",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_inst_1228_1229_veche_removes_tysyatsky",
        "law_type": "institution",
        "title_ru": "Вече лишает Вячеслава тысяцкого, должность получает Борис Негочевич (1228-1229)",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "город Новгород, 1228-1229 гг.",
        "who_reacts_rule": "весь город на вече принимает решение о смещении и замене",
        "property_effect": "",
        "note_ru": "Весь город с веча лишил Вячеслава тысяцкого; должность получил Борис Негочевич.",
        "period_caveat": "Кризисное и насильственное смещение, НЕ обычная процедура смены должности.",
        "source_article_ref": "",
        "source_refs": "wk:claim:residual-government-law-v2-1229-veche-episode-removes-and-replaces-tysyatsky",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_inst_1230_hundred_term_property_division",
        "law_type": "institution",
        "title_ru": "Термин «по стом» при разделе имущества свергнутого посадника (1230)",
        "offence": "",
        "victim_status_ref": "свергнутый посадник",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "город Новгород, 1230 год",
        "who_reacts_rule": "",
        "property_effect": "имущество свергнутого посадника делится «по стом»",
        "note_ru": "Употребление термина «сто» в одном кризисном разделе имущества.",
        "period_caveat": "Одно употребление термина в конкретном разделе, НЕ карта сотен или их юрисдикция.",
        "source_article_ref": "",
        "source_refs": "wk:claim:residual-government-law-v2-1230-source-uses-hundred-term-for-property-division",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_inst_yanin_mixed_court_mid_xii",
        "law_type": "institution",
        "title_ru": "Смешанный судебный comparator середины XII века (Янин)",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "Новгород, середина XII века",
        "who_reacts_rule": "посадник после формально приоритетного князя, который скреплял судебные акты печатью",
        "property_effect": "",
        "note_ru": "Материал середины XII века, используется только как сравнительный контекст, не как описание суда 1230 года.",
        "period_caveat": "НЕ суд 1230 года — другой век, приведён только для контекста должностной структуры.",
        "source_article_ref": "",
        "source_refs": f"wk:claim:residual-government-law-v2-mid-xii-mixed-court-comparator; {YANIN}",
        "confidence": "B",
        "status": "candidate",
    },
    {
        "lw_id": "lw_inst_bishop_archbishop_title_caution",
        "law_type": "institution",
        "title_ru": "Осторожность с титулами епископа/архиепископа после 1165 года (Янин)",
        "offence": "",
        "victim_status_ref": "",
        "sanction_kind": "",
        "amount_units_ref": "",
        "procedure_refs": "",
        "jurisdiction": "методологическая оговорка",
        "who_reacts_rule": "",
        "property_effect": "",
        "note_ru": "Титулы новгородского епископа и архиепископа после 1165 года не служат простым датировочным признаком.",
        "period_caveat": "Источниковедческая оговорка, НЕ описание полномочий владыки или текущего клирика на 1230 год.",
        "source_article_ref": "",
        "source_refs": f"wk:claim:residual-government-law-v2-bishop-and-archbishop-titles-not-simple-date-marker; {YANIN}",
        "confidence": "B",
        "status": "candidate",
    },
]


PROPERTY_TITLES_RU = {
    "abandoned_or_lost_property": "Брошенное или потерянное имущество",
    "boat_control": "Владение и использование судна",
    "church_property": "Имущество церкви",
    "dowry_property": "Приданое",
    "household_property": "Имущество двора",
    "land_use_right": "Пользование и владение землёй",
    "landholding_rights": "Пользование и владение землёй",
    "land_use_dispute": "Пользование и владение землёй",
    "livestock_control": "Владение и распоряжение скотом",
    "merchant_inventory": "Товарный запас купца",
    "monastery_property": "Имущество монастыря",
    "pledged_property": "Заложенное имущество",
    "princely_rights": "Княжеские права на имущество",
    "urban_yard_control": "Владение городским двором",
    "workshop_tools": "Инструменты мастерской",
}


def add_archive_candidates():
    """Add archive topics as bounded candidates; do not invent rule mechanics."""
    source = Path(__file__).with_name("archive_rule_candidates.json")
    candidates = json.loads(source.read_text(encoding="utf-8"))
    existing = {row["lw_id"]: row for row in ROWS}
    candidates_by_ref = {item["archive_id"]: item for item in candidates}
    errors = []
    added = 0
    attached = 0
    merged = 0

    def provenance(item):
        archive_ref = item["archive_ref"]
        return (
            f"archive:{archive_ref}; basis:{item['basis']}; derivation:{archive_ref}; "
            f"confidence:{item['confidence']}; period:{item['period']}; region:{item['region']}"
        )

    def attach(owner, item, *, merged_ref=False):
        nonlocal attached, merged
        archive_ref = item["archive_ref"]
        token = f"archive:{archive_ref}"
        if token not in owner["source_refs"]:
            owner["source_refs"] += f"; {provenance(item)}"
            owner["note_ru"] += (
                f" Архивная тематическая связь: {archive_ref}; "
                "не расширяет правило сверх описанного здесь."
            )
        if merged_ref:
            merged += 1
        else:
            attached += 1

    # Create only canonical archive topics; explicit mappings below merge or
    # attach every other archive ref without relying on exact title matches.
    for item in candidates:
        archive_id = item["archive_id"]
        if "attach_to" in item or "merge_into" in item:
            continue
        title = item["title_ru"]
        if archive_id.startswith("n1230:property_rule:"):
            slug = archive_id.rsplit(":", 1)[-1]
            title = PROPERTY_TITLES_RU.get(slug, title)

        is_offence = archive_id.rsplit(":", 1)[-1] in {
            "animal_damage", "boundary_dispute", "crop_damage", "fire_damage",
            "homicide_compensation", "horse_theft", "insult_compensation",
            "livestock_theft", "property_damage", "robbery", "slave_or_dependent_theft",
            "theft_general", "weapon_theft",
        }
        is_institution = archive_id.rsplit(":", 1)[-1] in {
            "church_court_scope", "court_authority_prince_posadnik", "tysyatsky_trade_court",
        }
        law_type = "offence" if is_offence else "institution" if is_institution else "procedure"
        archive_slug = archive_id.rsplit(":", 1)[-1]
        row_id = "lw_archive_" + archive_slug
        if row_id in existing:
            archive_kind = archive_id.split(":", 2)[1]
            row_id = f"lw_archive_{archive_kind}_{archive_slug}"
        row = {
            "lw_id": row_id,
            "law_type": law_type,
            "title_ru": title,
            "offence": "",
            "victim_status_ref": "",
            "sanction_kind": "",
            "amount_units_ref": "",
            "procedure_refs": "",
            "jurisdiction": f"кандидат для региона: {item['region']}; применимость требует проверки",
            "who_reacts_rule": "",
            "property_effect": "",
            "note_ru": "Тематическая запись из мастер-архива; не задаёт санкцию, процедуру, полномочие или универсальную норму без отдельной проверки источника.",
            "period_caveat": f"{item['period']}; region: {item['region']}",
            "source_article_ref": "",
            "source_refs": provenance(item),
            "confidence": item["confidence"],
            "status": "candidate",
        }
        if row["lw_id"] in existing:
            errors.append(f"{archive_id}: generated id collision {row['lw_id']}")
            continue
        existing[row["lw_id"]] = row
        ROWS.append(row)

    for item in candidates:
        archive_id = item["archive_id"]
        if item.get("merge_into"):
            target = candidates_by_ref.get(item["merge_into"])
            if target is None or target.get("attach_to") or target.get("merge_into"):
                errors.append(f"{archive_id}: invalid merge target {item['merge_into']!r}")
                continue
            target_slug = target["archive_id"].rsplit(":", 1)[-1]
            owner_id = "lw_archive_" + target_slug
            if owner_id not in existing:
                target_kind = target["archive_id"].split(":", 2)[1]
                owner_id = f"lw_archive_{target_kind}_{target_slug}"
            owner = existing.get(owner_id)
            if owner is None:
                errors.append(f"{archive_id}: merge owner {owner_id} not found")
                continue
            attach(owner, item, merged_ref=True)
        elif item.get("attach_to"):
            owner = existing.get(item["attach_to"])
            if owner is None:
                errors.append(f"{archive_id}: concrete owner {item['attach_to']} not found")
                continue
            attach(owner, item)

    for item in candidates:
        archive_ref = item["archive_ref"]
        archive_id = item["archive_id"]
        if archive_ref != archive_id:
            errors.append(f"{archive_id}: malformed archive provenance")
            continue
        if item["confidence"] not in {"A", "B", "C"}:
            errors.append(f"{archive_id}: invalid confidence {item['confidence']!r}")
            continue
        if item.get("attach_to") and item.get("merge_into"):
            errors.append(f"{archive_id}: multiple dedup actions")
        if not item.get("attach_to") and not item.get("merge_into"):
            added += 1

    # Positive semantic/provenance probes: reviewer-requested merges must point
    # at concrete source rows or one canonical archive topic.
    expected_owners = {
        "n1230:law_rule:dowry_property": "lw_archive_dowry_property",
        "n1230:property_rule:dowry_property": "lw_archive_dowry_property",
        "n1230:property_rule:land_use_right": "lw_archive_land_use_right",
        "n1230:property_rule:landholding_rights": "lw_archive_land_use_right",
        "n1230:law_rule:land_use_dispute": "lw_archive_land_use_right",
        "n1230:property_rule:pledged_property": "lw_archive_pledged_property",
        "n1230:law_rule:pledge_enforcement": "lw_archive_pledged_property",
        "n1230:law_rule:court_authority_prince_posadnik": "lw_inst_yanin_mixed_court_mid_xii",
        "n1230:law_rule:boundary_dispute": "lw_offence_boundary_and_marked_tree",
        "n1230:law_rule:restitution_before_fine": "lw_offence_bodily_injury_three_payments",
        "n1230:law_rule:fire_damage": "lw_offence_arson_barn_or_yard",
        "n1230:law_rule:oath_evidence": "lw_proc_debt_denial_witness_oath",
        "n1230:law_rule:witness_requirement": "lw_proc_witness_status_exceptions",
        "n1230:law_rule:debt_claim": "lw_proc_debt_denial_witness_oath",
        "n1230:law_rule:debt_default": "lw_proc_creditor_priority_multiple_debts",
    }
    for archive_id, owner_id in expected_owners.items():
        item = candidates_by_ref.get(archive_id)
        owner = existing.get(owner_id)
        if item is None or owner is None or f"archive:{archive_id}" not in owner["source_refs"]:
            errors.append(f"{archive_id}: missing expected semantic/provenance mapping to {owner_id}")

    # Negative probes: related word families do not collapse distinct offences.
    for left, right in (
        ("n1230:law_rule:theft_general", "n1230:law_rule:livestock_theft"),
        ("n1230:law_rule:horse_theft", "n1230:law_rule:weapon_theft"),
    ):
        left_row = next((r for r in ROWS if f"archive:{left}" in r["source_refs"]), None)
        right_row = next((r for r in ROWS if f"archive:{right}" in r["source_refs"]), None)
        if left_row is None or right_row is None or left_row["lw_id"] == right_row["lw_id"]:
            errors.append(f"negative dedup probe collapsed distinct topics: {left} / {right}")

    refs_in_rows = [
        ref for row in ROWS for ref in re.findall(r"archive:(n1230:[^;]+)", row["source_refs"])
    ]
    for item in candidates:
        if refs_in_rows.count(item["archive_ref"]) != 1:
            errors.append(f"{item['archive_ref']}: expected exactly one provenance owner")

    canonical_refs = {
        "n1230:law_rule:dowry_property",
        "n1230:property_rule:land_use_right",
        "n1230:property_rule:pledged_property",
    }
    expected_action_refs = set(expected_owners) - canonical_refs
    actual_action_refs = {
        item["archive_id"] for item in candidates if item.get("attach_to") or item.get("merge_into")
    }
    if actual_action_refs != expected_action_refs:
        errors.append(
            "reviewer dedup coverage mismatch: "
            f"missing={sorted(expected_action_refs - actual_action_refs)}; "
            f"extra={sorted(actual_action_refs - expected_action_refs)}"
        )

    variants = [
        ("n1230:property_rule:widow_possession", "lw_proc_widow_separate_property", "analogy"),
    ]
    for archive_id, owner_id, basis in variants:
        owner = existing.get(owner_id)
        if owner is None:
            errors.append(f"{archive_id}: variant owner {owner_id} not found")
            continue
        archive_ref = f"archive:{archive_id}"
        if archive_ref not in owner["source_refs"]:
            owner["source_refs"] += f"; {archive_ref}; basis:{basis}; derivation:{archive_id}; confidence:C; period:ок. 1230–1250; region:Новгородская земля"
            owner["note_ru"] += " Вариант владения вдовы привязан к этой процедуре как реконструируемое уточнение, а не отдельная норма."
            owner["period_caveat"] += "; variant period: ок. 1230–1250; region: Новгородская земля; реконструкция требует проверки источника"
        attached += 1

    # Existing notes carry links between umbrella topics, their specific cases,
    # and already authored insult norms. These remain references, not new rules.
    relation_notes = {
        "lw_archive_property_damage": "Общая тема; частные темы: lw_archive_animal_damage, lw_archive_crop_damage.",
        "lw_archive_animal_damage": "Частная тема общей категории lw_archive_property_damage.",
        "lw_archive_crop_damage": "Частная тема общей категории lw_archive_property_damage.",
        "lw_archive_church_property": "Общая тема имущества церкви; частная тема: lw_archive_monastery_property.",
        "lw_archive_monastery_property": "Частная тема общей категории lw_archive_church_property.",
        "lw_archive_church_court_scope": "Общая тема церковной юрисдикции; частная тема: lw_archive_church_marriage_jurisdiction.",
        "lw_archive_church_marriage_jurisdiction": "Частная тема общей категории lw_archive_church_court_scope.",
        "lw_archive_merchant_dispute": "Общая тема торговых споров; частные темы: lw_archive_foreign_merchant_dispute, lw_archive_price_dispute.",
        "lw_archive_foreign_merchant_dispute": "Частная тема общей категории lw_archive_merchant_dispute.",
        "lw_archive_price_dispute": "Частная тема общей категории lw_archive_merchant_dispute.",
        "lw_archive_marriage_property": "Общая тема имущества в браке; связанные конкретные темы: lw_archive_dowry_property, lw_proc_widow_separate_property.",
        "lw_archive_dowry_property": "Частная тема общей категории lw_archive_marriage_property.",
        "lw_proc_widow_separate_property": "Связано с общей темой lw_archive_marriage_property; отдельная процедура вдовьей доли сохранена.",
        "lw_archive_theft_general": "Общая тематическая связь с конкретным правилом lw_offence_theft_caught_and_detained; это отдельные записи.",
        "lw_offence_theft_caught_and_detained": "Связано с общим тематическим охватом lw_archive_theft_general; это отдельные записи.",
        "lw_archive_insult_compensation": "Связанные нормы о конкретных действиях: sn_rp_beard, sn_rp_blunt_sword, sn_rp_bare_sword, sn_rp_push_slap, sn_rp_slave_insult; ссылки не создают дубликатов и не приравнивают их правовой вес.",
        "lw_proc_witness_status_exceptions": "Общая тема witness_requirement прикреплена сюда; конкретные исключения для статуса свидетеля остаются различимыми.",
    }
    for lw_id, note in relation_notes.items():
        row = existing.get(lw_id)
        if row is None:
            errors.append(f"missing relation-note owner {lw_id}")
        elif note not in row["note_ru"]:
            row["note_ru"] = (row["note_ru"] + " " + note).strip()

    # Positive relation probes and negative non-merge probes.
    for lw_id, required_refs in {
        "lw_archive_property_damage": ("lw_archive_animal_damage", "lw_archive_crop_damage"),
        "lw_archive_church_property": ("lw_archive_monastery_property",),
        "lw_archive_church_court_scope": ("lw_archive_church_marriage_jurisdiction",),
        "lw_archive_merchant_dispute": ("lw_archive_foreign_merchant_dispute", "lw_archive_price_dispute"),
        "lw_archive_marriage_property": ("lw_archive_dowry_property", "lw_proc_widow_separate_property"),
        "lw_archive_theft_general": ("lw_offence_theft_caught_and_detained",),
        "lw_archive_insult_compensation": (
            "sn_rp_beard", "sn_rp_blunt_sword", "sn_rp_bare_sword", "sn_rp_push_slap", "sn_rp_slave_insult",
        ),
    }.items():
        row = existing.get(lw_id)
        if row is None or any(ref not in row["note_ru"] for ref in required_refs):
            errors.append(f"{lw_id}: reviewer relation-link probe failed")
    theft_general = existing.get("lw_archive_theft_general")
    theft_specific = existing.get("lw_offence_theft_caught_and_detained")
    if not theft_general or not theft_specific or theft_general["lw_id"] == theft_specific["lw_id"]:
        errors.append("theft umbrella and caught-thief rule were collapsed")

    if errors:
        raise ValueError("archive candidate errors: " + "; ".join(errors))
    return {"archive_candidates": len(candidates), "new": added, "attached": attached, "merged": merged, "variants": len(variants)}


ARCHIVE_CANDIDATE_COUNTS = add_archive_candidates()
