import { ChevronLeft, ChevronRight, ChevronDown, FileSpreadsheet } from "lucide-react";
import type { CalendarView } from "./CalendarView";
import AddTourMenu from "./AddTourMenu";

interface CalendarHeaderProps {
  headerLabel: string;
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onUploadDocument: () => void;
  onRefetch?: () => void;

  // Opcionales para evitar errores de TypeScript en vistas simplificadas
  selectedSource?: string;
  onSourceChange?: (v: string) => void;

  showEmptyTgb?: boolean;
  onShowEmptyTgbChange?: (v: boolean) => void;

  guides: string[];
  selectedGuide: string;
  onGuideChange: (v: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  "": "Todas",
  external: "Plataformas externas",
  tgb: "Tu Guía en Brujas",
};

export default function CalendarHeader({
  headerLabel,
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onUploadDocument,
  selectedSource = "",
  onSourceChange,
  showEmptyTgb = false,
  onShowEmptyTgbChange,
  guides,
  selectedGuide,
  onGuideChange,
}: CalendarHeaderProps) {
  return (
    <div className="w-full px-4 py-3 bg-base-100 border-b border-base-content/10 flex items-center justify-between gap-4 flex-wrap">
      {/* ── IZQUIERDA: fecha + navegación ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onPrev}
          className="btn btn-outline btn-sm btn-square border-base-content/20"
          aria-label="Anterior"
        >
          <ChevronLeft size={16} />
        </button>

        <span className="text-[15px] font-bold text-base-content/80 min-w-[160px] text-center select-none">
          {headerLabel}
        </span>

        <button
          onClick={onNext}
          className="btn btn-outline btn-sm btn-square border-base-content/20"
          aria-label="Siguiente"
        >
          <ChevronRight size={16} />
        </button>

        <button
          onClick={onToday}
          className="btn btn-outline btn-sm px-5 border-base-content/20 font-bold"
        >
          Hoy
        </button>

        {/* Toggle Semana / Día */}
        <div className="join border border-base-content/15 rounded-lg overflow-hidden">
          <button
            onClick={() => onViewChange("week")}
            className={[
              "btn btn-sm join-item border-none px-5 font-semibold transition-colors",
              view === "week"
                ? "bg-base-content text-base-100 hover:bg-base-content/85"
                : "bg-base-200/50 text-base-content/50 hover:bg-base-300",
            ].join(" ")}
          >
            Semana
          </button>
          <button
            onClick={() => onViewChange("day")}
            className={[
              "btn btn-sm join-item border-none px-5 font-semibold transition-colors",
              view === "day"
                ? "bg-base-content text-base-100 hover:bg-base-content/85"
                : "bg-base-200/50 text-base-content/50 hover:bg-base-300",
            ].join(" ")}
          >
            Día
          </button>
        </div>
      </div>

      {/* ── DERECHA: acciones y filtros ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Añadir tour — desplegable (de momento solo "Cargar documento") */}
        <AddTourMenu
          options={[
            {
              label: "Cargar documento",
              icon: <FileSpreadsheet size={15} />,
              onClick: onUploadDocument,
            },
          ]}
        />

        {/* Fuente */}
        {onSourceChange && (
          <div className="relative flex items-center gap-1.5 px-3 py-1.5 border border-base-content/20 rounded-lg bg-base-100 hover:bg-base-200 transition-colors select-none">
            <span className="text-sm opacity-50">Fuente:</span>
            <select
              value={selectedSource}
              onChange={(e) => onSourceChange(e.target.value)}
              className="text-sm font-bold bg-transparent outline-none cursor-pointer appearance-none pr-4 text-base-content"
            >
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value || "all"} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="absolute right-2 opacity-40 pointer-events-none"
            />
          </div>
        )}

        {/* Toggle: mostrar horarios sin reservas */}
        {onShowEmptyTgbChange && (
          <label className="flex items-center gap-2 px-3 py-1.5 border border-base-content/20 rounded-lg bg-base-100 hover:bg-base-200 transition-colors cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showEmptyTgb}
              onChange={(e) => onShowEmptyTgbChange(e.target.checked)}
              className="toggle toggle-sm"
            />
            <span className="text-sm font-semibold">
              Mostrar horarios sin reservas
            </span>
          </label>
        )}

        {/* Filtro Guía */}
        {guides.length > 0 && (
          <div className="relative flex items-center gap-1.5 px-3 py-1.5 border border-base-content/20 rounded-lg bg-base-100 hover:bg-base-200 transition-colors select-none">
            <span className="text-sm opacity-50">Guía:</span>
            <select
              value={selectedGuide}
              onChange={(e) => onGuideChange(e.target.value)}
              className="text-sm font-bold bg-transparent outline-none cursor-pointer appearance-none pr-4 text-base-content"
            >
              <option value="">Todos</option>
              {guides.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="absolute right-2 opacity-40 pointer-events-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}