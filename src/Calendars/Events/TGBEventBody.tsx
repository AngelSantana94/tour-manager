import { Calendar, Clock, Users, Globe, Ban, CheckCircle2 } from "lucide-react";
import type { CalendarEvent } from "../CreateEventModal";
import type { Reservation } from "./AddReservationModal";

interface TGBEventBodyProps {
  event: CalendarEvent;
  allEvents: CalendarEvent[];
  reservations: Reservation[];
  mobileView: "info" | "reservations";
}

const LANGUAGE_LABELS: Record<string, string> = {
  es: "Español",
  en: "English",
  fr: "Français",
};

function languageLabel(code: unknown): string {
  if (typeof code !== "string" || !code) return "—";
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ─── CARD RESERVA (informativa, sin guía ni asistencia) ────────────────────
function ReservationCard({
  reservation,
  isCancelled,
}: {
  reservation: Reservation;
  isCancelled: boolean;
}) {
  const initials = (reservation.name || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div
      className={[
        "rounded-xl p-3 flex items-center gap-3",
        isCancelled
          ? "border border-error/20 bg-error/5 border-l-4 border-l-error"
          : "border border-base-content/5 bg-base-200/40",
      ].join(" ")}
    >
      <div className="w-9 h-9 rounded-full bg-teal-700/15 text-teal-700 flex items-center justify-center text-xs font-bold shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-sm font-bold truncate ${isCancelled ? "line-through opacity-50" : ""}`}
          >
            {reservation.name || (
              <span className="opacity-40 italic text-xs">Sin nombre</span>
            )}
          </span>
          <span className="text-xs opacity-60 shrink-0">
            {reservation.adults} adulto{reservation.adults !== 1 ? "s" : ""}
            {reservation.children > 0 &&
              ` / ${reservation.children} niño${reservation.children !== 1 ? "s" : ""}`}
          </span>
        </div>
        {reservation.phone && (
          <span className="text-xs opacity-40">📱 {reservation.phone}</span>
        )}
      </div>
    </div>
  );
}

function ReservationList({ reservations }: { reservations: Reservation[] }) {
  const active = reservations.filter((r) => r.status !== "cancelled");
  const cancelled = reservations.filter((r) => r.status === "cancelled");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-success shrink-0" />
          <h3 className="font-bold text-base">Reservas confirmadas</h3>
          <span className="text-sm opacity-40 ml-1">
            {active.reduce((a, r) => a + r.adults, 0)} adultos
            {active.some((r) => r.children > 0) &&
              ` · ${active.reduce((a, r) => a + r.children, 0)} niños`}
          </span>
        </div>
        {active.length === 0 ? (
          <div className="flex flex-col items-center py-10 opacity-25 gap-2">
            <span className="text-3xl">🎟️</span>
            <span className="text-sm">Sin reservas</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {active.map((r) => (
              <ReservationCard key={r.id} reservation={r} isCancelled={false} />
            ))}
          </div>
        )}
      </div>

      {cancelled.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-error shrink-0" />
            <h3 className="font-bold text-base">Reservas canceladas</h3>
            <span className="text-sm opacity-40 ml-1">{cancelled.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {cancelled.map((r) => (
              <ReservationCard key={r.id} reservation={r} isCancelled={true} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PANEL IZQUIERDO (solo informativo — las acciones viven en el header) ───
function EventInfo({
  event,
  reservations,
}: {
  event: CalendarEvent;
  reservations: Reservation[];
}) {
  const active = reservations.filter((r) => r.status !== "cancelled");
  const totalPax = active.reduce((a, r) => a + r.adults + r.children, 0);
  const totalAdults = active.reduce((a, r) => a + r.adults, 0);
  const totalChildren = active.reduce((a, r) => a + r.children, 0);

  const maxCapacity = (event.meta?.maxCapacity as number) ?? 0;
  const isClosed = event.meta?.isClosed === true;
  const isFull = maxCapacity > 0 && totalPax >= maxCapacity;
  const isUnavailable = isClosed || isFull;

  return (
    <div className="flex flex-col gap-4">
      {/* Info del tour */}
      <div className="border border-base-content/10 rounded-2xl overflow-hidden">
        <div className="bg-primary text-white p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-80">
              Tour
            </span>
            {isUnavailable ? (
              <span className="badge badge-error gap-1 text-[11px] font-bold">
                <Ban size={10} /> Sin disponibilidad
              </span>
            ) : (
              <span className="badge badge-success gap-1 text-[11px] font-bold">
                <CheckCircle2 size={10} /> Disponible
              </span>
            )}
          </div>
          <p className="text-lg font-black leading-snug">{event.tour}</p>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3 text-sm">
            <Globe size={15} className="opacity-40 shrink-0" />
            <span className="font-medium">
              {languageLabel(event.meta?.language)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Calendar size={15} className="opacity-40 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold opacity-40 uppercase tracking-wide">
                Fecha
              </span>
              <span className="font-medium capitalize">
                {formatDateLong(event.date)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock size={15} className="opacity-40 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold opacity-40 uppercase tracking-wide">
                Horario
              </span>
              <span className="font-medium">{event.time}h</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Users size={15} className="opacity-40 shrink-0" />
            <div className="flex flex-col flex-1">
              <span className="text-[10px] font-semibold opacity-40 uppercase tracking-wide">
                Ocupación / Aforo
              </span>
              <span className="font-medium">
                {totalPax} / {maxCapacity} personas
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="border border-base-content/10 rounded-2xl p-4">
        <h3 className="text-sm font-bold mb-3">Resumen</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="opacity-60">Total adultos</span>
            <span className="font-bold">{totalAdults}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="opacity-60">Total niños</span>
            <span className="font-bold">{totalChildren}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function TGBEventBody({
  event,
  reservations,
  mobileView,
}: TGBEventBodyProps) {
  return (
    <>
      {/* DESKTOP */}
      <div className="hidden md:grid grid-cols-3 gap-6 flex-1 overflow-hidden p-6">
        <div className="col-span-1 overflow-y-auto">
          <EventInfo event={event} reservations={reservations} />
        </div>
        <div className="col-span-2 overflow-y-auto">
          <ReservationList reservations={reservations} />
        </div>
      </div>

      {/* MÓVIL */}
      <div className="md:hidden flex-1 overflow-y-auto pb-24">
        {mobileView === "info" ? (
          <div className="p-4">
            <EventInfo event={event} reservations={reservations} />
          </div>
        ) : (
          <div className="px-0 py-2">
            <ReservationList reservations={reservations} />
          </div>
        )}
      </div>
    </>
  );
}
