import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { geoConicConformal, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Party, RidingWinProbability } from "../types";

const PARTY_COLORS: Record<Party, string> = {
  Liberal: "#d73027",
  Conservative: "#1f3b73",
  Bloc: "#2f9fd9",
  NDP: "#ef7f1a",
  Green: "#3a9d4b",
  Other: "#767676",
};

type ProjectionMapProps = {
  ridingData: RidingWinProbability[];
};

function normalizeCode(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) return Number(value);
  return null;
}

export function ProjectionMap({ ridingData }: ProjectionMapProps) {
  const [geojson, setGeojson] = useState<FeatureCollection<Geometry> | null>(null);
  const [outline, setOutline] = useState<FeatureCollection<Geometry> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hovered, setHovered] = useState<RidingWinProbability | null>(null);
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const width = 1000;
  const height = 650;
  const minScale = 1;
  const maxScale = 8;

  useEffect(() => {
    let isMounted = true;
    async function loadMap() {
      setIsLoading(true);
      try {
        const [districtResponse, outlineResponse] = await Promise.all([
          fetch("/data/federal-districts-2025.geojson"),
          fetch("/data/canada-outline.geojson"),
        ]);
        const [districts, canadaOutline] = (await Promise.all([
          districtResponse.json(),
          outlineResponse.json(),
        ])) as [FeatureCollection<Geometry>, FeatureCollection<Geometry>];
        if (isMounted) {
          setGeojson(districts);
          setOutline(canadaOutline);
        }
      } catch (error) {
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
    for (const item of ridingData) {
      lookup.set(item.FED_CODE, item);
    }
    return lookup;
  }, [ridingData]);

  const pathData = useMemo(() => {
    if (!geojson || !outline) return [];

    // shpjs outputs GeoJSON in lon/lat, so render it with a Canada-oriented
    // conic projection instead of Mercator or raw planar coordinates.
    const projection = geoConicConformal()
      .parallels([49, 77])
      .rotate([91.86666666666666, 0])
      .center([0, 63.390675])
      .fitSize([width, height], outline);
    const pathGenerator = geoPath(projection);

    return geojson.features.flatMap((feature: Feature<Geometry>, index: number) => {
      const fedCode = normalizeCode(feature.properties?.FED_NUM);
      const riding = fedCode ? ridingByCode.get(fedCode) : undefined;
      const fill = riding ? PARTY_COLORS[riding.projected_winner] : "#d4e6f2";
      const path = pathGenerator(feature);
      if (!path) return [];

      return [
        {
          key: `${fedCode ?? "missing"}-${index}`,
          path,
          fill,
          riding: riding ?? null,
        },
      ];
    });
  }, [geojson, height, outline, ridingByCode, width]);

  const outlinePath = useMemo(() => {
    if (!outline) return null;

    const projection = geoConicConformal()
      .parallels([49, 77])
      .rotate([91.86666666666666, 0])
      .center([0, 63.390675])
      .fitSize([width, height], outline);
    const pathGenerator = geoPath(projection);
    return outline.features
      .map((feature) => pathGenerator(feature))
      .filter((path): path is string => Boolean(path))
      .join(" ");
  }, [height, outline, width]);

  if (!geojson || !outline) {
    return (
      <section className="panel">
        <h2>Riding Projection Map</h2>
        <p>{isLoading ? "Loading riding boundaries..." : "Map data unavailable."}</p>
      </section>
    );
  }

  function clampScale(scale: number) {
    return Math.max(minScale, Math.min(maxScale, scale));
  }

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

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorX = ((event.clientX - rect.left) / rect.width) * width;
    const anchorY = ((event.clientY - rect.top) / rect.height) * height;
    const factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
    zoomAt(viewport.scale * factor, anchorX, anchorY);
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragState.current || dragState.current.pointerId !== event.pointerId) return;
    const dx = (event.clientX - dragState.current.startX) * (width / event.currentTarget.getBoundingClientRect().width);
    const dy = (event.clientY - dragState.current.startY) * (height / event.currentTarget.getBoundingClientRect().height);
    setViewport((prev) => ({
      ...prev,
      x: dragState.current ? dragState.current.originX + dx : prev.x,
      y: dragState.current ? dragState.current.originY + dy : prev.y,
    }));
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section className="panel">
      <h2>Riding Projection Map</h2>
      <p className="subtle">
        Colors show each riding’s most likely winner from simulation outcomes. Scroll to zoom and drag to pan.
      </p>
      <div className="mapControls">
        <button type="button" onClick={() => zoomAt(viewport.scale * 1.2, width / 2, height / 2)}>
          Zoom In
        </button>
        <button type="button" onClick={() => zoomAt(viewport.scale / 1.2, width / 2, height / 2)}>
          Zoom Out
        </button>
        <button type="button" onClick={() => setViewport({ scale: 1, x: 0, y: 0 })}>
          Reset
        </button>
      </div>
      <div className="mapWrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="mapSvg"
          aria-label="Canada riding map"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {outlinePath ? (
            <>
              <defs>
                <clipPath id="canada-outline-clip">
                  <path d={outlinePath} transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`} />
                </clipPath>
              </defs>
              <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
                <g clipPath="url(#canada-outline-clip)">
                  {pathData.map((item) => (
                    <path
                      key={item.key}
                      d={item.path}
                      fill={item.fill}
                      stroke="#1b1b1b"
                      strokeWidth={0.25 / viewport.scale}
                      onMouseEnter={() => setHovered(item.riding)}
                      onMouseLeave={() => setHovered(null)}
                    />
                  ))}
                </g>
              </g>
            </>
          ) : null}
        </svg>
      </div>

      {hovered ? (
        <div className="hoverCard">
          <strong>{hovered.FED_NAME}</strong>
          <span>{hovered.PROVINCE}</span>
          <span>
            Projected winner: {hovered.projected_winner} ({Math.round(hovered.winner_probability * 100)}%)
          </span>
        </div>
      ) : (
        <div className="hoverCard placeholder">Hover over a riding for details.</div>
      )}
    </section>
  );
}
