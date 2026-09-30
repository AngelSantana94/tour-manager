import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  Mail,
  Pencil,
  Truck,
  X,
} from "lucide-react";
import {
  renameDirectoryItem,
  type DirectoryItem,
} from "./Services/Directory.adapter";
import DirectoryOperator from "./DirectoryOperator";
import DirectoryTourLeader from "./DirectoryTourleader";
import { errorMessage, findSimilarIds } from "./DirectoryUtils";

// Un proveedor tal como lo pintan la tarjeta y el detalle. `id` es null en la
// tarjeta especial "Sin proveedor" (operadores y guías correo sin proveedor).
export interface ProviderData {
  id: string | null;
  name: string;
  operators: DirectoryItem[];
  leaders: DirectoryItem[];
}

// ─── TARJETA (cuadrícula de proveedores) ────────────────────────────────────
export function ProviderCard({
  provider,
  onOpen,
}: {
  provider: ProviderData;
  onOpen: () => void;
}) {
  const unassigned = provider.id === null;
  const hasDuplicates =
    findSimilarIds(provider.operators).size +
      findSimilarIds(provider.leaders).size >
    0;

  return (
    <button
      onClick={onOpen}
      className={`text-left rounded-2xl bg-base-100 p-4 hover:border-primary/40 transition ${
        unassigned
          ? "border border-dashed border-base-content/20"
          : "border border-base-content/10 hover:shadow"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            unassigned
              ? "bg-slate-100 text-slate-500"
              : "bg-blue-100 text-blue-600"
          }`}
        >
          <Truck size={18} />
        </div>
        <span className="font-bold truncate flex-1">{provider.name}</span>
        {hasDuplicates && (
          <span className="badge badge-warning badge-sm shrink-0 gap-1">
            <AlertTriangle size={11} />
            Revisar
          </span>
        )}
      </div>
      <p className="text-xs opacity-60 mt-3">
        {provider.operators.length} operadores · {provider.leaders.length} guías
        correo
      </p>
    </button>
  );
}

// ─── DETALLE DE UN PROVEEDOR ────────────────────────────────────────────────
type Tab = "operator" | "leader";

export default function DirectoryProvider({
  provider,
  onBack,
  onChanged,
}: {
  provider: ProviderData;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("operator");
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");

  async function saveName() {
    const name = draft.trim();
    if (!provider.id || !name || name === provider.name) {
      setRenaming(false);
      return;
    }
    try {
      await renameDirectoryItem("provider", provider.id, name);
      setRenaming(false);
      await onChanged();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <button
        onClick={onBack}
        className="btn btn-ghost btn-sm gap-1.5 -ml-2 mb-2"
      >
        <ArrowLeft size={15} />
        Proveedores
      </button>

      <div className="flex items-center gap-2 mb-4">
        {renaming ? (
          <>
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setRenaming(false);
              }}
              className="input input-bordered input-sm flex-1 min-w-0"
            />
            <button
              className="btn btn-success btn-xs btn-square"
              onClick={saveName}
              aria-label="Guardar nombre"
            >
              <Check size={14} />
            </button>
            <button
              className="btn btn-ghost btn-xs btn-square"
              onClick={() => setRenaming(false)}
              aria-label="Cancelar"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold truncate">{provider.name}</h1>
            {provider.id && (
              <button
                className="btn btn-ghost btn-xs btn-square"
                onClick={() => {
                  setDraft(provider.name);
                  setRenaming(true);
                }}
                aria-label="Renombrar proveedor"
              >
                <Pencil size={14} />
              </button>
            )}
          </>
        )}
      </div>

      <div role="tablist" className="tabs tabs-boxed mb-4 w-fit">
        <button
          role="tab"
          className={`tab gap-1.5 ${tab === "operator" ? "tab-active" : ""}`}
          onClick={() => setTab("operator")}
        >
          <Building2 size={14} />
          Operadores ({provider.operators.length})
        </button>
        <button
          role="tab"
          className={`tab gap-1.5 ${tab === "leader" ? "tab-active" : ""}`}
          onClick={() => setTab("leader")}
        >
          <Mail size={14} />
          Guías correo ({provider.leaders.length})
        </button>
      </div>

      {tab === "operator" ? (
        <DirectoryOperator items={provider.operators} onChanged={onChanged} />
      ) : (
        <DirectoryTourLeader items={provider.leaders} onChanged={onChanged} />
      )}
    </div>
  );
}
