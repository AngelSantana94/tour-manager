import type { CalendarEvent } from "./CreateEventModal";
import { useAuth } from "../login/AuthContext";
import spainFlag from "../assets/lenguage-logos/spainFlag.png";
import AddTourMenu from "./AddTourMenu";
import { FileSpreadsheet } from "lucide-react";

interface BoardDayProps {
  selectedDate: string;
  events: CalendarEvent[];
  onUploadDocument?: () => void;
  onSelectEvent: (eventId: string) => void;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ─── PERIODO (AM / PM / NT) — solo para ordenar, no se muestra en la tarjeta ──
type Period = "AM" | "PM" | "NT";
const PERIOD_ORDER: Period[] = ["AM", "PM", "NT"];

function periodOf(e: CalendarEvent): Period {
  const p = e.meta?.period as Period | undefined;
  return p ?? "NT";
}

// ─── COLOR POR PROVEEDOR (solo 3) ───────────────────────────────────────────
// Mismos UUIDs y mismo orden que BoardWeek.tsx — mantener sincronizados.
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

function cardColor(providerId: string | null | undefined): string {
  if (!providerId) return "#6B7280"; // gris genérico, sin proveedor
  const fixedIndex = PROVIDER_ORDER.indexOf(providerId);
  if (fixedIndex !== -1) return PROVIDER_COLORS[fixedIndex];
  return FALLBACK_PALETTE[hashString(providerId) % FALLBACK_PALETTE.length];
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
  const providerId = (event.meta?.providerId as string) ?? null;
  const operatorName = (event.meta?.operatorName as string) ?? "Sin operador";
  const color = cardColor(providerId);

  return (
    <button
      onClick={onSelect}
      className={[
        "rounded-xl px-4 py-3.5 flex flex-col gap-1.5 w-full min-h-[68px] text-left shadow-xs hover:shadow-md",
        "active:scale-[0.98] transition-all relative text-white",
        isPast
          ? "opacity-60 hover:opacity-80"
          : "hover:brightness-110 shadow-md",
      ].join(" ")}
      style={{ backgroundColor: color }}
    >
      <div className="flex items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <img
            src={spainFlag}
            alt="ES"
            className="w-6 h-6 rounded-full shrink-0 object-cover border border-white/20"
          />
          <span className="text-sm font-bold truncate">{operatorName}</span>
        </div>

        {pax > 0 && (
          <span
            className={[
              "text-sm font-bold shrink-0",
              isPast ? "opacity-40" : "opacity-90",
            ].join(" ")}
          >
            pax: {pax}
          </span>
        )}
      </div>

      <span
        className={[
          "text-xs truncate pl-[34px]",
          isPast ? "opacity-40" : "opacity-80",
        ].join(" ")}
      >
        {event.tour}
      </span>
    </button>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function BoardDay({
  selectedDate,
  events,
  onUploadDocument,
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

  const dayEvents = events.filter((e) => e.date === selectedDate);

  // Ordenar: primero los tours de la guía logueada, luego por periodo y hora
  const sortedEvents = [...dayEvents].sort((a, b) => {
    if (profile) {
      const aHasMe = ((a.meta?.tourGuides as any[]) ?? []).some(
        (g: any) => g.id === profile.id,
      );
      const bHasMe = ((b.meta?.tourGuides as any[]) ?? []).some(
        (g: any) => g.id === profile.id,
      );
      if (aHasMe && !bHasMe) return -1;
      if (!aHasMe && bHasMe) return 1;
    }
    const periodDiff =
      PERIOD_ORDER.indexOf(periodOf(a)) - PERIOD_ORDER.indexOf(periodOf(b));
    if (periodDiff !== 0) return periodDiff;
    return a.time.localeCompare(b.time);
  });

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
          <AddTourMenu
            options={[
              {
                label: "Cargar documento",
                icon: <FileSpreadsheet size={15} />,
                onClick: onUploadDocument,
              },
            ]}
          />
        </div>
      </div>

      {/* Lista de tours del día */}
      <div className="flex-1 overflow-y-auto pb-16">
        {sortedEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 opacity-30">
            <span className="text-3xl">📅</span>
            <span className="text-sm">Sin tours programados</span>
          </div>
        )}

        {sortedEvents.map((event) => (
          <div
            key={event.id}
            className="border-b border-base-content/5 last:border-b-0 px-2 py-1.5"
          >
            <EventCard
              event={event}
              isPast={isPast}
              onSelect={() => onSelectEvent(event.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
