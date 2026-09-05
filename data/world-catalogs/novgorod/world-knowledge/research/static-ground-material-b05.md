# Static ground/material sources — B05

Status: research note only. Not runtime corpus, candidate, approval request, local diagnosis, or construction/fire/cleaning recipe.

Reviewed existing `production-v1/runtime-bundle.json` first. It already has (a) birch-bark water deformation and form-drying, (b) moisture-in-fuel heat demand and general wood-combustion conditions, and (c) the conditional difference between cellulosic fibres and wool under alkaline cleaning. Snow melt/refreeze crust, boat load, and general heating are outside this pass.

## Supported new general premises

1. **Wet ground can have lower trafficability and be more prone to rutting.** USDA Forest Service's literature synthesis says soil moisture strongly relates to soil strength and trafficability; it describes compaction, shallow/deep rutting and related disturbance under moist-to-wet traffic, while texture, slope, load and passes also matter. [Nash et al., *Identifying soils trafficability* (USDA FS, 2022)](https://research.fs.usda.gov/treesearch/65976) and [full report](https://www.fs.usda.gov/rm/pubs_journals/2022/rmrs_2022_nash_m001.pdf).

   **Use boundary:** supports a conditional qualitative response: saturation/moisture may reduce support and permit rutting under load. It does not identify soil, water content, bearing capacity, vehicle/animal load, safe route, rut depth, or a present ground condition.

2. **Excavation near or below a water table can require groundwater/seepage control.** US Bureau of Reclamation states that construction excavation near or below the water table *usually* requires groundwater or seepage control. USACE explains that groundwater control can intercept seepage otherwise emerging at an excavation's slopes or bottom; uncontrolled groundwater can reduce stability. [USBR, *Engineering Geology Field Manual*, ch. 20](https://www.usbr.gov/tsc/techreferences/mands/geologyfieldmanual-vol2/Chapter20.pdf); [USACE, *Basics of Groundwater Control*, §2.1](https://www.publications.usace.army.mil/Portals/76/ETL%201110-2-586%20Change%201.pdf).

   **Use boundary:** supports only that groundwater/seepage is a possible constraint when an excavation reaches saturated ground. It does not establish a local water table, inflow rate, soil profile, collapse probability, drainage design, pumping method, or a safe digging depth.

3. **Birch bark's material composition can contain energy-rich hydrophobic components.** A direct peer-reviewed chemical study of *Betula pendula* bark reports substantial extractives, suberin and lignin, and reports bark energy content of 21–24 MJ/kg in its studied material. [RSC, *Conversion of birch bark to biofuels* (2020)](https://pubs.rsc.org/en/content/articlehtml/2020/gc/d0gc00405g). The same paper distinguishes outer bark's composition from wood; it is not evidence that all bark behaves alike.

   **Use boundary:** supports a conditional material premise, not an ignition or fuel-use result. It does not show that fresh bark will light, that wet bark or wet wood is usable, a drying method, smoke/toxicity outcome, heat output in a fire, or a safe fire-making route. Existing runtime moisture/combustion claims remain the applicable general limits.

## Already covered; no duplicate premise added

- `evidence:static-practical-bark-water-deformation` and `...-bark-form-drying`: moisture, shape change and constrained drying of birch bark.
- `claim:foundations-thm-06-moisture-vaporization-heat-demand` and `claim:population-material-wood-combustion`: moisture is a condition of fuel behaviour, without a calorific or ignition guarantee.
- `evidence:static-practical-wool-alkali-risk`: alkaline conditions suit cellulosic fibres while wool/silk can degrade; it explicitly supplies no safe concentration, duration or treatment result. The independent comparative textile study likewise reports alkali-induced structural change in cellulosic fabrics and dissolution of protein fabrics under its test conditions: [*Journal of the Textile Institute* (2022)](https://www.tandfonline.com/doi/full/10.1080/00405000.2022.2144663).

## Unsupported by this source set

No source above establishes a Novgorod-specific groundwater level, soil diagnosis, route, load limit, drain recipe, excavation safety guarantee, historical fuel availability, fresh/wet-bark lighting result, or safe alkali concentration/process for linen or wool.
