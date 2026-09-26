import { supabase } from "../../lib/supabaseClient";
import type { CalendarEvent } from "../CreateEventModal";

export { supabase };

// ─── TIPOS ────────────────────────────────────────────────────────────────────
// `tours` viene de dos orígenes:
//  · Agenda (importado del Sheet cada semana): service_id, start_time, tour_type,
//    city, pax, meeting_point, status, notes, guide_lead_id, backup_1_id, backup_2_id...
//  · Creado a mano en la webapp: por ahora usa las mismas columnas (tour_type
//    hace de título, start_time de hora). No hay columnas "OTA" separadas.
export interface GuideRef {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface SupabaseTour {
  id: string;
  date: string;
  created_at: string;

  service_id: string | null;
  start_time: string | null;
  end_time: string | null;
  tour_type: string | null;
  city: string | null;
  pax: number | null;
  meeting_point: string | null;
  status: string | null;
  notes: string | null;
  tour_leader_phone: string | null;
  tour_operator_id: string | null;
  provider_id: string | null;
  tour_leader_id: string | null;
  period: string; // "AM" | "PM" | "NT"

  guide_lead_id: string | null;
  backup_1_id: string | null;
  backup_2_id: string | null;

  // Vienen del join a `guides` (ver TOURS_SELECT). null si no hay guía asignada.
  guide_lead: GuideRef | null;
  backup_1: GuideRef | null;
  backup_2: GuideRef | null;

  // Viene del join a `tour_operators` (ver TOURS_SELECT). null si no hay operador asignado.
  tour_operator: { id: string; name: string } | null;

  // Viene del join a `providers` (ver TOURS_SELECT). null si no hay proveedor asignado.
  provider: { id: string; name: string } | null;

  // Viene del join a `tour_leaders` (ver TOURS_SELECT). null si no hay tour leader asignado.
  tour_leader: { id: string; name: string; phone: string | null } | null;
}

export interface TourEvent extends SupabaseTour {}

// ─── PERÍODO (AM / PM / NT) ───────────────────────────────────────────────────
// Muchos tours son privados y no traen hora exacta en el Sheet, así que el
// calendario se organiza por franja en vez de por horario fijo.
// PROVISIONAL: la hora de corte (13:00) es un supuesto mío, falta confirmarla
// con la coordinadora. Cuando la tengas, solo hay que cambiar este número.
export type TourPeriod = "AM" | "PM" | "SC"; // SC = Sin Calificar (sin hora en el Sheet)
const PM_CUTOFF_HOUR = 13;

export function periodFromTime(startTime: string | null): TourPeriod {
  if (!startTime) return "SC";
  const hour = parseInt(startTime.slice(0, 2), 10);
  if (Number.isNaN(hour)) return "SC";
  return hour < PM_CUTOFF_HOUR ? "AM" : "PM";
}

// ─── ADAPTADOR: Supabase → CalendarEvent ──────────────────────────────────────
export function adaptTours(tours: TourEvent[]): CalendarEvent[] {
  return tours.map((t) => {
    const time = t.start_time ? t.start_time.slice(0, 5) : "00:00";

    const tourGuides = [t.guide_lead, t.backup_1, t.backup_2]
      .filter((g): g is GuideRef => g !== null)
      .map((g) => ({ id: g.id, name: g.name, phone: g.phone, email: g.email }));

    return {
      id: t.id,
      tour: t.tour_type ?? "",
      date: t.date,
      time,
      meta: {
        source: "agenda",
        pax: t.pax ?? 0,
        period: t.period ?? "NT",
        operatorName: t.tour_operator?.name ?? null,
        // Para colorear las tarjetas por proveedor (solo 3): no depende de
        // ningún join, `provider_id` ya viene siempre en la fila de `tours`.
        providerId: t.provider_id ?? null,
        // Para mostrarlo como texto en EventBody ("Proveedor: X").
        providerName: t.provider?.name ?? null,
        // Nombre del tour leader ("guía correo"); el teléfono sigue viniendo
        // aparte en tour_leader_phone (columna de texto directa en `tours`).
        tourLeaderName: t.tour_leader?.name ?? null,

        serviceId: t.service_id,
        noTime: t.start_time === null, // true => "00:00" es un relleno, no un dato real
        endTime: t.end_time ? t.end_time.slice(0, 5) : null,
        tourType: t.tour_type,
        city: t.city,
        meetingPoint: t.meeting_point,
        status: t.status,
        notes: t.notes,
        leaderPhone: t.tour_leader_phone,

        operatorId: t.tour_operator_id ?? null,
        tourLeaderId: t.tour_leader_id ?? null,

        // Guías asignados al tour (lead + back-ups), ya resueltos desde `guides`
        guideLead: t.guide_lead,
        backup1: t.backup_1,
        backup2: t.backup_2,
        tourGuides,
      },
    };
  });
}

// ─── DISPONIBILIDAD POR FRANJA (tour_type + hora) ──────────────────────────
// Ya no hay un "schedule" fijo: cada franja se identifica por tour_type +
// start_time. "open" = el tour de ese día tiene status distinto de
// "Cancelado"; "closed" = tiene status "Cancelado".
export interface TourSlot {
  id: string; // slotId(tourType, time)
  tourType: string;
  time: string | null; // "HH:MM" o null si el tour no tiene hora fija
  tour_operator: { id: string; name: string } | null;
}

export type SlotDayState = "open" | "closed";

export interface SlotAvailabilityMap {
  [dateISO: string]: {
    [slotId: string]: { state: SlotDayState; tourId: string };
  };
}

export function slotId(tourType: string, time: string | null): string {
  return `${tourType}__${time ?? "sin-hora"}`;
}

export async function fetchSlotAvailabilityMap(
  slots: TourSlot[],
  fromDate: string,
  toDate: string,
): Promise<SlotAvailabilityMap> {
  if (slots.length === 0) return {};

  const tourTypes = [...new Set(slots.map((s) => s.tourType))];

  const { data, error } = await supabase
    .from("tours")
    .select("id, date, tour_type, start_time, status")
    .in("tour_type", tourTypes)
    .gte("date", fromDate)
    .lte("date", toDate);

  if (error) {
    throw new Error(`Error obteniendo disponibilidad: ${error.message}`);
  }

  const slotByKey = new Set(slots.map((s) => s.id));
  const map: SlotAvailabilityMap = {};

  for (const row of data ?? []) {
    const time = row.start_time ? row.start_time.slice(0, 5) : null;
    const key = slotId(row.tour_type ?? "", time);
    if (!slotByKey.has(key)) continue; // no es una de las franjas del paso 1

    if (!map[row.date]) map[row.date] = {};
    map[row.date][key] = {
      state: row.status === "Cancelado" ? "closed" : "open",
      tourId: row.id,
    };
  }

  return map;
}

// ─── CERRAR / REABRIR TOURS EN BLOQUE ──────────────────────────────────────
// close = true  → status "Cancelado" (quitar disponibilidad)
// close = false → status "Confirmado" (reabrir)
export async function setToursStatusBulk(
  tourIds: string[],
  close: boolean,
): Promise<void> {
  if (tourIds.length === 0) return;
  const { error } = await supabase
    .from("tours")
    .update({ status: close ? "Cancelado" : "Confirmado" })
    .in("id", tourIds);
  if (error) {
    throw new Error(`Error actualizando disponibilidad: ${error.message}`);
  }
}

// ─── READ ─────────────────────────────────────────────────────────────────────
// Los alias apuntan a distintas tablas de referencia por columnas de FK
// (sintaxis de Supabase para "múltiples FKs a la misma tabla" y para joins
// simples a otras tablas en un solo select).
const TOURS_SELECT = `
  *,
  guide_lead:guides!tours_guide_lead_id_fkey ( id, name, phone, email ),
  backup_1:guides!tours_backup_1_id_fkey ( id, name, phone, email ),
  backup_2:guides!tours_backup_2_id_fkey ( id, name, phone, email ),
  tour_operator:tour_operators!tours_tour_operator_id_fkey ( id, name ),
  provider:providers!tours_provider_id_fkey ( id, name ),
  tour_leader:tour_leaders!tours_tour_leader_id_fkey ( id, name, phone )
`;

// Supabase devuelve máximo 1000 filas por petición: se pagina para no perder tours.
const PAGE_SIZE = 1000;

export async function fetchTours(): Promise<CalendarEvent[]> {
  const rows: TourEvent[] = [];

  for (let from = 0;; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tours")
      .select(TOURS_SELECT)
      .order("date", { ascending: true })
      .order("id", { ascending: true }) // desempate estable para la paginación
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Error obteniendo tours: ${error.message}`);

    const page = (data as unknown as TourEvent[]) ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  // El orden por hora se hace aquí porque a veces start_time es null (sin hora aún)
  return adaptTours(rows).sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
  );
}

// ─── CREATE TOUR ──────────────────────────────────────────────────────────────
export async function createTour(input: {
  tour_type: string;
  date: string;
  start_time?: string;
  city?: string;
  pax?: number;
  meeting_point?: string;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("tours")
    .insert({
      tour_type: input.tour_type,
      date: input.date,
      start_time: input.start_time ?? null,
      city: input.city ?? "Brujas",
      pax: input.pax ?? null,
      meeting_point: input.meeting_point ?? null,
      status: "Confirmado",
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Error creando tour: ${error.message}`);
  return data.id;
}

// ─── UPDATE TOUR ──────────────────────────────────────────────────────────────
export async function updateTour(
  id: string,
  input: Partial<{
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
  const { error } = await supabase.from("tours").update(input).eq("id", id);
  if (error) throw new Error(`Error actualizando tour: ${error.message}`);
}

// ─── DELETE TOUR ──────────────────────────────────────────────────────────────
export async function deleteTour(id: string): Promise<void> {
  const { error } = await supabase.from("tours").delete().eq("id", id);
  if (error) throw new Error(`Error eliminando tour: ${error.message}`);
}

// ─── ASIGNAR / DESASIGNAR GUÍA (lead o back-up) ───────────────────────────────
// `slot` en vez de una tabla intermedia: en este esquema cada tour tiene como
// máximo un lead y dos back-ups, guardados directo en columnas de `tours`.
export type GuideSlot = "guide_lead_id" | "backup_1_id" | "backup_2_id";

export async function assignGuideToTour(
  tourId: string,
  guideId: string,
  slot: GuideSlot = "guide_lead_id",
): Promise<void> {
  const { error } = await supabase.from("tours").update({ [slot]: guideId }).eq(
    "id",
    tourId,
  );
  if (error) throw new Error(`Error asignando guía: ${error.message}`);
}

export async function removeGuideFromTour(
  tourId: string,
  slot: GuideSlot,
): Promise<void> {
  const { error } = await supabase.from("tours").update({ [slot]: null }).eq(
    "id",
    tourId,
  );
  if (error) throw new Error(`Error desasignando guía: ${error.message}`);
}
