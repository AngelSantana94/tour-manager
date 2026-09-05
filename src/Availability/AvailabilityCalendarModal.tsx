import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import {
  fetchScheduleAvailabilityMap,
  setScheduleClosedBulk,
  type ScheduleDayState,
  type TgbSchedule,
  type TgbTour,
} from "../Calendars/Services/SupabaseTGB.adapter";

interface AvailabilityCalendarModalProps {
  tour: TgbTour;
  flow: "remove" | "add"; // remove = quitar disponibilidad, add = reabrir
  schedules: TgbSchedule[]; // horarios seleccionados en el paso 1
  onClose: () => void;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // lunes = 0

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  return cells;
}

export default function AvailabilityCalendarModal({
  tour,
  flow,
  schedules,
  onClose,
}: AvailabilityCalendarModalProps) {
  const [visible, setVisible] = useState(false);
  const today = useMemo(() => new Date(), []);
  const todayISO = toISODate(today);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [map, setMap] = useState<Record<string, Record<string, ScheduleDayState>>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    setLoading(true);
    const start = new Date(viewYear, viewMonth, 1);
    const end = new Date(viewYear, viewMonth + 1, 0);
    fetchScheduleAvailabilityMap(schedules, toISODate(start), toISODate(end))
      .then(setMap)
      .finally(() => setLoading(false));
  }, [viewYear, viewMonth, schedules]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 220);
  }

  function dayState(dateISO: string): { hasDot: boolean; selectable: boolean } {
    const dayMap = map[dateISO];
    if (!dayMap) return { hasDot: false, selectable: false };
    const states = Object.values(dayMap);
    const hasDot = states.includes("open");
    const selectable =
      flow === "remove" ? states.includes("open") : states.includes("closed");
    return { hasDot, selectable };
  }

  function toggleDate(dateISO: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateISO)) next.delete(dateISO);
      else next.add(dateISO);
      return next;
    });
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      const pairs: { scheduleId: string; date: string }[] = [];
      for (const date of selectedDates) {
        const dayMap = map[date] ?? {};
        for (const schedule of schedules) {
          const state = dayMap[schedule.id];
          if (flow === "remove" && state === "open") {
            pairs.push({ scheduleId: schedule.id, date });
          } else if (flow === "add" && state === "closed") {
            pairs.push({ scheduleId: schedule.id, date });
          }
        }
      }
      await setScheduleClosedBulk(pairs, flow === "remove");
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  const cells = buildMonthGrid(viewYear, viewMonth);
  const scheduleLabel = schedules.map((s) => s.time.slice(0, 5)).join(", ");

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 md:p-4">
      <div
        className={[
          "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onClick={handleClose}
      />

      <div
        className={[
          "relative w-full h-full md:h-auto md:max-w-md bg-base-100 shadow-2xl flex flex-col",
          "md:rounded-2xl transform transition-all duration-300 ease-out",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-base-content/10 shrink-0">
          <button
            onClick={handleClose}
            className="btn btn-ghost btn-circle btn-sm"
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm truncate">{tour.name}</span>
            <span className="text-xs opacity-50">{scheduleLabel}</span>
          </div>
        </div>

        <div className="flex-1 md:flex-none overflow-y-auto p-5 flex flex-col gap-4">
          <p className="text-xs text-center opacity-60">
            {flow === "remove"
              ? "Toca los días disponibles que quieres cerrar."
              : "Toca los días cerrados que quieres volver a abrir."}
          </p>

          {/* Navegación de mes */}
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="btn btn-ghost btn-circle btn-sm">
              <ChevronLeft size={16} />
            </button>
            <span className="font-bold text-sm capitalize">
              {MESES[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} className="btn btn-ghost btn-circle btn-sm">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Días de la semana */}
          <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase opacity-40">
            {DIAS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* Grid del mes */}
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((date, i) => {
              if (!date) return <span key={`e-${i}`} />;
              const iso = toISODate(date);
              const isPast = iso < todayISO;
              const { hasDot, selectable } = dayState(iso);
              const isSelected = selectedDates.has(iso);
              const clickable = !isPast && !loading && selectable;

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!clickable}
                  onClick={() => toggleDate(iso)}
                  className={[
                    "relative aspect-square rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-colors",
                    isSelected
                      ? "bg-purple-200 text-purple-900"
                      : clickable
                        ? "hover:bg-base-200"
                        : "",
                    isPast || !selectable ? "opacity-25 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {date.getDate()}
                  {hasDot && (
                    <span className="w-1 h-1 rounded-full bg-purple-500 absolute bottom-1" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || selectedDates.size === 0}
            className="btn btn-neutral w-full mt-2 disabled:opacity-40"
          >
            {saving ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              `Confirmar (${selectedDates.size})`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}