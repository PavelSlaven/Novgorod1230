# Independent source verification — static smoke claims v1

Candidate: `git:d872afdc14ed5f7e80b04e6b945d75ba199d1877:data/world-catalogs/novgorod/world-knowledge/production-v1/static-environment-v1.json`.

Browser-harness reached the NWS glossary but exposed no document body; the permitted reader fallback then independently extracted the cited passages from the same NWS URLs.

- APPROVE `claim:research-atmospheric-conditions-affect-smoke-transport-and-dispersion`. The [NWS Fire Weather Glossary](https://www.weather.gov/okx/fireweatherglossary), “Smoke Transport,” defines it as smoke movement and dispersion affected by atmospheric wind, stability, and instability. This directly supports the candidate's qualitative `can affect` relation.
- APPROVE `claim:research-surface-inversion-can-trap-smoke-near-ground`. [NWS Wisconsin Annual Operating Plan, Appendix B, Smoke Management/HYSPLIT Requests](https://www.weather.gov/media/dlh/Firewx/2019_WI_AOP_Public_Final.pdf), PDF page 38, states that a surface-based temperature inversion traps smoke at low levels and prevents sufficient lofting for dilution or wind transport. This directly supports the candidate's qualified relation.

Limits retained: neither source establishes that an inversion, smoke source, wind, weather state, plume direction, concentration, exposure, visibility, terrain effect, safe location, or outcome exists in a particular game scene. The second source is a smoke-management operating-plan appendix; it is used only for the stated meteorological mechanism, not for a local forecast or safety decision.
