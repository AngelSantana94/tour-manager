import { useState } from "react";
import { X, Save } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

interface AddTourManualModalProps {
  onClose: () => void;
  onSaved?: () => void;
}

export default function AddTourManualModal({
  onClose,
  onSaved,
}: AddTourManualModalProps) {
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    service_id: "",
    date: "",
    start_time: "",
    pax: "",
    tour_leader: "",
    tour_leader_phone: "",
    provider: "",
    operator: "",
    city: "Brujas",
    meeting_point: "Bargeplein",
    status: "Confirmado",
  });

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!form.service_id.trim()) {
      setErrorMsg("El código del grupo es obligatorio.");
      return;
    }

    if (!form.date) {
      setErrorMsg("La fecha es obligatoria.");
      return;
    }

    setSaving(true);

    try {
      /*
       * De momento resolvemos proveedor / operador / guía por nombre.
       * Si alguno no existe, se crea automáticamente.
       */

      let providerId: string | null = null;
      let operatorId: string | null = null;
      let leaderId: string | null = null;

      if (form.provider.trim()) {
        const { data: provider } = await supabase
          .from("providers")
          .select("id")
          .ilike("name", form.provider.trim())
          .limit(1)
          .maybeSingle();

        providerId = provider?.id ?? null;
      }

      if (form.operator.trim()) {
        const { data: operator } = await supabase
          .from("tour_operators")
          .select("id")
          .ilike("name", form.operator.trim())
          .limit(1)
          .maybeSingle();

        operatorId = operator?.id ?? null;
      }

      if (form.tour_leader.trim()) {
        const { data: leader } = await supabase
          .from("tour_leaders")
          .select("id")
          .ilike("name", form.tour_leader.trim())
          .limit(1)
          .maybeSingle();

        leaderId = leader?.id ?? null;
      }

      const { error } = await supabase.from("tours").insert({
        service_id: form.service_id.trim(),
        date: form.date,
        start_time: form.start_time || null,
        pax: form.pax ? Number(form.pax) : null,
        tour_leader_id: leaderId,
        tour_leader_phone: form.tour_leader_phone.trim() || null,
        provider_id: providerId,
        tour_operator_id: operatorId,
        city: form.city,
        meeting_point: form.meeting_point.trim() || null,
        status: form.status,
      });

      if (error) throw error;

      onSaved?.();
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo guardar el tour.",
      );
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "input input-bordered input-sm w-full bg-base-100";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="bg-base-100 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-content/10 shrink-0">
          <div>
            <h2 className="text-lg font-bold">Añadir tour manualmente</h2>
            <p className="text-xs opacity-50 mt-0.5">
              Introduce los datos del servicio directamente.
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={saving}
            className="btn btn-ghost btn-xs btn-square"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="px-5 py-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Grupo */}
            <label className="form-control">
              <span className="label-text text-xs font-semibold mb-1">
                ID del Tour
              </span>
              <input
                value={form.service_id}
                onChange={(e) => update("service_id", e.target.value)}
                placeholder="Ej. GTE2608"
                className={inputClass}
              />
            </label>

            {/* Pax */}
            <label className="form-control">
              <span className="label-text text-xs font-semibold mb-1">Pax</span>
              <input
                type="number"
                min="0"
                value={form.pax}
                onChange={(e) => update("pax", e.target.value)}
                placeholder="Ej. 25"
                className={inputClass}
              />
            </label>

            {/* Fecha */}
            <label className="form-control">
              <span className="label-text text-xs font-semibold mb-1">
                Fecha *
              </span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                className={inputClass}
              />
            </label>

            {/* Hora */}
            <label className="form-control">
              <span className="label-text text-xs font-semibold mb-1">
                Hora
              </span>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => update("start_time", e.target.value)}
                className={inputClass}
              />
            </label>

            {/* Tour Leader */}
            <label className="form-control">
              <span className="label-text text-xs font-semibold mb-1">
                Tour Leader
              </span>
              <input
                value={form.tour_leader}
                onChange={(e) => update("tour_leader", e.target.value)}
                placeholder="Nombre del guía"
                className={inputClass}
              />
            </label>

            {/* Teléfono */}
            <label className="form-control">
              <span className="label-text text-xs font-semibold mb-1">
                Teléfono
              </span>
              <input
                type="tel"
                value={form.tour_leader_phone}
                onChange={(e) => update("tour_leader_phone", e.target.value)}
                placeholder="+32 ..."
                className={inputClass}
              />
            </label>

            {/* Proveedor */}
            <label className="form-control">
              <span className="label-text text-xs font-semibold mb-1">
                Proveedor
              </span>
              <input
                value={form.provider}
                onChange={(e) => update("provider", e.target.value)}
                placeholder="Ej. Bespoke"
                className={inputClass}
              />
            </label>

            {/* Operador */}
            <label className="form-control">
              <span className="label-text text-xs font-semibold mb-1">
                Operador
              </span>
              <input
                value={form.operator}
                onChange={(e) => update("operator", e.target.value)}
                placeholder="Ej. ExaTravel"
                className={inputClass}
              />
            </label>

            {/* Ciudad */}
            <label className="form-control">
              <span className="label-text text-xs font-semibold mb-1">
                Ciudad
              </span>
              <select
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                className="select select-bordered select-sm w-full"
              >
                <option value="Brujas">Brujas</option>
                <option value="Bruselas">Bruselas</option>
                <option value="Amberes">Amberes</option>
                <option value="Gante">Gante</option>
              </select>
            </label>

            {/* Meeting point */}
            <label className="form-control">
              <span className="label-text text-xs font-semibold mb-1">
                Meeting point
              </span>
              <input
                value={form.meeting_point}
                onChange={(e) => update("meeting_point", e.target.value)}
                placeholder="Punto de encuentro"
                className={inputClass}
              />
            </label>

            {/* Estado */}
            <label className="form-control sm:col-span-2">
              <span className="label-text text-xs font-semibold mb-1">
                Estado
              </span>
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
                className="select select-bordered select-sm w-full"
              >
                <option value="Confirmado">Confirmado</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </label>
          </div>

          {errorMsg && (
            <div className="alert alert-error text-sm mt-4">
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Footer */}
          <div className="grid grid-cols-2 gap-3 mt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn btn-outline border-base-content/20"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="btn bg-base-content text-base-100 border-none gap-2"
            >
              {saving ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <Save size={15} />
              )}
              Guardar tour
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
