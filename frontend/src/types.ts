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
};

export type ForecastResponse = {
  seat_summary: SeatSummaryRow[];
  probabilities: Probabilities;
  majority_threshold: number;
  riding_win_probabilities: RidingWinProbability[];
  derived_provincial_polling?: Array<Record<string, number | string>>;
};

export type MetaResponse = {
  parties: Party[];
  provinces: string[];
  majority_threshold: number;
  /** 2025 actual provincial vote shares; used as default when present */
  default_provincial_polls?: Record<string, Record<Party, number>>;
};
