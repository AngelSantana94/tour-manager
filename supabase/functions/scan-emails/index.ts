import "@supabase/functions-js/edge-runtime.d.ts";
import { JWT } from "npm:google-auth-library@9.1.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper para dividir arreglos pesados en bloques (chunks) y evitar saturar PostgreSQL
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

Deno.serve(async (req) => {
  // Manejo de peticiones preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    let privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY");

    if (!clientEmail || !privateKey) {
      throw new Error("Faltan las credenciales GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY en los Secrets.");
    }

    privateKey = privateKey.replace(/\\n/g, "\n");

    // 1. Autenticación con la API de Google Sheets via Service Account
    const auth = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const tokens = await auth.authorize();
    const accessToken = tokens.access_token;

    // 2. Cliente interno de Supabase (con Service Role Key para bypass de RLS en sincronizaciones)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, spreadsheetId, range, values } = await req.json();

    if (!spreadsheetId) {
      throw new Error("Se requiere 'spreadsheetId' en el cuerpo de la petición.");
    }

    // ==========================================
    // ACCIÓN 1: LEER CELDAS / RANGOS DE GOOGLE SHEETS
    // ==========================================
    if (action === "read") {
      const targetRange = range || "A1:Z1000";
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(targetRange)}`;
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Error Google Sheets API (${response.status}): ${await response.text()}`);
      }

      const data = await response.json();
      return new Response(
        JSON.stringify({ success: true, values: data.values || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==========================================
    // ACCIÓN 2: ESCRIBIR / ACTUALIZAR CELDAS EN GOOGLE SHEETS
    // ==========================================
    if (action === "write") {
      if (!range || !values) {
        throw new Error("Se requieren 'range' y 'values' para escribir en la hoja.");
      }

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      });

      if (!response.ok) {
        throw new Error(`Error al escribir en Google Sheets (${response.status}): ${await response.text()}`);
      }

      const data = await response.json();
      return new Response(
        JSON.stringify({ success: true, updatedCells: data.updatedCells, updatedRange: data.updatedRange }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==========================================
    // ACCIÓN 3: IMPORTACIÓN MASIVA EN LOTE CON MAPEO DINÁMICO (EXCEL -> SUPABASE)
    // ==========================================
    if (action === "import_tours") {
      // Leemos desde la fila 1 para mapear encabezados automáticamente
      const sheetRange = range || "'Agenda Septiembre'!A1:Z1000";
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetRange)}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Error leyendo Excel (${response.status}): ${await response.text()}`);
      }

      const data = await response.json();
      const rows: string[][] = data.values || [];

      if (rows.length < 2) {
        return new Response(
          JSON.stringify({ success: true, importedCount: 0, message: "No hay suficientes filas de datos." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // MAPEO DINÁMICO DE COLUMNAS (Detecta las posiciones sin importar si las mueven de lugar)
      const headers = rows[0].map((h) => h?.toString().trim().toLowerCase() || "");

      const idxServiceId = headers.findIndex((h) => h.includes("id servicio"));
      const idxDate      = headers.findIndex((h) => h.includes("fecha"));
      const idxStartTime = headers.findIndex((h) => h.includes("inicio"));
      const idxEndTime   = headers.findIndex((h) => h.includes("termino") || h.includes("término"));
      const idxType      = headers.findIndex((h) => h.includes("tipo"));
      const idxCity      = headers.findIndex((h) => h.includes("ciudad"));
      const idxPax       = headers.findIndex((h) => h.includes("pax"));
      const idxPhone     = headers.findIndex((h) => h.includes("teléf") || h.includes("telef"));
      const idxMeeting   = headers.findIndex((h) => h.includes("punto encuentro"));
      const idxStatus    = headers.findIndex((h) => h.includes("estado"));
      const idxNotes     = headers.findIndex((h) => h.includes("notas"));

      // Transformar las filas de datos (slice(1) ignora la cabecera)
      const recordsToInsert = rows.slice(1)
        .filter((r) => idxServiceId !== -1 && r[idxServiceId] && r[idxServiceId].trim() !== "" && r[idxServiceId] !== "ID Servicio")
        .map((r) => ({
          service_id: r[idxServiceId]?.trim() || "Sin ID",
          date: idxDate !== -1 ? r[idxDate]?.trim() : null,
          start_time: idxStartTime !== -1 ? r[idxStartTime]?.trim() : null,
          end_time: idxEndTime !== -1 ? r[idxEndTime]?.trim() : null,
          tour_type: idxType !== -1 ? r[idxType]?.trim() : "Tour",
          city: idxCity !== -1 ? r[idxCity]?.trim() : "Brujas",
          pax: (idxPax !== -1 && !isNaN(parseInt(r[idxPax]))) ? parseInt(r[idxPax]) : 0,
          tour_leader_phone: idxPhone !== -1 ? r[idxPhone]?.trim() : null,
          meeting_point: idxMeeting !== -1 ? r[idxMeeting]?.trim() : "Bargeplein",
          status: idxStatus !== -1 ? r[idxStatus]?.trim() : "Confirmado",
          notes: idxNotes !== -1 ? r[idxNotes]?.trim() : null,
        }));

      // Procesamiento seguro en bloques de 100 filas
      const batches = chunkArray(recordsToInsert, 100);
      let totalInserted = 0;

      for (const batch of batches) {
        const { error } = await supabase
          .from("tours")
          .upsert(batch, { onConflict: "service_id" });

        if (error) {
          console.error("Error en batch de inserción:", error.message);
        } else {
          totalInserted += batch.length;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          processedRows: rows.length - 1,
          importedCount: totalInserted,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Acción '${action}' no válida. Usa 'read', 'write' o 'import_tours'.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});