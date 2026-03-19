import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEvent } from "./CreateEventModal";

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

interface BoardMonthProps {
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
  eventsByDate?: Record<string, CalendarEvent[]>;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

function getTodayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

interface Cell {
  dateStr: string;
  day:     number;
  filler:  boolean; // true = día de mes anterior o siguiente
}

function buildCells(year: number, month: number): Cell[] {
  const firstDow    = new Date(year, month, 1).getDay();
  const startOffset = (firstDow + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Mes anterior
  const prevYear  = month === 0  ? year - 1 : year;
  const prevMonth = month === 0  ? 11       : month - 1;
  const daysInPrev = new Date(prevYear, prevMonth + 1, 0).getDate();

  // Mes siguiente
  const nextYear  = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0        : month + 1;

  const cells: Cell[] = [];

  // Relleno inicio — días del mes anterior
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    cells.push({ dateStr: `${prevYear}-${pad(prevMonth + 1)}-${pad(d)}`, day: d, filler: true });
  }

  // Días del mes actual
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: `${year}-${pad(month + 1)}-${pad(d)}`, day: d, filler: false });
  }

  // Relleno final — días del mes siguiente
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ dateStr: `${nextYear}-${pad(nextMonth + 1)}-${pad(nextDay)}`, day: nextDay, filler: true });
    nextDay++;
  }

  return cells;
}

export default function BoardMonth({
  selectedDate,
  onSelectDate,
  eventsByDate = {},
}: BoardMonthProps) {
  const todayStr  = getTodayStr();
  const todayDate = new Date(todayStr + "T00:00:00");

  const [viewYear,  setViewYear]  = useState(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());

  const activeDate = selectedDate ?? todayStr;

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  const cells    = buildCells(viewYear, viewMonth);
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString("es-ES", {
    month: "long", year: "numeric",
  });

  return (
    <div className="p-4 flex flex-col items-center gap-4 w-full">
      <div className="bg-base-100 w-full max-w-[260px] rounded-2xl p-3 border border-base-content/10 shadow-sm">

        {/* Cabecera navegación */}
        <div className="flex items-center justify-between px-1 mb-3">
          <button onClick={prevMonth} className="btn btn-ghost btn-xs btn-square" aria-label="Mes anterior">
            <ChevronLeft size={18} strokeWidth={2.5} className="opacity-70" />
          </button>
          <span className="text-[11px] font-semibold capitalize opacity-70">{monthName}</span>
          <button onClick={nextMonth} className="btn btn-ghost btn-xs btn-square" aria-label="Mes siguiente">
            <ChevronRight size={18} strokeWidth={2.5} className="opacity-70" />
          </button>
        </div>

        {/* Días de la semana */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-[9px] font-bold uppercase opacity-30 py-1">{d}</div>
          ))}
        </div>

        {/* Celdas */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((cell) => {
            const isToday    = cell.dateStr === todayStr;
            const isSelected = cell.dateStr === activeDate;
            const hasEvents  = (eventsByDate[cell.dateStr]?.length ?? 0) > 0;

            return (
              <div key={cell.dateStr} className="flex justify-center">
                <button
                  onClick={() => onSelectDate?.(cell.dateStr)}
                  aria-label={cell.dateStr}
                  aria-pressed={isSelected}
                  className={[
                    "relative w-7 h-7 rounded-lg text-[11px] font-semibold flex flex-col items-center justify-center transition-all duration-150",
                    cell.filler
                      ? "opacity-25 hover:opacity-40"
                      : isSelected
                      ? "bg-primary text-primary-content shadow-md scale-105"
                      : isToday
                      ? "bg-primary/10 text-primary font-bold ring-1 ring-primary/30"
                      : "hover:bg-base-content/5 opacity-70 hover:opacity-100",
                  ].join(" ")}
                >
                  <span className="leading-none mt-1">{cell.day}</span>
                  <span className="h-[5px] flex items-center justify-center mb-0.5">
                    {hasEvents && !cell.filler && (
                      <span className="w-1 h-1 rounded-full bg-success block" />
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}