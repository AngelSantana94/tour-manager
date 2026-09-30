import type { CalendarEvent } from "./CreateEventModal";
import spainFlag from "../assets/lenguage-logos/spainFlag.png";

interface BoardWeekProps {
  selectedDate: string;
  events: CalendarEvent[];
  onCreateEvent?: () => void;
  onSelectEvent: (eventId: string) => void;
}

function pad(n: number): string {
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

// Franjas manuales (columna `period` en `tours`, la pone la coordinadora).
type Period = "AM" | "PM" | "NT";
const PERIOD_ORDER: Period[] = ["AM", "PM", "NT"];

function periodOf(e: CalendarEvent): Period {
  const p = e.meta?.period as Period | undefined;
  return p ?? "NT";
}

// ─── COLOR POR PROVEEDOR (solo 3) ───────────────────────────────────────────
// Confirmado por consulta a `tours` (2026-09-23): son estos 3 provider_id.
// El nombre real de cada uno (Visolumen / Bespoke / Vivalux) queda pendiente
// de asignar — el orden abajo no importa para que funcione, solo decide qué
// color le toca a cuál mientras tanto. Para cambiarlo, reordena las líneas.
const PROVIDER_ORDER: string[] = [
  "be3caa85-f4f2-4d3f-b089-bc4de92dbea4", // el más frecuente (564 tours)
  "4b751fd2-9c8a-483c-9eaf-db9d6d60549b", // 13 tours
  "f10434fa-147d-4a4f-9b19-1aff4cddc2bc", // 3 tours
];

const PROVIDER_COLORS = ["#4F46E5", "#10B981", "#A78BFA"]; // indigo, verdoso, malva

const FALLBACK_PALETTE = [
  "#0EA5E9",
  "#059669",
  "#D97706",
  "#DB2777",
  "#7C3AED",
  "#DC2626",
  "#0D9488",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function providerColor(providerId: string | null | undefined): string {
  if (!providerId) return "#6B7280"; // gris genérico, tour sin proveedor (hay 1 así hoy)
  const fixedIndex = PROVIDER_ORDER.indexOf(providerId);
  return fixedIndex !== -1
    ? PROVIDER_COLORS[fixedIndex]
    : FALLBACK_PALETTE[hashString(providerId) % FALLBACK_PALETTE.length];
}

// ─── TARJETA EVENTO ─────────────────────────────────────────────────────────
function EventCard({
  event,
  isPast,
  onSelect,
}: {
  event: CalendarEvent;
  isPast: boolean;
  onSelect: () => void;
}) {
  const pax = (event.meta?.pax as number) ?? 0;
  const operatorName = (event.meta?.operatorName as string | null) ?? null;
  const providerId = (event.meta?.providerId as string | null) ?? null;
  const color = providerColor(providerId);

  return (
    <button
      onClick={onSelect}
      className={[
        "rounded-xl px-2.5 py-2 w-full max-w-full min-h-[62px] overflow-hidden flex flex-col justify-between gap-1.5",
        "active:scale-[0.98] transition-all text-left relative shadow-xs hover:shadow-md text-white",
        isPast ? "opacity-60 hover:opacity-80" : "hover:brightness-110",
      ].join(" ")}
      style={{ backgroundColor: color }}
      title={operatorName ?? "Operador sin identificar"}
    >
      {/* Línea 1, de izquierda a derecha: bandera · operador ... pax (si hay) */}
      <div className="flex items-center justify-between gap-1 w-full">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* PROVISIONAL: bandera fija de España — pendiente de resolver por
              idioma real del tour cuando ese dato esté disponible. */}
          <img
            src={spainFlag}
            alt="ES"
            className="w-3.5 h-3.5 rounded-full shrink-0 object-cover"
          />
          <span className="text-[10px] font-bold leading-tight truncate">
            {operatorName ?? "Sin operador"}
          </span>
        </div>

        {pax > 0 && (
          <span className="text-[9.5px] font-semibold shrink-0 ml-auto opacity-90">
            pax: {pax}
          </span>
        )}
      </div>

      {/* Línea 2: tipo de tour */}
      <span className="text-[10.5px] font-medium truncate w-full block leading-tight opacity-85">
        {event.tour}
      </span>
    </button>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function BoardWeek({
  selectedDate,
  events,
  onSelectEvent,
}: BoardWeekProps) {
  const todayStr = getTodayStr();
  const weekDates = getWeekDates(selectedDate);

  const weekEvents = events
    .map((e) => ({ ...e, cleanDate: e.date ? e.date.slice(0, 10) : "" }))
    .filter((e) => weekDates.includes(e.cleanDate));

  const periodsPresent = PERIOD_ORDER.filter((p) =>
    weekEvents.some((e) => periodOf(e) === p),
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-base-100 [html[data-theme='light']_&]:bg-white">
      <div
        className="grid border-b border-base-content/10 bg-base-100 [html[data-theme='light']_&]:bg-white flex-none"
        style={{ gridTemplateColumns: "72px repeat(7, minmax(0, 1fr))" }}
      >
        <div className="h-12 border-r border-base-content/5 flex items-center justify-center">
          <span className="text-[9px] font-bold opacity-25 uppercase tracking-widest">
            franja
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

      <div className="flex-1 overflow-y-auto">
        {weekEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 opacity-25">
            <span className="text-3xl">📅</span>
            <span className="text-sm">Sin tours esta semana</span>
          </div>
        )}

        {periodsPresent.map((period) => (
          <div
            key={period}
            className="grid border-b border-base-content/5 last:border-b-0"
            style={{ gridTemplateColumns: "72px repeat(7, minmax(0, 1fr))" }}
          >
            <div className="flex flex-col items-center justify-center border-r border-base-content/5 bg-base-200/10 py-2 px-1">
              <span className="text-[11px] font-bold opacity-80">{period}</span>
            </div>

            {weekDates.map((date) => {
              const cellEvents = weekEvents.filter(
                (e) => e.cleanDate === date && periodOf(e) === period,
              );
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
                  {cellEvents.map((e) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      isPast={isPast}
                      onSelect={() => onSelectEvent(e.id)}
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
