# Technology-boundary research: steam and electric motors

**Status:** candidates for independent approval only. They identify dated,
specific technology families rather than banning heat, steam, pressure,
magnetism, metalwork or explosive substances as such. A failed or partial
attempt still remains a valid free-world attempt; code owns actual materials,
state, geometry, energy and result.

## Directly read sources

- **H1 — Science Museum Group Collection:** [Drawing of Thomas Newcomen’s
  Pumping Engine, 1712](https://collection.sciencemuseumgroup.org.uk/objects/co50887/drawing-of-thomas-newcomens-pumping-engine-1712).
  The collection record says that around 1712 Newcomen and Cawley/Calley
  introduced the atmospheric engine and that it embodied leading practical
  features of the reciprocating steam engine.
- **H2 — Science Museum, Richard Dunn:** [A small revolution: Michael Faraday
  and origins of the electric motor](https://blog.sciencemuseum.org.uk/a-small-revolution-michael-faraday-and-the-origins-of-the-electric-motor/).
  Read: in September 1821 Faraday demonstrated continuous electromagnetic
  rotation, converting electrical to mechanical energy; the account records a
  current-carrying wire, magnet, mercury contact and battery.
- **U1 — OpenStax, University Physics vol. 2:** [Electrical
  Current](https://openstax.org/books/university-physics-volume-2/pages/9-1-electrical-current).
  Read: charge flow through an appliance needs a complete path from the
  positive to negative terminal; a battery supplies the electric potential.

## Atomic boundary candidates

| ID | Typed candidate | Time / applicability | Evidence and limit | Production-safe exclusion / gameplay use |
| --- | --- | --- | --- | --- |
| TECH-BOUND-01 | `technology.newcomen_atmospheric_reciprocating_engine → introduced_as_practical_machine → c.1712` | Historical introduction; Britain, 1712, therefore after Novgorod 1230. | H1 collection record. It says *practical scale* features of the reciprocating steam engine; it does not date every use of steam or pressure. | `introduced_after_context` may exclude a working Newcomen-type atmospheric reciprocating engine in 1230. It must not exclude a boiler, bellows, heat, pressure vessel, ancient aeolipile-type reaction device, or an attempted non-working pump. |
| TECH-BOUND-02 | `technology.electromagnetic_continuous_rotation_motor → demonstrated → 1821` | Historical introduction; London, September 1821, after Novgorod 1230. | H2: Faraday’s apparatus continuously rotated and demonstrated electrical-to-mechanical conversion. | `introduced_after_context` may exclude a working electromagnetic motor family in 1230. It does not exclude a magnet, static charge, manual rotation, experiment, or failed assembly. |
| TECH-BOUND-03 | `electric_current_through_device → requires → complete_conducting_path_and_potential_source` | Universal electrical prerequisite. | U1. A complete path joins source terminals through the component; battery/emf maintains potential. | A proposed electric motor cannot work from disconnected wire, magnet alone, or an absent source. No voltage/current values or material inventory follows. |
| TECH-BOUND-04 | `electromagnetic_continuous_rotation → requires → interaction_of_current_and_magnetic_field` | Universal process relation as demonstrated in Faraday’s apparatus. | H2: Ørsted current/magnetic effect motivated the work; Faraday’s rotation used wire, magnet and battery. | Relevant to a claimed motor-like result only; not a general prohibition on magnetic attraction, wire, or circular manual motion. |
| TECH-BOUND-05 | `faraday_1821_rotation_apparatus → used → {battery,conducting_wire,magnet,mercury_contact}` | Historical apparatus relation, 1821. | H2 quotes Faraday’s note: magnet needle in glass tube with mercury, supported connecting wire, and battery. | Documents one apparatus, not a recipe, performance specification, safe handling rule or a grant of mercury/battery/wire to a scene. |

## Explicit exclusions from this research

- No claim that steam, heat, pressure, pumps, cylinders or pistons were absent
  before 1712. This shard only dates **Newcomen-type practical atmospheric
  reciprocating steam engines**.
- No blanket ban on gunpowder: its global chronology is outside this bounded
  source set.
- No inference that a player/NPC possesses any later technology, workshop,
  energy source, conductor, magnet, sealed vessel or technical knowledge.

## Statistics and limits

| Measure | Count |
| --- | ---: |
| Directly read sources | 3 |
| Historical introduction boundaries | 2 |
| Universal/material-process prerequisites | 2 |
| Historical apparatus-component relation | 1 |
| Self-approved production claims | 0 |

**Research limitation:** H1 supplies a strong date/family boundary but not a
component-level cylinder/piston/pressure construction specification. Such a
claim remains unpromoted until a directly read engineering-history source gives
that exact anchor.
