# production-v2 final approval — batch F13-gated

Independent approval (WR §21.1) of issue #154 candidates at commit `6e59b2834f8ea9ebf6459e97db251482b799f7d0`. Approver: Claude Opus 5.5 (high reasoning), a separate run from the Sonnet authors and classifiers. Packet: `F13-gated` (A = access class only, B = text/aliases/date, C = new book-sourced claims).

## F13-gated

| claim | verdict | limits | reason |
|---|---|---|---|
| `claim:residual-government-law-v1-1230-chronicle-names-archbishop-posadnik-and-tysyatsky` | APPROVE | Закрыт до заведения события novgorod_upheaval_december_1230 с датой начала по источнику; эпизод Водовика «в городской мобилизации» мог быть раньше декабря, гейт по декабрю только позже открывает, утечки нет. | Время сверяется только по году, без условия claim открылся бы 1 января 1230 (D18); изменено только applicability.conditions, текст/класс/evidence побайтно прежние в источнике и runtime-bundle. |
| `claim:residual-government-law-v1-1230-records-veche-and-princely-oath-episode` | APPROVE | Крестное целование Ярослава на грамотах — позже начала смуты; при заведении события начало фазы не раньше прихода Ярослава, иначе дать эпизоду отдельное событие, чтобы не открыть его на дни раньше. | Условие fail-closed и корректно по D18; прочие поля не менялись (глубокое сравнение HEAD vs рабочее дерево). |
| `claim:residual-government-law-v2-1230-source-uses-hundred-term-for-property-division` | APPROVE | Раздел имущества Водовика «по стом» — после бегства посадника и смены должностных лиц; начало события не раньше этого эпизода. | Условие добавлено тем же event_id, иных изменений нет; имя события в формате novgorod_famine_1230. |
