import "@supabase/functions-js/edge-runtime.d.ts";
import { JWT } from "npm:google-auth-library@9.1.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Margen para romper el bucle de sincronización: si la diferencia entre
// "última edición del Sheet" y "updated_at de la BD" es menor a esto, se
// considera que NO hay un cambio genuino más reciente en ese lado — así el
// propio eco de nuestras escrituras automáticas no se re-procesa sin fin.
const CONFLICT_TOLERANCE_MS = 5000;

// ===== PURE:START (lógica sin dependencias, testeable) ======================

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
  return s === "" ? null : s;
};

const slug = (v: unknown, max = 18): string =>
  norm(v).replace(/[^a-z0-9]+/g, "").slice(0, max).toUpperCase() || "X";

function isoFromParts(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) return null;
  return dt.toISOString().slice(0, 10);
}

// Acepta número de serie de Sheets/Excel, "2026-09-03", "03/09/2026" (día/mes/año)
function parseDate(v: Cell): string | null {
  if (typeof v === "number") {
    if (v < 36526 || v > 73050) return null; // fuera de 2000-2099 => basura (#VALUE!, etc.)
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

// Acepta fracción de día (0.5 = 12:00), fecha+hora serial, "11:30", "11.30", "11h30"
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

// Fecha+hora en una sola celda (columna "ÚltimaEdición"): serial con parte
// entera = días y decimal = hora del día, igual que Sheets guarda cualquier
// datetime. Devuelve ISO completo (con hora), no solo la fecha.
function parseDateTime(v: Cell): string | null {
  if (typeof v === "number") {
    if (v < 1) return null;
    const days = Math.floor(v);
    const msOfDay = Math.round((v - days) * 86400000);
    const base = Date.UTC(1899, 11, 30);
    return new Date(base + days * 86400000 + msOfDay).toISOString();
  }
  const s = clean(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Inverso de parseDateTime — para escribir "ahora" en la celda ÚltimaEdición
// como número (serial de Sheets), no como texto.
function toSheetsSerial(isoString: string): number {
  const ms = new Date(isoString).getTime();
  const epoch = Date.UTC(1899, 11, 30);
  return (ms - epoch) / 86400000;
}

// "26/40" -> 26 | "/35" -> null | "2 guias" -> 2 | 19 -> 19
function parsePax(v: Cell): { pax: number | null; raw: string | null } {
  if (typeof v === "number") return { pax: Math.round(v), raw: null };
  const s = clean(v);
  if (!s) return { pax: null, raw: null };
  if (/^\d+$/.test(s)) return { pax: parseInt(s, 10), raw: null };
  const m = s.match(/^(\d+)/);
  return { pax: m ? parseInt(m[1], 10) : null, raw: s };
}

// Devuelve el índice de la primera columna que cumple el primer test que tenga coincidencias
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

export interface ColumnMap {
  id: number;
  date: number;
  start: number;
  end: number;
  type: number;
  operator: number;
  leader: number;
  phone: number;
  provider: number;
  city: number;
  pax: number;
  comments: number;
  lead: number;
  backup1: number;
  backup2: number;
  meeting: number;
  status: number;
  notes: number;
  period: number;
  lastEdit: number;
}

const CORE_COLUMNS: Record<string, string> = {
  operator: "Tour Operador",
  leader: "Guía acompañante",
  phone: "Teléf. TourLider",
  type: "Tipo",
  provider: "Proveedor",
  city: "Ciudad",
  pax: "Pax",
  lead: "Guía Lead",
  meeting: "Punto encuentro",
  status: "Estado",
};

// Localiza las columnas SIEMPRE por el texto de su cabecera, nunca por
// posición — reordenar columnas o añadir nuevas no afecta. Compartida entre
// el parseo de import y la localización de celdas para el push de vuelta.
export function mapColumns(
  rawHeaders: Cell[],
): { c: ColumnMap; missingColumns: string[]; ignoredHeaders: string[] } {
  const H = rawHeaders.map(norm);

  const c: ColumnMap = {
    id: findCol(
      H,
      (h) => h === "id servicio",
      (h) => h.includes("id servicio"),
    ),
    date: findCol(H, (h) => h === "fecha"),
    start: findCol(H, (h) => h === "inicio", (h) => h === "fechahorainicio"),
    end: findCol(H, (h) => h === "termino", (h) => h === "fechahoratermino"),
    type: findCol(H, (h) => h === "tipo"),
    operator: findCol(H, (h) => h === "tour operador"),
    leader: findCol(H, (h) => h === "guia acompanante"),
    phone: findCol(H, (h) => h.startsWith("telef") && h.includes("lider")),
    provider: findCol(H, (h) => h === "proveedor"),
    city: findCol(H, (h) => h === "ciudad"),
    pax: findCol(H, (h) => h === "pax"),
    comments: findCol(H, (h) => h.startsWith("come")), // "Comentarios" y el typo "Comemtarios"
    lead: findCol(H, (h) => h === "guia lead", (h) => h === "guia local 1"),
    backup1: findCol(H, (h) => h === "back up 1", (h) => h === "guia local 2"),
    backup2: findCol(H, (h) => h === "back up 2", (h) => h === "guia local 3"),
    meeting: findCol(H, (h) => h === "punto encuentro"),
    status: findCol(H, (h) => h === "estado"),
    notes: findCol(H, (h) => h === "notas"),
    period: findCol(H, (h) => h === "periodo"),
    lastEdit: findCol(
      H,
      (h) => h.includes("ultimaedicion") || h.includes("ultima edicion"),
    ),
  };

  if (c.id === -1 || c.date === -1) {
    throw new Error(
      `No encontré la cabecera 'ID Servicio' y/o 'Fecha' (¿fueron renombradas?). Cabeceras leídas: ${
        rawHeaders.map(clean).filter(Boolean).join(", ") || "(ninguna)"
      }`,
    );
  }

  const missingColumns = Object.entries(CORE_COLUMNS)
    .filter(([key]) => (c as Record<string, number>)[key] === -1)
    .map(([, label]) => label);
  const used = new Set(Object.values(c).filter((i) => i !== -1));
  const ignoredHeaders = rawHeaders
    .map((h, i) => ({ h: clean(h), i }))
    .filter(({ h, i }) => h && !used.has(i) && !/^columna\d+$/i.test(h))
    .map(({ h }) => h as string);

  return { c, missingColumns, ignoredHeaders };
}

export interface ParsedRecord {
  service_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  tour_leader_phone: string | null;
  tour_type: string | null;
  city: string | null;
  pax: number | null;
  meeting_point: string | null;
  status: string;
  notes: string | null;
  period?: string;
  [k: string]: unknown;
}

type RefField =
  | "tour_operator_id"
  | "provider_id"
  | "guide_lead_id"
  | "backup_1_id"
  | "backup_2_id"
  | "tour_leader_id";

export interface ParseResult {
  records: ParsedRecord[];
  refs: Record<RefField, string | null>[];
  meta: { row: number; generated: boolean; sheetLastEdit: string | null }[];
  idCol: number;
  skipped: { row: number; reason: string; id: string | null }[];
  duplicates: { row: number; original: string; assigned: string }[];
  generatedIds: number;
  missingColumns: string[];
  ignoredHeaders: string[];
}

export const GENERATED_ID_PREFIX = "TM-";

export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseRangeStart(
  range: string,
): { colIdx: number; row: number; sheet: string } {
  const bang = range.lastIndexOf("!");
  const sheet = bang === -1 ? range : range.slice(0, bang);
  const cells = bang === -1 ? "" : range.slice(bang + 1);
  const m = cells.match(/^\$?([A-Za-z]+)\$?(\d+)/);
  return {
    sheet,
    colIdx: m ? colIndex(m[1]) : 0,
    row: m ? parseInt(m[2], 10) : 1,
  };
}

export function parseAgenda(rows: Cell[][]): ParseResult {
  const skipped: ParseResult["skipped"] = [];
  const duplicates: ParseResult["duplicates"] = [];
  const records: ParsedRecord[] = [];
  const refs: ParseResult["refs"] = [];
  const meta: ParseResult["meta"] = [];

  let hIdx = rows.findIndex((r) =>
    r.some((c) => norm(c).includes("id servicio"))
  );
  if (hIdx === -1) hIdx = 0;
  const rawHeaders = rows[hIdx] || [];
  const { c, missingColumns, ignoredHeaders } = mapColumns(rawHeaders);

  const get = (r: Cell[], i: number): Cell => (i === -1 ? null : r[i]);

  for (let n = hIdx + 1; n < rows.length; n++) {
    const r = rows[n] || [];
    const excelRow = n + 1;

    const rawId = clean(get(r, c.id));
    const operator = clean(get(r, c.operator));
    const leader = clean(get(r, c.leader));

    if (
      !rawId && !operator && !leader &&
      (get(r, c.date) == null || get(r, c.date) === "")
    ) continue;
    if (
      rawId && (/^columna\d+$/i.test(rawId) || norm(rawId) === "id servicio")
    ) continue;

    const date = parseDate(get(r, c.date));
    if (!date) {
      skipped.push({
        row: excelRow,
        id: rawId,
        reason: `Fecha inválida o vacía (${JSON.stringify(get(r, c.date))})`,
      });
      continue;
    }

    const generated = !rawId || /^sin\s*id$/i.test(rawId);
    const service_id = generated
      ? `${GENERATED_ID_PREFIX}${date.replace(/-/g, "")}-${slug(operator, 8)}-${
        slug(leader, 14)
      }`
      : rawId!.replace(/\s+/g, "");

    const { pax, raw: paxRaw } = parsePax(get(r, c.pax));
    const noteParts = [
      clean(get(r, c.notes)),
      clean(get(r, c.comments)),
      paxRaw ? `Pax original: ${paxRaw}` : null,
    ].filter(Boolean) as string[];

    const periodRaw = clean(get(r, c.period));
    const period =
      periodRaw && ["AM", "PM", "NT"].includes(periodRaw.toUpperCase())
        ? periodRaw.toUpperCase()
        : undefined;

    records.push({
      service_id,
      date,
      start_time: parseTime(get(r, c.start)),
      end_time: parseTime(get(r, c.end)),
      tour_leader_phone: clean(get(r, c.phone)),
      tour_type: clean(get(r, c.type)),
      city: clean(get(r, c.city)) ?? "Brujas",
      pax,
      meeting_point: clean(get(r, c.meeting)) ?? "Bargeplein",
      status: clean(get(r, c.status)) ?? "Confirmado",
      notes: noteParts.length ? noteParts.join(" | ") : null,
      ...(period ? { period } : {}),
    });
    meta.push({
      row: excelRow,
      generated,
      sheetLastEdit: parseDateTime(get(r, c.lastEdit)),
    });
    refs.push({
      tour_operator_id: operator,
      provider_id: clean(get(r, c.provider)),
      guide_lead_id: clean(get(r, c.lead)),
      backup_1_id: clean(get(r, c.backup1)),
      backup_2_id: clean(get(r, c.backup2)),
      tour_leader_id: leader,
    });
  }

  const seen = new Map<string, number>();
  records.forEach((rec, i) => {
    const base = rec.service_id;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if (count === 0) return;
    if (meta[i].generated) {
      rec.service_id = `${base}-${count + 1}`;
    } else {
      const withDate = `${base}@${rec.date}`;
      rec.service_id = seen.has(withDate)
        ? `${withDate}#${count + 1}`
        : withDate;
      duplicates.push({
        row: meta[i].row,
        original: base,
        assigned: rec.service_id,
      });
    }
    seen.set(rec.service_id, 1);
  });

  return {
    records,
    refs,
    meta,
    idCol: c.id,
    skipped,
    duplicates,
    generatedIds: meta.filter((m) => m.generated).length,
    missingColumns,
    ignoredHeaders,
  };
}

// ---------------------------------------------------------------------------
// GUÍAS LOCALES (pestaña "Base_Guías Locales")
// ---------------------------------------------------------------------------
const LANG_CANON: Record<string, string> = {
  espanol: "Español",
  castellano: "Español",
  ingles: "Inglés",
  english: "Inglés",
  frances: "Francés",
  neerlandes: "Neerlandés",
  holandes: "Neerlandés",
  portugues: "Portugués",
  italiano: "Italiano",
  aleman: "Alemán",
};

export function parseLanguages(
  v: Cell,
): { languages: string[] | null; unknown: string[]; uncertain: boolean } {
  const s = clean(v);
  if (!s) return { languages: null, unknown: [], uncertain: false };
  const uncertain = s.includes("?");
  const out: string[] = [];
  const unknown: string[] = [];
  for (const part of s.replace(/\?/g, "").split(/[\/,;+&\-]|\sy\s/i)) {
    const t = clean(part);
    if (!t) continue;
    const canon = LANG_CANON[norm(t)];
    const value = canon ?? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    if (!canon) unknown.push(t);
    if (!out.includes(value)) out.push(value);
  }
  return { languages: out.length ? out : null, unknown, uncertain };
}

export interface ParsedGuide {
  name: string;
  city: string | null;
  languages: string[] | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export function parseGuides(rows: Cell[][]): {
  guides: ParsedGuide[];
  skipped: { row: number; reason: string }[];
  warnings: string[];
} {
  const skipped: { row: number; reason: string }[] = [];
  const warnings: string[] = [];
  const guides: ParsedGuide[] = [];

  let hIdx = rows.findIndex((r) => r.some((c) => norm(c) === "nombre"));
  if (hIdx === -1) {
    throw new Error("No encontré la cabecera 'Nombre' en la pestaña de guías.");
  }
  const H = rows[hIdx].map(norm);
  const c = {
    name: findCol(H, (h) => h === "nombre"),
    city: findCol(H, (h) => h === "origen", (h) => h === "ciudad"),
    lang: findCol(H, (h) => h === "idioma" || h === "idiomas"),
    email: findCol(H, (h) => h === "email" || h === "correo"),
    phone: findCol(H, (h) => h.startsWith("telef")),
    notes: findCol(H, (h) => h === "observaciones" || h === "notas"),
  };
  const get = (r: Cell[], i: number): Cell => (i === -1 ? null : r[i]);

  const seen = new Set<string>();
  for (let n = hIdx + 1; n < rows.length; n++) {
    const r = rows[n] || [];
    const name = clean(get(r, c.name));
    if (!name) continue;
    const key = norm(name);
    if (seen.has(key)) {
      skipped.push({
        row: n + 1,
        reason: `Nombre repetido en la hoja: ${name}`,
      });
      continue;
    }
    seen.add(key);

    const { languages, unknown, uncertain } = parseLanguages(get(r, c.lang));
    if (unknown.length) {
      warnings.push(`${name}: idioma no reconocido (${unknown.join(", ")})`);
    }
    if (uncertain) {
      warnings.push(`${name}: el idioma tenía un '?' en la hoja, revisar`);
    }

    let email = clean(get(r, c.email))?.toLowerCase() ?? null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push(
        `${name}: email con formato raro (${email}), se dejó vacío`,
      );
      email = null;
    }

    guides.push({
      name,
      city: clean(get(r, c.city)),
      languages,
      email,
      phone: clean(get(r, c.phone)),
      notes: clean(get(r, c.notes)),
    });
  }
  return { guides, skipped, warnings };
}

export function fillBlankPatch(
  existing: Record<string, unknown>,
  incoming: ParsedGuide,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const f of ["city", "email", "phone", "notes"] as const) {
    const cur = existing[f];
    if ((cur == null || String(cur).trim() === "") && incoming[f]) {
      patch[f] = incoming[f];
    }
  }
  const curLang = existing["languages"] as unknown[] | null;
  if ((!curLang || curLang.length === 0) && incoming.languages) {
    patch["languages"] = incoming.languages;
  }
  return patch;
}

// ===== PURE:END =============================================================

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function resolveOrCreateByName(
  supabase: ReturnType<typeof createClient>,
  table: string,
  nameColumn: string,
  names: (string | null)[],
  extraForInsert?: (name: string) => Record<string, unknown>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const { data, error } = await supabase.from(table).select(
    `id, ${nameColumn}`,
  );
  if (error) throw new Error(`No pude leer '${table}': ${error.message}`);
  for (const row of (data ?? []) as Record<string, string>[]) {
    map.set(norm(row[nameColumn]), row.id);
  }

  const uniqueNames = [...new Set(names.filter((n): n is string => !!n))];
  const missing = uniqueNames.filter((n) => !map.has(norm(n)));

  if (missing.length) {
    const rows = missing.map((n) => ({
      id: crypto.randomUUID(),
      [nameColumn]: n,
      ...(extraForInsert ? extraForInsert(n) : {}),
    }));
    const { data: inserted, error: insErr } = await supabase
      .from(table).insert(rows).select(`id, ${nameColumn}`);
    if (insErr) {
      throw new Error(`No pude crear en '${table}': ${insErr.message}`);
    }
    for (const row of (inserted ?? []) as Record<string, string>[]) {
      map.set(norm(row[nameColumn]), row.id);
    }
  }

  return map;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Nombre de la pestaña "Agenda <Mes>" a partir de una fecha ISO — los tours
// creados/importados se agrupan por mes de la fecha del tour, igual que el
// propio Sheet está organizado.
const MESES_TAB = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
function tabNameForDate(dateISO: string): string {
  const month = parseInt(dateISO.slice(5, 7), 10) - 1;
  return `'Agenda ${MESES_TAB[month]}'`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    let privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY");
    if (!clientEmail || !privateKey) {
      throw new Error(
        "Faltan credenciales de Google Service Account en los Secrets.",
      );
    }
    privateKey = privateKey.replace(/\\n/g, "\n");

    const auth = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const { access_token: accessToken } = await auth.authorize();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();

    // ────────────────────────────────────────────────────────────────────
    // PUSH BD → SHEET: esto es lo que llama el Database Webhook de Supabase.
    // Su payload trae {type, table, record, old_record} — se detecta así,
    // antes de mirar 'action' (que es lo que usan nuestros propios scripts).
    // ────────────────────────────────────────────────────────────────────
    if (body.type === "UPDATE" && body.table === "tours" && body.record) {
      const record = body.record as Record<string, unknown>;
      const serviceId = record.service_id as string | null;
      const spreadsheetId = Deno.env.get("SYNC_SPREADSHEET_ID");

      if (!serviceId || !spreadsheetId) {
        // Tour creado directo en la webapp (sin service_id) — no tiene fila
        // en el Sheet todavía; se ignora en esta versión, ver limitaciones.
        return json({
          success: true,
          skipped: true,
          reason: "sin service_id o sin spreadsheetId configurado",
        });
      }

      const sheetRange = tabNameForDate(record.date as string);
      const readUrl =
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${
          encodeURIComponent(sheetRange)
        }?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
      const readRes = await fetch(readUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!readRes.ok) {
        throw new Error(`Error leyendo Sheet: ${await readRes.text()}`);
      }
      const rows: Cell[][] = (await readRes.json()).values || [];

      let hIdx = rows.findIndex((r) =>
        r.some((c) => norm(c).includes("id servicio"))
      );
      if (hIdx === -1) hIdx = 0;
      const { c } = mapColumns(rows[hIdx] || []);

      const rowIdx = rows.findIndex((r, i) =>
        i > hIdx && clean(r[c.id])?.replace(/\s+/g, "") === serviceId
      );
      if (rowIdx === -1) {
        return json({
          success: true,
          skipped: true,
          reason: `service_id ${serviceId} no encontrado en ${sheetRange}`,
        });
      }

      // Comprobación anti-bucle / anti-conflicto: solo escribir si la BD es
      // claramente más nueva que la última edición humana de esa fila.
      const sheetLastEdit = c.lastEdit !== -1
        ? parseDateTime(rows[rowIdx][c.lastEdit])
        : null;
      const dbUpdatedAt = record.updated_at as string | null;
      if (sheetLastEdit && dbUpdatedAt) {
        const diff = new Date(dbUpdatedAt).getTime() -
          new Date(sheetLastEdit).getTime();
        if (diff < CONFLICT_TOLERANCE_MS) {
          return json({
            success: true,
            skipped: true,
            reason: "Sheet igual o más reciente, no se pisa",
          });
        }
      }

      // Resolver nombres para las columnas relacionales del Sheet
      const ids = {
        guide_lead_id: record.guide_lead_id as string | null,
        backup_1_id: record.backup_1_id as string | null,
        backup_2_id: record.backup_2_id as string | null,
        tour_operator_id: record.tour_operator_id as string | null,
        provider_id: record.provider_id as string | null,
        tour_leader_id: record.tour_leader_id as string | null,
      };
      const guideIds = [ids.guide_lead_id, ids.backup_1_id, ids.backup_2_id]
        .filter(Boolean) as string[];
      const [
        { data: guideRows },
        { data: opRows },
        { data: provRows },
        { data: leaderRows },
      ] = await Promise.all([
        guideIds.length
          ? supabase.from("guides").select("id, name").in("id", guideIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        ids.tour_operator_id
          ? supabase.from("tour_operators").select("id, name").eq(
            "id",
            ids.tour_operator_id,
          )
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        ids.provider_id
          ? supabase.from("providers").select("id, name").eq(
            "id",
            ids.provider_id,
          )
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        ids.tour_leader_id
          ? supabase.from("tour_leaders").select("id, name").eq(
            "id",
            ids.tour_leader_id,
          )
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const nameOf = (
        rows: { id: string; name: string }[] | null,
        id: string | null,
      ) => id ? rows?.find((r) => r.id === id)?.name ?? null : null;

      const excelRow = rowIdx + 1; // 1-based para A1 notation
      const sheetNameOnly = sheetRange.replace(/^'|'$/g, "");

      const writes: { range: string; values: unknown[][] }[] = [];
      const put = (colIdx: number, value: unknown) => {
        if (colIdx === -1) return;
        writes.push({
          range: `'${sheetNameOnly}'!${colLetter(colIdx)}${excelRow}`,
          values: [[value ?? ""]],
        });
      };

      put(c.date, record.date);
      put(
        c.start,
        record.start_time ? String(record.start_time).slice(0, 5) : "",
      );
      put(c.end, record.end_time ? String(record.end_time).slice(0, 5) : "");
      put(c.type, record.tour_type);
      put(c.operator, nameOf(opRows, ids.tour_operator_id));
      put(c.leader, nameOf(leaderRows, ids.tour_leader_id));
      put(c.phone, record.tour_leader_phone);
      put(c.provider, nameOf(provRows, ids.provider_id));
      put(c.city, record.city);
      put(c.pax, record.pax);
      put(c.lead, nameOf(guideRows, ids.guide_lead_id));
      put(c.backup1, nameOf(guideRows, ids.backup_1_id));
      put(c.backup2, nameOf(guideRows, ids.backup_2_id));
      put(c.meeting, record.meeting_point);
      put(c.status, record.status);
      put(c.notes, record.notes);
      put(c.period, record.period);
      if (c.lastEdit !== -1) {
        put(
          c.lastEdit,
          toSheetsSerial(dbUpdatedAt ?? new Date().toISOString()),
        );
      }

      if (writes.length) {
        const wb = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ valueInputOption: "RAW", data: writes }),
          },
        );
        if (!wb.ok) {
          throw new Error(`Error escribiendo en Sheet: ${await wb.text()}`);
        }
      }

      return json({
        success: true,
        written: writes.length,
        sheet: sheetRange,
        row: excelRow,
      });
    }

    const { action, spreadsheetId, range, values, dryRun } = body;
    if (!spreadsheetId) {
      throw new Error("Se requiere 'spreadsheetId' en la petición.");
    }

    // ---------------- LEER ----------------
    if (action === "read") {
      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${
          encodeURIComponent(range || "A1:Z1000")
        }`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`Error Google Sheets API: ${await response.text()}`);
      }
      const data = await response.json();
      return json({ success: true, values: data.values || [] });
    }

    // ---------------- ESCRIBIR ----------------
    if (action === "write") {
      if (!range || !values) {
        throw new Error("Se requieren 'range' y 'values'.");
      }
      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${
          encodeURIComponent(range)
        }?valueInputOption=USER_ENTERED`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      });
      if (!response.ok) {
        throw new Error(
          `Error escribiendo en Google Sheets: ${await response.text()}`,
        );
      }
      const data = await response.json();
      return json({ success: true, updatedCells: data.updatedCells });
    }

    // ---------------- IMPORTAR TOURS ----------------
    if (action === "import_tours") {
      const sheetRange = range || "'Agenda Septiembre'";
      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${
          encodeURIComponent(sheetRange)
        }?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(
          `Error leyendo Sheets (${response.status}): ${await response.text()}`,
        );
      }

      const rows: Cell[][] = (await response.json()).values || [];
      if (rows.length < 2) {
        return json({
          success: true,
          importedCount: 0,
          message: "Sin filas de datos.",
        });
      }

      const parsed = parseAgenda(rows);
      const {
        records,
        refs,
        meta,
        skipped,
        duplicates,
        generatedIds,
        missingColumns,
        ignoredHeaders,
      } = parsed;

      const unmatched = new Set<string>();

      const { data: guideRows, error: guideErr } = await supabase.from("guides")
        .select("id, name");
      if (guideErr) {
        throw new Error(`No pude leer 'guides': ${guideErr.message}`);
      }
      const guideMap = new Map<string, string>();
      for (const g of (guideRows ?? []) as { id: string; name: string }[]) {
        guideMap.set(norm(g.name), g.id);
      }

      const leaderPhoneByName = new Map<string, string>();
      refs.forEach((r, i) => {
        const name = r.tour_leader_id;
        const phone = records[i].tour_leader_phone;
        if (name && phone && !leaderPhoneByName.has(norm(name))) {
          leaderPhoneByName.set(norm(name), phone);
        }
      });

      const operatorMap = await resolveOrCreateByName(
        supabase,
        "tour_operators",
        "name",
        refs.map((r) => r.tour_operator_id),
      );
      const providerMap = await resolveOrCreateByName(
        supabase,
        "providers",
        "name",
        refs.map((r) => r.provider_id),
      );
      const leaderMap = await resolveOrCreateByName(
        supabase,
        "tour_leaders",
        "name",
        refs.map((r) => r.tour_leader_id),
        (name) => ({ phone: leaderPhoneByName.get(norm(name)) ?? null }),
      );

      records.forEach((rec, i) => {
        const r = refs[i];

        const leadName = r.guide_lead_id;
        rec.guide_lead_id = leadName
          ? guideMap.get(norm(leadName)) ?? null
          : null;
        if (leadName && !rec.guide_lead_id) {
          unmatched.add(`guide_lead_id: ${leadName}`);
        }

        const b1Name = r.backup_1_id;
        rec.backup_1_id = b1Name ? guideMap.get(norm(b1Name)) ?? null : null;
        if (b1Name && !rec.backup_1_id) unmatched.add(`backup_1_id: ${b1Name}`);

        const b2Name = r.backup_2_id;
        rec.backup_2_id = b2Name ? guideMap.get(norm(b2Name)) ?? null : null;
        if (b2Name && !rec.backup_2_id) unmatched.add(`backup_2_id: ${b2Name}`);

        const opName = r.tour_operator_id;
        rec.tour_operator_id = opName
          ? operatorMap.get(norm(opName)) ?? null
          : null;

        const provName = r.provider_id;
        rec.provider_id = provName
          ? providerMap.get(norm(provName)) ?? null
          : null;

        const leaderName = r.tour_leader_id;
        rec.tour_leader_id = leaderName
          ? leaderMap.get(norm(leaderName)) ?? null
          : null;
      });

      // ── Filtrar por conflicto: si ya existe el tour en la BD y su
      // updated_at es igual o más reciente que la edición del Sheet (con
      // margen), esa fila NO se pisa en este import.
      const serviceIds = records.map((r) => r.service_id);
      const { data: existingRows, error: existErr } = await supabase
        .from("tours").select("service_id, updated_at").in(
          "service_id",
          serviceIds,
        );
      if (existErr) {
        throw new Error(
          `No pude comprobar tours existentes: ${existErr.message}`,
        );
      }
      const existingByServiceId = new Map<string, string | null>();
      for (
        const row of (existingRows ?? []) as {
          service_id: string;
          updated_at: string | null;
        }[]
      ) {
        existingByServiceId.set(row.service_id, row.updated_at);
      }

      const conflictSkipped: {
        row: number;
        serviceId: string;
        reason: string;
      }[] = [];
      const finalRecords: ParsedRecord[] = [];
      const finalMeta: typeof meta = [];
      records.forEach((rec, i) => {
        const existingUpdatedAt = existingByServiceId.get(rec.service_id);
        if (existingUpdatedAt) {
          const sheetLastEdit = meta[i].sheetLastEdit;
          if (sheetLastEdit) {
            const diff = new Date(sheetLastEdit).getTime() -
              new Date(existingUpdatedAt).getTime();
            if (diff < CONFLICT_TOLERANCE_MS) {
              conflictSkipped.push({
                row: meta[i].row,
                serviceId: rec.service_id,
                reason: "La BD ya está igual o más actualizada que el Sheet",
              });
              return;
            }
          }
        }
        finalRecords.push(rec);
        finalMeta.push(meta[i]);
      });

      const report = {
        generatedIds,
        skipped,
        duplicates,
        missingColumns,
        ignoredHeaders,
        unmatched: [...unmatched].sort(),
        conflictSkipped,
      };

      if (dryRun) {
        return json({
          success: true,
          dryRun: true,
          wouldImport: finalRecords.length,
          wouldWriteBackIds: generatedIds,
          ...report,
          sample: finalRecords.slice(0, 3),
        });
      }

      const errors: string[] = [];
      let totalInserted = 0;
      const okIdx = new Set<number>();
      let offset = 0;
      for (const batch of chunkArray(finalRecords, 100)) {
        const { error } = await supabase.from("tours").upsert(batch, {
          onConflict: "service_id",
        });
        if (error) errors.push(error.message);
        else {
          totalInserted += batch.length;
          batch.forEach((_, k) => okIdx.add(offset + k));
        }
        offset += batch.length;
      }

      const writeBack: { attempted: number; written: number; error?: string } =
        { attempted: 0, written: 0 };
      const toWrite = finalMeta
        .map((m, i) => ({ ...m, id: finalRecords[i].service_id, i }))
        .filter((m) => m.generated && okIdx.has(m.i));
      writeBack.attempted = toWrite.length;

      if (toWrite.length) {
        try {
          const start = parseRangeStart(sheetRange);
          const col = colLetter(start.colIdx + parsed.idCol);
          const data = toWrite.map((m) => ({
            range: `${start.sheet}!${col}${start.row - 1 + m.row}`,
            values: [[m.id]],
          }));
          const wb = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ valueInputOption: "RAW", data }),
            },
          );
          if (!wb.ok) throw new Error(`(${wb.status}) ${await wb.text()}`);
          writeBack.written = toWrite.length;
        } catch (e) {
          writeBack.error = e instanceof Error ? e.message : String(e);
        }
      }

      return json({
        success: errors.length === 0 && !writeBack.error,
        importedCount: totalInserted,
        totalParsed: records.length,
        ...report,
        writeBack,
        errors,
      });
    }

    // ---------------- IMPORTAR GUÍAS LOCALES ----------------
    if (action === "import_guides") {
      let sheetRange: string = range;
      if (!sheetRange) {
        const metaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!metaRes.ok) {
          throw new Error(
            `Error leyendo pestañas (${metaRes.status}): ${await metaRes
              .text()}`,
          );
        }
        const titles: string[] = ((await metaRes.json()).sheets || []).map((
          s: any,
        ) => s.properties.title);
        const wanted = "base guias locales";
        const found = titles.find((t) =>
          norm(t).replace(/[_\s]+/g, " ") === wanted
        );
        if (!found) {
          throw new Error(
            `No encontré la pestaña 'Base_Guías Locales'. Pestañas: ${
              titles.join(", ")
            }`,
          );
        }
        sheetRange = `'${found.replace(/'/g, "''")}'`;
      }

      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${
          encodeURIComponent(sheetRange)
        }`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        throw new Error(
          `Error leyendo guías (${res.status}): ${await res.text()}`,
        );
      }
      const rows: Cell[][] = (await res.json()).values || [];

      const { guides, skipped, warnings } = parseGuides(rows);

      const { data: existingRows, error: exErr } = await supabase
        .from("guides").select(
          "id, name, city, languages, email, phone, notes",
        );
      if (exErr) {
        throw new Error(`No pude leer la tabla guides: ${exErr.message}`);
      }
      const existing = new Map<string, Record<string, unknown>>();
      for (const g of existingRows || []) existing.set(norm(g.name), g);

      const toInsert: Record<string, unknown>[] = [];
      const toUpdate: {
        id: string;
        name: string;
        patch: Record<string, unknown>;
      }[] = [];
      let unchanged = 0;
      for (const g of guides) {
        const cur = existing.get(norm(g.name));
        if (!cur) {
          toInsert.push({ id: crypto.randomUUID(), ...g });
        } else {
          const patch = fillBlankPatch(cur, g);
          if (Object.keys(patch).length) {
            toUpdate.push({ id: cur.id as string, name: g.name, patch });
          } else unchanged++;
        }
      }

      const summary = {
        sheet: sheetRange,
        readFromSheet: guides.length,
        toInsert: toInsert.length,
        toFillBlanks: toUpdate.length,
        unchanged,
        skipped,
        warnings,
      };
      if (dryRun) {
        return json({
          success: true,
          dryRun: true,
          ...summary,
          sample: toInsert.slice(0, 3),
          fillSample: toUpdate.slice(0, 3),
        });
      }

      const errors: string[] = [];
      let inserted = 0;
      let updated = 0;
      for (const batch of chunkArray(toInsert, 100)) {
        const { error } = await supabase.from("guides").insert(batch);
        if (error) errors.push(error.message);
        else inserted += batch.length;
      }
      for (const u of toUpdate) {
        const { error } = await supabase.from("guides").update(u.patch).eq(
          "id",
          u.id,
        );
        if (error) errors.push(`${u.name}: ${error.message}`);
        else updated++;
      }
      return json({
        success: errors.length === 0,
        inserted,
        filledBlanks: updated,
        ...summary,
        errors,
      });
    }

    // ---------------- CREAR AGENDA DEL MES QUE VIENE ----------------
if (action === "create_monthly_agenda") {
  const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];

  const now = new Date();
  const nextMonthIdx = (now.getUTCMonth() + 1) % 12;
  const currentMonthName = MESES[now.getUTCMonth()];
  const nextMonthName = MESES[nextMonthIdx];
  const newTabName = `Agenda ${nextMonthName}`;

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) throw new Error(`Error leyendo pestañas: ${await metaRes.text()}`);
  const sheetsInfo = (await metaRes.json()).sheets as
    { properties: { sheetId: number; title: string; index: number } }[];

  // Idempotencia: si ya existe la pestaña del mes que viene, no duplicar de nuevo
  if (sheetsInfo.some((s) => s.properties.title === newTabName)) {
    return json({ success: true, alreadyExists: true, tab: newTabName });
  }

  // Origen a duplicar: la pestaña del mes actual si existe, si no la primera
  // "Agenda *" que se encuentre (asumida la más reciente).
  const sourceTab =
    sheetsInfo.find((s) => s.properties.title === `Agenda ${currentMonthName}`) ??
    sheetsInfo.find((s) => s.properties.title.startsWith("Agenda "));
  if (!sourceTab) throw new Error("No encontré ninguna pestaña 'Agenda <Mes>' de la que partir.");

  // Insertar justo después de "Base_Guías Locales" (mismo sitio de siempre);
  // si no existe esa pestaña ancla, se inserta justo antes de la de origen.
  const anchor = sheetsInfo.find(
    (s) => s.properties.title.replace(/_/g, " ").trim().toLowerCase() === "base guias locales",
  );
  const insertIndex = anchor ? anchor.properties.index + 1 : sourceTab.properties.index;

  const dupRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          duplicateSheet: {
            sourceSheetId: sourceTab.properties.sheetId,
            insertSheetIndex: insertIndex,
            newSheetName: newTabName,
          },
        }],
      }),
    },
  );
  if (!dupRes.ok) throw new Error(`Error duplicando pestaña: ${await dupRes.text()}`);
  const dupData = await dupRes.json();
  const newSheetId = dupData.replies[0].duplicateSheet.properties.sheetId;

  // Vaciar solo el contenido (fila 1 de cabeceras intacta) — formato,
  // validación de datos y desplegables se conservan al no tocarlos aquí.
  const clearRange = encodeURIComponent(`'${newTabName}'!A2:Z10000`);
  const clearRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${clearRange}:clear`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!clearRes.ok) throw new Error(`Error vaciando datos: ${await clearRes.text()}`);

  return json({
    success: true,
    tab: newTabName,
    duplicatedFrom: sourceTab.properties.title,
    sheetId: newSheetId,
  });
}

    return json({ error: "Acción no válida." }, 400);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
