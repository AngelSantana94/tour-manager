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
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../login/AuthContext";
import { fetchTours } from "../../Calendars/Services/Supabase.adapter";
import type { Profile } from "../../login/AuthContext";

// Ventana de días a incluir en el contexto de tours (ajustable). Se mantiene
// acotada a propósito para no disparar el tamaño del prompt.
const PAST_DAYS = 3;
const FUTURE_DAYS = 45;

// El "día de Mila" no cambia a medianoche sino a las 6:00 — antes de esa hora
// seguimos considerando que es "el día anterior" para el historial. Esto es
// lo que hace que el chat se renueve solo de madrugada sin que nadie tenga
// que borrarlo a mano: al abrir la app (o cada 5 min con la pestaña abierta)
// se compara la fecha "de negocio" contra la guardada y si cambió se limpia.
const HISTORY_RESET_HOUR = 6;

// ─── TIPOS ────────────────────────────────────────────────────────────────────
type Role = "user" | "assistant" | "system";

interface Message {
  id: string;
  role: Role;
  content: string;
  pending?: boolean;
  action?: PendingAction;
}

// Sin acciones de escritura por ahora (solo consulta). Cuando haya algo que
// Mila deba poder ejecutar (por ejemplo, asignar un guía a un tour), se
// añade aquí un "type" nuevo y su rama en executeAction, más abajo.
interface PendingAction {
  type: string;
  label: string;
  payload: Record<string, any>;
}

// ─── HISTORIAL — por usuario (id real de Supabase Auth), limpia cada día a las 6am ──
function historyKeys(userId: string) {
  return {
    HISTORY_KEY: `mila_history_${userId}`,
    HISTORY_DATE_KEY: `mila_history_date_${userId}`,
  };
}

// Clave de "día laboral" de Mila: si son las 05:59, todavía cuenta como el
// día de ayer. A partir de las 06:00 ya es un día nuevo.
function businessDateKey(d: Date = new Date()): string {
  const shifted = new Date(d);
  shifted.setHours(shifted.getHours() - HISTORY_RESET_HOUR);
  return shifted.toDateString();
}

function loadHistory(userId: string, fallback: Message): Message[] {
  const { HISTORY_KEY, HISTORY_DATE_KEY } = historyKeys(userId);
  try {
    const savedDate = localStorage.getItem(HISTORY_DATE_KEY);
    const today = businessDateKey();
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

function saveHistory(userId: string, messages: Message[]) {
  const { HISTORY_KEY, HISTORY_DATE_KEY } = historyKeys(userId);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
    localStorage.setItem(HISTORY_DATE_KEY, businessDateKey());
  } catch {
    // localStorage lleno o bloqueado: no es crítico, el chat sigue funcionando
  }
}

// ─── HELPERS DE FECHA (para la ventana de tours) ───────────────────────────────
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ─── CONTEXTO — tours reales de Supabase, ya filtrados por RLS ─────────────────
// fetchTours() usa la sesión de quien pregunta: si es una guía, RLS solo le
// devuelve los tours donde es lead o back-up (nunca ve tours de otras
// personas a través de Mila). Si es Rocío (admin), ve todos. No hace falta
// duplicar esa lógica aquí.
async function loadContext(): Promise<string> {
  let toursSimplificados: any[] = [];
  try {
    const start = new Date();
    start.setDate(start.getDate() - PAST_DAYS);
    const end = new Date();
    end.setDate(end.getDate() + FUTURE_DAYS);
    const startISO = toISODate(start);
    const endISO = toISODate(end);

    const events = await fetchTours();
    toursSimplificados = events
      .filter((e) => e.date >= startISO && e.date <= endISO)
      .map((e) => ({
        id: e.id,
        tour: e.tour,
        fecha: e.date,
        hora: e.meta?.noTime ? null : e.time,
        periodo: e.meta?.period, // "AM" | "PM" | "SC"
        ciudad: e.meta?.city,
        pax: e.meta?.pax,
        punto_encuentro: e.meta?.meetingPoint,
        estado: e.meta?.status,
        guia_lead: (e.meta?.guideLead as any)?.name ?? null,
        backup_1: (e.meta?.backup1 as any)?.name ?? null,
        backup_2: (e.meta?.backup2 as any)?.name ?? null,
        notas: e.meta?.notes,
      }));
  } catch {
    // Si falla la carga de tours, Mila lo dice en vez de quedarse muda.
    return JSON.stringify({
      tours: [],
      error: "No se pudieron cargar los tours.",
    });
  }

  return JSON.stringify({ tours: toursSimplificados }, null, 2);
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
function buildSystemPrompt(context: string): string {
  return `Eres "Mila", consultora analítica de TourManager (Vivalux, Brujas).
Tu única fuente de verdad es el JSON adjunto, con los tours visibles para la
persona que te está preguntando (si es una guía, ya vienen filtrados a solo
sus tours; si es coordinación, ves todos).

REGLAS CRÍTICAS:
1. Si el usuario pregunta por "hoy", usa la fecha exacta: ${new Date().toISOString().split("T")[0]}.
2. NUNCA inventes nombres de guías. Si el dato dice guia_lead: null, di que no tiene guía asignado.
3. Si no ves datos para una fecha, di: "No tengo registros para ese día", no asumas tours habituales.
4. Solo tienes tours de una ventana limitada (unos días atrás y unas semanas adelante) — si preguntan por una fecha muy lejana que no aparece, dilo así, no asumas que no existe el tour.
5. Todavía NO tienes acceso a la disponibilidad de los guías (qué días pueden trabajar). Si te preguntan por eso, dilo claramente en vez de adivinar.
6. "periodo" indica AM (mañana), PM (tarde) o SC (sin horario confirmado en la agenda) — úsalo cuando te pregunten "a qué hora" y no haya hora exacta.

CAPACIDADES:
- Consultar tours (histórico y futuro): fecha, hora/período, ciudad, pax, punto de encuentro, estado, guías asignados y notas.
- Por ahora solo consultas — no puedes crear, modificar ni cancelar nada. Si te piden una acción, explica que todavía no tienes permiso para eso.

DATOS REALES DE SUPABASE:
${context}

REGLAS IMPORTANTES:
- Si no encuentras un tour, dilo claramente en vez de adivinar.
- No expongas el id interno del tour salvo que te lo pidan explícitamente.

FORMATO DE RESPUESTA:
- Puedes usar **negrita** con doble asterisco para resaltar datos clave (hora, nombre del tour, totales) — se renderiza correctamente, úsalo con naturalidad.
- Cuando el usuario pida el teléfono de un guía o del tour, muéstralo exactamente como aparece en los datos. La interfaz añadirá automáticamente un botón verde de WhatsApp junto al número.
- No uses listas con guiones ni asteriscos como viñetas. Usa saltos de línea dobles entre tours para separarlos.
- Estructura fija por tour:
  **[Hora o período]** - [Nombre del Tour]
  👥 [Pax] | 👤 [Guía lead]`;
}

// ─── LLAMADA A GEMINI ─────────────────────────────────────────────────────────
async function callGemini(
  history: { role: "user" | "model"; parts: { text: string }[] }[],
  context: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context);

  const { data, error } = await supabase.functions.invoke("gemini-proxy", {
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
    throw new Error(
      `Gemini Error: ${data.error.message || JSON.stringify(data.error)}`,
    );
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sin respuesta";
}

// ─── EJECUTAR ACCIÓN ──────────────────────────────────────────────────────────
// Vacío a propósito: Mila todavía no tiene ninguna acción de escritura
// habilitada (ver system prompt). Se deja la estructura de confirmar/cancelar
// en la interfaz porque, en cuanto haya una primera acción real (por ejemplo
// "asignar guía a este tour"), solo hace falta añadir su rama aquí.
async function executeAction(action: PendingAction): Promise<string> {
  throw new Error(`Acción no disponible todavía: ${action.type}`);
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

// Excluye fechas y horas antes de aceptar una cadena como candidata a teléfono.
function isPhoneCandidate(value: string): boolean {
  const trimmed = value.trim();

  // Fechas en cualquier orden/separador: 2026-09-05, 05-09-2026, 05/09/2026, 05.09.2026...
  if (/^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(trimmed)) return false;

  // Horas: 15:00, 15:00:00
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) return false;

  const digits = trimmed.replace(/\D/g, "");
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
  "📅 Tours de esta semana",
  "👤 ¿Quién guía mañana?",
];

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
// Envoltorio: mientras no haya sesión identificada, no mostramos nada.
export default function Consultor() {
  const { profile, loading: authLoading } = useAuth();
  if (authLoading || !profile) return null;
  return <MilaWidget profile={profile} />;
}

function MilaWidget({ profile }: { profile: Profile }) {
  const userId = profile.id;
  const userName = profile.name;

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() =>
    loadHistory(userId, {
      id: "0",
      role: "assistant",
      content: `¡Hola${userName ? ", " + userName : ""}! Soy Mila. Dame un segundo para revisar la agenda…`,
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
    saveHistory(userId, messages);
  }, [messages, userId]);

  // ── Reinicio automático a las 6:00 aunque la pestaña quede abierta toda la
  // noche (sin esto, el corte de "día" solo se aplicaba al recargar la app) ──
  useEffect(() => {
    const id = setInterval(
      () => {
        const { HISTORY_KEY, HISTORY_DATE_KEY } = historyKeys(userId);
        const stored = localStorage.getItem(HISTORY_DATE_KEY);
        const current = businessDateKey();
        if (stored && stored !== current) {
          localStorage.removeItem(HISTORY_KEY);
          localStorage.setItem(HISTORY_DATE_KEY, current);
          setMessages([
            {
              id: "0",
              role: "assistant",
              content: `¡Hola${userName ? ", " + userName : ""}! Soy Mila. Dame un segundo para revisar la agenda…`,
            },
          ]);
          setGreeted(false);
        }
      },
      5 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, [userId, userName]);

  // ── Al abrir: cargar contexto de tours y saludar ────────────────────────────
  useEffect(() => {
    if (!open || greeted) return;
    setGreeted(true);

    loadContext()
      .then(setContext)
      .catch(() => setContext("No se pudo cargar el contexto."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, greeted]);

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
      const result = await executeAction(action);
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
      {/* ── Botón flotante ── */}
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
        title="Mila · Consultora IA"
      >
        <Sparkles size={26} className="drop-shadow" />
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
              <span className="text-sm font-bold leading-none">Mila</span>
              <span className="text-[10px] text-white/70 mt-0.5">
                Consultora IA · TourManager
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
              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={[
                        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
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
                        Mila está pensando...
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

              {/* Input */}
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
                  placeholder="Escribe o habla con Mila..."
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
