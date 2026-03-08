import { PARTIES, type ForecastResponse, type Party } from "../types";

const PARTY_COLORS: Record<Party, string> = {
  Liberal: "#d73027",
  Conservative: "#1f3b73",
  Bloc: "#2f9fd9",
  NDP: "#ef7f1a",
  Green: "#3a9d4b",
  Other: "#767676",
};

type SeatSummaryProps = {
  forecast: ForecastResponse | null;
};

export function SeatSummary({ forecast }: SeatSummaryProps) {
  if (!forecast) {
    return (
      <section className="panel">
        <h2>Seat Projection</h2>
        <p>Run a forecast to see seat outcomes and probabilities.</p>
      </section>
    );
  }

  const totalSeats = 343;

  // Display medians that sum to totalSeats: round normally, then adjust the party closest to rounding the other way
  const rows = PARTIES.map((party) => {
    const row = forecast.seat_summary.find((entry) => entry.party === party);
    return row ? { party, row } : null;
  }).filter(Boolean) as { party: Party; row: { party: Party; mean: number; median: number; p05: number; p95: number } }[];

  const rounded = rows.map(({ row }) => Math.round(row.median));
  const sum = rounded.reduce((a, b) => a + b, 0);
  let displayMedians = rounded.slice();
  if (sum !== totalSeats && rows.length > 0) {
    if (sum < totalSeats) {
      const need = totalSeats - sum;
      const byFrac = rows
        .map(({ row }, i) => ({ i, frac: row.median - Math.floor(row.median) }))
        .sort((a, b) => b.frac - a.frac);
      for (let k = 0; k < need; k++) displayMedians[byFrac[k % byFrac.length].i]++;
    } else {
      const need = sum - totalSeats;
      const byFrac = rows
        .map(({ row }, i) => ({ i, frac: Math.ceil(row.median) - row.median }))
        .sort((a, b) => b.frac - a.frac);
      for (let k = 0; k < need; k++) displayMedians[byFrac[k % byFrac.length].i]--;
    }
  }
  const medianByParty = Object.fromEntries(PARTIES.map((p, i) => [p, displayMedians[i] ?? Math.round(rows[i]?.row.median ?? 0)]));

  return (
    <section className="panel">
      <h2>Seat Projection</h2>
      <p className="subtle">Majority threshold: {forecast.majority_threshold} seats</p>

      <div className="seatBars">
        {PARTIES.map((party, index) => {
          const row = forecast.seat_summary.find((entry) => entry.party === party);
          if (!row) return null;

          const width = `${(row.median / totalSeats) * 100}%`;
          const majorityChance = Math.round((forecast.probabilities.majority[party] ?? 0) * 100);
          const pluralityChance = Math.round((forecast.probabilities.plurality[party] ?? 0) * 100);
          const isFirst = index === 0;
          const majorityPosition = `${(forecast.majority_threshold / totalSeats) * 100}%`;
          const displayMedian = medianByParty[party] ?? Math.round(row.median);

          return (
            <div key={party} className="seatRow">
              <div className="seatRowHeader">
                <strong>{party}</strong>
                <span>
                  Median: {displayMedian} | Range: {row.p05.toFixed(0)}-{row.p95.toFixed(0)}
                </span>
              </div>
              <div className="barTrack">
                <div className="barFill" style={{ width, background: PARTY_COLORS[party] }} />
                <div
                  className={`majorityLine ${row.median >= forecast.majority_threshold ? "majorityLineOverBar" : ""}`}
                  style={{ left: majorityPosition }}
                  aria-hidden
                />
              </div>
              <div className="probabilities">
                <span
                  title={`Proportion of simulations in which this party won at least half the seats (≥${forecast.majority_threshold} seats)`}
                >
                  {isFirst ? `Probability of majority: ${majorityChance}%` : `${majorityChance}%`}
                </span>
                <span
                  title="Proportion of simulations in which this party won more seats than any other party"
                >
                  {isFirst ? `Probability of plurality: ${pluralityChance}%` : `${pluralityChance}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
