import { supabase } from "../../lib/supabaseClient";

// ─── TIPOS ────────────────────────────────────────────────────────────────────
export interface MetricsViewer {
  isAdmin: boolean;
  guideId: string | null;
}

// Una fila de ranking: cuántos tours hay con ese proveedor / operador.
export interface CountRow {
  key: string;
  name: string;
  tours: number;
}

export interface AdminMetrics {
  totalTours: number;
  byProvider: CountRow[];
  byOperator: CountRow[];
}

export interface GuideMetrics {
  totalTours: number;
  asLead: number; // tours como guía lead
  asBackup: number; // tours como back-up 1 o 2
  byProvider: CountRow[];
  byOperator: CountRow[];
}

interface NamedRef {
  id: string;
  name: string;
}

interface DoneTourRow {
  id: string;
  status: string | null;
  guide_lead_id: string | null;
  backup_1_id: string | null;
  backup_2_id: string | null;
  provider: NamedRef | null;
  tour_operator: NamedRef | null;
}

const NO_PROVIDER = "Sin proveedor";
const NO_OPERATOR = "Sin operador";

// Supabase devuelve máximo 1000 filas por petición: se pagina.
const PAGE_SIZE = 1000;

// Mismos joins (misma sintaxis de FK) que ya usa el adapter del calendario.
const DONE_TOURS_SELECT = `
  id, status, guide_lead_id, backup_1_id, backup_2_id,
  provider:providers!tours_provider_id_fkey ( id, name ),
  tour_operator:tour_operators!tours_tour_operator_id_fkey ( id, name )
`;

// ─── QUIÉN MIRA ───────────────────────────────────────────────────────────────
export async function fetchMetricsViewer(): Promise<MetricsViewer> {
  const [adminRes, guideRes] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase.rpc("current_guide_id"),
  ]);
  if (adminRes.error) {
    throw new Error(`Error comprobando permisos: ${adminRes.error.message}`);
  }
  if (guideRes.error) {
    throw new Error(`Error obteniendo tu perfil de guía: ${guideRes.error.message}`);
  }
  return {
    isAdmin: adminRes.data === true,
    guideId: (guideRes.data as string | null) ?? null,
  };
}

// ─── TOURS "HECHOS" ───────────────────────────────────────────────────────────
// REGLA ÚNICA de "tour hecho" (cámbiala aquí y cambia en todas las métricas):
//   · no está cancelado, y
//   · su fecha ya pasó, o ya está finalizado (completed_at) aunque sea de hoy.
// La RLS decide qué filas ve cada cuenta: un guía solo recibe sus tours.
async function fetchDoneTours(): Promise<DoneTourRow[]> {
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD en hora local
  const rows: DoneTourRow[] = [];

  for (let from = 0;; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tours")
      .select(DONE_TOURS_SELECT)
      .or(`date.lt.${today},completed_at.not.is.null`)
      .order("date", { ascending: true })
      .order("id", { ascending: true }) // desempate estable para la paginación
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Error obteniendo tours: ${error.message}`);

    const page = (data as unknown as DoneTourRow[]) ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows.filter((r) => r.status !== "Cancelado");
}

// ─── AGREGADOS ────────────────────────────────────────────────────────────────
function countByRef(
  rows: DoneTourRow[],
  pick: (row: DoneTourRow) => NamedRef | null,
  emptyLabel: string,
): CountRow[] {
  const map = new Map<string, CountRow>();

  for (const row of rows) {
    const ref = pick(row);
    const key = ref?.id ?? "none";
    const entry = map.get(key) ?? {
      key,
      name: ref?.name ?? emptyLabel,
      tours: 0,
    };
    entry.tours += 1;
    map.set(key, entry);
  }

  return [...map.values()].sort(
    (a, b) => b.tours - a.tours || a.name.localeCompare(b.name, "es"),
  );
}

// Visión general de la coordinadora: todos los tours hechos.
export async function fetchAdminMetrics(): Promise<AdminMetrics> {
  const tours = await fetchDoneTours();
  return {
    totalTours: tours.length,
    byProvider: countByRef(tours, (t) => t.provider, NO_PROVIDER),
    byOperator: countByRef(tours, (t) => t.tour_operator, NO_OPERATOR),
  };
}

// Métricas de un guía: solo los tours en los que ha sido lead o back-up.
export async function fetchGuideMetrics(guideId: string): Promise<GuideMetrics> {
  const all = await fetchDoneTours();
  const mine = all.filter(
    (t) =>
      t.guide_lead_id === guideId ||
      t.backup_1_id === guideId ||
      t.backup_2_id === guideId,
  );

  const asLead = mine.filter((t) => t.guide_lead_id === guideId).length;

  return {
    totalTours: mine.length,
    asLead,
    asBackup: mine.length - asLead, // un tour cuenta una vez; si es lead, no es back-up
    byProvider: countByRef(mine, (t) => t.provider, NO_PROVIDER),
    byOperator: countByRef(mine, (t) => t.tour_operator, NO_OPERATOR),
  };
}