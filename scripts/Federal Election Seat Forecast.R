rm(list = ls())

# See Methodology.md in project root for a detailed description of this script and its methodology.
# Run from project root: setwd("..") then source("scripts/Federal Election Seat Forecast.R")
# Or run from scripts/: source("Federal Election Seat Forecast.R") (and ensure Data/ is at ../Data/).

## Libraries ----

library(tidyverse)
library(openxlsx)
library(readxl)
library(writexl)
library(haven)
library(janitor)
library(MASS)
library(MCMCpack)
library(patchwork)
library(scales)


## Functions ----

source("Functions.R")

options(scipen = 999)
select <- dplyr::select


#### Inputs ----
## Polling results ----

# Simulated polling inputs for testing and model development (placeholder values)
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

rownames(polling_results) <- c("Liberal", "Conservative", "Bloc", "NDP", "Green", "Other")

# Convert Bloc results outside Quebec to NA
polling_results["Bloc", setdiff(colnames(polling_results), "Quebec")] <- NA

# Simulated provincial sample sizes for testing and model development (placeholder values)
prov_weights <- c(
  "British Columbia" = 0.139,
  Alberta = 0.111,
  Saskatchewan = 0.029,
  Manitoba = 0.035,
  Ontario = 0.386,
  Quebec = 0.230,
  "New Brunswick" = 0.022,
  "Nova Scotia" = 0.027,
  "Prince Edward Island" = 0.004,
  "Newfoundland and Labrador" = 0.014,
  Yukon = 0.001,
  "Northwest Territories" = 0.001,
  Nunavut = 0.001
)

# Sample size and design effect (placeholder values)
total_n <- 2000
deff <- 1.25

# Raw provincial sample sizes
prov_n_raw <- round(prov_weights * total_n)

# Effective sample sizes
prov_n <- round(prov_n_raw / deff)

rm(prov_weights, total_n, deff, prov_n_raw)


## Province-level 2025 federal election results ----

# Read 2025 federal election results by electoral district (path relative to project root)
election_results_raw <- read_csv("../Data/Canada 2025 Federal Election Results by Electoral District.csv", col_types = cols(.default = col_character())) %>%
  mutate(across(starts_with("VOTE"), ~ as.numeric(.)))

# Compute province-level election vote shares
election_results <- election_results_raw %>%
  mutate(across(starts_with("VOTE_COUNT"), ~ as.numeric(.))) %>%
  group_by(PROVINCE) %>%
  summarise(
    VOTE_COUNT_Liberal = sum(VOTE_COUNT_Liberal),
    VOTE_COUNT_Conservative = sum(VOTE_COUNT_Conservative),
    VOTE_COUNT_Bloc = sum(VOTE_COUNT_Bloc),
    VOTE_COUNT_NDP = sum(VOTE_COUNT_NDP),
    VOTE_COUNT_Green = sum(VOTE_COUNT_Green),
    VOTE_COUNT_Other = sum(VOTE_COUNT_Other),
    .groups = "drop"
  ) %>%
  rowwise() %>%
  mutate(
    total_votes = sum(VOTE_COUNT_Liberal, VOTE_COUNT_Conservative, VOTE_COUNT_Bloc, VOTE_COUNT_NDP, VOTE_COUNT_Green, VOTE_COUNT_Other),
    Liberal = VOTE_COUNT_Liberal / total_votes,
    Conservative = VOTE_COUNT_Conservative / total_votes,
    Bloc = VOTE_COUNT_Bloc / total_votes,
    NDP = VOTE_COUNT_NDP / total_votes,
    Green = VOTE_COUNT_Green / total_votes,
    Other = VOTE_COUNT_Other / total_votes
  ) %>%
  ungroup() %>%
  select(PROVINCE, Liberal, Conservative, Bloc, NDP, Green, Other) %>%
  t() %>%
  as.data.frame() %>%
  row_to_names(1) %>%
  mutate(across(everything(), as.numeric)) %>%
  select(`British Columbia`, Alberta, Saskatchewan, Manitoba, Ontario, Quebec, `New Brunswick`, `Nova Scotia`, `Prince Edward Island`, `Newfoundland and Labrador`,
         Yukon, `Northwest Territories`, Nunavut)

# Convert Bloc results outside Quebec to NA
election_results["Bloc", setdiff(colnames(election_results), "Quebec")] <- NA


## Riding-level baseline vote shares ----

riding_base <- election_results_raw %>%
  transmute(
    PROVINCE,
    FED_CODE = suppressWarnings(as.integer(FED_CODE)),
    FED_NAME,
    Liberal = VOTE_PCT_Liberal,
    Conservative = VOTE_PCT_Conservative,
    Bloc = VOTE_PCT_Bloc,
    NDP = VOTE_PCT_NDP,
    Green = VOTE_PCT_Green,
    Other = VOTE_PCT_Other,
    WINNER
  ) %>%
  arrange(PROVINCE, FED_CODE)

rm(election_results_raw)


#### Federal electoral seat forecast ----
## Monte Carlo seat forecast simulation ----

## Model configuration

# Set swing method choice
# Set to "Absolute" for additive swing and "Proportional" for multiplicative swing
swing_method <- "Proportional"

# Set the number of simulations
n_sims <- 1000

# Run the Monte Carlo simulation
mc_sim <- run_seat_forecast_mc(n_sims = n_sims, swing_method = swing_method, base_riding_results = riding_base)


# Seat summary table
parties <- c("Liberal", "Conservative", "Bloc", "NDP", "Green", "Other")

seat_summary <- mc_sim$seat_summary %>%
  pivot_longer(
    cols = everything(),
    names_to = c("Party", "Stat"),
    names_pattern = "^(.*)_(mean|median|p05|p95)$",
    values_to = "Seats"
  ) %>%
  pivot_wider(names_from = Stat, values_from = Seats) %>%
  mutate(across(c(mean, median, p05, p95), ~ round(., 1))) %>%
  arrange(factor(Party, levels = parties))

# Win probabilities table - majority (≥ half of seats) and plurality (most seats)
probs <- tibble(
  Party = parties,
  prob_majority = round(as.numeric(mc_sim$prob_majority[parties]), 3),
  prob_plurality = round(as.numeric(mc_sim$prob_plurality[parties]), 3)
)

rm(prov_n, n_sims)


#### Results summary ----
## Plot 1: 2025 Election vs projected seats ----

# 2025 election seat counts
election_2025_seats <-
  riding_base %>%
  count(WINNER, name = "2025 Election Seats") %>%
  right_join(tibble(Party = parties), by = c("WINNER" = "Party")) %>%
  transmute(Party = WINNER, `2025 Election Seats` = coalesce(`2025 Election Seats`, 0L))

# 2025 actual vs projected (mean from simulation) seat counts with net change
seat_summary_chart <- seat_summary %>%
  select(Party, mean) %>%
  mutate("Projected Seats" = round(mean, 0)) %>%
  left_join(election_2025_seats, by = "Party") %>%
  mutate("Net Change" = `Projected Seats` - `2025 Election Seats`) %>%
  select(Party, `2025 Election Seats`, `Projected Seats`, `Net Change`)

seat_summary_chart <- seat_summary_chart %>%
  pivot_longer(cols = c(`2025 Election Seats`, `Projected Seats`),
               names_to = "Period",
               values_to = "Seats") %>%
  mutate(Period = factor(Period, levels = c("2025 Election Seats", "Projected Seats")),
         Party = factor(Party, levels = parties))

party_colors <- c("Liberal" = "#D71821", "Conservative" = "#0F2E52", "Bloc" = "#3797F0",
                  "NDP" = "#E46F0B", "Green" = "#3E9B35", "Other" = "#676767")

ggplot(seat_summary_chart, aes(y = Party, x = Seats, fill = Party, alpha = Period)) +
  geom_col(position = position_dodge(width = 0.9), width = 0.8) +
  geom_text(aes(label = Seats), position = position_dodge(width = 0.9), size = 4, vjust = -0.6) +
  geom_text(data = seat_summary_chart,
            aes(y = Party, x = 195, label = ifelse(`Net Change` > 0, paste0("+", `Net Change`), `Net Change`)),
            inherit.aes = FALSE,
            hjust = -0.1,
            size = 4.5) +
  scale_fill_manual(values = party_colors) +
  scale_alpha_manual(values = c("Projected Seats" = 1, "2025 Election Seats" = 0.55)) +
  scale_x_continuous(limits = c(0, 200)) +
  coord_flip() +
  guides(fill = "none", alpha = "none") +
  labs(title = paste0("Federal Seat Count by Party (", swing_method, " Swing Model)"),
       subtitle = paste0("2025 Election vs Projected: Monte Carlo simulation (", nrow(mc_sim$seat_simulations), " runs)"),
       x = "Number of Seats", y = NULL,
       caption = "Note: Seat projections are based on XXX's most recent survey data, conducted between XXX and XXX.") +
  theme_minimal(base_size = 13) +
  theme(
    plot.title = element_text(hjust = 0.5, face = "bold"),
    plot.subtitle = element_text(hjust = 0.5, color = "grey30"),
    plot.caption = element_text(size = 10, vjust = -0.75, color = "grey30"),
    axis.text.x = element_text(color = "black"),
    panel.grid.major = element_blank(),
    panel.grid.minor = element_blank()
  )

rm(riding_base, election_2025_seats, seat_summary_chart)


## Plot 2: Full distribution of simulated seat counts ----

# Seat simulations
seat_sims <- mc_sim$seat_simulations %>%
  mutate(sim_id = row_number()) %>%
  pivot_longer(cols = all_of(parties), names_to = "Party", values_to = "Seats") %>%
  mutate(Party = factor(Party, levels = parties))

# Median seats per party
median_seats <- seat_sims %>%
  group_by(Party) %>%
  summarise(median_seats = as.integer(median(Seats)), .groups = "drop")

# Majority threshold
majority_threshold <- mc_sim$majority_threshold
threshold_label <- tibble(Party = factor(parties[1], levels = parties), x = majority_threshold, label = "Majority\nthreshold")

# Party summary statistics
party_summary_chart <- seat_sims %>%
  group_by(Party) %>%
  summarise(median_seats = as.integer(median(Seats)),
            p_majority   = mean(Seats >= majority_threshold),
            .groups = "drop")


# Plot

# Panel factory
make_panel <- function(party, i, n_total) {

  df <- filter(seat_sims, Party == party)
  stats <- filter(party_summary_chart, Party == party) |> slice(1)

  # Majority probability label
  p_maj_str <-
    if (stats$p_majority >= 0.99) {
      "P(majority) > 99%"
    } else if (stats$p_majority > 0.001) {
      paste0("P(majority) = ",
             percent(stats$p_majority, accuracy = 0.1))
    } else {
      NA_character_
    }

  show_majority_line <-
    stats$p_majority > 0.001 |
    stats$median_seats > majority_threshold * 0.5

  p <- ggplot(df, aes(Seats, after_stat(density) * 100, fill = Party)) +

    stat_density(geom = "area", alpha = 0.8, color = NA) +

    annotate("text", 2, Inf, label = party,
             hjust = 0, vjust = 1.5,
             fontface = "bold", size = 3.9, color = "black") +

    annotate("text", 248, Inf,
             label = paste("Median seats:", stats$median_seats),
             hjust = 1, vjust = 1.5,
             fontface = "bold", size = 3.5, color = "black") +

    scale_fill_manual(values = party_colors) +
    scale_x_continuous(limits = c(0, 250), breaks = seq(0, 250, 50), expand = c(0, 0)) +
    scale_y_continuous(limits = c(0, 5.5), expand = expansion(mult = c(0, .1))) +

    guides(fill = "none") +
    labs(x = if (i == n_total) "Seats forecasted" else NULL) +

    theme_minimal(base_size = 13) +
    theme(
      plot.margin = margin(1, 16, 1, 16),
      panel.border = element_rect(fill = NA, color = "grey88", linewidth = .4),
      axis.text.y  = element_blank(),
      axis.title.y = element_blank(),
      axis.ticks = element_blank(),
      axis.text.x = if (i == n_total) element_text(color = "grey40") else element_blank(),
      axis.title.x = element_text(size = 11),
      panel.grid = element_blank()
    )

  # Majority line
  if (show_majority_line) {
    p <- p + geom_vline(
      xintercept = majority_threshold, linetype = "dotted", linewidth  = 0.7, color = "grey50"
    )
  }

  # Majority label (first panel only)
  if (i == 1) {
    p <- p + annotate(
      "text", majority_threshold + 2, 5.35, label = paste0("Majority (", majority_threshold, " seats)"),
      hjust = 0, size  = 3, color = "grey50"
    )
  }

  # Majority probability text
  if (!is.na(p_maj_str)) {
    p <- p + annotate(
      "text", 2, Inf, label = p_maj_str, hjust = 0, vjust = 3.7, size  = 3, color = "grey35", fontface = "italic"
    )
  }

  # Majority shading
  if (stats$p_majority > 0.001) {
    p <- p + annotate(
      "rect", xmin = majority_threshold, xmax = 250, ymin = 0, ymax = Inf, fill = "grey50", alpha = 0.06
    )
  }

  p
}

# Build panels
panels <- Map(make_panel, party = parties, i = seq_along(parties), n_total = length(parties))

# Height map
height_map <- c(Liberal  = unit(4, "null"), Conservative = unit(4, "null"), Bloc = unit(2, "null"),
                NDP = unit(2, "null"), Green = unit(2, "cm"), Other = unit(2, "cm"))

# Assemble

inner <- wrap_plots(panels, ncol = 1, heights = height_map[parties])

(inner + plot_layout(widths = c(.03, 1))) +
  plot_annotation(
    title = "Simulated Federal Seat Distribution by Party",
    subtitle = paste0(
      swing_method, " swing model (", format(nrow(mc_sim$seat_simulations), big.mark = ","), " Monte Carlo simulations)"
    ),
    caption = "Note: Seat projections are based on XXX's most recent survey data, conducted between XXX and XXX.",
    theme = theme(
      plot.title = element_text(hjust = 0.5, face = "bold"),
      plot.subtitle = element_text(hjust = 0.5, color = "grey30", margin = margin(b = 10)),
      plot.caption = element_text(size = 10, vjust = -0.75, color = "grey30"),
    )
  )

rm(swing_method, parties, party_colors,
   seat_sims, median_seats, majority_threshold, threshold_label,
   party_summary_chart, panels, height_map, inner)
