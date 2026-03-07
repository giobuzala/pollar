library(dplyr)
library(tidyr)
library(readr)
library(tibble)
library(MCMCpack)

source("R/constants.R")
source("R/data_loaders.R")
source("R/model_core.R")

baseline <- load_baseline_data("../Data/Canada 2025 Federal Election Results by Electoral District.csv")

polling_results <- data.frame(
  `British Columbia` = c(0.29, 0.36, 0.00, 0.22, 0.09, 0.04),
  Alberta = c(0.14, 0.57, 0.00, 0.18, 0.07, 0.04),
  Saskatchewan = c(0.09, 0.61, 0.00, 0.21, 0.05, 0.04),
  Manitoba = c(0.16, 0.48, 0.00, 0.19, 0.07, 0.10),
  Ontario = c(0.34, 0.31, 0.00, 0.18, 0.08, 0.09),
  Quebec = c(0.31, 0.17, 0.29, 0.14, 0.06, 0.03),
  `New Brunswick` = c(0.36, 0.29, 0.00, 0.17, 0.09, 0.09),
  `Nova Scotia` = c(0.38, 0.27, 0.00, 0.16, 0.11, 0.08),
  `Prince Edward Island` = c(0.41, 0.22, 0.00, 0.14, 0.12, 0.11),
  `Newfoundland and Labrador` = c(0.44, 0.24, 0.00, 0.13, 0.08, 0.11),
  Yukon = c(0.32, 0.41, 0.00, 0.18, 0.06, 0.03),
  `Northwest Territories` = c(0.28, 0.33, 0.00, 0.26, 0.09, 0.04),
  Nunavut = c(0.27, 0.25, 0.00, 0.29, 0.12, 0.07),
  check.names = FALSE
)
rownames(polling_results) <- PARTIES
polling_results["Bloc", setdiff(colnames(polling_results), "Quebec")] <- NA_real_

prov_n <- build_effective_sample_sizes()
election_results <- baseline$election_results

old_env <- new.env(parent = globalenv())
sys.source("../Functions.R", envir = old_env)
old_env$polling_results <- polling_results
old_env$prov_n <- prov_n
old_env$election_results <- election_results

old_res <- old_env$run_seat_forecast_mc(
  n_sims = 200,
  swing_method = "Proportional",
  base_riding_results = baseline$riding_base
)

new_res <- run_seat_forecast_mc(
  n_sims = 200,
  swing_method = "Proportional",
  base_riding_results = baseline$riding_base,
  polling_results = polling_results,
  prov_n = prov_n,
  election_results = election_results
)

summary_diff <- max(abs(as.numeric(old_res$seat_summary) - as.numeric(new_res$seat_summary)))
majority_diff <- max(abs(old_res$prob_majority - new_res$prob_majority))
plurality_diff <- max(abs(as.numeric(old_res$prob_plurality) - as.numeric(new_res$prob_plurality)))

cat("Max seat summary diff:", round(summary_diff, 10), "\n")
cat("Max majority probability diff:", round(majority_diff, 10), "\n")
cat("Max plurality probability diff:", round(plurality_diff, 10), "\n")
