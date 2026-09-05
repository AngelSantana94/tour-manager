import { supabase } from "../../lib/supabaseClientTGB";
import type { CalendarEvent } from "../CreateEventModal";

export { supabase };

// ─── TIPOS (tablas TGB) ────────────────────────────────────────────────────────
export interface TgbTour {
  id: string;
  type: string;
  city: string;
  slug: string;
  name: string;
  description: string | null;
  meeting_point: string | null;
  duration_minutes: number;
  price_adult: number;
  price_minor: number;
  is_active: boolean;
  image_url: string | null;
  created_at: string;
}

export interface TgbSchedule {
  id: string;
  tour_id: string;
  time: string; // "HH:MM:SS"
  capacity: number;
  days_of_week: number[]; // 0 = domingo ... 6 = sábado (mismo criterio que EXTRACT(dow))
  language: string; // 'es' por defecto, abierto a futuros idiomas
  is_active: boolean;
}

export interface TgbScheduleException {
  id: string;
  schedule_id: string;
  exception_date: string; // "YYYY-MM-DD"
  custom_capacity: number | null;
  is_closed: boolean | null;
  reason: string | null;
  created_at: string;
}

export interface TgbBooking {
  id: string;
  tour_id: string;
  schedule_id: string;
  booking_date: string;
  booking_time: string;
  customer_name: string;
  email: string;
  phone: string | null;
  num_adults: number;
  num_minors: number;
  status: string;
  notes: string | null;
  created_at: string;
  cancellation_reason: string | null;
  cancellation_note: string | null;
}

// Fila combinada que devuelve la query de lectura (schedule + su tour)
interface TgbScheduleWithTour extends TgbSchedule {
  tours: TgbTour | null;
}

// ─── HELPERS DE FECHAS ─────────────────────────────────────────────────────────
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Genera cada fecha (inclusive) entre startDate y endDate ("YYYY-MM-DD")
function enumerateDates(startDate: string, endDate: string): string[] {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  const dates: string[] = [];
  while (cursor <= end) {
    dates.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// Día de la semana en el mismo criterio que Postgres EXTRACT(dow): 0 = domingo
function dowOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

// ─── ADAPTADOR: filas TGB → CalendarEvent ──────────────────────────────────────
function adaptTgbSchedules(
  schedules: TgbScheduleWithTour[],
  exceptions: TgbScheduleException[],
  bookings: TgbBooking[],
  startDate: string,
  endDate: string,
): CalendarEvent[] {
  const dates = enumerateDates(startDate, endDate);
  const events: CalendarEvent[] = [];

  for (const schedule of schedules) {
    if (!schedule.is_active || !schedule.tours) continue;

    for (const date of dates) {
      if (!schedule.days_of_week.includes(dowOf(date))) continue;

      const exception = exceptions.find(
        (e) => e.schedule_id === schedule.id && e.exception_date === date,
      );

      const bookingsForSlot = bookings.filter(
        (b) => b.schedule_id === schedule.id && b.booking_date === date,
      );

      const maxCapacity = exception?.custom_capacity ?? schedule.capacity;
      const isClosed = exception?.is_closed ?? false;

      // Solo se cuentan para el aforo las reservas activas (no canceladas)
      const pax = bookingsForSlot
        .filter((b) => b.status !== "cancelled")
        .reduce((acc, b) => acc + b.num_adults + b.num_minors, 0);

      events.push({
        id: `${schedule.id}_${date}`,
        tour: schedule.tours.name,
        date,
        time: schedule.time.slice(0, 5),
        meta: {
          source: "tgb", // permite a BoardWeek/EventPage distinguirlo de OTA sin adivinar por texto
          tourId: schedule.tour_id,
          scheduleId: schedule.id,
          language: schedule.language,
          maxCapacity,
          baseCapacity: schedule.capacity, // aforo del horario sin excepciones, para poder revertir sin refetch
          isClosed,
          exceptionId: exception?.id ?? null,
          pax,
          tourGuides: [], // TGB no gestiona guías
          reservations: bookingsForSlot.map((b) => ({
            id: b.id,
            name: b.customer_name,
            phone: b.phone,
            adults: b.num_adults,
            children: b.num_minors,
            status: b.status,
            attended: false, // control de asistencia no aplica a TGB (de momento)
            platform: "tuguia",
            guideId: null,
          })),
        },
      });
    }
  }

  return events;
}

// ─── READ ───────────────────────────────────────────────────────────────────────
export async function fetchTgbEvents(
  startDate: string,
  endDate: string,
): Promise<CalendarEvent[]> {
  const [schedulesRes, exceptionsRes, bookingsRes] = await Promise.all([
    supabase
      .from("tour_schedule")
      .select("*, tours(*)")
      .eq("is_active", true),
    supabase
      .from("schedule_exceptions")
      .select("*")
      .gte("exception_date", startDate)
      .lte("exception_date", endDate),
    supabase
      .from("bookings")
      .select("*")
      .gte("booking_date", startDate)
      .lte("booking_date", endDate),
  ]);

  if (schedulesRes.error) {
    throw new Error(
      `Error obteniendo horarios TGB: ${schedulesRes.error.message}`,
    );
  }
  if (exceptionsRes.error) {
    throw new Error(
      `Error obteniendo excepciones TGB: ${exceptionsRes.error.message}`,
    );
  }
  if (bookingsRes.error) {
    throw new Error(
      `Error obteniendo reservas TGB: ${bookingsRes.error.message}`,
    );
  }

  // Filtra solo tours activos (por si algún schedule quedó activo con tour desactivado)
  const schedules = (schedulesRes.data as TgbScheduleWithTour[]).filter(
    (s) => s.tours?.is_active,
  );

  return adaptTgbSchedules(
    schedules,
    exceptionsRes.data as TgbScheduleException[],
    bookingsRes.data as TgbBooking[],
    startDate,
    endDate,
  );
}

// ─── WRITE (único CRUD real: schedule_exceptions) ──────────────────────────────

// Crea o actualiza la excepción de un día concreto (aforo custom y/o cierre).
// No pide motivo: el guía necesita poder actuar rápido sin fricción.
export async function upsertScheduleException(
  scheduleId: string,
  exceptionDate: string,
  input: {
    customCapacity?: number | null;
    isClosed?: boolean;
  },
): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from("schedule_exceptions")
    .select("id")
    .eq("schedule_id", scheduleId)
    .eq("exception_date", exceptionDate)
    .maybeSingle();

  if (findError) {
    throw new Error(
      `Error comprobando excepción existente: ${findError.message}`,
    );
  }

  const payload: Record<string, unknown> = {};
  if (input.customCapacity !== undefined) {
    payload.custom_capacity = input.customCapacity;
  }
  if (input.isClosed !== undefined) {
    payload.is_closed = input.isClosed;
  }

  if (existing) {
    const { error } = await supabase
      .from("schedule_exceptions")
      .update(payload)
      .eq("id", existing.id);
    if (error) {
      throw new Error(`Error actualizando excepción: ${error.message}`);
    }
    return;
  }

  const { error } = await supabase.from("schedule_exceptions").insert({
    schedule_id: scheduleId,
    exception_date: exceptionDate,
    ...payload,
  });
  if (error) {
    throw new Error(`Error creando excepción: ${error.message}`);
  }
}

// Elimina la excepción de un día (vuelve al aforo base del horario, sin cierre)
export async function clearScheduleException(
  scheduleId: string,
  exceptionDate: string,
): Promise<void> {
  const { error } = await supabase
    .from("schedule_exceptions")
    .delete()
    .eq("schedule_id", scheduleId)
    .eq("exception_date", exceptionDate);

  if (error) {
    throw new Error(`Error eliminando excepción: ${error.message}`);
  }
}

// ─── BASE DE OPERACIONES: disponibilidad planificada (cierres/aperturas en bloque) ─
// A diferencia de upsertScheduleException/clearScheduleException (que gestionan
// aforo puntual desde la tarjeta del calendario), esto es para que el guía
// planifique con antelación qué días NO habrá tour en uno o varios horarios
// de un tour — usa exclusivamente is_closed, nunca custom_capacity.

// Tours gestionables desde la "base de operaciones" (se excluyen los privados)
export async function fetchManageableTours(): Promise<TgbTour[]> {
  const { data, error } = await supabase
    .from("tours")
    .select("*")
    .neq("type", "private")
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new Error(`Error obteniendo tours gestionables: ${error.message}`);
  }
  return (data as TgbTour[]) ?? [];
}

// Horarios activos de un tour concreto (para los checkboxes del paso 1)
export async function fetchSchedulesForTour(
  tourId: string,
): Promise<TgbSchedule[]> {
  const { data, error } = await supabase
    .from("tour_schedule")
    .select("*")
    .eq("tour_id", tourId)
    .eq("is_active", true)
    .order("time");

  if (error) {
    throw new Error(`Error obteniendo horarios del tour: ${error.message}`);
  }
  return (data as TgbSchedule[]) ?? [];
}

export type ScheduleDayState = "open" | "closed";

// Mapa fecha -> scheduleId -> estado, para los horarios seleccionados en el
// rango dado. Solo incluye combinaciones donde el horario realmente opera ese
// día de la semana (days_of_week) — si no opera, no aparece ni abierto ni
// cerrado, es irrelevante para ese día.
export async function fetchScheduleAvailabilityMap(
  schedules: TgbSchedule[],
  startDate: string,
  endDate: string,
): Promise<Record<string, Record<string, ScheduleDayState>>> {
  const scheduleIds = schedules.map((s) => s.id);
  if (scheduleIds.length === 0) return {};

  const { data: exceptions, error } = await supabase
    .from("schedule_exceptions")
    .select("schedule_id, exception_date, is_closed")
    .in("schedule_id", scheduleIds)
    .gte("exception_date", startDate)
    .lte("exception_date", endDate);

  if (error) {
    throw new Error(`Error obteniendo excepciones: ${error.message}`);
  }

  const closedSet = new Set(
    (exceptions ?? [])
      .filter((e) => e.is_closed === true)
      .map((e) => `${e.schedule_id}_${e.exception_date}`),
  );

  const map: Record<string, Record<string, ScheduleDayState>> = {};
  const dates = enumerateDates(startDate, endDate);

  for (const date of dates) {
    const dow = dowOf(date);
    for (const schedule of schedules) {
      if (!schedule.days_of_week.includes(dow)) continue;
      const isClosed = closedSet.has(`${schedule.id}_${date}`);
      if (!map[date]) map[date] = {};
      map[date][schedule.id] = isClosed ? "closed" : "open";
    }
  }

  return map;
}

// Aplica (o revierte) un cierre planificado sobre pares horario+fecha
// concretos. A diferencia de clearScheduleException, esto NUNCA borra
// custom_capacity — solo toca is_closed, para no pisar un aforo puntual que
// pudiera existir ese mismo día por otro motivo.
export async function setScheduleClosed(
  scheduleId: string,
  date: string,
  isClosed: boolean,
): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from("schedule_exceptions")
    .select("id, custom_capacity")
    .eq("schedule_id", scheduleId)
    .eq("exception_date", date)
    .maybeSingle();

  if (findError) {
    throw new Error(
      `Error comprobando excepción existente: ${findError.message}`,
    );
  }

  if (existing) {
    // Al reabrir, si no queda ningún aforo personalizado, se limpia la fila
    // entera para no dejar registros vacíos sin propósito.
    if (!isClosed && existing.custom_capacity === null) {
      const { error } = await supabase
        .from("schedule_exceptions")
        .delete()
        .eq("id", existing.id);
      if (error) throw new Error(`Error reabriendo horario: ${error.message}`);
      return;
    }
    const { error } = await supabase
      .from("schedule_exceptions")
      .update({ is_closed: isClosed })
      .eq("id", existing.id);
    if (error) throw new Error(`Error actualizando cierre: ${error.message}`);
    return;
  }

  // No existía fila: si es reabrir, no hay nada que hacer (ya está abierto
  // por defecto sin excepción).
  if (!isClosed) return;

  const { error } = await supabase.from("schedule_exceptions").insert({
    schedule_id: scheduleId,
    exception_date: date,
    is_closed: true,
  });
  if (error) throw new Error(`Error creando cierre: ${error.message}`);
}

// Aplica setScheduleClosed sobre una lista explícita de pares horario+fecha
// (el llamador decide exactamente qué pares tocar, ya filtrados por estado
// actual — evita crear excepciones sin sentido para días que un horario ni
// siquiera opera).
export async function setScheduleClosedBulk(
  pairs: { scheduleId: string; date: string }[],
  isClosed: boolean,
): Promise<void> {
  await Promise.all(
    pairs.map((p) => setScheduleClosed(p.scheduleId, p.date, isClosed)),
  );
}
