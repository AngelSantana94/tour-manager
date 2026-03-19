/**
 * scan-emails — Escaneo histórico de Gmail en dos pasadas
 *
 * Pasada 1: procesa reservas y modificaciones (ordena cronológico)
 * Pasada 2: procesa cancelaciones (así la reserva ya existe cuando se cancela)
 *
 * Body: { "after": "2026/02/20", "before": "2026/03/01" }
 * "before" es opcional — sin él escanea hasta hoy
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SERVICE_ROLE_KEY")!
);

// ─── ACCESS TOKEN ─────────────────────────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN")!,
      grant_type:    "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("No access token: " + JSON.stringify(data));
  return data.access_token;
}

// ─── FIX TILDES ───────────────────────────────────────────────────────────────
function decodeBase64Utf8(b64: string): string {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  const binaryStr  = atob(normalized);
  const bytes      = Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

// ─── PARSER ESPECIAL PARA FREETOUR HTML ──────────────────────────────────────
// FreeTour tiene 3 formatos:
// 1. Reservas nuevas:   datos en DIVs "email-message__line"
// 2. Modificaciones:    datos en <p> dentro de "email-text"  (Edited Tour Reservation)
// 3. Cancelaciones:     texto libre en "email-text"          (has cancelled...)
function parseFreeTourHtml(html: string): string {
  const clean = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");

  const titleM = clean.match(/email-title[^>]*?>([^<]+)/i);
  const tourTitle = titleM ? titleM[1].trim() : "";

  const results: string[] = [];
  if (tourTitle) results.push(`Tour: ${tourTitle}`);

  // Formato 1: reservas — email-message__line
  const blockRe = /email-message__line[^>]*?>([\s\S]{1,300}?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(clean)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 2 && text.length < 200) results.push(text);
  }
  if (results.length > 1) return results.join("\n");

  // Formatos 2 y 3: modificaciones y cancelaciones
  // Solo el primer DIV con email-text — los <p class="email-text"> de después son avisos legales
  const emailTextM = clean.match(/class="[^"]*email-text[^"]*"[^>]*>([\s\S]+?)<\/div>/i);
  if (emailTextM) {
    const block = emailTextM[1];
    const pRe = /<p[^>]*?>([\s\S]{1,400}?)<\/p>/gi;
    while ((m = pRe.exec(block)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length > 2 && text.length < 300 &&
          !text.includes("reject this booking") &&
          !text.includes("please reject") &&
          !text.includes("Reject this") &&
          !text.includes("automatic notification") &&
          !text.includes("verify customer cancellations")) {
        results.push(text);
      }
    }
    if (results.length <= 1) {
      const text = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length > 15) results.push(text.slice(0, 500));
    }
  }

  if (results.length > 1) return results.join("\n");

  return clean.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1500);
}

// ─── EXTRAER TEXTO ────────────────────────────────────────────────────────────
function extractEmailText(msg: any): { subject: string; from: string; body: string } {
  const headers = msg.payload?.headers ?? [];
  const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "";
  const from    = headers.find((h: any) => h.name === "From")?.value ?? "";
  const isFreeTour = from.toLowerCase().includes("freetour");

  function findText(parts: any[]): string {
    if (!isFreeTour) {
      for (const part of parts) {
        if (part.mimeType === "text/plain" && part.body?.data)
          return decodeBase64Utf8(part.body.data);
        if (part.parts) { const f = findText(part.parts); if (f) return f; }
      }
    }
    for (const part of parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = decodeBase64Utf8(part.body.data);
        if (isFreeTour) return parseFreeTourHtml(html);
        return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
      if (part.parts) { const f = findText(part.parts); if (f) return f; }
    }
    return "";
  }

  let body = "";
  if (msg.payload?.parts) {
    body = findText(msg.payload.parts);
  } else if (msg.payload?.body?.data) {
    const raw = decodeBase64Utf8(msg.payload.body.data);
    body = isFreeTour ? parseFreeTourHtml(raw) : raw;
  }
  if (!body) body = msg.snippet ?? "";

  return { subject, from, body };
}

// ─── GEMINI ───────────────────────────────────────────────────────────────────
async function callGemini(email: { subject: string; from: string; body: string }): Promise<any> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `Eres un asistente que analiza emails de reservas de free tours y extrae datos estructurados.
Devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, sin backticks, sin explicaciones.

Estructura JSON obligatoria:
{
  "type": "reservation|cancellation|modification|other",
  "tour_title": "nombre del tour",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "language": "es",
  "contact_name": "nombre completo del cliente",
  "phone": "número de teléfono con prefijo internacional",
  "adults": 0,
  "children": 0,
  "platform": "guruwalk|turixe|freetour|tripadvisor|other",
  "booking_code": "código único de reserva o null",
  "original_date": "YYYY-MM-DD o null",
  "original_time": "HH:MM o null",
  "original_adults": 0,
  "original_children": 0,
  "original_booking_code": "código de reserva original para modificaciones de Turixe o null"
}

REGLAS:
1. type = "reservation" si es una nueva reserva confirmada
2. type = "cancellation" si el cliente canceló: "cancelled", "cancelado", "ha cancelado", "No show", "Reserva cancelada"
3. type = "modification" si el cliente modificó: "modificación", "modificado", "modified", "Edited", "cambiada", "ha modificado"
   - date/time/adults/children = datos NUEVOS
   - original_date/original_time/original_adults/original_children = datos ORIGINALES
4. type = "other" si es marketing o no relacionado con reservas
5. La hora SIEMPRE en HH:MM 24h (3:00 PM → 15:00)
6. La fecha SIEMPRE en YYYY-MM-DD
7. Plataforma:
   - "guruwalk" en remitente → guruwalk
   - "turixe" en remitente o asunto → turixe
   - "freetour" o "FREETOUR" en remitente → freetour
   - "tripadvisor" en remitente → tripadvisor
8. booking_code — código único de la reserva:
   - Guruwalk: campo "Código de reserva" (ej: BRU11465144)
   - Turixe: código del asunto (ej: mkvspymx-f2ce68ce185e) — alfanumérico tras el último ":"
   - FreeTour: "Booking Reference Number" (ej: 79182-20260213053640-497)
   - Para modificaciones de Turixe: original_booking_code = código del asunto, booking_code = null
9. Guruwalk modificaciones: "reserva actualizada" = nuevos, "reserva inicial" = originales
10. FreeTour modificaciones — puede venir en dos formatos:
    a) Cambio de fecha/hora: "New Date of the Tour" = fecha/hora nuevas, "Previous Date of the Tour" = fecha/hora originales
    b) Cambio de personas (misma fecha): "Edited Tour Reservation" — usar "Date of the Tour" como fecha nueva Y original (no cambia), "New Guests" = adults nuevos, "Previous Guests" = original_adults
    - En ambos casos booking_code = "Booking Reference Number"
11. Turixe modificaciones: "reserva actualizada" = nuevos, "reserva original" = originales
12. type = "other" para emails de mensajes de clientes, avisos, marketing — NO son reservas
13. Campos no encontrados → null

Remitente: ${email.from}
Asunto: ${email.subject}
Cuerpo:
${email.body.slice(0, 3000)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data  = await res.json();
  const text  = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── BUSCAR O CREAR TOUR ──────────────────────────────────────────────────────
async function findOrCreateTour(data: any): Promise<string> {
  const { data: existing } = await supabase
    .from("tours").select("id")
    .eq("title",    data.tour_title)
    .eq("date",     data.date)
    .eq("time",     data.time)
    .eq("platform", data.platform ?? "other")
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("tours")
    .insert({
      title:    data.tour_title,
      date:     data.date,
      time:     data.time,
      language: data.language ?? "es",
      platform: data.platform ?? "other",
      source:   "auto",
    })
    .select("id").single();

  if (error) throw new Error(`Error creando tour: ${error.message}`);
  return created.id;
}

// ─── GUARDAR RESERVA (con deduplicación por booking_code o teléfono) ──────────
async function saveReservation(tourId: string, data: any, rawEmail: string) {
  const adults      = Number(data.adults)   || 0;
  const children    = Number(data.children) || 0;
  const bookingCode = data.booking_code ?? null;
  const phone       = data.phone ?? "";

  let existing = null;
  if (bookingCode) {
    const { data: found } = await supabase
      .from("reservations").select("id")
      .eq("tour_id",     tourId)
      .eq("booking_code", bookingCode)
      .maybeSingle();
    existing = found;
  }
  if (!existing && phone) {
    const { data: found } = await supabase
      .from("reservations").select("id")
      .eq("tour_id", tourId)
      .eq("phone",   phone)
      .maybeSingle();
    existing = found;
  }

  if (existing) {
    await supabase.from("reservations")
      .update({ adults, children, pax: adults + children })
      .eq("id", existing.id);
    console.log("  → pax actualizado:", data.contact_name);
    return;
  }

  const { error } = await supabase.from("reservations").insert({
    tour_id:      tourId,
    contact_name: data.contact_name ?? "",
    phone,
    adults,
    children,
    pax:          adults + children,
    platform:     data.platform     ?? "other",
    booking_code: bookingCode,
    raw_email:    rawEmail,
  });

  if (error) throw new Error(`Error guardando reserva: ${error.message}`);
  console.log("  → reserva guardada:", data.contact_name);
}

// ─── CANCELAR RESERVA ─────────────────────────────────────────────────────────
async function handleCancellation(data: any) {
  let reservation: any = null;

  // Turixe: buscar por booking_code
  if (data.platform === "turixe" && data.booking_code) {
    const { data: found } = await supabase
      .from("reservations").select("id, tour_id")
      .eq("booking_code", data.booking_code)
      .maybeSingle();
    reservation = found;
  }

  // Fallback: teléfono + fecha + plataforma
  if (!reservation && data.phone) {
    const { data: tours } = await supabase
      .from("tours").select("id")
      .eq("date",     data.date)
      .eq("platform", data.platform ?? "other");

    if (tours && tours.length > 0) {
      const tourIds = tours.map((t: any) => t.id);
      const { data: found } = await supabase
        .from("reservations").select("id, tour_id")
        .in("tour_id", tourIds)
        .eq("phone",   data.phone)
        .maybeSingle();
      reservation = found;
    }
  }

  if (!reservation) {
    console.log("  → reserva no encontrada para cancelación:", data.booking_code ?? data.phone, data.date);
    return;
  }

  const tourId = reservation.tour_id;
  await supabase.from("reservations").delete().eq("id", reservation.id);
  console.log("  → cancelada:", data.contact_name);

  // Borrar tour huérfano si quedó vacío y fue creado automáticamente
  const { data: tour } = await supabase
    .from("tours").select("source").eq("id", tourId).maybeSingle();

  if (tour?.source === "auto") {
    const { count } = await supabase
      .from("reservations").select("id", { count: "exact", head: true })
      .eq("tour_id", tourId);
    if (count === 0) {
      await supabase.from("tours").delete().eq("id", tourId);
      console.log("  → tour huérfano eliminado:", tourId);
    }
  }
}

// ─── MODIFICAR RESERVA ────────────────────────────────────────────────────────
async function handleModification(data: any, rawEmail: string) {
  const originalDate        = data.original_date        ?? data.date;
  const originalBookingCode = data.original_booking_code ?? null;

  let originalReservation: any = null;

  // Turixe: buscar por booking_code original
  if (data.platform === "turixe" && originalBookingCode) {
    const { data: found } = await supabase
      .from("reservations").select("id, tour_id")
      .eq("booking_code", originalBookingCode)
      .maybeSingle();
    originalReservation = found;
  }

  // Fallback: teléfono + fecha original
  if (!originalReservation && data.phone) {
    const { data: originalTours } = await supabase
      .from("tours").select("id")
      .eq("date",     originalDate)
      .eq("platform", data.platform ?? "other");

    if (originalTours && originalTours.length > 0) {
      const tourIds = originalTours.map((t: any) => t.id);
      const { data: found } = await supabase
        .from("reservations").select("id, tour_id")
        .in("tour_id", tourIds)
        .eq("phone",   data.phone)
        .maybeSingle();
      originalReservation = found;
    }
  }

  let oldTourId = null;
  if (originalReservation) {
    oldTourId = originalReservation.tour_id;
    await supabase.from("reservations").delete().eq("id", originalReservation.id);
    console.log("  → reserva original eliminada");
  }

  const newTourId = await findOrCreateTour(data);
  await saveReservation(newTourId, data, rawEmail);
  console.log("  → modificación guardada:", data.contact_name);

  // Borrar tour huérfano
  if (oldTourId && oldTourId !== newTourId) {
    const { data: tour } = await supabase
      .from("tours").select("source").eq("id", oldTourId).maybeSingle();
    if (tour?.source === "auto") {
      const { count } = await supabase
        .from("reservations").select("id", { count: "exact", head: true })
        .eq("tour_id", oldTourId);
      if (count === 0) {
        await supabase.from("tours").delete().eq("id", oldTourId);
        console.log("  → tour huérfano eliminado:", oldTourId);
      }
    }
  }
}

// ─── CARGAR TODOS LOS MENSAJES de Gmail con paginación ───────────────────────
async function fetchAllMessages(accessToken: string, query: string): Promise<any[]> {
  const messages: any[] = [];
  let pageToken = "";

  do {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100${pageToken ? "&pageToken=" + pageToken : ""}`;
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.messages) messages.push(...data.messages);
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);

  return messages;
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    let afterDate  = "2026/02/20";
    let beforeDate = "";
    try {
      const body = await req.json();
      if (body?.after)  afterDate  = body.after;
      if (body?.before) beforeDate = body.before;
    } catch { /* body vacío */ }

    console.log(`=== ESCANEO desde ${afterDate}${beforeDate ? " hasta " + beforeDate : ""} ===`);

    const accessToken = await getAccessToken();

    // Construir query Gmail
    let query = `from:(guruwalk.com OR turixe.com OR freetour.com OR tripadvisor.com) after:${afterDate}`;
    if (beforeDate) query += ` before:${beforeDate}`;
    console.log("Query:", query);

    const messages = await fetchAllMessages(accessToken, query);
    console.log(`Total emails: ${messages.length}`);

    if (messages.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, skipped: 0, errors: 0 }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // ── CLASIFICAR emails con Gemini ─────────────────────────────────────────
    // Los cargamos todos primero, luego procesamos en orden
    type EmailRecord = {
      id: string;
      email: { subject: string; from: string; body: string };
      extracted: any;
      internalDate: number;
    };

    const reservations:   EmailRecord[] = [];
    const modifications:  EmailRecord[] = [];
    const cancellations:  EmailRecord[] = [];
    let skipped = 0, errors = 0;
    let latestHistoryId = "";
    let latestInternalDate = 0;

    console.log("--- PASADA 0: clasificando emails ---");

    for (const { id } of messages) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msg = await msgRes.json();

        const internalDate = Number(msg.internalDate ?? 0);
        if (internalDate > latestInternalDate) {
          latestInternalDate = internalDate;
          latestHistoryId    = String(msg.historyId ?? "");
        }

        const email = extractEmailText(msg);
        if (!email.body) { skipped++; continue; }

        let extracted: any;
        try {
          extracted = await callGemini(email);
        } catch (e) {
          console.error("Gemini error:", e.message);
          errors++;
          continue;
        }

        console.log(`[${extracted.type}] ${email.subject?.slice(0, 60)}`);

        if (extracted.type === "other" || !extracted.tour_title) {
          skipped++;
          continue;
        }

        const record: EmailRecord = { id, email, extracted, internalDate };

        if (extracted.type === "cancellation")  cancellations.push(record);
        else if (extracted.type === "modification") modifications.push(record);
        else reservations.push(record);

        // Pausa para no saturar Gemini
        await new Promise((r) => setTimeout(r, 250));

      } catch (e) {
        console.error("Error mensaje", id, e.message);
        errors++;
      }
    }

    // Ordenar por fecha cronológica (más antiguo primero)
    const byDate = (a: EmailRecord, b: EmailRecord) => a.internalDate - b.internalDate;
    reservations.sort(byDate);
    modifications.sort(byDate);
    cancellations.sort(byDate);

    console.log(`Clasificados — reservas: ${reservations.length}, modificaciones: ${modifications.length}, cancelaciones: ${cancellations.length}`);

    // ── PASADA 1: reservas ───────────────────────────────────────────────────
    console.log("--- PASADA 1: guardando reservas ---");
    let processed = 0;
    for (const { extracted, email } of reservations) {
      try {
        const tourId = await findOrCreateTour(extracted);
        await saveReservation(tourId, extracted, email.body);
        processed++;
      } catch (e) {
        console.error("Error reserva:", e.message);
        errors++;
      }
    }

    // ── PASADA 2: modificaciones ─────────────────────────────────────────────
    console.log("--- PASADA 2: procesando modificaciones ---");
    for (const { extracted, email } of modifications) {
      try {
        await handleModification(extracted, email.body);
        processed++;
      } catch (e) {
        console.error("Error modificación:", e.message);
        errors++;
      }
    }

    // ── PASADA 3: cancelaciones ──────────────────────────────────────────────
    console.log("--- PASADA 3: procesando cancelaciones ---");
    for (const { extracted } of cancellations) {
      try {
        await handleCancellation(extracted);
        processed++;
      } catch (e) {
        console.error("Error cancelación:", e.message);
        errors++;
      }
    }

    // Actualizar historyId al email más reciente
    if (latestHistoryId) {
      await supabase.from("gmail_state").update({ history_id: latestHistoryId }).eq("id", 1);
      console.log("historyId actualizado:", latestHistoryId);
    }

    const result = {
      ok: true,
      total:        messages.length,
      reservations: reservations.length,
      modifications: modifications.length,
      cancellations: cancellations.length,
      processed,
      skipped,
      errors,
    };

    console.log("=== FIN ===", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error fatal:", err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 200 });
  }
});