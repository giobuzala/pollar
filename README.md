# pollar

Canadian federal election seat projections from polling data.

## Overview

Enter national or provincial vote shares to run a Monte Carlo simulation and see projected seat counts, majority/plurality probabilities, and riding-level win chances. For the full methodology (Dirichlet poll uncertainty, swing methods, riding elasticity), see [Methodology.md](Methodology.md).

## Access

pollar is deployed on Vercel. Use it at https://pollar-canada.vercel.app. Best experienced on desktop or tablet.

## Project structure

```
pollar/
├── README.md                  # This file
├── backend/
│   ├── plumber.R              # API: /meta, /forecast/national, /forecast/provincial
│   ├── run_api.R              # Start API server
│   └── R/
│       ├── constants.R        # Parties, province weights, defaults
│       ├── data_loaders.R     # Load baseline CSV → election_results, riding_base
│       ├── input_transforms.R # Payload → matrices; format_forecast_response
│       └── model_core.R       # Monte Carlo: Dirichlet, swing, elasticity, seat counts
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Main layout, state, forecast flow
│   │   ├── components/        # SeatSummary, CurrentSeatDistribution, PollInputForm, ProjectionMap, RidingProjectionTable
│   │   ├── lib/api.ts         # API client
│   │   ├── constants.ts       # Party colors, total seats
│   │   └── types.ts           # Party, ForecastResponse, etc.
│   ├── public/data/           # GeoJSON for map (see README there)
│   └── scripts/
│       └── convert_federal_districts.py  # Shapefile → GeoJSON for map
├── Data/                      # Baseline CSV (2025 federal election by district); see backend/README
```

## Stack

- **Frontend**: React, TypeScript, Vite. Poll inputs, seat bars, projected vote table, riding map (Leaflet + GeoJSON), filterable riding table.
- **Backend**: R (Plumber). Loads baseline 2025 election data, runs Monte Carlo simulations (Dirichlet poll draws, province swing, riding elasticity), returns seat summary and riding win probabilities.
- **Data**: Baseline from CSV of 2025 federal election results by electoral district; map boundaries from GeoJSON (see [frontend/public/data/README.md](frontend/public/data/README.md)).

## License

MIT License
