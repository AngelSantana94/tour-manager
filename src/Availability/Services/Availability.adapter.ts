import { supabase } from "../../lib/supabaseClient";

export type AvailabilityStatus = "available" | "blocked";
export type AvailabilityShift = "AM" | "PM" | "FULL";

export interface GuideAvailability {
  status: AvailabilityStatus;
  shift: AvailabilityShift;
}

export async function fetchGuideIdForCurrentUser(): Promise<string | null> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return null;

  const { data, error } = await supabase
    .from("guides")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}

export async function fetchAvailabilityForRange(
  guideId: string,
  fromDate: string,
  toDate: string,
): Promise<Record<string, GuideAvailability>> {
  const { data, error } = await supabase
    .from("guide_availability")
    .select("date, status, shift")
    .eq("guide_id", guideId)
    .gte("date", fromDate)
    .lte("date", toDate);

  if (error) {
    throw new Error(`Error obteniendo disponibilidad: ${error.message}`);
  }

  const map: Record<string, GuideAvailability> = {};

  for (const row of data ?? []) {
    map[row.date] = {
      status: row.status as AvailabilityStatus,
      shift: row.shift as AvailabilityShift,
    };
  }

  return map;
}

/**
 * Guarda la disponibilidad de los días seleccionados.
 *
 * IMPORTANTE:
 * Si ya existía algo para ese día, se elimina independientemente
 * del turno anterior y se inserta el nuevo estado/turno.
 *
 * Ejemplo:
 * FULL → AM      = AM
 * AM   → PM      = PM
 * PM   → FULL    = FULL
 * AM   → blocked = blocked/FULL
 */
export async function setAvailabilityDays(
  guideId: string,
  dates: string[],
  status: AvailabilityStatus,
  shift: AvailabilityShift,
): Promise<void> {
  if (dates.length === 0) return;

  // Eliminamos cualquier registro previo de esos días,
  // independientemente de si era AM, PM o FULL.
  const { error: delErr } = await supabase
    .from("guide_availability")
    .delete()
    .eq("guide_id", guideId)
    .in("date", dates);

  if (delErr) {
    throw new Error(
      `Error limpiando disponibilidad: ${delErr.message}`,
    );
  }

  const rows = dates.map((date) => ({
    guide_id: guideId,
    date,
    shift,
    status,
  }));

  const { error: insErr } = await supabase
    .from("guide_availability")
    .insert(rows);

  if (insErr) {
    throw new Error(
      `Error guardando disponibilidad: ${insErr.message}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AÑADIR AL FINAL de Services/Availability.adapter.ts
// (no cambia nada de lo que ya tienes; `supabase` y los tipos ya están
// importados/definidos arriba en ese archivo)
// ═══════════════════════════════════════════════════════════════════════════

// Disponibilidad de TODOS los guías en un día concreto (la usa el panel del
// calendario). Hay como mucho una fila por guía y día, porque
// setAvailabilityDays borra lo anterior antes de insertar.
export interface DayGuideAvailability {
  guide: { id: string; name: string };
  status: AvailabilityStatus;
  shift: AvailabilityShift;
}

export async function fetchGuidesAvailabilityForDate(
  date: string,
): Promise<DayGuideAvailability[]> {
  const { data, error } = await supabase
    .from("guide_availability")
    .select("guide_id, status, shift")
    .eq("date", date);

  if (error) {
    throw new Error(
      `Error obteniendo disponibilidad del día: ${error.message}`,
    );
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Dos consultas en vez de un join: así no dependemos del nombre de la FK.
  const ids = [...new Set(rows.map((r) => r.guide_id as string))];
  const { data: guides, error: guidesError } = await supabase
    .from("guides")
    .select("id, name")
    .in("id", ids);

  if (guidesError) {
    throw new Error(`Error obteniendo guías: ${guidesError.message}`);
  }

  const nameById = new Map<string, string>();
  for (const g of guides ?? []) nameById.set(g.id as string, g.name as string);

  const result: DayGuideAvailability[] = [];
  for (const r of rows) {
    const name = nameById.get(r.guide_id as string);
    if (!name) continue;
    result.push({
      guide: { id: r.guide_id as string, name },
      status: r.status as AvailabilityStatus,
      shift: r.shift as AvailabilityShift,
    });
  }

  return result.sort((a, b) => a.guide.name.localeCompare(b.guide.name));
}
