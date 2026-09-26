import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────
// PENDIENTE: este módulo de facturación (saldo por plataforma, comisiones
// GuruWalk/FreeTour, reservas OTA...) pertenece al modelo anterior. Hoy no
// hay reservas individuales ni plataformas — solo tours privados con pax
// fijo — así que se desactiva por completo para evitar los 404 contra
// tablas que no existen (`reservations`, `guide_balance_entries`,
// `manual_billing_entries`, `guide_billing_settings`).
// Se reactivará (rediseñado) cuando haya un modelo de facturación para el
// esquema nuevo. Los exports se mantienen para no romper el componente que
// los usa; todos devuelven datos vacíos y no tocan la base de datos.
// Lógica original comentada al final del archivo como referencia.
// ─────────────────────────────────────────────────────────────────────────

export const PLATFORM_COST: Record<string, { sinIva: number; conIva: number }> =
  {};
export const ALL_PLATFORMS = [] as const;
export type Platform = never;
export const BALANCE_PLATFORMS = [] as const;
export type BalancePlatform = never;

export function getCostForReservation(): number {
  return 0;
}

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
  entry_date: string;
  entry_time: string;
  platform: string;
  adults: number;
  children: number;
}

export interface BillingEntry {
  id: string;
  source: "auto" | "manual";
  date: string;
  time: string;
  tourTitle: string | null;
  platform: string;
  adults: number;
  children: number;
}

export interface GuideBalanceEntry {
  id: string;
  guide_id: string;
  platform: string;
  entry_date: string;
  amount: number;
  created_at: string;
}

export function useBillingData(_guideId: string | null, _month: string) {
  const [tours] = useState<BillingTour[]>([]);
  return { tours, loading: false, refetch: () => {} };
}

export function useBillingSettings(_guideId: string | null) {
  const [mode] = useState<BillingMode>("both");
  return { mode, setMode: async () => {}, loading: false };
}

export function useManualBillingEntries(
  _guideId: string | null,
  _month: string,
) {
  const [entries] = useState<ManualBillingEntry[]>([]);
  return { entries, loading: false, refetch: () => {} };
}

export interface AddManualEntryInput {
  guideId: string;
  date: string;
  time: string;
  platform: string;
  adults: number;
  children: number;
}

export async function addManualBillingEntry(_input: AddManualEntryInput);
