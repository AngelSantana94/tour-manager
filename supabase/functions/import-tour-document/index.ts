import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as XLSX from "npm:xlsx@0.18.5";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// -----------------------------------------------------------------------------
// TIPOS
// -----------------------------------------------------------------------------

type Cell = string | number | boolean | null | undefined;

interface ImportedTour {
  service_id: string | null;
  date: string;
  start_time: string | null;
  pax: number | null;
  tour_leader_id: string | null;
  tour_leader_phone: string | null;
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

const norm = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};

const clean = (value: unknown): string | null => {
  const valueString = String(value ?? "").replace(/\s+/g, " ").trim();
  return valueString === "" ? null : valueString;
};

function parseDate(value: Cell): string | null {
  if (value == null || value === "") return null;

  // Excel serial date
  if (typeof value === "number") {
    if (value < 1) return null;

    const date = XLSX.SSF.parse_date_code(value);

    if (!date || !date.y || !date.m || !date.d) {
      return null;
    }

    return `${String(date.y).padStart(4, "0")}-${String(date.m).padStart(
      2,
      "0",
    )}-${String(date.d).padStart(2, "0")}`;
  }

  const valueString = clean(value);
  if (!valueString) return null;

  // YYYY-MM-DD
  let match = valueString.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/,
  );

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    return validDate(year, month, day);
  }

  // DD/MM/YYYY or DD-MM-YYYY
  match = valueString.match(
    /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/,
  );

  if (match) {
    let year = Number(match[3]);
    const month = Number(match[2]);
    const day = Number(match[1]);

    if (year < 100) year += 2000;

    return validDate(year, month, day);
  }

  // Último intento con Date
  const parsed = new Date(valueString);

  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(
      parsed.getMonth() + 1,
    ).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }

  return null;
}

function validDate(
  year: number,
  month: number,
  day: number,
): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}`;
}

function parseTime(value: Cell): string | null {
  if (value == null || value === "") return null;

  // Excel guarda horas como fracción de día.
  // Ejemplo: 0.5 = 12:00.
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed) {
      const hour = parsed.H ?? 0;
      const minute = parsed.M ?? 0;

      if (hour > 23 || minute > 59) return null;

      return `${String(hour).padStart(2, "0")}:${String(
        minute,
      ).padStart(2, "0")}:00`;
    }

    return null;
  }

  const valueString = clean(value);
  if (!valueString) return null;

  // 11:30
  // 11.30
  // 11h30
  const match = valueString.match(
    /^(\d{1,2})\s*[:.h]\s*(\d{1,2})/i,
  );

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(
    minute,
  ).padStart(2, "0")}:00`;
}

function parsePax(value: Cell): number | null {
  if (value == null || value === "") return null;

  if (typeof value === "number") {
    return Math.round(value);
  }

  const valueString = clean(value);
  if (!valueString) return null;

  // "26"
  if (/^\d+$/.test(valueString)) {
    return Number(valueString);
  }

  // "26/40"
  // "26 pax"
  // "26 personas"
  const match = valueString.match(/^(\d+)/);

  return match ? Number(match[1]) : null;
}

// -----------------------------------------------------------------------------
// BUSCAR COLUMNA
// -----------------------------------------------------------------------------

function findColumn(
  headers: string[],
  ...tests: Array<(header: string) => boolean>
): number {
  for (const test of tests) {
    const index = headers.findIndex(test);

    if (index !== -1) {
      return index;
    }
  }

  return -1;
}

// -----------------------------------------------------------------------------
// MAPEO DEL DOCUMENTO
// -----------------------------------------------------------------------------

interface DocumentColumns {
  grupo: number;
  pax: number;
  tourLeader: number;
  phone: number;
  brujas: number;
  brujasHour: number;

  // Reservadas para futuro.
  bruselas: number;
  bruselasHour: number;
}

function mapDocumentColumns(headers: Cell[]): DocumentColumns {
  const normalizedHeaders = headers.map(norm);

  const columns: DocumentColumns = {
    grupo: findColumn(
      normalizedHeaders,
      (h) => h === "grupo",
      (h) => h.includes("grupo"),
    ),

    pax: findColumn(
      normalizedHeaders,
      (h) => h === "ttl pax",
      (h) => h.includes("ttl pax"),
      (h) => h === "pax",
    ),

    tourLeader: findColumn(
      normalizedHeaders,
      (h) => h === "tour leader",
      (h) => h.includes("tour leader"),
      (h) => h.includes("tourleader"),
    ),

    phone: findColumn(
      normalizedHeaders,
      (h) => h === "tel.",
      (h) => h === "tel",
      (h) => h.startsWith("tel"),
    ),

    brujas: findColumn(
      normalizedHeaders,
      (h) => h === "brujas",
      (h) => h.includes("brujas"),
    ),

    brujasHour: -1,

    // -----------------------------------------------------------------------
    // FUTURO:
    // Estas columnas se detectan pero actualmente NO se procesan.
    // Más adelante aquí se implementará Bruselas.
    // -----------------------------------------------------------------------
    bruselas: findColumn(
      normalizedHeaders,
      (h) => h === "bruselas",
      (h) => h.includes("bruselas"),
    ),

    bruselasHour: -1,
  };

  // ---------------------------------------------------------------------------
  // IMPORTANTE:
  //
  // El documento tiene dos columnas "HR", una asociada a BRUJAS y otra a
  // BRUSELAS. Como XLSX nos entrega las cabeceras en orden, buscamos el
  // primer HR después de BRUJAS y el HR después de BRUSELAS.
  // ---------------------------------------------------------------------------

  const brujasIndex = columns.brujas;
  const bruselasIndex = columns.bruselas;

  const hrIndexes = normalizedHeaders.reduce<number[]>(
    (result, header, index) => {
      if (header === "hr" || header === "hora") {
        result.push(index);
      }

      return result;
    },
    [],
  );

  if (brujasIndex !== -1) {
    const hrAfterBrujas = hrIndexes.find(
      (index) =>
        index > brujasIndex &&
        (bruselasIndex === -1 || index < bruselasIndex),
    );

    if (hrAfterBrujas !== undefined) {
      columns.brujasHour = hrAfterBrujas;
    }
  }

  if (bruselasIndex !== -1) {
    const hrAfterBruselas = hrIndexes.find(
      (index) => index > bruselasIndex,
    );

    if (hrAfterBruselas !== undefined) {
      columns.bruselasHour = hrAfterBruselas;
    }
  }

  return columns;
}

// -----------------------------------------------------------------------------
// PARSEAR FILAS
// -----------------------------------------------------------------------------

function parseDocument(rows: Cell[][]): {
  tours: ImportedTour[];
  skipped: Array<{
    row: number;
    reason: string;
  }>;
  headers: string[];
} {
  if (!rows.length) {
    throw new Error("El documento está vacío.");
  }

  const headers = rows[0] ?? [];

  const columns = mapDocumentColumns(headers);

  const requiredColumns = [
    ["GRUPO", columns.grupo],
    ["TTL PAX", columns.pax],
    ["TOUR LEADER", columns.tourLeader],
    ["TEL.", columns.phone],
    ["BRUJAS", columns.brujas],
  ] as const;

  const missing = requiredColumns
    .filter(([, index]) => index === -1)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(
      `Faltan columnas obligatorias: ${missing.join(", ")}. ` +
        `Cabeceras detectadas: ${headers
          .map(clean)
          .filter(Boolean)
          .join(", ")}`,
    );
  }

  if (columns.brujasHour === -1) {
    throw new Error(
      "No encontré la columna HR correspondiente a BRUJAS.",
    );
  }

  const tours: ImportedTour[] = [];

  const skipped: Array<{
    row: number;
    reason: string;
  }> = [];

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index] ?? [];

    const excelRow = index + 1;

    const grupo = clean(row[columns.grupo]);
    const pax = parsePax(row[columns.pax]);
    const tourLeader = clean(row[columns.tourLeader]);
    const phone = clean(row[columns.phone]);

    const brujasDate = parseDate(row[columns.brujas]);
    const brujasHour = parseTime(row[columns.brujasHour]);

    // -------------------------------------------------------------------------
    // Fila completamente vacía → ignorar.
    // -------------------------------------------------------------------------

    const hasAnyValue = row.some(
      (cell) => clean(cell) !== null,
    );

    if (!hasAnyValue) continue;

    // -------------------------------------------------------------------------
    // Solo importamos BRUJAS.
    //
    // BRUSELAS + HR se ignoran completamente en esta versión.
    // -------------------------------------------------------------------------

    if (!brujasDate) {
      skipped.push({
        row: excelRow,
        reason: "La fecha de BRUJAS está vacía o no es válida.",
      });

      continue;
    }

    if (!brujasHour) {
      skipped.push({
        row: excelRow,
        reason: "La hora HR de BRUJAS está vacía o no es válida.",
      });

      continue;
    }

    if (!grupo) {
      skipped.push({
        row: excelRow,
        reason: "La columna GRUPO está vacía.",
      });

      continue;
    }

    // -------------------------------------------------------------------------
    // service_id
    //
    // GRUPO es nuestro identificador del servicio.
    //
    // Si en el documento hay dos filas con el mismo GRUPO, se conserva el
    // identificador pero posteriormente el upsert evitará crear dos tours
    // idénticos.
    // -------------------------------------------------------------------------

    tours.push({
      service_id: grupo,
      date: brujasDate,
      start_time: brujasHour,
      pax,
      tour_leader_id: null,
      tour_leader_phone: phone,
    });

    // -------------------------------------------------------------------------
    // FUTURO BRUSELAS:
    //
    // columns.bruselas y columns.bruselasHour están disponibles aquí para
    // cuando implementemos la segunda ciudad.
    //
    // Actualmente NO hacemos nada con esos valores.
    // -------------------------------------------------------------------------
    void columns.bruselas;
    void columns.bruselasHour;
    void tourLeader;
  }

  return {
    tours,
    skipped,
    headers: headers.map((header) => String(header ?? "")),
  };
}

// -----------------------------------------------------------------------------
// TOUR LEADERS
// -----------------------------------------------------------------------------

async function resolveTourLeaders(
  supabase: ReturnType<typeof createClient>,
  leaderNames: string[],
  phoneByName: Map<string, string | null>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  const uniqueNames = [
    ...new Set(
      leaderNames
        .map(clean)
        .filter((name): name is string => Boolean(name)),
    ),
  ];

  if (!uniqueNames.length) {
    return result;
  }

  const { data, error } = await supabase
    .from("tour_leaders")
    .select("id, name, phone");

  if (error) {
    throw new Error(
      `No pude leer 'tour_leaders': ${error.message}`,
    );
  }

  const existingByName = new Map<
    string,
    {
      id: string;
      name: string;
      phone: string | null;
    }
  >();

  for (const row of data ?? []) {
    existingByName.set(norm(row.name), {
      id: row.id,
      name: row.name,
      phone: row.phone,
    });
  }

  for (const name of uniqueNames) {
    const key = norm(name);
    const existing = existingByName.get(key);

    if (existing) {
      result.set(key, existing.id);

      // Si el documento trae teléfono y el registro actual no tiene,
      // completamos el dato sin pisar un teléfono existente.
      const incomingPhone = phoneByName.get(key);

      if (
        incomingPhone &&
        (!existing.phone || existing.phone.trim() === "")
      ) {
        const { error: updateError } = await supabase
          .from("tour_leaders")
          .update({
            phone: incomingPhone,
          })
          .eq("id", existing.id);

        if (updateError) {
          throw new Error(
            `No pude actualizar teléfono de '${name}': ${updateError.message}`,
          );
        }
      }

      continue;
    }

    const incomingPhone = phoneByName.get(key) ?? null;

    const { data: inserted, error: insertError } = await supabase
      .from("tour_leaders")
      .insert({
        id: crypto.randomUUID(),
        name,
        phone: incomingPhone,
      })
      .select("id, name")
      .single();

    if (insertError) {
      throw new Error(
        `No pude crear el Tour Leader '${name}': ${insertError.message}`,
      );
    }

    result.set(norm(inserted.name), inserted.id);
  }

  return result;
}

// -----------------------------------------------------------------------------
// RESPONSE
// -----------------------------------------------------------------------------

function json(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

// -----------------------------------------------------------------------------
// EDGE FUNCTION
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        success: false,
        error: "Método no permitido. Usa POST.",
      },
      405,
    );
  }

  try {
    // -------------------------------------------------------------------------
    // SUPABASE
    // -------------------------------------------------------------------------

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en los Secrets.",
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
    );

    // -------------------------------------------------------------------------
    // RECIBIR ARCHIVO
    // -------------------------------------------------------------------------

    const formData = await req.formData();

    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error(
        "No se recibió ningún archivo. El campo esperado es 'file'.",
      );
    }

    const fileName = file.name.toLowerCase();

    if (!fileName.endsWith(".xlsx")) {
      throw new Error(
        "El archivo debe tener formato .xlsx.",
      );
    }

    if (file.size === 0) {
      throw new Error("El archivo está vacío.");
    }

    // -------------------------------------------------------------------------
    // LEER XLSX
    // -------------------------------------------------------------------------

    const buffer = await file.arrayBuffer();

    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: false,
      cellNF: false,
      cellText: false,
    });

    if (!workbook.SheetNames.length) {
      throw new Error(
        "El documento no contiene ninguna hoja.",
      );
    }

    // -------------------------------------------------------------------------
    // PRIMERA HOJA
    // -------------------------------------------------------------------------
    //
    // Para esta primera versión utilizamos la primera pestaña del documento.
    //
    // Si posteriormente el documento tiene una pestaña concreta para los
    // servicios, podemos cambiarlo para buscarla por nombre.
    // -------------------------------------------------------------------------

    const firstSheetName = workbook.SheetNames[0];

    const worksheet = workbook.Sheets[firstSheetName];

    if (!worksheet) {
      throw new Error(
        `No pude leer la hoja '${firstSheetName}'.`,
      );
    }

    const rows = XLSX.utils.sheet_to_json<Cell[]>(worksheet, {
      header: 1,
      defval: null,
      raw: true,
    });

    if (!rows.length) {
      throw new Error(
        `La hoja '${firstSheetName}' no contiene datos.`,
      );
    }

    // -------------------------------------------------------------------------
    // PARSEAR
    // -------------------------------------------------------------------------

    const parsed = parseDocument(rows);

    if (!parsed.tours.length) {
      return json({
        success: true,
        importedCount: 0,
        skippedCount: parsed.skipped.length,
        skipped: parsed.skipped,
        sheet: firstSheetName,
        message:
          "No se encontraron tours válidos de BRUJAS para importar.",
      });
    }

    // -------------------------------------------------------------------------
    // TOUR LEADERS
    // -------------------------------------------------------------------------
    //
    // Volvemos a leer las filas para obtener los nombres porque ImportedTour
    // guarda el ID final, no el nombre original.
    // -------------------------------------------------------------------------

    const headers = rows[0] ?? [];
    const columns = mapDocumentColumns(headers);

    const leaderNames: string[] = [];
    const phoneByName = new Map<string, string | null>();

    for (let index = 1; index < rows.length; index++) {
      const row = rows[index] ?? [];

      const brujasDate = parseDate(
        row[columns.brujas],
      );

      const brujasHour = parseTime(
        row[columns.brujasHour],
      );

      if (!brujasDate || !brujasHour) {
        continue;
      }

      const name = clean(
        row[columns.tourLeader],
      );

      const phone = clean(
        row[columns.phone],
      );

      if (!name) continue;

      leaderNames.push(name);

      if (phone) {
        phoneByName.set(
          norm(name),
          phone,
        );
      }
    }

    const leaderMap = await resolveTourLeaders(
      supabase,
      leaderNames,
      phoneByName,
    );

    // -------------------------------------------------------------------------
    // CONSTRUIR REGISTROS FINALES
    // -------------------------------------------------------------------------

    //
    // IMPORTANTE:
    //
    // service_id = GRUPO
    // date       = BRUJAS
    // start_time = HR asociado a BRUJAS
    // pax        = TTL PAX
    // tour leader + phone
    //
    // No procesamos BRUSELAS.
    //

    const finalTours = parsed.tours.map(
      (tour, index) => {
        const row = rows[index + 1] ?? [];

        const leaderName = clean(
          row[columns.tourLeader],
        );

        const leaderId = leaderName
          ? leaderMap.get(norm(leaderName)) ?? null
          : null;

        return {
          service_id: tour.service_id,
          date: tour.date,
          start_time: tour.start_time,
          pax: tour.pax,
          tour_leader_id: leaderId,
          tour_leader_phone: tour.tour_leader_phone,

          // Esta primera importación es exclusivamente para Brujas.
          city: "Brujas",
        };
      },
    );

    // -------------------------------------------------------------------------
    // COMPROBAR DUPLICADOS
    // -------------------------------------------------------------------------

    const serviceIds = [
      ...new Set(
        finalTours
          .map((tour) => tour.service_id)
          .filter(
            (id): id is string => Boolean(id),
          ),
      ),
    ];

    const { data: existingTours, error: existingError } =
      await supabase
        .from("tours")
        .select(
          "id, service_id, date, start_time",
        )
        .in(
          "service_id",
          serviceIds,
        );

    if (existingError) {
      throw new Error(
        `No pude comprobar tours existentes: ${existingError.message}`,
      );
    }

    const existingByServiceId = new Map<
      string,
      {
        id: string;
        service_id: string;
        date: string;
        start_time: string | null;
      }
    >();

    for (const tour of existingTours ?? []) {
      if (tour.service_id) {
        existingByServiceId.set(
          tour.service_id,
          tour,
        );
      }
    }

    // -------------------------------------------------------------------------
    // UPSERT
    // -------------------------------------------------------------------------
    //
    // Si el mismo Excel se vuelve a cargar, no creamos un segundo tour.
    // service_id funciona como identificador del servicio.
    //
    // No tocamos campos que el documento no conoce:
    // - guides
    // - backup guides
    // - meeting point
    // - voucher
    // - photos
    // - completed_at
    //
    // Así la importación no destruye información ya existente.
    // -------------------------------------------------------------------------

    const insertedTours: unknown[] = [];
    const updatedTours: unknown[] = [];
    const errors: Array<{
      service_id: string | null;
      error: string;
    }> = [];

    for (const tour of finalTours) {
      try {
        const existing = tour.service_id
          ? existingByServiceId.get(
              tour.service_id,
            )
          : undefined;

        if (existing) {
          const { data, error } = await supabase
            .from("tours")
            .update({
              date: tour.date,
              start_time: tour.start_time,
              pax: tour.pax,
              tour_leader_id:
                tour.tour_leader_id,
              tour_leader_phone:
                tour.tour_leader_phone,
              city: "Brujas",
            })
            .eq("id", existing.id)
            .select()
            .single();

          if (error) {
            throw new Error(
              error.message,
            );
          }

          updatedTours.push(data);
        } else {
          const { data, error } = await supabase
            .from("tours")
            .insert({
              id: crypto.randomUUID(),
              service_id:
                tour.service_id,
              date: tour.date,
              start_time:
                tour.start_time,
              pax: tour.pax,
              tour_leader_id:
                tour.tour_leader_id,
              tour_leader_phone:
                tour.tour_leader_phone,
              city: "Brujas",
            })
            .select()
            .single();

          if (error) {
            throw new Error(
              error.message,
            );
          }

          insertedTours.push(data);
        }
      } catch (error) {
        errors.push({
          service_id: tour.service_id,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }

    // -------------------------------------------------------------------------
    // RESPUESTA
    // -------------------------------------------------------------------------

    return json({
      success: errors.length === 0,

      file: file.name,
      sheet: firstSheetName,

      importedCount:
        insertedTours.length,

      updatedCount:
        updatedTours.length,

      totalProcessed:
        finalTours.length,

      skippedCount:
        parsed.skipped.length,

      errorCount:
        errors.length,

      skipped:
        parsed.skipped,

      errors,

      // Información útil para comprobar que el parser está leyendo
      // correctamente el documento.
      columns: {
        grupo: columns.grupo,
        ttlPax: columns.pax,
        tourLeader: columns.tourLeader,
        phone: columns.phone,
        brujas: columns.brujas,
        brujasHour: columns.brujasHour,

        // Reservadas para futura implementación.
        bruselas: columns.bruselas,
        bruselasHour:
          columns.bruselasHour,
      },
    });
  } catch (error) {
    console.error(
      "import-tour-document error:",
      error,
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500,
    );
  }
});
