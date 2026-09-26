import { useState } from "react";
import { Map as MapIcon, Check } from "lucide-react";
import EventHeader from "./EventHeader";
import EventBody from "./EventBody";
import type { GuideSlot } from "../Services/Supabase.adapter";
import type { CalendarEvent } from "../CreateEventModal";

export type Period = "AM" | "PM" | "NT";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
  { value: "NT", label: "NT" },
];

export interface TourFormState {
  tour_type: string;
  date: string;
  city: string;
  pax: number;
  meeting_point: string;
  notes: string;
  provider_id: string | null;
  tour_operator_id: string | null;
  tour_leader_id: string | null;
  tour_leader_phone: string | null;
}

export type UpdateTourFn = (
  id: string,
  data: Partial<{
    tour_type: string;
    date: string;
    start_time: string;
    end_time: string;
    city: string;
    pax: number;
    meeting_point: string;
    status: string;
    notes: string;
    period: string;
    provider_id: string | null;
    tour_operator_id: string | null;
    tour_leader_id: string | null;
    tour_leader_phone: string | null;
  }>,
) => Promise<void>;

interface EventPageProps {
  event: CalendarEvent;
  onBack: () => void;
  onDelete: (eventId: string) => void;
  onUpdate: UpdateTourFn;
  onAssignGuide: (
    tourId: string,
    guideId: string,
    slot: GuideSlot,
  ) => Promise<void>;
  onUnassignGuide: (tourId: string, slot: GuideSlot) => Promise<void>;
}

function formatDateOnly(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── CONFIRMACIÓN PARA CANCELAR ────────────────────────────────────────────
function ConfirmCancelDialog({
  onCancel,
  onConfirm,
  saving,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm bg-base-100 rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-amber-100 text-amber-700">
            <span className="text-lg">⚠️</span>
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <h3 className="text-base font-bold leading-tight">Cancelar tour</h3>
            <p className="text-sm opacity-70 leading-snug">
              El tour quedará marcado como "Cancelado". Puedes reactivarlo
              cuando quieras.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            className="btn btn-sm btn-outline border-base-content/20"
          >
            Volver
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="btn btn-sm btn-error text-white disabled:opacity-40"
          >
            {saving ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "Cancelar tour"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EventPage({
  event,
  onBack,
  onDelete,
  onUpdate,
  onAssignGuide,
  onUnassignGuide,
}: EventPageProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const meta = event.meta ?? {};
  const status = (meta.status as string) ?? "Confirmado";
  const isCancelled = status === "Cancelado";

  // ── Periodo (AM / PM / NT) — reactivo, guarda al instante ───────────────
  const [period, setPeriod] = useState<Period>((meta.period as Period) ?? "NT");
  const [savingPeriod, setSavingPeriod] = useState(false);

  async function handlePeriodChange(value: Period) {
    const previous = period;
    setPeriod(value);
    setSavingPeriod(true);
    try {
      await onUpdate(event.id, { period: value });
    } catch {
      setPeriod(previous);
    } finally {
      setSavingPeriod(false);
    }
  }

  // ── Formulario general — se guarda de golpe al pulsar "Guardar" ────────
  const [form, setForm] = useState<TourFormState>({
    tour_type: event.tour,
    date: event.date,
    city: (meta.city as string) ?? "",
    pax: (meta.pax as number) ?? 0,
    meeting_point: (meta.meetingPoint as string) ?? "",
    notes: (meta.notes as string) ?? "",
    provider_id: (meta.providerId as string) ?? null,
    tour_operator_id: (meta.operatorId as string) ?? null,
    tour_leader_id: (meta.tourLeaderId as string) ?? null,
    tour_leader_phone: (meta.leaderPhone as string) ?? null,
  });

  async function handleToggleEdit() {
    if (!editing) {
      setEditing(true);
      return;
    }
    setSaving(true);
    try {
      await onUpdate(event.id, form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (confirm("¿Eliminar este tour?")) {
      onDelete(event.id);
      onBack();
    }
  }

  function handleToggleCancel() {
    if (isCancelled) {
      handleReactivate();
    } else {
      setConfirmCancelOpen(true);
    }
  }

  async function handleReactivate() {
    setSavingStatus(true);
    try {
      await onUpdate(event.id, { status: "Confirmado" });
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleConfirmCancel() {
    setSavingStatus(true);
    try {
      await onUpdate(event.id, { status: "Cancelado" });
      setConfirmCancelOpen(false);
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-base-200/30 overflow-hidden">
      <EventHeader
        onBack={onBack}
        onEdit={handleToggleEdit}
        onDelete={handleDelete}
        editing={editing}
        isCancelled={isCancelled}
        onToggleCancel={handleToggleCancel}
        togglingCancel={savingStatus}
      />

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 max-w-2xl mx-auto w-full">
        {/* ── Banner ── */}
        <div className="rounded-2xl overflow-hidden shadow-sm border border-base-content/10">
          <div
            className="relative px-5 pt-5 pb-4 flex flex-col gap-2"
            style={{
              background:
                "linear-gradient(135deg, #1e293b 0%, #334155 60%, #475569 100%)",
            }}
          >
            <span
              className={[
                "absolute top-4 right-5 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full",
                isCancelled
                  ? "bg-error text-white"
                  : "bg-emerald-500 text-white",
              ].join(" ")}
            >
              {!isCancelled && <Check size={13} />}
              {status}
            </span>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <MapIcon size={20} className="text-white" />
              </div>
              <div className="flex flex-col min-w-0 pr-24">
                <h1 className="text-lg font-black text-white leading-tight truncate uppercase">
                  {event.tour}
                </h1>
                {editing ? (
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, date: e.target.value }))
                    }
                    className="input input-bordered input-xs mt-1 w-40 text-xs"
                  />
                ) : (
                  <span className="text-sm text-white/70 capitalize">
                    {formatDateOnly(event.date)}
                  </span>
                )}
                <span className="text-[11px] text-white/40 font-mono mt-0.5">
                  ID: {(meta.serviceId as string) || event.id}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">
                Periodo
              </span>
              <select
                value={period}
                disabled={savingPeriod}
                onChange={(e) => handlePeriodChange(e.target.value as Period)}
                className="select select-bordered select-xs font-bold bg-white/90 disabled:opacity-40"
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              {savingPeriod && (
                <span className="loading loading-spinner loading-xs text-white" />
              )}
            </div>
          </div>

          <EventBody
            event={event}
            form={form}
            setForm={setForm}
            editing={editing}
            onAssignGuide={onAssignGuide}
            onUnassignGuide={onUnassignGuide}
          />
        </div>
      </div>

      {confirmCancelOpen && (
        <ConfirmCancelDialog
          saving={savingStatus}
          onCancel={() => setConfirmCancelOpen(false)}
          onConfirm={handleConfirmCancel}
        />
      )}
    </div>
  );
}
