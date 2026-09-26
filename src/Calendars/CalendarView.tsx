import { useMemo, useState } from "react";
import BoardMonth from "./BoardMonth";
import BoardWeek from "./BoardWeek";
import BoardDay from "./BoardDay";
import CalendarHeader from "./CalendarHeader";
import MobileHeader from "./MobileHeader";
import CreateEventModal from "./CreateEventModal";
import UploadTourDocumentModal from "./UploadTourDocumentModal";
import EventPage from "./Events/EventPage";
import { useSupabaseEvents } from "./Services/UseSupabaseEvents";
import type { CalendarEvent } from "./CreateEventModal";

export type CalendarView = "week" | "day";

// Un guía visto desde el filtro: puede aparecer como lead o como back-up
interface GuideOption {
  id: string;
  name: string;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

// Guías asignados a un tour, sin duplicar si la misma persona ocupa dos puestos
function eventGuides(event: CalendarEvent): GuideOption[] {
  const candidates = [
    event.meta?.guideLead,
    event.meta?.backup1,
    event.meta?.backup2,
  ] as ({ id: string; name: string } | null | undefined)[];

  const byId = new Map<string, GuideOption>();

  for (const g of candidates) {
    if (g) byId.set(g.id, { id: g.id, name: g.name });
  }

  return [...byId.values()];
}

function formatHeaderLabel(dateStr: string, view: CalendarView): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  if (view === "day") {
    return date.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  const dow = date.getDay();

  const monday = new Date(date);
  monday.setDate(date.getDate() - ((dow + 6) % 7));

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()} – ${sunday.getDate()} ${monday.toLocaleDateString(
      "es-ES",
      {
        month: "long",
        year: "numeric",
      },
    )}`;
  }

  return `${monday.getDate()} ${monday.toLocaleDateString("es-ES", {
    month: "short",
  })} – ${sunday.getDate()} ${sunday.toLocaleDateString("es-ES", {
    month: "short",
    year: "numeric",
  })}`;
}

// ─── COMPONENTE ──────────────────────────────────────────────────────────────

function CalendarView() {
  const today = getTodayStr();

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [view, setView] = useState<CalendarView>("week");

  // Modal de creación manual
  const [modalOpen, setModalOpen] = useState(false);

  // Modal de carga de Excel/documento
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [selectedGuideId, setSelectedGuideId] = useState("");

  // ── Fuente de datos unificada ────────────────────────────────────────────
  const {
    events,
    loading,
    error,
    refetch,
    addEvent,
    updateEvent,
    removeEvent,
    assignGuide,
    unassignGuide,
  } = useSupabaseEvents();

  // ── Listas únicas para los filtros ───────────────────────────────────────

  const guides: GuideOption[] = useMemo(() => {
    const byId = new Map<string, GuideOption>();

    for (const e of events) {
      for (const g of eventGuides(e)) {
        byId.set(g.id, g);
      }
    }

    return [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [events]);

  // ── Eventos filtrados ───────────────────────────────────────────────────

  const filteredEvents = useMemo(() => {
    if (!selectedGuideId) return events;

    return events.filter((e) =>
      eventGuides(e).some((g) => g.id === selectedGuideId),
    );
  }, [events, selectedGuideId]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handlePrev() {
    setSelectedDate((d) =>
      shiftDate(d, view === "week" ? -7 : -1),
    );
  }

  function handleNext() {
    setSelectedDate((d) =>
      shiftDate(d, view === "week" ? 7 : 1),
    );
  }

  function handleToday() {
    setSelectedDate(today);
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
  }

  function handleDeleteEvent(eventId: string) {
    removeEvent(eventId);
    setSelectedEventId(null);
  }

  // ── Agrupar eventos por fecha ────────────────────────────────────────────

  const eventsByDate = filteredEvents.reduce<Record<string, CalendarEvent[]>>(
    (acc, e) => {
      if (!acc[e.date]) acc[e.date] = [];
      acc[e.date].push(e);
      return acc;
    },
    {},
  );

  const selectedEvent =
    events.find((e) => e.id === selectedEventId) ?? null;

  // ── Vista de evento ──────────────────────────────────────────────────────

  if (selectedEvent) {
    return (
      <EventPage
        event={selectedEvent}
        onBack={() => setSelectedEventId(null)}
        onDelete={handleDeleteEvent}
        onUpdate={updateEvent}
        onAssignGuide={assignGuide}
        onUnassignGuide={unassignGuide}
      />
    );
  }

  // ── Vista de calendario ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full bg-base-100">

      {/* HEADER DESKTOP */}
      <header className="hidden md:block flex-none">
        <CalendarHeader
          headerLabel={formatHeaderLabel(selectedDate, view)}
          view={view}
          onViewChange={setView}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}

          // Crear evento manual
          onCreateEvent={() => setModalOpen(true)}

          // NUEVO: cargar documento
          onUploadDocument={() => setUploadModalOpen(true)}

          onRefetch={refetch}

          guides={guides.map((g) => g.name)}
          selectedGuide={
            guides.find((g) => g.id === selectedGuideId)?.name ?? ""
          }
          onGuideChange={(name) =>
            setSelectedGuideId(
              guides.find((g) => g.name === name)?.id ?? "",
            )
          }
        />
      </header>

      {/* HEADER MÓVIL */}
      <header className="md:hidden flex-none">
        <MobileHeader
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
          onPrev={handlePrev}
          onNext={handleNext}
          eventsByDate={eventsByDate}
        />
      </header>

      {/* Banner de error */}
      {error && (
        <div className="flex items-center justify-between px-4 py-2 bg-error/10 border-b border-error/20 text-sm text-error flex-none">
          <span>Error cargando eventos: {error}</span>

          <button
            onClick={refetch}
            className="btn btn-xs btn-ghost text-error"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* CUERPO */}
      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <aside className="hidden md:flex md:flex-col w-[270px] shrink-0 overflow-y-auto bg-base-100/50 p-2 gap-3">
          <BoardMonth
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            eventsByDate={eventsByDate}
          />
        </aside>

        {/* MAIN */}
        <main className="flex-1 overflow-hidden relative">

          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-base-100/70 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <span className="loading loading-spinner loading-md text-primary" />
                <span className="text-sm opacity-50">
                  Cargando eventos...
                </span>
              </div>
            </div>
          )}

          {/* MÓVIL: siempre BoardDay */}
          <div className="md:hidden h-full overflow-hidden">
            <BoardDay
              selectedDate={selectedDate}
              events={filteredEvents}

              // NUEVO
              onUploadDocument={() => setUploadModalOpen(true)}

              onSelectEvent={setSelectedEventId}
            />
          </div>

          {/* DESKTOP — BoardWeek */}
          <div
            className={[
              "hidden h-full overflow-hidden p-2",
              view === "week" ? "md:block" : "",
            ].join(" ")}
          >
            <div className="h-full bg-base-100 border border-base-content/10 rounded-xl shadow-xs overflow-hidden">
              <BoardWeek
                selectedDate={selectedDate}
                events={filteredEvents}
                onCreateEvent={() => setModalOpen(true)}
                onSelectEvent={setSelectedEventId}
              />
            </div>
          </div>

          {/* DESKTOP — BoardDay */}
          <div
            className={[
              "hidden h-full overflow-hidden p-2",
              view === "day" ? "md:block" : "",
            ].join(" ")}
          >
            <div className="h-full bg-base-100 border border-base-content/10 rounded-xl shadow-xs overflow-hidden">
              <BoardDay
                selectedDate={selectedDate}
                events={filteredEvents}

                // NUEVO
                onUploadDocument={() => setUploadModalOpen(true)}

                onSelectEvent={setSelectedEventId}
              />
            </div>
          </div>
        </main>
      </div>

      {/* MODAL crear evento manual */}
      {modalOpen && (
        <CreateEventModal
          initialDate={selectedDate}
          events={filteredEvents}
          onClose={() => setModalOpen(false)}
          onSave={(input) =>
            addEvent({
              tour_type: input.title,
              date: input.date,
              start_time: input.time,
            })
          }
        />
      )}

      {/* MODAL cargar documento */}
      {uploadModalOpen && (
        <UploadTourDocumentModal
          onClose={() => setUploadModalOpen(false)}
        />
      )}
    </div>
  );
}

export default CalendarView;
