import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database.types";

const BUCKET = "vouchers";

function getSupabaseParaPeticion(req: VercelRequest) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;

  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const supabase = getSupabaseParaPeticion(req);
  if (!supabase) {
    return res.status(401).json({ error: "Falta el token de sesión" });
  }

  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Falta el id del voucher" });
  }

  try {
    // RLS ya impide leer/borrar el registro de otra guía, pero el fetch
    // igualmente solo puede devolver la fila si pertenece al usuario del
    // token — si es de otra guía, esta consulta no devuelve nada.
    const { data: registro, error: fetchError } = await supabase
      .from("vouchers")
      .select("pdf_path")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([registro.pdf_path]);
    if (storageError) throw storageError;

    const { error: deleteError } = await supabase
      .from("vouchers")
      .delete()
      .eq("id", id);
    if (deleteError) throw deleteError;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error borrando voucher:", err);
    return res.status(500).json({ error: "No se pudo borrar el voucher" });
  }
}
