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
  // Formato n-mes/año (ej: 02-09/2026) para evitar confusión con el día
  return `${String(siguiente).padStart(2, "0")}-${mes}/${anio}`;
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

  // NOTA: si añades una fuente script/manuscrita (p.ej. "src/assets/fonts/Script-SemiBold.ttf")
  // para el nombre del guía al pie, embébela aquí igual que con Inter y úsala solo
  // en el draw() de "guiaEncargado" (punto 9 más abajo).
  // const fontScriptBytes = fs.readFileSync(path.join(process.cwd(), "src/assets/fonts/Script-SemiBold.ttf"));
  // const fontScript = await pdfDoc.embedFont(fontScriptBytes);

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

  // Formateos de datos
  const textoNif = datos.nif.toUpperCase().startsWith("NIF")
    ? datos.nif
    : `NIF ${datos.nif}`;
  const textoPax = `Pax: ${datos.pax} adultos`;
  const importeFormateado = datos.importe % 1 === 0
    ? datos.importe.toFixed(0)
    : datos.importe.toFixed(2);
  const textoImporte = `${importeFormateado} €`;

  // 1. Número de Voucher (Blanco, +10px más a la derecha respecto a la versión anterior: 606 -> 616)
  draw(`No. ${numero}`, 616, 476, 16, rgb(1, 1, 1));

  // 2. Fecha
  draw(hoy, 510, 396);

  // 3. Empresa (+5px más a la derecha: 132 -> 137, negrita con doble trazo)
  draw(datos.empresa, 137, 442, 18);
  draw(datos.empresa, 137.5, 442, 18);

  // 4. Dirección, C.P./Ciudad y NIF
  //    Alineados en línea recta exactamente con EXA TRAVEL (x=137)
  draw(datos.direccion, 137, 395);
  draw(datos.cpCiudad, 137, 373);
  draw(textoNif, 137, 349);

  // 5. Guía Tour / "Guía:" (+5px derecha, +2px arriba: 161,306 -> 166,308)
  draw(datos.guiaTour, 166, 308);

  // 6. Descripción/Concepto (+3px arriba, +3px derecha: 70,202 -> 73,205)
  draw(datos.concepto, 73, 205, 14);

  // 7. Importes (+3px arriba, negrita suave con doble trazo)
  draw(textoImporte, 511, 204, 13);
  draw(textoImporte, 511.4, 204, 13);
  draw(textoImporte, 511, 155, 13);
  draw(textoImporte, 511.4, 155, 13);

  // 8. Pax (+3px izquierda, +2px arriba, un poco más grande: 160,152,12 -> 157,154,13)
  draw(textoPax, 157, 154, 13);

  // 9. Guía Encargado / "Tu Guía en Brujas" (+10px más a la derecha: 203 -> 213)
  //    Estilo manuscrito/semi-negrita suave pendiente de fuente script (ver nota arriba).
  //    Mientras tanto se refuerza con doble trazo tenue para simular semi-negrita.
  draw(datos.guiaEncargado, 213, 56, 14);
  draw(datos.guiaEncargado, 213.3, 56, 14);

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
