import { useEffect, useMemo, useState } from "react";
import { PollInputForm } from "./components/PollInputForm";
import { ProjectionMap } from "./components/ProjectionMap";
import { SeatSummary } from "./components/SeatSummary";
import { fetchMeta, runNationalForecast, runProvincialForecast } from "./lib/api";
import type { ForecastResponse, MetaResponse, Mode, Party } from "./types";
import "./App.css";

function buildDefaultPartyVector(): Record<Party, number> {
  return {
    Liberal: 0.44,
    Conservative: 0.36,
    Bloc: 0.07,
    NDP: 0.08,
    Green: 0.03,
    Other: 0.02,
  };
}

function buildDefaultProvincial(provinces: string[]): Record<string, Record<Party, number>> {
  const national = buildDefaultPartyVector();
  const out: Record<string, Record<Party, number>> = {};

  for (const province of provinces) {
    const row = { ...national };
    if (province !== "Quebec") row.Bloc = 0;
    out[province] = row;
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
        <h1>Pollar</h1>
        <p>
          Enter national or provincial polling data to project federal seat outcomes across Canadian ridings.
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
