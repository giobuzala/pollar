# Monte Carlo seat forecast: Dirichlet poll simulation, province swing, riding elasticity.
# logit/inv_logit: proportional (logit) swing; elasticity scales swing by riding margin.
logit <- function(p, eps = 1e-6) {
  p <- pmin(pmax(p, eps), 1 - eps)
  log(p / (1 - p))
}

inv_logit <- function(x) {
  1 / (1 + exp(-x))
}

# Draw one Dirichlet sample for a province (mean = polling_results, concentration from prov_n).
simulate_province_poll <- function(prov, polling_results, prov_n) {
  mean_vec <- polling_results[, prov]
  if (is.null(names(mean_vec)) && !is.null(rownames(polling_results))) {
    names(mean_vec) <- rownames(polling_results)
  }

  mean_vec <- mean_vec[!is.na(mean_vec)]
  n_val <- prov_n[prov]
  if (is.na(n_val)) {
    stop(paste("Missing effective sample size for province:", prov), call. = FALSE)
  }

  alpha <- mean_vec * n_val
  alpha[alpha <= 0] <- 1e-6
  sim_draw <- as.numeric(MCMCpack::rdirichlet(1, alpha))
  names(sim_draw) <- names(mean_vec)
  sim_draw
}

# Provincial swing: simulated poll minus baseline; Absolute = raw diff, Proportional = logit diff.
compute_prov_swing <- function(
  prov,
  polling_results,
  prov_n,
  election_results,
  swing_method = "Absolute"
) {
  sim_poll <- simulate_province_poll(prov, polling_results = polling_results, prov_n = prov_n)
  base_elec <- setNames(election_results[, prov], rownames(election_results))
  base_elec <- base_elec[!is.na(base_elec)]

  common_parties <- intersect(names(sim_poll), names(base_elec))
  sim_poll <- sim_poll[common_parties]
  base_elec <- base_elec[common_parties]

  if (swing_method == "Absolute") {
    sim_poll - base_elec
  } else if (swing_method == "Proportional") {
    logit(sim_poll) - logit(base_elec)
  } else {
    stop("Invalid swing method.", call. = FALSE)
  }
}

# Riding elasticity from margin (1st - 2nd): tighter races get higher elasticity (up to 1.30).
compute_elasticity <- function(vote_matrix) {
  if (is.null(dim(vote_matrix)) || nrow(vote_matrix) < 1 || ncol(vote_matrix) < 2) {
    stop("compute_elasticity() requires a matrix with >= 1 row and >= 2 party columns.", call. = FALSE)
  }

  sorted_votes <- t(apply(vote_matrix, 1, sort, decreasing = TRUE))
  margin <- sorted_votes[, 1] - sorted_votes[, 2]

  ifelse(
    margin < 0.05, 1.30,
    ifelse(
      margin < 0.10, 1.15,
      ifelse(margin < 0.20, 1.00, ifelse(margin < 0.30, 0.85, 0.70))
    )
  )
}

# Apply provincial swing to all ridings in province (elasticity-weighted).
apply_swing_to_ridings <- function(
  prov,
  base_riding_results,
  polling_results,
  prov_n,
  election_results,
  swing_method = "Absolute"
) {
  prov_swing <- compute_prov_swing(
    prov = prov,
    polling_results = polling_results,
    prov_n = prov_n,
    election_results = election_results,
    swing_method = swing_method
  )

  ridings_prov <- base_riding_results[base_riding_results$PROVINCE == prov, , drop = FALSE]
  party_cols <- names(prov_swing)
  vote_matrix <- as.matrix(ridings_prov[, party_cols, drop = FALSE])
  elasticity <- compute_elasticity(vote_matrix)

  if (swing_method == "Absolute") {
    vote_matrix <- vote_matrix + outer(elasticity, prov_swing)
  } else if (swing_method == "Proportional") {
    vote_matrix <- inv_logit(logit(vote_matrix) + outer(elasticity, prov_swing))
  } else {
    stop("Invalid swing method.", call. = FALSE)
  }

  vote_matrix[vote_matrix < 0] <- 0
  row_totals <- rowSums(vote_matrix)
  row_totals[row_totals == 0] <- 1e-9
  vote_matrix <- vote_matrix / row_totals

  ridings_prov[, party_cols] <- vote_matrix
  ridings_prov
}

build_province_contexts <- function(base_riding_results, election_results) {
  ordered_base <- base_riding_results[order(base_riding_results$PROVINCE, base_riding_results$FED_CODE), , drop = FALSE]
  province_groups <- split(seq_len(nrow(ordered_base)), ordered_base$PROVINCE)

  contexts <- lapply(names(province_groups), function(prov) {
    row_idx <- province_groups[[prov]]
    ridings_prov <- ordered_base[row_idx, , drop = FALSE]
    base_elec <- setNames(election_results[, prov], rownames(election_results))
    base_elec <- base_elec[!is.na(base_elec)]
    active_parties <- intersect(names(base_elec), PARTIES)
    active_cols <- match(active_parties, PARTIES)
    active_vote_matrix <- as.matrix(ridings_prov[, active_parties, drop = FALSE])

    list(
      province = prov,
      row_idx = row_idx,
      base_vote_matrix = as.matrix(ridings_prov[, PARTIES, drop = FALSE]),
      active_parties = active_parties,
      active_cols = active_cols,
      base_elec = base_elec[active_parties],
      elasticity = compute_elasticity(active_vote_matrix)
    )
  })

  names(contexts) <- names(province_groups)
  list(
    ordered_base = ordered_base,
    contexts = contexts
  )
}

# Simulate one run: draw poll, apply swing to ridings, return winner indices and province vote share.
simulate_province_winners <- function(context, polling_results, prov_n, swing_method) {
  sim_poll <- simulate_province_poll(context$province, polling_results = polling_results, prov_n = prov_n)
  sim_poll <- sim_poll[context$active_parties]
  prov_swing <- if (swing_method == "Absolute") {
    sim_poll - context$base_elec
  } else if (swing_method == "Proportional") {
    logit(sim_poll) - logit(context$base_elec)
  } else {
    stop("Invalid swing method.", call. = FALSE)
  }

  vote_matrix <- context$base_vote_matrix
  adjusted_votes <- vote_matrix[, context$active_cols, drop = FALSE]

  if (swing_method == "Absolute") {
    adjusted_votes <- adjusted_votes + outer(context$elasticity, prov_swing)
  } else {
    adjusted_votes <- inv_logit(logit(adjusted_votes) + outer(context$elasticity, prov_swing))
  }

  adjusted_votes[adjusted_votes < 0] <- 0
  row_totals <- rowSums(adjusted_votes)
  row_totals[row_totals == 0] <- 1e-9
  adjusted_votes <- adjusted_votes / row_totals
  vote_matrix[, context$active_cols] <- adjusted_votes

  prov_share <- colMeans(vote_matrix, na.rm = TRUE)
  prov_share[is.na(prov_share)] <- 0
  if (sum(prov_share) > 0) prov_share <- prov_share / sum(prov_share)
  names(prov_share) <- PARTIES

  list(
    winners = max.col(vote_matrix, ties.method = "first"),
    vote_shares = prov_share
  )
}

determine_winners <- function(riding_df) {
  vote_matrix <- as.matrix(riding_df[, PARTIES, drop = FALSE])
  winner_index <- max.col(vote_matrix, ties.method = "first")
  riding_df$WINNER_SIM <- PARTIES[winner_index]
  riding_df
}

# Main entry: n_sims Monte Carlo runs, seat counts, riding win probs, majority/plurality probs.
run_seat_forecast_mc <- function(
  n_sims = 1000L,
  swing_method = "Proportional",
  base_riding_results,
  polling_results,
  prov_n,
  election_results,
  seed = 123L
) {
  set.seed(seed)

  prepared <- build_province_contexts(
    base_riding_results = base_riding_results,
    election_results = election_results
  )
  ordered_base <- prepared$ordered_base
  province_contexts <- prepared$contexts
  total_seats <- nrow(ordered_base)
  majority_threshold <- floor(total_seats / 2) + 1

  seat_counts <- matrix(0L, nrow = n_sims, ncol = length(PARTIES))
  colnames(seat_counts) <- PARTIES
  riding_win_counts <- matrix(0L, nrow = total_seats, ncol = length(PARTIES))
  colnames(riding_win_counts) <- PARTIES

  province_names <- names(province_contexts)
  national_vote_sims <- matrix(0, nrow = n_sims, ncol = length(PARTIES))
  colnames(national_vote_sims) <- PARTIES
  provincial_vote_sims <- setNames(
    lapply(province_names, function(.) matrix(0, nrow = n_sims, ncol = length(PARTIES))),
    province_names
  )
  for (pn in province_names) colnames(provincial_vote_sims[[pn]]) <- PARTIES

  for (i in seq_len(n_sims)) {
    seat_counts_i <- integer(length(PARTIES))
    national_weighted <- setNames(numeric(length(PARTIES)), PARTIES)

    for (prov in province_names) {
      context <- province_contexts[[prov]]
      out <- simulate_province_winners(
        context = context,
        polling_results = polling_results,
        prov_n = prov_n,
        swing_method = swing_method
      )
      winner_party_idx <- out$winners
      vote_shares <- out$vote_shares[PARTIES]
      vote_shares[is.na(vote_shares)] <- 0

      seat_counts_i <- seat_counts_i + tabulate(winner_party_idx, nbins = length(PARTIES))
      riding_win_counts[cbind(context$row_idx, winner_party_idx)] <-
        riding_win_counts[cbind(context$row_idx, winner_party_idx)] + 1L

      n_ridings <- length(context$row_idx)
      national_weighted <- national_weighted + vote_shares * n_ridings
      provincial_vote_sims[[prov]][i, ] <- vote_shares
    }

    seat_counts[i, ] <- seat_counts_i
    national_vote_sims[i, ] <- national_weighted / total_seats
  }

  seat_df <- tibble::as_tibble(seat_counts)

  plurality_winner <- apply(seat_counts, 1, function(x) {
    mx <- max(x)
    idx <- which(x == mx)
    if (length(idx) == 1) PARTIES[idx] else NA_character_
  })

  prob_majority <- sapply(PARTIES, function(party) mean(seat_df[[party]] >= majority_threshold))
  prob_plurality <- table(factor(plurality_winner, levels = PARTIES)) / n_sims

  seat_summary <- dplyr::summarise(
    seat_df,
    dplyr::across(
      dplyr::all_of(PARTIES),
      list(
        mean = ~ mean(.),
        median = ~ median(.),
        p05 = ~ as.numeric(stats::quantile(., 0.05)),
        p95 = ~ as.numeric(stats::quantile(., 0.95))
      ),
      .names = "{.col}_{.fn}"
    )
  )

  riding_win_probs <- dplyr::bind_cols(
    ordered_base[, c("PROVINCE", "FED_CODE", "FED_NAME", "WINNER"), drop = FALSE],
    tibble::as_tibble(riding_win_counts / n_sims)
  )

  projected_national_vote <- apply(national_vote_sims, 2, median)
  projected_provincial_vote <- lapply(provincial_vote_sims, function(m) apply(m, 2, median))

  list(
    seat_simulations = seat_df,
    seat_summary = seat_summary,
    prob_majority = prob_majority,
    prob_plurality = prob_plurality,
    majority_threshold = majority_threshold,
    riding_win_probs = riding_win_probs,
    projected_national_vote = projected_national_vote,
    projected_provincial_vote = projected_provincial_vote,
    province_names = province_names
  )
}
