/**
 * Shared UI constants for the Pollar app.
 * Centralizes party colors and seat counts so components stay in sync.
 */

import type { Party } from "./types";

/** Hex colors for each party (bars, map, table badges). */
export const PARTY_COLORS: Record<Party, string> = {
  Liberal: "#d73027",
  Conservative: "#1f3b73",
  Bloc: "#2f9fd9",
  NDP: "#ef7f1a",
  Green: "#3a9d4b",
  Other: "#767676",
};

/** Total federal seats (2025). Used for bar widths and majority line. */
export const TOTAL_SEATS = 343;
