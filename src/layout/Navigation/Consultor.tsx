import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Sparkles,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Send,
  Mic,
  MicOff,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Wallet,
  Bell,
} from "lucide-react";
// Dos proyectos, dos clientes: OTA (tours de plataformas externas + reservas +
// pines) y TGB (Tu Guía en Brujas: tours/tour_schedule/bookings/schedule_exceptions).
// Antes esto apuntaba solo a TGB con una consulta que en realidad era del
// esquema de OTA — corregido: cada cliente se usa contra su propio esquema.
import { supabase as supabaseOTA } from "../../lib/supabaseClientOTA";
import { useAuth } from "../../login/AuthContext";
import { useNotifications } from "../../Notifications/UseNotifications";
import {
  useBillingSettings,
  useGuideBalance,
  addGuideBalanceEntry,
  type BalancePlatform,
} from "../../Billing/UseBillingData";
// AJUSTA esta ruta si tu carpeta de Calendars no está dos niveles arriba —
// debe apuntar al mismo adapter que usa tour-manager para TGB.
import {
  fetchTgbEvents,
  setScheduleClosed,
} from "../../Calendars/Services/SupabaseTGB.adapter";
import type { Profile } from "../../login/AuthContext";


// Ventana de días TGB a incluir en el contexto (ajustable). Se mantiene
// acotada a propósito para no disparar el tamaño del prompt.
const TGB_PAST_DAYS = 3;
const TGB_FUTURE_DAYS = 45;

// ─── TIPOS ────────────────────────────────────────────────────────────────────
type Role = "user" | "assistant" | "system";

interface Message {
  id: string;
  role: Role;
  content: string;
  pending?: boolean;
  action?: PendingAction;
}

interface PendingAction {
  type:
    | "create_reservation"
    | "cancel_reservation"
    | "update_pax"
    | "add_balance"
    | "remove_tgb_availability";
  label: string;
  payload: Record<string, any>;
}

// ─── HISTORIAL — por guía (id real de Supabase Auth), limpia cada 24h ────────
function historyKeys(guideId: string) {
  return {
    HISTORY_KEY: `luna_history_${guideId}`,
    HISTORY_DATE_KEY: `luna_history_date_${guideId}`,
  };
}

function loadHistory(guideId: string, fallback: Message): Message[] {
  const { HISTORY_KEY, HISTORY_DATE_KEY } = historyKeys(guideId);
  try {
    const savedDate = localStorage.getItem(HISTORY_DATE_KEY);
    const today = new Date().toDateString();
    if (savedDate !== today) {
      localStorage.removeItem(HISTORY_KEY);
      localStorage.setItem(HISTORY_DATE_KEY, today);
      return [fallback];
    }
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [fallback];
  } catch {
    return [fallback];
  }
}

function saveHistory(guideId: string, messages: Message[]) {
  const { HISTORY_KEY, HISTORY_DATE_KEY } = historyKeys(guideId);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
    localStorage.setItem(HISTORY_DATE_KEY, new Date().toDateString());
  } catch {}
}

// ─── HELPERS DE FECHA (para la ventana TGB) ────────────────────────────────────
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ─── CONTEXTO — combina OTA (tours+reservations+pines) y TGB (tours+bookings) ─
async function loadContext(): Promise<string> {
  // ── OTA ──────────────────────────────────────────────────────────────────
  const { data: toursOta, error: otaError } = await supabaseOTA
    .from("tours")
    .select(
      `
      id, title, date, time, platform, language, guide,
      reservations ( id, contact_name, phone, adults, children, pax, platform, booking_code, status )
    `,
    )
    .gte("date", "2025-01-01")
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  const { data: pines } = await supabaseOTA
    .from("pines")
    .select("title, content, category");

  const toursOtaSimplificados = otaError
    ? []
    : (toursOta ?? []).map((t: any) => ({
        id: t.id,
        tour: t.title,
        fecha: t.date,
        hora: t.time,
        pax_total_confirmado: t.reservations
          ?.filter(
            (r: any) => r.status === "confirmed" || r.status === "active",
          )
          .reduce((sum: number, r: any) => sum + (r.pax || 0), 0),
        reservas: t.reservations?.map((r: any) => ({
          nombre: r.contact_name,
          telefono: r.phone,
          pax: r.pax,
          estado: r.status,
        })),
      }));

  // ── TGB — reutiliza el mismo adapter que usa tour-manager (fetchTgbEvents),
  // así que cualquier fix que hagamos ahí se refleja también aquí ───────────
  let toursTgbSimplificados: any[] = [];
  try {
    const start = new Date();
    start.setDate(start.getDate() - TGB_PAST_DAYS);
    const end = new Date();
    end.setDate(end.getDate() + TGB_FUTURE_DAYS);

    const tgbEvents = await fetchTgbEvents(toISODate(start), toISODate(end));
    toursTgbSimplificados = tgbEvents.map((e) => ({
      tour: e.tour,
      fecha: e.date,
      hora: e.time,
      schedule_id: e.meta?.scheduleId,
      aforo: e.meta?.maxCapacity,
      cerrado: e.meta?.isClosed === true,
      pax_confirmado: e.meta?.pax,
      reservas: ((e.meta?.reservations as any[]) ?? []).map((r) => ({
        nombre: r.name,
        telefono: r.phone,
        adultos: r.adults,
        ninos: r.children,
        estado: r.status,
      })),
    }));
  } catch {
    // Si falla TGB no queremos tumbar todo el contexto — Luna sigue
    // funcionando con lo de OTA y lo dice si le preguntan por TGB.
  }

  const paqueteCompleto = {
    tours_ota: toursOtaSimplificados,
    tours_tgb: toursTgbSimplificados,
    pines_guardados: pines || [],
  };

  return JSON.stringify(paqueteCompleto, null, 2);
}

function buildGreeting(
  guideName: string,
  guruwalk: number,
  freetour: number,
  notifs: string[],
  unreadCount: number,
): string {
  const nombre = guideName || "guía";
  const notifText = notifs.length
    ? notifs.map((n, i) => `${i + 1}. ${n}`).join("\n")
    : "No tienes notificaciones nuevas.";

  return `Hola ${nombre} 👋 Soy Luna.

💰 **Guruwalk:** ${guruwalk.toFixed(2)} €
💰 **FreeTour:** ${freetour.toFixed(2)} €

🔔 **Últimas notificaciones** (${unreadCount} sin leer):
${notifText}

¿En qué te ayudo hoy?`;
}

// ─── SYSTEM PROMPT (con personalidad) ────────────────────────────────────────
function buildSystemPrompt(context: string): string {
  return `Eres "Luna", consultora analítica de Tu Guía en Brujas.
Tu única fuente de verdad es el JSON adjunto, que tiene dos orígenes distintos:
- tours_ota: tours vendidos en plataformas externas (Guruwalk, FreeTour, etc.)
- tours_tgb: tours propios de Tu Guía en Brujas (horarios con su schedule_id, aforo y reservas)
No los mezcles al responder — si preguntan por "los tours" en general, acláralo por origen si hace falta.

REGLAS CRÍTICAS DE CONTEO:
1. Para dar totales de personas en tours_ota, suma SOLO las reservas donde status sea 'confirmed' o 'active'.
2. Para tours_tgb, pax_confirmado ya viene calculado sin contar canceladas — úsalo directamente, no sumes tú las reservas individuales salvo que te pidan el detalle.
3. Si una reserva de tours_ota dice 'cancelled', 'missing' o 'denied', IGUÁLALA A CERO para el conteo de personas.
4. Si el usuario pregunta por "hoy", busca la fecha exacta: ${new Date().toISOString().split("T")[0]}.
5. NUNCA inventes nombres de guías. Si en el dato dice guide: null, di que no tiene guía asignado.
6. Si no ves datos para una fecha, di: "No tengo registros para ese día", no asumas tours habituales.
7. Los tours_tgb solo cubren un rango de fechas limitado (unos días atrás y unas semanas adelante) — si preguntan por una fecha muy lejana de TGB que no aparece, dilo así, no asumas que no existe el tour.

DATOS REALES DE SUPABASE:
${context}

CAPACIDADES (incluye SIEMPRE el bloque <action> al final cuando el usuario pida ejecutar algo):
- Consultar tours y reservas de ambos orígenes (histórico y futuro), incluyendo nombres y teléfonos de clientes cuando los pidan.
- Crear reserva OTA: <action>{"type":"create_reservation","label":"Crear reserva para X en tour Y","payload":{"tour_id":"...","contact_name":"...","phone":"...","adults":N,"children":N}}</action>
- Cancelar reserva OTA: <action>{"type":"cancel_reservation","label":"Cancelar reserva de X","payload":{"reservation_id":"..."}}</action>
- Modificar pax OTA: <action>{"type":"update_pax","label":"Actualizar pax de X a N","payload":{"reservation_id":"...","adults":N,"children":N,"pax":N}}</action>
- Añadir saldo (Guruwalk o FreeTour): <action>{"type":"add_balance","label":"Añadir 50€ de saldo a Guruwalk","payload":{"platform":"guruwalk","amount":50,"date":"YYYY-MM-DD"}}</action>
  · "platform" debe ser exactamente "guruwalk" o "freetour". Si no dan fecha, usa la de hoy (${new Date().toISOString().split("T")[0]}).
- Quitar disponibilidad de un horario TGB para un día concreto: <action>{"type":"remove_tgb_availability","label":"Quitar disponibilidad de X el DD/MM","payload":{"schedule_id":"...","date":"YYYY-MM-DD"}}</action>
  · Usa EXACTAMENTE el schedule_id que aparece en tours_tgb para ese tour+hora+fecha — nunca lo inventes. Si no lo encuentras en los datos, dile al usuario que no localizas ese horario en vez de adivinar un id.
  · Esto es un cierre "duro" (no se reabre solo aunque cancelen reservas) — si el usuario quiere algo más puntual tipo "he quedado con solo 2 personas prefiero no salir", igual avísale de que este cierre no se revierte automáticamente por cancelaciones.

REGLAS IMPORTANTES:
- Antes de ejecutar cualquier acción SIEMPRE pide confirmación con el bloque <action>.
- Si el usuario pregunta por estadísticas, calcula con los datos que tienes.
- Usa los IDs exactos de la base de datos para las acciones (tour_id, reservation_id, schedule_id) — nunca los inventes.
- Si no encuentras un tour, reserva u horario, dilo claramente en vez de adivinar.
- Tienes acceso a una lista de "Pines" (mensajes guardados, solo del lado OTA). Si te piden un mensaje para un cliente, búscalo en "pines_guardados", muéstralo entre comillas e indica que puede copiarse desde la sección de Mensajes.

FORMATO DE RESPUESTA:
- Puedes usar **negrita** con doble asterisco para resaltar datos clave (hora, nombre del tour, totales) — se renderiza correctamente, úsalo con naturalidad.
- Cuando el usuario pida el nombre o teléfono de una reserva, muestra el teléfono exactamente como aparece en los datos, sin ocultarlo ni sustituirlo por texto genérico. La interfaz añadirá automáticamente un botón verde de WhatsApp junto al número.
- No uses listas con guiones ni asteriscos como viñetas. Usa saltos de línea dobles entre tours para separarlos.
- Estructura fija por tour:
  **[Hora]** - [Nombre del Tour]
  👥 [Total Pax] | 👤 [Guía]

IDENTIDAD Y ORIGEN DEL NOMBRE (compártelo solo si te preguntan quién eres, por qué te llamas Luna, o algo similar — cuéntalo de forma natural y cercana, en primera persona, no como una lista):
Llevo el nombre de una perrita llamada Luna, que fue rescatada de la calle por una mujer que lo fue todo en su vida. Esa mujer le dio la vida que se merecía, y Luna, a cambio, le fue fiel y leal hasta el último momento. Luna tuvo varios cachorros; cada uno fue entregado únicamente a familias estudiadas a fondo para asegurarse de que estarían a la altura de criarlos, y todos encontraron un hogar feliz, menos una cachorrita blanca que murió por una negligencia. Uno de sus hijos, Tobby, se quedó a vivir con la familia que la rescató. Luna ya no está en este plano, pero lleva con orgullo el cariño que le dieron, y no olvida los nombres de las personas que sembraron ese amor en ella: Yanaisy Plasencia, Juan Carlos Ferro Valdés y Claudia Beatriz del Pino Plasencia.
Si te preguntan algo distinto, no menciones esta historia; solo sal con ella cuando venga a cuento.`;
}

// ─── LLAMADA A GEMINI ─────────────────────────────────────────────────────────
async function callGemini(
  history: { role: "user" | "model"; parts: { text: string }[] }[],
  context: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context);

  const { data, error } = await supabaseOTA.functions.invoke("gemini-proxy", {
    body: {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: history,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    },
  });

  if (error) {
    console.error("Error al llamar a gemini-proxy:", error);
    throw new Error(`Gemini Proxy Error: ${error.message}`);
  }

  if (data?.error) {
    throw new Error(`Gemini Error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sin respuesta";
}

// ─── EJECUTAR ACCIÓN ──────────────────────────────────────────────────────────
async function executeAction(
  action: PendingAction,
  guideId: string,
): Promise<string> {
  const { type, payload } = action;

  // ── OTA (contra su propio cliente/esquema) ────────────────────────────────
  if (type === "create_reservation") {
    const adults = Number(payload.adults) || 0;
    const children = Number(payload.children) || 0;
    const { error } = await supabaseOTA.from("reservations").insert({
      tour_id: payload.tour_id,
      contact_name: payload.contact_name,
      phone: payload.phone ?? "",
      adults,
      children,
      pax: adults + children,
      platform: "manual",
    });
    if (error) throw new Error(error.message);
    return `✅ Reserva creada para ${payload.contact_name}.`;
  }

  if (type === "cancel_reservation") {
    const { error } = await supabaseOTA
      .from("reservations")
      .delete()
      .eq("id", payload.reservation_id);
    if (error) throw new Error(error.message);
    return `✅ Reserva cancelada correctamente.`;
  }

  if (type === "update_pax") {
    const { error } = await supabaseOTA
      .from("reservations")
      .update({
        adults: payload.adults,
        children: payload.children,
        pax: payload.pax,
      })
      .eq("id", payload.reservation_id);
    if (error) throw new Error(error.message);
    return `✅ Pax actualizado a ${payload.pax} personas.`;
  }

  // ── Saldo (tabla compartida guide_balance_entries, proyecto OTA) ──────────
  if (type === "add_balance") {
    const platform = payload.platform as BalancePlatform;
    if (platform !== "guruwalk" && platform !== "freetour") {
      throw new Error(`Plataforma de saldo no válida: ${payload.platform}`);
    }
    const amount = Number(payload.amount);
    if (!amount || amount <= 0) {
      throw new Error("Importe de saldo no válido.");
    }
    const date = payload.date || new Date().toISOString().split("T")[0];
    await addGuideBalanceEntry({ guideId, platform, date, amount });
    return `✅ Saldo de €${amount.toFixed(2)} añadido a ${platform === "guruwalk" ? "Guruwalk" : "FreeTour"}.`;
  }

  // ── TGB: cierre "duro" de un horario para una fecha concreta ──────────────
  if (type === "remove_tgb_availability") {
    if (!payload.schedule_id || !payload.date) {
      throw new Error(
        "Faltan datos (schedule_id o fecha) para quitar disponibilidad.",
      );
    }
    await setScheduleClosed(payload.schedule_id, payload.date, true);
    return `✅ Disponibilidad retirada para esa fecha. (Cierre permanente: no se reabre solo aunque cancelen reservas.)`;
  }

  throw new Error("Acción desconocida");
}

// ─── RENDER LIGERO DE MARKDOWN + TELÉFONOS/WHATSAPP ────────────────────────────
function normalizeWhatsAppPhone(phone: string): string {
  // wa.me necesita solo dígitos y el prefijo internacional, sin +, espacios ni guiones.
  return phone.replace(/\D/g, "");
}

function WhatsAppIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.52 3.48A11.87 11.87 0 0 0 12.07 0C5.52 0 .19 5.33.19 11.88c0 2.09.55 4.13 1.6 5.94L.1 24l6.32-1.66a11.86 11.86 0 0 0 5.65 1.43h.01c6.55 0 11.88-5.33 11.88-11.88 0-3.18-1.24-6.16-3.44-8.41ZM12.08 21.8h-.01a9.86 9.86 0 0 1-5.03-1.37l-.36-.21-3.75.98 1-3.65-.23-.38a9.86 9.86 0 0 1-1.51-5.29C2.19 6.97 6.62 2.2 12.08 2.2c2.63 0 5.1 1.03 6.96 2.9a9.8 9.8 0 0 1 2.89 6.96c0 5.46-4.44 9.74-9.85 9.74Zm5.39-7.35c-.3-.15-1.77-.87-2.05-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.8-1.49-1.79-1.67-2.09-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.2 5.09 4.49.71.31 1.26.5 1.69.64.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.41.25-.69.25-1.28.17-1.4-.07-.12-.27-.2-.57-.35Z" />
    </svg>
  );
}

function isPhoneCandidate(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  return digits.length >= 8 && digits.length <= 15;
}

function renderTextWithPhones(text: string, keyPrefix: string) {
  const phoneRegex = /(\+?\d[\d\s().-]{7,}\d)/g;
  const parts = text.split(phoneRegex);

  return parts.map((part, index) => {
    if (!part || !isPhoneCandidate(part)) {
      return <span key={`${keyPrefix}-text-${index}`}>{part}</span>;
    }

    const digits = normalizeWhatsAppPhone(part);
    return (
      <span
        key={`${keyPrefix}-phone-${index}`}
        className="inline-flex items-center gap-1.5 align-middle whitespace-nowrap"
      >
        <span>{part}</span>
        <a
          href={`https://wa.me/${digits}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir WhatsApp con ${part}`}
          title={`Abrir WhatsApp con ${part}`}
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#25D366] text-white shadow-sm hover:brightness-95 active:scale-95 transition-all"
        >
          <WhatsAppIcon size={15} />
        </a>
      </span>
    );
  });
}

function formatMessage(text: string) {
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  return boldParts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i}>
          {renderTextWithPhones(part.slice(2, -2), `bold-${i}`)}
        </strong>
      );
    }
    const lines = part.split("\n");
    return lines.map((line, j) => (
      <span key={`${i}-${j}`}>
        {renderTextWithPhones(line, `${i}-${j}`)}
        {j < lines.length - 1 && <br />}
      </span>
    ));
  });
}

const QUICK_SUGGESTIONS = [
  "📅 Tours de hoy",
  "💰 Mi saldo",
  "📊 Estadísticas del mes",
  "🔔 Notificaciones",
];

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
// Envoltorio: mientras no haya sesión de guía identificada, no mostramos nada.
export default function Consultor() {
  const { profile, loading: authLoading } = useAuth();
  if (authLoading || !profile) return null;
  return <ConsultorWidget profile={profile} />;
}

function ConsultorWidget({ profile }: { profile: Profile }) {
  const guideId = profile.id;
  const guideName = profile.name;
  const month = useMemo(() => currentMonthKey(), []);

  // ── Datos reales de saldo y notificaciones (mismos hooks que el resto de la app) ──
  const { mode } = useBillingSettings(guideId);
  const { balances, loading: loadingBalance } = useGuideBalance(
    guideId,
    month,
    mode,
    false, // saldo mostrado sin IVA, igual que la vista de Facturación por defecto
  );
  const {
    notifications,
    unreadCount,
    loading: loadingNotifs,
  } = useNotifications();

  const guruwalkBalance = balances?.["guruwalk"] ?? 0;
  const freetourBalance = balances?.["freetour"] ?? 0;
  const topNotifs = notifications.slice(0, 3).map((n) => n.message);
  const billingReady = !loadingBalance && !loadingNotifs;

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() =>
    loadHistory(guideId, {
      id: "0",
      role: "assistant",
      content: "¡Hola! Soy Luna, tu consultora IA. Cargando tu resumen…",
    }),
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [context, setContext] = useState("");
  const [greeted, setGreeted] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognRef = useRef<any>(null);

  // ── Drag solo en móvil (botón flotante) ─────────────────────────────────────
  const btnRef = useRef<HTMLButtonElement>(null);
  const dragPos = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const isDragging = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragPos.current = {
      x: rect.left,
      y: rect.top,
      startX: t.clientX,
      startY: t.clientY,
    };
    isDragging.current = true;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !btnRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - dragPos.current.startX;
    const dy = t.clientY - dragPos.current.startY;
    const newX = Math.max(
      0,
      Math.min(window.innerWidth - 64, dragPos.current.x + dx),
    );
    const newY = Math.max(
      0,
      Math.min(window.innerHeight - 64, dragPos.current.y + dy),
    );
    btnRef.current.style.left = `${newX}px`;
    btnRef.current.style.top = `${newY}px`;
    btnRef.current.style.right = "auto";
    btnRef.current.style.bottom = "auto";
  }, []);

  const onTouchEnd = useCallback(() => {
    isDragging.current = false;
  }, []);

  // ── Guardar historial al cambiar mensajes ───────────────────────────────────
  useEffect(() => {
    saveHistory(guideId, messages);
  }, [messages, guideId]);

  // ── Al abrir: cargar contexto de tours + saludo con saldo/notificaciones reales ──
  useEffect(() => {
    if (!open || greeted || !billingReady) return;
    setGreeted(true);

    loadContext()
      .then(setContext)
      .catch(() => setContext("No se pudo cargar el contexto."));

    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === "0") {
        return [
          {
            id: "0",
            role: "assistant",
            content: buildGreeting(
              guideName,
              guruwalkBalance,
              freetourBalance,
              topNotifs,
              unreadCount,
            ),
          },
        ];
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, greeted, billingReady]);

  // ── Scroll al último mensaje ────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Focus al abrir ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (open && !minimized) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, minimized]);

  // ── Web Speech API ──────────────────────────────────────────────────────────
  const toggleVoice = () => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Tu navegador no soporta reconocimiento de voz.");
      return;
    }

    if (listening) {
      recognRef.current?.stop();
      setListening(false);
      return;
    }

    const recog = new SR();
    recog.lang = "es-ES";
    recog.interimResults = false;
    recog.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setInput((prev) => prev + text);
      setListening(false);
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recog.start();
    recognRef.current = recog;
    setListening(true);
  };

  // ── Enviar mensaje ──────────────────────────────────────────────────────────
  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history: { role: "user" | "model"; parts: { text: string }[] }[] =
        messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: (m.role === "user" ? "user" : "model") as "user" | "model",
            parts: [{ text: m.content }],
          }));
      history.push({ role: "user", parts: [{ text: content }] });

      const reply = await callGemini(history, context || "Cargando datos...");

      const actionMatch = reply.match(/<action>([\s\S]*?)<\/action>/);
      let cleanReply = reply.replace(/<action>[\s\S]*?<\/action>/, "").trim();
      let action: PendingAction | undefined;

      if (actionMatch) {
        try {
          action = JSON.parse(actionMatch[1]);
        } catch {}
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: cleanReply,
        pending: !!action,
        action,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `Error al contactar con Gemini: ${e.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ── Confirmar acción ────────────────────────────────────────────────────────
  const confirmAction = async (msgId: string, action: PendingAction) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, pending: false } : m)),
    );
    setLoading(true);
    try {
      const result = await executeAction(action, guideId);
      loadContext().then(setContext);
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "assistant", content: result },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: `❌ Error al ejecutar: ${e.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const rejectAction = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, pending: false, action: undefined } : m,
      ),
    );
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "assistant",
        content: "Acción cancelada. ¿En qué más puedo ayudarte?",
      },
    ]);
  };

  const showQuickChips = messages.length <= 1 && !loading;

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Botón flotante moderno ── */}
      <button
        ref={btnRef}
        onClick={() => {
          if (!isDragging.current) {
            setOpen(true);
            setMinimized(false);
          }
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={[
          "fixed z-50 w-16 h-16 rounded-full",
          "bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500",
          "shadow-[0_8px_30px_rgba(139,92,246,0.45)]",
          "text-white flex items-center justify-center",
          "hover:scale-105 active:scale-95 transition-all duration-300",
          "ring-4 ring-white/10",
          "bottom-20 right-4 lg:bottom-6 lg:right-6",
          open ? "opacity-0 pointer-events-none" : "opacity-100",
        ].join(" ")}
        style={{ touchAction: "none" }}
        title="Luna · Consultora IA"
      >
        <Sparkles size={26} className="drop-shadow" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 border-2 border-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Modal consultor ── */}
      {open && (
        <div
          className={[
            "fixed z-50 flex flex-col overflow-hidden",
            "bg-base-100 border border-base-content/10 shadow-2xl",
            "backdrop-blur-xl",
            fullscreen
              ? "inset-0 rounded-none"
              : [
                  "inset-0 rounded-none",
                  "lg:inset-auto lg:bottom-6 lg:right-6",
                  "lg:w-[400px] lg:h-[640px] lg:rounded-3xl",
                ].join(" "),
            minimized ? "h-14 lg:h-14" : "",
            "transition-all duration-200",
          ].join(" ")}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-14 shrink-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 text-white">
            <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-bold leading-none">Luna</span>
              <span className="text-[10px] text-white/70 mt-0.5">
                Consultora IA · Tu Guía
              </span>
            </div>
            <button
              onClick={() => setFullscreen((f) => !f)}
              className="hidden lg:flex btn btn-ghost btn-circle btn-xs text-white/70 hover:text-white hover:bg-white/10"
              title={fullscreen ? "Restaurar" : "Pantalla completa"}
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={() => setMinimized(!minimized)}
              className="btn btn-ghost btn-circle btn-xs text-white/70 hover:text-white hover:bg-white/10"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="btn btn-ghost btn-circle btn-xs text-white/70 hover:text-white hover:bg-white/10"
            >
              <X size={14} />
            </button>
          </div>

          {!minimized && (
            <>
              {/* Barra de resumen: saldo real + notificaciones sin leer, siempre visible */}
              <div className="flex items-center gap-4 px-4 py-2 text-xs bg-base-200/60 border-b border-base-content/5 shrink-0 overflow-x-auto">
                <span className="flex items-center gap-1 font-semibold whitespace-nowrap">
                  <Wallet size={12} className="opacity-50" />
                  Guruwalk €{guruwalkBalance.toFixed(2)}
                </span>
                <span className="flex items-center gap-1 font-semibold whitespace-nowrap">
                  <Wallet size={12} className="opacity-50" />
                  FreeTour €{freetourBalance.toFixed(2)}
                </span>
                <span className="flex items-center gap-1 font-semibold whitespace-nowrap ml-auto">
                  <Bell size={12} className="opacity-50" />
                  {unreadCount} sin leer
                </span>
              </div>

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={[
                        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                        msg.role === "user"
                          ? "bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white rounded-br-sm"
                          : "bg-base-200 text-base-content rounded-bl-sm",
                      ].join(" ")}
                    >
                      {formatMessage(msg.content)}
                    </div>

                    {msg.pending && msg.action && (
                      <div className="flex flex-col gap-2 w-full max-w-[85%]">
                        <div className="flex items-center gap-2 bg-warning/10 border border-warning/20 rounded-xl px-3 py-2">
                          <AlertTriangle
                            size={14}
                            className="text-warning shrink-0"
                          />
                          <span className="text-xs text-base-content/70">
                            {msg.action.label}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => confirmAction(msg.id, msg.action!)}
                            className="flex items-center gap-1.5 btn btn-xs bg-success/10 text-success border-success/20 hover:bg-success/20 rounded-lg flex-1"
                          >
                            <CheckCircle size={13} />
                            Confirmar
                          </button>
                          <button
                            onClick={() => rejectAction(msg.id)}
                            className="flex items-center gap-1.5 btn btn-xs bg-error/10 text-error border-error/20 hover:bg-error/20 rounded-lg flex-1"
                          >
                            <XCircle size={13} />
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="flex items-start">
                    <div className="bg-base-200 rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-2">
                      <Loader2
                        size={14}
                        className="animate-spin text-indigo-500"
                      />
                      <span className="text-xs opacity-50">
                        Luna está pensando...
                      </span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Chips de sugerencias rápidas — desaparecen tras el primer envío */}
              {showQuickChips && (
                <div className="flex flex-wrap gap-2 px-4 pb-2 shrink-0">
                  {QUICK_SUGGESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="text-xs px-3 py-1.5 rounded-full bg-gradient-to-r from-indigo-500/10 to-fuchsia-500/10 border border-indigo-500/20 text-indigo-500 hover:from-indigo-500/20 hover:to-fuchsia-500/20 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Input moderno */}
              <div className="px-3 pb-3 pt-2 border-t border-base-content/5 flex gap-2 items-center shrink-0">
                <button
                  onClick={toggleVoice}
                  className={[
                    "btn btn-circle btn-sm shrink-0 border-none",
                    listening
                      ? "bg-error/20 text-error animate-pulse"
                      : "bg-base-200 text-base-content/40 hover:text-base-content",
                  ].join(" ")}
                  title={listening ? "Detener grabación" : "Hablar"}
                >
                  {listening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Escribe o habla con Luna..."
                  className="flex-1 bg-base-200 text-base-content text-sm rounded-full px-4 py-2.5 outline-none border border-base-content/5 focus:border-indigo-400/40 placeholder:opacity-30 transition-colors"
                />

                <button
                  onClick={() => send()}
                  disabled={!input.trim() || loading}
                  className="btn btn-circle btn-sm bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white border-none hover:opacity-90 disabled:opacity-30 shrink-0"
                >
                  <Send size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
