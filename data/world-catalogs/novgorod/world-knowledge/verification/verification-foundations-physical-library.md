# Verification: physical-library foundations

## Final scientific precision correction — 2026-09-04

Independent check of research Appendix D: root read OpenStax College Physics
§5.2 (equation 5.13, projected area, coefficient and flow-regime conditions)
and Physics §8.1 (impulse as average net external force times duration).
The preferred Rogers FB2 was re-opened read-only; the bounded extraction did
not establish these precise qualifiers. Browser-harness navigation reached
OpenStax but screenshot capture timed out; doctor confirmed the active page,
and rendered text was independently read through the web fallback.

PHY-LIB-01A: APPROVE WITH REWRITE inside the existing air-drag claim:
the projected-area relation explicitly uses the quadratic model and equal
speed, fluid density and drag coefficient. No arbitrary object fall-order
follows. PHY-LIB-02A: APPROVE inside the existing impulse claim:
same vector momentum change, average net external force, not peak force.
No new claim/concept, numerical gameplay calculation or owner is introduced.
Exact section evidence is added to the two existing claims.

This corrects the insufficient directional premise exposed by the first
23-case live prose audit; it does not retrospectively mark that answer PASS.

**Status:** independent source/domain review; no production approval. Reviewed
2026-09-04 against the current 665-claim runtime bundle and actual read-only
FB2 text on `root@192.168.1.100:/srv/library`, not the research note alone.

## Reopened primary text

| Key | Reopened library object | Actual sections checked |
| --- | --- | --- |
| S1 | Алексеев, _Материаловедение_, `f.fb2-234885-238403.zip!238127.fb2` | Лекции 2, 4, 10, 13–15, 18: wood defects/properties, abrasives, glass, adhesives, insulation, stone. |
| S2 | Хлебников et al., _Общая химия_, `f.fb2-437060-440800.zip!437883.fb2` | §§1, 2.1–2.3, 4.3, 7, 8: thermochemistry, kinetics, equilibrium, electrolytes, corrosion. |
| S3 | Роджерс, _Физика для любознательных_, т. 1, `f.fb2-505101-507580.zip!506526.fb2` | Главы 1, 6–9: air resistance, interfaces, force/impulse, momentum, viscosity and flow. |
| S4 | Бурханова, _Теплотехника_, `fb2-161831-166042.zip!165851.fb2` | §§20, 22–26, 30, 33–40, 43, 53–58, 56: gas state, irreversible processes, expansion, combustion, heat transfer. |

Source caveat: these are older pedagogical texts. They are adequate for the
qualified, non-numeric textbook primitives below, but not for clinical,
engineering-design, modern material-datasheet or safety conclusions.

## Runtime duplicate check

The bundle already owns thermal-conduction/temperature-difference, glass
cooling/fracture, iron oxygen-moisture corrosion and copper–iron electrolyte
contact, wood-bond contact/contamination/cure/moisture/pressure, wood loading
and moisture, phase-change energy, and historic abrasive use. Those records
remain the owners of their narrower facts. `MAT-LIB-10` is rejected: its broad
adhesive formulation adds no necessary runtime behaviour beyond the existing
wood-bond owner and would duplicate its responsibility.

## Per-ID verdicts

`APPROVE` means the submitted wording is source-supported and non-duplicate.
`REWRITE` gives the only admissible candidate wording. `REJECT` must not be
promoted from this research item.

| ID | Verdict | Source/domain review and final wording where needed |
| --- | --- | --- |
| PHY-LIB-01 | APPROVE | S3 ch. 1 supports air resistance as a real-fall condition; no bundle duplicate. |
| PHY-LIB-02 | APPROVE | S3 ch. 8 supports the qualified same-impulse force/time trade-off. |
| PHY-LIB-03 | APPROVE | S3 chs. 7–8 supports equal/opposite interaction forces on distinct bodies. |
| PHY-LIB-04 | APPROVE | S3 ch. 9 supports viscous resistance between flowing layers. |
| PHY-LIB-05 | APPROVE | S3 ch. 9 supports conditional streamline/vortex regime change. |
| PHY-LIB-06 | APPROVE | S3 ch. 9 and S4 §52 support pressure-driven outflow; no rate follows. |
| PHY-LIB-07 | APPROVE | S3 ch. 6 supports the liquid-interface premise; it does not duplicate wetting/capillarity. |
| PHY-LIB-08 | APPROVE | S3 ch. 8 supports conservation only for the explicitly closed system. |
| PHY-LIB-09 | REWRITE | S4 §§33–40 supports irreversibility and losses, but “dissipated through heat exchange” is too loose. **RU:** В реальном необратимом процессе механически доступная энергия может переходить в другие формы и передаваться как теплота. **EN:** In a real irreversible process, mechanically available energy can transform into other forms and be transferred as heat. |
| PHY-LIB-10 | REWRITE | S4 §§22–26 are an ideal-gas treatment. **RU:** В приближении идеального газа при неизменном количестве вещества давление, объём и температура взаимосвязаны. **EN:** In the ideal-gas approximation, pressure, volume, and temperature are interrelated for a fixed amount of substance. |
| THM-LIB-01 | APPROVE | S4 §56 supports convection as heat transfer by moving fluid; retain `physics_material_science`. |
| THM-LIB-02 | REWRITE | S4 §53 supports it, but the submitted `chemistry_metallurgy` domain is not a bundle domain. Use `chemistry_process`; wording otherwise approved. |
| THM-LIB-03 | REWRITE | S4 §58 supports the gas-mixture condition. Use `chemistry_process`; retain “gas–air mixture” and no limits. |
| THM-LIB-04 | REJECT | S2 §2.2/S4 §55 support it, but it is a fuel-specific restatement of the approved general heterogeneous-interface primitive CHM-LIB-03. |
| THM-LIB-05 | REWRITE | S2 §2.2 supports it. Use `chemistry_process`, and retain the condition “when mass transport is not the limiting contrary factor.” **RU:** При прочих сопоставимых условиях увеличение площади границы фаз может ускорять гетерогенный процесс. **EN:** With other conditions comparable, increasing phase-boundary area can speed a heterogeneous process. |
| THM-LIB-06 | APPROVE | S4 §§33–34 supports the energy demand of vaporisation and qualified wet-fuel consequence; existing phase-energy fact is not the same relation. |
| THM-LIB-07 | APPROVE | S4 §43 supports conditional thermal expansion. |
| THM-LIB-08 | REWRITE | S2 §2.1 supports the relation; use `chemistry_process` rather than `chemistry_metallurgy`. |
| THM-LIB-09 | REWRITE | S2 §2.2/S4 §§53–57 support it; use `chemistry_process` rather than `chemistry_metallurgy`. |
| THM-LIB-10 | REWRITE | Existing bundle covers conduction only. S4 §§20, 33–34 supports the broader direction, but it needs its endpoint. **RU:** При самопроизвольном теплообмене без внешней работы чистый перенос теплоты идёт от более тёплой области к более холодной. **EN:** In spontaneous heat exchange without external work, net heat transfer goes from a warmer region to a colder one. |
| CHM-LIB-01 | APPROVE | S2 §1 supports exothermic/endothermic reactions. |
| CHM-LIB-02 | APPROVE | S2 §2.1 supports the qualified concentration/rate relation. |
| CHM-LIB-03 | APPROVE | S2 §2.1 supports heterogeneous reaction at a phase boundary; it is the general owner over rejected THM-LIB-04. |
| CHM-LIB-04 | APPROVE | S2 §2.2 supports possible transport limitation at the interface. |
| CHM-LIB-05 | APPROVE | S2 §2.2 supports mixing only when transport limits the process. |
| CHM-LIB-06 | APPROVE | S2 §§2.1, 2.3 supports catalyst effect on approach rate, not equilibrium under fixed conditions. |
| CHM-LIB-07 | APPROVE | S2 §2.3 supports dynamic equilibrium for reversible reactions. |
| CHM-LIB-08 | APPROVE | S2 §2.3 supports conditional equilibrium shift; direction remains reaction-specific. |
| CHM-LIB-09 | APPROVE | S2 §4.3/§7 supports mobile ions in electrolyte solution and electrode processes. |
| CHM-LIB-10 | REWRITE | S2 §8 supports corrosion as chemical environment interaction, but “loses its original properties” is imprecise. **RU:** Коррозия — химическое или электрохимическое взаимодействие металла со средой, изменяющее его состояние. **EN:** Corrosion is a chemical or electrochemical interaction of a metal with its environment that changes its state. |
| CHM-LIB-11 | APPROVE | S2 §8 supports possible electrochemical corrosion on metal/electrolyte contact; no rate. |
| CHM-LIB-12 | REWRITE | Runtime already owns the copper–iron instance. The nonduplicate generalisation must include electrical contact. **RU:** Электрически контактирующие разнородные металлы в электролите могут образовать гальваническую пару, изменяющую коррозионные роли металлов. **EN:** Electrically contacting dissimilar metals in an electrolyte can form a galvanic couple that changes the metals’ corrosion roles. |
| MAT-LIB-01 | APPROVE | S1 lecture 2, «Сучки, трещины» directly says knots can lower strength and impede working/gluing. |
| MAT-LIB-02 | REWRITE | S1 lecture 2 supports defects/cracks impairing integrity and sometimes strength, not an unconditional result. **RU:** Трещины в древесине могут нарушать её целостность и ухудшать механическую прочность. **EN:** Cracks in wood can disrupt its integrity and reduce mechanical strength. |
| MAT-LIB-03 | REJECT | Reopened S1 lecture 2 distinguishes surface mould/stain from destructive decay and reports preserved structure/static strength for the cited fungal-discolouration case. The submitted broad loss claim is not directly established by its cited passage; runtime already has wood-decay conditions. |
| MAT-LIB-04 | APPROVE | S1 lecture 4 §5 supports strong directional variation in wood tensile response. |
| MAT-LIB-05 | APPROVE | S1 lecture 4 §5 supports different along-grain shear versus across-grain cutting response. |
| MAT-LIB-06 | APPROVE | S1 lecture 4 §2 directly states that drying/moisture decrease can reduce elasticity and electrical conductivity while increasing compressive strength; keep its stated conditional direction. |
| MAT-LIB-07 | APPROVE | S1 lecture 2 §§4–6 supports biological damage to poorly stored felled wood; no object/time inference. |
| MAT-LIB-08 | APPROVE | S1 lecture 10 supports removal by hard abrasive grains and compatibility of abrasive/workpiece. |
| MAT-LIB-09 | APPROVE | S1 lecture 13 supports internal stress/cracking risk from uneven glass heating/cooling; distinct from bundle cooling-rate/final-property claim. |
| MAT-LIB-10 | REJECT | S1 lecture 15 supports surface/condition relevance, but runtime `wood-bond` already owns contact, contamination, cure, moisture and pressure. A generic replacement adds a parallel owner without a current consumer. |
| MAT-LIB-11 | APPROVE | S1 lecture 18 supports property variation among natural stone materials; the stated density/compressive-strength relation remains qualitative. |
| MAT-LIB-12 | APPROVE | S1 lecture 14/18 supports porous insulation material framing. Retain moisture/air-movement qualifier; no R-value. |

## Result

| Outcome | Count |
| --- | ---: |
| Approved unchanged | 30 |
| Approved only with rewrite/domain correction | 11 |
| Rejected | 3 |
| Reviewed IDs | 44 |

No source, candidate, pack, schema, code, test, profile or production binding
was changed by this review.

## Normalization correction

Post-review normalization narrowed three approved Appendix B runtime texts to
their actual source conditions: B2-SND-01 now concerns **new emission by the
vibrating source**, not already propagating or reflected sound; B2-CHM-02 is
limited to **dilute aqueous** strong-acid/strong-base neutralization; and
B2-CHM-05 applies only to a substance with **finite solubility**.  These are
scope corrections, not new claims or source approvals.

## Appendix B — independent second-pass verification

**Status:** source/domain review only; production Appendix B is not authored.
I reopened the read-only FB2 sources S6–S9 and S11 at their supplied locators:
`fb2-161831-166042.zip!165831.fb2` (sections 12, 14, 24–26),
`f.fb2-462297-464694.zip!463344.fb2` (chapters 1, 4),
`f.fb2-185838-188548.zip!187102.fb2` (I.1–4, IV.3–4),
`f.fb2-322394-325325.zip!322918.fb2` («Свойства твёрдых стёкол»), and
`f.fb2-234885-238403.zip!237062.fb2` (chapter 2). S10 is the cited Canadian
Conservation Institute note; its narrow bone/horn handling claims remain
condition-qualified. Runtime comparison was against the present 665-claim
bundle, not the research note alone.

| ID | Verdict | Source/domain finding |
| --- | --- | --- |
| B2-CHM-01 | APPROVE | S6 §24 supports acid/base → salt and water; `chemistry_process`, universal only. |
| B2-CHM-02 | APPROVE | S6 §24 supports heat release for the stated strong-acid/strong-base case. |
| B2-CHM-03 | APPROVE | S6 §§24–25 supports the weak-system/hydrolysis qualification; no named mixture. |
| B2-CHM-04 | APPROVE | S6 §12 supports solvation/hydration without a solubility or rate claim. |
| B2-CHM-05 | APPROVE | S6 §14 supports a conditional saturation limit. |
| B2-CHM-06 | APPROVE | S6 §§14–15 supports the qualified solids/liquids-versus-gases relation. |
| B2-CHM-07 | APPROVE | S6 §26 supports precipitation only for the named sparse-solubility ionic condition. |
| B2-CHM-08 | APPROVE | S6 §26 supports the common-ion equilibrium shift; no arbitrary-additive rule. |
| B2-STA-01 | APPROVE | S11 ch. 2 supports translational static force balance; it expressly excludes rotational equilibrium. |
| B2-STA-02 | REWRITE | S11 ch. 2 is an elementary static support model. **RU:** Для неподвижного тела на опоре при действии тяжести устойчивость теряется, когда вертикаль из центра тяжести выходит за пределы площади опоры. **EN:** For a stationary supported body under gravity, stability is lost when the vertical from its centre of mass passes outside the support area. |
| B2-STA-03 | APPROVE | S11 ch. 2 supports the lever/pivot arm relation; no capacity or efficiency. |
| B2-SND-01 | APPROVE | S8 I.1 supports vibration as the sound source; no loudness/audibility. |
| B2-SND-02 | APPROVE | S8 I.3 supports material-medium propagation and the vacuum exclusion. |
| B2-SND-03 | REWRITE | S8 I.2 supports pitch relation, but it is perceptual. **RU:** При прочих сопоставимых условиях частота звукового колебания связана с воспринимаемой высотой тона. **EN:** Under otherwise comparable conditions, the frequency of a sound vibration is related to perceived pitch. Keep listener/context limitation. |
| B2-SND-04 | APPROVE | S8 IV.3 supports conditional sound reflection; geometry/material/wavelength remain conditions. |
| B2-SND-05 | APPROVE | S8 IV.4 supports partial absorption by soft material; no acoustic-performance value. |
| B2-ELC-01 | APPROVE | S7 ch. 1 supports the qualitative conductor/insulator charge-mobility distinction. |
| B2-ELC-02 | APPROVE | S7 ch. 4 supports conditional stationary-charge interaction; no numeric law or macroscopic charge. |
| B2-ELC-03 | APPROVE | S7 ch. 1 supports current-generated magnetic field; existing motor prerequisite is narrower. |
| B2-LGT-01 | APPROVE | S9 «Свойства твёрдых стёкол», optical-properties paragraphs, supports refraction at a transparent-media boundary. |
| B2-LGT-02 | APPROVE | S9 optical-properties paragraphs support scattering from surface/body inhomogeneity; no classification of a particular glass. |
| B2-LGT-03 | APPROVE | S9 optical-properties paragraphs support attenuation through reflection, scattering and absorption. |
| B2-BNH-01 | APPROVE | S10 “Identification / Ivory and bone” supports the qualitative organic/inorganic composition distinction; no biomechanical value. |
| B2-BNH-02 | APPROVE | S10 “Care / Handling” supports this only for porous bone under handling; no impact threshold. |
| B2-BNH-03 | APPROVE | S10 “Identification / Horn” supports horn’s keratinous filament structure, explicitly not bone/antler. |
| B2-BNH-04 | APPROVE | S10 “Care / Cleaning” supports the narrow thin-horn/water/possible-deformation condition. |

## Appendix C — MATERIAL3 independent review

**Actual sources checked:** the already reopened CCI Note 6/1 identity passage;
Langley & Wisher (2019), full EXARC/York experimental report (methods, results,
tables and conclusions); and Stasik, Baron & Nowak (2024), publisher abstract
and article preview.  The latter is a replica late-Bronze-Age knife experiment,
not evidence of a present tool, historical Novgorod availability, skill, time,
rate, or guaranteed shaping result.

| ID | Verdict | Exact admissible form / boundary |
| --- | --- | --- |
| MATERIAL3-01 | **APPROVE — physics_material_science.** “Antler is osseous tissue, not keratin horn.” It is material identity only: no species, shed antler, object or mechanical result follows. |
| MATERIAL3-02 | **REJECT.** “Use bone constraints rather than horn rules” is editorial resolver guidance, not an independently supported factual relation. Keep the antler/horn distinction and the existing thin-horn condition separate; do not author a policy claim. |
| MATERIAL3-03 | **REWRITE — physics_material_science.** “In an experiment on naturally shed red-deer antler, soaking sections with exposed cancellous bone improved workability; cancellous bone retained water longer than compact bone.” The source compared dry, sealed and unsealed sections; no threshold, general softening, tool choice, historical availability or shaping outcome transfers. |
| MATERIAL3-04 | **REWRITE — physics_material_science.** “In an experiment using a replica bronze knife, blank division, surface cutting/whittling, and finishing by scraping or drilling bone and red-deer antler were performed as distinct operations.” This retains the experimental bronze-knife/material boundary and cannot become a general tool capability or recipe. |

**Result:** MATERIAL3-01, -03 and -04 are eligible only with these exact
forms. MATERIAL3-02 is not a production fact.

**Appendix B result:** 24 approved unchanged, 2 approved with wording/limit
rewrite, 0 rejected;
26 IDs reviewed. All approved rows belong to `chemistry_process` or
`physics_material_science`, use universal/domain-internal-only applicability,
and establish neither historical availability nor a present-world fact.
