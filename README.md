# [pollar](https://pollar-canada.vercel.app/)

An interactive web app that generates Canadian federal election seat projections using polling data.

## Overview and methodology

pollar is an interactive forecasting tool that simulates plausible election outcomes under polling uncertainty. Instead of producing a single deterministic projection, it models the range of outcomes that could occur given current polling.

Users enter their own national or provincial vote shares, which are then used as the basis for the simulation.

Under the hood, the model:

- Simulates province-level vote shares using a Dirichlet distribution to reflect polling uncertainty
- Converts simulated polls into swing relative to baseline election results
- Applies that swing to individual ridings using a competitiveness-based elasticity adjustment, so close ridings respond more strongly than safe seats
- Renormalizes vote shares and determines winners in each riding for every simulation

Aggregating the simulations produces seat projections, probabilities of majority or plurality governments, and riding-level win probabilities. The number of simulations is determined by the value entered by the user.

For the full methodology (Dirichlet poll uncertainty, swing methods, and riding elasticity), see [Methodology.md](Methodology.md).

## Access

pollar is deployed on [Vercel](https://vercel.com/). Use it at https://pollar-canada.vercel.app. Best experienced on desktop or tablet.

## Project structure

```
pollar/
├── README.md
├── Methodology.md                        # Model description (Dirichlet, swing, elasticity)
├── DEPLOY.md                             # Deploy backend (Render) and frontend (Vercel)
├── render.yaml                           # Render blueprint for backend
├── data/                                 # Baseline CSV (2025 election by district); see backend/README
├── backend/
│   ├── plumber.R                         # API: /meta, /forecast/national, /forecast/provincial
│   ├── run_api.R                         # Start API server
│   ├── Dockerfile                        # For Render (or any Docker host)
│   ├── tests_smoke.R                     # Quick pipeline check (load data, run forecast)
│   └── R/
│       ├── constants.R                   # Parties, province weights, defaults
│       ├── data_loaders.R                # Load baseline CSV → election_results, riding_base
│       ├── input_transforms.R            # Payload → matrices; format_forecast_response
│       └── model_core.R                  # Monte Carlo: Dirichlet, swing, elasticity, seat counts
└── frontend/
    ├── src/
    │   ├── App.tsx                       # Main layout, state, forecast flow
    │   ├── components/                   # SeatSummary, CurrentSeatDistribution, PollInputForm, ProjectionMap, RidingProjectionTable
    │   ├── lib/api.ts                    # API client
    │   ├── constants.ts                  # Party colors, total seats
    │   └── types.ts                      # Party, ForecastResponse, etc.
    ├── public/data/                      # GeoJSON for map (see README there)
    ├── scripts/
    │   └── convert_federal_districts.py  # Shapefile → GeoJSON for map
    └── vercel.json                       # SPA rewrites, /data/* static
```

## Stack

- **Frontend**: React, TypeScript, Vite. Poll inputs, seat bars, projected vote table, riding map (Leaflet + GeoJSON), filterable riding table.
- **Backend**: R (Plumber). Loads baseline 2025 election data, runs Monte Carlo simulations (Dirichlet poll draws, province swing, riding elasticity), returns seat summary and riding win probabilities.
- **Data**: Baseline from CSV of 2025 federal election results by electoral district; map boundaries from GeoJSON (see [frontend/public/data/README.md](frontend/public/data/README.md)).

## License

MIT License
