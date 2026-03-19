import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://hccxpmnraefgccowdwri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY3hwbW5yYWVmZ2Njb3dkd3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjAyNzQsImV4cCI6MjA4ODE5NjI3NH0.QwfoDxbMDXPrCmfGPLsKVzhfLpQBKBVmNwbNm_dIX1E"
);

export interface TourRow {
  id:         string;
  title:      string;
  date:       string;
  time:       string;
  platform:   string | null;
  guide:      string | null;
  reservations: ReservationRow[];
}

export interface ReservationRow {
  id:           string;
  tour_id:      string;
  contact_name: string;
  adults:       number;
  children:     number;
  pax:          number;
  platform:     string | null;
  created_at:   string;
}

export interface MetricsData {
  tours:       TourRow[];
  loading:     boolean;
  error:       string | null;
  platforms:   string[];
  dateRange:   { min: string; max: string };
}

export function useMetricsData(): MetricsData {
  const [tours,   setTours]   = useState<TourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("tours")
          .select(`
            id, title, date, time, platform, guide,
            reservations ( id, tour_id, contact_name, adults, children, pax, platform, created_at )
          `)
          .gte("date", "2025-01-01")
          .order("date", { ascending: true });

        if (err) throw new Error(err.message);
        setTours((data as TourRow[]) ?? []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const platforms = Array.from(
    new Set(tours.map((t) => t.platform ?? "other").filter(Boolean))
  ).sort();

  const dates = tours.map((t) => t.date).filter(Boolean).sort();
  const dateRange = {
    min: dates[0]          ?? "2025-01-01",
    max: dates[dates.length - 1] ?? new Date().toISOString().split("T")[0],
  };

  return { tours, loading, error, platforms, dateRange };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function getWeekKey(date: string): string {
  const d   = new Date(date);
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const mon = new Date(d);
  mon.setDate(d.getDate() - day);
  return mon.toISOString().split("T")[0];
}

export function getMonthKey(date: string): string {
  return date.slice(0, 7);
}

export function getYearKey(date: string): string {
  return date.slice(0, 4);
}

export function groupBy<T>(
  items: T[],
  key: (item: T) => string
): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export const PLATFORM_COLORS: Record<string, string> = {
  guruwalk:    "#ff6b35",
  freetour:    "#3b82f6",
  turixe:      "#10b981",
  tripadvisor: "#22c55e",
  manual:      "#8b5cf6",
  other:       "#94a3b8",
};

export const PLATFORM_LABELS: Record<string, string> = {
  guruwalk:    "GuruWalk",
  freetour:    "FreeTour",
  turixe:      "Turixe",
  tripadvisor: "TripAdvisor",
  manual:      "Manual",
  other:       "Otras",
};