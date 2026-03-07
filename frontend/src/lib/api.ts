import type { ForecastResponse, MetaResponse, Party } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchMeta(): Promise<MetaResponse> {
  return request<MetaResponse>("/meta");
}

export function runNationalForecast(payload: {
  national_poll: Record<Party, number>;
  n_sims: number;
  swing_method: "Absolute" | "Proportional";
  total_n?: number;
}): Promise<ForecastResponse> {
  return request<ForecastResponse>("/forecast/national", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runProvincialForecast(payload: {
  polls: Record<string, Record<Party, number>>;
  n_sims: number;
  swing_method: "Absolute" | "Proportional";
  total_n?: number;
}): Promise<ForecastResponse> {
  return request<ForecastResponse>("/forecast/provincial", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
