import { PARTY_COLORS, TOTAL_SEATS } from "../constants";
import { PARTIES, type Party } from "../types";

type CurrentSeatDistributionProps = {
  baselineSeats: Record<Party, number>;
  majorityThreshold: number;
};

/**
 * Shows the current (2025 election) seat distribution by party as horizontal
 * bars, with a majority threshold line. Used alongside the projected seat summary.
 */
export function CurrentSeatDistribution({ baselineSeats, majorityThreshold }: CurrentSeatDistributionProps) {
  const majorityPosition = `${(majorityThreshold / TOTAL_SEATS) * 100}%`;

  return (
    <section className="panel currentSeatDistribution">
      <h2>Current Seat Distribution</h2>
      <p className="subtle">Majority threshold: {majorityThreshold} seats</p>

      <div className="seatBars">
        {PARTIES.map((party) => {
          const seats = baselineSeats[party] ?? 0;
          const width = `${(seats / TOTAL_SEATS) * 100}%`;

          return (
            <div key={party} className="seatRow">
              <div className="seatRowHeader">
                <strong>{party}</strong>
                <span>{seats} {seats === 1 ? "seat" : "seats"}</span>
              </div>
              <div className="barTrack">
                <div className="barFill" style={{ width, background: PARTY_COLORS[party] }} />
                <div
                  className={`majorityLine ${seats >= majorityThreshold ? "majorityLineOverBar" : ""}`}
                  style={{ left: majorityPosition }}
                  aria-hidden
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
