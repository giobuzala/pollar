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

  const maxMean = Math.max(...forecast.seat_summary.map((item) => item.mean));

  return (
    <section className="panel">
      <h2>Seat Projection</h2>
      <p className="subtle">Majority threshold: {forecast.majority_threshold} seats</p>

      <div className="seatBars">
        {PARTIES.map((party) => {
          const row = forecast.seat_summary.find((entry) => entry.party === party);
          if (!row) return null;

          const width = `${(row.mean / maxMean) * 100}%`;
          const majorityChance = Math.round((forecast.probabilities.majority[party] ?? 0) * 100);
          const pluralityChance = Math.round((forecast.probabilities.plurality[party] ?? 0) * 100);

          return (
            <div key={party} className="seatRow">
              <div className="seatRowHeader">
                <strong>{party}</strong>
                <span>
                  Mean {row.mean.toFixed(1)} | Range {row.p05.toFixed(0)}-{row.p95.toFixed(0)}
                </span>
              </div>
              <div className="barTrack">
                <div className="barFill" style={{ width, background: PARTY_COLORS[party] }} />
              </div>
              <div className="probabilities">
                <span>Majority: {majorityChance}%</span>
                <span>Most seats: {pluralityChance}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
