# This script provides reusable helper functions used by the federal election
# seat forecast workflow. Each function is documented with a purpose (why it
# exists), parameters, return value, and inline comments for key steps.

#### Math helper functions ----
## logit() ----

#' **Logit transform with numerical clipping**
#'
#' @description
#' **Purpose:** Converts vote shares or probabilities from the (0, 1) scale to
#' log-odds (unbounded), so that swings can be applied additively without
#' violating bounds. Used by the proportional (logit) swing method.
#'
#' Converts a probability/proportion \(p\) in (0, 1) to log-odds. Inputs are
#' clipped to \([eps, 1-eps]\) to avoid \(\pm\infty\) when \(p\) is 0 or 1.
#'
#' @param p Numeric vector of probabilities/proportions.
#' @param eps Small positive value used for clipping. Defaults to 1e-6.
#'
#' @return Numeric vector of log-odds.
#'
#' @examples
#' # logit(c(0.2, 0.5, 0.8))

logit <- function(p, eps = 1e-6) {
  # Clip to (eps, 1-eps) so log(p/(1-p)) is finite
  p <- pmin(pmax(p, eps), 1 - eps)
  log(p / (1 - p))
}


## inv_logit() ----

#' **Inverse logit (logistic) transform**
#'
#' @description
#' **Purpose:** Converts log-odds back to vote shares or probabilities in (0, 1).
#' Used after applying a proportional (logit) swing so that riding-level shares
#' remain valid proportions.
#'
#' Converts log-odds back to a probability/proportion in (0, 1).
#'
#' @param x Numeric vector of log-odds.
#'
#' @return Numeric vector of probabilities.
#'
#' @examples
#' # inv_logit(c(-2, 0, 2))

inv_logit <- function(x) {
  # Standard logistic: 1 / (1 + exp(-x))
  1 / (1 + exp(-x))
}


#### Province poll simulation ----
## simulate_province_poll() ----

#' **Simulate a province-level poll via a Dirichlet draw**
#'
#' @description
#' **Purpose:** Generates one plausible province-level vote-share vector for a
#' single province/territory under sampling uncertainty. The observed provincial
#' poll is treated as the mean; spread is controlled by effective sample size.
#' Used once per province per Monte Carlo iteration to drive the swing model.
#'
#' Produces one simulated vote-share vector for a single province/territory,
#' centered on the supplied province-level polling mean. Dirichlet concentration
#' is mean * effective_n (larger n = tighter distribution).
#'
#' @param prov Province/territory name. Must match a column name in `polling_results`
#'   and a name in `prov_n`.
#' @param polling_results A party-by-province matrix/data frame of vote shares.
#' @param prov_n Named numeric/integer vector of effective sample sizes by
#'   province/territory.
#'
#' @return A named numeric vector of simulated province vote shares. Parties with
#'   NA means in `polling_results[, prov]` are dropped (e.g., Bloc outside Quebec).
#'
#' @examples
#' # sim_on <- simulate_province_poll("Ontario", polling_results, prov_n)

simulate_province_poll <- function(prov, polling_results, prov_n) {
  # Extract this province's observed vote-share vector (polling mean)
  mean_vec <- polling_results[, prov]

  # Ensure party names are carried through. For data frames, extracting a single
  # column does not automatically keep rownames as `names(mean_vec)`
  if (is.null(names(mean_vec)) && !is.null(rownames(polling_results))) {
    names(mean_vec) <- rownames(polling_results)
  }

  # Drop parties with NA in the province (e.g., Bloc outside Quebec)
  mean_vec <- mean_vec[!is.na(mean_vec)]

  # Effective sample size controls uncertainty: larger n -> tighter draw
  n_val <- prov_n[prov]
  if (is.na(n_val)) {
    stop(paste("Missing effective sample size for province:", prov))
  }

  # Dirichlet shape: alpha = mean * n; replace non-positive for numerical safety
  alpha <- mean_vec * n_val
  alpha[alpha <= 0] <- 1e-6

  # One Dirichlet draw; return as named vector
  sim_draw <- as.numeric(rdirichlet(1, alpha))
  names(sim_draw) <- names(mean_vec)

  return(sim_draw)
}


#### Swing and riding-level logic functions ----
## compute_prov_swing() ----

#' **Compute a simulated province-level swing versus baseline election**
#'
#' @description
#' **Purpose:** For one province, draws a simulated poll (under sampling error)
#' and turns it into a "swing" vector: the change from that province's baseline
#' (last election) to the simulated poll. This swing is later applied to every
#' riding in the province.
#'
#' Absolute = additive on vote share
#' Proportional = additive on log-odds (then converted back to shares when applied to ridings)
#'
#' Generates a simulated province poll and converts it into a swing vector
#' relative to the province's baseline election result.
#'
#' @param prov Province/territory name. Must match a column in `polling_results`
#'   and `election_results`, and be present in `prov_n`.
#' @param swing_method Character string specifying the swing definition:
#'   - `"Absolute"`: swing is computed on the vote share scale:
#'     \(\Delta = p_{poll} - p_{base}\)
#'   - `"Proportional"`: swing is computed as a logit difference (log-odds swing):
#'     \(\Delta = logit(p_{poll}) - logit(p_{base})\)
#'
#' @return A named numeric vector of swing values for the parties common to both
#'   the simulated poll and baseline election vectors.
#'
#' @section Required objects in the environment:
#' - `polling_results`, `prov_n`, `election_results` must exist in the calling
#'   environment (typically created earlier in your forecasting script).
#'
#' @examples
#' # swing_on <- compute_prov_swing("Ontario", swing_method = "Absolute")

compute_prov_swing <- function(prov, swing_method = "Absolute") {
  # One plausible province-level poll under sampling uncertainty
  sim_poll <- simulate_province_poll(prov, polling_results, prov_n)

  # Baseline: actual vote shares in this province at last election
  base_elec <- setNames(
    election_results[, prov],
    rownames(election_results)
  )
  base_elec <- base_elec[!is.na(base_elec)]

  # Restrict to parties present in both (e.g., no Bloc outside Quebec in base)
  common_parties <- intersect(names(sim_poll), names(base_elec))
  sim_poll <- sim_poll[common_parties]
  base_elec <- base_elec[common_parties]

  # Swing = difference between simulated poll and baseline (vote share or log-odds)
  if (swing_method == "Absolute") {
    swing <- sim_poll - base_elec
  } else if (swing_method == "Proportional") {
    swing <- logit(sim_poll) - logit(base_elec)
  } else {
    stop("Invalid swing method.")
  }

  return(swing)
}


## compute_elasticity() ----

#' **Compute riding-level elasticity multipliers from baseline margins**
#'
#' @description
#' **Purpose:** Assigns a multiplier that scales how strongly the provincial
#' swing is applied in each riding. Close races (small top-two margin) get
#' elasticity > 1 (swing amplified); safe seats get elasticity < 1 (swing
#' dampened). This reflects the idea that competitive ridings flip more easily
#' when opinion shifts.
#'
#' Creates a simple heuristic elasticity multiplier based on how competitive a
#' riding is at baseline (smaller top-two margins imply larger swing response).
#'
#' @param vote_matrix Numeric matrix of baseline vote shares for each riding
#'   (rows = ridings, columns = parties). Each row should sum to ~1. Values should
#'   be in [0, 1].
#'
#' @return Numeric vector of elasticity multipliers (length equals number of
#'   ridings/rows in `vote_matrix`).
#'
#' @details
#' - For each riding, we compute the margin between the top two parties.
#' - Elasticity is then assigned by thresholding that margin:
#'   - margin < 0.05  -> 1.30
#'   - margin < 0.10  -> 1.15
#'   - margin < 0.20  -> 1.00
#'   - margin < 0.30  -> 0.85
#'   - otherwise      -> 0.70
#'
#' @examples
#' # e <- compute_elasticity(as.matrix(riding_base[, c("Liberal","Conservative","NDP")]))

compute_elasticity <- function(vote_matrix) {
  if (is.null(dim(vote_matrix)) || nrow(vote_matrix) < 1 || ncol(vote_matrix) < 2) {
    stop("compute_elasticity() requires a matrix with >= 1 row and >= 2 party columns.")
  }

  # Per riding: sort vote shares descending to get 1st and 2nd place
  sorted_votes <- t(apply(vote_matrix, 1, sort, decreasing = TRUE))
  margin <- sorted_votes[, 1] - sorted_votes[, 2]

  # Map margin to elasticity: tighter races -> higher multiplier
  elasticity <- ifelse(
    margin < 0.05, 1.30,
    ifelse(
      margin < 0.10, 1.15,
      ifelse(
        margin < 0.20, 1.00,
        ifelse(margin < 0.30, 0.85, 0.70)
      )
    )
  )

  return(elasticity)
}


## apply_swing_to_ridings() ----

#' **Apply a simulated provincial swing to riding-level vote shares**
#'
#' @description
#' **Purpose:** For one province, gets the simulated provincial swing, then
#' applies it to every riding in that province. Swing is scaled by each riding's
#' elasticity (close races move more). Resulting vote shares are floored at 0
#' and renormalized to sum to 1 per riding so they remain valid distributions.
#'
#' Updates baseline riding vote shares by applying a province-level swing vector
#' (absolute share swing or logit swing), scaled by riding elasticity.
#'
#' @param prov Province/territory name (must match values in `base_riding_results$PROVINCE`).
#' @param swing_method Either `"Absolute"` or `"Proportional"`; see
#'   `compute_prov_swing()` for definitions.
#' @param base_riding_results Data frame of baseline riding-level vote shares: must
#'   contain `PROVINCE` and party vote-share columns matching the parties
#'   returned by `compute_prov_swing(prov, ...)`.
#'
#' @return A data frame containing only the ridings in `prov`, with party vote
#'   shares updated and renormalized to sum to 1 per riding.
#'
#' @details
#' - **Absolute swing**: \(p' = p + elasticity \times \Delta\)
#' - **Proportional swing**: \(logit(p') = logit(p) + elasticity \times \Delta\),
#'   then transform back with `inv_logit()`.
#' - After updating, negative shares are floored at 0 and each riding is
#'   renormalized to sum to 1 (a small epsilon is used to avoid division by 0).
#'
#' @examples
#' # ridings_on_sim <- apply_swing_to_ridings("Ontario", swing_method = "Absolute")

apply_swing_to_ridings <- function(prov, swing_method = "Absolute", base_riding_results) {
  # One simulated province-level swing (poll vs baseline) for this province
  prov_swing <- compute_prov_swing(prov, swing_method)

  # Subset to ridings in this province; extract party vote-share matrix
  ridings_prov <- base_riding_results[base_riding_results$PROVINCE == prov, , drop = FALSE]
  party_cols <- names(prov_swing)
  vote_matrix <- as.matrix(ridings_prov[, party_cols, drop = FALSE])

  # Per-riding multiplier: close races respond more to swing
  elasticity <- compute_elasticity(vote_matrix)

  # Apply swing: elasticity scales the provincial swing for each riding
  if (swing_method == "Absolute") {
    swing_matrix <- outer(elasticity, prov_swing)
    vote_matrix <- vote_matrix + swing_matrix
  } else if (swing_method == "Proportional") {
    vote_matrix_logit <- logit(vote_matrix)
    swing_matrix <- outer(elasticity, prov_swing)
    vote_matrix_logit <- vote_matrix_logit + swing_matrix
    vote_matrix <- inv_logit(vote_matrix_logit)
  } else {
    stop("Invalid swing method.")
  }

  # Ensure valid distributions: no negatives, sum to 1 per riding
  vote_matrix[vote_matrix < 0] <- 0
  row_totals <- rowSums(vote_matrix)
  row_totals[row_totals == 0] <- 1e-9
  vote_matrix <- vote_matrix / row_totals

  ridings_prov[, party_cols] <- vote_matrix

  return(ridings_prov)
}


#### Outcome function ----
## determine_winners() ----

#' **Determine simulated riding winners from vote shares**
#'
#' @description
#' **Purpose:** For one simulated election (one set of swung vote shares per
#' riding), assigns the winning party in each riding as the party with the
#' highest vote share. Used each Monte Carlo iteration to turn vote shares into
#' seat counts.
#'
#' Assigns a simulated winning party to each riding by selecting the party with
#' the highest vote share.
#'
#' @param riding_df A data frame containing party vote-share columns.
#'
#' @return The input data frame with an added `WINNER_SIM` column.
#'
#' @details
#' - Ties are resolved deterministically using `max.col(..., ties.method = "first")`,
#'   which selects the first party among tied maxima in the `party_cols` order.
#'
#' @examples
#' # out <- determine_winners(ridings_on_sim)

determine_winners <- function(riding_df) {
  party_cols <- c("Liberal", "Conservative", "Bloc", "NDP", "Green", "Other")

  # Which party has the max share in each row (riding); ties -> first in order
  vote_matrix <- as.matrix(riding_df[, party_cols, drop = FALSE])
  winner_index <- max.col(vote_matrix, ties.method = "first")

  riding_df$WINNER_SIM <- party_cols[winner_index]

  return(riding_df)
}


#### Orchestrator function ----
## run_seat_forecast_mc() ----

#' **Run a Monte Carlo seat forecast simulation**
#'
#' @description
#' **Purpose:** Top-level entry point for the probabilistic seat forecast. Runs
#' many independent simulations of an election: each iteration draws province-level
#' polls (under sampling error), converts them to swings vs baseline, applies
#' swing to all ridings (with elasticity), determines winners, and aggregates
#' seats. Returns distributions of seat counts and win probabilities.
#'
#' Simulates election outcomes by repeatedly:
#' - drawing province-level vote shares from a Dirichlet distribution (using
#'   `polling_results` and effective sample sizes `prov_n`),
#' - converting each draw into a province-level swing vs baseline election results
#'   (`election_results`),
#' - applying that swing to each riding in the province (`base_riding_results`),
#' - determining simulated riding winners, and
#' - aggregating seats by party.
#'
#' @param n_sims Integer number of Monte Carlo iterations to run.
#' @param swing_method Either `"Absolute"` or `"Proportional"`; passed through to
#'   `apply_swing_to_ridings()` / `compute_prov_swing()`.
#' @param base_riding_results Data frame of baseline riding-level vote shares: must
#'   contain `PROVINCE`, `FED_CODE`, `FED_NAME`, and party vote-share columns.
#'   Can be any object name in your script (e.g., you pass your baseline data here).
#'
#' @return A list with:
#' - `seat_simulations`: tibble with one row per simulation and party seat counts
#' - `seat_summary`: tibble with mean/median/p05/p95 of seats by party
#' - `prob_majority`: named numeric vector of majority probabilities by party
#' - `prob_plurality`: named numeric vector of plurality probabilities by party
#' - `majority_threshold`: integer majority threshold used
#' - `riding_win_probs`: tibble of riding-level win probabilities by party
#'
#' @section Required objects in the environment:
#' - `polling_results`, `prov_n`, `election_results` (used indirectly through the
#'   swing/simulation helpers)
#'
#' @examples
#' # mc <- run_seat_forecast_mc(n_sims = 2000, swing_method = "Absolute", base_riding_results = riding_base)

run_seat_forecast_mc <- function(n_sims = 5000, swing_method = "Absolute", base_riding_results) {
  # Set up
  set.seed(123)

  parties <- c("Liberal", "Conservative", "Bloc", "NDP", "Green", "Other")
  provinces <- sort(unique(base_riding_results$PROVINCE))

  total_seats <- nrow(base_riding_results)
  majority_threshold <- floor(total_seats / 2) + 1

  # Storage: one row per simulation, one column per party seat count
  seat_counts <- matrix(0L, nrow = n_sims, ncol = length(parties))
  colnames(seat_counts) <- parties

  # Count how often each riding was won by each party (for win probs)
  riding_win_counts <- matrix(0L, nrow = total_seats, ncol = length(parties))
  colnames(riding_win_counts) <- parties

  for (i in seq_len(n_sims)) {
    # For each province: get swing, apply to ridings, then bind all provinces
    ridings_sim <- bind_rows(lapply(provinces, function(p) {
      apply_swing_to_ridings(p, swing_method = swing_method, base_riding_results = base_riding_results)
    }))
    ridings_sim <- ridings_sim[order(ridings_sim$PROVINCE, ridings_sim$FED_CODE), , drop = FALSE]

    # Who wins each riding in this simulation?
    ridings_sim <- determine_winners(ridings_sim)

    # Aggregate seats by party for this iteration
    seat_counts[i, ] <- tabulate(match(ridings_sim$WINNER_SIM, parties), nbins = length(parties))

    winner_party_idx <- match(ridings_sim$WINNER_SIM, parties)
    riding_win_counts[cbind(seq_len(total_seats), winner_party_idx)] <-
      riding_win_counts[cbind(seq_len(total_seats), winner_party_idx)] + 1L
  }

  seat_df <- as_tibble(seat_counts)

  # Plurality = party with most seats (exclude ties for probability)
  plurality_winner <- apply(seat_counts, 1, function(x) {
    mx <- max(x)
    idx <- which(x == mx)
    if (length(idx) == 1) parties[idx] else NA_character_
  })

  prob_majority <- sapply(parties, function(p) mean(seat_df[[p]] >= majority_threshold))
  prob_plurality <- table(factor(plurality_winner, levels = parties)) / n_sims

  # Summary stats: mean, median, 5th and 95th percentiles by party
  seat_summary <- summarise(
    seat_df,
    across(
      all_of(parties),
      list(
        mean = ~ mean(.),
        median = ~ median(.),
        p05 = ~ as.numeric(quantile(., 0.05)),
        p95 = ~ as.numeric(quantile(., 0.95))
      ),
      .names = "{.col}_{.fn}"
    )
  )

  riding_win_probs <- bind_cols(
    base_riding_results[, c("PROVINCE", "FED_CODE", "FED_NAME"), drop = FALSE],
    as_tibble(riding_win_counts / n_sims)
  )

  list(
    seat_simulations = seat_df,
    seat_summary = seat_summary,
    prob_majority = prob_majority,
    prob_plurality = prob_plurality,
    majority_threshold = majority_threshold,
    riding_win_probs = riding_win_probs
  )
}
