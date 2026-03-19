import type { CalendarEvent } from "./CreateEventModal";
import spainFlag from '../assets/lenguage-logos/spainFlag.png'

interface BoardWeekProps {
  selectedDate: string;
  events: CalendarEvent[];
  onCreateEvent: () => void;
  onSelectEvent: (eventId: string) => void;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

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

const DAY_LABELS = ["lun.", "mar.", "mié.", "jue.", "vie.", "sáb.", "dom."];

// ─── TARJETA EVENTO — agrupada por hora ──────────────────────────────────────
function EventCard({ events, isPast, onSelect }: {
  events:   CalendarEvent[];   // todos los eventos de esa hora/día
  isPast:   boolean;
  onSelect: () => void;
}) {
  const first      = events[0];
  const totalPax   = events.reduce((acc, e) => acc + ((e.meta?.pax as number) ?? 0), 0);
  const reservations = events.flatMap((e) => (e.meta?.reservations as any[]) ?? []);
  const allAttended  = isPast && reservations.length > 0 &&
    reservations.filter((r) => r.status !== "cancelled").every((r) => r.attended);

  const cardClass = allAttended
    ? "bg-base-300/60 text-base-content/40"
    : isPast
    ? "bg-teal-700/50 text-white hover:bg-teal-700/60"
    : "bg-teal-700 text-white hover:bg-teal-600";

  return (
    <button
      onClick={onSelect}
      className={[
        "rounded-lg px-2 py-1.5 w-full max-w-full overflow-hidden flex flex-col gap-1",
        "active:scale-[0.98] transition-all text-left",
        cardClass,
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-1 w-full">
        <div className="flex items-center gap-1 min-w-0">
          <img
            src={spainFlag}
            alt="ES"
            className="w-4 h-4 rounded-full shrink-0 object-cover"
          />
          <span className="text-[10px] font-bold leading-tight shrink-0">{first.time}</span>
        </div>
        <span className={["text-[9px] font-semibold shrink-0", allAttended ? "opacity-40" : "opacity-90"].join(" ")}>
          pax: {totalPax}
        </span>
      </div>
      <span className={["text-[9px] truncate w-full block leading-tight", allAttended ? "opacity-40" : "opacity-75"].join(" ")}>
        {first.tour}
      </span>
    </button>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function BoardWeek({ selectedDate, events, onSelectEvent }: BoardWeekProps) {
  const todayStr   = getTodayStr();
  const weekDates  = getWeekDates(selectedDate);
  const weekEvents = events.filter((e) => weekDates.includes(e.date));

  const allTimes = Array.from(new Set(weekEvents.map((e) => e.time))).sort();

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Cabecera días */}
      <div
        className="grid border-b border-base-content/10 bg-base-100 flex-none"
        style={{ gridTemplateColumns: "72px repeat(7, minmax(0, 1fr))" }}
      >
        <div className="h-12 border-r border-base-content/5 flex items-center justify-center">
          <span className="text-[9px] font-bold opacity-25 uppercase tracking-widest">hora</span>
        </div>
        {weekDates.map((date, i) => {
          const dayNum  = parseInt(date.split("-")[2]);
          const isToday = date === todayStr;
          return (
            <div
              key={date}
              className={[
                "h-12 flex flex-col items-center justify-center border-r border-base-content/5 last:border-r-0",
                isToday ? "bg-primary/5" : "",
              ].join(" ")}
            >
              <span className="text-[9px] font-semibold opacity-40 uppercase tracking-wider">{DAY_LABELS[i]}</span>
              <span className={["text-base font-black leading-tight", isToday ? "text-primary" : "opacity-80"].join(" ")}>
                {dayNum}
              </span>
            </div>
          );
        })}
      </div>

      {/* Filas de horarios */}
      <div className="flex-1 overflow-y-auto">
        {weekEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 opacity-25">
            <span className="text-3xl">📅</span>
            <span className="text-sm">Sin tours esta semana</span>
          </div>
        )}

        {allTimes.map((time) => (
          <div
            key={time}
            className="grid border-b border-base-content/5 last:border-b-0"
            style={{ gridTemplateColumns: "72px repeat(7, minmax(0, 1fr))" }}
          >
            <div className="flex items-center justify-center border-r border-base-content/5 bg-base-200/10 py-2 px-1">
              <span className="text-[11px] font-mono font-semibold opacity-50">{time}</span>
            </div>

            {weekDates.map((date) => {
              const cellEvents = weekEvents.filter((e) => e.date === date && e.time === time);
              const isToday    = date === todayStr;
              const isPast     = date < todayStr;
              return (
                <div
                  key={date}
                  className={[
                    "border-r border-base-content/5 last:border-r-0 p-1.5 flex flex-col gap-1",
                    isToday ? "bg-primary/5" : "",
                  ].join(" ")}
                  style={{ minHeight: "60px" }}
                >
                  {/* Una sola tarjeta agrupada si hay eventos */}
                  {cellEvents.length > 0 && (
                    <EventCard
                      events={cellEvents}
                      isPast={isPast}
                      onSelect={() => onSelectEvent(cellEvents[0].id)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}