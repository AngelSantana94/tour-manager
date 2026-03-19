import { createClient } from "@supabase/supabase-js";
import type { CalendarEvent } from "../CreateEventModal";

const SUPABASE_URL  = "https://hccxpmnraefgccowdwri.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY3hwbW5yYWVmZ2Njb3dkd3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjAyNzQsImV4cCI6MjA4ODE5NjI3NH0.QwfoDxbMDXPrCmfGPLsKVzhfLpQBKBVmNwbNm_dIX1E";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── TIPOS ────────────────────────────────────────────────────────────────────
export interface SupabaseTour {
  id:         string;
  title:      string;
  date:       string;
  time:       string;
  guide:      string | null;
  language:   string | null;
  platform:   string | null;
  created_at: string;
}

export interface SupabaseReservation {
  id:           string;
  tour_id:      string;
  contact_name: string;
  phone:        string;
  adults:       number;
  children:     number;
  pax:          number;
  platform:     string | null;
  raw_email:    string | null;
  status:       string;
  attended:     boolean;
  guide_id:     string | null;
  created_at:   string;
}

export interface TourGuide {
  guide_id: string;
  profiles: {
    id:         string;
    name:       string;
    email:      string;
    avatar_url: string | null;
  };
}

export interface TourWithReservations extends SupabaseTour {
  reservations: SupabaseReservation[];
  tour_guides:  TourGuide[];
}

// ─── ADAPTADOR: Supabase → CalendarEvent ──────────────────────────────────────
export function adaptTours(tours: TourWithReservations[]): CalendarEvent[] {
  return tours.map((t) => ({
    id:   t.id,
    tour: t.title,
    date: t.date,
    time: (t.time ?? "00:00").slice(0, 5),
    meta: {
      guide:    t.guide,
      language: t.language,
      platform: t.platform,
      pax:      t.reservations.reduce((acc, r) => acc + r.pax, 0),
      // Guías asignados al tour
      tourGuides: (t.tour_guides ?? []).map((tg) => ({
        id:        tg.profiles.id,
        name:      tg.profiles.name,
        email:     tg.profiles.email,
        avatarUrl: tg.profiles.avatar_url,
      })),
      reservations: t.reservations.map((r) => ({
        id:       r.id,
        name:     r.contact_name,
        phone:    r.phone,
        adults:   r.adults,
        children: r.children,
        status:   r.status    ?? "active",
        attended: r.attended  ?? false,
        platform: r.platform  ?? "other",
        guideId:  r.guide_id  ?? null,
      })),
    },
  }));
}

// ─── READ ─────────────────────────────────────────────────────────────────────
export async function fetchTours(): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from("tours")
    .select(`
      *,
      reservations (*),
      tour_guides (
        guide_id,
        profiles ( id, name, email, avatar_url )
      )
    `)
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (error) throw new Error(`Error fetching tours: ${error.message}`);
  return adaptTours((data as TourWithReservations[]) ?? []);
}

// ─── CREATE TOUR ──────────────────────────────────────────────────────────────
export async function createTour(input: {
  title:     string;
  date:      string;
  time:      string;
  guide?:    string;
  language?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("tours")
    .insert({
      title:    input.title,
      date:     input.date,
      time:     input.time,
      guide:    input.guide    ?? null,
      language: input.language ?? "es",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Error creando tour: ${error.message}`);
  return data.id;
}

// ─── UPDATE TOUR ──────────────────────────────────────────────────────────────
export async function updateTour(
  id: string,
  input: Partial<{ title: string; date: string; time: string; guide: string; language: string }>
): Promise<void> {
  const { error } = await supabase.from("tours").update(input).eq("id", id);
  if (error) throw new Error(`Error actualizando tour: ${error.message}`);
}

// ─── DELETE TOUR ──────────────────────────────────────────────────────────────
export async function deleteTour(id: string): Promise<void> {
  const { error } = await supabase.from("tours").delete().eq("id", id);
  if (error) throw new Error(`Error eliminando tour: ${error.message}`);
}

// ─── CREATE RESERVATION ───────────────────────────────────────────────────────
export async function createReservation(input: {
  tour_id:      string;
  contact_name: string;
  phone?:       string;
  adults:       number;
  children:     number;
  status?:      string;
  attended?:    boolean;
}): Promise<string> {
  const adults   = input.adults   ?? 0;
  const children = input.children ?? 0;

  const { data, error } = await supabase
    .from("reservations")
    .insert({
      tour_id:      input.tour_id,
      contact_name: input.contact_name,
      phone:        input.phone    ?? "",
      adults,
      children,
      pax:          adults + children,
      status:       input.status   ?? "active",
      attended:     input.attended ?? false,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Error creando reserva: ${error.message}`);
  return data.id;
}

// ─── DELETE RESERVATION ───────────────────────────────────────────────────────
export async function deleteReservation(id: string): Promise<void> {
  const { error } = await supabase.from("reservations").delete().eq("id", id);
  if (error) throw new Error(`Error eliminando reserva: ${error.message}`);
}

// ─── ASIGNAR GUÍA A TOUR ──────────────────────────────────────────────────────
export async function assignGuideToTour(tourId: string, guideId: string): Promise<void> {
  const { error } = await supabase.from("tour_guides").insert({ tour_id: tourId, guide_id: guideId });
  if (error) throw new Error(`Error asignando guía: ${error.message}`);
}

// ─── DESASIGNAR GUÍA DE TOUR ──────────────────────────────────────────────────
export async function removeGuideFromTour(tourId: string, guideId: string): Promise<void> {
  const { error } = await supabase
    .from("tour_guides")
    .delete()
    .eq("tour_id", tourId)
    .eq("guide_id", guideId);
  if (error) throw new Error(`Error desasignando guía: ${error.message}`);
}

// ─── ASIGNAR GUÍA A RESERVA ───────────────────────────────────────────────────
export async function assignGuideToReservation(reservationId: string, guideId: string | null): Promise<void> {
  const { error } = await supabase
    .from("reservations")
    .update({ guide_id: guideId })
    .eq("id", reservationId);
  if (error) throw new Error(`Error asignando guía a reserva: ${error.message}`);
}