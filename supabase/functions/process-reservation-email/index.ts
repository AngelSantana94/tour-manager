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

// ─── FIX TILDES — decodifica base64 respetando UTF-8 ─────────────────────────
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

  // Título del tour
  const titleM = clean.match(/email-title[^>]*?>([^<]+)/i);
  const tourTitle = titleM ? titleM[1].trim() : "";

  const results: string[] = [];
  if (tourTitle) results.push(`Tour: ${tourTitle}`);

  // ── Formato 1: reservas — email-message__line ────────────────────────────────
  const blockRe = /email-message__line[^>]*?>([\s\S]{1,300}?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(clean)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 2 && text.length < 200) results.push(text);
  }
  if (results.length > 1) return results.join("\n");

  // ── Formatos 2 y 3: modificaciones y cancelaciones ───────────────────────────
  // Solo el primer DIV con email-text — los <p class="email-text"> de después son avisos legales
  const emailTextM = clean.match(/class="[^"]*email-text[^"]*"[^>]*>([\s\S]+?)<\/div>/i);
  if (emailTextM) {
    const block = emailTextM[1];

    // Modificaciones: datos en <p> dentro del div
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

    // Cancelaciones: texto directo en el div sin <p>
    if (results.length <= 1) {
      const text = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length > 15) results.push(text.slice(0, 500));
    }
  }

  if (results.length > 1) return results.join("\n");

  // Último fallback
  return clean.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1500);
}

// ─── EXTRAER TEXTO del mensaje ────────────────────────────────────────────────
function extractEmailText(msg: any): { subject: string; from: string; body: string } {
  const headers = msg.payload?.headers ?? [];
  const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "";
  const from    = headers.find((h: any) => h.name === "From")?.value ?? "";
  const isFreeTour = from.toLowerCase().includes("freetour");

  function findRawHtml(parts: any[]): string {
    for (const part of parts) {
      if (part.mimeType === "text/html" && part.body?.data)
        return decodeBase64Utf8(part.body.data);
      if (part.parts) { const f = findRawHtml(part.parts); if (f) return f; }
    }
    return "";
  }

  function findText(parts: any[]): string {
    // Para FreeTour: saltamos el texto plano (suele estar vacío) y parseamos HTML
    if (!isFreeTour) {
      for (const part of parts) {
        if (part.mimeType === "text/plain" && part.body?.data)
          return decodeBase64Utf8(part.body.data);
        if (part.parts) { const f = findText(part.parts); if (f) return f; }
      }
    }
    // HTML fallback (o FreeTour directo)
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
  "phone": "número de teléfono con prefijo internacional o null",
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
7. Plataforma por remitente/asunto:
   - "guruwalk" en remitente → guruwalk
   - "turixe" en remitente o asunto → turixe
   - "freetour" o "FREETOUR" en remitente → freetour
   - "tripadvisor" en remitente → tripadvisor
8. booking_code — código único de la reserva:
   - Guruwalk: campo "Código de reserva" (ej: BRU11465144)
   - Turixe: código del asunto (ej: mkvspymx-f2ce68ce185e) — es el código alfanumérico tras el último ":"
   - FreeTour: "Booking Reference Number" (ej: 79182-20260213053640-497)
   - Para modificaciones de Turixe: original_booking_code = código del asunto, booking_code = null (Turixe no da código nuevo)
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
Cuerpo del email:
${email.body.slice(0, 3000)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text  = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── BUSCAR O CREAR TOUR ──────────────────────────────────────────────────────
async function findOrCreateTour(data: any): Promise<string> {
  const { data: existing } = await supabase
    .from("tours")
    .select("id")
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
    .select("id")
    .single();

  if (error) throw new Error(`Error creando tour: ${error.message}`);
  return created.id;
}

// ─── GUARDAR RESERVA (con deduplicación por teléfono/booking_code + tour) ──────
async function saveReservation(tourId: string, data: any, rawEmail: string) {
  const adults       = Number(data.adults)   || 0;
  const children     = Number(data.children) || 0;
  const bookingCode  = data.booking_code ?? null;
  const phone        = data.phone ?? "";

  // Deduplicación: buscar por booking_code (Turixe) o por teléfono
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
    console.log("Reserva actualizada (pax):", data.contact_name);
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

  // Notificación de nueva reserva
  const { data: tour } = await supabase
    .from("tours").select("date, time").eq("id", tourId).maybeSingle();
  if (tour) {
    const fecha    = new Date(tour.date).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const plat     = (data.platform ?? "other").charAt(0).toUpperCase() + (data.platform ?? "other").slice(1);
    const paxTotal = adults + children;
    await supabase.from("notifications").insert({
      type:    "reservation",
      message: `Nueva reserva [${plat}] · ${data.contact_name ?? "cliente"} · ${paxTotal} pax · ${fecha} ${tour.time?.slice(0, 5)}`,
      tour_id: tourId,
    });
  }
  console.log("Reserva guardada:", data.contact_name);
}

// ─── CANCELAR RESERVA ─────────────────────────────────────────────────────────
async function handleCancellation(data: any): Promise<void> {
  let reservation = null;

  // Turixe: buscar por booking_code si lo tenemos
  if (data.platform === "turixe" && data.booking_code) {
    const { data: found } = await supabase
      .from("reservations").select("id, tour_id")
      .eq("booking_code", data.booking_code)
      .maybeSingle();
    reservation = found;
  }

  // Fallback: buscar por teléfono + fecha + plataforma
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
    console.log("Reserva no encontrada para cancelación — código:", data.booking_code, "tel:", data.phone);
    return;
  }

  const tourId = reservation.tour_id;

  // Notificación de cancelación — ANTES de borrar por si el tour desaparece
  const { data: tourInfo } = await supabase
    .from("tours").select("date, time, platform").eq("id", tourId).maybeSingle();
  if (tourInfo) {
    const fecha = new Date(tourInfo.date).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const plat  = (tourInfo.platform ?? "other").charAt(0).toUpperCase() + (tourInfo.platform ?? "other").slice(1);
    await supabase.from("notifications").insert({
      type:    "cancellation",
      message: `Cancelación [${plat}] · ${data.contact_name ?? "cliente"} · ${fecha} ${tourInfo.time?.slice(0, 5)}`,
      tour_id: tourId,
    });
  }

  await supabase.from("reservations").delete().eq("id", reservation.id);
  console.log("Reserva cancelada:", data.contact_name);

  // Borrar tour huérfano si quedó vacío Y fue creado automáticamente
  const { data: tour } = await supabase
    .from("tours").select("source")
    .eq("id", tourId).maybeSingle();

  if (tour?.source === "auto") {
    const { count } = await supabase
      .from("reservations").select("id", { count: "exact", head: true })
      .eq("tour_id", tourId);

    if (count === 0) {
      await supabase.from("tours").delete().eq("id", tourId);
      console.log("Tour huérfano eliminado:", tourId);
    }
  }
}

// ─── MODIFICAR RESERVA ────────────────────────────────────────────────────────
async function handleModification(data: any, rawEmail: string): Promise<void> {
  console.log("Modificación detectada para:", data.contact_name);

  const originalDate        = data.original_date        ?? data.date;
  const originalBookingCode = data.original_booking_code ?? null;

  let originalReservation = null;

  // Turixe: buscar por booking_code original
  if (data.platform === "turixe" && originalBookingCode) {
    const { data: found } = await supabase
      .from("reservations").select("id, tour_id")
      .eq("booking_code", originalBookingCode)
      .maybeSingle();
    originalReservation = found;
  }

  // Fallback: buscar por teléfono + fecha original
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
    console.log("Reserva original eliminada");
  } else {
    console.log("Reserva original no encontrada — solo se creará la nueva");
  }

  // Crear nueva reserva
  const newTourId = await findOrCreateTour(data);
  await saveReservation(newTourId, data, rawEmail);
  console.log("Reserva modificada guardada:", data.contact_name);

  // Notificación de modificación — con detalle de qué cambió
  const { data: tourInfo } = await supabase
    .from("tours").select("date, time, platform").eq("id", newTourId).maybeSingle();
  if (tourInfo) {
    const fecha = new Date(tourInfo.date).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const plat  = (data.platform ?? "other").charAt(0).toUpperCase() + (data.platform ?? "other").slice(1);

    // Detectar qué cambió
    const parts: string[] = [];
    const newPax      = (Number(data.adults) || 0) + (Number(data.children) || 0);
    const originalPax = (Number(data.original_adults) || 0) + (Number(data.original_children) || 0);

    if (data.original_date && data.original_date !== data.date) {
      const fechaOrig = new Date(data.original_date).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
      parts.push(`fecha ${fechaOrig} → ${fecha}`);
    }
    if (data.original_time && data.original_time !== data.time) {
      parts.push(`hora ${data.original_time} → ${data.time}`);
    }
    if (originalPax && originalPax !== newPax) {
      parts.push(`pax ${originalPax} → ${newPax}`);
    }

    const detalle = parts.length > 0 ? parts.join(", ") : `${fecha} ${tourInfo.time?.slice(0, 5)}`;

    await supabase.from("notifications").insert({
      type:    "modification",
      message: `Modificación [${plat}] · ${data.contact_name ?? "cliente"} · ${detalle}`,
      tour_id: newTourId,
    });
  }

  // Borrar tour huérfano si quedó vacío Y fue creado automáticamente
  if (oldTourId && oldTourId !== newTourId) {
    const { data: tour } = await supabase
      .from("tours").select("source")
      .eq("id", oldTourId).maybeSingle();

    if (tour?.source === "auto") {
      const { count } = await supabase
        .from("reservations").select("id", { count: "exact", head: true })
        .eq("tour_id", oldTourId);

      if (count === 0) {
        await supabase.from("tours").delete().eq("id", oldTourId);
        console.log("Tour huérfano eliminado:", oldTourId);
      }
    }
  }
}

// ─── LEER EMAILS NUEVOS (vía historial Gmail) ─────────────────────────────────
async function getNewEmails(accessToken: string): Promise<{ subject: string; from: string; body: string }[]> {
  const { data: state } = await supabase
    .from("gmail_state")
    .select("history_id")
    .eq("id", 1)
    .maybeSingle();

  const startHistoryId = state?.history_id;
  if (!startHistoryId) {
    console.log("Sin historyId guardado");
    return [];
  }

  const histRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const histData = await histRes.json();

  // Actualizar historyId
  if (histData.historyId) {
    await supabase.from("gmail_state").update({
      history_id: String(histData.historyId),
    }).eq("id", 1);
  }

  if (!histData.history) return [];

  const messageIds: string[] = [];
  for (const h of histData.history) {
    for (const m of h.messagesAdded ?? []) {
      messageIds.push(m.message.id);
    }
  }

  const texts: { subject: string; from: string; body: string }[] = [];
  for (const msgId of messageIds) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const msg   = await msgRes.json();
    const email = extractEmailText(msg);
    if (email.body) texts.push(email);
  }

  return texts;
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const body = await req.json();

    const messageData = body?.message?.data;
    if (!messageData) return new Response("ok", { status: 200 });

    const notification = JSON.parse(atob(messageData));
    console.log("Notificación Gmail:", JSON.stringify(notification));

    const historyId = String(notification.historyId);

    // Guardar historyId si es el primero
    const { data: existing } = await supabase
      .from("gmail_state").select("id").eq("id", 1).maybeSingle();

    if (!existing) {
      await supabase.from("gmail_state").insert({ id: 1, history_id: historyId });
      console.log("Primer historyId guardado:", historyId);
    }

    const accessToken = await getAccessToken();
    const emails      = await getNewEmails(accessToken);

    if (emails.length === 0) {
      console.log("Sin emails nuevos");
      return new Response("ok", { status: 200 });
    }

    for (const email of emails) {
      console.log("Procesando:", email.subject);
      let extracted: any;

      try {
        extracted = await callGemini(email);
        console.log("Extraído:", JSON.stringify(extracted));
      } catch (e) {
        console.error("Error en Gemini — saltando email:", e.message);
        continue;
      }

      if (extracted.type === "other" || !extracted.tour_title) {
        console.log("Email ignorado");
        continue;
      }

      if (extracted.type === "cancellation") {
        await handleCancellation(extracted);
        continue;
      }

      if (extracted.type === "modification") {
        await handleModification(extracted, email.body);
        continue;
      }

      // reservation
      const tourId = await findOrCreateTour(extracted);
      await saveReservation(tourId, extracted, email.body);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error:", err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 200 });
  }
});