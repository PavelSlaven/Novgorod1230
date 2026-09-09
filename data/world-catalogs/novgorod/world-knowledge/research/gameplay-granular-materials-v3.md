# Gameplay granular materials v3 — candidate research

## Scope

Probe: an actor compresses a wet granular material. Needed relation is conditional mechanics only: liquid bridges can give wet grains cohesion, and deformation can change pore-phase configuration. It must not say that a local material is sand, has a particular water content or grain size, releases water, can be rolled, persists as a ball, or succeeds in a scene.

## Sources read

1. Scheel et al., *Liquid distribution and cohesion in wet granular assemblies beyond the capillary bridge regime*, J. Phys.: Condens. Matter 20 (2008), 494236, [DOI](https://doi.org/10.1088/0953-8984/20/49/494236), abstract on IOPscience. The authors' bead-packing experiments attribute capillary cohesion to liquid–air interfaces spanning grains and report dependence on liquid content; cohesion weakens at high pore filling. Candidate `claim:wet-granular-liquid-bridges-can-provide-capillary-cohesion` retains only the conditional `can` relation.

2. Milatz et al., *Quantitative 3D imaging of partially saturated granular materials under uniaxial compression*, Acta Geotechnica 16 (2021), 3573–3600, [DOI](https://doi.org/10.1007/s11440-021-01315-5), abstract and §§1.1–1.1.2 on Springer Nature Link. In-situ uniaxial-compression experiments on Hamburg Sand and glass beads measured evolution of air–water interfaces, water clusters and local strain fields at three initial water contents. Candidate `claim:partially-saturated-granular-deformation-can-change-pore-phase-configuration` retains only that configuration can change during deformation.

## Composition and limits

The second candidate plus existing `claim:water-percolation-openings` and `claim:water-permeability-connected-pores` permits only a conditional inference: if authoritative state supplies a partially wet granular material and an actual connected liquid path, deformation may alter pore-phase configuration and liquid movement needs that path. It does **not** support that water emerges from fingers, drains outward, has any quantity/rate, or that a lump can be formed.

The two sources are modern controlled material experiments. They are appropriate for a universal physical mechanism, not an assertion about a 1230 local scene or a particular natural sand. No authoring promotion, approval, verification, descriptor include, or runtime activation is part of this candidate.
