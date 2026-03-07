PARTIES <- c("Liberal", "Conservative", "Bloc", "NDP", "Green", "Other")

DEFAULT_PROV_WEIGHTS <- c(
  "British Columbia" = 0.139,
  "Alberta" = 0.111,
  "Saskatchewan" = 0.029,
  "Manitoba" = 0.035,
  "Ontario" = 0.386,
  "Quebec" = 0.230,
  "New Brunswick" = 0.022,
  "Nova Scotia" = 0.027,
  "Prince Edward Island" = 0.004,
  "Newfoundland and Labrador" = 0.014,
  "Yukon" = 0.001,
  "Northwest Territories" = 0.001,
  "Nunavut" = 0.001
)

DEFAULT_TOTAL_N <- 2000L
DEFAULT_DEFF <- 1.25

`%||%` <- function(x, y) {
  if (is.null(x)) y else x
}
