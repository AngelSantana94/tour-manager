import type { CalendarEvent } from "./CreateEventModal";
import { useAuth } from "../login/AuthContext";
import spainFlag from "../assets/lenguage-logos/spainFlag.png";
import tuGuiaLogo from "../assets/platforms-logos/tuguiaenbrujas.avif";

interface BoardDayProps {
  selectedDate: string;
  events: CalendarEvent[];
  // Por defecto oculta tarjetas TGB sin reservas activas (pax = 0).
  // Se conecta al mismo toggle "Mostrar horarios sin reservas" que
  // controla BoardWeek — ver CalendarView.
  showEmptyTgb?: boolean;
  // Si se pasa, se pinta un toggle "Mostrar horarios sin reservas" en una
  // segunda línea del subheader, visible SOLO en móvil (en escritorio ese
  // control ya vive en CalendarHeader). Si no se pasa, no se pinta nada.
  onShowEmptyTgbChange?: (v: boolean) => void;
  onCreateEvent: () => void;
  onSelectEvent: (eventId: string) => void;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Normalizador de formato HH:MM (por si la DB devuelve "15:00:00")
function formatTime(timeStr: string): string {
  if (!timeStr) return "";
  return timeStr.slice(0, 5);
}

// Un evento es de TGB si su adapter de origen lo marcó como tal en meta.source
// (misma convención que en BoardWeek.tsx — mantener sincronizadas).
function isTuGuiaEvent(event: CalendarEvent): boolean {
  return event.meta?.source === "tgb";
}

// Solo interesan las tarjetas TGB con al menos 1 pax reservado, salvo que
// el toggle "Mostrar horarios sin reservas" esté activo.
function hasActiveReservations(event: CalendarEvent): boolean {
  return ((event.meta?.pax as number) ?? 0) > 0;
}

// Clave de agrupación — misma lógica que BoardWeek.tsx: OTA se combina en
// una sola tarjeta; TGB se separa por tourId porque a la misma hora puede
// haber tours DISTINTOS que antes se fusionaban sumando aforo por error.
function eventGroupKey(event: CalendarEvent): string {
  if (isTuGuiaEvent(event)) {
    return `tgb:${(event.meta?.tourId as string) ?? (event.meta?.scheduleId as string) ?? event.id}`;
  }
  return "ota";
}

// ─── Grupo de eventos por hora + tour ─────────────────────────────────────────
interface TimeGroup {
  key: string;
  time: string;
  events: CalendarEvent[];
  totalPax: number;
  totalCapacity: number;
  tourTitle: string;
  firstId: string;
  isTgb: boolean;
  isClosed: boolean;
  isFull: boolean;
}

function groupEvents(events: CalendarEvent[]): TimeGroup[] {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const cleanTime = formatTime(e.time);
    const key = `${cleanTime}__${eventGroupKey(e)}`;
    const group = map.get(key) ?? [];
    group.push(e);
    map.set(key, group);
  }

  return Array.from(map.entries())
    .map(([key, evs]) => {
      const isTgb = isTuGuiaEvent(evs[0]);
      const totalPax = evs.reduce(
        (acc, e) => acc + ((e.meta?.pax as number) ?? 0),
        0,
      );
      const totalCapacity = evs.reduce(
        (acc, e) => acc + ((e.meta?.maxCapacity as number) ?? 0),
        0,
      );
      // Estado real de disponibilidad para TGB: cerrado a mano
      // (schedule_exceptions.is_closed) o aforo agotado. OTA no gestiona
      // este estado desde aquí.
      const isClosed = isTgb && evs.some((e) => e.meta?.isClosed === true);
      const isFull = isTgb && totalCapacity > 0 && totalPax >= totalCapacity;

      return {
        key,
        time: formatTime(evs[0].time),
        events: evs,
        totalPax,
        totalCapacity,
        tourTitle: evs[0].tour,
        firstId: evs[0].id,
        isTgb,
        isClosed,
        isFull,
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time) || a.key.localeCompare(b.key));
}

export default function BoardDay({
  selectedDate,
  events,
  showEmptyTgb = false,
  onShowEmptyTgbChange,
  onCreateEvent,
  onSelectEvent,
}: BoardDayProps) {
  const { profile } = useAuth();
  const todayStr = getTodayStr();
  const [y, m, d] = selectedDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const isToday = selectedDate === todayStr;
  const isPast = selectedDate < todayStr;

  const dayLabel = date.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const dayEvents = events.filter((e) => {
    if (e.date !== selectedDate) return false;
    // Oculta tarjetas TGB sin reservas activas salvo que el toggle esté
    // activo (ver showEmptyTgb).
    if (isTuGuiaEvent(e) && !hasActiveReservations(e) && !showEmptyTgb) {
      return false;
    }
    return true;
  });

  const groups = groupEvents(dayEvents);

  // Ordenar grupos — los de la guía logueada primero
  const sortedGroups = profile
    ? [...groups].sort((a, b) => {
        const aHasMe = a.events.some((e) =>
          ((e.meta?.tourGuides as any[]) ?? []).some(
            (g: any) => g.id === profile.id,
          ),
        );
        const bHasMe = b.events.some((e) =>
          ((e.meta?.tourGuides as any[]) ?? []).some(
            (g: any) => g.id === profile.id,
          ),
        );
        if (aHasMe && !bHasMe) return -1;
        if (!aHasMe && bHasMe) return 1;
        return a.time.localeCompare(b.time);
      })
    : groups;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Subheader */}
      <div className="border-b border-base-content/10 flex-none">
        <div className="flex items-center justify-between px-4 py-3">
          <span
            className={[
              "text-sm font-bold capitalize",
              isToday ? "text-primary" : "opacity-70",
            ].join(" ")}
          >
            {isToday ? `Hoy, ${dayLabel}` : dayLabel}
          </span>
          <button
            onClick={onCreateEvent}
            className="btn btn-sm gap-1.5 bg-base-content hover:bg-base-content/85 border-none text-base-100 font-semibold"
          >
            + Crear evento
          </button>
        </div>

        {/* Toggle "Mostrar horarios sin reservas" — segunda línea, SOLO
            móvil. En escritorio este control ya vive en CalendarHeader. */}
        {onShowEmptyTgbChange && (
          <label className="md:hidden flex items-center gap-2 px-4 pb-3 -mt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showEmptyTgb}
              onChange={(e) => onShowEmptyTgbChange(e.target.checked)}
              className="toggle toggle-sm"
            />
            <span className="text-xs font-semibold opacity-70">
              Mostrar horarios sin reservas
            </span>
          </label>
        )}
      </div>

      {/* Lista agrupada por hora */}
      <div className="flex-1 overflow-y-auto pb-16">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 opacity-30">
            <span className="text-3xl">📅</span>
            <span className="text-sm">Sin tours programados</span>
          </div>
        )}

        {sortedGroups.map((group) => {
          const isDisabled = group.isClosed || group.isFull;

          return (
            <div
              key={group.key}
              className="border-b border-base-content/5 last:border-b-0"
            >
              {/* Hora en móvil */}
              <div className="md:hidden px-4 pt-3 pb-1">
                <span className="text-[11px] font-mono font-semibold opacity-40">
                  {group.time}h
                </span>
              </div>

              <div className="flex items-stretch">
                {/* Hora en desktop */}
                <div className="hidden md:flex w-[72px] shrink-0 items-center justify-center border-r border-base-content/5 bg-base-200/10 py-3 px-2">
                  <span className="text-[11px] font-mono font-semibold opacity-50">
                    {group.time}
                  </span>
                </div>

                {/* Tarjeta */}
                <div className="flex-1 min-w-0 px-2 py-1.5">
                  <button
                    onClick={() => onSelectEvent(group.firstId)}
                    className={[
                      "rounded-xl px-4 py-3.5 flex items-center justify-between w-full min-h-[68px] text-left gap-3 shadow-xs hover:shadow-md",
                      "active:scale-[0.98] transition-all relative",
                      isPast
                        ? "bg-indigo-600/50 text-white hover:bg-indigo-600/60 backdrop-blur-xs"
                        : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-md",
                    ].join(" ")}
                  >
                    {/* Izquierda: icono (bandera OTA o logo TGB) + hora + nombre tour */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {group.isTgb ? (
                        <div className="relative flex items-center justify-center shrink-0 w-7 h-7">
                          <img
                            src={tuGuiaLogo}
                            alt="Tu Guía en Brujas"
                            className={[
                              "w-7 h-7 rounded-full object-cover transition-all",
                              isDisabled
                                ? "border-2 border-red-500 opacity-80"
                                : "border border-white/20",
                            ].join(" ")}
                          />
                          {isDisabled && (
                            <span className="absolute -top-1 -right-1 text-[9px] leading-none bg-red-600 text-white p-0.5 rounded-full shadow-sm">
                              🔒
                            </span>
                          )}
                        </div>
                      ) : (
                        <img
                          src={spainFlag}
                          alt="ES"
                          className="w-7 h-7 rounded-full shrink-0 object-cover"
                        />
                      )}

                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold leading-tight shrink-0">
                          {group.time}h
                        </span>
                        <span
                          className={[
                            "text-xs truncate",
                            isPast ? "opacity-40" : "opacity-80",
                          ].join(" ")}
                        >
                          {group.tourTitle}
                        </span>
                      </div>
                    </div>

                    {/* Derecha: pax total */}
                    <span
                      className={[
                        "text-sm font-bold shrink-0 ml-3",
                        isPast ? "opacity-40" : "opacity-90",
                      ].join(" ")}
                    >
                      pax: {group.totalPax}
                      {group.isTgb &&
                        group.totalCapacity > 0 &&
                        ` / ${group.totalCapacity}`}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
