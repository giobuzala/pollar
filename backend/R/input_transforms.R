normalize_share_vector <- function(x, zero_floor = TRUE) {
  x <- as.numeric(x)
  names(x) <- names(x)
  if (zero_floor) x[x < 0] <- 0
  total <- sum(x, na.rm = TRUE)
  if (total <= 0) stop("Vote-share vector must sum to a positive number.", call. = FALSE)
  x / total
}

coerce_party_vector <- function(input, parties = PARTIES) {
  if (is.null(input)) stop("Missing party vote-share payload.", call. = FALSE)
  vec <- rep(NA_real_, length(parties))
  names(vec) <- parties

  if (is.list(input) || is.vector(input)) {
    for (party in parties) {
      if (!is.null(input[[party]])) vec[party] <- as.numeric(input[[party]])
    }
  }

  if (any(is.na(vec[c("Liberal", "Conservative", "NDP", "Green", "Other")]))) {
    stop("Payload must include Liberal, Conservative, NDP, Green, and Other shares.", call. = FALSE)
  }
  vec
}

province_payload_to_matrix <- function(payload, province_names, parties = PARTIES) {
  polling <- matrix(NA_real_, nrow = length(parties), ncol = length(province_names))
  rownames(polling) <- parties
  colnames(polling) <- province_names

  for (province in province_names) {
    province_input <- payload[[province]]
    if (is.null(province_input)) {
      stop(paste("Missing province payload:", province), call. = FALSE)
    }

    vec <- coerce_party_vector(province_input, parties = parties)

    if (province != "Quebec") vec["Bloc"] <- NA_real_
    if (province == "Quebec" && is.na(vec["Bloc"])) vec["Bloc"] <- 0

    if (province == "Quebec") {
      q_vec <- normalize_share_vector(vec)
      vec[names(q_vec)] <- q_vec
    } else {
      non_bloc <- normalize_share_vector(vec[setdiff(parties, "Bloc")])
      vec[names(non_bloc)] <- non_bloc
    }

    polling[, province] <- vec
  }

  as.data.frame(polling, stringsAsFactors = FALSE)
}

sample_sizes_from_payload <- function(
  sample_sizes,
  province_names,
  total_n = DEFAULT_TOTAL_N,
  deff = DEFAULT_DEFF
) {
  if (is.null(sample_sizes)) {
    weights <- DEFAULT_PROV_WEIGHTS[province_names]
    return(build_effective_sample_sizes(total_n = total_n, deff = deff, province_weights = weights))
  }

  out <- rep(NA_real_, length(province_names))
  names(out) <- province_names
  for (province in province_names) {
    out[province] <- as.numeric(sample_sizes[[province]])
  }

  if (any(is.na(out) | out <= 0)) {
    stop("Sample sizes must be positive for every province.", call. = FALSE)
  }
  round(out)
}

national_to_provincial_matrix <- function(
  national_poll,
  election_results,
  national_baseline,
  province_names
) {
  national_vec <- coerce_party_vector(national_poll)
  national_vec <- normalize_share_vector(national_vec)
  national_swing <- national_vec - national_baseline[PARTIES]

  province_estimates <- lapply(province_names, function(province) {
    base <- election_results[, province]
    names(base) <- rownames(election_results)
    est <- base + national_swing

    if (province != "Quebec") est["Bloc"] <- NA_real_
    if (province == "Quebec" && is.na(est["Bloc"])) est["Bloc"] <- 0

    if (province == "Quebec") {
      est <- normalize_share_vector(est)
    } else {
      adjusted <- normalize_share_vector(est[setdiff(PARTIES, "Bloc")])
      est[names(adjusted)] <- adjusted
    }
    est
  })

  polling <- do.call(cbind, province_estimates)
  rownames(polling) <- PARTIES
  colnames(polling) <- province_names
  as.data.frame(polling, stringsAsFactors = FALSE)
}

format_forecast_response <- function(result) {
  seat_summary <- result$seat_summary |>
    tidyr::pivot_longer(
      cols = dplyr::everything(),
      names_to = c("party", "stat"),
      names_pattern = "^(.*)_(mean|median|p05|p95)$",
      values_to = "seats"
    ) |>
    tidyr::pivot_wider(names_from = "stat", values_from = "seats") |>
    dplyr::mutate(dplyr::across(c(mean, median, p05, p95), ~ round(., 2))) |>
    dplyr::arrange(factor(party, levels = PARTIES))

  majority <- setNames(vector("list", length(PARTIES)), PARTIES)
  plurality <- setNames(vector("list", length(PARTIES)), PARTIES)
  for (party in PARTIES) {
    majority[[party]] <- jsonlite::unbox(round(as.numeric(result$prob_majority[[party]]), 4))
    plurality[[party]] <- jsonlite::unbox(round(as.numeric(result$prob_plurality[[party]]), 4))
  }

  ride_mat <- as.matrix(result$riding_win_probs[, PARTIES, drop = FALSE])
  projected_idx <- max.col(ride_mat, ties.method = "first")
  riding_out <- result$riding_win_probs |>
    dplyr::mutate(
      projected_winner = PARTIES[projected_idx],
      winner_probability = apply(ride_mat, 1, max),
      incumbent = .data$WINNER
    )

  # Build array of objects with explicit names so JSON has Liberal, Conservative, etc. for chance columns
  riding_list <- lapply(seq_len(nrow(riding_out)), function(i) {
    r <- riding_out[i, , drop = FALSE]
    out_row <- list(
      PROVINCE = r$PROVINCE[[1L]],
      FED_CODE = as.integer(r$FED_CODE[[1L]]),
      FED_NAME = r$FED_NAME[[1L]],
      incumbent = r$incumbent[[1L]],
      projected_winner = r$projected_winner[[1L]],
      winner_probability = as.numeric(r$winner_probability[[1L]])
    )
    for (party in PARTIES) {
      out_row[[party]] <- as.numeric(r[[party]][[1L]])
    }
    out_row
  })

  out <- list(
    seat_summary = jsonlite::fromJSON(jsonlite::toJSON(seat_summary, dataframe = "rows", auto_unbox = TRUE)),
    probabilities = list(
      majority = majority,
      plurality = plurality
    ),
    majority_threshold = jsonlite::unbox(as.integer(result$majority_threshold)),
    riding_win_probabilities = riding_list
  )

  if (!is.null(result$projected_national_vote) && !is.null(result$projected_provincial_vote)) {
    prov_names <- result$province_names
    proj_df <- data.frame(party = PARTIES, National = as.numeric(result$projected_national_vote[PARTIES]), stringsAsFactors = FALSE)
    for (p in prov_names) {
      proj_df[[p]] <- as.numeric(vapply(PARTIES, function(party) result$projected_provincial_vote[[p]][party], numeric(1)))
    }
    out$projected_vote_shares <- jsonlite::fromJSON(
      jsonlite::toJSON(proj_df, dataframe = "rows", auto_unbox = TRUE, digits = 4)
    )
  }

  out
}
