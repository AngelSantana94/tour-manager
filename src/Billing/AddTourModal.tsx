import { useState } from "react";
import { X, Tag, Calendar, Clock } from "lucide-react";
import {
  ALL_PLATFORMS,
  addManualBillingEntry,
  type Platform,
} from "./UseBillingData";

const PLATFORM_LABELS: Record<string, string> = {
  guruwalk: "GuruWalk",
  freetour: "FreeTour",
  plaza: "Plaza",
  turixe: "Turixe",
  viator: "Viator",
  taro: "Taro",
  tripadvisor: "TripAdvisor",
};

const WEEK_INITIALS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getDaysInMonth(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { daysInMonth, startOffset: (firstDay + 6) % 7 };
}

function generateAllSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++)
    for (let m = 0; m < 60; m += 15) slots.push(`${pad(h)}:${pad(m)}`);
  return slots;
}
const ALL_SLOTS = generateAllSlots();
const COMMON_SLOTS = [
  "09:00",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

interface AddTourModalProps {
  guideId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddTourModal({
  guideId,
  onClose,
  onSaved,
}: AddTourModalProps) {
  const todayIso = todayStr();
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  // Solo mes actual y mes anterior — nada de mes siguiente.
  const minMonthIndex = currentYear * 12 + currentMonth - 1;
  const maxMonthIndex = currentYear * 12 + currentMonth;

  const [platform, setPlatform] = useState<Platform>("guruwalk");
  const [date, setDate] = useState(todayIso);
  const [time, setTime] = useState("11:30");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [calYear, setCalYear] = useState(() => parseInt(date.split("-")[0]));
  const [calMonth, setCalMonth] = useState(
    () => parseInt(date.split("-")[1]) - 1,
  );
  const calMonthIndex = calYear * 12 + calMonth;

  const { daysInMonth, startOffset } = getDaysInMonth(calYear, calMonth);
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const calMonthLabel = new Date(calYear, calMonth, 1).toLocaleString("es-ES", {
    month: "long",
    year: "numeric",
  });

  function calPrev() {
    if (calMonthIndex <= minMonthIndex) return;
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((v) => v - 1);
    } else setCalMonth((v) => v - 1);
  }
  function calNext() {
    if (calMonthIndex >= maxMonthIndex) return;
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((v) => v + 1);
    } else setCalMonth((v) => v + 1);
  }
  function selectDate(day: number) {
    const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;
    if (dateStr > todayIso) return; // sin fechas futuras
    setDate(dateStr);
    setShowDatePicker(false);
    setError(null);
  }

  async function handleSave() {
    setError(null);

    if (adults === 0 && children === 0) {
      setError("Introduce al menos 1 pax.");
      return;
    }

    setSaving(true);
    try {
      await addManualBillingEntry({
        guideId,
        date,
        time,
        platform,
        adults,
        children,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Error al guardar el tour.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-base-100 rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <h2 className="text-lg font-bold">Añadir tour</h2>
          <button onClick={onClose} className="btn btn-ghost btn-xs btn-square">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          {/* ── PLATAFORMA ── */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold opacity-60">
              <Tag size={14} /> Plataforma
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={[
                    "btn btn-xs rounded-full px-3 font-semibold border-none",
                    platform === p
                      ? "bg-base-content text-base-100"
                      : "bg-base-200 text-base-content/60 hover:bg-base-300",
                  ].join(" ")}
                >
                  {PLATFORM_LABELS[p] ?? p}
                </button>
              ))}
            </div>
          </div>

          {/* ── FECHA ── */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold opacity-60">
              <Calendar size={14} /> Fecha
            </label>
            <button
              onClick={() => {
                setShowDatePicker((v) => !v);
                setShowTimePicker(false);
              }}
              className={[
                "input input-bordered w-full text-sm flex items-center gap-2 text-left",
                showDatePicker ? "ring-2 ring-base-content/30" : "",
              ].join(" ")}
            >
              <Calendar size={15} className="opacity-40 shrink-0" />
              <span className="capitalize">{formatDateLabel(date)}</span>
            </button>

            {showDatePicker && (
              <div className="border border-base-content/10 rounded-xl p-3 bg-base-100 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={calPrev}
                    disabled={calMonthIndex <= minMonthIndex}
                    className="btn btn-ghost btn-xs btn-square disabled:opacity-20"
                  >
                    ‹
                  </button>
                  <span className="text-sm font-semibold capitalize">
                    {calMonthLabel}
                  </span>
                  <button
                    onClick={calNext}
                    disabled={calMonthIndex >= maxMonthIndex}
                    className="btn btn-ghost btn-xs btn-square disabled:opacity-20"
                  >
                    ›
                  </button>
                </div>
                <div className="grid grid-cols-7 mb-1">
                  {WEEK_INITIALS.map((d) => (
                    <div
                      key={d}
                      className="text-center text-[9px] font-bold uppercase opacity-30 py-1"
                    >
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-0.5">
                  {cells.map((day, i) => {
                    if (!day) return <div key={`e-${i}`} />;
                    const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;
                    const isSelected = dateStr === date;
                    const isFuture = dateStr > todayIso;
                    return (
                      <div key={dateStr} className="flex justify-center">
                        <button
                          onClick={() => selectDate(day)}
                          disabled={isFuture}
                          className={[
                            "w-8 h-8 rounded-lg text-xs font-semibold transition-all",
                            isSelected
                              ? "bg-base-content text-base-100 shadow-md"
                              : isFuture
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
              <Clock size={14} /> Hora
            </label>
            <button
              onClick={() => {
                setShowTimePicker((v) => !v);
                setShowDatePicker(false);
              }}
              className={[
                "input input-bordered w-full text-sm flex items-center gap-2 text-left",
                showTimePicker ? "ring-2 ring-base-content/30" : "",
              ].join(" ")}
            >
              <Clock size={15} className="opacity-40 shrink-0" />
              <span>{time}</span>
            </button>

            {showTimePicker && (
              <div className="border border-base-content/10 rounded-xl bg-base-100 shadow-md overflow-hidden">
                <div className="px-3 pt-3 pb-2">
                  <p className="text-xs font-bold opacity-40 uppercase tracking-widest mb-2">
                    Horarios comunes
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {COMMON_SLOTS.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => {
                          setTime(slot);
                          setShowTimePicker(false);
                        }}
                        className={[
                          "py-1.5 rounded-lg text-xs font-bold transition-all",
                          slot === time
                            ? "bg-base-content text-base-100"
                            : "bg-base-200 hover:bg-base-300 opacity-70",
                        ].join(" ")}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border-t border-base-content/5 mx-3" />
                <div className="px-3 pt-2 pb-1">
                  <p className="text-xs font-bold opacity-40 uppercase tracking-widest mb-2">
                    Todos los horarios
                  </p>
                </div>
                <div className="overflow-y-auto max-h-44 px-3 pb-3">
                  <div className="grid grid-cols-5 gap-1.5">
                    {ALL_SLOTS.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => {
                          setTime(slot);
                          setShowTimePicker(false);
                        }}
                        className={[
                          "py-1.5 rounded-lg text-xs font-bold transition-all",
                          slot === time
                            ? "bg-base-content text-base-100"
                            : "bg-base-200/60 hover:bg-base-300 opacity-70",
                        ].join(" ")}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── ADULTOS / NIÑOS (contador +/-) ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold opacity-60">Adultos</span>
              <div className="flex items-center gap-3 bg-base-200/50 rounded-xl px-3 py-2 justify-between">
                <button
                  type="button"
                  className="btn btn-circle btn-xs bg-base-100 shadow-sm disabled:opacity-30"
                  onClick={() => setAdults((n) => Math.max(0, n - 1))}
                  disabled={adults <= 0}
                >
                  −
                </button>
                <span className="font-bold text-base w-4 text-center">
                  {adults}
                </span>
                <button
                  type="button"
                  className="btn btn-circle btn-xs bg-base-100 shadow-sm"
                  onClick={() => setAdults((n) => n + 1)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold opacity-60">
                Niños (&lt;12)
              </span>
              <div className="flex items-center gap-3 bg-base-200/50 rounded-xl px-3 py-2 justify-between">
                <button
                  type="button"
                  className="btn btn-circle btn-xs bg-base-100 shadow-sm disabled:opacity-30"
                  onClick={() => setChildren((n) => Math.max(0, n - 1))}
                  disabled={children <= 0}
                >
                  −
                </button>
                <span className="font-bold text-base w-4 text-center">
                  {children}
                </span>
                <button
                  type="button"
                  className="btn btn-circle btn-xs bg-base-100 shadow-sm"
                  onClick={() => setChildren((n) => n + 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Error — sin color, solo tono neutro */}
          {error && (
            <div className="bg-base-200 border border-base-content/10 text-xs rounded-xl px-3 py-2 font-medium opacity-80">
              {error}
            </div>
          )}

          {/* Botones */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={onClose}
              className="btn btn-outline border-base-content/20"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn bg-base-content text-base-100 hover:bg-base-content/85 border-none disabled:opacity-40"
            >
              {saving ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                "Guardar tour"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
