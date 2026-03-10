library(dplyr)
library(tidyr)
library(readr)
library(tibble)
library(jsonlite)
library(MCMCpack)

source("R/constants.R")
source("R/data_loaders.R")
source("R/model_core.R")
source("R/input_transforms.R")

b <- load_baseline_data("../data/Canada 2025 Federal Election Results by Electoral District.csv")
polls <- as.data.frame(b$election_results)
prov_n <- build_effective_sample_sizes()

out <- run_seat_forecast_mc(
  n_sims = 20,
  swing_method = "Proportional",
  base_riding_results = b$riding_base,
  polling_results = polls,
  prov_n = prov_n,
  election_results = b$election_results
)

print(nrow(out$seat_simulations))
print(out$majority_threshold)
