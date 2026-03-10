# Plumber API for pollar: metadata and national/provincial seat forecasts

# Run from backend/: Rscript run_api.R (serves on port 8000)
library(plumber)
library(dplyr)
library(tidyr)
library(readr)
library(tibble)
library(jsonlite)

source("R/constants.R")
source("R/data_loaders.R")
source("R/model_core.R")
source("R/input_transforms.R")

# Baseline CSV path: try project root then backend/data
BASELINE_CSV <- if (file.exists("../data/Canada 2025 Federal Election Results by Electoral District.csv")) {
  "../data/Canada 2025 Federal Election Results by Electoral District.csv"
} else {
  "data/Canada 2025 Federal Election Results by Electoral District.csv"
}
BASELINE <- load_baseline_data(BASELINE_CSV)

#* @filter cors
function(req, res) {
  res$setHeader("Access-Control-Allow-Origin", "*")
  res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req$REQUEST_METHOD == "OPTIONS") {
    res$status <- 200
    return(list())
  }
  plumber::forward()
}

#* @apiTitle Canada Election Forecast API

#* Health check
#* @get /health
function() {
  list(status = "ok")
}

#* Return baseline metadata used by the UI (includes 2025 provincial defaults)
#* @get /meta
function() {
  er <- BASELINE$election_results
  default_provincial_polls <- list()
  for (prov in BASELINE$province_names) {
    vec <- er[, prov, drop = TRUE]
    vec[is.na(vec)] <- 0
    default_provincial_polls[[prov]] <- as.list(vec)
  }
  # 2025 election seat count by party (for Current Seat Distribution chart)
  winner_counts <- table(factor(BASELINE$riding_base$WINNER, levels = PARTIES))
  baseline_seats <- as.list(setNames(as.integer(winner_counts), PARTIES))
  list(
    parties = PARTIES,
    provinces = BASELINE$province_names,
    majority_threshold = jsonlite::unbox(floor(nrow(BASELINE$riding_base) / 2) + 1L),
    default_provincial_polls = default_provincial_polls,
    baseline_seats = baseline_seats
  )
}

#* Run forecast from province-level polling
#* @post /forecast/provincial
function(req, res) {
  payload <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)

  n_sims <- as.integer(payload$n_sims %||% 1000L)
  swing_method <- payload$swing_method %||% "Proportional"
  total_n <- as.integer(payload$total_n %||% DEFAULT_TOTAL_N)
  deff <- as.numeric(payload$deff %||% DEFAULT_DEFF)

  polling_results <- province_payload_to_matrix(
    payload = payload$polls,
    province_names = BASELINE$province_names
  )
  prov_n <- sample_sizes_from_payload(
    sample_sizes = payload$sample_sizes,
    province_names = BASELINE$province_names,
    total_n = total_n,
    deff = deff
  )

  result <- run_seat_forecast_mc(
    n_sims = n_sims,
    swing_method = swing_method,
    base_riding_results = BASELINE$riding_base,
    polling_results = polling_results,
    prov_n = prov_n,
    election_results = BASELINE$election_results
  )

  format_forecast_response(result)
}

#* Run forecast from national polling only
#* @post /forecast/national
function(req, res) {
  payload <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)

  n_sims <- as.integer(payload$n_sims %||% 1000L)
  swing_method <- payload$swing_method %||% "Proportional"
  total_n <- as.integer(payload$total_n %||% DEFAULT_TOTAL_N)
  deff <- as.numeric(payload$deff %||% DEFAULT_DEFF)

  polling_results <- national_to_provincial_matrix(
    national_poll = payload$national_poll,
    election_results = BASELINE$election_results,
    national_baseline = BASELINE$national_baseline,
    province_names = BASELINE$province_names
  )
  prov_n <- sample_sizes_from_payload(
    sample_sizes = NULL,
    province_names = BASELINE$province_names,
    total_n = total_n,
    deff = deff
  )

  result <- run_seat_forecast_mc(
    n_sims = n_sims,
    swing_method = swing_method,
    base_riding_results = BASELINE$riding_base,
    polling_results = polling_results,
    prov_n = prov_n,
    election_results = BASELINE$election_results
  )

  format_forecast_response(result)
}

