# pollar frontend

React + TypeScript + Vite UI for [pollar](../README.md): poll inputs, seat projections, projected vote table, and riding map/table.

## Scripts

- `npm run dev` — Start dev server (default port 5173).
- `npm run build` — TypeScript build + Vite production build.
- `npm run lint` — Run ESLint.
- `npm run preview` — Preview production build locally.

## API

The app expects the pollar API at `http://localhost:8000`. Override with:

```bash
# .env or .env.local
VITE_API_BASE_URL=http://your-api-host:8000
```

Start the backend from `backend/` with `Rscript run_api.R`.

## Map data

The riding projection map needs GeoJSON in `public/data/`. See **[public/data/README.md](public/data/README.md)** for how to generate or add the files. From this directory you can run `python scripts/convert_federal_districts.py` to build the districts GeoJSON from the shapefile.

Without map data, the app still works; the map section shows a short message and the riding table remains available.
