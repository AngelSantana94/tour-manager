import { supabase } from "../../lib/supabaseClient";

export type AvailabilityStatus = "available" | "blocked";

// No se distingue por franja: una fila cubre el día completo. La columna
// `shift` en la base solo acepta 'AM' | 'PM' | 'FULL' (restricción CHECK);
// aquí siempre se manda 'FULL' porque la disponibilidad nunca se da a medias,
// según confirmó la coordinadora — se es disponible el día entero o no.
const FIXED_SHIFT = "FULL";

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
): Promise<Record<string, AvailabilityStatus>> {
  const { data, error } = await supabase
    .from("guide_availability")
    .select("date, status")
    .eq("guide_id", guideId)
    .gte("date", fromDate)
    .lte("date", toDate);

  if (error) {
    throw new Error(`Error obteniendo disponibilidad: ${error.message}`);
  }

  const map: Record<string, AvailabilityStatus> = {};
  for (const row of data ?? []) {
    map[row.date] = row.status as AvailabilityStatus;
  }
  return map;
}

// Borra primero lo que hubiera para esos días (mismo guía, misma franja fija)
// y vuelve a insertar con el estado elegido — así no dependemos de que exista
// una restricción UNIQUE concreta en la tabla para hacer un upsert real.
export async function setAvailabilityDays(
  guideId: string,
  dates: string[],
  status: AvailabilityStatus,
): Promise<void> {
  if (dates.length === 0) return;

  const { error: delErr } = await supabase
    .from("guide_availability")
    .delete()
    .eq("guide_id", guideId)
    .eq("shift", FIXED_SHIFT)
    .in("date", dates);
  if (delErr) {
    throw new Error(`Error limpiando disponibilidad: ${delErr.message}`);
  }

  const rows = dates.map((date) => ({
    guide_id: guideId,
    date,
    shift: FIXED_SHIFT,
    status,
  }));
  const { error: insErr } = await supabase.from("guide_availability").insert(
    rows,
  );
  if (insErr) {
    throw new Error(`Error guardando disponibilidad: ${insErr.message}`);
  }
}