import { useMemo, useState } from "react";
import BoardMonth from "./BoardMonth";
import BoardWeek from "./BoardWeek";
import BoardDay from "./BoardDay";
import CalendarHeader from "./CalendarHeader";
import MobileHeader from "./MobileHeader";
import EventPage from "./Events/EventPage";
import { useSupabaseEvents } from "./Services/UseSupabaseEvents";
import type { CalendarEvent } from "./CreateEventModal";
import GuideAvailabilityPanel from "./GuideAvailabilityPanel";

export type CalendarView = "week" | "day";

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
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
    return `${monday.getDate()} – ${sunday.getDate()} ${monday.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}`;
  }
  return `${monday.getDate()} ${monday.toLocaleDateString("es-ES", { month: "short" })} – ${sunday.getDate()} ${sunday.toLocaleDateString("es-ES", { month: "short", year: "numeric" })}`;
}

// ─── COMPONENTE ──────────────────────────────────────────────────────────────
function CalendarView() {
  const today = getTodayStr();
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [view, setView] = useState<CalendarView>("week");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedOperator, setSelectedOperator] = useState("");

  // ── Fuente de datos unificada ────────────────────────────────────────────
  const {
    events,
    loading,
    error,
    refetch,
    updateEvent,
    removeEvent,
    assignGuide,
    unassignGuide,
  } = useSupabaseEvents();

  const cities = useMemo(() => {
    return [
      ...new Set(
        events
          .map((e) => e.meta?.city)
          .filter((city): city is string => Boolean(city)),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [events]);

  const providers = useMemo(() => {
    return [
      ...new Set(
        events
          .map((e) => e.meta?.providerName)
          .filter((provider): provider is string => Boolean(provider)),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [events]);

  const operators = useMemo(() => {
    return [
      ...new Set(
        events
          .map((e) => e.meta?.operatorName)
          .filter((operator): operator is string => Boolean(operator)),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesCity = !selectedCity || event.meta?.city === selectedCity;

      const matchesProvider =
        !selectedProvider || event.meta?.providerName === selectedProvider;

      const matchesOperator =
        !selectedOperator || event.meta?.operatorName === selectedOperator;

      return matchesCity && matchesProvider && matchesOperator;
    });
  }, [events, selectedCity, selectedProvider, selectedOperator]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handlePrev() {
    setSelectedDate((d) => shiftDate(d, view === "week" ? -7 : -1));
  }
  function handleNext() {
    setSelectedDate((d) => shiftDate(d, view === "week" ? 7 : 1));
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

  const eventsByDate = filteredEvents.reduce<Record<string, CalendarEvent[]>>(
    (acc, e) => {
      if (!acc[e.date]) acc[e.date] = [];
      acc[e.date].push(e);
      return acc;
    },
    {},
  );

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  // ── Vista de evento ──
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
          onRefetch={refetch}
          cities={cities}
          selectedCity={selectedCity}
          onCityChange={setSelectedCity}
          providers={providers}
          selectedProvider={selectedProvider}
          onProviderChange={setSelectedProvider}
          operators={operators}
          selectedOperator={selectedOperator}
          onOperatorChange={setSelectedOperator}
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
          <button onClick={refetch} className="btn btn-xs btn-ghost text-error">
            Reintentar
          </button>
        </div>
      )}

      {/* CUERPO */}
      <div className="flex flex-1 overflow-hidden">
        {/* Lateral */}
        <aside className="hidden md:flex md:flex-col w-[270px] shrink-0 border-r border-base-content/10 overflow-y-auto bg-base-100/50 p-2 gap-3">
          <BoardMonth
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            eventsByDate={eventsByDate}
          />
          <GuideAvailabilityPanel selectedDate={selectedDate} events={events} />
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
                onSelectEvent={setSelectedEventId}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default CalendarView;
