import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabaseClientOTA";

// ─── COSTES POR PLATAFORMA (dinero real, ya no créditos) ─────────────────────
// GuruWalk: 2,89€/adulto sin IVA · 3,50€/adulto con IVA (IVA 21%)
// FreeTour: 1,80€/adulto — precio fijo, no varía con el toggle de IVA
// El resto de plataformas (Turixe, TripAdvisor, Plaza, Viator, Taro) no
// cobran comisión por ahora → 0€ siempre, se listan igual en el desglose.
export const PLATFORM_COST: Record<string, { sinIva: number; conIva: number }> =
  {
    guruwalk: { sinIva: 2.89, conIva: 3.5 },
    freetour: { sinIva: 1.8, conIva: 1.8 },
  };

// Plataformas que puede elegir el guía al añadir un tour manualmente —
// mismas columnas que aparecen en el Excel de comisiones.
export const ALL_PLATFORMS = [
  "guruwalk",
  "freetour",
  "plaza",
  "turixe",
  "viator",
  "taro",
  "tripadvisor",
] as const;

export type Platform = (typeof ALL_PLATFORMS)[number];

// Plataformas que manejan saldo (las únicas dos con coste real hoy)
export const BALANCE_PLATFORMS = ["guruwalk", "freetour"] as const;
export type BalancePlatform = (typeof BALANCE_PLATFORMS)[number];

export function getCostForReservation(
  platform: string,
  adults: number,
  withIva: boolean,
): number {
  const cfg = PLATFORM_COST[platform.toLowerCase()];
  if (!cfg) return 0;
  const rate = withIva ? cfg.conIva : cfg.sinIva;
  return adults * rate;
}

// ─── TIPOS ────────────────────────────────────────────────────────────────────
export interface BillingReservation {
  id: string;
  contact_name: string;
  adults: number;
  children: number;
  attended_count: number;
  attended: boolean;
  platform: string;
  guide_id: string | null;
}

export interface BillingTour {
  id: string;
  title: string;
  date: string;
  time: string;
  reservations: BillingReservation[];
}

export interface GuideProfile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export type BillingMode = "auto" | "manual" | "both";

export interface ManualBillingEntry {
  id: string;
  guide_id: string;
  entry_date: string; // YYYY-MM-DD
  entry_time: string; // HH:MM:SS
  platform: string;
  adults: number;
  children: number;
}

// Fila unificada para el desglose detallado y la exportación — mezcla lo
// automático (calendario) y lo manual según el modo elegido.
export interface BillingEntry {
  id: string;
  source: "auto" | "manual";
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  tourTitle: string | null;
  platform: string;
  adults: number;
  children: number;
}

export interface GuideBalanceEntry {
  id: string;
  guide_id: string;
  platform: string;
  entry_date: string; // YYYY-MM-DD
  amount: number;
  created_at: string;
}

// ─── DATOS AUTOMÁTICOS (tours + reservas del calendario) ──────────────────────
export function useBillingData(guideId: string | null, month: string) {
  const [tours, setTours] = useState<BillingTour[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(() => {
    if (!guideId || !month) return;
    setLoading(true);

    const [year, mon] = month.split("-");
    const from = `${year}-${mon}-01`;
    const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
    const to = `${year}-${mon}-${lastDay}`;

    (async () => {
      const { data: toursData } = await supabase
        .from("tours")
        .select(
          `id, title, date, time, reservations(id, contact_name, adults, children, attended_count, attended, platform, guide_id)`,
        )
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });

      // Solo tours donde ESTE guía tiene al menos una reserva propia asistida.
      const filtered = (toursData ?? []).filter((t: any) =>
        t.reservations.some((r: any) => r.guide_id === guideId && r.attended),
      );

      setTours(filtered as BillingTour[]);
      setLoading(false);
    })();
  }, [guideId, month]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { tours, loading, refetch };
}

// ─── MODO DE FACTURACIÓN (auto / manual / both) ───────────────────────────────
export function useBillingSettings(guideId: string | null) {
  const [mode, setModeState] = useState<BillingMode>("both");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!guideId) return;
    setLoading(true);
    supabase
      .from("guide_billing_settings")
      .select("billing_mode")
      .eq("guide_id", guideId)
      .maybeSingle()
      .then(({ data }) => {
        setModeState((data?.billing_mode as BillingMode) ?? "both");
        setLoading(false);
      });
  }, [guideId]);

  const setMode = useCallback(
    async (newMode: BillingMode) => {
      if (!guideId) return;
      setModeState(newMode); // optimista
      await supabase.from("guide_billing_settings").upsert(
        {
          guide_id: guideId,
          billing_mode: newMode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guide_id" },
      );
    },
    [guideId],
  );

  return { mode, setMode, loading };
}

// ─── ENTRADAS MANUALES ────────────────────────────────────────────────────────
export function useManualBillingEntries(guideId: string | null, month: string) {
  const [entries, setEntries] = useState<ManualBillingEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(() => {
    if (!guideId || !month) return;
    setLoading(true);

    const [year, mon] = month.split("-");
    const from = `${year}-${mon}-01`;
    const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
    const to = `${year}-${mon}-${lastDay}`;

    supabase
      .from("manual_billing_entries")
      .select(
        "id, guide_id, entry_date, entry_time, platform, adults, children",
      )
      .eq("guide_id", guideId)
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order("entry_date", { ascending: true })
      .then(({ data }) => {
        setEntries((data ?? []) as ManualBillingEntry[]);
        setLoading(false);
      });
  }, [guideId, month]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { entries, loading, refetch };
}

export interface AddManualEntryInput {
  guideId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  platform: string;
  adults: number;
  children: number;
}

export async function addManualBillingEntry(input: AddManualEntryInput) {
  const { error } = await supabase.from("manual_billing_entries").insert({
    guide_id: input.guideId,
    entry_date: input.date,
    entry_time: `${input.time}:00`,
    platform: input.platform,
    adults: input.adults,
    children: input.children,
  });
  if (error) throw new Error(error.message);
}

export async function deleteManualBillingEntry(id: string) {
  const { error } = await supabase
    .from("manual_billing_entries")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export interface UpdateManualEntryInput {
  platform?: string;
  adults?: number;
  children?: number;
}

export async function updateManualBillingEntry(
  id: string,
  updates: UpdateManualEntryInput,
) {
  const { error } = await supabase
    .from("manual_billing_entries")
    .update(updates)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── COMBINAR AUTOMÁTICO + MANUAL SEGÚN EL MODO ───────────────────────────────
function normalizeTime(t: string): string {
  return t ? t.slice(0, 5) : "";
}

export function buildBillingEntries(
  tours: BillingTour[],
  manualEntries: ManualBillingEntry[],
  guideId: string,
  mode: BillingMode,
): BillingEntry[] {
  const entries: BillingEntry[] = [];

  if (mode === "auto" || mode === "both") {
    for (const tour of tours) {
      // Solo las reservas de ESTE guía, asistidas (fix del bug anterior que
      // contaba reservas de cualquier guía en el mismo tour).
      const own = tour.reservations.filter(
        (r) => r.guide_id === guideId && r.attended,
      );
      for (const r of own) {
        entries.push({
          id: `auto:${r.id}`,
          source: "auto",
          date: tour.date,
          time: normalizeTime(tour.time),
          tourTitle: tour.title,
          platform: r.platform,
          adults: r.adults,
          children: r.children,
        });
      }
    }
  }

  if (mode === "manual" || mode === "both") {
    for (const m of manualEntries) {
      entries.push({
        id: `manual:${m.id}`,
        source: "manual",
        date: m.entry_date,
        time: normalizeTime(m.entry_time),
        tourTitle: null,
        platform: m.platform,
        adults: m.adults,
        children: m.children,
      });
    }
  }

  return entries.sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
}

export async function fetchAllGuides(): Promise<GuideProfile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, avatar_url")
    .order("name");
  return (data ?? []) as GuideProfile[];
}

// ─── SALDO POR PLATAFORMA ──────────────────────────────────────────────────────
// El saldo mostrado nunca se guarda como un total — siempre se recalcula:
// (saldo añadido acumulado hasta fin del mes) - (coste consumido acumulado
// hasta fin del mes). Así un mes "hereda" el saldo del anterior de forma
// automática, sin copiar ni cerrar nada.

export async function addGuideBalanceEntry(input: {
  guideId: string;
  platform: BalancePlatform;
  date: string; // YYYY-MM-DD
  amount: number;
}) {
  const { error } = await supabase.from("guide_balance_entries").insert({
    guide_id: input.guideId,
    platform: input.platform,
    entry_date: input.date,
    amount: input.amount,
  });
  if (error) throw new Error(error.message);
}

async function fetchBalanceEntriesForMonth(
  guideId: string,
  month: string,
): Promise<GuideBalanceEntry[]> {
  const [year, mon] = month.split("-");
  const from = `${year}-${mon}-01`;
  const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
  const to = `${year}-${mon}-${lastDay}`;

  const { data, error } = await supabase
    .from("guide_balance_entries")
    .select("*")
    .eq("guide_id", guideId)
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as GuideBalanceEntry[];
}

async function fetchCumulativeBalanceAdded(
  guideId: string,
  platform: BalancePlatform,
  uptoDate: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("guide_balance_entries")
    .select("amount")
    .eq("guide_id", guideId)
    .eq("platform", platform)
    .lte("entry_date", uptoDate);

  if (error) throw new Error(error.message);
  return (data ?? []).reduce((acc, r) => acc + Number(r.amount), 0);
}

// Suma de adultos (auto + manual, según el modo) por plataforma, desde
// siempre hasta uptoDate — para poder calcular el coste consumido acumulado.
async function fetchCumulativeAdultsByPlatform(
  guideId: string,
  uptoDate: string,
  mode: BillingMode,
): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};

  if (mode === "auto" || mode === "both") {
    const { data, error } = await supabase
      .from("tours")
      .select(`id, date, reservations(adults, guide_id, attended, platform)`)
      .lte("date", uptoDate);
    if (error) throw new Error(error.message);
    for (const t of (data ?? []) as any[]) {
      for (const r of t.reservations ?? []) {
        if (r.guide_id === guideId && r.attended) {
          totals[r.platform] = (totals[r.platform] ?? 0) + r.adults;
        }
      }
    }
  }

  if (mode === "manual" || mode === "both") {
    const { data, error } = await supabase
      .from("manual_billing_entries")
      .select("platform, adults")
      .eq("guide_id", guideId)
      .lte("entry_date", uptoDate);
    if (error) throw new Error(error.message);
    for (const m of data ?? []) {
      totals[m.platform] = (totals[m.platform] ?? 0) + m.adults;
    }
  }

  return totals;
}

export function useGuideBalance(
  guideId: string | null,
  month: string,
  mode: BillingMode,
  withIva: boolean,
) {
  const [monthEntries, setMonthEntries] = useState<GuideBalanceEntry[]>([]);
  const [cumulativeAdded, setCumulativeAdded] = useState<
    Record<string, number>
  >({});
  const [cumulativeAdults, setCumulativeAdults] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(() => {
    if (!guideId || !month) return;
    setLoading(true);

    const [year, mon] = month.split("-");
    const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
    const monthEnd = `${year}-${mon}-${lastDay}`;

    (async () => {
      const [entries, guruAdded, freeAdded, adultsByPlatform] =
        await Promise.all([
          fetchBalanceEntriesForMonth(guideId, month),
          fetchCumulativeBalanceAdded(guideId, "guruwalk", monthEnd),
          fetchCumulativeBalanceAdded(guideId, "freetour", monthEnd),
          fetchCumulativeAdultsByPlatform(guideId, monthEnd, mode),
        ]);
      setMonthEntries(entries);
      setCumulativeAdded({ guruwalk: guruAdded, freetour: freeAdded });
      setCumulativeAdults(adultsByPlatform);
      setLoading(false);
    })();
  }, [guideId, month, mode]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Saldo restante = añadido acumulado - coste consumido acumulado. El coste
  // de GuruWalk cambia con el toggle de IVA; el de FreeTour es fijo.
  const balances = useMemo(() => {
    const guruCost =
      (cumulativeAdults.guruwalk ?? 0) *
      (withIva ? PLATFORM_COST.guruwalk.conIva : PLATFORM_COST.guruwalk.sinIva);
    const freeCost =
      (cumulativeAdults.freetour ?? 0) * PLATFORM_COST.freetour.sinIva;

    return {
      guruwalk: (cumulativeAdded.guruwalk ?? 0) - guruCost,
      freetour: (cumulativeAdded.freetour ?? 0) - freeCost,
    };
  }, [cumulativeAdded, cumulativeAdults, withIva]);

  return { monthEntries, balances, loading, refetch };
}
