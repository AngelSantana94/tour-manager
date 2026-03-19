import { useState } from "react";
import EventHeader from "./EventHeader";
import EventBody from "./EventBody";
import AddReservationModal from "./AddReservationModal";
import type { CalendarEvent } from "../CreateEventModal";
import type { Reservation } from "./AddReservationModal";

interface EventPageProps {
  event:               CalendarEvent;
  allEvents:           CalendarEvent[];
  onBack:              () => void;
  onDelete:            (eventId: string) => void;
  onAddReservation:    (tourId: string, data: Omit<Reservation, "id">) => Promise<void>;
  onRemoveReservation: (reservationId: string, tourId: string) => Promise<void>;
  onRefetch:           () => void;
}

export default function EventPage({
  event, allEvents, onBack, onDelete,
  onAddReservation, onRemoveReservation, onRefetch,
}: EventPageProps) {
  const [modalOpen,  setModalOpen]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [mobileView, setMobileView] = useState<"info" | "reservations">("reservations");

  const allReservations: Reservation[] = allEvents.flatMap(
    (e) => (e.meta?.reservations as Reservation[]) ?? []
  );

  async function handleSaveReservation(reservation: Reservation) {
    setSaving(true);
    try {
      await onAddReservation(event.id, {
        name:     reservation.name,
        phone:    reservation.phone,
        adults:   reservation.adults,
        children: reservation.children,
        status:   "active",
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

  return (
    <div className="flex flex-col h-full w-full bg-base-100 overflow-hidden">

      <EventHeader
        onBack={onBack}
        onEdit={() => setModalOpen(true)}
        onDelete={handleDelete}
        mobileView={mobileView}
        onToggleMobileView={() => setMobileView((v) => v === "reservations" ? "info" : "reservations")}
      />

      <EventBody
        event={event}
        allEvents={allEvents}
        reservations={allReservations}
        mobileView={mobileView}
        onRemoveReservation={(resId) => onRemoveReservation(resId, event.id)}
        onRefetch={onRefetch}
      />

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-base-100 border-t border-base-content/10 px-4 py-3">
        <button
          onClick={() => setModalOpen(true)}
          className="btn w-full btn-outline border-base-content/20 gap-2 font-semibold"
        >
          ⚙️ Acciones del evento
        </button>
      </div>

      {modalOpen && (
        <AddReservationModal
          onClose={() => setModalOpen(false)}
          onSave={handleSaveReservation}
          saving={saving}
        />
      )}
    </div>
  );
}