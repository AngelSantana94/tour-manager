import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database.types.js";
import { voucherTemplateBase64 } from "../assets/voucherTemplateBase64.js";
import { interFontBase64 } from "../assets/interFontBase64.js";

type SupabaseAuthClient = ReturnType<typeof createClient<Database>>;

// Cliente "como la guía que llama": recibe su token de sesión y hace que
// Supabase aplique las políticas RLS como si esa guía estuviera operando
// directamente. Nunca uses aquí la service_role key para esta función.
function getSupabaseParaPeticion(
  req: VercelRequest,
): SupabaseAuthClient | null {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;

  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

const BUCKET = "vouchers";

interface VoucherInput {
  empresa: string;
  nif: string;
  direccion: string;
  cpCiudad: string;
  guiaTour: string;
  concepto: string;
  importe: number;
  pax: number;
  guiaEncargado: string;
}

// --- Número de voucher automático (mes/año), incrementado ---
// OJO: como este cliente respeta RLS, el conteo solo ve los vouchers de
// ESTA guía -> la numeración es "por guía" (cada una tiene su propia
// secuencia 01/09/2026, 02/09/2026...), no una numeración global compartida
// entre las 4. Si más adelante quieres un contador único para toda la
// agencia, dímelo: se resuelve con una función de Postgres con permisos
// elevados dedicada solo a ese conteo.
async function generarNumeroVoucher(
  supabase: SupabaseAuthClient,
): Promise<string> {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const anio = ahora.getFullYear();

  const inicioMes = new Date(anio, ahora.getMonth(), 1).toISOString();
  const { count, error } = await supabase
    .from("vouchers")
    .select("id", { count: "exact", head: true })
    .gte("created_at", inicioMes);

  if (error) throw error;

  const siguiente = (count ?? 0) + 1;
  return `${String(siguiente).padStart(2, "0")}/${mes}/${anio}`;
}

async function generarPdf(
  datos: VoucherInput,
  numero: string,
): Promise<Uint8Array> {
  const templateBytes = Buffer.from(voucherTemplateBase64, "base64");
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = Buffer.from(interFontBase64, "base64");
  const font = await pdfDoc.embedFont(fontBytes);

  const page = pdfDoc.getPages()[0];
  const draw = (text: string, x: number, y: number, size = 11) =>
    page.drawText(text, { x, y, size, font, color: rgb(0.106, 0.165, 0.29) });

  const hoy = new Date().toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  draw(`No. ${numero}`, 606, 476, 14);
  draw(hoy, 505, 396);
  draw(datos.empresa, 120, 442, 16);
  draw(datos.nif, 120, 349);
  draw(datos.direccion, 120, 373);
  draw(datos.cpCiudad, 121, 392);
  draw(datos.guiaTour, 151, 301);
  draw(datos.concepto, 62, 197);
  draw(`${datos.importe.toFixed(2)} €`, 515, 197, 13);
  draw(`${datos.pax} adultos`, 159, 148);
  draw(`${datos.importe.toFixed(2)} €`, 514, 144, 13);
  draw(datos.guiaEncargado, 183, 54);

  return pdfDoc.save();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const supabase = getSupabaseParaPeticion(req);
  if (!supabase) {
    return res.status(401).json({ error: "Falta el token de sesión" });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return res.status(401).json({ error: "Sesión no válida" });
  }
  const userId = userData.user.id;

  try {
    const datos = req.body as VoucherInput;

    const camposObligatorios: (keyof VoucherInput)[] = [
      "empresa",
      "nif",
      "direccion",
      "cpCiudad",
      "guiaTour",
      "concepto",
      "importe",
      "pax",
      "guiaEncargado",
    ];
    const faltante = camposObligatorios.find((c) =>
      datos[c] === undefined || datos[c] === ""
    );
    if (faltante) {
      return res.status(400).json({ error: `Falta el campo: ${faltante}` });
    }

    const numero = await generarNumeroVoucher(supabase);
    const pdfBytes = await generarPdf(datos, numero);

    // Carpeta con el user_id como prefijo: así las políticas de Storage
    // impiden que una guía pueda ver o escribir en la carpeta de otra.
    const nombreArchivo = `${numero.replace(/\//g, "-")}-${Date.now()}.pdf`;
    const rutaStorage = `${userId}/${
      new Date().getFullYear()
    }/${nombreArchivo}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(rutaStorage, Buffer.from(pdfBytes), {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // Bucket privado recomendado (hay NIF y datos personales) -> URL firmada.
    // Ajusta expiresIn si quieres que caduque antes/después (segundos).
    const { data: signedData, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(rutaStorage, 60 * 60 * 24 * 365); // 1 año

    if (signedError) throw signedError;

    const { data: registro, error: insertError } = await supabase
      .from("vouchers")
      .insert({
        numero,
        empresa: datos.empresa,
        nif: datos.nif,
        direccion: datos.direccion,
        cp_ciudad: datos.cpCiudad,
        guia_tour: datos.guiaTour,
        concepto: datos.concepto,
        importe: datos.importe,
        pax: datos.pax,
        guia_encargado: datos.guiaEncargado,
        pdf_path: rutaStorage,
        user_id: userId,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    return res.status(200).json({
      id: registro.id,
      pdfUrl: signedData.signedUrl,
    });
  } catch (err) {
    console.error("Error generando voucher:", err);
    return res.status(500).json({ error: "No se pudo generar el voucher" });
  }
}
