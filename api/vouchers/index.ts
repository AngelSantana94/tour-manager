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

// URL directa del archivo estático de Caveat SemiBold (600), servido por el
// propio repo oficial de Google Fonts. No requiere API key ni parseo de CSS.
const GOOGLE_FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/static/Caveat-SemiBold.ttf";

// Caché en memoria del proceso: mientras la función serverless siga "caliente"
// (invocaciones consecutivas reutilizan el mismo contenedor), no se vuelve a
// descargar la fuente. Si el contenedor se recicla, se descarga de nuevo.
let cacheFontScriptBytes: Uint8Array | null = null;

async function obtenerFontScript(pdfDoc: PDFDocument) {
  try {
    if (!cacheFontScriptBytes) {
      const respuesta = await fetch(GOOGLE_FONT_URL);
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const buffer = await respuesta.arrayBuffer();
      cacheFontScriptBytes = new Uint8Array(buffer);
      console.log(
        "Fuente script (Caveat) descargada correctamente, bytes:",
        cacheFontScriptBytes.length,
      );
    }
    return await pdfDoc.embedFont(cacheFontScriptBytes);
  } catch (err) {
    // Si Google Fonts no responde (red caída, bloqueo, etc.), no rompemos la
    // generación del voucher: caemos de vuelta a Inter.
    console.error(
      "No se pudo descargar la fuente script (usando Inter como fallback):",
      err,
    );
    return null;
  }
}

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

  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = fs.readFileSync(fontPath);
  const font = await pdfDoc.embedFont(fontBytes);

  // Fuente script para "Tu Guía en Brujas" (Caveat SemiBold), importada
  // directamente desde Google Fonts en el momento — no hace falta descargarla
  // ni subirla al repo. Se cachea en memoria para no volver a pedirla en cada
  // invocación "caliente" de la función serverless.
  const fontScript = await obtenerFontScript(pdfDoc);

  const page = pdfDoc.getPages()[0];
  const draw = (
    text: string,
    x: number,
    y: number,
    size = 11,
    color = rgb(0.106, 0.165, 0.29),
    customFont = font,
  ) => page.drawText(text, { x, y, size, font: customFont, color });

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

  // 1. Número de Voucher (Blanco, -10px a la izquierda respecto a la versión anterior: 604 -> 594)
  draw(`No. ${numero}`, 594, 476, 16, rgb(1, 1, 1));

  // 2. Fecha
  draw(hoy, 510, 396);

  // 3. Empresa (+5px más a la derecha: 132 -> 137, negrita con doble trazo)
  draw(datos.empresa, 137, 442, 18);
  draw(datos.empresa, 137.5, 442, 18);

  // 4. Dirección, C.P./Ciudad y NIF
  //    Alineados en línea recta exactamente con EXA TRAVEL (x=137)
  //    Dirección +2px arriba: 395 -> 397
  draw(datos.direccion, 137, 397);
  draw(datos.cpCiudad, 137, 373);
  draw(textoNif, 137, 349);

  // 5. Guía Tour / "Guía:" (+5px derecha, +2px arriba: 161,306 -> 166,308)
  draw(datos.guiaTour, 166, 308);

  // 6. Descripción/Concepto (+3px arriba, +3px derecha: 70,202 -> 73,205)
  draw(datos.concepto, 73, 205, 14);

  // 7. Importes (+1px arriba: 204,155 -> 205,156; letra más grande 13 -> 14;
  //    negrita más marcada con triple trazo, similar peso visual a "TOTAL")
  [0, 0.4, 0.8].forEach((offset) => draw(textoImporte, 511 + offset, 205, 14));
  [0, 0.4, 0.8].forEach((offset) => draw(textoImporte, 511 + offset, 156, 14));

  // 8. Pax (-3px izquierda, +2px arriba: 157,154 -> 154,156)
  draw(textoPax, 154, 156, 13);

  // 9. Guía Encargado / "Tu Guía en Brujas" (+10px más a la derecha: 223 -> 233)
  //    Usa Caveat SemiBold importada de Google Fonts si la descarga funcionó;
  //    si no, cae a Inter con doble trazo tenue simulando semi-negrita.
  if (fontScript) {
    draw(datos.guiaEncargado, 233, 56, 16, undefined, fontScript);
  } else {
    draw(datos.guiaEncargado, 233, 56, 14);
    draw(datos.guiaEncargado, 233.3, 56, 14);
  }

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
