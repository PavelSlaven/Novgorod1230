# Static food and biology gaps v1

Research candidate only; no runtime binding, recipe, safety guarantee, historical assertion, stock, or scene result follows. This pass compared the 1228 bundle's broad premises — `claim:fermentation-depends-on-microbe-substrate-conditions`, `claim:lactic-bacteria-can-convert-carbohydrate-to-acid-carbon-dioxide`, `claim:food-drying-depends-on-humidity-airflow`, `claim:drying-reduces-microbial-growth-conditions`, and `claim:low-temperature-reduces-many-microbial-metabolic-rates` — and records only narrower causal relations they do not state.

## Sources opened

| ID | Opened URL and anchor | Finding used | Limits |
| --- | --- | --- | --- |
| S1 | [University of Maryland, *Starch Hydrolysis by Amylase*](https://terpconnect.umd.edu/~nsw/ench485/lab5.htm), “Introduction” | Heating an aqueous starch suspension weakens its hydrogen bonds, lets granules absorb water and swell, and forms a gelatinous, highly viscous mixture. | Teaching laboratory context; no dish, amount, texture outcome, or cooking time. |
| S2 | [Virginia Cooperative Extension, *Vegetable Fermentation*](https://www.pubs.ext.vt.edu/FST/FST-328/FST-328.html), “What is fermentation?”, “Fermentation Components”, “Temperature”, and “Weights” | Vegetable sugars can yield acids and carbon dioxide; salt, atmosphere, temperature, and submerged brine affect which organisms grow and product course. | Modern home-preservation guidance; no recipe, dose, safety verdict, or claim about a particular vessel. |
| S3 | [UF/IFAS, *Fish Fillet: White Versus Red*](https://ask.ifas.ufl.edu/publication/FS454), “Why do the color and texture of the fish fillet change after cooking?” | Heating denatures fish muscle proteins, reducing water binding and changing firmness/flake structure. | Fillets and sensory changes only; no doneness rule, species-specific outcome, or safety guarantee. |
| S4 | [FAO, *Preliminary Processing of Freshwater Fish*](https://www.fao.org/4/w0495e/w0495e03.htm), §3.3.7 “Gutting” | Gutting removes internal organs, blood, and related cavity material; gall bladder should not be cut. | Processing guidance, not a claim that any fish is clean, edible, or spoiled. |
| S5 | [FAO, *Fish and fish products*](https://www.fao.org/4/x5434e/x5434e0f.htm), “Dried fish” and “Salted fish” | Sun heat and moving air remove fish moisture; weather, insects, vermin, and contamination affect exposed drying; salt and drying jointly reduce spoilage conditions. | No local climate, drying duration, safe endpoint, or stored-fish result. |
| S6 | [Mississippi State University Extension, *Cooling and Refrigerating Food*](https://happyhealthy.extension.msstate.edu/food-safety/cooling-and-refrigerating-food), bullets on refrigeration | Cold storage slows bacterial growth but does not stop it; freezing does not kill bacteria. | Modern refrigerated/freezing conditions; no medieval storage technology or food-specific lifetime. |
| S7 | [CDC, *How to Seal Up to Prevent Rodents*](https://www.cdc.gov/healthy-pets/rodent-control/seal-up.html), “Seal up gaps and holes” and “Seal up food and water sources inside” | Rodents seek food, water, and nesting sites; sealing openings and enclosing food restrict access. | Modern materials are examples only; no local infestation, barrier performance, or contamination event. |
| S8 | [Oregon State University Extension, *Evaluating honey bee colonies for pollination*](https://extension.oregonstate.edu/catalog/pnw-623-evaluating-honey-bee-colonies-pollination), “Honey bee flight”, “Colony size and efficiency”, and “Food requirement” | Foraging depends on suitable light, temperature, colony strength, forage availability, and weather; surplus honey depends on forager number and forage. | Managed-colony/pollination context; no claim of a hive, floral patch, harvest, or yield. |

## Candidate premises

### Starch thickening

- `claim:research-starch-gelatinization-can-thicken-an-aqueous-mixture` — heating starch in water can swell granules and form a gelatinous, highly viscous mixture that thickens a broth-like liquid. **Source:** S1, “Introduction”. **Limits:** no viscosity value, specific starch, amount, cooking time, or guarantee that any mixture thickens.

### Vegetable fermentation

- `claim:research-vegetable-fermentation-submersion-salt-and-temperature-shape-course` — submerged brine lowers oxygen exposure, while salt and temperature shape fermenting populations and progression; unsuitable conditions can favour spoilage or softening. **Source:** S2, “Weights”, “Fermentation Components”, “Temperature”. **Limits:** no recipe, measured ratio, timetable, vessel, or verdict on a particular batch.

### Fish cooking and handling

- `claim:research-heating-fish-denatures-proteins-reduces-water-binding-and-firms-flesh` — heating fish denatures muscle proteins, reduces water-binding capacity, and can make flesh opaque and firmer. **Source:** S3, “Why do the color and texture of the fish fillet change after cooking?”. **Limits:** no temperature threshold, doneness determination, safety result, or species-specific texture.
- `claim:research-fish-gutting-removes-viscera-blood-and-cavity-material-while-gall-bladder-damage-is-risk` — gutting removes viscera and blood from the body cavity; cutting the gall bladder is a handling fault to avoid. **Source:** S4, §3.3.7 “Gutting”. **Limits:** no claim that damage occurs, that washing repairs it, or that fish is fit to eat.

### Drying, salting, and cold storage

- `claim:research-exposed-fish-drying-depends-on-sun-heat-air-movement-and-weather-and-invites-pests` — sun heat and moving air remove fish moisture, but open sun-drying remains weather-dependent and exposes fish to insects, vermin, dirt, and sand. **Source:** S5, “Dried fish”. **Limits:** no local weather, dry-time prediction, contamination event, or preservation guarantee.
- `claim:research-fish-salting-moves-water-out-and-salt-in-and-may-need-drying` — in fish salting or brining, water moves out of flesh while salt moves in; uneven salt or salt-tolerant spoilage organisms can leave drying relevant. **Source:** S5, “Salted fish”. **Limits:** no dosage, exact preservation outcome, or safe storage duration.
- `claim:research-cooling-or-freezing-does-not-by-itself-guarantee-microorganism-destruction` — cooling or freezing food does not by itself guarantee destruction of microorganisms. **Source:** S6, refrigeration bullets. **Limits:** no storage lifetime, safety verdict, historical refrigeration claim, or assertion about a specific item.

### Rodents and stores

- `claim:research-rodents-are-drawn-to-available-food-water-and-nesting-sites` — accessible food, water, and nesting places draw rodents into a store or dwelling. **Source:** S7, “Seal up food and water sources inside”. **Limits:** no population count, species, arrival event, or damage.
- `claim:research-sealed-food-and-closed-openings-reduce-rodent-access` — enclosing food and sealing entry holes reduce rodent access to storage. **Source:** S7, “Seal up gaps and holes” / “Seal up food and water sources inside”. **Limits:** modern barrier materials are not imported into the setting; no absolute exclusion claim.

### Honey-bee forage and weather

- `claim:research-honeybee-foraging-requires-suitable-light-temperature-and-varies-with-weather` — honey-bee foraging requires suitable light and temperature, and poor foraging weather can interrupt collection. **Source:** S8, “Honey bee flight” / “Food requirement”. **Limits:** no local temperature threshold, weather observation, colony state, or flight event.
- `claim:research-surplus-honey-depends-on-forager-number-and-forage-availability` — a colony's capacity to accumulate surplus honey depends on the number of foragers and available forage; colony strength also changes its foraging force. **Source:** S8, “Colony size and efficiency”. **Limits:** no floral inventory, honey amount, harvest, or yield prediction.
