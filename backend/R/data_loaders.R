build_effective_sample_sizes <- function(
  total_n = DEFAULT_TOTAL_N,
  deff = DEFAULT_DEFF,
  province_weights = DEFAULT_PROV_WEIGHTS
) {
  prov_n_raw <- round(province_weights * total_n)
  round(prov_n_raw / deff)
}

load_baseline_data <- function(csv_path) {
  election_results_raw <- readr::read_csv(
    csv_path,
    col_types = readr::cols(.default = readr::col_character())
  ) |>
    dplyr::mutate(dplyr::across(dplyr::starts_with("VOTE"), as.numeric))

  election_results <- election_results_raw |>
    dplyr::group_by(PROVINCE) |>
    dplyr::summarise(
      VOTE_COUNT_Liberal = sum(VOTE_COUNT_Liberal),
      VOTE_COUNT_Conservative = sum(VOTE_COUNT_Conservative),
      VOTE_COUNT_Bloc = sum(VOTE_COUNT_Bloc),
      VOTE_COUNT_NDP = sum(VOTE_COUNT_NDP),
      VOTE_COUNT_Green = sum(VOTE_COUNT_Green),
      VOTE_COUNT_Other = sum(VOTE_COUNT_Other),
      .groups = "drop"
    ) |>
    dplyr::rowwise() |>
    dplyr::mutate(
      total_votes = sum(
        VOTE_COUNT_Liberal,
        VOTE_COUNT_Conservative,
        VOTE_COUNT_Bloc,
        VOTE_COUNT_NDP,
        VOTE_COUNT_Green,
        VOTE_COUNT_Other
      ),
      Liberal = VOTE_COUNT_Liberal / total_votes,
      Conservative = VOTE_COUNT_Conservative / total_votes,
      Bloc = VOTE_COUNT_Bloc / total_votes,
      NDP = VOTE_COUNT_NDP / total_votes,
      Green = VOTE_COUNT_Green / total_votes,
      Other = VOTE_COUNT_Other / total_votes
    ) |>
    dplyr::ungroup() |>
    dplyr::select(PROVINCE, dplyr::all_of(PARTIES)) |>
    tibble::column_to_rownames("PROVINCE") |>
    t() |>
    as.data.frame(stringsAsFactors = FALSE) |>
    dplyr::mutate(dplyr::across(dplyr::everything(), as.numeric))

  election_results["Bloc", setdiff(colnames(election_results), "Quebec")] <- NA_real_

  # Keep predictable column order for downstream form generation and joins.
  province_names <- names(DEFAULT_PROV_WEIGHTS)
  election_results <- election_results[, province_names, drop = FALSE]

  # Normalize riding names: em dash (U+2014) -> en dash (U+2013) to match GeoJSON/frontend
  riding_base <- election_results_raw |>
    dplyr::transmute(
      PROVINCE,
      FED_CODE = suppressWarnings(as.integer(FED_CODE)),
      FED_NAME = gsub("\u2014", "\u2013", FED_NAME, fixed = TRUE),
      Liberal = VOTE_PCT_Liberal,
      Conservative = VOTE_PCT_Conservative,
      Bloc = VOTE_PCT_Bloc,
      NDP = VOTE_PCT_NDP,
      Green = VOTE_PCT_Green,
      Other = VOTE_PCT_Other
    )
  riding_base$WINNER <- PARTIES[max.col(as.matrix(riding_base[, PARTIES]), ties.method = "first")]
  riding_base <- dplyr::arrange(riding_base, PROVINCE, FED_CODE)

  national_baseline <- colSums(riding_base[, PARTIES], na.rm = TRUE) / nrow(riding_base)

  list(
    election_results = election_results,
    riding_base = riding_base,
    national_baseline = national_baseline,
    province_names = province_names
  )
}
