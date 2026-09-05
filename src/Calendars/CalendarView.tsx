import { useMemo, useState } from "react";
import BoardMonth from "./BoardMonth";
import BoardWeek from "./BoardWeek";
import BoardDay from "./BoardDay";
import CalendarHeader from "./CalendarHeader";
import MobileHeader from "./MobileHeader";
import CreateEventModal from "./CreateEventModal";
import EventPage from "./Events/EventPage";
import { useSupabaseOTAEvents } from "./Services/UseSupabaseOTAEvents";
import { useSupabaseTGBEvents } from "./Services/UseSupabaseTGBEvents";
import type { CalendarEvent } from "./CreateEventModal";

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

// Misma clave de agrupación que en BoardWeek.tsx (mantener sincronizadas):
// OTA combina todas las plataformas del mismo tour físico; TGB se separa por
// tourId para no mezclar reservas de tours distintos que caen en el mismo
// horario (p. ej. "Free tour" y "Brujas completo" ambos a las 10:45).
function eventGroupKey(event: CalendarEvent): string {
  if (event.meta?.source === "tgb") {
    return `tgb:${(event.meta?.tourId as string) ?? (event.meta?.scheduleId as string) ?? event.id}`;
  }
  return "ota";
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
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // ── Filtros ──────────────────────────────────────────────────────────────
  // "" = todas, "external" = plataformas externas (OTA), "tgb" = Tu Guía en Brujas
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedGuide, setSelectedGuide] = useState("");
  // Por defecto solo se ven horarios TGB con reservas confirmadas; con esto
  // activado también aparecen los que están en 0. El control visual de este
  // toggle vive únicamente en MobileHeader (solo se ve en móvil), pero se
  // aplica tanto a BoardWeek (desktop) como a BoardDay (móvil y desktop).
  const [showEmptyTgb, setShowEmptyTgb] = useState(false);

  // ── Fuentes de datos: OTA (solo lectura + CRUD de tours/reservas OTA) y
  // TGB (lectura + CRUD acotado a schedule_exceptions) ──────────────────────
  const ota = useSupabaseOTAEvents();
  const tgb = useSupabaseTGBEvents();

  const events = useMemo(
    () => [...ota.events, ...tgb.events],
    [ota.events, tgb.events],
  );
  const loading = ota.loading || tgb.loading;
  const error = ota.error ?? tgb.error;

  function refetch() {
    ota.refetch();
    tgb.refetch();
  }

  const { addEvent, removeEvent, addReservation, removeReservation } = ota;

  // Acciones TGB (aforo/cierre de un día concreto) — se conectarán a los
  // botones "Capacidad" / "Bloquear" de TuGuiaEventBody en el próximo paso
  const {
    upsertException: upsertTgbException,
    clearException: clearTgbException,
  } = tgb;

  // ── Listas únicas para los filtros ───────────────────────────────────────
  // Guías — de momento vacío hasta que se añadan en el futuro
  const guides: string[] = useMemo(
    () =>
      Array.from(
        new Set(
          events.map((e) => (e.meta?.guide as string) ?? "").filter(Boolean),
        ),
      ).sort(),
    [events],
  );

  // ── Eventos filtrados ─────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const isTgb = (e.meta?.source as string) === "tgb";
      if (selectedSource === "tgb" && !isTgb) return false;
      if (selectedSource === "external" && isTgb) return false;
      if (selectedGuide && (e.meta?.guide as string) !== selectedGuide)
        return false;
      return true;
    });
  }, [events, selectedSource, selectedGuide]);

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
    // No cambia a vista día — solo navega a esa semana en la vista semana
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

  // Todos los eventos de la misma hora y fecha que el seleccionado (y del
  // mismo tour, si es TGB — ver eventGroupKey)
  const selectedEventGroup = selectedEvent
    ? events.filter(
        (e) =>
          e.date === selectedEvent.date &&
          e.time === selectedEvent.time &&
          eventGroupKey(e) === eventGroupKey(selectedEvent),
      )
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
        onRefetch={refetch}
        onUpsertTgbException={upsertTgbException}
        onClearTgbException={clearTgbException}
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
          selectedSource={selectedSource}
          onSourceChange={setSelectedSource}
          showEmptyTgb={showEmptyTgb}
          onShowEmptyTgbChange={setShowEmptyTgb}
          guides={guides}
          selectedGuide={selectedGuide}
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
          <button onClick={refetch} className="btn btn-xs btn-ghost text-error">
            Reintentar
          </button>
        </div>
      )}

      {/* CUERPO */}
      <div className="flex flex-1 overflow-hidden">
        {/* Lateral — Ancho fijo ajustado para calendario cuadrado y cero espacio muerto */}
        <aside className="hidden md:flex md:flex-col w-[270px] shrink-0 border-r border-base-content/10 overflow-y-auto bg-base-100/50 p-2 gap-3">
          <BoardMonth
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            eventsByDate={eventsByDate}
          />
          
        </aside>

        {/* Main — Relleno reducido de p-4 a p-2 para ganar máximo espacio de lectura */}
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
              showEmptyTgb={showEmptyTgb}
              onShowEmptyTgbChange={setShowEmptyTgb}
              onCreateEvent={() => setModalOpen(true)}
              onSelectEvent={setSelectedEventId}
            />
          </div>

          {/* DESKTOP — BoardWeek (p-2 y border-base-content/10 para pegarlo más) */}
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
                showEmptyTgb={showEmptyTgb}
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
                showEmptyTgb={showEmptyTgb}
                onShowEmptyTgbChange={setShowEmptyTgb}
                onCreateEvent={() => setModalOpen(true)}
                onSelectEvent={setSelectedEventId}
              />
            </div>
          </div>
        </main>
      </div>

      {/* MODAL crear evento (solo OTA) */}
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
