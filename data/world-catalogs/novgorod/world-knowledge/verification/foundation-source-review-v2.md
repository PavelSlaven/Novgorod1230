# Foundation source review v2

These verdicts concern the original source associations. Later six-claim
replacement approvals are in `foundation-evidence-repair-v2.md`; the two
remaining unsupported whole claims are preserved outside production in
`research/unapproved-foundation-v2.json`. The production verification fragments
record the final associations and exact digests.

Independent bounded review of exactly 25 `NEEDS_REVIEW` rows in
`foundation.json ∩ base-per-claim-v2.json`. Browser-Harness reopened each
listed source URL on 2026-09-04. No claim text or pack data was changed.

<a id="gramota73"></a>

## `#gramota73` — APPROVE

Source: <https://gramoty.ru/birchbark/document/show/novgorod/73/>. The live
record identifies Novgorod no. 73, dates it to 1220–1240 / 1220s–1230s,
classifies it as a debt record, and displays text containing `гривн`.

- `claim:gramota-73-grivna-term` — APPROVE. Limit: one document's lexical
  attestation only; no currency value, debt enforcement, or universal usage.

<a id="msu-novgorod"></a>

## `#msu-novgorod` — APPROVE

Source: <https://www.hist.msu.ru/departments/8827/expeditions/novgorod/>. The
live MSU expedition page reports over 50 urban areas excavated, whole medieval
quarters with structures, pavements and improvement system, and a material
collection including tools, household vessels, weapons, architectural details,
houses and furniture remains.

- `claim:excavated-urban-structures`
- `claim:composite-urban-quarter`
- `claim:contextual-evidence-classes`
- `claim:urban-pavements`
- `claim:localized-improvement-context`
- `claim:architectural-material-classes`

All six APPROVE only broad archaeological-context support. They do not prove a
particular building, material, layout, object, location, date within a scene,
or current availability.

<a id="openstax-friction"></a>

## `#openstax-friction` — APPROVE

Source: <https://openstax.org/books/college-physics-2e/pages/5-1-friction>.
The official §5.1 text defines friction as a contact force opposing relative or
attempted motion, parallel to the contact surface; it distinguishes static and
kinetic friction and conditions any magnitude on the normal force and the two
materials.

- `claim:dry-friction` — APPROVE with those stated limits. The source does not
  establish a universal coefficient, force, or outcome for a particular object.

<a id="openstax-fluids"></a>

## `#openstax-fluids` — APPROVE

Official OpenStax College Physics 2e: [§11.7](https://openstax.org/books/college-physics/pages/11-7-archimedes-principle?modal=MH) states the buoyant force and its relation to displaced-fluid weight; §§11.3–11.4 define pressure and its depth relation; §13.5 bounds phase changes by pressure and temperature.

- `claim:buoyancy-pressure-phase-change` — APPROVE only at those general relations; no specific object outcome follows.

<a id="openstax-forces"></a>

## `#openstax-forces` — APPROVE

Official [OpenStax §4.5](https://openstax.org/books/college-physics-2e/pages/4-5-normal-tension-and-other-examples-of-forces) defines normal force as perpendicular to the contact surface.

- `claim:force-contact-geometry` — APPROVE; no exact force, geometry, or object-specific result follows.

<a id="ucl-article-575"></a>

## `#ucl-article-575` — NEEDS_REVIEW

Publisher text for UCL Archaeology International article 575 / DOI
10.5334/ai.0211 states that Novgorod's preservation makes wooden artefacts
unavoidable, and gives a twelfth-century wooden bowl and a tenth-century wooden
mallet as examples of diverse everyday domestic objects.

- `claim:structural-and-object-wood` — NEEDS_REVIEW: the passage supports
  wooden artefacts, not the structural-wood conjunct.
- `claim:woodworked-objects-and-waste` — NEEDS_REVIEW: the passage supports
  wooden objects, not woodworking waste.

The same readable passage does not establish the remaining five UCL rows:
wooden urban structures/coverings, leather items/context, or production waste.
They remain `NEEDS_REVIEW`; no title/category inference was made.

<a id="jstor-novgorod-context"></a>

## `#jstor-novgorod-context` — exact chapter comparison

The JSTOR/Oxbow table of contents exposes readable chapter abstracts: chapter
13 reports metalworking evidence from medieval Novgorod (10th–15th centuries),
while chapter 6 reports a medieval pottery assemblage from the Novgorod region.

- `claim:novgorod-urban-metalworking` and `claim:metalworking-broad-context`
  — APPROVE as broad context only.
- `claim:ceramic-material-category` — APPROVE as a ceramic category only.
- `claim:novgorod-wood-bone-horn-classes` — NEEDS_REVIEW: these abstracts do
  not establish all three claimed material classes, especially bone and antler.

<a id="usda-wood"></a>

## `#usda-wood` — APPROVE

The official USDA Forest Service Wood Handbook material identifies wood
properties as depending on moisture content and direction/growing direction.
`claim:wood-anisotropy-moisture` is APPROVE only at that qualitative level.

<a id="nist-fractography"></a>

## `#nist-fractography` — APPROVE

The official NIST SP 960-16e3, *Fractography of Ceramics and Glasses*, is the
correct replacement for the unrelated former SP 960-17 URL. It supports the
general brittle-fracture/defect claim, not a concrete object outcome.

<a id="astm-d1776"></a>

## `#astm-d1776` — APPROVE

The official ASTM D1776/D1776M scope states that textile conditioning and
prior humidity exposure affect moisture equilibrium for testing. This supports
`claim:textile-conditioning-matters` only as a testing-condition rule.

<a id="doitpoms-material-state"></a>

## `#doitpoms-material-state` — APPROVE

The author-attributed DoITPoMS LibreTexts republication identifies its original
DoITPoMS source and Cambridge affiliation. Its Mechanical Testing, Mechanisms
of Plasticity, and Microstructural Examination modules cover processing and
structure effects; the existing approved RSC metal evidence supplies composition,
and the DoITPoMS materials modules treat temperature-dependent deformation.

`claim:metal-properties-depend-on-state` is APPROVE only as the general four-
factor dependency; it never supplies a numeric property for an unknown object.

<a id="blocked-or-unreadable-primary-source"></a>

## `#blocked-or-unreadable-primary-source` — NEEDS_REVIEW

The following initial live source URLs did not expose source content sufficient for an
independent claim-level reading in Browser-Harness. This is an access/evidence
block, not a negative historical or scientific finding.

| Source / observed block | Claims left NEEDS_REVIEW |
| --- | --- |
| UCL article 575 <https://journals.uclpress.co.uk/ai/article/575/galley/12753/view/> returned blank page (`🐴`), no article text/anchor. | `claim:novgorod-wooden-urban-elements`, `claim:novgorod-leather-items`, `claim:structural-and-object-wood`, `claim:urban-wooden-coverings`, `claim:woodworked-objects-and-waste`, `claim:leather-broad-context`, `claim:work-waste-context` |
| JSTOR volume <https://www.jstor.org/stable/10.2307/j.ctvh1dqcg> did not expose readable volume/page anchor in this browser session. | `claim:novgorod-wood-bone-horn-classes`, `claim:novgorod-urban-metalworking`, `claim:metalworking-broad-context`, `claim:ceramic-material-category` |
| OpenStax landing page <https://openstax.org/details/books/college-physics-2e> exposed no book/chapter text. | `claim:buoyancy-pressure-phase-change`, `claim:force-contact-geometry`, `claim:dry-friction` |
| USDA Wood Handbook chapter <https://www.fpl.fs.usda.gov/documnts/fplgtr/fplgtr190/chapter_04.pdf> returned `Service unavailable` / `The request is blocked`. | `claim:wood-anisotropy-moisture` |
| Cambridge DoITPoMS URL <https://www.doitpoms.ac.uk/tlplib/properties-of-materials.php> returned `File not found.` | `claim:metal-properties-depend-on-state` |
| NIST PDF <https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication960-17.pdf> opened without extractable document text/anchor. | `claim:brittle-fracture-defects` |
| ASTM D1776 URL redirected to a 404 page; source text unavailable. | `claim:textile-conditioning-matters` |

This initial access log is superseded by the later source sections. Current
`NEEDS_REVIEW` rows are the eight claims without whole-claim support:
`novgorod-wooden-urban-elements`, `novgorod-leather-items`,
`novgorod-wood-bone-horn-classes`, `structural-and-object-wood`,
`urban-wooden-coverings`, `woodworked-objects-and-waste`,
`leather-broad-context`, and `work-waste-context`.
