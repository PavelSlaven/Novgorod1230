# Synthetic test source fixture

`source-synthetic.csv` is a new minimal fixture for issue #465. The originally listed `source-23.csv` was missing from the delivered author package and is not restored or represented as recovered. This fixture contains one normalized-source row for each ID in `overlay-22.csv`, `extra-overlay-row.csv`, and `extra-overlay-row-2.csv`; `primary_material` and `materials` come from each correction's `*_before` values. The test pins the fixture's SHA at runtime when calling the builder, so this synthetic source does not claim the production source checksum.
