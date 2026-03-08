# Map data

The riding projection map needs GeoJSON boundary files:

- **federal-districts-2025.geojson** (required) – federal electoral district polygons
- **canada-outline.geojson** (optional) – Canada outline for clipping

## Generating the files

1. Download the [Federal Electoral Districts 2025 shapefile](https://elections.ca/content.aspx?dir=cir%2FmapsCorner%2Fvector&document=index&lang=e&section=res) and place the zip as:
   `frontend/public/data/FederalElectoralDistricts_2025_SHP.zip`

2. From the `frontend/` directory, run:
   ```bash
   python scripts/convert_federal_districts.py
   ```
   This produces `frontend/public/data/federal-districts-2025.geojson`.

3. For the optional Canada outline, add `canada-outline.geojson` to this folder (e.g. from [Open Government](https://open.canada.ca) or by extracting from the same source).

Without these files, the app will show "Map data unavailable" in the Riding Projection Map section.
