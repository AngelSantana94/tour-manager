import "@supabase/functions-js/edge-runtime.d.ts";
import { JWT } from "npm:google-auth-library@9.1.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Margen para el push BD → Sheet (cuando asignas/editas algo en la webapp):
// si la diferencia entre "última edición del Sheet" y "updated_at de la BD"
// es menor a esto, no se pisa la fila. Ya NO se usa en el import Sheet → BD
// (ese lado ahora compara contenido real, ver COMPARE_FIELDS más abajo) —
// solo queda aquí para el sentido contrario. Riesgo conocido y no resuelto
// todavía: si se editan varios campos casi seguidos desde la webapp, cada
// edición dispara el webhook con una "foto" de la fila en ese instante: si
// la foto más vieja termina de escribir en el Sheet después que la más
// nueva, puede revertir un campo. El arreglo simétrico al de Sheet → BD
// sería que el push-back vuelva a leer la fila fresca de la BD en vez de
// fiarse del snapshot del payload del webhook — pendiente si llega a dar
// problemas en la práctica.
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
  groupPhoto: number; // columna "Foto Grupo" del Sheet ← record.pax_photo_url
  voucher: number; // columna "Voucher" del Sheet ← record.voucher_photo_url
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
    groupPhoto: findCol(H, (h) => h === "foto grupo"),
    voucher: findCol(H, (h) => h === "voucher"),
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
    .filter(([key]) => (c as unknown as Record<string, number>)[key] === -1)
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

  const hIdx = rows.findIndex((r) => r.some((c) => norm(c) === "nombre"));
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

// ─── LISTA DE GUÍAS PARA LOS DESPLEGABLES DEL SHEET ─────────────────────────
// Pestaña auxiliar "Guías BD": una columna con los nombres EXACTOS de la
// tabla `guides`, ordenados. Las columnas Guía Lead / Back up 1 / Back up 2
// de las pestañas "Agenda <Mes>" tienen una validación de datos que apunta
// aquí (se aplica una vez con setupGuideDropdowns() en el Apps Script), así
// la coordinadora elige de la lista en vez de escribir el nombre a mano y ya
// no puede haber un nombre que no coincida con el de la BD.
//
// Se rellena SIEMPRE leyendo la BD en el momento (no del payload del webhook),
// así que es idempotente: da igual cuántas veces se llame o en qué orden
// lleguen los webhooks, el resultado es la lista actual.
//
// IMPORTANTE: estos dos valores tienen que coincidir con los del Apps Script
// (GUIDE_LIST_TAB y GUIDE_LIST_MAX_ROWS).
const GUIDE_LIST_TAB = "Guías BD";
const GUIDE_LIST_MAX_ROWS = 500;

async function syncGuideList(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  spreadsheetId: string,
): Promise<{ count: number; tab: string; created: boolean }> {
  const { data, error } = await supabase.from("guides").select("name");
  if (error) throw new Error(`No pude leer 'guides': ${error.message}`);

  const seen = new Set<string>();
  const names: string[] = [];
  for (const g of (data ?? []) as { name: string | null }[]) {
    const n = clean(g.name);
    if (!n) continue;
    const key = norm(n);
    if (seen.has(key)) continue; // dos guías con el mismo nombre: una sola entrada
    seen.add(key);
    names.push(n);
  }
  names.sort((a, b) => a.localeCompare(b, "es"));

  if (names.length > GUIDE_LIST_MAX_ROWS - 1) {
    throw new Error(
      `Hay ${names.length} guías y la lista solo admite ${
        GUIDE_LIST_MAX_ROWS - 1
      }. Sube GUIDE_LIST_MAX_ROWS (aquí y en el Apps Script).`,
    );
  }

  const authHeader = { Authorization: `Bearer ${accessToken}` };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;

  // 1) Crear la pestaña si no existe
  const metaRes = await fetch(`${base}?fields=sheets.properties.title`, {
    headers: authHeader,
  });
  if (!metaRes.ok) {
    throw new Error(`Error leyendo pestañas: ${await metaRes.text()}`);
  }
  const titles: string[] = ((await metaRes.json()).sheets || []).map((
    s: { properties: { title: string } },
  ) => s.properties.title);

  let created = false;
  if (!titles.includes(GUIDE_LIST_TAB)) {
    const addRes = await fetch(`${base}:batchUpdate`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: GUIDE_LIST_TAB } } }],
      }),
    });
    if (!addRes.ok) {
      throw new Error(`Error creando la pestaña: ${await addRes.text()}`);
    }
    created = true;
  }

  // 2) Escribir primero la lista nueva (RAW: un nombre nunca se interpreta
  //    como fórmula) y limpiar DESPUÉS lo que sobre por debajo, para que el
  //    desplegable no se quede vacío ni un instante mientras se actualiza.
  const values = [
    ["Guías (se actualiza solo desde la base de datos, no editar)"],
    ...names.map((n) => [n]),
  ];
  const writeRange = encodeURIComponent(
    `'${GUIDE_LIST_TAB}'!A1:A${values.length}`,
  );
  const writeRes = await fetch(
    `${base}/values/${writeRange}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    },
  );
  if (!writeRes.ok) {
    throw new Error(`Error escribiendo la lista: ${await writeRes.text()}`);
  }

  if (values.length < GUIDE_LIST_MAX_ROWS) {
    const clearRange = encodeURIComponent(
      `'${GUIDE_LIST_TAB}'!A${values.length + 1}:A${GUIDE_LIST_MAX_ROWS}`,
    );
    const clearRes = await fetch(`${base}/values/${clearRange}:clear`, {
      method: "POST",
      headers: authHeader,
    });
    if (!clearRes.ok) {
      throw new Error(`Error limpiando el resto: ${await clearRes.text()}`);
    }
  }

  return { count: names.length, tab: GUIDE_LIST_TAB, created };
}

// ─── BLOQUE 1 ───────────────────────────────────────────────────────────────

// ─── GUÍAS ASIGNABLES POR FILA (desplegables del Sheet) ─────────────────────
// Misma regla que la webapp:
//  · El guía tiene que haber dado disponibilidad ese día (guide_availability).
//    FULL sirve para cualquier franja; AM solo para AM; PM solo para PM;
//    un tour NT acepta cualquier fila. Un "blocked" que aplique gana.
//  · No puede estar en OTRO tour no cancelado del mismo día y la MISMA franja
//    (AM+AM, PM+PM, NT+NT chocan; AM+PM no; NT no choca con AM/PM).
// Solo se calculan filas con fecha >= fromDate (por defecto, hoy en Bruselas):
// lo anterior no interesa.
const BACKUPS_COUNT_AS_BUSY = true; // igual que en el adapter de la webapp

function todayInBrussels(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" })
    .format(new Date());
}

// Supabase devuelve máx. 1000 filas por petición: se pagina.
async function fetchAllPaged(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>,
  label: string,
): Promise<any[]> {
  const out: any[] = [];
  const size = 1000;
  for (let from = 0;; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error(`No pude leer '${label}': ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

const normPeriod = (p: unknown): "AM" | "PM" | "NT" =>
  p === "AM" || p === "PM" ? p : "NT";

async function getAssignableGuidesForSheet(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  spreadsheetId: string,
  sheetRange: string,
  fromDate?: string,
): Promise<{
  from: string;
  rows: { row: number; date: string; period: string; allowed: string[] }[];
}> {
  const from = fromDate ?? todayInBrussels();

  // 1) Leer la pestaña con el mismo parser que el import
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${
      encodeURIComponent(sheetRange)
    }?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Error leyendo Sheet (${res.status}): ${await res.text()}`);
  }
  const sheetRows: Cell[][] = (await res.json()).values || [];
  if (sheetRows.length < 2) return { from, rows: [] };

  const parsed = parseAgenda(sheetRows);
  const targets = parsed.records
    .map((rec, i) => ({ rec, row: parsed.meta[i].row }))
    .filter((t) => t.rec.date >= from);
  if (!targets.length) return { from, rows: [] };

  const dates = targets.map((t) => t.rec.date).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  // 2) Datos de la BD (solo el rango de fechas que hace falta)
  const { data: guideRows, error: guideErr } = await supabase
    .from("guides").select("id, name");
  if (guideErr) throw new Error(`No pude leer 'guides': ${guideErr.message}`);
  const nameById = new Map<string, string>();
  for (const g of (guideRows ?? []) as { id: string; name: string }[]) {
    nameById.set(g.id, g.name);
  }

  const availRows = await fetchAllPaged(
    (a, b) =>
      supabase.from("guide_availability")
        .select("guide_id, date, status, shift")
        .gte("date", minDate).lte("date", maxDate)
        .order("date").order("guide_id").order("shift")
        .range(a, b),
    "guide_availability",
  );
  const tourRows = await fetchAllPaged(
    (a, b) =>
      supabase.from("tours")
        .select(
          "service_id, date, period, status, guide_lead_id, backup_1_id, backup_2_id",
        )
        .gte("date", minDate).lte("date", maxDate)
        .order("service_id")
        .range(a, b),
    "tours",
  );

  const availByDate = new Map<string, any[]>();
  for (const a of availRows) {
    const list = availByDate.get(a.date) ?? [];
    list.push(a);
    availByDate.set(a.date, list);
  }
  const toursByDate = new Map<string, any[]>();
  const tourByServiceId = new Map<string, any>();
  for (const t of tourRows) {
    const list = toursByDate.get(t.date) ?? [];
    list.push(t);
    toursByDate.set(t.date, list);
    tourByServiceId.set(t.service_id, t);
  }

  // 3) Calcular los guías asignables de cada fila
  const appliesTo = (shift: string, period: string) =>
    shift === "FULL" || period === "NT" || shift === period;

  const rows = targets.map(({ rec, row }) => {
    // Franja: la del Sheet si la trae; si no, la que ya tenga el tour en BD.
    const period = normPeriod(
      rec.period ?? tourByServiceId.get(rec.service_id)?.period,
    );

    const ok = new Set<string>();
    const blocked = new Set<string>();
    for (const a of availByDate.get(rec.date) ?? []) {
      if (!appliesTo(String(a.shift), period)) continue;
      if (a.status === "blocked") blocked.add(a.guide_id);
      else if (a.status === "available") ok.add(a.guide_id);
    }
    for (const id of blocked) ok.delete(id);

    const busy = new Set<string>();
    for (const t of toursByDate.get(rec.date) ?? []) {
      if (t.service_id === rec.service_id) continue; // este mismo tour
      if (t.status === "Cancelado") continue;
      if (normPeriod(t.period) !== period) continue;
      const ids = [t.guide_lead_id];
      if (BACKUPS_COUNT_AS_BUSY) ids.push(t.backup_1_id, t.backup_2_id);
      for (const id of ids) if (id) busy.add(id);
    }

    const allowed = [...ok]
      .filter((id) => !busy.has(id))
      .map((id) => nameById.get(id))
      .filter((n): n is string => !!n)
      .sort((x, y) => x.localeCompare(y, "es"));

    return { row, date: rec.date, period, allowed };
  });

  return { from, rows };
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
    // WEBHOOK DE LA TABLA `guides` → refrescar la pestaña "Guías BD".
    // Se dispara al crear, borrar o renombrar un guía (p.ej. cuando alguien
    // se registra y link_or_create_guide_on_signup crea su ficha).
    // ────────────────────────────────────────────────────────────────────
    if (
      body.table === "guides" &&
      (body.type === "INSERT" || body.type === "UPDATE" ||
        body.type === "DELETE")
    ) {
      // En un UPDATE que no toca el nombre (teléfono, email...) la lista no
      // cambia: no hace falta reescribirla.
      if (
        body.type === "UPDATE" && body.old_record && body.record &&
        norm(body.old_record.name) === norm(body.record.name)
      ) {
        return json({
          success: true,
          skipped: true,
          reason: "el nombre del guía no cambió",
        });
      }

      const guidesSpreadsheetId = Deno.env.get("SYNC_SPREADSHEET_ID");
      if (!guidesSpreadsheetId) {
        return json({
          success: true,
          skipped: true,
          reason: "falta el secret SYNC_SPREADSHEET_ID",
        });
      }
      const result = await syncGuideList(
        supabase,
        accessToken,
        guidesSpreadsheetId,
      );
      return json({ success: true, ...result });
    }

    // ────────────────────────────────────────────────────────────────────
    // PUSH BD → SHEET: esto es lo que llama el Database Webhook de Supabase.
    // Su payload trae {type, table, record, old_record} — se detecta así,
    // antes de mirar 'action' (que es lo que usan nuestros propios scripts).
    // CAMBIO: ahora entra tanto en INSERT como en UPDATE — un tour creado
    // desde el import del Excel de Bespoke también es un INSERT y antes
    // caía al fondo del switch (error "Se requiere spreadsheetId").
    // ────────────────────────────────────────────────────────────────────
    if (
      (body.type === "UPDATE" || body.type === "INSERT") &&
      body.table === "tours" && body.record
    ) {
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
        // Normal para tours INSERTados que aún no tienen fila propia en el
        // Sheet (p.ej. los que vienen del import del Excel de Bespoke).
        // Crear la fila nueva es la fase 2 pendiente — por ahora se ignora
        // sin romper nada.
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
      // CAMBIO: se escribe como texto ISO-UTC, no como serial de Sheets.
      // El serial arrastra la zona horaria configurada en el documento
      // (Archivo > Configuración > Zona horaria), y parseDateTime() lo
      // interpretaba como si ya fuera UTC — con esta hoja en un huso
      // distinto de UTC, cualquier ÚltimaEdición salía calculada varias
      // horas antes de lo real, así que SIEMPRE parecía "más vieja" que
      // el updated_at de la BD y el import se saltaba la fila. Un texto
      // ISO con 'Z' no tiene esa ambigüedad, se parsea igual sin importar
      // la configuración regional del documento.
      if (c.lastEdit !== -1) {
        put(c.lastEdit, dbUpdatedAt ?? new Date().toISOString());
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

    // ---------------- LISTA DE GUÍAS PARA LOS DESPLEGABLES ----------------
    // La llama setupGuideDropdowns() del Apps Script (una vez, a mano) para
    // crear y rellenar la pestaña "Guías BD" antes de aplicar la validación.
    if (action === "sync_guide_list") {
      const result = await syncGuideList(supabase, accessToken, spreadsheetId);
      return json({ success: true, ...result });
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

      // ── Filtrar filas que realmente cambiaron (contenido, no reloj) ──────
      // CAMBIO (reemplaza el chequeo de CONFLICT_TOLERANCE_MS): en vez de
      // adivinar si una fila es "el eco de nuestra propia escritura" por si
      // su marca de tiempo cae dentro de una ventana de unos segundos,
      // comparamos el contenido real, campo a campo, contra lo que ya hay
      // en la BD.
      //
      // Por qué esto basta por sí solo, sin necesitar el reloj: cuando nuestro
      // propio push-back (BD → Sheet) escribe de vuelta en el documento,
      // escribe EXACTAMENTE los mismos valores que ya están en la BD. Así
      // que cuando ese eco dispara un reimport, la comparación de contenido
      // ya lo detecta como "sin cambios" y lo descarta — sin necesitar
      // ningún margen de tiempo. Y si el contenido SÍ es distinto, es que
      // hubo un cambio real en el Sheet (o en la BD, visto desde el otro
      // lado) y hay que importarlo, sin importar cuántos milisegundos hayan
      // pasado desde el último updated_at.
      //
      // Esto también resuelve el caso de "relleno todo de corrido" (Guía
      // Lead + Back-up 1 + Back-up 2 en 1-2 segundos): con el reloj, una
      // edición genuina podía caer dentro de la ventana de tolerancia y
      // descartarse igual que un eco — que es justo lo que causaba que el
      // Back-up 2 a veces no se guardara. Con comparación de contenido, cada
      // import_tours que se dispare (aunque se disparen varios casi a la
      // vez por editar rápido) lee el estado COMPLETO de la fila en ese
      // momento; el que gane la carrera y llegue a upsert ya escribe la fila
      // entera correcta, y los que lleguen después simplemente la ven
      // "sin cambios" y no hacen nada — no hace falta que el coordinador
      // espere nada entre campos.
      const COMPARE_FIELDS = [
        "date",
        "start_time",
        "end_time",
        "tour_leader_phone",
        "tour_type",
        "city",
        "pax",
        "meeting_point",
        "status",
        "notes",
        "period",
        "tour_operator_id",
        "provider_id",
        "guide_lead_id",
        "backup_1_id",
        "backup_2_id",
        "tour_leader_id",
      ] as const;

      const normCompare = (v: unknown): unknown => (v === undefined ? null : v);

      const recordsEqual = (
        a: Record<string, unknown>,
        b: Record<string, unknown>,
      ): boolean =>
        COMPARE_FIELDS.every(
          (field) => normCompare(a[field]) === normCompare(b[field]),
        );

      const serviceIds = records.map((r) => r.service_id);
      const { data: existingRows, error: existErr } = await supabase
        .from("tours")
        .select(`service_id, updated_at, ${COMPARE_FIELDS.join(", ")}`)
        .in("service_id", serviceIds);
      if (existErr) {
        throw new Error(
          `No pude comprobar tours existentes: ${existErr.message}`,
        );
      }

      const existingByServiceId = new Map<string, Record<string, unknown>>();
      for (const row of (existingRows ?? []) as Record<string, unknown>[]) {
        existingByServiceId.set(row.service_id as string, row);
      }

      // Se mantiene el nombre/forma por compatibilidad con lo que ya lee el
      // frontend del modal de import, pero ya no se usa el reloj para
      // rellenarlo — queda siempre vacío salvo que en el futuro se quiera
      // reintroducir algún tipo de conflicto real (p.ej. edición simultánea
      // del mismo campo desde ambos lados, que hoy no diferenciamos).
      const conflictSkipped: {
        row: number;
        serviceId: string;
        reason: string;
      }[] = [];

      const unchangedSkipped: { row: number; serviceId: string }[] = [];

      const finalRecords: ParsedRecord[] = [];
      const finalMeta: typeof meta = [];

      records.forEach((rec, i) => {
        const existing = existingByServiceId.get(rec.service_id);

        if (existing && recordsEqual(rec, existing)) {
          unchangedSkipped.push({
            row: meta[i].row,
            serviceId: rec.service_id,
          });
          return;
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
        unchangedSkipped,
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

      // TEMPORAL — DIAGNÓSTICO DETALLADO Sheet → webapp (guías).
      // Qué enseña, y por qué:
      //  · lastEditedRow: la fila con la ÚltimaEdición más reciente, o sea la
      //    que acabas de tocar. Trae los nombres CRUDOS tal cual se leyeron
      //    del Sheet, los IDs a los que se resolvieron (null = no encontró
      //    ningún guía con ese nombre), lo que hay en la BD, y en qué
      //    categoría cayó (TO_UPSERT / UNCHANGED).
      //  · unresolvedGuideNames: TODOS los nombres de guía del Sheet que no
      //    coincidieron con ningún guía de la BD (fila, slot, nombre crudo y
      //    nombre normalizado). Si un backup "no entra", aquí sale por qué.
      //  · guideChangesOnly: filas donde Lead/Backup1/Backup2 difieren entre
      //    Sheet y BD.
      // Bórralo cuando los tres campos se guarden bien de forma estable.
      const GUIDE_SLOTS = [
        { key: "guide_lead_id", label: "lead" },
        { key: "backup_1_id", label: "backup1" },
        { key: "backup_2_id", label: "backup2" },
      ] as const;

      const classify = (serviceId: string): string =>
        finalRecords.some((r) => r.service_id === serviceId)
          ? "TO_UPSERT"
          : unchangedSkipped.some((u) => u.serviceId === serviceId)
          ? "UNCHANGED"
          : "OTHER";

      const describeRow = (i: number) => {
        const rec = records[i];
        const existing = existingRows?.find(
          (row: any) => row.service_id === rec.service_id,
        ) as Record<string, unknown> | undefined;
        return {
          row: meta[i].row,
          serviceId: rec.service_id,
          classification: classify(rec.service_id),
          sheetRawNames: {
            lead: refs[i].guide_lead_id,
            backup1: refs[i].backup_1_id,
            backup2: refs[i].backup_2_id,
          },
          sheetResolvedIds: {
            lead: rec.guide_lead_id ?? null,
            backup1: rec.backup_1_id ?? null,
            backup2: rec.backup_2_id ?? null,
          },
          dbIds: existing
            ? {
              lead: existing.guide_lead_id ?? null,
              backup1: existing.backup_1_id ?? null,
              backup2: existing.backup_2_id ?? null,
            }
            : "(fila nueva, no existía en la BD)",
          sheetLastEdit: meta[i].sheetLastEdit,
          databaseUpdatedAt: existing?.updated_at ?? null,
        };
      };

      const unresolvedGuideNames: {
        row: number;
        serviceId: string;
        slot: string;
        rawName: string;
        normalized: string;
      }[] = [];
      const guideChangedIdx: number[] = [];
      let lastEditedIdx = -1;

      records.forEach((rec, i) => {
        const existing = existingRows?.find(
          (row: any) => row.service_id === rec.service_id,
        ) as Record<string, unknown> | undefined;

        for (const s of GUIDE_SLOTS) {
          const rawName = refs[i][s.key];
          if (rawName && !rec[s.key]) {
            unresolvedGuideNames.push({
              row: meta[i].row,
              serviceId: rec.service_id,
              slot: s.label,
              rawName,
              normalized: norm(rawName),
            });
          }
        }

        const changed = GUIDE_SLOTS.some(
          (s) => (rec[s.key] ?? null) !== (existing?.[s.key] ?? null),
        );
        if (changed) guideChangedIdx.push(i);

        const t = meta[i].sheetLastEdit;
        if (
          t &&
          (lastEditedIdx === -1 ||
            t > (meta[lastEditedIdx].sheetLastEdit as string))
        ) lastEditedIdx = i;
      });

      console.log(
        "DEBUG import_tours DETALLADO:",
        JSON.stringify(
          {
            totalParsed: records.length,
            totalToUpsert: finalRecords.length,
            totalUpserted: totalInserted,
            unchangedCount: unchangedSkipped.length,
            lastEditedRow: lastEditedIdx >= 0
              ? describeRow(lastEditedIdx)
              : null,
            guideChangesOnly: guideChangedIdx.map(describeRow),
            unresolvedGuideNames,
            errors,
            skipped,
          },
          null,
          2,
        ),
      );

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

      const now = new Date();
      const nextMonthIdx = (now.getUTCMonth() + 1) % 12;
      const currentMonthName = MESES[now.getUTCMonth()];
      const nextMonthName = MESES[nextMonthIdx];
      const newTabName = `Agenda ${nextMonthName}`;

      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!metaRes.ok) {
        throw new Error(`Error leyendo pestañas: ${await metaRes.text()}`);
      }
      const sheetsInfo = (await metaRes.json()).sheets as {
        properties: { sheetId: number; title: string; index: number };
      }[];

      // Idempotencia: si ya existe la pestaña del mes que viene, no duplicar de nuevo
      if (sheetsInfo.some((s) => s.properties.title === newTabName)) {
        return json({ success: true, alreadyExists: true, tab: newTabName });
      }

      // Origen a duplicar: la pestaña del mes actual si existe, si no la primera
      // "Agenda *" que se encuentre (asumida la más reciente).
      const sourceTab = sheetsInfo.find((s) =>
        s.properties.title === `Agenda ${currentMonthName}`
      ) ??
        sheetsInfo.find((s) =>
          s.properties.title.startsWith("Agenda ")
        );
      if (!sourceTab) {
        throw new Error(
          "No encontré ninguna pestaña 'Agenda <Mes>' de la que partir.",
        );
      }

      // Insertar justo después de "Base_Guías Locales" (mismo sitio de siempre);
      // si no existe esa pestaña ancla, se inserta justo antes de la de origen.
      const anchor = sheetsInfo.find(
        (s) =>
          s.properties.title.replace(/_/g, " ").trim().toLowerCase() ===
            "base guias locales",
      );
      const insertIndex = anchor
        ? anchor.properties.index + 1
        : sourceTab.properties.index;

      const dupRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
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
      if (!dupRes.ok) {
        throw new Error(`Error duplicando pestaña: ${await dupRes.text()}`);
      }
      const dupData = await dupRes.json();
      const newSheetId = dupData.replies[0].duplicateSheet.properties.sheetId;

      // Vaciar solo el contenido (fila 1 de cabeceras intacta) — formato,
      // validación de datos y desplegables se conservan al no tocarlos aquí.
      const clearRange = encodeURIComponent(`'${newTabName}'!A2:Z10000`);
      const clearRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${clearRange}:clear`,
        { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!clearRes.ok) {
        throw new Error(`Error vaciando datos: ${await clearRes.text()}`);
      }

      return json({
        success: true,
        tab: newTabName,
        duplicatedFrom: sourceTab.properties.title,
        sheetId: newSheetId,
      });
    }
    // ─── BLOQUE 2 ───────────────────────────────────────────────────────────────

    // ---------------- GUÍAS ASIGNABLES POR FILA (desplegables) ----------------
    if (action === "get_assignable_guides") {
      if (!range) {
        throw new Error("Se requiere 'range' (nombre de la pestaña).");
      }
      const result = await getAssignableGuidesForSheet(
        supabase,
        accessToken,
        spreadsheetId,
        range,
        body.fromDate,
      );
      return json({ success: true, ...result });
    }

    return json({ error: "Acción no válida." }, 400);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
