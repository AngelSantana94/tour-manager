import { useState } from "react";
import { X, Calendar } from "lucide-react";
import { addGuideBalanceEntry, type BalancePlatform } from "./UseBillingData";

interface AddBalanceModalProps {
  guideId: string;
  platform: BalancePlatform;
  platformLabel: string;
  onClose: () => void;
  onSaved: () => void;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function AddBalanceModal({
  guideId,
  platform,
  platformLabel,
  onClose,
  onSaved,
}: AddBalanceModalProps) {
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const value = parseFloat(amount.replace(",", "."));
    if (!value || value <= 0) {
      setError("Introduce un importe válido.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await addGuideBalanceEntry({ guideId, platform, date, amount: value });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Error al guardar el saldo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-base-100 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <h2 className="text-lg font-bold">Añadir saldo · {platformLabel}</h2>
          <button onClick={onClose} className="btn btn-ghost btn-xs btn-square">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold opacity-60">
              <Calendar size={14} /> Fecha
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input input-bordered w-full text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold opacity-60">
              Importe (€)
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="input input-bordered w-full text-sm"
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-base-200 border border-base-content/10 text-xs rounded-xl px-3 py-2 font-medium opacity-80">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={onClose}
              className="btn btn-outline border-base-content/20"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn bg-base-content text-base-100 hover:bg-base-content/85 border-none disabled:opacity-40"
            >
              {saving ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                "Guardar saldo"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
