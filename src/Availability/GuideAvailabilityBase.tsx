import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Info,
  HelpCircle,
} from "lucide-react";
import {
  fetchAvailabilityForRange,
  fetchGuideIdForCurrentUser,
  type AvailabilityStatus,
} from "./Services/Availability.adapter";
import AvailabilityPickerModal from "./AvailabilityPickerModal";

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
const DIAS = ["LU", "MA", "MI", "JU", "VI", "SÁ", "DO"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++)
    cells.push(new Date(year, month, d));
  return cells;
}

export default function GuideAvailabilityBase() {
  const today = useMemo(() => new Date(), []);
  const todayISO = toISODate(today);

  const [guideId, setGuideId] = useState<string | null>(null);
  const [loadingGuide, setLoadingGuide] = useState(true);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [availability, setAvailability] = useState<
    Record<string, AvailabilityStatus>
  >({});
  const [loading, setLoading] = useState(true);

  const [pickerMode, setPickerMode] = useState<AvailabilityStatus | null>(null);

  useEffect(() => {
    (async () => {
      const id = await fetchGuideIdForCurrentUser();
      setGuideId(id);
      setLoadingGuide(false);
    })();
  }, []);

  const loadMonth = useCallback(async () => {
    if (!guideId) return;
    setLoading(true);
    const start = new Date(viewYear, viewMonth, 1);
    const end = new Date(viewYear, viewMonth + 1, 0);
    const map = await fetchAvailabilityForRange(
      guideId,
      toISODate(start),
      toISODate(end),
    );
    setAvailability(map);
    setLoading(false);
  }, [guideId, viewYear, viewMonth]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

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

  // SCRIPT INTEGRADOR: Cálculo dinámico de totales del mes cargado
  const stats = useMemo(() => {
    let availableCount = 0;
    let blockedCount = 0;

    Object.values(availability).forEach((status) => {
      if (status === "available") availableCount++;
      if (status === "blocked") blockedCount++;
    });

    return { availableCount, blockedCount };
  }, [availability]);

  const cells = buildMonthGrid(viewYear, viewMonth);

  if (loadingGuide) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner text-[var(--primary)]" />
      </div>
    );
  }

  if (!guideId) {
    return (
      <div className="p-4 max-w-lg mx-auto text-center py-16 opacity-60">
        <p className="text-sm">
          No encontramos un perfil de guía vinculado a tu cuenta, así que no
          puedes enviar disponibilidad todavía.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-3 py-2 sm:py-4 flex flex-col gap-3 sm:gap-4 text-gray-800">
      {/* ── TÍTULO CON TOOLTIP ── */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
            Mi disponibilidad
          </h1>
          <div
            className="tooltip tooltip-right cursor-pointer"
            data-tip="Indica a la coordinación tus días de trabajo preferidos y bloquea aquellos en los que no estés disponible por vacaciones, descanso o compromisos personales."
          >
            <Info
              size={16}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Indica cuándo puedes aceptar visitas.
        </p>
      </div>

      {/* ── BOTONES PRINCIPALES DE ACCIÓN ── */}
      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto w-full">
        <button
          onClick={() => setPickerMode("available")}
          className="btn bg-[#00a86b] hover:bg-[#008f5b] text-white border-none rounded-xl text-xs font-medium h-10 min-h-0 flex items-center justify-center gap-2 shadow-sm"
        >
          <CalendarPlus size={16} />
          <span>Añadir disponibilidad</span>
        </button>

        <button
          onClick={() => setPickerMode("blocked")}
          className="btn bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-medium h-10 min-h-0 flex items-center justify-center gap-2 shadow-sm"
        >
          <CalendarX size={16} className="text-rose-500" />
          <span>Bloquear fechas</span>
        </button>
      </div>

      {/* ── BADGES DE CONTEO Y MENSAJE DE EDICIÓN CENTRADOS ── */}
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl mx-auto w-full text-xs">
        {/* Badge Disponible */}
        <div className="bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="font-medium text-gray-700">Disponible</span>
          <span className="text-gray-400">·</span>
          <span className="font-semibold text-gray-800">
            {stats.availableCount} días
          </span>
        </div>

        {/* Badge Bloqueado */}
        <div className="bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          <span className="font-medium text-gray-700">Bloqueado</span>
          <span className="text-gray-400">·</span>
          <span className="font-semibold text-gray-800">
            {stats.blockedCount} días
          </span>
        </div>

        {/* Indicación de interacción corregida */}
        <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm text-gray-500">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          <span>Usa los botones superiores para editar</span>
          <div
            className="tooltip tooltip-top sm:tooltip-left cursor-pointer"
            data-tip="Para añadir o bloquear fechas, haz clic en los botones superiores 'Añadir disponibilidad' o 'Bloquear fechas'."
          >
            <Info
              size={14}
              className="text-gray-400 hover:text-gray-600 ml-0.5"
            />
          </div>
        </div>
      </div>

      {/* ── CALENDARIO ── */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-3 sm:p-5 shadow-sm relative max-w-2xl mx-auto w-full">
        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] rounded-2xl flex items-center justify-center z-10">
            <span className="loading loading-spinner loading-sm text-[#00a86b]" />
          </div>
        )}

        {/* NAVEGACIÓN MES */}
        <div className="flex items-center justify-between mb-4 px-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="font-bold text-base text-gray-800 tracking-tight">
            {MESES[viewMonth]} {viewYear}
          </div>

          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* DIAS DE LA SEMANA */}
        <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase text-gray-400 mb-2">
          {DIAS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        {/* GRILLA DE DIAS */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {cells.map((date, i) => {
            if (!date) return <div key={`e-${i}`} className="h-9 sm:h-11" />;
            const iso = toISODate(date);
            const isToday = iso === todayISO;
            const status = availability[iso];

            return (
              <div
                key={iso}
                className={[
                  "h-9 sm:h-11 rounded-xl text-xs font-medium flex flex-col items-center justify-center transition-all cursor-pointer relative",
                  status === "available"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200/60 hover:bg-emerald-100"
                    : "",
                  status === "blocked"
                    ? "bg-rose-50 text-rose-800 border border-rose-200/60 hover:bg-rose-100"
                    : "",
                  !status
                    ? "bg-gray-50/70 text-gray-700 hover:bg-gray-100/80 border border-transparent"
                    : "",
                  isToday
                    ? "ring-2 ring-emerald-600 ring-offset-1 font-bold"
                    : "",
                ].join(" ")}
              >
                <span className="leading-none">{date.getDate()}</span>

                {/* Subetiqueta: oculta el texto en móvil (hidden) y solo lo muestra en tablets/portátiles (sm:inline) */}
                {status === "available" && (
                  <span className="text-[8px] text-emerald-700 font-semibold flex items-center gap-0.5 mt-0.5 scale-90">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="hidden sm:inline">Disponible</span>
                  </span>
                )}

                {status === "blocked" && (
                  <span className="text-[8px] text-rose-700 font-semibold flex items-center gap-0.5 mt-0.5 scale-90">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span className="hidden sm:inline">Bloqueado</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* LEYENDA DEL PIE */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-4 pt-3 border-t border-gray-100 justify-center text-[11px] text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />{" "}
            Disponible
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Bloqueado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> Sin marcar
          </span>
        </div>

        {/* ── BANNER EXPLICATIVO (FOOTER DE LA TARJETA) ── */}
        <div className="mt-4 p-3 bg-emerald-50/40 border border-emerald-100/80 rounded-xl flex items-center gap-3 text-xs text-gray-700">
          <div className="p-1.5 bg-emerald-600 text-white rounded-full shrink-0">
            <HelpCircle size={15} />
          </div>
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="font-semibold text-emerald-950">
              ¿Cómo funciona?
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-600">
              <span className="flex items-center gap-1">
                <b className="w-4 h-4 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-[9px]">
                  1
                </b>
                Haz clic en un día para editar su estado.
              </span>
              <span>›</span>
              <span className="flex items-center gap-1">
                <b className="w-4 h-4 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-[9px]">
                  2
                </b>
                Añade disponibilidad o bloquea fechas.
              </span>
              <span>›</span>
              <span className="flex items-center gap-1">
                <b className="w-4 h-4 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-[9px]">
                  3
                </b>
                Guarda los cambios.
              </span>
            </div>
          </div>
        </div>
      </div>

      {pickerMode && (
        <AvailabilityPickerModal
          guideId={guideId}
          mode={pickerMode}
          onClose={() => setPickerMode(null)}
          onSaved={loadMonth}
        />
      )}
    </div>
  );
}
