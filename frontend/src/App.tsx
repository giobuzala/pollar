/**
 * Pollar — Canadian federal election seat projection from polling data.
 * Main app: loads API metadata, manages poll inputs and forecast state,
 * and renders current distribution, seat projection, vote-share table, and riding map/table.
 */
import { useEffect, useMemo, useState } from "react";
import { CurrentSeatDistribution } from "./components/CurrentSeatDistribution";
import { PollInputForm } from "./components/PollInputForm";
import { ProjectionMap } from "./components/ProjectionMap";
import { RidingProjectionTable } from "./components/RidingProjectionTable";
import { SeatSummary } from "./components/SeatSummary";
import { fetchMeta, runNationalForecast, runProvincialForecast } from "./lib/api";
import type { ForecastResponse, MetaResponse, Mode, Party } from "./types";
import "./App.css";

/** 2025 federal election seat counts (fallback when API does not return baseline_seats). Total 343. */
const FALLBACK_BASELINE_SEATS: Record<Party, number> = {
  Liberal: 169,
  Conservative: 144,
  Bloc: 22,
  NDP: 7,
  Green: 1,
  Other: 0,
};

/** Default: 2025 federal election actual results (Elected/Share). Other = PPC + Independent + Christian Heritage + rounding. */
function buildDefaultPartyVector(): Record<Party, number> {
  return {
    Liberal: 0.438,
    Conservative: 0.413,
    Bloc: 0.063,
    NDP: 0.063,
    Green: 0.012,
    Other: 0.011,
  };
}

/** 2025 actual provincial vote share (rounded to 1 decimal place as %). Bloc = 0 outside Quebec. */
const DEFAULT_PROVINCIAL_2025: Record<string, Record<Party, number>> = {
  "British Columbia": { Liberal: 0.418, Conservative: 0.412, Bloc: 0, NDP: 0.13, Green: 0.03, Other: 0.01 },
  Alberta: { Liberal: 0.279, Conservative: 0.636, Bloc: 0, NDP: 0.063, Green: 0.004, Other: 0.018 },
  Saskatchewan: { Liberal: 0.266, Conservative: 0.646, Bloc: 0, NDP: 0.075, Green: 0.005, Other: 0.008 },
  Manitoba: { Liberal: 0.407, Conservative: 0.464, Bloc: 0, NDP: 0.11, Green: 0.007, Other: 0.012 },
  Ontario: { Liberal: 0.492, Conservative: 0.438, Bloc: 0, NDP: 0.048, Green: 0.011, Other: 0.011 },
  Quebec: { Liberal: 0.426, Conservative: 0.233, Bloc: 0.277, NDP: 0.045, Green: 0.009, Other: 0.01 },
  "New Brunswick": { Liberal: 0.536, Conservative: 0.407, Bloc: 0, NDP: 0.029, Green: 0.017, Other: 0.011 },
  "Nova Scotia": { Liberal: 0.574, Conservative: 0.353, Bloc: 0, NDP: 0.051, Green: 0.009, Other: 0.013 },
  "Prince Edward Island": { Liberal: 0.576, Conservative: 0.369, Bloc: 0, NDP: 0.024, Green: 0.022, Other: 0.009 },
  "Newfoundland and Labrador": { Liberal: 0.541, Conservative: 0.397, Bloc: 0, NDP: 0.055, Green: 0.001, Other: 0.006 },
  Yukon: { Liberal: 0.531, Conservative: 0.385, Bloc: 0, NDP: 0.063, Green: 0.021, Other: 0 },
  "Northwest Territories": { Liberal: 0.535, Conservative: 0.333, Bloc: 0, NDP: 0.122, Green: 0.01, Other: 0 },
  Nunavut: { Liberal: 0.367, Conservative: 0.26, Bloc: 0, NDP: 0.373, Green: 0, Other: 0 },
};

function buildDefaultProvincial(provinces: string[]): Record<string, Record<Party, number>> {
  const out: Record<string, Record<Party, number>> = {};
  for (const province of provinces) {
    out[province] = DEFAULT_PROVINCIAL_2025[province] ?? { ...buildDefaultPartyVector(), Bloc: province !== "Quebec" ? 0 : 0.063 };
    if (province !== "Quebec") out[province].Bloc = 0;
  }
  return out;
}

function App() {
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [mode, setMode] = useState<Mode>("national");
  const [nationalPoll, setNationalPoll] = useState<Record<Party, number>>(buildDefaultPartyVector);
  const [provincialPolls, setProvincialPolls] = useState<Record<string, Record<Party, number>>>({});
  const [nSims, setNSims] = useState(250);
  const [totalN, setTotalN] = useState(2000);
  const [swingMethod, setSwingMethod] = useState<"Absolute" | "Proportional">("Proportional");
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [ridingView, setRidingView] = useState<"map" | "table">("map");

  useEffect(() => {
    async function loadMeta() {
      try {
        const response = await fetchMeta();
        setMeta(response);
        setProvincialPolls(buildDefaultProvincial(response.provinces));
      } catch (err) {
        setError((err as Error).message);
      }
    }
    void loadMeta();
  }, []);

  const provinces = meta?.provinces ?? [];

  const voteShareTable = useMemo(() => {
    if (!forecast?.projected_vote_shares) return null;
    return forecast.projected_vote_shares;
  }, [forecast]);

  async function handleRunForecast() {
    try {
      setIsLoading(true);
      setError(null);
      if (mode === "national") {
        const response = await runNationalForecast({
          national_poll: nationalPoll,
          n_sims: nSims,
          swing_method: swingMethod,
          total_n: totalN,
        });
        setForecast(response);
      } else {
        const response = await runProvincialForecast({
          polls: provincialPolls,
          n_sims: nSims,
          swing_method: swingMethod,
          total_n: totalN,
        });
        setForecast(response);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  if (!meta) {
    if (error) {
      return (
        <main className="layout loading">
          <p className="errorBox">Could not load app. {error}</p>
          <p className="subtle">Make sure the API is running on port 8000 (e.g. <code>Rscript run_api.R</code> in the backend folder).</p>
        </main>
      );
    }
    return <main className="layout loading">Loading app metadata...</main>;
  }

  return (
    <main className="layout">
      <header className="hero">
        <h1>pollar</h1>
        <p>
          Cold numbers, clear projections. Enter national or provincial polling data to project federal seat outcomes across Canadian ridings.
        </p>
      </header>

      <PollInputForm
          mode={mode}
          onModeChange={setMode}
          provinces={provinces}
          nationalPoll={nationalPoll}
          provincialPolls={provincialPolls}
          nSims={nSims}
          swingMethod={swingMethod}
          totalN={totalN}
          onNationalChange={(party, value) => setNationalPoll((prev) => ({ ...prev, [party]: value }))}
          onProvincialChange={(province, party, value) =>
            setProvincialPolls((prev) => ({
              ...prev,
              [province]: {
                ...prev[province],
                [party]: value,
              },
            }))
          }
          onNSimsChange={setNSims}
          onSwingMethodChange={setSwingMethod}
          onTotalNChange={setTotalN}
          onSubmit={handleRunForecast}
          isLoading={isLoading}
        />

      {meta ? (
        <div className="resultsGrid">
          <CurrentSeatDistribution
            baselineSeats={meta.baseline_seats ?? FALLBACK_BASELINE_SEATS}
            majorityThreshold={meta.majority_threshold}
          />
          <SeatSummary forecast={forecast} />
        </div>
      ) : null}

      {error ? <div className="errorBox">{error}</div> : null}

      {voteShareTable ? (
        <section className="panel">
          <h2>Projected Popular Vote</h2>
          <p className="subtle">
            Median popular vote share by party from the simulation.
          </p>
          <div className="provinceTableWrap">
            <table className="provinceTable">
              <thead>
                <tr>
                  <th>Party</th>
                  <th className="colNational">National</th>
                  {provinces.map((province) => (
                    <th key={province}>{province}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {voteShareTable.map((row) => (
                  <tr key={String(row.party)}>
                    <td>{String(row.party)}</td>
                    <td className="colNational">
                      {typeof row.National === "number" ? `${((row.National as number) * 100).toFixed(1)}%` : "-"}
                    </td>
                    {provinces.map((province) => (
                      <td key={`${row.party}-${province}`}>
                        {typeof row[province] === "number" ? `${((row[province] as number) * 100).toFixed(1)}%` : "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {forecast ? (
        <section className="panel">
          <h2>Riding Projection</h2>
          <div className="modeToggle" role="tablist" aria-label="Riding view">
            <button
              type="button"
              role="tab"
              aria-selected={ridingView === "map"}
              className={ridingView === "map" ? "active" : ""}
              onClick={() => setRidingView("map")}
            >
              Map
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ridingView === "table"}
              className={ridingView === "table" ? "active" : ""}
              onClick={() => setRidingView("table")}
            >
              Table
            </button>
          </div>
          {ridingView === "map" ? (
            <div key="map" role="tabpanel">
              <ProjectionMap ridingData={forecast.riding_win_probabilities} embedded />
            </div>
          ) : (
            <div key="table" role="tabpanel">
              <RidingProjectionTable ridingData={forecast.riding_win_probabilities} />
            </div>
          )}
        </section>
      ) : null}

      <section id="methodology" className="panel methodologySection">
        <button
          type="button"
          className="methodologyToggle"
          onClick={() => setMethodologyOpen((o) => !o)}
          aria-expanded={methodologyOpen}
        >
          <span className="methodologyToggleTitle">Methodology</span>
          <span className="methodologyToggleIcon" aria-hidden>{methodologyOpen ? "▼" : "▶"}</span>
        </button>
        {methodologyOpen ? (
          <div className="methodologyContent">
          <p>
            Pollar projects federal seat outcomes from polling data using a <strong>Monte Carlo simulation</strong> with riding-level swing. The baseline is the <strong>2025 federal election</strong>: actual vote shares by electoral district and by province.
          </p>
          <p>
            <strong>Input.</strong> You can enter either a single <strong>national poll</strong> (vote shares by party) or <strong>provincial polls</strong> for each province. In national mode, the app converts the national poll into province-level estimates by applying the national swing (poll minus 2025 national result) to each province’s 2025 result, then normalizing. The Bloc Québécois is included only in Quebec; outside Quebec it is set to zero and other shares are rescaled.
          </p>
          <p>
            <strong>Poll uncertainty.</strong> The model treats the input poll(s) as uncertain. For each province, it draws simulated vote shares from a <strong>Dirichlet distribution</strong> whose mean is your entered shares and whose concentration comes from an effective sample size (default total <em>n</em> = 2,000, allocated by province population weight, with a design effect of 1.25). So each simulation uses a slightly different “poll” consistent with sampling error.
          </p>
          <p>
            <strong>Swing and elasticity.</strong> In each simulation, for each province, the difference between the simulated provincial poll and the 2025 provincial result is computed as a “swing.” You can choose <strong>Absolute</strong> swing (raw difference in vote share) or <strong>Proportional</strong> (logit-space difference). That swing is applied to every riding in the province using a riding-level <strong>elasticity</strong>: ridings with closer races (smaller margin between first and second place) respond more to swing (elasticity up to 1.30), and safe seats respond less (down to 0.70). This avoids uniform swing and lets marginal seats move more.
          </p>
          <p>
            <strong>Seat outcomes.</strong> For each ride, the party with the highest simulated vote share wins that seat in that run. After many runs (e.g. 250–1,000), the app reports seat-count summaries (mean, median, 5th and 95th percentiles), the probability each party wins a majority or plurality, and per-riding win probabilities. The “Projected popular vote” table shows the <strong>median</strong> simulated vote share (national and by province) across runs.
          </p>
          <p>
            <strong>Data.</strong> Riding-level baseline data comes from the 2025 federal election results by electoral district. All projections are conditional on that baseline and on the polling and parameters you supply; they are not predictions of future elections.
          </p>
          </div>
        ) : null}
      </section>

      <footer className="footerNote">
        <span>Created by <strong>Giorgi Buzaladze</strong></span>
        <span className="footerLinks">
          <a href="https://giobuzala.com/" target="_blank" rel="noopener noreferrer">Website</a>
          <span className="footerSep"> · </span>
          <a href="https://github.com/" target="_blank" rel="noopener noreferrer">GitHub</a>
          <span className="footerSep"> · </span>
          <a href="https://www.linkedin.com/in/giorgibuzaladze/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </span>
      </footer>
    </main>
  );
}

export default App;
