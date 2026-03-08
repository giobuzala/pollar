import { useEffect, useMemo, useState } from "react";
import { PollInputForm } from "./components/PollInputForm";
import { ProjectionMap } from "./components/ProjectionMap";
import { SeatSummary } from "./components/SeatSummary";
import { fetchMeta, runNationalForecast, runProvincialForecast } from "./lib/api";
import type { ForecastResponse, MetaResponse, Mode, Party } from "./types";
import "./App.css";

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

  const derivedProvTable = useMemo(() => {
    if (!forecast?.derived_provincial_polling) return null;
    return forecast.derived_provincial_polling;
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

      <div className="contentGrid">
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

        <SeatSummary forecast={forecast} />
      </div>

      {error ? <div className="errorBox">{error}</div> : null}

      {derivedProvTable ? (
        <section className="panel">
          <h2>Derived Provincial Polling</h2>
          <p className="subtle">
            National-only inputs are converted into provincial estimates before simulation.
          </p>
          <div className="provinceTableWrap">
            <table className="provinceTable">
              <thead>
                <tr>
                  <th>Party</th>
                  {provinces.map((province) => (
                    <th key={province}>{province}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {derivedProvTable.map((row) => (
                  <tr key={String(row.party)}>
                    <td>{String(row.party)}</td>
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

      {forecast ? <ProjectionMap ridingData={forecast.riding_win_probabilities} /> : null}
      <footer className="footerNote">Pollar — Canadian federal election projection powered by Monte Carlo simulation.</footer>
    </main>
  );
}

export default App;
