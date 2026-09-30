import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import type { CalendarView } from "./CalendarView";
import AddTourMenu from "./AddTourMenu";
import { useAuth } from "../login/AuthContext";

interface CalendarHeaderProps {
  headerLabel: string;
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onRefetch?: () => void;

  selectedSource?: string;
  onSourceChange?: (v: string) => void;

  showEmptyTgb?: boolean;
  onShowEmptyTgbChange?: (v: boolean) => void;

  cities: string[];
  selectedCity: string;
  onCityChange: (v: string) => void;

  providers: string[];
  selectedProvider: string;
  onProviderChange: (v: string) => void;

  operators: string[];
  selectedOperator: string;
  onOperatorChange: (v: string) => void;
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
  selectedSource = "",
  onSourceChange,
  showEmptyTgb = false,
  onShowEmptyTgbChange,

  cities,
  selectedCity,
  onCityChange,

  providers,
  selectedProvider,
  onProviderChange,

  operators,
  selectedOperator,
  onOperatorChange,
}: CalendarHeaderProps) {
  const { isAdmin } = useAuth();

  return (
    <div className="w-full px-4 py-3 bg-base-100 border-b border-base-content/10 flex items-center justify-between gap-3 flex-nowrap overflow-x-auto">
      {/* BLOQUE IZQUIERDO: Navegación y Vistas */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onPrev}
          className="btn btn-outline btn-sm btn-square border-base-content/20"
          title="Anterior"
        >
          <ChevronLeft size={16} />
        </button>

        <span className="text-[15px] font-bold text-base-content/80 min-w-[150px] text-center select-none whitespace-nowrap">
          {headerLabel}
        </span>

        <button
          type="button"
          onClick={onNext}
          className="btn btn-outline btn-sm btn-square border-base-content/20"
          title="Siguiente"
        >
          <ChevronRight size={16} />
        </button>

        <button
          type="button"
          onClick={onToday}
          className="btn btn-outline btn-sm px-3 border-base-content/20 font-bold"
        >
          Hoy
        </button>

        {/* Toggle Semana / Día */}
        <div className="join border border-base-content/15 rounded-lg overflow-hidden ml-1">
          <button
            type="button"
            onClick={() => onViewChange("week")}
            className={[
              "btn btn-sm join-item border-none px-3 font-semibold transition-colors",
              view === "week"
                ? "bg-base-content text-base-100 hover:bg-base-content/85"
                : "bg-base-200/50 text-base-content/50 hover:bg-base-300",
            ].join(" ")}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => onViewChange("day")}
            className={[
              "btn btn-sm join-item border-none px-3 font-semibold transition-colors",
              view === "day"
                ? "bg-base-content text-base-100 hover:bg-base-content/85"
                : "bg-base-200/50 text-base-content/50 hover:bg-base-300",
            ].join(" ")}
          >
            Día
          </button>
        </div>
      </div>

      {/* BLOQUE DERECHO: Sin salto de fila (flex-nowrap) */}
      <div className="flex items-center gap-2 flex-nowrap shrink-0">
        {/* Solo visible para administradores */}
        {isAdmin && <AddTourMenu />}

        {/* FILTRO 1: CIUDAD */}
        <div className="relative flex items-center h-8 gap-1 px-2.5 border border-base-content/20 rounded-lg bg-base-100 hover:bg-base-200 transition-colors select-none shrink-0">
          <span className="text-xs opacity-50 font-medium whitespace-nowrap">
            Ciudad:
          </span>
          <select
            value={selectedCity}
            onChange={(e) => onCityChange(e.target.value)}
            className="text-xs font-bold bg-transparent outline-none cursor-pointer appearance-none pr-4 text-base-content max-w-[110px] truncate"
          >
            <option value="">Todas</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="absolute right-1.5 opacity-40 pointer-events-none"
          />
        </div>

        {/* FILTRO 2: PROVEEDOR */}
        <div className="relative flex items-center h-8 gap-1 px-2.5 border border-base-content/20 rounded-lg bg-base-100 hover:bg-base-200 transition-colors select-none shrink-0">
          <span className="text-xs opacity-50 font-medium whitespace-nowrap">
            Proveedor:
          </span>
          <select
            value={selectedProvider}
            onChange={(e) => onProviderChange(e.target.value)}
            className="text-xs font-bold bg-transparent outline-none cursor-pointer appearance-none pr-4 text-base-content max-w-[110px] truncate"
          >
            <option value="">Todos</option>
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="absolute right-1.5 opacity-40 pointer-events-none"
          />
        </div>

        {/* FILTRO 3: OPERADOR */}
        <div className="relative flex items-center h-8 gap-1 px-2.5 border border-base-content/20 rounded-lg bg-base-100 hover:bg-base-200 transition-colors select-none shrink-0">
          <span className="text-xs opacity-50 font-medium whitespace-nowrap">
            Operador:
          </span>
          <select
            value={selectedOperator}
            onChange={(e) => onOperatorChange(e.target.value)}
            className="text-xs font-bold bg-transparent outline-none cursor-pointer appearance-none pr-4 text-base-content max-w-[110px] truncate"
          >
            <option value="">Todos</option>
            {operators.map((operator) => (
              <option key={operator} value={operator}>
                {operator}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="absolute right-1.5 opacity-40 pointer-events-none"
          />
        </div>

        {/* FILTRO EXTRA: FUENTE */}
        {onSourceChange && (
          <div className="relative flex items-center h-8 gap-1 px-2.5 border border-base-content/20 rounded-lg bg-base-100 hover:bg-base-200 transition-colors select-none shrink-0">
            <span className="text-xs opacity-50 font-medium whitespace-nowrap">
              Fuente:
            </span>
            <select
              value={selectedSource}
              onChange={(e) => onSourceChange(e.target.value)}
              className="text-xs font-bold bg-transparent outline-none cursor-pointer appearance-none pr-4 text-base-content max-w-[100px] truncate"
            >
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value || "all"} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-1.5 opacity-40 pointer-events-none"
            />
          </div>
        )}

        {/* TOGGLE EXTRA: TGB VACÍOS */}
        {onShowEmptyTgbChange && (
          <label className="flex items-center h-8 gap-1.5 px-2.5 border border-base-content/20 rounded-lg bg-base-100 hover:bg-base-200 transition-colors cursor-pointer select-none text-xs font-medium shrink-0 whitespace-nowrap">
            <input
              type="checkbox"
              className="toggle toggle-xs"
              checked={showEmptyTgb}
              onChange={(e) => onShowEmptyTgbChange(e.target.checked)}
            />
            <span>TGB Vacíos</span>
          </label>
        )}
      </div>
    </div>
  );
}
