import type { CalendarEvent } from "./CreateEventModal";
import { useAuth } from "../login/AuthContext";
import spainFlag from "../assets/lenguage-logos/spainFlag.png"

interface BoardDayProps {
  selectedDate:  string;
  events:        CalendarEvent[];
  onCreateEvent: () => void;
  onSelectEvent: (eventId: string) => void;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ─── Grupo de eventos por hora ────────────────────────────────────────────────
interface TimeGroup {
  time:      string;
  events:    CalendarEvent[];
  totalPax:  number;
  tourTitle: string;   // título del primer evento
  firstId:   string;   // id del primer evento — para navegar
}

function groupByTime(events: CalendarEvent[]): TimeGroup[] {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (!map.has(e.time)) map.set(e.time, []);
    map.get(e.time)!.push(e);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, evs]) => ({
      time,
      events:    evs,
      totalPax:  evs.reduce((acc, e) => acc + ((e.meta?.pax as number) ?? 0), 0),
      tourTitle: evs[0].tour,
      firstId:   evs[0].id,
    }));
}

export default function BoardDay({ selectedDate, events, onCreateEvent, onSelectEvent }: BoardDayProps) {
  const { profile } = useAuth();
  const todayStr = getTodayStr();
  const [y, m, d] = selectedDate.split("-").map(Number);
  const date    = new Date(y, m - 1, d);
  const isToday = selectedDate === todayStr;
  const isPast  = selectedDate < todayStr;

  const dayLabel = date.toLocaleDateString("es-ES", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });

  const dayEvents = events.filter((e) => e.date === selectedDate);
  const groups    = groupByTime(dayEvents);

  // Ordenar grupos — los de la guía logueada primero
  const sortedGroups = profile ? [...groups].sort((a, b) => {
    const aHasMe = a.events.some((e) =>
      ((e.meta?.tourGuides as any[]) ?? []).some((g: any) => g.id === profile.id)
    );
    const bHasMe = b.events.some((e) =>
      ((e.meta?.tourGuides as any[]) ?? []).some((g: any) => g.id === profile.id)
    );
    if (aHasMe && !bHasMe) return -1;
    if (!aHasMe && bHasMe) return 1;
    return a.time.localeCompare(b.time);
  }) : groups;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Subheader */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/10 flex-none">
        <span className={["text-sm font-bold capitalize", isToday ? "text-primary" : "opacity-70"].join(" ")}>
          {isToday ? `Hoy, ${dayLabel}` : dayLabel}
        </span>
        <button
          onClick={onCreateEvent}
          className="btn btn-sm gap-1.5 bg-base-content hover:bg-base-content/85 border-none text-base-100 font-semibold"
        >
          + Crear evento
        </button>
      </div>

      {/* Lista agrupada por hora */}
      <div className="flex-1 overflow-y-auto pb-16">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 opacity-30">
            <span className="text-3xl">📅</span>
            <span className="text-sm">Sin tours programados</span>
          </div>
        )}

        {sortedGroups.map((group) => (
          <div key={group.time} className="border-b border-base-content/5 last:border-b-0">

            {/* Hora en móvil */}
            <div className="md:hidden px-4 pt-3 pb-1">
              <span className="text-[11px] font-mono font-semibold opacity-40">{group.time}h</span>
            </div>

            <div className="flex items-stretch">
              {/* Hora en desktop */}
              <div className="hidden md:flex w-[72px] shrink-0 items-center justify-center border-r border-base-content/5 bg-base-200/10 py-3 px-2">
                <span className="text-[11px] font-mono font-semibold opacity-50">{group.time}</span>
              </div>

              {/* Tarjeta */}
              <div className="flex-1 min-w-0 px-2 py-1.5">
                <button
                  onClick={() => onSelectEvent(group.firstId)}
                  className={[
                    "rounded-xl px-4 py-3 flex items-center justify-between w-full min-h-[56px] text-left",
                    "active:scale-[0.98] transition-all",
                    isPast
                      ? "bg-base-300/60 text-base-content/40 hover:bg-base-300/80"
                      : "bg-teal-700/90 text-white hover:bg-teal-600",
                  ].join(" ")}
                >
                  {/* Izquierda: bandera + hora + nombre tour */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={spainFlag}
                      alt="ES"
                      className="w-7 h-7 rounded-full shrink-0 object-cover"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold leading-tight shrink-0">{group.time}h</span>
                      <span className={["text-xs truncate", isPast ? "opacity-40" : "opacity-80"].join(" ")}>
                        {group.tourTitle}
                      </span>
                    </div>
                  </div>

                  {/* Derecha: pax total */}
                  <span className={["text-sm font-bold shrink-0 ml-3", isPast ? "opacity-40" : "opacity-90"].join(" ")}>
                    pax: {group.totalPax}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}