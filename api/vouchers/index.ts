import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Importación de tipos de Supabase (con extensión .js para NodeNext)
import type { Database } from "../../src/types/database.types.js";

type SupabaseAuthClient = ReturnType<typeof createClient<Database>>;

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
  const templatePath = path.join(
    process.cwd(),
    "src/assets/voucher_template.pdf",
  );
  const fontPath = path.join(
    process.cwd(),
    "src/assets/fonts/Inter-Variable.ttf",
  );

  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = fs.readFileSync(fontPath);
  const font = await pdfDoc.embedFont(fontBytes);

  const page = pdfDoc.getPages()[0];
  const draw = (
    text: string,
    x: number,
    y: number,
    size = 11,
    color = rgb(0.106, 0.165, 0.29),
  ) => page.drawText(text, { x, y, size, font, color });

  const hoy = new Date().toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Formateos de datos especiales
  const textoNif = datos.nif.toUpperCase().startsWith("NIF")
    ? datos.nif
    : `NIF ${datos.nif}`;
  const textoPax = `Pax: ${datos.pax} adultos`;
  const importeFormateado = datos.importe % 1 === 0
    ? datos.importe.toFixed(0)
    : datos.importe.toFixed(2);
  const textoImporte = `${importeFormateado} €`;

  // 1. Número de Voucher (Blanco, +grande, 10px a la izquierda)
  draw(`No. ${numero}`, 596, 476, 16, rgb(1, 1, 1));

  // 2. Fecha (+5px a la derecha)
  draw(hoy, 510, 396);

  // 3. Empresa (+7px a la derecha, +grande y efecto negrita con doble trazo)
  draw(datos.empresa, 127, 442, 18);
  draw(datos.empresa, 127.5, 442, 18);

  // 4. Dirección (+3px arriba) y C.P./Ciudad
  draw(datos.direccion, 120, 395);
  draw(datos.cpCiudad, 121, 373);

  // 5. NIF (con prefijo NIF)
  draw(textoNif, 120, 349);

  // 6. Guía Tour (+5px a la derecha, +3px arriba)
  draw(datos.guiaTour, 156, 304);

  // 7. Descripción/Concepto (+5px a la derecha, +2px arriba, fuente bastante más grande)
  draw(datos.concepto, 67, 199, 14);

  // 8. Importes (+1.5px arriba, -3px a la izquierda, sin decimales .00)
  draw(textoImporte, 512, 198.5, 13);
  draw(textoImporte, 511, 149.5, 13);

  // 9. Pax (con prefijo Pax:, +4px a la derecha, +2px arriba)
  draw(textoPax, 163, 150);

  // 10. Guía Encargado / Tu Guía en Brujas (+10px a la derecha, +2px arriba, fuente grande)
  draw(datos.guiaEncargado, 193, 56, 14);

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

    const { data: signedData, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(rutaStorage, 60 * 60 * 24 * 365);

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
