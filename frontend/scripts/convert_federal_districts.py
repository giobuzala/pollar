"""
Convert federal electoral district shapefile (Statistics Canada) to GeoJSON for the map.
Expects FederalElectoralDistricts_2025_SHP.zip in frontend/public/data/.
Output: frontend/public/data/federal-districts-2025.geojson (WGS84, properties FED_NUM, FED_NAME).

Run from project root: python frontend/scripts/convert_federal_districts.py
Or from frontend/: python scripts/convert_federal_districts.py
"""
from __future__ import annotations

import json
import tempfile
import zipfile
from pathlib import Path

import pyproj
import shapefile

# Frontend directory (parent of scripts/)
FRONTEND_ROOT = Path(__file__).resolve().parents[1]
ZIP_PATH = FRONTEND_ROOT / "public" / "data" / "FederalElectoralDistricts_2025_SHP.zip"
OUTPUT_PATH = FRONTEND_ROOT / "public" / "data" / "federal-districts-2025.geojson"

SOURCE_WKT = (
    'PROJCS["PCS_Lambert_Conformal_Conic",GEOGCS["GCS_North_American_1983",'
    'DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],'
    'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],'
    'PROJECTION["Lambert_Conformal_Conic"],PARAMETER["False_Easting",6200000.0],'
    'PARAMETER["False_Northing",3000000.0],PARAMETER["Central_Meridian",-91.86666666666666],'
    'PARAMETER["Standard_Parallel_1",49.0],PARAMETER["Standard_Parallel_2",77.0],'
    'PARAMETER["Latitude_Of_Origin",63.390675],UNIT["Meter",1.0]]'
)


def transform_ring(ring: list[tuple[float, float]], transformer: pyproj.Transformer) -> list[list[float]]:
    out: list[list[float]] = []
    for x, y in ring:
        lon, lat = transformer.transform(x, y)
        out.append([lon, lat])
    return out


def main() -> None:
    transformer = pyproj.Transformer.from_crs(
        pyproj.CRS.from_wkt(SOURCE_WKT),
        pyproj.CRS.from_epsg(4326),
        always_xy=True,
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        with zipfile.ZipFile(ZIP_PATH) as archive:
            archive.extractall(tmpdir)

        shp_path = Path(tmpdir) / "SHP" / "FED_CA_2025_EN.shp"
        reader = shapefile.Reader(str(shp_path), encoding="latin1")
        fields = [field[0] for field in reader.fields[1:]]

        features = []
        for shape_record in reader.iterShapeRecords():
            record = dict(zip(fields, shape_record.record))
            geometry = shape_record.shape.__geo_interface__
            gtype = geometry["type"]
            coords = geometry["coordinates"]

            if gtype == "Polygon":
                # coordinates: [exterior_ring, hole1, hole2, ...]
                transformed = [transform_ring(ring, transformer) for ring in coords]
                geom_out = {"type": "Polygon", "coordinates": transformed}
            elif gtype == "MultiPolygon":
                # coordinates: [[[exterior], [hole], ...], [[exterior], ...], ...]
                transformed = [
                    [transform_ring(ring, transformer) for ring in polygon]
                    for polygon in coords
                ]
                geom_out = {"type": "MultiPolygon", "coordinates": transformed}
            else:
                continue

            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "FED_NUM": int(record["FED_NUM"]),
                        "FED_NAME": record["ED_NAMEE"],
                    },
                    "geometry": geom_out,
                }
            )

        reader.close()

    feature_collection = {
        "type": "FeatureCollection",
        "features": features,
    }

    OUTPUT_PATH.write_text(json.dumps(feature_collection, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(features)} features to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
