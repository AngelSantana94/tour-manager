import { useEffect, useRef, useState } from "react";
import {
  assignGuideToTour,
  createTour,
  deleteTour,
  fetchTours,
  type GuideSlot,
  removeGuideFromTour,
  supabase,
  updateTour,
} from "./Supabase.adapter";
import type { CalendarEvent } from "../CreateEventModal";

const CACHE_KEY = "vlx_tours_v1";

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
  } catch {
    // localStorage lleno o bloqueado: no es crítico, la próxima carga vuelve a pedir a Supabase
  }
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────
export function useSupabaseEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>(() => readCache());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // CAMBIO: guarda de "respuesta más reciente gana", no "la que llega
  // última gana". Si asignas dos guías seguidos (lead y luego back-up), cada
  // asignación dispara su propio loadEvents() — más el que dispara Realtime
  // solo por haber cambiado la fila — y esas llamadas pueden resolverse
  // fuera de orden. Sin esto, un fetchTours() más viejo que responde tarde
  // pisaba el estado ya actualizado con uno más nuevo (el mismo patrón "N-1"
  // que vimos en el Sheet). Cada loadEvents() se numera; si al volver ya no
  // es el último disparado, se descarta su resultado.
  const requestIdRef = useRef(0);

  // Evita recargar de golpe si Realtime dispara varios cambios seguidos
  // (por ejemplo, al correr la importación del Sheet sobre muchos tours a la vez).
  function scheduleReload() {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => loadEvents(false), 500);
  }

  // ── FETCH ────────────────────────────────────────────────────────────────
  async function loadEvents(showSpinner = false) {
    const reqId = ++requestIdRef.current;
    if (showSpinner) setLoading(true);
    try {
      const data = await fetchTours();
      if (reqId !== requestIdRef.current) return; // una llamada más nueva ya está en curso/resuelta
      writeCache(data);
      setEvents(data);
      setError(null);
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }

  // ── REALTIME ─────────────────────────────────────────────────────────────
  // Nota: RLS filtra lo que cada cuenta puede ver. Una guía solo recibirá eventos
  // de los tours donde es lead o back-up; Rocío (admin) recibe todo.
  useEffect(() => {
    const hasCache = readCache().length > 0;
    loadEvents(!hasCache);

    channelRef.current = supabase
      .channel("tours-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tours" },
        () => scheduleReload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tour_assignments" },
        () => scheduleReload(),
      )
      .subscribe();

    return () => {
      clearTimeout(timerRef.current);
      channelRef.current?.unsubscribe();
    };
  }, []);

  // ── CREATE TOUR ──────────────────────────────────────────────────────────
  async function addEvent(input: {
    tour_type: string;
    date: string;
    start_time?: string;
    city?: string;
    pax?: number;
    meeting_point?: string;
    notes?: string;
  }): Promise<void> {
    const tempId = `temp_${Date.now()}`;
    const optimistic: CalendarEvent = {
      id: tempId,
      tour: input.tour_type,
      date: input.date,
      time: input.start_time ? input.start_time.slice(0, 5) : "00:00",
      meta: {
        source: "agenda",
        pax: input.pax ?? 0,
        city: input.city ?? "Brujas",
        meetingPoint: input.meeting_point ?? null,
        notes: input.notes ?? null,
        status: "Confirmado",
        guideLead: null,
        backup1: null,
        backup2: null,
        tourGuides: [],
      },
    };

    setEvents((prev) => {
      const u = [...prev, optimistic];
      writeCache(u);
      return u;
    });

    try {
      const realId = await createTour(input);
      setEvents((prev) => {
        const u = prev.map((e) => (e.id === tempId ? { ...e, id: realId } : e));
        writeCache(u);
        return u;
      });
    } catch (err) {
      setEvents((prev) => {
        const u = prev.filter((e) => e.id !== tempId);
        writeCache(u);
        return u;
      });
      throw err;
    }
  }

  // ── UPDATE TOUR ──────────────────────────────────────────────────────────
  async function updateEvent(
    id: string,
    data: Partial<{
      tour_type: string;
      date: string;
      start_time: string;
      end_time: string;
      city: string;
      pax: number;
      meeting_point: string;
      status: string;
      notes: string;
      period: string;
      provider_id: string | null;
      tour_operator_id: string | null;
      tour_leader_id: string | null;
      tour_leader_phone: string | null;
    }>,
  ): Promise<void> {
    const backup = events.find((e) => e.id === id);
    setEvents((prev) => {
      const u = prev.map((e) =>
        e.id === id
          ? {
            ...e,
            tour: data.tour_type ?? e.tour,
            date: data.date ?? e.date,
            time: data.start_time ? data.start_time.slice(0, 5) : e.time,
            meta: {
              ...e.meta,
              city: data.city ?? e.meta?.city,
              pax: data.pax ?? e.meta?.pax,
              meetingPoint: data.meeting_point ?? e.meta?.meetingPoint,
              status: data.status ?? e.meta?.status,
              notes: data.notes ?? e.meta?.notes,
              period: data.period ?? e.meta?.period, // ← nuevo
            },
          }
          : e
      );
      writeCache(u);
      return u;
    });

    try {
      await updateTour(id, data);
    } catch (err) {
      if (backup) {
        setEvents((prev) => {
          const u = prev.map((e) => (e.id === id ? backup : e));
          writeCache(u);
          return u;
        });
      }
      throw err;
    }
  }

  // ── DELETE TOUR ──────────────────────────────────────────────────────────
  async function removeEvent(id: string): Promise<void> {
    const backup = events.find((e) => e.id === id);
    setEvents((prev) => {
      const u = prev.filter((e) => e.id !== id);
      writeCache(u);
      return u;
    });

    try {
      await deleteTour(id);
    } catch (err) {
      if (backup) {
        setEvents((prev) => {
          const u = [...prev, backup];
          writeCache(u);
          return u;
        });
      }
      throw err;
    }
  }

  // ── ASIGNAR / QUITAR GUÍA ────────────────────────────────────────────────
  async function assignGuide(
    tourId: string,
    guideId: string,
    slot: GuideSlot = "guide_lead_id",
  ): Promise<void> {
    await assignGuideToTour(tourId, guideId, slot);
    await loadEvents(false); // más simple y seguro que actualizar el nombre del guía a mano en caché
  }

  async function unassignGuide(tourId: string, slot: GuideSlot): Promise<void> {
    await removeGuideFromTour(tourId, slot);
    await loadEvents(false);
  }

  return {
    events,
    loading,
    error,
    refetch: () => loadEvents(true),
    addEvent,
    updateEvent,
    removeEvent,
    assignGuide,
    unassignGuide,
  };
}
