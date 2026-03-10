import { useState } from "react";
import { PARTIES, type Mode, type Party } from "../types";

type PollInputFormProps = {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  provinces: string[];
  nationalPoll: Record<Party, number>;
  provincialPolls: Record<string, Record<Party, number>>;
  nSims: number;
  swingMethod: "Absolute" | "Proportional";
  totalN: number;
  onNationalChange: (party: Party, value: number) => void;
  onProvincialChange: (province: string, party: Party, value: number) => void;
  onNSimsChange: (value: number) => void;
  onSwingMethodChange: (value: "Absolute" | "Proportional") => void;
  onTotalNChange: (value: number) => void;
  onSubmit: () => void;
  isLoading: boolean;
};

/* Accept sum as 100% if within 0.05% (avoids float rounding issues). */
const TOTAL_TOLERANCE = 0.0005;

/** Format vote share for input: show whole or one decimal (e.g., "13" or "12.5") for easier typing. */
function formatPercentForInput(value: number): string {
  const n = Math.round(value * 1000) / 10;
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}

function sumPartyVector(v: Record<Party, number>): number {
  return PARTIES.reduce((s, p) => s + (v[p] ?? 0), 0);
}

function totalIsValid(sum: number): boolean {
  return Math.abs(sum - 1) <= TOTAL_TOLERANCE;
}

function ParamInfoButton() {
  const [show, setShow] = useState(false);
  return (
    <div
      className="paramInfoWrap"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <button type="button" className="paramInfoButton">
        ?
      </button>
      {show ? (
        <div className="paramInfoTooltip" role="tooltip">
          <p><strong>Simulations</strong>: How many times the forecast runs. Higher values give more reliable results but take longer to compute.</p>
          <p><strong>Swing method</strong>: How to apply poll-to-election swing. <strong className="paramInfoWhite">Proportional</strong> scales swing relative to each party's starting strength, so extreme values move less. <strong className="paramInfoWhite">Absolute</strong> shifts every party by the same raw percentage points.</p>
          <p><strong>Total sample size</strong>: Estimated poll size. Higher values reduce uncertainty in the projected outcomes.</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Form for polling inputs: national or provincial vote shares, simulation count,
 * swing method, and sample size. Validates that totals are 100% before allowing Run Forecast.
 */
export function PollInputForm(props: PollInputFormProps) {
  const nationalTotal = sumPartyVector(props.nationalPoll);
  const nationalValid = totalIsValid(nationalTotal);
  const provincialTotals = props.provinces.map((prov) => sumPartyVector(props.provincialPolls[prov] ?? {}));
  const provincialValid = provincialTotals.every((s) => totalIsValid(s));
  const totalsValid = props.mode === "national" ? nationalValid : provincialValid;

  return (
    <section className="panel">
      <header className="panelHeader">
        <h2>Polling Inputs</h2>
        <p>Enter vote shares as percentages, then run a simulation-based forecast.</p>
        <p>Use <strong>National Results</strong> if you only have a single national poll. Switch to <strong>Provincial Results</strong> if you have per-province data for a more accurate seat projection.</p>
      </header>

      <div className="modeToggle">
        <button
          className={props.mode === "national" ? "active" : ""}
          type="button"
          onClick={() => props.onModeChange("national")}
        >
          National Results
        </button>
        <button
          className={props.mode === "provincial" ? "active" : ""}
          type="button"
          onClick={() => props.onModeChange("provincial")}
        >
          Provincial Results
        </button>
      </div>

      {props.mode === "national" ? (
        <>
          <div className="pollingSection">
            <h3 className="pollingSectionTitle">Enter your national poll results</h3>
            <div className="nationalPollRow">
              {PARTIES.map((party) => (
                <label key={party} className="field">
                  <span>{party}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={formatPercentForInput(props.nationalPoll[party])}
                    onChange={(event) => props.onNationalChange(party, Number(event.target.value) / 100)}
                  />
                </label>
              ))}
              <div className="field totalCol">
                <span>Total</span>
                <input
                  type="text"
                  readOnly
                  className={`totalValueInput ${nationalValid ? "" : "totalInvalid"}`}
                  value={`${(nationalTotal * 100).toFixed(1)}%`}
                  aria-label="Total percentage"
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="pollingSection">
          <h3 className="pollingSectionTitle">Enter your provincial poll results</h3>
          <div className="provinceTableWrap">
            <table className="provinceTable">
            <thead>
              <tr>
                <th>Province/Territory</th>
                {PARTIES.map((party) => (
                  <th key={party}>{party}</th>
                ))}
                <th className="totalHeader">Total</th>
              </tr>
            </thead>
            <tbody>
              {props.provinces.map((province, rowIdx) => {
                const rowTotal = provincialTotals[rowIdx];
                const rowValid = totalIsValid(rowTotal);
                return (
                  <tr key={province}>
                    <td>{province}</td>
                    {PARTIES.map((party) => {
                      const isBlocOutsideQuebec = party === "Bloc" && province !== "Quebec";
                      return (
                        <td key={`${province}-${party}`}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            disabled={isBlocOutsideQuebec}
                            title={isBlocOutsideQuebec ? "Bloc runs only in Quebec" : undefined}
                            value={
                              isBlocOutsideQuebec
                                ? ""
                                : formatPercentForInput(props.provincialPolls[province]?.[party] ?? 0)
                            }
                            onChange={(event) =>
                              props.onProvincialChange(province, party, Number(event.target.value) / 100)
                            }
                          />
                        </td>
                      );
                    })}
                    <td className={`totalCell ${rowValid ? "" : "totalInvalid"}`}>
                      {(rowTotal * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="settingsRow">
        <label className="field compact">
          <span>Simulations</span>
          <input
            type="number"
            min={1}
            value={props.nSims}
            onChange={(event) => props.onNSimsChange(Number(event.target.value))}
          />
        </label>

        <label className="field compact">
          <span>Swing method</span>
          <select
            value={props.swingMethod}
            onChange={(event) => props.onSwingMethodChange(event.target.value as "Absolute" | "Proportional")}
          >
            <option value="Proportional">Proportional</option>
            <option value="Absolute">Absolute</option>
          </select>
        </label>

        <label className="field compact">
          <span>Total sample size</span>
          <input
            type="number"
            min={1}
            value={props.totalN}
            onChange={(event) => props.onTotalNChange(Number(event.target.value))}
          />
        </label>
        <ParamInfoButton />
      </div>

      {!totalsValid ? (
        <p className="totalWarning" role="alert">
          Polling results must total 100% before running a forecast. Adjust the percentages so the <strong>Total</strong> column shows 100.0%.
        </p>
      ) : null}

      <button
        className="primaryButton"
        type="button"
        onClick={props.onSubmit}
        disabled={props.isLoading || !totalsValid}
      >
        {props.isLoading ? "Running forecast..." : "Run Forecast"}
      </button>
    </section>
  );
}
