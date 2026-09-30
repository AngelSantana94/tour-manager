import * as XLSX from "npm:xlsx@0.18.5";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// import-client-document
// -----------------------------------------------------------------------------
// Importa el Excel que el proveedor Bespoke le manda directo a Rocío (fuera
// del Sheet de coordinación). Formato confirmado contra el archivo real
// (1134+ filas, 7 hojas): GRUPO | TTL PAX | TOUR LEADER | TEL. | BRUJAS | HR |
// BRUSELAS | HR. Una hoja ("UpdatePreventa...") trae además columnas
// PREVENTA intercaladas — el mapeo es por NOMBRE de cabecera, así que esa
// hoja no rompe nada.
//
// PROVEEDOR FIJO: todo lo que llega por este documento es Bespoke —
// confirmado con el proveedor real en la base (`select id, name from
// providers where id = 'be3caa85-...'` devolvió "Bespoke").
const BESPOKE_PROVIDER_ID = "be3caa85-f4f2-4d3f-b089-bc4de92dbea4";
const BESPOKE_PROVIDER_NAME = "Bespoke";
//
// BRUSELAS + HR: este MVP solo cubre Brujas (lo demás se monetiza más
// adelante, según lo hablado). Las columnas se detectan pero NO se procesan
// — ver más abajo, comentado a propósito.
//
// CONFIRMADO CONTRA EL ARCHIVO REAL:
// - BRUJAS es la fecha de llegada a Brujas de ese tour, HR es su hora.
// - Los valores de HR en el archivo real son siempre 24h sin ambigüedad
//   ("13:00", objetos hora de Excel, o "-"/vacío cuando no hay hora). No
//   hace falta adivinar AM/PM para parsear la hora en sí. Aun así, se
//   calcula un `timePeriod` ("AM" | "PM" | "NT") derivado de la hora ya
//   parseada, solo para mostrar en la vista previa — regla: antes de las
//   12:00 = AM, 12:00 en adelante = PM, sin hora = NT. Esto NO se guarda en
//   `tours` (esa tabla no tiene columna para ello); es solo informativo.
// - TOUR LEADER puede venir literalmente "Cancelado" (121 filas en el
//   archivo real) — esas filas se descartan por completo, no se suben.
// - GRUPO puede traer una letra de sufijo (bus/sub-grupo), p.ej. "GTE2608B"
//   o "VVE2629C" — sigue siendo el mismo patrón "letras+número" de
//   ExaTravel, solo con un carácter más al final. El detector de operador
//   ya lo contempla.
// =============================================================================

type Cell = string | number | boolean | null | undefined;

const norm = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const clean = (v: unknown): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s === "" || s === "-" ? null : s;
};

function isoFromParts(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) return null;
  return dt.toISOString().slice(0, 10);
}

// Igual que en sync-google-sheets: acepta serial de Excel, "2026-09-03", "03/09/2026"
function parseDate(v: Cell): string | null {
  if (typeof v === "number") {
    if (v < 36526 || v > 73050) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000)
      .toISOString().slice(0, 10);
  }
  const s = clean(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoFromParts(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) return isoFromParts(+m[3], +m[2], +m[1]);
  return null;
}

// Devuelve la hora en 24h ("HH:MM:SS"). El archivo real siempre trae la HR
// ya en 24h (o "-"/vacío), así que no hay que adivinar periodo aquí — el
// periodo (AM/PM/NT) se deriva aparte, solo para mostrar, con timePeriodOf().
function parseTime(v: Cell): string | null {
  if (typeof v === "number") {
    let minutes = Math.round((v - Math.floor(v)) * 1440);
    if (minutes === 0 || minutes >= 1440) return null;
    const h = Math.floor(minutes / 60);
    minutes = minutes % 60;
    return `${String(h).padStart(2, "0")}:${
      String(minutes).padStart(2, "0")
    }:00`;
  }
  const s = clean(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\s*[:.h]\s*(\d{2})/i);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}:00`;
}

// Solo para la vista previa (no se guarda en `tours`): "antes de las 12:00"
// = AM, "de las 12:00 en adelante" = PM, sin hora = NT.
function timePeriodOf(time24: string | null): "AM" | "PM" | "NT" {
  if (!time24) return "NT";
  const hour = parseInt(time24.slice(0, 2), 10);
  return hour < 12 ? "AM" : "PM";
}

function parsePax(v: Cell): { pax: number | null; raw: string | null } {
  if (typeof v === "number") return { pax: Math.round(v), raw: null };
  const s = clean(v);
  if (!s) return { pax: null, raw: null };
  if (/^\d+$/.test(s)) return { pax: parseInt(s, 10), raw: null };
  const m = s.match(/^(\d+)/);
  return { pax: m ? parseInt(m[1], 10) : null, raw: s };
}

function findCol(
  headers: string[],
  ...tests: Array<(h: string) => boolean>
): number {
  for (const t of tests) {
    const i = headers.findIndex(t);
    if (i !== -1) return i;
  }
  return -1;
}

// ─── DETECCIÓN DE OPERADOR POR PATRÓN DEL CÓDIGO GRUPO ──────────────────────
// Confirmado sobre las filas reales: "letras + número [+ letra opcional de
// sub-grupo/bus]" (GTE2608, BEL2607, GTE2608B, VVE2629C...) => ExaTravel. El
// patrón numérico-con-guion (12047-320, como en el Sheet de coordinación) =>
// BeyTours. Si un código no encaja en ninguno de los dos, se deja sin
// operador (null) en vez de adivinar — se ve reflejado en la vista previa
// como "Sin operador".
function detectOperatorFromGrupo(grupo: string): string | null {
  if (/^[A-Za-z]+\d+[A-Za-z]?$/.test(grupo)) return "ExaTravel";
  if (/^\d+-\d+$/.test(grupo)) return "BeyTours";
  return null;
}

function isCancelledLeader(leaderRaw: string | null): boolean {
  return norm(leaderRaw) === "cancelado";
}

interface ColumnMap {
  grupo: number;
  pax: number;
  leader: number;
  phone: number;
  brujasDate: number;
  brujasHr: number;
  bruselasDate: number; // detectada pero ignorada, ver nota arriba
  bruselasHr: number; // detectada pero ignorada, ver nota arriba
}

function mapColumns(
  rawHeaders: Cell[],
): { c: ColumnMap; missingColumns: string[] } {
  const H = rawHeaders.map(norm);
  const c: ColumnMap = {
    grupo: findCol(H, (h) => h === "grupo"),
    pax: findCol(H, (h) => h === "ttl pax", (h) => h.includes("pax")),
    leader: findCol(H, (h) => h === "tour leader", (h) => h.includes("leader")),
    phone: findCol(H, (h) => h === "tel.", (h) => h.startsWith("tel")),
    brujasDate: findCol(H, (h) => h === "brujas"),
    brujasHr: -1, // se resuelve abajo: la 1ª "hr" después de "brujas"
    bruselasDate: findCol(H, (h) => h === "bruselas"),
    bruselasHr: -1, // se resuelve abajo: la 1ª "hr" después de "bruselas"
  };
  // "HR" aparece dos veces (una por ciudad) — se toma la más cercana a la
  // derecha de cada columna de ciudad, no la primera "hr" del documento.
  // (Nota: esto funciona igual aunque la hoja tenga columnas "PREVENTA"
  // intercaladas, porque se busca por nombre de cabecera, no por posición
  // fija.)
  const hrIdx = H.reduce<number[]>(
    (acc, h, i) => (h === "hr" ? [...acc, i] : acc),
    [],
  );
  c.brujasHr = hrIdx.find((i) => i > c.brujasDate) ?? -1;
  c.bruselasHr = hrIdx.find((i) => i > c.bruselasDate && i !== c.brujasHr) ??
    -1;

  const required: [keyof ColumnMap, string][] = [
    ["grupo", "GRUPO"],
    ["pax", "TTL PAX"],
    ["leader", "TOUR LEADER"],
    ["phone", "TEL."],
    ["brujasDate", "BRUJAS"],
  ];
  const missingColumns = required.filter(([key]) => c[key] === -1).map((
    [, label],
  ) => label);

  return { c, missingColumns };
}

interface ParsedRow {
  service_id: string;
  date: string | null;
  start_time: string | null;
  timePeriod: "AM" | "PM" | "NT"; // solo para mostrar, no se guarda en `tours`
  pax: number | null;
  tour_leader_phone: string | null;
  operatorName: string | null;
  leaderName: string | null;
  providerName: string; // fijo, siempre "Bespoke" en este import
}

function parseSheet(rows: Cell[][]): {
  parsed: ParsedRow[];
  skipped: { row: number; reason: string }[];
  missingColumns: string[];
} {
  let hIdx = rows.findIndex((r) => r.some((c) => norm(c) === "grupo"));
  if (hIdx === -1) hIdx = 0;
  const { c, missingColumns } = mapColumns(rows[hIdx] || []);
  if (c.grupo === -1) {
    throw new Error(
      `No encontré la cabecera 'GRUPO'. Cabeceras leídas: ${
        (rows[hIdx] || []).map(clean).filter(Boolean).join(", ") || "(ninguna)"
      }`,
    );
  }

  const get = (r: Cell[], i: number): Cell => (i === -1 ? null : r[i]);
  const parsed: ParsedRow[] = [];
  const skipped: { row: number; reason: string }[] = [];

  for (let n = hIdx + 1; n < rows.length; n++) {
    const r = rows[n] || [];
    const grupo = clean(get(r, c.grupo));
    if (!grupo) continue; // fila vacía

    const leaderName = clean(get(r, c.leader));
    if (isCancelledLeader(leaderName)) {
      skipped.push({
        row: n + 1,
        reason:
          "Tour leader marcado como 'Cancelado' — se descarta automáticamente",
      });
      continue;
    }

    const date = parseDate(get(r, c.brujasDate));
    if (!date) {
      skipped.push({
        row: n + 1,
        reason: `Fecha inválida o vacía en BRUJAS (${
          JSON.stringify(get(r, c.brujasDate))
        })`,
      });
      continue;
    }

    const { pax } = parsePax(get(r, c.pax));
    const start_time = parseTime(get(r, c.brujasHr));
    const grupoClean = grupo.replace(/\s+/g, "");

    parsed.push({
      service_id: grupoClean,
      date,
      start_time,
      timePeriod: timePeriodOf(start_time),
      pax,
      tour_leader_phone: clean(get(r, c.phone)),
      operatorName: detectOperatorFromGrupo(grupoClean),
      leaderName,
      providerName: BESPOKE_PROVIDER_NAME,
    });

    // BRUSELAS + HR: ignorado a propósito en este MVP (solo se cobra/gestiona
    // Brujas por ahora). Cuando se retome, aquí se leería:
    //   const bruselasDate = parseDate(get(r, c.bruselasDate));
    //   const bruselasHr = parseTime(get(r, c.bruselasHr));
    // y probablemente se crearía una segunda fila en `tours` con city="Bruselas".
  }

  return { parsed, skipped, missingColumns };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function resolveOrCreateByName(
  supabase: ReturnType<typeof createClient>,
  table: string,
  names: (string | null)[],
  extraForInsert?: (name: string) => Record<string, unknown>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await supabase.from(table).select("id, name");
  if (error) throw new Error(`No pude leer '${table}': ${error.message}`);
  for (const row of (data ?? []) as { id: string; name: string }[]) {
    map.set(norm(row.name), row.id);
  }

  const missing = [...new Set(names.filter((n): n is string => !!n))].filter((
    n,
  ) => !map.has(norm(n)));
  if (missing.length) {
    const rows = missing.map((n) => ({
      id: crypto.randomUUID(),
      name: n,
      ...(extraForInsert ? extraForInsert(n) : {}),
    }));
    const { data: inserted, error: insErr } = await supabase.from(table).insert(
      rows,
    ).select("id, name");
    if (insErr) {
      throw new Error(`No pude crear en '${table}': ${insErr.message}`);
    }
    for (const row of (inserted ?? []) as { id: string; name: string }[]) {
      map.set(norm(row.name), row.id);
    }
  }
  return map;
}

function decodeWorkbook(fileBase64: string): XLSX.WorkBook {
  const bin = atob(fileBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return XLSX.read(bytes, { type: "array", cellDates: false });
}

function sheetToRows(wb: XLSX.WorkBook, sheetName: string): Cell[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`La hoja '${sheetName}' no existe en el archivo.`);
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
  }) as Cell[][];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { action, fileBase64, sheetName } = await req.json();
    if (!fileBase64) throw new Error("Se requiere 'fileBase64'.");

    const wb = decodeWorkbook(fileBase64);
    const sheetNames = wb.SheetNames;

    // ---------------- VISTA PREVIA (todas las hojas, sin tocar la BD) ------
    if (action === "preview") {
      const results: Record<string, unknown> = {};
      for (const name of sheetNames) {
        try {
          const rows = sheetToRows(wb, name);
          const { parsed, skipped, missingColumns } = parseSheet(rows);
          results[name] = {
            rowCount: parsed.length,
            sample: parsed,
            skipped,
            missingColumns,
          };
        } catch (e) {
          results[name] = { error: e instanceof Error ? e.message : String(e) };
        }
      }
      return json({ success: true, sheetNames, results });
    }

    // ---------------- CONFIRMAR (una hoja concreta, escribe en tours) ------
    if (action === "confirm") {
      if (!sheetName) throw new Error("Se requiere 'sheetName'.");
      const rows = sheetToRows(wb, sheetName);
      const { parsed, skipped, missingColumns } = parseSheet(rows);

      const operatorMap = await resolveOrCreateByName(
        supabase,
        "tour_operators",
        parsed.map((p) => p.operatorName),
      );
      const leaderPhoneByName = new Map<string, string>();
      for (const p of parsed) {
        if (
          p.leaderName && p.tour_leader_phone &&
          !leaderPhoneByName.has(norm(p.leaderName))
        ) {
          leaderPhoneByName.set(norm(p.leaderName), p.tour_leader_phone);
        }
      }
      const leaderMap = await resolveOrCreateByName(
        supabase,
        "tour_leaders",
        parsed.map((p) => p.leaderName),
        (name) => ({ phone: leaderPhoneByName.get(norm(name)) ?? null }),
      );

      const unmatchedOperators = new Set<string>();
      const records = parsed.map((p) => ({
        service_id: p.service_id,
        date: p.date,
        start_time: p.start_time,
        pax: p.pax,
        tour_leader_phone: p.tour_leader_phone,
        city: "Brujas",
        meeting_point: "Bargeplein",
        status: "Confirmado",
        provider_id: BESPOKE_PROVIDER_ID,
        tour_operator_id: p.operatorName
          ? operatorMap.get(norm(p.operatorName)) ?? null
          : null,
        tour_leader_id: p.leaderName
          ? leaderMap.get(norm(p.leaderName)) ?? null
          : null,
      }));
      records.forEach((r, i) => {
        if (parsed[i].operatorName && !r.tour_operator_id) {
          unmatchedOperators.add(parsed[i].operatorName!);
        }
      });

      const errors: string[] = [];
      let inserted = 0;
      const CHUNK = 100;
      for (let i = 0; i < records.length; i += CHUNK) {
        const batch = records.slice(i, i + CHUNK);
        const { error } = await supabase.from("tours").upsert(batch, {
          onConflict: "service_id",
        });
        if (error) errors.push(error.message);
        else inserted += batch.length;
      }

      return json({
        success: errors.length === 0,
        inserted,
        totalParsed: parsed.length,
        skipped,
        missingColumns,
        unmatchedOperators: [...unmatchedOperators],
        errors,
      });
    }

    return json({ error: "Acción no válida. Usa 'preview' o 'confirm'." }, 400);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
