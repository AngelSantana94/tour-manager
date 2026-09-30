import { supabase } from "../../Calendars/Services/Supabase.adapter";

// ─── TIPOS ────────────────────────────────────────────────────────────────────
export type DirectoryKind = "provider" | "operator" | "leader";

export interface DirectoryItem {
  id: string;
  name: string;
  /** Tours que usan este operador / guía correo con el proveedor de la tarjeta. */
  tours: number;
  /** Solo en guías correo. */
  phone?: string | null;
}

export interface DirectoryProvider {
  id: string;
  name: string;
  operators: DirectoryItem[];
  leaders: DirectoryItem[];
}

export interface DirectoryData {
  providers: DirectoryProvider[];
  /** Operadores / guías correo que no encajan en ningún proveedor. */
  unassigned: { operators: DirectoryItem[]; leaders: DirectoryItem[] };
}

// Las funciones de Postgres del directorio no están en database.types.ts, así
// que se llaman con este wrapper sin tipos (igual que en Supabase.adapter).
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

// ─── READ ─────────────────────────────────────────────────────────────────────
export async function fetchDirectory(): Promise<DirectoryData> {
  const { data, error } = await rpc("admin_get_directory");
  if (error) throw new Error(`Error obteniendo el directorio: ${error.message}`);
  return data as DirectoryData;
}

// ─── RENOMBRAR ────────────────────────────────────────────────────────────────
// El nombre anterior queda guardado como alias (ver directory.sql).
export async function renameDirectoryItem(
  kind: DirectoryKind,
  id: string,
  name: string,
): Promise<void> {
  const { error } = await rpc("admin_rename_directory_item", {
    p_kind: kind,
    p_id: id,
    p_name: name,
  });
  if (error) throw new Error(error.message);
}

// ─── FUSIONAR ─────────────────────────────────────────────────────────────────
// Deja `keepId` y absorbe a todos los de `removeIds`: sus tours pasan al que
// se queda y los demás se borran. Se van fusionando de uno en uno; si alguno
// falla, los anteriores ya quedaron fusionados (cada fusión es atómica).
export async function mergeDirectoryItems(
  kind: "operator" | "leader",
  keepId: string,
  removeIds: string[],
): Promise<void> {
  const fn =
    kind === "operator" ? "admin_merge_operators" : "admin_merge_tour_leaders";

  for (const removeId of removeIds) {
    const { error } = await rpc(fn, { p_keep: keepId, p_remove: removeId });
    if (error) throw new Error(error.message);
  }
}