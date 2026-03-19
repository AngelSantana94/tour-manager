import { useState, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://hccxpmnraefgccowdwri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY3hwbW5yYWVmZ2Njb3dkd3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjAyNzQsImV4cCI6MjA4ODE5NjI3NH0.QwfoDxbMDXPrCmfGPLsKVzhfLpQBKBVmNwbNm_dIX1E"
);

export interface Reservation {
  id:        string;
  name:      string;
  adults:    number;
  children:  number;
  phone:     string;
  status:    "active" | "cancelled";
  attended:  boolean;
  platform?: string;
}

interface AddReservationModalProps {
  onClose: () => void;
  onSave:  (reservation: Reservation) => void;
  saving?: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  guruwalk:    "GuruWalk",
  freetour:    "FreeTour",
  turixe:      "Turixe",
  tripadvisor: "TripAdvisor",
  manual:      "Manual",
};

export default function AddReservationModal({ onClose, onSave, saving = false }: AddReservationModalProps) {
  const [name,          setName]          = useState("");
  const [adults,        setAdults]        = useState(1);
  const [children,      setChildren]      = useState(0);
  const [phone,         setPhone]         = useState("");
  const [platform,      setPlatform]      = useState("");
  const [customPlatform, setCustomPlatform] = useState("");
  const [useCustomPlat, setUseCustomPlat] = useState(false);

  const [platforms, setPlatforms] = useState<string[]>([]);

  // Cargar plataformas existentes de la BD
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("tours").select("platform");
      if (data) {
        const unique = [...new Set(
          data.map((t: any) => t.platform as string).filter(Boolean)
        )].sort();
        setPlatforms(unique);
        if (unique.length > 0) setPlatform(unique[0]);
      }
    })();
  }, []);

  const finalPlatform = useCustomPlat ? customPlatform.trim() : platform;

  function handleSave() {
    onSave({
      id:       Math.random().toString(36).slice(2, 9),
      name,
      adults,
      children,
      phone,
      status:   "active",
      attended: false,
      platform: finalPlatform || undefined,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-base-100 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">

        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-base-content/10">
          <h2 className="text-base font-bold">Agregar reserva</h2>
          <button onClick={onClose} className="btn btn-ghost btn-xs btn-square"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">

          {/* Plataforma */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold opacity-50">Plataforma</label>
            {!useCustomPlat ? (
              <>
                <div className="relative">
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="select select-bordered select-sm w-full appearance-none pr-8"
                  >
                    {platforms.map((p) => (
                      <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
                </div>
                <button
                  onClick={() => setUseCustomPlat(true)}
                  className="text-[11px] opacity-40 hover:opacity-70 text-left underline underline-offset-2 w-fit"
                >
                  Escribir plataforma personalizada
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Nombre de la plataforma..."
                  value={customPlatform}
                  onChange={(e) => setCustomPlatform(e.target.value)}
                  className="input input-bordered input-sm w-full"
                  autoFocus
                />
                <button
                  onClick={() => { setUseCustomPlat(false); setCustomPlatform(""); }}
                  className="text-[11px] opacity-40 hover:opacity-70 text-left underline underline-offset-2 w-fit"
                >
                  Seleccionar de la lista
                </button>
              </>
            )}
          </div>

          {/* Nombre */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold opacity-50">Nombre</label>
            <input
              type="text"
              placeholder="A nombre de..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input input-bordered input-sm w-full"
            />
          </div>

          {/* Adultos + Niños */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold opacity-50">Adultos</label>
              <div className="flex items-center gap-2">
                <button onClick={() => setAdults((v) => Math.max(0, v - 1))} className="btn btn-outline btn-xs btn-square border-base-content/20">−</button>
                <span className="text-sm font-bold w-5 text-center">{adults}</span>
                <button onClick={() => setAdults((v) => v + 1)} className="btn btn-outline btn-xs btn-square border-base-content/20">+</button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold opacity-50">Niños</label>
              <div className="flex items-center gap-2">
                <button onClick={() => setChildren((v) => Math.max(0, v - 1))} className="btn btn-outline btn-xs btn-square border-base-content/20">−</button>
                <span className="text-sm font-bold w-5 text-center">{children}</span>
                <button onClick={() => setChildren((v) => v + 1)} className="btn btn-outline btn-xs btn-square border-base-content/20">+</button>
              </div>
            </div>
          </div>

          {/* Teléfono */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold opacity-50">Teléfono</label>
            <input
              type="tel"
              placeholder="+34 600 000 000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input input-bordered input-sm w-full"
            />
          </div>

          {/* Botones */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button onClick={onClose} className="btn btn-sm btn-outline border-base-content/20">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-sm bg-base-content text-base-100 hover:bg-base-content/85 border-none disabled:opacity-40"
            >
              {saving ? <span className="loading loading-spinner loading-xs" /> : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}