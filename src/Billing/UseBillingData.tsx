import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://hccxpmnraefgccowdwri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY3hwbW5yYWVmZ2Njb3dkd3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjAyNzQsImV4cCI6MjA4ODE5NjI3NH0.QwfoDxbMDXPrCmfGPLsKVzhfLpQBKBVmNwbNm_dIX1E"
);

// ─── COSTES POR PLATAFORMA ────────────────────────────────────────────────────
// Guruwalk: 1 crédito/adulto × €2 = €2/adulto
// FreeTour: 2 créditos/adulto × €1 = €2/adulto
// Turixe: €0, TripAdvisor: €0 (gestionado aparte)
export const PLATFORM_COST: Record<string, { creditsPerAdult: number; pricePerCredit: number }> = {
  guruwalk: { creditsPerAdult: 1, pricePerCredit: 2 },
  freetour: { creditsPerAdult: 2, pricePerCredit: 1 },
};

export function getCostForReservation(platform: string, adults: number): number {
  const cfg = PLATFORM_COST[platform.toLowerCase()];
  if (!cfg) return 0;
  return adults * cfg.creditsPerAdult * cfg.pricePerCredit;
}

export function getCreditsForReservation(platform: string, adults: number): number {
  const cfg = PLATFORM_COST[platform.toLowerCase()];
  if (!cfg) return 0;
  return adults * cfg.creditsPerAdult;
}

// ─── TIPOS ────────────────────────────────────────────────────────────────────
export interface BillingReservation {
  id:             string;
  contact_name:   string;
  adults:         number;
  children:       number;
  attended_count: number;
  attended:       boolean;
  platform:       string;
  guide_id:       string | null;
}

export interface BillingTour {
  id:           string;
  title:        string;
  date:         string;
  time:         string;
  reservations: BillingReservation[];
}

export interface GuideProfile {
  id:         string;
  name:       string;
  email:      string;
  avatar_url: string | null;
}

export interface GuideCredits {
  guruwalk: number;
  freetour: number;
}

export function useBillingData(guideId: string | null, month: string) {
  const [tours,   setTours]   = useState<BillingTour[]>([]);
  const [credits, setCredits] = useState<GuideCredits>({ guruwalk: 0, freetour: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!guideId || !month) return;
    setLoading(true);

    const [year, mon] = month.split("-");
    const from = `${year}-${mon}-01`;
    const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
    const to   = `${year}-${mon}-${lastDay}`;

    (async () => {
      // Tours del mes con reservas
      const { data: toursData } = await supabase
        .from("tours")
        .select(`id, title, date, time, reservations(id, contact_name, adults, children, attended_count, attended, platform, guide_id)`)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });

      // Filtrar solo tours donde el guía tiene al menos una reserva asignada y confirmada
      const filtered = (toursData ?? []).filter((t: any) =>
        t.reservations.some((r: any) => r.guide_id === guideId && r.attended)
      );

      setTours(filtered as BillingTour[]);

      // Créditos del guía
      const { data: creditsData } = await supabase
        .from("guide_credits")
        .select("platform, credits")
        .eq("guide_id", guideId);

      const c: GuideCredits = { guruwalk: 0, freetour: 0 };
      for (const row of creditsData ?? []) {
        if (row.platform === "guruwalk") c.guruwalk = row.credits;
        if (row.platform === "freetour") c.freetour = row.credits;
      }
      setCredits(c);
      setLoading(false);
    })();
  }, [guideId, month]);

  return { tours, credits, loading };
}

export async function updateGuideCredits(guideId: string, platform: string, credits: number) {
  await supabase.from("guide_credits").upsert(
    { guide_id: guideId, platform, credits, updated_at: new Date().toISOString() },
    { onConflict: "guide_id,platform" }
  );
}

export async function fetchAllGuides(): Promise<GuideProfile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, avatar_url")
    .order("name");
  return (data ?? []) as GuideProfile[];
}