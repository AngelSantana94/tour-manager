import { useState, useEffect } from "react";
import { X, MapPin, Calendar, Clock, ChevronDown } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://hccxpmnraefgccowdwri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY3hwbW5yYWVmZ2Njb3dkd3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjAyNzQsImV4cCI6MjA4ODE5NjI3NH0.QwfoDxbMDXPrCmfGPLsKVzhfLpQBKBVmNwbNm_dIX1E"
);

// ─── TIPOS ───────────────────────────────────────────────────────────────────
export interface CalendarEvent {
  id:    string;
  tour:  string;
  date:  string;
  time:  string;
  meta?: {
    guide?:      string | null;
    language?:   string | null;
    platform?:   string | null;
    pax?:        number;
    reservations?: any[];
    tourGuides?:   any[];
    [key: string]: unknown;
  };
}

interface CreateEventModalProps {
  initialDate: string;
  events:      CalendarEvent[]; // para bloquear horarios ocupados
  onClose:     () => void;
  onSave:      (input: { title: string; date: string; time: string }) => Promise<void>;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, "0"); }

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function generateAllSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++)
    for (let m = 0; m < 60; m += 15)
      slots.push(`${pad(h)}:${pad(m)}`);
  return slots;
}

const ALL_SLOTS    = generateAllSlots();
const COMMON_SLOTS = ["09:00", "10:00", "10:30", "11:00", "11:30", "14:00", "15:00", "16:00", "17:00", "18:00"];

function getDaysInMonth(year: number, month: number) {
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { daysInMonth, startOffset: (firstDay + 6) % 7 };
}

const WEEK_INITIALS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];

// ─── COMPONENTE ──────────────────────────────────────────────────────────────
export default function CreateEventModal({ initialDate, events, onClose, onSave }: CreateEventModalProps) {
  const [tour,           setTour]           = useState("");
  const [tourInput,      setTourInput]      = useState(""); // texto libre
  const [useCustomTour,  setUseCustomTour]  = useState(false);
  const [date,           setDate]           = useState(initialDate);
  const [time,           setTime]           = useState("10:00");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  // Títulos existentes de tours
  const [existingTitles, setExistingTitles] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("tours").select("title");
      if (data) {
        const unique = [...new Set(data.map((t: any) => t.title as string))].sort();
        setExistingTitles(unique);
      }
    })();
  }, []);

  // Horarios ocupados en la fecha seleccionada
  const occupiedTimes = events
    .filter((e) => e.date === date)
    .map((e) => e.time.slice(0, 5));

  // Mini calendario
  const [calYear,  setCalYear]  = useState(() => parseInt(date.split("-")[0]));
  const [calMonth, setCalMonth] = useState(() => parseInt(date.split("-")[1]) - 1);
  const { daysInMonth, startOffset } = getDaysInMonth(calYear, calMonth);
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const calMonthLabel = new Date(calYear, calMonth, 1).toLocaleString("es-ES", { month: "long", year: "numeric" });

  function calPrev() {
    if (calMonth === 0) { setCalMonth(11); setCalYear((v) => v - 1); }
    else setCalMonth((v) => v - 1);
  }
  function calNext() {
    if (calMonth === 11) { setCalMonth(0); setCalYear((v) => v + 1); }
    else setCalMonth((v) => v + 1);
  }
  function selectDate(day: number) {
    setDate(`${calYear}-${pad(calMonth + 1)}-${pad(day)}`);
    setShowDatePicker(false);
    setError(null);
  }

  const finalTour = useCustomTour ? tourInput.trim() : tour;

  async function handleSave() {
    setError(null);
    if (!finalTour) { setError("Escribe o selecciona un nombre de tour."); return; }

    // Bloquear si el horario ya está ocupado
    if (occupiedTimes.includes(time)) {
      setError(`Ya existe un tour a las ${time} el ${formatDateLabel(date)}.`);
      return;
    }

    setSaving(true);
    try {
      await onSave({ title: finalTour, date, time });
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Error al crear el evento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-base-100 rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <h2 className="text-lg font-bold">Crear evento</h2>
          <button onClick={onClose} className="btn btn-ghost btn-xs btn-square"><X size={18} /></button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">

          {/* ── TOUR ── */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold opacity-60">
              <MapPin size={14} /> Tour
            </label>

            {!useCustomTour ? (
              <>
                <div className="relative">
                  <select
                    value={tour}
                    onChange={(e) => setTour(e.target.value)}
                    className="select select-bordered w-full text-sm appearance-none pr-8"
                  >
                    <option value="">Selecciona un tour existente...</option>
                    {existingTitles.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
                </div>
                <button
                  onClick={() => setUseCustomTour(true)}
                  className="text-xs opacity-40 hover:opacity-70 text-left underline underline-offset-2 w-fit"
                >
                  Escribir nombre personalizado
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Nombre del tour..."
                  value={tourInput}
                  onChange={(e) => setTourInput(e.target.value)}
                  className="input input-bordered w-full text-sm"
                  autoFocus
                />
                <button
                  onClick={() => { setUseCustomTour(false); setTourInput(""); }}
                  className="text-xs opacity-40 hover:opacity-70 text-left underline underline-offset-2 w-fit"
                >
                  Seleccionar de la lista
                </button>
              </>
            )}
          </div>

          {/* ── FECHA ── */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold opacity-60">
              <Calendar size={14} /> Fecha
            </label>
            <button
              onClick={() => { setShowDatePicker((v) => !v); setShowTimePicker(false); }}
              className={["input input-bordered w-full text-sm flex items-center gap-2 text-left",
                showDatePicker ? "ring-2 ring-base-content/30" : ""].join(" ")}
            >
              <Calendar size={15} className="opacity-40 shrink-0" />
              <span className="capitalize">{formatDateLabel(date)}</span>
            </button>

            {showDatePicker && (
              <div className="border border-base-content/10 rounded-xl p-3 bg-base-100 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={calPrev} className="btn btn-ghost btn-xs btn-square">‹</button>
                  <span className="text-sm font-semibold capitalize">{calMonthLabel}</span>
                  <button onClick={calNext} className="btn btn-ghost btn-xs btn-square">›</button>
                </div>
                <div className="grid grid-cols-7 mb-1">
                  {WEEK_INITIALS.map((d) => (
                    <div key={d} className="text-center text-[9px] font-bold uppercase opacity-30 py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-0.5">
                  {cells.map((day, i) => {
                    if (!day) return <div key={`e-${i}`} />;
                    const dateStr  = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;
                    const isSelected = dateStr === date;
                    const isPast     = dateStr < new Date().toISOString().split("T")[0];
                    return (
                      <div key={dateStr} className="flex justify-center">
                        <button
                          onClick={() => !isPast && selectDate(day)}
                          disabled={isPast}
                          className={[
                            "w-8 h-8 rounded-lg text-xs font-semibold transition-all",
                            isSelected
                              ? "bg-base-content text-base-100 shadow-md"
                              : isPast
                              ? "opacity-20 cursor-not-allowed"
                              : "hover:bg-base-content/5 opacity-70 hover:opacity-100",
                          ].join(" ")}
                        >
                          {day}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── HORA ── */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold opacity-60">
              <Clock size={14} /> Hora de inicio
            </label>
            <button
              onClick={() => { setShowTimePicker((v) => !v); setShowDatePicker(false); }}
              className={["input input-bordered w-full text-sm flex items-center gap-2 text-left",
                showTimePicker ? "ring-2 ring-base-content/30" : "",
                occupiedTimes.includes(time) ? "border-error" : "",
              ].join(" ")}
            >
              <Clock size={15} className="opacity-40 shrink-0" />
              <span>{time}</span>
              {occupiedTimes.includes(time) && (
                <span className="ml-auto text-[10px] text-error font-semibold">Ocupado</span>
              )}
            </button>

            {showTimePicker && (
              <div className="border border-base-content/10 rounded-xl bg-base-100 shadow-md overflow-hidden">
                <div className="px-3 pt-3 pb-2">
                  <p className="text-xs font-bold opacity-40 uppercase tracking-widest mb-2">Horarios comunes</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {COMMON_SLOTS.map((slot) => {
                      const occupied = occupiedTimes.includes(slot);
                      return (
                        <button
                          key={slot}
                          onClick={() => { if (!occupied) { setTime(slot); setShowTimePicker(false); setError(null); } }}
                          disabled={occupied}
                          title={occupied ? "Horario ocupado" : ""}
                          className={[
                            "py-1.5 rounded-lg text-xs font-bold transition-all relative",
                            occupied
                              ? "bg-error/10 text-error/50 cursor-not-allowed line-through"
                              : slot === time
                              ? "bg-base-content text-base-100"
                              : "bg-base-200 hover:bg-base-300 opacity-70",
                          ].join(" ")}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-base-content/5 mx-3" />

                <div className="px-3 pt-2 pb-1">
                  <p className="text-xs font-bold opacity-40 uppercase tracking-widest mb-2">Todos los horarios</p>
                </div>
                <div className="overflow-y-auto max-h-44 px-3 pb-3">
                  <div className="grid grid-cols-5 gap-1.5">
                    {ALL_SLOTS.map((slot) => {
                      const occupied = occupiedTimes.includes(slot);
                      return (
                        <button
                          key={slot}
                          onClick={() => { if (!occupied) { setTime(slot); setShowTimePicker(false); setError(null); } }}
                          disabled={occupied}
                          className={[
                            "py-1.5 rounded-lg text-xs font-bold transition-all",
                            occupied
                              ? "bg-error/10 text-error/50 cursor-not-allowed line-through"
                              : slot === time
                              ? "bg-base-content text-base-100"
                              : "bg-base-200/60 hover:bg-base-300 opacity-70",
                          ].join(" ")}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-error/10 border border-error/20 text-error text-xs rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          {/* Botones */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button onClick={onClose} className="btn btn-outline border-base-content/20">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!finalTour || saving}
              className="btn bg-base-content text-base-100 hover:bg-base-content/85 border-none disabled:opacity-40"
            >
              {saving ? <span className="loading loading-spinner loading-xs" /> : "Crear evento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}