import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  X,
  Minus,
  Send,
  Mic,
  MicOff,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  "https://hccxpmnraefgccowdwri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY3hwbW5yYWVmZ2Njb3dkd3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjAyNzQsImV4cCI6MjA4ODE5NjI3NH0.QwfoDxbMDXPrCmfGPLsKVzhfLpQBKBVmNwbNm_dIX1E",
);

const GEMINI_API_KEY = "AIzaSyAWXyMMYTSxCdHcbqJ9huc3vb_UItcvlBU"; // ← reemplaza con tu key
const GEMINI_MODEL = "gemini-2.5-pro"; // modelo distinto al de emails (flash)
const HISTORY_KEY = "luna_history";
const HISTORY_DATE_KEY = "luna_history_date";

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
  type: "create_reservation" | "cancel_reservation" | "update_pax";
  label: string;
  payload: Record<string, any>;
}

// ─── HISTORIAL — limpia cada 24h ──────────────────────────────────────────────
const initialMessage: Message = {
  id: "0",
  role: "assistant",
  content:
    "¡Hola! Soy Luna, tu consultora IA. Puedo ayudarte a consultar, crear o gestionar reservas. ¿En qué te ayudo?",
};

function loadHistory(): Message[] {
  try {
    const savedDate = localStorage.getItem(HISTORY_DATE_KEY);
    const today = new Date().toDateString();
    if (savedDate !== today) {
      localStorage.removeItem(HISTORY_KEY);
      localStorage.setItem(HISTORY_DATE_KEY, today);
      return [initialMessage];
    }
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [initialMessage];
  } catch {
    return [initialMessage];
  }
}

function saveHistory(messages: Message[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
    localStorage.setItem(HISTORY_DATE_KEY, new Date().toDateString());
  } catch {}
}

// ─── CONTEXTO — carga todos los tours desde enero 2025 sin raw_email ─────────
async function loadContext(): Promise<string> {
  const { data: tours, error } = await supabase
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

  const { data: pines } = await supabase
    .from("pines")
    .select("title, content, category");

  if (error || !tours) return "No hay datos.";

  // Simplificamos los datos para que no gasten tantos tokens
  const datosSimplificados = tours.map((t) => ({
    id: t.id,
    tour: t.title,
    fecha: t.date,
    hora: t.time,
    pax_total_confirmado: t.reservations
      ?.filter((r) => r.status === "confirmed" || r.status === "active")
      .reduce((sum, r) => sum + (r.pax || 0), 0),
    reservas: t.reservations?.map((r) => ({
      nombre: r.contact_name,
      pax: r.pax,
      estado: r.status,
    })),
  }));

  // --- EL CAMBIO ESTÁ AQUÍ ---
  // Creamos un objeto que contenga AMBAS cosas
  const paqueteCompleto = {
    tours: datosSimplificados,
    pines_guardados: pines || [], // Si no hay pines, enviamos lista vacía
  };

  return JSON.stringify(paqueteCompleto, null, 2);
}

// ─── LLAMADA A GEMINI ─────────────────────────────────────────────────────────
async function callGemini(
  history: { role: "user" | "model"; parts: { text: string }[] }[],
  context: string,
): Promise<string> {
  const systemPrompt = `Eres "Luna", consultora analítica de Tu Guía en Brujas. 
Tu única fuente de verdad es el JSON adjunto. 

REGLAS CRÍTICAS DE CONTEO:
1. Para dar totales de personas, suma SOLO las reservas donde status sea 'confirmed' o 'active'. 
2. Si una reserva dice 'cancelled', 'missing' o 'denied', IGUALALA A CERO para el conteo de personas.
3. Si el usuario pregunta por "hoy", busca la fecha exacta: ${new Date().toISOString().split("T")[0]}.
4. NUNCA inventes nombres de guías. Si en el dato dice guide: null, di que no tiene guía asignado.
5. Si no ves datos para una fecha, di: "No tengo registros para ese día", no asumas tours habituales.

DATOS REALES DE SUPABASE(Incluye tours y pines_guardados):
${context}

CAPACIDADES:
- Consultar tours y reservas (histórico y futuro)
- Crear reservas: incluye al final <action>{"type":"create_reservation","label":"Crear reserva para X en tour Y","payload":{"tour_id":"...","contact_name":"...","phone":"...","adults":N,"children":N}}</action>
- Cancelar reservas: incluye al final <action>{"type":"cancel_reservation","label":"Cancelar reserva de X","payload":{"reservation_id":"..."}}</action>
- Modificar pax: incluye al final <action>{"type":"update_pax","label":"Actualizar pax de X a N","payload":{"reservation_id":"...","adults":N,"children":N,"pax":N}}</action>

REGLAS IMPORTANTES:
- Antes de ejecutar cualquier acción SIEMPRE pide confirmación con el bloque <action>
- Si el usuario pregunta por estadísticas, calcula con los datos que tienes
- Usa los IDs exactos de la base de datos para las acciones
- Si no encuentras un tour o reserva, dilo claramente
-Responde en texto plano con saltos de línea, no uses formato de lista Markdown (*).
- Tienes acceso a una lista de "Pines" (mensajes guardados). 
- Si el usuario te pide un mensaje para un cliente o un texto específico, búscalo en "pines_guardados".
- Cuando muestres un Pin, ponlo entre comillas y dile al usuario que puede copiarlo desde la sección de Mensajes.
- Ejemplo: "El mensaje de bienvenida que tenemos guardado es: '[Contenido del Pin]'"

METODOLOGÍA DE RESPUESTA:
- NO USES listas con asteriscos (*) ni guiones (-). 
- Usa saltos de línea dobles entre tours para que se vean separados.
- Estructura fija por tour:
  [Hora] - [Nombre del Tour]
  👥 [Total Pax] | 👤 [Guía]
- Usa negritas solo para los datos clave.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: history,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sin respuesta";
}

// ─── EJECUTAR ACCIÓN ──────────────────────────────────────────────────────────
async function executeAction(action: PendingAction): Promise<string> {
  const { type, payload } = action;

  if (type === "create_reservation") {
    const adults = Number(payload.adults) || 0;
    const children = Number(payload.children) || 0;
    const { error } = await supabase.from("reservations").insert({
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
    const { error } = await supabase
      .from("reservations")
      .delete()
      .eq("id", payload.reservation_id);
    if (error) throw new Error(error.message);
    return `✅ Reserva cancelada correctamente.`;
  }

  if (type === "update_pax") {
    const { error } = await supabase
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

  throw new Error("Acción desconocida");
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function Consultor() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [context, setContext] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognRef = useRef<any>(null);

  // ── Drag solo en móvil ──────────────────────────────────────────────────────
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
      Math.min(window.innerWidth - 56, dragPos.current.x + dx),
    );
    const newY = Math.max(
      0,
      Math.min(window.innerHeight - 56, dragPos.current.y + dy),
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
    saveHistory(messages);
  }, [messages]);

  // ── Cargar contexto al abrir ────────────────────────────────────────────────
  useEffect(() => {
    if (open && !context) {
      loadContext()
        .then(setContext)
        .catch(() => setContext("No se pudo cargar el contexto."));
    }
  }, [open]);

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
      // Construir historial para Gemini
      const history: { role: "user" | "model"; parts: { text: string }[] }[] =
        messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: (m.role === "user" ? "user" : "model") as "user" | "model",
            parts: [{ text: m.content }],
          }));
      history.push({ role: "user", parts: [{ text: content }] });

      const reply = await callGemini(history, context || "Cargando datos...");

      // Detectar si hay una acción pendiente
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
      // Recargar contexto tras cambio
      loadContext().then(setContext);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: result,
        },
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
          "fixed z-50 w-14 h-14 rounded-full shadow-xl",
          "bg-primary text-white flex items-center justify-center",
          "hover:scale-105 active:scale-95 transition-transform",
          // Desktop: fijo abajo derecha. Móvil: igual pero encima del MobileMenu
          "bottom-20 right-4 lg:bottom-6 lg:right-6",
          open ? "opacity-0 pointer-events-none" : "opacity-100",
        ].join(" ")}
        style={{ touchAction: "none" }}
        title="Consultor IA"
      >
        <Bot size={26} />
      </button>

      {/* ── Modal consultor ── */}
      {open && (
        <div
          className={[
            "fixed z-50 flex flex-col",
            "bg-base-100 border border-base-content/10 rounded-2xl shadow-2xl",
            // Desktop: fijo abajo derecha
            "lg:bottom-6 lg:right-6 lg:w-[380px]",
            // Móvil: casi pantalla completa
            "bottom-16 right-2 left-2 lg:left-auto",
            minimized ? "h-14" : "h-[520px] lg:h-[560px]",
            "transition-all duration-200 overflow-hidden",
          ].join(" ")}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-14 shrink-0 border-b border-base-content/10 bg-base-200 rounded-t-2xl">
            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Bot size={18} />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-bold leading-none text-base-content">
                Luna
              </span>
              <span className="text-[10px] opacity-40 mt-0.5">
                Consultor IA · Free Tours{" "}
              </span>
            </div>
            <button
              onClick={() => setMinimized(!minimized)}
              className="btn btn-ghost btn-circle btn-xs text-base-content/40 hover:text-base-content"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="btn btn-ghost btn-circle btn-xs text-base-content/40 hover:text-base-content"
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
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                        msg.role === "user"
                          ? "bg-primary text-white rounded-br-sm"
                          : "bg-base-200 text-base-content rounded-bl-sm",
                      ].join(" ")}
                    >
                      {msg.content}
                    </div>

                    {/* Botones de confirmación */}
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
                        className="animate-spin text-primary"
                      />
                      <span className="text-xs opacity-50">
                        Luna está pensando...
                      </span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

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
                  placeholder="Escribe o habla con Luna..."
                  className="flex-1 bg-base-200 text-base-content text-sm rounded-xl px-3 py-2 outline-none border border-base-content/5 focus:border-primary/30 placeholder:opacity-30 transition-colors"
                />

                <button
                  onClick={() => send()}
                  disabled={!input.trim() || loading}
                  className="btn btn-circle btn-sm bg-primary text-white border-none hover:opacity-90 disabled:opacity-30 shrink-0"
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
