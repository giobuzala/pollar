# pollar

Canadian federal election seat projections from polling data. Enter national or provincial vote shares to run a Monte Carlo simulation and see projected seat counts, majority/plurality probabilities, and riding-level win chances.

## Stack

- **Frontend**: React + TypeScript + Vite. Poll inputs, seat bars, projected vote table, riding map (D3 + GeoJSON), and filterable riding table.
- **Backend**: R (Plumber) on port 8000. Loads baseline 2025 election data, runs simulations (Dirichlet poll draws, province swing, riding elasticity), returns seat summary and riding win probabilities.
- **Data**: Baseline results from a CSV of 2025 federal election results by electoral district. Map boundaries from a GeoJSON (see below).

## Quick start

1. **Backend** (from project root or `backend/`):
   - Put `Canada 2025 Federal Election Results by Electoral District.csv` in `Data/` (project root) or `backend/Data/`.
   - From `backend/`: `Rscript run_api.R` (serves on `http://localhost:8000`).
2. **Frontend** (from `frontend/`):
   - `npm install` then `npm run dev`. Open the URL shown (e.g. `http://localhost:5173`).
3. **Map** (optional): For the riding map, add GeoJSON to `frontend/public/data/`. See [frontend/public/data/README.md](frontend/public/data/README.md).

## Project layout

```
pollar/
├── README.md                 # This file
├── backend/
│   ├── plumber.R             # API: /meta, /forecast/national, /forecast/provincial
│   ├── run_api.R             # Start API server
│   └── R/
│       ├── constants.R       # Parties, province weights, defaults
│       ├── data_loaders.R    # Load baseline CSV → election_results, riding_base
│       ├── input_transforms.R # Payload → matrices; format_forecast_response
│       └── model_core.R      # Monte Carlo: Dirichlet, swing, elasticity, seat counts
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Main layout, state, forecast flow
│   │   ├── components/       # SeatSummary, CurrentSeatDistribution, PollInputForm, ProjectionMap, RidingProjectionTable
│   │   ├── lib/api.ts        # API client
│   │   ├── constants.ts      # Party colors, total seats
│   │   └── types.ts         # Party, ForecastResponse, etc.
│   ├── public/data/          # GeoJSON for map (see README there)
│   └── scripts/
│       └── convert_federal_districts.py  # Shapefile → GeoJSON for map
├── scripts/                  # R analysis / one-off scripts
│   ├── Functions.R           # Helpers for seat forecast (logit, Dirichlet, swing, elasticity)
│   └── Federal Election Seat Forecast.R  # Standalone Monte Carlo forecast + plots (see Methodology.md)
```

## Environment

- **Frontend**: Optional `VITE_API_BASE_URL` (default `http://localhost:8000`) for the API base URL.
- **Backend**: R packages: `plumber`, `dplyr`, `tidyr`, `readr`, `tibble`, `jsonlite`, `MCMCpack`.

## License

See repository or author for license terms.
