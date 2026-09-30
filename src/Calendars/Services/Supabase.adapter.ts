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

// Puesto de guía dentro de un tour. Coincide con el nombre de la columna en
// `tours` y con `tour_assignments.slot`.
export type GuideSlot = "guide_lead_id" | "backup_1_id" | "backup_2_id";

// ─── CONFIRMACIÓN DE GUÍAS (tour_assignments) ────────────────────────────────
export type AssignmentStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled";

// Lo que la UI necesita saber de cada puesto: qué fila es, de qué guía y cómo está.
export interface SlotAssignment {
  id: string;
  guideId: string;
  status: AssignmentStatus;
}

// Fila tal como llega de `tour_assignments` (solo las columnas que se piden).
interface AssignmentRow {
  id: string;
  tour_id: string;
  guide_id: string;
  slot: GuideSlot;
  status: AssignmentStatus;
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

  // Se rellenan en fetchTours a partir de get_visible_guides (ya NO vienen de
  // un join en TOURS_SELECT). null si no hay guía asignada o si el usuario no
  // tiene permiso para verlo.
  guide_lead: GuideRef | null;
  backup_1: GuideRef | null;
  backup_2: GuideRef | null;

  // Estado de confirmación por puesto. Se rellena en fetchTours a partir de
  // `tour_assignments` (ya NO viene de TOURS_SELECT). Un puesto sin entrada
  // = sin información (p. ej. tours pasados).
  assignments: Partial<Record<GuideSlot, SlotAssignment>>;

  // Viene del join a `tour_operators` (ver TOURS_SELECT). null si no hay operador asignado.
  tour_operator: { id: string; name: string } | null;

  // Viene del join a `providers` (ver TOURS_SELECT). null si no hay proveedor asignado.
  provider: { id: string; name: string } | null;

  // Viene del join a `tour_leaders` (ver TOURS_SELECT). null si no hay tour leader asignado.
  tour_leader: { id: string; name: string; phone: string | null } | null;
}

export interface TourEvent extends SupabaseTour {}

// Lo que devuelve TOURS_SELECT: la fila de `tours` sin los guías ni las
// asignaciones resueltos.
type TourRow = Omit<
  SupabaseTour,
  "guide_lead" | "backup_1" | "backup_2" | "assignments"
>;

// ─── PERÍODO (AM / PM / NT) ───────────────────────────────────────────────────
// Muchos tours son privados y no traen hora exacta en el Sheet, así que el
// calendario se organiza por franja en vez de por horario fijo.
// NT = "No Time" / sin definir (sin hora en el Sheet). Sustituye al antiguo "SC".
// PROVISIONAL: la hora de corte (13:00) es un supuesto, falta confirmarla
// con la coordinadora. Cuando la tengas, solo hay que cambiar este número.
export type TourPeriod = "AM" | "PM" | "NT";
const PM_CUTOFF_HOUR = 13;

export function periodFromTime(startTime: string | null): TourPeriod {
  if (!startTime) return "NT";
  const hour = parseInt(startTime.slice(0, 2), 10);
  if (Number.isNaN(hour)) return "NT";
  return hour < PM_CUTOFF_HOUR ? "AM" : "PM";
}

// Normaliza cualquier valor que llegue de la BD (por si queda algún "SC" viejo).
export function normalizePeriod(p: string | null | undefined): TourPeriod {
  return p === "AM" || p === "PM" ? p : "NT";
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
        period: normalizePeriod(t.period),
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

        // Estado de confirmación de cada puesto (pending / accepted / rejected)
        assignments: t.assignments,
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
// (sintaxis de Supabase para joins simples a otras tablas en un solo select).
//
// OJO: los guías (lead / back-ups) YA NO se piden aquí con un join. Un join a
// `guides` pasa por el RLS de `guides`, y un guía solo puede leer su propia
// fila: los nombres de sus compañeros llegaban como null. Ahora se resuelven
// aparte con fetchVisibleGuides() (función de Postgres get_visible_guides).
const TOURS_SELECT = `
  *,
  tour_operator:tour_operators!tours_tour_operator_id_fkey ( id, name ),
  provider:providers!tours_provider_id_fkey ( id, name ),
  tour_leader:tour_leaders!tours_tour_leader_id_fkey ( id, name, phone )
`;

// Supabase devuelve máximo 1000 filas por petición: se pagina para no perder tours.
const PAGE_SIZE = 1000;

/**
 * Guías que el usuario actual puede ver: la coordinadora, todos; un guía, él
 * mismo y sus compañeros de tour. Indexados por id para resolver los puestos.
 */
async function fetchVisibleGuides(): Promise<Map<string, GuideRef>> {
  const { data, error } = await supabase.rpc("get_visible_guides");
  if (error) throw new Error(`Error obteniendo guías: ${error.message}`);

  const byId = new Map<string, GuideRef>();
  for (const g of (data ?? []) as GuideRef[]) byId.set(g.id, g);
  return byId;
}

async function fetchTourRows(): Promise<TourRow[]> {
  const rows: TourRow[] = [];

  for (let from = 0;; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tours")
      .select(TOURS_SELECT)
      .order("date", { ascending: true })
      .order("id", { ascending: true }) // desempate estable para la paginación
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Error obteniendo tours: ${error.message}`);

    const page = (data as unknown as TourRow[]) ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

// Asignaciones activas y rechazadas de tours de hoy en adelante, agrupadas por
// tour. La RLS de `tour_assignments` ya decide qué ve cada cuenta.
async function fetchTourAssignments(): Promise<Map<string, AssignmentRow[]>> {
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD en hora local
  const byTour = new Map<string, AssignmentRow[]>();

  for (let from = 0;; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tour_assignments")
      .select("id, tour_id, guide_id, slot, status, tours!inner(date)")
      .in("status", ["pending", "accepted", "rejected"])
      .gte("tours.date", today)
      .order("assigned_at", { ascending: false })
      .order("id", { ascending: true }) // desempate estable para la paginación
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Error obteniendo asignaciones: ${error.message}`);
    }

    const page = (data as unknown as AssignmentRow[]) ?? [];
    for (const a of page) {
      const list = byTour.get(a.tour_id) ?? [];
      list.push(a);
      byTour.set(a.tour_id, list);
    }
    if (page.length < PAGE_SIZE) break;
  }

  return byTour;
}

// Por puesto: la asignación activa del guía que está ahora en tours.<slot>;
// si el puesto está vacío, el rechazo más reciente (para que la coordinadora
// vea que alguien dijo que no, y no que el guía desapareció sin más).
function pickAssignments(
  tour: TourRow,
  list: AssignmentRow[] | undefined,
): Partial<Record<GuideSlot, SlotAssignment>> {
  const out: Partial<Record<GuideSlot, SlotAssignment>> = {};

  for (const a of list ?? []) {
    const currentGuideId = tour[a.slot];
    const value: SlotAssignment = {
      id: a.id,
      guideId: a.guide_id,
      status: a.status,
    };

    if (a.status === "pending" || a.status === "accepted") {
      if (a.guide_id === currentGuideId) out[a.slot] = value;
    } else if (a.status === "rejected" && !currentGuideId && !out[a.slot]) {
      out[a.slot] = value;
    }
  }

  return out;
}

export async function fetchTours(): Promise<CalendarEvent[]> {
  const [rows, guideById, assignmentsByTour] = await Promise.all([
    fetchTourRows(),
    fetchVisibleGuides(),
    fetchTourAssignments(),
  ]);

  const resolve = (id: string | null): GuideRef | null =>
    id ? guideById.get(id) ?? null : null;

  const tours: TourEvent[] = rows.map((r) => ({
    ...r,
    guide_lead: resolve(r.guide_lead_id),
    backup_1: resolve(r.backup_1_id),
    backup_2: resolve(r.backup_2_id),
    assignments: pickAssignments(r, assignmentsByTour.get(r.id)),
  }));

  // El orden por hora se hace aquí porque a veces start_time es null (sin hora aún)
  return adaptTours(tours).sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
  );
}

// ─── CONFIRMACIÓN DE ASIGNACIONES (guía acepta / rechaza) ────────────────────
// Las funciones de Postgres respond_tour_assignment y admin_confirm_assignment
// aún no están en database.types.ts, así que se llaman con este wrapper sin
// tipos para que TypeScript no se queje. Cuando regeneres los tipos, puedes
// sustituirlo por supabase.rpc(...) directamente.
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

export async function fetchCurrentGuideId(): Promise<string | null> {
  const { data, error } = await rpc("current_guide_id");
  if (error) throw new Error(`Error obteniendo guía actual: ${error.message}`);
  return (data as string | null) ?? null;
}

// ¿La cuenta actual es coordinadora/admin? (función de Postgres is_admin)
export async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await rpc("is_admin");
  if (error) throw new Error(`Error comprobando permisos: ${error.message}`);
  return data === true;
}

export async function respondToAssignment(
  assignmentId: string,
  accept: boolean,
): Promise<void> {
  const { error } = await rpc("respond_tour_assignment", {
    p_assignment_id: assignmentId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
}

export async function adminConfirmAssignment(
  assignmentId: string,
): Promise<void> {
  const { error } = await rpc("admin_confirm_assignment", {
    p_assignment_id: assignmentId,
  });
  if (error) throw new Error(error.message);
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
// El trigger sync_tour_assignments crea / cancela la fila de `tour_assignments`
// dentro de la misma transacción.
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

// ─── GUÍAS ASIGNABLES A UN TOUR ───────────────────────────────────────────────
// Un guía aparece en la lista SOLO si:
//   1) dio disponibilidad ese día por la webapp (sin datos = no aparece;
//      no hay "mostrar todos": la confirmación es únicamente por este canal), y
//   2) no choca con otro tour no cancelado del mismo día (ver regla abajo).
//
// REGLA DE CHOQUE (misma fecha, tours no cancelados):
//   AM + PM  → permitido
//   AM + AM  → NO
//   PM + PM  → NO
//   NT + NT  → NO
//   NT + AM/PM → no choca (por eso cada tour debería pasar a AM o PM cuanto antes)

export type GuideAvailabilityShift = "AM" | "PM" | "FULL";

// Si true, ser back-up en otro tour de la misma franja también bloquea al guía.
// Si Rocío quiere que solo cuente el lead, ponlo en false.
const BACKUPS_COUNT_AS_BUSY = true;

export async function fetchAvailableGuideIdsForDate(
  date: string,
  tourPeriod: TourPeriod,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("guide_availability")
    .select("guide_id, status, shift")
    .eq("date", date);

  if (error) {
    throw new Error(
      `Error obteniendo disponibilidad de guías: ${error.message}`,
    );
  }

  const available = new Set<string>();
  const blocked = new Set<string>();

  // ¿Esta fila de disponibilidad aplica a la franja del tour?
  //  · FULL aplica a cualquier franja.
  //  · NT (tour sin franja definida) acepta cualquier fila: la disponibilidad
  //    se guarda como día completo, así que basta con que el guía la haya dado.
  //  · AM solo aplica a tours AM; PM solo a tours PM.
  const applies = (shift: GuideAvailabilityShift): boolean =>
    shift === "FULL" || tourPeriod === "NT" || shift === tourPeriod;

  for (const row of data ?? []) {
    const shift = row.shift as GuideAvailabilityShift;
    if (!applies(shift)) continue;

    if (row.status === "blocked") blocked.add(row.guide_id);
    else if (row.status === "available") available.add(row.guide_id);
  }

  // Un bloqueo explícito que aplique a la franja gana sobre cualquier "available".
  for (const id of blocked) available.delete(id);

  return available;
}

// Guías ocupados ese día en OTROS tours no cancelados que chocan con `tourPeriod`.
export async function fetchBusyGuideIdsForDate(
  date: string,
  tourPeriod: TourPeriod,
  excludeTourId?: string,
): Promise<Set<string>> {
  let query = supabase
    .from("tours")
    .select("id, period, guide_lead_id, backup_1_id, backup_2_id")
    .eq("date", date)
    // .neq solo excluiría también los null; así se conservan los tours sin status.
    .or("status.is.null,status.neq.Cancelado");

  if (excludeTourId) query = query.neq("id", excludeTourId);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error obteniendo guías ocupados: ${error.message}`);
  }

  // Cast explícito: si los tipos generados de Supabase no conocen alguna
  // columna (period, guide_lead_id...), evita las líneas rojas de TypeScript.
  const rows = (data ?? []) as unknown as {
    id: string;
    period: string | null;
    guide_lead_id: string | null;
    backup_1_id: string | null;
    backup_2_id: string | null;
  }[];

  const busy = new Set<string>();

  for (const row of rows) {
    // Choca solo si es exactamente la misma franja (AM-AM, PM-PM, NT-NT).
    if (normalizePeriod(row.period) !== tourPeriod) continue;

    const ids = [row.guide_lead_id];
    if (BACKUPS_COUNT_AS_BUSY) ids.push(row.backup_1_id, row.backup_2_id);

    for (const id of ids) if (id) busy.add(id);
  }

  return busy;
}

// Conjunto final de guías que se pueden asignar a este tour.
export async function fetchAssignableGuideIds(
  date: string,
  tourPeriod: TourPeriod,
  tourId?: string,
): Promise<Set<string>> {
  const [available, busy] = await Promise.all([
    fetchAvailableGuideIdsForDate(date, tourPeriod),
    fetchBusyGuideIdsForDate(date, tourPeriod, tourId),
  ]);

  for (const id of busy) available.delete(id);
  return available;
}
