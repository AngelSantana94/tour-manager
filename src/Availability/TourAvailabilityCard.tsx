import { useState } from "react";
import { CalendarX, CalendarPlus, X } from "lucide-react";
import {
  fetchSchedulesForTour,
  type TgbSchedule,
  type TgbTour,
} from "../Calendars/Services/SupabaseTGB.adapter";
import AvailabilityCalendarModal from "./AvailabilityCalendarModal";

interface TourAvailabilityCardProps {
  tour: TgbTour;
}

export default function TourAvailabilityCard({
  tour,
}: TourAvailabilityCardProps) {
  const [flow, setFlow] = useState<"remove" | "add" | null>(null);
  const [schedules, setSchedules] = useState<TgbSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [calendarOpen, setCalendarOpen] = useState(false);

  async function openPanel(nextFlow: "remove" | "add") {
    setFlow(nextFlow);
    setSelectedIds(new Set());
    setLoadingSchedules(true);
    try {
      const data = await fetchSchedulesForTour(tour.id);
      setSchedules(data);
    } finally {
      setLoadingSchedules(false);
    }
  }

  function closePanel() {
    setFlow(null);
    setSchedules([]);
    setSelectedIds(new Set());
  }

  function toggleSchedule(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleConfirmSchedules() {
    setCalendarOpen(true);
  }

  const selectedSchedules = schedules.filter((s) => selectedIds.has(s.id));

  return (
    <div className="relative rounded-2xl overflow-hidden border border-base-content/10 aspect-[4/5] shadow-sm group">
      <img
        src={tour.image_url ?? ""}
        alt={tour.name}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

      <div className="relative h-full flex flex-col justify-end p-4 gap-3">
        <h3 className="text-white font-black text-lg leading-tight drop-shadow">
          {tour.name}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => openPanel("remove")}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all cursor-pointer active:scale-[0.98] bg-slate-900 text-white border-slate-900 hover:bg-white hover:text-slate-900 dark:bg-white dark:text-slate-900 dark:border-white dark:hover:bg-slate-900 dark:hover:text-white"
          >
            <CalendarX size={14} /> Quitar disponibilidad
          </button>

          <button
            onClick={() => openPanel("add")}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all cursor-pointer active:scale-[0.98] bg-slate-900 text-white border-slate-900 hover:bg-white hover:text-slate-900 dark:bg-white dark:text-slate-900 dark:border-white dark:hover:bg-slate-900 dark:hover:text-white"
          >
            <CalendarPlus size={14} /> Agregar disponibilidad
          </button>
        </div>
      </div>

      {/* Panel de horarios — ocupa ~40% de la tarjeta, se abre dentro de ella */}
      {flow && (
        <>
          <div
            className="absolute inset-0 bg-black/40 z-10"
            onClick={closePanel}
          />
          <div className="absolute inset-x-0 bottom-0 z-20 bg-base-100 rounded-t-2xl shadow-2xl flex flex-col min-h-[50vh] max-h-[85vh] h-auto transition-all">
            <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/10 shrink-0">
              <span className="text-sm font-bold">
                {flow === "remove"
                  ? "Quitar disponibilidad"
                  : "Agregar disponibilidad"}
              </span>
              <button
                onClick={closePanel}
                className="btn btn-ghost btn-circle btn-xs"
                aria-label="Cerrar"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1.5">
              {loadingSchedules ? (
                <div className="flex-1 flex items-center justify-center py-6">
                  <span className="loading loading-spinner loading-sm" />
                </div>
              ) : schedules.length === 0 ? (
                <p className="text-xs opacity-50 text-center py-4">
                  Este tour no tiene horarios activos.
                </p>
              ) : (
                schedules.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2.5 py-2 px-2 hover:bg-base-200/50 rounded-lg cursor-pointer text-sm transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleSchedule(s.id)}
                      className="checkbox checkbox-sm"
                    />
                    <span className="font-medium">{s.time.slice(0, 5)} hs</span>
                  </label>
                ))
              )}
            </div>

            <div className="p-3 border-t border-base-content/10 shrink-0 bg-base-100">
              <button
                onClick={handleConfirmSchedules}
                disabled={selectedIds.size === 0}
                className="btn btn-neutral btn-sm w-full disabled:opacity-40"
              >
                Confirmar
              </button>
            </div>
          </div>
        </>
      )}

      {calendarOpen && flow && (
        <AvailabilityCalendarModal
          tour={tour}
          flow={flow}
          schedules={selectedSchedules}
          onClose={() => {
            setCalendarOpen(false);
            closePanel();
          }}
        />
      )}
    </div>
  );
}
