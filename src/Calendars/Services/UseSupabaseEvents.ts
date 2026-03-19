import { useState, useEffect, useRef } from "react";
import {
  fetchTours,
  createTour,
  updateTour,
  deleteTour,
  createReservation,
  deleteReservation,
  supabase,
} from "./Supabase.adapter";
import type { CalendarEvent } from "../CreateEventModal";
import type { Reservation } from "../Events/AddReservationModal";

const CACHE_KEY = "gw_events_v2";

// ─── CACHÉ ────────────────────────────────────────────────────────────────────
function readCache(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCache(events: CalendarEvent[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(events));
  } catch {}
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────
export function useSupabaseEvents() {
  const [events, setEvents]   = useState<CalendarEvent[]>(() => readCache());
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const channelRef            = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── FETCH ────────────────────────────────────────────────────────────────
  async function loadEvents(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const data = await fetchTours();
      writeCache(data);
      setEvents(data);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── REALTIME ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const hasCache = readCache().length > 0;
    loadEvents(!hasCache);

    // Suscripción en tiempo real — cuando Supabase recibe datos nuevos
    // (via Edge Function procesando emails) la app se actualiza sola
    channelRef.current = supabase
      .channel("tours-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tours" }, () => {
        console.log("[realtime] tours actualizado");
        loadEvents(false);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => {
        console.log("[realtime] reservations actualizado");
        loadEvents(false);
      })
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, []);

  // ── CREATE TOUR ──────────────────────────────────────────────────────────
  async function addEvent(input: {
    title: string;
    date: string;
    time: string;
    guide?: string;
    language?: string;
  }): Promise<void> {
    const tempId = `temp_${Date.now()}`;
    const optimistic: CalendarEvent = {
      id:   tempId,
      tour: input.title,
      date: input.date,
      time: input.time,
      meta: { guide: input.guide, language: input.language ?? "es", pax: 0, reservations: [] },
    };

    setEvents((prev) => { const u = [...prev, optimistic]; writeCache(u); return u; });

    try {
      const realId = await createTour(input);
      setEvents((prev) => {
        const u = prev.map((e) => e.id === tempId ? { ...e, id: realId } : e);
        writeCache(u);
        return u;
      });
    } catch (err) {
      setEvents((prev) => { const u = prev.filter((e) => e.id !== tempId); writeCache(u); return u; });
      throw err;
    }
  }

  // ── UPDATE TOUR ──────────────────────────────────────────────────────────
  async function updateEvent(
    id: string,
    data: Partial<{ title: string; date: string; time: string; guide: string; language: string }>
  ): Promise<void> {
    const backup = events.find((e) => e.id === id);
    setEvents((prev) => {
      const u = prev.map((e) => e.id === id ? {
        ...e,
        tour: data.title ?? e.tour,
        date: data.date  ?? e.date,
        time: data.time  ?? e.time,
        meta: { ...e.meta, guide: data.guide ?? e.meta?.guide, language: data.language ?? e.meta?.language },
      } : e);
      writeCache(u);
      return u;
    });

    try {
      await updateTour(id, data);
    } catch (err) {
      if (backup) { setEvents((prev) => { const u = prev.map((e) => e.id === id ? backup : e); writeCache(u); return u; }); }
      throw err;
    }
  }

  // ── DELETE TOUR ──────────────────────────────────────────────────────────
  async function removeEvent(id: string): Promise<void> {
    const backup = events.find((e) => e.id === id);
    setEvents((prev) => { const u = prev.filter((e) => e.id !== id); writeCache(u); return u; });

    try {
      await deleteTour(id);
    } catch (err) {
      if (backup) { setEvents((prev) => { const u = [...prev, backup]; writeCache(u); return u; }); }
      throw err;
    }
  }

  // ── CREATE RESERVATION ───────────────────────────────────────────────────
  async function addReservation(tourId: string, data: Omit<Reservation, "id">): Promise<void> {
    const realId = await createReservation({
      tour_id:      tourId,
      contact_name: data.name,
      phone:        data.phone,
      adults:       data.adults,
      children:     data.children,
      status:       "active",
      attended:     false,
    });

    const newRes: Reservation = { id: realId, ...data };
    setEvents((prev) => {
      const u = prev.map((e) => {
        if (e.id !== tourId) return e;
        const existing = (e.meta?.reservations as Reservation[]) ?? [];
        const newPax   = (e.meta?.pax as number ?? 0) + data.adults + data.children;
        return { ...e, meta: { ...e.meta, reservations: [...existing, newRes], pax: newPax } };
      });
      writeCache(u);
      return u;
    });
  }

  // ── DELETE RESERVATION ───────────────────────────────────────────────────
  async function removeReservation(reservationId: string, tourId: string): Promise<void> {
    await deleteReservation(reservationId);

    setEvents((prev) => {
      const u = prev.map((e) => {
        if (e.id !== tourId) return e;
        const existing   = (e.meta?.reservations as Reservation[]) ?? [];
        const removed    = existing.find((r) => r.id === reservationId);
        const removedPax = removed ? removed.adults + removed.children : 0;
        return {
          ...e,
          meta: {
            ...e.meta,
            reservations: existing.filter((r) => r.id !== reservationId),
            pax: Math.max(0, (e.meta?.pax as number ?? 0) - removedPax),
          },
        };
      });
      writeCache(u);
      return u;
    });
  }

  return {
    events,
    loading,
    error,
    refetch:          () => loadEvents(true),
    addEvent,
    updateEvent,
    removeEvent,
    addReservation,
    removeReservation,
  };
}