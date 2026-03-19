import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import type { CalendarEvent } from "./CreateEventModal";

interface MobileHeaderProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
  /** Mapa de eventos agrupados por fecha — viene de CalendarView */
  eventsByDate?: Record<string, CalendarEvent[]>;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function getWeekDates(anchorStr: string): string[] {
  const [y, m, d] = anchorStr.split("-").map(Number);
  const anchor = new Date(y, m - 1, d);
  const dow = anchor.getDay();
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  });
}

function getDaysInMonth(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;
  return { daysInMonth, startOffset };
}

const DAY_LABELS_SHORT = ["lun.", "mar.", "mié.", "jue.", "vie.", "sáb.", "dom."];
const WEEK_INITIALS = ["L", "M", "X", "J", "V", "S", "D"];

export default function MobileHeader({
  selectedDate,
  onSelectDate,
  onPrev,
  onNext,
  eventsByDate = {},
}: MobileHeaderProps) {
  const todayStr = getTodayStr();
  const weekDates = getWeekDates(selectedDate);
  const [calOpen, setCalOpen] = useState(false);

  const [y, m] = selectedDate.split("-").map(Number);
  const [dropYear, setDropYear] = useState(y);
  const [dropMonth, setDropMonth] = useState(m - 1);

  // Punto verde si hay eventos ese día, nada si no
  function getStatus(date: string): "has-events" | null {
    return eventsByDate[date]?.length > 0 ? "has-events" : null;
  }

  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });

  // Navegación del dropdown
  function dropPrev() {
    if (dropMonth === 0) { setDropMonth(11); setDropYear((v) => v - 1); }
    else setDropMonth((v) => v - 1);
  }

  function dropNext() {
    if (dropMonth === 11) { setDropMonth(0); setDropYear((v) => v + 1); }
    else setDropMonth((v) => v + 1);
  }

  // Click en día del dropdown → selecciona y cierra
  function handleDropSelect(date: string) {
    onSelectDate(date);
    setCalOpen(false);
  }

  // Celdas del mes en dropdown
  const { daysInMonth, startOffset } = getDaysInMonth(dropYear, dropMonth);
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const dropMonthLabel = new Date(dropYear, dropMonth, 1).toLocaleString("es-ES", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-base-100 border-b border-base-content/10 relative">

      {/* ── Fila 1: mes clickable + flechas de semana ── */}
      <div className="flex items-center justify-between px-4 py-2">

        {/* Fecha con flecha dropdown */}
        <button
          onClick={() => setCalOpen((v) => !v)}
          className="flex items-center gap-1.5 font-bold text-base capitalize opacity-80 hover:opacity-100 transition-opacity"
        >
          {monthLabel}
          {calOpen
            ? <ChevronUp size={16} className="opacity-50" />
            : <ChevronDown size={16} className="opacity-50" />
          }
        </button>

        {/* Flechas semana */}
        <div className="flex items-center gap-1">
          <button onClick={onPrev} className="btn btn-ghost btn-xs btn-square" aria-label="Anterior">
            <ChevronLeft size={18} />
          </button>
          <button onClick={onNext} className="btn btn-ghost btn-xs btn-square" aria-label="Siguiente">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ── Fila 2: pills de días ── */}
      <div className="grid grid-cols-7 px-2 pb-3 gap-1">
        {weekDates.map((date, i) => {
          const dayNum = parseInt(date.split("-")[2]);
          const isToday = date === todayStr;
          const isSelected = date === selectedDate;
          const status = getStatus(date);

          return (
            <button
              key={date}
              onClick={() => onSelectDate(date)}
              className={[
                "flex flex-col items-center justify-center rounded-xl py-1.5 gap-0.5 transition-all",
                isSelected
                  ? "bg-teal-700 text-white shadow-md"
                  : isToday
                  ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                  : "hover:bg-base-content/5 opacity-70",
              ].join(" ")}
            >
              <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">
                {DAY_LABELS_SHORT[i]}
              </span>
              <span className="text-sm font-black leading-none">{dayNum}</span>
              <span className="h-[6px] flex items-center justify-center">
                {status === "has-events" && (
                  <span className={["w-1.5 h-1.5 rounded-full block", isSelected ? "bg-white/70" : "bg-success"].join(" ")} />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── DROPDOWN: flujo normal, empuja el BoardDay hacia abajo ── */}
      {calOpen && (
        <div className="bg-base-100 border-b border-base-content/10 px-4 py-3">

          {/* Cabecera del mes en dropdown */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={dropPrev} className="btn btn-ghost btn-xs btn-square">
              <ChevronLeft size={16} />
            </button>
            <span className="text-[12px] font-semibold capitalize opacity-70">
              {dropMonthLabel}
            </span>
            <button onClick={dropNext} className="btn btn-ghost btn-xs btn-square">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Iniciales días */}
          <div className="grid grid-cols-7 mb-1">
            {WEEK_INITIALS.map((d) => (
              <div key={d} className="text-center text-[9px] font-bold uppercase opacity-30 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Celdas */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />;

              const dateStr = `${dropYear}-${pad(dropMonth + 1)}-${pad(day)}`;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const status = getStatus(dateStr);

              return (
                <div key={dateStr} className="flex justify-center">
                  <button
                    onClick={() => handleDropSelect(dateStr)}
                    className={[
                      "w-8 h-8 rounded-lg text-[11px] font-semibold flex flex-col items-center justify-center transition-all duration-150",
                      isSelected
                        ? "bg-primary text-primary-content shadow-md scale-105"
                        : isToday
                        ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                        : "hover:bg-base-content/5 opacity-70 hover:opacity-100",
                    ].join(" ")}
                  >
                    <span className="leading-none">{day}</span>
                    <span className="h-[5px] flex items-center justify-center">
                      {status === "has-events" && <span className="w-1 h-1 rounded-full bg-success block" />}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}