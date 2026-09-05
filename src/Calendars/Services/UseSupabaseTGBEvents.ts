import { useEffect, useRef, useState } from "react";
import {
  clearScheduleException,
  fetchTgbEvents,
  supabase,
  upsertScheduleException,
} from "./SupabaseTGB.adapter";
import type { CalendarEvent } from "../CreateEventModal";

const CACHE_KEY = "tgb_events_v2";

// TGB tiene bajo volumen (pocas reservas al mes), así que en vez de recalcular
// el rango según la semana/mes visible, se trae de una vez una ventana amplia.
// Ajustar aquí si en algún momento hace falta más margen hacia atrás o adelante.
const PAST_DAYS = 60;
const FUTURE_DAYS = 365;

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

// ─── HELPERS DE FECHA ───────────────────────────────────────────────────────────
function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${
    pad(date.getDate())
  }`;
}

function getWindow(): { startDate: string; endDate: string } {
  const start = new Date();
  start.setDate(start.getDate() - PAST_DAYS);
  const end = new Date();
  end.setDate(end.getDate() + FUTURE_DAYS);
  return { startDate: toISODate(start), endDate: toISODate(end) };
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────
export function useSupabaseTGBEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>(() => readCache());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── FETCH ────────────────────────────────────────────────────────────────
  async function loadEvents(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const { startDate, endDate } = getWindow();
      const data = await fetchTgbEvents(startDate, endDate);
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

    channelRef.current = supabase
      .channel("tgb-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedule_exceptions" },
        () => {
          console.log("[realtime tgb] schedule_exceptions actualizado");
          loadEvents(false);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          console.log("[realtime tgb] bookings actualizado");
          loadEvents(false);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tour_schedule" },
        () => {
          console.log("[realtime tgb] tour_schedule actualizado");
          loadEvents(false);
        },
      )
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, []);

  // ── EDITAR AFORO / CERRAR UN DÍA CONCRETO ────────────────────────────────
  async function upsertException(
    scheduleId: string,
    date: string,
    input: { customCapacity?: number | null; isClosed?: boolean },
  ): Promise<void> {
    const eventId = `${scheduleId}_${date}`;
    const backup = events.find((e) => e.id === eventId);

    // Optimista: refleja el cambio de inmediato en la tarjeta sin esperar refetch
    setEvents((prev) => {
      const u = prev.map((e) => {
        if (e.id !== eventId) return e;
        const baseCapacity = e.meta?.baseCapacity as number | undefined;
        return {
          ...e,
          meta: {
            ...e.meta,
            maxCapacity: input.customCapacity !== undefined
              ? input.customCapacity ?? baseCapacity ?? e.meta?.maxCapacity
              : e.meta?.maxCapacity,
            isClosed: input.isClosed ?? e.meta?.isClosed,
          },
        };
      });
      writeCache(u);
      return u;
    });

    try {
      await upsertScheduleException(scheduleId, date, input);
    } catch (err) {
      if (backup) {
        setEvents((prev) => {
          const u = prev.map((e) => (e.id === eventId ? backup : e));
          writeCache(u);
          return u;
        });
      }
      throw err;
    }
  }

  // ── QUITAR EXCEPCIÓN (volver al aforo base del horario, sin cierre) ──────
  async function clearException(
    scheduleId: string,
    date: string,
  ): Promise<void> {
    const eventId = `${scheduleId}_${date}`;
    const backup = events.find((e) => e.id === eventId);

    setEvents((prev) => {
      const u = prev.map((e) =>
        e.id === eventId
          ? {
            ...e,
            meta: {
              ...e.meta,
              maxCapacity: e.meta?.baseCapacity ?? e.meta?.maxCapacity,
              isClosed: false,
              exceptionId: null,
            },
          }
          : e
      );
      writeCache(u);
      return u;
    });

    try {
      await clearScheduleException(scheduleId, date);
    } catch (err) {
      if (backup) {
        setEvents((prev) => {
          const u = prev.map((e) => (e.id === eventId ? backup : e));
          writeCache(u);
          return u;
        });
      }
      throw err;
    }
  }

  return {
    events,
    loading,
    error,
    refetch: () => loadEvents(true),
    upsertException,
    clearException,
  };
}
