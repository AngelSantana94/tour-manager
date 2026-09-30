import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  CalendarX,
} from "lucide-react";
import {
  setAvailabilityDays,
  type AvailabilityStatus,
  type AvailabilityShift,
} from "./Services/Availability.adapter";

interface AvailabilityPickerModalProps {
  guideId: string;
  mode: AvailabilityStatus; // "available" | "blocked"
  onClose: () => void;
  onSaved: () => void;
}

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
  for (let d = 1; d <= lastDay.getDate(); d++)
    cells.push(new Date(year, month, d));
  return cells;
}

export default function AvailabilityPickerModal({
  guideId,
  mode,
  onClose,
  onSaved,
}: AvailabilityPickerModalProps) {
  const [visible, setVisible] = useState(false);
  const today = useMemo(() => new Date(), []);
  const todayISO = toISODate(today);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [selectedShift, setSelectedShift] = useState<AvailabilityShift>("FULL");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 220);
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
    if (selectedDates.size === 0) return;
    setSaving(true);
    try {
      await setAvailabilityDays(
        guideId,
        [...selectedDates],
        mode,
        selectedShift,
      );
      onSaved();
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  const cells = buildMonthGrid(viewYear, viewMonth);
  const isAvailable = mode === "available";

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
        <div className="flex items-center gap-3 px-5 py-4 border-b border-base-content/10 shrink-0">
          <button
            onClick={handleClose}
            className="btn btn-ghost btn-circle btn-sm"
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            {isAvailable ? (
              <CalendarCheck size={18} className="text-emerald-600" />
            ) : (
              <CalendarX size={18} className="text-error" />
            )}
            <span className="font-bold text-sm">
              {isAvailable
                ? "Añadir disponibilidad"
                : "Bloquear disponibilidad"}
            </span>
          </div>
        </div>

        <div className="flex-1 md:flex-none overflow-y-auto p-5 flex flex-col gap-4">
          <p className="text-xs text-center opacity-60">
            Toca los días que{" "}
            {isAvailable
              ? "puedes trabajar"
              : "quieres bloquear (vacaciones, etc.)"}
            . Puedes elegir varios días sueltos.
          </p>

          {isAvailable && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-700">
                Selecciona turno:
              </span>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedShift("AM")}
                  className={[
                    "h-10 rounded-full border text-xs font-semibold transition-all",
                    selectedShift === "AM"
                      ? "bg-teal-500 text-white border-teal-500 shadow-sm"
                      : "bg-white text-teal-700 border-teal-300 hover:bg-teal-50",
                  ].join(" ")}
                >
                  Mañana (AM)
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedShift("PM")}
                  className={[
                    "h-10 rounded-full border text-xs font-semibold transition-all",
                    selectedShift === "PM"
                      ? "bg-teal-500 text-white border-teal-500 shadow-sm"
                      : "bg-white text-teal-700 border-teal-300 hover:bg-teal-50",
                  ].join(" ")}
                >
                  Tarde (PM)
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedShift("FULL")}
                  className={[
                    "h-10 rounded-full border text-xs font-semibold transition-all",
                    selectedShift === "FULL"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50",
                  ].join(" ")}
                >
                  Día completo
                </button>
              </div>

              <p className="text-[10px] text-center text-gray-400">
                El turno seleccionado se aplicará a todos los días que marques.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={prevMonth}
              className="btn btn-ghost btn-circle btn-sm"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-bold text-sm capitalize">
              {MESES[viewMonth]} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              className="btn btn-ghost btn-circle btn-sm"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase opacity-40">
            {DIAS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((date, i) => {
              if (!date) return <span key={`e-${i}`} />;
              const iso = toISODate(date);
              const isPast = iso < todayISO;
              const isSelected = selectedDates.has(iso);
              const clickable = !isPast;

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!clickable}
                  onClick={() => toggleDate(iso)}
                  className={[
                    "aspect-square rounded-lg text-xs font-semibold flex items-center justify-center transition-colors",
                    isSelected
                      ? isAvailable
                        ? "bg-emerald-500 text-white"
                        : "bg-error text-white"
                      : clickable
                        ? "hover:bg-base-200"
                        : "",
                    isPast ? "opacity-25 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || selectedDates.size === 0}
            className={[
              "btn w-full mt-2 disabled:opacity-40 text-white border-none",
              isAvailable
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-error hover:bg-error/90",
            ].join(" ")}
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
