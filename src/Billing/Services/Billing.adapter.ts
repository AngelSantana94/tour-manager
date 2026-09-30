import { supabase } from "../../lib/supabaseClient";

// ─── TIPOS ────────────────────────────────────────────────────────────────────
export interface BillingViewer {
  isAdmin: boolean;
  guideId: string | null;
}

export interface BillingTour {
  id: string;
  date: string; // YYYY-MM-DD
  serviceId: string | null;
  tourType: string | null;
  leadId: string | null;
  leadName: string | null;
  providerId: string | null;
  providerName: string | null;
  operatorName: string | null;
}

interface NamedRef {
  id: string;
  name: string;
}

interface BillingTourRow {
  id: string;
  date: string;
  service_id: string | null;
  tour_type: string | null;
  status: string | null;
  guide_lead_id: string | null;
  guide_lead: NamedRef | null;
  provider: NamedRef | null;
  tour_operator: NamedRef | null;
}

// Supabase devuelve máximo 1000 filas por petición: se pagina.
const PAGE_SIZE = 1000;

// Mismos joins (misma sintaxis de FK) que ya usa el adapter del calendario.
const BILLING_TOURS_SELECT = `
  id, date, service_id, tour_type, status, guide_lead_id,
  guide_lead:guides!tours_guide_lead_id_fkey ( id, name ),
  provider:providers!tours_provider_id_fkey ( id, name ),
  tour_operator:tour_operators!tours_tour_operator_id_fkey ( id, name )
`;

// ─── QUIÉN MIRA ───────────────────────────────────────────────────────────────
export async function fetchBillingViewer(): Promise<BillingViewer> {
  const [adminRes, guideRes] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase.rpc("current_guide_id"),
  ]);
  if (adminRes.error) {
    throw new Error(`Error comprobando permisos: ${adminRes.error.message}`);
  }
  if (guideRes.error) {
    throw new Error(
      `Error obteniendo tu perfil de guía: ${guideRes.error.message}`,
    );
  }
  return {
    isAdmin: adminRes.data === true,
    guideId: (guideRes.data as string | null) ?? null,
  };
}

// ─── TOURS REALIZADOS DE UN MES ───────────────────────────────────────────────
// Misma regla de "tour hecho" que Metrics.adapter (si cambia una, cambia la
// otra): no cancelado, y con fecha ya pasada o ya finalizado (completed_at).
// La RLS decide qué filas ve cada cuenta: un guía solo recibe sus tours.
// `month` = "YYYY-MM".
export async function fetchMonthTours(month: string): Promise<BillingTour[]> {
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD en hora local

  const rows: BillingTourRow[] = [];

  for (let start = 0;; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tours")
      .select(BILLING_TOURS_SELECT)
      .gte("date", from)
      .lte("date", to)
      .or(`date.lt.${today},completed_at.not.is.null`)
      .order("date", { ascending: true })
      .order("id", { ascending: true }) // desempate estable para la paginación
      .range(start, start + PAGE_SIZE - 1);

    if (error) throw new Error(`Error obteniendo tours: ${error.message}`);

    const page = (data as unknown as BillingTourRow[]) ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows
    .filter((r) => r.status !== "Cancelado")
    .map((r) => ({
      id: r.id,
      date: r.date,
      serviceId: r.service_id,
      tourType: r.tour_type,
      leadId: r.guide_lead_id,
      leadName: r.guide_lead?.name ?? null,
      providerId: r.provider?.id ?? null,
      providerName: r.provider?.name ?? null,
      operatorName: r.tour_operator?.name ?? null,
    }));
}
