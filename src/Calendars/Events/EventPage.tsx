import { useEffect, useState } from "react";
import { Ban, Minus, Plus, ArrowLeft } from "lucide-react";
import EventHeader from "./EventHeader";
import OtaEventBody from "./OtaEventBody";
import TGBEventBody from "./TGBEventBody";
import AddReservationModal from "./AddReservationModal";
import type { CalendarEvent } from "../CreateEventModal";
import type { Reservation } from "./AddReservationModal";

interface EventPageProps {
  event: CalendarEvent;
  allEvents: CalendarEvent[];
  onBack: () => void;
  onDelete: (eventId: string) => void;
  onAddReservation: (
    tourId: string,
    data: Omit<Reservation, "id">,
  ) => Promise<void>;
  onRemoveReservation: (reservationId: string, tourId: string) => Promise<void>;
  onRefetch: () => void;
  // Acciones exclusivas de TGB (aforo puntual vía schedule_exceptions).
  // Vienen del hook useSupabaseTGBEvents, a través de CalendarView.
  onUpsertTgbException: (
    scheduleId: string,
    date: string,
    input: { customCapacity?: number | null; isClosed?: boolean },
  ) => Promise<void>;
  onClearTgbException: (scheduleId: string, date: string) => Promise<void>;
}

const QUICK_CAPACITIES = [10, 15, 20, 25, 30, 50, 100];

function formatDateTimeShort(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateLabel = new Date(y, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${dateLabel} · ${timeStr}`;
}

// ─── MODAL DE AFORO ─────────────────────────────────────────────────────────
// Escritorio: modal centrado. Móvil: hoja que sube desde abajo (no fullscreen).
function CapacityModal({
  dateLabel,
  initialCapacity,
  onClose,
  onSave,
}: {
  dateLabel: string;
  initialCapacity: number;
  onClose: () => void;
  onSave: (capacity: number) => Promise<void>;
}) {
  const [visible, setVisible] = useState(false);
  const [capacity, setCapacity] = useState(initialCapacity);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 220);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(capacity);
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center p-0 md:p-4">
      <div
        className={[
          "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onClick={handleClose}
      />

      <div
        className={[
          "relative w-full md:max-w-sm bg-base-100 shadow-2xl flex flex-col",
          "rounded-t-3xl md:rounded-2xl transform transition-all duration-300 ease-out",
          visible
            ? "translate-y-0 opacity-100 md:scale-100"
            : "translate-y-full md:translate-y-4 opacity-0 md:scale-95",
        ].join(" ")}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-base-content/10">
          <button
            onClick={handleClose}
            className="btn btn-ghost btn-circle btn-sm"
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="font-semibold text-sm capitalize">{dateLabel}</span>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <div className="bg-base-200/50 rounded-2xl p-5 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => setCapacity((v) => Math.max(0, v - 1))}
              className="btn btn-circle bg-base-100 shadow-sm"
            >
              <Minus size={16} />
            </button>
            <span className="text-3xl font-black w-16 text-center tabular-nums">
              {capacity}
            </span>
            <button
              type="button"
              onClick={() => setCapacity((v) => v + 1)}
              className="btn btn-circle bg-base-100 shadow-sm"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold opacity-40 uppercase tracking-wide">
              Selección rápida
            </span>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_CAPACITIES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCapacity(n)}
                  className={[
                    "btn btn-sm",
                    capacity === n
                      ? "bg-base-content text-base-100 border-none"
                      : "btn-outline border-base-300",
                  ].join(" ")}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-neutral w-full disabled:opacity-40"
          >
            {saving ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              "Guardar cambios"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DE CONFIRMACIÓN (reemplaza window.confirm) ──────────────────────
// Mismo tamaño/posición en móvil y escritorio: centrado, responsive, nunca
// fullscreen — es solo una confirmación corta, no necesita más espacio.
function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  saving,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function handleCancel() {
    setVisible(false);
    setTimeout(onCancel, 180);
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className={[
          "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onClick={handleCancel}
      />

      <div
        className={[
          "relative w-full max-w-sm bg-base-100 rounded-2xl shadow-2xl p-5 flex flex-col gap-4",
          "transform transition-all duration-200 ease-out",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <div
            className={[
              "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
              danger
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700",
            ].join(" ")}
          >
            <Ban size={16} />
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <h3 className="text-base font-bold leading-tight">{title}</h3>
            <p className="text-sm opacity-70 leading-snug">{message}</p>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={handleCancel}
            className="btn btn-sm btn-outline border-base-content/20"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className={[
              "btn btn-sm disabled:opacity-40",
              danger ? "btn-error text-white" : "btn-success text-white",
            ].join(" ")}
          >
            {saving ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function EventPage({
  event,
  allEvents,
  onBack,
  onDelete,
  onAddReservation,
  onRemoveReservation,
  onRefetch,
  onUpsertTgbException,
  onClearTgbException,
}: EventPageProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mobileView, setMobileView] = useState<"info" | "reservations">(
    "reservations",
  );

  const [capacityModalOpen, setCapacityModalOpen] = useState(false);
  const [confirmAvailabilityOpen, setConfirmAvailabilityOpen] = useState(false);
  const [togglingAvailability, setTogglingAvailability] = useState(false);

  // Identificación de la fuente de la tarjeta (ver SupabaseTGB.adapter.ts / SupabaseOTA.adapter.ts)
  const source = (event.meta?.source as string | undefined) ?? "ota";
  const isTuGuia = source === "tgb";

  const allReservations: Reservation[] = allEvents.flatMap(
    (e) => (e.meta?.reservations as Reservation[]) ?? [],
  );

  // Datos TGB derivados del evento (solo relevantes cuando isTuGuia)
  const scheduleId = event.meta?.scheduleId as string | undefined;
  const maxCapacity = (event.meta?.maxCapacity as number) ?? 0;
  const hasException = !!event.meta?.exceptionId;
  const activePax = allReservations
    .filter((r) => r.status !== "cancelled")
    .reduce((acc, r) => acc + r.adults + r.children, 0);

  async function handleSaveReservation(reservation: Reservation) {
    setSaving(true);
    try {
      await onAddReservation(event.id, {
        name: reservation.name,
        phone: reservation.phone,
        adults: reservation.adults,
        children: reservation.children,
        status: "active",
        attended: false,
        platform: (reservation as any).platform,
      });
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (confirm("¿Eliminar este evento?")) {
      onDelete(event.id);
      onBack();
    }
  }

  async function handleSaveCapacity(capacity: number) {
    if (!scheduleId) return;
    await onUpsertTgbException(scheduleId, event.date, {
      customCapacity: capacity,
    });
  }

  async function handleConfirmToggleAvailability() {
    if (!scheduleId) return;
    setTogglingAvailability(true);
    try {
      if (hasException) {
        await onClearTgbException(scheduleId, event.date);
      } else {
        await onUpsertTgbException(scheduleId, event.date, {
          customCapacity: activePax,
        });
      }
      setConfirmAvailabilityOpen(false);
    } finally {
      setTogglingAvailability(false);
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-base-100 overflow-hidden">
      <EventHeader
        onBack={onBack}
        onEdit={() => setModalOpen(true)}
        onDelete={handleDelete}
        source={source}
        isTuGuia={isTuGuia}
        mobileView={mobileView}
        onToggleMobileView={() =>
          setMobileView((v) => (v === "reservations" ? "info" : "reservations"))
        }
        onOpenCapacity={isTuGuia ? () => setCapacityModalOpen(true) : undefined}
        onToggleAvailability={
          isTuGuia ? () => setConfirmAvailabilityOpen(true) : undefined
        }
        hasException={hasException}
        togglingAvailability={togglingAvailability}
      />

      {isTuGuia ? (
        <TGBEventBody
          event={event}
          allEvents={allEvents}
          reservations={allReservations}
          mobileView={mobileView}
        />
      ) : (
        <OtaEventBody
          event={event}
          allEvents={allEvents}
          reservations={allReservations}
          mobileView={mobileView}
          onRemoveReservation={(resId) => onRemoveReservation(resId, event.id)}
          onRefetch={onRefetch}
        />
      )}

      {/* "Reservar manualmente" es funcionalidad de OTA; TGB no la admite */}
      {!isTuGuia && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-base-100 border-t border-base-content/10 px-4 py-3">
          <button
            onClick={() => setModalOpen(true)}
            className="btn w-full btn-outline border-base-content/20 gap-2 font-semibold"
          >
            ⚙️ Acciones del evento
          </button>
        </div>
      )}

      {modalOpen && !isTuGuia && (
        <AddReservationModal
          onClose={() => setModalOpen(false)}
          onSave={handleSaveReservation}
          saving={saving}
        />
      )}

      {capacityModalOpen && scheduleId && (
        <CapacityModal
          dateLabel={formatDateTimeShort(event.date, event.time)}
          initialCapacity={maxCapacity}
          onClose={() => setCapacityModalOpen(false)}
          onSave={handleSaveCapacity}
        />
      )}

      {confirmAvailabilityOpen && (
        <ConfirmDialog
          title={hasException ? "Habilitar horario" : "Quitar disponibilidad"}
          message={
            hasException
              ? "Se restablecerá el aforo base de este horario."
              : `No se aceptarán nuevas reservas mientras el aforo esté al límite (${activePax}). Si alguna reserva se cancela, la plaza se libera automáticamente.`
          }
          confirmLabel={hasException ? "Habilitar" : "Quitar disponibilidad"}
          danger={!hasException}
          saving={togglingAvailability}
          onCancel={() => setConfirmAvailabilityOpen(false)}
          onConfirm={handleConfirmToggleAvailability}
        />
      )}
    </div>
  );
}
