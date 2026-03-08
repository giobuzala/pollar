# Federal Election Seat Forecast: Methodology Overview

The script `scripts/Federal Election Seat Forecast.R` (with helpers in `scripts/Functions.R`) implements a probabilistic seat projection model for a federal election using province-level polling data and riding-level 2025 election results.

## Model overview

The model operates as follows.

### 1) Simulate province-level polling vote shares using a Dirichlet distribution to reflect sampling uncertainty

Province-level polling vote shares are simulated using a Dirichlet distribution, with uncertainty driven by effective sample sizes.

Instead of treating observed provincial polling results as exact, the model assumes they are estimates subject to sampling error.

For each province, the observed vote-share vector (e.g., 34% Liberal, 31% Conservative, etc.) is treated as the mean of a probability distribution.

The spread (uncertainty) of the Dirichlet draw is controlled by the effective sample size (`n`):

```text
alpha = mean_vote_share * effective_sample_size
```

Larger effective sample sizes produce tighter distributions (less volatility). Smaller effective sample sizes produce wider distributions (more volatility).

Each Monte Carlo iteration draws a new province-level vote-share vector from this distribution, representing one plausible polling outcome under sampling uncertainty.

### 2) Convert each simulated draw into a swing vs baseline election results

Each simulated provincial draw is converted into a swing relative to baseline election results (either absolute vote-share change or proportional/logit swing).

After simulating a new province-level vote-share vector, the model does not apply those shares directly to ridings. Instead, it measures how much the simulated result differs from the province’s last election result. This difference is called the “swing.”

The baseline election results represent the actual historical vote shares in each province. The simulated poll represents a plausible current vote. Swing is simply the change between the two.

Two definitions are supported:

#### Absolute swing (additive change in vote share):

```text
swing = simulated_poll - baseline_election
```

Example: If Liberals were 30% in the last election and the simulated poll is 35%, the swing is +5 percentage points. This assumes vote share moves linearly.

#### Proportional (logit) swing:

```text
swing = logit(simulated_poll) - logit(baseline_election)
```

This measures change in log-odds rather than raw percentage points.

Using logit:

- Prevents large parties from unrealistically exceeding 100%
- Prevents small parties from going negative
- Models multiplicative change in vote odds rather than additive shifts

After applying proportional swing at the riding level, values are transformed back to normal vote shares using the inverse logit function.

In short, the simulated provincial poll is translated into a measurable shift from historical results, which can then be applied consistently across all ridings in that province.

### 3) Apply swing to ridings with an elasticity multiplier

Provincial swings are applied to individual ridings. Swing magnitude is scaled by a competitiveness-based elasticity multiplier so that closer ridings respond more strongly than safe seats.

Once a province-level swing is calculated, it must be translated into riding-level vote changes. Rather than assuming every riding shifts equally, the model adjusts swing intensity using an elasticity factor based on how competitive each riding was in the baseline election.

**Step 1: Measure competitiveness**

For each riding, compute the margin between the top two parties in the last election. Smaller margins indicate closer (more competitive) ridings.

**Step 2: Assign elasticity multiplier**

Very close ridings (e.g., margin <5%) receive a multiplier greater than 1, meaning swing is amplified.
Moderately competitive ridings receive a multiplier around 1, meaning swing is applied normally.
Safe ridings (large margins) receive a multiplier less than 1, meaning swing is dampened.

Conceptually:

```text
updated_vote = baseline_vote + (elasticity * provincial_swing)

# or the logit equivalent for proportional swing
```

This approach reflects the reality that close ridings tend to flip more easily when public opinion shifts, while safe ridings are more resistant to change. The elasticity layer introduces structural realism by allowing the same provincial swing to have different impacts depending on local context.

### 4) Renormalize and determine winners

Updated riding vote shares are renormalized, and simulated winners are determined.

After provincial swing (scaled by elasticity) is applied to each riding, the resulting vote shares may no longer sum exactly to 1. In some cases, small negative values can also occur due to additive adjustments.

To ensure mathematically valid vote distributions:

- Any negative vote shares are floored at 0
- Each riding’s party vote shares are divided by their row total so that they sum exactly to 1

This renormalization step ensures the simulated results remain a proper probability distribution for each riding.

Once normalized, the model determines the simulated winner in each riding by selecting the party with the highest vote share.

This produces one simulated winning party per riding for that Monte Carlo iteration, which can then be aggregated into total seat counts by party.

## Outputs

The full process is repeated across many Monte Carlo iterations to produce a distribution of seat outcomes.

The simulation is repeated thousands of times. Each iteration represents one plausible election outcome under polling uncertainty.

Outputs include:

- Mean and median projected seat counts
- 5th and 95th percentile simulation intervals
- Probability of majority government
- Probability of plurality (largest seat count)
- Optional riding-level win probabilities

The goal of the framework is to generate a distribution of plausible electoral outcomes under polling uncertainty rather than a single deterministic forecast.

