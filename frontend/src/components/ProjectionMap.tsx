import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { geoConicConformal, geoPath } from "d3-geo";
import proj4 from "proj4";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { PARTY_COLORS } from "../constants";
import type { Party, RidingWinProbability } from "../types";
import { PARTIES } from "../types";

/* Canadian Lambert Conformal Conic (EPSG:3978) and WGS84 for GeoJSON. */
proj4.defs(
  "EPSG:3978",
  "+proj=lcc +lat_0=49 +lon_0=-95 +lat_1=49 +lat_2=77 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs"
);
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

/**
 * Converts GeoJSON coordinates from EPSG:3978 (Canadian LCC) to WGS84 if needed.
 * Detects 3978 by checking if first coordinate is outside lat/lon bounds.
 */
function geoJsonToWGS84(geojson: FeatureCollection<Geometry>): FeatureCollection<Geometry> {
  const first = geojson.features[0]?.geometry;
  if (!first || first.type !== "Polygon" && first.type !== "MultiPolygon") return geojson;
  const coords = first.type === "Polygon" ? first.coordinates[0] : first.coordinates[0][0];
  const [x, y] = coords[0] as [number, number];
  const is3978 = Math.abs(x) > 180 || Math.abs(y) > 90;
  if (!is3978) return geojson;

  function transformCoord(c: number[]): [number, number] {
    const [lng, lat] = proj4("EPSG:3978", "EPSG:4326", [c[0], c[1]]);
    return [lng, lat];
  }
  function transformRing(ring: number[][]): number[][] {
    return ring.map((c) => transformCoord(c));
  }
  function transformPolygon(coords: number[][][]): number[][][] {
    return coords.map(transformRing);
  }
  function transformMultiPolygon(coords: number[][][][]): number[][][][] {
    return coords.map(transformPolygon);
  }

  return {
    ...geojson,
    features: geojson.features.map((f) => {
      if (!f.geometry) return f;
      const g = f.geometry;
      if (g.type === "Polygon") {
        return { ...f, geometry: { ...g, coordinates: transformPolygon(g.coordinates) } };
      }
      if (g.type === "MultiPolygon") {
        return { ...f, geometry: { ...g, coordinates: transformMultiPolygon(g.coordinates) } };
      }
      return f;
    }),
  };
}

type ProjectionMapProps = {
  ridingData: RidingWinProbability[];
  /** When true, do not render section/h2 (used inside Riding Projection wrapper). */
  embedded?: boolean;
};

function normalizeCode(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) return Number(value);
  return null;
}

function formatRidingName(name: string): string {
  return name.replace(/—/g, "–");
}

/** Normalize for search: lowercase, strip diacritics, collapse punctuation and spaces. Safe for undefined. */
function normalizeForSearch(s: string | undefined): string {
  const str = typeof s === "string" ? s : "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['.'\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ridingSearchScore(queryWords: string[], riding: RidingWinProbability): number {
  const nameNorm = normalizeForSearch(getRidingName(riding));
  const provinceNorm = normalizeForSearch(getRidingProvince(riding));
  const searchable = `${nameNorm} ${provinceNorm}`;
  const fullQuery = queryWords.join(" ");
  let score = 0;
  if (searchable.includes(fullQuery)) score += 100;
  const nameStart = nameNorm.slice(0, 20);
  for (const w of queryWords) {
    if (nameNorm.includes(w)) score += 10;
    if (nameStart.includes(w)) score += 5;
  }
  return score;
}


const WIDTH = 1000;
const HEIGHT = 650;
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const FOCUS_MAX_SCALE = 24;

/** Get a string from a riding row; API may use FED_NAME or fed_name etc. */
function getRidingName(r: RidingWinProbability | Record<string, unknown>): string {
  const row = r as Record<string, unknown>;
  const v = row.FED_NAME ?? row.fed_name ?? row.FedName ?? "";
  return typeof v === "string" ? v : String(v ?? "");
}

/** Get province string from a riding row. */
function getRidingProvince(r: RidingWinProbability | Record<string, unknown>): string {
  const row = r as Record<string, unknown>;
  const v = row.PROVINCE ?? row.province ?? row.Province ?? "";
  return typeof v === "string" ? v : String(v ?? "");
}

export function ProjectionMap({ ridingData, embedded = false }: ProjectionMapProps) {
  const data = useMemo(() => {
    if (Array.isArray(ridingData)) return ridingData;
    if (ridingData && typeof ridingData === "object" && !Array.isArray(ridingData)) return Object.values(ridingData);
    return [];
  }, [ridingData]);
  const [geojson, setGeojson] = useState<FeatureCollection<Geometry> | null>(null);
  const [outline, setOutline] = useState<FeatureCollection<Geometry> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tooltipRiding, setTooltipRiding] = useState<RidingWinProbability | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [pinnedRiding, setPinnedRiding] = useState<RidingWinProbability | null>(null);
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const [ridingSearch, setRidingSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const DRAG_THRESHOLD = 5;
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    capturing: boolean;
  } | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (sectionRef.current && !sectionRef.current.contains(e.target as Node)) setPinnedRiding(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoadError(null);
    async function loadMap() {
      setIsLoading(true);
      try {
        const districtRes = await fetch("/data/federal-districts-2025.geojson");
        if (!districtRes.ok) {
          throw new Error(
            `Map data not found (${districtRes.status}). Add federal-districts-2025.geojson to public/data. See public/data/README.md.`
          );
        }
        const districts = (await districtRes.json()) as FeatureCollection<Geometry>;
        if (!isMounted) return;
        if (!districts?.features?.length) {
          throw new Error("Map file is empty or invalid.");
        }
        setGeojson(geoJsonToWGS84(districts));
        try {
          const outlineRes = await fetch("/data/canada-outline.geojson");
          if (outlineRes.ok) {
            const canadaOutline = (await outlineRes.json()) as FeatureCollection<Geometry>;
            if (isMounted && canadaOutline?.features?.length) setOutline(geoJsonToWGS84(canadaOutline));
            else if (isMounted) setOutline(null);
          } else if (isMounted) setOutline(null);
        } catch {
          if (isMounted) setOutline(null);
        }
      } catch (error) {
        if (isMounted) setLoadError(error instanceof Error ? error.message : "Failed to load map data.");
        console.error("Failed to load riding geometry:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadMap();
    return () => {
      isMounted = false;
    };
  }, []);

  const ridingByCode = useMemo(() => {
    const lookup = new Map<number, RidingWinProbability>();
    for (const item of data) {
      const code = typeof item.FED_CODE === "number" ? item.FED_CODE : Number(item.FED_CODE);
      if (!Number.isNaN(code)) lookup.set(code, item);
    }
    return lookup;
  }, [data]);

  const ridingSearchResults = useMemo(() => {
    const q = ridingSearch.trim();
    if (q.length < 2) return [];
    const normalizedQuery = normalizeForSearch(q);
    const queryWords = normalizedQuery.split(/\s+/).filter((w) => w.length > 0);
    if (queryWords.length === 0) return [];
    return data
      .filter((r) => {
        const namePart = normalizeForSearch(getRidingName(r));
        const provPart = normalizeForSearch(getRidingProvince(r));
        const searchable = `${namePart} ${provPart}`;
        return queryWords.every((w) => searchable.includes(w));
      })
      .sort((a, b) => ridingSearchScore(queryWords, b) - ridingSearchScore(queryWords, a))
      .slice(0, 12);
  }, [data, ridingSearch]);

  const pathGenerator = useMemo(() => {
    const fitTo = outline ?? geojson;
    if (!fitTo) return null;
    const projection = geoConicConformal()
      .parallels([49, 77])
      .rotate([95, 0])
      .center([0, 62])
      .fitSize([WIDTH, HEIGHT], fitTo);
    return geoPath(projection);
  }, [outline, geojson]);

  const pathData = useMemo(() => {
    if (!geojson || !pathGenerator) return [];
    return geojson.features.flatMap((feature: Feature<Geometry>, index: number) => {
      const props = feature.properties as { FED_NUM?: unknown; FED_NAME?: string } | undefined;
      const fedCode = normalizeCode(props?.FED_NUM);
      let riding = fedCode != null ? ridingByCode.get(fedCode) : undefined;
      if (!riding && props?.FED_NAME) {
        const nameKey = normalizeForSearch(String(props.FED_NAME));
        riding = data.find((r) => normalizeForSearch(getRidingName(r)) === nameKey) ?? undefined;
      }
      const fill = riding && riding.projected_winner in PARTY_COLORS
        ? PARTY_COLORS[riding.projected_winner as Party]
        : "#d4e6f2";
      const path = pathGenerator(feature);
      if (!path) return [];
      return [{ key: `${fedCode ?? "missing"}-${index}`, path, fill, riding: riding ?? null, feature }];
    });
  }, [geojson, pathGenerator, ridingByCode, data]);

  const outlinePath = useMemo(() => {
    const source = outline ?? geojson;
    if (!source || !pathGenerator) return null;
    return source.features
      .map((f) => pathGenerator(f))
      .filter((p): p is string => Boolean(p))
      .join(" ");
  }, [outline, geojson, pathGenerator]);

  const handleWheelRef = useRef((e: WheelEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const anchorX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const anchorY = ((e.clientY - rect.top) / rect.height) * HEIGHT;
    const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
    setViewport((prev) => {
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: anchorX - (anchorX - prev.x) * ratio,
        y: anchorY - (anchorY - prev.y) * ratio,
      };
    });
  });

  useEffect(() => {
    const el = svgRef.current;
    const handler = handleWheelRef.current;
    if (!el || !handler) return;
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [geojson, outline]);

  if (!geojson) {
    const msg = isLoading
      ? "Loading riding boundaries..."
      : loadError ?? "Map data unavailable.";
    if (embedded) {
      return (
        <div className="ridingMapEmbeddedMessage">
          <span>{msg}</span>
          {loadError && (
            <span className="ridingMapEmbeddedHint">
              {" "}Add <code>federal-districts-2025.geojson</code> to <code>public/data/</code> (see README there).
            </span>
          )}
        </div>
      );
    }
    return (
      <section className="panel">
        <h2>Riding Projection Map</h2>
        <p>{msg}</p>
        {loadError && (
          <p className="subtle">
            Place <code>federal-districts-2025.geojson</code> in <code>frontend/public/data/</code>. See{" "}
            <code>public/data/README.md</code> for how to generate it.
          </p>
        )}
      </section>
    );
  }

  function clampScale(s: number) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
  }

  const PAD = 40;

  function zoomAt(nextScale: number, anchorX: number, anchorY: number) {
    setViewport((prev) => {
      const scale = clampScale(nextScale);
      const ratio = scale / prev.scale;
      return {
        scale,
        x: anchorX - (anchorX - prev.x) * ratio,
        y: anchorY - (anchorY - prev.y) * ratio,
      };
    });
  }

  function focusViewOnFeature(feature: Feature<Geometry>) {
    if (!pathGenerator) return;
    const [[minX, minY], [maxX, maxY]] = pathGenerator.bounds(feature);
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return;
    const scaleX = (WIDTH - 2 * PAD) / w;
    const scaleY = (HEIGHT - 2 * PAD) / h;
    const scale = Math.min(
      FOCUS_MAX_SCALE,
      Math.max(MIN_SCALE, Math.min(scaleX, scaleY))
    );
    const x = PAD - scale * minX;
    const y = PAD - scale * minY;
    setViewport({ scale, x, y });
  }

  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: viewport.x,
      originY: viewport.y,
      capturing: false,
    };
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!dragState.current || dragState.current.pointerId !== e.pointerId) return;
    if (!dragState.current.capturing) {
      const dist = Math.hypot(e.clientX - dragState.current.startX, e.clientY - dragState.current.startY);
      if (dist < DRAG_THRESHOLD) return;
      dragState.current.capturing = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - dragState.current.startX) * (WIDTH / rect.width) / viewport.scale;
    const dy = (e.clientY - dragState.current.startY) * (HEIGHT / rect.height) / viewport.scale;
    setViewport((prev) => ({
      ...prev,
      x: dragState.current!.originX + dx,
      y: dragState.current!.originY + dy,
    }));
  }

  function handlePointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    if (dragState.current?.pointerId === e.pointerId) {
      if (dragState.current.capturing) e.currentTarget.releasePointerCapture(e.pointerId);
      dragState.current = null;
    }
  }

  const transform = `translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`;

  function selectRidingFromSearch(riding: RidingWinProbability) {
    setPinnedRiding(riding);
    setRidingSearch("");
    setSearchFocused(false);
    const feat = geojson?.features.find(
      (f) => normalizeCode((f.properties as { FED_NUM?: unknown })?.FED_NUM) === riding.FED_CODE
    );
    if (feat) focusViewOnFeature(feat);
  }

  const content = (
    <>
      {!embedded && (
        <>
          <h2>Riding Projection Map</h2>
          <p className="subtle">
            Colors show each riding's most likely winner. Drag to pan; scroll or use +/− to zoom. Hover or click a riding for details.
          </p>
        </>
      )}
      {embedded && (
        <p className="subtle">
          Colors show each riding's most likely winner. Drag to pan; use +/− on the map to zoom. Hover or click a riding for details.
        </p>
      )}
      <div className="mapRidingSearchWrap">
        <div className="mapRidingSearchRow">
          <span className="mapRidingSearchIcon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            type="text"
            className="mapRidingSearchInput"
            placeholder="Search for a riding"
          value={ridingSearch}
          onChange={(e) => setRidingSearch(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ridingSearchResults[0]) {
              selectRidingFromSearch(ridingSearchResults[0]);
            }
            if (e.key === "Escape") {
              setRidingSearch("");
              setSearchFocused(false);
            }
          }}
          aria-label="Search for a riding"
          aria-autocomplete="list"
          aria-expanded={searchFocused && ridingSearchResults.length > 0}
          />
        </div>
        {searchFocused && ridingSearch.trim().length >= 2 && (
          <ul className="mapRidingSearchResults" role="listbox">
            {ridingSearchResults.map((r) => (
              <li
                key={r.FED_CODE}
                role="option"
                className="mapRidingSearchResultItem"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectRidingFromSearch(r);
                }}
              >
                <strong>{formatRidingName(getRidingName(r))}</strong>
                <span>{getRidingProvince(r)}</span>
              </li>
            ))}
            {ridingSearchResults.length === 0 && (
              <li className="mapRidingSearchResultItem mapRidingSearchNoResults">No ridings match</li>
            )}
          </ul>
        )}
      </div>
      <div className="mapWrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="mapSvg"
          style={{ overflow: "hidden", aspectRatio: `${WIDTH} / ${HEIGHT}` }}
          aria-label="Canada riding map"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {outlinePath && outline && (
            <defs>
              <clipPath id="canada-outline-clip">
                <path d={outlinePath} transform={transform} />
              </clipPath>
            </defs>
          )}
          <g transform={transform}>
            {outlinePath && outline ? (
              <g clipPath="url(#canada-outline-clip)">
                {pathData.map((item) => (
                  <path
                    key={item.key}
                    d={item.path}
                    fill={item.fill}
                    stroke="#fff"
                    strokeWidth={0.5 / viewport.scale}
                    style={{
                      cursor: item.riding ? "pointer" : "default",
                      opacity: pinnedRiding && item.riding?.FED_CODE !== pinnedRiding.FED_CODE ? 0.35 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (item.riding) {
                        setTooltipRiding(item.riding);
                        setTooltipPos({ x: e.clientX, y: e.clientY });
                      }
                    }}
                    onMouseMove={(e) => {
                      if (item.riding) setTooltipPos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => setTooltipRiding(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.riding) {
                        const next = item.riding;
                        setPinnedRiding((p) => (p?.FED_CODE === next.FED_CODE ? null : next));
                        setTooltipPos({ x: e.clientX, y: e.clientY });
                      }
                    }}
                  />
                ))}
              </g>
            ) : (
              pathData.map((item) => (
                <path
                  key={item.key}
                  d={item.path}
                  fill={item.fill}
                  stroke="#fff"
                  strokeWidth={0.5 / viewport.scale}
                  style={{
                    cursor: item.riding ? "pointer" : "default",
                    opacity: pinnedRiding && item.riding?.FED_CODE !== pinnedRiding.FED_CODE ? 0.35 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (item.riding) {
                      setTooltipRiding(item.riding);
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }
                  }}
                  onMouseMove={(e) => {
                    if (item.riding) setTooltipPos({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseLeave={() => setTooltipRiding(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.riding) {
                      const next = item.riding;
                      setPinnedRiding((p) => (p?.FED_CODE === next.FED_CODE ? null : next));
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }
                  }}
                />
              ))
            )}
          </g>
        </svg>
        <div className="mapControlsOverlay" aria-label="Map zoom controls">
          <button
            type="button"
            onClick={() => zoomAt(viewport.scale * 1.2, WIDTH / 2, HEIGHT / 2)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomAt(viewport.scale / 1.2, WIDTH / 2, HEIGHT / 2)}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setViewport({ scale: 1, x: 0, y: 0 })}
            aria-label="Reset view: fit map to Canada"
            title="Reset view: fit map to Canada"
            className="mapControlReset"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        </div>
      </div>

      {(tooltipRiding ?? pinnedRiding) && (() => {
        const r = tooltipRiding ?? pinnedRiding!;
        if (!r || typeof r !== "object") return null;
        const fedName = getRidingName(r) || "—";
        const province = getRidingProvince(r) || "";
        const incumbent = (r as { incumbent?: Party; WINNER?: Party }).incumbent ?? (r as { WINNER?: Party }).WINNER ?? "—";
        const projectedWinner = typeof r.projected_winner === "string" ? r.projected_winner : String(r.projected_winner ?? "—");
        return (
          <div
            className="mapTooltip"
            role="tooltip"
            style={{
              left: tooltipPos.x + 12,
              top: tooltipPos.y + 12,
              pointerEvents: "none",
            }}
          >
            <div className="mapTooltipHeader">
              <span className="mapTooltipRiding">{formatRidingName(fedName)}</span>
              <span className="mapTooltipProvince">{province}</span>
            </div>
            <div className="mapTooltipWinner">
              <span className="mapTooltipWinnerLabel">Incumbent</span>
              <span className="mapTooltipWinnerParty">{incumbent}</span>
            </div>
            <div className="mapTooltipWinner">
              <span className="mapTooltipWinnerLabel">Projected winner</span>
              <span className="mapTooltipWinnerParty">{projectedWinner}</span>
            </div>
            <div className="mapTooltipTableWrap">
              <span className="mapTooltipTableCaption">Chance of winning (simulation %)</span>
              <table className="mapTooltipTable" aria-label="Win chances by party">
                <thead>
                  <tr>
                    <th>Party</th>
                    <th>Chance</th>
                  </tr>
                </thead>
                <tbody>
                  {PARTIES.map((party) => {
                    const pct = r[party as keyof RidingWinProbability];
                    const num = typeof pct === "number" && !Number.isNaN(pct) ? Math.round(pct * 100) : "—";
                    return (
                      <tr key={party} className={party === projectedWinner ? "mapTooltipTableRowWinner" : undefined}>
                        <td>{party}</td>
                        <td>{typeof num === "number" ? `${num}%` : num}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </>
  );

  if (embedded) return <div className="ridingMapEmbedded" ref={sectionRef}>{content}</div>;
  return <section className="panel" ref={sectionRef}>{content}</section>;
}
