# pollar backend

R (Plumber) API for [pollar](../README.md). Serves metadata and runs national or provincial seat forecasts via Monte Carlo simulation.

## Run

From this directory:

```bash
Rscript run_api.R
```

Listens on `http://0.0.0.0:8000`. The frontend calls `/meta`, `/forecast/national`, and `/forecast/provincial`.

## Data

Place the baseline election CSV in one of:

- `../data/Canada 2025 Federal Election Results by Electoral District.csv` (project root)
- `data/Canada 2025 Federal Election Results by Electoral District.csv` (this directory)

Expected columns include province, riding code/name, and vote counts or percentages by party (Liberal, Conservative, Bloc, NDP, Green, Other). See `R/data_loaders.R` for the exact structure.

## R packages

- `plumber` — API
- `dplyr`, `tidyr`, `readr`, `tibble` — Data handling
- `jsonlite` — JSON in/out
- `MCMCpack` — Dirichlet draws for poll uncertainty

Install with `install.packages(c("plumber", "dplyr", "tidyr", "readr", "tibble", "jsonlite", "MCMCpack"))`.

## Layout

- **plumber.R** — CORS, routes, baseline load; sources `R/*.R`.
- **run_api.R** — Plumbs and runs the API.
- **R/constants.R** — Parties, province weights, default sample size / design effect.
- **R/data_loaders.R** — Load CSV → election_results (province × party), riding_base, national_baseline.
- **R/input_transforms.R** — Coerce payloads to matrices; national → provincial; format JSON response.
- **R/model_core.R** — Dirichlet poll simulation, swing (absolute/proportional), riding elasticity, seat counts and riding win probabilities.
