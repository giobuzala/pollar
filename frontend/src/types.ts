/**
 * Shared TypeScript types for the pollar frontend.
 * Aligns with backend party names and API response shapes.
 */
export type Party = "Liberal" | "Conservative" | "Bloc" | "NDP" | "Green" | "Other";

export type Mode = "national" | "provincial";

export const PARTIES: Party[] = [
  "Liberal",
  "Conservative",
  "Bloc",
  "NDP",
  "Green",
  "Other",
];

export type Probabilities = {
  majority: Record<Party, number>;
  plurality: Record<Party, number>;
};

export type SeatSummaryRow = {
  party: Party;
  mean: number;
  median: number;
  p05: number;
  p95: number;
};

export type RidingWinProbability = {
  PROVINCE: string;
  FED_CODE: number;
  FED_NAME: string;
  Liberal: number;
  Conservative: number;
  Bloc: number;
  NDP: number;
  Green: number;
  Other: number;
  projected_winner: Party;
  winner_probability: number;
  /** Current holder (2025 election winner). */
  incumbent?: Party;
};

export type ForecastResponse = {
  seat_summary: SeatSummaryRow[];
  probabilities: Probabilities;
  majority_threshold: number;
  riding_win_probabilities: RidingWinProbability[];
  /** Simulation-based median popular vote share by party (National + provinces) */
  projected_vote_shares?: Array<Record<string, number | string>>;
};

export type MetaResponse = {
  parties: Party[];
  provinces: string[];
  majority_threshold: number;
  /** 2025 actual provincial vote shares; used as default when present */
  default_provincial_polls?: Record<string, Record<Party, number>>;
  /** 2025 election seat count by party; for Current Seat Distribution chart */
  baseline_seats?: Record<Party, number>;
};
