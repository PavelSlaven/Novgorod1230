# Orchard pruning and wet-cut peat: source basis

## Scope

Candidate general causal premises for two place-first gaps only: `core006` orchard pruning/injury/seasonal care and `core015` wet-cut peat/drying/workface. They do not establish an orchard, peatland, resource, worker, tool, recipe, safety threshold, output, local peat industry, current weather, current season, or current scene state.

## Existing corpus checked

Full `production-v1/runtime-bundle.json` search found `claim:household-apple-orchard`, `claim:environment-p1-waterlogged-layer`, general food-drying claims, and generic wet-ground/workspace relations. They establish historical compatibility, waterlogged layers, or general drying; none supplies the orchard wound/seasonal-care relation or wet-cut peat's distinct drying stages and weather dependency. This fragment intentionally adds no claim that peat was a Novgorod fuel or industry.

## Orchard pruning, injury, and seasonal care

[Oregon State University Extension, *Training and pruning your home orchard*](https://extension.oregonstate.edu/catalog/pnw-400-training-pruning-your-home-orchard), by Jeff L. Olsen and Neil Bell, was read. Its section *How a tree heals pruning wounds* describes branch-collar cells that isolate wounds from decay fungi, and distinguishes collar-respecting cuts from torn bark, stubs, and flush cuts. *When to prune* gives tree-kind and disease-context variation rather than one universal calendar. *Pruning mature trees* says young trees are pruned lightly to retain leaf area and neglected mature fruit trees can be restored over several years.

The candidate abstracts these as qualitative, universal relations. It supplies neither a historical Novgorod pruning calendar nor an exact cutting technique, species list, disease diagnosis, tool, wound dressing, or outcome for a particular tree.

## Wet-cut peat, drying, and workface

[USGS, *Preparation and Use of Peat as Fuel*](https://pubs.usgs.gov/bul/442-B/report.pdf), section *Cut peat*, was read. It describes cut blocks being laid on a cleared bog surface, partly drying after turning, and then being loosely stacked for further drying. This supports a material-state distinction only: newly cut versus partly dried peat. It is not imported as evidence that peat extraction or fuel use occurred in Novgorod.

The peat-work claim is explicitly `editorial_reconstruction` when applied to Novgorod Land in 1200–1300: if peat cutting and air drying are already established, turning or loose stacking can expose material for further water loss. It is a narrow ordinary composition inference from the process source, not a claim that peat cutting, fuel use, or an industry is present.

## Source and author identity

Two external sources were actually read: Oregon State University Extension (Jeff L. Olsen, Neil Bell) and United States Geological Survey. The editorial source is authored by `/root/place03_plants_peat` and is plainly marked as reconstruction, not scientific evidence.

## Access and validation notes

`browser-harness` was attempted first. Its CDP handshake was blocked pending Chrome remote-debugging permission, so the task-authorized web fallback was used; no browser tabs were opened or require closing. JSON parsing and the repository's full runtime bundle duplicate check remain required before candidate freeze. Independent per-claim approval under World Knowledge §35.1 remains outstanding; this file adds no verification ledger and cannot activate runtime behavior.
