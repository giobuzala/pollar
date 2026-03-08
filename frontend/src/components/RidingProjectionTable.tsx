import { useMemo, useRef, useState } from "react";
import type { Party, RidingWinProbability } from "../types";
import { PARTIES } from "../types";

/** Province order (matches backend DEFAULT_PROV_WEIGHTS). */
const PROVINCE_ORDER = [
  "British Columbia",
  "Alberta",
  "Saskatchewan",
  "Manitoba",
  "Ontario",
  "Quebec",
  "New Brunswick",
  "Nova Scotia",
  "Prince Edward Island",
  "Newfoundland and Labrador",
  "Yukon",
  "Northwest Territories",
  "Nunavut",
];

const PARTY_COLORS: Record<Party, string> = {
  Liberal: "#d73027",
  Conservative: "#1f3b73",
  Bloc: "#2f9fd9",
  NDP: "#ef7f1a",
  Green: "#3a9d4b",
  Other: "#767676",
};

type RidingProjectionTableProps = {
  ridingData: RidingWinProbability[];
};

/** Normalize API value to a number (handles scalar, string, or single-element array). */
function toNumber(value: unknown): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  if (Array.isArray(value) && value.length > 0) return toNumber(value[0]);
  return NaN;
}

function pct(value: unknown): string {
  const n = toNumber(value);
  return Number.isNaN(n) ? "—" : `${Math.round(n * 100)}%`;
}

/** Get party chance from a row; API may use exact party name or different key. */
function getPartyChance(row: Record<string, unknown>, party: string): unknown {
  const v = row[party];
  if (v !== undefined && v !== null) return v;
  const lower = party.toLowerCase();
  const key = Object.keys(row).find((k) => k.toLowerCase() === lower);
  return key != null ? row[key] : undefined;
}

function provinceOrderIndex(province: string): number {
  const i = PROVINCE_ORDER.indexOf(province);
  return i >= 0 ? i : PROVINCE_ORDER.length;
}

function MultiSelectFilter<T extends string>({
  options,
  selected,
  onChange,
  placeholder,
  ariaLabel,
  optionOrder,
}: {
  options: T[];
  selected: T[];
  onChange: (value: T[]) => void;
  placeholder: string;
  ariaLabel: string;
  optionOrder?: T[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = optionOrder ? optionOrder.filter((o) => options.includes(o)) : options;
  const label = selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  function toggle(opt: T) {
    onChange(selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt]);
  }

  return (
    <div className="ridingMultiSelect" ref={ref}>
      <button
        type="button"
        className="ridingTableFilter ridingMultiSelectTrigger"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {label}
        <span className="ridingMultiSelectChevron" aria-hidden>▼</span>
      </button>
      {open && (
        <>
          <div className="ridingMultiSelectBackdrop" aria-hidden onClick={() => setOpen(false)} />
          <div className="ridingMultiSelectDropdown" role="listbox">
            {list.map((opt) => (
              <label key={opt} className="ridingMultiSelectOption">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="ridingMultiSelectCheckbox"
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function RidingProjectionTable({ ridingData }: RidingProjectionTableProps) {
  const [filterProvinces, setFilterProvinces] = useState<string[]>([]);
  const [filterRiding, setFilterRiding] = useState("");
  const [filterWinners, setFilterWinners] = useState<string[]>([]);
  const [filterIncumbents, setFilterIncumbents] = useState<string[]>([]);

  const incumbents = useMemo(() => {
    const set = new Set<string>();
    for (const r of ridingData) {
      const inc = (r as { incumbent?: Party; WINNER?: Party }).incumbent ?? (r as { WINNER?: Party }).WINNER;
      if (inc != null && String(inc).trim() !== "") set.add(String(inc));
    }
    return PARTIES.filter((p) => set.has(p)).concat([...set].filter((p) => !PARTIES.includes(p)).sort());
  }, [ridingData]);

  const sortedAndFiltered = useMemo(() => {
    let rows = [...ridingData];
    rows.sort((a, b) => {
      const pa = provinceOrderIndex(String(a.PROVINCE ?? ""));
      const pb = provinceOrderIndex(String(b.PROVINCE ?? ""));
      if (pa !== pb) return pa - pb;
      return String(a.FED_NAME ?? "").localeCompare(String(b.FED_NAME ?? ""));
    });
    if (filterProvinces.length > 0) rows = rows.filter((r) => filterProvinces.includes(r.PROVINCE));
    if (filterRiding.trim()) {
      const q = filterRiding.trim().toLowerCase();
      rows = rows.filter((r) => String(r.FED_NAME ?? "").toLowerCase().includes(q));
    }
    if (filterWinners.length > 0) rows = rows.filter((r) => filterWinners.includes(String(r.projected_winner ?? "")));
    if (filterIncumbents.length > 0) {
      rows = rows.filter((r) => {
        const inc = (r as { incumbent?: Party; WINNER?: Party }).incumbent ?? (r as { WINNER?: Party }).WINNER;
        return inc != null && filterIncumbents.includes(String(inc));
      });
    }
    return rows;
  }, [ridingData, filterProvinces, filterRiding, filterWinners, filterIncumbents]);

  const provinces = useMemo(() => {
    const set = new Set(ridingData.map((r) => r.PROVINCE));
    return PROVINCE_ORDER.filter((p) => set.has(p)).concat([...set].filter((p) => !PROVINCE_ORDER.includes(p)).sort());
  }, [ridingData]);

  return (
    <div className="ridingTableWrap">
      <table className="ridingTable">
        <thead>
          <tr>
            <th>Province</th>
            <th>Riding</th>
            <th>Incumbent</th>
            <th>Projected winner</th>
            <th
              colSpan={PARTIES.length}
              className="ridingTablePartyHeader"
              title="Proportion of simulations in which that party won the riding, shown as a percentage"
            >
              Chance of winning (%)
            </th>
          </tr>
          <tr>
            <th className="ridingTableFilterCell">
              <MultiSelectFilter
                options={provinces}
                selected={filterProvinces}
                onChange={setFilterProvinces}
                placeholder="All provinces"
                ariaLabel="Filter by province"
                optionOrder={PROVINCE_ORDER}
              />
            </th>
            <th className="ridingTableFilterCell">
              <input
                type="text"
                aria-label="Filter by riding name"
                placeholder="Riding..."
                value={filterRiding}
                onChange={(e) => setFilterRiding(e.target.value)}
                className="ridingTableFilter"
              />
            </th>
            <th className="ridingTableFilterCell">
              <MultiSelectFilter
                options={incumbents}
                selected={filterIncumbents}
                onChange={setFilterIncumbents}
                placeholder="All parties"
                ariaLabel="Filter by incumbent"
                optionOrder={PARTIES}
              />
            </th>
            <th className="ridingTableFilterCell">
              <MultiSelectFilter
                options={PARTIES}
                selected={filterWinners}
                onChange={setFilterWinners}
                placeholder="All parties"
                ariaLabel="Filter by projected winner"
                optionOrder={PARTIES}
              />
            </th>
            {PARTIES.map((party) => (
              <th key={party} className="ridingTableNum">
                {party}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedAndFiltered.map((r) => {
            const incumbent = (r as { incumbent?: Party; WINNER?: Party }).incumbent ?? (r as { WINNER?: Party }).WINNER;
            const projWinner = r.projected_winner;
            const incumbentColor = incumbent != null && incumbent in PARTY_COLORS ? PARTY_COLORS[incumbent as Party] : undefined;
            const projColor = projWinner != null && projWinner in PARTY_COLORS ? PARTY_COLORS[projWinner as Party] : undefined;
            return (
              <tr key={typeof r.FED_CODE !== "undefined" ? r.FED_CODE : String(r.FED_NAME)}>
                <td>{r.PROVINCE ?? "—"}</td>
                <td>{String(r.FED_NAME ?? "—").replace(/—/g, "–")}</td>
                <td>
                  {incumbent != null ? (
                    <span
                      className="ridingTableWinner"
                      style={incumbentColor ? { backgroundColor: incumbentColor } : undefined}
                    >
                      {incumbent}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span
                    className="ridingTableWinner"
                    style={projColor ? { backgroundColor: projColor } : undefined}
                  >
                    {projWinner != null ? String(projWinner) : "—"}
                  </span>
                </td>
                {PARTIES.map((party) => (
                  <td key={party} className="ridingTableNum ridingTablePartyCell">
                    {pct(getPartyChance(r as Record<string, unknown>, party))}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
