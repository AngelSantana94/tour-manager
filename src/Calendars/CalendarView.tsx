import { useState, useMemo } from "react";
import BoardMonth from "./BoardMonth";
import BoardWeek from "./BoardWeek";
import BoardDay from "./BoardDay";
import CalendarHeader from "./CalendarHeader";
import MobileHeader from "./MobileHeader";
import CreateEventModal from "./CreateEventModal";
import EventPage from "./Events/EventPage";
import { useSupabaseEvents } from "./Services/UseSupabaseEvents";
import type { CalendarEvent } from "./CreateEventModal";

export type CalendarView = "week" | "day";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, "0"); }

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatHeaderLabel(dateStr: string, view: CalendarView): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  if (view === "day") {
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  }

  const dow    = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((dow + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()} – ${sunday.getDate()} ${monday.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}`;
  }
  return `${monday.getDate()} ${monday.toLocaleDateString("es-ES", { month: "short" })} – ${sunday.getDate()} ${sunday.toLocaleDateString("es-ES", { month: "short", year: "numeric" })}`;
}

// ─── COMPONENTE ──────────────────────────────────────────────────────────────
function CalendarView() {
  const today = getTodayStr();
  const [selectedDate,  setSelectedDate]  = useState<string>(today);
  const [view,          setView]          = useState<CalendarView>("week");
  const [modalOpen,     setModalOpen]     = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [selectedTour,     setSelectedTour]     = useState("");
  const [selectedGuide,    setSelectedGuide]    = useState("");

  const { events, loading, error, refetch, addEvent, removeEvent, addReservation, removeReservation } = useSupabaseEvents();

  // ── Listas únicas para los filtros ───────────────────────────────────────
  const platforms = useMemo(() =>
    Array.from(new Set(events.map((e) => (e.meta?.platform as string) ?? "other").filter(Boolean))).sort(),
    [events]
  );

  const tourTitles = useMemo(() =>
    Array.from(new Set(events.map((e) => e.tour).filter(Boolean))).sort(),
    [events]
  );

  // Guías — de momento vacío hasta que se añadan en el futuro
  const guides: string[] = useMemo(() =>
    Array.from(new Set(events.map((e) => (e.meta?.guide as string) ?? "").filter(Boolean))).sort(),
    [events]
  );

  // ── Eventos filtrados ─────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (selectedPlatform && (e.meta?.platform as string) !== selectedPlatform) return false;
      if (selectedTour     && e.tour !== selectedTour) return false;
      if (selectedGuide    && (e.meta?.guide as string) !== selectedGuide) return false;
      return true;
    });
  }, [events, selectedPlatform, selectedTour, selectedGuide]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handlePrev()  { setSelectedDate((d) => shiftDate(d, view === "week" ? -7 : -1)); }
  function handleNext()  { setSelectedDate((d) => shiftDate(d, view === "week" ?  7 :  1)); }
  function handleToday() { setSelectedDate(today); }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    // No cambia a vista día — solo navega a esa semana en la vista semana
  }

  function handleDeleteEvent(eventId: string) {
    removeEvent(eventId);
    setSelectedEventId(null);
  }

  const eventsByDate = filteredEvents.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e);
    return acc;
  }, {});

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  // Todos los eventos de la misma hora y fecha que el seleccionado
  const selectedEventGroup = selectedEvent
    ? events.filter((e) => e.date === selectedEvent.date && e.time === selectedEvent.time)
    : [];

  // ── Vista de evento ──
  if (selectedEvent) {
    return (
      <EventPage
        event={selectedEvent}
        allEvents={selectedEventGroup}
        onBack={() => setSelectedEventId(null)}
        onDelete={handleDeleteEvent}
        onAddReservation={addReservation}
        onRemoveReservation={removeReservation}
        onRefetch={() => refetch()}
      />
    );
  }

  // ── Vista de calendario ──
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
          onCreateEvent={() => setModalOpen(true)}
          onRefetch={refetch}
          platforms={platforms}
          tours={tourTitles}
          guides={guides}
          selectedPlatform={selectedPlatform}
          selectedTour={selectedTour}
          selectedGuide={selectedGuide}
          onPlatformChange={setSelectedPlatform}
          onTourChange={setSelectedTour}
          onGuideChange={setSelectedGuide}
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
          <button onClick={refetch} className="btn btn-xs btn-ghost text-error">Reintentar</button>
        </div>
      )}

      {/* CUERPO */}
      <div className="flex flex-1 overflow-hidden">

        {/* Lateral — solo desktop */}
        <aside className="hidden md:flex md:flex-col w-1/5 min-w-[200px] max-w-[260px] border-r border-base-content/5 overflow-y-auto bg-base-100/50">
          <BoardMonth
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            eventsByDate={eventsByDate}
          />
          <div className="p-4 border-t border-base-content/5">
            <h4 className="text-xs font-bold opacity-40 uppercase mb-4 tracking-widest">
              Guías Activos
            </h4>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-hidden relative">

          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-base-100/70 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <span className="loading loading-spinner loading-md text-primary" />
                <span className="text-sm opacity-50">Cargando eventos...</span>
              </div>
            </div>
          )}

          {/* MÓVIL: siempre BoardDay */}
          <div className="md:hidden h-full overflow-hidden">
            <BoardDay
              selectedDate={selectedDate}
              events={filteredEvents}
              onCreateEvent={() => setModalOpen(true)}
              onSelectEvent={setSelectedEventId}
            />
          </div>

          {/* DESKTOP — BoardWeek */}
          <div className={["hidden h-full overflow-hidden p-4", view === "week" ? "md:block" : ""].join(" ")}>
            <div className="h-full bg-base-100 border border-base-content/10 rounded-2xl shadow-sm overflow-hidden">
              <BoardWeek
                selectedDate={selectedDate}
                events={filteredEvents}
                onCreateEvent={() => setModalOpen(true)}
                onSelectEvent={setSelectedEventId}
              />
            </div>
          </div>

          {/* DESKTOP — BoardDay */}
          <div className={["hidden h-full overflow-hidden p-4", view === "day" ? "md:block" : ""].join(" ")}>
            <div className="h-full bg-base-100 border border-base-content/10 rounded-2xl shadow-sm overflow-hidden">
              <BoardDay
                selectedDate={selectedDate}
                events={filteredEvents}
                onCreateEvent={() => setModalOpen(true)}
                onSelectEvent={setSelectedEventId}
              />
            </div>
          </div>

        </main>
      </div>

      {/* MODAL crear evento */}
      {modalOpen && (
        <CreateEventModal
          initialDate={selectedDate}
          events={filteredEvents}
          onClose={() => setModalOpen(false)}
          onSave={(input) => addEvent(input)}
        />
      )}
    </div>
  );
}

export default CalendarView;