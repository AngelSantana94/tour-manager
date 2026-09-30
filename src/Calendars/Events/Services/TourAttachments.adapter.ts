import { supabase } from "../../../lib/supabaseClient";

export type AttachmentKind = "pax_photo" | "voucher_photo";

/** { "<guide_id>": ["url1", "url2"] } */
export type PhotosByGuide = Record<string, string[]>;

export interface TourPhotos {
  pax: PhotosByGuide;
  voucher: PhotosByGuide;
}

export interface TourAttachmentsData extends TourPhotos {
  completedAt: string | null;
}

export interface Viewer {
  guideId: string | null;
  isAdmin: boolean;
}

const BUCKET = "tour-photos";

// Valor que entienden las funciones de Postgres (add/remove_tour_attachment).
const RPC_KIND: Record<AttachmentKind, "pax" | "voucher"> = {
  pax_photo: "pax",
  voucher_photo: "voucher",
};

const FILE_NAME_BY_KIND: Record<AttachmentKind, string> = {
  pax_photo: "pax",
  voucher_photo: "voucher",
};

// La foto de pax es solo un recuento visual; el voucher tiene que seguir
// siendo legible para justificar el pago ante el proveedor.
const COMPRESSION_BY_KIND: Record<
  AttachmentKind,
  { maxDimension: number; quality: number }
> = {
  pax_photo: { maxDimension: 1600, quality: 0.75 },
  voucher_photo: { maxDimension: 2000, quality: 0.85 },
};

// Sufijo aleatorio: cada subida genera una URL nueva, así no hay caché de una
// foto anterior.
function randomSuffix(len = 8): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, len);
}

/** jsonb -> PhotosByGuide, ignorando cualquier cosa con forma inesperada. */
function asPhotos(value: unknown): PhotosByGuide {
  const out: PhotosByGuide = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [guideId, urls] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (Array.isArray(urls)) {
        out[guideId] = urls.filter((u): u is string => typeof u === "string");
      }
    }
  }
  return out;
}

function asTourPhotos(value: unknown): TourPhotos {
  const obj = (value ?? {}) as Record<string, unknown>;
  return { pax: asPhotos(obj.pax), voucher: asPhotos(obj.voucher) };
}

/**
 * Redibuja la imagen en un canvas a un tamaño máximo y la reexporta como
 * JPEG. Si no es una imagen (p.ej. un PDF) o el navegador no puede
 * decodificarla, devuelve el archivo original: nunca bloquea la subida.
 */
async function compressImage(
  file: File,
  { maxDimension, quality }: { maxDimension: number; quality: number },
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(file);
    const src = objectUrl;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo leer la imagen"));
      el.src = src;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("No se pudo comprimir la imagen");

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch (err) {
    // p.ej. un HEIC que el navegador no sepa decodificar: se sube el original.
    console.warn("No se pudo comprimir la imagen, se sube el original:", err);
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

// ─── LECTURA ────────────────────────────────────────────────────────────────

/** Quién está mirando: su id de guía (si lo es) y si es coordinadora. */
export async function fetchViewer(): Promise<Viewer> {
  const [guideRes, adminRes] = await Promise.all([
    supabase.rpc("current_guide_id"),
    supabase.rpc("is_admin"),
  ]);
  return {
    guideId: (guideRes.data as string | null) ?? null,
    isAdmin: adminRes.data === true,
  };
}

export interface TourGuide {
  slot: "lead" | "backup1" | "backup2";
  id: string;
  name: string;
}

/**
 * Guías asignados al tour (solo id y nombre). Pasa por una función de
 * Postgres porque un guía no puede leer la fila de sus compañeros en `guides`.
 */
export async function fetchTourGuides(tourId: string): Promise<TourGuide[]> {
  const { data, error } = await supabase.rpc("get_tour_guides", {
    p_tour_id: tourId,
  });
  if (error) {
    throw new Error(`No se pudieron cargar los guías del tour: ${error.message}`);
  }

  const rows = (data ?? []) as {
    slot: string;
    guide_id: string;
    guide_name: string;
  }[];

  return rows.flatMap((r) =>
    r.slot === "lead" || r.slot === "backup1" || r.slot === "backup2"
      ? [{ slot: r.slot, id: r.guide_id, name: r.guide_name } as TourGuide]
      : [],
  );
}

/** Lee el estado actual de adjuntos directamente de la BD. */
export async function fetchTourAttachments(
  tourId: string,
): Promise<TourAttachmentsData> {
  const { data, error } = await supabase
    .from("tours")
    .select("pax_photo_url, voucher_photo_url, completed_at")
    .eq("id", tourId)
    .single();

  if (error) {
    throw new Error(`No se pudieron cargar los adjuntos: ${error.message}`);
  }

  return {
    pax: asPhotos(data.pax_photo_url),
    voucher: asPhotos(data.voucher_photo_url),
    completedAt: (data.completed_at as string | null) ?? null,
  };
}

// ─── ESCRITURA (todo pasa por funciones de Postgres) ────────────────────────

/**
 * Comprime, sube al bucket y registra la URL en el tour a nombre de un guía.
 * `guideId` solo hace falta cuando quien sube es la coordinadora (admin); un
 * guía siempre sube a su propio nombre, lo decide el servidor.
 * Devuelve el estado completo de fotos ya actualizado.
 */
export async function uploadTourAttachment(
  tourId: string,
  kind: AttachmentKind,
  file: File,
  guideId?: string,
): Promise<TourPhotos> {
  const compressed = await compressImage(file, COMPRESSION_BY_KIND[kind]);

  const ext = compressed.name.split(".").pop() || "jpg";
  const path = `tours/${tourId}/${FILE_NAME_BY_KIND[kind]}-${randomSuffix()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, { upsert: false });
  if (uploadError) {
    throw new Error(`Error subiendo el archivo: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path);

  const { data, error } = await supabase.rpc("add_tour_attachment", {
    p_tour_id: tourId,
    p_kind: RPC_KIND[kind],
    p_url: publicUrlData.publicUrl,
    p_guide_id: guideId ?? null,
  });
  // Si esto falla, el archivo ya subido queda huérfano en el bucket (no hay
  // política de borrado para guías); a este volumen no es un problema.
  if (error) throw new Error(error.message);

  return asTourPhotos(data);
}

/** Quita una foto propia del tour (el archivo del bucket no se borra). */
export async function removeTourAttachment(
  tourId: string,
  kind: AttachmentKind,
  url: string,
  guideId?: string,
): Promise<TourPhotos> {
  const { data, error } = await supabase.rpc("remove_tour_attachment", {
    p_tour_id: tourId,
    p_kind: RPC_KIND[kind],
    p_url: url,
    p_guide_id: guideId ?? null,
  });
  if (error) throw new Error(error.message);

  return asTourPhotos(data);
}

/**
 * Finaliza el tour. El servidor comprueba que quien llama es el lead o la
 * coordinadora y que TODOS los guías asignados subieron pax y voucher.
 * Devuelve el `completed_at` guardado.
 */
export async function completeTour(tourId: string): Promise<string> {
  const { data, error } = await supabase.rpc("complete_tour", {
    p_tour_id: tourId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}