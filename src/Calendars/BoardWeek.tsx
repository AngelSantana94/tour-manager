import type { CalendarEvent } from "./CreateEventModal";
import spainFlag from "../assets/lenguage-logos/spainFlag.png";
import tuGuiaLogo from "../assets/platforms-logos/tuguiaenbrujas.avif";

interface BoardWeekProps {
  selectedDate: string;
  events: CalendarEvent[];
  showEmptyTgb: boolean;
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

function getWeekDates(anchorStr: string): string[] {
  const cleanStr = anchorStr ? anchorStr.slice(0, 10) : getTodayStr();
  const [y, m, d] = cleanStr.split("-").map(Number);
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

// Un evento es de TGB si su adapter de origen lo marcó como tal en meta.source
// (ver SupabaseTGB.adapter.ts). Los de OTA vienen con meta.source = platform ?? "ota".
// Nada de comparar por texto del nombre del tour ni por plataformas que no existen en TGB.
function isTuGuiaEvent(event: CalendarEvent): boolean {
  return event.meta?.source === "tgb";
}

// Provisional: hasta que exista el filtro de disponibilidad en el header,
// las tarjetas TGB sin ninguna reserva activa (pax = 0) simplemente no se
// muestran en el tablero — no aportan nada que gestionar todavía.
function hasActiveReservations(event: CalendarEvent): boolean {
  return ((event.meta?.pax as number) ?? 0) > 0;
}

// Salvaguarda para cuando este mismo toggle se reutilice en una vista más
// amplia que una semana (ej. un futuro BoardMonth): limita a mes actual ±1
// respecto a la fecha de referencia, para no pintar horarios vacíos de todo
// el año. En BoardWeek esto no cambia nada en la práctica, porque la semana
// visible nunca se sale de ese rango de todos modos.
function isWithinThreeMonthWindow(
  dateStr: string,
  referenceDateStr: string,
): boolean {
  const [ry, rm] = referenceDateStr.split("-").map(Number);
  const [dy, dm] = dateStr.split("-").map(Number);
  const refIndex = ry * 12 + (rm - 1);
  const dateIndex = dy * 12 + (dm - 1);
  return Math.abs(dateIndex - refIndex) <= 1;
}

// Normalizador de formato HH:MM (por si la DB devuelve "15:00:00")
function formatTime(timeStr: string): string {
  if (!timeStr) return "";
  return timeStr.slice(0, 5);
}

// Clave de agrupación de tarjetas dentro de una misma celda (fecha+hora).
// OTA: todo se combina en una sola tarjeta (mismo tour físico repartido en
// varias plataformas — comportamiento ya existente, no se toca).
// TGB: se agrupa por tourId, porque a la misma hora puede haber tours
// DISTINTOS (p. ej. "Free tour" y "Brujas completo" ambos a las 10:45) que
// antes se fusionaban en una sola tarjeta sumando su aforo por error.
function eventGroupKey(event: CalendarEvent): string {
  if (event.meta?.source === "tgb") {
    return `tgb:${(event.meta?.tourId as string) ?? (event.meta?.scheduleId as string) ?? event.id}`;
  }
  return "ota";
}

function groupEventsByTour(events: CalendarEvent[]): CalendarEvent[][] {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = eventGroupKey(e);
    const group = map.get(key) ?? [];
    group.push(e);
    map.set(key, group);
  }
  return Array.from(map.values());
}

// ─── TARJETA EVENTO ─────────────────────────────────────────────────────────
function EventCard({
  events,
  isPast,
  onSelect,
}: {
  events: CalendarEvent[];
  isPast: boolean;
  onSelect: () => void;
}) {
  const first = events[0];
  const totalPax = events.reduce(
    (acc, e) => acc + ((e.meta?.pax as number) ?? 0),
    0,
  );
  const reservations = events.flatMap(
    (e) => (e.meta?.reservations as any[]) ?? [],
  );
  const allAttended =
    isPast &&
    reservations.length > 0 &&
    reservations
      .filter((r) => r.status !== "cancelled")
      .every((r) => r.attended);

  const isTuGuia = isTuGuiaEvent(first);

  // Estado real de disponibilidad para TGB: cerrado a mano (schedule_exceptions.is_closed)
  // o aforo agotado (pax >= aforo). OTA no gestiona este estado desde aquí (de momento).
  const isClosed = isTuGuia && events.some((e) => e.meta?.isClosed === true);
  const totalCapacity = events.reduce(
    (acc, e) => acc + ((e.meta?.maxCapacity as number) ?? 0),
    0,
  );
  const isFull = isTuGuia && totalCapacity > 0 && totalPax >= totalCapacity;
  const isDisabled = isClosed || isFull;

  // Sin verde corporativo de Guruwalk — tarjetas en negro/gris, igual que
  // el resto de botones "negro empresarial" ya usados en el header.
  const cardClass = allAttended
    ? "bg-indigo-500/15 text-indigo-900 border border-indigo-500/30 backdrop-blur-xs" // Capa muy suave para los ya atendidos
    : isPast
      ? "bg-indigo-600/50 text-white hover:bg-indigo-600/60 backdrop-blur-xs" // Capa translúcida exacta que tenías, ahora en índigo
      : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-md"; // Sólido y vibrante para los tours activos/futuros

  return (
    <button
      onClick={onSelect}
      className={[
        "rounded-xl px-2.5 py-2 w-full max-w-full min-h-[62px] overflow-hidden flex flex-col justify-between gap-1.5",
        "active:scale-[0.98] transition-all text-left relative shadow-xs hover:shadow-md",
        cardClass,
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-1 w-full">
        {/* Izquierda: Icono OTA/TGB (con candado si aplica) + Hora */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isTuGuia ? (
            <div className="relative flex items-center justify-center shrink-0">
              <img
                src={tuGuiaLogo}
                alt="Tu Guía en Brujas"
                className={[
                  "w-4 h-4 rounded-full object-cover transition-all",
                  isDisabled
                    ? "border border-red-500 opacity-80"
                    : "border border-white/20",
                ].join(" ")}
              />
              {isDisabled && (
                <span className="absolute -top-1 -right-1 text-[7px] leading-none bg-red-600 text-white p-0.5 rounded-full shadow-sm">
                  🔒
                </span>
              )}
            </div>
          ) : (
            <img
              src={spainFlag}
              alt="ES"
              className="w-3.5 h-3.5 rounded-full shrink-0 object-cover"
            />
          )}

          <span className="text-[10px] font-bold leading-tight">
            {formatTime(first.time)}
          </span>
        </div>

        {/* Derecha: Solo Pax (Alineación limpia) */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <span
            className={[
              "text-[9.5px] font-semibold shrink-0",
              allAttended ? "opacity-40" : "opacity-90",
            ].join(" ")}
          >
            pax: {totalPax}
            {isTuGuia && totalCapacity > 0 && ` / ${totalCapacity}`}
          </span>
        </div>
      </div>

      {/* Nombre del tour ligeramente más grande (10.5px) */}
      <span
        className={[
          "text-[10.5px] font-medium truncate w-full block leading-tight",
          allAttended ? "opacity-40" : "opacity-85",
        ].join(" ")}
      >
        {first.tour}
      </span>
    </button>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function BoardWeek({
  selectedDate,
  events,
  showEmptyTgb,
  onSelectEvent,
}: BoardWeekProps) {
  const todayStr = getTodayStr();
  const weekDates = getWeekDates(selectedDate);

  // Normalizar eventos para asegurar comparación YYYY-MM-DD
  const normalizedEvents = events.map((e) => ({
    ...e,
    cleanDate: e.date ? e.date.slice(0, 10) : "",
    cleanTime: formatTime(e.time),
  }));

  const weekEvents = normalizedEvents.filter((e) => {
    if (!weekDates.includes(e.cleanDate)) return false;
    // Por defecto, oculta tarjetas TGB sin reservas activas. Con el toggle
    // "Mostrar horarios sin reservas" activado, se muestran también —
    // acotado a mes actual ±1 respecto a la fecha seleccionada (ver
    // isWithinThreeMonthWindow).
    if (isTuGuiaEvent(e) && !hasActiveReservations(e)) {
      if (!showEmptyTgb) return false;
      if (!isWithinThreeMonthWindow(e.cleanDate, selectedDate)) return false;
    }
    return true;
  });

  // Obtener todas las horas únicas presentes en la semana
  const rawTimes = Array.from(
    new Set(weekEvents.map((e) => e.cleanTime)),
  ).sort();

  // Generar las filas especificando si son para OTAs o para Tu Guía en Brujas
  interface RowSpec {
    id: string;
    time: string;
    type: "otas" | "tuguia";
  }

  const rows: RowSpec[] = [];
  rawTimes.forEach((time) => {
    const eventsAtTime = weekEvents.filter((e) => e.cleanTime === time);
    const hasOtas = eventsAtTime.some((e) => !isTuGuiaEvent(e));
    const hasTuGuia = eventsAtTime.some((e) => isTuGuiaEvent(e));

    if (hasOtas) {
      rows.push({ id: `${time}-otas`, time, type: "otas" });
    }
    if (hasTuGuia) {
      rows.push({ id: `${time}-tuguia`, time, type: "tuguia" });
    }
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Cabecera días */}
      <div
        className="grid border-b border-base-content/10 bg-base-100 flex-none"
        style={{ gridTemplateColumns: "72px repeat(7, minmax(0, 1fr))" }}
      >
        <div className="h-12 border-r border-base-content/5 flex items-center justify-center">
          <span className="text-[9px] font-bold opacity-25 uppercase tracking-widest">
            hora
          </span>
        </div>
        {weekDates.map((date, i) => {
          const dayNum = parseInt(date.split("-")[2]);
          const isToday = date === todayStr;
          return (
            <div
              key={date}
              className={[
                "h-12 flex flex-col items-center justify-center border-r border-base-content/5 last:border-r-0",
                isToday ? "bg-primary/5" : "",
              ].join(" ")}
            >
              <span className="text-[9px] font-semibold opacity-40 uppercase tracking-wider">
                {DAY_LABELS[i]}
              </span>
              <span
                className={[
                  "text-base font-black leading-tight",
                  isToday ? "text-primary" : "opacity-80",
                ].join(" ")}
              >
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

        {rows.map((row) => (
          <div
            key={row.id}
            className="grid border-b border-base-content/5 last:border-b-0"
            style={{ gridTemplateColumns: "72px repeat(7, minmax(0, 1fr))" }}
          >
            {/* Indicador de Hora e Identificador de tipo si coinciden */}
            <div className="flex flex-col items-center justify-center border-r border-base-content/5 bg-base-200/10 py-2 px-1">
              <span className="text-[11px] font-mono font-semibold opacity-80">
                {row.time}
              </span>
            </div>

            {weekDates.map((date) => {
              const cellEvents = weekEvents.filter((e) => {
                const matchesDate = e.cleanDate === date;
                const matchesTime = e.cleanTime === row.time;
                const matchesType =
                  row.type === "tuguia" ? isTuGuiaEvent(e) : !isTuGuiaEvent(e);
                return matchesDate && matchesTime && matchesType;
              });

              const isToday = date === todayStr;
              const isPast = date < todayStr;

              return (
                <div
                  key={date}
                  className={[
                    "border-r border-base-content/5 last:border-r-0 p-1.5 flex flex-col gap-1",
                    isToday ? "bg-primary/5" : "",
                  ].join(" ")}
                  style={{ minHeight: "60px" }}
                >
                  {cellEvents.length > 0 &&
                    (row.type === "tuguia"
                      ? groupEventsByTour(cellEvents)
                      : [cellEvents]
                    ).map((group) => (
                      <EventCard
                        key={group[0].id}
                        events={group}
                        isPast={isPast}
                        onSelect={() => onSelectEvent(group[0].id)}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
