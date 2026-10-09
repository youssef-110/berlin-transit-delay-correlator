import "server-only";
import { z } from "zod";
import { upstreamCache } from "@/lib/cache";
import { env } from "@/lib/env";
import { fetchJsonWithRetry } from "@/lib/http";
import { createLogger } from "@/lib/logger";

const log = createLogger("weather");

export type Region = "berlin" | "potsdam";

export const WEATHER_POINTS: Record<Region, { label: string; lat: number; lon: number }> = {
  berlin: { label: "Berlin", lat: 52.52, lon: 13.4 },
  potsdam: { label: "Potsdam", lat: 52.39, lon: 13.06 },
};

export type Severity = "moderate" | "high" | "severe";

export interface WeatherAnomaly {
  kind: "thunderstorm" | "heavy_rain" | "snow" | "wind" | "frost" | "heat" | "freezing_rain";
  severity: Severity;
  message: string;
  transitImpact: string;
}

export interface WeatherSnapshot {
  available: true;
  region: Region;
  label: string;
  fetchedAt: string;
  temperatureC: number;
  apparentC: number;
  precipitationMmH: number;
  snowfallCmH: number;
  windKmh: number;
  gustKmh: number;
  weatherCode: number;
  description: string;
  isDay: boolean;
  anomalies: WeatherAnomaly[];
}

export interface WeatherUnavailable {
  available: false;
  region: Region;
  label: string;
  error: string;
}

export type WeatherResult = WeatherSnapshot | WeatherUnavailable;

const openMeteoSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    precipitation: z.number(),
    snowfall: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
    wind_gusts_10m: z.number(),
    is_day: z.number(),
  }),
  hourly: z
    .object({
      time: z.array(z.string()),
      precipitation: z.array(z.number().nullable()),
      snowfall: z.array(z.number().nullable()),
      wind_gusts_10m: z.array(z.number().nullable()),
    })
    .optional(),
});

const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle", 56: "Freezing drizzle", 57: "Dense freezing drizzle",
  61: "Slight rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain",
  71: "Slight snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Heavy rain showers", 82: "Violent rain showers",
  85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
};

export function describeWmo(code: number): string {
  return WMO[code] ?? "Unknown";
}

/** Rule-based anomaly detection tuned for rail/tram infrastructure impact. */
export function detectAnomalies(s: Omit<WeatherSnapshot, "anomalies" | "available">): WeatherAnomaly[] {
  const out: WeatherAnomaly[] = [];
  const where = s.label;

  if ([95, 96, 99].includes(s.weatherCode)) {
    out.push({
      kind: "thunderstorm",
      severity: "severe",
      message: `Severe thunderstorm warning in ${where} area`,
      transitImpact: "Lightning strikes on signalling & overhead lines commonly cause S-Bahn/regional suspensions.",
    });
  }
  if ([56, 57, 66, 67].includes(s.weatherCode)) {
    out.push({
      kind: "freezing_rain",
      severity: "severe",
      message: `Freezing rain in ${where}`,
      transitImpact: "Icing of overhead wires and power rails – expect S-Bahn and tram disruptions.",
    });
  }
  if (s.precipitationMmH >= 7.6) {
    out.push({
      kind: "heavy_rain",
      severity: s.precipitationMmH >= 15 ? "severe" : "high",
      message: `Heavy rain detected (${s.precipitationMmH.toFixed(1)} mm/h) in ${where}`,
      transitImpact: "Likely factor for S-Bahn switch/signal failures and flooded underpasses.",
    });
  } else if (s.precipitationMmH >= 2.5) {
    out.push({
      kind: "heavy_rain",
      severity: "moderate",
      message: `Moderate rain (${s.precipitationMmH.toFixed(1)} mm/h) in ${where}`,
      transitImpact: "Longer dwell times and slippery rails may add minor delays.",
    });
  }
  if (s.snowfallCmH > 0) {
    out.push({
      kind: "snow",
      severity: s.snowfallCmH >= 1 ? "high" : "moderate",
      message: `Snowfall (${s.snowfallCmH.toFixed(1)} cm/h) in ${where}`,
      transitImpact: "Snow in switches (Weichenstörung) is a leading cause of winter S-Bahn delays.",
    });
  }
  if (s.gustKmh >= 62) {
    out.push({
      kind: "wind",
      severity: s.gustKmh >= 75 ? "severe" : "high",
      message: `Storm gusts up to ${Math.round(s.gustKmh)} km/h in ${where}`,
      transitImpact: "Fallen trees on tracks/overhead lines – regional and outer S-Bahn branches most exposed.",
    });
  }
  if (s.temperatureC <= -5) {
    out.push({
      kind: "frost",
      severity: s.temperatureC <= -12 ? "high" : "moderate",
      message: `Hard frost (${s.temperatureC.toFixed(0)} °C) in ${where}`,
      transitImpact: "Frozen switches and door malfunctions on older rolling stock.",
    });
  }
  if (s.temperatureC >= 32) {
    out.push({
      kind: "heat",
      severity: s.temperatureC >= 36 ? "high" : "moderate",
      message: `Heat (${s.temperatureC.toFixed(0)} °C) in ${where}`,
      transitImpact: "Track buckling speed restrictions and HVAC failures possible.",
    });
  }
  return out;
}

async function fetchRegion(region: Region): Promise<WeatherSnapshot> {
  const e = env();
  const p = WEATHER_POINTS[region];
  return upstreamCache.wrap(`weather:${region}`, e.UPSTREAM_CACHE_TTL_SECONDS * 1000, async () => {
    const url = new URL(`${e.OPEN_METEO_BASE}/forecast`);
    url.searchParams.set("latitude", String(p.lat));
    url.searchParams.set("longitude", String(p.lon));
    url.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,precipitation,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,is_day",
    );
    url.searchParams.set("hourly", "precipitation,snowfall,wind_gusts_10m");
    url.searchParams.set("forecast_hours", "3");
    url.searchParams.set("timezone", "Europe/Berlin");
    url.searchParams.set("wind_speed_unit", "kmh");

    const json = await fetchJsonWithRetry(url.toString(), { label: "open-meteo" });
    const { current: c, hourly: h } = openMeteoSchema.parse(json);

    // `current.precipitation` covers the preceding 15 min → scale to an hourly rate,
    // and compare with the hourly model value; take the more conservative (higher) one.
    const precipitationMmH = Math.max(c.precipitation * 4, h?.precipitation[0] ?? 0);
    const snowfallCmH = Math.max(c.snowfall * 4, h?.snowfall[0] ?? 0);
    const gustKmh = Math.max(c.wind_gusts_10m, h?.wind_gusts_10m[0] ?? 0);

    const base = {
      region,
      label: p.label,
      fetchedAt: new Date().toISOString(),
      temperatureC: c.temperature_2m,
      apparentC: c.apparent_temperature,
      precipitationMmH,
      snowfallCmH,
      windKmh: c.wind_speed_10m,
      gustKmh,
      weatherCode: c.weather_code,
      description: describeWmo(c.weather_code),
      isDay: c.is_day === 1,
    };
    const snapshot: WeatherSnapshot = { available: true, ...base, anomalies: detectAnomalies(base) };
    log.info("weather fetched", { region, code: c.weather_code, anomalies: snapshot.anomalies.length });
    return snapshot;
  });
}

/** Graceful: never throws – returns `available: false` on failure. */
export async function getWeather(region: Region): Promise<WeatherResult> {
  try {
    return await fetchRegion(region);
  } catch (err) {
    log.warn("weather unavailable – degrading gracefully", { region, err: (err as Error).message });
    return { available: false, region, label: WEATHER_POINTS[region].label, error: "Weather data temporarily unavailable" };
  }
}

export async function getAllWeather(): Promise<Record<Region, WeatherResult>> {
  const [berlin, potsdam] = await Promise.all([getWeather("berlin"), getWeather("potsdam")]);
  return { berlin, potsdam };
}
